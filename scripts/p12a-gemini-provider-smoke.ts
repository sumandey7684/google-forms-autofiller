/**
 * P12A Gemini provider boundary smoke (no live network / no API key required).
 *
 *   pnpm run p12a-gemini-provider-smoke
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { AnswerValueSchema } from '../src/core/validation/answer.ts';
import { HttpAiAnswerProvider } from '../src/core/ai/http-provider.ts';
import type { AiAnswerProvider } from '../src/core/ai/types.ts';
import { resolveAnswersWithAiFallback } from '../src/core/ai/orchestrate.ts';
import { matchFormQuestions } from '../src/core/matching/index.ts';
import { validateAnswersForFill } from '../src/core/answer-validation/index.ts';
import type { Form } from '../src/core/types/form.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import backend modules via relative TS paths under backend/src.
const {
  GeminiAnswerProvider,
  parseGeminiProposalTextForTests,
  buildGeminiUserInputForTests,
} = await import('../backend/src/gemini-provider.ts');
const { sanitizeDiagnostic } = await import('../backend/src/safe.ts');
const { createBackendServer } = await import('../backend/src/server.ts');
const {
  loadBackendConfig,
  describeConfig,
} = await import('../backend/src/config.ts');

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

check('parses structured Gemini proposal JSON with AnswerValueSchema', () => {
  const proposal = parseGeminiProposalTextForTests(
    JSON.stringify({
      status: 'proposed',
      value: { kind: 'single', value: 'Engineer' },
    }),
  );
  assert.equal(proposal.status, 'proposed');
  assert.ok(proposal.value);
  assert.equal(AnswerValueSchema.safeParse(proposal.value).success, true);
});

check('rejects non-JSON and malformed proposals as error', () => {
  assert.equal(parseGeminiProposalTextForTests('not-json').status, 'error');
  assert.equal(
    parseGeminiProposalTextForTests(
      JSON.stringify({ status: 'proposed' }),
    ).status,
    'error',
  );
});

check('user input stays minimal and excludes secrets fields', () => {
  const input = JSON.parse(
    buildGeminiUserInputForTests({
      questionId: 'q1',
      questionText: 'Full Name',
      questionType: 'text',
      profileContext: { fullName: 'Ada' },
    }),
  ) as Record<string, unknown>;
  assert.equal(input['questionId'], 'q1');
  assert.equal('savedAnswers' in input, false);
  assert.equal('form' in input, false);
  assert.equal('apiKey' in input, false);
});

check('sanitizeDiagnostic redacts API-key-like strings', () => {
  const cleaned = sanitizeDiagnostic(
    'failed with AIzaSyDummyKeyValue1234567890 and Bearer secret-token',
  );
  assert.equal(cleaned.includes('AIza'), false);
  assert.equal(cleaned.includes('secret-token'), false);
  assert.match(cleaned, /redacted/i);
});

check('loadBackendConfig requires GEMINI_API_KEY', () => {
  assert.throws(
    () =>
      loadBackendConfig({
        GEMINI_API_KEY: '',
        GEMINI_MODEL: 'gemini-2.5-flash',
        BACKEND_PORT: '8787',
      } as NodeJS.ProcessEnv),
    /GEMINI_API_KEY/,
  );
});

check('describeConfig never includes the API key value', () => {
  const summary = describeConfig({
    geminiApiKey: 'should-never-appear-in-logs',
    geminiModel: 'gemini-2.5-flash',
    geminiTimeoutMs: 15000,
    host: '127.0.0.1',
    port: 8787,
  });
  assert.equal(summary.includes('should-never-appear-in-logs'), false);
  assert.match(summary, /apiKey=set/);
});

await checkAsync('Gemini provider maps client failures to error status', async () => {
  const provider = new GeminiAnswerProvider(
    {
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-2.5-flash',
      geminiTimeoutMs: 1000,
    },
    {
      async create() {
        throw new Error('network boom AIzaSyShouldRedact1234567890');
      },
    },
  );
  const result = await provider.proposeAnswer({
    questionId: 'q1',
    questionText: 'Why this role?',
    questionType: 'paragraph',
  });
  assert.equal(result.status, 'error');
  assert.equal(result.message?.includes('AIza'), false);
});

await checkAsync('Gemini provider returns unsupported for unknown questions', async () => {
  const provider = new GeminiAnswerProvider(
    {
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-2.5-flash',
      geminiTimeoutMs: 1000,
    },
    {
      async create() {
        throw new Error('should not be called');
      },
    },
  );
  const result = await provider.proposeAnswer({
    questionId: 'q-unknown',
    questionText: 'Weird',
    questionType: 'unknown',
  });
  assert.equal(result.status, 'unsupported');
});

await checkAsync('local HTTP proxy + HttpAiAnswerProvider round-trip', async () => {
  const gemini = new GeminiAnswerProvider(
    {
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-2.5-flash',
      geminiTimeoutMs: 1000,
    },
    {
      async create() {
        return {
          status: 'completed',
          output_text: JSON.stringify({
            status: 'proposed',
            value: { kind: 'single', value: 'I want to contribute.' },
          }),
        };
      },
    },
  );

  const server = createBackendServer(gemini);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const httpProvider = new HttpAiAnswerProvider({ baseUrl, timeoutMs: 5000 });
    const proposal = await httpProvider.proposeAnswer({
      questionId: 'q-ai',
      questionText: 'Why do you want this role?',
      questionType: 'paragraph',
    });
    assert.equal(proposal.status, 'proposed');
    assert.deepEqual(proposal.value, {
      kind: 'single',
      value: 'I want to contribute.',
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

await checkAsync(
  'orchestrated AI proposal validates through P10 without inventing answers',
  async () => {
    const form = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'fixtures', 'p11-autofill-workflow.json'),
        'utf8',
      ),
    ).form as Form;

    const httpLike: AiAnswerProvider = {
      id: 'test-http',
      async proposeAnswer(context) {
        if (context.questionId === 'q-ai-why') {
          return {
            status: 'proposed',
            value: { kind: 'single', value: 'Contribute carefully.' },
          };
        }
        return { status: 'unsupported', message: 'no answer' };
      },
    };

    const matching = matchFormQuestions(form);
    const orchestrated = await resolveAnswersWithAiFallback({
      form,
      matching,
      profile: {
        fullName: 'Profile Test User',
        email: 'profile@example.com',
      },
      savedAnswers: [],
      provider: httpLike,
    });

    const validation = validateAnswersForFill({
      form,
      candidates: orchestrated.results.map((result) => ({
        questionId: result.questionId,
        ...(result.value !== undefined ? { value: result.value } : {}),
        upstreamStatus: result.status,
        ...(result.source !== undefined ? { source: result.source } : {}),
      })),
    });

    const why = validation.results.find((r) => r.questionId === 'q-ai-why');
    assert.ok(why);
    assert.equal(why.status, 'valid');
    assert.equal(why.fillable, true);

    const unresolved = validation.results.find(
      (r) => r.questionId === 'q-unresolved',
    );
    assert.ok(unresolved);
    assert.equal(unresolved.fillable, false);
  },
);

check('extension source does not import @google/genai', () => {
  const aiIndex = readFileSync(
    join(__dirname, '..', 'src', 'core', 'ai', 'index.ts'),
    'utf8',
  );
  const httpProvider = readFileSync(
    join(__dirname, '..', 'src', 'core', 'ai', 'http-provider.ts'),
    'utf8',
  );
  const workflow = readFileSync(
    join(__dirname, '..', 'src', 'popup', 'workflow.ts'),
    'utf8',
  );
  for (const source of [aiIndex, httpProvider, workflow]) {
    assert.equal(source.includes('@google/genai'), false);
    assert.equal(source.includes('GEMINI_API_KEY'), false);
  }
});

if (failures > 0) {
  console.error(`\n${failures} P12A smoke check(s) failed.`);
  process.exit(1);
}

console.log('\nAll P12A Gemini provider boundary smoke checks passed.');
