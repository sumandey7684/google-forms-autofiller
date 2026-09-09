import type { DiscoveredControl, DiscoveredQuestion } from './types';
import type {
  ClassificationConfidence,
  ClassificationReport,
  ClassificationTotals,
  ClassifiedQuestion,
  ClassifierKind,
} from '@/core/types/classification-report';
import { emptyKindCounts } from '@/core/types/classification-report';
import { DiscoveryControlKind } from './selectors';

interface ControlFeatures {
  kind: DiscoveredControl['kind'];
  inputType: string | null;
  role: string | null;
  tagName: string;
  label: string | null;
}

function readFeatures(control: DiscoveredControl): ControlFeatures {
  const element = control.element;
  const tagName = element.tagName.toLowerCase();
  // Structural attributes only — never read value/checked/selected.
  const inputType =
    tagName === 'input' ? element.getAttribute('type')?.toLowerCase() ?? 'text' : null;
  const role = element.getAttribute('role');

  return {
    kind: control.kind,
    inputType,
    role,
    tagName,
    label: control.label ?? null,
  };
}

function isButtonLike(f: ControlFeatures): boolean {
  return (
    f.kind === DiscoveryControlKind.native_button ||
    f.kind === DiscoveryControlKind.aria_button
  );
}

function isRadioLike(f: ControlFeatures): boolean {
  return (
    f.kind === DiscoveryControlKind.aria_radio ||
    (f.kind === DiscoveryControlKind.native_input && f.inputType === 'radio')
  );
}

function isCheckboxLike(f: ControlFeatures): boolean {
  return (
    f.kind === DiscoveryControlKind.aria_checkbox ||
    (f.kind === DiscoveryControlKind.native_input && f.inputType === 'checkbox')
  );
}

function isRadiogroup(f: ControlFeatures): boolean {
  return f.kind === DiscoveryControlKind.aria_radiogroup;
}

function isTextareaLike(f: ControlFeatures): boolean {
  return (
    f.kind === DiscoveryControlKind.native_textarea ||
    f.kind === DiscoveryControlKind.contenteditable
  );
}

function isSingleLineTextInput(f: ControlFeatures): boolean {
  if (f.kind === DiscoveryControlKind.aria_textbox) {
    return true;
  }
  if (f.kind !== DiscoveryControlKind.native_input) {
    return false;
  }
  const type = f.inputType ?? 'text';
  return (
    type === 'text' ||
    type === 'email' ||
    type === 'tel' ||
    type === 'url' ||
    type === 'search' ||
    type === 'number' ||
    type === 'password'
  );
}

function isDateInput(f: ControlFeatures): boolean {
  return (
    f.kind === DiscoveryControlKind.native_input &&
    (f.inputType === 'date' || f.inputType === 'datetime-local' || f.inputType === 'month')
  );
}

function isTimeInput(f: ControlFeatures): boolean {
  return f.kind === DiscoveryControlKind.native_input && f.inputType === 'time';
}

function isFileInput(f: ControlFeatures): boolean {
  return f.kind === DiscoveryControlKind.native_input && f.inputType === 'file';
}

function isOptionLike(f: ControlFeatures): boolean {
  return f.kind === DiscoveryControlKind.aria_option;
}

function isNumericLabel(label: string | null): boolean {
  if (!label) {
    return false;
  }
  return /^-?\d+$/.test(label.trim());
}

/**
 * True when radio option labels form a consecutive integer sequence (len >= 3).
 */
function looksLikeLinearScale(radioFeatures: readonly ControlFeatures[]): boolean {
  const labels = radioFeatures
    .map((f) => f.label?.trim() ?? '')
    .filter((label) => label.length > 0);

  if (labels.length < 3) {
    return false;
  }
  if (!labels.every(isNumericLabel)) {
    return false;
  }

  const nums = labels.map((label) => Number.parseInt(label, 10));
  for (let i = 1; i < nums.length; i += 1) {
    const prev = nums[i - 1];
    const curr = nums[i];
    if (prev === undefined || curr === undefined) {
      return false;
    }
    if (Math.abs(curr - prev) !== 1) {
      return false;
    }
  }
  return true;
}

function result(
  question: DiscoveredQuestion,
  kind: ClassifierKind,
  confidence: ClassificationConfidence,
  signals: readonly string[],
  reason: string,
): ClassifiedQuestion {
  const classified: ClassifiedQuestion = {
    discoveryId: question.discoveryId,
    index: question.index,
    kind,
    confidence,
    signals,
    reason,
  };
  if (question.providerId !== undefined) {
    classified.providerId = question.providerId;
  }
  return classified;
}

