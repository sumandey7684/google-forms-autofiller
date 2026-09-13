import type { Form } from '@/core/types/form';
import type { FillResult } from '@/core/types/fill';
import { getProfile, type UserProfile } from '@/storage/profile';
import { getSavedAnswers } from '@/storage/saved-answers';
import { MockAiAnswerProvider } from '@/core/ai/mock-provider';
import type { ProfileValues } from '@/core/resolution/types';
import {
  prepareAutofillReview,
  applyReviewSelection,
  collectApprovedAnswers,
  buildFillPlanFromApproved,
  type AutofillPrepareReport,
  type AutofillReviewItem,
  type ReviewSelectionMap,
  type BuildFillPlanResult,
} from '@/core/engine/index';
import {
  loadActiveGoogleForm,
  fillActiveForm,
  describeActiveTabProblem,
  type ActiveTabProblem,
} from './active-tab';

const PROFILE_FIELDS = [
  'fullName',
  'email',
  'phone',
  'linkedInUrl',
  'portfolioUrl',
  'location',
  'notes',
] as const satisfies readonly (keyof ProfileValues)[];

function toProfileValues(profile: UserProfile | null): ProfileValues | null {
  if (profile === null) {
    return null;
  }
  const values: {
    -readonly [K in keyof ProfileValues]?: string;
  } = {};
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      values[field] = value;
    }
  }
  return values;
}

export type WorkflowPhase =
  | 'idle'
  | 'loading'
  | 'review'
  | 'filling'
  | 'filled'
  | 'error';

export interface WorkflowState {
  phase: WorkflowPhase;
  message: string | null;
  tabId: number | null;
  form: Form | null;
  prepare: AutofillPrepareReport | null;
  items: AutofillReviewItem[];
  fillResult: FillResult | null;
  planRejection: BuildFillPlanResult | null;
}

export function createInitialWorkflowState(): WorkflowState {
  return {
    phase: 'idle',
    message: null,
    tabId: null,
    form: null,
    prepare: null,
    items: [],
    fillResult: null,
    planRejection: null,
  };
}

/**
 * Detect active form → load profile/saved answers → P7–P10 prepare.
 * Uses the mock AI provider only (no live networking).
 */
export async function runDetectAndResolve(): Promise<
  | { ok: true; state: WorkflowState }
  | { ok: false; state: WorkflowState; problem?: ActiveTabProblem }
> {
  const loaded = await loadActiveGoogleForm();
  if ('kind' in loaded) {
    return {
      ok: false,
      problem: loaded,
      state: {
        ...createInitialWorkflowState(),
        phase: 'error',
        message: describeActiveTabProblem(loaded),
      },
    };
  }

  const profile = toProfileValues(await getProfile());
  const savedAnswers = await getSavedAnswers();
  const provider = new MockAiAnswerProvider();

  const prepare = await prepareAutofillReview({
    form: loaded.form,
    profile,
    savedAnswers,
    provider,
    includeProfileContext: false,
  });

  let message: string | null = null;
  if (prepare.profileEmpty) {
    message =
      'Profile is empty. Saved answers and mock AI may still resolve some questions.';
  }
  if (prepare.fillableCount === 0) {
    message =
      (message ? `${message} ` : '') +
      'No fillable answers yet — unresolved or unsupported questions need attention.';
  }

  return {
    ok: true,
    state: {
      phase: 'review',
      message,
      tabId: loaded.tabId,
      form: loaded.form,
      prepare,
      items: [...prepare.items],
      fillResult: null,
      planRejection: null,
    },
  };
}

/** Apply approval/edit patches against the prepared form. */
export function applyWorkflowReview(
  state: WorkflowState,
  selection: ReviewSelectionMap,
): WorkflowState {
  if (!state.form) {
    return state;
  }
  return {
    ...state,
    items: applyReviewSelection(state.items, selection, state.form),
    planRejection: null,
  };
}

/**
 * Build FillPlan from approved items and send FILL_FORM to the content script.
 */
export async function runApprovedFill(
  state: WorkflowState,
): Promise<WorkflowState> {
  if (state.tabId === null || !state.form) {
    return {
      ...state,
      phase: 'error',
      message: 'Missing active tab or form for fill.',
    };
  }

  const approved = collectApprovedAnswers(state.items);
  const built = buildFillPlanFromApproved({
    form: state.form,
    approved,
  });

  if (built.status !== 'ok' || !built.plan) {
    return {
      ...state,
      phase: 'review',
      planRejection: built,
      message:
        built.status === 'empty'
          ? 'No approved valid answers to fill.'
          : 'Some approved answers failed validation and were not filled.',
    };
  }

  const fill = await fillActiveForm(state.tabId, built.plan);
  if ('kind' in fill) {
    return {
      ...state,
      phase: 'error',
      message: describeActiveTabProblem(fill),
      planRejection: null,
    };
  }

  return {
    ...state,
    phase: 'filled',
    fillResult: fill,
    planRejection: null,
    message: `Filled ${fill.totals.successful} of ${fill.totals.total} approved fields. Submit stays manual.`,
  };
}

export function formatAnswerPreview(
  item: AutofillReviewItem,
): string {
  if (!item.value) {
    return '—';
  }
  if (item.value.kind === 'single') {
    return item.value.value;
  }
  return item.value.values.join(', ');
}
