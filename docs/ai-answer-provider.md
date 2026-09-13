# P9 AI answer provider boundary

## Purpose

P9 adds a provider-agnostic AI fallback after local deterministic resolution:

```text
exact saved answer
  → unique normalized-text saved answer
  → P7 profile match
  → AI provider proposal (only when still missing)
  → validate with AnswerValue + question constraints
  → OrchestratedAnswerReport
```

P9 does not fill the DOM, construct or execute FillPlans, navigate, submit,
or expose AI through popup messaging.

## Provider contract

`AiAnswerProvider` is a DOM-free interface:

- input: `AiQuestionContext`
- output: `proposed` | `unsupported` | `error`

P9 ships a deterministic `MockAiAnswerProvider` for tests and local development.
No AI SDK, network client, or API key is included in this phase.

## Minimal context

`buildAiQuestionContext` includes only:

- question id
- question text (truncated)
- optional description (truncated)
- question type
- option id/label pairs for choice questions
- linear-scale bounds when relevant
- optional allowlisted non-empty profile fields, only when explicitly requested

It never includes:

- saved answers
- passwords or tokens
- unrelated storage contents
- whole-form payloads, URLs, or section dumps

## Validation and statuses

Every proposed AI value must:

1. parse with the shared `AnswerValueSchema`;
2. pass `validateAnswerValue` for the target question.

Result statuses include the existing P8 states plus `provider_error`.
AI-resolved answers use source `ai` and certainty `0.5`.

Invalid, ambiguous, unsupported, and blocked P8 results are preserved and
never silently replaced by AI.

## Configuration

API keys and live provider credentials must stay out of source control and out
of the extension bundle.

P12A adds a **local backend proxy**:

- extension → `HttpAiAnswerProvider` → local backend → Gemini Interactions API
- `GEMINI_API_KEY` is read only from backend env (see `.env.example`)
- deterministic `MockAiAnswerProvider` remains for tests

See [gemini-backend.md](./gemini-backend.md).

## Known limitations

- Live Gemini calls require a running local backend and a configured `.env`.
- AI is only invoked for P8 `missing` results.
- Profile context is optional and allowlisted; it is not automatically
  minimized per question beyond the fixed allowlist.
- Popup workflow still defaults to the mock provider in this slice.
- Mock responses are test-scripted and not model quality evaluations.
