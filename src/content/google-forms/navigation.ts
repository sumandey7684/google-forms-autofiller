/**
 * P6 — Google Forms section navigation (content/adapter layer).
 *
 * Inspects Next/Back/Submit chrome, navigates Next/Back only,
 * rediscovers + reclassifies after successful moves.
 * NEVER clicks Submit. Does not invent answers or fill across sections.
 */

import type {
  NavigationAction,
  NavigationControlsSnapshot,
  NavigationInspection,
  NavigationResult,
  NavigationStateCode,
} from '@/core/types/navigation';
import { createInspectResult } from '@/core/types/navigation';
import { discoverQuestionContainers, previewText } from './discovery';
import { classifyQuestions } from './classification';
import type { DiscoveredQuestion } from './types';

type NavKind = 'next' | 'back' | 'submit' | 'ambiguous' | 'other';

interface LabeledControl {
  element: HTMLElement;
  label: string;
  kind: NavKind;
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function readControlLabel(element: HTMLElement): string {
  const aria = normalizeLabel(element.getAttribute('aria-label') ?? '');
  if (aria) {
    return aria;
  }
  return normalizeLabel(element.textContent ?? '');
}

function classifyNavLabel(label: string): NavKind {
  const lower = label.toLowerCase();
  if (!lower) {
    return 'other';
  }

  const hasSubmit = /\bsubmit\b/.test(lower) || lower === 'submit';
  const hasNext =
    /\bnext\b/.test(lower) ||
    lower === 'next' ||
    /\bcontinue\b/.test(lower);
  const hasBack =
    /\bback\b/.test(lower) ||
    lower === 'back' ||
    /\bprevious\b/.test(lower) ||
    lower === 'prev';

  // Anything that looks like submit is treated as submit — never navigable.
  if (hasSubmit) {
    return 'submit';
  }
  if (hasNext && hasBack) {
    return 'ambiguous';
  }
  if (hasNext) {
    return 'next';
  }
  if (hasBack) {
    return 'back';
  }
  return 'other';
}

function isButtonLike(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  const type = element.getAttribute('type')?.toLowerCase();
  const role = element.getAttribute('role');
  if (tag === 'button') {
    return true;
  }
  if (tag === 'input' && (type === 'button' || type === 'submit' || type === 'image')) {
    return true;
  }
  if (role === 'button') {
    return true;
  }
  return false;
}

function isExplicitSubmitType(element: HTMLElement): boolean {
  const type = element.getAttribute('type')?.toLowerCase();
  return type === 'submit' || type === 'image';
}

/**
 * Collect navigation chrome candidates within root.
 * Prefers footer/action areas but falls back to any button-like control.
 * Does not use generated CSS class names.
 */
function collectNavCandidates(root: ParentNode): LabeledControl[] {
  const scope: ParentNode =
    root instanceof Element
      ? root
      : (root as Document).body ?? root;

  const nodes = Array.from(
    (scope as ParentNode).querySelectorAll(
      'button, input[type="button"], input[type="submit"], input[type="image"], [role="button"]',
    ),
  ).filter((node): node is HTMLElement => node instanceof HTMLElement);

  const results: LabeledControl[] = [];
  for (const element of nodes) {
    if (!isButtonLike(element)) {
      continue;
    }
    const label = readControlLabel(element);
    let kind = classifyNavLabel(label);
    if (isExplicitSubmitType(element)) {
      kind = 'submit';
    }
    results.push({ element, label, kind });
  }
  return results;
}

function pickUnique(
  candidates: readonly LabeledControl[],
  kind: 'next' | 'back' | 'submit',
): { control: LabeledControl | null; ambiguous: boolean } {
  const matches = candidates.filter((c) => c.kind === kind);
  if (matches.length === 0) {
    return { control: null, ambiguous: false };
  }
  if (matches.length > 1) {
    return { control: null, ambiguous: true };
  }
  return { control: matches[0] ?? null, ambiguous: false };
}

function resolveUrl(root: ParentNode): string {
  if (root instanceof Document) {
    return root.location?.href ?? 'about:blank';
  }
  if (root instanceof Element) {
    return root.ownerDocument.location?.href ?? 'about:blank';
  }
  return 'about:blank';
}

function sectionTitleFromDiscovered(
  discovered: readonly DiscoveredQuestion[],
): string | undefined {
  // Prefer a non_question heading-like candidate with a title and no answer controls.
  for (const q of discovered) {
    if (
      q.controls.length === 0 &&
      q.diagnostics.hasTitleCandidate &&
      q.titleElement
    ) {
      const title = previewText(q.titleElement);
      if (title) {
        return title;
      }
    }
  }
  return undefined;
}

function fingerprintVisible(root: ParentNode): string {
  const discovered = discoverQuestionContainers(root);
  return discovered
    .map((q) => {
      const title = previewText(q.titleElement) ?? '';
      const kinds = q.controls.map((c) => c.kind).join(',');
      const labels = q.controls
        .map((c) => c.label ?? '')
        .join('/');
      const containerId =
        q.container instanceof HTMLElement && q.container.id
          ? q.container.id
          : '';
      return `${q.discoveryId}#${containerId}#${title}#${kinds}#${labels}#${q.providerId ?? ''}`;
    })
    .join('|');
}

function hasUnfilledRequired(root: ParentNode): boolean {
  const discovered = discoverQuestionContainers(root);
  for (const q of discovered) {
    if (q.required !== true) {
      continue;
    }
    // Conservative: required text-like with empty value blocks next.
    for (const control of q.controls) {
      const el = control.element;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const type = el.type?.toLowerCase?.() ?? el.getAttribute('type')?.toLowerCase() ?? 'text';
        if (
          type === 'text' ||
          type === 'email' ||
          type === 'tel' ||
          type === 'url' ||
          type === 'search' ||
          type === 'password' ||
          el.tagName === 'TEXTAREA'
        ) {
          if (el.value.trim().length === 0) {
            return true;
          }
        }
      }
    }
  }

