/* Subtopics page (mirrors legacy subtopics.html): grade+subject → subtopic list.
   Public — browsing does not require login. */
import { loadManifest, subtopicsFor } from './content-loader.js';
import { param, subjectLabel } from './flow.js';

async function init(root) {
  const grade = Number(param('grade'));
  const subject = param('subject');
  if (!(grade >= 1 && grade <= 6) || !subject) { location.replace('index.html'); return; }

  // Mirror legacy subtopics.html header: "{Subject} - Grade {N} Subtopics".
  document.getElementById('nn-subtopics-title').textContent =
    `${subjectLabel(subject)} - Grade ${grade} Subtopics`;
  document.getElementById('nn-back-topics').href = `pages/topics.html?grade=${grade}`;

  const manifest = await loadManifest();
  const subs = manifest ? subtopicsFor(manifest, grade, subject) : [];

  const grid = root.querySelector('#nn-subtopics-grid');
  grid.innerHTML = '';
  if (subs.length === 0) {
    grid.innerHTML = '<div class="col-12"><div class="alert alert-info">No subtopics available here yet.</div></div>';
    return;
  }
  // Legacy subtopics.html rendered a `topic-card` (text-center, fa-3x icon, title,
  // description). Legacy icon/color/description came from server metadata we don't have on
  // a static host, so we use one neutral icon and the authored question count as the blurb.
  for (const s of subs) {
    const col = document.createElement('div');
    col.className = 'col-lg-4 col-md-6 col-sm-12';
    col.innerHTML = `
      <div class="card h-100 topic-card">
        <div class="card-body text-center">
          <i class="fas fa-list-ul fa-3x text-primary mb-3"></i>
          <h5 class="card-title">${s.subtopic}</h5>
          <p class="card-text">${s.count} question${s.count === 1 ? '' : 's'}</p>
        </div>
      </div>`;
    col.querySelector('.card').addEventListener('click', () => {
      location.href = `pages/explore.html?grade=${grade}&subject=${subject}&subtopic=${encodeURIComponent(s.slug)}`;
    });
    grid.appendChild(col);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-subtopics');
  if (root) init(root);
});
