"""Sequential identifier allocation for findings and evidence.

Identifiers are never reused. The high-water mark is taken from the live rows
plus the ids referenced by the append-only activity log, so deleting a record
does not free its id for the next one - which would make its history ambiguous.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models


def next_identifier(db: Session, prefix: str, id_column, entity_type: str) -> str:
    """Return the next unused id for ``prefix``, e.g. ``F-014``."""
    used: set[str] = set(db.scalars(select(id_column)).all())
    used.update(
        db.scalars(
            select(models.Activity.entity_id).where(models.Activity.entity_type == entity_type)
        ).all()
    )

    numbers = [
        int(value[len(prefix) :])
        for value in used
        if value.startswith(prefix) and value[len(prefix) :].isdigit()
    ]
    return f"{prefix}{(max(numbers) + 1) if numbers else 1:03d}"
