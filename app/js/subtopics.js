/* Subtopics page — mirrors legacy obs_templates/subtopics.html.

   The subtopic LIST is the legacy taxonomy (subtopics-data.js, ported from obs_app.py
   SUBTOPICS): a fixed curated set with a name, description, FontAwesome icon and Bootstrap
   colour — 5 per subject for grades 1-5 (7 for math) and 10 for grade 6, exactly as the
   legacy route picked it. It is NOT derived from the authored content.

   The manifest supplies counts keyed by the same legacy subtopic ids, but the count is NOT
   shown: legacy rendered the icon, name and description only, and a "12 questions" badge is
   noise to a child choosing what to practise. The count is used solely to decide whether a
   subtopic has anything behind it. One with nothing still renders, greyed out and not
   clickable, so a gap stays visible rather than silently disappearing.

   Public — browsing does not require login. */
import { loadManifest } from './content-loader.js';
import { param, subjectLabel } from './flow.js';
import { subtopicsForGrade } from './subtopics-data.js';

function cardHtml(s, count) {
  const empty = count === 0;
  // Legacy card: text-center body, fa-3x icon in the subtopic's colour, name, description.
  return `
    <div class="card h-100 topic-card${empty ? ' nn-empty' : ''}"${empty ? ' aria-disabled="true"' : ''}>
      <div class="card-body text-center">
        <i class="fas ${s.icon} fa-3x text-${empty ? 'muted' : s.color} mb-3"></i>
        <h5 class="card-title">${s.name}</h5>
        <p class="card-text">${s.description}</p>
        ${empty ? '<span class="badge bg-secondary">Questions coming soon</span>' : ''}
      </div>
    </div>`;
}

async function init(root) {
  const grade = Number(param('grade'));
  const subject = param('subject');
  if (!(grade >= 1 && grade <= 6) || !subject) { location.replace('index.html'); return; }

  // Mirror legacy subtopics.html header: "{Subject} - Grade {N} Subtopics".
  document.getElementById('nn-subtopics-title').textContent =
    `${subjectLabel(subject)} - Grade ${grade} Subtopics`;
  document.getElementById('nn-back-topics').href = `pages/topics.html?grade=${grade}`;

  const subtopics = subtopicsForGrade(subject, grade);
  const grid = root.querySelector('#nn-subtopics-grid');
  grid.innerHTML = '';
  if (subtopics.length === 0) {
    grid.innerHTML = '<div class="col-12"><div class="alert alert-info">No subtopics for this subject.</div></div>';
    return;
  }

  // Counts come from the manifest; a missing manifest degrades to "coming soon" everywhere
  // rather than an empty page, so the taxonomy is always visible.
  const manifest = await loadManifest();
  const counts = {};
  for (const s of (manifest?.grades?.[String(grade)]?.[subject] || [])) {
    counts[s.subtopic] = s.count || 0;
  }

  for (const s of subtopics) {
    const count = counts[s.id] || 0;
    const col = document.createElement('div');
    col.className = 'col-lg-4 col-md-6 col-sm-12';
    col.innerHTML = cardHtml(s, count);
    if (count > 0) {
      col.querySelector('.card').addEventListener('click', () => {
        location.href =
          `pages/explore.html?grade=${grade}&subject=${subject}&subtopic=${encodeURIComponent(s.id)}`;
      });
    }
    grid.appendChild(col);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-subtopics');
  if (root) init(root);
});
