"""Dashboard aggregation, control coverage, and the health endpoint."""

from __future__ import annotations


def test_health_reports_ok_and_a_reachable_database(client):
    response = client.get("/api/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "AegisLens"
    assert body["database"] == "connected"


def test_health_works_on_an_empty_database(empty_client):
    assert empty_client.get("/api/health").json()["status"] == "ok"


def test_dashboard_statistics_match_the_sample_data(client):
    data = client.get("/api/dashboard").json()

    assert data["assessment"]["id"] == "A-001"
    assert data["total_findings"] == 10
    assert data["critical_findings"] == 2
    assert data["high_findings"] == 5
    assert data["open_findings"] == 7
    assert data["resolved_findings"] == 2
    assert data["accepted_findings"] == 1
    assert data["evidence_items"] == 20
    assert data["verified_evidence_items"] == 13
    assert data["evidence_completion_percent"] == 80
    assert data["controls_total"] == 12


def test_dashboard_distributions_cover_every_vocabulary_value(client):
    data = client.get("/api/dashboard").json()

    severities = {row["severity"] for row in data["severity_distribution"]}
    assert severities == {"Critical", "High", "Medium", "Low", "Informational"}
    assert sum(row["count"] for row in data["severity_distribution"]) == data["total_findings"]

    statuses = {row["status"] for row in data["status_distribution"]}
    assert statuses == {"Open", "In Review", "Accepted", "Remediated", "Closed"}
    assert sum(row["count"] for row in data["status_distribution"]) == data["total_findings"]


def test_dashboard_only_counts_live_findings_in_the_risk_indicator(client):
    before = client.get("/api/dashboard").json()["overall_risk_score"]
    client.patch("/api/findings/F-001/status", json={"status": "Remediated"})
    after = client.get("/api/dashboard").json()

    assert after["overall_risk_score"] < before
    assert after["open_findings"] == 6
    assert after["resolved_findings"] == 3


def test_dashboard_reacts_to_a_new_finding(client, new_finding_payload):
    before = client.get("/api/dashboard").json()["total_findings"]
    client.post("/api/findings", json={**new_finding_payload, "severity": "Critical", "likelihood": 5, "impact": 5})
    after = client.get("/api/dashboard").json()

    assert after["total_findings"] == before + 1
    assert after["critical_findings"] == 3


def test_dashboard_can_be_scoped_to_another_assessment(client):
    data = client.get("/api/dashboard", params={"assessment_id": "A-002"}).json()
    assert data["assessment"]["id"] == "A-002"
    assert data["total_findings"] == 3
    assert data["evidence_completion_percent"] == 0


def test_dashboard_lists_evidence_gaps_and_recent_activity(client):
    data = client.get("/api/dashboard").json()
    assert {gap["finding_id"] for gap in data["evidence_gaps"]} == {"F-008", "F-010"}
    assert len(data["recent_activity"]) > 0
    assert data["recent_activity"][0]["timestamp"] >= data["recent_activity"][-1]["timestamp"]


def test_dashboard_on_an_empty_database_returns_404_with_guidance(empty_client):
    response = empty_client.get("/api/dashboard")
    assert response.status_code == 404
    assert "Seed the sample data" in response.json()["detail"]


def test_empty_database_returns_empty_collections(empty_client):
    assert empty_client.get("/api/findings").json() == []
    assert empty_client.get("/api/evidence").json() == []
    assert empty_client.get("/api/controls").json() == []
    assert empty_client.get("/api/assessments").json() == []
    assert empty_client.get("/api/activity").json() == []


def test_unknown_assessment_returns_404(client):
    assert client.get("/api/dashboard", params={"assessment_id": "A-999"}).status_code == 404


def test_controls_report_linked_findings_and_evidence(client):
    controls = {control["id"]: control for control in client.get("/api/controls").json()}
    assert len(controls) == 12

    mfa = controls["AC-01"]
    assert mfa["linked_finding_ids"] == ["F-001"]
    assert mfa["evidence_count"] == 2
    assert mfa["verified_evidence_count"] == 2
    assert mfa["coverage_percent"] == 70  # Partially Implemented (30) + full evidence credit (40)


def test_control_status_update_changes_coverage_and_logs_activity(client):
    before = client.get("/api/controls/LM-01").json()["coverage_percent"]
    after = client.put("/api/controls/LM-01", json={"status": "Implemented"}).json()

    assert after["status"] == "Implemented"
    assert after["coverage_percent"] > before
    assert any(
        entry["entity_id"] == "LM-01" and entry["action"] == "Updated control"
        for entry in client.get("/api/activity").json()
    )


def test_control_update_rejects_an_invalid_status(client):
    assert client.put("/api/controls/LM-01", json={"status": "Mostly"}).status_code == 422


def test_unknown_control_returns_404(client):
    assert client.get("/api/controls/ZZ-99").status_code == 404
    assert client.put("/api/controls/ZZ-99", json={"status": "Implemented"}).status_code == 404


def test_control_categories_roll_up_by_framework_area(client):
    categories = {row["category"]: row for row in client.get("/api/controls/categories").json()}
    assert categories["Access Control"]["control_count"] == 3
    assert categories["Logging and Monitoring"]["not_implemented"] == 2
    assert 0 <= categories["Data Protection"]["coverage_percent"] <= 100


def test_risk_model_endpoint_documents_the_formula(client):
    model = client.get("/api/risk-model").json()
    assert model["formula"] == "risk_score = likelihood x impact"
    assert model["max_score"] == 25
    assert len(model["bands"]) == 5


def test_vocabulary_endpoint_lists_allowed_values(client):
    vocabulary = client.get("/api/vocabulary").json()
    assert vocabulary["severities"] == ["Critical", "High", "Medium", "Low", "Informational"]
    assert "Interview note" in vocabulary["evidence_types"]
    assert "Access Control" in vocabulary["categories"]


def test_activating_an_assessment_switches_the_default(client):
    client.post("/api/assessments/A-002/activate")
    assert client.get("/api/dashboard").json()["assessment"]["id"] == "A-002"

    created = client.post(
        "/api/findings",
        json={
            "title": "Created against the newly active assessment",
            "category": "Access Control",
            "severity": "Low",
            "likelihood": 2,
            "impact": 2,
        },
    ).json()
    assert created["assessment_id"] == "A-002"


def test_assessment_metadata_can_be_edited(client):
    updated = client.put(
        "/api/assessments/A-001", json={"scope": "Revised scope for the report."}
    ).json()
    assert updated["scope"] == "Revised scope for the report."
    assert "Revised scope" in client.get("/api/reports/markdown").text


def test_security_headers_are_present(client):
    headers = client.get("/api/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
