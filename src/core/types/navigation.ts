/**
 * DOM-free navigation domain model (P6).
 * Independent of HTMLElement / Chrome APIs.
 */

export type NavigationAction = 'inspect' | 'next' | 'back';

/**
 * Explicit navigation / availability states.
 * Expected blocked conditions use these codes rather than thrown errors.
 */
export type NavigationStateCode =
  | 'single_section'
  | 'next_available'
  | 'back_available'
  | 'next_and_back_available'
  | 'no_next_button'
  | 'navigation_control_not_found'
  | 'navigation_blocked_by_required_fields'
  | 'ambiguous_navigation_control'
  | 'unsupported_branching'
  | 'submit_only_final_section';

export type NavigationOutcomeStatus =
  | 'inspected'
  | 'moved'
  | 'blocked'
  | 'unsupported'
  | 'failed';

export interface NavigationSectionSnapshot {
  /** Internal id for the currently visible page/section (not a Google Forms stable id). */
  sectionId: string;
  /** 0-based index when determinable; omitted when unknown. */
  index?: number;
  title?: string;
  questionCount: number;
  /** Current discovery ids visible on this section (order preserved). */
  discoveryIds: readonly string[];
}

export interface NavigationControlsSnapshot {
  nextAvailable: boolean;
  backAvailable: boolean;
  /** Submit control detected — must never be clicked by this layer. */
  submitPresent: boolean;
  nextLabel: string | null;
  backLabel: string | null;
  submitLabel: string | null;
}

export interface NavigationInspection {
  url: string;
  state: NavigationStateCode;
  section: NavigationSectionSnapshot;
  controls: NavigationControlsSnapshot;
  notes: readonly string[];
  /** Compact classification totals after P2/P3 on the visible DOM. */
  classifiedTotal: number;
  classifiedFillable: number;
  classifiedUnknown: number;
  classifiedUnsupported: number;
  classifiedNonQuestion: number;
}

export interface NavigationResult {
  action: NavigationAction;
  status: NavigationOutcomeStatus;
  /** Present for blocked / unsupported / failed outcomes. */
  state?: NavigationStateCode;
  message?: string;
  before: NavigationInspection;
  after?: NavigationInspection;
}

export function createInspectResult(
  inspection: NavigationInspection,
): NavigationResult {
  return {
    action: 'inspect',
    status: 'inspected',
    state: inspection.state,
    before: inspection,
  };
}
