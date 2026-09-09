# Architecture

## 1. Project purpose

Google Form AutoFiller helps users fill Google Forms for job and internship applications using:

- a saved user profile
- deterministic profile/question matching
- optional AI answers when the profile is insufficient
- a review step before fill
- **manual** submission by the user

This document describes the codebase after **P2 (Google Forms discovery)**.

## 2. P0 foundation (complete)

- Manifest V3 + Vite + React + TypeScript
- Popup, background service worker, content script shell
- Chrome messaging plumbing
- Zod `UserProfile` + `chrome.storage.local` helpers

## 3. P1 domain model (this phase)

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
- **QuestionOption** — stable `id` + `label` (not array index)
- **FormAnswer** — questionId, discriminated `AnswerValue`, source, status, optional confidence
- **FillPlan** / **FillOperation** — DOM-independent fill intent
- **FillResult** / **FillOperationResult** — success / failed / skipped / unsupported + totals helpers
- **FormAdapter** — `canHandle` / `extract` / `fill`
- **AppError** — typed `ErrorCode` + message

Answers are **not** DOM values. Fill plans are **not** Google-specific selectors.

## 5. Dependency direction

```
core/types  (pure domain)
     ↑
core/validation  (Zod for boundaries + profile schema)
     ↑
utils / storage / background / popup / content
     ↑
content Google Forms adapter (future) implements FormAdapter
```

**Rules**

- `core/` must not import React, `chrome.*`, Google DOM code, AI SDKs, or HTTP clients.
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
| `GET_FORM` | content | still returns `EXTRACTION_FAILED` (no fake Form) |

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

A `GoogleFormsAdapter` in `src/content/google-forms/` implements `canHandle()` plus a P2-only `discover()` helper. `extract` / `fill` still throw typed errors.

Placeholders `content/extractor.ts` and `content/filler.ts` remain unimplemented.

## 8. Intentionally NOT implemented yet

- Question classification / mapping discovery → `Question`
- Full `Form` extraction (`GET_FORM`)
- Autofill / DOM writes
- Profile ↔ question matching engine
- AI answer generation
- Review UI beyond the status popup
- Authentication / backend / Google Docs
- Automatic submission (permanently out of scope)

## 9. Planned P3 → P5 evolution

| Phase | Focus |
| --- | --- |
| **P2** | ✅ Google Forms detection & candidate discovery (no classification) |
| **P3** | Classify discovery → `Question` / `Form`; deterministic matching |
| **P4** | Fill adapter (`FillPlan` → DOM) + `FillResult`; review before fill |
| **P5** | Optional AI for unresolved questions; still manual submit |

Each phase should extend adapters/engines without redesigning the P1 core model.
