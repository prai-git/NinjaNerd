import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

/* ---------------------------------------------------------------------------------------
   Naming, ownership and licensing (owner decisions, 2026-09-04).

   Five spellings of the name are in live use — NinjaNerd in body copy, NinjaNerd.ai in the
   opening sentence, NINJANERD in the all-caps liability clause, NINJANERD.AI in the page
   titles and the footer copyright, and ninjanerd.ai as the domain. Before the naming clause,
   exactly ONE of those was a defined term, so the clause that caps liability named something
   neither document defined.

   The second half of this is the licensing split. The repository is MIT-licensed and the
   compiled questions live inside it, so without an explicit carve-out the Terms' "may not
   copy" clause contradicts the LICENSE the platform is published under — and a contradiction
   between two published documents favours whoever is copying. */

/* The five spellings actually in use. The two-word "Ninja Nerd" is deliberately NOT listed
   (owner, 2026-09-04): it appears nowhere on the site, and listing it would have put a
   spelling on a live page that has never been used. The clause's "in any capitalisation,
   spacing or styling" already covers it — spacing is exactly what separates the two forms.
   The walk below still FAILS if one appears, so adopting a new spelling stays a decision
   rather than a drift. */
const NAME_FORMS = ['NinjaNerd', 'NinjaNerd.ai', 'NINJANERD', 'NINJANERD.AI', 'ninjanerd.ai'];

const LEGAL_FILES = [
  ['data/terms_and_conditions.txt', () => source('terms_and_conditions.txt')],
  ['data/privacy_policy.txt', () => source('privacy_policy.txt')],
  ['pages/terms.html', () => read('pages/terms.html')],
  ['pages/privacy.html', () => read('pages/privacy.html')],
];

test('both documents define every form of the name that is actually in use', () => {
  for (const [label, get] of LEGAL_FILES) {
    // The HTML wraps some forms across a line break, so compare on collapsed whitespace.
    const text = get().replace(/\s+/g, ' ');
    for (const form of NAME_FORMS) {
      assert.ok(text.includes(form), `${label} must list "${form}" in its naming clause`);
    }
    assert.match(text, /in any capitalisation, spacing or styling/,
      `${label} must cover styling variants it does not list one by one`);
    assert.match(text, /one and the same service/, `${label} must say the names are one service`);
  }
});

/* Walk every served file and fail on a SEVENTH spelling. Identifiers that merely contain the
   name are removed first — the Firebase project id, the emulator id, the npm package name and
   the contact mailbox are not ways the service presents itself, and folding them into the
   legal definition would be wrong rather than thorough. */
test('no spelling of the name escapes the definition', () => {
  const IDENTIFIERS = /ninjanerd(?:onpi@[\w.]+|-32030|-emulator|-static)/gi;
  const found = new Map();

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(html|js|css|json|txt|md)$/.test(entry)) continue;
      const text = readFileSync(full, 'utf8').replace(IDENTIFIERS, '');
      for (const m of text.matchAll(/ninja ?nerd(?:\.ai)?/gi)) {
        if (!found.has(m[0])) found.set(m[0], full.slice(repoRoot.length + 1));
      }
    }
  };
  walk(appDir);

  const uncovered = [...found].filter(([form]) => !NAME_FORMS.includes(form));
  assert.deepEqual(uncovered, [],
    'a spelling of the name is served that neither legal document defines — add it to '
    + 'NAME_FORMS here and to the naming clause in all four legal files');
});

test('the Terms name an identifiable operator, not just the brand', () => {
  /* "operated by NinjaNerd" identifies nobody: there is no entity of that name, so who the
     liability cap protects and who the indemnity runs to was left to inference. Pointing at
     the owner of the domain and the repository identifies exactly one person, and the
     repository's LICENSE names them — the chain is public without the site carrying it. */
  for (const text of [source('terms_and_conditions.txt').replace(/\s+/g, ' '),
    read('pages/terms.html').replace(/\s+/g, ' ')]) {
    assert.match(text,
      /operated by the owner of the domain ninjanerd\.ai and of the public source repository named NinjaNerd/,
      'the Terms must identify the operator by the assets they own');
  }
});

