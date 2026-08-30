/* Dev-time MCQ detector + converter (prompt 03). Pure logic; the OpenAI call is
   injected as `llm` so tests mock it (no network). The correct option is ALWAYS
   the verbatim answer-key text — the model only ever supplies distractors. */

const LETTERS = 'ABCD';

export function isAlreadyMcq(q) {
  return Array.isArray(q.options) && q.options.length >= 3;
}

export function letterToIndex(letter) {
  return LETTERS.indexOf(String(letter || '').toUpperCase());
}

// Split a free-response item that bundles multiple parts (a), (b), (c) into
// separate items. Already-MCQ items and single-part items pass through unchanged.
export function splitMultiPart(q) {
  if (isAlreadyMcq(q)) return [q];
  const text = q.text || '';
  const re = /(?:^|\n)\s*\(?([a-d])\)\s+/g;
  const marks = [...text.matchAll(re)];
  if (marks.length < 2) return [q];
  const parts = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    parts.push({ ...q, options: [], text: text.slice(start, end).trim(), part: marks[i][1] });
  }
  return parts;
}

// Deterministic shuffle so builds are reproducible and tests are stable.
function shuffleSeeded(arr, seed) {
  const a = arr.slice();
  let s = (Number(seed) || 1) * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 233280 + 1) % 233281;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Returns { options[], correctIndex, source, needsReview, reviewReason? }.
   - already-MCQ: options verbatim, correctIndex from answer letter.
   - free-response: correct = verbatim answer text; llm supplies 3 distractors. */
export async function buildItem(q, answer, opts = {}) {
  const { llm } = opts;

  if (isAlreadyMcq(q)) {
    const options = q.options.map((o) => o.text);
    let idx = answer && answer.letter ? letterToIndex(answer.letter) : -1;
    // Fallback: some answer keys state the value, not a letter — match it.
    if (idx < 0 && answer && answer.text) {
      const norm = (s) => clean(s).toLowerCase().replace(/\s+/g, ' ');
      idx = options.findIndex((o) => norm(o) === norm(answer.text));
    }
    const bad = idx < 0 || idx >= options.length;
    return {
      options,
      correctIndex: bad ? 0 : idx,
      source: 'authored',
      needsReview: bad,
      ...(bad ? { reviewReason: 'no valid answer letter in key' } : {}),
    };
  }

  const correctText = answer && answer.text ? clean(answer.text) : null;
  if (!correctText) {
    return { options: [], correctIndex: -1, source: 'freeresponse', needsReview: true, reviewReason: 'no answer-key text' };
  }
  if (typeof llm !== 'function') {
    return { options: [], correctIndex: -1, source: 'freeresponse', needsReview: true, reviewReason: 'no LLM available (dev-only conversion)' };
  }

  let distractors;
  try {
    distractors = await llm({ question: q.text, correct: correctText });
  } catch (e) {
    return { options: [], correctIndex: -1, source: 'llm', needsReview: true, reviewReason: 'LLM error: ' + e.message };
  }

  distractors = (distractors || [])
    .map(clean)
    .filter((d) => d && d !== correctText)
    .slice(0, 3);

  if (distractors.length < 3) {
    return { options: [correctText, ...distractors], correctIndex: 0, source: 'llm', needsReview: true, reviewReason: 'insufficient distractors' };
  }

  const combined = shuffleSeeded([correctText, ...distractors], q.number || 1);
  return { options: combined, correctIndex: combined.indexOf(correctText), source: 'llm', needsReview: false };
}

function clean(s) {
  return String(s == null ? '' : s).trim();
}
