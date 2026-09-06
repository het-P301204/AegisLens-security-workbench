"""Build the security assessment report from current data.

The report separates four things on purpose, because conflating them is the most
common way an assessment write-up misleads its reader:

* confirmed evidence  - what verified evidence actually shows
* analyst assessment  - the reviewer's judgement about severity and exposure
* recommendations     - proposed actions, not statements of fact
* missing information - what could not be established

Nothing in this module asserts that a weakness was exploited. Where a finding
records a functional test, the wording from the finding itself is carried over
verbatim rather than being restated more strongly.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from . import risk_service, serializers

PRIORITY_SEVERITIES = ("Critical", "High")


def build_report(db: Session, assessment: models.Assessment) -> dict:
    """Assemble the structured report payload for one assessment."""
    today = date.today()
    findings = list(
        db.scalars(
            select(models.Finding)
            .where(models.Finding.assessment_id == assessment.id)
            .order_by(models.Finding.risk_score.desc(), models.Finding.id)
        ).all()
    )
    payloads = [serializers.finding_payload(finding, today) for finding in findings]
    by_id = {finding.id: finding for finding in findings}

    controls = list(db.scalars(select(models.Control).order_by(models.Control.id)).all())
    control_payloads = [serializers.control_payload(control) for control in controls]
    coverage_values = [payload["coverage_percent"] for payload in control_payloads]
    control_coverage = round(sum(coverage_values) / len(coverage_values)) if coverage_values else 0

    evidence_items = list(db.scalars(select(models.Evidence)).all())
    verified_evidence = [item for item in evidence_items if item.verification_status == "Verified"]

    open_payloads = [p for p in payloads if p["status"] in risk_service.OPEN_STATUSES]
    overall = risk_service.overall_risk_score([p["risk_score"] for p in open_payloads])
    findings_with_verified = sum(1 for p in payloads if p["verified_evidence_count"] > 0)
    evidence_completion = risk_service.percentage(findings_with_verified, len(payloads))

    rows = [_finding_row(p, by_id[p["id"]]) for p in payloads]
    priority_rows = [row for row in rows if row["severity"] in PRIORITY_SEVERITIES]

    risk_summary = {
        severity: sum(1 for p in payloads if p["severity"] == severity)
        for severity in risk_service.SEVERITIES
    }

    return {
        "title": f"Security Assessment Report - {assessment.name}",
        "generated_at": datetime.now(),
        "assessment": serializers.assessment_payload(assessment, len(findings)),
        "executive_summary": _executive_summary(
            assessment, payloads, open_payloads, overall, evidence_completion, control_coverage
        ),
        "risk_summary": risk_summary,
        "overall_risk_score": overall,
        "overall_risk_level": risk_service.risk_level(
            round(overall / 100 * risk_service.MAX_RISK_SCORE)
        )
        if overall
        else "None",
        "evidence_completion_percent": evidence_completion,
        "control_coverage_percent": control_coverage,
        "findings": rows,
        "priority_findings": priority_rows,
        "controls": [
            {
                "id": payload["id"],
                "name": payload["name"],
                "category": payload["category"],
                "status": payload["status"],
                "linked_finding_count": len(payload["linked_finding_ids"]),
                "evidence_count": payload["evidence_count"],
                "coverage_percent": payload["coverage_percent"],
            }
            for payload in control_payloads
        ],
        "confirmed_evidence": _confirmed_evidence(verified_evidence),
        "analyst_assessment": _analyst_assessment(payloads),
        "missing_information": _missing_information(payloads, by_id, evidence_items, controls),
        "recommended_next_steps": _next_steps(payloads, by_id),
        "limitations": _limitations(),
    }


def _finding_row(payload: dict, finding: models.Finding) -> dict:
    return {
        "id": payload["id"],
        "title": payload["title"],
        "category": payload["category"],
        "severity": payload["severity"],
        "likelihood": payload["likelihood"],
        "impact": payload["impact"],
        "risk_score": payload["risk_score"],
        "status": payload["status"],
        "owner": payload["owner"],
        "affected_asset": payload["affected_asset"],
        "due_date": payload["due_date"],
        "evidence_count": len(finding.evidence),
        "verified_evidence_count": payload["verified_evidence_count"],
        "recommended_action": payload["recommended_action"],
    }


def _executive_summary(
    assessment: models.Assessment,
    payloads: list[dict],
    open_payloads: list[dict],
    overall: int,
    evidence_completion: int,
    control_coverage: int,
) -> list[str]:
    if not payloads:
        return [
            f"No findings have been recorded for {assessment.name} yet, so this report "
            "contains no risk assessment. Scope and assumptions are reproduced below for reference.",
        ]

    critical = sum(1 for p in payloads if p["severity"] == "Critical")
    high = sum(1 for p in payloads if p["severity"] == "High")
    overdue = sum(1 for p in payloads if p["is_overdue"])
    top = payloads[0]

    lines = [
        f"This assessment recorded {len(payloads)} finding(s), of which {len(open_payloads)} "
        f"remain Open or In Review. {critical} are rated Critical and {high} are rated High.",
        f"The aggregate risk indicator for outstanding findings is {overall} out of 100, "
        f"derived from the mean of likelihood x impact across findings that are not yet resolved.",
        f"The highest scoring outstanding item is {top['id']} ({top['risk_score']}/25): {top['title']}.",
        f"Evidence completion is {evidence_completion}%, meaning that share of findings has at "
        "least one item of verified supporting evidence. Average control coverage across the "
        f"illustrative framework is {control_coverage}%.",
    ]
    if overdue:
        lines.append(
            f"{overdue} finding(s) are past their recorded due date and have not been "
            "marked Remediated or Closed."
        )
    return lines


def _confirmed_evidence(verified: list[models.Evidence]) -> list[str]:
    if not verified:
        return [
            "No evidence item has been marked Verified, so nothing in this report is "
            "supported by confirmed evidence."
        ]
    lines = [
        f"{len(verified)} evidence item(s) are marked Verified and were confirmed against "
        "their recorded source:"
    ]
    lines.extend(
        f"{item.id} - {item.name} ({item.evidence_type}); source: {item.source or 'not recorded'}"
        for item in sorted(verified, key=lambda item: item.id)
    )
    return lines


def _analyst_assessment(payloads: list[dict]) -> list[str]:
    lines = [
        "Severity, likelihood, and impact values are analyst judgements recorded during "
        "review. They are not measurements, and a different reviewer may reasonably rate "
        "the same finding differently.",
    ]
    mismatches = [p for p in payloads if not p["severity_matches_score"]]
    if mismatches:
        lines.append(
            "The recorded severity differs from the severity implied by likelihood x impact "
            "for the following finding(s), which should be reconciled before sign-off: "
            + ", ".join(
                f"{p['id']} (recorded {p['severity']}, score implies {p['derived_severity']})"
                for p in mismatches
            )
            + "."
        )
    else:
        lines.append(
            "Recorded severities are consistent with the severity implied by likelihood x "
            "impact for every finding in this assessment."
        )
    accepted = [p for p in payloads if p["status"] == "Accepted"]
    if accepted:
        lines.append(
            "Risk has been formally accepted for "
            + ", ".join(p["id"] for p in accepted)
            + ". Acceptance records a decision, not a reduction in the underlying exposure."
        )
    return lines


def _missing_information(
    payloads: list[dict],
    by_id: dict[str, models.Finding],
    evidence_items: list[models.Evidence],
    controls: list[models.Control],
) -> list[str]:
    lines: list[str] = []

    no_evidence = [p["id"] for p in payloads if not by_id[p["id"]].evidence]
    if no_evidence:
        lines.append(
            "No supporting evidence is linked to: " + ", ".join(no_evidence) + "."
        )

    unverified_only = [
        p["id"]
        for p in payloads
        if by_id[p["id"]].evidence and p["verified_evidence_count"] == 0
    ]
    if unverified_only:
        lines.append(
            "Evidence is linked but none of it is verified for: "
            + ", ".join(unverified_only)
            + ". Conclusions for these findings rest on unconfirmed material."
        )

    not_assessed = [control.id for control in controls if control.status == "Not Assessed"]
    if not_assessed:
        lines.append(
            "The following controls were not assessed in this period: "
            + ", ".join(not_assessed)
            + "."
        )

    unlinked_evidence = [item.id for item in evidence_items if not item.findings]
    if unlinked_evidence:
        lines.append(
            "Collected but not yet mapped to any finding: " + ", ".join(sorted(unlinked_evidence)) + "."
        )

    if not lines:
        lines.append(
            "No evidence gaps were identified: every finding has at least one verified "
            "evidence item and every control has been assessed."
        )
    return lines


def _next_steps(payloads: list[dict], by_id: dict[str, models.Finding]) -> list[str]:
    steps: list[str] = []
    priority = [
        p
        for p in payloads
        if p["severity"] in PRIORITY_SEVERITIES and p["status"] in risk_service.OPEN_STATUSES
    ]
    for payload in priority[:5]:
        action = payload["recommended_action"].strip() or "No remediation action has been recorded."
        owner = payload["owner"] or "unassigned"
        steps.append(f"{payload['id']} ({owner}): {action}")

    gaps = [p["id"] for p in payloads if p["verified_evidence_count"] == 0]
    if gaps:
        steps.append(
            "Collect and verify supporting evidence for "
            + ", ".join(gaps)
            + " so their severity ratings can be substantiated."
        )
    overdue = [p["id"] for p in payloads if p["is_overdue"]]
    if overdue:
        steps.append(
            "Re-agree due dates with the assigned owners for overdue findings: "
            + ", ".join(overdue)
            + "."
        )
    if not steps:
        steps.append(
            "No Critical or High findings are outstanding. Continue routine review at the "
            "next scheduled assessment."
        )
    return steps


def _limitations() -> list[str]:
    return [
        "AegisLens is an educational workbench. This report is generated from the synthetic "
        "sample dataset shipped with the project and does not describe any real environment.",
        "The assessment is based on submitted evidence, configuration exports, and interview "
        "notes. No live system testing, exploitation, or external scanning was performed, and "
        "no finding in this report should be read as confirming that a weakness was exploited.",
        "Absence of a finding is not assurance. Areas outside the recorded scope were not "
        "examined, and controls marked Not Assessed carry no conclusion either way.",
        "Risk scores use a simple likelihood x impact model on a 1-5 scale. It is transparent "
        "but coarse, and it does not account for compensating controls, threat intelligence, or "
        "asset-specific business context beyond the reviewer's judgement.",
        "This report is not a substitute for a professional security audit, a penetration test, "
        "or a formal compliance certification.",
    ]


def render_markdown(report: dict) -> str:
    """Render the structured report as Markdown."""
    assessment = report["assessment"]
    generated = report["generated_at"]
    generated_text = (
        generated.strftime("%Y-%m-%d %H:%M") if isinstance(generated, datetime) else str(generated)
    )

    out: list[str] = [
        f"# {report['title']}",
        "",
        f"**Generated:** {generated_text}  ",
        f"**Assessment period:** {assessment['period'] or 'not recorded'}  ",
        f"**Assessment owner:** {assessment['owner'] or 'not recorded'}  ",
        "**Produced with:** AegisLens - Security Evidence & Risk Intelligence Workbench",
        "",
        "> This report is generated from synthetic sample data for educational use. It is not "
        "a professional security audit.",
        "",
        "## 1. Assessment overview",
        "",
        f"| Measure | Value |",
        "| --- | --- |",
        f"| Findings recorded | {len(report['findings'])} |",
        f"| Critical / High | {report['risk_summary'].get('Critical', 0)} / {report['risk_summary'].get('High', 0)} |",
        f"| Aggregate risk indicator | {report['overall_risk_score']}/100 ({report['overall_risk_level']}) |",
        f"| Evidence completion | {report['evidence_completion_percent']}% |",
        f"| Average control coverage | {report['control_coverage_percent']}% |",
        "",
        "## 2. Scope and assumptions",
        "",
        "**Scope**",
        "",
        assessment["scope"] or "No scope has been recorded for this assessment.",
        "",
        "**Assumptions**",
        "",
        assessment["assumptions"] or "No assumptions have been recorded for this assessment.",
        "",
        "## 3. Executive summary",
        "",
    ]
    out.extend(f"- {line}" for line in report["executive_summary"])

    out += ["", "## 4. Risk summary", "", "| Severity | Findings |", "| --- | --- |"]
    out.extend(
        f"| {severity} | {count} |" for severity, count in report["risk_summary"].items()
    )
    out += [
        "",
        "Risk score is `likelihood x impact`, each rated 1-5, giving a range of 1-25. "
        "Bands: 20-25 Critical, 12-19 High, 6-11 Medium, 3-5 Low, 1-2 Informational.",
        "",
        "## 5. Findings",
        "",
    ]

    if report["findings"]:
        out += [
            "| ID | Title | Category | Severity | L x I | Score | Status | Owner | Due |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        out.extend(
            "| {id} | {title} | {category} | {severity} | {likelihood} x {impact} | {risk_score} | "
            "{status} | {owner} | {due} |".format(
                due=row["due_date"] or "-", **{k: v for k, v in row.items() if k != "due_date"}
            )
            for row in report["findings"]
        )
    else:
        out.append("No findings have been recorded for this assessment.")

    out += ["", "## 6. Critical and high-risk findings", ""]
    if report["priority_findings"]:
        for row in report["priority_findings"]:
            out += [
                f"### {row['id']} - {row['title']}",
                "",
                f"- **Severity:** {row['severity']} (likelihood {row['likelihood']} x impact "
                f"{row['impact']} = {row['risk_score']}/25)",
                f"- **Status:** {row['status']}",
                f"- **Affected asset:** {row['affected_asset'] or 'not recorded'}",
                f"- **Owner:** {row['owner'] or 'unassigned'}",
                f"- **Due date:** {row['due_date'] or 'not set'}",
                f"- **Supporting evidence:** {row['evidence_count']} item(s), "
                f"{row['verified_evidence_count']} verified",
                "",
                "**Recommended action (analyst recommendation, not a statement of fact)**",
                "",
                row["recommended_action"] or "No remediation action has been recorded.",
                "",
            ]
    else:
        out += ["No Critical or High severity findings were recorded.", ""]

    out += ["## 7. Confirmed evidence", ""]
    out.extend(f"- {line}" for line in report["confirmed_evidence"])

    out += ["", "## 8. Analyst assessment", ""]
    out.extend(f"- {line}" for line in report["analyst_assessment"])

    out += ["", "## 9. Control coverage", "", "*Illustrative sample framework - not a real "
            "compliance standard.*", "",
            "| Control | Name | Category | Status | Findings | Evidence | Coverage |",
            "| --- | --- | --- | --- | --- | --- | --- |"]
    out.extend(
        f"| {row['id']} | {row['name']} | {row['category']} | {row['status']} | "
        f"{row['linked_finding_count']} | {row['evidence_count']} | {row['coverage_percent']}% |"
        for row in report["controls"]
    )

    out += ["", "## 10. Missing information", ""]
    out.extend(f"- {line}" for line in report["missing_information"])

    out += ["", "## 11. Recommended next steps", ""]
    out.extend(f"{index}. {line}" for index, line in enumerate(report["recommended_next_steps"], 1))

    out += ["", "## 12. Limitations", ""]
    out.extend(f"- {line}" for line in report["limitations"])

    out += ["", "---", "", f"Generated by AegisLens on {generated_text}.", ""]
    return "\n".join(out)
