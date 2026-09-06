"""Evidence library: metadata CRUD, search, verification, and finding links."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import risk_service, serializers
from ..services.ids import next_identifier

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

ID_PREFIX = "E-"


def _next_evidence_id(db: Session) -> str:
    """Allocate the next evidence id, never reusing one from a deleted item."""
    return next_identifier(db, ID_PREFIX, models.Evidence.id, "evidence")


def _get_or_404(db: Session, evidence_id: str) -> models.Evidence:
    evidence = db.get(models.Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} was not found.")
    return evidence


def _resolve_findings(db: Session, ids: list[str]) -> list[models.Finding]:
    if not ids:
        return []
    found = db.scalars(select(models.Finding).where(models.Finding.id.in_(ids))).all()
    missing = sorted(set(ids) - {item.id for item in found})
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown finding id(s): {', '.join(missing)}")
    return list(found)


def _check_control(db: Session, control_id: str | None) -> str | None:
    if control_id is None:
        return None
    if db.get(models.Control, control_id) is None:
        raise HTTPException(status_code=422, detail=f"Unknown control id: {control_id}")
    return control_id


def _log(db: Session, action: str, evidence_id: str, detail: str) -> None:
    db.add(
        models.Activity(
            action=action,
            entity_type="evidence",
            entity_id=evidence_id,
            detail=detail,
            actor="workbench",
        )
    )


@router.get("", response_model=list[schemas.EvidenceOut])
def list_evidence(
    db: Session = Depends(get_db),
    search: str | None = Query(None, max_length=200),
    evidence_type: list[str] | None = Query(None),
    verification_status: list[str] | None = Query(None),
    control_id: str | None = Query(None),
    unlinked_only: bool = Query(False, description="Only evidence with no linked finding"),
) -> list[dict]:
    """List evidence metadata with optional search and filters."""
    query = select(models.Evidence)

    if evidence_type:
        query = query.where(models.Evidence.evidence_type.in_(evidence_type))
    if verification_status:
        query = query.where(models.Evidence.verification_status.in_(verification_status))
    if control_id:
        query = query.where(models.Evidence.related_control_id == control_id)
    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                models.Evidence.name.ilike(term),
                models.Evidence.id.ilike(term),
                models.Evidence.description.ilike(term),
                models.Evidence.source.ilike(term),
            )
        )

    items = db.scalars(query.order_by(models.Evidence.id)).all()
    if unlinked_only:
        items = [item for item in items if not item.findings]
    return [serializers.evidence_payload(item) for item in items]


@router.get("/coverage", response_model=list[schemas.EvidenceGap])
def evidence_coverage(
    db: Session = Depends(get_db),
    assessment_id: str | None = Query(None),
) -> list[dict]:
    """Findings that lack verified supporting evidence."""
    query = select(models.Finding)
    if assessment_id:
        query = query.where(models.Finding.assessment_id == assessment_id)
    gaps: list[dict] = []
    for finding in db.scalars(query.order_by(models.Finding.risk_score.desc())).all():
        verified = [item for item in finding.evidence if item.verification_status == "Verified"]
        if finding.evidence and verified:
            continue
        reason = (
            "No evidence linked"
            if not finding.evidence
            else f"{len(finding.evidence)} item(s) linked, none verified"
        )
        gaps.append(
            {
                "finding_id": finding.id,
                "title": finding.title,
                "severity": finding.severity,
                "reason": reason,
            }
        )
    return gaps


@router.post("", response_model=schemas.EvidenceOut, status_code=status.HTTP_201_CREATED)
def create_evidence(payload: schemas.EvidenceCreate, db: Session = Depends(get_db)) -> dict:
    """Record a new evidence item and optionally link it to findings."""
    evidence = models.Evidence(
        id=_next_evidence_id(db),
        name=payload.name,
        evidence_type=payload.evidence_type,
        description=payload.description,
        source=payload.source,
        related_control_id=_check_control(db, payload.related_control_id),
        verification_status=payload.verification_status,
        upload_date=payload.upload_date or date.today(),
    )
    evidence.findings = _resolve_findings(db, payload.linked_finding_ids)

    db.add(evidence)
    _log(db, "Added evidence", evidence.id, f"Recorded '{evidence.name}' ({evidence.evidence_type}).")
    db.commit()
    db.refresh(evidence)
    return serializers.evidence_payload(evidence)


@router.get("/{evidence_id}", response_model=schemas.EvidenceOut)
def get_evidence(evidence_id: str, db: Session = Depends(get_db)) -> dict:
    """One evidence item."""
    return serializers.evidence_payload(_get_or_404(db, evidence_id))


@router.put("/{evidence_id}", response_model=schemas.EvidenceOut)
def update_evidence(
    evidence_id: str, payload: schemas.EvidenceUpdate, db: Session = Depends(get_db)
) -> dict:
    """Partial update, including verification status and finding links."""
    evidence = _get_or_404(db, evidence_id)
    changes = payload.model_dump(exclude_unset=True)
    linked = changes.pop("linked_finding_ids", None)
    previous_verification = evidence.verification_status

    if "related_control_id" in changes:
        changes["related_control_id"] = _check_control(db, changes["related_control_id"] or None)

    for field, value in changes.items():
        setattr(evidence, field, value)

    if linked is not None:
        evidence.findings = _resolve_findings(db, linked)

    if changes.get("verification_status") and changes["verification_status"] != previous_verification:
        _log(
            db,
            "Verified evidence"
            if changes["verification_status"] == "Verified"
            else "Updated evidence",
            evidence.id,
            f"Verification status changed from {previous_verification} to {evidence.verification_status}.",
        )
    else:
        _log(db, "Updated evidence", evidence.id, f"Updated '{evidence.name}'.")

    db.commit()
    db.refresh(evidence)
    return serializers.evidence_payload(evidence)


@router.delete("/{evidence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evidence(evidence_id: str, db: Session = Depends(get_db)) -> None:
    """Delete an evidence item and remove its finding links."""
    evidence = _get_or_404(db, evidence_id)
    name = evidence.name
    evidence.findings = []
    db.delete(evidence)
    _log(db, "Deleted evidence", evidence_id, f"Removed '{name}' from the library.")
    db.commit()


@router.get("/types/summary", response_model=list[dict])
def evidence_type_summary(db: Session = Depends(get_db)) -> list[dict]:
    """Count of evidence items per type, used by the coverage panel."""
    items = db.scalars(select(models.Evidence)).all()
    summary = []
    for evidence_type in risk_service.EVIDENCE_TYPES:
        matching = [item for item in items if item.evidence_type == evidence_type]
        if matching:
            summary.append(
                {
                    "evidence_type": evidence_type,
                    "count": len(matching),
                    "verified": sum(
                        1 for item in matching if item.verification_status == "Verified"
                    ),
                }
            )
    return summary
