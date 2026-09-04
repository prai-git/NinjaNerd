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

test('an escaped dollar INSIDE maths keeps its escape', () => {
  /* Regression, 2026-09-03. A price inside maths is authored the LaTeX-correct way,
     `$\$4.8 \times 10^{8}$`. The escape was protected, the span was rewritten to \(...\),
     and then the escape was restored as a BARE `$` — inside maths, where KaTeX treats it as
     a parse error and prints the source in red. A grade 6 number-sense question shipped
     reading "4.8 \times 10^{8}" in red instead of the value. */
  assert.equal(
    normaliseMath("A city's budget is $\\$4.8 \\times 10^{8}$."),
    "A city's budget is \\(\\$4.8 \\times 10^{8}\\).");
  // The same escape outside maths still loses its backslash.
  assert.equal(normaliseMath('Tax is $\\$8\\%$ on a \\$60 jacket.'),
    'Tax is \\(\\$8\\%\\) on a $60 jacket.');
});

test('no shipped question puts a bare dollar inside a maths span', () => {
  // The rendered symptom, checked on the compiled corpus rather than only on the function.
  const root = join(repoRoot, 'app/content/questions/en');
  const bad = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && e.name !== 'manifest.json') {
        for (const item of JSON.parse(readFileSync(p, 'utf8'))) {
          const fields = [item.question, item.explanation, item.passage, ...(item.options || [])];
          for (const f of fields) {
            for (const span of String(f || '').match(/\\\([\s\S]*?\\\)/g) || []) {
              if (/(^|[^\\])\$/.test(span)) bad.push(`${item.id}: ${span}`);
            }
          }
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(bad, [], `KaTeX renders these in red:\n${bad.slice(0, 10).join('\n')}`);
});

test('two prices in one sentence are never paired as maths', () => {
  /* Regression, 2026-09-03. `looksLikeMath` counts words of 3+ letters and allows a span with
     fewer than three, so "Ravi earns $12 and spends $7" — only *and* and *spends* — was typeset
     as \(12 and spends \)7. 84 items corpus-wide rendered that way, across grades 1-6.
     The fix is a lookahead: a closing `$` followed directly by a DIGIT is the next price's
     opening `$`, not a delimiter. */
  const s = 'Ravi earns $12 and spends $7. How much can he save?';
  assert.equal(normaliseMath(s), s);
  assert.equal(normaliseMath('**Explanation:** $45 − $28 = $17 left to save.'),
    '**Explanation:** $45 − $28 = $17 left to save.');
  const three = "Zoe has $5. A notebook costs $3, and a snack costs $4.";
  assert.equal(normaliseMath(three), three);
  // And genuine maths still converts, including when a sentence ends right after it.
  assert.equal(normaliseMath('among $1.2 \\times 10^{5}$ residents'),
    'among \\(1.2 \\times 10^{5}\\) residents');
  assert.equal(normaliseMath('Compute $300 - 250 = 50$. Then stop.'),
    'Compute \\(300 - 250 = 50\\). Then stop.');
});

test('a span crossing a sentence boundary is prose, not maths', () => {
  // Complements the digit lookahead: catches the case where the next `$` is not a price.
  assert.ok(!looksLikeMath('5 for it. Then '), 'a period plus a capital letter ends a sentence');
  assert.ok(looksLikeMath('2.5 \\times 10^{-3}'), 'a decimal point does not');
});

test('no shipped item leaves a LaTeX command outside a maths span', () => {
  /* The other way this fails in front of a child: not red error text but raw source, e.g.
     "3\\times25\\text{¢}". Four source files had `\t`/`\f` eaten to a literal tab or form feed
     (\\times -> TAB+imes) in 27 items, repaired 2026-09-03. */
  const CMD = /\\(times|frac|text|div|cdot|sqrt|le|ge|ne|pm)\b/;
  const root = join(repoRoot, 'app/content/questions/en');
  const bad = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && e.name !== 'manifest.json') {
        for (const item of JSON.parse(readFileSync(p, 'utf8'))) {
          for (const f of [item.question, item.explanation, item.passage, ...(item.options || [])]) {
            const outside = String(f || '').replace(/\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g, ' ');
            if (CMD.test(outside)) bad.push(item.id);
            // A control character means an escape was eaten when the source was written.
            if (/[\t\x08\x0b\x0c\r]/.test(String(f || ''))) bad.push(`${item.id} (control char)`);
          }
        }
      }
    }
  };
  walk(root);
  assert.deepEqual([...new Set(bad)], [], 'these render as raw LaTeX, not as maths');
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
          // `\$` is correct INSIDE maths and wrong outside it (2026-09-03) — a bare `$` there
          // is a KaTeX parse error that prints the expression in red. Strip the spans first.
          const outside = all.replace(/\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g, ' ');
          if (outside.includes('\\$')) escaped++;
          if (all.includes('\\(')) paren++;
        }
      }
    }
  }
  assert.ok(total > 1000, `expected the whole corpus, saw ${total}`);
  assert.equal(escaped, 0, 'no item may ship a literal backslash-dollar outside maths');
  assert.ok(paren > 200, `expected 200+ items with inline maths, got ${paren}`);
});
