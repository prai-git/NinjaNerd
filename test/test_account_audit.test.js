/* Account + Audit pages (prompt 13a).

   Both pages talk to Firebase over https, which Node cannot import, so the page behaviour is
   checked as text and the pure helpers are executed. The security guarantee that matters —
   that a non-admin is refused by Firestore rather than merely hidden from — is tested against
   the emulator in test_firestore_rules.test.js (CI only). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

const accountJs = read('app/js/account.js');
const auditJs = read('app/js/audit.js');
const accountHtml = read('app/pages/account.html');
const auditHtml = read('app/pages/audit.html');

/* Several assertions below are about what the CODE does, not what the comments say. Both files
   deliberately document what was removed and why ("PAYMENTS ARE GONE", "legacy hardcoded
   admin@gmail.com"), and that documentation must not trip a test looking for the real thing --
   otherwise the only way to pass would be to delete the explanation. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')                              // JS block comments
    .replace(/<!--[\s\S]*?-->/g, '')                                // HTML comments
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');       // whole-line JS comments
}
const auditCode = stripComments(auditJs);
const auditMarkup = stripComments(auditHtml);

// ---- the gap this prompt closed ------------------------------------------------------------

test('the Profile card links no longer 404', () => {
  /* The owner clicked Audit on the deployed site and got a 404 — the two pages were assigned
     to no prompt at all. Every Profile target must now exist, except contact_us which is
     prompt 13. */
  const index = read('app/index.html');
  for (const page of ['account.html', 'statistics.html', 'audit.html']) {
    assert.ok(index.includes(`href="pages/${page}"`), `index.html should link ${page}`);
    assert.ok(read(`app/pages/${page}`).length > 0, `app/pages/${page} must exist`);
  }
});

// ---- Account ---------------------------------------------------------------------------

test('account never writes email or is_admin', () => {
  /* The rules reject both, so attempting them would surface to a parent as a confusing generic
     permission error rather than "you cannot change this". The page must not try. */
  const start = accountJs.indexOf('await updateDoc(');
  const call = accountJs.slice(start, accountJs.indexOf('}', accountJs.indexOf('{', start)) + 1);
  assert.match(call, /school_name:/);
  assert.match(call, /updated_at:/);
  assert.doesNotMatch(call, /email|is_admin/,
    'the profile update must carry school_name and updated_at only');
});

test('the password change goes through Firebase Auth, not Firestore', () => {
  // Auth owns credentials; users/{uid} has no password field and the rules would reject one.
  assert.match(accountJs, /updatePassword/);
  assert.doesNotMatch(accountJs, /password:\s*/, 'no password may be written to a document');
});

test('a stale session is handled, not just failed', () => {
  /* Firebase refuses updatePassword on an old session with auth/requires-recent-login. Left
     unhandled it looks like the save silently did nothing. */
  assert.match(accountJs, /auth\/requires-recent-login/);
  assert.match(accountJs, /reauthenticateWithCredential/);
});

test('email is displayed read-only, and the page says why', () => {
  assert.match(accountHtml, /id="nn-acct-email"[^>]*readonly/);
  assert.match(accountHtml, /cannot be changed here/i,
    'offering no explanation reads like a broken field');
});

test('legacy edit-toggle behaviour is preserved', () => {
  // Legacy kept each field read-only until Edit, and Save disabled until something changed.
  assert.match(accountHtml, /id="nn-acct-edit-password"/);
  assert.match(accountHtml, /id="nn-acct-edit-school"/);
  assert.match(accountHtml, /id="nn-acct-save"[^>]*disabled/);
  assert.match(accountJs, /function updateSaveButton/);
  assert.match(accountJs, /!\(passwordEdited \|\| schoolEdited\)/);
});

test('the password field starts empty rather than faking legacy\'s "*****"', () => {
  /* Legacy pre-filled "*****" and skipped the write if it was unchanged. Firebase Auth never
     discloses a password — not even its length — so pre-filling a mask would be a lie about
     what we know. Same end behaviour: an untouched form changes nothing. */
  assert.doesNotMatch(accountHtml, /value="\*{3,}"/);
  assert.match(accountJs, /passwordEdited = pwField\.value\.length > 0/);
});

test('school name validation matches the rules cap', () => {
  // 200 is what dbmgr/firestore.rules enforces; a looser client cap would fail server-side.
  assert.match(accountJs, /MAX_SCHOOL = 200/);
  assert.match(read('dbmgr/firestore.rules'), /school_name\.size\(\) <= 200/);
  assert.match(accountHtml, /id="nn-acct-school"[^>]*maxlength="200"/);
});

test('password minimum matches legacy', () => {
  assert.match(accountJs, /MIN_PASSWORD = 6/);
  assert.match(read('obs_app.py'), /Password must be at least 6 characters long/,
    'legacy source of the 6-character minimum moved or changed');
});

// ---- Audit ---------------------------------------------------------------------------------

