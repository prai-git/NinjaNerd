/* Topics page (mirrors legacy topics.html): grade → subject cards.
   Public — no login required to browse. Scope: English/Math/Science + Games. */
import { loadManifest, subjectsFor } from './content-loader.js';
import { param, SUBJECTS, isValidGrade } from './flow.js';

function card({ icon, color, title, desc }, onclick) {
  const col = document.createElement('div');
  col.className = 'col-lg-3 col-md-4 col-sm-6';
  col.innerHTML = `
    <div class="card h-100 topic-card">
      <div class="card-body text-center">
        <i class="fas ${icon} fa-4x text-${color} mb-3"></i>
        <h5 class="card-title">${title}</h5>
        <p class="card-text">${desc}</p>
      </div>
    </div>`;
  col.querySelector('.card').addEventListener('click', onclick);
  return col;
}

async function init(root) {
  const grade = Number(param('grade'));
  if (!isValidGrade(grade)) { location.replace('index.html'); return; }

  document.getElementById('nn-grade-label').textContent = `Grade ${grade}`;
  const manifest = await loadManifest();
  const subjects = manifest ? subjectsFor(manifest, grade) : [];

  const grid = root.querySelector('#nn-topics-grid');
  grid.innerHTML = '';
  for (const subject of subjects) {
    const meta = SUBJECTS[subject] || { label: subject, icon: 'fa-book', color: 'secondary', desc: '' };
    grid.appendChild(card(
      { icon: meta.icon, color: meta.color, title: meta.label, desc: meta.desc },
      () => { location.href = `pages/subtopics.html?grade=${grade}&subject=${subject}`; },
    ));
  }
  // Games card (kept from the legacy app; icon/color/copy mirror topics.html).
  grid.appendChild(card(
    { icon: 'fa-gamepad', color: 'danger', title: 'Games', desc: 'Fun educational games and activities' },
    () => { location.href = `pages/games.html?grade=${grade}`; },
  ));

  if (subjects.length === 0) {
    grid.insertAdjacentHTML('afterbegin',
      '<div class="col-12"><div class="alert alert-info">No subjects available for this grade yet.</div></div>');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-topics');
  if (root) init(root);
});
