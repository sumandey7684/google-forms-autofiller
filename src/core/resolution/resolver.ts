import { normalizeQuestionText } from '@/core/matching/normalize';
import type { QuestionMatchResult } from '@/core/matching/types';
import { singleValue } from '@/core/types/answer';
import { getFormQuestions, type Question } from '@/core/types/form';
import { validateAnswerValue } from './validate';
import type {
  AnswerResolutionCertainty,
  AnswerResolutionReport,
  AnswerResolutionResult,
  AnswerResolutionTotals,
  AnswerValidationError,
  AnswerValidationErrorCode,
  ResolveAnswersInput,
  SavedAnswer,
} from './types';

function error(
  code: AnswerValidationErrorCode,
  message: string,
): AnswerValidationError {
  return { code, message };
}

function ambiguousSavedAnswers(
  questionId: string,
  answers: readonly SavedAnswer[],
  certainty: AnswerResolutionCertainty,
): AnswerResolutionResult {
  return {
    questionId,
    status: 'ambiguous',
    source: 'saved_answer',
    certainty,
    validationErrors: [
      error(
        'saved_answer_ambiguous',
        'Multiple saved answers have the same precedence for this question.',
      ),
    ],
    ambiguity: {
      source: 'saved_answer',
      sourceKeys: answers.map((answer) => answer.key),
      message: 'No saved answer was selected.',
    },
  };
}

function resolveSavedAnswer(
  question: Question,
  savedAnswer: SavedAnswer,
  certainty: AnswerResolutionCertainty,
): AnswerResolutionResult {
  if (savedAnswer.questionType !== question.type) {
    return {
      questionId: question.id,
      status: 'invalid',
      source: 'saved_answer',
      sourceKey: savedAnswer.key,
      certainty,
      validationErrors: [
        error(
          'answer_kind_mismatch',
          'Saved answer question type does not match the target question.',
        ),
      ],
    };
  }

  const validation = validateAnswerValue(question, savedAnswer.value);
  if (validation.status === 'valid' && validation.value !== undefined) {
    return {
      questionId: question.id,
      status: 'resolved',
      source: 'saved_answer',
      sourceKey: savedAnswer.key,
      value: validation.value,
      certainty,
      validationErrors: [],
    };
  }

  if (validation.status === 'ambiguous') {
    return {
      questionId: question.id,
      status: 'ambiguous',
      source: 'saved_answer',
      sourceKey: savedAnswer.key,
      certainty,
      validationErrors: validation.validationErrors,
      ...(validation.ambiguity !== undefined
        ? { ambiguity: validation.ambiguity }
        : {}),
    };
  }

  return {
    questionId: question.id,
    status:
      validation.status === 'unsupported' ? 'unsupported' : 'invalid',
    source: 'saved_answer',
    sourceKey: savedAnswer.key,
    certainty,
    validationErrors: validation.validationErrors,
  };
}

function resolveProfileMatch(
  question: Question,
  match: QuestionMatchResult | undefined,
  input: ResolveAnswersInput,
): AnswerResolutionResult {
  if (question.type === 'unknown') {
    return {
      questionId: question.id,
      status: 'unsupported',
      certainty: 0,
      validationErrors: [
        error(
          'unsupported_question',
          'Unknown question type is unsupported for answer resolution.',
        ),
      ],
    };
  }

  if (match === undefined) {
    return {
      questionId: question.id,
      status: 'blocked',
      certainty: 0,
      validationErrors: [
        error(
          'match_result_missing',
          'No P7 matching result exists for this question.',
        ),
      ],
    };
  }

  if (match.status === 'ambiguous') {
    const sourceKeys =
      match.ambiguity?.candidates.map((field) => `profile:${field}`) ?? [];
    return {
      questionId: question.id,
      status: 'ambiguous',
      source: 'profile',
      certainty: match.confidence,
      validationErrors: [
        error(
          'profile_match_ambiguous',
          'P7 produced multiple equally strong profile fields.',
        ),
      ],
      ambiguity: {
        source: 'profile_match',
        sourceKeys,
        message: 'No profile field was selected.',
      },
    };
  }

  if (match.status === 'invalid') {
    return {
      questionId: question.id,
      status: 'blocked',
      certainty: 0,
      validationErrors: [
        error(
          'profile_match_invalid',
          'P7 matching input was invalid for this question.',
        ),
      ],
    };
  }

  if (match.status !== 'matched' || match.profileField === undefined) {
    return {
      questionId: question.id,
      status: 'missing',
      certainty: 0,
      validationErrors: [],
    };
  }

  const sourceKey = `profile:${match.profileField}`;
  const profileValue = input.profile?.[match.profileField];
  if (profileValue === undefined || profileValue.trim().length === 0) {
    return {
      questionId: question.id,
      status: 'missing',
      source: 'profile',
      sourceKey,
      certainty: match.confidence,
      validationErrors: [
        error(
          'profile_value_missing',
          'Matched profile field has no usable value.',
        ),
      ],
    };
  }

  const validation = validateAnswerValue(question, singleValue(profileValue));
  if (validation.status === 'valid' && validation.value !== undefined) {
    return {
      questionId: question.id,
      status: 'resolved',
      source: 'profile',
      sourceKey,
      value: validation.value,
      certainty: match.confidence,
      validationErrors: [],
    };
  }

  return {
    questionId: question.id,
    status:
      validation.status === 'unsupported'
        ? 'unsupported'
        : validation.status === 'ambiguous'
          ? 'ambiguous'
          : 'invalid',
    source: 'profile',
    sourceKey,
    certainty: match.confidence,
    validationErrors: validation.validationErrors,
    ...(validation.ambiguity !== undefined
      ? { ambiguity: validation.ambiguity }
      : {}),
  };
}

