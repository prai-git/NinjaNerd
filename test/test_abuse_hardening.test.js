/* Abuse / cost hardening (prompt 18).

   The threat model for this app is NOT a server falling over — there is no server. The static
   site is CDN-served by GitHub Pages, so a flood there is GitHub's problem and needs nothing
   from us. The exposed surface is Firebase, and the damage is the OWNER'S BILL: reads, writes
   and storage, charged per operation, reachable by anyone who reads the public web config.

   So the tests here are about bounding cost and keeping non-app clients out, not uptime.

   The rules themselves are enforced against the emulator in test_firestore_rules.test.js
   (CI only). What is executed here is the roll-up arithmetic, which is pure. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOPICS, selectGrade, percentagesFor,
  rollupKeyFor, rollupIsComplete, gradeFromRollup, percentagesFromRollup,
} from '../app/js/stats-calc.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

// ---- the read amplifier ------------------------------------------------------------------

/* Statistics used to read history: ONE Firestore document read per answered question, up to
   1000 per view, on a page a child can refresh at will — and it got worse the more a student
   practised. That is the largest read amplifier in the app. */
test('statistics reads one document on the normal path, not the whole history', () => {
  const src = read('app/js/statistics.js');
  assert.match(src, /rollupIsComplete\(summary\)/,
    'the cheap path must be taken when the roll-up is trustworthy');
  const idx = src.indexOf('if (rollupIsComplete(summary))');
  const elseIdx = src.indexOf('} else {', idx);
  assert.ok(idx > 0 && elseIdx > idx, 'expected a roll-up branch and a fallback');
  assert.doesNotMatch(src.slice(idx, elseIdx), /getHistory\(/,
    'the roll-up path must not also read history — that would defeat the point');
  assert.match(src.slice(elseIdx), /getHistory\(/, 'the fallback still reads history');
});

test('the roll-up is written in the same batch as the history row, so it cannot drift', () => {
  const src = read('app/js/data.js');
  const start = src.indexOf('const batch = writeBatch(db);');
  const end = src.indexOf('await commitWithOneRetry(batch);');
  assert.ok(start > 0 && end > start);
  const body = src.slice(start, end);
  assert.match(body, /attempts_by:/, 'roll-up must be part of the batch');
  assert.match(body, /correct_by:/);
  assert.match(body, /batch\.set\(doc\(historyCol/, 'and so must the history row');
});

// ---- the roll-up must produce EXACTLY the legacy numbers ---------------------------------

/* If the cheap path disagreed with the history path by even one percent, a child's scores
   would change depending on which branch ran. Both are computed here from the same data. */
test('roll-up and history paths agree, on generated data', () => {
  const history = [];
  const summary = { questions_attempted: 0, attempts_by: {}, correct_by: {} };
  let seed = 42;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

  for (let i = 0; i < 400; i++) {
    const grade = 1 + rnd(6);
    const topic = TOPICS[rnd(3)];
    const correct = rnd(2) === 0;
    history.push({ topic, grade, correct });
    const k = rollupKeyFor(grade, topic);
    summary.attempts_by[k] = (summary.attempts_by[k] || 0) + 1;
    summary.correct_by[k] = (summary.correct_by[k] || 0) + (correct ? 1 : 0);
    summary.questions_attempted++;
  }

  assert.equal(rollupIsComplete(summary), true);
  const g1 = selectGrade(history);
  const g2 = gradeFromRollup(summary);
  assert.equal(g2, g1, 'the two paths must pick the same grade');
  assert.deepEqual(percentagesFromRollup(summary, g2), percentagesFor(history, g1),
    'and the same percentages');
});

test('ties resolve to the lowest grade in both paths', () => {
  // selectGrade() documents this behaviour; the roll-up path must not quietly differ.
  const history = [
    { topic: 'math', grade: 3, correct: true },
    { topic: 'math', grade: 5, correct: true },
  ];
  const summary = {
    questions_attempted: 2,
    attempts_by: { g3_math: 1, g5_math: 1 },
    correct_by: { g3_math: 1, g5_math: 1 },
  };
  assert.equal(selectGrade(history), 3);
  assert.equal(gradeFromRollup(summary), 3);
});

test('no math answered defaults to grade 1 in both paths', () => {
  const history = [{ topic: 'science', grade: 4, correct: true }];
  const summary = {
    questions_attempted: 1, attempts_by: { g4_science: 1 }, correct_by: { g4_science: 1 },
  };
  assert.equal(selectGrade(history), 1);
  assert.equal(gradeFromRollup(summary), 1);
});

/* The self-healing check. Accounts that practised before the roll-up existed have history
   rows with no counters behind them; using the roll-up there would UNDER-REPORT a child's
   work. Comparing against questions_attempted catches exactly that, with no migration and no
   version flag — the moment the two agree, the cheap path takes over by itself. */
test('an incomplete roll-up is rejected, so old accounts fall back to history', () => {
  assert.equal(rollupIsComplete(null), false);
  assert.equal(rollupIsComplete({}), false, 'no roll-up at all');
  assert.equal(rollupIsComplete({ questions_attempted: 5 }), false);
  assert.equal(rollupIsComplete({
    questions_attempted: 10, attempts_by: { g1_math: 3 },
  }), false, 'roll-up covers 3 of 10 attempts — must not be trusted');
  assert.equal(rollupIsComplete({
    questions_attempted: 3, attempts_by: { g1_math: 3 },
  }), true, 'exact agreement is the only accepted case');
  assert.equal(rollupIsComplete({
    questions_attempted: 0, attempts_by: {},
  }), false, 'an empty account has nothing to show either way');
});

test('percentages are still computed, never stored', () => {
  /* Prompt 08's rule, which the roll-up must not quietly break. What is stored is COUNTS —
     which is what the legacy SQLite queries counted at read time. Storing a percentage would
     freeze it: recomputing after a fix would no longer change what a child sees. */
  const rules = read('dbmgr/firestore.rules');
  const m = rules.match(/hasOnly\(\s*\n?\s*\[([^\]]*)\]\)\s*\n\s*&& \(!\('questions_attempted'/);
  assert.ok(m, 'could not locate the summary field whitelist');
  const fields = m[1].split(',').map((f) => f.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(fields.sort(), [
    'attempts_by', 'correct_by', 'last_login', 'questions_attempted',
    'topics_covered', 'updated_at',
  ], 'the summary may hold counters and nothing else');
  for (const f of fields) {
    assert.doesNotMatch(f, /percent|pct|score/,
      `${f} looks like a stored derived value, not a count`);
  }
});

// ---- App Check ---------------------------------------------------------------------------

/* Security Rules decide WHAT a caller may touch. App Check decides WHETHER the caller is our
   app at all. Without it, the public config in firebase-config.js is enough for any script to
   call Auth and Firestore and have the owner billed. They are not substitutes. */
test('App Check is wired, off by default, and never fatal', () => {
  const cfg = read('app/js/firebase-config.js');
  const init = read('app/js/firebase-init.js');

  assert.match(cfg, /export const APP_CHECK_SITE_KEY = '';/,
    'ships disabled — enforcing before the key is deployed locks every real user out');
  assert.match(init, /ReCaptchaV3Provider/);
  assert.match(init, /isTokenAutoRefreshEnabled: true/,
    'a long practice session must not start failing writes halfway through');

  // Loaded dynamically: dead weight on first paint until it is configured.
  assert.match(init, /import\('https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-app-check\.js'\)/);

  /* If App Check cannot load, the site must still work. The rules are the boundary and are
     unaffected; a hard failure here would take the whole site down for every child over an
     anti-abuse measure. */
  const block = init.slice(init.indexOf('if (appCheckEnabled)'));
  assert.match(block, /\.catch\(/, 'App Check failure must not be fatal');

  /* The absence of a key must be VISIBLE, so it can never become a silent oversight. It is
     currently off by owner decision (2026-09-01): reCAPTCHA v3 is deprecated in App Check and
     reCAPTCHA Enterprise needs a Cloud billing account even for its free tier, which would move
     the project off Spark -- and Spark's quota is a HARD cap, so the project cannot be billed
     at all. That ceiling was judged worth more than App Check for launch. */
  assert.match(init, /App Check is off by design/);
  assert.match(init, /OFF BY OWNER DECISION/,
    'the reason must stay in the file, or the next reader reads it as a missing step');
  assert.match(init, /Spark/,
    'the compensating control (the hard plan cap) must be named beside the decision');
});

test('the path back to App Check is written down, including the provider change', () => {
  /* If the project ever moves to Blaze the hard cap disappears and App Check becomes the
     missing control. Whoever does that must not have to rediscover that ReCaptchaV3Provider is
     the deprecated one. */
  const cfg = read('app/js/firebase-config.js');
  assert.match(cfg, /ReCaptchaEnterpriseProvider/,
    'the re-enable note must name the provider that replaces the deprecated one');
  assert.match(cfg, /secret key stays in the console/i,
    'the site-key/secret-key split must be spelled out — the secret must never enter the repo');
  assert.match(cfg, /Blaze/);
});

test('App Check is skipped against the emulator', () => {
  // The emulators do not verify tokens and reCAPTCHA will not issue one for an unregistered
  // origin, so attempting it locally only produces console noise.
  const init = read('app/js/firebase-init.js');
  assert.match(init, /appCheckEnabled = !useEmulator && !!APP_CHECK_SITE_KEY/);
});

// ---- retry discipline ---------------------------------------------------------------------

test('the write retry is bounded to exactly one attempt, with jitter', () => {
  /* Unbounded retry IS the thundering herd: every client that fails during an outage comes
     back together, repeatedly, and keeps the outage alive. One bounded retry cannot. */
  const src = read('app/js/data.js');
  const fn = src.slice(src.indexOf('async function commitWithOneRetry'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3);

  assert.equal((body.match(/batch\.commit\(\)/g) || []).length, 2,
    'exactly two commits: the original and ONE retry');
  assert.doesNotMatch(body, /while\s*\(|for\s*\(/, 'no retry loop');
  assert.match(body, /Math\.random\(\)/, 'jitter, so clients do not return in lockstep');
  assert.match(body, /retryable/, 'only retryable codes are retried');
});

test('a failed save never blocks the quiz', () => {
  // Unchanged from prompt 08, re-pinned because the retry added a new way to throw.
  const src = read('app/js/data.js');
  const fn = src.slice(src.indexOf('export async function recordAttempt'));
  assert.match(fn.slice(0, fn.indexOf('\n}\n')), /catch \(e\)[\s\S]*return \{ saved: false/,
    'recordAttempt must swallow its own failures');
});

// ---- static hosting: nothing to harden, and that is the finding ---------------------------

test('the site itself has no origin to overwhelm', () => {
  /* Worth pinning as an assumption rather than leaving implicit: every request a visitor makes
     is either a static file from the Pages CDN or a direct call to Google. There is no origin
     server of ours in the path, which is why a flood is not our problem to absorb. If a
     runtime backend is ever added, this test should fail and be reconsidered. */
  const pkg = JSON.parse(read('package.json'));
  const deps = Object.keys(pkg.dependencies || {});
  assert.deepEqual(deps, [], 'a runtime dependency would imply a build/server we do not have');
  assert.ok(!pkg.scripts.start, 'no server start script');
});
