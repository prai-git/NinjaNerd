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
      topic: 'math', subtopic: 'Addition', grade: 1, timestamp: new Date(),
    }));
    await assertSucceeds(getDoc(ref));
  });

  test('history is append-only: no rewriting or deleting an entry', async () => {
    await seedUsers();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc, updateDoc, deleteDoc } = firestore;
    const ref = doc(db, `users/${ALICE}/history/h2`);
    await assertSucceeds(setDoc(ref, {
      question: 'q', user_answer: 'a', correct: false,
      topic: 'science', subtopic: 'Cells', grade: 5, timestamp: new Date(),
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

  // ---- chat (confirmed in launch scope) ------------------------------------------------
  async function seedChat() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      await setDoc(doc(ctx.firestore(), 'chat_sessions/s1'), {
        user1_id: ALICE, user2_id: BOB, active: true,
        created_at: new Date(), updated_at: new Date(),
      });
      await setDoc(doc(ctx.firestore(), 'chat_sessions/s1/messages/m1'), {
        from_user_id: BOB, to_user_id: ALICE, message_content: 'hi',
        obfuscated_content: 'h*', displayed: false, timestamp: new Date(),
      });
    });
  }

  test('a chat member reads the session and posts as themselves only', async () => {
    await seedUsers(); await seedChat();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertSucceeds(getDoc(doc(db, 'chat_sessions/s1')));
    await assertSucceeds(getDoc(doc(db, 'chat_sessions/s1/messages/m1')));
    await assertSucceeds(setDoc(doc(db, 'chat_sessions/s1/messages/m2'), {
      from_user_id: ALICE, to_user_id: BOB, message_content: 'hello',
      obfuscated_content: 'h****', displayed: false, timestamp: new Date(),
    }));
    // Impersonating the other member must fail.
    await assertFails(setDoc(doc(db, 'chat_sessions/s1/messages/m3'), {
      from_user_id: BOB, to_user_id: ALICE, message_content: 'not me',
      obfuscated_content: '', displayed: false, timestamp: new Date(),
    }));
  });

  test('an outsider is denied the session and its messages', async () => {
    await seedUsers(); await seedChat();
    const db = env.authenticatedContext(CAROL).firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertFails(getDoc(doc(db, 'chat_sessions/s1')));
    await assertFails(getDoc(doc(db, 'chat_sessions/s1/messages/m1')));
    await assertFails(setDoc(doc(db, 'chat_sessions/s1/messages/x'), {
      from_user_id: CAROL, to_user_id: ALICE, message_content: 'let me in',
      obfuscated_content: '', displayed: false, timestamp: new Date(),
    }));
  });

  test('message text is immutable but the displayed flag can be set', async () => {
    await seedUsers(); await seedChat();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, updateDoc, deleteDoc } = firestore;
    await assertSucceeds(updateDoc(doc(db, 'chat_sessions/s1/messages/m1'), { displayed: true }));
    await assertFails(updateDoc(doc(db, 'chat_sessions/s1/messages/m1'), { message_content: 'edited' }));
    await assertFails(deleteDoc(doc(db, 'chat_sessions/s1/messages/m1')));
  });

  test('the chat pairing cannot be reassigned', async () => {
    await seedUsers(); await seedChat();
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, updateDoc } = firestore;
    await assertSucceeds(updateDoc(doc(db, 'chat_sessions/s1'), { active: false }));
    await assertFails(updateDoc(doc(db, 'chat_sessions/s1'), { user2_id: CAROL }));
  });

  // ---- invites ---------------------------------------------------------------------------
  test('invites are visible to sender and recipient, and to nobody else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      await setDoc(doc(ctx.firestore(), 'invites/i1'), {
        from_user_id: ALICE, to_user_email: 'bob@example.com', status: 'pending',
        timestamp: new Date(), created_at: new Date(), updated_at: new Date(),
      });
    });
    const { doc, getDoc, updateDoc } = firestore;
    await assertSucceeds(getDoc(doc(env.authenticatedContext(ALICE).firestore(), 'invites/i1')));
    const bobDb = env.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
    await assertSucceeds(getDoc(doc(bobDb, 'invites/i1')));
    await assertSucceeds(updateDoc(doc(bobDb, 'invites/i1'), { status: 'accepted' }));
    // An unrelated signed-in user sees nothing.
    await assertFails(getDoc(doc(env.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore(), 'invites/i1')));
    // Neither party may rewrite who the invite is from.
    await assertFails(updateDoc(doc(bobDb, 'invites/i1'), { from_user_id: BOB }));
  });

  test('an unrelated top-level collection is denied', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc } = firestore;
    await assertFails(setDoc(doc(db, 'somethingElse/doc1'), { a: 1 }));
  });
});
