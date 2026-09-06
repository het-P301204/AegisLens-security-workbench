#!/usr/bin/env python3
"""Validate the synthetic sample dataset before it reaches the database.

Checks that every file parses, that ids are unique, that cross-references
resolve, that severities agree with likelihood x impact, and that the
vocabularies match the ones the API accepts. Run it after editing anything
under ``sample-data/``:

    python scripts/validate_sample_data.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "sample-data"

SEVERITIES = {"Critical", "High", "Medium", "Low", "Informational"}
STATUSES = {"Open", "In Review", "Accepted", "Remediated", "Closed"}
EVIDENCE_TYPES = {
    "Policy",
    "Screenshot",
    "Log",
    "Configuration",
    "Report",
    "Interview note",
    "Document",
    "Other",
}
VERIFICATION_STATUSES = {"Verified", "Pending", "Not Verified"}
CONTROL_STATUSES = {"Implemented", "Partially Implemented", "Not Implemented", "Not Assessed"}

#: Patterns that would mean real or sensitive data leaked into the sample set.
FORBIDDEN_PATTERNS = [
    (re.compile(r"\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b"), "private IP address"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "email address"),
    (re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"), "AWS access key id"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key block"),
    (re.compile(r"(?i)\b(password|passwd|secret|api[_-]?key)\s*[:=]\s*\S+"), "credential assignment"),
]

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def risk_level(score: int) -> str:
    if score >= 20:
        return "Critical"
    if score >= 12:
        return "High"
    if score >= 6:
        return "Medium"
    if score >= 3:
        return "Low"
    return "Informational"


def load(name: str) -> list[dict]:
    path = DATA / name
    if not path.exists():
        fail(f"{name}: file is missing")
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{name}: invalid JSON ({exc})")
        return []
    if not isinstance(data, list):
        fail(f"{name}: expected a JSON array")
        return []
    return data


def check_unique_ids(name: str, rows: list[dict]) -> set[str]:
    seen: set[str] = set()
    for row in rows:
        row_id = row.get("id")
        if not row_id:
            fail(f"{name}: a record has no id")
            continue
        if row_id in seen:
            fail(f"{name}: duplicate id {row_id}")
        seen.add(row_id)
    return seen


def check_iso_date(name: str, row_id: str, field: str, value: str | None) -> None:
    if value in (None, ""):
        return
    try:
        date.fromisoformat(value)
    except ValueError:
        fail(f"{name}/{row_id}: {field} is not an ISO date: {value!r}")


def check_for_sensitive_content() -> None:
    for path in sorted(DATA.glob("*.json")):
        text = path.read_text(encoding="utf-8")
        for pattern, label in FORBIDDEN_PATTERNS:
            match = pattern.search(text)
            if match:
                fail(f"{path.name}: contains what looks like a {label}: {match.group(0)!r}")


def main() -> int:
    assessments = load("assessments.json")
    assets = load("assets.json")
    controls = load("controls.json")
    findings = load("findings.json")
    evidence = load("evidence.json")
    activity = load("activity.json")

    assessment_ids = check_unique_ids("assessments.json", assessments)
    check_unique_ids("assets.json", assets)
    control_ids = check_unique_ids("controls.json", controls)
    finding_ids = check_unique_ids("findings.json", findings)
    evidence_ids = check_unique_ids("evidence.json", evidence)

    if sum(1 for row in assessments if row.get("is_active")) != 1:
        fail("assessments.json: exactly one assessment must be marked is_active")

    for control in controls:
        if control.get("status") not in CONTROL_STATUSES:
            fail(f"controls.json/{control.get('id')}: unknown status {control.get('status')!r}")

    for finding in findings:
        fid = finding.get("id", "?")

        if finding.get("assessment_id") not in assessment_ids:
            fail(f"findings.json/{fid}: unknown assessment_id {finding.get('assessment_id')!r}")
        if finding.get("severity") not in SEVERITIES:
            fail(f"findings.json/{fid}: unknown severity {finding.get('severity')!r}")
        if finding.get("status") not in STATUSES:
            fail(f"findings.json/{fid}: unknown status {finding.get('status')!r}")

        likelihood, impact = finding.get("likelihood"), finding.get("impact")
        if not (isinstance(likelihood, int) and 1 <= likelihood <= 5):
            fail(f"findings.json/{fid}: likelihood must be an integer 1-5, got {likelihood!r}")
        elif not (isinstance(impact, int) and 1 <= impact <= 5):
            fail(f"findings.json/{fid}: impact must be an integer 1-5, got {impact!r}")
        else:
            implied = risk_level(likelihood * impact)
            if finding.get("severity") != implied:
                fail(
                    f"findings.json/{fid}: severity {finding['severity']!r} disagrees with "
                    f"likelihood x impact = {likelihood * impact} which implies {implied!r}"
                )

        for control_id in finding.get("control_ids", []):
            if control_id not in control_ids:
                fail(f"findings.json/{fid}: unknown control_id {control_id!r}")

        check_iso_date("findings.json", fid, "due_date", finding.get("due_date"))
        check_iso_date("findings.json", fid, "created_at", finding.get("created_at"))

    for item in evidence:
        eid = item.get("id", "?")

        if item.get("evidence_type") not in EVIDENCE_TYPES:
            fail(f"evidence.json/{eid}: unknown evidence_type {item.get('evidence_type')!r}")
        if item.get("verification_status") not in VERIFICATION_STATUSES:
            fail(
                f"evidence.json/{eid}: unknown verification_status "
                f"{item.get('verification_status')!r}"
            )

        related = item.get("related_control_id")
        if related and related not in control_ids:
            fail(f"evidence.json/{eid}: unknown related_control_id {related!r}")

        for linked in item.get("linked_finding_ids", []):
            if linked not in finding_ids:
                fail(f"evidence.json/{eid}: unknown linked_finding_id {linked!r}")

        check_iso_date("evidence.json", eid, "upload_date", item.get("upload_date"))

    known_entities = {"finding": finding_ids, "evidence": evidence_ids, "control": control_ids}
    for index, entry in enumerate(activity):
        entity_type = entry.get("entity_type")
        if entity_type not in known_entities:
            fail(f"activity.json[{index}]: unknown entity_type {entity_type!r}")
            continue
        if entry.get("entity_id") not in known_entities[entity_type]:
            fail(f"activity.json[{index}]: unknown {entity_type} id {entry.get('entity_id')!r}")

    check_for_sensitive_content()

    print(
        f"Checked {len(assessments)} assessments, {len(assets)} assets, {len(controls)} controls, "
        f"{len(findings)} findings, {len(evidence)} evidence items, {len(activity)} activity records."
    )

    if errors:
        print(f"\n{len(errors)} problem(s) found:\n", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("Sample data is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
