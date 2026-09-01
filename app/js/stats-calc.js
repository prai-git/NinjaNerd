/* The legacy statistics computation, from obs_app.py:952.

   Kept in its own module with NO imports so it can be unit-tested. data.js imports the
   Firebase SDK from Google's CDN over https, which Node cannot resolve, so anything living
   there is only testable as text. This is the part most worth testing properly: it decides
   which grade a child is shown and what their scores say.

   Nothing here is stored. `statistics/summary` holds counters only (questions_attempted,
   topics_covered, last_login); percentages are recomputed from history on every view, exactly
   as the Flask route did. */

// Legacy listed math, english, science, history, geography. The last two are out of scope.
export const TOPICS = ['math', 'english', 'science'];

/* Which grade the page shows.

   Legacy picked the grade with the MOST MATH answers — not the most recent, and not the most
   answers overall. Maths alone decides it. With no math answered at all it defaults to grade
   1, so a child who has only done science still sees a populated page rather than an error. */
export function selectGrade(history) {
  const counts = {};
  for (const h of history || []) {
    if (h && h.topic === 'math' && h.grade) {
      counts[h.grade] = (counts[h.grade] || 0) + 1;
    }
  }
  const grades = Object.keys(counts);
  if (grades.length === 0) return 1; // legacy default
  // Ties resolve to the lowest grade, since Object.keys returns numeric-like keys ascending.
  return Number(grades.reduce((best, g) => (counts[g] > counts[best] ? g : best), grades[0]));
}

/* Percent correct per topic, WITHIN one grade. A topic with no answers at that grade scores 0
   rather than being omitted, so the chart always has the same bars. */
export function percentagesFor(history, grade) {
  const out = {};
  for (const topic of TOPICS) {
    const rows = (history || []).filter(
      (h) => h && h.topic === topic && Number(h.grade) === Number(grade),
    );
    out[topic] = rows.length
      ? (rows.filter((h) => h.correct).length / rows.length) * 100
      : 0;
  }
  return out;
}

/* ---- the same numbers, from the roll-up instead of from history --------------------------

   Reading history to compute statistics costs one Firestore document read PER ANSWERED
   QUESTION -- up to 1000 per page view, for a page a child can refresh at will. That is the
   largest read amplifier in the app and it grows with every question a student answers, so it
   gets worse precisely as the site succeeds.

   data.js therefore increments `attempts_by` / `correct_by` (keyed g<grade>_<topic>) in the
   same atomic batch as the history row. Same numbers, ONE document read.

   Percentages are still computed, never stored -- prompt 08's rule. What is stored is counts,
   which is what the legacy SQLite queries counted at read time. */

export function rollupKeyFor(grade, topic) {
  return `g${Number(grade)}_${topic}`;
}

/* Can the roll-up be trusted to be complete?

   Accounts that answered questions BEFORE the roll-up existed have history rows with no
   counters behind them, so the roll-up would under-report. `questions_attempted` has been
   incremented on every attempt since prompt 08, so comparing it against the roll-up total
   detects exactly that case -- and self-heals, without a migration or a version flag: the
   moment the two agree, the cheap path takes over.

   Deliberately strict. If the two disagree at all, fall back to history and be right. */
export function rollupIsComplete(summary) {
  if (!summary || !summary.attempts_by) return false;
  const total = Object.values(summary.attempts_by)
    .reduce((n, v) => n + (Number(v) || 0), 0);
  return total > 0 && total === Number(summary.questions_attempted);
}

// selectGrade's rule, against the roll-up: the grade with the most MATH answers, default 1.
export function gradeFromRollup(summary) {
  const by = (summary && summary.attempts_by) || {};
  let best = 0;
  let bestGrade = 1;
  for (let g = 1; g <= 6; g++) {
    const n = Number(by[rollupKeyFor(g, 'math')]) || 0;
    // Strictly greater, so ties resolve to the LOWEST grade — matching selectGrade().
    if (n > best) { best = n; bestGrade = g; }
  }
  return bestGrade;
}

// percentagesFor's rule, against the roll-up.
export function percentagesFromRollup(summary, grade) {
  const att = (summary && summary.attempts_by) || {};
  const cor = (summary && summary.correct_by) || {};
  const out = {};
  for (const topic of TOPICS) {
    const k = rollupKeyFor(grade, topic);
    const n = Number(att[k]) || 0;
    out[topic] = n ? ((Number(cor[k]) || 0) / n) * 100 : 0;
  }
  return out;
}
