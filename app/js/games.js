/* Games list (mirrors legacy games_list.html): grade → game cards.
   Card markup, icon/colour per slug, and the click-to-play behaviour follow the legacy
   template; the target is a static URL instead of the Flask /games/play/<slug> route. */
import { GAMES } from './games-data.js';
import { param, isValidGrade } from './flow.js';

function card(game, grade) {
  const col = document.createElement('div');
  col.className = 'col-lg-3 col-md-4 col-sm-6';
  col.innerHTML = `
    <div class="card h-100 topic-card">
      <div class="card-body text-center">
        <i class="fas ${game.icon} fa-4x text-${game.color} mb-3"></i>
        <h5 class="card-title"></h5>
        <p class="card-text"></p>
      </div>
    </div>`;
  // Set as text, not HTML — names/descriptions are data, not markup.
  col.querySelector('.card-title').textContent = game.name;
  col.querySelector('.card-text').textContent = game.description;
  col.querySelector('.card').addEventListener('click', () => {
    location.href = `pages/game.html?game=${encodeURIComponent(game.slug)}&grade=${grade}`;
  });
  return col;
}

function init(root) {
  const grade = Number(param('grade'));
  if (!isValidGrade(grade)) { location.replace('index.html'); return; }

  document.getElementById('nn-games-title').textContent = `Grade ${grade} - Select a Game`;
  document.getElementById('nn-back-topics').href = `pages/topics.html?grade=${grade}`;

  const grid = root.querySelector('#nn-games-grid');
  grid.innerHTML = '';
  for (const game of GAMES) grid.appendChild(card(game, grade));
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-games');
  if (root) init(root);
});
