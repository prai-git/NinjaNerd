/* Maths rendering (KaTeX).

   260 authored questions carry LaTeX — `$2.5 \times 10^{-3}$`, `$2{,}500$` — and shipped
   showing the raw source, backslashes and all. renderInline in flow.js deliberately left
   `$…$` alone with a note that KaTeX was "a later polish"; this is that polish.

   KaTeX is loaded from a CDN as classic scripts (the site is static, no bundler), pinned so a
   future release cannot ship itself to users. This module only calls it: pages that show
   questions include the CDN tags, and every place that injects question text calls
   renderMath() on the container afterwards.

   Degrades honestly. If the CDN is blocked the numbers are still readable as LaTeX source —
   ugly, but nothing disappears and nothing throws. */

/* A bare `$` is deliberately NOT a delimiter.

   The content uses `$` for currency as well as maths — "They earn $4,500 per month. They pay
   $675 for food" — and KaTeX would pair those two and render the sentence between them as
   maths. 53 items in the corpus do this. The build (tools/lib/mathnorm.mjs) rewrites genuine
   inline maths to \(...\), which has no other meaning, so currency can never be mistaken
   for a delimiter. */
const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '\\[', right: '\\]', display: true },
];

export function mathAvailable() {
  return typeof window !== 'undefined' && typeof window.renderMathInElement === 'function';
}

/* Typeset every LaTeX span inside `el`. Safe to call on content with no maths, and safe to
   call before KaTeX has loaded — it simply does nothing. */
export function renderMath(el) {
  if (!el || !mathAvailable()) return false;
  try {
    window.renderMathInElement(el, {
      delimiters: DELIMITERS,
      /* Never throw on a malformed expression: one bad `$` in one authored question must not
         blank the page. KaTeX renders the offending source in red instead, which is also a
         useful signal during the content correctness sweep. */
      throwOnError: false,
      errorColor: '#cc0000',
      // Do not typeset inside code or option-letter markup.
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    });
    return true;
  } catch (e) {
    console.warn('[NinjaNerd] maths rendering failed:', e && e.message);
    return false;
  }
}
