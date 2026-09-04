/* Verify every arithmetic chain stated in every SHIPPED explanation, across the whole corpus.

   REPORTING ONLY — read the output, do not gate a build on it. It found one real error (a grade
   2 item asserting 14+9+5=30, fixed 2026-09-04) and it currently flags 16 statements that were
   each checked by hand and are CORRECT. Those 16 are the inherent limits of matching arithmetic
   with a regex: exponents and scientific notation (10^{4+3}), negative numbers (-86 + 412),
   fraction bars as expressions (\frac{4+6+8+10+12}{5}), mixed numbers (1\frac12), algebraic
   terms (s - 15 + 28 = 67), and sub-chains of a larger parenthesised expression. Making it exit
   non-zero would mean whitelisting sixteen strings, which rots; reading sixteen lines does not.

   Extraction traps, each of which produced false positives before being handled:
     `1{,}048`            LaTeX thousands separator -- strip `{,}` before braces or it reads 1.
     `\frac{1}{2}\times…` the fraction must JOIN the chain, not be deleted.
     `2/8 + 3/8 = 5/8`    `/` is a fraction bar AND a division sign. Splitting on it computes
                          2/(8+3)/8. Tokenise: a fraction is one atom.
     `18.9 ÷ 0.7 = 189 ÷ 7 = 27`   an equality CHAIN. Evaluating only the first `=` compares
                          18.9÷0.7 against 189. Every step of the chain must agree, or skip.
   A chain spanning a newline is two statements, not one sum, so it is not evaluated. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const C = join(dirname(fileURLToPath(import.meta.url)), '..', 'app/content/questions/en');
const items = [];
(function w(d) { for (const f of readdirSync(d)) { const p = join(d, f);
  if (statSync(p).isDirectory()) w(p);
  else if (f.endsWith('.json') && f !== 'manifest.json')
    for (const it of JSON.parse(readFileSync(p, 'utf8'))) items.push(it); } })(C);

const prep = (s) => String(s || '')
  .replace(/\{,\}/g, '')
  .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1/$2 ')
  .replace(/\\times|\\cdot/g, '×').replace(/\\div/g, '÷')
  .replace(/\\[()]/g, ' ').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$]/g, ' ')
  .replace(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/g, ' $1/$2 ')
  .replace(/(\d+)\s*\^\s*\{?(\d+)\}?/g, (_, a, b) => String(Number(a) ** Number(b)));

// A term: an integer/decimal, optionally a fraction, optionally a mixed number ("1 1/2").
const TERM = String.raw`\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d[\d,]*(?:\.\d+)?)?`;
const OP = String.raw`[+\-−×xX*÷]`;   // NOTE: "/" is NOT an operator here; it is a fraction bar.
// An expression, then one or more "= expression" steps.
const STMT = new RegExp(
  `(${TERM}(?:[ \\t]*${OP}[ \\t]*${TERM})+)((?:[ \\t]*=[ \\t]*${TERM}(?:[ \\t]*${OP}[ \\t]*${TERM})*)+)`, 'g');
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
let checked = 0, skipped = 0; const wrong = [];
for (const it of items) {
  /* Only the REASONING half. "Why the other answers are wrong: A. 46+27=63 ..." quotes the
     false distractor equations on purpose, and checking those reports the content as broken
     when it is doing exactly the right thing. */
  const reasoning = String(it.explanation || '')
    .split(/\*\*Why (?:the )?other answers are wrong:?\*\*/i)[0];
  const txt = prep(reasoning);
  for (const m of txt.matchAll(STMT)) {
    const after = txt.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (/^\s*(?:\/\s*\d|remainder|[Rr]\s*\d|\.\.\.|…|approx|\d+\s*\/\s*\d)/.test(after)) { skipped++; continue; }
    const steps = [m[1], ...m[2].split('=').map((x) => x.trim()).filter(Boolean)];
    const vals = steps.map(evalExpr);
    if (vals.some((v) => !Number.isFinite(v))) { skipped++; continue; }
    checked++;
    const bad = vals.some((v) => Math.abs(v - vals[0]) > Math.max(1e-6, Math.abs(vals[0]) * 1e-9));
    if (bad) wrong.push(`${it.id}: "${m[0].replace(/\s+/g, ' ')}"  -> steps evaluate to [${vals.map((v) => +v.toFixed(6)).join(', ')}]`);
  }
}
console.log(`items ${items.length} | statements checked ${checked} | skipped as unevaluable ${skipped} | WRONG ${wrong.length}`);
[...new Set(wrong)].forEach((w) => console.log('  ', w));
