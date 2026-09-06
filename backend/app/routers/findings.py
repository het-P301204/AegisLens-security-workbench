"""Finding CRUD, filtering, and status changes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import risk_service, serializers
from ..services.ids import next_identifier

router = APIRouter(prefix="/api/findings", tags=["findings"])

ID_PREFIX = "F-"


def _next_finding_id(db: Session) -> str:
    """Allocate the next sequential finding id (F-001, F-002, ...)."""
    return next_identifier(db, ID_PREFIX, models.Finding.id, "finding")


def _active_assessment_id(db: Session) -> str:
    assessment = db.scalars(
        select(models.Assessment).where(models.Assessment.is_active.is_(True))
    ).first() or db.scalars(select(models.Assessment).order_by(models.Assessment.id)).first()
    if assessment is None:
        raise HTTPException(status_code=400, detail="No assessment exists to attach the finding to.")
    return assessment.id


def _get_or_404(db: Session, finding_id: str) -> models.Finding:
    finding = db.get(models.Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail=f"Finding {finding_id} was not found.")
    return finding


def _resolve_evidence(db: Session, ids: list[str]) -> list[models.Evidence]:
    if not ids:
        return []
    found = db.scalars(select(models.Evidence).where(models.Evidence.id.in_(ids))).all()
    _reject_unknown(ids, {item.id for item in found}, "evidence")
    return list(found)


def _resolve_controls(db: Session, ids: list[str]) -> list[models.Control]:
    if not ids:
        return []
    found = db.scalars(select(models.Control).where(models.Control.id.in_(ids))).all()
    _reject_unknown(ids, {item.id for item in found}, "control")
    return list(found)


def _reject_unknown(requested: list[str], found: set[str], label: str) -> None:
    missing = sorted(set(requested) - found)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown {label} id(s): {', '.join(missing)}",
        )


def _log(db: Session, action: str, finding_id: str, detail: str) -> None:
    db.add(
        models.Activity(
            action=action,
            entity_type="finding",
            entity_id=finding_id,
            detail=detail,
            actor="workbench",
        )
    )


@router.get("", response_model=list[schemas.FindingOut])
def list_findings(
    db: Session = Depends(get_db),
    assessment_id: str | None = Query(None, description="Restrict to one assessment"),
    search: str | None = Query(None, max_length=200, description="Match title, id, or asset"),
    severity: list[str] | None = Query(None),
    finding_status: list[str] | None = Query(None, alias="status"),
    category: list[str] | None = Query(None),
    sort: str = Query("risk_score", pattern="^(risk_score|created_at|due_date|id|title)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
) -> list[dict]:
    """List findings with optional search, filters, and sorting."""
    query = select(models.Finding)

    if assessment_id:
        query = query.where(models.Finding.assessment_id == assessment_id)
    if severity:
        query = query.where(models.Finding.severity.in_(severity))
    if finding_status:
        query = query.where(models.Finding.status.in_(finding_status))
    if category:
        query = query.where(models.Finding.category.in_(category))
    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                models.Finding.title.ilike(term),
                models.Finding.id.ilike(term),
                models.Finding.affected_asset.ilike(term),
                models.Finding.owner.ilike(term),
                models.Finding.description.ilike(term),
            )
        )

    column = getattr(models.Finding, sort)
    query = query.order_by(column.desc() if order == "desc" else column.asc(), models.Finding.id)

    today = date.today()
    return [serializers.finding_payload(finding, today) for finding in db.scalars(query).all()]


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)) -> list[str]:
    """Distinct categories currently in use, for filter dropdowns."""
    rows = db.scalars(select(models.Finding.category).distinct().order_by(models.Finding.category))
    return list(rows.all())


@router.post("", response_model=schemas.FindingDetailOut, status_code=status.HTTP_201_CREATED)
def create_finding(payload: schemas.FindingCreate, db: Session = Depends(get_db)) -> dict:
    """Create a finding. The risk score is always derived, never supplied."""
    assessment_id = payload.assessment_id or _active_assessment_id(db)
    if db.get(models.Assessment, assessment_id) is None:
        raise HTTPException(status_code=422, detail=f"Unknown assessment id: {assessment_id}")

    finding = models.Finding(
        id=_next_finding_id(db),
        assessment_id=assessment_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        severity=payload.severity,
        likelihood=payload.likelihood,
        impact=payload.impact,
        risk_score=risk_service.calculate_risk_score(payload.likelihood, payload.impact),
        status=payload.status,
        owner=payload.owner,
        affected_asset=payload.affected_asset,
        security_impact=payload.security_impact,
        recommended_action=payload.recommended_action,
        due_date=payload.due_date,
        created_at=date.today(),
    )
    finding.evidence = _resolve_evidence(db, payload.evidence_ids)
    finding.controls = _resolve_controls(db, payload.control_ids)

    db.add(finding)
    _log(db, "Created finding", finding.id, f"Recorded '{finding.title}' as {finding.severity}.")
    db.commit()
    db.refresh(finding)
    return serializers.finding_detail_payload(db, finding)


@router.get("/{finding_id}", response_model=schemas.FindingDetailOut)
def get_finding(finding_id: str, db: Session = Depends(get_db)) -> dict:
    """Full detail for one finding, including evidence, controls, and history."""
    return serializers.finding_detail_payload(db, _get_or_404(db, finding_id))


@router.put("/{finding_id}", response_model=schemas.FindingDetailOut)
def update_finding(
    finding_id: str, payload: schemas.FindingUpdate, db: Session = Depends(get_db)
) -> dict:
    """Apply a partial update and recompute the risk score when needed."""
    finding = _get_or_404(db, finding_id)
    changes = payload.model_dump(exclude_unset=True)

    evidence_ids = changes.pop("evidence_ids", None)
    control_ids = changes.pop("control_ids", None)
    previous_status = finding.status

    for field, value in changes.items():
        setattr(finding, field, value)

    finding.risk_score = risk_service.calculate_risk_score(finding.likelihood, finding.impact)

    if evidence_ids is not None:
        finding.evidence = _resolve_evidence(db, evidence_ids)
    if control_ids is not None:
        finding.controls = _resolve_controls(db, control_ids)

    if "status" in changes and changes["status"] != previous_status:
        _log(
            db,
            "Changed status",
            finding.id,
            f"Status changed from {previous_status} to {finding.status}.",
        )
    else:
        touched = ", ".join(sorted(changes)) or "linked records"
        _log(db, "Updated finding", finding.id, f"Updated {touched}.")

    db.commit()
    db.refresh(finding)
    return serializers.finding_detail_payload(db, finding)


@router.patch("/{finding_id}/status", response_model=schemas.FindingDetailOut)
def change_status(
    finding_id: str, payload: schemas.FindingStatusUpdate, db: Session = Depends(get_db)
) -> dict:
    """Shortcut used by the status control on the findings table."""
    finding = _get_or_404(db, finding_id)
    if payload.status != finding.status:
        _log(
            db,
            "Changed status",
            finding.id,
            f"Status changed from {finding.status} to {payload.status}.",
        )
        finding.status = payload.status
        db.commit()
        db.refresh(finding)
    return serializers.finding_detail_payload(db, finding)


@router.delete("/{finding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_finding(finding_id: str, db: Session = Depends(get_db)) -> None:
    """Delete a finding. Evidence and controls themselves are left in place."""
    finding = _get_or_404(db, finding_id)
    title = finding.title
    finding.evidence = []
    finding.controls = []
    db.delete(finding)
    _log(db, "Deleted finding", finding_id, f"Removed '{title}' from the assessment.")
    db.commit()


@router.get("/{finding_id}/evidence", response_model=list[schemas.EvidenceOut])
def list_finding_evidence(finding_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """Evidence linked to one finding."""
    finding = _get_or_404(db, finding_id)
    return [serializers.evidence_payload(item) for item in sorted(finding.evidence, key=lambda e: e.id)]
