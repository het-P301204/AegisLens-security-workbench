"""Render the assessment report as a self-contained, printable HTML document.

The browser's own print-to-PDF turns this into a clean document, which is why
the project carries no PDF library.

Every value taken from the database passes through ``html.escape`` before it is
inserted, so a finding title containing markup is rendered as text.
"""

from __future__ import annotations

from datetime import datetime
from html import escape

STYLES = """
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 36px 30px 64px; max-width: 960px;
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #16181d; background: #fff; line-height: 1.6; font-size: 13.5px;
  }
  h1 { font-size: 23px; margin: 0 0 8px; letter-spacing: -0.3px; }
  h2 {
    font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.8px; color: #3c5c8a;
    margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #dfe3e8;
  }
  h3 { font-size: 14px; margin: 0 0 6px; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; font-size: 12.5px; }
  th {
    text-align: left; padding: 6px 8px; border-bottom: 1.5px solid #c9ced6;
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #5b616c;
  }
  td { padding: 6px 8px; border-bottom: 1px solid #eceef1; vertical-align: top; }
  .meta { color: #5b616c; font-size: 12.5px; margin-bottom: 14px; }
  .meta strong { color: #16181d; }
  .disclaimer {
    border-left: 3px solid #3c5c8a; background: #f5f7fa; color: #434852;
    padding: 10px 14px; margin: 16px 0 4px; font-size: 12.5px;
  }
  .note { color: #5b616c; font-size: 11.5px; margin: -2px 0 8px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
  .sev {
    display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 10.5px;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid;
    white-space: nowrap;
  }
  .sev-critical { color: #a3202c; border-color: #e8a4aa; background: #fdeef0; }
  .sev-high { color: #94540d; border-color: #f0c692; background: #fdf3e8; }
  .sev-medium { color: #7d6412; border-color: #e6d492; background: #fbf6e6; }
  .sev-low { color: #1d5b7d; border-color: #a8cfe2; background: #ecf5fa; }
  .sev-informational { color: #5b616c; border-color: #d3d7dd; background: #f4f5f7; }
  .finding {
    border: 1px solid #dfe3e8; border-radius: 6px; padding: 14px 16px; margin-bottom: 12px;
  }
  .finding dl {
    display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px;
    margin: 8px 0 10px; font-size: 12.5px;
  }
  .finding dt { color: #5b616c; }
  .finding dd { margin: 0; }
  .rec { border-top: 1px solid #eceef1; padding-top: 8px; }
  footer {
    margin-top: 34px; padding-top: 12px; border-top: 1px solid #dfe3e8;
    color: #5b616c; font-size: 11.5px;
  }
  .toolbar {
    display: flex; gap: 12px; align-items: center; margin-bottom: 26px;
    padding-bottom: 14px; border-bottom: 1px solid #dfe3e8;
  }
  .toolbar button {
    font: inherit; padding: 7px 14px; border: 1px solid #c9ced6; border-radius: 6px;
    background: #f6f7f9; cursor: pointer;
  }
  .toolbar button:hover { background: #eceef1; }
  .toolbar span { color: #5b616c; font-size: 12px; }
  @media print {
    .toolbar { display: none; }
    body { padding: 0; max-width: none; font-size: 11.5px; }
    h2 { break-after: avoid; }
    .finding, tr { break-inside: avoid; }
  }
"""


def _severity_pill(severity: str) -> str:
    slug = severity.lower().replace(" ", "-")
    return f'<span class="sev sev-{escape(slug)}">{escape(severity)}</span>'


def _bullets(items: list[str], ordered: bool = False) -> str:
    tag = "ol" if ordered else "ul"
    entries = "".join(f"<li>{escape(item)}</li>" for item in items)
    return f"<{tag}>{entries}</{tag}>"


def _date_text(value: object, fallback: str = "-") -> str:
    return escape(str(value)) if value else fallback


