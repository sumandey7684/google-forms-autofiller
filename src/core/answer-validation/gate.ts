import { AnswerValueSchema } from '@/core/validation/answer';
import { getFormQuestions, type Question } from '@/core/types/form';
import { validateAnswerValue } from '@/core/resolution/validate';
import type {
  AnswerCandidate,
  PrefillValidationError,
  PrefillValidationReport,
  PrefillValidationResult,
  PrefillValidationTotals,
  ValidateAnswersForFillInput,
} from './types';

function error(
  code: PrefillValidationError['code'],
  message: string,
): PrefillValidationError {
  return { code, message };
}

function requiredState(question: Question): boolean | 'unknown' {
  if (question.required === true) return true;
  if (question.required === false) return false;
  return 'unknown';
}

function summarize(
  results: readonly PrefillValidationResult[],
): PrefillValidationTotals {
  const totals: PrefillValidationTotals = {
    total: results.length,
    valid: 0,
    missing: 0,
    invalid: 0,
    ambiguous: 0,
    unsupported: 0,
    providerError: 0,
    requiredMissing: 0,
    fillable: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case 'valid':
        totals.valid += 1;
        break;
      case 'missing':
        totals.missing += 1;
        if (result.required === true) {
          totals.requiredMissing += 1;
        }
        break;
      case 'invalid':
        totals.invalid += 1;
        break;
      case 'ambiguous':
        totals.ambiguous += 1;
        break;
      case 'unsupported':
        totals.unsupported += 1;
        break;
      case 'provider_error':
        totals.providerError += 1;
        break;
    }
    if (result.fillable) {
      totals.fillable += 1;
    }
  }
  return totals;
}

function isReadyForFillPlan(
  results: readonly PrefillValidationResult[],
): boolean {
  for (const result of results) {
    if (result.required === true && !result.fillable) {
      return false;
    }
    if (
      result.status === 'invalid' ||
      result.status === 'ambiguous' ||
      result.status === 'provider_error'
    ) {
      return false;
    }
  }
  return true;
}

function preserveUpstream(
  candidate: AnswerCandidate,
  question: Question | undefined,
  status: PrefillValidationResult['status'],
  extraErrors: readonly PrefillValidationError[] = [],
): PrefillValidationResult {
  const required = question ? requiredState(question) : 'unknown';
  const upstreamErrors =
    candidate.validationErrors?.map((item) => ({
      code: item.code,
      message: item.message,
    })) ?? [];
  return {
    questionId: candidate.questionId,
    status,
    required,
    validationErrors: [...upstreamErrors, ...extraErrors],
    fillable: false,
    ...(candidate.source !== undefined ? { source: candidate.source } : {}),
    ...(candidate.sourceKey !== undefined
      ? { sourceKey: candidate.sourceKey }
      : {}),
    ...(candidate.providerId !== undefined
      ? { providerId: candidate.providerId }
      : {}),
    ...(candidate.ambiguity !== undefined
      ? { ambiguity: candidate.ambiguity }
      : {}),
  };
}

/**
 * Validate one candidate against its question without inventing answers.
 */
