"""Evidence library CRUD, verification, and finding links."""

from __future__ import annotations


def test_seeded_evidence_is_available(client):
    evidence = client.get("/api/evidence").json()
    assert len(evidence) == 20
    assert evidence[0]["id"] == "E-001"


def test_create_evidence_allocates_the_next_id(client):
    response = client.post(
        "/api/evidence",
        json={
            "name": "Access review sign-off record",
            "evidence_type": "Document",
            "description": "Quarterly access review sign-off for the finance system.",
            "source": "Internal review record, 2026-09-01",
            "related_control_id": "AC-02",
        },
    )
    assert response.status_code == 201

    evidence = response.json()
    assert evidence["id"] == "E-021"
    assert evidence["verification_status"] == "Pending"
    assert evidence["related_control_id"] == "AC-02"


def test_create_evidence_links_to_findings(client):
    evidence = client.post(
        "/api/evidence",
        json={
            "name": "Incident response tabletop notes",
            "evidence_type": "Interview note",
            "linked_finding_ids": ["F-008"],
        },
    ).json()
    assert evidence["linked_finding_ids"] == ["F-008"]

    finding = client.get("/api/findings/F-008").json()
    assert evidence["id"] in finding["evidence_ids"]


def test_create_evidence_rejects_an_invalid_type(client):
    response = client.post("/api/evidence", json={"name": "Something", "evidence_type": "Video"})
    assert response.status_code == 422
    assert any(problem["field"] == "evidence_type" for problem in response.json()["problems"])


def test_create_evidence_rejects_unknown_finding_link(client):
    response = client.post(
        "/api/evidence",
        json={"name": "Orphan", "evidence_type": "Log", "linked_finding_ids": ["F-404"]},
    )
    assert response.status_code == 422
    assert "F-404" in response.json()["detail"]


def test_create_evidence_rejects_unknown_control(client):
    response = client.post(
        "/api/evidence",
        json={"name": "Orphan", "evidence_type": "Log", "related_control_id": "ZZ-99"},
    )
    assert response.status_code == 422


def test_create_evidence_rejects_a_blank_name(client):
    assert (
        client.post("/api/evidence", json={"name": "  ", "evidence_type": "Log"}).status_code == 422
    )


def test_marking_evidence_verified_updates_coverage(client):
    before = client.get("/api/dashboard").json()["evidence_completion_percent"]
    assert before == 80

    response = client.put("/api/evidence/E-019", json={"verification_status": "Verified"})
    assert response.status_code == 200
    assert response.json()["verification_status"] == "Verified"

    after = client.get("/api/dashboard").json()["evidence_completion_percent"]
    assert after == 90


def test_verification_change_is_logged(client):
    client.put("/api/evidence/E-016", json={"verification_status": "Verified"})
    activity = client.get("/api/activity").json()
    assert any(
        entry["entity_id"] == "E-016" and entry["action"] == "Verified evidence"
        for entry in activity
    )


def test_relinking_evidence_replaces_the_previous_links(client):
    evidence = client.put("/api/evidence/E-001", json={"linked_finding_ids": ["F-002"]}).json()
    assert evidence["linked_finding_ids"] == ["F-002"]
    assert "E-001" not in client.get("/api/findings/F-001").json()["evidence_ids"]


def test_update_missing_evidence_returns_404(client):
    assert client.put("/api/evidence/E-404", json={"source": "x"}).status_code == 404


def test_delete_evidence_unlinks_it_from_findings(client):
    assert client.delete("/api/evidence/E-003").status_code == 204
    assert client.get("/api/evidence/E-003").status_code == 404
    assert "E-003" not in client.get("/api/findings/F-002").json()["evidence_ids"]


def test_filter_by_type_and_verification_status(client):
    policies = client.get("/api/evidence", params={"evidence_type": "Policy"}).json()
    assert {item["id"] for item in policies} == {"E-005", "E-020"}

    verified = client.get("/api/evidence", params={"verification_status": "Verified"}).json()
    assert all(item["verification_status"] == "Verified" for item in verified)


def test_search_matches_name_and_description(client):
    """The term below appears in one name and one description, so both must match."""
    results = client.get("/api/evidence", params={"search": "firewall"}).json()
    assert {item["id"] for item in results} == {"E-017", "E-018"}

    by_name = client.get("/api/evidence", params={"search": "Backup schedule"}).json()
    assert [item["id"] for item in by_name] == ["E-014"]


def test_unlinked_only_filter_finds_orphan_evidence(client):
    orphans = client.get("/api/evidence", params={"unlinked_only": "true"}).json()
    assert [item["id"] for item in orphans] == ["E-020"]


def test_coverage_endpoint_lists_findings_without_verified_evidence(client):
    gaps = client.get("/api/evidence/coverage", params={"assessment_id": "A-001"}).json()
    assert {gap["finding_id"] for gap in gaps} == {"F-008", "F-010"}
    reasons = {gap["finding_id"]: gap["reason"] for gap in gaps}
    assert "none verified" in reasons["F-008"]


def test_type_summary_counts_verified_items(client):
    summary = {row["evidence_type"]: row for row in client.get("/api/evidence/types/summary").json()}
    assert summary["Screenshot"]["count"] == 3
    assert summary["Screenshot"]["verified"] == 3
