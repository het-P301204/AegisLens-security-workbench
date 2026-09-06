# Security considerations

AegisLens is a defensive tool that handles security findings, so it should behave
like one. This document records what it does, what it deliberately does not do, and
what you would have to add before running it anywhere but a local machine.

## Threat model in one paragraph

AegisLens is designed as a **single-user, locally run workbench** holding synthetic
or internal assessment notes. It has no authentication, no multi-tenancy, and no
network egress. The realistic risks are therefore local: malformed input corrupting
records, a report that overstates what the evidence shows, or someone deploying it
to a shared network as-is. The controls below address the first two; the third is
addressed by saying plainly that you should not do it.

## What is implemented

### Input validation

- Every request body is validated by Pydantic before it reaches the database.
- Severities, statuses, evidence types, verification statuses, and control statuses
  are constrained to fixed vocabularies (`Literal` types), so an unexpected value is
  a 422 rather than a stored surprise.
- Likelihood and impact are bounded to 1–5. `risk_service.calculate_risk_score`
  re-checks the bounds independently, so the rule holds even if a caller reaches the
  service directly.
- Free-text fields have maximum lengths; required text fields reject whitespace-only
  input.
- Cross-references are resolved before use: linking a finding to `E-404` returns a
  422 naming the unknown id rather than silently dropping it.

### Safe database access

- All queries go through SQLAlchemy's expression language with bound parameters.
  There is no string-concatenated SQL anywhere in the project, including the search
  filters, which pass user text as a bound `ILIKE` parameter.
- Path parameters are used for primary-key lookups only, never interpolated into SQL.

### Safe error handling

- A validation failure returns field-level messages (`{"field": "likelihood",
  "message": "..."}`) and nothing else. Stack traces, SQL, and file paths are not
  returned to the client.
- The health endpoint catches database errors, logs them server-side, and reports
  `"database": "unavailable"` rather than surfacing the exception.
- 404 responses name the missing id, which is not sensitive in a single-user tool.

### Response headers

`SecurityHeadersMiddleware` in `main.py` sets:

| Header | Value | Purpose |
| ------ | ----- | ------- |
| `X-Content-Type-Options` | `nosniff` | Stops content-type sniffing |
| `X-Frame-Options` | `DENY` | Blocks framing / clickjacking |
| `Referrer-Policy` | `no-referrer` | No referrer leakage |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the browsing context |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Denies device APIs |

CORS is restricted to the local Vite dev origins by default, does not allow
credentials, and lists explicit methods and headers.

### Report rendering

The printable report view (`/api/reports/print`) builds its HTML in
`services/print_report.py`, and every value taken from the database passes through
`html.escape` before insertion. A finding titled `<script>alert(1)</script>` renders
as visible text, and a regression test asserts exactly that. The document is
self-contained: inline styles, no external fonts, scripts, or trackers.

### Static file serving

When the API serves the built frontend, the single-page-app fallback resolves the
requested path and confirms it stays inside the bundle directory before returning a
file, so `../` traversal falls through to the SPA shell instead of reading outside it.

### Identifier integrity

Findings and evidence never reuse an identifier from a deleted record. Reuse would
attach one record's activity history to a different record — a correctness problem
in any tool whose purpose is evidence handling.

### Secrets and data hygiene

- No credentials, tokens, or API keys exist in the codebase; there is nothing to
  authenticate to.
- Configuration is read from environment variables with working defaults, documented
  in `.env.example`. `.env` is gitignored.
- The sample dataset is synthetic. `scripts/validate_sample_data.py` runs in CI and
  fails the build if it detects anything resembling a private IP address, an email
  address, an AWS key id, a private key block, or a credential assignment.
- Dependencies are pinned to exact versions in `backend/requirements.txt` and
  `frontend/package.json`.

### Container hardening

The Docker image runs as an unprivileged user (uid 10001), and `docker-compose.yml`
sets `read_only: true` with `no-new-privileges`, giving the container write access
only to the `/data` volume holding the SQLite file.

## What is deliberately not implemented

| Not implemented | Why |
| --------------- | --- |
| Authentication and authorisation | Single-user local tool. Adding a half-built login would be worse than none |
| File upload | Evidence is metadata only. Not accepting files removes the entire class of upload, storage, and execution risk |
| Rate limiting | No public exposure and no expensive endpoints |
| Audit log tamper protection | Activity is append-only in the application, but anyone with the SQLite file can edit it |
| Encryption at rest | Rely on the host's disk encryption |
| CSRF tokens | No cookies and no session; the API is not authenticated |
| Content Security Policy | The bundle is self-hosted with no third-party scripts; a CSP would be the first addition for a hosted deployment |

## Before deploying this anywhere shared

AegisLens is not built for shared or internet-facing use. If you intend to change
that, at minimum you would need to:

1. Add authentication and per-user authorisation, and scope every query to the
   authenticated user.
2. Add CSRF protection and a Content Security Policy.
3. Move from SQLite to a database server with proper backups and access control.
4. Add rate limiting and structured request logging.
5. Terminate TLS in front of the application.
6. Re-run a security review; the notes above cover the current design only.

## Offensive functionality

There is none, and none is planned. AegisLens does not scan, probe, exploit, execute
uploaded content, run shell commands, or reach any network service. It records what a
human analyst observed and helps organise it.

## Reporting a problem

See [SECURITY.md](../SECURITY.md) in the repository root.
