/* The arithmetic gate.

   `tools/check-arithmetic.mjs` recomputes every arithmetic chain stated in every shipped
   explanation. It was REPORTING ONLY until 2026-10-30 because it flagged 31 statements that
   were each correct, so a non-zero exit would have been permanently red; its header records
   why a string whitelist was the wrong fix and what replaced it.

   These tests exist to hold two things at once, because either alone is useless:
     1. the corpus is clean  (`wrong` is empty), and
     2. the checker is still CHECKING  (`checked` stays above 1000).
   Without (2), the cheapest way to make (1) pass forever is to skip every statement. That is
   exactly the failure mode the five "still caught" cases below guard against. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkArithmetic, collectItems, CORPUS } from '../tools/check-arithmetic.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(repoRoot, 'tools', 'check-arithmetic.mjs');
const items = collectItems(CORPUS);
const result = checkArithmetic(items);

// ---- the gate ------------------------------------------------------------------------------

test('no shipped explanation states arithmetic that does not hold', () => {
  assert.deepEqual(result.wrong, [],
    `wrong statements in the corpus:\n${result.wrong.join('\n')}`);
});

test('the whole compiled corpus is walked, not a subset', () => {
  assert.equal(items.length, 4175, 'corpus size changed - update this number deliberately');
  assert.ok(items.every((it) => typeof it.id === 'string'), 'every item carries an id');
});

/* The counterweight to the test above. A change that skipped everything would make the gate
   green and worthless, so the floor is asserted explicitly. 1030 is the measured value on
   2026-10-30; 1000 leaves room for content edits without inviting silent erosion. */
test('the checker still verifies over a thousand statements', () => {
  assert.ok(result.checked > 1000,
    `only ${result.checked} statements checked - the classifier is skipping too much`);
});

test('statements it cannot evaluate are skipped, not reported as wrong', () => {
  assert.ok(result.skipped > 0, 'some statements are genuinely unevaluable');
  assert.ok(result.marks > 0, 'some regions are marked unevaluable in prep');
});

// ---- it still catches a wrong sum ----------------------------------------------------------

const only = (explanation) => checkArithmetic([{ id: 'T', explanation }]);

test('a wrong sum is caught - the grade 2 error this tool actually found', () => {
  // The real one, fixed at source 2026-09-04: a frog at 23 cm cannot be 5 cm short of 30.
  const r = only('The frog jumped 14 + 9 + 5 = 30 cm in total.');
  assert.equal(r.wrong.length, 1);
  assert.match(r.wrong[0], /14 \+ 9 \+ 5 = 30/);
  assert.match(r.wrong[0], /\[28, 30\]/, 'and it reports what the steps really evaluate to');
});

test('a wrong product is caught', () => {
  assert.equal(only('**Step:** 7 × 8 = 54 in total.').wrong.length, 1);
});

/* Keying the fragment test on bare operator characters skipped 188 sound statements, because
   `**Step:**` ends in `*` and a list item opens with `- `. These two cases are the regression
   test for that: markdown must not blind the checker. */
test('a wrong sum inside markdown bold is still caught', () => {
  assert.equal(only('**Verification:** 7 × 8 = 54**').wrong.length, 1,
    'a trailing ** closes bold; it is not a product');
});

test('a wrong sum inside a list item is still caught', () => {
  assert.equal(only('**Why:**\n- 120 + 35 = 150 apples\n').wrong.length, 1,
    'a leading "- " is a bullet; it is not a minus sign');
});

test('a correct statement is not flagged', () => {
  assert.deepEqual(only('**Step:** 7 × 8 = 56 in total.').wrong, []);
});

test('order of operations is respected, not applied left to right', () => {
  // Left-to-right evaluation makes this look wrong (it would compute 5292).
  assert.deepEqual(only('Split the product: 36 × 20 + 36 × 7 = 972.').wrong, []);
});

test('the distractor section is excluded, because it quotes wrong sums on purpose', () => {
  const r = only('Correct: 2 + 2 = 4.\n\n**Why the other answers are wrong:** A. 46 + 27 = 63');
  assert.deepEqual(r.wrong, [], 'quoting a false equation to refute it is not an error');
});

// ---- the five unevaluable classes ----------------------------------------------------------

