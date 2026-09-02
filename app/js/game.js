/* Game player (mirrors legacy game_detail.html).

   The legacy template branched on game.slug in Jinja to pick the icon, container/controls
   modifier classes, control list, CSS/JS includes, constructor and pause method. Here those
   come from js/games-data.js and the scripts are injected at runtime from ?game=<slug>.

   Game internals are untouched: each game defines a global class (TejasThrust, TankAttack,
   GeoDash, MotorcycleMayhem) and the scripts are plain (non-module) files loaded in order. */
import { gameBySlug } from './games-data.js';
import { param, isValidGrade } from './flow.js';

let game = null;
let meta = null;

// Load a classic <script> and resolve once it has executed. Sequential, because each
// game's game.js depends on the files listed before it in the manifest.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(el);
  });
}

function loadCss(href) {
  const el = document.createElement('link');
  el.rel = 'stylesheet';
  el.href = href;
  document.head.appendChild(el);
}

function renderControls(list) {
  const wrap = document.getElementById('nn-controls-list');
  wrap.innerHTML = '';
  for (const c of list) {
    const p = document.createElement('p');
    for (const icon of [].concat(c.icon)) {
      const i = document.createElement('i');
      i.className = `fas ${icon}`;
      p.appendChild(i);
    }
    p.appendChild(document.createTextNode(` ${c.text}`));
    wrap.appendChild(p);
  }
}

function updatePauseButton() {
  const btn = document.getElementById('pauseBtn');
  if (game && game.paused) {
    btn.innerHTML = '<i class="fas fa-play"></i> Resume';
    btn.className = 'btn btn-success btn-sm ms-2';
  } else {
    btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
    btn.className = 'btn btn-warning btn-sm ms-2';
  }
}

function showControlsAfterGameOver() {
  document.getElementById('gameControls').style.display = 'block';
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('restartBtn').style.display = 'inline-block';
}

/* Resolve a game's constructor by name.

   These are classic (non-module) scripts, and a top-level `class X {}` creates a binding in
   the global LEXICAL scope, not a property of `window` — so `window[name]` is undefined for
   all four games. The legacy template sidestepped this by naming the identifier directly
   (`new TejasThrust(...)`); we need the same scope lookup, but dynamically. `new Function`
   evaluates in global scope, so the identifier resolves. The name is ours (from games-data.js,
   reachable only via a slug that matched the manifest), never user input. */
function globalCtor(name) {
  try {
    return new Function(`return typeof ${name} === 'function' ? ${name} : null;`)();
  } catch {
    return null;
  }
}

function startGame() {
  document.getElementById('gameControls').style.display = 'none';
  document.getElementById('restartBtn').style.display = 'inline-block';

  const Ctor = globalCtor(meta.globalName);
  if (typeof Ctor !== 'function') {
    document.getElementById('gameControls').style.display = 'block';
    window.NNToast?.show?.(`${meta.name} failed to load. Please refresh the page.`, 'danger');
    return;
  }
  game = new Ctor('gameCanvas');
  game.start();
  updatePauseButton();
}

async function init() {
  meta = gameBySlug(param('game'));
  const grade = Number(param('grade'));
  if (!meta) { location.replace(`pages/games.html?grade=${isValidGrade(grade) ? grade : 1}`); return; }

  document.title = `${meta.name} - NinjaNerd`;
  document.getElementById('nn-game-name').textContent = meta.name;
  document.getElementById('nn-controls-title').textContent = meta.name;
  document.getElementById('nn-game-icon').className = `fas ${meta.icon} me-2`;
  document.getElementById('nn-back-games').href =
    `pages/games.html?grade=${isValidGrade(grade) ? grade : 1}`;

  // Per-slug modifier classes, exactly as game_detail.html applied them.
  if (meta.className) {
    document.getElementById('nn-game-container').classList.add(`${meta.className}-container`);
    document.getElementById('gameControls').classList.add(`${meta.className}-controls`);
  }
  // Legacy button-row class: geodash/mmh get their own, everything else uses tank-attack's.
  const buttonClass = (meta.slug === 'geodash' || meta.slug === 'mmh')
    ? `${meta.className}-game-buttons`
    : 'tank-attack-game-buttons';
  document.getElementById('nn-game-buttons').className = buttonClass;

  renderControls(meta.controls);

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('restartBtn').addEventListener('click', () => {
    if (game) game.stop();
    startGame();
  });
  document.getElementById('pauseBtn').addEventListener('click', () => {
    if (game) {
      game[meta.pauseMethod]();
      updatePauseButton();
    }
  });
  // Games that dispatch this keep the button label in sync with keyboard pausing.
  document.addEventListener('gamePauseToggle', updatePauseButton);

  if (meta.gameOverMode === 'event') {
    document.addEventListener('gameOver', showControlsAfterGameOver);
  } else {
    setInterval(() => { if (game && game.gameOver) showControlsAfterGameOver(); }, 100);
  }

  // Don't let Start fire before the game's scripts have defined its class.
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;

  for (const href of meta.css) loadCss(href);
  try {
    for (const src of meta.scripts) await loadScript(src);
    startBtn.disabled = false;
  } catch (e) {
    window.NNToast?.show?.(`Could not load ${meta.name}: ${e.message}`, 'danger');
  }
}

document.addEventListener('DOMContentLoaded', init);