/**
 * Deterministic classifier: DiscoveredQuestion → ClassifiedQuestion.
 * Operates on discovery output only. Does not mutate DOM or read answer values.
 */
export function classifyQuestion(question: DiscoveredQuestion): ClassifiedQuestion {
  const features = question.controls.map(readFeatures);
  const answerLike = features.filter((f) => !isButtonLike(f));
  const radios = features.filter(isRadioLike);
  const checkboxes = features.filter(isCheckboxLike);
  const radiogroups = features.filter(isRadiogroup);
  const textareas = features.filter(isTextareaLike);
  const options = features.filter(isOptionLike);
  const dateInputs = features.filter(isDateInput);
  const timeInputs = features.filter(isTimeInput);
  const fileInputs = features.filter(isFileInput);
  const textInputs = features.filter(isSingleLineTextInput);

  // --- Unsupported (strong structural evidence) ---
  if (fileInputs.length > 0) {
    return result(
      question,
      'unsupported',
      1,
      ['native-file-input'],
      'File input control indicates an unsupported file-upload question.',
    );
  }

  if (radiogroups.length >= 2) {
    return result(
      question,
      'unsupported',
      0.8,
      ['multiple-radiogroups', 'grid-like-structure'],
      'Multiple radiogroups in one container suggest a grid/matrix widget.',
    );
  }

  // --- Non-question (strong chrome / section evidence) ---
  if (features.length === 0) {
    return result(
      question,
      'non_question',
      question.diagnostics.hasTitleCandidate ? 0.8 : 0.4,
      question.diagnostics.hasTitleCandidate
        ? ['no-controls', 'title-only']
        : ['no-controls'],
      'No interactive controls — likely a section header or description block.',
    );
  }

  if (answerLike.length === 0 && features.every(isButtonLike)) {
    return result(
      question,
      'non_question',
      1,
      ['button-only-controls', 'navigation-or-submit'],
      'Only button/chrome controls — treat as non-question navigation/submit.',
    );
  }

  // Mixed selection widgets → unknown (do not guess)
  if (radios.length >= 1 && checkboxes.length >= 1) {
    return result(
      question,
      'unknown',
      0.4,
      ['radio-and-checkbox-controls', 'ambiguous'],
      'Both radio and checkbox controls present without a clear single type.',
    );
  }

  // --- Date / time (control type evidence only; ignore title wording) ---
  if (dateInputs.length === 1 && answerLike.length === 1) {
    return result(
      question,
      'date',
      1,
      ['native-date-input', 'single-control'],
      'Single native date-related input.',
    );
  }

  if (timeInputs.length === 1 && answerLike.length === 1) {
    return result(
      question,
      'time',
      1,
      ['native-time-input', 'single-control'],
      'Single native time input.',
    );
  }

  if (dateInputs.length > 0 && timeInputs.length > 0) {
    return result(
      question,
      'unknown',
      0.4,
      ['date-and-time-controls', 'ambiguous'],
      'Both date and time controls present without a clear single type.',
    );
  }

  // --- Paragraph ---
  if (textareas.length >= 1 && radios.length === 0 && checkboxes.length === 0) {
    if (textareas.length === 1 && textInputs.length === 0) {
      return result(
        question,
        'paragraph',
        1,
        ['textarea-or-contenteditable', 'single-multiline-control'],
        'Single multiline text control indicates a paragraph question.',
      );
    }
    if (textareas.length >= 1 && textInputs.length >= 1) {
      return result(
        question,
        'unknown',
        0.4,
        ['textarea-and-text-input', 'ambiguous'],
        'Both multiline and single-line text controls present.',
      );
    }
  }

  // --- Text ---
  if (
    textInputs.length === 1 &&
    answerLike.length === 1 &&
    radios.length === 0 &&
    checkboxes.length === 0 &&
    textareas.length === 0
  ) {
    return result(
      question,
      'text',
      1,
      ['single-line-text-input', 'single-control'],
      'Single short-answer text control.',
    );
  }

  // --- Dropdown ---
  // Require strong evidence: native <select>, or combobox/listbox with options.
  // A lone combobox without options is treated as unknown (weak signal).
  if (
    radios.length === 0 &&
    checkboxes.length === 0 &&
    textareas.length === 0
  ) {
    if (features.some((f) => f.kind === DiscoveryControlKind.native_select)) {
      return result(
        question,
        'dropdown',
        1,
        ['native-select'],
        'Native select control indicates a dropdown question.',
      );
    }

    const hasCombobox = features.some(
      (f) => f.kind === DiscoveryControlKind.aria_combobox,
    );
    const hasListbox = features.some(
      (f) => f.kind === DiscoveryControlKind.aria_listbox,
    );

    if ((hasCombobox || hasListbox) && options.length >= 1) {
      return result(
        question,
        'dropdown',
        0.8,
        ['aria-combobox-or-listbox', 'option-controls'],
        'Combobox/listbox with options indicates a dropdown-like question.',
      );
    }

    if (hasCombobox && options.length === 0 && !hasListbox) {
      return result(
        question,
        'unknown',
        0.4,
        ['weak-combobox-without-options'],
        'Combobox without options/listbox is insufficient for dropdown classification.',
      );
    }
  }

  // --- Checkbox ---
  if (checkboxes.length >= 1 && radios.length === 0 && textareas.length === 0) {
    if (textInputs.length === 0 && dateInputs.length === 0 && timeInputs.length === 0) {
      return result(
        question,
        'checkbox',
        checkboxes.length >= 2 ? 1 : 0.8,
        checkboxes.length >= 2
          ? ['checkbox-controls', 'multi-option']
          : ['checkbox-controls'],
        'Checkbox controls indicate a multi-select question.',
      );
    }
  }

  // --- Linear scale vs multiple choice ---
  if (radios.length >= 2 && checkboxes.length === 0 && textareas.length === 0) {
    if (looksLikeLinearScale(radios)) {
      return result(
        question,
        'linear_scale',
        0.8,
        ['radio-controls', 'consecutive-numeric-labels', 'scale-sequence'],
        'Consecutive numeric radio labels indicate a linear scale.',
      );
    }
    return result(
      question,
      'multiple_choice',
      radiogroups.length === 1 || radios.length >= 2 ? 1 : 0.8,
      radiogroups.length === 1
        ? ['radiogroup', 'radio-controls', 'single-selection']
        : ['radio-controls', 'single-selection'],
      'Radio controls indicate a single-selection multiple-choice question.',
    );
  }

  if (radiogroups.length === 1 && radios.length >= 1 && checkboxes.length === 0) {
    if (looksLikeLinearScale(radios)) {
      return result(
        question,
        'linear_scale',
        0.8,
        ['radiogroup', 'consecutive-numeric-labels'],
        'Radiogroup with consecutive numeric options indicates a linear scale.',
      );
    }
    return result(
      question,
      'multiple_choice',
      1,
      ['radiogroup', 'radio-controls'],
      'Radiogroup with radio options indicates multiple choice.',
    );
  }

  // --- Ambiguous leftovers ---
  if (features.every(isButtonLike) === false && answerLike.length >= 2 && radios.length === 0 && checkboxes.length === 0) {
    return result(
      question,
      'unknown',
      0.4,
      ['mixed-or-unfamiliar-controls'],
      'Control set does not match a supported semantic question pattern.',
    );
  }

  return result(
    question,
    'unknown',
    0.2,
    ['insufficient-signals'],
    'Insufficient structural evidence for a confident classification.',
  );
}

