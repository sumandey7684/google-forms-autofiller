/**
 * P11 end-to-end autofill workflow smoke/audit.
 *
 *   pnpm run p11-autofill-workflow-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import type { Form } from '../src/core/types/form.ts';
import {
  createSavedAnswer,
  type CreateSavedAnswerInput,
  type ProfileValues,
} from '../src/core/resolution/index.ts';
import { MockAiAnswerProvider } from '../src/core/ai/index.ts';
import {
  prepareAutofillReview,
  applyReviewSelection,
  collectApprovedAnswers,
  buildFillPlanFromApproved,
} from '../src/core/engine/index.ts';

interface P11Fixture {
  profile: ProfileValues;
  form: Form;
  savedAnswerInputs: readonly CreateSavedAnswerInput[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  '..',
  'fixtures',
  'p11-autofill-workflow.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as P11Fixture;
const savedAnswers = fixture.savedAnswerInputs.map((input) =>
  createSavedAnswer(input),
);

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

function byId<T extends { questionId: string }>(
  items: readonly T[],
  id: string,
): T {
  const item = items.find((entry) => entry.questionId === id);
  assert.ok(item, id);
  return item;
}

await checkAsync('profile resolution reaches valid review row', async () => {
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers: [],
    provider: new MockAiAnswerProvider(),
  });
  const email = byId(prepare.items, 'q-profile-email');
  assert.equal(email.status, 'valid');
  assert.equal(email.source, 'profile');
  assert.equal(email.fillable, true);
  assert.deepEqual(email.value, {
    kind: 'single',
    value: 'profile@example.com',
  });
});

await checkAsync('saved-answer precedence beats profile and AI', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-saved-exact': {
        status: 'proposed',
        value: { kind: 'single', value: 'AI must not win' },
      },
    },
  });
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers,
    provider,
  });
  const name = byId(prepare.items, 'q-saved-exact');
  assert.equal(name.status, 'valid');
  assert.equal(name.source, 'saved_answer');
  assert.deepEqual(name.value, {
    kind: 'single',
    value: 'Saved Exact User',
  });
  assert.equal(
    provider
      .getSeenContexts()
      .some((context) => context.questionId === 'q-saved-exact'),
    false,
  );
});

await checkAsync('AI fallback fills still-missing questions', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ai-why': {
        status: 'proposed',
        value: { kind: 'single', value: 'I want to contribute.' },
      },
      'q-role': {
        status: 'proposed',
        value: { kind: 'single', value: 'Engineer' },
      },
    },
  });
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers,
    provider,
  });
  const why = byId(prepare.items, 'q-ai-why');
  assert.equal(why.status, 'valid');
  assert.equal(why.source, 'ai');
  assert.deepEqual(why.value, {
    kind: 'single',
    value: 'I want to contribute.',
  });
  const role = byId(prepare.items, 'q-role');
  assert.equal(role.status, 'valid');
  assert.equal(role.source, 'ai');
});

await checkAsync('validation rejects invalid edits and FillPlan candidates', async () => {
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers,
    provider: new MockAiAnswerProvider({
      responses: {
        'q-ai-why': {
          status: 'proposed',
          value: { kind: 'single', value: 'Keep me editable' },
        },
      },
    }),
  });

  const badEdit = applyReviewSelection(
    prepare.items,
    {
      'q-ai-why': {
        editedValue: { kind: 'single', value: '   ' },
        approved: true,
      },
    },
    fixture.form,
  );
  const why = byId(badEdit, 'q-ai-why');
  assert.equal(why.status, 'invalid');
  assert.equal(why.fillable, false);
  assert.equal(why.approved, false);

  const rejectedPlan = buildFillPlanFromApproved({
    form: fixture.form,
    approved: [
      {
        questionId: 'q-invalid-saved',
        value: { kind: 'single', value: '99' },
      },
    ],
  });
  assert.equal(rejectedPlan.status, 'rejected');
  assert.equal(rejectedPlan.rejected[0]?.questionId, 'q-invalid-saved');
  assert.equal(rejectedPlan.plan, undefined);
});

await checkAsync('review selection approves and edits only valid answers', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ai-why': {
        status: 'proposed',
        value: { kind: 'single', value: 'Original AI answer' },
      },
    },
  });
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers,
    provider,
  });

  const deselected = applyReviewSelection(
    prepare.items,
    { 'q-profile-email': { approved: false } },
    fixture.form,
  );
  assert.equal(byId(deselected, 'q-profile-email').approved, false);

  const edited = applyReviewSelection(
    deselected,
    {
      'q-ai-why': {
        editedValue: { kind: 'single', value: 'Edited review answer' },
        approved: true,
      },
    },
    fixture.form,
  );
  const why = byId(edited, 'q-ai-why');
  assert.equal(why.status, 'valid');
  assert.equal(why.source, 'manual');
  assert.deepEqual(why.value, {
    kind: 'single',
    value: 'Edited review answer',
  });
  assert.equal(why.approved, true);

  const badEdit = applyReviewSelection(
    edited,
    {
      'q-invalid-saved': {
        editedValue: { kind: 'single', value: 'not-a-scale' },
        approved: true,
      },
    },
    fixture.form,
  );
  const stillBad = byId(badEdit, 'q-invalid-saved');
  assert.equal(stillBad.fillable, false);
  assert.equal(stillBad.approved, false);
});

await checkAsync('FillPlan creation uses only approved fillable answers', async () => {
  const provider = new MockAiAnswerProvider({
    responses: {
      'q-ai-why': {
        status: 'proposed',
        value: { kind: 'single', value: 'Contribute daily.' },
      },
    },
  });
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers,
    provider,
  });
  const reviewed = applyReviewSelection(
    prepare.items,
    {
      'q-profile-email': { approved: false },
      'q-ai-why': { approved: true },
      'q-saved-exact': { approved: true },
    },
    fixture.form,
  );
  const approved = collectApprovedAnswers(reviewed);
  assert.equal(
    approved.some((item) => item.questionId === 'q-profile-email'),
    false,
  );
  const built = buildFillPlanFromApproved({
    form: fixture.form,
    approved,
    createdAt: '2026-09-13T12:00:00.000Z',
  });
  assert.equal(built.status, 'ok');
  assert.ok(built.plan);
  assert.equal(built.plan.formId, 'form:p11-workflow');
  assert.equal(built.plan.createdAt, '2026-09-13T12:00:00.000Z');
  const ids = built.plan.operations.map((op) => op.questionId).sort();
  assert.deepEqual(ids, ['q-ai-why', 'q-saved-exact']);
});

await checkAsync('unsupported and unresolved stay non-fillable', async () => {
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: fixture.profile,
    savedAnswers,
    provider: new MockAiAnswerProvider({
      defaultResponse: { status: 'unsupported', message: 'no answer' },
    }),
  });
  const unsupported = byId(prepare.items, 'q-unsupported');
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.fillable, false);

  const unresolved = byId(prepare.items, 'q-unresolved');
  assert.ok(
    unresolved.status === 'missing' || unresolved.status === 'unsupported',
  );
  assert.equal(unresolved.fillable, false);

  const ambiguous = byId(prepare.items, 'q-ambiguous');
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.fillable, false);
});

await checkAsync('empty approved set yields empty FillPlan result', async () => {
  const prepare = await prepareAutofillReview({
    form: fixture.form,
    profile: null,
    savedAnswers: [],
    provider: new MockAiAnswerProvider(),
  });
  assert.equal(prepare.profileEmpty, true);
  const noneApproved = applyReviewSelection(
    prepare.items,
    Object.fromEntries(
      prepare.items.map((item) => [item.questionId, { approved: false }]),
    ),
    fixture.form,
  );
  const built = buildFillPlanFromApproved({
    form: fixture.form,
    approved: collectApprovedAnswers(noneApproved),
  });
  assert.equal(built.status, 'empty');
  assert.equal(built.plan, undefined);
});

await checkAsync(
  'successful partial fill never clicks Submit',
  async () => {
    const html = readFileSync(
      join(__dirname, '..', 'fixtures', 'p5-fill.html'),
      'utf8',
    );
    const { window, document } = parseHTML(html);
    Object.defineProperty(document, 'location', {
      value: { href: 'https://docs.google.com/forms/d/e/smoke/viewform' },
      configurable: true,
    });
    const g = globalThis as typeof globalThis & Record<string, unknown>;
    g.window = window;
    g.document = document;
    g.Element = window.Element;
    g.Document = window.Document;
    g.Node = window.Node;
    g.HTMLElement = window.HTMLElement;
    g.HTMLInputElement = window.HTMLInputElement;
    g.HTMLTextAreaElement = window.HTMLTextAreaElement;
    g.HTMLSelectElement = window.HTMLSelectElement;
    g.HTMLButtonElement = window.HTMLButtonElement;
    g.HTMLOptionElement = window.HTMLOptionElement;
    g.Event = window.Event;

    const {
      discoverQuestionContainers,
      classifyQuestions,
      extractForm,
      applyFillPlan,
    } = await import('../src/content/google-forms/index.ts');

    const root = document.getElementById('fill-list');
    assert.ok(root);
    const discovered = discoverQuestionContainers(root);
    const classified = classifyQuestions(discovered);
    const extraction = extractForm(discovered, classified, {
      formId: 'form:p11-dom',
      formTitle: 'P11 DOM',
      url: 'https://docs.google.com/forms/d/e/smoke/viewform',
      extractedAt: '2026-09-13T12:00:00.000Z',
    });
    const form = extraction.form;

    let submitClicks = 0;
    let nextClicks = 0;
    document.getElementById('btn-submit')!.addEventListener('click', () => {
      submitClicks += 1;
    });
    document.getElementById('btn-next')!.addEventListener('click', () => {
      nextClicks += 1;
    });

    const prepare = await prepareAutofillReview({
      form,
      profile: {
        fullName: 'Ada Lovelace',
      },
      savedAnswers: [
        createSavedAnswer({
          questionText: 'About you',
          questionType: 'paragraph',
          value: { kind: 'single', value: 'Inventor notes' },
        }),
      ],
      provider: new MockAiAnswerProvider({
        defaultResponse: {
          status: 'unsupported',
          message: 'unused in partial text fill',
        },
      }),
    });

    // Approve only fillable text/paragraph answers for a partial plan.
    const fillableText = prepare.items.filter(
      (item) =>
        item.fillable &&
        (item.questionType === 'text' || item.questionType === 'paragraph'),
    );
    assert.ok(fillableText.length >= 1);

    const selection = Object.fromEntries(
      prepare.items.map((item) => [
        item.questionId,
        {
          approved:
            item.fillable &&
            (item.questionType === 'text' || item.questionType === 'paragraph'),
        },
      ]),
    );
    const reviewed = applyReviewSelection(prepare.items, selection, form);
    const built = buildFillPlanFromApproved({
      form,
      approved: collectApprovedAnswers(reviewed),
      createdAt: '2026-09-13T12:00:00.000Z',
    });
    assert.equal(built.status, 'ok');
    assert.ok(built.plan);
    assert.ok(built.plan.operations.length >= 1);
    assert.ok(
      built.plan.operations.length <= prepare.items.filter((i) => i.fillable)
        .length,
    );

    const fill = applyFillPlan(built.plan, root);
    assert.ok(fill.totals.successful >= 1);
    assert.equal(submitClicks, 0);
    assert.equal(nextClicks, 0);

    const textInput = document
      .getElementById('f-text')!
      .querySelector('input') as HTMLInputElement;
    assert.equal(textInput.value, 'Ada Lovelace');
  },
);

if (failures > 0) {
  console.error(`\n${failures} P11 smoke check(s) failed.`);
  process.exit(1);
}

console.log('\nAll P11 autofill workflow smoke checks passed.');
