/**
 * P4 — Normalize P2 discovery + P3 classification into core Form.
 * Consumes DiscoveredQuestion / ClassifiedQuestion only (no re-discovery).
 * Reads structural labels from already-discovered controls; never answer state.
 */

import type {
  Form,
  Question,
  QuestionMetadata,
  QuestionOption,
  Section,
  QuestionType,
} from '@/core/types/form';
import type { ClassifiedQuestion, ClassifierKind } from '@/core/types/classification-report';
import type {
  ExtractionQuestionDiag,
  ExtractionReport,
  ExtractionResult,
  ExtractionWarning,
} from '@/core/types/extraction-report';
import type { DiscoveredControl, DiscoveredQuestion } from './types';
import { DiscoveryControlKind } from './selectors';
import { previewText } from './discovery';

export interface ExtractFormMetadata {
  url: string;
  /** ISO timestamp — caller-supplied so extraction stays deterministic in tests. */
  extractedAt: string;
  formId?: string;
  formTitle?: string;
  formDescription?: string;
  /** Default section id when no multi-section model exists yet. */
  sectionId?: string;
  sectionTitle?: string;
}

const DEFAULT_SECTION_ID = 'section:current';
/** Structural placeholder — means "currently visible page", not a Forms section title. */
const DEFAULT_SECTION_TITLE = 'Currently visible page';

function normalizeDisplayText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isQuestionType(kind: ClassifierKind): kind is QuestionType {
  return (
    kind === 'text' ||
    kind === 'paragraph' ||
    kind === 'multiple_choice' ||
    kind === 'checkbox' ||
    kind === 'dropdown' ||
    kind === 'linear_scale' ||
    kind === 'date' ||
    kind === 'time' ||
    kind === 'unknown'
  );
}

function isOptionBearingControl(control: DiscoveredControl): boolean {
  const kind = control.kind;
  return (
    kind === DiscoveryControlKind.aria_radio ||
    kind === DiscoveryControlKind.aria_checkbox ||
    kind === DiscoveryControlKind.aria_option ||
    (kind === DiscoveryControlKind.native_input &&
      (control.element.getAttribute('type')?.toLowerCase() === 'radio' ||
        control.element.getAttribute('type')?.toLowerCase() === 'checkbox'))
  );
}

/**
 * Option labels from P2 control.label only (structural).
 * For native <select>, also read child <option> text (not selected state).
 */
function collectOptionLabels(
  question: DiscoveredQuestion,
  kind: QuestionType,
): string[] {
  const labels: string[] = [];

  for (const control of question.controls) {
    if (kind === 'dropdown' && control.kind === DiscoveryControlKind.native_select) {
      const select = control.element;
      // Prefer HTMLSelectElement.options; fall back to child <option> nodes
      // (linkedom / odd environments may not expose a full options collection).
      const optionElements: Element[] =
        select instanceof HTMLSelectElement
          ? Array.from(select.options)
          : Array.from(select.querySelectorAll('option'));

      for (const option of optionElements) {
        const text =
          'text' in option && typeof (option as HTMLOptionElement).text === 'string'
            ? (option as HTMLOptionElement).text
            : option.textContent ?? '';
        const labelAttr =
          'label' in option && typeof (option as HTMLOptionElement).label === 'string'
            ? (option as HTMLOptionElement).label
            : '';
        const label = normalizeDisplayText(text || labelAttr || '');
        if (label.length > 0) {
          labels.push(label);
        }
      }
      continue;
    }

    if (!isOptionBearingControl(control)) {
      continue;
    }

    // Skip radiogroup / listbox / combobox shells — options live on children.
    if (
      control.kind === DiscoveryControlKind.aria_radiogroup ||
      control.kind === DiscoveryControlKind.aria_listbox ||
      control.kind === DiscoveryControlKind.aria_combobox
    ) {
      continue;
    }

    const label = control.label ? normalizeDisplayText(control.label) : '';
    if (label.length > 0) {
      labels.push(label);
    }
  }

  return labels;
}

function toQuestionOptions(
  questionId: string,
  labels: readonly string[],
): QuestionOption[] {
  return labels.map((label, index) => ({
    id: `opt:${questionId}:${index}`,
    label,
  }));
}

function parseScaleBounds(labels: readonly string[]): {
  min: number;
  max: number;
} | null {
  const nums = labels
    .map((label) => Number.parseInt(label, 10))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) {
    return null;
  }
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

function buildMetadata(discovered: DiscoveredQuestion): QuestionMetadata {
  const meta: Record<string, string | number | boolean | null> = {
    discoveryId: discovered.discoveryId,
  };
  if (discovered.providerId !== undefined) {
    meta.providerId = discovered.providerId;
  }
  return meta;
}

function resolveTitle(discovered: DiscoveredQuestion): {
  text: string;
  missing: boolean;
} {
  const raw = previewText(discovered.titleElement);
  if (raw === null || raw.length === 0) {
    return { text: '', missing: true };
  }
  return { text: normalizeDisplayText(raw), missing: false };
}

