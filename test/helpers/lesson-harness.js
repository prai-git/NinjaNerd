/* Shared harness for the Learn-only animation topics (Control Logic, Electrical Design,
   Programming). One place, because all three draw lessons on a canvas from a manifest and all
   three carry the same risk: canvas code fails SILENTLY, so a lesson can be wrong on screen
   while every assertion about its logic passes.

   WHY THIS EXISTS. Across four rounds of review the owner found ten defects that the test
   suite passed straight through. Every one lived in a state the tests never visited, because
   the states were a HAND-WRITTEN LIST — 18 of the 592 that Programming's manifest describes,
   about 3%. The list was my judgement about what was worth rendering, and the defects were
   all in combinations I did not think to write down: `kind=until` with `mode=build`,
   `form=choose` with `mode=build`, watch-after-build.

   So this module does not accept a list. It DERIVES the state space from the manifest the
   lesson already declares, and runs a fixed battery of invariants over all of it. A new input
   or a new choice value enlarges the sweep automatically; nobody has to remember.

   Two things it deliberately cannot do, stated so they are not assumed:
     - it approximates text metrics (0.56em per character). Good enough to catch a panel on
       top of a console; not a typesetter.
     - it cannot judge whether a lesson TEACHES well. Only a person looking at it can. */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* ---- the state space ----------------------------------------------------------------------

   Derived, never listed. Choice inputs contribute every declared value, toggles both, ranges
   three samples (min, middle, max — the ends are where off-by-one layout breaks and the
   middle is the ordinary case), and `steps` 0..maxSteps so a lesson is examined before it
   starts, part-way through, and after it has wrapped. */
export function enumerate(lesson, { rangeSamples = 3, maxSteps = 8 } = {}) {
  const axes = lesson.inputs.map((i) => {
    if (i.type === 'choice') return i.choices.map((v) => [i.key, v]);
    if (i.type === 'toggle') return [[i.key, true], [i.key, false]];
    const mid = i.min + Math.round((i.max - i.min) / 2 / (i.step || 1)) * (i.step || 1);
    const vals = rangeSamples >= 3 ? [i.min, mid, i.max] : [i.min, i.max];
    return [...new Set(vals)].map((v) => [i.key, v]);
  });
  let combos = [{}];
  for (const axis of axes) {
    const next = [];
    for (const base of combos) for (const [k, v] of axis) next.push({ ...base, [k]: v });
    combos = next;
  }
  const out = [];
  for (const state of combos) for (let steps = 0; steps < maxSteps; steps++) out.push({ state, steps });
  return out;
}

/* ---- rendering ------------------------------------------------------------------------------

   A recording 2d context that keeps real geometry. `fill`/`stroke` collapse the current path
   to its bounding box, which is what every invariant below reasons about. */
