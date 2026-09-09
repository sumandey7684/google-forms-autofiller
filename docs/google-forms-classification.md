# Google Forms Classification (P3)

## Responsibility

P3 converts P2 discovery output into semantic / structural categories:

```
DiscoveredQuestion  →  ClassifiedQuestion
```

It does **not** build core `Form` / `Question` models (that is P4).

## Categories

Fillable semantic kinds (align with P1 `QuestionType`):

- `text`, `paragraph`, `multiple_choice`, `checkbox`, `dropdown`, `linear_scale`, `date`, `time`

Classifier-only kinds (not core Question types):

- `unknown` — insufficient / contradictory evidence (prefer over guessing)
- `non_question` — section headers, submit/nav chrome
- `unsupported` — file upload, grid-like multi-radiogroup structures when identifiable

## Determinism

Classification is pure and deterministic: same `DiscoveredQuestion` ⇒ same `kind`, `signals`, `reason`, `confidence`.

No AI, network, randomness, timestamps, or profile data.

## Signal hierarchy (conservative)

1. Unsupported evidence (file input, multiple radiogroups)
2. Non-question evidence (no controls, button-only)
3. Strong single-control types (`date` / `time` / `textarea` / short text / `select`)
4. Dropdown ARIA (combobox/listbox + options)
5. Checkbox sets
6. Radio sets → linear scale only with consecutive numeric labels; otherwise multiple choice
7. Otherwise `unknown`

**Title text alone is never enough** (e.g. heading contains “date” but control is `type=text` ⇒ `text`).

## Boundaries

| From | To | Owns |
| --- | --- | --- |
| P2 | P3 | `DiscoveredQuestion` / controls / evidence |
| P3 | P4 | `ClassifiedQuestion[]` (serializable) |
| P4 | … | core `Form` / `Question` |

Classifier may read structural attributes (`type`, `role`) from discovered control elements. It must not read answer values / checked / selected.

## Messaging

- `DISCOVER_FORM` — unchanged discovery report
- `CLASSIFY_FORM` — `ClassificationReport` (safe, serializable)
- `GET_FORM` — still `EXTRACTION_FAILED`

## Smoke

```bash
pnpm run p3-classification-smoke
```

- Fixture: `fixtures/p3-classification.html`
- Script: `scripts/p3-classification-smoke.ts`
