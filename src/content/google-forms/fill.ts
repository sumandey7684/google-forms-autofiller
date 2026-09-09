/**
 * P5 — Fill Engine (Google Forms provider layer).
 * Applies an authoritative FillPlan to the currently visible DOM.
 * Does not invent answers, navigate, submit, or access profile/AI/network.
 */

import type { AnswerValue } from '@/core/types/answer';
import type {
  FillOperation,
  FillOperationResult,
  FillPlan,
  FillResult,
} from '@/core/types/fill';
import { createFillResult } from '@/core/types/fill';
import { ErrorCode } from '@/core/types/errors';
import type { ClassifiedQuestion, ClassifierKind } from '@/core/types/classification-report';
import type { DiscoveredControl, DiscoveredQuestion } from './types';
import { DiscoveryControlKind } from './selectors';
import { discoverQuestionContainers } from './discovery';
import { classifyQuestions } from './classification';

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function failed(
  questionId: string,
  message: string,
  errorCode: typeof ErrorCode[keyof typeof ErrorCode] = ErrorCode.FILL_FAILED,
): FillOperationResult {
  return { questionId, status: 'failed', errorCode, message };
}

function unsupported(questionId: string, message: string): FillOperationResult {
  return {
    questionId,
    status: 'unsupported',
    errorCode: ErrorCode.UNSUPPORTED_QUESTION,
    message,
  };
}

function success(questionId: string, message?: string): FillOperationResult {
  return message
    ? { questionId, status: 'success', message }
    : { questionId, status: 'success' };
}

function isNavigationOrSubmitControl(element: HTMLElement): boolean {
  const type = element.getAttribute('type')?.toLowerCase();
  if (type === 'submit' || type === 'reset' || type === 'image') {
    return true;
  }

  const role = element.getAttribute('role');
  const tag = element.tagName.toLowerCase();
  const isButtonLike =
    tag === 'button' || type === 'button' || role === 'button';

  if (!isButtonLike) {
    return false;
  }

  const label = normalizeLabel(
    `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`,
  ).toLowerCase();

  return (
    label === 'submit' ||
    label === 'next' ||
    label === 'back' ||
    label === 'continue' ||
    /\bsubmit\b/.test(label) ||
    /\bnext\b/.test(label) ||
    /\bback\b/.test(label)
  );
}

function dispatchValueEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function safeClick(element: HTMLElement): boolean {
  if (isNavigationOrSubmitControl(element)) {
    return false;
  }
  element.click();
  return true;
}

function controlLabel(control: DiscoveredControl): string {
  return control.label ? normalizeLabel(control.label) : '';
}

function optionIdFor(discoveryId: string, index: number): string {
  return `opt:${discoveryId}:${index}`;
}

function matchesOptionToken(
  token: string,
  label: string,
  discoveryId: string,
  index: number,
): boolean {
  const wanted = normalizeLabel(token);
  if (!wanted) {
    return false;
  }
  if (wanted === label) {
    return true;
  }
  return wanted === optionIdFor(discoveryId, index);
}

function findTextControl(
  question: DiscoveredQuestion,
): HTMLElement | null {
  for (const control of question.controls) {
    const el = control.element;
    if (control.kind === DiscoveryControlKind.native_textarea) {
      return el;
    }
    if (control.kind === DiscoveryControlKind.contenteditable) {
      return el;
    }
    if (control.kind === DiscoveryControlKind.aria_textbox) {
      return el;
    }
    if (control.kind === DiscoveryControlKind.native_input) {
      const type = el.getAttribute('type')?.toLowerCase() ?? 'text';
      if (
        type === 'text' ||
        type === 'email' ||
        type === 'tel' ||
        type === 'url' ||
        type === 'search' ||
        type === 'number' ||
        type === 'password'
      ) {
        return el;
      }
    }
  }
  return null;
}

function findDateOrTimeControl(
  question: DiscoveredQuestion,
  kind: 'date' | 'time',
): HTMLInputElement | null {
  for (const control of question.controls) {
    if (control.kind !== DiscoveryControlKind.native_input) {
      continue;
    }
    const el = control.element;
    if (!(el instanceof HTMLInputElement)) {
      continue;
    }
    const type = el.type?.toLowerCase() ?? el.getAttribute('type')?.toLowerCase();
    if (kind === 'date' && (type === 'date' || type === 'datetime-local' || type === 'month')) {
      return el;
    }
    if (kind === 'time' && type === 'time') {
      return el;
    }
  }
  return null;
}

