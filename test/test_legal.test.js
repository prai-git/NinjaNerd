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

/* THE SOURCE DOCUMENTS UNDER data/ (2026-09-02).

   CLAUDE.md calls data/privacy_policy.txt and data/terms_and_conditions.txt "the content
   source for the static legal pages", but nothing checked that they still said the same thing
   as the pages — and they had drifted badly. The terms source still described a $15.10 monthly
   PayPal subscription with a NON-REFUNDABLE policy, roughly a year after payments were dropped,
   while the served page correctly said the service is free. A stale source is worse than no
   source: it is the document someone reaches for when rewriting the page.

   These assertions are what stop the pair separating again. */

const source = (rel) => readFileSync(join(repoRoot, 'data', rel), 'utf8');
const lastUpdated = (text) => (text.match(/last updated:\s*([A-Za-z]+ \d{1,2}, \d{4})/i) || [])[1];

test('legal source documents carry no payment terms — the service is free', () => {
  for (const rel of ['terms_and_conditions.txt', 'privacy_policy.txt']) {
    const txt = source(rel);
    assert.ok(!/paypal/i.test(txt), `${rel} must not mention PayPal`);
    assert.ok(!/\$15|credit card|non-refundable|automatic renewal/i.test(txt),
      `${rel} must not describe a paid subscription`);
    // "no paid features" is a disclaimer and must survive; a real subscription must not.
    assert.ok(!/subscription fee|monthly subscription/i.test(txt),
      `${rel} must not describe subscription pricing`);
  }
  assert.match(source('terms_and_conditions.txt'), /NO PAID FEATURES, SUBSCRIPTIONS, OR PAYMENTS/,
    'terms source should state plainly that the service is free');
  assert.match(source('privacy_policy.txt'), /do NOT collect payment information/,
    'privacy source should state we collect no payment information');
});

test('legal documents and pages state the grade range the site actually serves', async () => {
  const { MAX_GRADE, MIN_GRADE } = await import('../app/js/flow.js');
  // The pages write it as an HTML entity; the sources as a plain hyphen.
  const html = `grades ${MIN_GRADE}&ndash;${MAX_GRADE}`;
  const txt = `grades ${MIN_GRADE}-${MAX_GRADE}`;
  for (const rel of ['pages/terms.html', 'pages/privacy.html']) {
    assert.ok(read(rel).includes(html), `${rel} must say "${html}"`);
    // A stale range left behind would contradict the current one on the same page.
    assert.ok(!/grades 1&ndash;[1-6]\b/.test(read(rel)), `${rel} has a stale grade range`);
  }
  for (const rel of ['terms_and_conditions.txt', 'privacy_policy.txt']) {
    assert.ok(source(rel).includes(txt), `data/${rel} must say "${txt}"`);
  }
});

test('each legal source and its page share one Last updated date', () => {
  for (const [rel, page] of [['terms_and_conditions.txt', 'pages/terms.html'],
                             ['privacy_policy.txt', 'pages/privacy.html']]) {
    const a = lastUpdated(source(rel));
    const b = lastUpdated(read(page));
    assert.ok(a, `data/${rel} must carry a Last updated date`);
    assert.ok(b, `${page} must carry a Last updated date`);
    // Editing one without the other is the drift this catches.
    assert.equal(a, b, `data/${rel} and ${page} disagree on Last updated`);
  }
});
