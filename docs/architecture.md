# Architecture

## 1. Project purpose

Google Form AutoFiller helps users fill Google Forms for job and internship applications using:

- a saved user profile
- deterministic profile/question matching
- optional AI answers when the profile is insufficient
- a review step before fill
- **manual** submission by the user

This document describes the codebase after **P9 (AI answer provider boundary)**.

## 2. P0 foundation (complete)

- Manifest V3 + Vite + React + TypeScript
- Popup, background service worker, content script shell
- Chrome messaging plumbing
- Zod `UserProfile` + `chrome.storage.local` helpers

## 3. P1 domain model (complete)

P1 freezes the **shared domain contracts** later phases implement against:

| Area | Location |
| --- | --- |
| Form / Section / Question | `src/core/types/form.ts` |
| Answers | `src/core/types/answer.ts` |
| Fill plan / result | `src/core/types/fill.ts` |
| Adapter interface | `src/core/types/adapter.ts` |
| Error codes | `src/core/types/errors.ts` |
| Detection DTO | `src/core/types/detection.ts` |
| Message + Zod boundary | `src/core/validation/messages.ts` |
| Chrome send helpers | `src/utils/messaging.ts` |
| Discovery report DTO | `src/core/types/discovery-report.ts` |
| Google Forms discovery | `src/content/google-forms/` |

Compile-time examples (no test runner): `src/core/types/model.examples.ts`.

Discovery details: [google-forms-discovery.md](./google-forms-discovery.md).

## 4. Core entities

- **Form** — id, title, description, url, sections, extractedAt
- **Section** — id, title, description, questions
- **Question** — discriminated union by `type` (`text`, `paragraph`, `multiple_choice`, `checkbox`, `dropdown`, `linear_scale`, `date`, `time`, `unknown`)
- **`required?: boolean`** — `true` / `false` when known; **omitted when unknown** (must not be collapsed to optional)
- **QuestionOption** — stable `id` + `label` (not array index)
- **FormAnswer** — questionId, discriminated `AnswerValue`, source, status, optional confidence
- **FillPlan** / **FillOperation** — DOM-independent fill intent
- **FillResult** / **FillOperationResult** — success / failed / skipped / unsupported + totals helpers
- **MatchingReport** / **QuestionMatchResult** — deterministic field-key matches, ambiguity, and unmatched/unsupported states
- **SavedAnswer** / **AnswerResolutionReport** — local answer sources, validated candidates, ambiguity, and missing/blocked states
- **AiAnswerProvider** / **OrchestratedAnswerReport** — provider-agnostic AI fallback after local resolution
- **FormAdapter** — `canHandle` / `extract` / `fill`
- **AppError** — typed `ErrorCode` + message

Answers are **not** DOM values. Fill plans are **not** Google-specific selectors.

## 5. Dependency direction

```
core/types + core/matching + core/resolution + core/ai  (pure domain logic)
     ↑
core/validation  (Zod for boundaries + profile schema)
     ↑
utils / storage / background / popup / content
     ↑
content Google Forms adapter (future) implements FormAdapter
```

**Rules**

- `core/` must not import React, `chrome.*`, Google DOM code, AI SDKs, or HTTP clients.
- `core/matching` must not read profile values, storage, messaging, or FillPlan execution code.
- `core/resolution` receives values as arguments; it must not access storage, messaging, DOM, network, AI, or FillPlan execution.
- `core/ai` may call a injected provider interface but must not embed SDKs, API keys, DOM access, or FillPlan execution.
- Content may depend on core; core must not depend on content.
- Popup depends on messaging contracts + presentation only.

## 6. Messaging architecture

Central contract: `MessageType` + Zod `ExtensionMessageSchema` in `core/validation/messages.ts`.

| Message | Primary handler | Notes |
| --- | --- | --- |
| `PING` | background or content | health check |
| `GET_EXTENSION_STATUS` | background | popup status UI |
| `GET_PROFILE` / `SAVE_PROFILE` | background | storage I/O |
| `DETECT_FORM` | content | URL/host heuristic only |
| `DISCOVER_FORM` | content | P2 read-only DOM candidate diagnostics |
| `CLASSIFY_FORM` | content | P3 classification report (no Form) |
| `GET_FORM` | content | P4 normalized `Form` |
| `EXTRACT_FORM` | content | P4 `{ form, report }` |
| `FILL_FORM` | content | P5 apply `FillPlan` → `FillResult` |
| `INSPECT_NAVIGATION` | content | P6 navigation inspect (read-only) |
| `NAVIGATE_FORM` | content | P6 `{ action: 'next' \| 'back' }` — never Submit |

Runtime validation: `isExtensionMessage` / `AppErrorSchema` at extension boundaries. Errors use `{ error: AppError }`, not bare strings.

## 7. Adapter architecture

```ts
interface FormAdapter {
  readonly id: string;
  canHandle(): boolean;
  extract(): Promise<Form>;
  fill(plan: FillPlan): Promise<FillResult>;
}
```

### P2 — DOM discovery (read-only)

`src/content/google-forms/` discovers candidate question containers and interactive controls.

- **Does:** locate containers/controls, title/description candidates, conservative required state, provider `entry.*` ids when present, safe diagnostics
- **Does not:** classify semantic question types, build core `Form`, mutate the DOM, fill, or submit
- **DOM types** (`DiscoveredQuestion`, `DiscoveredControl`) stay in the content layer; core stays DOM-free
- **Provider ids** (`entry.123`) are distinct from internal `discovery:q-N` ids
- **Diagnostics** omit answer values; logging is optional via `DISCOVERY_DEBUG_LOGGING`

