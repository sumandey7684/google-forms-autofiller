import { GoogleFormsSelectors } from './selectors';
import type {
  DiscoveredControlEvidence,
  DiscoveredQuestion,
  DiscoveredQuestionDiagnostics,
} from './types';

const TEXT_PREVIEW_MAX = 80;

function isHTMLElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement;
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

/**
 * Collect control evidence without reading values, checked, or selected state.
 */
export function collectControlEvidence(
  element: HTMLElement,
): DiscoveredControlEvidence {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const inputType =
    tagName === 'input' ? element.getAttribute('type') : null;
  const ariaLabel = element.getAttribute('aria-label');
  const name = element.getAttribute('name');

  return {
    tagName,
    role,
    inputType,
    ariaLabel,
    name,
    dataAttributeNames: readDataAttributeNames(element),
  };
}

function uniqueElements(elements: readonly HTMLElement[]): HTMLElement[] {
  return Array.from(new Set(elements));
}

function findAnswerControls(container: HTMLElement): HTMLElement[] {
  const matches = Array.from(
    container.querySelectorAll(GoogleFormsSelectors.answerControl),
  ).filter(isHTMLElement);

  // Prefer the outermost control when a radiogroup wraps radios, etc.
  const filtered = matches.filter((element) => {
    const parentControl = element.parentElement?.closest(
      GoogleFormsSelectors.answerControl,
    );
    if (!(parentControl instanceof HTMLElement)) {
      return true;
    }
    // Keep both radiogroup and child radios — useful diagnostic evidence.
    // Drop nested textboxes inside other textboxes / contenteditables only.
    if (
      (element.getAttribute('role') === 'textbox' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'INPUT') &&
      parentControl !== element &&
      (parentControl.getAttribute('role') === 'textbox' ||
        parentControl.tagName === 'TEXTAREA')
    ) {
      return false;
    }
    return true;
  });

  return uniqueElements(filtered);
}

function findCandidateTextElement(container: HTMLElement): HTMLElement | null {
  const heading = container.querySelector(GoogleFormsSelectors.questionHeading);
  if (heading instanceof HTMLElement) {
    return heading;
  }

  // Structural fallback: first non-empty text-bearing block that is not a control.
  const walkerCandidates = Array.from(container.querySelectorAll('div, span, p, label'))
    .filter(isHTMLElement)
    .filter((element) => {
      if (element.closest(GoogleFormsSelectors.answerControl)) {
        return false;
      }
      if (element.closest(GoogleFormsSelectors.chromeControl)) {
        return false;
      }
      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text.length > 0;
    });

  return walkerCandidates[0] ?? null;
}

function findCandidateDescriptionElement(
  container: HTMLElement,
  textElement: HTMLElement | null,
): HTMLElement | null {
  if (textElement === null) {
    return null;
  }

  // Prefer aria-describedby targets when present on the container or controls.
  const describedBy = container.getAttribute('aria-describedby');
  if (describedBy) {
    const id = describedBy.split(/\s+/)[0];
    if (id) {
      const target = container.ownerDocument.getElementById(id);
      if (target instanceof HTMLElement && container.contains(target)) {
        return target;
      }
    }
  }

  const siblings = Array.from(textElement.parentElement?.children ?? []).filter(
    isHTMLElement,
  );
  const textIndex = siblings.indexOf(textElement);
  if (textIndex >= 0) {
    for (let i = textIndex + 1; i < siblings.length; i += 1) {
      const candidate = siblings[i];
      if (!candidate) {
        continue;
      }
      if (candidate.matches(GoogleFormsSelectors.answerControl)) {
        break;
      }
      if (candidate.querySelector(GoogleFormsSelectors.answerControl)) {
        break;
      }
      const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text.length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

function buildNotes(
  container: HTMLElement,
  controls: readonly HTMLElement[],
): string[] {
  const notes: string[] = [];
  const chrome = container.querySelector(GoogleFormsSelectors.chromeControl);
  if (chrome) {
    notes.push('Contains button/chrome controls');
  }
  if (controls.length === 0) {
    notes.push('No recognizable answer controls');
  }
  if (container.getAttribute('aria-required') === 'true') {
    notes.push('Container aria-required=true');
  }
  const requiredDescendant = container.querySelector('[aria-required="true"]');
  if (requiredDescendant) {
    notes.push('Descendant aria-required=true');
  }
  return notes;
}

function toDiagnostics(
  controls: readonly HTMLElement[],
  notes: readonly string[],
): DiscoveredQuestionDiagnostics {
  const controlEvidence = controls.map(collectControlEvidence);
  return {
    controlEvidence,
    hasRecognizableControls: controlEvidence.length > 0,
    notes,
  };
}

/**
 * Scan `root` for candidate Google Forms question containers.
 * Read-only: no mutations, clicks, focus, or value reads of answers.
 */
export function discoverQuestionContainers(
  root: ParentNode = document,
): DiscoveredQuestion[] {
  const lists =
    root instanceof Element || root instanceof Document
      ? Array.from(root.querySelectorAll(GoogleFormsSelectors.questionList))
      : [];

  const searchRoots: ParentNode[] =
    lists.length > 0 ? lists : root instanceof Document || root instanceof Element ? [root] : [];

  const containers: HTMLElement[] = [];
  for (const searchRoot of searchRoots) {
    const found = Array.from(
      searchRoot.querySelectorAll(GoogleFormsSelectors.questionContainer),
    ).filter(isHTMLElement);
    for (const container of found) {
      containers.push(container);
    }
  }

  const uniqueContainers = uniqueElements(containers);

  return uniqueContainers.map((container, index) => {
    const candidateControls = findAnswerControls(container);
    const candidateTextElement = findCandidateTextElement(container);
    const candidateDescriptionElement = findCandidateDescriptionElement(
      container,
      candidateTextElement,
    );
    const notes = buildNotes(container, candidateControls);

    return {
      index,
      container,
      candidateTextElement,
      candidateDescriptionElement,
      candidateControls,
      diagnostics: toDiagnostics(candidateControls, notes),
    };
  });
}

export function previewText(element: HTMLElement | null): string | null {
  if (!element) {
    return null;
  }
  const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (text.length === 0) {
    return null;
  }
  if (text.length <= TEXT_PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, TEXT_PREVIEW_MAX)}…`;
}
