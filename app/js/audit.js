/* Audit page (prompt 13a) — mirrors legacy obs_app.py:1057 + obs_templates/audit.html.

   The ONLY admin-only feature in the app, and the reason is_admin exists in the schema and in
   the Security Rules. The rules already grant admins cross-user reads and that path is proven
   against the emulator in CI; until now nothing used it.

   Legacy fields, kept: username, school_name ("Not specified" when absent), last_login
   ("Never" when absent), questions_attempted (0), topics_covered, and the history table capped
   at 50 rows with a "showing last 50 of N" note.

   Forced divergences, flagged per the working rules:
     - PAYMENTS ARE GONE. Legacy rendered payment_history, payment_amount and
       payment_receipt_link. There are no payments and no user_payments collection, so the
       panel is removed rather than rendered empty.
     - Lookup is by EMAIL via a query, because Firestore documents are keyed by uid where the
       SQLite row was keyed by username. This is why the rules grant admins `list`.
     - Admin status comes from the requester's own users/{uid}.is_admin, not a hardcoded
       address (legacy: is_admin_user(username) == 'admin@gmail.com').

   THE UI GATE BELOW IS COSMETIC. Hiding the panel stops an honest non-admin being confused; it
   protects nothing. The protection is that Firestore itself refuses a non-admin's query. */

import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit as fsLimit,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

import { auth, db } from './firebase-init.js';

const HISTORY_ROWS = 50;   // legacy: audit_data.history[:50]
const QUESTION_CHARS = 50; // legacy: question truncated to 50
const ANSWER_CHARS = 30;   // legacy: user_answer truncated to 30

const el = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Legacy truncated with an ellipsis only when it actually cut something.
export function truncate(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/* Firestore timestamps come back as Timestamp objects, but a document written before
   serverTimestamp() resolved can hold null, and hand-seeded data can hold a Date or a string.
   Legacy printed whatever it had, so handle all four rather than showing "[object Object]". */
export function formatWhen(value) {
  if (!value) return 'Never';
  let d = value;
  if (typeof value.toDate === 'function') d = value.toDate();
  else if (typeof value === 'string') d = new Date(value);
  else if (typeof value === 'number') d = new Date(value);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'Never';
  return d.toLocaleString();
}

function notFound(email) {
  // Legacy: flash('User "<name>" not found') and log the attempt.
  console.info('[NinjaNerd] audit: no user found for', email);
  return `
    <div class="alert alert-warning" role="alert">
      <i class="fas fa-exclamation-triangle me-2"></i>
      User "${esc(email)}" not found.
    </div>`;
}

function notAuthorised() {
  return `
    <div class="alert alert-danger" role="alert">
      <i class="fas fa-ban me-2"></i>
      You are not authorised to view audit data.
    </div>`;
}

function historyTable(history) {
  if (!history.length) {
    // Legacy empty state.
    return `
      <div class="text-center text-muted">
        <i class="fas fa-inbox fa-3x mb-3"></i>
        <p>No activity history found for this user.</p>
      </div>`;
  }
  const rows = history.slice(0, HISTORY_ROWS).map((h) => `
    <tr>
      <td>${esc(formatWhen(h.timestamp))}</td>
      <td>${esc(h.topic || 'N/A')}</td>
      <td>${esc(h.grade == null ? 'N/A' : h.grade)}</td>
      <td>${esc(truncate(h.question, QUESTION_CHARS))}</td>
      <td>${esc(truncate(h.user_answer, ANSWER_CHARS))}</td>
      <td>${h.correct
    ? '<span class="badge bg-success">Correct</span>'
    : '<span class="badge bg-danger">Incorrect</span>'}</td>
    </tr>`).join('');
  const more = history.length > HISTORY_ROWS
    ? `<p class="text-muted small text-center mb-0">Showing last ${HISTORY_ROWS} activities out
         of ${history.length} total</p>`
    : '';
  return `
    <div class="table-responsive">
      <table class="table table-sm table-striped">
        <thead>
          <tr><th>Timestamp</th><th>Topic</th><th>Grade</th><th>Question</th>
              <th>Answer</th><th>Result</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}
    </div>`;
}

function report(data) {
  return `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h4><i class="fas fa-user me-2"></i>Audit Report for: ${esc(data.username)}</h4>
    </div>

    <div class="row mb-4">
      <div class="col-md-6">
        <div class="card">
          <div class="card-header bg-info text-white">
            <h6 class="mb-0"><i class="fas fa-user-circle me-2"></i>User Information</h6>
          </div>
          <div class="card-body">
            <p><strong>Username:</strong> ${esc(data.username)}</p>
            <p><strong>School:</strong> ${esc(data.school_name)}</p>
            <p><strong>Last Login:</strong> ${data.last_login === 'Never'
    ? '<span class="text-muted">Never</span>' : esc(data.last_login)}</p>
            <p><strong>Questions Attempted:</strong> ${esc(data.questions_attempted)}</p>
            <p><strong>Topics Covered:</strong> ${esc(data.topics_covered.length)}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header bg-warning text-dark">
        <h6 class="mb-0"><i class="fas fa-history me-2"></i>Activity History</h6>
      </div>
      <div class="card-body" style="max-height: 400px; overflow-y: auto;">
        ${historyTable(data.history)}
      </div>
    </div>`;
}

/* Gather everything the legacy page showed, tolerating missing pieces the way it did: a user
   who has never practised has no statistics document and no history, and that is a valid
   report, not an error. */
export async function buildAudit(email) {
  const users = await getDocs(
    query(collection(db, 'users'), where('email', '==', email), fsLimit(1)));
  if (users.empty) return null;

  const profile = users.docs[0];
  const uid = profile.id;
  const p = profile.data() || {};

  let stats = {};
  try {
    const s = await getDoc(doc(db, 'users', uid, 'statistics', 'summary'));
    stats = s.exists() ? s.data() : {};
  } catch (e) {
    console.warn('[NinjaNerd] audit: statistics unreadable:', e && e.code);
  }

  let history = [];
  try {
    /* Newest first, and bounded. Legacy loaded the whole list from SQLite and sliced to 50 in
       the template; here every extra document is a billed read, so the bound is applied in the
       query. Asking for one more than we display is what lets the "showing last 50 of N" note
       be honest without paying for the entire history. */
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'history'),
      orderBy('timestamp', 'desc'),
      fsLimit(HISTORY_ROWS + 1),
    ));
    history = snap.docs.map((d) => d.data());
  } catch (e) {
    console.warn('[NinjaNerd] audit: history unreadable:', e && e.code);
  }

  return {
    username: p.email || email,
    school_name: p.school_name || 'Not specified',
    last_login: formatWhen(stats.last_login),
    questions_attempted: stats.questions_attempted || 0,
    topics_covered: Array.isArray(stats.topics_covered) ? stats.topics_covered : [],
    history,
  };
}

