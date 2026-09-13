# P12A local Gemini backend

## Architecture

```text
Chrome extension (HttpAiAnswerProvider)
  → http://127.0.0.1:8787/v1/propose-answer
    → local backend (GEMINI_API_KEY)
      → Gemini Interactions API (@google/genai)
```

The API key is read only from backend environment variables. It is never
shipped in the extension bundle, logged, or returned in HTTP responses.

## Configuration

1. Copy `.env.example` to `.env.local` (preferred) or `.env`
   at the repo root or under `backend/`.
2. Set `GEMINI_API_KEY` in that local file (never commit it).
3. Optional: `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `BACKEND_HOST`, `BACKEND_PORT`.

```bash
cp .env.example .env.local
npm --prefix backend install
pnpm run backend:dev
```

Load order: `backend/.env` → root `.env` → `backend/.env.local` → root
`.env.local` (later wins). Existing shell env vars still win over files.
Startup logs only report `apiKey=set` and never print the key.
## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness |
| `POST` | `/v1/propose-answer` | `{ context: AiQuestionContext }` → `AiProviderProposal` |

Request bodies use the existing P9 minimal context shape. Responses are Zod-
validated against the answer proposal contract (`proposed` / `unsupported` /
`error` + optional `AnswerValue`).

## Security rules

- Bind defaults to `127.0.0.1` (loopback only)
- Never log prompts, answers, profile values, or API keys
- Diagnostics are sanitized for key-like strings
- Mock provider remains the default for deterministic extension tests

## Status

P12A delivers the backend/provider boundary and configuration.
P12B wires Mock vs Local Gemini selection into the popup workflow.

See [ai-provider-selection.md](./ai-provider-selection.md).
