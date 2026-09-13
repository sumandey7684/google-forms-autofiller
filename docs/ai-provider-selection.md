# P12B AI provider selection in the popup

## Purpose

P12B connects the P12A `HttpAiAnswerProvider` to the P11 review/fill workflow
with an explicit provider choice:

- **Mock** (default) — deterministic offline/test provider
- **Local Gemini backend** — `http://127.0.0.1:8787` via HTTP only

The Gemini API key never enters the extension. It stays in backend `.env.local`.

## Behavior

1. Popup loads stored preference (`chrome.storage.local`) or defaults to Mock.
2. Selecting Gemini probes `GET /healthz` and shows:
   - Mock provider active
   - Gemini backend configured
   - Gemini backend unavailable
3. Detect & resolve uses the selected provider inside `prepareAutofillReview`
   (P7 → P8 → P9 → P10).
4. Precedence is unchanged: exact saved → normalized saved → profile → AI.
5. Review still requires approve/edit before FillPlan / fill.
6. Submit is never clicked.

## Local run

Terminal A:

```bash
pnpm run backend:dev
```

Terminal B:

```bash
pnpm run dev
```

Then load the unpacked extension from `dist/`, open a Google Form, choose
**Local Gemini backend**, and run **Detect & resolve**.

## Safety

- No API keys in extension source or build output
- Profile context stays off for AI requests (`includeProfileContext: false`)
- Minimal P9 question context only for still-missing questions
- Invalid / missing / ambiguous / unsupported / provider_error remain visible
