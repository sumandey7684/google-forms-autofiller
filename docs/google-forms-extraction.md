# Google Forms Extraction / Normalization (P4)

## Status

P4 is implemented and under / ready for release audit. It is **not** fill, matching, AI, or navigation.

## Responsibility

P4 converts P2 discovery + P3 classification into the existing core domain model:

```
DiscoveredQuestion[] + ClassifiedQuestion[]  →  Form + ExtractionReport
```

## Pipeline

```
DOM
 → P2 Discovery (DiscoveredQuestion)
 → P3 Classification (ClassifiedQuestion)
 → P4 Extraction (core Form)
 → future P5 FillPlan / FillEngine
```

P4 must **not** re-discover the page or reclassify. It consumes P2/P3 outputs only.
A scoped read of structural labels from already-discovered controls (and
native `<select>` option text) is allowed for option normalization.

## Core fields populated

| Form field | Provenance |
| --- | --- |
| `id` | Caller / adapter (`form:<url>` fallback) — not a Google Forms resource id |
| `title` | Adapter page `<title>` (Google Forms suffix stripped) when available; else empty |
| `description` | Optional caller metadata only (never invented from page body) |
| `url` | Page URL at extraction |
| `extractedAt` | **Caller-supplied** ISO string. Pure `extractForm` never generates timestamps. Adapter sets wall-clock when calling. |
| `sections` | Single `section:current` for the **currently visible** respondent DOM |

| Question field | Provenance |
| --- | --- |
| `id` | P2 `discoveryId` — **internal** id for one extraction run |
| `type` | P3 `kind` (never reclassified) |
| `text` | P2 title candidate (trimmed); empty if missing — never fabricated |
| `description` | P2 description candidate when present |
| `required` | P2 value when known; **omitted when unknown** |
| `metadata.providerId` | P2 `entry.<digits>` when present |
| `metadata.discoveryId` | Same as `id` for traceability |
| options / scale | Structural labels from discovered controls |

## Required state (critical)

P1 contract: `required?: boolean`

| P2 | P4 Form |
| --- | --- |
| `true` | `required: true` |
| `false` | `required: false` |
| `undefined` | **property omitted** — must not be treated as optional |

Future fill/validation must treat missing `required` as unknown, not optional.

## Question identity

- **Internal id** = `discoveryId` (e.g. `discovery:q-0`)
- Deterministic and unique within one extraction
- **Not** stable across reload, rediscovery, form edits, branching, or section navigation
- **Provider id** = `entry.<digits>` in `metadata.providerId` only — never replaces internal id

## Section / completeness limitation

Google Forms respondent flow often uses **one section per page**.

P4 normalizes **only the currently visible DOM** into `section:current`
(`title: "Currently visible page"`).

- `ExtractionReport.scope` = `'current_visible_dom'`
- This is **not** a claim that the Form is the entire multi-section form
- No Next/Back clicking, no multi-page traversal

## Unknown / non_question / unsupported

| P3 kind | P4 behavior |
| --- | --- |
| `unknown` | Extracted as `Question` with `type: 'unknown'` |
| `non_question` | Omitted from `Form.questions`; listed in report |
| `unsupported` | Omitted from questions; report keeps `classificationKind`, `classificationReason`, `classificationSignals` so UI can say an unsupported question was present |

## Options

Choice option labels come from P2 `DiscoveredControl.label` (and native `<select>`
option text). Order is discovery order. Empty labels are skipped (not invented).

Linear scale maps numeric labels to `min` / `max` (P1 contract has no scale options array).

Respondent `.value` / `.checked` / `.selected` / `selectedIndex` are never read as answers.

## Determinism

`extractForm` is deterministic for identical discovered + classified + metadata
(including `extractedAt`). Timestamp creation belongs at the adapter boundary.

Semantic Form content (excluding `extractedAt`) is identical when only the
timestamp differs.

## Privacy

No profile/storage/network/AI. Diagnostics omit answer values and DOM objects.

## Messaging

| Message | Behavior |
| --- | --- |
| `GET_FORM` | Genuine normalized `Form` |
| `EXTRACT_FORM` | `{ form, report }` |
| `DISCOVER_FORM` / `CLASSIFY_FORM` | Unchanged |
| `fill` | Unimplemented (P5) |

## Smoke

```bash
pnpm run p4-extraction-smoke
```

Fixture: `fixtures/p4-extraction.html`  
Script: `scripts/p4-extraction-smoke.ts` (uses `linkedom` + `tsx` as smoke-only devDependencies)

## Live DOM

Live Google Forms respondent verification may be blocked by sign-in.
Do not claim live compatibility without an accessible public form.