test('a fraction whose parts carry an operator is not linearised', () => {
  // \frac{15-3}{6-2} = 3. Rewriting it as "15 - 3/6 - 2" would evaluate to 12.5.
  const r = only('Slope: \\(m = \\frac{15 - 3}{6 - 2} = \\frac{12}{4} = 3\\).');
  assert.deepEqual(r.wrong, []);
  assert.ok(r.marks > 0, 'the frac is marked unevaluable rather than rewritten');
});

test('a plain fraction IS still linearised, so real fraction errors stay catchable', () => {
  assert.deepEqual(only('Add: \\(\\frac{1}{4} + \\frac{1}{4} = \\frac{2}{4}\\)').wrong, []);
  assert.equal(only('Add: \\(\\frac{1}{4} + \\frac{1}{4} = \\frac{3}{4}\\)').wrong.length, 1,
    'a wrong plain-fraction sum must still be caught');
});

test('an exponent that is an expression or negative is not folded', () => {
  assert.deepEqual(only('\\((3 \\times 2) \\times 10^{4+3} = 6 \\times 10^{7}\\)').wrong, []);
  assert.deepEqual(only('\\(3^5 \\cdot 3^{-2} = 3^{3}\\)').wrong, []);
});

test('a plain exponent IS still folded', () => {
  assert.deepEqual(only('\\(2^{3} \\times 2 = 16\\)').wrong, []);
  assert.equal(only('\\(2^{3} \\times 2 = 17\\)').wrong.length, 1);
});

test('a macro that transforms its argument is not stripped to its contents', () => {
  // \sqrt{6^2 + 8^2} = 10. Deleting \sqrt compares 36 + 64 against 10.
  const r = only('The diagonal is \\(\\sqrt{6^2 + 8^2} = 10\\) cm.');
  assert.deepEqual(r.wrong, []);
  /* skipped === 0 is the point: the GROUP is marked, so no statement is extracted from inside
     the braces at all. The bare `\sqrt` fallback would leave `6^2 + 8^2 = 10` to be extracted
     and then rejected by FRAG_BEFORE (skipped === 1) -- same verdict, two mechanisms deep.
     Asserting the verdict alone cannot tell those apart; a mutation proved it. */
  assert.equal(r.skipped, 0, 'the whole macro group is marked, not patched up downstream');
  assert.equal(r.marks, 1);
  assert.deepEqual(only('\\(13.\\overline{3} \\times 24 = 320\\) km.').wrong, []);
});

test('a fragment of a larger expression is not treated as a whole statement', () => {
  assert.deepEqual(only('Let s be the start: **s − 15 + 28 = 67**').wrong, [],
    'the expression continues left past a variable');
  assert.deepEqual(only('Order: 24 − (3 + 5) × 2 + 6 = 24 − 16 + 6 = 14.').wrong, [],
    'the expression continues left past a closing paren');
  assert.deepEqual(only('Four quarts a gallon, so \\(6\\div4=1\\frac12\\).').wrong, [],
    'the statement continues right into a mixed number');
  assert.deepEqual(only('Check: 1,248 × 36 = 1,248 × (40 − 4) = 44,928').wrong, [],
    'the statement continues right into a parenthesised factor');
});

test('a negative first term is not read as positive', () => {
  assert.deepEqual(only('\\(-86 + 412 = 326\\)').wrong, [], 'sign glued to the digit');
  assert.deepEqual(
    only('\\(-\\frac{1}{10} + \\frac{6}{10} = \\frac{5}{10} = \\frac{1}{2}\\)').wrong, [],
    'sign separated from its operand by the frac rewrite');
});

// ---- the CLI contract ----------------------------------------------------------------------

test('the CLI exits 0 and reports its counts when the corpus is clean', () => {
  const out = execFileSync('node', [TOOL], { encoding: 'utf8' });   // throws on non-zero exit
  assert.match(out, /^items 4175 \| statements checked \d+ \| skipped as unevaluable \d+ \| unevaluable regions \d+ \| WRONG 0$/m);
});

test('the CLI exits NON-ZERO on a wrong statement - the gate it had always lacked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nn-arith-'));
  try {
    writeFileSync(join(dir, 'f.json'),
      JSON.stringify([{ id: 'bad_1', explanation: 'So 14 + 9 + 5 = 30 cm.' }]));
    let code = 0; let stdout = '';
    try {
      stdout = execFileSync('node', [TOOL, dir], { encoding: 'utf8' });
    } catch (e) {
      code = e.status; stdout = String(e.stdout);
    }
    assert.equal(code, 1, 'a wrong statement must fail the command');
    assert.match(stdout, /WRONG 1/);
    assert.match(stdout, /bad_1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
