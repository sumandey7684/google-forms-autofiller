# P8 saved answers and answer-value resolution

## Purpose

P8 converts P7 profile-field matches and locally saved answers into validated
`AnswerValue` candidates:

```text
Form question + P7 match + profile values + saved answers
  → apply deterministic source precedence
  → validate against Question
  → canonicalize unique option labels to option ids
  → AnswerResolutionReport
```

The resolver is pure and DOM-free. It does not construct or execute a
`FillPlan`, fill controls, navigate, submit, call AI, or access storage.

## Resolution precedence

For each question, P8 checks:

1. an explicit saved answer with the exact current question id;
2. a saved answer with the same normalized question text and question type,
   only when both the saved source and current target are unambiguous;
3. the profile field selected by P7;
4. unresolved status.

An invalid or ambiguous saved answer at a higher precedence is reported and
stops resolution. P8 never silently replaces it with a lower-precedence
profile value. AI fallback is intentionally excluded from P8 and handled only
by the separate P9 orchestration layer after local resolution returns
`missing`.

Exact question ids are current-discovery identities. Normalized-text fallback
exists because those ids are not permanent across rediscovery. Duplicate
current labels block text fallback unless an exact question answer exists.

## Saved-answer model

Each `SavedAnswer` contains:

- a deterministic key;
- an optional exact question id;
- normalized question text;
- the core question type;
- the existing single or multi `AnswerValue`;
- optional label and context;
- optional `updatedAt`.

Exact keys use the question id. Fallback keys use question type, normalized
text, and optional normalized context. Context permits multiple intentionally
distinct records; if more than one is applicable, resolution is ambiguous.

## Profile fields

P8 resolves the same fields supported by P7:

- `fullName`
- `email`
- `phone`
- `linkedInUrl`
- `portfolioUrl`
- `location`
- `notes`

Missing or blank matched values produce `missing`. P8 expects profile data to
have passed the existing `UserProfileSchema`; it does not duplicate profile
validation inside the pure resolver.

## Answer validation

- Text and paragraph require a non-empty single string.
- Multiple choice and dropdown require one unique option id or label.
- Checkbox requires a multi value; every member must identify a unique option.
- Linear scale requires an integer within the extracted minimum and maximum.
- Date requires a real calendar date in `YYYY-MM-DD`.
- Time requires a valid `HH:MM` or `HH:MM:SS` clock time.
- Unknown or runtime-unsupported question kinds return `unsupported`.

Unique choice labels are canonicalized to their existing option ids. Duplicate
labels remain `ambiguous`; callers must use an option id. Validation errors are
fixed diagnostic messages and never echo rejected answer or profile values.

## Resolution statuses

- `resolved` — one validated source produced an answer candidate.
- `missing` — no saved answer or usable matched profile value exists.
- `invalid` — the selected source has an incompatible or invalid answer.
- `ambiguous` — multiple sources, targets, fields, or options remain possible.
- `unsupported` — the question cannot be resolved safely.
- `blocked` — required P7 matching information is absent or invalid.

Certainty values are deterministic rule strengths, not probabilities.

## Local persistence boundary

`src/storage/saved-answers.ts` is a thin `chrome.storage.local` adapter. It
uses the extension's existing `storage` permission and requests no additional
permissions.

Persisted records are validated with Zod. Keys must match their deterministic
identity, normalized text must already be normalized, and keys must be unique.
Upserts replace by key, sort deterministically, and generate `updatedAt` at
the storage boundary, consistent with profile persistence. Invalid stored
collections fail closed to an empty list.

Storage is intentionally not coupled to the resolver and is not yet exposed
through popup or messaging UI.

## Known limitations

- P7 profile matching remains limited to text and paragraph questions; other
  supported question types require saved answers.
- Normalized fallback is exact and conservative; no fuzzy matching, stemming,
  synonym expansion, or description matching is used.
- Label matching is whitespace-normalized and case-sensitive.
- Question and option ids are current-extraction identities, not permanent
  Google Forms identifiers.
- Invalid persisted collections are rejected as a whole rather than partially
  recovered.
- P8 does not create FillPlans, fill the DOM, orchestrate sections, provide
  review UI, use AI fallback, navigate, or submit.
