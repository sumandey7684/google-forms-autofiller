/**
 * Framework-free P2 discovery smoke (temporary audit harness).
 *
 * Run (ephemeral deps — do not leave installed):
 *   pnpm add -D linkedom tsx
 *   pnpm exec tsx --tsconfig tsconfig.app.json scripts/p2-discovery-smoke.ts
 *   pnpm remove linkedom tsx
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p2-discovery-audit.html');
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
  matchProviderId,
  resolveRequiredState,
  buildDiscoveryReport,
  summarizeDiscoveredQuestions,
} = await import('../src/content/google-forms/index.ts');

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  assert.ok(el, `missing #${id}`);
  return el as unknown as HTMLElement;
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

check('providerId exact match', () => {
  assert.equal(matchProviderId('entry.123456789'), 'entry.123456789');
  assert.equal(matchProviderId('entry.name'), undefined);
  assert.equal(matchProviderId('entry.123abc'), undefined);
  assert.equal(matchProviderId('something-else'), undefined);
  assert.equal(matchProviderId(null), undefined);
  assert.equal(matchProviderId(''), undefined);
});

check('required conflict → undefined', () => {
  assert.equal(resolveRequiredState(true, false), true);
  assert.equal(resolveRequiredState(false, true), false);
  assert.equal(resolveRequiredState(false, false), undefined);
  assert.equal(resolveRequiredState(true, true), undefined);
});

const listRoot = byId('primary-list');
const first = discoverQuestionContainers(listRoot);
const second = discoverQuestionContainers(listRoot);

check('deterministic rerun', () => {
  assert.equal(first.length, second.length);
  for (let i = 0; i < first.length; i += 1) {
    assert.equal(first[i]?.discoveryId, second[i]?.discoveryId);
    assert.equal(first[i]?.controls.length, second[i]?.controls.length);
  }
});

check('unique discoveryIds + containers', () => {
  const ids = new Set(first.map((q) => q.discoveryId));
  const containers = new Set(first.map((q) => q.container));
  assert.equal(ids.size, first.length);
  assert.equal(containers.size, first.length);
});

const byHeading = (title: string) =>
  first.find((q) => q.titleElement?.textContent?.includes(title));

check('A: text + providerId', () => {
  const q = byHeading('Full Name');
  assert.ok(q);
  assert.equal(q.providerId, 'entry.123456789');
  assert.equal(q.controls.length, 1);
  assert.equal(q.controls[0]?.kind, 'native_input');
  assert.equal(
    Object.prototype.hasOwnProperty.call(q.controls[0], 'value'),
    false,
  );
});

check('B: paragraph textarea', () => {
  const q = byHeading('Tell us about yourself');
  assert.ok(q);
  assert.equal(q.controls.length, 1);
  assert.equal(q.controls[0]?.kind, 'native_textarea');
});

check('C: radios discovered without classification', () => {
  const q = byHeading('Are you available?');
  assert.ok(q);
  assert.ok(q.controls.length >= 2);
  assert.ok(q.controls.some((c) => c.kind === 'aria_radio'));
});

check('D: checkboxes', () => {
  const q = byHeading('Skills');
  assert.ok(q);
  assert.equal(q.controls.filter((c) => c.kind === 'aria_checkbox').length, 2);
});

check('E: dropdown-like', () => {
  const q = byHeading('Preferred timezone');
  assert.ok(q);
  assert.ok(
    q.controls.some((c) => c.kind === 'aria_combobox' || c.kind === 'aria_listbox'),
  );
});

check('F/G/H required states', () => {
  assert.equal(byHeading('Required email')?.required, true);
  assert.equal(byHeading('Optional nickname')?.required, false);
  assert.equal(byHeading('Maybe required')?.required, undefined);
});

check('I: missing providerId keeps discoveryId', () => {
  const q = byHeading('No provider id');
  assert.ok(q);
  assert.equal(q.providerId, undefined);
  assert.match(q.discoveryId, /^discovery:q-\d+$/);
});

check('K: chrome-only still a candidate', () => {
  const q = byHeading('Submit section');
  assert.ok(q);
  assert.equal(q.diagnostics.hasInteractiveControls, false);
  assert.ok(q.diagnostics.notes.includes('Only button/chrome controls'));
});

check('L: no controls', () => {
  const q = byHeading('Section intro with no controls');
  assert.ok(q);
  assert.equal(q.controls.length, 0);
  assert.equal(q.diagnostics.hasInteractiveControls, false);
});

check('M: missing title', () => {
  const q = first.find((item) => qHasId(item.container, 'q-no-title'));
  assert.ok(q);
  assert.equal(q.titleElement, undefined);
  assert.equal(q.providerId, 'entry.999');
});

function qHasId(container: HTMLElement, id: string): boolean {
  return (container as unknown as { id?: string }).id === id;
}

check('N: nested controls de-duplicated', () => {
  const q = byHeading('Nested control');
  assert.ok(q);
  const elements = q.controls.map((c) => c.element);
  assert.equal(new Set(elements).size, elements.length);
  assert.ok(q.controls.some((c) => c.kind === 'aria_textbox'));
  assert.equal(q.controls.filter((c) => c.kind === 'native_input').length, 0);
});

check('malformed empty / list-only do not throw', () => {
  assert.deepEqual(discoverQuestionContainers(byId('malformed-empty')), []);
  assert.deepEqual(discoverQuestionContainers(byId('malformed-list-only')), []);
});

check('data-params fallback is non-nested only', () => {
  const found = discoverQuestionContainers(byId('fallback-root'));
  assert.equal(found.length, 1);
  assert.equal(qHasId(found[0]!.container, 'dp-outer'), true);
  assert.equal(found[0]?.diagnostics.signal, 'data-params-fallback');
});

const report = summarizeDiscoveredQuestions(first, {
  url: 'https://docs.google.com/forms/d/e/smoke/viewform',
  canHandle: true,
});

check('DiscoveryReport JSON-serializable + no secrets', () => {
  const json = JSON.stringify(report);
  assert.ok(json.length > 0);
  assert.equal(json.includes('SHOULD_NOT_APPEAR_IN_DIAGNOSTICS'), false);
  assert.equal(json.includes('SECRET_PARAGRAPH'), false);
  assert.equal(/"value"\s*:/.test(json), false);
  const parsed = JSON.parse(json) as typeof report;
  assert.equal(typeof parsed.containerCount, 'number');
  assert.ok(parsed.missingControls >= 1);
  assert.ok(parsed.missingTitles >= 1);
});

check('buildDiscoveryReport uses owner document', () => {
  const built = buildDiscoveryReport(listRoot, document as unknown as Document);
  assert.equal(built.containerCount, first.length);
  assert.equal(built.signal, 'role-listitem');
});

console.log(`\nSmoke complete. failures=${failures}`);
if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`Fixture OK: ${pathToFileURL(fixturePath).href}`);
}