export function classifyQuestions(
  questions: readonly DiscoveredQuestion[],
): ClassifiedQuestion[] {
  return questions.map(classifyQuestion);
}

export function summarizeClassification(
  classified: readonly ClassifiedQuestion[],
  url: string,
): ClassificationReport {
  const byKind = emptyKindCounts();
  let fillable = 0;
  let unknown = 0;
  let nonQuestion = 0;
  let unsupported = 0;

  for (const item of classified) {
    byKind[item.kind] += 1;
    if (item.kind === 'unknown') {
      unknown += 1;
    } else if (item.kind === 'non_question') {
      nonQuestion += 1;
    } else if (item.kind === 'unsupported') {
      unsupported += 1;
    } else {
      fillable += 1;
    }
  }

  const totals: ClassificationTotals = {
    total: classified.length,
    fillable,
    unknown,
    nonQuestion,
    unsupported,
    byKind,
  };

  return { url, questions: classified, totals };
}

export function logClassificationSummary(report: ClassificationReport): void {
  console.info(
    [
      '[Google Form AutoFiller] Classification:',
      `total=${report.totals.total}`,
      `fillable=${report.totals.fillable}`,
      `unknown=${report.totals.unknown}`,
      `non_question=${report.totals.nonQuestion}`,
      `unsupported=${report.totals.unsupported}`,
    ].join('\n'),
  );
}
