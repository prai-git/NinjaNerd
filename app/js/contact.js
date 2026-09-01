/* Contact page (prompt 13) — mirrors legacy obs_app.py:1009 + obs_templates/contact_us.html.

   Legacy behaviour, kept:
     - SUBJECT + MESSAGE only. The sender is never asked for; it is the signed-in user, exactly
       as legacy read it from the session ("From: {username}"). The page therefore requires
       sign-in, as legacy did with @require_login.
     - Message capped at 300 characters, with a live counter that turns orange past 200 and red
       past 250.
     - Send disabled until the message has content.
     - Both fields required; mail goes to ninjanerdonpi@gmail.com; the subject line is
       "Contact Us - {subject}" and the body carries From/Subject/Message.

   Forced divergences, flagged per the working rules:
     - EmailJS replaces the server-side Gmail gateway (gw/emailgw). There is no server. The
       Gmail credential lives inside EmailJS and never reaches this repo or the browser.
     - Legacy rate-limited the route to 5/minute; there is no server to enforce that, so
       EmailJS's own per-key quota is what remains (see emailjs-config.js).
     - A honeypot is added. Legacy's route was session-gated behind a server; a public EmailJS
       key is reachable by anything that can read the page source. */

import {
  emailjsConfig, isEmailjsConfigured, EMAILJS_SDK, CONTACT_TO,
} from './emailjs-config.js';
import { auth } from './firebase-init.js';

const MAX_CONTENT = 300; // legacy: "Message content must be 300 characters or less"
const WARN_AT = 200;     // legacy: orange past 200
const DANGER_AT = 250;   // legacy: red past 250

const el = (id) => document.getElementById(id);
const toast = (msg, type) => window.NNToast && window.NNToast.show(msg, type);

let sdk = null;

/* Validation, extracted so it can be unit-tested without the SDK or a DOM. Returns null when
   the submission is fine, otherwise the message to show. */
export function validateContact({ subject, content, honeypot }) {
  // A filled honeypot is a bot. Reported as null (caller silently pretends success) rather
  // than as an error, so a bot learns nothing about why it failed.
  if (honeypot) return { bot: true };
  const s = String(subject || '').trim();
  const c = String(content || '').trim();
  // Legacy: "Please fill in all fields".
  if (!s || !c) return { error: 'Please fill in all fields.' };
  if (c.length > MAX_CONTENT) {
    return { error: `Message content must be ${MAX_CONTENT} characters or less.` };
  }
  return null;
}

/* The template parameters. Kept as a pure function so a test can assert the shape without
   touching the network, and so the field names stay in one place — they must match the
   variables in the EmailJS template (doc/emailjs-setup.md).

   THE RECIPIENT IS NOT ONE OF THEM, deliberately. It is hardcoded in the EmailJS template
   instead. The public key is public by design, so a template whose To Email reads from a
   client-supplied variable lets anyone who views source call the account with any address they
   like — an open relay on the owner's Gmail, and a spam-reputation problem attached to a
   children's site. Pinning it template-side makes the recipient unreachable from here.

   (This surfaced as a 422 "recipients address is empty" on 2026-09-01, which was the right
   error for the wrong reason: the fix is not to send the address correctly, it is not to send
   it at all.) */
export function templateParams({ from, subject, content }) {
  return {
    from_email: from,
    // Legacy subject line: "Contact Us - {subject}".
    subject: `Contact Us - ${subject}`,
    // Legacy body: "From: {username}\n\nSubject: {subject}\n\nMessage:\n{content}".
    message: `From: ${from}\n\nSubject: ${subject}\n\nMessage:\n${content}`,
  };
}

/* Loaded on demand rather than with a <script> tag in the page: unconfigured, the SDK is dead
   weight on a page most visitors never open.

   Injected as a CLASSIC script, not via import(). dist/email.min.js is a UMD bundle that
   assigns window.emailjs; it is not an ES module, so import() would reject it. The package
   does ship an es/ build, but that pulls relative imports across the CDN — a script tag is what
   UMD is built for and has one fewer way to go wrong. This would only have failed at runtime,
   after EmailJS was configured, which is exactly when nobody is looking for it. */
