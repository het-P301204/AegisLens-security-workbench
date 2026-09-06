"""Report generation: structure, Markdown rendering, and honest framing."""

from __future__ import annotations


def test_report_summary_has_every_required_section(client):
    report = client.get("/api/reports/summary").json()

    for section in (
        "title",
        "generated_at",
        "assessment",
        "executive_summary",
        "risk_summary",
        "findings",
        "priority_findings",
        "controls",
        "confirmed_evidence",
        "analyst_assessment",
        "missing_information",
        "recommended_next_steps",
        "limitations",
    ):
        assert section in report, f"missing section: {section}"
        assert report[section], f"empty section: {section}"


def test_report_counts_match_the_assessment(client):
    report = client.get("/api/reports/summary").json()
    assert len(report["findings"]) == 10
    assert sum(report["risk_summary"].values()) == 10
    assert {row["severity"] for row in report["priority_findings"]} <= {"Critical", "High"}
    assert len(report["controls"]) == 12


def test_report_separates_evidence_assessment_and_gaps(client):
    report = client.get("/api/reports/summary").json()

    assert any("Verified" in line for line in report["confirmed_evidence"])
    assert any("analyst judgement" in line for line in report["analyst_assessment"])
    assert any("F-008" in line for line in report["missing_information"])
    assert any("E-020" in line for line in report["missing_information"])


def test_report_flags_a_severity_that_disagrees_with_its_score(client):
    client.put("/api/findings/F-010", json={"likelihood": 5, "impact": 5})
    report = client.get("/api/reports/summary").json()
    assert any("F-010" in line and "score implies" in line for line in report["analyst_assessment"])


def test_report_never_claims_exploitation(client):
    """No unqualified exploitation claim may appear, and the caveat must be explicit."""
    markdown = client.get("/api/reports/markdown").text.lower()

    for phrase in (
        "we exploited",
        "successfully exploited",
        "successfully compromised",
        "proof of exploit",
        "exploit was demonstrated",
    ):
        assert phrase not in markdown

    assert "no live system testing, exploitation, or external scanning was performed" in markdown
    assert "should be read as confirming that a weakness was exploited" in markdown


def test_report_states_its_limitations(client):
    limitations = " ".join(client.get("/api/reports/summary").json()["limitations"]).lower()
    assert "synthetic" in limitations
    assert "no live system testing" in limitations
    assert "not a substitute for a professional security audit" in limitations


def test_markdown_report_renders_the_expected_headings(client):
    response = client.get("/api/reports/markdown")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")

    markdown = response.text
    for heading in (
        "## 1. Assessment overview",
        "## 2. Scope and assumptions",
        "## 3. Executive summary",
        "## 4. Risk summary",
        "## 5. Findings",
        "## 6. Critical and high-risk findings",
        "## 7. Confirmed evidence",
        "## 8. Analyst assessment",
        "## 9. Control coverage",
        "## 10. Missing information",
        "## 11. Recommended next steps",
        "## 12. Limitations",
    ):
        assert heading in markdown

    assert "F-001" in markdown
    assert "likelihood x impact" in markdown


def test_markdown_report_can_be_downloaded_as_a_file(client):
    response = client.get("/api/reports/markdown", params={"download": "true"})
    assert 'filename="aegislens-report-A-001.md"' in response.headers["content-disposition"]


def test_print_view_returns_self_contained_html(client):
    response = client.get("/api/reports/print")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")

    html = response.text
    assert "<!DOCTYPE html>" in html
    assert "window.print()" in html
    assert "<style>" in html and "http" not in html.split("<body>")[0].replace(
        "http-equiv", ""
    )  # no external assets to fetch

    # Rendered as a document, not a dump of the Markdown source.
    assert "<h2>5. Findings</h2>" in html
    assert "## 5. Findings" not in html
    assert "Missing multi-factor authentication" in html


def test_print_view_does_not_double_escape_entities(client):
    """Text must read correctly; a literal &amp; means it was escaped twice."""
    html = client.get("/api/reports/print").text
    assert "&amp;amp;" not in html
    assert "&amp;gt;" not in html
    assert "**Generated:**" not in html  # Markdown markers must not leak through


def test_print_view_escapes_markup_in_finding_text(client):
    """A finding title is data, so it must never be interpreted as HTML."""
    client.put(
        "/api/findings/F-001",
        json={"title": "<script>alert('xss')</script> injected title"},
    )
    html = client.get("/api/reports/print").text

    assert "<script>alert(" not in html
    assert "&lt;script&gt;alert(" in html


def test_report_for_an_assessment_without_findings(client):
    report = client.get("/api/reports/summary", params={"assessment_id": "A-002"}).json()
    assert len(report["findings"]) == 3

    client.delete("/api/findings/F-011")
    client.delete("/api/findings/F-012")
    client.delete("/api/findings/F-013")

    empty = client.get("/api/reports/summary", params={"assessment_id": "A-002"}).json()
    assert empty["findings"] == []
    assert empty["overall_risk_score"] == 0
    assert empty["overall_risk_level"] == "None"
    assert any("No findings have been recorded" in line for line in empty["executive_summary"])
    assert "No findings have been recorded" in client.get(
        "/api/reports/markdown", params={"assessment_id": "A-002"}
    ).text


def test_report_on_an_empty_database_returns_404(empty_client):
    assert empty_client.get("/api/reports/summary").status_code == 404


def test_openapi_schema_is_served(client):
    schema = client.get("/api/openapi.json").json()
    assert schema["info"]["title"] == "AegisLens API"
    for path in ("/api/health", "/api/dashboard", "/api/findings", "/api/reports/summary"):
        assert path in schema["paths"]
