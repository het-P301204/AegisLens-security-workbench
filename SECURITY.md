# Security policy

## Scope of this project

AegisLens is an educational, defensive security assessment workbench. It ships with
synthetic sample data, runs locally, has no authentication, and makes no outbound
network connections. It is **not** intended for shared or internet-facing deployment
in its current form — see [`docs/security.md`](docs/security.md) for the design
decisions behind that and what would need to change first.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x | Yes |
| < 1.0 | No |

Fixes are applied to the latest release only.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub's [private vulnerability
reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository (*Security* → *Report a vulnerability*). If that is unavailable,
open a public issue containing only a request for a private contact channel, with no
technical detail.

Helpful reports include:

- what the issue is and which component it affects
- the steps to reproduce it, ideally against a fresh checkout
- what an attacker could achieve, and what access they would need first
- the version, Python version, and how you were running it (local or Docker)

Please do not include real credentials, real customer data, or details of any live
third-party system in a report.

### What to expect

This is a personal educational project maintained in spare time, so no service-level
commitment is offered. In practice:

- acknowledgement within about 7 days
- an initial assessment, with a severity rating and a rough plan, within about 30 days
- a fix released and the advisory published once it is available

You will be credited in the advisory unless you prefer otherwise.

### Coordinated disclosure

Please allow a reasonable period to ship a fix before publishing details. If a report
stalls without explanation for more than 90 days, publishing is entirely reasonable.

## Out of scope

The following are known, documented design decisions rather than vulnerabilities:

- **No authentication or authorisation.** AegisLens is a single-user local tool.
- **No CSRF tokens.** There are no cookies and no session to forge a request against.
- **No rate limiting.** There is no public exposure and no expensive endpoint.
- **The SQLite file is readable and writable by the local user.** That is what a local
  file is. Use disk encryption if the contents warrant it.
- **The activity log can be edited by anyone with the database file.** It is
  append-only within the application, not tamper-proof.
- **Findings, evidence text, and reports are attacker-controlled by design** in the
  sense that a user types them. Output is escaped before rendering; a report that
  merely *contains* alarming text is not a vulnerability.
- **Issues that require an already-compromised host** or physical access to the
  machine running AegisLens.
- **Missing hardening headers on a deployment you configured yourself** behind your
  own proxy.

Reports that consist only of automated scanner output, with no demonstrated impact,
will be closed.

## In scope

Genuinely valuable reports include:

- SQL injection, or any way to reach the database outside the ORM's bound parameters
- stored or reflected cross-site scripting, particularly in the report print view
- path traversal in the static file serving used by single-container mode
- a way to make the API execute a shell command, load arbitrary code, or read files
  outside the project directory
- validation bypasses that let invalid data reach the database — for example a
  likelihood or impact outside 1–5, or a severity outside the fixed vocabulary
- a way to make the report generator assert something the evidence does not support,
  such as claiming a weakness was exploited
- dependency vulnerabilities that are actually reachable from AegisLens code
- container escape or privilege escalation from the supplied Docker configuration

## Security practices in this project

- All input validated by Pydantic against fixed vocabularies and bounded ranges
- All database access through SQLAlchemy with bound parameters; no string-built SQL
- Field-level error messages that do not expose stack traces, SQL, or file paths
- Conservative response headers and a restricted CORS configuration
- Report text escaped and rendered via `textContent`, never as HTML
- No secrets in the repository; configuration through environment variables
- Synthetic sample data, checked in CI for anything resembling sensitive content
- Exact dependency pins, and CI covering tests, build, data validation, and image build
- No offensive functionality: no scanning, probing, exploitation, or command execution

## A note on the subject matter

AegisLens is a tool for organising *defensive* security work. Please do not file
issues or pull requests that add scanning, exploitation, attack simulation, or
detection-evasion capabilities. They are out of scope, and they will be closed.
