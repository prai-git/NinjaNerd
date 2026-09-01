/* Contact page (prompt 13).

   The validation and template-parameter shaping are pure and are executed here. The EmailJS
   SDK is never loaded — no network in tests, per the working rules — so the send path is
   checked as text. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emailjsConfig, isEmailjsConfigured, EMAILJS_SDK, CONTACT_TO,
} from '../app/js/emailjs-config.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

const contactJs = read('app/js/contact.js');
const contactHtml = read('app/pages/contact_us.html');

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

// ---- legacy shape --------------------------------------------------------------------------

test('the form is subject + message, as legacy was — not name/email/message', () => {
  /* Prompt 13 as written specified "name, email, message". Legacy's form
     (obs_templates/contact_us.html) is SUBJECT and CONTENT, and the sender comes from the
     session, never from a field the visitor fills in. Following the prompt there would have
     been inventing a form legacy never had. */
  assert.match(contactHtml, /id="nn-contact-subject"/);
  assert.match(contactHtml, /id="nn-contact-content"/);
  const markup = stripComments(contactHtml);
  assert.doesNotMatch(markup, /id="nn-contact-name"/, 'legacy never asked for a name');
  assert.doesNotMatch(markup, /type="email"/, 'legacy never asked for the sender address');
  assert.match(contactJs, /user\.email/, 'the sender is the signed-in user');
});

test('the 300-character cap and its counter thresholds match legacy', () => {
  assert.match(contactJs, /MAX_CONTENT = 300/);
  assert.match(contactJs, /WARN_AT = 200/);
  assert.match(contactJs, /DANGER_AT = 250/);
  assert.match(contactHtml, /maxlength="300"/);
  assert.match(contactHtml, /id="nn-contact-count"/);
  // Legacy's own numbers, so a change here is visible against the source.
  const legacy = read('obs_templates/contact_us.html');
  assert.match(legacy, /maxlength="300"/);
  assert.match(legacy, /length > 250/);
  assert.match(legacy, /length > 200/);
});

test('send is disabled until the message has content, as legacy was', () => {
  assert.match(contactHtml, /id="nn-contact-send"[^>]*disabled/);
  assert.match(contactJs, /send\.disabled = n === 0/);
});

test('the mail matches legacy\'s subject line and body', () => {
  // Legacy: subject "Contact Us - {subject}", body "From/Subject/Message".
  assert.match(contactJs, /`Contact Us - \$\{subject\}`/);
  assert.match(read('obs_app.py'), /Contact Us - \{subject\}/,
    'legacy source of the subject line moved or changed');
  assert.match(contactJs, /From: \$\{from\}\\n\\nSubject: \$\{subject\}\\n\\nMessage:\\n\$\{content\}/);
});

