/* Maths vs currency (2026-09-01).

   The authored content uses `$` for both. Configured with `$` as an inline delimiter, KaTeX
   pairs the next two it finds, so "They earn $4,500 per month. They pay $675 for food" renders
   the sentence between them as maths. 53 items in the corpus do this.

   The build resolves the ambiguity once: real maths becomes \(...\), currency stays literal,
   and the site runs KaTeX without `$` enabled at all. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseMath, looksLikeMath } from '../tools/lib/mathnorm.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

test('maths is rewritten to an unambiguous delimiter', () => {
  assert.equal(
    normaliseMath('a mass of about $2.5 \\times 10^{-3}$ grams'),
    'a mass of about \\(2.5 \\times 10^{-3}\\) grams');
  assert.equal(normaliseMath('$0.025$ grams'), '\\(0.025\\) grams');
  // Bare arithmetic between dollars is maths too, even with no LaTeX command.
  assert.equal(normaliseMath('Compute $300 - 250 = 50$ exactly.'),
    'Compute \\(300 - 250 = 50\\) exactly.');
});

test('currency is left alone, including across a sentence', () => {
  // The exact shape that would otherwise be swallowed.
  const s = 'They earn $4,500 per month. They pay $675 for food.';
  assert.equal(normaliseMath(s), s);
  assert.equal(normaliseMath('Rina earns $2 for helping wash a car.'),
    'Rina earns $2 for helping wash a car.');
});

test('an escaped currency dollar loses its backslash', () => {
  // `\$45.00` renders with a visible backslash if left as authored.
  assert.equal(normaliseMath('She paid \\$45.00 for it.'), 'She paid $45.00 for it.');
});

test('display maths is left untouched', () => {
  const s = 'Evaluate:\n\n$$3 + 2 \\times (4^2 - 10) \\div 2$$';
  assert.equal(normaliseMath(s), s);
});

test('the maths/prose discriminator', () => {
  assert.ok(looksLikeMath('2.5 \\times 10^{-3}'), 'a LaTeX command');
  assert.ok(looksLikeMath('300 - 250 = 50'), 'bare arithmetic');
  assert.ok(looksLikeMath('I = Prt'), 'a short formula');
  assert.ok(!looksLikeMath('4,500 per month. They pay '), 'a sentence is not maths');
});

test('KaTeX is never configured with a bare $ delimiter', () => {
  /* This is the guard that matters. Re-adding `$` would silently mangle 53 items, and only on
     the deployed site — nothing local would fail. */
  const m = read('app/js/math-render.js');
  const delims = m.slice(m.indexOf('const DELIMITERS'), m.indexOf('];', m.indexOf('const DELIMITERS')));
  assert.doesNotMatch(delims, /left:\s*'\$'/, 'a bare $ must not be a delimiter');
  assert.match(delims, /left:\s*'\\\\\('/, '\\( must be');
});

test('the built content carries no escaped dollars and real maths uses \\(', () => {
  let escaped = 0; let paren = 0; let total = 0;
  const root = join(repoRoot, 'app/content/questions/en');
  for (const g of readdirSync(root)) {
    const gd = join(root, g);
    let subjects; try { subjects = readdirSync(gd); } catch { continue; }
    for (const subj of subjects) {
      let files; try { files = readdirSync(join(gd, subj)); } catch { continue; }
      for (const f of files) {
        for (const it of JSON.parse(readFileSync(join(gd, subj, f), 'utf8'))) {
          total++;
          const all = [it.question, ...(it.options || []), it.explanation, it.passage].join(' ');
          if (all.includes('\\$')) escaped++;
          if (all.includes('\\(')) paren++;
        }
      }
    }
  }
  assert.ok(total > 1000, `expected the whole corpus, saw ${total}`);
  assert.equal(escaped, 0, 'no item may ship a literal backslash-dollar');
  assert.ok(paren > 200, `expected 200+ items with inline maths, got ${paren}`);
});
