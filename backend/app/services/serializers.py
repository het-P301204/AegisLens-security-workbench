"""Helpers that turn ORM rows into the enriched shapes the API returns.

Derived values (risk level, coverage, overdue flags) are computed here rather
than stored, so they can never drift out of step with the underlying record.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from . import risk_service


def finding_payload(finding: models.Finding, today: date | None = None) -> dict:
    """Flatten a finding plus its derived risk fields."""
    today = today or date.today()
    score = finding.risk_score
    level = risk_service.risk_level(score)
    derived = risk_service.derived_severity(finding.likelihood, finding.impact)
    return {
        "id": finding.id,
        "assessment_id": finding.assessment_id,
        "title": finding.title,
        "description": finding.description,
        "category": finding.category,
        "severity": finding.severity,
        "likelihood": finding.likelihood,
        "impact": finding.impact,
        "risk_score": score,
        "risk_level": level,
        "derived_severity": derived,
        "severity_matches_score": finding.severity == derived,
        "status": finding.status,
        "owner": finding.owner,
        "affected_asset": finding.affected_asset,
        "security_impact": finding.security_impact,
        "recommended_action": finding.recommended_action,
        "due_date": finding.due_date,
        "created_at": finding.created_at,
        "updated_at": finding.updated_at,
        "is_overdue": bool(
            finding.due_date
            and finding.due_date < today
            and finding.status not in risk_service.RESOLVED_STATUSES
        ),
        "evidence_ids": sorted(item.id for item in finding.evidence),
        "control_ids": sorted(control.id for control in finding.controls),
        "verified_evidence_count": sum(
            1 for item in finding.evidence if item.verification_status == "Verified"
        ),
    }


def finding_detail_payload(db: Session, finding: models.Finding) -> dict:
    """Finding payload plus embedded evidence, controls, and activity history."""
    payload = finding_payload(finding)
    payload["evidence"] = sorted(finding.evidence, key=lambda item: item.id)
    payload["controls"] = sorted(finding.controls, key=lambda control: control.id)
    payload["activity"] = list(
        db.scalars(
            select(models.Activity)
            .where(models.Activity.entity_type == "finding", models.Activity.entity_id == finding.id)
            .order_by(models.Activity.timestamp.desc())
        ).all()
    )
    return payload


def evidence_payload(evidence: models.Evidence) -> dict:
    return {
        "id": evidence.id,
        "name": evidence.name,
        "evidence_type": evidence.evidence_type,
        "description": evidence.description,
        "source": evidence.source,
        "related_control_id": evidence.related_control_id,
        "verification_status": evidence.verification_status,
        "upload_date": evidence.upload_date,
        "linked_finding_ids": sorted(finding.id for finding in evidence.findings),
    }


def control_payload(control: models.Control) -> dict:
    verified = sum(
        1 for item in control.evidence_items if item.verification_status == "Verified"
    )
    return {
        "id": control.id,
        "name": control.name,
        "category": control.category,
        "description": control.description,
        "status": control.status,
        "notes": control.notes,
        "linked_finding_ids": sorted(finding.id for finding in control.findings),
        "open_finding_count": sum(
            1 for finding in control.findings if finding.status in risk_service.OPEN_STATUSES
        ),
        "evidence_count": len(control.evidence_items),
        "verified_evidence_count": verified,
        "coverage_percent": risk_service.control_coverage(control.status, verified),
    }


def assessment_payload(assessment: models.Assessment, finding_count: int) -> dict:
    return {
        "id": assessment.id,
        "name": assessment.name,
        "period": assessment.period,
        "owner": assessment.owner,
        "scope": assessment.scope,
        "assumptions": assessment.assumptions,
        "is_active": assessment.is_active,
        "finding_count": finding_count,
    }
