/* Firebase initialisation (prompt 06). Exports `app`, `auth`, `db`.

   Loaded straight from Google's CDN as ES modules: the site is static, there is no bundler
   and no npm runtime dependency. The version is pinned deliberately -- an unpinned URL would
   let a future breaking release ship itself to users without a code change.

   On localhost this connects to the Firebase Local Emulator instead of production, so local
   development and the rules tests never touch real user data. The switch is guarded on
   hostname only; a deployed site can never take this branch. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

import {
  firebaseConfig, isConfigured, EMULATOR_PROJECT_ID, APP_CHECK_SITE_KEY,
} from './firebase-config.js';

// Keep in sync with firebase.json.
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080 };

export function isLocalhost(hostname = location.hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

const useEmulator = isLocalhost();

// Against the emulator the config is irrelevant, so a placeholder project still works. In
// production a placeholder must not silently "half-initialise" -- fail loudly instead.
if (!useEmulator && !isConfigured()) {
  console.error(
    '[NinjaNerd] Firebase is not configured. Fill in app/js/firebase-config.js from ' +
      'Firebase console -> Project settings -> General -> Your apps -> Web app -> SDK setup.',
  );
}

export const app = initializeApp(
  useEmulator ? { ...firebaseConfig, projectId: EMULATOR_PROJECT_ID } : firebaseConfig,
);

export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulator) {
  connectAuthEmulator(auth, `http://localhost:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', EMULATOR_PORTS.firestore);
  console.info('[NinjaNerd] Using Firebase emulators (auth + firestore) on localhost.');
}

/* ---- App Check --------------------------------------------------------------------------

   The abuse control for a static site. Everything in firebase-config.js is public by design,
   so without App Check any script holding those values can call Auth and Firestore directly
   and the owner is billed for it. Security Rules decide WHAT a caller may touch; App Check
   decides WHETHER a caller is our app at all. They are not substitutes.

   Loaded dynamically so the App Check module is not fetched at all when no key is set — a
   static site pays for every byte on first paint, and this is dead weight until it is
   configured.

   Skipped on localhost: the emulators do not verify tokens, and reCAPTCHA will not issue one
   for an unregistered origin, so attempting it locally only produces console noise. */
export const appCheckEnabled = !useEmulator && !!APP_CHECK_SITE_KEY;

if (appCheckEnabled) {
  import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js')
    .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        // Refresh the attestation token in the background so a long practice session does not
        // start failing writes halfway through.
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch((e) => {
      /* Never fatal. If App Check cannot load, the site must still work: the Security Rules
         are the boundary and they are unaffected. A hard failure here would take the whole
         site down for every child over an anti-abuse measure. */
      console.warn('[NinjaNerd] App Check unavailable:', e && e.message);
    });
} else if (!useEmulator) {
  /* OFF BY OWNER DECISION (2026-09-01), not by oversight. reCAPTCHA v3 was deprecated in App
     Check, and its replacement, reCAPTCHA Enterprise, requires a Google Cloud BILLING ACCOUNT
     attached even to use its free tier. Attaching one would move the project off the Spark
     plan, and Spark's free quota is a HARD cap: Firestore stops serving rather than billing,
     so the project cannot run up a charge at all. That hard ceiling was judged worth more than
     App Check for launch -- see doc/prompt/18_abuse_hardening_prompt.md.

     What carries the load instead: the deployed Security Rules (shape validation, size caps,
     server-pinned timestamps, the one-second write floor) bound what any authenticated client
     can do, and the plan itself bounds the total. Revisit if the site ever moves to Blaze --
     at that point the hard cap is gone and this becomes the missing control. */
  console.info(
    '[NinjaNerd] App Check is off by design; Security Rules + the Spark plan quota are the ' +
      'controls. See doc/prompt/18_abuse_hardening_prompt.md.',
  );
}
