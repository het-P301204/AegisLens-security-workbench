"""Dashboard aggregation, assessment list, and reference vocabularies."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import risk_service, serializers

router = APIRouter(prefix="/api", tags=["dashboard"])

TOP_FINDING_LIMIT = 5
RECENT_ACTIVITY_LIMIT = 8
EVIDENCE_GAP_LIMIT = 5


def resolve_assessment(db: Session, assessment_id: str | None) -> models.Assessment:
    """Return the requested assessment, or the active one when none is given."""
    if assessment_id:
        assessment = db.get(models.Assessment, assessment_id)
        if assessment is None:
            raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} was not found.")
        return assessment

    assessment = db.scalars(
        select(models.Assessment).where(models.Assessment.is_active.is_(True))
    ).first()
    if assessment is None:
        assessment = db.scalars(select(models.Assessment).order_by(models.Assessment.id)).first()
    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail="No assessment exists yet. Seed the sample data or create an assessment first.",
        )
    return assessment


def _finding_count(db: Session, assessment_id: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(models.Finding)
            .where(models.Finding.assessment_id == assessment_id)
        )
        or 0
    )


@router.get("/assessments", response_model=list[schemas.AssessmentOut])
def list_assessments(db: Session = Depends(get_db)) -> list[dict]:
    """Assessments available in the assessment selector."""
    assessments = db.scalars(select(models.Assessment).order_by(models.Assessment.id)).all()
    return [
        serializers.assessment_payload(item, _finding_count(db, item.id)) for item in assessments
    ]


@router.put("/assessments/{assessment_id}", response_model=schemas.AssessmentOut)
def update_assessment(
    assessment_id: str, payload: schemas.AssessmentUpdate, db: Session = Depends(get_db)
) -> dict:
    """Edit assessment metadata. Scope and assumptions feed the generated report."""
    assessment = db.get(models.Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} was not found.")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(assessment, field, value)

    db.add(
        models.Activity(
            action="Updated assessment",
            entity_type="assessment",
            entity_id=assessment.id,
            detail=f"Updated {', '.join(sorted(changes)) or 'assessment record'}.",
            actor="workbench",
        )
    )
    db.commit()
    db.refresh(assessment)
    return serializers.assessment_payload(assessment, _finding_count(db, assessment.id))


@router.post("/assessments/{assessment_id}/activate", response_model=schemas.AssessmentOut)
def activate_assessment(assessment_id: str, db: Session = Depends(get_db)) -> dict:
    """Make one assessment the default target for newly created findings."""
    assessment = db.get(models.Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} was not found.")

    for other in db.scalars(select(models.Assessment)).all():
        other.is_active = other.id == assessment_id

    db.add(
        models.Activity(
            action="Activated assessment",
            entity_type="assessment",
            entity_id=assessment.id,
            detail=f"'{assessment.name}' is now the active assessment.",
            actor="workbench",
        )
    )
    db.commit()
    db.refresh(assessment)
    return serializers.assessment_payload(assessment, _finding_count(db, assessment.id))


@router.get("/assets", response_model=list[schemas.AssetOut])
def list_assets(db: Session = Depends(get_db)) -> list[models.Asset]:
    """In-scope assets referenced by findings."""
    return list(db.scalars(select(models.Asset).order_by(models.Asset.id)).all())


@router.get("/activity", response_model=list[schemas.ActivityOut])
def list_activity(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
) -> list[models.Activity]:
    """Most recent workbench activity."""
    return list(
        db.scalars(
            select(models.Activity).order_by(models.Activity.timestamp.desc()).limit(limit)
        ).all()
    )


@router.get("/vocabulary", response_model=schemas.VocabularyOut)
def vocabulary(db: Session = Depends(get_db)) -> dict:
    """Allowed values for form dropdowns, kept in one place with the backend."""
    used = set(db.scalars(select(models.Finding.category).distinct()).all())
    framework = set(db.scalars(select(models.Control.category).distinct()).all())
    return {"categories": sorted(used | framework)}


@router.get("/risk-model", response_model=dict)
def risk_model() -> dict:
    """The risk formula and its bands, so the UI can explain the numbers it shows."""
    return {
        "formula": "risk_score = likelihood x impact",
        "scale_min": risk_service.SCALE_MIN,
        "scale_max": risk_service.SCALE_MAX,
        "max_score": risk_service.MAX_RISK_SCORE,
        "bands": risk_service.risk_band_reference(),
        "overall_risk_score": (
            "Mean risk score of findings that are still Open or In Review, "
            "expressed as a percentage of the maximum score of 25."
        ),
        "evidence_completion": (
            "Percentage of findings in the assessment that have at least one "
            "piece of evidence marked Verified."
        ),
        "control_coverage": (
            "Per control: 60% from the recorded implementation status and 40% from "
            "verified evidence, capped at two verified items."
        ),
    }


@router.get("/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    assessment_id: str | None = Query(None, description="Defaults to the active assessment"),
) -> dict:
    """Everything the overview page needs, computed from current data."""
    assessment = resolve_assessment(db, assessment_id)
    today = date.today()

    findings = list(
        db.scalars(
            select(models.Finding)
            .where(models.Finding.assessment_id == assessment.id)
            .order_by(models.Finding.risk_score.desc(), models.Finding.id)
        ).all()
    )
    payloads = [serializers.finding_payload(finding, today) for finding in findings]

    open_findings = [p for p in payloads if p["status"] in risk_service.OPEN_STATUSES]
    resolved = [p for p in payloads if p["status"] in risk_service.RESOLVED_STATUSES]
    accepted = [p for p in payloads if p["status"] == "Accepted"]

    evidence_items = list(db.scalars(select(models.Evidence)).all())
    verified_evidence = [e for e in evidence_items if e.verification_status == "Verified"]

    findings_with_verified_evidence = sum(1 for p in payloads if p["verified_evidence_count"] > 0)

    controls = list(db.scalars(select(models.Control).order_by(models.Control.id)).all())
    control_payloads = [serializers.control_payload(control) for control in controls]
    coverage_values = [c["coverage_percent"] for c in control_payloads]

    severity_distribution = [
        {"severity": severity, "count": sum(1 for p in payloads if p["severity"] == severity)}
        for severity in risk_service.SEVERITIES
    ]
    status_distribution = [
        {"status": item, "count": sum(1 for p in payloads if p["status"] == item)}
        for item in risk_service.STATUSES
    ]

    categories = sorted({p["category"] for p in payloads})
    category_distribution = [
        {
            "category": category,
            "count": sum(1 for p in payloads if p["category"] == category),
            "open_count": sum(
                1
                for p in payloads
                if p["category"] == category and p["status"] in risk_service.OPEN_STATUSES
            ),
        }
        for category in categories
    ]

    gaps = []
    for payload, finding in zip(payloads, findings):
        if payload["verified_evidence_count"] > 0:
            continue
        gaps.append(
            {
                "finding_id": finding.id,
                "title": finding.title,
                "severity": finding.severity,
                "reason": "No evidence linked"
                if not finding.evidence
                else f"{len(finding.evidence)} item(s) linked, none verified",
            }
        )

    live_scores = [p["risk_score"] for p in open_findings]
    overall = risk_service.overall_risk_score(live_scores)

    return {
        "assessment": serializers.assessment_payload(assessment, len(findings)),
        "total_findings": len(payloads),
        "critical_findings": sum(1 for p in payloads if p["severity"] == "Critical"),
        "high_findings": sum(1 for p in payloads if p["severity"] == "High"),
        "open_findings": len(open_findings),
        "resolved_findings": len(resolved),
        "accepted_findings": len(accepted),
        "overdue_findings": sum(1 for p in payloads if p["is_overdue"]),
        "evidence_items": len(evidence_items),
        "verified_evidence_items": len(verified_evidence),
        "evidence_completion_percent": risk_service.percentage(
            findings_with_verified_evidence, len(payloads)
        ),
        "overall_risk_score": overall,
        "overall_risk_level": risk_service.risk_level(
            round(overall / 100 * risk_service.MAX_RISK_SCORE)
        )
        if overall
        else "None",
        "control_coverage_percent": round(sum(coverage_values) / len(coverage_values))
        if coverage_values
        else 0,
        "controls_assessed": sum(1 for c in controls if c.status != "Not Assessed"),
        "controls_total": len(controls),
        "severity_distribution": severity_distribution,
        "status_distribution": status_distribution,
        "category_distribution": category_distribution,
        "top_findings": [p for p in payloads if p["status"] in risk_service.OPEN_STATUSES][
            :TOP_FINDING_LIMIT
        ],
        "evidence_gaps": gaps[:EVIDENCE_GAP_LIMIT],
        "recent_activity": list(
            db.scalars(
                select(models.Activity)
                .order_by(models.Activity.timestamp.desc())
                .limit(RECENT_ACTIVITY_LIMIT)
            ).all()
        ),
    }