  // Fixture signal for blocked navigation (tests). Live: required empty fields above.
  if (root instanceof Element || root instanceof Document) {
    const flagged = (root as ParentNode).querySelector?.(
      '[data-nav-blocked="true"]',
    );
    if (flagged) {
      return true;
    }
  }
  return false;
}

function deriveState(args: {
  next: LabeledControl | null;
  back: LabeledControl | null;
  submit: LabeledControl | null;
  nextAmbiguous: boolean;
  backAmbiguous: boolean;
  submitAmbiguous: boolean;
  notes: string[];
}): NavigationStateCode {
  if (args.nextAmbiguous || args.backAmbiguous) {
    args.notes.push('Multiple navigation controls matched the same action label.');
    return 'ambiguous_navigation_control';
  }
  if (args.submitAmbiguous) {
    args.notes.push('Multiple submit-like controls detected (never clicked).');
  }

  const hasNext = args.next !== null;
  const hasBack = args.back !== null;
  const hasSubmit = args.submit !== null;

  if (!hasNext && !hasBack && !hasSubmit) {
    return 'single_section';
  }
  if (!hasNext && hasSubmit) {
    return 'submit_only_final_section';
  }
  if (!hasNext && hasBack) {
    return 'back_available';
  }
  if (hasNext && hasBack) {
    return 'next_and_back_available';
  }
  if (hasNext && !hasBack) {
    return 'next_available';
  }
  return 'no_next_button';
}

/**
 * Inspect navigation chrome + current visible questions (P2/P3).
 * Read-only — does not mutate the DOM.
 */
export function inspectNavigation(
  root: ParentNode = document,
): NavigationInspection {
  const url = resolveUrl(root);
  const notes: string[] = [];
  const candidates = collectNavCandidates(root);

  const nextPick = pickUnique(candidates, 'next');
  const backPick = pickUnique(candidates, 'back');
  const submitPick = pickUnique(candidates, 'submit');

  const ambiguousOther = candidates.some((c) => c.kind === 'ambiguous');
  if (ambiguousOther) {
    notes.push('Found control whose label mixes navigation intents.');
  }

  const state = ambiguousOther
    ? 'ambiguous_navigation_control'
    : deriveState({
        next: nextPick.control,
        back: backPick.control,
        submit: submitPick.control,
        nextAmbiguous: nextPick.ambiguous,
        backAmbiguous: backPick.ambiguous,
        submitAmbiguous: submitPick.ambiguous,
        notes,
      });

  const discovered = discoverQuestionContainers(root);
  const classified = classifyQuestions(discovered);

  let fillable = 0;
  let unknown = 0;
  let unsupported = 0;
  let nonQuestion = 0;
  for (const item of classified) {
    if (item.kind === 'unknown') unknown += 1;
    else if (item.kind === 'unsupported') unsupported += 1;
    else if (item.kind === 'non_question') nonQuestion += 1;
    else fillable += 1;
  }

  const title = sectionTitleFromDiscovered(discovered);
  const controls: NavigationControlsSnapshot = {
    nextAvailable: nextPick.control !== null && !nextPick.ambiguous && !ambiguousOther,
    backAvailable: backPick.control !== null && !backPick.ambiguous && !ambiguousOther,
    submitPresent: submitPick.control !== null || candidates.some((c) => c.kind === 'submit'),
    nextLabel: nextPick.control?.label ?? null,
    backLabel: backPick.control?.label ?? null,
    submitLabel: submitPick.control?.label ?? null,
  };

  if (controls.submitPresent) {
    notes.push('Submit control present — navigation layer will never click it.');
  }

  return {
    url,
    state,
    section: {
      sectionId: 'section:current',
      ...(title !== undefined ? { title } : {}),
      questionCount: discovered.length,
      discoveryIds: discovered.map((q) => q.discoveryId),
    },
    controls,
    notes,
    classifiedTotal: classified.length,
    classifiedFillable: fillable,
    classifiedUnknown: unknown,
    classifiedUnsupported: unsupported,
    classifiedNonQuestion: nonQuestion,
  };
}

