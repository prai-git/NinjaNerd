/* Firestore Security Rules tests (prompt 06), run against the Firebase Local Emulator.

   These are the only tests that prove the security boundary actually holds, so they must be
   run for real before the rules are trusted:

       npm run emulator      # terminal 1  (needs Java + `npm install`)
       npm run test:rules    # terminal 2

   `npm test` also picks this file up. When the emulator is not running the suite SKIPS rather
   than fails, so the ordinary test run stays green on a machine without Java -- but a skip
   here means the rules are UNVERIFIED, not fine. */

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const PROJECT_ID = 'ninjanerd-emulator';

const ALICE = 'uid_alice';
const BOB = 'uid_bob';
const CAROL = 'uid_carol';
const ADMIN = 'uid_admin';

async function emulatorRunning() {
  try {
    const res = await fetch(`http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok || res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}

let rulesTesting = null;
try {
  rulesTesting = await import('@firebase/rules-unit-testing');
} catch {
  // dev dependency not installed
}

const up = rulesTesting ? await emulatorRunning() : false;
const skip = !rulesTesting
  ? 'install dev deps first: npm install'
  : !up
    ? `Firestore emulator not reachable on ${FIRESTORE_HOST}:${FIRESTORE_PORT} — run: npm run emulator`
    : false;

/* Skipping keeps `npm test` green on a machine without Java, which is right for local work but
   catastrophic in CI: if the emulator fails to start, every rule test skips, the runner exits
   0, and a green tick reports that the security boundary is verified when nothing ran at all.
   The rules CI workflow sets NN_REQUIRE_EMULATOR=1 so that a skip becomes a hard failure. */
if (process.env.NN_REQUIRE_EMULATOR === '1' && skip) {
  console.error(`\n[rules] NN_REQUIRE_EMULATOR=1 but the suite would skip: ${skip}\n`);
  process.exit(1);
}

describe('firestore security rules', { skip }, () => {
  let env;
  let firestore;

  before(async () => {
    const { initializeTestEnvironment } = rulesTesting;
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(join(repoRoot, 'dbmgr/firestore.rules'), 'utf8'),
        host: FIRESTORE_HOST,
        port: FIRESTORE_PORT,
      },
    });
    // Must be the npm package: Node cannot import an https:// URL, so the CDN build used by
    // the browser (app/js/firebase-init.js) is not usable here. `firebase` is a devDependency
    // pinned to the same 12.x line as that CDN URL.
    firestore = await import('firebase/firestore');
  });

  after(async () => { if (env) await env.cleanup(); });

  const { assertSucceeds, assertFails } = rulesTesting ?? {};

  // Seed a profile for each actor. ADMIN carries is_admin so the Audit path can be exercised.
  async function seedUsers() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      const db = ctx.firestore();
      await setDoc(doc(db, `users/${ALICE}`), {
        email: 'alice@example.com', school_name: 'PS1', is_admin: false,
        created_at: new Date(), updated_at: new Date(),
      });
      await setDoc(doc(db, `users/${BOB}`), {
        email: 'bob@example.com', school_name: 'PS2', is_admin: false,
        created_at: new Date(), updated_at: new Date(),
      });
      await setDoc(doc(db, `users/${ADMIN}`), {
        email: 'admin@gmail.com', school_name: '', is_admin: true,
        created_at: new Date(), updated_at: new Date(),
      });
      await setDoc(doc(db, `users/${BOB}/history/h1`), {
        question: 'What is 2+2?', user_answer: '4', correct: true,
        topic: 'math', subtopic: 'Addition', grade: 1, timestamp: new Date(),
      });
      await setDoc(doc(db, `users/${BOB}/statistics/summary`), {
        last_login: new Date(), questions_attempted: 1, topics_covered: ['math'],
      });
    });
  }

  test('a user can append their own history and read it back', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc, getDoc } = firestore;
    const ref = doc(db, `users/${ALICE}/history/h1`);
    await assertSucceeds(setDoc(ref, {
      question: 'What is 3+3?', user_answer: '6', correct: true,
      topic: 'math', subtopic: 'Addition', grade: 1,
      timestamp: firestore.serverTimestamp(),
    }));
    await assertSucceeds(getDoc(ref));

    /* A client-chosen timestamp is refused. Backdating or post-dating a row would reorder the
       Statistics view and corrupt Audit — the one collection whose entire value is being
       trustworthy. */
    await assertFails(setDoc(doc(db, `users/${ALICE}/history/h_backdated`), {
      question: 'q', user_answer: 'a', correct: true,
      topic: 'math', subtopic: 'Addition', grade: 1,
      timestamp: new Date('2020-01-01'),
    }));
  });

  test('history is append-only: no rewriting or deleting an entry', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc, updateDoc, deleteDoc } = firestore;
    const ref = doc(db, `users/${ALICE}/history/h2`);
    await assertSucceeds(setDoc(ref, {
      question: 'q', user_answer: 'a', correct: false,
      topic: 'science', subtopic: 'Cells', grade: 5,
      timestamp: firestore.serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, { correct: true }));
    await assertFails(deleteDoc(ref));
  });

  test('a user cannot read another user\'s profile, history or statistics', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertFails(getDoc(doc(db, `users/${BOB}`)));
    await assertFails(getDoc(doc(db, `users/${BOB}/history/h1`)));
    await assertFails(getDoc(doc(db, `users/${BOB}/statistics/summary`)));
    await assertFails(setDoc(doc(db, `users/${BOB}/history/x`), { correct: false }));
  });

  // The legacy Audit page reads another user's record, so this MUST succeed for an admin.
  test('an admin can read any user profile, history and statistics (Audit)', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ADMIN).firestore();
    const { doc, getDoc } = firestore;
    await assertSucceeds(getDoc(doc(db, `users/${BOB}`)));
    await assertSucceeds(getDoc(doc(db, `users/${BOB}/history/h1`)));
    await assertSucceeds(getDoc(doc(db, `users/${BOB}/statistics/summary`)));
  });

  test('a normal user cannot promote themselves to admin', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, updateDoc, setDoc } = firestore;
    await assertFails(updateDoc(doc(db, `users/${ALICE}`), { is_admin: true }));
    // Nor by rewriting the whole document.
    await assertFails(setDoc(doc(db, `users/${ALICE}`), {
      email: 'alice@example.com', school_name: 'PS1', is_admin: true,
      created_at: new Date(), updated_at: new Date(),
    }));
  });

  test('a new account cannot create itself as admin', async () => {
    const db = env.authenticatedContext('uid_fresh').firestore();
    const { doc, setDoc } = firestore;
    await assertFails(setDoc(doc(db, 'users/uid_fresh'), {
      email: 'fresh@example.com', is_admin: true,
      created_at: new Date(), updated_at: new Date(),
    }));
    await assertSucceeds(setDoc(doc(db, 'users/uid_fresh'), {
      email: 'fresh@example.com', school_name: '', is_admin: false,
      created_at: new Date(), updated_at: new Date(),
    }));
  });

  test('unauthenticated requests are denied', async () => {
    await seedUsers();
    const db = env.unauthenticatedContext().firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertFails(getDoc(doc(db, `users/${ALICE}`)));
    await assertFails(setDoc(doc(db, `users/${ALICE}/history/x`), { correct: true }));
    await assertFails(getDoc(doc(db, 'chat_sessions/s1')));
  });

  /* ---- abuse hardening (prompt 18) -------------------------------------------------------
     Being signed in is cheap: any address can create a verified account. So "isOwner" alone
     let an authenticated client append documents of ANY shape and size to its own subtree,
     billed to the owner, up to 1 MiB per write forever. These cases pin the bounds. */

  test('an oversized or malformed history row is refused', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc, serverTimestamp } = firestore;
    const good = {
      question: 'What is 3+3?', user_answer: '6', correct: true,
      topic: 'math', subtopic: 'Addition', grade: 1, timestamp: serverTimestamp(),
    };
    const write = (over) => setDoc(doc(db, `users/${ALICE}/history/${Math.random()}`),
      { ...good, ...over });

    // The control: the shape the app actually writes still works.
    await assertSucceeds(write({}));

    // Caps are ~4x the largest real authored value (question 927 chars, option 262), so a
    // genuine save can never hit them.
    await assertFails(write({ question: 'x'.repeat(4001) }));
    await assertFails(write({ user_answer: 'x'.repeat(1001) }));
    await assertFails(write({ subtopic: 'x'.repeat(101) }));

    // Unknown fields are the bloat vector: without hasOnly, a client can attach anything.
    await assertFails(write({ payload: 'x'.repeat(2000) }));

    // Types and ranges.
    await assertFails(write({ correct: 'yes' }));
    await assertFails(write({ topic: 'chemistry' }));
    await assertFails(write({ grade: 0 }));
    await assertFails(write({ grade: 7 }));
    await assertFails(write({ grade: '3' }));
    await assertFails(write({ question: 12345 }));
  });

  test('a bloated or malformed statistics summary is refused', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc } = firestore;
    const ref = doc(db, `users/${ALICE}/statistics/summary`);

    await assertSucceeds(setDoc(ref, {
      questions_attempted: 1, topics_covered: ['math'],
      attempts_by: { g1_math: 1 }, correct_by: { g1_math: 1 },
    }));

    /* topics_covered is written with arrayUnion, which has no bound of its own. This document
       is read on EVERY statistics view, so letting it grow is a self-service denial of
       service against the owner's own bill. */
    await assertFails(setDoc(ref, { topics_covered: ['math', 'not_a_topic'] }));
    await assertFails(setDoc(ref, {
      topics_covered: Array.from({ length: 500 }, (_, i) => `t${i}`),
    }));

    // 6 grades x 3 topics bounds the roll-up at 18 keys.
    const tooMany = {};
    for (let i = 0; i < 40; i++) tooMany[`k${i}`] = 1;
    await assertFails(setDoc(ref, { attempts_by: tooMany }));

    await assertFails(setDoc(ref, { junk: 'x'.repeat(1000) }));
    await assertFails(setDoc(ref, { questions_attempted: -5 }));
    await assertFails(setDoc(ref, { questions_attempted: 'many' }));
  });

  test('the summary cannot be deleted, which would silently reset a child\'s counters', async () => {
    await seedUsers();
    const db = env.authenticatedContext(BOB).firestore();
    const { doc, deleteDoc } = firestore;
    // `allow write` used to include delete. BOB's summary is seeded.
    await assertFails(deleteDoc(doc(db, `users/${BOB}/statistics/summary`)));
  });

  test('a profile cannot carry unbounded free text', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc } = firestore;
    // school_name comes straight from the signup form and had no bound at all.
    await assertFails(setDoc(doc(db, `users/${ALICE}`), {
      email: 'alice@example.com', school_name: 'x'.repeat(201), is_admin: false,
      created_at: new Date(), updated_at: new Date(),
    }));
    await assertFails(setDoc(doc(db, `users/${ALICE}`), {
      email: 'alice@example.com', school_name: 'PS1', is_admin: false,
      created_at: new Date(), updated_at: new Date(), blob: 'x'.repeat(5000),
    }));
  });

  test('statistics writes have a one-second floor, and it clears', async () => {
    /* Rules cannot count requests over a window the way Flask-Limiter did (legacy used
       "10 per minute" on submit_answer), but every recorded attempt updates this document, so
       a minimum interval here throttles attempt writes as a whole. One second, not legacy's
       six: six would reject a fast-but-real student. data.js retries once after ~1.2s, so a
       genuine burst is delayed rather than lost — which this test also proves. */
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc, serverTimestamp } = firestore;
    const ref = doc(db, `users/${ALICE}/statistics/summary`);

    await assertSucceeds(setDoc(ref, {
      questions_attempted: 1, updated_at: serverTimestamp(),
    }));
    // Immediately again: refused.
    await assertFails(setDoc(ref, {
      questions_attempted: 2, updated_at: serverTimestamp(),
    }));
    // After the floor, allowed — this is the case data.js's single retry lands in.
    await new Promise((r) => setTimeout(r, 1300));
    await assertSucceeds(setDoc(ref, {
      questions_attempted: 2, updated_at: serverTimestamp(),
    }));
  });

  /* ---- collaboration: DROPPED 2026-09-01 -------------------------------------------------
     Four chat cases and one invite case used to live here, asserting that members could read a
     session and post as themselves. The feature was cut by the owner (COPPA exposure), and the
     allow rules were deleted rather than left dormant. What has to be tested now is the
     inverse: that these collections are shut, including for a signed-in user who looks exactly
     like a legitimate participant. Deleting the tests along with the rules would have left the
     removal itself unguarded -- a future edit could re-open chat_sessions and nothing would
     notice. */
  test('chat_sessions and invites are closed to everyone, members included', async () => {
    await seedUsers();
    // Seed as if the feature still existed, so Alice is a genuine participant/sender.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      await setDoc(doc(ctx.firestore(), 'chat_sessions/s1'), {
        user1_id: ALICE, user2_id: BOB, active: true,
        created_at: new Date(), updated_at: new Date(),
      });
      await setDoc(doc(ctx.firestore(), 'chat_sessions/s1/messages/m1'), {
        from_user_id: BOB, to_user_id: ALICE, message_content: 'hi',
        displayed: false, timestamp: new Date(),
      });
      await setDoc(doc(ctx.firestore(), 'invites/i1'), {
        from_user_id: ALICE, to_user_email: 'bob@example.com', status: 'pending',
        timestamp: new Date(), created_at: new Date(), updated_at: new Date(),
      });
    });

    const { doc, getDoc, setDoc, updateDoc, deleteDoc } = firestore;
    const aliceDb = env.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();

    // Reads are shut even for the member named in the document.
    await assertFails(getDoc(doc(aliceDb, 'chat_sessions/s1')));
    await assertFails(getDoc(doc(aliceDb, 'chat_sessions/s1/messages/m1')));
    await assertFails(getDoc(doc(aliceDb, 'invites/i1')));

    // Writes are shut, including a well-formed one that the old rules would have allowed.
    await assertFails(setDoc(doc(aliceDb, 'chat_sessions/s2'), {
      user1_id: ALICE, user2_id: BOB, active: true,
      created_at: new Date(), updated_at: new Date(),
    }));
    await assertFails(setDoc(doc(aliceDb, 'chat_sessions/s1/messages/m2'), {
      from_user_id: ALICE, to_user_id: BOB, message_content: 'hello',
      displayed: false, timestamp: new Date(),
    }));
    await assertFails(updateDoc(doc(aliceDb, 'chat_sessions/s1'), { active: false }));
    await assertFails(deleteDoc(doc(aliceDb, 'chat_sessions/s1')));
    await assertFails(setDoc(doc(aliceDb, 'invites/i2'), {
      from_user_id: ALICE, to_user_email: 'bob@example.com', status: 'pending',
      timestamp: new Date(), created_at: new Date(), updated_at: new Date(),
    }));

    // Admin has no back door either -- isAdmin() was only ever reachable via those blocks.
    const adminDb = env.authenticatedContext(ADMIN, { email: 'admin@example.com' }).firestore();
    await assertFails(getDoc(doc(adminDb, 'chat_sessions/s1/messages/m1')));
    await assertFails(getDoc(doc(adminDb, 'invites/i1')));
  });

  test('an unrelated top-level collection is denied', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc } = firestore;
    await assertFails(setDoc(doc(db, 'somethingElse/doc1'), { a: 1 }));
  });
});
