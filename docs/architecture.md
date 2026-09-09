# Architecture

## 1. Project purpose

Google Form AutoFiller helps users fill Google Forms for job and internship applications using:

- a saved user profile
- deterministic profile/question matching
- optional AI answers when the profile is insufficient
- a review step before fill
- **manual** submission by the user

This document describes the codebase after **P3 (Google Forms classification)**.

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
| `CLASSIFY_FORM` | content | P3 classification report (no Form) |
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

`GoogleFormsAdapter` exposes `discoverQuestions` / `discoverReport` / `classifyDiscovered` / `classifyReport`. `extract` / `fill` still throw.

Flow: DOM discovery → **classification** → P4 normalized `Form` extraction.

Placeholders `content/extractor.ts` and `content/filler.ts` remain unimplemented.

## 8. Intentionally NOT implemented yet

- Full `Form` extraction (`GET_FORM`) / P4 normalization
- Autofill / DOM writes
- Profile ↔ question matching engine
- AI answer generation
- Review UI beyond the status popup
- Authentication / backend / Google Docs
- Automatic submission (permanently out of scope)

## 9. Planned P4 → P5 evolution

| Phase | Focus |
| --- | --- |
| **P2** | ✅ Google Forms detection & candidate discovery |
| **P3** | ✅ Deterministic question classification |
| **P4** | Normalize discovery+classification → core `Form` / `Question` |
| **P5** | Fill adapter + review; optional AI later; manual submit |

Each phase should extend adapters/engines without redesigning the P1 core model.
