# Google Forms Fill Engine (P5)

## Status

P5 implements applying an authoritative `FillPlan` to the **currently visible**
Google Forms DOM. It does **not** decide answers, match profiles, call AI,
navigate sections, or submit.

## Responsibility

```
FillPlan
  → validate each FillOperation
  → resolve question in current DOM (by discoveryId)
  → confirm classified kind + answer shape
  → mutate intended controls only
  → verify
  → FillResult
```

## What P5 does not do

- Invent answers
- Read `UserProfile` / storage / saved answers
- Call AI or network
- Click Next / Back / Submit
- Traverse multiple form sections
- Fill unknown / unsupported / file / grid questions

## Supported kinds

| Kind | Answer shape | Behavior |
| --- | --- | --- |
| `text` / `paragraph` | `single` | Set input/textarea/contenteditable + input/change events |
| `multiple_choice` | `single` | Select matching radio by label or `opt:…` id |
| `checkbox` | `multi` | **Exact set**: requested options checked; all other options in that question unchecked. Already-correct states are not toggled. |
| `dropdown` | `single` | Native `<select>` or ARIA option by label / option id |
| `linear_scale` | `single` | Integer token matching a scale radio label |
| `date` | `single` | Strict `YYYY-MM-DD` into native date control |
| `time` | `single` | Strict `HH:MM` / `HH:MM:SS` into native time control |

## Unsupported / rejected

| Case | Result |
| --- | --- |
| `unknown` / `unsupported` / `non_question` | `unsupported` |
| Missing `questionId` in current DOM | `failed` |
| Wrong answer shape for kind | `failed` |
| Option / date / time not safely representable | `failed` |

## Question targeting

`FillOperation.questionId` is the P4 internal id (`discovery:q-N`).

The engine rediscovers the **current** DOM and matches `discoveryId`.
These ids are **not** stable across reload/rediscovery and are **not** DOM attributes.

## Partial failure

Earlier successful operations are **not** rolled back when a later operation fails.
`FillResult.results` lists every operation outcome in plan order.

## Messaging

| Message | Behavior |
| --- | --- |
| `FILL_FORM` | `{ fill: FillResult }` for a typed `FillPlan` payload |
| `fill` on adapter | Same engine |

## Smoke

```bash
pnpm run p5-fill-smoke
```

## Known limitations

- Current visible DOM / section only
- Live Google Forms widget quirks may differ from fixtures
- Checkbox fill applies an **exact** selection set (checks requested, unchecks others in that question)
- ARIA custom dropdowns beyond discovered options may remain incomplete
- Does not generate FillPlans (answer selection is a later phase)
