import {
  DiscoveryControlKind,
  ENTRY_NAME_PATTERN,
  GoogleFormsSelectors,
  type DiscoveryControlKind as ControlKind,
  type DiscoverySignal,
} from './selectors';
import type {
  DiscoveredControl,
  DiscoveredControlEvidence,
  DiscoveredQuestion,
  DiscoveredQuestionDiagnostics,
} from './types';

const TEXT_PREVIEW_MAX = 80;

function isHTMLElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement;
}

function uniqueElements(elements: readonly HTMLElement[]): HTMLElement[] {
  return Array.from(new Set(elements));
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function readDataAttributeNames(element: HTMLElement): readonly string[] {
  const names: string[] = [];
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith('data-')) {
      names.push(attribute.name);
    }
  }
  return names;
}

/** Exported for audit/smoke tests — exact `entry.<digits>` only. */
export function matchProviderId(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const match = raw.match(ENTRY_NAME_PATTERN);
  return match?.[0];
}

function classifyControlKind(element: HTMLElement): ControlKind {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');

  if (tag === 'textarea') {
    return DiscoveryControlKind.native_textarea;
  }
  if (tag === 'select') {
    return DiscoveryControlKind.native_select;
  }
  if (tag === 'button' || element.getAttribute('type') === 'submit') {
    return DiscoveryControlKind.native_button;
  }
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') {
      return DiscoveryControlKind.native_button;
    }
    return DiscoveryControlKind.native_input;
  }
  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    return DiscoveryControlKind.contenteditable;
  }

  switch (role) {
    case 'textbox':
      return DiscoveryControlKind.aria_textbox;
    case 'radio':
      return DiscoveryControlKind.aria_radio;
    case 'checkbox':
      return DiscoveryControlKind.aria_checkbox;
    case 'radiogroup':
      return DiscoveryControlKind.aria_radiogroup;
    case 'listbox':
      return DiscoveryControlKind.aria_listbox;
    case 'combobox':
      return DiscoveryControlKind.aria_combobox;
    case 'option':
      return DiscoveryControlKind.aria_option;
    case 'spinbutton':
      return DiscoveryControlKind.aria_spinbutton;
    case 'slider':
      return DiscoveryControlKind.aria_slider;
    case 'button':
      return DiscoveryControlKind.aria_button;
    default:
      return DiscoveryControlKind.other_interactive;
  }
}

function readControlLabel(element: HTMLElement): string | undefined {
  const ariaLabel = normalizeText(element.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) {
    const valueLabel = normalizeText(element.value);
    if (
      (element.type === 'button' ||
        element.type === 'submit' ||
        element.tagName === 'BUTTON') &&
      valueLabel
    ) {
      return valueLabel;
    }
  }

  return undefined;
}

function toControlEvidence(control: DiscoveredControl): DiscoveredControlEvidence {
  const element = control.element;
  const tagName = element.tagName.toLowerCase();
  return {
    kind: control.kind,
    tagName,
    role: element.getAttribute('role'),
    inputType: tagName === 'input' ? element.getAttribute('type') : null,
    ariaLabel: element.getAttribute('aria-label'),
    name: element.getAttribute('name'),
    hasProviderId: control.providerId !== undefined,
    dataAttributeNames: readDataAttributeNames(element),
  };
}

function findInteractiveControls(container: HTMLElement): HTMLElement[] {
  const matches = Array.from(
    container.querySelectorAll(GoogleFormsSelectors.interactiveControl),
  ).filter(isHTMLElement);

  return uniqueElements(
    matches.filter((element) => {
      const parent = element.parentElement?.closest(
        GoogleFormsSelectors.interactiveControl,
      );
      if (!(parent instanceof HTMLElement) || parent === element) {
        return true;
      }
      // Drop nested text inputs inside another textbox/contenteditable.
      const nestedText =
        element.getAttribute('role') === 'textbox' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'INPUT';
      const parentText =
        parent.getAttribute('role') === 'textbox' ||
        parent.tagName === 'TEXTAREA' ||
        parent.isContentEditable;
      return !(nestedText && parentText);
    }),
  );
}

function buildDiscoveredControls(container: HTMLElement): DiscoveredControl[] {
  return findInteractiveControls(container).map((element) => {
    const providerId = matchProviderId(element.getAttribute('name'));
    const label = readControlLabel(element);

    const control: DiscoveredControl = {
      element,
      kind: classifyControlKind(element),
    };
    if (providerId !== undefined) {
      control.providerId = providerId;
    }
    if (label !== undefined) {
      control.label = label;
    }
    return control;
  });
}

