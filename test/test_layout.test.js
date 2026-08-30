import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repoRoot, 'app');

const PAGES = [
  'index.html',
  'pages/login.html',
  'pages/signup.html',
  'pages/privacy.html',
  'pages/terms.html',
];

function read(rel) {
  return readFileSync(join(appDir, rel), 'utf8');
}

test('shared shell scripts exist', () => {
  for (const f of ['assets/js/layout.js', 'assets/js/auth-state.js', 'assets/js/toast.js']) {
    assert.ok(existsSync(join(appDir, f)), `${f} should exist`);
  }
});

for (const page of PAGES) {
  test(`${page} has shared header/footer markers`, () => {
    const html = read(page);
    assert.match(html, /id="nn-header"/, `${page} missing nn-header marker`);
    assert.match(html, /id="nn-footer"/, `${page} missing nn-footer marker`);
    assert.match(html, /assets\/js\/layout\.js/, `${page} missing layout.js include`);
  });

  test(`${page} has a valid <title> and lang attribute`, () => {
    const html = read(page);
    assert.match(html, /<html[^>]*\blang="en"/, `${page} missing lang="en"`);
    const title = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(title && title[1].trim().length > 0, `${page} missing non-empty <title>`);
    assert.match(title[1], /NinjaNerd/, `${page} title should mention NinjaNerd`);
  });
}

test('nav brand links back to the landing (index.html)', () => {
  // Mirroring the legacy base.html nav: no About/Grades tabs — the brand itself
  // links to the landing (which IS the About page). Auth actions sit on the right.
  const layout = readFileSync(join(appDir, 'assets/js/layout.js'), 'utf8');
  assert.match(layout, /navbar-brand[^>]*href="\/index\.html"/, 'brand should link to /index.html');
  assert.ok(!/nav-link[^>]*>About</.test(layout), 'nav should not contain an About tab');
  assert.ok(!/>Grades</.test(layout), 'nav should not contain a Grades tab');
});

test('privacy page uses the legacy card layout with expected heading', () => {
  // Mirrors obs_templates/payment/privacy_policy.html: centered col-lg-10 card with a
  // bg-info header whose <h1> carries the shield icon before the title text.
  const html = read('pages/privacy.html');
  assert.match(html, /card-header bg-info/, 'privacy header should be bg-info');
  assert.match(html, /<h1[^>]*>.*Privacy Policy<\/h1>/, 'privacy h1 should read "Privacy Policy"');
  assert.ok(html.length > 1000, 'privacy page should have substantial content');
});

test('terms page uses the legacy card layout with expected heading', () => {
  // Mirrors obs_templates/payment/terms_and_conditions.html: centered col-lg-10 card with a
  // bg-primary header (file-contract icon) and the alert-info "Important Legal Document" note.
  const html = read('pages/terms.html');
  assert.match(html, /card-header bg-primary/, 'terms header should be bg-primary');
  assert.match(html, /<h1[^>]*>.*Terms and Conditions<\/h1>/, 'terms h1 should read "Terms and Conditions"');
  assert.ok(html.length > 1000, 'terms page should have substantial content');
});

test('login and signup pages have their forms', () => {
  assert.match(read('pages/login.html'), /id="nn-login-form"/);
  assert.match(read('pages/signup.html'), /id="nn-signup-form"/);
});