function resolveActionControl(
  root: ParentNode,
  action: 'next' | 'back',
): {
  control: LabeledControl | null;
  inspection: NavigationInspection;
  block?: NavigationResult;
} {
  const inspection = inspectNavigation(root);
  if (
    inspection.state === 'ambiguous_navigation_control' ||
    inspection.state === 'unsupported_branching'
  ) {
    return {
      control: null,
      inspection,
      block: {
        action,
        status: inspection.state === 'unsupported_branching' ? 'unsupported' : 'blocked',
        state: inspection.state,
        message:
          inspection.state === 'unsupported_branching'
            ? 'Branching navigation is not supported.'
            : 'Navigation controls are ambiguous; refusing to click.',
        before: inspection,
      },
    };
  }

  const candidates = collectNavCandidates(root);
  const pick = pickUnique(candidates, action);
  if (pick.ambiguous) {
    return {
      control: null,
      inspection,
      block: {
        action,
        status: 'blocked',
        state: 'ambiguous_navigation_control',
        message: `Ambiguous ${action} controls; refusing to click.`,
        before: inspection,
      },
    };
  }
  if (!pick.control) {
    const state: NavigationStateCode =
      action === 'next'
        ? inspection.controls.submitPresent
          ? 'submit_only_final_section'
          : 'no_next_button'
        : 'navigation_control_not_found';
    return {
      control: null,
      inspection,
      block: {
        action,
        status: 'blocked',
        state,
        message:
          action === 'next'
            ? 'No safe Next control available (Submit is never clicked).'
            : 'No safe Back control available.',
        before: inspection,
      },
    };
  }

  // Hard safety: never click submit-classified controls.
  if (pick.control.kind === 'submit' || isExplicitSubmitType(pick.control.element)) {
    return {
      control: null,
      inspection,
      block: {
        action,
        status: 'blocked',
        state: 'submit_only_final_section',
        message: 'Refusing to click a Submit control.',
        before: inspection,
      },
    };
  }

  return { control: pick.control, inspection };
}

/**
 * Navigate next or back, then rediscover + reclassify the visible DOM.
 * Never clicks Submit. Returns structured blocked results for expected failures.
 */
export function navigateSection(
  action: 'next' | 'back',
  root: ParentNode = document,
): NavigationResult {
  const resolved = resolveActionControl(root, action);
  if (resolved.block) {
    return resolved.block;
  }

  const before = resolved.inspection;
  const control = resolved.control;
  if (!control) {
    return {
      action,
      status: 'failed',
      state: 'navigation_control_not_found',
      message: 'Navigation control resolution failed unexpectedly.',
      before,
    };
  }

  if (action === 'next' && hasUnfilledRequired(root)) {
    return {
      action,
      status: 'blocked',
      state: 'navigation_blocked_by_required_fields',
      message: 'Next blocked: required fields appear unfilled on the current section.',
      before,
    };
  }

  const beforeFp = fingerprintVisible(root);

  // Final guard immediately before click.
  if (
    control.kind === 'submit' ||
    isExplicitSubmitType(control.element) ||
    classifyNavLabel(control.label) === 'submit'
  ) {
    return {
      action,
      status: 'blocked',
      state: 'submit_only_final_section',
      message: 'Aborting click: control classified as Submit.',
      before,
    };
  }

  control.element.click();

  // Allow fixture scripts / page handlers to update visibility.
  const afterFp = fingerprintVisible(root);
  const after = inspectNavigation(root);

  if (afterFp === beforeFp && action === 'next' && hasUnfilledRequired(root)) {
    return {
      action,
      status: 'blocked',
      state: 'navigation_blocked_by_required_fields',
      message: 'Next click did not advance; required fields still blocking.',
      before,
      after,
    };
  }

  if (afterFp === beforeFp) {
    return {
      action,
      status: 'blocked',
      state: 'navigation_control_not_found',
      message:
        'Navigation click did not change the visible question set (no section advance detected).',
      before,
      after,
    };
  }

  return {
    action,
    status: 'moved',
    state: after.state,
    message: `Moved ${action}; rediscovered and reclassified visible questions.`,
    before,
    after,
  };
}

export function runNavigation(
  action: NavigationAction,
  root: ParentNode = document,
): NavigationResult {
  if (action === 'inspect') {
    return createInspectResult(inspectNavigation(root));
  }
  return navigateSection(action, root);
}

export function logNavigationSummary(result: NavigationResult): void {
  console.info(
    [
      '[Google Form AutoFiller] Navigation:',
      `action=${result.action}`,
      `status=${result.status}`,
      `state=${result.state ?? result.before.state}`,
      `questions=${result.after?.section.questionCount ?? result.before.section.questionCount}`,
      `next=${result.after?.controls.nextAvailable ?? result.before.controls.nextAvailable}`,
      `back=${result.after?.controls.backAvailable ?? result.before.controls.backAvailable}`,
      `submitPresent=${result.after?.controls.submitPresent ?? result.before.controls.submitPresent}`,
    ].join('\n'),
  );
}
