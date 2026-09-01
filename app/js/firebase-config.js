/* Firebase Web config (prompt 06).

   THIS FILE IS PUBLIC BY DESIGN AND IS NOT A SECRET.
   The Firebase web config ships to every browser that loads the site; it identifies the
   project, it does not authorise anything. Security comes from Firebase Auth plus the
   Firestore Security Rules in ../../dbmgr/firestore.rules. Do NOT put service-account keys,
   admin credentials, or any private key in this file (or anywhere in app/).

   TODO(owner): replace the placeholders below with the real values from
   Firebase console -> Project settings -> General -> Your apps -> Web app -> SDK setup.
   Until then isConfigured() is false and firebase-init.js will not attempt to connect.

   The collections these values reach, and who may read or write them, are documented in
   dbmgr/firestore.rules. */

export const firebaseConfig = {
  apiKey: 'AIzaSyAVsPqTtXeXUlfggF6sy_r4DblFVkm_lGo',
  authDomain: 'ninjanerd-32030.firebaseapp.com',
  projectId: 'ninjanerd-32030',
  storageBucket: 'ninjanerd-32030.firebasestorage.app',
  messagingSenderId: '356454798469',
  appId: '1:356454798469:web:b8bf2c238ca3cd2f15c5ec',
};

/* App Check — reCAPTCHA v3 site key.

   THIS IS ALSO PUBLIC, and it is the control that answers "can someone hammer our Firebase
   project with a script?". The config above identifies the project to anyone who views source,
   which is by design; on its own that means any curl loop can reach Auth and Firestore and be
   billed to the owner. App Check makes the SDK attach a token attesting the request came from
   the real site on its real domain, and Firestore/Auth reject requests without one once
   enforcement is switched on.

   EMPTY = DISABLED, and firebase-init.js says so loudly in the console rather than failing
   silently. To turn it on see doc/prompt/18_abuse_hardening_prompt.md: register the site in
   Firebase console -> App Check with the reCAPTCHA v3 provider, paste the site key here, then
   enforce. Turn enforcement on only AFTER the key is deployed and the console's request
   metrics show verified traffic -- enforcing first locks every real user out. */
export const APP_CHECK_SITE_KEY = '';

// The emulator suite works with any non-empty projectId, so tests and local runs can swap
// this for a throwaway project without touching firebase-init.js.
export const EMULATOR_PROJECT_ID = 'ninjanerd-emulator';

export function isConfigured(config = firebaseConfig) {
  return Object.values(config).every((v) => typeof v === 'string' && v && !v.includes('TODO_REPLACE_ME'));
}
