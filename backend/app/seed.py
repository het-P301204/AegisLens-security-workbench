"""Load the synthetic sample dataset into the database.

The JSON files under ``sample-data/`` are the source of truth for the demo
content, so the dataset can be edited without touching Python code. Seeding is
skipped when the tables already hold data unless ``force`` is used.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .config import SAMPLE_DATA_DIR
from .database import SessionLocal, create_all
from .services.risk_service import calculate_risk_score


def _load(directory: Path, filename: str) -> list[dict[str, Any]]:
    path = directory / filename
    if not path.exists():
        raise FileNotFoundError(f"Sample data file not found: {path}")
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError(f"{filename} must contain a JSON array")
    return data


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def database_is_empty(db: Session) -> bool:
    return db.scalar(select(func.count()).select_from(models.Finding)) == 0


def seed_database(db: Session, directory: Path | None = None, force: bool = False) -> bool:
    """Populate the database. Returns True when rows were written."""
    directory = Path(directory) if directory else SAMPLE_DATA_DIR

    if force:
        for table in (
            models.finding_evidence,
            models.finding_control,
        ):
            db.execute(table.delete())
        for model in (models.Activity, models.Finding, models.Evidence, models.Control, models.Asset, models.Assessment):
            db.query(model).delete()
        db.commit()
    elif not database_is_empty(db):
        return False

    for row in _load(directory, "assessments.json"):
        db.add(
            models.Assessment(
                id=row["id"],
                name=row["name"],
                period=row.get("period", ""),
                owner=row.get("owner", ""),
                scope=row.get("scope", ""),
                assumptions=row.get("assumptions", ""),
                is_active=bool(row.get("is_active", False)),
            )
        )

    for row in _load(directory, "assets.json"):
        db.add(
            models.Asset(
                id=row["id"],
                name=row["name"],
                asset_type=row.get("asset_type", ""),
                environment=row.get("environment", ""),
                owner=row.get("owner", ""),
                criticality=row.get("criticality", ""),
                description=row.get("description", ""),
            )
        )

    controls: dict[str, models.Control] = {}
    for row in _load(directory, "controls.json"):
        control = models.Control(
            id=row["id"],
            name=row["name"],
            category=row["category"],
            description=row.get("description", ""),
            status=row.get("status", "Not Assessed"),
            notes=row.get("notes", ""),
        )
        controls[control.id] = control
        db.add(control)

    findings: dict[str, models.Finding] = {}
    for row in _load(directory, "findings.json"):
        finding = models.Finding(
            id=row["id"],
            assessment_id=row["assessment_id"],
            title=row["title"],
            description=row.get("description", ""),
            category=row["category"],
            severity=row["severity"],
            likelihood=row["likelihood"],
            impact=row["impact"],
            risk_score=calculate_risk_score(row["likelihood"], row["impact"]),
            status=row.get("status", "Open"),
            owner=row.get("owner", ""),
            affected_asset=row.get("affected_asset", ""),
            security_impact=row.get("security_impact", ""),
            recommended_action=row.get("recommended_action", ""),
            due_date=_parse_date(row.get("due_date")),
            created_at=_parse_date(row.get("created_at")) or date.today(),
            updated_at=datetime.now(),
        )
        finding.controls = [controls[cid] for cid in row.get("control_ids", []) if cid in controls]
        findings[finding.id] = finding
        db.add(finding)

    for row in _load(directory, "evidence.json"):
        related = row.get("related_control_id")
        evidence = models.Evidence(
            id=row["id"],
            name=row["name"],
            evidence_type=row["evidence_type"],
            description=row.get("description", ""),
            source=row.get("source", ""),
            related_control_id=related if related in controls else None,
            verification_status=row.get("verification_status", "Pending"),
            upload_date=_parse_date(row.get("upload_date")) or date.today(),
        )
        evidence.findings = [
            findings[fid] for fid in row.get("linked_finding_ids", []) if fid in findings
        ]
        db.add(evidence)

    for row in _load(directory, "activity.json"):
        db.add(
            models.Activity(
                timestamp=datetime.fromisoformat(row["timestamp"]),
                actor=row.get("actor", "workbench"),
                action=row["action"],
                entity_type=row["entity_type"],
                entity_id=row["entity_id"],
                detail=row.get("detail", ""),
            )
        )

    db.commit()
    return True


def main() -> None:
    """Entry point for ``python -m app.seed``."""
    import argparse

    parser = argparse.ArgumentParser(description="Seed the AegisLens database with sample data.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows and reload the sample dataset.",
    )
    args = parser.parse_args()

    create_all()
    with SessionLocal() as db:
        wrote = seed_database(db, force=args.force)
    print("Sample data loaded." if wrote else "Database already contains data; nothing to do.")


if __name__ == "__main__":
    main()