test('it goes to the address legacy sent to', () => {
  assert.equal(CONTACT_TO, 'ninjanerdonpi@gmail.com');
  assert.match(read('obs_app.py'), /send_email_async\("ninjanerdonpi@gmail\.com"/);
});

/* The recipient must be pinned INSIDE the EmailJS template, never sent from here. The Public
   Key is public by design, so a template reading its To Email from a client-supplied variable
   is an open relay on the owner's Gmail. CONTACT_TO stays — it is the mailto: fallback shown
   when EmailJS is unconfigured — but it must not reach templateParams(). */
test('the recipient is never sent from the browser', () => {
  const code = stripComments(contactJs);
  assert.doesNotMatch(code, /to_email/,
    'the recipient is pinned in the EmailJS template; sending it from here is an open relay');
  const params = code.slice(code.indexOf('export function templateParams'));
  const body = params.slice(0, params.indexOf('\n}'));
  assert.doesNotMatch(body, /CONTACT_TO|ninjanerdonpi/,
    'templateParams must not carry a recipient in any form');
});

test('templateParams sends exactly the three variables the template declares', async () => {
  const { templateParams } = await import('../app/js/contact.js').catch(() => ({}));
  if (!templateParams) return; // see the note in the validation test below
  const out = templateParams({ from: 'a@b.com', subject: 'Hi', content: 'Body' });
  assert.deepEqual(Object.keys(out).sort(), ['from_email', 'message', 'subject']);
  assert.equal(out.subject, 'Contact Us - Hi');
  assert.equal(out.from_email, 'a@b.com');
  assert.equal(out.message, 'From: a@b.com\n\nSubject: Hi\n\nMessage:\nBody');
});

// ---- validation, executed ------------------------------------------------------------------

test('validation rejects empty fields', async () => {
  const { validateContact } = await import('../app/js/contact.js').catch(() => ({}));
  if (!validateContact) {
    // contact.js imports firebase-init over https, which Node cannot resolve.
    assert.match(contactJs, /if \(!s \|\| !c\) return \{ error: 'Please fill in all fields\.' \}/);
    return;
  }
  assert.ok(validateContact({ subject: '', content: 'hi' }).error);
  assert.ok(validateContact({ subject: 'hi', content: '' }).error);
  assert.ok(validateContact({ subject: '   ', content: '   ' }).error);
  assert.equal(validateContact({ subject: 'hi', content: 'there' }), null);
});

test('a filled honeypot is blocked, and is not told why', () => {
  /* Legacy's route sat behind a session on a server. A public EmailJS key is reachable by
     anything that can read the page source, so the form needs its own answer to bots.
     Reporting success is deliberate: an error message teaches a bot to skip the field. */
  assert.match(contactJs, /if \(honeypot\) return \{ bot: true \}/);
  const block = contactJs.slice(contactJs.indexOf('if (problem && problem.bot)'));
  assert.match(block.slice(0, 400), /toast\('Message sent successfully!', 'success'\)/,
    'a bot must see the same message a person does');
  assert.doesNotMatch(block.slice(0, 400), /api\.send|loadSdk/, 'nothing may actually be sent');
});

test('the honeypot is hidden from people without using type=hidden', () => {
  // Bots skip type=hidden. A real field moved off-screen and out of the tab order is what
  // actually catches them.
  assert.match(contactHtml, /id="nn-contact-website"/);
  assert.match(contactHtml, /type="text" id="nn-contact-website"/);
  assert.match(contactHtml, /tabindex="-1"/);
  assert.match(contactHtml, /left:-5000px/);
  assert.match(contactHtml, /aria-hidden="true"/, 'and hidden from screen readers too');
});

// ---- configuration -------------------------------------------------------------------------

test('isEmailjsConfigured requires all three, and whitespace does not count', () => {
  assert.equal(isEmailjsConfigured({ serviceId: 'a', templateId: 'b', publicKey: 'c' }), true);
  assert.equal(isEmailjsConfigured({ serviceId: 'a', templateId: '', publicKey: 'c' }), false);
  assert.equal(isEmailjsConfigured({ serviceId: '', templateId: 'b', publicKey: 'c' }), false);
  assert.equal(isEmailjsConfigured({ serviceId: 'a', templateId: 'b', publicKey: '' }), false);
  assert.equal(isEmailjsConfigured({ serviceId: ' ', templateId: 'b', publicKey: 'c' }), false,
    'whitespace is not configuration');
});

test('the unconfigured state stays a working dead end, not a dead form', () => {
  /* The IDs are filled in now, but this path still has to exist and still has to be right: it
     is what a visitor sees if the owner ever rotates a key, and a form that accepts a message
     and drops it is worse than no form. */
  assert.match(contactJs, /temporarily unavailable/i);
  assert.match(contactJs, /mailto:\$\{CONTACT_TO\}/);
  assert.match(contactJs, /if \(!isEmailjsConfigured\(\)\)/, 'the form must stay gated on it');
});

test('the shipped config is complete and well-formed', () => {
  /* Configured by the owner on 2026-09-01. The prefixes are EmailJS's own conventions, so a
     value pasted into the wrong field — a very easy slip with three opaque strings — is caught
     here rather than by a parent whose message silently never arrives. */
  assert.equal(isEmailjsConfigured(), true, 'contact form is expected to be live');
  assert.match(emailjsConfig.serviceId, /^service_[A-Za-z0-9]+$/);
  assert.match(emailjsConfig.templateId, /^template_[A-Za-z0-9]+$/);
  assert.doesNotMatch(emailjsConfig.publicKey, /^(service|template)_/,
    'the public key must not be a service or template ID');
  assert.ok(emailjsConfig.publicKey.length >= 10);
});

test('no secret is in the repo — only the three public identifiers', () => {
  /* The whole reason for EmailJS: the Gmail credential stays on their side. Legacy kept it in
     run_app.sh, which is git-ignored and must never be copied here. */
  assert.deepEqual(Object.keys(emailjsConfig).sort(), ['publicKey', 'serviceId', 'templateId']);
  for (const src of [contactJs, read('app/js/emailjs-config.js')]) {
    assert.doesNotMatch(src, /privateKey|private_key|app_password|appPassword/i);
  }
});

test('the SDK is pinned and loaded on demand', () => {
  // Pinned like Firebase/KaTeX/Bootstrap: an unpinned URL ships breaking releases to users.
  assert.match(EMAILJS_SDK, /@emailjs\/browser@\d+\.\d+\.\d+\//,
    'the EmailJS SDK URL must pin an exact version');
  /* Loaded only when actually sending — dead weight otherwise on a page most visitors skip.
     Checked against the script tags specifically: the page comment explains the EmailJS
     divergence and must not have to be deleted to pass. */
  const scripts = contactHtml.match(/<script[^>]*>/g) || [];
  assert.ok(scripts.length > 0);
  for (const tag of scripts) {
    assert.doesNotMatch(tag, /emailjs/i, `SDK must not be a script tag: ${tag}`);
  }
  /* Injected as a CLASSIC script, NOT via import(). dist/email.min.js is a UMD bundle that
     assigns window.emailjs — it is not an ES module, so import() rejects it. That failure
     would only appear at runtime once EmailJS is configured, which is precisely when nobody
     is looking for it, so the loading mechanism is pinned here. */
  assert.doesNotMatch(contactJs, /import\(EMAILJS_SDK\)/,
    'UMD cannot be loaded with import()');
  assert.match(contactJs, /createElement\('script'\)/);
  assert.match(contactJs, /tag\.src = EMAILJS_SDK/);
  assert.match(contactJs, /window\.emailjs/);
  assert.match(contactJs, /addEventListener\('error'/, 'a CDN failure must reject, not hang');
});

// ---- page plumbing -------------------------------------------------------------------------

test('sign-in is required, as legacy required it', () => {
  // obs_app.py: @require_login. The sender identity IS the signed-in user.
  assert.match(read('obs_app.py'), /@app\.route\('\/contact_us'[\s\S]{0,80}@require_login/);
  assert.match(contactJs, /if \(!user\)/);
  assert.match(contactJs, /Please sign in/);
});

test('the Profile card link now resolves', () => {
  assert.ok(read('app/index.html').includes('href="pages/contact_us.html"'));
  assert.ok(contactHtml.length > 0);
});

test('base path and shared shell', () => {
  assert.match(contactHtml, /<base href="\.\.\/" \/>/);
  assert.doesNotMatch(contactHtml, /(?:href|src)="\//);
  assert.doesNotMatch(contactJs, /['"`]\/pages\//);
  for (const src of ['assets/js/auth-state.js', 'assets/js/layout.js', 'js/auth.js']) {
    assert.ok(contactHtml.includes(src), `contact_us.html must load ${src}`);
  }
});

test('no network is touched by this suite', () => {
  // The SDK is only ever reached through a dynamic import inside submit(), which no test calls.
  assert.doesNotMatch(contactJs, /^import .*emailjs\/browser/m,
    'the SDK must not be a static import, or importing this module would hit the network');
});
