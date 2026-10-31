/* Verify every arithmetic chain stated in every SHIPPED explanation, across the whole corpus.

   A GATE since 2026-10-30: it exits non-zero when any statement is wrong, and
   test/test_arithmetic.test.js runs it inside `npm test`. It was REPORTING ONLY before that,
   and the reason is worth keeping: it flagged 31 statements that had each been checked by hand
   and were CORRECT, so a non-zero exit would have meant a permanently red command. The note it
   carried rejected the obvious fix -- "whitelisting sixteen strings, which rots" -- and that
   was right. The count had already drifted 16 -> 31 by the time anyone looked again.

   What changed is the classifier, not a whitelist. Every one of the 31 was a case where the
   extracted substring was NOT the author's expression, in five structural classes:

     \frac{15 - 3}{6 - 2}    numerator/denominator carrying an operator. Rewriting it as
                             `15 - 3/6 - 2` is unsound -- it needs parentheses this evaluator
                             does not have. Only a frac of two BARE numbers is linearised now.
     10^{4+3} · 3^{-2}       an exponent that is itself an expression, or negative. The old
                             rule matched `{4` out of `{4+3}` and folded 10^4, leaving `+3`.
     \sqrt{6^2 + 8^2} = 10   a macro that TRANSFORMS its argument. The blanket `\\[a-zA-Z]+`
                             strip deleted it and compared 6^2+8^2 against 10. Same for
                             \overline{3} in a repeating decimal.
     s − 15 + 28 = 67        a fragment: the expression continues to the LEFT past a variable,
     24 − (3 + 5) × 2 + 6    a closing paren, or an operator.
     6÷4=1\frac12            a fragment the other way: the statement continues to the RIGHT,
     1,248 × 36 = 1,248 ×…   into a mixed number or a parenthesised factor.

   The first three are marked unevaluable in `prep` (see U) so no statement is extracted across
   them. The last two are caught by FRAG_BEFORE / FRAG_AFTER. Net effect: 1083 -> 1030
   statements still checked, and WRONG means wrong.

   MARKDOWN IS NOT ARITHMETIC, and this cost 188 sound statements on the first attempt. A
   trailing `**` of `**Step:**` is not a product and a leading `- ` of a list item is not a
   minus; keying the fragment test on bare operator characters skipped a fifth of the corpus.
   The test asserts a wrong sum is still caught inside bold and inside a bullet, for this
   reason. It found one real error (a grade 2 item asserting 14+9+5=30, fixed 2026-09-04) and
   that assertion is what proves it still could.

   Extraction traps, each of which produced false positives before being handled:
     `1{,}048`            LaTeX thousands separator -- strip `{,}` before braces or it reads 1.
     `\frac{1}{2}\times…` the fraction must JOIN the chain, not be deleted.
     `2/8 + 3/8 = 5/8`    `/` is a fraction bar AND a division sign. Splitting on it computes
                          2/(8+3)/8. Tokenise: a fraction is one atom.
     `18.9 ÷ 0.7 = 189 ÷ 7 = 27`   an equality CHAIN. Evaluating only the first `=` compares
                          18.9÷0.7 against 189. Every step of the chain must agree, or skip.
   A chain spanning a newline is two statements, not one sum, so it is not evaluated. */
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', 'app/content/questions/en');

/* Walk the compiled corpus. Exported so the test loads the same items the CLI does rather
   than a fixture that could drift away from what ships. */
export function collectItems(dir = CORPUS) {
  const items = [];
  (function w(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) w(p);
      else if (f.endsWith('.json') && f !== 'manifest.json')
        for (const it of JSON.parse(readFileSync(p, 'utf8'))) items.push(it);
    }
  })(dir);
  return items;
}

/* The marker for "prep cannot linearise this faithfully". It is not a digit, an operator or
   an `=`, so STMT cannot match across it and no statement is extracted from a region whose
   value we would get wrong. Counted, not hidden -- the CLI reports how many were marked. */
const U = '¤';
const PLAIN = /^[\d\s,.]+$/;        // digits only: safe to rewrite as a/b or fold as a^b

const prep = (s, st) => {
  const mark = () => { st.marks++; return ` ${U} `; };
  return String(s || '')
    .replace(/\{,\}/g, '')
    .replace(/\\(?:sqrt|overline)\s*\{[^{}]*\}/g, mark)
    .replace(/\\(?:sqrt|overline)/g, mark)
    .replace(/(\d[\d,.]*)\s*\^\s*\{([^{}]*)\}/g, (_, a, b) =>
      PLAIN.test(b) ? String(Number(a.replace(/,/g, '')) ** Number(b)) : mark())
    .replace(/(\d[\d,.]*)\s*\^\s*(-?\d+)/g, (_, a, b) =>
      /^\d+$/.test(b) ? String(Number(a.replace(/,/g, '')) ** Number(b)) : mark())
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, n, d) =>
      (PLAIN.test(n) && PLAIN.test(d)) ? ` ${n}/${d} ` : mark())
    .replace(/\\[dt]?frac/g, mark)   // leftover = nested braces the rule above cannot parse
    .replace(/\\times|\\cdot/g, '×').replace(/\\div/g, '÷')
    .replace(/\\[()]/g, ' ').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$]/g, ' ')
    .replace(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/g, ' $1/$2 ');
};

// A term: an integer/decimal, optionally a fraction, optionally a mixed number ("1 1/2").
const TERM = String.raw`\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d[\d,]*(?:\.\d+)?)?`;
const OP = String.raw`[+\-−×xX*÷]`;   // NOTE: "/" is NOT an operator here; it is a fraction bar.
// An expression, then one or more "= expression" steps.
const STMT = new RegExp(
  `(${TERM}(?:[ \\t]*${OP}[ \\t]*${TERM})+)((?:[ \\t]*=[ \\t]*${TERM}(?:[ \\t]*${OP}[ \\t]*${TERM})*)+)`, 'g');

