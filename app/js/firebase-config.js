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
  apiKey: 'TODO_REPLACE_ME',
  authDomain: 'TODO_REPLACE_ME.firebaseapp.com',
  projectId: 'TODO_REPLACE_ME',
  storageBucket: 'TODO_REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'TODO_REPLACE_ME',
  appId: 'TODO_REPLACE_ME',
};

// The emulator suite works with any non-empty projectId, so tests and local runs can swap
// this for a throwaway project without touching firebase-init.js.
export const EMULATOR_PROJECT_ID = 'ninjanerd-emulator';

export function isConfigured(config = firebaseConfig) {
  return Object.values(config).every((v) => typeof v === 'string' && v && !v.includes('TODO_REPLACE_ME'));
}
