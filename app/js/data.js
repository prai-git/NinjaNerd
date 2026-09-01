/* Persistence (prompt 08). Writes practice history and statistics to Firestore.

   Mirrors the legacy write in obs_app.py, which saved seven fields per answered question and
   updated statistics in the SAME transaction (db.update_user_history_and_statistics):

       users/{uid}/history/{autoId} = {
         question,      // the question TEXT, not an id
         user_answer,   // the chosen option TEXT
         correct,
         topic,         // 'math' | 'english' | 'science'   (legacy column name)
         subtopic,
         grade,
         timestamp,
       }
       users/{uid}/statistics/summary = {
         questions_attempted,   // +1 per answer
         topics_covered[],      // topic added if not already present
         last_login,
       }

   Storing the question and answer TEXT rather than ids is deliberate: it lets Statistics and
   Audit render history without loading the content JSON, and keeps old records readable if a
   question is later reworded. */

import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, writeBatch,
  query, orderBy, limit as fsLimit,
  serverTimestamp, increment, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

import { auth, db } from './firebase-init.js';
import { TOPICS } from './stats-calc.js';

const historyCol = (uid) => collection(db, 'users', uid, 'history');
const summaryRef = (uid) => doc(db, 'users', uid, 'statistics', 'summary');

/* The UI gate in flow.js reads the display cache, which anyone can edit, so it decides what is
   drawn and nothing more. Writes check the Firebase user directly. `auth.currentUser` is the
   SDK's own state, not our cache, and it is what the rules will be evaluated against. */
function writableUser() {
  const u = auth.currentUser;
  if (!u) return null;
  if (!u.emailVerified) return null;
  return u;
}

/* Record one answered question.

   Never throws into the quiz. A child mid-practice must not be stopped by a network blip, so
   failures are logged and reported through the return value. Deliberately no localStorage
   replay queue: an offline queue nobody asked for is somewhere for stale answers to hide and
   resurface out of order. */
export async function recordAttempt({ question, userAnswer, correct, topic, subtopic, grade }) {
  const user = writableUser();
  if (!user) {
    return { saved: false, reason: auth.currentUser ? 'unverified' : 'signed-out' };
  }
  try {
    /* Legacy wrote history and statistics atomically. A batch keeps that: either the answer is
       recorded and counted, or neither happens -- statistics can never drift from history.

       History must be an APPEND. The rules allow create and forbid update/delete, so the id is
       generated client-side with doc(collection(...)) and written with batch.set, which is the
       batch equivalent of addDoc. Never setDoc onto a known id. */
    const batch = writeBatch(db);
    batch.set(doc(historyCol(user.uid)), {
      question: String(question ?? ''),
      user_answer: String(userAnswer ?? ''),
      correct: !!correct,
      topic: topic || null,
      subtopic: subtopic || null,
      grade: Number(grade) || null,
      timestamp: serverTimestamp(),
    });
    /* arrayUnion gives the "add topic if not already covered" set semantics legacy did by hand.

       attempts_by / correct_by are a per-grade-per-topic roll-up, incremented in the SAME
       batch, so they cost nothing extra and can never drift from history. They exist so the
       Statistics page can read ONE document instead of up to a thousand history rows -- see
       rollupKey below and stats-calc.js. */
    const key = rollupKey(grade, topic);
    batch.set(summaryRef(user.uid), {
      questions_attempted: increment(1),
      topics_covered: topic ? arrayUnion(topic) : arrayUnion(),
      ...(key ? {
        attempts_by: { [key]: increment(1) },
        correct_by: { [key]: increment(correct ? 1 : 0) },
      } : {}),
      updated_at: serverTimestamp(),
    }, { merge: true });

    await commitWithOneRetry(batch);
    return { saved: true };
  } catch (e) {
    console.warn('[NinjaNerd] could not save attempt:', e && e.code);
    return { saved: false, reason: (e && e.code) || 'error' };
  }
}

/* The roll-up key. 6 grades x 3 topics = 18 possible keys, which is the bound the rules
   enforce on the map. Returns null for anything outside that, so a malformed attempt updates
   the counters not at all rather than inventing a 19th key the rules would reject -- which
   would fail the whole batch and lose the history row with it. */
export function rollupKey(grade, topic) {
  const g = Number(grade);
  if (!Number.isInteger(g) || g < 1 || g > 6) return null;
  if (!TOPICS.includes(topic)) return null;
  return `g${g}_${topic}`;
}

/* Commit, and on a retryable failure try EXACTLY once more after a short delay.

   The rules put a one-second floor between statistics writes as an abuse cap (see
   firestore.rules). Without this retry that floor would silently discard the second of two
   quick answers -- turning an anti-abuse measure into data loss for a fast student. With it,
   a genuine burst is delayed, not lost.

   Exactly one retry, with jitter, and never a loop. Unbounded retry is itself the thundering
   herd: every client that fails during an outage would come back together, repeatedly, and
   keep the outage alive. One bounded retry cannot do that. */
async function commitWithOneRetry(batch) {
  try {
    await batch.commit();
  } catch (e) {
    const code = (e && e.code) || '';
    const retryable = code === 'permission-denied'      // most likely the rate floor
      || code === 'unavailable' || code === 'deadline-exceeded' || code === 'aborted';
    if (!retryable) throw e;
    // 1.2s clears the 1s floor; the jitter keeps many clients from returning in lockstep.
    await new Promise((r) => setTimeout(r, 1200 + Math.floor(Math.random() * 400)));
    await batch.commit();
  }
}

/* Legacy set last_login on the user_statistics row at sign-in. */
export async function touchLastLogin() {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await setDoc(summaryRef(user.uid), { last_login: serverTimestamp() }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[NinjaNerd] could not update last_login:', e && e.code);
    return false;
  }
}

export async function getStatistics() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const snap = await getDoc(summaryRef(user.uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[NinjaNerd] could not read statistics:', e && e.code);
    return null;
  }
}

/* Newest first. The Statistics page needs the whole history to compute per-grade percentages,
   so the default limit is generous; callers wanting a short list pass their own. */
export async function getHistory({ limit = 1000 } = {}) {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q = query(historyCol(user.uid), orderBy('timestamp', 'desc'), fsLimit(limit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[NinjaNerd] could not read history:', e && e.code);
    return [];
  }
}

/* The legacy statistics computation lives in stats-calc.js, which imports nothing, so it can
   be unit-tested. Re-exported here so callers have one place to look. */
export { TOPICS };
export { selectGrade, percentagesFor, gradeFromRollup, percentagesFromRollup } from './stats-calc.js';
