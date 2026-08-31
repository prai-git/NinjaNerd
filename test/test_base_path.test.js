/* Base-path portability (prompt 00).

   The site is served from a SUB-PATH on GitHub Pages (https://prai-git.github.io/NinjaNerd/)
   and from the ROOT once the custom domain is attached (https://ninjanerd.ai/). Root-absolute
   paths like "/assets/css/site.css" work only at the root: under the sub-path the browser
   resolves them one level too high and every one 404s, which deploys green and renders an
   unstyled, unnavigable page.

   The fix is a <base> tag per page plus paths written WITHOUT a leading slash, so the same
   files resolve correctly at both mount points with no build step and nothing to undo at
   go-live. These tests are the guard: a single absolute path creeping back in is a 404 that
   only shows up in production, so it fails the suite instead. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'app');

/* obs_ files are retired and never extended (see CLAUDE.md); they are excluded here and are
   removed wholesale in the obs_ purge. app/pages/obs_dashboard.html is the only one under
   app/, it is unlinked, and it keeps its absolute paths. */
const isRetired = (name) => name.startsWith('obs_');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (isRetired(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const servedPages = () => [
  join(appRoot, 'index.html'),
  ...readdirSync(join(appRoot, 'pages'))
    .filter((f) => f.endsWith('.html') && !isRetired(f))
    .map((f) => join(appRoot, 'pages', f)),
];

test('every served page declares a <base> matching its depth', () => {
  for (const file of servedPages()) {
    const html = readFileSync(file, 'utf8');
    const rel = file.replace(appRoot + '/', '');
    const m = html.match(/<base\s+href="([^"]+)"/);
    assert.ok(m, `${rel}: no <base> tag — every path on the page would resolve from the host root`);
    // index.html sits at the published root; everything in pages/ is one level down.
    assert.equal(m[1], rel.includes('/') ? '../' : './', `${rel}: wrong <base> href`);
  }
});

test('<base> precedes every URL-bearing element in the head', () => {
  // A <link>/<script>/<img> placed before <base> resolves against the WRONG root, so the
  // ordering is load-bearing, not cosmetic.
  for (const file of servedPages()) {
    const html = readFileSync(file, 'utf8');
    const rel = file.replace(appRoot + '/', '');
    const base = html.indexOf('<base');
    const firstUrlEl = html.search(/<(link|script|img|a)\b/);
    assert.ok(base < firstUrlEl,
      `${rel}: <base> must come before the first <link>/<script>/<img>/<a>`);
  }
});

test('no root-absolute path survives anywhere under app/', () => {
  // The whole point of the guard. Covers HTML attributes and the paths JS builds at runtime
  // (navigation targets, the content-JSON fetch base, injected game <script>/<link> tags).
  const offenders = [];
  for (const file of walk(appRoot)) {
    if (!['.html', '.js'].includes(extname(file))) continue;
    const src = readFileSync(file, 'utf8');
    const rel = file.replace(appRoot + '/', '');
    src.split('\n').forEach((line, i) => {
      // href="/x" / src="/x", and quoted site paths in JS ('/pages/...', `/content/...`).
      // Protocol-relative "//host" is left alone; there are none, but it is not a site path.
      for (const re of [/\b(?:href|src)="\/(?!\/)/g,
                        /['"`]\/(?:pages|content|assets|js|i18n|static|index)\b/g]) {
        if (re.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    `root-absolute paths 404 under the /NinjaNerd/ sub-path:\n${offenders.join('\n')}`);
});

test('every site path referenced from a served page exists on disk', () => {
  // A relative path that resolves cleanly but points at nothing is the other half of the
  // failure mode, and it is equally invisible until someone clicks it.
  const missing = [];
  for (const file of servedPages()) {
    const html = readFileSync(file, 'utf8');
    const rel = file.replace(appRoot + '/', '');
    for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const p = m[1];
      // Skip anything that is not a path into the served tree: off-site assets (CDN),
      // in-page anchors, and non-fetching schemes (javascript:, data:, mailto:).
      if (/^(https?:)?\/\//.test(p) || p.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(p)) continue;
      if (p === './' || p === '../') continue;
      const clean = p.split(/[?#]/)[0];
      if (!clean) continue;
      if (!existsSync(join(appRoot, clean))) missing.push(`${rel} -> ${p}`);
    }
  }
  // Profile targets (account/statistics/contact_us/audit) are deliberately not built yet.
  const unbuilt = /(account|statistics|contact_us|audit)\.html/;
  const real = missing.filter((x) => !unbuilt.test(x));
  assert.deepEqual(real, [], `referenced files do not exist:\n${real.join('\n')}`);
});

test('game internals reference assets without a leading slash', () => {
  // These are the legacy game sources; they hardcoded /static/games/... and are the reason
  // the tree had to be copied under app/ in the first place.
  const games = join(appRoot, 'static/games');
  for (const file of walk(games).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /['"`]\/static\/games\//,
      `${file.replace(appRoot + '/', '')}: absolute asset path would 404 under the sub-path`);
  }
});
