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

import { firebaseConfig, isConfigured, EMULATOR_PROJECT_ID } from './firebase-config.js';

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
