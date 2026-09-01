/* Real Firebase Authentication (prompt 07). Replaces the localStorage stub from 02.

   The profile document mirrors the legacy SQLite `users` table (obs_sqlite_manager.py) so
   Audit, Statistics and progress tracking keep working:

       users/{uid} = { email, school_name, is_admin, created_at, updated_at }

   `is_admin: false` MUST be written explicitly at signup. The rules reject a create without
   it, which is what stops a new account granting itself admin; omit it and the Auth user
   exists with no profile, which looks like a broken login. Admin is granted only by editing
   the document by hand in the Firestore console -- the rules make the field immutable from
   the client.

   Legacy stored no display name and no role, so neither is written here. Legacy also used the
   email as the username (`is_admin_user(username) == 'admin@gmail.com'`), which is why
   NNAuth.getUser().username is the email.

   VERIFICATION -- a forced divergence, flagged rather than invented. Legacy required a 4-digit
   code that was checked BEFORE the user row was written (obs_app.py create_account), so an
   unverified account could not exist. Firebase inverts this: the account is created, a link is
   emailed, and emailVerified flips later. There is no verify-before-create for email/password
   without a backend. Closest faithful behaviour: create, email the link, and refuse entry to
   Learn/Practice until verified. Same end state, different order. */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

import { auth, db } from './firebase-init.js';

const listeners = [];
let profile = null; // users/{uid} for the signed-in user, or null

function userRef(uid) {
  return doc(db, 'users', uid);
}

/* Shape handed to the nav. `username` is the email, matching how the legacy app used it. */
function toNNUser(user, prof) {
  if (!user) return null;
  return {
    username: user.email,
    uid: user.uid,
    emailVerified: user.emailVerified,
    is_admin: !!(prof && prof.is_admin),
    school_name: (prof && prof.school_name) || '',
  };
}

async function loadProfile(user) {
  if (!user) return null;
  try {
    const snap = await getDoc(userRef(user.uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    // A denied read means the rules are not deployed, or the profile was never written.
    // Treat as "no profile" rather than throwing: the nav must still render.
    console.warn('[NinjaNerd] could not read profile:', e && e.code);
    return null;
  }
}

/* Create the account, email the verification link, then write the profile.

   Order matters. The Auth user must exist before the profile write, because the rules check
   request.auth.uid == uid. If the profile write fails the account still exists but is unusable,
   so the failure is surfaced rather than swallowed. */
export async function signup({ email, password, schoolName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  /* The verification mail is deliberately non-fatal: a mail outage must not leave a
     half-created account. But the caller has to KNOW whether it went, or the UI cheerfully
     reports success while the user waits for an email that was never sent. That happened on
     2026-09-01, so the outcome is returned rather than only logged. */
  let verificationSent = false;
  let verificationError = null;
  try {
    await sendEmailVerification(cred.user);
    verificationSent = true;
  } catch (e) {
    verificationError = (e && e.code) || 'unknown';
    console.warn('[NinjaNerd] verification email failed:', verificationError);
  }

  await setDoc(userRef(cred.user.uid), {
    email,
    // Legacy defaulted a blank school to "Unknown School" (obs_app.py create_account).
    school_name: (schoolName || '').trim() || 'Unknown School',
    is_admin: false, // REQUIRED — see the header.
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  return { user: cred.user, verificationSent, verificationError };
}

export async function login({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export function logout() {
  return fbSignOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function resendVerification() {
  return auth.currentUser ? sendEmailVerification(auth.currentUser) : Promise.reject(
    new Error('not signed in'),
  );
}

export function currentUser() {
  return toNNUser(auth.currentUser, profile);
}

export function onAuthChange(cb) {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/* Firebase restores the session asynchronously, so the nav renders signed-out for a moment on
   every load. NNAuth caches the last known user so the shell paints correctly straight away;
   the cache is display-only and grants nothing, since the rules are what enforce access. */
onAuthStateChanged(auth, async (user) => {
  profile = await loadProfile(user);
  const nnUser = toNNUser(user, profile);
  if (window.NNAuth && window.NNAuth._set) window.NNAuth._set(nnUser);
  if (window.NNLayout && window.NNLayout.render) window.NNLayout.render();
  /* Classic inline scripts (the Audit link on index.html) cannot import this module, so the
     resolved state is broadcast as a DOM event they can listen for. */
  document.dispatchEvent(new CustomEvent('nn-auth-changed', { detail: nnUser }));
  for (const cb of listeners.slice()) {
    try { cb(nnUser); } catch (e) { console.error(e); }
  }
});

// Let the classic-script shell call into this module.
window.NNAuthApi = {
  signup, login, logout, resetPassword, resendVerification, currentUser, onAuthChange,
};
