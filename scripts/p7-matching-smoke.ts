/**
 * P7 deterministic profile-matching smoke/audit.
 *
 *   pnpm run p7-matching-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Form } from '../src/core/types/form.ts';
import type {
  MatchMethod,
  MatchStatus,
  ProfileField,
} from '../src/core/matching/index.ts';
import {
  MATCHABLE_PROFILE_FIELDS,
  matchFormQuestions,
  matchQuestion,
  normalizeQuestionText,
} from '../src/core/matching/index.ts';
import { UserProfileSchema } from '../src/core/validation/profile.ts';

interface FixtureCase {
  id: string;
  type: string;
  text: string;
  status: MatchStatus;
  field?: ProfileField;
  method?: MatchMethod;
  normalized?: string;
  candidateFields?: readonly ProfileField[];
}

interface MatchingFixture {
  cases: readonly FixtureCase[];
  form: Form;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p7-matching.json');
const fixture = JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as MatchingFixture;

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

check('normalizes Unicode, punctuation, case, and whitespace', () => {
  assert.equal(
    normalizeQuestionText('  Ｅ‐ＭＡＩＬ / Address:  '),
    'e mail address',
  );
});

check('supports exactly the existing non-metadata profile fields', () => {
  assert.deepEqual(
    [...MATCHABLE_PROFILE_FIELDS].sort(),
    Object.keys(UserProfileSchema.shape)
      .filter((field) => field !== 'updatedAt')
      .sort(),
  );
});

check('matches an exact canonical field label', () => {
  const result = matchQuestion({
    questionId: 'q-exact',
    questionType: 'text',
    text: 'Full Name',
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.profileField, 'fullName');
  assert.equal(result.method, 'exact_canonical');
  assert.equal(result.confidence, 1);
});

check('matches an explicit alias', () => {
  const result = matchQuestion({
    questionId: 'q-alias',
    questionType: 'text',
    text: 'E-mail Address',
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.profileField, 'email');
  assert.equal(result.method, 'explicit_alias');
});

check('uses conservative token phrases with separators', () => {
  const result = matchQuestion({
    questionId: 'q-phrase',
    questionType: 'text',
    text: 'Please enter your CURRENT CITY/STATE.',
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.profileField, 'location');
  assert.equal(result.method, 'phrase_token');
});

check('preserves equally strong ambiguity', () => {
  const result = matchQuestion({
    questionId: 'q-ambiguous',
    questionType: 'text',
    text: 'Provide your email address or phone number',
  });
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.ambiguity?.candidates, ['email', 'phone']);
  assert.equal(result.profileField, undefined);
});

check('does not match weak generic labels', () => {
  for (const text of ['Name', 'Email', 'Phone', 'Experience']) {
    const result = matchQuestion({
      questionId: `q-${text}`,
      questionType: 'text',
      text,
    });
    assert.equal(result.status, 'unmatched', text);
  }
});

for (const testCase of fixture.cases) {
  check(`fixture: ${testCase.id || 'invalid-empty-id'}`, () => {
    const result = matchQuestion({
      questionId: testCase.id,
      questionType: testCase.type,
      text: testCase.text,
    });
    assert.equal(result.status, testCase.status);
    if (testCase.field !== undefined) {
      assert.equal(result.profileField, testCase.field);
    }
    if (testCase.method !== undefined) {
      assert.equal(result.method, testCase.method);
    }
    if (testCase.normalized !== undefined) {
      assert.equal(result.normalizedQuestionText, testCase.normalized);
    }
    if (testCase.candidateFields !== undefined) {
      assert.deepEqual(
        result.candidates.map((candidate) => candidate.profileField),
        testCase.candidateFields,
      );
      assert.deepEqual(
        result.ambiguity?.candidates,
        testCase.candidateFields,
      );
      assert.equal(result.profileField, undefined);
    }
  });
}

check('duplicate question labels remain independent and ordered', () => {
  const report = matchFormQuestions(fixture.form);
  assert.deepEqual(
    report.results.map((result) => result.questionId),
    [
      'duplicate-label-a',
      'duplicate-label-b',
      'metadata-leak-check',
      'unknown-in-form',
    ],
  );
  assert.equal(report.results[0]?.profileField, 'fullName');
  assert.equal(report.results[1]?.profileField, 'fullName');
  assert.equal(report.results[2]?.profileField, 'email');
  assert.equal(report.results[3]?.status, 'unsupported');
  assert.deepEqual(report.totals, {
    total: 4,
    matched: 3,
    ambiguous: 0,
    unmatched: 0,
    unsupported: 1,
    invalid: 0,
  });
});

check('repeated execution and serialization are deterministic', () => {
  const baseline = JSON.stringify(
    fixture.cases.map((testCase) =>
      matchQuestion({
        questionId: testCase.id,
        questionType: testCase.type,
        text: testCase.text,
      }),
    ),
  );

  for (let run = 0; run < 25; run += 1) {
    const repeated = JSON.stringify(
      fixture.cases.map((testCase) =>
        matchQuestion({
          questionId: testCase.id,
          questionType: testCase.type,
          text: testCase.text,
        }),
      ),
    );
    assert.equal(repeated, baseline);
  }
});

check('reports do not copy answer values or arbitrary metadata', () => {
  const serialized = JSON.stringify(matchFormQuestions(fixture.form));
  assert.equal(serialized.includes('P7_SECRET_ANSWER_MUST_NOT_LEAK'), false);
  assert.equal(serialized.includes('answerValue'), false);
});

check('matching source has no DOM, Chrome, storage, network, AI, or fill access', () => {
  const matchingDir = join(__dirname, '..', 'src', 'core', 'matching');
  const source = ['index.ts', 'matcher.ts', 'normalize.ts', 'types.ts']
    .map((file) => readFileSync(join(matchingDir, file), 'utf8'))
    .join('\n');

  const forbidden: readonly [string, RegExp][] = [
    ['DOM globals', /\b(?:document|window)\s*\./u],
    ['Chrome APIs', /\bchrome\s*\./u],
    ['storage APIs/imports', /\b(?:localStorage|sessionStorage)\b|from\s+['"][^'"]*storage/iu],
    ['network APIs', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon\s*\(/u],
    ['AI providers', /from\s+['"][^'"]*(?:openai|anthropic|gemini)/iu],
    ['FillPlan/answer imports', /core\/types\/(?:fill|answer)/u],
    ['nondeterministic time/random', /\bMath\.random\s*\(|\bDate\.now\s*\(|new\s+Date\s*\(/u],
  ];

  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});

check('matches Form questions without constructing a FillPlan', () => {
  const form: Form = {
    id: 'form:p7-focused',
    title: 'P7 focused fixture',
    url: 'https://example.invalid/p7',
    extractedAt: '2026-09-12T00:00:00.000Z',
    sections: [
      {
        id: 'section:1',
        title: 'Profile',
        questions: [
          { id: 'q-name', type: 'text', text: 'Full Name' },
          { id: 'q-notes', type: 'paragraph', text: 'Anything else?' },
          { id: 'q-choice', type: 'unknown', text: 'Unknown control' },
        ],
      },
    ],
  };

  const report = matchFormQuestions(form);
  assert.deepEqual(report.totals, {
    total: 3,
    matched: 2,
    ambiguous: 0,
    unmatched: 0,
    unsupported: 1,
    invalid: 0,
  });
  assert.doesNotThrow(() => JSON.stringify(report));
});

if (failures > 0) {
  console.error(`\nP7 focused smoke failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log('\nP7 focused smoke passed.');
}