function setTextLikeValue(element: HTMLElement, value: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    dispatchValueEvents(element);
    return element.value === value;
  }
  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    element.textContent = value;
    dispatchValueEvents(element);
    return normalizeLabel(element.textContent ?? '') === normalizeLabel(value);
  }
  // ARIA textbox without native value — set textContent best-effort.
  if (element.getAttribute('role') === 'textbox') {
    element.textContent = value;
    dispatchValueEvents(element);
    return normalizeLabel(element.textContent ?? '') === normalizeLabel(value);
  }
  return false;
}

function isChecked(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    return element.checked;
  }
  const aria = element.getAttribute('aria-checked');
  return aria === 'true';
}

function setChecked(element: HTMLElement, checked: boolean): boolean {
  if (isNavigationOrSubmitControl(element)) {
    return false;
  }
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    if (element.checked === checked) {
      return true;
    }
    element.checked = checked;
    dispatchValueEvents(element);
    return element.checked === checked;
  }

  // ARIA widgets: click only when state needs to change.
  if (isChecked(element) === checked) {
    return true;
  }
  if (!safeClick(element)) {
    return false;
  }
  // Linkedom / simple fixtures: set aria-checked after click.
  element.setAttribute('aria-checked', checked ? 'true' : 'false');
  if (checked && element.getAttribute('role') === 'radio') {
    // Uncheck sibling radios in the same question container.
    const root = element.closest('[role="listitem"]') ?? element.parentElement;
    if (root) {
      for (const sibling of Array.from(root.querySelectorAll('[role="radio"]'))) {
        if (sibling !== element && sibling instanceof HTMLElement) {
          sibling.setAttribute('aria-checked', 'false');
        }
      }
    }
  }
  return isChecked(element) === checked;
}

function collectChoiceControls(
  question: DiscoveredQuestion,
  mode: 'radio' | 'checkbox' | 'option',
): DiscoveredControl[] {
  return question.controls.filter((control) => {
    if (mode === 'radio') {
      return (
        control.kind === DiscoveryControlKind.aria_radio ||
        (control.kind === DiscoveryControlKind.native_input &&
          control.element.getAttribute('type')?.toLowerCase() === 'radio')
      );
    }
    if (mode === 'checkbox') {
      return (
        control.kind === DiscoveryControlKind.aria_checkbox ||
        (control.kind === DiscoveryControlKind.native_input &&
          control.element.getAttribute('type')?.toLowerCase() === 'checkbox')
      );
    }
    return control.kind === DiscoveryControlKind.aria_option;
  });
}

function fillSingleChoice(
  question: DiscoveredQuestion,
  token: string,
  mode: 'radio' | 'option',
): FillOperationResult {
  const controls = collectChoiceControls(question, mode);
  // Also try native select options for dropdown.
  if (mode === 'option') {
    for (const control of question.controls) {
      if (control.kind !== DiscoveryControlKind.native_select) {
        continue;
      }
      const select = control.element;
      const options =
        select instanceof HTMLSelectElement
          ? Array.from(select.options)
          : Array.from(select.querySelectorAll('option'));
      for (let i = 0; i < options.length; i += 1) {
        const opt = options[i];
        if (!opt) continue;
        const label = normalizeLabel(
          ('text' in opt && typeof (opt as HTMLOptionElement).text === 'string'
            ? (opt as HTMLOptionElement).text
            : opt.textContent) ?? '',
        );
        if (!matchesOptionToken(token, label, question.discoveryId, i)) {
          continue;
        }
        if (select instanceof HTMLSelectElement || select.tagName.toLowerCase() === 'select') {
          const optionNodes = Array.from(select.querySelectorAll('option'));
          for (let j = 0; j < optionNodes.length; j += 1) {
            const node = optionNodes[j];
            if (!node) continue;
            if (j === i) {
              node.setAttribute('selected', 'selected');
              if ('selected' in node) {
                try {
                  (node as HTMLOptionElement).selected = true;
                } catch {
                  // ignore
                }
              }
            } else {
              node.removeAttribute('selected');
              if ('selected' in node) {
                try {
                  (node as HTMLOptionElement).selected = false;
                } catch {
                  // ignore
                }
              }
            }
          }
          try {
            if (select instanceof HTMLSelectElement) {
              select.selectedIndex = i;
            }
          } catch {
            // linkedom may not support selectedIndex assignment
          }
          dispatchValueEvents(select as HTMLElement);

          const selectedNode =
            select.querySelector('option[selected]') ?? optionNodes[i] ?? null;
          const selectedLabel = normalizeLabel(
            selectedNode instanceof HTMLOptionElement
              ? selectedNode.text || selectedNode.label || selectedNode.textContent || ''
              : selectedNode?.textContent ?? '',
          );
          if (
            selectedLabel === label ||
            matchesOptionToken(token, selectedLabel, question.discoveryId, i)
          ) {
            return success(question.discoveryId);
          }
          return failed(question.discoveryId, 'Native select value did not stick.');
        }
      }
    }
  }

  let matchIndex = -1;
  let match: DiscoveredControl | undefined;
  for (let i = 0; i < controls.length; i += 1) {
    const control = controls[i];
    if (!control) continue;
    const label = controlLabel(control);
    if (matchesOptionToken(token, label, question.discoveryId, i)) {
      match = control;
      matchIndex = i;
      break;
    }
  }

  if (!match) {
    return failed(
      question.discoveryId,
      `No option matching "${normalizeLabel(token)}" at index search (saw ${controls.length} choices).`,
    );
  }

  void matchIndex;
  if (!setChecked(match.element, true)) {
    return failed(question.discoveryId, 'Failed to select the requested option.');
  }
  if (!isChecked(match.element)) {
    return failed(question.discoveryId, 'Option selection could not be verified.');
  }
  return success(question.discoveryId);
}

