/**
 * P8 saved-answer and answer-resolution smoke/audit.
 *
 *   pnpm run p8-saved-answers-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnswerValue } from '../src/core/types/answer.ts';
import type { Form, Question } from '../src/core/types/form.ts';
import { matchFormQuestions } from '../src/core/matching/index.ts';
import type {
  CreateSavedAnswerInput,
  ProfileValues,
} from '../src/core/resolution/index.ts';
import {
  createSavedAnswer,
  resolveAnswers,
  validateAnswerValue,
} from '../src/core/resolution/index.ts';

interface P8Fixture {
  profile: ProfileValues;
  form: Form;
  savedAnswerInputs: readonly CreateSavedAnswerInput[];
  duplicateForm: Form;
  duplicateFallbackInput: CreateSavedAnswerInput;
  unsupportedQuestion: {
    id: string;
    type: string;
    text: string;
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p8-saved-answers.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as P8Fixture;

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

function validate(question: Question, value: AnswerValue) {
  return validateAnswerValue(question, value);
}

check('text and paragraph require non-empty single values', () => {
  const text: Question = { id: 'q-text', type: 'text', text: 'Name' };
  const paragraph: Question = {
    id: 'q-paragraph',
    type: 'paragraph',
    text: 'Notes',
  };

  assert.equal(
    validate(text, { kind: 'single', value: 'Test User' }).status,
    'valid',
  );
  assert.equal(
    validate(paragraph, { kind: 'single', value: 'Details' }).status,
    'valid',
  );
  assert.equal(validate(text, { kind: 'multi', values: ['x'] }).status, 'invalid');
  assert.equal(validate(text, { kind: 'single', value: '   ' }).status, 'invalid');
});

check('single-choice labels canonicalize to unique option ids', () => {
  const question: Question = {
    id: 'q-choice',
    type: 'multiple_choice',
    text: 'Choose',
    options: [
      { id: 'opt:a', label: 'Alpha' },
      { id: 'opt:b', label: 'Beta' },
    ],
  };
  const result = validate(question, { kind: 'single', value: 'Beta' });
  assert.equal(result.status, 'valid');
  assert.deepEqual(result.value, { kind: 'single', value: 'opt:b' });
  assert.equal(
    validate(question, { kind: 'single', value: 'Missing' }).status,
    'invalid',
  );
});

check('duplicate choice labels remain ambiguous unless option id is used', () => {
  const question: Question = {
    id: 'q-duplicate',
    type: 'dropdown',
    text: 'Choose',
    options: [
      { id: 'opt:1', label: 'Same' },
      { id: 'opt:2', label: 'Same' },
    ],
  };
  assert.equal(
    validate(question, { kind: 'single', value: 'Same' }).status,
    'ambiguous',
  );
  assert.deepEqual(
    validate(question, { kind: 'single', value: 'opt:2' }).value,
    { kind: 'single', value: 'opt:2' },
  );
});

check('checkbox validates and canonicalizes every requested option', () => {
  const question: Question = {
    id: 'q-checkbox',
    type: 'checkbox',
    text: 'Languages',
    options: [
      { id: 'opt:ts', label: 'TypeScript' },
      { id: 'opt:rs', label: 'Rust' },
    ],
  };
  const result = validate(question, {
    kind: 'multi',
    values: ['TypeScript', 'opt:rs'],
  });
  assert.equal(result.status, 'valid');
  assert.deepEqual(result.value, {
    kind: 'multi',
    values: ['opt:ts', 'opt:rs'],
  });
  assert.equal(
    validate(question, { kind: 'single', value: 'TypeScript' }).status,
    'invalid',
  );
  assert.equal(
    validate(question, { kind: 'multi', values: ['Missing'] }).status,
    'invalid',
  );
});

check('linear scale validates an integer within bounds', () => {
  const question: Question = {
    id: 'q-scale',
    type: 'linear_scale',
    text: 'Rating',
    min: 1,
    max: 5,
  };
  assert.equal(
    validate(question, { kind: 'single', value: '4' }).status,
    'valid',
  );
  assert.equal(
    validate(question, { kind: 'single', value: '6' }).status,
    'invalid',
  );
  assert.equal(
    validate(question, { kind: 'single', value: '4.5' }).status,
    'invalid',
  );
});

check('date and time use strict valid calendar/clock formats', () => {
  const date: Question = { id: 'q-date', type: 'date', text: 'Date' };
  const time: Question = { id: 'q-time', type: 'time', text: 'Time' };

  assert.equal(
    validate(date, { kind: 'single', value: '2028-02-29' }).status,
    'valid',
  );
  assert.equal(
    validate(date, { kind: 'single', value: '2027-02-29' }).status,
    'invalid',
  );
  assert.equal(
    validate(time, { kind: 'single', value: '23:59' }).status,
    'valid',
  );
  assert.equal(
    validate(time, { kind: 'single', value: '24:00' }).status,
    'invalid',
  );
});

check('unknown questions are unsupported', () => {
  const question: Question = {
    id: 'q-unknown',
    type: 'unknown',
    text: 'Unknown',
  };
  assert.equal(
    validate(question, { kind: 'single', value: 'x' }).status,
    'unsupported',
  );
});

check('validation diagnostics never echo rejected answer values', () => {
  const secret = 'P8_SECRET_REJECTED_VALUE';
  const question: Question = {
    id: 'q-choice-secret',
    type: 'multiple_choice',
    text: 'Choose',
    options: [{ id: 'opt:safe', label: 'Safe' }],
  };
  const result = validate(question, { kind: 'single', value: secret });
  assert.equal(result.status, 'invalid');
  assert.equal(JSON.stringify(result.validationErrors).includes(secret), false);
});

const resolutionForm: Form = {
  id: 'form:p8-focused',
  title: 'P8 focused form',
  url: 'https://example.invalid/p8',
  extractedAt: '2026-09-12T00:00:00.000Z',
  sections: [
    {
      id: 'section:1',
      title: 'Answers',
      questions: [
        { id: 'q-name', type: 'text', text: 'Full Name' },
        { id: 'q-email', type: 'text', text: 'Email Address' },
        {
          id: 'q-role',
          type: 'multiple_choice',
          text: 'Preferred Role',
          options: [
            { id: 'opt:engineer', label: 'Engineer' },
            { id: 'opt:designer', label: 'Designer' },
          ],
        },
      ],
    },
  ],
};
const resolutionMatching = matchFormQuestions(resolutionForm);

check('resolves profile fields and saved-answer precedence', () => {
  const savedAnswers = [
    createSavedAnswer({
      questionId: 'q-name',
      questionText: 'Full Name',
      questionType: 'text',
      value: { kind: 'single', value: 'Saved User' },
    }),
    createSavedAnswer({
      questionText: 'Preferred Role',
      questionType: 'multiple_choice',
      value: { kind: 'single', value: 'Engineer' },
    }),
  ];
  const report = resolveAnswers({
    form: resolutionForm,
    matching: resolutionMatching,
    profile: {
      fullName: 'Profile User',
      email: 'profile@example.com',
    },
    savedAnswers,
  });

  assert.deepEqual(report.results[0], {
    questionId: 'q-name',
    status: 'resolved',
    source: 'saved_answer',
    sourceKey: 'question:q-name',
    value: { kind: 'single', value: 'Saved User' },
    certainty: 1,
    validationErrors: [],
  });
  assert.equal(report.results[1]?.source, 'profile');
  assert.equal(report.results[1]?.sourceKey, 'profile:email');
  assert.deepEqual(report.results[1]?.value, {
    kind: 'single',
    value: 'profile@example.com',
  });
  assert.equal(report.results[2]?.source, 'saved_answer');
  assert.deepEqual(report.results[2]?.value, {
    kind: 'single',
    value: 'opt:engineer',
  });
});

check('ambiguous normalized-text saved answers are not selected', () => {
  const savedAnswers = [
    createSavedAnswer({
      questionText: 'Preferred Role',
      questionType: 'multiple_choice',
      context: 'application-a',
      value: { kind: 'single', value: 'Engineer' },
    }),
    createSavedAnswer({
      questionText: 'Preferred Role',
      questionType: 'multiple_choice',
      context: 'application-b',
      value: { kind: 'single', value: 'Designer' },
    }),
  ];
  const report = resolveAnswers({
    form: resolutionForm,
    matching: resolutionMatching,
    profile: { fullName: 'Profile User' },
    savedAnswers,
  });
  assert.equal(report.results[2]?.status, 'ambiguous');
  assert.equal(report.results[2]?.value, undefined);
  assert.equal(report.results[2]?.ambiguity?.source, 'saved_answer');
  assert.equal(report.results[2]?.ambiguity?.sourceKeys.length, 2);
});

check('invalid exact saved answer blocks profile fallback', () => {
  const report = resolveAnswers({
    form: resolutionForm,
    matching: resolutionMatching,
    profile: { fullName: 'Profile User' },
    savedAnswers: [
      createSavedAnswer({
        questionId: 'q-name',
        questionText: 'Full Name',
        questionType: 'text',
        value: { kind: 'multi', values: ['Wrong shape'] },
      }),
    ],
  });
  assert.equal(report.results[0]?.status, 'invalid');
  assert.equal(report.results[0]?.source, 'saved_answer');
  assert.equal(report.results[0]?.value, undefined);
});

check('missing profile values remain missing', () => {
  const report = resolveAnswers({
    form: resolutionForm,
    matching: resolutionMatching,
    profile: {},
    savedAnswers: [],
  });
  assert.equal(report.results[0]?.status, 'missing');
  assert.equal(report.results[1]?.status, 'missing');
});

check('ambiguous P7 matches remain ambiguous without saved answers', () => {
  const form: Form = {
    ...resolutionForm,
    id: 'form:p8-ambiguous',
    sections: [
      {
        id: 'section:1',
        title: 'Ambiguous',
        questions: [
          {
            id: 'q-contact',
            type: 'text',
            text: 'Provide your email address or phone number',
          },
        ],
      },
    ],
  };
  const report = resolveAnswers({
    form,
    matching: matchFormQuestions(form),
    profile: {
      email: 'profile@example.com',
      phone: '+1 555 0100',
    },
    savedAnswers: [],
  });
  assert.equal(report.results[0]?.status, 'ambiguous');
  assert.equal(report.results[0]?.value, undefined);
  assert.deepEqual(report.results[0]?.ambiguity?.sourceKeys, [
    'profile:email',
    'profile:phone',
  ]);
});

check('adversarial fixture resolves all profile fields and valid saved answers', () => {
  const matching = matchFormQuestions(fixture.form);
  const report = resolveAnswers({
    form: fixture.form,
    matching,
    profile: fixture.profile,
    savedAnswers: fixture.savedAnswerInputs.map(createSavedAnswer),
  });

  assert.deepEqual(report.totals, {
    total: 13,
    resolved: 12,
    missing: 0,
    invalid: 0,
    ambiguous: 0,
    unsupported: 1,
    blocked: 0,
  });
  assert.deepEqual(
    report.results.slice(0, 7).map((result) => result.source),
    [
      'profile',
      'saved_answer',
      'profile',
      'profile',
      'profile',
      'profile',
      'profile',
    ],
  );
  assert.deepEqual(report.results[7]?.value, {
    kind: 'single',
    value: 'opt:role:engineer',
  });
  assert.deepEqual(report.results[8]?.value, {
    kind: 'multi',
    values: ['opt:skills:ts', 'opt:skills:rust'],
  });
  assert.equal(report.results[12]?.status, 'unsupported');
});

check('duplicate current labels block normalized-text fallback', () => {
  const report = resolveAnswers({
    form: fixture.duplicateForm,
    matching: matchFormQuestions(fixture.duplicateForm),
    profile: null,
    savedAnswers: [createSavedAnswer(fixture.duplicateFallbackInput)],
  });
  assert.deepEqual(
    report.results.map((result) => result.status),
    ['ambiguous', 'ambiguous'],
  );
  assert.equal(report.results.every((result) => result.value === undefined), true);
});

check('runtime unsupported question kinds are not guessed', () => {
  const result = validateAnswerValue(
    fixture.unsupportedQuestion as Question,
    { kind: 'single', value: 'ignored' },
  );
  assert.equal(result.status, 'unsupported');
});

check('resolution is deterministic and JSON serializable', () => {
  const input = {
    form: fixture.form,
    matching: matchFormQuestions(fixture.form),
    profile: fixture.profile,
    savedAnswers: fixture.savedAnswerInputs.map(createSavedAnswer),
  };
  const baseline = JSON.stringify(resolveAnswers(input));
  assert.ok(baseline.length > 0);
  for (let run = 0; run < 25; run += 1) {
    assert.equal(JSON.stringify(resolveAnswers(input)), baseline);
  }
});

check('resolution diagnostics do not leak invalid answer values', () => {
  const secret = 'P8_INVALID_SECRET_MUST_NOT_LEAK';
  const report = resolveAnswers({
    form: resolutionForm,
    matching: resolutionMatching,
    profile: { fullName: 'Profile User' },
    savedAnswers: [
      createSavedAnswer({
        questionId: 'q-name',
        questionText: 'Full Name',
        questionType: 'text',
        value: { kind: 'multi', values: [secret] },
      }),
    ],
  });
  const diagnostics = JSON.stringify({
    validationErrors: report.results[0]?.validationErrors,
    ambiguity: report.results[0]?.ambiguity,
  });
  assert.equal(diagnostics.includes(secret), false);
});

check('P7 behavior remains unchanged when consumed by P8', () => {
  const matching = matchFormQuestions(fixture.form);
  assert.deepEqual(
    matching.results.slice(0, 7).map((result) => result.status),
    ['matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched'],
  );
  assert.equal(matching.results[7]?.status, 'unsupported');
});

check('pure resolution source has no DOM, Chrome, storage, network, AI, or FillPlan access', () => {
  const resolutionDir = join(__dirname, '..', 'src', 'core', 'resolution');
  const source = [
    'index.ts',
    'resolver.ts',
    'saved-answer.ts',
    'types.ts',
    'validate.ts',
  ]
    .map((file) => readFileSync(join(resolutionDir, file), 'utf8'))
    .join('\n');
  const forbidden: readonly [string, RegExp][] = [
    ['DOM globals', /\b(?:document|window)\s*\./u],
    ['Chrome APIs', /\bchrome\s*\./u],
    ['storage imports', /from\s+['"][^'"]*storage/iu],
    ['network APIs', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon\s*\(/u],
    ['AI providers', /from\s+['"][^'"]*(?:openai|anthropic|gemini)/iu],
    ['FillPlan imports', /core\/types\/fill/u],
    ['nondeterminism', /\bMath\.random\s*\(|\bDate\.now\s*\(|new\s+Date\s*\(/u],
  ];
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});

const storageState: Record<string, unknown> = {};
const chromeMock = {
  storage: {
    local: {
      async get(key: string): Promise<Record<string, unknown>> {
        return { [key]: storageState[key] };
      },
      async set(values: Record<string, unknown>): Promise<void> {
        Object.assign(storageState, values);
      },
      async remove(key: string): Promise<void> {
        delete storageState[key];
      },
    },
  },
};
(globalThis as typeof globalThis & { chrome: typeof chromeMock }).chrome =
  chromeMock;

const {
  clearSavedAnswers,
  getSavedAnswers,
  saveSavedAnswers,
  upsertSavedAnswer,
} = await import('../src/storage/saved-answers.ts');

await checkAsync('saved answers persist locally through validated storage', async () => {
  const saved = createSavedAnswer({
    questionId: 'q-persisted',
    questionText: 'Persisted answer',
    questionType: 'text',
    value: { kind: 'single', value: 'Local only' },
  });
  await saveSavedAnswers([saved]);
  assert.deepEqual(await getSavedAnswers(), [saved]);
});

await checkAsync('saved-answer upsert replaces by key and timestamps at boundary', async () => {
  const original = createSavedAnswer({
    questionId: 'q-upsert',
    questionText: 'Upsert answer',
    questionType: 'text',
    value: { kind: 'single', value: 'First' },
  });
  await clearSavedAnswers();
  await upsertSavedAnswer(original);
  const updated = await upsertSavedAnswer({
    ...original,
    value: { kind: 'single', value: 'Second' },
  });
  assert.ok(updated.updatedAt);
  assert.equal((await getSavedAnswers()).length, 1);
  assert.deepEqual((await getSavedAnswers())[0]?.value, {
    kind: 'single',
    value: 'Second',
  });
});

await checkAsync('invalid persisted records are rejected safely', async () => {
  const valid = createSavedAnswer({
    questionText: 'Validated answer',
    questionType: 'paragraph',
    value: { kind: 'single', value: 'Safe' },
  });
  storageState.savedAnswers = [{ ...valid, key: 'not-deterministic' }];
  assert.deepEqual(await getSavedAnswers(), []);
  await assert.rejects(() =>
    saveSavedAnswers([{ ...valid, key: 'not-deterministic' }]),
  );
  await assert.rejects(() =>
    saveSavedAnswers([
      {
        ...valid,
        normalizedQuestionText: 'Validated Answer',
      },
    ]),
  );
  await assert.rejects(() => saveSavedAnswers([valid, valid]));
});

await checkAsync('saved answers can be cleared without other storage access', async () => {
  await clearSavedAnswers();
  assert.deepEqual(await getSavedAnswers(), []);
});

if (failures > 0) {
  console.error(`\nP8 smoke failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log('\nP8 smoke passed.');
}
