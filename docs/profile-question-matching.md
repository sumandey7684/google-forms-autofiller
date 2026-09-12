# P7 deterministic profile-to-question matching

## Purpose

P7 maps each extracted, supported `Question` to an existing `UserProfile`
field key. It is a pure, deterministic core layer:

```text
Form questions
  → normalize question text
  → exact canonical rule
  → explicit alias rule
  → conservative phrase/token rule
  → MatchingReport
```

P7 does not read profile values, access storage, construct a `FillPlan`, or
mutate the DOM. A later phase may combine a reviewed match with an available
profile value.

## Supported profile fields

- `fullName`
- `email`
- `phone`
- `linkedInUrl`
- `portfolioUrl`
- `location`
- `notes`

`updatedAt` is profile metadata and is never a candidate.

P7 currently matches only `text` and `paragraph` questions. Other question
types return `unsupported`; they are not guessed.

## Normalization

`normalizeQuestionText`:

1. applies Unicode NFKC normalization;
2. lowercases text;
3. translates a small set of meaningful symbols (`&`, `+`, `#`, `@`) into
   words;
4. changes remaining punctuation and symbols into token boundaries;
5. collapses whitespace and trims the result.

Letters and numbers are preserved. Punctuation is replaced with spaces rather
than deleted, so terms separated by `/`, `-`, or similar characters cannot
accidentally merge. P7 does not stem words, correct spelling, or transliterate
languages.

## Match order and confidence

Rules execute in a fixed order:

1. `exact_canonical` — confidence `1`
2. `explicit_alias` — confidence `0.9`
3. `phrase_token` — confidence `0.75`
4. `none` — confidence `0`

Confidence values are discrete rule strengths, not probabilities. The matcher
does not use fuzzy scores, embeddings, or probabilistic thresholds.

Every phrase/token rule requires an ordered, contiguous sequence of multiple
contextual tokens. A bare generic label such as `name`, `email`, `phone`,
`location`, or `experience` remains unmatched.

Explicit third-party context such as a reference, emergency contact, manager,
company, school, or organization also suppresses a profile-field match. This
prevents a contact field belonging to someone else from being mapped to the
user's profile.

## Result statuses

- `matched` — exactly one field has the strongest applicable rule.
- `ambiguous` — multiple fields have equally strong evidence; no field is
  selected.
- `unmatched` — no sufficiently specific rule applies.
- `unsupported` — the question type is outside the current P7 scope.
- `invalid` — the question id, type, or normalized text is empty.

Results include only question metadata, normalized question text, rule
evidence, and profile field keys. They never contain profile values or answer
values. Duplicate question labels are evaluated independently in form order.

## Boundaries and safety

The P7 module has no dependency on:

- DOM or Chrome APIs;
- extension messaging;
- profile or answer storage;
- network clients;
- AI providers;
- FillPlan construction or execution.

Matching never fills a control, advances a section, or submits a form.

## Known limitations

- Rules and aliases are intentionally small and primarily English-language.
- Typos, synonyms outside the explicit rules, and morphological variants
  remain unmatched.
- Question descriptions are not used as matching evidence.
- Choice, date, time, unknown, and provider-specific unsupported questions are
  not matched in P7.
- A match identifies a field key only. It does not confirm that the user's
  profile currently contains a value or that a value is valid for a control.
- P7 does not create FillPlans, select saved answers, use AI fallback, or
  orchestrate filling across sections.

AI is intentionally excluded because P7's output must be reproducible,
auditable, and conservative. Ambiguous or weak labels stay unresolved for a
later review or fallback phase.
