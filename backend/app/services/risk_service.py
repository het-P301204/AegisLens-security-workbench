"""Risk scoring and coverage arithmetic.

Everything here is intentionally simple enough to check by hand:

    risk_score = likelihood x impact        (each on a 1-5 scale, so 1-25)

The score maps to a risk level using fixed bands, and the same bands are used
for the severity vocabulary so a finding's stated severity can be compared with
the severity its numbers imply.
"""

from __future__ import annotations

SCALE_MIN = 1
SCALE_MAX = 5
MAX_RISK_SCORE = SCALE_MAX * SCALE_MAX  # 25

SEVERITIES = ["Critical", "High", "Medium", "Low", "Informational"]
STATUSES = ["Open", "In Review", "Accepted", "Remediated", "Closed"]
EVIDENCE_TYPES = [
    "Policy",
    "Screenshot",
    "Log",
    "Configuration",
    "Report",
    "Interview note",
    "Document",
    "Other",
]
VERIFICATION_STATUSES = ["Verified", "Pending", "Not Verified"]
CONTROL_STATUSES = ["Implemented", "Partially Implemented", "Not Implemented", "Not Assessed"]

#: Statuses that still represent live exposure.
OPEN_STATUSES = {"Open", "In Review"}
#: Statuses that represent work finished or risk formally signed off.
RESOLVED_STATUSES = {"Remediated", "Closed"}

#: Lower bound (inclusive) of each risk band, highest first.
RISK_BANDS: list[tuple[int, str]] = [
    (20, "Critical"),
    (12, "High"),
    (6, "Medium"),
    (3, "Low"),
    (1, "Informational"),
]

#: How much a control status contributes to coverage before evidence is considered.
CONTROL_STATUS_WEIGHT = {
    "Implemented": 100,
    "Partially Implemented": 50,
    "Not Implemented": 10,
    "Not Assessed": 0,
}

#: Verified evidence items needed for a control to reach full evidence credit.
EVIDENCE_TARGET_PER_CONTROL = 2

#: Split between "what the status claims" and "what the evidence shows".
STATUS_SHARE = 0.6
EVIDENCE_SHARE = 0.4


def calculate_risk_score(likelihood: int, impact: int) -> int:
    """Return ``likelihood * impact``, rejecting values outside the 1-5 scale."""
    for label, value in (("likelihood", likelihood), ("impact", impact)):
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"{label} must be a whole number between {SCALE_MIN} and {SCALE_MAX}")
        if not SCALE_MIN <= value <= SCALE_MAX:
            raise ValueError(f"{label} must be between {SCALE_MIN} and {SCALE_MAX}, got {value}")
    return likelihood * impact


def risk_level(score: int) -> str:
    """Map a 1-25 risk score onto a risk level using the fixed bands."""
    for lower_bound, level in RISK_BANDS:
        if score >= lower_bound:
            return level
    return "Informational"


def derived_severity(likelihood: int, impact: int) -> str:
    """Severity implied by the numbers, independent of the stored severity field."""
    return risk_level(calculate_risk_score(likelihood, impact))


def risk_band_reference() -> list[dict[str, object]]:
    """Human-readable description of the bands, surfaced in the UI and docs."""
    reference: list[dict[str, object]] = []
    previous_lower = MAX_RISK_SCORE + 1
    for lower_bound, level in RISK_BANDS:
        reference.append(
            {
                "level": level,
                "min_score": lower_bound,
                "max_score": previous_lower - 1,
                "range": f"{lower_bound}-{previous_lower - 1}",
            }
        )
        previous_lower = lower_bound
    return reference


def overall_risk_score(scores: list[int]) -> int:
    """Normalise the mean risk score of live findings onto a 0-100 scale.

    Returns 0 when there is nothing outstanding, which is the honest reading of
    an assessment with no open findings rather than a hidden default.
    """
    if not scores:
        return 0
    mean = sum(scores) / len(scores)
    return round(mean / MAX_RISK_SCORE * 100)


def percentage(part: int, whole: int) -> int:
    """Integer percentage that returns 0 instead of dividing by zero."""
    if whole <= 0:
        return 0
    return round(part / whole * 100)


def control_coverage(status: str, verified_evidence_count: int) -> int:
    """Coverage percentage for one control.

    Sixty percent of the figure comes from the recorded implementation status and
    forty percent from whether verified evidence actually backs it up, so a
    control claimed as implemented with no evidence cannot reach 100%.
    """
    status_component = CONTROL_STATUS_WEIGHT.get(status, 0) * STATUS_SHARE
    evidence_ratio = min(verified_evidence_count / EVIDENCE_TARGET_PER_CONTROL, 1.0)
    return round(status_component + evidence_ratio * 100 * EVIDENCE_SHARE)
