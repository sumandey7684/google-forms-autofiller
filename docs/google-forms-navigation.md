# Google Forms Navigation (P6)

## Responsibility

P6 inspects and performs **safe section navigation** on the currently loaded Google Forms respondent page:

```
visible DOM
  → P2 discovery
  → P3 classification
  → navigation inspect / next / back
```

It does **not**:

- click **Submit** under any circumstance
- invent answers or fill questions
- match profiles / call AI
- auto-advance during ordinary discovery
- implement full branching / conditional section graphs
- fill across all sections end-to-end

## Domain model (DOM-free)

Core types live in `src/core/types/navigation.ts`:

- `NavigationInspection` — current section snapshot + control availability
- `NavigationResult` — inspect / moved / blocked / unsupported / failed
- `NavigationStateCode` — explicit states such as:
  - `single_section`
  - `next_available` / `back_available` / `next_and_back_available`
  - `no_next_button`
  - `submit_only_final_section`
  - `navigation_control_not_found`
  - `navigation_blocked_by_required_fields`
  - `ambiguous_navigation_control`
  - `unsupported_branching`

## Control detection

Navigation chrome is detected via semantic signals only:

- `button`, `input[type=button|submit|image]`, `[role=button]`
- labels from `aria-label` / text content (`Next`, `Continue`, `Back`, `Previous`, `Submit`, …)
- **Submit-like controls are never clicked** (including labels containing “submit”)

Generated Google CSS class names are not used.

## State machine

| Operation | Behavior |
| --- | --- |
| `inspect` | Read-only snapshot; no DOM mutation |
| `next` | Click safe Next if unique; refuse Submit / ambiguity / required blocking |
| `back` | Click safe Back if unique |

After a **successful** move:

1. Rediscover visible questions (existing P2)
2. Reclassify (existing P3)
3. Return `before` + `after` inspections

Expected blocked conditions return structured `NavigationResult` (not thrown errors).

## Messaging

| Message | Payload | Response |
| --- | --- | --- |
| `INSPECT_NAVIGATION` | — | `{ navigation: NavigationResult }` |
| `NAVIGATE_FORM` | `{ action: 'next' \| 'back' }` | `{ navigation: NavigationResult }` |

## Safety guarantee

**Submit is never clicked** by the navigation layer. Final sections with only Submit are reported as `submit_only_final_section` / blocked next attempts.

## Smoke

```bash
pnpm run p6-navigation-smoke
```

## Known limitations

- Linear Next/Back only — conditional branching / Go-to-section graphs are unsupported
- Absolute section index across an entire form is often unknowable from the visible DOM alone
- Required-field blocking is conservative (empty required text-like controls / fixture `data-nav-blocked`)
- Live Google Forms chrome text/ARIA may vary by locale
- Does not automatically chain fill → next → fill across sections (future orchestration)
- Live respondent verification may be blocked by Google Sign-in