test('the Terms and the LICENSE both reserve everything, and neither licenses the name', () => {
  /* Owner decision, 2026-09-04: the repository is ALL RIGHTS RESERVED. It had carried MIT since
     the 2025 Raspberry Pi build, which meant the 4,175 compiled questions under app/content/
     were MIT-licensed while Terms section 7 said "may not copy" — and between two published
     documents the contradiction favours whoever is copying.

     A code/content split was drafted first and rejected, for a reason specific to this repo: the
     Control Logic and Electrical Design lessons are code by location and teaching material by
     purpose, so any boundary drawn between them needs redrawing every time a topic is added.
     Reserving everything removes the boundary rather than maintaining it. */
  const licence = readFileSync(join(repoRoot, 'LICENSE'), 'utf8');
  assert.match(licence, /All rights reserved\./);
  assert.match(licence, /Publication is not a licence/,
    'the LICENSE must say that a public repo is not a grant');
  assert.match(licence, /No permission is granted to copy/);
  assert.match(licence, /grants\s+any right to use them/,
    'the LICENSE must say it does not license the name');
  // First published 2025 on the Raspberry Pi build; authored continuously since.
  assert.match(licence, /Copyright \(c\) 2025-2026/, 'the range must keep the 2025 origin');
  /* An MIT grant already made cannot be withdrawn. Saying so is not a formality — it is the
     honest statement of what this change does and does not do, and it stops a later reader
     concluding the earlier grant was revoked. */
  assert.match(licence, /Until 4 September 2026 this repository carried the MIT License/);
  assert.match(licence, /cannot be withdrawn from copies already made/);
  // No stray MIT grant text left behind: the permission paragraph must be gone.
  assert.ok(!/Permission is hereby granted, free of charge/.test(licence),
    'the MIT grant paragraph must not survive alongside an all-rights-reserved notice');

  for (const text of [source('terms_and_conditions.txt').replace(/\s+/g, ' '),
    read('pages/terms.html').replace(/\s+/g, ' ')]) {
    assert.match(text, /may not copy, distribute, or create derivative works/,
      'the Terms must reserve the Service');
    assert.match(text, /That publication is not a license/,
      'the Terms must say publishing the repository is not a grant');
    assert.match(text, /are marks used in connection with this Service/,
      'the Terms must claim the name, domain and logo as marks');
    // Unregistered rights only: a registration symbol here would be a false claim.
    assert.ok(!text.includes('\u00ae'), 'the Terms must not use the registered-trademark symbol');
  }

  // Nothing anywhere may still advertise the repository as MIT-licensed.
  for (const [label, text] of [['README.md', readFileSync(join(repoRoot, 'README.md'), 'utf8')],
    ['data/terms_and_conditions.txt', source('terms_and_conditions.txt')],
    ['pages/terms.html', read('pages/terms.html')]]) {
    assert.ok(!/MIT Licen[cs]e/.test(text.replace(/carried the MIT License/g, '')),
      `${label} still offers the repository under the MIT License`);
  }
});

test('the nav brand uses the trademark symbol, not the copyright symbol', () => {
  /* A name is not a copyrightable work, so NINJANERD.AI&copy; was the wrong symbol. The
     footer's "&copy; <year> NINJANERD.AI. All rights reserved." is correct and stays — that
     one covers the site's content rather than the name. */
  const layout = readFileSync(join(appDir, 'assets/js/layout.js'), 'utf8');
  assert.match(layout, /NINJANERD\.AI<sup>&trade;<\/sup>/, 'the nav brand should carry &trade;');
  assert.doesNotMatch(layout, /NINJANERD\.AI<sup>&copy;<\/sup>/, 'a name cannot be copyrighted');
  assert.match(layout, /&copy; ' \+ year \+ ' NINJANERD\.AI\. All rights reserved\./,
    'the footer copyright line is correct and must stay');
  assert.ok(!layout.includes('&reg;'), 'no registration exists, so &reg; would be a false claim');
});
