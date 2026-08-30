import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Verifies the static Privacy Policy and Terms pages mirror the legacy card layout,
// have dropped all payment/subscription references (the static site is free), and keep
// the protective + COPPA clauses that shield us from liability and cover children's data.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repoRoot, 'app');

function read(rel) {
  return readFileSync(join(appDir, rel), 'utf8');
}

// Visible copy only: strip HTML comments so our own "payment removed" build notes
// (which name PayPal etc. by design) don't trip the "must not mention" assertions.
function visible(rel) {
  return read(rel).replace(/<!--[\s\S]*?-->/g, '');
}

test('privacy page mirrors the legacy card shell', () => {
  const html = read('pages/privacy.html');
  assert.match(html, /col-lg-10/, 'privacy should use the centered col-lg-10 card');
  assert.match(html, /card-header bg-info/, 'privacy header should be bg-info');
  assert.match(html, /fa-shield-alt/, 'privacy header should keep the shield icon');
  assert.match(html, /javascript:history\.back\(\)/, 'privacy should keep a Back control');
});

test('privacy page drops payment and strengthens childrens privacy (COPPA)', () => {
  const html = visible('pages/privacy.html');
  // No payment collection / PayPal / billing anywhere in the visible copy.
  assert.ok(!/paypal/i.test(html), 'privacy must not mention PayPal');
  assert.ok(!/billing|credit card/i.test(html), 'privacy must not mention paid billing');
  assert.match(html, /do\s+<strong>not<\/strong>\s+collect payment/i, 'privacy should state we do not collect payment info');
  // COPPA protections.
  assert.match(html, /COPPA|Children's Online Privacy Protection Act/i, 'privacy should cite COPPA');
  assert.match(html, /parental consent/i, 'privacy should require verifiable parental consent');
});

test('terms page mirrors the legacy card shell', () => {
  const html = read('pages/terms.html');
  assert.match(html, /col-lg-10/, 'terms should use the centered col-lg-10 card');
  assert.match(html, /card-header bg-primary/, 'terms header should be bg-primary');
  assert.match(html, /fa-file-contract/, 'terms header should keep the file-contract icon');
  assert.match(html, /alert alert-info/, 'terms should keep the Important Legal Document note');
});

test('terms page drops payment and keeps the protective clauses', () => {
  const html = visible('pages/terms.html');
  assert.ok(!/paypal/i.test(html), 'terms must not mention PayPal');
  // A "no subscriptions" disclaimer is fine; a real subscription/refund/price is not.
  assert.ok(!/refund|\$15|auto-?renew/i.test(html), 'terms must not mention paid subscription/refunds');
  assert.match(html, /has\s+<strong>no paid features/i, 'terms should state the service is free with no paid features');
  // Protective clauses that shield us from liability.
  assert.match(html, /Disclaimer of Warranties/i, 'terms should keep a Disclaimer of Warranties');
  assert.match(html, /Limitation of Liability/i, 'terms should keep a Limitation of Liability');
  assert.match(html, /US\$100/, 'terms should cap aggregate liability for the free service');
  assert.match(html, /Indemnification/i, 'terms should keep an Indemnification clause');
  assert.match(html, /Severability/i, 'terms should keep a Severability clause');
  assert.match(html, /Entire Agreement/i, 'terms should keep an Entire Agreement clause');
  // AI/educational content disclaimer covers the AI-generated warning.
  assert.match(html, /AI-Generated Content Disclaimer|AI-generated/i, 'terms should keep an AI/educational content disclaimer');
});
