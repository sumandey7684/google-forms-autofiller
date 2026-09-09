# Google Forms Discovery (P2)

## What discovery means

Discovery is a **read-only DOM scan** that finds *candidate* question containers and answer controls on a Google Forms respondent page.

It answers:

- Is this page something the Google Forms adapter can handle?
- Which elements look like question containers?
- Which descendant elements look like answer controls?
- What tag / role / type / aria-label / name / `data-*` **names** are present?

It does **not** produce core domain `Form` / `Question` objects.

## What discovery does not do

- Question type classification
- Mapping to `src/core/types` `Question` / `Form`
- Reading or writing answer values
- Clicks, focus, event dispatch, or any DOM mutation
- Section navigation
- MutationObserver / live re-scan
- Autofill, matching, AI, or submission

## Why discovery types are separate from core domain types

| Layer | Type | Purpose |
| --- | --- | --- |
| Content (DOM) | `DiscoveredQuestion` | Holds live `HTMLElement` references for later classification/fill |
| Core (serializable) | `DiscoveryReport` | Safe diagnostics for messaging / logs |
| Core (domain) | `Form` / `Question` | Normalized model used by matching & fill planning |

Core must stay free of DOM types. Discovery evidence is Google-specific and unstable; the domain model is the stable contract. P3+ will classify `DiscoveredQuestion` → `Question`.

## Module layout

```
src/content/google-forms/
  selectors.ts     # centralized ARIA/structural selectors
  detect.ts        # adapter canHandle (URL + DOM signals)
  discover.ts      # discoverQuestionContainers()
  diagnostics.ts   # DiscoveryReport + safe logging
  adapter.ts       # FormAdapter (canHandle only; extract/fill throw)
  types.ts         # DiscoveredQuestion (DOM)
  index.ts
```

Serializable report DTOs: `src/core/types/discovery-report.ts`.

## Strategy and DOM signals

Primary strategy: **`role="list"` / `role="listitem"`**.

Used signals (prefer semantic over generated CSS classes):

- `[role="list"]` — question list region
- `[role="listitem"]` — candidate question container
- `[role="heading"]` — candidate question text
- Answer controls: `input` (non-hidden/button), `textarea`, `select`, and roles `textbox | radio | checkbox | radiogroup | listbox | combobox | spinbutton | slider | option`, plus `[contenteditable="true"]`
- `aria-required`, `aria-describedby` (structure only)
- `data-*` **attribute names only** (values omitted)

Intentionally **not** used as primary selectors: obfuscated Google class names (`freebird…`, hashed CSS modules).

## Messaging

| Message | Behavior |
| --- | --- |
| `DETECT_FORM` | URL/host heuristic only |
| `DISCOVER_FORM` | Content script returns `DiscoveryReport` (no Element refs, no answer values) |
| `GET_FORM` | Still `EXTRACTION_FAILED` — no fake `Form` |

Send `DISCOVER_FORM` to the **content script** on the Forms tab (`chrome.tabs.sendMessage`), not the service worker.

## Diagnostics

On Google Forms pages, the content script logs a summary:

- `containerCount`, `containersWithControls`, `containersWithoutControls`, `totalControls`
- Per candidate: control counts, tag/role/type, truncated **question text** preview (not answers)
- Notes such as “No recognizable answer controls”

## Known limitations

- Header / footer / submit `listitem`s may appear as candidates without answer controls
- Multi-section forms only expose the **current** section’s DOM
- Custom Google widgets may not match the control selector set yet
- Page may still be hydrating when the content script runs; re-run `DISCOVER_FORM` after load
- Discovery is not classification — control presence ≠ supported question type
- Without a public test form, live selector quality must be validated manually on real pages
