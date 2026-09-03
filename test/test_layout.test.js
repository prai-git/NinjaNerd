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
  assert.match(layout, /navbar-brand[^>]*href="index\.html"/, 'brand should link to index.html');
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

/* BACK / HOME BUTTON VISIBILITY (owner report, 2026-09-03).

   Every back and home button was `btn-outline-secondary` — Bootstrap renders that as #6c757d
   text on a TRANSPARENT background. That is fine inside a white card, but these buttons do not
   sit in one: they sit on the page's purple gradient body (#667eea → #764ba2), or on a
   bg-primary card header. Measured contrast of the label against its ground:

       gradient start  1.28:1        gradient end  1.36:1        card header  1.04:1

   which is why the owner reported them as invisible until hovered — hover fills the button
   solid and it appears from nowhere. `btn-light` puts a solid #f8f9fa block with a near-black
   label on the same grounds: 3.47:1 / 6.04:1 / 4.27:1 for the block, and 19.9:1 for the label.

   This is a DELIBERATE DIVERGENCE FROM LEGACY. obs_templates/topics.html used
   btn-outline-secondary on the same gradient (git show 104c466:obs_templates/topics.html), so
   the static site inherited the defect rather than introducing it. Fixed on owner instruction.

   btn-light was not invented for this: statistics, audit, account and contact_us already used
   it for the same button on a coloured header. The fix applies the existing convention. */
const ON_COLOURED_GROUND = [
  ['pages/topics.html', 'Home'],
  ['pages/subtopics.html', 'Back to Topics'],
  ['pages/explore.html', 'Back to Subtopics'],
  ['pages/learn.html', 'Back to Explore'],
  ['pages/practice.html', 'Back to Explore'],
  ['pages/games.html', 'Back to Topics'],
  ['pages/control-logic.html', 'Back to Topics'],
  ['pages/game.html', 'Back to Games'],
  ['pages/lesson.html', 'Back to Control Logic'],
  // These four were already correct and are the precedent the others now follow.
  ['pages/statistics.html', 'Back'],
  ['pages/audit.html', 'Back'],
  ['pages/account.html', 'Back'],
  ['pages/contact_us.html', 'Back'],
];

test('every back/home button on a coloured ground is btn-light, not a transparent outline', () => {
  for (const [page, label] of ON_COLOURED_GROUND) {
    const html = readFileSync(join(appDir, page), 'utf8');
    // The anchor that carries this label, including a label split across lines.
    const anchor = html.match(new RegExp(`<a[^>]*class="[^"]*btn[^"]*"[^>]*>\\s*(?:<i[^>]*></i>)?\\s*${label}\\s*</a>`))
      || html.match(new RegExp(`<a[^>]*class="([^"]*btn[^"]*)"[^>]*>[\\s\\S]{0,120}?${label}`));
    assert.ok(anchor, `${page}: could not find the "${label}" button`);
    const cls = (anchor[0].match(/class="([^"]*)"/) || [])[1] || '';
    assert.match(cls, /\bbtn-light\b/,
      `${page}: "${label}" must be btn-light — on this page's ground a transparent outline `
      + 'button is invisible until hovered');
    assert.doesNotMatch(cls, /btn-outline-secondary/,
      `${page}: "${label}" is grey-on-colour, roughly 1.3:1 contrast`);
  }
});

/* The counterweight. btn-outline-secondary is CORRECT inside a white card (4.69:1), so this is
   not a blanket ban on the class — only on using it where the ground is coloured. */
test('btn-outline-secondary still used inside white cards, where it reads fine', () => {
  const keep = [
    ['pages/signup.html', 'Back to Login'],
    ['pages/learn.html', 'Previous'],
    ['pages/lesson.html', 'Reset'],
  ];
  for (const [page, label] of keep) {
    const html = readFileSync(join(appDir, page), 'utf8');
    assert.match(html, /btn-outline-secondary/,
      `${page}: the "${label}" control sits on white and does not need changing`);
  }
});
