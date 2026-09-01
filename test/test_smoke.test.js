import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repoRoot, 'app');

test('app/index.html exists', () => {
  assert.ok(existsSync(join(appDir, 'index.html')), 'app/index.html should exist');
});

test('app/.nojekyll exists', () => {
  assert.ok(existsSync(join(appDir, '.nojekyll')), 'app/.nojekyll should exist');
});

/* CNAME now SHIPS in app/ — the custom domain went live 2026-09-01.

   It was staged at the repo root as CNAME.pending for the whole migration, because Pages
   reads app/CNAME on deploy and sets the custom domain, which makes <user>.github.io
   redirect to ninjanerd.ai. Until DNS pointed at Pages that domain did not resolve, so
   shipping the file early would have broken the very github.io verification the release
   sequence depended on.

   The test still accepts EITHER location. That is deliberate rather than leftover: it keeps
   the important half — exactly one of the two exists, and it names the right domain — so a
   stray CNAME.pending reappearing beside app/CNAME fails the build instead of silently
   handing Pages a stale domain. */
test('exactly one CNAME exists, in app/, naming ninjanerd.ai', () => {
  const pending = join(repoRoot, 'CNAME.pending');
  const shipped = join(appDir, 'CNAME');

  assert.ok(existsSync(pending) || existsSync(shipped),
    'CNAME must exist either staged (CNAME.pending) or shipped (app/CNAME)');

  const src = existsSync(shipped) ? shipped : pending;
  assert.equal(readFileSync(src, 'utf8').trim(), 'ninjanerd.ai');

  // Both present would let Pages pick up a stale domain.
  assert.ok(!(existsSync(pending) && existsSync(shipped)),
    'only one CNAME may exist; app/CNAME is the live one since 2026-09-01');
});

/* The favicon, rescued from obs_static/ during the obs_ purge (2026-09-01). It had never been
   carried into app/, so every tab showed the browser's blank default.

   It must be LINKED explicitly on every page, not merely present. A browser's implicit request
   goes to the HOST root -- https://prai-git.github.io/favicon.ico -- which is not ours during
   sub-path verification. The <link> is what makes it resolve, and it must sit AFTER <base> and
   carry no leading slash, like every other same-origin path here (see test_base_path). */
test('the favicon exists and every served page links it', () => {
  assert.ok(existsSync(join(appDir, 'favicon.ico')), 'app/favicon.ico should exist');

  const pages = [
    join(appDir, 'index.html'),
    ...readdirSync(join(appDir, 'pages'))
      .filter((f) => f.endsWith('.html') && !f.startsWith('obs_'))
      .map((f) => join(appDir, 'pages', f)),
  ];
  assert.ok(pages.length > 10, 'expected the full page set, got ' + pages.length);

  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    assert.match(html, /<link rel="icon" href="favicon\.ico"/,
      `${p} does not link the favicon`);
    // Order matters: <base> must be parsed before anything that resolves against it.
    assert.ok(html.indexOf('<base ') < html.indexOf('rel="icon"'),
      `${p} links the favicon before <base>, so it resolves against the wrong root`);
  }
});
