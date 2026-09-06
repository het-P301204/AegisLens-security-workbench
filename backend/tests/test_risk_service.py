"""Unit tests for the risk formula, bands, and coverage arithmetic."""

from __future__ import annotations

import pytest

from app.services import risk_service


@pytest.mark.parametrize(
    ("likelihood", "impact", "expected"),
    [(1, 1, 1), (2, 3, 6), (4, 5, 20), (5, 5, 25), (3, 3, 9)],
)
def test_risk_score_is_likelihood_times_impact(likelihood, impact, expected):
    assert risk_service.calculate_risk_score(likelihood, impact) == expected


@pytest.mark.parametrize(
    ("score", "level"),
    [
        (25, "Critical"),
        (20, "Critical"),
        (19, "High"),
        (12, "High"),
        (11, "Medium"),
        (6, "Medium"),
        (5, "Low"),
        (3, "Low"),
        (2, "Informational"),
        (1, "Informational"),
    ],
)
def test_risk_level_bands(score, level):
    assert risk_service.risk_level(score) == level


@pytest.mark.parametrize("likelihood", [0, 6, -1, 100])
def test_invalid_likelihood_is_rejected(likelihood):
    with pytest.raises(ValueError, match="likelihood"):
        risk_service.calculate_risk_score(likelihood, 3)


@pytest.mark.parametrize("impact", [0, 6, -2])
def test_invalid_impact_is_rejected(impact):
    with pytest.raises(ValueError, match="impact"):
        risk_service.calculate_risk_score(3, impact)


def test_non_integer_scale_values_are_rejected():
    with pytest.raises(ValueError):
        risk_service.calculate_risk_score(3.5, 4)  # type: ignore[arg-type]


def test_derived_severity_matches_band_for_score():
    assert risk_service.derived_severity(4, 5) == "Critical"
    assert risk_service.derived_severity(2, 2) == "Low"


def test_risk_bands_cover_the_whole_scale_without_gaps():
    reference = risk_service.risk_band_reference()
    assert reference[0]["max_score"] == risk_service.MAX_RISK_SCORE
    assert reference[-1]["min_score"] == 1
    for higher, lower in zip(reference, reference[1:]):
        assert lower["max_score"] == higher["min_score"] - 1


def test_overall_risk_score_is_zero_without_findings():
    assert risk_service.overall_risk_score([]) == 0


def test_overall_risk_score_normalises_the_mean_to_100():
    assert risk_service.overall_risk_score([25, 25]) == 100
    assert risk_service.overall_risk_score([20, 10]) == 60


def test_percentage_handles_zero_denominator():
    assert risk_service.percentage(0, 0) == 0
    assert risk_service.percentage(4, 5) == 80


def test_control_coverage_rewards_status_and_verified_evidence():
    assert risk_service.control_coverage("Not Assessed", 0) == 0
    assert risk_service.control_coverage("Implemented", 0) == 60
    assert risk_service.control_coverage("Implemented", 2) == 100
    assert risk_service.control_coverage("Partially Implemented", 1) == 50


def test_control_coverage_caps_evidence_credit():
    assert risk_service.control_coverage("Implemented", 2) == risk_service.control_coverage(
        "Implemented", 20
    )
