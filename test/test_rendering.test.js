/* Question rendering (2026-09-01).

   Three defects the owner found on the deployed site, all of which look like broken content
   rather than broken code, and none of which any existing test caught:

     1. LaTeX shown raw: "$2.5 \times 10^{-3}$ grams" (260 items)
     2. reading passages missing entirely (175 items)
     3. Learn showing a correct answer with no choices, so "Which word begins with the same
        sound as sun?" answered "sock" with nothing to compare it against
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

const QUESTION_PAGES = ['app/pages/learn.html', 'app/pages/practice.html'];

test('pages that show questions load KaTeX, pinned', () => {
  for (const p of QUESTION_PAGES) {
    const html = read(p);
    assert.match(html, /katex@\d+\.\d+\.\d+\/dist\/katex\.min\.css/, `${p}: KaTeX stylesheet`);
    assert.match(html, /katex@\d+\.\d+\.\d+\/dist\/katex\.min\.js/, `${p}: KaTeX script`);
    assert.match(html, /contrib\/auto-render\.min\.js/, `${p}: the auto-render extension`);
    // An unpinned URL would let a breaking release ship itself to users, as with the SDK.
    assert.doesNotMatch(html, /katex@latest/, `${p}: KaTeX must be pinned`);
  }
});

test('every KaTeX asset is pinned to the same version', () => {
  const versions = new Set();
  for (const p of QUESTION_PAGES) {
    for (const m of read(p).matchAll(/katex@([\d.]+)\//g)) versions.add(m[1]);
  }
  assert.equal(versions.size, 1, `mixed KaTeX versions: ${[...versions].join(', ')}`);
});

test('both question views typeset maths after injecting content', () => {
  // KaTeX walks the live DOM, so it must run AFTER innerHTML, not on the string.
  for (const p of ['app/js/learn.js', 'app/js/practice.js']) {
    assert.match(read(p), /renderMath\(/, `${p} must typeset injected content`);
  }
});

test('maths rendering degrades instead of throwing', () => {
  /* One malformed `$` in one authored question must not blank the page. Content is authored
     by hand, so malformed maths is a question of when, not if. */
  const m = read('app/js/math-render.js');
  assert.match(m, /throwOnError:\s*false/);
  assert.match(m, /catch \(e\)/, 'a missing CDN must not throw');
});

test('both question views render the reading passage', () => {
  for (const p of ['app/js/learn.js', 'app/js/practice.js']) {
    const js = read(p);
    assert.match(js, /it\.passage|item\.passage/, `${p} must render the passage`);
    assert.match(js, /passageTitle/, `${p} must show which passage it is`);
  }
});

test('Learn shows the answer choices, marking the correct one', () => {
  /* Legacy Learn showed LLM teaching prose and needed no choices. Ours is derived from MCQs:
     without the choices, "Which word begins with the same sound as sun?" followed by "sock"
     is a non-sequitur. A deliberate divergence from obs_templates/learn.html. */
  const js = read('app/js/learn.js');
  assert.match(js, /it\.options\.map/, 'Learn must list the options');
  assert.match(js, /correctIndex/, 'and mark the correct one');
  assert.match(js, /list-group-item-success/, 'visibly, since this is study mode');
});

test('the passage is styled apart from the question and cannot swamp it', () => {
  const css = read('app/assets/css/site.css');
  assert.match(css, /\.nn-passage\b/, 'passages need their own treatment');
  assert.match(css, /max-height/, 'a long passage must not push the options off screen');
});

test('subtopic cards show icon, name and description — not a question count', () => {
  /* Legacy obs_templates/subtopics.html rendered exactly those three things. A "12 questions"
     badge was my addition; it is noise to a child choosing what to practise, and the owner
     asked why it was there. The count is still READ, to decide whether a subtopic has
     anything behind it — it is just not displayed. */
  const js = read('app/js/subtopics.js');
  assert.doesNotMatch(js, /\$\{count\}\s*question/, 'no question-count badge on the card');
  assert.match(js, /s\.icon/, 'the legacy icon');
  assert.match(js, /s\.name/, 'the legacy name');
  assert.match(js, /s\.description/, 'the legacy description');
  // The count still gates the greyed-out state.
  assert.match(js, /count === 0/, 'count still decides whether a subtopic is empty');
});

test('the manifest is revalidated rather than served from cache', () => {
  /* GitHub Pages sends cache-control: max-age=600 on the manifest. Without revalidation a
     freshly deployed subtopic keeps rendering as empty for ten minutes, which is exactly what
     the owner saw after the content was authored. `cache: 'no-cache'` still sends the ETag,
     so an unchanged manifest costs a 304. */
  const js = read('app/js/content-loader.js');
  assert.match(js, /cache:\s*'no-cache'/, 'the manifest fetch must revalidate');
});
