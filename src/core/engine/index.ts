/**
 * P11 fill-planning / review orchestration (DOM-free).
 * Bridges P7–P10 outputs to an approved FillPlan for the P5 fill engine.
 */

export { prepareAutofillReview } from './prepare';
export {
  applyReviewSelection,
  collectApprovedAnswers,
} from './review';
export { buildFillPlanFromApproved } from './fill-plan';
export type {
  AutofillPrepareReport,
  AutofillReviewItem,
  ApprovedFillAnswer,
  BuildFillPlanInput,
  BuildFillPlanRejection,
  BuildFillPlanResult,
  PrepareAutofillReviewInput,
  ReviewSelectionMap,
  ReviewSelectionPatch,
} from './types';
