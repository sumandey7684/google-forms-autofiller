import type { Question } from '@/core/types/form';
import type { ProfileValues } from '@/core/resolution/types';
import {
  AI_CONTEXT_PROFILE_FIELDS,
  type AiContextProfileField,
  type AiQuestionContext,
  type AiQuestionOption,
} from './types';

const DESCRIPTION_MAX = 240;
const TEXT_MAX = 400;

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}…`;
}

function buildOptions(question: Question): readonly AiQuestionOption[] | undefined {
  if (
    question.type !== 'multiple_choice' &&
    question.type !== 'checkbox' &&
    question.type !== 'dropdown'
  ) {
    return undefined;
  }
  return question.options.map((option) => ({
    id: option.id,
    label: option.label,
  }));
}

function buildProfileContext(
  profile: ProfileValues | null | undefined,
): Readonly<Partial<Record<AiContextProfileField, string>>> | undefined {
  if (!profile) {
    return undefined;
  }

  const context: Partial<Record<AiContextProfileField, string>> = {};
  for (const field of AI_CONTEXT_PROFILE_FIELDS) {
    const value = profile[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      context[field] = value.trim();
    }
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Build the smallest safe AI request context for one question.
 * Never includes saved answers, tokens, passwords, or whole-form data.
 */
export function buildAiQuestionContext(
  question: Question,
  options: {
    includeProfileContext?: boolean;
    profile?: ProfileValues | null;
  } = {},
): AiQuestionContext {
  const context: AiQuestionContext = {
    questionId: question.id,
    questionText: truncate(question.text, TEXT_MAX),
    questionType: question.type,
  };

  if (question.description !== undefined && question.description.trim().length > 0) {
    context.description = truncate(question.description, DESCRIPTION_MAX);
  }

  const optionsPayload = buildOptions(question);
  if (optionsPayload !== undefined) {
    context.options = optionsPayload;
  }

  if (question.type === 'linear_scale') {
    context.scaleMin = question.min;
    context.scaleMax = question.max;
  }

  if (options.includeProfileContext) {
    const profileContext = buildProfileContext(options.profile);
    if (profileContext !== undefined) {
      context.profileContext = profileContext;
    }
  }

  return context;
}