function fillCheckboxMulti(
  question: DiscoveredQuestion,
  tokens: readonly string[],
): FillOperationResult {
  const controls = collectChoiceControls(question, 'checkbox');
  const wanted = new Set<DiscoveredControl>();

  for (const token of tokens) {
    let found: DiscoveredControl | undefined;
    for (let i = 0; i < controls.length; i += 1) {
      const control = controls[i];
      if (!control) continue;
      const label = controlLabel(control);
      if (matchesOptionToken(token, label, question.discoveryId, i)) {
        found = control;
        break;
      }
    }
    if (!found) {
      return failed(
        question.discoveryId,
        `Checkbox option not found for "${normalizeLabel(token)}".`,
      );
    }
    wanted.add(found);
  }

  // Exact-set semantics: requested options checked; all others unchecked.
  for (const control of controls) {
    const shouldBeChecked = wanted.has(control);
    if (isChecked(control.element) === shouldBeChecked) {
      // Already-correct (including already-checked requested) — do not toggle.
      continue;
    }
    if (!setChecked(control.element, shouldBeChecked)) {
      return failed(
        question.discoveryId,
        shouldBeChecked
          ? 'Failed to check a requested checkbox option.'
          : 'Failed to uncheck an unrequested checkbox option.',
      );
    }
  }

  for (const control of controls) {
    const shouldBeChecked = wanted.has(control);
    if (isChecked(control.element) !== shouldBeChecked) {
      return failed(
        question.discoveryId,
        'Checkbox exact selection could not be verified.',
      );
    }
  }

  return success(question.discoveryId);
}

function expectSingle(value: AnswerValue, questionId: string): string | FillOperationResult {
  if (value.kind !== 'single') {
    return failed(questionId, 'Expected a single answer value for this question type.');
  }
  return value.value;
}

function expectMulti(
  value: AnswerValue,
  questionId: string,
): readonly string[] | FillOperationResult {
  if (value.kind !== 'multi') {
    return failed(questionId, 'Expected a multi answer value for checkbox questions.');
  }
  return value.values;
}

function isFillOperationResult(value: unknown): value is FillOperationResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'questionId' in value
  );
}