function resolveDescription(discovered: DiscoveredQuestion): string | undefined {
  const raw = previewText(discovered.descriptionElement);
  if (raw === null || raw.length === 0) {
    return undefined;
  }
  return normalizeDisplayText(raw);
}

function buildQuestion(
  discovered: DiscoveredQuestion,
  kind: QuestionType,
  sectionId: string,
  warnings: ExtractionWarning[],
): { question: Question; optionCount: number | null } {
  const questionId = discovered.discoveryId;
  const { text, missing } = resolveTitle(discovered);
  if (missing) {
    warnings.push({
      code: 'missing_title',
      discoveryId: discovered.discoveryId,
      message: 'Question title candidate missing; text left empty.',
    });
  }

  const requiredKnown = discovered.required !== undefined;
  if (!requiredKnown) {
    warnings.push({
      code: 'required_unknown',
      discoveryId: discovered.discoveryId,
      message:
        'Required state unknown from P2; Question.required omitted (must not be treated as optional).',
    });
  }

  if (discovered.providerId === undefined) {
    warnings.push({
      code: 'missing_provider_id',
      discoveryId: discovered.discoveryId,
      message: 'No provider entry id on this question.',
    });
  }

  const description = resolveDescription(discovered);
  const metadata = buildMetadata(discovered);

  const base: {
    id: string;
    text: string;
    sectionId: string;
    metadata: QuestionMetadata;
    description?: string;
    required?: boolean;
  } = {
    id: questionId,
    text,
    sectionId,
    metadata,
  };
  if (description !== undefined) {
    base.description = description;
  }
  if (discovered.required !== undefined) {
    base.required = discovered.required;
  }

  if (
    kind === 'multiple_choice' ||
    kind === 'checkbox' ||
    kind === 'dropdown'
  ) {
    const labels = collectOptionLabels(discovered, kind);
    const options = toQuestionOptions(questionId, labels);
    if (options.length === 0) {
      warnings.push({
        code: 'missing_options',
        discoveryId: discovered.discoveryId,
        message: `No option labels extracted for ${kind}.`,
      });
    }
    return {
      question: { ...base, type: kind, options },
      optionCount: options.length,
    };
  }

  if (kind === 'linear_scale') {
    const labels = collectOptionLabels(discovered, 'multiple_choice');
    const bounds = parseScaleBounds(labels);
    if (!bounds) {
      warnings.push({
        code: 'missing_options',
        discoveryId: discovered.discoveryId,
        message: 'Linear scale lacked numeric option labels; using min=0 max=0.',
      });
      return {
        question: { ...base, type: 'linear_scale', min: 0, max: 0 },
        optionCount: 0,
      };
    }
    return {
      question: {
        ...base,
        type: 'linear_scale',
        min: bounds.min,
        max: bounds.max,
      },
      optionCount: labels.length,
    };
  }

  if (kind === 'unknown') {
    const labels = collectOptionLabels(discovered, 'unknown');
    const options =
      labels.length > 0 ? toQuestionOptions(questionId, labels) : undefined;
    return {
      question: {
        ...base,
        type: 'unknown',
        ...(options !== undefined ? { options } : {}),
      },
      optionCount: options?.length ?? null,
    };
  }

  return {
    question: { ...base, type: kind },
    optionCount: null,
  };
}

function alignClassified(
  discovered: readonly DiscoveredQuestion[],
  classified: readonly ClassifiedQuestion[],
): Map<string, ClassifiedQuestion> {
  const byId = new Map<string, ClassifiedQuestion>();
  for (const item of classified) {
    byId.set(item.discoveryId, item);
  }

  // Fall back to index alignment when discoveryId lookup fails.
  const byIndex = new Map<number, ClassifiedQuestion>();
  for (const item of classified) {
    byIndex.set(item.index, item);
  }

  const aligned = new Map<string, ClassifiedQuestion>();
  for (const q of discovered) {
    const hit = byId.get(q.discoveryId) ?? byIndex.get(q.index);
    if (hit) {
      aligned.set(q.discoveryId, hit);
    }
  }
  return aligned;
}

function toQuestionDiag(
  discovered: DiscoveredQuestion,
  classified: ClassifiedQuestion | undefined,
  extracted: boolean,
  questionId: string | null,
  optionCount: number | null,
): ExtractionQuestionDiag {
  return {
    discoveryId: discovered.discoveryId,
    providerId: discovered.providerId ?? null,
    classificationKind: classified?.kind ?? 'missing',
    classificationReason: classified?.reason ?? null,
    classificationSignals: classified?.signals ?? [],
    extracted,
    questionId,
    missingTitle: !discovered.diagnostics.hasTitleCandidate,
    missingProviderId: discovered.providerId === undefined,
    requiredKnown: discovered.required !== undefined,
    optionCount,
  };
}