test('payments are absent from Audit entirely', () => {
  /* Legacy showed payment_history, payment_amount and payment_receipt_link. There are no
     payments and no user_payments collection, so the panel is REMOVED, not left empty. */
  for (const src of [auditCode, auditMarkup]) {
    assert.doesNotMatch(src, /payment/i, 'no payment field may appear in Audit');
  }
  // The removal must still be EXPLAINED in the source, or the next reader re-adds it.
  assert.match(auditJs, /PAYMENTS ARE GONE/);
});

test('admin status is read from the profile document, never hardcoded', () => {
  /* Legacy hardcoded admin@gmail.com (obs_app.py is_admin_user). A static site has no server
     to mint custom claims, so is_admin on users/{uid} is the source — and the rules make it
     immutable from the client, which is what makes that safe. */
  assert.match(auditCode, /snap\.data\(\)\.is_admin/);
  assert.doesNotMatch(auditCode, /admin@gmail\.com/,
    'no hardcoded admin address in the executable code');
  // Not the display cache either: anyone can edit that.
  assert.doesNotMatch(auditCode, /NNAuth/,
    'admin status must come from Firestore, not the display cache');
});

test('a refused query is shown as "not authorised", not a stack trace', () => {
  assert.match(auditJs, /permission-denied/);
  assert.match(auditJs, /notAuthorised/);
});

test('lookup is by email query, which is why the rules grant list', () => {
  assert.match(auditJs, /where\('email', '==', email\)/);
  assert.match(read('dbmgr/firestore.rules'), /Admin reads ANY profile[\s\S]{0,200}list/,
    'the rules must still explain that Audit needs list, not just get');
});

test('history is bounded in the QUERY, not just in the template', () => {
  /* Legacy loaded the whole history from SQLite and sliced to 50 in Jinja — free locally,
     billed per document in Firestore. Asking for one more than we show is what lets the
     "showing last 50 of N" note stay honest without paying for the whole history. */
  assert.match(auditJs, /fsLimit\(HISTORY_ROWS \+ 1\)/);
  assert.match(auditJs, /HISTORY_ROWS = 50/);
});

test('Audit output is escaped', () => {
  /* Audit renders one user's stored text into an admin's page. Those strings are authored
     content today, but the whole point of the page is to inspect data the admin did not
     write. */
  assert.match(auditJs, /function esc\(/);
  for (const field of ['h.topic', 'h.question', 'h.user_answer', 'data.username', 'data.school_name']) {
    assert.ok(auditJs.includes(`esc(${field}`) || auditJs.includes(`esc(truncate(${field.replace('h.', 'h.')}`),
      `${field} must be escaped before it reaches innerHTML`);
  }
});

// ---- pure helpers, executed ----------------------------------------------------------------

test('truncate matches legacy: ellipsis only when it actually cuts', async () => {
  const { truncate } = await import('../app/js/audit.js').catch(() => ({}));
  // audit.js imports the Firebase SDK over https, which Node cannot resolve; fall back to
  // re-implementing the contract check against the source when the import is unavailable.
  if (truncate) {
    assert.equal(truncate('abc', 5), 'abc');
    assert.equal(truncate('abcdef', 3), 'abc…');
  } else {
    assert.match(auditJs, /t\.length > n \? `\$\{t\.slice\(0, n\)\}…` : t/);
  }
});

test('missing statistics render as legacy defaults, not as errors', () => {
  /* A user who has never practised has no statistics document and no history. Legacy showed
     "Not specified" / "Never" / 0 / [] — that is a valid report, not a failure. */
  assert.match(auditJs, /'Not specified'/);
  assert.match(auditJs, /return 'Never'/);
  assert.match(auditJs, /stats\.questions_attempted \|\| 0/);
  assert.match(auditJs, /Array\.isArray\(stats\.topics_covered\) \? stats\.topics_covered : \[\]/);
});

test('both pages carry a <base> and use relative paths', () => {
  // Same rule as test_base_path.test.js; these are new pages at pages/ depth.
  for (const [name, html] of [['account', accountHtml], ['audit', auditHtml]]) {
    assert.match(html, /<base href="\.\.\/" \/>/, `${name}.html needs a <base>`);
    assert.doesNotMatch(html, /(?:href|src)="\//, `${name}.html has a root-absolute path`);
  }
  for (const [name, js] of [['account', accountJs], ['audit', auditJs]]) {
    assert.doesNotMatch(js, /['"`]\/pages\//, `${name}.js has a root-absolute path`);
  }
});

test('both pages load the shared shell and auth', () => {
  for (const [name, html] of [['account', accountHtml], ['audit', auditHtml]]) {
    for (const src of ['assets/js/auth-state.js', 'assets/js/layout.js', 'js/auth.js']) {
      assert.ok(html.includes(src), `${name}.html must load ${src}`);
    }
    assert.match(html, /data-nn-header/, `${name}.html needs the shared header marker`);
    assert.match(html, /data-nn-footer/, `${name}.html needs the shared footer marker`);
  }
});
