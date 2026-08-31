/* Landing-page fidelity test: the landing (app/index.html) must mirror the legacy
   About page (obs_templates/about.html) — a left Select-Grade + Profile sidebar and a
   right welcome card with logo + three feature icons — with the agreed static
   adaptations (grades 1-6, payment dropped, Audit admin-only, truthful copy). */
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

test('Select Grade lists grades 1-6 only (scope), linking to topics', () => {
  for (let g = 1; g <= 6; g++) {
    assert.ok(html.includes(`pages/topics.html?grade=${g}`), `grade ${g} link`);
    assert.ok(html.includes(`>Grade ${g}</a>`), `grade ${g} label`);
  }
  assert.ok(!html.includes('Grade 7') && !html.includes('Grade 8'), 'no grades 7-8');
});

test('Profile card: Account/Statistics/Contact Us always; Audit admin-only; no Payment', () => {
  assert.ok(html.includes('pages/account.html'), 'Account link');
  assert.ok(html.includes('pages/statistics.html'), 'Statistics link');
  assert.ok(html.includes('pages/contact_us.html'), 'Contact Us link');
  // Audit present but hidden until the admin (admin@gmail.com) is signed in.
  assert.match(html, /id="nn-audit-link"[^>]*style="display:none;"/, 'Audit link hidden by default');
  assert.ok(html.includes("user.username === 'admin@gmail.com'"), 'admin gate for Audit');
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