function recorder(W, H) {
  const ops = [];
  let cur = { fillStyle: '#000', font: '16px x', textAlign: 'start', globalAlpha: 1 };
  const stack = [];
  let path = [];
  const size = () => { const m = /(\d+(?:\.\d+)?)px/.exec(cur.font); return m ? Number(m[1]) : 16; };
  const emit = (op, x, y, w, h, s) => ops.push({ op, x, y, w, h, s, color: cur.fillStyle });
  const ctx = {
    canvas: { width: W, height: H },
    save() { stack.push({ ...cur }); },
    restore() { cur = stack.pop() || cur; },
    measureText(s) { return { width: String(s).length * size() * 0.56 }; },
    fillText(s, x, y) {
      const sz = size();
      const wi = String(s).length * sz * 0.56;
      let x0 = x;
      if (cur.textAlign === 'center') x0 = x - wi / 2;
      if (cur.textAlign === 'right') x0 = x - wi;
      emit('text', x0, y - sz / 2, wi, sz, String(s));
    },
    fillRect(x, y, w, h) { emit('fill', x, y, w, h); },
    clearRect() {},
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    arcTo(x1, y1, x2, y2) { path.push([x1, y1], [x2, y2]); },
    arc(x, y, r) { path.push([x - r, y - r], [x + r, y + r]); },
    rect(x, y, w, h) { path.push([x, y], [x + w, y + h]); },
    closePath() {},
    fill() { span('fill'); },
    stroke() { span('stroke'); },
    clip() {},
    setLineDash() {},
  };
  function span(kind) {
    if (!path.length) return;
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    emit(kind, Math.min(...xs), Math.min(...ys),
      Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }
  for (const k of ['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline', 'lineWidth',
    'lineCap', 'lineJoin', 'globalAlpha']) {
    Object.defineProperty(ctx, k, { get() { return cur[k]; }, set(v) { cur[k] = v; } });
  }
  return { ctx, ops };
}

/* Compile a lesson's scripts ONCE and hand back a factory. 592 states x re-reading and
   re-evaluating the sources would be slow enough that nobody would run the sweep, and a sweep
   nobody runs is the same as no sweep. */
export function factory(lesson, served) {
  const W = 960;
  const H = lesson.canvasHeight || 500;
  let live = recorder(W, H);
  const canvas = { width: W, height: H, getContext: () => live.ctx };
  const context = vm.createContext({
    document: { getElementById: () => canvas },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    Math, Number, String, Object, Array, JSON, console,
  });
  for (const src of lesson.scripts) {
    vm.runInContext(readFileSync(served(src), 'utf8'), context, { filename: src });
  }

  /* One frame. `drive` runs after the inputs are set and before the steps, so a test can
     reach a STATEFUL frame — drop a block, then switch mode — which no freshly constructed
     instance can represent. That sequence was itself a defect the owner found. */
  return function frame({ state = {}, steps = 0, drive = null } = {}) {
    live = recorder(W, H);
    const inst = vm.runInContext(`new ${lesson.globalName}('lessonCanvas')`, context);
    for (const [k, v] of Object.entries(state)) inst.setInput(k, v);
    if (typeof drive === 'function') drive(inst);
    for (let i = 0; i < steps; i++) inst.step();
    live.ops.length = 0;          // only the final frame is judged
    inst.draw();
    return { ops: live.ops, W, H, inst, state, steps };
  };
}

// The strings a frame puts on screen, in order — a frame's comparable identity.
export const signature = (f) => f.ops.filter((o) => o.op === 'text' && o.s.trim()).map((o) => o.s).join('|');

/* ---- the invariant battery -------------------------------------------------------------------

   Each entry returns a list of human-readable failures for one frame. These are DEFECT
   CLASSES, not defects: every one was added because the owner found an instance of it, and
   each now covers every future instance across every enumerated state and every topic.

   Adding a bespoke test for a newly reported defect is NOT an acceptable close. The defect
   must map to a row here, or a row is added. */
const PANEL_AREA = 20000;   // panels are the large fills; blocks and value boxes are far smaller

export const LAYOUT_INVARIANTS = [
  {
    name: 'I1 nothing drawn outside the canvas',
    check: ({ ops, W, H }) => ops
      .filter((o) => o.x < -1 || o.y < -1 || o.x + o.w > W + 1 || o.y + o.h > H + 1)
      .map((o) => `${o.op} "${(o.s || '').slice(0, 40)}" at ${o.x.toFixed(0)},${o.y.toFixed(0)}`
        + ` (canvas ${W}x${H})`),
  },
  {
    name: 'I2 no two panels overlap',
    /* The decisive one. A console at y=344 h=120 sat 54px under the panel drawn after it and
       `SHOW name` was painted over. A "is the text's centre covered" rule missed it, because
       the panel edge landed just below the centre — see I4, which is kept as well but is not
       what catches this. */
    check: ({ ops, W, H }) => {
      const panels = ops.filter((o) => o.op === 'fill' && o.w * o.h >= PANEL_AREA
        && !(o.w >= W - 2 && o.h >= H - 2));   // not the canvas background, which contains all
      const out = [];
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i]; const b = panels[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 2 && oy > 2) {
            out.push(`${a.w.toFixed(0)}x${a.h.toFixed(0)}@${a.x.toFixed(0)},${a.y.toFixed(0)}`
              + ` overlaps ${b.w.toFixed(0)}x${b.h.toFixed(0)}@${b.x.toFixed(0)},${b.y.toFixed(0)}`
              + ` by ${ox.toFixed(0)}x${oy.toFixed(0)}`);
          }
        }
      }
      return [...new Set(out)];
    },
  },
  {
    name: 'I3 no two labels overlap',
    /* Full bounding boxes, BOTH axes. The first version skipped any pair whose centres were
       more than 0.6 line-heights apart, so a panel title 9px above the line it crowded was
       treated as a different row and never compared. */
    check: ({ ops }) => {
      const t = ops.filter((o) => o.op === 'text' && o.s.trim());
      const out = [];
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          const a = t[i]; const b = t[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 3 && oy > 1) {
            out.push(`"${a.s.slice(0, 24)}" / "${b.s.slice(0, 24)}" by ${ox.toFixed(0)}x${oy.toFixed(0)}`);
          }
        }
      }
      return [...new Set(out)];
    },
  },
  {
    name: 'I4 no text fully covered by a later fill',
    check: ({ ops }) => {
      const out = [];
      ops.forEach((o, i) => {
        if (o.op !== 'text' || !o.s.trim()) return;
        const cx = o.x + o.w / 2; const cy = o.y + o.h / 2;
        for (let j = i + 1; j < ops.length; j++) {
          const f = ops[j];
          if (f.op !== 'fill') continue;
          if (cx > f.x + 1 && cx < f.x + f.w - 1 && cy > f.y + 1 && cy < f.y + f.h - 1) {
            out.push(`"${o.s.slice(0, 36)}" under a fill at ${f.x.toFixed(0)},${f.y.toFixed(0)}`);
            break;
          }
        }
      });
      return [...new Set(out)];
    },
  },
  {
    name: 'I5 no non-finite coordinate',
    // Canvas draws NOTHING for NaN and raises nothing. A blank region with every test green.
    check: ({ ops }) => ops
      .filter((o) => ![o.x, o.y, o.w, o.h].every(Number.isFinite))
      .map((o) => `${o.op} "${(o.s || '').slice(0, 30)}" has a non-finite coordinate`),
  },
  {
    name: 'I6 the frame is not blank',
    check: ({ ops }) => (ops.length >= 25 ? []
      : [`only ${ops.length} draw calls — too few to be a drawn lesson`]),
  },
];

