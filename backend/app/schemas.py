"""Pydantic request and response models.

These carry the input validation for the API: severities, statuses, and evidence
types are constrained to known vocabularies, and likelihood/impact are bounded to
the 1-5 scale the risk formula expects.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .services.risk_service import (
    CONTROL_STATUSES,
    EVIDENCE_TYPES,
    SEVERITIES,
    STATUSES,
    VERIFICATION_STATUSES,
)

Severity = Literal["Critical", "High", "Medium", "Low", "Informational"]
FindingStatus = Literal["Open", "In Review", "Accepted", "Remediated", "Closed"]
EvidenceType = Literal[
    "Policy", "Screenshot", "Log", "Configuration", "Report", "Interview note", "Document", "Other"
]
VerificationStatus = Literal["Verified", "Pending", "Not Verified"]
ControlStatus = Literal["Implemented", "Partially Implemented", "Not Implemented", "Not Assessed"]

RiskScale = Annotated[int, Field(ge=1, le=5, description="1 (lowest) to 5 (highest)")]
ShortText = Annotated[str, Field(min_length=1, max_length=300)]
LongText = Annotated[str, Field(max_length=5000)]


# --------------------------------------------------------------------------- #
# Shared / reference
# --------------------------------------------------------------------------- #
class VocabularyOut(BaseModel):
    severities: list[str] = SEVERITIES
    statuses: list[str] = STATUSES
    evidence_types: list[str] = EVIDENCE_TYPES
    verification_statuses: list[str] = VERIFICATION_STATUSES
    control_statuses: list[str] = CONTROL_STATUSES
    categories: list[str]


class HealthOut(BaseModel):
    status: Literal["ok"]
    app: str
    version: str
    database: Literal["connected", "unavailable"]


# --------------------------------------------------------------------------- #
# Assessments
# --------------------------------------------------------------------------- #
class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    period: str
    owner: str
    scope: str
    assumptions: str
    is_active: bool
    finding_count: int = 0


class AssessmentUpdate(BaseModel):
    name: ShortText | None = None
    period: Annotated[str, Field(max_length=100)] | None = None
    owner: Annotated[str, Field(max_length=120)] | None = None
    scope: LongText | None = None
    assumptions: LongText | None = None


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #
class EvidenceBase(BaseModel):
    name: ShortText
    evidence_type: EvidenceType
    description: LongText = ""
    source: Annotated[str, Field(max_length=300)] = ""
    related_control_id: Annotated[str, Field(max_length=16)] | None = None
    verification_status: VerificationStatus = "Pending"
    upload_date: date | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("name cannot be blank")
        return cleaned

    @field_validator("related_control_id")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class EvidenceCreate(EvidenceBase):
    linked_finding_ids: list[str] = Field(default_factory=list)


class EvidenceUpdate(BaseModel):
    name: ShortText | None = None
    evidence_type: EvidenceType | None = None
    description: LongText | None = None
    source: Annotated[str, Field(max_length=300)] | None = None
    related_control_id: Annotated[str, Field(max_length=16)] | None = None
    verification_status: VerificationStatus | None = None
    linked_finding_ids: list[str] | None = None


class EvidenceSummary(BaseModel):
    """Evidence as embedded inside a finding response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    evidence_type: str
    verification_status: str
    source: str
    upload_date: date
    related_control_id: str | None = None


class EvidenceOut(EvidenceSummary):
    description: str
    linked_finding_ids: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Findings
# --------------------------------------------------------------------------- #
class FindingBase(BaseModel):
    title: ShortText
    description: LongText = ""
    category: Annotated[str, Field(min_length=1, max_length=80)]
    severity: Severity
    likelihood: RiskScale
    impact: RiskScale
    status: FindingStatus = "Open"
    owner: Annotated[str, Field(max_length=120)] = ""
    affected_asset: Annotated[str, Field(max_length=160)] = ""
    security_impact: LongText = ""
    recommended_action: LongText = ""
    due_date: date | None = None

    @field_validator("title", "category")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("value cannot be blank")
        return cleaned


class FindingCreate(FindingBase):
    assessment_id: Annotated[str, Field(max_length=16)] | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    control_ids: list[str] = Field(default_factory=list)