function findProviderId(
  container: HTMLElement,
  controls: readonly DiscoveredControl[],
): string | undefined {
  for (const control of controls) {
    if (control.providerId) {
      return control.providerId;
    }
  }

  const named = Array.from(
    container.querySelectorAll(GoogleFormsSelectors.providerIdControl),
  ).filter(isHTMLElement);

  for (const element of named) {
    const id = matchProviderId(element.getAttribute('name'));
    if (id) {
      return id;
    }
  }

  return undefined;
}

function findTitleElement(container: HTMLElement): HTMLElement | undefined {
  const heading = container.querySelector(GoogleFormsSelectors.questionHeading);
  if (heading instanceof HTMLElement) {
    return heading;
  }

  const candidates = Array.from(container.querySelectorAll('div, span, p, label'))
    .filter(isHTMLElement)
    .filter((element) => {
      if (element.closest(GoogleFormsSelectors.interactiveControl)) {
        return false;
      }
      return normalizeText(element.textContent).length > 0;
    });

  return candidates[0];
}

function findDescriptionElement(
  container: HTMLElement,
  titleElement: HTMLElement | undefined,
): HTMLElement | undefined {
  if (!titleElement) {
    return undefined;
  }

  const describedBy = container.getAttribute('aria-describedby');
  if (describedBy) {
    const id = describedBy.split(/\s+/).find(Boolean);
    if (id) {
      const target = container.ownerDocument.getElementById(id);
      if (target instanceof HTMLElement && container.contains(target)) {
        return target;
      }
    }
  }

  const siblings = Array.from(titleElement.parentElement?.children ?? []).filter(
    isHTMLElement,
  );
  const titleIndex = siblings.indexOf(titleElement);
  if (titleIndex < 0) {
    return undefined;
  }

  for (let i = titleIndex + 1; i < siblings.length; i += 1) {
    const candidate = siblings[i];
    if (!candidate) {
      continue;
    }
    if (candidate.matches(GoogleFormsSelectors.interactiveControl)) {
      break;
    }
    if (candidate.querySelector(GoogleFormsSelectors.interactiveControl)) {
      break;
    }
    if (normalizeText(candidate.textContent).length > 0) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Resolve required state from collected explicit signals.
 * Conflicting true+false → undefined (unknown), not a guess.
 */
export function resolveRequiredState(
  sawTrue: boolean,
  sawFalse: boolean,
): boolean | undefined {
  if (sawTrue && sawFalse) {
    return undefined;
  }
  if (sawTrue) {
    return true;
  }
  if (sawFalse) {
    return false;
  }
  return undefined;
}

/**
 * Conservative required detection.
 * Returns undefined when signals conflict or only weak visual hints exist.
 */
export function detectRequiredState(
  container: HTMLElement,
  controls: readonly DiscoveredControl[],
): boolean | undefined {
  let sawTrue = false;
  let sawFalse = false;

  const consider = (element: Element): void => {
    const ariaRequired = element.getAttribute('aria-required');
    if (ariaRequired === 'true') {
      sawTrue = true;
    } else if (ariaRequired === 'false') {
      sawFalse = true;
    }
    if (element.hasAttribute('required')) {
      sawTrue = true;
    }
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      if (element.required) {
        sawTrue = true;
      }
    }
  };

  consider(container);
  for (const control of controls) {
    consider(control.element);
  }

  if (container.querySelector(GoogleFormsSelectors.requiredTrue)) {
    sawTrue = true;
  }
  if (container.querySelector(GoogleFormsSelectors.requiredFalse)) {
    sawFalse = true;
  }

  // A visible "*" alone is intentionally insufficient.
  return resolveRequiredState(sawTrue, sawFalse);
}

function buildNotes(
  controls: readonly DiscoveredControl[],
  titleElement: HTMLElement | undefined,
  providerId: string | undefined,
  required: boolean | undefined,
): string[] {
  const notes: string[] = [];
  if (!titleElement) {
    notes.push('Missing title candidate');
  }
  if (controls.length === 0) {
    notes.push('No interactive controls');
  }
  if (!providerId) {
    notes.push('No provider entry id');
  }
  if (required === undefined) {
    notes.push('Required state unknown');
  }
  const onlyButtons = controls.length > 0 && controls.every(
    (control) =>
      control.kind === DiscoveryControlKind.native_button ||
      control.kind === DiscoveryControlKind.aria_button,
  );
  if (onlyButtons) {
    notes.push('Only button/chrome controls');
  }
  return notes;
}

function isAnswerLike(control: DiscoveredControl): boolean {
  return (
    control.kind !== DiscoveryControlKind.native_button &&
    control.kind !== DiscoveryControlKind.aria_button
  );
}

function toQuestion(
  container: HTMLElement,
  index: number,
  signal: DiscoverySignal,
): DiscoveredQuestion {
  const controls = buildDiscoveredControls(container);
  const titleElement = findTitleElement(container);
  const descriptionElement = findDescriptionElement(container, titleElement);
  const providerId = findProviderId(container, controls);
  const required = detectRequiredState(container, controls);
  const notes = buildNotes(controls, titleElement, providerId, required);
  const answerLikeControls = controls.filter(isAnswerLike);

  const diagnostics: DiscoveredQuestionDiagnostics = {
    signal,
    hasInteractiveControls: answerLikeControls.length > 0,
    hasTitleCandidate: titleElement !== undefined,
    hasDescriptionCandidate: descriptionElement !== undefined,
    hasProviderId: providerId !== undefined,
    requiredKnown: required !== undefined,
    notes,
    controlEvidence: controls.map(toControlEvidence),
  };

  const question: DiscoveredQuestion = {
    discoveryId: `discovery:q-${index}`,
    index,
    container,
    controls,
    diagnostics,
  };

  if (providerId !== undefined) {
    question.providerId = providerId;
  }
  if (titleElement !== undefined) {
    question.titleElement = titleElement;
  }
  if (descriptionElement !== undefined) {
    question.descriptionElement = descriptionElement;
  }
  if (required !== undefined) {
    question.required = required;
  }

  return question;
}

function collectContainers(root: ParentNode): {
  containers: HTMLElement[];
  signal: DiscoverySignal;
} {
  const lists =
    root instanceof Element || root instanceof Document
      ? Array.from(root.querySelectorAll(GoogleFormsSelectors.questionList))
      : [];

  const searchRoots: ParentNode[] =
    lists.length > 0
      ? lists
      : root instanceof Document || root instanceof Element
        ? [root]
        : [];

  const listItems: HTMLElement[] = [];
  for (const searchRoot of searchRoots) {
    listItems.push(
      ...Array.from(
        searchRoot.querySelectorAll(GoogleFormsSelectors.questionContainer),
      ).filter(isHTMLElement),
    );
  }

  const uniqueListItems = uniqueElements(listItems);
  if (uniqueListItems.length > 0) {
    return { containers: uniqueListItems, signal: 'role-listitem' };
  }

  if (root instanceof Element || root instanceof Document) {
    // Keep only top-level [data-params] nodes (not nested inside another).
    const fallback = uniqueElements(
      Array.from(
        root.querySelectorAll(GoogleFormsSelectors.questionContainerFallback),
      )
        .filter(isHTMLElement)
        .filter((element) => {
          const nestedParent = element.parentElement?.closest(
            GoogleFormsSelectors.questionContainerFallback,
          );
          return nestedParent === null || nestedParent === undefined;
        }),
    );
    if (fallback.length > 0) {
      return { containers: fallback, signal: 'data-params-fallback' };
    }
  }

  return { containers: [], signal: 'none' };
}

/**
 * Scan `root` for candidate Google Forms question containers.
 * Read-only: no mutations, clicks, focus changes, or messaging of answer values.
 */
export function discoverQuestionContainers(
  root: ParentNode = document,
): DiscoveredQuestion[] {
  const { containers, signal } = collectContainers(root);
  return containers.map((container, index) =>
    toQuestion(container, index, signal),
  );
}

export function previewText(element: HTMLElement | undefined | null): string | null {
  if (!element) {
    return null;
  }
  const text = normalizeText(element.textContent);
  if (text.length === 0) {
    return null;
  }
  if (text.length <= TEXT_PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, TEXT_PREVIEW_MAX)}…`;
}

export function toSafeControlEvidence(
  control: DiscoveredControl,
): DiscoveredControlEvidence {
  return toControlEvidence(control);
}