async function run(e) {
  e.preventDefault();
  const results = el('nn-audit-results');
  const hint = el('nn-audit-hint');
  const btn = el('nn-audit-run');
  const email = (el('nn-audit-email').value || '').trim().toLowerCase();
  if (!email) return;

  if (hint) hint.style.display = 'none';
  if (btn) btn.disabled = true;
  results.innerHTML = `
    <div class="text-center text-muted py-4">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading…</span></div>
    </div>`;

  try {
    const data = await buildAudit(email);
    results.innerHTML = data ? report(data) : notFound(email);
  } catch (err) {
    /* A non-admin reaching this point is refused by Firestore, not by us. Show that as a clean
       message rather than a stack trace — the failure is correct, the presentation should not
       be alarming. */
    const code = (err && err.code) || '';
    console.warn('[NinjaNerd] audit query failed:', code);
    results.innerHTML = code === 'permission-denied'
      ? notAuthorised()
      : '<div class="alert alert-danger">Could not load the audit report.</div>';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function render() {
  const gate = el('nn-audit-gate');
  const panel = el('nn-audit-panel');
  if (!gate || !panel) return;

  const user = auth.currentUser;
  if (!user) {
    panel.style.display = 'none';
    gate.style.display = '';
    gate.innerHTML = `
      <i class="fas fa-lock fa-4x text-muted mb-3"></i>
      <h5>Please sign in</h5>
      <a class="btn btn-primary" href="pages/login.html?next=pages/audit.html">Sign in</a>`;
    return;
  }

  // is_admin from the profile document — never a hardcoded address, never the display cache.
  let isAdmin = false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    isAdmin = !!(snap.exists() && snap.data().is_admin);
  } catch (err) {
    console.warn('[NinjaNerd] could not read profile:', err && err.code);
  }

  if (!isAdmin) {
    panel.style.display = 'none';
    gate.style.display = '';
    gate.innerHTML = `
      <i class="fas fa-ban fa-4x text-muted mb-3"></i>
      <h5>Not authorised</h5>
      <p class="text-muted">The audit report is available to administrators only.</p>
      <a class="btn btn-primary" href="index.html">Back to NinjaNerd</a>`;
    return;
  }

  gate.style.display = 'none';
  panel.style.display = '';
}

const form = el('nn-audit-form');
if (form) form.addEventListener('submit', run);

/* On load as well as on the event: if Firebase resolved before this module executed, the
   event has already fired and the page would sit on its spinner for ever. render() reads
   auth.currentUser itself, so calling it twice is harmless. */
document.addEventListener('nn-auth-changed', render);
document.addEventListener('DOMContentLoaded', render);
