/* Idle session timeout.

   idle-core.js imports nothing, so its policy is executed for real below. idle-timeout.js
   imports the Firebase SDK over https, which Node cannot resolve, so that half is checked as
   text — the same split already used for data.js / stats-calc.js. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IDLE_LIMIT_MS, WARN_BEFORE_MS, ACTIVITY_KEY, LOGOUT_KEY, FLUSH_INTERVAL_MS,
  evaluate, secondsLeft, formatCountdown, shouldFlush,
} from '../app/js/idle-core.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

/* The number is not a preference — it is what the legacy app did. If someone changes it, they
   should have to change this test and read why. */
test('the limit is the legacy 30 minutes, and legacy really said 30', () => {
  assert.equal(IDLE_LIMIT_MS, 30 * 60 * 1000);

  const legacy = read('obs_session_storage/session_expiry.py');
  assert.match(legacy, /SESSION_TIMEOUT_MINUTES\s*=\s*30/,
    'legacy source of the 30 minutes moved or changed');
  const app = read('obs_app.py');
  assert.match(app, /PERMANENT_SESSION_LIFETIME.*SESSION_TIMEOUT_MINUTES/,
    'legacy applied the timeout to the login session lifetime');
  assert.match(app, /session\.permanent = True/,
    'permanent + lifetime is what made legacy rolling rather than absolute');
});

/* The warning is carved out of the 30 minutes, not added to it. Adding it would quietly make
   the real timeout 32 minutes and no longer match legacy. */
test('the warning is inside the limit, not on top of it', () => {
  assert.ok(WARN_BEFORE_MS > 0 && WARN_BEFORE_MS < IDLE_LIMIT_MS);
  const t0 = 1_000_000;
  // At exactly the warning threshold the session is warning but NOT yet expired.
  assert.equal(evaluate(t0, t0 + IDLE_LIMIT_MS - WARN_BEFORE_MS).state, 'warn');
  // And sign-out still happens at the 30-minute mark, not later.
  assert.equal(evaluate(t0, t0 + IDLE_LIMIT_MS).state, 'expired');
});

test('evaluate: the three states and their exact boundaries', () => {
  const t0 = 5_000_000;
  const at = (ms) => evaluate(t0, t0 + ms).state;

  assert.equal(at(0), 'active');
  assert.equal(at(IDLE_LIMIT_MS - WARN_BEFORE_MS - 1), 'active', 'one ms before the warning');
  assert.equal(at(IDLE_LIMIT_MS - WARN_BEFORE_MS), 'warn', 'the warning boundary is inclusive');
  assert.equal(at(IDLE_LIMIT_MS - 1), 'warn', 'one ms before expiry is still recoverable');
  assert.equal(at(IDLE_LIMIT_MS), 'expired', 'expiry boundary is inclusive');
  assert.equal(at(IDLE_LIMIT_MS + 60 * 60 * 1000), 'expired', 'and stays expired');

  assert.equal(evaluate(t0, t0).msLeft, IDLE_LIMIT_MS);
  assert.equal(evaluate(t0, t0 + 60_000).idleMs, 60_000);
});

/* A missing stamp must not throw a child out on their first page load — private mode and a
   cleared localStorage both look like this. */
test('a missing or unusable stamp means active, never expired', () => {
  for (const bad of [null, undefined, NaN, 0, -1, '', 'abc', {}]) {
    const r = evaluate(bad, 1_700_000_000_000);
    assert.equal(r.state, 'active', `${String(bad)} should be treated as active`);
    assert.equal(r.msLeft, IDLE_LIMIT_MS);
  }
});

/* A stamp in the future is a clock change or a hand-edited value. Trusting it would let a
   skewed clock hold a session open forever, which is the one direction that must not happen. */
test('a future stamp is clamped, not trusted', () => {
  const now = 1_700_000_000_000;
  const r = evaluate(now + 10 * 60 * 1000, now);
  assert.equal(r.idleMs, 0);
  assert.equal(r.state, 'active');
  assert.equal(r.msLeft, IDLE_LIMIT_MS, 'clamped to a fresh window, never more');
});

/* The machine-sleep case: timers suspend, so on wake the elapsed time is compared against the
   stored stamp rather than counted by ticks. A session idle across a closed lid is expired. */
test('a long gap with no ticks is still expired on the next evaluation', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(evaluate(t0, t0 + 3 * 60 * 60 * 1000).state, 'expired');
});

test('countdown formatting', () => {
  assert.equal(formatCountdown(120_000), '2:00');
  assert.equal(formatCountdown(61_000), '1:01');
  assert.equal(formatCountdown(9_000), '0:09');
  assert.equal(formatCountdown(0), '0:00');
  // Rounded UP, so the modal never reads 0:00 while the session is still alive.
  assert.equal(formatCountdown(1), '0:01');
  assert.equal(secondsLeft(1), 1);
  assert.equal(secondsLeft(-5), 0, 'never negative');
});

test('the activity flush is throttled', () => {
  const t = 1_700_000_000_000;
  assert.equal(shouldFlush(0, t), true, 'first write always goes');
  assert.equal(shouldFlush(null, t), true);
  assert.equal(shouldFlush(t, t + FLUSH_INTERVAL_MS - 1), false);
  assert.equal(shouldFlush(t, t + FLUSH_INTERVAL_MS), true);
});

// ---- the wiring half: text contracts ---------------------------------------------------

