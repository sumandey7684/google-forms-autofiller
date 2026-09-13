# P11 autofill workflow

## Purpose

P11 connects P7–P10 to the real extension workflow:

```text
Active Google Form tab
  → DETECT_FORM / EXTRACT_FORM (content)
  → load profile + saved answers (storage)
  → P7 match → P8 resolve → P9 mock AI fallback → P10 validate
  → popup review (approve / edit valid answers only)
  → FillPlan from approved fillable answers
  → FILL_FORM → P5 fill engine
  → user submits manually (never auto-submit)
```

## Pure core (`src/core/engine`)

| API | Role |
| --- | --- |
| `prepareAutofillReview` | P7→P10 prepare; emits review rows |
| `applyReviewSelection` | Approve / edit; edits re-run P10 |
| `collectApprovedAnswers` | Approved + fillable only |
| `buildFillPlanFromApproved` | Re-validates, then builds `FillPlan` |

These modules stay DOM-free. Chrome / React live in popup adapters.

## Popup adapters

- `src/popup/active-tab.ts` — active tab detection, existing content messages, explicit missing-tab / unsupported-page / unreachable-content / extraction errors
- `src/popup/workflow.ts` — storage + mock provider + prepare/fill orchestration
- `src/popup/App.tsx` — review UI with status badges and approve/edit controls

## Safety

- FillPlan includes only user-approved, P10-valid answers
- Mock AI provider only (no live networking or secrets)
- Submit is never clicked by fill or navigation
- Partial fill results are shown with success/failed/unsupported/skipped totals

## Known live-form limitations

- Scope is the **currently visible** DOM section (same as P4–P6)
- Multi-section auto-advance during fill is not implemented
- Discovery question ids are session/DOM ids, not permanent Google entry ids
- Empty profile is allowed; unresolved questions stay non-fillable
- Invalid upstream candidates without a retained value may surface as `missing` in P10 (edits and FillPlan builder still reject bad values explicitly)
- Live AI provider is still out of scope