def render_print_html(report: dict) -> str:
    """Build the full printable document for one report payload."""
    assessment = report["assessment"]
    generated = report["generated_at"]
    generated_text = (
        generated.strftime("%Y-%m-%d %H:%M") if isinstance(generated, datetime) else str(generated)
    )

    parts: list[str] = [
        '<div class="toolbar">',
        '<button type="button" onclick="window.print()">Print or save as PDF</button>',
        "<span>Use your browser print dialog and choose &ldquo;Save as PDF&rdquo;.</span>",
        "</div>",
        f"<h1>{escape(report['title'])}</h1>",
        '<p class="meta">',
        f"<strong>Generated:</strong> {escape(generated_text)}<br />",
        f"<strong>Assessment period:</strong> {escape(assessment['period'] or 'not recorded')}<br />",
        f"<strong>Assessment owner:</strong> {escape(assessment['owner'] or 'not recorded')}<br />",
        "<strong>Produced with:</strong> AegisLens &ndash; Security Evidence &amp; Risk "
        "Intelligence Workbench",
        "</p>",
        '<p class="disclaimer">This report is generated from synthetic sample data for '
        "educational use. It is not a professional security audit.</p>",
    ]

    parts += _overview_section(report)
    parts += _scope_section(assessment)
    parts += ["<h2>3. Executive summary</h2>", _bullets(report["executive_summary"])]
    parts += _risk_summary_section(report)
    parts += _findings_section(report)
    parts += _priority_section(report)
    parts += [
        "<h2>7. Confirmed evidence</h2>",
        '<p class="note">What verified evidence actually shows.</p>',
        _bullets(report["confirmed_evidence"]),
        "<h2>8. Analyst assessment</h2>",
        '<p class="note">Judgement calls made during review, stated as such.</p>',
        _bullets(report["analyst_assessment"]),
    ]
    parts += _controls_section(report)
    parts += [
        "<h2>10. Missing information</h2>",
        '<p class="note">What could not be established from the evidence supplied.</p>',
        _bullets(report["missing_information"]),
        "<h2>11. Recommended next steps</h2>",
        _bullets(report["recommended_next_steps"], ordered=True),
        "<h2>12. Limitations</h2>",
        _bullets(report["limitations"]),
        f"<footer>Generated by AegisLens on {escape(generated_text)}.</footer>",
    ]

    body = "\n".join(parts)
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n<head>\n<meta charset="utf-8" />\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        f"<title>{escape(report['title'])}</title>\n"
        f"<style>{STYLES}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    )


def _overview_section(report: dict) -> list[str]:
    rows = [
        ("Findings recorded", str(len(report["findings"]))),
        (
            "Critical / High",
            f"{report['risk_summary'].get('Critical', 0)} / {report['risk_summary'].get('High', 0)}",
        ),
        (
            "Aggregate risk indicator",
            f"{report['overall_risk_score']}/100 ({report['overall_risk_level']})",
        ),
        ("Evidence completion", f"{report['evidence_completion_percent']}%"),
        ("Average control coverage", f"{report['control_coverage_percent']}%"),
    ]
    return [
        "<h2>1. Assessment overview</h2>",
        "<table><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>",
        *(f"<tr><td>{escape(label)}</td><td>{escape(value)}</td></tr>" for label, value in rows),
        "</tbody></table>",
    ]


def _scope_section(assessment: dict) -> list[str]:
    scope = assessment["scope"] or "No scope has been recorded for this assessment."
    assumptions = assessment["assumptions"] or "No assumptions have been recorded for this assessment."
    return [
        "<h2>2. Scope and assumptions</h2>",
        "<h3>Scope</h3>",
        f"<p>{escape(scope)}</p>",
        "<h3>Assumptions</h3>",
        f"<p>{escape(assumptions)}</p>",
    ]