/* The expression continues to the LEFT, so the match is a fragment, when:
     - an operand (variable, closing paren, marked region) is followed by an operator;
     - a grouping/fraction/caret token sits immediately before; or
     - a `-` follows an `=` or another operator, or opens the text, making it the SIGN of the
       first term rather than a binary minus. `= -\frac{1}{10} + \frac{6}{10}` becomes
       `= - 1/10 + 6/10` -- the frac rewrite pads with spaces and divorces the sign from its
       operand -- and reading that as positive 1/10 is how the last false positive survived.
       Note `^` means the start of the TEXT, never the start of a line: a list item begins
       `\n- ` and must stay checked. Tested against the full prefix for that reason.
   `*` and a bare leading `-` are deliberately NOT operands here -- see the markdown note. */
const FRAG_BEFORE = new RegExp(
  `[A-Za-z)${U}][ \\t]*[+\\-−×xX*÷/^][ \\t]*$`
  + `|[(/^${U}][ \\t]*$`
  + `|[=+\\-−×÷(][ \\t]*[-−][ \\t]*$`
  + `|^[ \\t]*[-−][ \\t]*$`);
/* ...and to the RIGHT when a digit (a mixed number), an operator, a paren or a marked region
   follows. `*` is excluded: a trailing `**` closes markdown bold, it is not a product. */
const FRAG_AFTER = new RegExp(`[\\d+\\-−×xX÷/^(${U}]`);

const val = (t) => {
  const s = t.replace(/[,\s]/g, '');
  if (s.includes('/')) { const [a, b] = s.split('/'); return Number(a) / Number(b); }
  return Number(s);
};
/* Real precedence. Evaluating strictly left to right made "36x20 + 36x7 = 972" look wrong
   (it computes 5292), and an order-of-operations item is exactly where that matters most. */
const evalExpr = (e) => {
  const toks = e.split(new RegExp(`[ \\t]*(${OP})[ \\t]*`)).filter((x) => x !== '' && x !== undefined);
  const nums = [val(toks[0])], ops = [];
  for (let i = 1; i < toks.length; i += 2) { ops.push(toks[i]); nums.push(val(toks[i + 1])); }
  if (nums.some((n) => !Number.isFinite(n))) return NaN;
  for (let i = 0; i < ops.length;) {          // pass 1: x and /
    if (ops[i] === '÷') { nums.splice(i, 2, nums[i] / nums[i + 1]); ops.splice(i, 1); }
    else if (/[×xX*]/.test(ops[i])) { nums.splice(i, 2, nums[i] * nums[i + 1]); ops.splice(i, 1); }
    else i++;
  }
  let v = nums[0];
  for (let i = 0; i < ops.length; i++) v = ops[i] === '+' ? v + nums[i + 1] : v - nums[i + 1];
  return v;
};

/* Pure over its argument: no filesystem, no printing, no exit. Returns the counts and the
   findings so a test can assert on them and the CLI can format them. */
export function checkArithmetic(items) {
  const st = { marks: 0 };
  let checked = 0, skipped = 0;
  const wrong = [];
  for (const it of items) {
    /* Only the REASONING half. "Why the other answers are wrong: A. 46+27=63 ..." quotes the
       false distractor equations on purpose, and checking those reports the content as broken
       when it is doing exactly the right thing. */
    const reasoning = String(it.explanation || '')
      .split(/\*\*Why (?:the )?other answers are wrong:?\*\*/i)[0];
    const txt = prep(reasoning, st);
    for (const m of txt.matchAll(STMT)) {
      const after = txt.slice(m.index + m[0].length, m.index + m[0].length + 16);
      if (/^\s*(?:\/\s*\d|remainder|[Rr]\s*\d|\.\.\.|…|approx|\d+\s*\/\s*\d)/.test(after)) { skipped++; continue; }
      const adj = txt[m.index - 1];
      if (adj === '-' || adj === '−') { skipped++; continue; }   // sign glued to the first digit
      if (FRAG_BEFORE.test(txt.slice(0, m.index))) { skipped++; continue; }
      const afterNS = after.replace(/^[ \t]+/, '')[0];
      if (afterNS && FRAG_AFTER.test(afterNS)) { skipped++; continue; }
      const steps = [m[1], ...m[2].split('=').map((x) => x.trim()).filter(Boolean)];
      const vals = steps.map(evalExpr);
      if (vals.some((v) => !Number.isFinite(v))) { skipped++; continue; }
      checked++;
      const bad = vals.some((v) => Math.abs(v - vals[0]) > Math.max(1e-6, Math.abs(vals[0]) * 1e-9));
      if (bad) wrong.push(`${it.id}: "${m[0].replace(/\s+/g, ' ')}"  -> steps evaluate to [${vals.map((v) => +v.toFixed(6)).join(', ')}]`);
    }
  }
  return { total: items.length, checked, skipped, marks: st.marks, wrong: [...new Set(wrong)] };
}

/* CLI only. Guarded so `import` from the test does not run the walk or set an exit code.
   The optional argv[2] corpus path exists so the test can drive the REAL exit-1 path against a
   fixture; asserting the exit code by grepping this file for `? 1 : 0` would prove nothing. */
const invokedDirectly = process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const r = checkArithmetic(collectItems(process.argv[2] || CORPUS));
  console.log(`items ${r.total} | statements checked ${r.checked} | skipped as unevaluable ${r.skipped} | unevaluable regions ${r.marks} | WRONG ${r.wrong.length}`);
  r.wrong.forEach((w) => console.log('  ', w));
  process.exitCode = r.wrong.length ? 1 : 0;
}
