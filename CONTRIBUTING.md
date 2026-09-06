# Contributing to AegisLens

Thanks for taking an interest. AegisLens is a small, deliberately finishable project,
and the most useful contributions are the ones that keep it that way.

## Scope

AegisLens is a **defensive** workbench for organising security evidence, findings,
risk ratings, and reports. It is small on purpose.

**In scope:** better evidence handling, clearer reporting, import and export, control
framework mappings, accessibility, tests, documentation, and UI polish.

**Out of scope** — these will be closed, so please raise an issue before investing
time if you are unsure:

- vulnerability scanning, network probing, or live monitoring
- exploitation, attack simulation, or anything offensive
- automatic remediation or remote command execution
- microservices, message brokers, caches, or a second datastore
- multi-tenancy, or a full enterprise GRC feature set
- machine-learning risk scoring — the transparent formula is a feature, not a gap

## Getting set up

```bash
git clone <your-fork-url>
cd aegislens
```

Backend:

```bash
cd backend
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows:     .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

## Before you open a pull request

```bash
# Backend tests
cd backend && pytest

# Frontend types and build
cd frontend && npm run typecheck && npm run build

# Sample data integrity
python scripts/validate_sample_data.py
```

All four must pass. CI runs the same checks on Python 3.11, 3.12, and 3.13, plus a
Docker image build and health check.

## Conventions

### Python

- Target 3.11+. Use modern typing (`str | None`, `list[str]`), not `Optional`/`List`.
- Line length 100.
- Public functions get a docstring saying what they do and why, not restating the
  signature.
- Routers stay thin. Anything that computes, derives, or formats belongs in
  `app/services/`.
- Never trust a client-supplied derived value. Risk scores, coverage, and counts are
  calculated server-side, every time.
- Every mutation writes an `Activity` row in the same transaction as the change.

### TypeScript / React

- `strict` mode; no `any`, and no `@ts-ignore` without a comment explaining it.
- Function components with hooks. Keep component files focused.
- `src/types.ts` mirrors `backend/app/schemas.py` — change both together.
- Fetch through `services/api.ts` so errors arrive as `ApiError` with field problems.
- Every panel that loads data needs a loading state, an error state with retry, and a
  meaningful empty state. `components/States.tsx` has all three.
- Tailwind utilities in the markup; shared patterns go in the `@layer components`
  block in `src/index.css`.
- Colour is never the only signal. Severity and status always carry text too.

### Adding a field

A new field on findings or evidence touches, in order:

1. `backend/app/models.py` — the column
2. `backend/app/schemas.py` — input validation and output shape
3. `backend/app/services/serializers.py` — if the value is derived
4. `sample-data/*.json` and `backend/app/seed.py` — sample content
5. `scripts/validate_sample_data.py` — a rule for it, if one applies
6. `frontend/src/types.ts` — the type
7. The relevant form, table, and detail view
8. `backend/tests/` — a test for the new behaviour

There are no migrations. Changing a model means recreating the database:

```bash
cd backend
rm aegislens.db
python -m app.seed
```

### Tests

- Cover behaviour, not implementation. Assert on API responses.
- Add a failing test with every bug fix.
- Both the happy path and the rejection path for anything that validates input.
- Fixtures live in `tests/conftest.py`; use `client` for seeded data and
  `empty_client` for empty-database behaviour.

### Sample data

Synthetic only. No real organizations, credentials, keys, personal information, or
private IP addresses. Severity must agree with `likelihood × impact` — the validator
enforces this, and CI will fail if it does not.

## Commits and pull requests

Write commit subjects in the imperative mood, under about 70 characters:

```text
Add CSV export for the findings table
Fix control coverage when no evidence is verified
Document the aggregate risk indicator
```

A good pull request:

- does one thing
- says what changed and why in the description
- includes tests for behaviour changes
- updates the docs when it changes behaviour a user would notice
- includes a before/after screenshot for UI changes

## Reporting bugs

Include what you expected, what happened, how to reproduce it from a fresh checkout,
and your Python version, Node version, and OS. If it involves the sample data, say
whether you had modified it.

## Security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Code of conduct

Be straightforward and courteous. Critique the code, not the person. Assume the other
party is acting in good faith, and say what you mean plainly.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers this project.