def _risk_summary_section(report: dict) -> list[str]:
    return [
        "<h2>4. Risk summary</h2>",
        "<table><thead><tr><th>Severity</th><th>Findings</th></tr></thead><tbody>",
        *(
            f"<tr><td>{_severity_pill(severity)}</td><td>{count}</td></tr>"
            for severity, count in report["risk_summary"].items()
        ),
        "</tbody></table>",
        '<p class="note">Risk score is likelihood &times; impact, each rated 1&ndash;5, giving a '
        "range of 1&ndash;25. Bands: 20&ndash;25 Critical, 12&ndash;19 High, 6&ndash;11 Medium, "
        "3&ndash;5 Low, 1&ndash;2 Informational.</p>",
    ]


def _findings_section(report: dict) -> list[str]:
    if not report["findings"]:
        return [
            "<h2>5. Findings</h2>",
            "<p>No findings have been recorded for this assessment.</p>",
        ]
    return [
        "<h2>5. Findings</h2>",
        "<table><thead><tr><th>ID</th><th>Title</th><th>Category</th><th>Severity</th>"
        "<th>L &times; I</th><th>Score</th><th>Status</th><th>Owner</th><th>Due</th>"
        "</tr></thead><tbody>",
        *(
            "<tr>"
            f'<td class="mono">{escape(row["id"])}</td>'
            f"<td>{escape(row['title'])}</td>"
            f"<td>{escape(row['category'])}</td>"
            f"<td>{_severity_pill(row['severity'])}</td>"
            f'<td class="mono">{row["likelihood"]} &times; {row["impact"]}</td>'
            f'<td class="mono">{row["risk_score"]}</td>'
            f"<td>{escape(row['status'])}</td>"
            f"<td>{escape(row['owner'] or '-')}</td>"
            f"<td>{_date_text(row['due_date'])}</td>"
            "</tr>"
            for row in report["findings"]
        ),
        "</tbody></table>",
    ]


def _priority_section(report: dict) -> list[str]:
    parts = ["<h2>6. Critical and high-risk findings</h2>"]
    if not report["priority_findings"]:
        parts.append("<p>No Critical or High severity findings were recorded.</p>")
        return parts

    for row in report["priority_findings"]:
        details = [
            (
                "Severity",
                f"{escape(row['severity'])} (likelihood {row['likelihood']} &times; impact "
                f"{row['impact']} = {row['risk_score']}/25)",
            ),
            ("Status", escape(row["status"])),
            ("Affected asset", escape(row["affected_asset"] or "not recorded")),
            ("Owner", escape(row["owner"] or "unassigned")),
            ("Due date", _date_text(row["due_date"], "not set")),
            (
                "Supporting evidence",
                f"{row['evidence_count']} item(s), {row['verified_evidence_count']} verified",
            ),
        ]
        action = row["recommended_action"] or "No remediation action has been recorded."
        parts += [
            '<div class="finding">',
            f'<h3><span class="mono">{escape(row["id"])}</span> &ndash; {escape(row["title"])}</h3>',
            "<dl>",
            *(f"<dt>{label}</dt><dd>{value}</dd>" for label, value in details),
            "</dl>",
            '<div class="rec">',
            '<p class="note">Recommended action &ndash; an analyst recommendation, not a '
            "statement of fact.</p>",
            f"<p>{escape(action)}</p>",
            "</div>",
            "</div>",
        ]
    return parts


def _controls_section(report: dict) -> list[str]:
    return [
        "<h2>9. Control coverage</h2>",
        '<p class="note">Illustrative sample framework &ndash; not a real compliance standard.</p>',
        "<table><thead><tr><th>Control</th><th>Name</th><th>Category</th><th>Status</th>"
        "<th>Findings</th><th>Evidence</th><th>Coverage</th></tr></thead><tbody>",
        *(
            "<tr>"
            f'<td class="mono">{escape(row["id"])}</td>'
            f"<td>{escape(row['name'])}</td>"
            f"<td>{escape(row['category'])}</td>"
            f"<td>{escape(row['status'])}</td>"
            f'<td class="mono">{row["linked_finding_count"]}</td>'
            f'<td class="mono">{row["evidence_count"]}</td>'
            f'<td class="mono">{row["coverage_percent"]}%</td>'
            "</tr>"
            for row in report["controls"]
        ),
        "</tbody></table>",
    ]
