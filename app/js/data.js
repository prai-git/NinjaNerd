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
    // arrayUnion gives the "add topic if not already covered" set semantics legacy did by hand.
    batch.set(summaryRef(user.uid), {
      questions_attempted: increment(1),
      topics_covered: topic ? arrayUnion(topic) : arrayUnion(),
      updated_at: serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return { saved: true };
  } catch (e) {
    console.warn('[NinjaNerd] could not save attempt:', e && e.code);
    return { saved: false, reason: (e && e.code) || 'error' };
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
export { TOPICS, selectGrade, percentagesFor } from './stats-calc.js';
