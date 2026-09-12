/**
 * Ephemeral P4 extraction smoke.
 *
 *   pnpm add -D linkedom tsx
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/p4-extraction-smoke.ts
 *   pnpm remove linkedom tsx
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p4-extraction.html');
const html = readFileSync(fixturePath, 'utf8');
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

const {
  discoverQuestionContainers,
  classifyQuestions,
  createGoogleFormsAdapter,
  extractForm,
  getFormQuestions,
} = await import('../src/content/google-forms/index.ts').then(async (mod) => {
  const formMod = await import('../src/core/types/form.ts');
  return { ...mod, getFormQuestions: formMod.getFormQuestions };
});

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  assert.ok(el, `missing #${id}`);
  return el as unknown as HTMLElement;
}

function containerId(container: HTMLElement): string {
  return (container as unknown as { id?: string }).id ?? '';
}

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

const FIXED_AT = '2026-01-01T00:00:00.000Z';
const root = byId('classify-list');
const marker = document.createComment('p4-mutation-marker');
root.appendChild(marker);

const discovered = discoverQuestionContainers(root);
const classified = classifyQuestions(discovered);
const { form, report } = extractForm(discovered, classified, {
  url: 'https://docs.google.com/forms/d/e/smoke/viewform',
  extractedAt: FIXED_AT,
  formTitle: 'P4 Smoke Form',
  formId: 'form:smoke',
});

const byDiscovery = new Map(
  discovered.map((q) => [containerId(q.container), q] as const),
);
const classifiedByDiscovery = new Map(
  classified.map((c) => [c.discoveryId, c] as const),
);
const questions = getFormQuestions(form);
const questionByDiscoveryId = new Map(questions.map((q) => [q.id, q] as const));

function expectExtractedType(containerHtmlId: string, type: string): void {
  const disc = byDiscovery.get(containerHtmlId);
  assert.ok(disc, `missing discovery ${containerHtmlId}`);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q, `${containerHtmlId} should be extracted`);
  assert.equal(q.type, type, `${containerHtmlId} type`);
}

function expectOmitted(containerHtmlId: string): void {
  const disc = byDiscovery.get(containerHtmlId);
  assert.ok(disc, `missing discovery ${containerHtmlId}`);
  assert.equal(
    questionByDiscoveryId.has(disc.discoveryId),
    false,
    `${containerHtmlId} must not appear in Form.questions`,
  );
}

check('positive extracted kinds', () => {
  expectExtractedType('c-text', 'text');
  expectExtractedType('c-para', 'paragraph');
  expectExtractedType('c-mc', 'multiple_choice');
  expectExtractedType('c-check', 'checkbox');
  expectExtractedType('c-drop', 'dropdown');
  expectExtractedType('c-select', 'dropdown');
  expectExtractedType('c-date', 'date');
  expectExtractedType('c-time', 'time');
  expectExtractedType('c-scale', 'linear_scale');
  expectExtractedType('c-ambiguous', 'unknown');
  expectExtractedType('c-incomplete', 'text');
  expectExtractedType('c-weak-combo', 'unknown');
  expectExtractedType('c-mixed', 'unknown');
  expectExtractedType('c-numeric-gap', 'multiple_choice');
  expectExtractedType('c-date-title-text', 'text');
  expectExtractedType('c-time-title-text', 'text');
  expectExtractedType('c-five-radios-labels', 'multiple_choice');
  expectExtractedType('c-req-true', 'text');
  expectExtractedType('c-req-false', 'text');
  expectExtractedType('c-opt-order', 'multiple_choice');
  expectExtractedType('c-opt-dup', 'checkbox');
});

check('non_question / unsupported omitted', () => {
  expectOmitted('c-header');
  expectOmitted('c-submit');
  expectOmitted('c-three-buttons');
  expectOmitted('c-file');
  expectOmitted('c-grid');
  assert.ok(report.totals.omittedNonQuestion >= 3);
  assert.ok(report.totals.omittedUnsupported >= 2);
});

check('title Date/Time does not change type', () => {
  expectExtractedType('c-date-title-text', 'text');
  expectExtractedType('c-time-title-text', 'text');
});

check('question order preserved', () => {
  const extractedDiscoveryIds = questions.map((q) => q.id);
  const expectedOrder = discovered
    .filter((d) => {
      const kind = classifiedByDiscovery.get(d.discoveryId)?.kind;
      return kind !== 'non_question' && kind !== 'unsupported' && kind !== undefined;
    })
    .map((d) => d.discoveryId);
  assert.deepEqual(extractedDiscoveryIds, expectedOrder);
});

check('option order preserved for MC', () => {
  const disc = byDiscovery.get('c-mc');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q && q.type === 'multiple_choice');
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['Yes', 'No'],
  );
});

check('linear scale min/max from labels', () => {
  const disc = byDiscovery.get('c-scale');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q && q.type === 'linear_scale');
  assert.equal(q.min, 1);
  assert.equal(q.max, 5);
});

check('native select options', () => {
  const disc = byDiscovery.get('c-select');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q && q.type === 'dropdown');
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['IN', 'US'],
  );
});

check('providerId in metadata, not as random id', () => {
  const disc = byDiscovery.get('c-text');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q);
  assert.equal(q.id, disc.discoveryId);
  assert.equal(q.metadata?.providerId, 'entry.100');
});

check('required true / false / unknown preserved', () => {
  const reqTrue = byDiscovery.get('c-req-true');
  const reqFalse = byDiscovery.get('c-req-false');
  const incomplete = byDiscovery.get('c-incomplete');
  assert.ok(reqTrue && reqFalse && incomplete);
  assert.equal(reqTrue.required, true);
  assert.equal(reqFalse.required, false);
  assert.equal(incomplete.required, undefined);

  const qTrue = questionByDiscoveryId.get(reqTrue.discoveryId);
  const qFalse = questionByDiscoveryId.get(reqFalse.discoveryId);
  const qUnknown = questionByDiscoveryId.get(incomplete.discoveryId);
  assert.ok(qTrue && qFalse && qUnknown);
  assert.equal(qTrue.required, true);
  assert.equal(qFalse.required, false);
  assert.equal(qUnknown.required, undefined);
  assert.equal('required' in qUnknown, false);
});

check('option order C/A/B preserved (no alpha sort)', () => {
  const disc = byDiscovery.get('c-opt-order');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q && q.type === 'multiple_choice');
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['Option C', 'Option A', 'Option B'],
  );
});

check('duplicate / unicode / whitespace option labels', () => {
  const disc = byDiscovery.get('c-opt-dup');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q && q.type === 'checkbox');
  assert.deepEqual(
    q.options.map((o) => o.label),
    ['Same', 'Same', '日本語', 'A & B'],
  );
});

check('question order not sorted by title/providerId', () => {
  const ids = ['c-req-true', 'c-req-false', 'c-opt-order'];
  const extractedTitles = ids.map((id) => {
    const disc = byDiscovery.get(id);
    assert.ok(disc);
    return questionByDiscoveryId.get(disc.discoveryId)?.text;
  });
  assert.deepEqual(extractedTitles, [
    'Zulu required field',
    'Yankee optional field',
    'Zebra choice',
  ]);
});

check('missing providerId / title do not crash', () => {
  const disc = byDiscovery.get('c-incomplete');
  assert.ok(disc);
  const q = questionByDiscoveryId.get(disc.discoveryId);
  assert.ok(q);
  assert.equal(q.text, '');
  assert.equal(q.metadata?.providerId, undefined);
});

check('unknown remains unknown', () => {
  expectExtractedType('c-ambiguous', 'unknown');
  assert.ok(report.totals.unknownQuestions >= 1);
});

check('unsupported omitted but retained in report with reason', () => {
  expectOmitted('c-file');
  expectOmitted('c-grid');
  const fileDisc = byDiscovery.get('c-file');
  assert.ok(fileDisc);
  const diag = report.questions.find((q) => q.discoveryId === fileDisc.discoveryId);
  assert.ok(diag);
  assert.equal(diag.extracted, false);
  assert.equal(diag.classificationKind, 'unsupported');
  assert.ok(diag.classificationReason && diag.classificationReason.length > 0);
  assert.ok(diag.classificationSignals.length > 0);
});

check('Form / report JSON serializable + no DOM / answers', () => {
  const formJson = JSON.stringify(form);
  const reportJson = JSON.stringify(report);
  assert.ok(formJson.length > 0);
  assert.ok(reportJson.length > 0);
  assert.equal(/"value"\s*:/.test(formJson), false);
  assert.ok(!formJson.includes('HTMLElement'));
  assert.ok(!reportJson.includes('HTMLElement'));
  const parsed = JSON.parse(formJson);
  assert.equal(parsed.extractedAt, FIXED_AT);
  assert.equal(parsed.sections.length, 1);
  assert.equal(report.scope, 'current_visible_dom');
});

check('determinism (same inputs including extractedAt)', () => {
  const again = extractForm(discovered, classified, {
    url: 'https://docs.google.com/forms/d/e/smoke/viewform',
    extractedAt: FIXED_AT,
    formTitle: 'P4 Smoke Form',
    formId: 'form:smoke',
  });
  assert.equal(JSON.stringify(again.form), JSON.stringify(form));
  assert.equal(JSON.stringify(again.report), JSON.stringify(report));
});

check('semantic content identical when only extractedAt differs', () => {
  const other = extractForm(discovered, classified, {
    url: 'https://docs.google.com/forms/d/e/smoke/viewform',
    extractedAt: '2099-12-31T23:59:59.000Z',
    formTitle: 'P4 Smoke Form',
    formId: 'form:smoke',
  });
  const a = JSON.parse(JSON.stringify(form)) as typeof form;
  const b = JSON.parse(JSON.stringify(other.form)) as typeof form;
  delete (a as { extractedAt?: string }).extractedAt;
  delete (b as { extractedAt?: string }).extractedAt;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

check('one-pass adapter extraction includes available page title', () => {
  const currentPageResult = createGoogleFormsAdapter().extractCurrentFromDiscovered(
    discovered,
    classified,
    document,
  );
  assert.equal(currentPageResult.form.title, 'P4 Extraction Fixture');
  assert.equal(
    currentPageResult.report.warnings.some(
      (warning) => warning.code === 'form_title_missing',
    ),
    false,
  );
});

check('no DOM mutation of fixture structure', () => {
  const before = root.innerHTML;
  extractForm(discovered, classified, {
    url: 'https://docs.google.com/forms/d/e/smoke/viewform',
    extractedAt: FIXED_AT,
    formTitle: 'P4 Smoke Form',
    formId: 'form:smoke',
  });
  assert.equal(root.innerHTML, before);
  assert.ok(root.contains(marker));
});

check('single current-visible section (not full form claim)', () => {
  assert.equal(form.sections.length, 1);
  assert.equal(form.sections[0]?.id, 'section:current');
  assert.equal(form.sections[0]?.title, 'Currently visible page');
  assert.equal(report.totals.sectionCount, 1);
  assert.equal(report.scope, 'current_visible_dom');
  assert.equal(report.totals.extractedQuestions, questions.length);
});

console.log(`\nP4 smoke complete. failures=${failures}`);
process.exitCode = failures > 0 ? 1 : 0;
