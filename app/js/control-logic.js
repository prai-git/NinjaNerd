/* Control Logic lesson list (prompt 20). Mirrors games.js: grade → lesson cards.

   The nav flow copies Games rather than the subject flow — topics → control-logic → lesson.
   explore.html is skipped on purpose: it exists only to ask "Learn or Practice?", and there is
   no Practice here, so the question is meaningless. */
import { LESSONS, MIN_GRADE } from './control-logic-data.js';
import { param, isValidGrade } from './flow.js';

function card(lesson, grade, index) {
  const col = document.createElement('div');
  col.className = 'col-lg-3 col-md-4 col-sm-6';
  col.innerHTML = `
    <div class="card h-100 topic-card">
      <div class="card-body text-center">
        <i class="fas ${lesson.icon} fa-4x text-${lesson.color} mb-3"></i>
        <h5 class="card-title"></h5>
        <p class="card-text"></p>
        <span class="badge bg-light text-secondary"></span>
      </div>
    </div>`;
  // Set as text, not HTML — names and descriptions are data, not markup.
  col.querySelector('.card-title').textContent = lesson.name;
  col.querySelector('.card-text').textContent = lesson.description;
  // The lessons build on each other, so the order is part of the content.
  col.querySelector('.badge').textContent = `Lesson ${index + 1} of ${LESSONS.length}`;
  col.querySelector('.card').addEventListener('click', () => {
    location.href = `pages/lesson.html?lesson=${encodeURIComponent(lesson.slug)}&grade=${grade}`;
  });
  return col;
}

function init(root) {
  const grade = Number(param('grade'));
  // Below MIN_GRADE the topic is not offered at all, so a hand-typed URL goes home rather
  // than rendering a tile the topics page deliberately hid.
  if (!isValidGrade(grade) || grade < MIN_GRADE) { location.replace('index.html'); return; }

  document.getElementById('nn-cl-title').textContent = `Grade ${grade} - Control Logic`;
  document.getElementById('nn-back-topics').href = `pages/topics.html?grade=${grade}`;

  const grid = root.querySelector('#nn-cl-grid');
  grid.innerHTML = '';
  LESSONS.forEach((lesson, i) => grid.appendChild(card(lesson, grade, i)));
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-control-logic');
  if (root) init(root);
});
