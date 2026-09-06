"""SQLAlchemy ORM models for AegisLens.

The schema is deliberately small: five entities plus two association tables.
All queries in the application go through these mapped classes, so user input is
never concatenated into SQL.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

finding_evidence = Table(
    "finding_evidence",
    Base.metadata,
    Column("finding_id", String(16), ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True),
    Column("evidence_id", String(16), ForeignKey("evidence.id", ondelete="CASCADE"), primary_key=True),
)

finding_control = Table(
    "finding_control",
    Base.metadata,
    Column("finding_id", String(16), ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True),
    Column("control_id", String(16), ForeignKey("controls.id", ondelete="CASCADE"), primary_key=True),
)


class Assessment(Base):
    """A scoped review period. Findings belong to exactly one assessment."""

    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    period: Mapped[str] = mapped_column(String(100), default="")
    owner: Mapped[str] = mapped_column(String(120), default="")
    scope: Mapped[str] = mapped_column(Text, default="")
    assumptions: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    findings: Mapped[list["Finding"]] = relationship(back_populates="assessment")


class Finding(Base):
    """A single security finding with its transparent likelihood/impact rating."""

    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    assessment_id: Mapped[str] = mapped_column(String(16), ForeignKey("assessments.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    likelihood: Mapped[int] = mapped_column(Integer, nullable=False)
    impact: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Open")
    owner: Mapped[str] = mapped_column(String(120), default="")
    affected_asset: Mapped[str] = mapped_column(String(160), default="")
    security_impact: Mapped[str] = mapped_column(Text, default="")
    recommended_action: Mapped[str] = mapped_column(Text, default="")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[date] = mapped_column(Date, default=date.today)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    assessment: Mapped[Assessment] = relationship(back_populates="findings")
    evidence: Mapped[list["Evidence"]] = relationship(
        secondary=finding_evidence, back_populates="findings", lazy="selectin"
    )
    controls: Mapped[list["Control"]] = relationship(
        secondary=finding_control, back_populates="findings", lazy="selectin"
    )


class Evidence(Base):
    """Metadata describing one piece of collected evidence."""

    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(300), default="")
    related_control_id: Mapped[str | None] = mapped_column(
        String(16), ForeignKey("controls.id"), nullable=True
    )
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    upload_date: Mapped[date] = mapped_column(Date, default=date.today)

    findings: Mapped[list[Finding]] = relationship(
        secondary=finding_evidence, back_populates="evidence", lazy="selectin"
    )
    related_control: Mapped["Control | None"] = relationship(back_populates="evidence_items")


class Control(Base):
    """One control from the illustrative sample framework."""

    __tablename__ = "controls"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Not Assessed")
    notes: Mapped[str] = mapped_column(Text, default="")

    findings: Mapped[list[Finding]] = relationship(
        secondary=finding_control, back_populates="controls", lazy="selectin"
    )
    evidence_items: Mapped[list[Evidence]] = relationship(
        back_populates="related_control", lazy="selectin"
    )


class Asset(Base):
    """An in-scope system referenced by findings."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(80), default="")
    environment: Mapped[str] = mapped_column(String(40), default="")
    owner: Mapped[str] = mapped_column(String(120), default="")
    criticality: Mapped[str] = mapped_column(String(20), default="")
    description: Mapped[str] = mapped_column(Text, default="")


class Activity(Base):
    """Append-only record of changes made in the workbench."""

    __tablename__ = "activity"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    actor: Mapped[str] = mapped_column(String(80), default="workbench")
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(16), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="")
