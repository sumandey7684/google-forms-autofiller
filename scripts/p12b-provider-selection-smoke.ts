/**
 * P12B popup AI provider selection smoke/audit.
 *
 *   pnpm run p12b-provider-selection-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AiProviderKind,
  DEFAULT_AI_PROVIDER_KIND,
  isAiProviderKind,
} from '../src/storage/ai-provider-preference.ts';
import {
  resolveWorkflowAiProvider,
  providerStatusLabel,
  checkGeminiBackendHealth,
  DEFAULT_GEMINI_BACKEND_URL,
} from '../src/popup/provider.ts';
import { HttpAiAnswerProvider } from '../src/core/ai/http-provider.ts';
import { MockAiAnswerProvider } from '../src/core/ai/mock-provider.ts';
import { resolveAnswersWithAiFallback } from '../src/core/ai/orchestrate.ts';
import { matchFormQuestions } from '../src/core/matching/index.ts';
import { validateAnswersForFill } from '../src/core/answer-validation/index.ts';
import {
  applyReviewSelection,
  buildFillPlanFromApproved,
  collectApprovedAnswers,
} from '../src/core/engine/index.ts';
import type { Form } from '../src/core/types/form.ts';
import type { AiAnswerProvider } from '../src/core/ai/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '..', 'fixtures', 'p11-autofill-workflow.json'),
    'utf8',
  ),
) as { form: Form; profile: Record<string, string> };

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

async function checkAsync(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

check('defaults safely to mock when no preference exists', () => {
  assert.equal(DEFAULT_AI_PROVIDER_KIND, AiProviderKind.MOCK);
  assert.equal(isAiProviderKind(undefined), false);
  assert.equal(isAiProviderKind('mock'), true);
  assert.equal(isAiProviderKind('gemini'), true);
  assert.equal(isAiProviderKind('openai'), false);
});

await checkAsync('mock provider remains functional for selection', async () => {
  const resolved = await resolveWorkflowAiProvider({
    kind: AiProviderKind.MOCK,
  });
  assert.equal(resolved.kind, AiProviderKind.MOCK);
  assert.equal(resolved.status, 'mock_active');
  assert.equal(resolved.statusLabel, 'Mock provider active');
  assert.ok(resolved.provider instanceof MockAiAnswerProvider);
  assert.equal(resolved.backendUrl, null);
});

await checkAsync('gemini selection uses HttpAiAnswerProvider without API key', async () => {
  const resolved = await resolveWorkflowAiProvider({
    kind: AiProviderKind.GEMINI,
    geminiHealthy: true,
  });
  assert.equal(resolved.kind, AiProviderKind.GEMINI);
  assert.equal(resolved.status, 'gemini_configured');
  assert.equal(resolved.statusLabel, providerStatusLabel('gemini_configured'));
  assert.ok(resolved.provider instanceof HttpAiAnswerProvider);
  assert.equal(resolved.backendUrl, DEFAULT_GEMINI_BACKEND_URL);
  assert.equal(
    JSON.stringify(resolved).includes('GEMINI_API_KEY'),
    false,
  );
});

await checkAsync('HTTP provider success path through orchestration + P10', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        status: 'proposed',
        value: { kind: 'single', value: 'I want to contribute.' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  const provider = new HttpAiAnswerProvider({
    baseUrl: DEFAULT_GEMINI_BACKEND_URL,
    fetchImpl,
  });

  const matching = matchFormQuestions(fixture.form);
  const orchestrated = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching,
    profile: fixture.profile,
    savedAnswers: [],
    provider,
  });
  const why = orchestrated.results.find((r) => r.questionId === 'q-ai-why');
  assert.equal(why?.status, 'resolved');
  assert.equal(why?.source, 'ai');

  const validation = validateAnswersForFill({
    form: fixture.form,
    candidates: orchestrated.results.map((result) => ({
      questionId: result.questionId,
      ...(result.value !== undefined ? { value: result.value } : {}),
      upstreamStatus: result.status,
      ...(result.source !== undefined ? { source: result.source } : {}),
    })),
  });
  const validatedWhy = validation.results.find(
    (r) => r.questionId === 'q-ai-why',
  );
  assert.equal(validatedWhy?.status, 'valid');
  assert.equal(validatedWhy?.fillable, true);
});

await checkAsync('backend unavailable becomes provider_error-friendly', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const resolved = await resolveWorkflowAiProvider({
    kind: AiProviderKind.GEMINI,
    fetchImpl,
  });
  assert.equal(resolved.status, 'gemini_unavailable');
  assert.equal(resolved.statusLabel, 'Gemini backend unavailable');

  const proposal = await resolved.provider.proposeAnswer({
    questionId: 'q-ai-why',
    questionText: 'Why do you want this role?',
    questionType: 'paragraph',
  });
  assert.equal(proposal.status, 'error');
  assert.match(proposal.message ?? '', /unreachable/i);
});

await checkAsync('malformed provider response stays error / non-fillable', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ status: 'proposed', value: { kind: 'nope' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const provider = new HttpAiAnswerProvider({
    baseUrl: DEFAULT_GEMINI_BACKEND_URL,
    fetchImpl,
  });
  const proposal = await provider.proposeAnswer({
    questionId: 'q-ai-why',
    questionText: 'Why do you want this role?',
    questionType: 'paragraph',
  });
  assert.equal(proposal.status, 'error');

  const matching = matchFormQuestions(fixture.form);
  const orchestrated = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching,
    profile: null,
    savedAnswers: [],
    provider,
  });
  const why = orchestrated.results.find((r) => r.questionId === 'q-ai-why');
  assert.equal(why?.status, 'provider_error');

  const validation = validateAnswersForFill({
    form: fixture.form,
    candidates: orchestrated.results.map((result) => ({
      questionId: result.questionId,
      ...(result.value !== undefined ? { value: result.value } : {}),
      upstreamStatus: result.status,
      ...(result.source !== undefined ? { source: result.source } : {}),
    })),
  });
  const validatedWhy = validation.results.find(
    (r) => r.questionId === 'q-ai-why',
  );
  assert.equal(validatedWhy?.status, 'provider_error');
  assert.equal(validatedWhy?.fillable, false);
});

await checkAsync('P10 validation still blocks invalid answers before FillPlan', async () => {
  const provider: AiAnswerProvider = {
    id: 'bad-ai',
    async proposeAnswer(context) {
      if (context.questionId !== 'q-ai-why') {
        return { status: 'unsupported', message: 'skip' };
      }
      return {
        status: 'proposed',
        value: { kind: 'single', value: '   ' },
      };
    },
  };
  const matching = matchFormQuestions(fixture.form);
  const orchestrated = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching,
    profile: fixture.profile,
    savedAnswers: [],
    provider,
  });
  const validation = validateAnswersForFill({
    form: fixture.form,
    candidates: orchestrated.results.map((result) => ({
      questionId: result.questionId,
      ...(result.value !== undefined ? { value: result.value } : {}),
      upstreamStatus: result.status,
      ...(result.source !== undefined ? { source: result.source } : {}),
    })),
  });
  const why = validation.results.find((r) => r.questionId === 'q-ai-why');
  assert.ok(why);
  assert.notEqual(why.status, 'valid');
  assert.equal(why.fillable, false);

  const forced = applyReviewSelection(
    validation.results.map((result) => ({
      questionId: result.questionId,
      questionText: result.questionId,
      questionType: 'paragraph' as const,
      status: result.status,
      required: result.required,
      validationErrors: result.validationErrors,
      fillable: result.fillable,
      approved: result.questionId === 'q-ai-why',
      editable: true,
      ...(result.value !== undefined ? { value: result.value } : {}),
    })),
    {
      'q-ai-why': {
        editedValue: { kind: 'single', value: '   ' },
        approved: true,
      },
    },
    fixture.form,
  );
  const whyAfter = forced.find((item) => item.questionId === 'q-ai-why');
  assert.equal(whyAfter?.fillable, false);
  assert.equal(whyAfter?.approved, false);

  const built = buildFillPlanFromApproved({
    form: fixture.form,
    approved: collectApprovedAnswers(forced),
  });
  assert.equal(
    built.plan?.operations.some((op) => op.questionId === 'q-ai-why') ?? false,
    false,
  );
});

await checkAsync('health probe uses /healthz only', async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const healthy = await checkGeminiBackendHealth(
    DEFAULT_GEMINI_BACKEND_URL,
    fetchImpl,
  );
  assert.equal(healthy, true);
  assert.deepEqual(urls, [`${DEFAULT_GEMINI_BACKEND_URL}/healthz`]);
});

check('extension sources do not embed API keys or @google/genai', () => {
  const files = [
    'src/popup/App.tsx',
    'src/popup/workflow.ts',
    'src/popup/provider.ts',
    'src/core/ai/http-provider.ts',
    'src/storage/ai-provider-preference.ts',
  ];
  for (const relative of files) {
    const source = readFileSync(join(__dirname, '..', relative), 'utf8');
    assert.equal(source.includes('@google/genai'), false, relative);
    assert.equal(source.includes('GEMINI_API_KEY'), false, relative);
    assert.equal(/AIza[0-9A-Za-z_-]{10,}/u.test(source), false, relative);
  }
});

if (failures > 0) {
  console.error(`\n${failures} P12B smoke check(s) failed.`);
  process.exit(1);
}

console.log('\nAll P12B provider-selection smoke checks passed.');