function loadSdk() {
  if (sdk) return Promise.resolve(sdk);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${EMAILJS_SDK}"]`);
    const ready = () => {
      sdk = window.emailjs;
      if (!sdk) { reject(new Error('EmailJS SDK loaded but window.emailjs is missing')); return; }
      sdk.init({ publicKey: emailjsConfig.publicKey });
      resolve(sdk);
    };
    if (existing) { existing.addEventListener('load', ready); return; }
    const tag = document.createElement('script');
    tag.src = EMAILJS_SDK;
    tag.async = true;
    tag.addEventListener('load', ready);
    tag.addEventListener('error', () => reject(new Error('EmailJS SDK failed to load')));
    document.head.appendChild(tag);
  });
}

function updateCounter() {
  const field = el('nn-contact-content');
  const count = el('nn-contact-count');
  const send = el('nn-contact-send');
  if (!field || !count) return;
  const n = field.value.length;
  count.textContent = String(n);
  // Legacy thresholds, verbatim.
  count.style.color = n > DANGER_AT ? 'red' : (n > WARN_AT ? 'orange' : 'inherit');
  if (send) send.disabled = n === 0;
}

async function submit(e) {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) { toast('Please sign in again.', 'warning'); return; }

  const subject = el('nn-contact-subject').value;
  const content = el('nn-contact-content').value;
  const honeypot = (el('nn-contact-website') || {}).value;

  const problem = validateContact({ subject, content, honeypot });
  if (problem && problem.bot) {
    /* Report success to a bot. Telling it the honeypot exists just teaches it to skip the
       field next time. Nothing is sent. */
    toast('Message sent successfully!', 'success');
    el('nn-contact-form').reset();
    updateCounter();
    return;
  }
  if (problem) { toast(problem.error, 'danger'); return; }

  const send = el('nn-contact-send');
  if (send) send.disabled = true;
  try {
    const api = await loadSdk();
    await api.send(
      emailjsConfig.serviceId,
      emailjsConfig.templateId,
      templateParams({ from: user.email, subject: subject.trim(), content: content.trim() }),
    );
    // Legacy's success message.
    toast('Message sent successfully!', 'success');
    el('nn-contact-form').reset();
    updateCounter();
  } catch (err) {
    // Legacy's failure message.
    console.warn('[NinjaNerd] contact send failed:', err && (err.text || err.message));
    toast('Failed to send message. Please try again.', 'danger');
  } finally {
    updateCounter();
  }
}

function gateHtml(state, email) {
  if (state === 'signed-out') {
    return `
      <i class="fas fa-lock fa-4x text-muted mb-3"></i>
      <h5>Please sign in</h5>
      <p class="text-muted">Sign in so we know who the message is from.</p>
      <a class="btn btn-primary" href="pages/login.html?next=pages/contact_us.html">Sign in</a>`;
  }
  /* Not configured. An honest dead end with a working alternative beats a form that accepts a
     message and drops it. The mailto: is the same address legacy sent to. */
  return `
    <i class="fas fa-envelope-open-text fa-4x text-muted mb-3"></i>
    <h5>Contact form temporarily unavailable</h5>
    <p class="text-muted">You can email us directly instead:</p>
    <a class="btn btn-primary" href="mailto:${CONTACT_TO}">${CONTACT_TO}</a>
    ${email ? `<p class="text-muted small mt-3">Signed in as ${email}</p>` : ''}`;
}

function render() {
  const gate = el('nn-contact-gate');
  const form = el('nn-contact-form');
  if (!gate || !form) return;

  const user = auth.currentUser;
  if (!user) {
    form.style.display = 'none';
    gate.style.display = '';
    gate.innerHTML = gateHtml('signed-out');
    return;
  }
  if (!isEmailjsConfigured()) {
    form.style.display = 'none';
    gate.style.display = '';
    gate.innerHTML = gateHtml('unconfigured', user.email);
    return;
  }

  const from = el('nn-contact-from');
  if (from) from.textContent = `Sending as ${user.email}`;
  gate.style.display = 'none';
  form.style.display = '';
  updateCounter();
}

const contentField = el('nn-contact-content');
if (contentField) contentField.addEventListener('input', updateCounter);
const formEl = el('nn-contact-form');
if (formEl) formEl.addEventListener('submit', submit);

/* On load as well as on the event: if Firebase resolved before this module executed, the event
   has already fired and the page would sit on its spinner for ever. */
document.addEventListener('nn-auth-changed', render);
document.addEventListener('DOMContentLoaded', render);
