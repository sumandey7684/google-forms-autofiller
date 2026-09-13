import { getFormQuestions } from '@/core/types/form';
import { AnswerValueSchema } from '@/core/validation/answer';
import { resolveAnswers } from '@/core/resolution/resolver';
import { validateAnswerValue } from '@/core/resolution/validate';
import type {
  AnswerResolutionResult,
  AnswerValidationError,
} from '@/core/resolution/types';
import { buildAiQuestionContext } from './context';
import type {
  OrchestratedAnswerReport,
  OrchestratedAnswerResult,
  OrchestratedAnswerTotals,
  ResolveAnswersWithAiInput,
} from './types';

function error(
  code: AnswerValidationError['code'],
  message: string,
): AnswerValidationError {
  return { code, message };
}

function fromResolution(
  result: AnswerResolutionResult,
): OrchestratedAnswerResult {
  return {
    questionId: result.questionId,
    status: result.status,
    certainty: result.certainty,
    validationErrors: result.validationErrors,
    ...(result.source !== undefined ? { source: result.source } : {}),
    ...(result.sourceKey !== undefined ? { sourceKey: result.sourceKey } : {}),
    ...(result.value !== undefined ? { value: result.value } : {}),
    ...(result.ambiguity !== undefined ? { ambiguity: result.ambiguity } : {}),
  };
}

function summarize(
  results: readonly OrchestratedAnswerResult[],
): OrchestratedAnswerTotals {
  const totals: OrchestratedAnswerTotals = {
    total: results.length,
    resolved: 0,
    missing: 0,
    invalid: 0,
    ambiguous: 0,
    unsupported: 0,
    blocked: 0,
    providerError: 0,
  };
  for (const result of results) {
    if (result.status === 'provider_error') {
      totals.providerError += 1;
    } else {
      totals[result.status] += 1;
    }
  }
  return totals;
}

/**
 * Deterministic fallback orchestration:
 * P8 resolution first; AI only when status is `missing`.
 * Does not construct FillPlans, touch the DOM, or call network APIs itself.
 */
export async function resolveAnswersWithAiFallback(
  input: ResolveAnswersWithAiInput,
): Promise<OrchestratedAnswerReport> {
  const base = resolveAnswers({
    form: input.form,
    matching: input.matching,
    profile: input.profile,
    savedAnswers: input.savedAnswers,
  });
  const questions = new Map(
    getFormQuestions(input.form).map((question) => [question.id, question]),
  );

  const results: OrchestratedAnswerResult[] = [];
  for (const resolved of base.results) {
    if (resolved.status !== 'missing') {
      results.push(fromResolution(resolved));
      continue;
    }

    const question = questions.get(resolved.questionId);
    if (!question) {
      results.push({
        questionId: resolved.questionId,
        status: 'blocked',
        certainty: 0,
        validationErrors: [
          error(
            'match_result_missing',
            'Question missing from form during AI orchestration.',
          ),
        ],
      });
      continue;
    }

    if (question.type === 'unknown') {
      results.push({
        questionId: question.id,
        status: 'unsupported',
        certainty: 0,
        providerId: input.provider.id,
        validationErrors: [
          error(
            'unsupported_question',
            'Unknown question type is unsupported for AI fallback.',
          ),
        ],
      });
      continue;
    }

    const context = buildAiQuestionContext(question, {
      includeProfileContext: input.includeProfileContext === true,
      profile: input.profile,
    });

    let proposal;
    try {
      proposal = await input.provider.proposeAnswer(context);
    } catch {
      results.push({
        questionId: question.id,
        status: 'provider_error',
        certainty: 0,
        providerId: input.provider.id,
        source: 'ai',
        sourceKey: `ai:${input.provider.id}`,
        validationErrors: [
          error(
            'ai_provider_error',
            'AI provider threw an unexpected error.',
          ),
        ],
      });
      continue;
    }

    if (proposal.status === 'error') {
      results.push({
        questionId: question.id,
        status: 'provider_error',
        certainty: 0,
        providerId: input.provider.id,
        source: 'ai',
        sourceKey: `ai:${input.provider.id}`,
        validationErrors: [
          error(
            'ai_provider_error',
            proposal.message ?? 'AI provider returned an error.',
          ),
        ],
      });
      continue;
    }

    if (proposal.status === 'unsupported') {
      results.push({
        questionId: question.id,
        status: 'unsupported',
        certainty: 0,
        providerId: input.provider.id,
        source: 'ai',
        sourceKey: `ai:${input.provider.id}`,
        validationErrors: [
          error(
            'unsupported_question',
            proposal.message ?? 'AI provider marked the question unsupported.',
          ),
        ],
      });
      continue;
    }

    const parsed = AnswerValueSchema.safeParse(proposal.value);
    if (!parsed.success) {
      results.push({
        questionId: question.id,
        status: 'invalid',
        certainty: 0.5,
        providerId: input.provider.id,
        source: 'ai',
        sourceKey: `ai:${input.provider.id}`,
        validationErrors: [
          error(
            'answer_kind_mismatch',
            'AI provider returned a payload that is not a valid AnswerValue.',
          ),
        ],
      });
      continue;
    }

    const validation = validateAnswerValue(question, parsed.data);
    if (validation.status === 'valid' && validation.value !== undefined) {
      results.push({
        questionId: question.id,
        status: 'resolved',
        source: 'ai',
        sourceKey: `ai:${input.provider.id}`,
        value: validation.value,
        certainty: 0.5,
        providerId: input.provider.id,
        validationErrors: [],
      });
      continue;
    }

    results.push({
      questionId: question.id,
      status:
        validation.status === 'unsupported'
          ? 'unsupported'
          : validation.status === 'ambiguous'
            ? 'ambiguous'
            : 'invalid',
      source: 'ai',
      sourceKey: `ai:${input.provider.id}`,
      certainty: 0.5,
      providerId: input.provider.id,
      validationErrors: validation.validationErrors,
      ...(validation.ambiguity !== undefined
        ? { ambiguity: validation.ambiguity }
        : {}),
    });
  }

  return {
    formId: base.formId,
    results,
    totals: summarize(results),
    aiProviderId: input.provider.id,
  };
}
