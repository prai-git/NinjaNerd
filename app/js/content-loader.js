/* Content loader (prompt 04). Pure, injectable-fetch helpers the flow uses to
   discover subjects/subtopics and load MCQ JSON from the static site.

   GitHub Pages has no directory listing, so discovery is driven by the build-time
   manifest (app/content/questions/en/manifest.json). Learn and Practice are two
   modes over the SAME items, so there is no tier filtering. Every function takes
   an optional fetchImpl so tests can run without a network. */

const ROOT = 'content/questions';
const LANG = 'en'; // English only.

export function manifestPath() {
  return `${ROOT}/${LANG}/manifest.json`;
}

export function contentPath({ grade, subject, slug }) {
  return `${ROOT}/${LANG}/${grade}/${subject}/${slug}.json`;
}

// Subjects for a grade that have any authored content, in a stable order.
export function subjectsFor(manifest, grade) {
  const byGrade = manifest?.grades?.[String(grade)] || {};
  return Object.keys(byGrade).filter((s) => (byGrade[s] || []).length > 0).sort();
}

// Subtopics for a grade+subject: [{ subtopic, slug, count }].
export function subtopicsFor(manifest, grade, subject) {
  return (manifest?.grades?.[String(grade)]?.[subject] || [])
    .map((s) => ({ subtopic: s.subtopic, slug: s.slug, count: s.count || 0 }));
}

// Fetch + parse JSON. Returns null on any missing/failed/invalid response
// rather than throwing, so callers can degrade gracefully.
export async function loadJson(path, fetchImpl = (typeof fetch !== 'undefined' ? fetch : null)) {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(path);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* The manifest is fetched with `cache: 'no-cache'`, which forces a conditional request: the
   browser still sends its ETag and the server still answers 304 when nothing changed, so this
   costs almost nothing. Without it the manifest is held for GitHub Pages' 10-minute
   max-age, and for those ten minutes a freshly deployed subtopic still renders as empty --
   which is exactly how it looked after the content was authored. The per-subtopic JSON files
   stay normally cached; only this index needs to be current. */
export async function loadManifest(fetchImpl) {
  const impl = fetchImpl
    || (typeof fetch !== 'undefined' ? (p) => fetch(p, { cache: 'no-cache' }) : null);
  return loadJson(manifestPath(), impl);
}

// Load one subtopic's items. Missing file -> [].
export async function loadSubtopic({ grade, subject, slug }, fetchImpl) {
  const items = await loadJson(contentPath({ grade, subject, slug }), fetchImpl);
  return items || [];
}
