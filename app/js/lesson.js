/* Lesson player (prompt 20). Modelled on game.js: inject the manifest's css[], load its
   scripts[] in order, then resolve the class off its global binding.

   What is deliberately NOT carried over from game.js: start/pause/game-over. A lesson is not
   a game — nothing is scored, timed or failed — so the controls are Reset, Step, and the
   inputs the child toggles. For gates and truth tables the poking IS the learning. */
import { lessonBySlug, MIN_GRADE } from './control-logic-data.js';
import { param, isValidGrade } from './flow.js';

let lesson = null;
let meta = null;

// Load a classic <script> and resolve once it has executed. Sequential, because each lesson
// depends on common/draw.js being defined before it.
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

/* Resolve a lesson's constructor by name. Same reasoning as game.js globalCtor: these are
   classic scripts, and a top-level `class X {}` creates a binding in the global LEXICAL
   scope, not a property of `window` — so `window[name]` is undefined. `new Function` evaluates
   in global scope, so the identifier resolves. The name is ours, from control-logic-data.js,
   reachable only via a slug that matched the manifest — never user input. */
function globalCtor(name) {
  try {
    return new Function(`return typeof ${name} === 'function' ? ${name} : null;`)();
  } catch {
    return null;
  }
}

// Render the controls the lesson currently has. Called again after every interaction because
// which inputs apply can change: NOT has no B, and the diode and transistor differ.
function renderControls() {
  const wrap = document.getElementById('nn-lesson-controls');
  wrap.innerHTML = '';
  if (!lesson) return;
  const active = typeof lesson.activeInputs === 'function'
    ? lesson.activeInputs()
    : (meta.inputs || []).map((i) => i.key);

  for (const input of meta.inputs || []) {
    if (!active.includes(input.key)) continue;
    const group = document.createElement('div');
    group.className = 'd-flex align-items-center gap-2 me-3 mb-2';

    const label = document.createElement('span');
    label.className = 'text-muted small';
    label.textContent = input.label;
    group.appendChild(label);

    if (input.type === 'choice') {
      const current = lesson.getInput(input.key);
      const btns = document.createElement('div');
      btns.className = 'btn-group btn-group-sm';
      btns.setAttribute('role', 'group');
      for (const choice of input.choices) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn btn-${choice === current ? '' : 'outline-'}primary`;
        b.textContent = (input.choiceLabels && input.choiceLabels[choice]) || choice;
        b.addEventListener('click', () => { lesson.setInput(input.key, choice); renderControls(); });
        btns.appendChild(b);
      }
      group.appendChild(btns);
    } else {
      const on = !!lesson.getInput(input.key);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn-sm btn-${on ? 'success' : 'outline-secondary'}`;
      b.style.minWidth = '52px';
      b.textContent = on ? '1' : '0';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${input.label}: ${on ? '1' : '0'}`);
      b.addEventListener('click', () => {
        lesson.setInput(input.key, !lesson.getInput(input.key));
        renderControls();
      });
      group.appendChild(b);
    }
    wrap.appendChild(group);
  }
}

async function init() {
  meta = lessonBySlug(param('lesson'));
  const grade = Number(param('grade'));
  const backGrade = isValidGrade(grade) && grade >= MIN_GRADE ? grade : MIN_GRADE;
  if (!meta) { location.replace(`pages/control-logic.html?grade=${backGrade}`); return; }

  document.title = `${meta.name} - NinjaNerd`;
  document.getElementById('nn-lesson-name').textContent = meta.name;
  document.getElementById('nn-lesson-desc').textContent = meta.description;
  document.getElementById('nn-lesson-icon').className = `fas ${meta.icon} me-2`;
  document.getElementById('nn-back-cl').href = `pages/control-logic.html?grade=${backGrade}`;

  const stepBtn = document.getElementById('nn-step');
  const resetBtn = document.getElementById('nn-reset');
  if (!meta.hasStep) stepBtn.style.display = 'none';
  else stepBtn.innerHTML = `<i class="fas fa-forward-step me-1"></i>${meta.stepLabel || 'Step'}`;

  stepBtn.disabled = true;
  resetBtn.disabled = true;

  stepBtn.addEventListener('click', () => {
    if (lesson && typeof lesson.step === 'function') { lesson.step(); renderControls(); }
  });
  resetBtn.addEventListener('click', () => {
    if (lesson) { lesson.reset(); renderControls(); }
  });
  // Leaving the page must stop the animation frame; nothing here is meant to keep running.
  window.addEventListener('pagehide', () => { if (lesson) lesson.stop(); });

  for (const href of meta.css) loadCss(href);
  try {
    for (const src of meta.scripts) await loadScript(src);
  } catch (e) {
    window.NNToast?.show?.(`Could not load ${meta.name}: ${e.message}`, 'danger');
    return;
  }

  const Ctor = globalCtor(meta.globalName);
  if (typeof Ctor !== 'function') {
    window.NNToast?.show?.(`${meta.name} failed to load. Please refresh the page.`, 'danger');
    return;
  }
  lesson = new Ctor('lessonCanvas');
  lesson.start();
  stepBtn.disabled = false;
  resetBtn.disabled = false;
  renderControls();
}

document.addEventListener('DOMContentLoaded', init);
