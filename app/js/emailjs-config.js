/* EmailJS configuration (prompt 13).

   ALL THREE VALUES ARE PUBLIC BY DESIGN, like the Firebase config beside them. EmailJS is
   built to be called from a browser: the Service ID, Template ID and Public Key identify the
   account and template, they do not authorise arbitrary mail. The Gmail credential that
   actually sends — the app password for ninjanerdonpi@gmail.com — is stored INSIDE EmailJS and
   never reaches this repo or the browser. That is the whole reason this approach was chosen
   over anything that would need a server.

   EMPTY = NOT CONFIGURED. The contact page then shows an honest "temporarily unavailable"
   message with a mailto: fallback, rather than a form that silently fails to send. Owner steps
   to fill these in: doc/emailjs-setup.md.

   CONFIGURED 2026-09-01 by the owner. The template expects exactly the three variables
   contact.js sends -- from_email, subject, message. If the mail ever arrives with a blank
   field, a template variable was renamed on the EmailJS side; nothing here will warn.

   THE RECIPIENT IS NOT SENT FROM HERE. It is typed literally into the EmailJS template,
   because a public key plus a client-supplied recipient is an open relay on the owner's
   Gmail. See the note above templateParams() in contact.js.

   NOTE ON ABUSE: a public key means anyone can call the template. EmailJS enforces a monthly
   send quota and per-key rate limits on its side, and the free tier's quota is a hard stop
   rather than a bill — the same shape of protection as the Spark plan (see prompt 18). Turn on
   the reCAPTCHA option in the EmailJS template settings if the address starts attracting spam.
   Legacy limited this route to 5 requests per minute (obs_app.py apply_rate_limit); there is no
   server to enforce that here, so EmailJS's own limits are what remain. */

export const emailjsConfig = {
  serviceId: 'service_rsepx3q',
  templateId: 'template_cyfrd7t',
  publicKey: 'RIRApt0K6fpL416vF',
};

// Pinned deliberately, matching how Firebase/KaTeX/Bootstrap are pinned elsewhere: an unpinned
// URL would let a breaking release ship itself to users without a code change.
export const EMAILJS_SDK =
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js';

// Legacy sent every contact message here (obs_app.py contact_us).
export const CONTACT_TO = 'ninjanerdonpi@gmail.com';

export function isEmailjsConfigured(cfg = emailjsConfig) {
  return Object.values(cfg).every((v) => typeof v === 'string' && v.trim().length > 0);
}
