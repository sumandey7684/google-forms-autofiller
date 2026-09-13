/**
 * P10 pre-fill answer validation smoke/audit.
 *
 *   pnpm run p10-answer-validation-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Form, Question } from '../src/core/types/form.ts';
import { getFormQuestions } from '../src/core/types/form.ts';
import {
  validateAnswerCandidate,
  validateAnswersForFill,
  type AnswerCandidate,
} from '../src/core/answer-validation/index.ts';

interface P10Fixture {
  form: Form;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  '..',
  'fixtures',
  'p10-answer-validation.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as P10Fixture;
const questions = getFormQuestions(fixture.form);
const byId = new Map(questions.map((question) => [question.id, question]));

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

function q(id: string): Question {
  const question = byId.get(id);
  assert.ok(question, id);
  return question;
}

check('validates text, paragraph, choice, checkbox, dropdown, scale, date, time', () => {
  const report = validateAnswersForFill({
    form: fixture.form,
    candidates: [
      {
        questionId: 'q-text-required',
        value: { kind: 'single', value: 'Test User' },
        upstreamStatus: 'resolved',
        source: 'saved_answer',
      },
      {
        questionId: 'q-paragraph',
        value: { kind: 'single', value: 'About me' },
        upstreamStatus: 'resolved',
        source: 'ai',
      },
      {
        questionId: 'q-mc',
        value: { kind: 'single', value: 'Engineer' },
        upstreamStatus: 'resolved',
        source: 'ai',
      },
      {
        questionId: 'q-checkbox',
        value: { kind: 'multi', values: ['TypeScript', 'opt:rs'] },
        upstreamStatus: 'resolved',
        source: 'saved_answer',
      },
      {
        questionId: 'q-dropdown',
        value: { kind: 'single', value: 'opt:in' },
        upstreamStatus: 'resolved',
        source: 'profile',
      },
      {
        questionId: 'q-scale',
        value: { kind: 'single', value: '4' },
        upstreamStatus: 'resolved',
      },
      {
        questionId: 'q-date',
        value: { kind: 'single', value: '2026-09-13' },
        upstreamStatus: 'resolved',
      },
      {
        questionId: 'q-time',
        value: { kind: 'single', value: '09:30' },
        upstreamStatus: 'resolved',
      },
    ],
  });

  const fillable = report.results.filter((result) => result.fillable);
  assert.equal(fillable.length, 8);
  assert.deepEqual(
    report.results.find((result) => result.questionId === 'q-mc')?.value,
    { kind: 'single', value: 'opt:engineer' },
  );
  assert.deepEqual(
    report.results.find((result) => result.questionId === 'q-checkbox')?.value,
    { kind: 'multi', values: ['opt:ts', 'opt:rs'] },
  );
});

check('rejects wrong shapes, invalid options, dates, and times', () => {
  assert.equal(
    validateAnswerCandidate(q('q-text-required'), {
      questionId: 'q-text-required',
      value: { kind: 'multi', values: ['x'] },
    }).status,
    'invalid',
  );
  assert.equal(
    validateAnswerCandidate(q('q-mc'), {
      questionId: 'q-mc',
      value: { kind: 'single', value: 'Missing' },
    }).status,
    'invalid',
  );
  assert.equal(
    validateAnswerCandidate(q('q-date'), {
      questionId: 'q-date',
      value: { kind: 'single', value: '2027-02-29' },
    }).status,
    'invalid',
  );
  assert.equal(
    validateAnswerCandidate(q('q-time'), {
      questionId: 'q-time',
      value: { kind: 'single', value: '24:00' },
    }).status,
    'invalid',
  );
  assert.equal(
    validateAnswerCandidate(q('q-scale'), {
      questionId: 'q-scale',
      value: { kind: 'single', value: '9' },
    }).status,
    'invalid',
  );
});

check('duplicate option labels remain ambiguous unless option id is used', () => {
  assert.equal(
    validateAnswerCandidate(q('q-dup-label'), {
      questionId: 'q-dup-label',
      value: { kind: 'single', value: 'Same' },
    }).status,
    'ambiguous',
  );
  assert.deepEqual(
    validateAnswerCandidate(q('q-dup-label'), {
      questionId: 'q-dup-label',
      value: { kind: 'single', value: 'opt:b' },
    }).value,
    { kind: 'single', value: 'opt:b' },
  );
});

check('required missing answers stay missing and are never invented', () => {
  const report = validateAnswersForFill({
    form: fixture.form,
    candidates: [
      {
        questionId: 'q-paragraph',
        value: { kind: 'single', value: 'Optional body' },
        upstreamStatus: 'resolved',
      },
    ],
  });
  const required = report.results.find(
    (result) => result.questionId === 'q-text-required',
  );
  const mc = report.results.find((result) => result.questionId === 'q-mc');
  assert.equal(required?.status, 'missing');
  assert.equal(required?.fillable, false);
  assert.equal(
    required?.validationErrors.some((error) => error.code === 'required_unanswered'),
    true,
  );
  assert.equal(mc?.status, 'missing');
  assert.equal(report.readyForFillPlan, false);
  assert.equal(report.totals.requiredMissing >= 2, true);
});

check('preserves provider_error, unsupported, and upstream ambiguity', () => {
  const providerError = validateAnswerCandidate(q('q-paragraph'), {
    questionId: 'q-paragraph',
    upstreamStatus: 'provider_error',
    source: 'ai',
    providerId: 'mock-ai',
    validationErrors: [
      { code: 'ai_provider_error', message: 'Upstream timeout' },
    ],
  });
  assert.equal(providerError.status, 'provider_error');
  assert.equal(providerError.fillable, false);
  assert.equal(providerError.value, undefined);

  const unsupported = validateAnswerCandidate(q('q-unknown'), {
    questionId: 'q-unknown',
    value: { kind: 'single', value: 'nope' },
    upstreamStatus: 'resolved',
  });
  assert.equal(unsupported.status, 'unsupported');

  const ambiguous = validateAnswerCandidate(q('q-text-required'), {
    questionId: 'q-text-required',
    upstreamStatus: 'ambiguous',
    source: 'saved_answer',
    ambiguity: {
      source: 'saved_answer',
      sourceKeys: ['a', 'b'],
      message: 'Ambiguous saved answers',
    },
  });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.value, undefined);
});

check('optional unanswered questions do not invent values or block readiness alone', () => {
  const report = validateAnswersForFill({
    form: fixture.form,
    candidates: [
      {
        questionId: 'q-text-required',
        value: { kind: 'single', value: 'Required User' },
        upstreamStatus: 'resolved',
      },
      {
        questionId: 'q-mc',
        value: { kind: 'single', value: 'Designer' },
        upstreamStatus: 'resolved',
      },
      {
        questionId: 'q-optional-empty',
        upstreamStatus: 'missing',
      },
    ],
  });
  const optional = report.results.find(
    (result) => result.questionId === 'q-optional-empty',
  );
  assert.equal(optional?.status, 'missing');
  assert.equal(optional?.value, undefined);
  assert.equal(report.readyForFillPlan, true);
});

check('diagnostics never echo rejected answer values', () => {
  const secret = 'P10_SECRET_MUST_NOT_LEAK';
  const result = validateAnswerCandidate(q('q-mc'), {
    questionId: 'q-mc',
    value: { kind: 'single', value: secret },
  });
  assert.equal(result.status, 'invalid');
  assert.equal(JSON.stringify(result.validationErrors).includes(secret), false);
});

check('report is deterministic and JSON serializable', () => {
  const candidates: AnswerCandidate[] = [
    {
      questionId: 'q-text-required',
      value: { kind: 'single', value: 'User' },
      upstreamStatus: 'resolved',
    },
    {
      questionId: 'q-mc',
      value: { kind: 'single', value: 'Engineer' },
      upstreamStatus: 'resolved',
    },
    {
      questionId: 'q-unknown',
      upstreamStatus: 'unsupported',
    },
  ];
  const baseline = JSON.stringify(
    validateAnswersForFill({ form: fixture.form, candidates }),
  );
  for (let run = 0; run < 20; run += 1) {
    assert.equal(
      JSON.stringify(validateAnswersForFill({ form: fixture.form, candidates })),
      baseline,
    );
  }
});

check('answer-validation source has no DOM, Chrome, storage, network, AI SDK, or FillPlan execution', () => {
  const dir = join(__dirname, '..', 'src', 'core', 'answer-validation');
  const source = ['index.ts', 'types.ts', 'gate.ts']
    .map((file) => readFileSync(join(dir, file), 'utf8'))
    .join('\n');
  const forbidden: readonly [string, RegExp][] = [
    ['DOM globals', /\b(?:document|window)\s*\./u],
    ['Chrome APIs', /\bchrome\s*\./u],
    ['storage imports', /from\s+['"][^'"]*storage/iu],
    ['network APIs', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/u],
    ['AI SDKs', /from\s+['"][^'"]*(?:openai|anthropic|gemini)/iu],
    ['FillPlan execution', /applyFillPlan|core\/types\/fill/u],
    ['nondeterminism', /\bMath\.random\s*\(|\bDate\.now\s*\(|new\s+Date\s*\(/u],
  ];
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});

if (failures > 0) {
  console.error(`\nP10 smoke failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log('\nP10 smoke passed.');
}
