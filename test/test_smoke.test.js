import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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

/* CNAME is staged OUTSIDE app/ until the custom-domain step (prompt 14).

   GitHub Pages reads app/CNAME on deploy and sets the custom domain, which makes
   <user>.github.io redirect to ninjanerd.ai. Until DNS is pointed at Pages that domain
   does not resolve, so shipping the file early breaks the very github.io verification
   the release sequence depends on. It lives at CNAME.pending and is moved into app/ as
   the last step before go-live. */
test('CNAME is staged outside app/ and names ninjanerd.ai', () => {
  const pending = join(repoRoot, 'CNAME.pending');
  const shipped = join(appDir, 'CNAME');

  assert.ok(existsSync(pending) || existsSync(shipped),
    'CNAME must exist either staged (CNAME.pending) or shipped (app/CNAME)');

  const src = existsSync(shipped) ? shipped : pending;
  assert.equal(readFileSync(src, 'utf8').trim(), 'ninjanerd.ai');

  // Before the domain step both must not be present, or Pages gets a stale copy.
  assert.ok(!(existsSync(pending) && existsSync(shipped)),
    'move CNAME.pending into app/ at the domain step; do not keep both');
});
