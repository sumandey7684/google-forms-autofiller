/**
 * P6 navigation smoke.
 *
 *   pnpm run p6-navigation-smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'p6-navigation.html');
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
g.Event = window.Event;

const {
  inspectNavigation,
  navigateSection,
  discoverQuestionContainers,
  classifyQuestions,
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

// --- Wire multi-section page switching (fixture simulation of Google Forms pages) ---
const multiList = byId('multi-list');
const page1Html = multiList.innerHTML;
const page2Html = `
  <div role="listitem" id="m2-mc">
    <div role="heading">Section 2 — Available?</div>
    <div role="radiogroup">
      <div role="radio" aria-label="Yes" aria-checked="false"></div>
      <div role="radio" aria-label="No" aria-checked="false"></div>
    </div>
  </div>
`;

let multiPage = 1;
let multiSubmitClicks = 0;
let multiNextClicks = 0;
let multiBackClicks = 0;

byId('multi-submit').addEventListener('click', () => {
  multiSubmitClicks += 1;
});
byId('multi-next').addEventListener('click', () => {
  multiNextClicks += 1;
  const input = multiList.querySelector('input');
  if (
    multiPage === 1 &&
    input instanceof HTMLInputElement &&
    input.value.trim().length === 0
  ) {
    // Simulate Forms required blocking: do not advance.
    return;
  }
  if (multiPage === 1) {
    multiList.innerHTML = page2Html;
    multiPage = 2;
  }
});
byId('multi-back').addEventListener('click', () => {
  multiBackClicks += 1;
  if (multiPage === 2) {
    multiList.innerHTML = page1Html;
    multiPage = 1;
  }
});

let trapSubmitClicks = 0;
byId('trap-submit-text').addEventListener('click', () => {
  trapSubmitClicks += 1;
});
let singleSubmitClicks = 0;
byId('single-submit').addEventListener('click', () => {
  singleSubmitClicks += 1;
});
let finalSubmitClicks = 0;
byId('final-submit').addEventListener('click', () => {
  finalSubmitClicks += 1;
});

check('one-section form inspect', () => {
  const inspection = inspectNavigation(byId('single-root'));
  assert.ok(
    inspection.state === 'single_section' ||
      inspection.state === 'submit_only_final_section',
  );
  assert.equal(inspection.controls.nextAvailable, false);
  assert.equal(inspection.controls.backAvailable, false);
  assert.equal(inspection.controls.submitPresent, true);
  assert.ok(inspection.section.questionCount >= 1);
});

check('inspect does not mutate DOM', () => {
  const root = byId('single-root');
  const before = root.innerHTML;
  inspectNavigation(root);
  assert.equal(root.innerHTML, before);
});

check('two-section: next available then move + rediscover', () => {
  // Fill required field so Next can advance.
  const input = multiList.querySelector('input');
  assert.ok(input instanceof HTMLInputElement);
  input.value = 'Test User';

  const before = inspectNavigation(byId('multi-root'));
  assert.equal(before.controls.nextAvailable, true);
  assert.ok(
    before.state === 'next_available' ||
      before.state === 'next_and_back_available',
  );

  const titleBefore = before.section.title ?? '';
  const moved = navigateSection('next', byId('multi-root'));
  assert.equal(moved.status, 'moved', moved.message);
  assert.ok(moved.after);
  assert.equal(multiPage, 2);

  const classified = classifyQuestions(
    discoverQuestionContainers(byId('multi-root')),
  );
  assert.ok(
    classified.some((c) => c.kind === 'multiple_choice'),
    'section 2 should classify as multiple_choice after rediscovery',
  );
  assert.notEqual(
    classified.find((c) => c.kind === 'multiple_choice')?.kind,
    'text',
  );
  // Title / kind changed vs section 1 text question.
  assert.ok(
    (moved.after.section.title ?? '') !== titleBefore ||
      classified.some((c) => c.kind === 'multiple_choice'),
  );
  assert.ok(multiNextClicks >= 1);
});

check('back navigation restores prior section', () => {
  const moved = navigateSection('back', byId('multi-root'));
  assert.equal(moved.status, 'moved');
  assert.equal(multiPage, 1);
  assert.ok(multiBackClicks >= 1);
  assert.ok(moved.after);
  assert.ok(
    moved.after.section.discoveryIds.length >= 1 ||
      moved.after.classifiedTotal >= 1,
  );
});

check('final section submit-only; never clicks Submit', () => {
  const inspection = inspectNavigation(byId('final-root'));
  assert.equal(inspection.state, 'submit_only_final_section');
  assert.equal(inspection.controls.nextAvailable, false);
  assert.equal(inspection.controls.submitPresent, true);

  const nextAttempt = navigateSection('next', byId('final-root'));
  assert.equal(nextAttempt.status, 'blocked');
  assert.equal(finalSubmitClicks, 0);
  assert.equal(multiSubmitClicks, 0);
  assert.equal(singleSubmitClicks, 0);
});

check('required-field blocking', () => {
  const root = byId('required-root');
  const input = root.querySelector('input');
  assert.ok(input instanceof HTMLInputElement);
  input.value = '';

  const result = navigateSection('next', root);
  assert.equal(result.status, 'blocked');
  assert.equal(result.state, 'navigation_blocked_by_required_fields');
});

check('ambiguous button labels blocked', () => {
  const inspection = inspectNavigation(byId('ambiguous-root'));
  assert.equal(inspection.state, 'ambiguous_navigation_control');
  const moved = navigateSection('next', byId('ambiguous-root'));
  assert.equal(moved.status, 'blocked');
  assert.equal(moved.state, 'ambiguous_navigation_control');
});

check('Submit-labeled control is never clicked as Next', () => {
  const inspection = inspectNavigation(byId('submit-trap-root'));
  assert.equal(inspection.controls.submitPresent, true);
  assert.equal(inspection.controls.nextAvailable, true);

  // Force a navigate next — must click Next, not Submit response.
  const moved = navigateSection('next', byId('submit-trap-root'));
  // Fingerprint may not change (no page switch wired) → blocked after click OR moved.
  // Critical: Submit response button must remain unclicked.
  assert.equal(trapSubmitClicks, 0);
  void moved;
});

check('navigation result JSON serializable; no DOM leakage', () => {
  const result = navigateSection('back', byId('final-root'));
  const json = JSON.stringify(result);
  assert.ok(json.length > 0);
  assert.ok(!json.includes('HTMLElement'));
  assert.equal(/"value"\s*:/.test(json), false);
});

check('no Submit clicks across suite', () => {
  assert.equal(multiSubmitClicks, 0);
  assert.equal(singleSubmitClicks, 0);
  assert.equal(finalSubmitClicks, 0);
  assert.equal(trapSubmitClicks, 0);
});

console.log(`\nP6 smoke complete. failures=${failures}`);
process.exitCode = failures > 0 ? 1 : 0;