/* Run the battery over every enumerated state. Returns the failures grouped by invariant,
   plus the number of frames actually rendered — which the caller asserts against
   `enumerate().length`, so a sweep cannot silently shrink. */
export function sweep(lesson, served, opts = {}) {
  const make = factory(lesson, served);
  const states = enumerate(lesson, opts);
  const failures = new Map(LAYOUT_INVARIANTS.map((inv) => [inv.name, []]));
  for (const { state, steps } of states) {
    const f = make({ state, steps });
    for (const inv of LAYOUT_INVARIANTS) {
      for (const msg of inv.check(f)) {
        failures.get(inv.name).push(`${lesson.slug} ${JSON.stringify(state)} steps=${steps}: ${msg}`);
      }
    }
  }
  return { frames: states.length, failures };
}

/* ---- interaction invariants ------------------------------------------------------------------

   The battery above judges ONE frame. These need several, or a sequence, and every defect they
   cover was invisible to any single-frame check however many were added:

     B1  a control whose values all draw the same thing is not controlling anything.
     B2  two modes that draw the same thing are not two modes.
     B6  a palette that is drawn must be draggable — in EVERY shape, not the default one.
     B8  exactly one offered block may satisfy the goal, or the task is unfair.
     B9  watch mode must render the same whether or not the child has built something.

   All five are FEATURE-DETECTED, so the same harness serves topics that have no build mode:
   a lesson without `paletteLayout` simply contributes no B6/B8 checks. */

// Which controls apply in a state — the lesson's own answer. Probing a control where it
// correctly does nothing proves nothing: Level is meaningless when Shape is IF.
function activeIn(make, state) {
  const { inst } = make({ state, steps: 0 });
  return typeof inst.activeInputs === 'function' ? [...inst.activeInputs()] : null;
}

/* A state in which `key` applies: the defaults if possible, else one choice control flipped.
   A key active in no such state is a control nobody can reach, and is reported as a failure
   rather than quietly skipped. */
function enablingState(lesson, make, key) {
  const candidates = [{}];
  for (const ci of lesson.inputs.filter((i) => i.type === 'choice')) {
    for (const v of ci.choices) candidates.push({ [ci.key]: v });
  }
  for (const c of candidates) {
    const act = activeIn(make, c);
    if (!act || act.includes(key)) return c;
  }
  return null;
}

