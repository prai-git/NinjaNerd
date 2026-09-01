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
