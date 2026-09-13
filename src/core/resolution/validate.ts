import {
  multiValue,
  singleValue,
  type AnswerValue,
} from '@/core/types/answer';
import type {
  CheckboxQuestion,
  DropdownQuestion,
  MultipleChoiceQuestion,
  Question,
  QuestionOption,
} from '@/core/types/form';
import type {
  AnswerValidationError,
  AnswerValidationErrorCode,
  AnswerValidationResult,
} from './types';

type ChoiceQuestion =
  | MultipleChoiceQuestion
  | CheckboxQuestion
  | DropdownQuestion;

function validationError(
  code: AnswerValidationErrorCode,
  message: string,
): AnswerValidationError {
  return { code, message };
}

function invalid(
  code: AnswerValidationErrorCode,
  message: string,
): AnswerValidationResult {
  return {
    status: 'invalid',
    validationErrors: [validationError(code, message)],
  };
}

function valid(value: AnswerValue): AnswerValidationResult {
  return { status: 'valid', value, validationErrors: [] };
}

function normalizeOptionToken(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

type OptionResolution =
  | { status: 'valid'; option: QuestionOption }
  | { status: 'invalid' }
  | { status: 'ambiguous'; optionIds: readonly string[] };

function resolveOption(
  options: readonly QuestionOption[],
  rawToken: string,
): OptionResolution {
  const token = normalizeOptionToken(rawToken);
  if (token.length === 0) {
    return { status: 'invalid' };
  }

  const idMatches = options.filter((option) => option.id === token);
  if (idMatches.length === 1 && idMatches[0] !== undefined) {
    return { status: 'valid', option: idMatches[0] };
  }
  if (idMatches.length > 1) {
    return {
      status: 'ambiguous',
      optionIds: idMatches.map((option) => option.id),
    };
  }

  const labelMatches = options.filter(
    (option) => normalizeOptionToken(option.label) === token,
  );
  if (labelMatches.length === 1 && labelMatches[0] !== undefined) {
    return { status: 'valid', option: labelMatches[0] };
  }
  if (labelMatches.length > 1) {
    return {
      status: 'ambiguous',
      optionIds: labelMatches.map((option) => option.id),
    };
  }
  return { status: 'invalid' };
}

function ambiguousOption(optionIds: readonly string[]): AnswerValidationResult {
  return {
    status: 'ambiguous',
    validationErrors: [
      validationError(
        'option_ambiguous',
        'Answer label matches more than one question option.',
      ),
    ],
    ambiguity: {
      source: 'option',
      sourceKeys: optionIds,
      message: 'Use a unique option id instead of an ambiguous label.',
    },
  };
}

function validateSingleChoice(
  question: ChoiceQuestion,
  value: AnswerValue,
): AnswerValidationResult {
  if (value.kind !== 'single') {
    return invalid(
      'answer_kind_mismatch',
      'Question requires a single answer value.',
    );
  }

  const resolved = resolveOption(question.options, value.value);
  if (resolved.status === 'ambiguous') {
    return ambiguousOption(resolved.optionIds);
  }
  if (resolved.status === 'invalid') {
    return invalid(
      'option_not_found',
      'Answer does not identify an available question option.',
    );
  }
  return valid(singleValue(resolved.option.id));
}

function validateCheckbox(
  question: CheckboxQuestion,
  value: AnswerValue,
): AnswerValidationResult {
  if (value.kind !== 'multi') {
    return invalid(
      'answer_kind_mismatch',
      'Checkbox question requires a multi-answer value.',
    );
  }

  const optionIds: string[] = [];
  for (const token of value.values) {
    const resolved = resolveOption(question.options, token);
    if (resolved.status === 'ambiguous') {
      return ambiguousOption(resolved.optionIds);
    }
    if (resolved.status === 'invalid') {
      return invalid(
        'option_not_found',
        'A checkbox answer does not identify an available option.',
      );
    }
    if (optionIds.includes(resolved.option.id)) {
      return invalid(
        'duplicate_selection',
        'Checkbox answer contains a duplicate option.',
      );
    }
    optionIds.push(resolved.option.id);
  }
  return valid(multiValue(optionIds));
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ] as const;
  return day <= (daysByMonth[month - 1] ?? 0);
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  return hours <= 23 && minutes <= 59 && seconds <= 59;
}

function requireSingle(value: AnswerValue): string | null {
  return value.kind === 'single' ? value.value.trim() : null;
}

/**
 * Pure Question + AnswerValue validation.
 * Choice labels are canonicalized to stable option ids when uniquely resolved.
 */
export function validateAnswerValue(
  question: Question,
  value: AnswerValue,
): AnswerValidationResult {
  switch (question.type) {
    case 'text':
    case 'paragraph': {
      if (value.kind !== 'single') {
        return invalid(
          'answer_kind_mismatch',
          'Text question requires a single answer value.',
        );
      }
      if (value.value.trim().length === 0) {
        return invalid('empty_answer', 'Text answer must not be empty.');
      }
      return valid(value);
    }
    case 'multiple_choice':
    case 'dropdown':
      return validateSingleChoice(question, value);
    case 'checkbox':
      return validateCheckbox(question, value);
    case 'linear_scale': {
      const token = requireSingle(value);
      if (token === null) {
        return invalid(
          'answer_kind_mismatch',
          'Linear scale requires a single answer value.',
        );
      }
      if (!/^-?\d+$/u.test(token)) {
        return invalid(
          'scale_out_of_range',
          'Linear scale answer must be an available integer.',
        );
      }
      const numeric = Number(token);
      if (numeric < question.min || numeric > question.max) {
        return invalid(
          'scale_out_of_range',
          'Linear scale answer must be within the question bounds.',
        );
      }
      return valid(singleValue(token));
    }
    case 'date': {
      const token = requireSingle(value);
      if (token === null) {
        return invalid(
          'answer_kind_mismatch',
          'Date question requires a single answer value.',
        );
      }
      if (!isValidDate(token)) {
        return invalid(
          'invalid_date',
          'Date answer must be a valid YYYY-MM-DD calendar date.',
        );
      }
      return valid(singleValue(token));
    }
    case 'time': {
      const token = requireSingle(value);
      if (token === null) {
        return invalid(
          'answer_kind_mismatch',
          'Time question requires a single answer value.',
        );
      }
      if (!isValidTime(token)) {
        return invalid(
          'invalid_time',
          'Time answer must be valid HH:MM or HH:MM:SS.',
        );
      }
      return valid(singleValue(token));
    }
    case 'unknown':
    default:
      return {
        status: 'unsupported',
        validationErrors: [
          validationError(
            'unsupported_question',
            'Question type is unsupported for answer resolution.',
          ),
        ],
      };
  }
}
