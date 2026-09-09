/**
 * Ephemeral P3 classification smoke.
 *
 *   pnpm add -D linkedom tsx
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/p3-classification-smoke.ts
 *   pnpm remove linkedom tsx
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p3-classification.html');
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

const {
  discoverQuestionContainers,
  classifyQuestions,
  summarizeClassification,
} = await import('../src/content/google-forms/index.ts');

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

const root = byId('classify-list');
const discovered = discoverQuestionContainers(root);
const classified = classifyQuestions(discovered);
const byContainer = new Map(
  classified.map((item, index) => {
    const discovery = discovered[index];
    assert.ok(discovery);
    return [containerId(discovery.container), item] as const;
  }),
);

function expectKind(id: string, kind: string): void {
  const item = byContainer.get(id);
  assert.ok(item, `missing classification for ${id}`);
  assert.equal(item.kind, kind, `${id} expected ${kind}, got ${item.kind}`);
}

check('positive kinds', () => {
  expectKind('c-text', 'text');
  expectKind('c-para', 'paragraph');
  expectKind('c-mc', 'multiple_choice');
  expectKind('c-check', 'checkbox');
  expectKind('c-drop', 'dropdown');
  expectKind('c-select', 'dropdown');
  expectKind('c-date', 'date');
  expectKind('c-time', 'time');
  expectKind('c-scale', 'linear_scale');
  expectKind('c-header', 'non_question');
  expectKind('c-submit', 'non_question');
  expectKind('c-ambiguous', 'unknown');
  expectKind('c-file', 'unsupported');
  expectKind('c-grid', 'unsupported');
  expectKind('c-incomplete', 'text');
});

check('negative: title wording must not override control type', () => {
  expectKind('c-date-title-text', 'text');
  expectKind('c-time-title-text', 'text');
});

check('negative: arbitrary buttons are non_question', () => {
  expectKind('c-three-buttons', 'non_question');
});

check('negative: labeled radios are multiple_choice not scale', () => {
  expectKind('c-five-radios-labels', 'multiple_choice');
});

check('negative: weak combobox / mixed / non-consecutive numerics', () => {
  expectKind('c-weak-combo', 'unknown');
  expectKind('c-mixed', 'unknown');
  expectKind('c-numeric-gap', 'multiple_choice');
});

check('cross-type confusion guards', () => {
  assert.notEqual(byContainer.get('c-text')?.kind, 'paragraph');
  assert.notEqual(byContainer.get('c-text')?.kind, 'date');
  assert.notEqual(byContainer.get('c-text')?.kind, 'time');
  assert.notEqual(byContainer.get('c-mc')?.kind, 'linear_scale');
  assert.notEqual(byContainer.get('c-check')?.kind, 'multiple_choice');
  assert.notEqual(byContainer.get('c-drop')?.kind, 'unknown');
  assert.notEqual(byContainer.get('c-three-buttons')?.kind, 'dropdown');
  assert.notEqual(byContainer.get('c-header')?.kind, 'unknown');
  assert.notEqual(byContainer.get('c-file')?.kind, 'text');
  assert.equal(byContainer.get('c-text')?.kind, 'text');
  assert.equal(byContainer.get('c-para')?.kind, 'paragraph');
  assert.equal(byContainer.get('c-scale')?.kind, 'linear_scale');
  assert.equal(byContainer.get('c-numeric-gap')?.kind, 'multiple_choice');
});

check('determinism', () => {
  const again = classifyQuestions(discovered);
  assert.equal(JSON.stringify(again), JSON.stringify(classified));
});

check('privacy: no answer values in report JSON', () => {
  const report = summarizeClassification(
    classified,
    'https://docs.google.com/forms/d/e/smoke/viewform',
  );
  const json = JSON.stringify(report);
  assert.equal(/"value"\s*:/.test(json), false);
  assert.ok(!json.includes('HTMLElement'));
});

check('serializable classification report', () => {
  const report = summarizeClassification(
    classified,
    'https://docs.google.com/forms/d/e/smoke/viewform',
  );
  const parsed = JSON.parse(JSON.stringify(report)) as typeof report;
  assert.equal(parsed.totals.total, classified.length);
  assert.ok(parsed.totals.fillable >= 1);
});

console.log(`\nP3 smoke complete. failures=${failures}`);
process.exitCode = failures > 0 ? 1 : 0;
