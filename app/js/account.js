/* Account page (prompt 13a) — mirrors legacy obs_app.py:865 + obs_templates/account.html.

   Legacy behaviour, kept:
     - three fields (username/email, password, school name), each read-only until Edit;
     - Save disabled until something actually changed;
     - password validated at 6 characters minimum (obs_app.py: "Password must be at least 6
       characters long"), which is also Firebase's own floor;
     - school name updated only when it differs from the stored value.

   Forced divergences, flagged per the working rules:
     - Legacy pre-filled the password field with "*****" and skipped the update if it still
       held that placeholder. Firebase Auth never discloses a password, so the field starts
       empty and is only sent when typed into. Same end behaviour, honest about what we know.
     - The password goes through Firebase Auth (updatePassword), not a Firestore write. Auth
       owns credentials and users/{uid} has no password field.
     - Email is immutable in the rules and is never written. Legacy could change it because the
       row was keyed by username; ours is keyed by uid with email pinned.
     - Legacy emailed the user after a successful update (gw/emailgw). There is no server to
       send from and EmailJS is prompt 13, so that notification is dropped rather than faked. */

import {
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  doc, getDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

import { auth, db } from './firebase-init.js';

const MIN_PASSWORD = 6; // obs_app.py account(): "Password must be at least 6 characters long"
const MAX_SCHOOL = 200; // matches the cap enforced in dbmgr/firestore.rules

const el = (id) => document.getElementById(id);
const toast = (msg, type) => window.NNToast && window.NNToast.show(msg, type);

let storedSchool = '';
let passwordEdited = false;
let schoolEdited = false;

/* Legacy sanitize_school_name trimmed and rejected empty/oversized values. The rules enforce
   the cap server-side; this is the friendly half. Returns null when invalid. */
export function cleanSchoolName(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > MAX_SCHOOL) return null;
  return s;
}

export function passwordProblem(pw) {
  if (!pw) return 'Enter a new password.';
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return null;
}

function updateSaveButton() {
  const save = el('nn-acct-save');
  if (save) save.disabled = !(passwordEdited || schoolEdited);
}

/* Legacy's Edit/Cancel toggle, reproduced. Cancel restores the stored value so a half-typed
   change cannot be saved by accident. */
function wireToggle(fieldId, btnId, onCancel) {
  const field = el(fieldId);
  const btn = el(btnId);
  if (!field || !btn) return;
  btn.addEventListener('click', () => {
    if (field.readOnly) {
      field.readOnly = false;
      field.value = '';
      field.focus();
      btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
    } else {
      field.readOnly = true;
      onCancel(field);
      btn.innerHTML = '<i class="fas fa-edit"></i> Edit';
      updateSaveButton();
    }
  });
}

async function loadProfile(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[NinjaNerd] could not read profile:', e && e.code);
    return null;
  }
}

/* Save. Password and school are INDEPENDENT: a failed password change must not silently
   discard a valid school-name edit, and vice versa, so each is attempted and reported
   separately rather than short-circuiting on the first error. */
