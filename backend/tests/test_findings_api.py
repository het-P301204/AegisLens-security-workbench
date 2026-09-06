"""Finding CRUD, validation, filtering, and evidence linking."""

from __future__ import annotations


def test_seeded_findings_are_available(client):
    response = client.get("/api/findings")
    assert response.status_code == 200
    findings = response.json()
    assert len(findings) == 13
    assert {"F-001", "F-010", "F-013"} <= {finding["id"] for finding in findings}


def test_create_finding_derives_risk_score_and_level(client, new_finding_payload):
    response = client.post("/api/findings", json=new_finding_payload)
    assert response.status_code == 201

    finding = response.json()
    assert finding["id"] == "F-014"
    assert finding["risk_score"] == 12
    assert finding["risk_level"] == "High"
    assert finding["derived_severity"] == "High"
    assert finding["severity_matches_score"] is True
    assert finding["assessment_id"] == "A-001"
    assert finding["activity"][0]["action"] == "Created finding"


def test_create_finding_ignores_any_client_supplied_risk_score(client, new_finding_payload):
    finding = client.post(
        "/api/findings", json={**new_finding_payload, "risk_score": 999}
    ).json()
    assert finding["risk_score"] == 12


def test_create_finding_can_link_evidence_and_controls(client, new_finding_payload):
    finding = client.post(
        "/api/findings",
        json={**new_finding_payload, "evidence_ids": ["E-001", "E-002"], "control_ids": ["AC-01"]},
    ).json()
    assert finding["evidence_ids"] == ["E-001", "E-002"]
    assert finding["control_ids"] == ["AC-01"]
    assert finding["verified_evidence_count"] == 2
    assert [item["name"] for item in finding["evidence"]][0].startswith("Identity provider")


def test_create_finding_rejects_unknown_evidence_id(client, new_finding_payload):
    response = client.post(
        "/api/findings", json={**new_finding_payload, "evidence_ids": ["E-404"]}
    )
    assert response.status_code == 422
    assert "E-404" in response.json()["detail"]


def test_create_finding_rejects_invalid_severity(client, new_finding_payload):
    response = client.post("/api/findings", json={**new_finding_payload, "severity": "Catastrophic"})
    assert response.status_code == 422
    assert any(problem["field"] == "severity" for problem in response.json()["problems"])


def test_create_finding_rejects_out_of_range_likelihood_and_impact(client, new_finding_payload):
    response = client.post(
        "/api/findings", json={**new_finding_payload, "likelihood": 9, "impact": 0}
    )
    assert response.status_code == 422
    fields = {problem["field"] for problem in response.json()["problems"]}
    assert {"likelihood", "impact"} <= fields


def test_create_finding_rejects_blank_title(client, new_finding_payload):
    response = client.post("/api/findings", json={**new_finding_payload, "title": "   "})
    assert response.status_code == 422


def test_create_finding_rejects_invalid_status(client, new_finding_payload):
    response = client.post("/api/findings", json={**new_finding_payload, "status": "Ignored"})
    assert response.status_code == 422


def test_update_finding_recalculates_the_risk_score(client):
    response = client.put("/api/findings/F-010", json={"likelihood": 5, "impact": 5})
    assert response.status_code == 200

    finding = response.json()
    assert finding["risk_score"] == 25
    assert finding["risk_level"] == "Critical"
    # Severity was left at Low, so the mismatch has to be visible rather than silently corrected.
    assert finding["severity"] == "Low"
    assert finding["severity_matches_score"] is False


def test_update_finding_applies_partial_changes_only(client):
    before = client.get("/api/findings/F-002").json()
    after = client.put("/api/findings/F-002", json={"owner": "New Owner"}).json()
    assert after["owner"] == "New Owner"
    assert after["title"] == before["title"]
    assert after["risk_score"] == before["risk_score"]


def test_update_finding_rejects_invalid_values(client):
    assert client.put("/api/findings/F-001", json={"impact": 7}).status_code == 422
    assert client.put("/api/findings/F-001", json={"severity": "Severe"}).status_code == 422


