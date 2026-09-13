# Google Form AutoFiller

Chrome extension for helping users fill Google Forms (job and internship applications) using a saved profile, deterministic question matching, optional AI answers, and a review step — with **manual submission only**.

## Current status

| Area | Status |
| --- | --- |
| P0 foundation (MV3, Vite, React, messaging, popup, service worker, content script) | Complete |
| P1 domain model + contracts | Complete |
| Google Forms candidate DOM discovery (read-only) | Complete (P2) |
| Deterministic question classification | Complete (P3) |
| Form extraction / normalization to core `Form` | Complete (P4) |
| Fill engine (apply FillPlan to visible DOM) | Complete (P5) |
| Safe multi-section navigation (Next/Back; never Submit) | Complete (P6) |
| Deterministic profile-to-question matching | Complete (P7) |
| Local saved answers and deterministic answer-value resolution | Complete (P8) |
| AI answer provider boundary + deterministic fallback orchestration | Complete (P9) |
| Live AI SDK / network provider | Not implemented |
| Automatic submission | Intentionally not implemented (submit stays manual) |

See [docs/architecture.md](docs/architecture.md), [docs/google-forms-discovery.md](docs/google-forms-discovery.md), [docs/google-forms-classification.md](docs/google-forms-classification.md), [docs/google-forms-extraction.md](docs/google-forms-extraction.md), [docs/google-forms-fill.md](docs/google-forms-fill.md), [docs/google-forms-navigation.md](docs/google-forms-navigation.md), [docs/profile-question-matching.md](docs/profile-question-matching.md), [docs/answer-value-resolution.md](docs/answer-value-resolution.md), and [docs/ai-answer-provider.md](docs/ai-answer-provider.md).

## Architecture

```
src/
├── background/          # MV3 service worker (message routing, storage I/O)
├── content/             # Content script + future detect/extract/fill modules
├── popup/               # React popup UI
├── core/
│   ├── types/           # Shared domain types (forms, answers, plans)
│   ├── matching/        # Deterministic, DOM-free profile-field matching
│   ├── resolution/      # Deterministic, DOM-free answer-value resolution
│   ├── ai/              # AI provider contract + fallback orchestration
│   ├── parser/          # Reserved for form parsing (empty in V1)
│   ├── engine/          # Reserved for future fill planning
│   └── validation/      # Zod schemas (e.g. user profile)
├── storage/             # chrome.storage wrappers
└── utils/               # Messaging helpers and shared utilities
```

**Communication:** popup ↔ service worker ↔ content script via Chrome's `runtime` / `tabs` messaging API. Contracts + Zod live in `src/core/validation/messages.ts`; Chrome helpers in `src/utils/messaging.ts`.

**Build:** Vite + `@crxjs/vite-plugin` bundles the extension into `dist/`.

## Current scope (P0 + P1 + P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9)

Implemented:

- Manifest V3 extension scaffold
- TypeScript (strict) + React + Vite
- Background service worker
- Content script registration on Google Forms URLs
- Minimal popup UI that pings the service worker
- Typed messaging contracts (`PING`, profile, status, `DETECT_FORM`, `DISCOVER_FORM`, `CLASSIFY_FORM`, `GET_FORM`, `EXTRACT_FORM`, `FILL_FORM`, `INSPECT_NAVIGATION`, `NAVIGATE_FORM`)
- Profile schema + `chrome.storage.local` helpers
- Domain model: Form / Section / Question / FormAnswer / FillPlan / FillResult / FormAdapter / AppError / Navigation*
- Google Forms discovery: candidate question containers + control evidence (read-only)
- Deterministic classification of discovered questions (`ClassifiedQuestion` / `ClassificationReport`)
- Normalized Form extraction from discovery + classification (`ExtractionReport`)
- Fill engine: apply authoritative `FillPlan` to the currently visible DOM (`FillResult`)
- Safe section navigation: inspect / Next / Back with rediscovery (never Submit)
- Deterministic matching of supported extracted questions to existing profile field keys
- Local saved-answer persistence plus deterministic, validated answer candidates
- AI provider interface, minimal context builder, mock provider, and fallback orchestration

## Not implemented yet

- Live AI SDK / network provider and secret storage
- FillPlan construction from resolved candidates
- Saved-answer editing or review UI
- End-to-end multi-section fill orchestration
- Conditional section branching
- Review UI before fill
- Authentication / accounts
- Backend APIs
- Google Docs support
- Automatic form submission (out of scope permanently — submit stays manual)

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+
- Google Chrome (or Chromium) for loading the unpacked extension

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts Vite with CRXJS HMR. Load the generated `dist/` folder as an unpacked extension (see below). After code changes, reload the extension in `chrome://extensions` if the worker or content script does not hot-update.

## Type checking

```bash
npm run typecheck
```

## Build

```bash
npm run build
```

This runs TypeScript project builds (`tsc -b`) then Vite production output into `dist/`. The `dist/` folder is a valid Manifest V3 extension package.

Clean the build output:

```bash
npm run clean
```

## Load the extension in Chrome

1. Run `npm run build` (or `npm run dev` once so `dist/` exists).
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project's `dist/` directory.
6. Open the extension popup from the toolbar to confirm the service worker status UI.
7. Visit a Google Forms URL (`https://docs.google.com/forms/...`) and confirm the content script logs readiness in the page DevTools console.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite + CRXJS development build |
| `npm run build` | Typecheck + production extension build |
| `npm run typecheck` | Strict TypeScript check only |
| `npm run preview` | Preview the Vite build locally |
| `npm run clean` | Remove `dist/` |
| `pnpm run p7-matching-smoke` | Run deterministic P7 matching smoke/audit cases |
| `pnpm run p8-saved-answers-smoke` | Run P8 resolution, validation, and persistence smoke/audit cases |
| `pnpm run p9-ai-provider-smoke` | Run P9 AI fallback orchestration smoke/audit cases |

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
