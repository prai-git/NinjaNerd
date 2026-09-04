/* Lesson player (prompt 20, extended for prompt 21). Modelled on game.js: inject the
   manifest's css[], load its scripts[] in order, then resolve the class off its global
   binding.

   What is deliberately NOT carried over from game.js: start/pause/game-over. A lesson is not
   a game — nothing is scored, timed or failed — so the controls are Reset, Step, and the
   inputs the child toggles. For gates and truth tables the poking IS the learning.

   ONE PLAYER, TWO TOPICS (prompt 21). Prompt 21 asked for this page to be reused unchanged;
   it could not be, because the data module and the Back link were named here rather than
   passed in. Rather than fork a near-identical second player — which would then have to be
   fixed twice for ever — the module and the link became a `topic` URL parameter, and the
   registry below is the only thing that knows a second topic exists. A missing or unknown
   `topic` still resolves to Control Logic, so every link written before prompt 21 works
   exactly as it did. This divergence from the prompt is deliberate and recorded in
   doc/changelog.md. */
import * as controlLogic from './control-logic-data.js';
import * as electricalDesign from './electrical-design-data.js';
import { param, isValidGrade } from './flow.js';

const TOPICS = {
  'control-logic': {
    data: controlLogic, page: 'pages/control-logic.html', label: 'Control Logic',
  },
  'electrical-design': {
    data: electricalDesign, page: 'pages/electrical-design.html', label: 'Electrical Design',
  },
};

let lesson = null;
let meta = null;
let topic = TOPICS['control-logic'];

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
      // flex-wrap: the Components lesson offers nine parts, and a nine-button group that
      // cannot wrap would push the page sideways on a phone.
      btns.className = 'btn-group btn-group-sm flex-wrap';
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
    } else if (input.type === 'range') {
      /* A slider, added for prompt 21. A thermistor and an LDR are analogue: the lesson is
         that the reading SLIDES, and a toggle would teach the opposite. The value is written
         straight through on every move, and the controls are NOT re-rendered — rebuilding the
         row mid-drag would take the slider out from under the child's finger. */
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'form-range';
      slider.style.width = '150px';
      slider.min = String(input.min);
      slider.max = String(input.max);
      slider.step = String(input.step || 1);
      slider.value = String(lesson.getInput(input.key));
      slider.setAttribute('aria-label', input.label);
      const readout = document.createElement('span');
      readout.className = 'small fw-semibold text-nowrap';
      readout.style.minWidth = '58px';
      const show = () => { readout.textContent = `${slider.value}${input.unit ? ` ${input.unit}` : ''}`; };
      show();
      slider.addEventListener('input', () => { lesson.setInput(input.key, Number(slider.value)); show(); });
      group.appendChild(slider);
      group.appendChild(readout);
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
  // An unknown or missing topic is Control Logic, so links written before prompt 21 still work.
  topic = TOPICS[param('topic')] || TOPICS['control-logic'];
  meta = topic.data.lessonBySlug(param('lesson'));
  const grade = Number(param('grade'));
  const minGrade = topic.data.MIN_GRADE;
  const backGrade = isValidGrade(grade) && grade >= minGrade ? grade : minGrade;
  if (!meta) { location.replace(`${topic.page}?grade=${backGrade}`); return; }

  document.title = `${meta.name} - NinjaNerd`;
  document.getElementById('nn-lesson-name').textContent = meta.name;
  document.getElementById('nn-lesson-desc').textContent = meta.description;
  document.getElementById('nn-lesson-icon').className = `fas ${meta.icon} me-2`;
  document.getElementById('nn-back-cl').href = `${topic.page}?grade=${backGrade}`;
  document.getElementById('nn-back-label').textContent = `Back to ${topic.label}`;

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
  /* A lesson may ask for a taller canvas before it is constructed — the constructor draws
     immediately, and a canvas resized afterwards is wiped. Width stays at the shared 960 so
     the page CSS keeps scaling it to fit. */
  if (meta.canvasHeight) document.getElementById('lessonCanvas').height = meta.canvasHeight;

  lesson = new Ctor('lessonCanvas');
  lesson.start();
  stepBtn.disabled = false;
  resetBtn.disabled = false;
  renderControls();
}

document.addEventListener('DOMContentLoaded', init);