function fillByKind(
  question: DiscoveredQuestion,
  kind: ClassifierKind,
  value: AnswerValue,
): FillOperationResult {
  if (kind === 'non_question') {
    return unsupported(question.discoveryId, 'Target is a non-question; cannot fill.');
  }
  if (kind === 'unsupported') {
    return unsupported(question.discoveryId, 'Target question type is unsupported for fill.');
  }
  if (kind === 'unknown') {
    return unsupported(question.discoveryId, 'Unknown question type cannot be filled safely.');
  }

  switch (kind) {
    case 'text':
    case 'paragraph': {
      const single = expectSingle(value, question.discoveryId);
      if (isFillOperationResult(single)) return single;
      const control = findTextControl(question);
      if (!control) {
        return failed(question.discoveryId, 'No text control found for fill.');
      }
      if (!setTextLikeValue(control, single)) {
        return failed(question.discoveryId, 'Text value could not be applied or verified.');
      }
      return success(question.discoveryId);
    }
    case 'multiple_choice': {
      const single = expectSingle(value, question.discoveryId);
      if (isFillOperationResult(single)) return single;
      return fillSingleChoice(question, single, 'radio');
    }
    case 'checkbox': {
      const multi = expectMulti(value, question.discoveryId);
      if (isFillOperationResult(multi)) return multi;
      return fillCheckboxMulti(question, multi);
    }
    case 'dropdown': {
      const single = expectSingle(value, question.discoveryId);
      if (isFillOperationResult(single)) return single;
      // Prefer native select / aria options.
      const viaOption = fillSingleChoice(question, single, 'option');
      if (viaOption.status === 'success') {
        return viaOption;
      }
      // Some fixtures only expose radios as dropdown-like — already handled above.
      return viaOption;
    }
    case 'linear_scale': {
      const single = expectSingle(value, question.discoveryId);
      if (isFillOperationResult(single)) return single;
      const token = normalizeLabel(single);
      if (!/^-?\d+$/.test(token)) {
        return failed(
          question.discoveryId,
          'Linear scale answer must be an integer matching an available option.',
        );
      }
      return fillSingleChoice(question, token, 'radio');
    }
    case 'date': {
      const single = expectSingle(value, question.discoveryId);
      if (isFillOperationResult(single)) return single;
      // Strict: YYYY-MM-DD only for native date inputs.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(single.trim())) {
        return failed(
          question.discoveryId,
          'Date answer must be YYYY-MM-DD for native date controls.',
        );
      }
      const control = findDateOrTimeControl(question, 'date');
      if (!control) {
        return failed(question.discoveryId, 'No date control found.');
      }
      if (!setTextLikeValue(control, single.trim())) {
        return failed(question.discoveryId, 'Date value could not be applied or verified.');
      }
      return success(question.discoveryId);
    }
    case 'time': {
      const single = expectSingle(value, question.discoveryId);
      if (isFillOperationResult(single)) return single;
      // Strict: HH:MM or HH:MM:SS
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(single.trim())) {
        return failed(
          question.discoveryId,
          'Time answer must be HH:MM or HH:MM:SS for native time controls.',
        );
      }
      const control = findDateOrTimeControl(question, 'time');
      if (!control) {
        return failed(question.discoveryId, 'No time control found.');
      }
      if (!setTextLikeValue(control, single.trim())) {
        return failed(question.discoveryId, 'Time value could not be applied or verified.');
      }
      return success(question.discoveryId);
    }
    default:
      return unsupported(question.discoveryId, `Kind ${kind} is not fillable.`);
  }
}

function indexCurrentQuestions(root: ParentNode): {
  byId: Map<string, { discovered: DiscoveredQuestion; classified: ClassifiedQuestion }>;
} {
  const discovered = discoverQuestionContainers(root);
  const classified = classifyQuestions(discovered);
  const byClass = new Map(classified.map((c) => [c.discoveryId, c]));
  const byId = new Map<
    string,
    { discovered: DiscoveredQuestion; classified: ClassifiedQuestion }
  >();

  for (const q of discovered) {
    const c = byClass.get(q.discoveryId);
    if (c) {
      byId.set(q.discoveryId, { discovered: q, classified: c });
    }
  }
  return { byId };
}

/**
 * Apply a FillPlan against the currently visible DOM under `root`.
 * Partial failures do not roll back earlier successful operations.
 */
export function applyFillPlan(
  plan: FillPlan,
  root: ParentNode = document,
): FillResult {
  const { byId } = indexCurrentQuestions(root);
  const results: FillOperationResult[] = [];

  for (const operation of plan.operations) {
    results.push(applyOneOperation(operation, byId));
  }

  return createFillResult(plan.formId, results);
}

function applyOneOperation(
  operation: FillOperation,
  byId: Map<string, { discovered: DiscoveredQuestion; classified: ClassifiedQuestion }>,
): FillOperationResult {
  const target = byId.get(operation.questionId);
  if (!target) {
    return failed(
      operation.questionId,
      'Target question not found in the currently visible DOM.',
      ErrorCode.FILL_FAILED,
    );
  }

  // Validate before mutation: classified kind must be fillable with compatible value.
  const kind = target.classified.kind;
  if (kind === 'checkbox' && operation.value.kind !== 'multi') {
    return failed(
      operation.questionId,
      'Checkbox fill requires a multi answer value.',
    );
  }
  if (
    kind !== 'checkbox' &&
    kind !== 'non_question' &&
    kind !== 'unsupported' &&
    kind !== 'unknown' &&
    operation.value.kind !== 'single'
  ) {
    return failed(
      operation.questionId,
      `Question kind "${kind}" requires a single answer value.`,
    );
  }

  return fillByKind(target.discovered, kind, operation.value);
}

export function logFillSummary(result: FillResult): void {
  console.info(
    [
      '[Google Form AutoFiller] Fill:',
      `total=${result.totals.total}`,
      `successful=${result.totals.successful}`,
      `failed=${result.totals.failed}`,
      `skipped=${result.totals.skipped}`,
      `unsupported=${result.totals.unsupported}`,
    ].join('\n'),
  );
}