test('the timeout arms itself from auth.js, not from per-page script tags', () => {
  /* Every page loads js/auth.js already. If this were a <script> per page instead, the next
     page anyone adds would silently have no timeout — the failure would be invisible. */
  const auth = read('app/js/auth.js');
  assert.match(auth, /from '\.\/idle-timeout\.js'/, 'auth.js must import the timeout');
  assert.match(auth, /setSignedIn\(!!user\)/,
    'it must arm on sign-in and disarm on sign-out, inside onAuthStateChanged');

  // And every served page must actually load auth.js, or the hook reaches nothing.
  const pages = ['app/index.html', 'app/pages/topics.html', 'app/pages/subtopics.html',
    'app/pages/explore.html', 'app/pages/learn.html', 'app/pages/practice.html',
    'app/pages/statistics.html', 'app/pages/games.html', 'app/pages/game.html'];
  for (const p of pages) {
    assert.match(read(p), /<script type="module" src="js\/auth\.js">/,
      `${p} does not load auth.js, so it would have no idle timeout`);
  }
});

test('expiry really signs out, rather than only redirecting', () => {
  /* A redirect alone leaves the Firebase session alive: the ID token keeps refreshing, and
     opening any page would drop the student straight back in. This is the whole point of the
     feature, so it is pinned. */
  const src = read('app/js/idle-timeout.js');
  assert.match(src, /NNAuth\.signOut\(\)|NNAuthApi\.logout\(\)/,
    'expire() must call a real sign-out');
  assert.match(src, /location\.href = `pages\/login\.html\?timeout=/,
    'and then send the student to login with an explanation');
});

test('paths stay relative, so the sub-path and the custom domain both work', () => {
  // Same rule as test_base_path.test.js; repeated here because this file builds a URL in JS.
  const src = read('app/js/idle-timeout.js');
  assert.doesNotMatch(src, /location\.href\s*=\s*[`'"]\//, 'no root-absolute redirect');
  assert.doesNotMatch(src, /['"`]\/pages\//, 'no leading-slash page path');
});

test('activity during the warning does not silently cancel it', () => {
  /* If a stray mousemove could dismiss the countdown, two things break: the student never
     learns the session nearly ended, and a jiggling mouse on a classroom desk keeps the
     session open indefinitely. Dismissal must be a deliberate click. */
  const src = read('app/js/idle-timeout.js');
  assert.match(src, /function noteActivity\([^)]*\)\s*\{\s*\n\s*if \(!armed \|\| warning\) return;/,
    'noteActivity must no-op while the warning is up');
  assert.match(src, /#nn-idle-stay'\)\.addEventListener\('click', dismissWarning\)/,
    'an explicit button dismisses it');
});

test('tabs share one clock', () => {
  /* Without a shared stamp, a second tab left on the topics page would expire and sign the
     student out of the tab they are actually working in. */
  const core = read('app/js/idle-core.js');
  const src = read('app/js/idle-timeout.js');
  assert.equal(ACTIVITY_KEY, 'nn_last_activity');
  assert.equal(LOGOUT_KEY, 'nn_idle_logout');
  assert.match(core, /export const ACTIVITY_KEY/);
  assert.match(src, /localStorage\.setItem\(ACTIVITY_KEY/, 'activity is shared across tabs');
  assert.match(src, /addEventListener\('storage'/, 'and a timeout in one tab reaches the others');
});

test('localStorage failures are contained (private mode must still work)', () => {
  const src = read('app/js/idle-timeout.js');
  for (const fn of ['function readStamp', 'function writeStamp']) {
    const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 400);
    assert.match(body, /try \{[\s\S]*?\} catch/, `${fn} must not throw in private mode`);
  }
});

test('the login page explains an idle sign-out, and only for a real one', () => {
  const html = read('app/pages/login.html');
  assert.match(html, /id="nn-timeout-notice"/);
  assert.match(html, /30 minutes of no activity/,
    'the notice should state the actual limit, not a vague "a while"');
  /* Strict '1': the modal's own "Sign out now" button sends timeout=0 and is not a timeout,
     so a truthiness check would mislabel a deliberate sign-out. */
  assert.match(html, /get\('timeout'\) === '1'/);
});

test('signed-out visitors are not armed', () => {
  // The About page is public. There is no session to expire, and a modal there would be absurd.
  const src = read('app/js/idle-timeout.js');
  assert.match(src, /export function setSignedIn\(isSignedIn\)/);
  assert.match(src, /if \(!armed\) return;/, 'tick() must no-op when disarmed');
});

/* Two holes found while writing this, both of which would have shipped silently. */

test('a restored session that already went stale expires instead of being refreshed', () => {
  /* Firebase persists auth, so setSignedIn(true) runs again when the browser reopens. If that
     path just re-stamped, closing the laptop for an hour and reopening would hand the student
     a fresh 30 minutes — the exact case the feature exists for. Legacy expired here too: the
     Flask cookie carried a 30-minute lifetime, so reopening later landed on the login page. */
  const src = read('app/js/idle-timeout.js');
  const body = src.slice(src.indexOf('export function setSignedIn'));
  assert.match(body, /evaluate\(stamp, now\(\)\)\.state === 'expired'\s*\)\s*\{\s*\n\s*expire\(true\)/,
    'arming must expire an already-stale stamp, not refresh it');
  assert.match(body, /!Number\.isFinite\(stamp\) \|\| stamp <= 0/,
    'only a genuinely absent stamp starts a fresh window');
});

test('signing out clears the stamp, so the next sign-in is not bounced', () => {
  /* The mirror of the case above. A deliberate sign-out used to leave the stamp behind; the
     next sign-in would read it as already-expired and redirect the student straight back to
     the login page they had just used. */
  const src = read('app/js/idle-timeout.js');
  const disarm = src.slice(src.indexOf('} else if (!isSignedIn && armed)'));
  assert.match(disarm, /localStorage\.removeItem\(ACTIVITY_KEY\)/,
    'disarming must drop the stamp');
});
