/* Landing-page fidelity test: the landing (app/index.html) must mirror the legacy
   About page (obs_templates/about.html) — a left Select-Grade + Profile sidebar and a
   right welcome card with logo + three feature icons — with the agreed static
   adaptations (grades 1-7, payment dropped, Audit admin-only, truthful copy). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repoRoot, 'app');
const html = readFileSync(join(appDir, 'index.html'), 'utf8');

test('landing mirrors the two-column About layout', () => {
  assert.match(html, /col-lg-3 col-md-4/, 'left sidebar column');
  assert.match(html, /col-lg-9 col-md-8/, 'right main column');
  assert.match(html, /<i class="fas fa-layer-group me-2"><\/i>Select Grade/, 'Select Grade card');
  assert.match(html, /<i class="fas fa-user me-2"><\/i>Profile/, 'Profile card');
});

test('Select Grade lists grades 1-7 only (scope), linking to topics', () => {
  for (let g = 1; g <= 7; g++) {
    assert.ok(html.includes(`pages/topics.html?grade=${g}`), `grade ${g} link`);
    assert.ok(html.includes(`>Grade ${g}</a>`), `grade ${g} label`);
  }
  // Legacy went to grade 8; the picker is the one place the project scope is visible to a
  // child, so it must stop exactly where MAX_GRADE does.
  assert.ok(!html.includes('Grade 8'), 'no grade 8');
});

test('Profile card: Account/Statistics/Contact Us always; Audit admin-only; no Payment', () => {
  assert.ok(html.includes('pages/account.html'), 'Account link');
  assert.ok(html.includes('pages/statistics.html'), 'Statistics link');
  assert.ok(html.includes('pages/contact_us.html'), 'Contact Us link');
  // Audit present but hidden until an admin is signed in.
  assert.match(html, /id="nn-audit-link"[^>]*style="display:none;"/, 'Audit link hidden by default');
  /* The gate reads is_admin from the user's profile document, NOT a hardcoded address.
     Legacy compared the username to 'admin@gmail.com' (obs_app.py is_admin_user); since our
     admin is ninjanerdonpi@gmail.com and the rules already carry an is_admin flag, matching a
     string literal would mean two sources of truth for who is admin. Assert the literal is
     gone, so it cannot creep back. */
  assert.ok(html.includes('user.is_admin'), 'Audit gate should read is_admin from the profile');
  /* Forbid the COMPARISON, not the string: the comments deliberately record what legacy did
     (`is_admin_user(username) == 'admin@gmail.com'`) and that provenance is worth keeping. */
  assert.doesNotMatch(html, /===\s*['"]admin@gmail\.com['"]/,
    'the admin check must not compare against a hardcoded address');
  // Firebase resolves auth asynchronously, so the gate must re-run when the real state lands.
  assert.ok(html.includes('nn-auth-changed'), 'Audit gate should re-sync on the auth-changed event');
  // Payment is dropped entirely — no payment link/target on the page.
  assert.ok(!/href="[^"]*payment[^"]*"/i.test(html), 'no payment link');
});

test('welcome card: logo, welcome title, three feature icons; no false adaptivity/dropped subjects', () => {
  assert.ok(html.includes('assets/img/logo.png'), 'logo image');
  assert.ok(existsSync(join(appDir, 'assets/img/logo.png')), 'logo file present in served tree');
  assert.match(html, /Welcome to NINJANERD\.AI/, 'welcome title');
  // Three legacy feature icons retained.
  assert.match(html, /fa-brain fa-3x text-primary/, 'feature 1 icon');
  assert.match(html, /fa-chart-line fa-3x text-success/, 'feature 2 icon');
  assert.match(html, /fa-users fa-3x text-info/, 'feature 3 icon');
  assert.ok(html.includes('Progress Tracking') && html.includes('Multi-User Support'), 'feature titles');
  // False claims removed: no LLM-style "Adaptive Learning"; no dropped subjects.
  assert.ok(!/Adaptive Learning/i.test(html), 'no Adaptive Learning claim');
  assert.ok(!/history|geography|puzzles|stories/i.test(html), 'no dropped subjects in copy');
});