### P3 — Question classification (deterministic)

`classifyQuestion(discovered)` maps discovery → `ClassifiedQuestion` (serializable; no DOM).

- Uses P2 control kinds / structural attributes only
- Conservative: prefer `unknown` over false positives
- Distinguishes `non_question` and `unsupported` outside the core `Question` union
- Does **not** construct core `Form` / `Question` (P4)

See [google-forms-classification.md](./google-forms-classification.md).

### P4 — Form extraction / normalization

`extractForm(discovered, classified, metadata)` builds the existing core `Form`.

- Consumes P2/P3 outputs only (no third discovery engine)
- Filters `non_question` / `unsupported` out of `Form.questions` (unsupported retained in `ExtractionReport` with reason/signals)
- Preserves `unknown` as `Question.type = 'unknown'`
- Preserves required tri-state via `required?: boolean`
- Scope: currently visible DOM only (`ExtractionReport.scope = current_visible_dom`)
- DOM-free, JSON-serializable result + `ExtractionReport`
- `GET_FORM` / `EXTRACT_FORM` return real extraction results

See [google-forms-extraction.md](./google-forms-extraction.md).

### P5 — Fill Engine foundation

`applyFillPlan(plan, root)` applies an authoritative `FillPlan` to the currently visible DOM.

- Does **not** invent answers, read profiles, call AI, navigate, or submit
- Resolves `questionId` against current discovery ids
- Supports text/paragraph/MC/checkbox/dropdown/linear_scale/date/time
- Rejects unknown/unsupported/invalid operations with structured results
- Partial failures do not roll back earlier successes
- `FILL_FORM` / `adapter.fill` return `FillResult`

See [google-forms-fill.md](./google-forms-fill.md).

### P6 — Section navigation

`inspectNavigation` / `navigateSection` detect Next/Back/Submit chrome and move between visible pages.

- Reuses P2 discovery + P3 classification after every successful move
- Distinguishes Submit and **never clicks it**
- Returns structured blocked/unsupported states (ambiguity, required blocking, submit-only final)
- Does **not** auto-advance during discovery or fill across all sections
- Linear Next/Back only — branching unsupported

See [google-forms-navigation.md](./google-forms-navigation.md).

`GoogleFormsAdapter` exposes discovery, classification, extraction, fill, and navigation helpers.

Flow: DOM discovery → classification → Form / FillPlan → **optional section navigation**.

Google Forms logic lives under `content/google-forms/`.

### P7 — Deterministic profile-to-question matching

`matchFormQuestions(form)` maps supported extracted questions to existing
`UserProfile` field keys.

- DOM-free and independent of Chrome, storage, messaging, and network APIs
- Exact canonical → explicit alias → conservative phrase/token rules
- Preserves equal-strength candidates as `ambiguous`
- Leaves weak generic labels unmatched
- Emits no profile values, answer values, or FillPlans
- Supports `text` and `paragraph` questions only in P7

See [profile-question-matching.md](./profile-question-matching.md).

### P8 — Saved answers and answer-value resolution

`resolveAnswers(input)` combines P7 results, existing profile values, and
saved-answer records into validated `AnswerValue` candidates.

- Pure and DOM-free; storage is injected data rather than read by the resolver
- Exact saved question → unique normalized-text saved answer → P7 profile field
- Invalid or ambiguous higher-precedence values do not fall through silently
- Validates all P4 question types and canonicalizes unique choice labels to ids
- Thin, Zod-validated `chrome.storage.local` adapter for saved records
- Does **not** construct or execute FillPlans, fill, navigate, submit, or use AI

See [answer-value-resolution.md](./answer-value-resolution.md).

### P9 — AI answer provider boundary

`resolveAnswersWithAiFallback(input)` runs P8 first, then asks an
`AiAnswerProvider` only for still-`missing` questions.

- Provider-agnostic interface plus deterministic mock; no SDK in-repo
- Minimal per-question context; saved answers and whole-form payloads excluded
- Every proposal validated with shared `AnswerValueSchema` and question rules
- Explicit `provider_error` / invalid / unsupported outcomes
- Does **not** fill, navigate, submit, construct FillPlans, or add AI messaging

See [ai-answer-provider.md](./ai-answer-provider.md).

## 8. Intentionally NOT implemented yet

- Live AI SDK / network provider adapters and secret storage
- FillPlan construction from resolved candidates
- Saved-answer editing or review UI
- Review UI beyond the status popup
- Authentication / backend / Google Docs
- Automatic submission (permanently out of scope)
- End-to-end multi-section fill orchestration
- Conditional section branching graphs

## 9. Planned next evolution

| Phase | Focus |
| --- | --- |
| **P2** | ✅ Google Forms detection & candidate discovery |
| **P3** | ✅ Deterministic question classification |
| **P4** | ✅ Normalize discovery+classification → core `Form` / `Question` |
| **P5** | ✅ Fill engine (apply FillPlan to visible DOM) |
| **P6** | ✅ Safe Next/Back section navigation (never Submit) |
| **P7** | ✅ Deterministic profile-field matching (no values or FillPlan) |
| **P8** | ✅ Local saved answers + deterministic answer-value resolution |
| **P9** | ✅ AI provider boundary + deterministic fallback orchestration |
| **P10+** | Live AI adapter / FillPlan construction / review; manual submit |

Each phase should extend adapters/engines without redesigning the P1 core model.