export function interactionSweep(lesson, served, { steps = 4 } = {}) {
  const make = factory(lesson, served);
  const failures = new Map();
  let checks = 0;
  const fail = (name, msg) => {
    if (!failures.has(name)) failures.set(name, []);
    failures.get(name).push(`${lesson.slug}: ${msg}`);
  };

  // ---- B1 every value of every reachable control changes the picture ----------------------
  for (const input of lesson.inputs) {
    const base = enablingState(lesson, make, input.key);
    if (!base) { fail('B1 every control value changes the frame', `${input.key} is never active`); continue; }
    const values = input.type === 'choice' ? input.choices
      : input.type === 'toggle' ? [true, false]
        : [input.min, input.max];
    const seen = new Map();
    for (const v of values) {
      checks++;
      const sig = signature(make({ state: { ...base, [input.key]: v }, steps }));
      if (seen.has(sig)) {
        fail('B1 every control value changes the frame',
          `${input.key}=${JSON.stringify(v)} draws the same as ${input.key}=${JSON.stringify(seen.get(sig))}`
          + ` (with ${JSON.stringify(base)})`);
      }
      seen.set(sig, v);
    }
  }

  const modeInput = lesson.inputs.find((i) => i.key === 'mode' && i.type === 'choice'
    && i.choices.includes('watch') && i.choices.includes('build'));

  // ---- B2 the two modes are visibly different ---------------------------------------------
  if (modeInput) {
    checks++;
    const watch = signature(make({ state: { mode: 'watch' }, steps }));
    const build = signature(make({ state: { mode: 'build' }, steps }));
    if (watch === build) fail('B2 modes differ', 'watch and build render an identical picture');
    if (!build.includes('one piece missing')) {
      fail('B2 modes differ', 'build mode must show the program as incomplete');
    }
    if (watch.includes('one piece missing')) {
      fail('B2 modes differ', 'watch mode must show a finished program');
    }
  }

  /* ---- B6 / B8 every shape that draws a palette must be draggable and fair ----------------
     Looped over EVERY value of every shape control, because the one broken path was the
     non-default one: repeat-until drew a palette that `onDown` refused to pick up, and every
     drag test had used the default shape. */
  const shapes = lesson.inputs.filter((i) => i.type === 'choice' && i.key !== 'mode');
  const shapeStates = shapes.length
    ? shapes.flatMap((sh) => sh.choices.map((v) => ({ [sh.key]: v })))
    : [{}];
  for (const sh of shapeStates) {
    const state = modeInput ? { mode: 'build', ...sh } : { ...sh };
    const { inst } = make({ state, steps: 0 });
    if (typeof inst.paletteLayout !== 'function' || typeof inst.slotRect !== 'function') continue;
    const pal = [...inst.paletteLayout()];
    if (!pal.length) continue;
    const where = JSON.stringify(state);

    checks++;
    const slot = inst.slotRect();
    inst.onDown({ x: pal[0].x + 4, y: pal[0].y + 4 });
    inst.onMove({ x: slot.x + 10, y: slot.y + 10 });
    inst.onUp({ x: slot.x + 10, y: slot.y + 10 });
    if (inst.pick !== pal[0].id) {
      fail('B6 a drawn palette is draggable', `${where}: dropping a block did nothing`);
    }

    if (typeof inst.goalMet === 'boolean') {
      checks++;
      const correct = pal.filter((b) => { inst.pick = b.id; return inst.goalMet; });
      if (correct.length !== 1) {
        fail('B8 exactly one block satisfies the goal',
          `${where}: ${correct.length} of ${pal.length} blocks are accepted`
          + ` (${correct.map((b) => b.label).join(', ') || 'none'})`);
      }
    }
  }

  /* ---- B9 watch is independent of what was built ------------------------------------------
     Stateful, and the reason the harness takes a `drive` callback at all: a freshly built
     instance has nothing dropped, so a fresh-instance comparison passed while the bug was
     live. */
  if (modeInput) {
    checks++;
    const untouched = signature(make({ state: { mode: 'watch' }, steps }));
    const afterBuilding = signature(make({
      state: {},
      steps,
      drive: (inst) => {
        inst.setInput('mode', 'build');
        if (typeof inst.paletteLayout !== 'function') return;
        const pal = [...inst.paletteLayout()];
        const slot = inst.slotRect();
        const wrong = pal[pal.length - 1];
        inst.onDown({ x: wrong.x + 4, y: wrong.y + 4 });
        inst.onUp({ x: slot.x + 10, y: slot.y + 10 });
        inst.setInput('mode', 'watch');
      },
    }));
    if (afterBuilding !== untouched) {
      fail('B9 watch ignores what was built',
        'watch mode rendered differently after a block was dropped in build mode');
    }
  }

  return { checks, failures };
}