function resolveQuestion(
  question: Question,
  input: ResolveAnswersInput,
  matches: readonly QuestionMatchResult[],
  duplicateTextQuestionIds: readonly string[],
): AnswerResolutionResult {
  const exactAnswers = input.savedAnswers.filter(
    (answer) => answer.questionId === question.id,
  );
  if (exactAnswers.length > 1) {
    return ambiguousSavedAnswers(question.id, exactAnswers, 1);
  }
  if (exactAnswers[0] !== undefined) {
    return resolveSavedAnswer(question, exactAnswers[0], 1);
  }

  const normalizedQuestionText = normalizeQuestionText(question.text);
  const textAnswers = input.savedAnswers.filter(
    (answer) =>
      answer.normalizedQuestionText === normalizedQuestionText &&
      answer.questionType === question.type,
  );
  if (textAnswers.length > 0 && duplicateTextQuestionIds.length > 1) {
    return {
      questionId: question.id,
      status: 'ambiguous',
      source: 'saved_answer',
      certainty: 0.9,
      validationErrors: [
        error(
          'saved_answer_ambiguous',
          'Normalized-text fallback matches duplicate current questions.',
        ),
      ],
      ambiguity: {
        source: 'saved_answer',
        sourceKeys: duplicateTextQuestionIds.map((id) => `question:${id}`),
        message: 'Use an exact question saved answer for duplicate labels.',
      },
    };
  }
  if (textAnswers.length > 1) {
    return ambiguousSavedAnswers(question.id, textAnswers, 0.9);
  }
  if (textAnswers[0] !== undefined) {
    return resolveSavedAnswer(question, textAnswers[0], 0.9);
  }

  const questionMatches = matches.filter(
    (match) => match.questionId === question.id,
  );
  if (questionMatches.length > 1) {
    return {
      questionId: question.id,
      status: 'blocked',
      certainty: 0,
      validationErrors: [
        error(
          'profile_match_ambiguous',
          'Matching report contains duplicate entries for this question.',
        ),
      ],
    };
  }
  return resolveProfileMatch(question, questionMatches[0], input);
}

function summarize(
  results: readonly AnswerResolutionResult[],
): AnswerResolutionTotals {
  const totals: AnswerResolutionTotals = {
    total: results.length,
    resolved: 0,
    missing: 0,
    invalid: 0,
    ambiguous: 0,
    unsupported: 0,
    blocked: 0,
  };
  for (const result of results) {
    totals[result.status] += 1;
  }
  return totals;
}

/**
 * Resolve answer candidates without constructing or executing a FillPlan.
 */
export function resolveAnswers(
  input: ResolveAnswersInput,
): AnswerResolutionReport {
  const questions = getFormQuestions(input.form);
  const textQuestionIds = new Map<string, string[]>();
  for (const question of questions) {
    const key = `${question.type}:${normalizeQuestionText(question.text)}`;
    const ids = textQuestionIds.get(key) ?? [];
    ids.push(question.id);
    textQuestionIds.set(key, ids);
  }
  const matches =
    input.matching.formId === input.form.id ? input.matching.results : [];
  const results = questions.map((question) => {
    const key = `${question.type}:${normalizeQuestionText(question.text)}`;
    return resolveQuestion(
      question,
      input,
      matches,
      textQuestionIds.get(key) ?? [],
    );
  });
  return {
    formId: input.form.id,
    results,
    totals: summarize(results),
  };
}