/**
 * Pure normalization: DiscoveredQuestion[] + ClassifiedQuestion[] → Form + report.
 * Same inputs (including extractedAt) ⇒ identical output.
 */
export function extractForm(
  discoveredQuestions: readonly DiscoveredQuestion[],
  classifiedQuestions: readonly ClassifiedQuestion[],
  metadata: ExtractFormMetadata,
): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const questionDiags: ExtractionQuestionDiag[] = [];
  const questions: Question[] = [];

  const sectionId = metadata.sectionId ?? DEFAULT_SECTION_ID;
  const sectionTitle = metadata.sectionTitle ?? DEFAULT_SECTION_TITLE;
  const formId =
    metadata.formId ??
    (metadata.url.length > 0 ? `form:${metadata.url}` : 'form:unknown');

  const formTitle = metadata.formTitle
    ? normalizeDisplayText(metadata.formTitle)
    : '';
  if (!formTitle) {
    warnings.push({
      code: 'form_title_missing',
      message: 'Form title not supplied; left empty.',
    });
  }

  const classifiedMap = alignClassified(
    discoveredQuestions,
    classifiedQuestions,
  );

  let omittedNonQuestion = 0;
  let omittedUnsupported = 0;
  let unknownQuestions = 0;
  let missingTitles = 0;
  let missingProviderIds = 0;
  let requiredUnknown = 0;
  let missingOptions = 0;

  // Preserve discovery order strictly.
  for (const discovered of discoveredQuestions) {
    const classified = classifiedMap.get(discovered.discoveryId);
    if (!classified) {
      warnings.push({
        code: 'classification_mismatch',
        discoveryId: discovered.discoveryId,
        message: 'No classification entry for discovered question; omitted.',
      });
      questionDiags.push(
        toQuestionDiag(discovered, undefined, false, null, null),
      );
      continue;
    }

    if (classified.kind === 'non_question') {
      omittedNonQuestion += 1;
      warnings.push({
        code: 'non_question_omitted',
        discoveryId: discovered.discoveryId,
        message: 'non_question omitted from Form.questions.',
      });
      questionDiags.push(
        toQuestionDiag(discovered, classified, false, null, null),
      );
      continue;
    }

    if (classified.kind === 'unsupported') {
      omittedUnsupported += 1;
      warnings.push({
        code: 'unsupported_omitted',
        discoveryId: discovered.discoveryId,
        message:
          'unsupported structure omitted from Form.questions; see classificationReason/signals.',
      });
      questionDiags.push(
        toQuestionDiag(discovered, classified, false, null, null),
      );
      continue;
    }

    if (!isQuestionType(classified.kind)) {
      warnings.push({
        code: 'incomplete_question',
        discoveryId: discovered.discoveryId,
        message: `Unexpected classification kind ${classified.kind}; omitted.`,
      });
      continue;
    }

    const beforeWarn = warnings.length;
    const { question, optionCount } = buildQuestion(
      discovered,
      classified.kind,
      sectionId,
      warnings,
    );

    for (let i = beforeWarn; i < warnings.length; i += 1) {
      const code = warnings[i]?.code;
      if (code === 'missing_title') missingTitles += 1;
      if (code === 'missing_provider_id') missingProviderIds += 1;
      if (code === 'required_unknown') requiredUnknown += 1;
      if (code === 'missing_options') missingOptions += 1;
    }

    if (classified.kind === 'unknown') {
      unknownQuestions += 1;
    }

    questions.push(question);
    questionDiags.push(
      toQuestionDiag(
        discovered,
        classified,
        true,
        question.id,
        optionCount,
      ),
    );
  }

  const section: Section = {
    id: sectionId,
    title: sectionTitle,
    questions,
  };

  const form: Form = {
    id: formId,
    title: formTitle,
    url: metadata.url,
    extractedAt: metadata.extractedAt,
    sections: [section],
    ...(metadata.formDescription
      ? { description: normalizeDisplayText(metadata.formDescription) }
      : {}),
  };

  const report: ExtractionReport = {
    url: metadata.url,
    formId,
    scope: 'current_visible_dom',
    totals: {
      discovered: discoveredQuestions.length,
      extractedQuestions: questions.length,
      omittedNonQuestion,
      omittedUnsupported,
      unknownQuestions,
      missingTitles,
      missingProviderIds,
      requiredUnknown,
      missingOptions,
      sectionCount: 1,
      warningCount: warnings.length,
    },
    questions: questionDiags,
    warnings,
  };

  return { form, report };
}

export function logExtractionSummary(report: ExtractionReport): void {
  console.info(
    [
      '[Google Form AutoFiller] Extraction:',
      `discovered=${report.totals.discovered}`,
      `extracted=${report.totals.extractedQuestions}`,
      `non_question_omitted=${report.totals.omittedNonQuestion}`,
      `unsupported_omitted=${report.totals.omittedUnsupported}`,
      `unknown=${report.totals.unknownQuestions}`,
      `warnings=${report.totals.warningCount}`,
    ].join('\n'),
  );
}
