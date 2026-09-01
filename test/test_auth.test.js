/* Auth wiring (prompt 07). Static checks — the behavioural tests against the Auth +
   Firestore emulators run in CI, since the emulator does not work on this machine.

   What these guard is the set of things that are invisible until a real user hits them:
   a signup that omits is_admin (rules reject it, leaving an Auth user with no profile),
   a page that forgot to load the auth module, or the admin check drifting back to a
   hardcoded address. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const auth = read('app/js/auth.js');

const servedPages = () => [
  'app/index.html',
  ...readdirSync(join(repoRoot, 'app/pages'))
    .filter((f) => f.endsWith('.html') && !f.startsWith('obs_'))
    .map((f) => `app/pages/${f}`),
];

test('signup writes is_admin: false explicitly', () => {
  /* The single most breakable line in this file. The rules require the field on create; omit
     it and account creation is denied, so the Auth user exists with no profile document and
     the app looks broken in a way that points nowhere near the cause. */
  assert.match(auth, /is_admin:\s*false/, 'signup must set is_admin: false');
  assert.doesNotMatch(auth, /is_admin:\s*true/, 'the client must never write is_admin: true');
});

test('the profile document matches the legacy users columns', () => {
  // obs_sqlite_manager.py users: email, password, school_name, created_at, updated_at, is_admin.
  for (const field of ['email', 'school_name', 'is_admin', 'created_at', 'updated_at']) {
    assert.ok(auth.includes(field), `profile write should include ${field}`);
  }
  // Auth owns credentials; a password must never reach Firestore.
  assert.doesNotMatch(auth, /\bpassword:\s*(password|pw)\b/,
    'the password must not be written to the profile document');
  // Neither existed in the legacy schema; both were inventions in the original prompt 07.
  assert.doesNotMatch(auth, /displayName:|\brole:/,
    'legacy has no display name or role column');
});

test('a blank school name falls back to the legacy default', () => {
  // obs_app.py create_account: `school_name if school_name else "Unknown School"`.
  assert.match(auth, /Unknown School/);
});

test('the SDK version matches firebase-init rather than floating', () => {
  const init = read('app/js/firebase-init.js');
  const v = (s) => [...s.matchAll(/firebasejs\/([\d.]+)\//g)].map((m) => m[1]);
  const versions = new Set([...v(auth), ...v(init)]);
  assert.equal(versions.size, 1, `mixed SDK versions: ${[...versions].join(', ')}`);
});

test('every served page loads the auth module', () => {
  // A page that misses it renders a permanently signed-out nav, whatever the real state is.
  for (const p of servedPages()) {
    assert.match(read(p), /<script type="module" src="js\/auth\.js">/, `${p} must load auth.js`);
  }
});

test('the auth-state bridge keeps the contract layout.js depends on', () => {
  const bridge = read('app/assets/js/auth-state.js');
  const layout = read('app/assets/js/layout.js');
  assert.match(layout, /NNAuth\.getUser\(\)/, 'layout.js reads NNAuth.getUser()');
  for (const fn of ['getUser', 'signOut', '_set']) {
    assert.ok(bridge.includes(`${fn}:`), `bridge must expose ${fn}`);
  }
  // The prompt-02 stub let any caller fake a login. Real auth must be the only way in.
  assert.doesNotMatch(bridge, /signIn:/, 'the stub signIn must be gone');
  // The bridge is a classic script: importing Firebase there would break every page.
  assert.doesNotMatch(bridge, /^\s*import\s/m, 'the bridge must not import modules');
});

test('auth.js republishes state to both the nav and classic scripts', () => {
  assert.match(auth, /onAuthStateChanged/);
  assert.match(auth, /NNAuth\._set/, 'must push resolved state into the display cache');
  assert.match(auth, /NNLayout\.render/, 'must repaint the nav once auth resolves');
  assert.match(auth, /nn-auth-changed/, 'must broadcast for classic inline scripts');
});

test('login and signup use the real API, not the removed stub', () => {
  for (const p of ['app/pages/login.html', 'app/pages/signup.html']) {
    const html = read(p);
    assert.match(html, /NNAuthApi\.(login|signup)\(/, `${p} must call the real API`);
    assert.doesNotMatch(html, /NNAuth\.signIn\(/, `${p} still calls the removed stub`);
  }
});

test('login does not reveal whether an email exists', () => {
  /* Distinct "no such user" and "wrong password" messages turn the form into an
     account-existence oracle. Firebase returns one code for both; keep it that way. */
  const html = read('app/pages/login.html');
  assert.doesNotMatch(html, /auth\/user-not-found/, 'do not branch on user-not-found');
  assert.doesNotMatch(html, /auth\/wrong-password/, 'do not branch on wrong-password');
});

test('Learn and Practice are gated on verification, not just sign-in', () => {
  // Legacy verified BEFORE the account existed, so nothing unverified could ever practise.
  const flow = read('app/js/flow.js');
  assert.match(flow, /emailVerified/, 'requireLogin must check emailVerified');
  assert.match(flow, /pages\/login\.html\?next=/, 'and still redirect signed-out users');
});

test('login offers password recovery — a capability the legacy app lacked', () => {
  /* obs_templates/login.html had no reset link at all, so a forgotten password was
     unrecoverable from the UI. Added at the owner's request; a deliberate improvement on
     legacy rather than a mirror of it. */
  const html = read('app/pages/login.html');
  assert.match(html, /id="nn-forgot-password"/, 'login must offer a reset link');
  assert.match(html, /NNAuthApi\.resetPassword\(/, 'and wire it to the real API');
  assert.match(auth, /sendPasswordResetEmail/, 'auth.js must expose the reset call');
});

test('password reset does not disclose whether an account exists', () => {
  /* Firebase email enumeration protection (on by default since 2023-09-15) makes
     sendPasswordResetEmail succeed silently for unknown addresses. Reporting "no such
     account" here would hand back exactly what that protection withholds — on a children's
     site that means revealing which families have accounts. */
  const html = read('app/pages/login.html');
  assert.doesNotMatch(html, /auth\/user-not-found/, 'must not branch on user-not-found');
  assert.match(html, /If an account exists for/,
    'the confirmation must be neutral about existence');
});
