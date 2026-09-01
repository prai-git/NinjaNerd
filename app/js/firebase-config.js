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

// The emulator suite works with any non-empty projectId, so tests and local runs can swap
// this for a throwaway project without touching firebase-init.js.
export const EMULATOR_PROJECT_ID = 'ninjanerd-emulator';

export function isConfigured(config = firebaseConfig) {
  return Object.values(config).every((v) => typeof v === 'string' && v && !v.includes('TODO_REPLACE_ME'));
}
