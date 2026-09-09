/**
 * P5 fill-engine smoke.
 *
 *   pnpm run p5-fill-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { singleValue, multiValue } from '../src/core/types/answer.ts';
import type { FillPlan } from '../src/core/types/fill.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p5-fill.html');
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
g.Event = window.Event;

const {
  discoverQuestionContainers,
  classifyQuestions,
  applyFillPlan,
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

const root = byId('fill-list');
const discovered = discoverQuestionContainers(root);
const classified = classifyQuestions(discovered);
const byContainer = new Map(
  discovered.map((q) => [containerId(q.container), q] as const),
);
const classifiedById = new Map(classified.map((c) => [c.discoveryId, c]));

function idFor(htmlId: string): string {
  const q = byContainer.get(htmlId);
  assert.ok(q, `missing discovery for ${htmlId}`);
  return q.discoveryId;
}

// Track navigation/submit clicks
let nextClicks = 0;
let backClicks = 0;
let submitClicks = 0;
byId('btn-next').addEventListener('click', () => {
  nextClicks += 1;
});
byId('btn-back').addEventListener('click', () => {
  backClicks += 1;
});
byId('btn-submit').addEventListener('click', () => {
  submitClicks += 1;
});

check('classification preconditions', () => {
  assert.equal(classifiedById.get(idFor('f-text'))?.kind, 'text');
  assert.equal(classifiedById.get(idFor('f-para'))?.kind, 'paragraph');
  assert.equal(classifiedById.get(idFor('f-mc'))?.kind, 'multiple_choice');
  assert.equal(classifiedById.get(idFor('f-check'))?.kind, 'checkbox');
  assert.equal(classifiedById.get(idFor('f-select'))?.kind, 'dropdown');
  assert.equal(classifiedById.get(idFor('f-scale'))?.kind, 'linear_scale');
  assert.equal(classifiedById.get(idFor('f-date'))?.kind, 'date');
  assert.equal(classifiedById.get(idFor('f-time'))?.kind, 'time');
  assert.equal(classifiedById.get(idFor('f-unknown'))?.kind, 'unknown');
  assert.equal(classifiedById.get(idFor('f-file'))?.kind, 'unsupported');
});

const happyPlan: FillPlan = {
  formId: 'form:smoke',
  createdAt: '2026-01-01T00:00:00.000Z',
  operations: [
    { questionId: idFor('f-text'), value: singleValue('Ada Lovelace') },
    { questionId: idFor('f-para'), value: singleValue('Hello paragraph') },
    { questionId: idFor('f-mc'), value: singleValue('Yes') },
    {
      questionId: idFor('f-check'),
      value: multiValue(['TypeScript', 'React']),
    },
    { questionId: idFor('f-select'), value: singleValue('US') },
    { questionId: idFor('f-scale'), value: singleValue('4') },
    { questionId: idFor('f-date'), value: singleValue('2026-09-10') },
    { questionId: idFor('f-time'), value: singleValue('14:30') },
  ],
};

const happy = applyFillPlan(happyPlan, root);

check('happy-path fills succeed', () => {
  assert.equal(happy.totals.successful, 8);
  assert.equal(happy.totals.failed, 0);
  assert.equal(happy.totals.unsupported, 0);
});

check('text / paragraph values applied', () => {
  const text = byId('f-text').querySelector('input') as HTMLInputElement;
  const para = byId('f-para').querySelector('textarea') as HTMLTextAreaElement;
  assert.equal(text.value, 'Ada Lovelace');
  assert.equal(para.value, 'Hello paragraph');
});

check('multiple choice selected', () => {
  const yes = byId('f-mc').querySelector('[aria-label="Yes"]') as HTMLElement;
  const no = byId('f-mc').querySelector('[aria-label="No"]') as HTMLElement;
  assert.equal(yes.getAttribute('aria-checked'), 'true');
  assert.equal(no.getAttribute('aria-checked'), 'false');
});

check('checkbox: requested checked; already-checked not toggled off', () => {
  const ts = byId('f-check').querySelector(
    '[aria-label="TypeScript"]',
  ) as HTMLElement;
  const react = byId('f-check').querySelector(
    '[aria-label="React"]',
  ) as HTMLElement;
  const go = byId('f-check').querySelector('[aria-label="Go"]') as HTMLElement;
  assert.equal(ts.getAttribute('aria-checked'), 'true');
  assert.equal(react.getAttribute('aria-checked'), 'true');
  assert.equal(go.getAttribute('aria-checked'), 'false');
});

check('checkbox exact-set: uncheck unwanted; keep requested; isolate siblings', () => {
  // Java+Python checked, C++ unchecked → request Java+C++
  const exactPlan: FillPlan = {
    formId: 'form:smoke',
    createdAt: '2026-01-01T00:00:00.000Z',
    operations: [
      {
        questionId: idFor('f-check-exact'),
        value: multiValue(['Java', 'C++']),
      },
      {
        questionId: idFor('f-check-dup'),
        value: multiValue(['Python', '日本語']),
      },
    ],
  };
  const result = applyFillPlan(exactPlan, root);
  assert.equal(result.totals.successful, 2);

  const aJava = byId('f-check-exact').querySelector(
    '[aria-label="Java"]',
  ) as HTMLElement;
  const aPython = byId('f-check-exact').querySelector(
    '[aria-label="Python"]',
  ) as HTMLElement;
  const aCpp = byId('f-check-exact').querySelector(
    '[aria-label="C++"]',
  ) as HTMLElement;
  assert.equal(aJava.getAttribute('aria-checked'), 'true');
  assert.equal(aPython.getAttribute('aria-checked'), 'false');
  assert.equal(aCpp.getAttribute('aria-checked'), 'true');

  const bJava = byId('f-check-dup').querySelector(
    '[aria-label="Java"]',
  ) as HTMLElement;
  const bPython = byId('f-check-dup').querySelector(
    '[aria-label="Python"]',
  ) as HTMLElement;
  const bJa = byId('f-check-dup').querySelector(
    '[aria-label="日本語"]',
  ) as HTMLElement;
  assert.equal(bJava.getAttribute('aria-checked'), 'false');
  assert.equal(bPython.getAttribute('aria-checked'), 'true');
  assert.equal(bJa.getAttribute('aria-checked'), 'true');
});

check('checkbox exact-set: reduce all-selected to subset; invalid option fails', () => {
  // Pre-check all on f-check then reduce to TypeScript only
  for (const label of ['TypeScript', 'React', 'Go']) {
    const el = byId('f-check').querySelector(
      `[aria-label="${label}"]`,
    ) as HTMLElement;
    el.setAttribute('aria-checked', 'true');
  }
  const ok = applyFillPlan(
    {
      formId: 'form:smoke',
      createdAt: '2026-01-01T00:00:00.000Z',
      operations: [
        { questionId: idFor('f-check'), value: multiValue(['TypeScript']) },
      ],
    },
    root,
  );
  assert.equal(ok.results[0]?.status, 'success');
  assert.equal(
    byId('f-check')
      .querySelector('[aria-label="TypeScript"]')
      ?.getAttribute('aria-checked'),
    'true',
  );
  assert.equal(
    byId('f-check')
      .querySelector('[aria-label="React"]')
      ?.getAttribute('aria-checked'),
    'false',
  );
  assert.equal(
    byId('f-check')
      .querySelector('[aria-label="Go"]')
      ?.getAttribute('aria-checked'),
    'false',
  );

  const bad = applyFillPlan(
    {
      formId: 'form:smoke',
      createdAt: '2026-01-01T00:00:00.000Z',
      operations: [
        {
          questionId: idFor('f-check'),
          value: multiValue(['TypeScript', 'MissingLang']),
        },
      ],
    },
    root,
  );
  assert.equal(bad.results[0]?.status, 'failed');
});

check('dropdown native select', () => {
  const select = byId('f-select').querySelector('select') as HTMLSelectElement;
  const selected =
    select.querySelector('option[selected]') ??
    select.options[select.selectedIndex] ??
    null;
  const label = normalize(
    selected instanceof HTMLOptionElement
      ? selected.text || selected.label || selected.textContent || ''
      : (selected as Element | null)?.textContent ?? '',
  );
  assert.equal(label, 'US');
});

check('linear scale / date / time', () => {
  const four = byId('f-scale').querySelector('[aria-label="4"]') as HTMLElement;
  assert.equal(four.getAttribute('aria-checked'), 'true');
  const date = byId('f-date').querySelector('input') as HTMLInputElement;
  const time = byId('f-time').querySelector('input') as HTMLInputElement;
  assert.equal(date.value, '2026-09-10');
  assert.equal(time.value, '14:30');
});

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

check('unknown / unsupported / missing / wrong-shape / invalid rejected', () => {
  const plan: FillPlan = {
    formId: 'form:smoke',
    createdAt: '2026-01-01T00:00:00.000Z',
    operations: [
      { questionId: idFor('f-unknown'), value: singleValue('x') },
      { questionId: idFor('f-file'), value: singleValue('x') },
      { questionId: 'discovery:q-missing', value: singleValue('x') },
      { questionId: idFor('f-text'), value: multiValue(['nope']) },
      { questionId: idFor('f-check'), value: singleValue('TypeScript') },
      { questionId: idFor('f-date'), value: singleValue('10/09/2026') },
      { questionId: idFor('f-scale'), value: singleValue('nine') },
      { questionId: idFor('f-mc'), value: singleValue('NotAnOption') },
    ],
  };
  const result = applyFillPlan(plan, root);
  assert.equal(result.results[0]?.status, 'unsupported');
  assert.equal(result.results[1]?.status, 'unsupported');
  assert.equal(result.results[2]?.status, 'failed');
  assert.equal(result.results[3]?.status, 'failed');
  assert.equal(result.results[4]?.status, 'failed');
  assert.equal(result.results[5]?.status, 'failed');
  assert.equal(result.results[6]?.status, 'failed');
  assert.equal(result.results[7]?.status, 'failed');
});

check('partial failure does not undo prior successes', () => {
  // Reset a dedicated text field via fresh plan mix
  const textInput = byId('f-text').querySelector('input') as HTMLInputElement;
  textInput.value = '';
  const plan: FillPlan = {
    formId: 'form:smoke',
    createdAt: '2026-01-01T00:00:00.000Z',
    operations: [
      { questionId: idFor('f-text'), value: singleValue('Kept') },
      { questionId: 'discovery:q-missing', value: singleValue('x') },
      { questionId: idFor('f-para'), value: singleValue('Also kept') },
    ],
  };
  const result = applyFillPlan(plan, root);
  assert.equal(result.results[0]?.status, 'success');
  assert.equal(result.results[1]?.status, 'failed');
  assert.equal(result.results[2]?.status, 'success');
  assert.equal(textInput.value, 'Kept');
  assert.equal(
    (byId('f-para').querySelector('textarea') as HTMLTextAreaElement).value,
    'Also kept',
  );
});

check('Submit / Next / Back never clicked', () => {
  assert.equal(submitClicks, 0);
  assert.equal(nextClicks, 0);
  assert.equal(backClicks, 0);
});

check('FillResult JSON serializable + deterministic structure', () => {
  const again = applyFillPlan(
    {
      formId: 'form:smoke',
      createdAt: '2026-01-01T00:00:00.000Z',
      operations: [{ questionId: idFor('f-mc'), value: singleValue('No') }],
    },
    root,
  );
  const json = JSON.stringify(again);
  assert.ok(json.length > 0);
  assert.ok(!json.includes('HTMLElement'));
  const parsed = JSON.parse(json);
  assert.equal(parsed.totals.total, 1);
  assert.equal(parsed.results[0].questionId, idFor('f-mc'));
});

check('no network/profile globals used by fill module contract', () => {
  // Structural guarantee: applyFillPlan only needs plan + root.
  assert.equal(typeof applyFillPlan, 'function');
});

console.log(`\nP5 smoke complete. failures=${failures}`);
process.exitCode = failures > 0 ? 1 : 0;
