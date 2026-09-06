# Risk model

Every number AegisLens shows can be reproduced by hand. This document defines each
one, and the code that implements it lives in
[`backend/app/services/risk_service.py`](../backend/app/services/risk_service.py).

## Risk score

```text
risk score = likelihood × impact
```

Likelihood and impact are each rated on a 1–5 scale, so the score runs from 1 to 25.

| Value | Likelihood | Impact |
| ----- | ---------- | ------ |
| 1 | Rare | Negligible |
| 2 | Unlikely | Minor |
| 3 | Possible | Moderate |
| 4 | Likely | Major |
| 5 | Almost certain | Severe |

The score is **never** supplied by the client. The API recalculates it on every
create and update, so a stored score can't drift away from its inputs.

### Worked example

```text
Likelihood: 4   (an unprotected administrator account is likely to be targeted)
Impact:     5   (that account can reach every connected internal system)

Risk score: 4 × 5 = 20
Risk level: Critical
```

## Risk bands

| Level | Score |
| ----- | ----- |
| Critical | 20–25 |
| High | 12–19 |
| Medium | 6–11 |
| Low | 3–5 |
| Informational | 1–2 |

## Severity vs derived severity

A finding stores a **recorded severity** chosen by the analyst, alongside its
likelihood and impact. AegisLens also computes a **derived severity** from the
score and compares the two.

They can legitimately differ. An analyst may down-rate an item because a
compensating control exists that the two numbers don't capture. AegisLens does not
overwrite the analyst's choice, but it does refuse to hide the disagreement:

- the finding detail page shows both, with an explanation
- the findings table annotates the row
- the generated report lists every mismatch under *Analyst assessment*

That is a deliberate design decision. A quiet auto-correction would make the
rating look more objective than it is.

## Aggregate risk indicator

```text
overall risk = mean(risk score of findings that are Open or In Review) ÷ 25 × 100
```

Reported as 0–100. Resolved, Closed, and Accepted findings are excluded, because the
indicator is meant to describe live exposure rather than historical volume. With no
outstanding findings the value is 0 — an honest reading, not a hidden default.

## Evidence completion

```text
evidence completion = findings with ≥ 1 Verified evidence item ÷ total findings × 100
```

Note the threshold is *verified*, not merely *linked*. A finding with three
unverified attachments still counts as a gap, because unconfirmed material does not
substantiate a rating. The overview and evidence pages list exactly which findings
fall short and why.

## Control coverage

```text
coverage = (status weight × 0.6) + (min(verified evidence, 2) ÷ 2 × 100 × 0.4)
```

| Control status | Status weight |
| -------------- | ------------- |
| Implemented | 100 |
| Partially Implemented | 50 |
| Not Implemented | 10 |
| Not Assessed | 0 |

The split matters: 60% of the figure comes from what the status *claims* and 40%
from whether verified evidence *backs it up*. A control marked Implemented with no
evidence caps at 60%, so an unsupported claim can never look complete.

Category coverage is the mean of the coverage of the controls in that category, and
the dashboard figure is the mean across all controls.

## What this model does not do

It is intentionally coarse. It does not model:

- threat intelligence, exploit availability, or attacker capability
- compensating controls, other than through the analyst's rating
- asset value or blast radius beyond the reviewer's judgement
- correlations between findings, or attack chains built from several of them
- time decay, so a stale rating stays stale until someone reviews it

For a richer model, teams typically move to CVSS for technical vulnerabilities or
FAIR for quantified financial risk. AegisLens deliberately stays with a model that a
student can defend in an interview and recompute on paper.
