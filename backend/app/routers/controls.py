"""Control coverage for the illustrative sample framework."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import risk_service, serializers

router = APIRouter(prefix="/api/controls", tags=["controls"])


def _get_or_404(db: Session, control_id: str) -> models.Control:
    control = db.get(models.Control, control_id)
    if control is None:
        raise HTTPException(status_code=404, detail=f"Control {control_id} was not found.")
    return control


@router.get("", response_model=list[schemas.ControlOut])
def list_controls(
    db: Session = Depends(get_db),
    category: list[str] | None = Query(None),
    control_status: list[str] | None = Query(None, alias="status"),
) -> list[dict]:
    """All controls with their linked findings, evidence counts, and coverage."""
    query = select(models.Control)
    if category:
        query = query.where(models.Control.category.in_(category))
    if control_status:
        query = query.where(models.Control.status.in_(control_status))
    controls = db.scalars(query.order_by(models.Control.id)).all()
    return [serializers.control_payload(control) for control in controls]


@router.get("/categories", response_model=list[dict])
def control_categories(db: Session = Depends(get_db)) -> list[dict]:
    """Per-category rollup used by the control coverage page."""
    controls = db.scalars(select(models.Control).order_by(models.Control.id)).all()
    grouped: dict[str, list[models.Control]] = {}
    for control in controls:
        grouped.setdefault(control.category, []).append(control)

    summary = []
    for category, items in sorted(grouped.items()):
        payloads = [serializers.control_payload(control) for control in items]
        coverage_values = [payload["coverage_percent"] for payload in payloads]
        summary.append(
            {
                "category": category,
                "control_count": len(items),
                "implemented": sum(1 for c in items if c.status == "Implemented"),
                "partially_implemented": sum(
                    1 for c in items if c.status == "Partially Implemented"
                ),
                "not_implemented": sum(1 for c in items if c.status == "Not Implemented"),
                "not_assessed": sum(1 for c in items if c.status == "Not Assessed"),
                "open_findings": sum(payload["open_finding_count"] for payload in payloads),
                "coverage_percent": round(sum(coverage_values) / len(coverage_values))
                if coverage_values
                else 0,
            }
        )
    return summary


@router.get("/{control_id}", response_model=schemas.ControlOut)
def get_control(control_id: str, db: Session = Depends(get_db)) -> dict:
    """One control."""
    return serializers.control_payload(_get_or_404(db, control_id))


@router.put("/{control_id}", response_model=schemas.ControlOut)
def update_control(
    control_id: str, payload: schemas.ControlUpdate, db: Session = Depends(get_db)
) -> dict:
    """Update a control's implementation status, notes, name, or description."""
    control = _get_or_404(db, control_id)
    changes = payload.model_dump(exclude_unset=True)
    previous_status = control.status

    for field, value in changes.items():
        setattr(control, field, value)

    detail = (
        f"Status changed from {previous_status} to {control.status}."
        if changes.get("status") and changes["status"] != previous_status
        else f"Updated {', '.join(sorted(changes)) or 'control record'}."
    )
    db.add(
        models.Activity(
            action="Updated control",
            entity_type="control",
            entity_id=control.id,
            detail=detail,
            actor="workbench",
        )
    )
    db.commit()
    db.refresh(control)
    return serializers.control_payload(control)


@router.get("/reference/statuses", response_model=list[str])
def control_status_vocabulary() -> list[str]:
    """The four control statuses this framework uses."""
    return risk_service.CONTROL_STATUSES