async function save(e) {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) { toast('Please sign in again.', 'warning'); return; }

  const save$ = el('nn-acct-save');
  if (save$) save$.disabled = true;
  const done = [];
  const failed = [];

  if (schoolEdited) {
    const name = cleanSchoolName(el('nn-acct-school').value);
    if (!name) {
      failed.push(`School name must be 1–${MAX_SCHOOL} characters.`);
    } else if (name === storedSchool) {
      // Legacy only wrote when the value actually differed.
      schoolEdited = false;
    } else {
      try {
        /* Only school_name and updated_at. The rules reject any update that changes email or
           is_admin, so writing the whole document back would fail as a confusing generic
           permission error. */
        await updateDoc(doc(db, 'users', user.uid), {
          school_name: name,
          updated_at: serverTimestamp(),
        });
        storedSchool = name;
        done.push('school name');
      } catch (err) {
        failed.push('Could not save the school name.');
        console.warn('[NinjaNerd] school update failed:', err && err.code);
      }
    }
  }

  if (passwordEdited) {
    const pw = el('nn-acct-password').value;
    const problem = passwordProblem(pw);
    if (problem) {
      failed.push(problem);
    } else {
      try {
        await updatePassword(user, pw);
        done.push('password');
      } catch (err) {
        const code = (err && err.code) || '';
        if (code === 'auth/requires-recent-login') {
          /* Firebase refuses a password change on a stale session. Rather than telling the
             child to sign out and back in, re-authenticate in place with the password they
             just proved they know... except they have not proved it — they typed a NEW one.
             So ask for the current one. */
          const current = window.prompt(
            'For your security, please re-enter your CURRENT password to change it:');
          if (current) {
            try {
              await reauthenticateWithCredential(
                user, EmailAuthProvider.credential(user.email, current));
              await updatePassword(user, pw);
              done.push('password');
            } catch (err2) {
              failed.push('That current password was not correct.');
              console.warn('[NinjaNerd] reauth failed:', err2 && err2.code);
            }
          } else {
            failed.push('Password unchanged — re-authentication was cancelled.');
          }
        } else if (code === 'auth/weak-password') {
          failed.push(`Password must be at least ${MIN_PASSWORD} characters.`);
        } else {
          failed.push('Could not change the password.');
          console.warn('[NinjaNerd] password update failed:', code);
        }
      }
    }
  }

  if (done.length) {
    // Legacy's message on success: "Credentials successfully updated".
    toast(`Credentials successfully updated (${done.join(' and ')}).`, 'success');
    resetFields();
  }
  for (const f of failed) toast(f, 'danger');
  updateSaveButton();
}

function resetFields() {
  const pw = el('nn-acct-password');
  const school = el('nn-acct-school');
  if (pw) {
    pw.value = '';
    pw.readOnly = true;
    const b = el('nn-acct-edit-password');
    if (b) b.innerHTML = '<i class="fas fa-edit"></i> Edit';
  }
  if (school) {
    school.value = storedSchool;
    school.readOnly = true;
    const b = el('nn-acct-edit-school');
    if (b) b.innerHTML = '<i class="fas fa-edit"></i> Edit';
  }
  passwordEdited = false;
  schoolEdited = false;
}

async function render(user) {
  const gate = el('nn-account-gate');
  const form = el('nn-account-form');
  if (!gate || !form) return;

  if (!user) {
    form.style.display = 'none';
    gate.innerHTML = `
      <i class="fas fa-lock fa-4x text-muted mb-3"></i>
      <h5>Please sign in</h5>
      <p class="text-muted">You need to be signed in to manage your account.</p>
      <a class="btn btn-primary" href="pages/login.html?next=pages/account.html">Sign in</a>`;
    return;
  }

  const profile = await loadProfile(user);
  storedSchool = (profile && profile.school_name) || '';
  el('nn-acct-email').value = user.email || '';
  el('nn-acct-school').value = storedSchool;
  gate.style.display = 'none';
  form.style.display = '';
}

wireToggle('nn-acct-password', 'nn-acct-edit-password', (f) => { f.value = ''; passwordEdited = false; });
wireToggle('nn-acct-school', 'nn-acct-edit-school', (f) => { f.value = storedSchool; schoolEdited = false; });

const pwField = el('nn-acct-password');
if (pwField) {
  pwField.addEventListener('input', () => {
    passwordEdited = pwField.value.length > 0 && !pwField.readOnly;
    updateSaveButton();
  });
}
const schoolField = el('nn-acct-school');
if (schoolField) {
  schoolField.addEventListener('input', () => {
    schoolEdited = schoolField.value !== storedSchool && !schoolField.readOnly;
    updateSaveButton();
  });
}
const formEl = el('nn-account-form');
if (formEl) formEl.addEventListener('submit', save);

/* Render from the authoritative Firebase user, not the display cache. The cache decides what
   the nav draws; this page writes data, so it waits for the real thing.

   Rendered on load as well as on the event: if Firebase resolved before this module executed,
   nn-auth-changed has already fired and the page would sit on its spinner for ever. */
document.addEventListener('nn-auth-changed', (e) => render(e.detail ? auth.currentUser : null));
document.addEventListener('DOMContentLoaded', () => render(auth.currentUser));
