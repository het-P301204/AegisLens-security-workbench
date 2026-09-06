# Limitations

An honest statement of what AegisLens is not, so nobody has to discover it the hard
way.

> AegisLens is an educational and defensive security assessment workbench using
> synthetic data. It is not a replacement for a SIEM, GRC platform, vulnerability
> scanner, or professional security audit.

## It does not detect anything

AegisLens has no sensors. It does not scan hosts, read live logs, watch traffic,
query cloud APIs, or ingest alerts. Every record in it was typed in or imported by a
person. If a weakness is not recorded, AegisLens has no way to know about it, and an
empty finding list means nobody has looked — not that nothing is wrong.

## The control framework is illustrative

The twelve controls shipped with the project were written for this codebase. They
are **not** ISO/IEC 27001, SOC 2, NIST CSF, CIS Controls, PCI DSS, or any other
published standard, and control coverage in AegisLens is not evidence of compliance
with any of them. Mapping to a real framework means replacing `sample-data/controls.json`
with that framework's control set and accepting responsibility for the mapping.

## The risk model is coarse

`likelihood × impact` on a 1–5 scale is transparent and easy to defend, which is why
it was chosen. It is also blunt. It ignores exploit availability, attacker
capability, compensating controls beyond the analyst's rating, asset value, attack
chains that combine several findings, and the passage of time. Two findings scoring
16 are not necessarily equally urgent. See [risk-model.md](risk-model.md) for the
full statement of what the model does and does not consider.

Ratings are analyst judgements. Different reviewers will produce different numbers
for the same finding, and AegisLens makes no attempt to hide that — it surfaces
disagreement between a recorded severity and the one its score implies rather than
quietly correcting either.

## Evidence is metadata, not custody

AegisLens records what an evidence item is, where it came from, and what it supports.
It does not store the file, hash it, timestamp it, or prove it has not been altered.
"Verified" means a human ticked a box after checking the item against its source; it
carries no cryptographic weight. This is not a chain-of-custody system and should not
be used as one in a legal or forensic context.

## Reports are drafts

The generated report is assembled from the records in the database. It clearly
separates confirmed evidence, analyst assessment, recommendations, and missing
information, and it never asserts that a weakness was exploited. But it is only as
good as what was entered, and it has not been reviewed by anyone. Read it, edit it,
and take responsibility for it before it leaves your hands.

## Single user, no access control

There is no login, no roles, and no per-user data separation. Everyone with access to
the application has full read and write access to everything, and the activity log
records `workbench` as the actor for changes made through the UI rather than a real
identity. Deploying this to a shared network without adding authentication would
expose all assessment data to anyone who can reach the port.

## Scale

SQLite and the current query patterns are comfortable with hundreds of findings and
thousands of evidence items — far beyond what this tool is for. The dashboard and
report endpoints load the relevant records into memory rather than aggregating in
SQL, so at tens of thousands of records you would want to push that work into the
database. There is no pagination on the list endpoints for the same reason.

## Data durability

The database is a single SQLite file with no automatic backup, no migration system,
and no schema versioning. Changing the models means recreating the database, and
`python -m app.seed --force` deletes existing rows before reloading the sample data.
Copy the `.db` file before experimenting with anything you want to keep.

## Browser support

Built and tested against current Chromium, Firefox, and Safari. It uses
`Intl.RelativeTimeFormat`, the Clipboard API, and modern CSS; it has not been tested
against Internet Explorer or browsers more than a couple of years old.

## Accessibility

Reasonable care has been taken — semantic markup, labelled form controls, visible
keyboard focus, `aria` attributes on interactive elements, and colour never used as
the only signal (severity and status always carry text). It has **not** been audited
against WCAG, and modal focus trapping is not implemented.

## Internationalisation

The interface is English only. Dates and relative times follow the browser locale;
nothing else does.

## What to reach for instead

| If you need | Use |
| ----------- | --- |
| Live detection and alerting | A SIEM (Wazuh, Elastic Security, Splunk) |
| Automated vulnerability discovery | A scanner (OpenVAS, Nessus, Trivy, Semgrep) |
| Formal compliance evidence collection | A GRC platform (Vanta, Drata, Eramba) |
| Standardised technical severity scoring | CVSS |
| Quantified financial risk | The FAIR model |
| An assurance opinion | A qualified auditor or penetration testing firm |
