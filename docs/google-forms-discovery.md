# Google Forms Discovery (P2)

## What discovery is responsible for

Read-only DOM scanning that answers:

> Which DOM regions appear to be questions, and which interactive controls belong to each?

Outputs:

- `DiscoveredQuestion` / `DiscoveredControl` (content layer, may hold `HTMLElement`s)
- `DiscoveryReport` (serializable diagnostics for messaging / logs)

## What discovery intentionally does not do

- Semantic question classification (`text`, `checkbox`, …) — **P3**
- Normalized core `Form` / `Question` construction — **P4**
- Autofill, clicks, focus, attribute writes, MutationObservers
- Section navigation, AI, profile matching, review UI

## Why DOM types stay out of core

| Layer | Types | May reference DOM? |
| --- | --- | --- |
| `src/content/google-forms/` | `DiscoveredQuestion`, `DiscoveredControl` | Yes |
| `src/core/types/discovery-report.ts` | `DiscoveryReport` | No (serializable only) |
| `src/core/types/form.ts` | `Form`, `Question` | No |

Core remains reusable and DOM-free. Google-specific instability stays in the adapter.

## Module layout

```
src/content/google-forms/
  selectors.ts    # centralized selectors + discovery control kinds
  detect.ts       # canHandle (URL + structure)
  discovery.ts    # discoverQuestionContainers()
  diagnostics.ts  # DiscoveryReport + safe logging
  adapter.ts      # FormAdapter + discoverQuestions/discoverReport
  types.ts        # DOM-bearing discovery types
  index.ts
```

## How question containers are discovered

Signal priority:

1. **ARIA/structure:** `[role="list"]` → `[role="listitem"]`
2. **Provider fallback:** `[data-params]` only if listitems are absent
3. Generated CSS class names are **not** used as primary selectors

Per container, discovery collects:

- title / description element candidates
- interactive controls (discovery-level `kind` only)
- conservative `required` (`true` / `false` / unknown)
- provider id when present
- internal `discoveryId` (`discovery:q-N`) when needed for bookkeeping

## Provider IDs

- Captured from `name` attributes matching **exact** `entry.<digits>` (`/^entry\.\d+$/`) when available (including hidden metadata inputs).
- Partial / malformed names like `entry.name` or `entry.123abc` do **not** match.
- **`providerId`** = Google Forms entry id when found.
- **`discoveryId`** = internal only (`discovery:q-0`, …), unique within a single discovery run by index — not a cross-session Forms id.

## Required detection

Uses `aria-required`, native `required`, and related probes.

- Confident true/false → set `required`
- Otherwise → leave `required` unset (unknown)
- A visible `*` alone is **not** enough

## Diagnostics and privacy

Compact console summary (dev toggle `DISCOVERY_DEBUG_LOGGING`):

```
[Google Form AutoFiller] Discovery:
questions=…
recognized=…
missingControls=…
missingTitles=…
missingProviderIds=…
signal=…
```

`DiscoveryReport` / logs **never** include:

- input values
- checked / selected state
- passwords
- profile data
- full DOM dumps

P2 discovery does **not** read or store control answer values at all.

## Messaging

| Message | Behavior |
| --- | --- |
| `DETECT_FORM` | URL heuristic |
| `DISCOVER_FORM` | `DiscoveryReport` (safe) |
| `GET_FORM` | `EXTRACTION_FAILED` (no fake Form) |

## Known limitations

- Header/footer/submit listitems may appear as candidates
- Only the current section’s DOM is visible
- Custom widgets may not match the interactive selector set
- Hydration race possible after `document_idle`; one-shot deferred rediscovery runs only when the first pass finds zero containers (no MutationObserver)
- URL/content-script matching covers `docs.google.com/forms/*` broadly (editor/preview included), not only `/viewform`
- Live Google Forms DOM drift is always possible; selectors prefer ARIA over classes
- Compatibility with every Forms variant is **not** claimed without live verification

## Smoke harnesses

Regression fixtures/scripts (no permanent test-runner dependency):

- `fixtures/p2-discovery-audit.html` + `scripts/p2-discovery-smoke.ts`
- Companion P3: `fixtures/p3-classification.html` + `scripts/p3-classification-smoke.ts`

Run with ephemeral `linkedom` + `tsx`, then remove those packages.