export function validateAnswerCandidate(
  question: Question | undefined,
  candidate: AnswerCandidate,
): PrefillValidationResult {
  if (!question) {
    return preserveUpstream(candidate, undefined, 'invalid', [
      error('question_not_found', 'No question exists for this candidate id.'),
    ]);
  }

  const required = requiredState(question);
  const upstream = candidate.upstreamStatus;

  if (upstream === 'provider_error') {
    return preserveUpstream(candidate, question, 'provider_error');
  }
  if (upstream === 'ambiguous') {
    return preserveUpstream(candidate, question, 'ambiguous');
  }
  if (upstream === 'unsupported' || question.type === 'unknown') {
    return preserveUpstream(candidate, question, 'unsupported', [
      ...(question.type === 'unknown' && upstream !== 'unsupported'
        ? [
            error(
              'unsupported_question',
              'Unknown question type cannot be validated for fill.',
            ),
          ]
        : []),
    ]);
  }
  if (upstream === 'blocked') {
    return preserveUpstream(candidate, question, 'invalid', [
      error(
        'match_result_missing',
        'Upstream resolution blocked this question from fill.',
      ),
    ]);
  }

  if (candidate.value === undefined) {
    const errors: PrefillValidationError[] = [
      error('value_missing', 'No answer value was provided for validation.'),
    ];
    if (required === true) {
      errors.push(
        error(
          'required_unanswered',
          'Required question has no validated answer.',
        ),
      );
    }
    return {
      questionId: candidate.questionId,
      status: 'missing',
      required,
      validationErrors: errors,
      fillable: false,
      ...(candidate.source !== undefined ? { source: candidate.source } : {}),
      ...(candidate.sourceKey !== undefined
        ? { sourceKey: candidate.sourceKey }
        : {}),
      ...(candidate.providerId !== undefined
        ? { providerId: candidate.providerId }
        : {}),
    };
  }

  const parsed = AnswerValueSchema.safeParse(candidate.value);
  if (!parsed.success) {
    return {
      questionId: candidate.questionId,
      status: 'invalid',
      required,
      validationErrors: [
        error(
          'answer_kind_mismatch',
          'Candidate answer is not a valid AnswerValue.',
        ),
      ],
      fillable: false,
      ...(candidate.source !== undefined ? { source: candidate.source } : {}),
      ...(candidate.sourceKey !== undefined
        ? { sourceKey: candidate.sourceKey }
        : {}),
      ...(candidate.providerId !== undefined
        ? { providerId: candidate.providerId }
        : {}),
    };
  }

  const validation = validateAnswerValue(question, parsed.data);
  if (validation.status === 'valid' && validation.value !== undefined) {
    return {
      questionId: candidate.questionId,
      status: 'valid',
      value: validation.value,
      required,
      validationErrors: [],
      fillable: true,
      ...(candidate.source !== undefined ? { source: candidate.source } : {}),
      ...(candidate.sourceKey !== undefined
        ? { sourceKey: candidate.sourceKey }
        : {}),
      ...(candidate.providerId !== undefined
        ? { providerId: candidate.providerId }
        : {}),
    };
  }

  if (validation.status === 'ambiguous') {
    return {
      questionId: candidate.questionId,
      status: 'ambiguous',
      required,
      validationErrors: validation.validationErrors.map((item) => ({
        code: item.code,
        message: item.message,
      })),
      fillable: false,
      ...(validation.ambiguity !== undefined
        ? { ambiguity: validation.ambiguity }
        : {}),
      ...(candidate.source !== undefined ? { source: candidate.source } : {}),
      ...(candidate.sourceKey !== undefined
        ? { sourceKey: candidate.sourceKey }
        : {}),
      ...(candidate.providerId !== undefined
        ? { providerId: candidate.providerId }
        : {}),
    };
  }

  if (validation.status === 'unsupported') {
    return {
      questionId: candidate.questionId,
      status: 'unsupported',
      required,
      validationErrors: validation.validationErrors.map((item) => ({
        code: item.code,
        message: item.message,
      })),
      fillable: false,
      ...(candidate.source !== undefined ? { source: candidate.source } : {}),
      ...(candidate.sourceKey !== undefined
        ? { sourceKey: candidate.sourceKey }
        : {}),
      ...(candidate.providerId !== undefined
        ? { providerId: candidate.providerId }
        : {}),
    };
  }

  return {
    questionId: candidate.questionId,
    status: 'invalid',
    required,
    validationErrors: validation.validationErrors.map((item) => ({
      code: item.code,
      message: item.message,
    })),
    fillable: false,
    ...(candidate.source !== undefined ? { source: candidate.source } : {}),
    ...(candidate.sourceKey !== undefined
      ? { sourceKey: candidate.sourceKey }
      : {}),
    ...(candidate.providerId !== undefined
      ? { providerId: candidate.providerId }
      : {}),
  };
}

/**
 * Pure pre-fill validation gate.
 * Does not construct or execute a FillPlan and never invents answers.
 */
export function validateAnswersForFill(
  input: ValidateAnswersForFillInput,
): PrefillValidationReport {
  const questions = getFormQuestions(input.form);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();

  const results: PrefillValidationResult[] = [];
  for (const candidate of input.candidates) {
    seen.add(candidate.questionId);
    results.push(
      validateAnswerCandidate(byId.get(candidate.questionId), candidate),
    );
  }

  // Required questions with no candidate remain missing; never invent values.
  for (const question of questions) {
    if (seen.has(question.id)) {
      continue;
    }
    if (question.required !== true) {
      continue;
    }
    results.push({
      questionId: question.id,
      status: 'missing',
      required: true,
      validationErrors: [
        error(
          'required_unanswered',
          'Required question has no candidate answer.',
        ),
      ],
      fillable: false,
    });
  }

  const totals = summarize(results);
  return {
    formId: input.form.id,
    results,
    totals,
    readyForFillPlan: isReadyForFillPlan(results),
  };
}
