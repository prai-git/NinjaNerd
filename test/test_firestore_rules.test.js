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
    firestore = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js')
      .catch(() => import('firebase/firestore'));
  });

  after(async () => { if (env) await env.cleanup(); });

  const { assertSucceeds, assertFails } = rulesTesting ?? {};

  test('a user can write and read their own attempts', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc, getDoc } = firestore;
    const ref = doc(db, `users/${ALICE}/attempts/a1`);
    await assertSucceeds(setDoc(ref, {
      questionId: 'math_g4_x_q1', correct: true, grade: 4, subject: 'math',
      subtopic: 'Fractions', ts: new Date(),
    }));
    await assertSucceeds(getDoc(ref));
  });

  test('a user cannot read another user\'s data', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      await setDoc(doc(ctx.firestore(), `users/${BOB}/attempts/b1`), { correct: true });
    });
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, getDoc } = firestore;
    await assertFails(getDoc(doc(db, `users/${BOB}/attempts/b1`)));
  });

  test('a user cannot write into another user\'s data', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc } = firestore;
    await assertFails(setDoc(doc(db, `users/${BOB}/attempts/x`), { correct: false }));
  });

  test('unauthenticated requests are denied', async () => {
    const db = env.unauthenticatedContext().firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertFails(getDoc(doc(db, `users/${ALICE}/attempts/a1`)));
    await assertFails(setDoc(doc(db, `users/${ALICE}/attempts/a2`), { correct: true }));
  });

  test('a non-participant is denied a collaboration room and its messages', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      await setDoc(doc(ctx.firestore(), 'collaboration/room1'), {
        participants: [BOB], createdBy: BOB, createdAt: new Date(),
      });
      await setDoc(doc(ctx.firestore(), 'collaboration/room1/messages/m1'), {
        senderUid: BOB, text: 'hi', ts: new Date(),
      });
    });
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertFails(getDoc(doc(db, 'collaboration/room1')));
    await assertFails(getDoc(doc(db, 'collaboration/room1/messages/m1')));
    await assertFails(setDoc(doc(db, 'collaboration/room1/messages/m2'),
      { senderUid: ALICE, text: 'let me in', ts: new Date() }));
  });

  test('a participant can read the room and post as themselves only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { doc, setDoc } = firestore;
      await setDoc(doc(ctx.firestore(), 'collaboration/room2'), {
        participants: [ALICE, BOB], createdBy: BOB, createdAt: new Date(),
      });
    });
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, getDoc, setDoc } = firestore;
    await assertSucceeds(getDoc(doc(db, 'collaboration/room2')));
    await assertSucceeds(setDoc(doc(db, 'collaboration/room2/messages/m1'),
      { senderUid: ALICE, text: 'hello', ts: new Date() }));
    // Impersonating another participant must fail.
    await assertFails(setDoc(doc(db, 'collaboration/room2/messages/m2'),
      { senderUid: BOB, text: 'not me', ts: new Date() }));
  });

  test('messages are immutable', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, updateDoc, deleteDoc } = firestore;
    await assertFails(updateDoc(doc(db, 'collaboration/room2/messages/m1'), { text: 'edited' }));
    await assertFails(deleteDoc(doc(db, 'collaboration/room2/messages/m1')));
  });

  test('an unrelated top-level collection is denied', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const { doc, setDoc } = firestore;
    await assertFails(setDoc(doc(db, 'somethingElse/doc1'), { a: 1 }));
  });
});
