/* Persistence (prompt 08).

   Two halves. The legacy statistics computation lives in stats-calc.js with no imports, so it
   is genuinely executed here — it decides which grade a child is shown and what their scores
   say, and getting it wrong is silent. The Firestore write path in data.js imports the SDK
   over https, which Node cannot resolve, so that half is checked as text; the behavioural
   cases run against the emulator in CI. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS, selectGrade, percentagesFor } from '../app/js/stats-calc.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const data = read('app/js/data.js');

const row = (topic, grade, correct) => ({ topic, grade, correct });

/* ---------------------------------------------------- the legacy computation -- */

test('the displayed grade is the one with the most MATH answers', () => {
  // obs_app.py:966 counts ONLY math when choosing the grade — not overall volume.
  const history = [
    row('math', 3, true), row('math', 3, false),
    row('math', 5, true),
    row('science', 5, true), row('science', 5, true), row('science', 5, true),
  ];
  assert.equal(selectGrade(history), 3, 'grade 3 has more math, despite grade 5 having more rows');
});

test('with no math answered at all, the grade defaults to 1', () => {
  // Legacy: `selected_grade = 1` when grade_math_counts is empty. A child who has only done
  // science still gets a page rather than an error.
  assert.equal(selectGrade([row('science', 4, true), row('english', 6, false)]), 1);
  assert.equal(selectGrade([]), 1);
});

test('percentages are computed within the selected grade only', () => {
  const history = [
    row('math', 3, true), row('math', 3, true), row('math', 3, false), // grade 3: 2/3
    row('math', 5, false),                                             // different grade
    row('english', 3, true),                                           // grade 3: 1/1
  ];
  const pct = percentagesFor(history, 3);
  assert.ok(Math.abs(pct.math - 66.6667) < 0.01, `math was ${pct.math}`);
  assert.equal(pct.english, 100);
  assert.equal(pct.science, 0, 'a topic with no answers scores 0, it is not omitted');
});

test('every topic always appears, so the chart keeps its bars', () => {
  const pct = percentagesFor([row('math', 2, true)], 2);
  assert.deepEqual(Object.keys(pct).sort(), [...TOPICS].sort());
});

test('grade is compared numerically, not by string', () => {
  // History rows may carry grade as a number or a string depending on the writer.
  const pct = percentagesFor([{ topic: 'math', grade: '4', correct: true }], 4);
  assert.equal(pct.math, 100);
});

test('history and geography are gone; three topics remain', () => {
  assert.deepEqual(TOPICS, ['math', 'english', 'science']);
});

/* --------------------------------------------------------- the write path -- */

test('an attempt records exactly the seven legacy columns', () => {
  // obs_app.py question_record: question, user_answer, correct, topic, subtopic, grade, timestamp.
  for (const field of ['question', 'user_answer', 'correct', 'topic', 'subtopic', 'grade',
    'timestamp']) {
    assert.ok(data.includes(`${field}:`), `history write must include ${field}`);
  }
  // `subject` was the invented name; the legacy column is `topic`.
  assert.doesNotMatch(data, /^\s*subject:/m, 'the legacy column is `topic`, not `subject`');
});

