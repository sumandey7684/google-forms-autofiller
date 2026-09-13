# P10 pre-fill answer validation

## Purpose

P10 is a pure, DOM-free gate that validates resolved or orchestrated answer
candidates **before** any FillPlan is constructed or executed:

```text
Form questions + answer candidates
  → preserve explicit non-ready upstream states
  → validate AnswerValue with shared Zod + question rules
  → enforce required questions without inventing answers
  → PrefillValidationReport
```

## What it validates

For each candidate, P10 checks:

- question existence
- single vs multi answer shape
- text / paragraph non-empty strings
- multiple choice / dropdown unique option id or label
- checkbox multi-select membership and uniqueness
- linear scale integer bounds
- date `YYYY-MM-DD` calendar validity
- time `HH:MM` / `HH:MM:SS` clock validity
- unknown / unsupported question types

It reuses:

- the existing `AnswerValue` domain union
- shared `AnswerValueSchema`
- P8 `validateAnswerValue(question, value)`

## Statuses

- `valid` — fillable canonical answer
- `missing` — no value; required questions get `required_unanswered`
- `invalid` — wrong shape, option, date/time, or blocked upstream
- `ambiguous` — preserved upstream ambiguity or duplicate option labels
- `unsupported` — unknown/unsupported question types
- `provider_error` — preserved from P9; never coerced into a fillable answer

`readyForFillPlan` is true only when every required question is fillable and
there are no invalid, ambiguous, or provider-error results.

## Boundaries

P10 does not:

- invent answers for required or optional questions
- construct or execute FillPlans
- call the fill engine
- touch DOM, Chrome APIs, storage, network, or AI providers
- navigate or submit

## Known limitations

- Required-state `unknown` is treated cautiously: absence is `missing`, but
  it does not alone fail `readyForFillPlan` the way `required: true` does.
- Optional unanswered questions remain `missing` and non-fillable without
  blocking readiness by themselves.
- P10 does not yet emit FillPlan operations; a later phase consumes
  `fillable` results.