def test_update_missing_finding_returns_404(client):
    response = client.put("/api/findings/F-999", json={"owner": "Nobody"})
    assert response.status_code == 404
    assert "F-999" in response.json()["detail"]


def test_status_change_is_recorded_in_activity(client):
    response = client.patch("/api/findings/F-001/status", json={"status": "Remediated"})
    assert response.status_code == 200

    finding = response.json()
    assert finding["status"] == "Remediated"
    actions = [entry["detail"] for entry in finding["activity"]]
    assert any("Open to Remediated" in detail for detail in actions)


def test_status_change_rejects_unknown_status(client):
    assert client.patch("/api/findings/F-001/status", json={"status": "Parked"}).status_code == 422


def test_delete_finding_removes_it_but_keeps_the_evidence(client):
    assert client.delete("/api/findings/F-001").status_code == 204
    assert client.get("/api/findings/F-001").status_code == 404
    assert client.get("/api/evidence/E-001").status_code == 200
    assert client.get("/api/evidence/E-001").json()["linked_finding_ids"] == []


def test_delete_missing_finding_returns_404(client):
    assert client.delete("/api/findings/F-999").status_code == 404


def test_search_matches_title_and_asset(client):
    by_title = client.get("/api/findings", params={"search": "multi-factor"}).json()
    assert [finding["id"] for finding in by_title] == ["F-001"]

    by_asset = client.get("/api/findings", params={"search": "Staging Web Service"}).json()
    assert {finding["id"] for finding in by_asset} == {"F-009", "F-012"}


def test_filter_by_severity_status_and_category(client):
    critical = client.get("/api/findings", params={"severity": "Critical"}).json()
    assert {finding["id"] for finding in critical} == {"F-001", "F-006"}

    open_only = client.get("/api/findings", params={"status": "Open"}).json()
    assert all(finding["status"] == "Open" for finding in open_only)

    access = client.get("/api/findings", params={"category": "Access Control"}).json()
    assert all(finding["category"] == "Access Control" for finding in access)


def test_filter_by_assessment(client):
    second = client.get("/api/findings", params={"assessment_id": "A-002"}).json()
    assert {finding["id"] for finding in second} == {"F-011", "F-012", "F-013"}


def test_findings_are_sorted_by_risk_score_by_default(client):
    scores = [finding["risk_score"] for finding in client.get("/api/findings").json()]
    assert scores == sorted(scores, reverse=True)


def test_finding_evidence_endpoint_returns_linked_items(client):
    evidence = client.get("/api/findings/F-004/evidence").json()
    assert [item["id"] for item in evidence] == ["E-007", "E-008", "E-009"]


def test_overdue_flag_uses_due_date_and_status(client):
    overdue = [
        finding["id"] for finding in client.get("/api/findings").json() if finding["is_overdue"]
    ]
    assert "F-006" in overdue
    # A past due date on a closed finding is not overdue.
    assert "F-003" not in overdue


def test_categories_endpoint_lists_distinct_values(client):
    categories = client.get("/api/findings/categories").json()
    assert categories == sorted(set(categories))
    assert "Access Control" in categories


def test_deleted_ids_are_never_reused(client, new_finding_payload):
    """A reused id would attach a deleted finding's history to a new one."""
    first = client.post("/api/findings", json=new_finding_payload).json()
    assert first["id"] == "F-014"

    client.delete(f"/api/findings/{first['id']}")
    second = client.post("/api/findings", json=new_finding_payload).json()
    assert second["id"] == "F-015"

    # The new finding starts with only its own creation entry.
    assert [entry["action"] for entry in second["activity"]] == ["Created finding"]


def test_deleted_evidence_ids_are_never_reused(client):
    created = client.post("/api/evidence", json={"name": "Temp", "evidence_type": "Log"}).json()
    assert created["id"] == "E-021"

    client.delete(f"/api/evidence/{created['id']}")
    replacement = client.post("/api/evidence", json={"name": "Temp two", "evidence_type": "Log"}).json()
    assert replacement["id"] == "E-022"