class FindingUpdate(BaseModel):
    """Partial update. Only supplied fields are applied."""

    title: ShortText | None = None
    description: LongText | None = None
    category: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    severity: Severity | None = None
    likelihood: RiskScale | None = None
    impact: RiskScale | None = None
    status: FindingStatus | None = None
    owner: Annotated[str, Field(max_length=120)] | None = None
    affected_asset: Annotated[str, Field(max_length=160)] | None = None
    security_impact: LongText | None = None
    recommended_action: LongText | None = None
    due_date: date | None = None
    evidence_ids: list[str] | None = None
    control_ids: list[str] | None = None


class ControlSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    status: str


class FindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    assessment_id: str
    title: str
    description: str
    category: str
    severity: str
    likelihood: int
    impact: int
    risk_score: int
    risk_level: str
    derived_severity: str
    severity_matches_score: bool
    status: str
    owner: str
    affected_asset: str
    security_impact: str
    recommended_action: str
    due_date: date | None
    created_at: date
    updated_at: datetime
    is_overdue: bool
    evidence_ids: list[str] = Field(default_factory=list)
    control_ids: list[str] = Field(default_factory=list)
    verified_evidence_count: int = 0


class FindingDetailOut(FindingOut):
    evidence: list[EvidenceSummary] = Field(default_factory=list)
    controls: list[ControlSummary] = Field(default_factory=list)
    activity: list["ActivityOut"] = Field(default_factory=list)


class FindingStatusUpdate(BaseModel):
    status: FindingStatus


# --------------------------------------------------------------------------- #
# Controls
# --------------------------------------------------------------------------- #
class ControlUpdate(BaseModel):
    status: ControlStatus | None = None
    notes: LongText | None = None
    name: ShortText | None = None
    description: LongText | None = None


class ControlOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    description: str
    status: str
    notes: str
    linked_finding_ids: list[str] = Field(default_factory=list)
    open_finding_count: int = 0
    evidence_count: int = 0
    verified_evidence_count: int = 0
    coverage_percent: int = 0


# --------------------------------------------------------------------------- #
# Assets & activity
# --------------------------------------------------------------------------- #
class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    asset_type: str
    environment: str
    owner: str
    criticality: str
    description: str


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    actor: str
    action: str
    entity_type: str
    entity_id: str
    detail: str


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
class SeverityCount(BaseModel):
    severity: str
    count: int


class StatusCount(BaseModel):
    status: str
    count: int


class CategoryCount(BaseModel):
    category: str
    count: int
    open_count: int


class EvidenceGap(BaseModel):
    finding_id: str
    title: str
    severity: str
    reason: str


class DashboardOut(BaseModel):
    assessment: AssessmentOut
    total_findings: int
    critical_findings: int
    high_findings: int
    open_findings: int
    resolved_findings: int
    accepted_findings: int
    overdue_findings: int
    evidence_items: int
    verified_evidence_items: int
    evidence_completion_percent: int
    overall_risk_score: int
    overall_risk_level: str
    control_coverage_percent: int
    controls_assessed: int
    controls_total: int
    severity_distribution: list[SeverityCount]
    status_distribution: list[StatusCount]
    category_distribution: list[CategoryCount]
    top_findings: list[FindingOut]
    evidence_gaps: list[EvidenceGap]
    recent_activity: list[ActivityOut]


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
class ReportFindingRow(BaseModel):
    id: str
    title: str
    category: str
    severity: str
    likelihood: int
    impact: int
    risk_score: int
    status: str
    owner: str
    affected_asset: str
    due_date: date | None
    evidence_count: int
    verified_evidence_count: int
    recommended_action: str


class ReportControlRow(BaseModel):
    id: str
    name: str
    category: str
    status: str
    linked_finding_count: int
    evidence_count: int
    coverage_percent: int


class ReportSummaryOut(BaseModel):
    title: str
    generated_at: datetime
    assessment: AssessmentOut
    executive_summary: list[str]
    risk_summary: dict[str, int]
    overall_risk_score: int
    overall_risk_level: str
    evidence_completion_percent: int
    control_coverage_percent: int
    findings: list[ReportFindingRow]
    priority_findings: list[ReportFindingRow]
    controls: list[ReportControlRow]
    confirmed_evidence: list[str]
    analyst_assessment: list[str]
    missing_information: list[str]
    recommended_next_steps: list[str]
    limitations: list[str]


FindingDetailOut.model_rebuild()
