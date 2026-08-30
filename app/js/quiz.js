/* Pure quiz randomization (prompt 04) — no DOM, unit-tested directly.
   Deterministic mulberry32 RNG so shuffles are reproducible in tests. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates over a copy; rng() must return [0,1).
export function shuffleArray(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Shuffle an item's options and re-map correctIndex. Returns a new item.
export function shuffleOptions(item, rng = Math.random) {
  const order = shuffleArray(item.options.map((_, i) => i), rng);
  return {
    ...item,
    options: order.map((i) => item.options[i]),
    correctIndex: order.indexOf(item.correctIndex),
  };
}

// Shuffle question order + each question's options for one attempt.
export function buildAttempt(items, rng = Math.random) {
  return shuffleArray(items, rng).map((it) => shuffleOptions(it, rng));
}