test('history is appended, never written to a known id', () => {
  /* The rules allow create and forbid update/delete. setDoc onto an id the client chose would
     be an update the moment that id repeated, and would be rejected. */
  assert.match(data, /batch\.set\(doc\(historyCol/, 'append with a generated id');
  assert.doesNotMatch(data, /setDoc\(\s*doc\(historyCol/, 'never setDoc onto a history id');
});

test('history and statistics are written atomically, as legacy did', () => {
  // Legacy: db.update_user_history_and_statistics — one transaction. If they can diverge,
  // questions_attempted drifts away from the actual number of history rows.
  assert.match(data, /writeBatch\(db\)/);
  assert.match(data, /batch\.commit\(\)/);
});

test('statistics increments and unions rather than overwriting', () => {
  assert.match(data, /questions_attempted:\s*increment\(1\)/);
  assert.match(data, /arrayUnion\(topic\)/, 'topics_covered is a set, matching legacy');
  assert.match(data, /\{ merge: true \}/, 'must not clobber last_login');
});

test('writes verify the Firebase user directly, not the display cache', () => {
  /* flow.js gates the UI from window.NNAuth, which anyone can edit in localStorage. That is
     fine for deciding what to draw and useless as a guard on a write. */
  assert.match(data, /auth\.currentUser/, 'must consult the SDK, not the cache');
  assert.match(data, /emailVerified/, 'and refuse an unverified user');
  assert.doesNotMatch(data, /NNAuth/, 'the display cache must not gate persistence');
});

test('a failed write never throws into the quiz', () => {
  // A child mid-practice must not be stopped by a network blip.
  assert.match(data, /catch \(e\)/);
  assert.match(data, /saved: false/, 'failure is reported by return value, not an exception');
});

test('there is no offline replay queue', () => {
  /* An offline queue nobody asked for is somewhere for stale answers to hide and resurface out
     of order. The original prompt specified one; it was dropped deliberately. */
  // Match actual USE, not the word: the file comments on why the queue was dropped.
  assert.doesNotMatch(data, /localStorage\s*\.\s*(set|get|remove)Item/,
    'no local queue of unsent answers');
});

test('the practice flow supplies the fields the legacy record needs', () => {
  const practice = read('app/js/practice.js');
  assert.match(practice, /question:\s*item\.question/, 'the question TEXT, not just an id');
  assert.match(practice, /userAnswer:\s*item\.options\[choice\]/, 'the chosen option TEXT');
  assert.match(practice, /topic:\s*meta\.subject/, 'the subject, as legacy `topic`');
});

test('sign-in stamps last_login, which Audit reads', () => {
  assert.match(data, /last_login/);
  assert.match(read('app/js/auth.js'), /touchLastLogin/, 'login must stamp it');
});

test('the statistics page mirrors the legacy view', () => {
  const html = read('app/pages/statistics.html');
  const js = read('app/js/statistics.js');
  assert.match(html, /Statistics for Grade/, 'legacy header');
  assert.match(html, /col-md-10/, 'legacy card width');
  assert.match(js, /No Statistics Available/, 'legacy empty state');
  assert.match(js, /fa-chart-bar fa-5x/, 'legacy empty-state icon');
  /* Legacy charted five topics. "history" is a legitimate word here — it names the Firestore
     collection — so assert on the SUBJECT list rather than the text. */
  assert.doesNotMatch(js, /geography/i, 'geography is out of scope');
  assert.equal(TOPICS.length, 3, 'three subjects are charted, not the legacy five');
});

/* ---- MASTERY (2026-09-01, owner request) -------------------------------------------------
   A question answered CORRECTLY is not served again until the child has worked through the
   whole subtopic; then the list resets and questions may repeat. */

test('the progress key identifies one grade+subject+subtopic document', async () => {
  const { progressKeyFor } = await import('../app/js/stats-calc.js');
  assert.equal(progressKeyFor(5, 'math', 'financial_literacy'), 'g5_math_financial_literacy');
  assert.equal(progressKeyFor('3', 'science', 'matter_energy'), 'g3_science_matter_energy');
});

test('the progress key refuses anything that is not a real coordinate', async () => {
  const { progressKeyFor } = await import('../app/js/stats-calc.js');
  // A junk key would write a child's mastery to a document nothing ever reads back.
  for (const bad of [
    [0, 'math', 'x'], [7, 'math', 'x'], [null, 'math', 'x'], ['abc', 'math', 'x'],
    [3, 'history', 'x'], [3, '', 'x'], [3, 'math', ''], [3, 'math', null],
    [3, 'math', 'Bad-Slug'], [3, 'math', 'a/b'], [3, 'math', '../escape'],
  ]) {
    assert.equal(progressKeyFor(...bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('every real subtopic produces a usable Firestore document id', async () => {
  const { progressKeyFor } = await import('../app/js/stats-calc.js');
  const { SUBTOPICS } = await import('../app/js/subtopics-data.js');
  let checked = 0;
  for (const subject of Object.keys(SUBTOPICS)) {
    for (const group of Object.keys(SUBTOPICS[subject])) {
      for (const s of SUBTOPICS[subject][group]) {
        for (const grade of [1, 6]) {
          const key = progressKeyFor(grade, subject, s.id);
          assert.ok(key, `${subject}/${s.id} must produce a key`);
          // Firestore document id rules: no slashes, not "." or "..", 1500 bytes max.
          assert.doesNotMatch(key, /\//);
          assert.ok(key.length < 1500);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 50, `expected the whole taxonomy, checked ${checked}`);
});

test('mastery is written only on a correct answer, and only by union', () => {
  const src = read('app/js/data.js');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /correct && questionId\) \? progressKeyFor/,
    'a wrong answer must leave the question in the pool');
  assert.match(code, /mastered: arrayUnion\(/,
    'union, so re-answering a mastered question cannot duplicate the id');
  // It must ride the SAME batch as history + statistics, not cost an extra round trip.
  const fn = code.slice(code.indexOf('export async function recordAttempt'));
  const body = fn.slice(0, fn.indexOf('await commitWithOneRetry'));
  assert.match(body, /batch\.set\(progressRef/, 'the mastery write must be batched');
});

test('history records the item id alongside the question text, not instead of it', () => {
  const src = read('app/js/data.js');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /question: String\(question/, 'Audit renders the text the child saw');
  assert.match(code, /question_id: String\(questionId\)/, 'and the id, for later analysis');
  // Optional: records written before question_id existed must stay valid.
  assert.match(code, /\.\.\.\(questionId \? \{ question_id/,
    'question_id must be omitted rather than written empty');
});

test('a failed mastery read never blocks practice', () => {
  const src = read('app/js/data.js');
  const fn = src.slice(src.indexOf('export async function getMastered'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /catch/, 'must swallow its own errors');
  assert.match(body, /return new Set\(\)/, 'and degrade to "nothing mastered"');

  const practice = read('app/js/practice.js');
  const sel = practice.slice(practice.indexOf('async function selectPool'));
  assert.match(sel.slice(0, sel.indexOf('\n}\n')), /catch[\s\S]*pool: source/,
    'practice must serve the full set if mastery is unavailable');
});

test('exhausting a subtopic resets it instead of serving an empty quiz', () => {
  const practice = read('app/js/practice.js');
  const sel = practice.slice(practice.indexOf('async function selectPool'));
  const body = sel.slice(0, sel.indexOf('\n}\n'));
  assert.match(body, /remaining\.length/, 'filter to what is left');
  assert.match(body, /resetMastered/, 'and reset once nothing is left');
  assert.match(body, /wasReset: true/, 'so the page can say why questions are repeating');
  // The child must be told, not left thinking it is a bug.
  assert.match(practice, /answered every question in this subtopic correctly/i);
});

/* GRADE RANGE (2026-09-02, grade 7 added).

   The bound lives twice on purpose: flow.js holds MAX_GRADE for the seven browser page
   modules, and stats-calc.js holds its own copy because it is deliberately import-free so
   Node can execute it here. Two copies drift silently — the statistics roll-up would simply
   stop looking at the top grade and a child's chart would go blank with no error — so the
   agreement is asserted rather than assumed.

   Before this, SEVEN modules each carried a literal `grade >= 1 && grade <= 6`; adding a
   grade meant finding all seven. That is exactly the bug class this pair of tests closes. */
test('stats-calc and flow agree on the highest grade served', async () => {
  const { MAX_GRADE: statsMax } = await import('../app/js/stats-calc.js');
  const { MAX_GRADE: flowMax } = await import('../app/js/flow.js');
  assert.equal(statsMax, flowMax,
    'stats-calc.js MAX_GRADE must match flow.js MAX_GRADE — the roll-up loop uses it');
  assert.equal(flowMax, 7, 'the site serves grades 1-7');
});

test('the statistics roll-up scans every grade the site serves', async () => {
  const { MAX_GRADE, rollupKeyFor, gradeFromRollup } = await import('../app/js/stats-calc.js');
  // A child whose only maths answers are at the top grade must be shown that grade, not 1.
  const summary = { attempts_by: { [rollupKeyFor(MAX_GRADE, 'math')]: 4 } };
  assert.equal(gradeFromRollup(summary), MAX_GRADE,
    'the loop must reach MAX_GRADE, or the top grade is invisible to Statistics');
});

test('isValidGrade accepts 1 through MAX_GRADE and nothing outside it', async () => {
  const { isValidGrade, MIN_GRADE, MAX_GRADE } = await import('../app/js/flow.js');
  for (let g = MIN_GRADE; g <= MAX_GRADE; g++) assert.ok(isValidGrade(g), `grade ${g}`);
  for (const bad of [0, MAX_GRADE + 1, -1, 1.5, NaN, null, undefined, '3']) {
    assert.ok(!isValidGrade(bad), `must reject ${String(bad)}`);
  }
});

/* Every page that reads a grade from the URL must use the shared guard. A page that keeps its
   own comparison is the failure this refactor exists to prevent: it would 404 grade 7 while
   every other page served it. */
test('no page module carries its own grade bound', () => {
  for (const f of ['topics', 'subtopics', 'explore', 'learn', 'practice', 'games', 'game']) {
    const src = read(`app/js/${f}.js`);
    assert.ok(!/grade\s*<=\s*\d/.test(src), `${f}.js must not hardcode an upper grade bound`);
    assert.match(src, /isValidGrade/, `${f}.js must use the shared guard`);
  }
});
