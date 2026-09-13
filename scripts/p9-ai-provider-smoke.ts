/**
 * P9 AI provider boundary and fallback orchestration smoke/audit.
 *
 *   pnpm run p9-ai-provider-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Form } from '../src/core/types/form.ts';
import { matchFormQuestions } from '../src/core/matching/index.ts';
import {
  createSavedAnswer,
  type CreateSavedAnswerInput,
  type ProfileValues,
} from '../src/core/resolution/index.ts';
import {
  MockAiAnswerProvider,
  buildAiQuestionContext,
  resolveAnswersWithAiFallback,
} from '../src/core/ai/index.ts';

interface P9Fixture {
  profile: ProfileValues;
  form: Form;
  savedAnswerInputs: readonly CreateSavedAnswerInput[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p9-ai-provider.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as P9Fixture;

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

check('minimal AI context excludes saved answers and whole-form fields', () => {
  const question = fixture.form.sections[0]!.questions[2]!;
  const context = buildAiQuestionContext(question, {
    includeProfileContext: true,
    profile: fixture.profile,
  });
  assert.equal(context.questionId, 'q-ai-text');
  assert.equal(context.questionType, 'text');
  assert.equal(context.questionText, 'Why do you want this role?');
  assert.equal(context.description, 'One short sentence.');
  assert.deepEqual(context.profileContext, {
    fullName: 'Profile Test User',
    email: 'profile@example.com',
    location: 'Test City',
  });
  assert.equal('savedAnswers' in context, false);
  assert.equal('form' in context, false);
  assert.equal('url' in context, false);
});

check('profile context is omitted unless explicitly requested', () => {
  const question = fixture.form.sections[0]!.questions[2]!;
  const context = buildAiQuestionContext(question, {
    profile: fixture.profile,
  });
  assert.equal(context.profileContext, undefined);
});

await checkAsync('fallback order prefers saved answer and profile before AI', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-saved-exact': {
        status: 'proposed',
        value: { kind: 'single', value: 'AI must not win' },
      },
      'q-profile': {
        status: 'proposed',
        value: { kind: 'single', value: 'AI must not win email' },
      },
      'q-ai-text': {
        status: 'proposed',
        value: { kind: 'single', value: 'I want to contribute.' },
      },
    },
  });

  const report = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: fixture.profile,
    savedAnswers: fixture.savedAnswerInputs.map(createSavedAnswer),
    provider,
    includeProfileContext: true,
  });

  const byId = new Map(report.results.map((result) => [result.questionId, result]));
  assert.equal(byId.get('q-saved-exact')?.source, 'saved_answer');
  assert.deepEqual(byId.get('q-saved-exact')?.value, {
    kind: 'single',
    value: 'Saved Exact User',
  });
  assert.equal(byId.get('q-profile')?.source, 'profile');
  assert.deepEqual(byId.get('q-profile')?.value, {
    kind: 'single',
    value: 'profile@example.com',
  });
  assert.equal(byId.get('q-ai-text')?.source, 'ai');
  assert.deepEqual(byId.get('q-ai-text')?.value, {
    kind: 'single',
    value: 'I want to contribute.',
  });

  const calledIds = provider.getSeenContexts().map((context) => context.questionId);
  assert.equal(calledIds.includes('q-saved-exact'), false);
  assert.equal(calledIds.includes('q-profile'), false);
  assert.equal(calledIds.includes('q-ai-text'), true);
});

await checkAsync('valid AI choice answers are canonicalized through existing validation', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ai-choice': {
        status: 'proposed',
        value: { kind: 'single', value: 'Engineer' },
      },
    },
  });
  const report = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: fixture.profile,
    savedAnswers: fixture.savedAnswerInputs.map(createSavedAnswer),
    provider,
  });
  const result = report.results.find((item) => item.questionId === 'q-ai-choice');
  assert.equal(result?.status, 'resolved');
  assert.equal(result?.source, 'ai');
  assert.deepEqual(result?.value, { kind: 'single', value: 'opt:engineer' });
});

await checkAsync('invalid AI answer shapes remain invalid and do not invent values', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ai-invalid': {
        status: 'proposed',
        value: { kind: 'multi', values: ['wrong-shape'] },
      },
    },
  });
  const report = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: null,
    savedAnswers: [],
    provider,
  });
  const result = report.results.find((item) => item.questionId === 'q-ai-invalid');
  assert.equal(result?.status, 'invalid');
  assert.equal(result?.value, undefined);
  assert.equal(result?.source, 'ai');
  assert.equal(
    JSON.stringify(result?.validationErrors).includes('wrong-shape'),
    false,
  );
});

await checkAsync('provider failures become explicit provider_error states', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ai-error': {
        status: 'error',
        message: 'Upstream timeout',
      },
    },
  });
  const report = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: null,
    savedAnswers: [],
    provider,
  });
  const result = report.results.find((item) => item.questionId === 'q-ai-error');
  assert.equal(result?.status, 'provider_error');
  assert.equal(result?.providerId, 'mock-ai');
  assert.equal(result?.validationErrors[0]?.code, 'ai_provider_error');
});

await checkAsync('ambiguous saved answers are preserved and never sent to AI', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ambiguous-saved': {
        status: 'proposed',
        value: { kind: 'single', value: 'AI must not run' },
      },
    },
  });
  const report = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: fixture.profile,
    savedAnswers: fixture.savedAnswerInputs.map(createSavedAnswer),
    provider,
  });
  const result = report.results.find(
    (item) => item.questionId === 'q-ambiguous-saved',
  );
  assert.equal(result?.status, 'ambiguous');
  assert.equal(result?.source, 'saved_answer');
  assert.equal(result?.value, undefined);
  assert.equal(
    provider.getSeenContexts().some((context) => context.questionId === 'q-ambiguous-saved'),
    false,
  );
});

await checkAsync('unknown questions remain unsupported without provider calls', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-unknown': {
        status: 'proposed',
        value: { kind: 'single', value: 'should not apply' },
      },
    },
  });
  const report = await resolveAnswersWithAiFallback({
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: null,
    savedAnswers: [],
    provider,
  });
  const result = report.results.find((item) => item.questionId === 'q-unknown');
  assert.equal(result?.status, 'unsupported');
  assert.equal(
    provider.getSeenContexts().some((context) => context.questionId === 'q-unknown'),
    false,
  );
});

await checkAsync('orchestration is deterministic and JSON serializable', async () => {
  const providerFactory = () =>
    new MockAiAnswerProvider({
      responses: {
        'q-ai-text': {
          status: 'proposed',
          value: { kind: 'single', value: 'Deterministic AI answer' },
        },
        'q-ai-choice': {
          status: 'proposed',
          value: { kind: 'single', value: 'Designer' },
        },
        'q-ai-invalid': {
          status: 'proposed',
          value: { kind: 'multi', values: ['x'] },
        },
        'q-ai-error': {
          status: 'error',
          message: 'Upstream timeout',
        },
      },
    });

  const inputBase = {
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: fixture.profile,
    savedAnswers: fixture.savedAnswerInputs.map(createSavedAnswer),
    includeProfileContext: true,
  };
  const baseline = JSON.stringify(
    await resolveAnswersWithAiFallback({
      ...inputBase,
      provider: providerFactory(),
    }),
  );
  assert.ok(baseline.length > 0);
  for (let run = 0; run < 10; run += 1) {
    const repeated = JSON.stringify(
      await resolveAnswersWithAiFallback({
        ...inputBase,
        provider: providerFactory(),
      }),
    );
    assert.equal(repeated, baseline);
  }
});

check('AI module source has no DOM, Chrome, storage, network, FillPlan, or SDK imports', () => {
  const aiDir = join(__dirname, '..', 'src', 'core', 'ai');
  const source = [
    'index.ts',
    'types.ts',
    'context.ts',
    'mock-provider.ts',
    'orchestrate.ts',
  ]
    .map((file) => readFileSync(join(aiDir, file), 'utf8'))
    .join('\n');

  const forbidden: readonly [string, RegExp][] = [
    ['DOM globals', /\b(?:document|window)\s*\./u],
    ['Chrome APIs', /\bchrome\s*\./u],
    ['storage imports', /from\s+['"][^'"]*storage/iu],
    ['network APIs', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon\s*\(/u],
    ['AI SDKs', /from\s+['"][^'"]*(?:openai|anthropic|@google\/generative-ai|gemini)/iu],
    ['FillPlan imports', /core\/types\/fill/u],
    ['API key literals', /(?:api[_-]?key|sk-[a-zA-Z0-9]{10,}|OPENAI_API_KEY\s*=\s*['"][^'"]+)/iu],
  ];
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});

if (failures > 0) {
  console.error(`\nP9 smoke failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log('\nP9 smoke passed.');
}
