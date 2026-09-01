/* Content correctness sweep.

   Written after an authored question shipped with TWO correct options ("Which coins make 45
   cents?" where both A and the intended answer totalled 45). Eyeballing 1400 questions does
   not scale and does not catch that class of fault reliably; these checks do.

   Reports rather than fixes: every finding needs a human decision about the content.

       node tools/check-content.mjs
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repoRoot, 'app/content/questions/en');

/* Compare options EXACTLY apart from whitespace and markdown emphasis.

   An earlier version lower-cased and stripped punctuation, and then reported 38 "duplicates"
   that were nothing of the kind: capitalisation and punctuation questions distinguish their
   options precisely by case and commas —

     "We will visit the houston zoo on saturday."
     "We will visit the Houston Zoo on Saturday."

   For those items, case IS the answer. */
const norm = (s) => String(s || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

function loadAll() {
  const out = [];
  const dirs = (d) => readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory());
  for (const g of dirs(root)) {
    for (const subj of dirs(join(root, g))) {
      const sd = join(root, g, subj);
      for (const f of readdirSync(sd)) {
        if (!f.endsWith('.json')) continue;
        for (const it of JSON.parse(readFileSync(join(sd, f), 'utf8'))) out.push(it);
      }
    }
  }
  return out;
}

const items = loadAll();
const findings = [];
const add = (kind, it, detail) => findings.push({ kind, id: it.id, grade: it.grade,
  subject: it.subject, detail });

for (const it of items) {
  const opts = it.options || [];

  // Two identical options mean at best a typo, at worst two correct answers.
  const seen = new Map();
  opts.forEach((o, i) => {
    const k = norm(o);
    if (!k) add('empty-option', it, `option ${i} is blank`);
    else if (seen.has(k)) add('duplicate-option', it, `options ${seen.get(k)} and ${i}: "${o}"`);
    else seen.set(k, i);
  });

  if (opts.length !== 4) add('option-count', it, `${opts.length} options`);
  if (!(it.correctIndex >= 0 && it.correctIndex < opts.length)) {
    add('bad-correct-index', it, `correctIndex ${it.correctIndex} of ${opts.length}`);
  }
  if (!String(it.question || '').trim()) add('empty-question', it, 'no question text');

  /* The answer key states the correct option in prose. Where it does, it must agree with
     correctIndex — a mismatch means the key and the item disagree about the answer. */
  const stated = String(it.explanation || '').match(/correct answer:?\s*\**\s*([A-D])[.)\s]/i);
  if (stated && it.correctIndex >= 0) {
    const want = 'ABCD'.indexOf(stated[1].toUpperCase());
    if (want >= 0 && want !== it.correctIndex) {
      add('key-mismatch', it, `explanation says ${stated[1]}, correctIndex is ${'ABCD'[it.correctIndex]}`);
    }
  }

  /* A question that refers to reading material it does not carry is unanswerable.

     "According to the Law of Conservation of Energy..." is NOT such a question — it cites a
     named principle, not a text. Excluding that shape keeps the check meaningful; a report
     that always shows one known-good finding trains you to ignore it. */
  const q = it.question || '';
  const citesNamedPrinciple =
    /according to the\s+\**\s*(law|theory|principle|rule|formula)\b/i.test(q);
  /* A question may carry its reading text INLINE as a blockquote rather than in the shared
     `passage` field. That is self-contained and answerable -- the only thing this check cares
     about -- and it is the better shape here, because practice serves one shuffled question at
     a time, so a passage shared across a numbered run is the awkward case. */
  const carriesTextInline = /^\s*>/m.test(q);
  if (!it.passage && !citesNamedPrinciple && !carriesTextInline &&
      /\b(the passage|the story|the poem|the excerpt|according to the|in passage \d)\b/i.test(q)) {
    add('orphan-passage', it, q.slice(0, 70));
  }

  // Unbalanced maths delimiters would render as red error text.
  const all = [it.question, ...opts, it.explanation, it.passage].join('\n');
  const open = (all.match(/\\\(/g) || []).length;
  const close = (all.match(/\\\)/g) || []).length;
  if (open !== close) add('unbalanced-math', it, `${open} \\( vs ${close} \\)`);
  if (all.includes('\\$')) add('escaped-dollar', it, 'literal \\$ would render a backslash');
}

const byKind = {};
for (const f of findings) (byKind[f.kind] ||= []).push(f);

console.log(`Checked ${items.length} items.\n`);
if (!findings.length) { console.log('No findings.'); process.exit(0); }
for (const kind of Object.keys(byKind).sort()) {
  console.log(`${kind}: ${byKind[kind].length}`);
  for (const f of byKind[kind].slice(0, 6)) {
    console.log(`   g${f.grade} ${f.subject} ${f.id}: ${f.detail}`);
  }
  if (byKind[kind].length > 6) console.log(`   ... ${byKind[kind].length - 6} more`);
  console.log();
}
process.exitCode = findings.length ? 1 : 0;
