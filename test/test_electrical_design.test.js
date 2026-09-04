/* Electrical Design — a Learn-only, animation-taught topic for grade 7 (prompt 21).

   A sixth tile beside English, Math, Science, Games and Control Logic. Control Logic teaches
   the digital abstraction; this teaches the analogue parts underneath it and then asks the
   child to design with them: two sensors into an MCU, an LED and a fan out, and a program
   built by dragging command blocks.

   Modelled on test_control_logic.test.js, and pinning the same three silent failures — a
   classic script turned into a module, a root-absolute path, a write to Firestore — plus the
   two this topic adds:
     - the ELECTRONICS being wrong (a thermistor that gets more resistive as it warms, a fan
       that runs when it is cold). A confidently-taught wrong circuit is the worst outcome
       here, so the tasks are checked against the physics, never against a stored answer;
     - the drag-and-drop failing, which no amount of reading the source proves. The pointer
       handlers are driven directly. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { LESSONS, MIN_GRADE, lessonBySlug } from '../app/js/electrical-design-data.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'app');
const served = (p) => join(appRoot, p.replace(/^\//, ''));
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

/* Run a lesson's classic scripts the way the browser does, against a canvas stub rich enough
   for the drag-and-drop: it records draw calls, captures the pointer handlers the lesson
   attaches, and reports a real bounding box so client coordinates map onto canvas ones. */
function runLesson(l, { recordDraws = false } = {}) {
  const bad = [];
  const counts = {};
  const NUMERIC = new Set(['fillRect', 'clearRect', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'quadraticCurveTo', 'fillText', 'strokeText', 'createRadialGradient', 'rect', 'translate',
    'rotate', 'setLineDash']);
  const height = l.canvasHeight || 500;
  const ctx = new Proxy({ canvas: { width: 960, height } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        counts[k] = (counts[k] || 0) + 1;
        if (recordDraws && NUMERIC.has(k)) {
          args.forEach((a, i) => {
            if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${k} arg${i}=${a}`);
            if (Array.isArray(a)) {
              a.forEach((n, j) => {
                if (typeof n === 'number' && !Number.isFinite(n)) bad.push(`${k} arg${i}[${j}]=${n}`);
              });
            }
          });
        }
        return k === 'createRadialGradient' ? { addColorStop() {} } : undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const handlers = {};
  const canvas = {
    width: 960,
    height,
    style: {},
    getContext: () => ctx,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height }),
  };
  const context = vm.createContext({
    console,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    window: { addEventListener() {}, removeEventListener() {} },
    document: {
      addEventListener() {}, removeEventListener() {},
      getElementById: () => canvas,
    },
  });
  for (const src of l.scripts) {
    vm.runInContext(readFileSync(served(src), 'utf8'), context, { filename: src });
  }
  return { context, handlers, bad, counts };
}

const instanceOf = (slug, opts) => {
  const l = lessonBySlug(slug);
  const env = runLesson(l, opts);
  env.inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, env.context);
  return env;
};

// ---- manifest and packaging ---------------------------------------------------------------

test('the manifest holds the two lessons, in teaching order', () => {
  // Components before Design: you cannot design with parts you have not met.
  assert.deepEqual(LESSONS.map((l) => l.slug), ['components', 'design']);
  for (const l of LESSONS) {
    assert.ok(l.name, `${l.slug} needs a name`);
    assert.ok(l.description.length > 20, `${l.slug} needs a description`);
    assert.ok(l.icon.startsWith('fa-'), `${l.slug} needs an icon`);
    assert.ok(l.color, `${l.slug} needs a colour`);
  }
  assert.equal(lessonBySlug('design').globalName, 'DesignLesson');
  assert.equal(lessonBySlug('not-a-lesson'), null);
});

test('every declared css and script exists and is a relative served path', () => {
  for (const l of LESSONS) {
    assert.ok(l.scripts.length > 0, `${l.slug} has no scripts`);
    for (const p of [...l.css, ...l.scripts]) {
      // A leading slash resolves from the host root and 404s under the Pages sub-path.
      assert.ok(!p.startsWith('/'), `${l.slug}: ${p} must not be root-absolute`);
      assert.ok(p.startsWith('static/electrical-design/'), `${l.slug}: ${p} unexpected location`);
      assert.ok(existsSync(served(p)), `${l.slug}: missing file ${p} (expected app/${p})`);
    }
    // Both shared files must load before the lesson that depends on them, drawing first.
    assert.match(l.scripts[0], /common\/draw\.js$/, `${l.slug}: draw.js must load first`);
    assert.match(l.scripts[1], /common\/parts\.js$/, `${l.slug}: parts.js must load second`);
    assert.match(l.scripts[l.scripts.length - 1], /\/lesson\.js$/, `${l.slug}: lesson.js last`);
  }
});

test('lesson sources are CLASSIC scripts, not ES modules', () => {
  for (const l of LESSONS) {
    for (const src of l.scripts) {
      const code = readFileSync(served(src), 'utf8');
      assert.doesNotMatch(code, /^\s*export\s/m, `${src} must not use export`);
      assert.doesNotMatch(code, /^\s*import\s/m, `${src} must not use import`);
    }
  }
});

test('each lesson class is defined and honours the player contract', () => {
  for (const l of LESSONS) {
    const code = l.scripts.map((s) => readFileSync(served(s), 'utf8')).join('\n');
    assert.match(code, new RegExp(`class\\s+${l.globalName}\\b`), `${l.slug}: class missing`);
    assert.match(code, /constructor\s*\(\s*canvas/, `${l.slug}: constructor(canvasId)`);
    for (const m of ['start', 'stop', 'reset', 'setInput', 'getInput']) {
      assert.match(code, new RegExp(`^\\s*${m}\\s*\\(`, 'm'), `${l.slug}: ${m}() not found`);
    }
    if (l.hasStep) assert.match(code, /^\s*step\s*\(/m, `${l.slug}: step() not found`);
  }
});

test('every lesson class binds lexically, not onto window', () => {
  for (const l of LESSONS) {
    const { context } = runLesson(l);
    assert.equal(vm.runInContext(`typeof globalThis[${JSON.stringify(l.globalName)}]`, context),
      'undefined', `${l.slug}: a window[...] lookup would fail — globalCtor exists for this`);
    assert.equal(vm.runInContext(`typeof ${l.globalName}`, context), 'function',
      `${l.slug}: ${l.globalName} should resolve as a global lexical binding`);
  }
});

test('declared inputs are the ones the lessons actually answer to', () => {
  for (const l of LESSONS) {
    assert.ok(Array.isArray(l.inputs) && l.inputs.length > 0, `${l.slug} needs inputs`);
    for (const i of l.inputs) {
      assert.ok(i.key && i.label, `${l.slug}: an input needs a key and a label`);
      assert.ok(['toggle', 'choice', 'range'].includes(i.type), `${l.slug}: ${i.key} bad type`);
      if (i.type === 'choice') {
        assert.ok(Array.isArray(i.choices) && i.choices.length >= 2, `${l.slug}: ${i.key} needs choices`);
      }
      if (i.type === 'range') {
        // A slider with no bounds renders as a 0-100 the lesson never asked for.
        assert.ok(Number.isFinite(i.min) && Number.isFinite(i.max) && i.max > i.min,
          `${l.slug}: ${i.key} needs min/max`);
      }
    }
    const { inst } = instanceOf(l.slug);
    for (const key of inst.activeInputs()) {
      assert.ok(l.inputs.some((i) => i.key === key),
        `${l.slug}: activeInputs() names ${key}, which the manifest does not declare`);
      assert.notEqual(inst.getInput(key), null, `${l.slug}: getInput(${key}) returned null`);
    }
  }
});

test('every lesson constructs, steps, sets every input and resets without throwing', () => {
  for (const l of LESSONS) {
    const { inst } = instanceOf(l.slug);
    for (const input of l.inputs) {
      if (input.type === 'toggle') {
        inst.setInput(input.key, 1);
        inst.setInput(input.key, 0);
      } else if (input.type === 'range') {
        for (const v of [input.min, (input.min + input.max) / 2, input.max]) {
          inst.setInput(input.key, v);
          assert.ok(Number.isFinite(inst.getInput(input.key)), `${l.slug}: ${input.key} rejected ${v}`);
        }
      } else {
        for (const c of input.choices) {
          inst.setInput(input.key, c);
          assert.equal(inst.getInput(input.key), c, `${l.slug}: ${input.key} did not take ${c}`);
        }
      }
    }
    for (let i = 0; i < 15; i++) inst.step();
    inst.reset();
    inst.stop();
  }
});

// ---- the electronics ----------------------------------------------------------------------

/* These are the assertions that matter most. The lesson claims a thermistor gets LESS
   resistive as it warms, an LDR less resistive in light, and that a divider turns either into
   a voltage the MCU can read. A sign error in any of them teaches a child something false,
   and would still draw perfectly. */
test('the sensor curves run the right way, and the divider follows them', () => {
  const { context } = runLesson(lessonBySlug('components'));
  const EDP = vm.runInContext('EDP', context);

  // NTC thermistor: 10 kΩ at 25 °C (77 °F), falling as it warms.
  assert.ok(Math.abs(EDP.thermistorOhms(77) - 10000) < 60,
    `10 kΩ at 77 °F, got ${EDP.thermistorOhms(77).toFixed(0)}`);
  let prev = Infinity;
  for (let f = 40; f <= 110; f += 5) {
    const r = EDP.thermistorOhms(f);
    assert.ok(r < prev, `thermistor resistance must fall as it warms (failed at ${f} °F)`);
    prev = r;
  }
  // LDR: about 200 kΩ dark, about 1 kΩ in full light, falling all the way.
  assert.ok(Math.abs(EDP.ldrOhms(0) - 200000) < 1, 'LDR is ~200 kΩ in the dark');
  assert.ok(Math.abs(EDP.ldrOhms(100) - 1000) < 1, 'LDR is ~1 kΩ in full light');
  prev = Infinity;
  for (let p = 0; p <= 100; p += 5) {
    const r = EDP.ldrOhms(p);
    assert.ok(r < prev, `LDR resistance must fall as light rises (failed at ${p}%)`);
    prev = r;
  }
  // The divider: sensor on top, fixed resistor to ground, so hotter and brighter both read
  // HIGHER. Both lessons depend on that being true in the same direction.
  assert.ok(EDP.tempVolts(90) > EDP.tempVolts(60), 'hotter must read higher on A0');
  assert.ok(EDP.lightVolts(90) > EDP.lightVolts(10), 'brighter must read higher on A1');
  assert.equal(EDP.divider(10000, 10000), 2.5, 'two equal resistors split the supply in half');
  assert.ok(EDP.divider(0, 10000) === EDP.VCC, 'no top resistance means the full supply');
  // A 10-bit ADC, the size a part like this really has.
  assert.equal(EDP.adcCounts(0), 0);
  assert.equal(EDP.adcCounts(5), 1023);
  assert.equal(EDP.adcCounts(2.5), 512);
  // The LED's current comes from the series resistor and nothing else.
  assert.ok(Math.abs(EDP.ledCurrent(220) - 0.013636) < 1e-5, 'I = (5 − 2) / 220');
  assert.ok(EDP.ledCurrent(5) > 0.5, 'with no series resistor the current is destructive');
});

test('the Components lesson computes its readings rather than reciting them', () => {
  const { inst, context } = instanceOf('components');
  const Ctor = vm.runInContext('ComponentsLesson', context);
  const EDP = vm.runInContext('EDP', context);
  // The class delegates to the shared physics; if it ever forked, these would diverge.
  assert.equal(Ctor.thermistorOhms(80), EDP.thermistorOhms(80));
  assert.equal(Ctor.ldrOhms(40), EDP.ldrOhms(40));
  assert.equal(Ctor.divider(1000, 1000), EDP.divider(1000, 1000));
  assert.equal(Ctor.VCC, 5);
  // Every part in the manifest's choice list is one the lesson knows how to draw.
  // Spread across the vm realm boundary: an array built inside the sandbox has that realm's
  // Array prototype, so a strict deep-equal against ours fails on identity alone.
  const declared = LESSONS[0].inputs.find((i) => i.key === 'part').choices;
  assert.deepEqual(declared, [...Ctor.PARTS]);
  // Each part offers exactly the controls that apply to it, and no others.
  for (const part of Ctor.PARTS) {
    inst.setInput('part', part);
    const active = inst.activeInputs();
    assert.ok(active.includes('part'), `${part}: the part chooser must always be offered`);
    assert.ok(active.length >= 2, `${part}: nothing to poke`);
  }
});

/* The three tasks the prompt named, checked by RUNNING the program against the sensor curves
   at two opposite conditions each — never against a stored "correct program", because more
   than one program is correct and a child who finds another is not wrong. */
test('each task is checked against the electronics, hot and cold, dark and bright', () => {
  const { context } = runLesson(lessonBySlug('design'));
  const D = vm.runInContext('DesignLesson', context);

  const blink = ['ledOn', 'wait1s', 'ledOff', 'wait1s', null];
  const fan = ['readTemp', 'fanOff', 'ifHot', 'fanOn', null];
  const dark = ['readLight', 'ledOff', 'ifDark', 'ledOn', null];

  // Fan: on above 70 °F, off below. The thermistor is what decides, so the temperature is
  // the only thing changing between the two runs.
  assert.equal(D.run(fan, { tempF: 80, light: 50 }, 6).fan, true, 'fan must run when it is hot');
  assert.equal(D.run(fan, { tempF: 60, light: 50 }, 6).fan, false, 'fan must stop when it is cool');
  assert.equal(D.run(fan, { tempF: 71, light: 50 }, 6).fan, true, 'just above the threshold');
  assert.equal(D.run(fan, { tempF: 69, light: 50 }, 6).fan, false, 'just below the threshold');

  // LED in the dark: on when the LDR reads dark, off in daylight.
  assert.equal(D.run(dark, { tempF: 72, light: 5 }, 6).led, true, 'LED must light in the dark');
  assert.equal(D.run(dark, { tempF: 72, light: 95 }, 6).led, false, 'LED must be off in daylight');

  // Blink: the LED has to actually change state, more than once, and it needs a wait to do
  // it once a second rather than as fast as the MCU can loop.
  assert.ok(D.run(blink, { tempF: 72, light: 50 }, 6).transitions >= 4, 'the LED must blink');
  assert.equal(D.run(['ledOn', null, null, null, null], { tempF: 72, light: 50 }, 6).transitions, 1,
    'an LED switched on once is not blinking');

  // And the lesson's own goal check agrees with all of that.
  assert.equal(D.meets('blink', blink), true);
  assert.equal(D.meets('fan', fan), true);
  assert.equal(D.meets('dark', dark), true);
  assert.equal(D.meets('fan', blink), false, 'a blink program does not control the fan');
  assert.equal(D.meets('dark', fan), false);
  assert.equal(D.meets('blink', ['ledOn', 'ledOff', null, null, null]), false,
    'toggling with no wait is not "every 1 second"');
  for (const task of ['blink', 'fan', 'dark']) {
    assert.equal(D.meets(task, [null, null, null, null, null]), false, 'an empty program does nothing');
  }
});

test('an `if` guards exactly one line, and an unread sensor is not a reading of zero', () => {
  const { context } = runLesson(lessonBySlug('design'));
  const D = vm.runInContext('DesignLesson', context);
  // The fan program without its read: the MCU has never looked at A0, so the test is false
  // and the guarded line is skipped — it must NOT behave as though the pin read 0 V and
  // happened to pass.
  const noRead = ['fanOff', 'ifHot', 'fanOn', null, null];
  assert.equal(D.run(noRead, { tempF: 100, light: 50 }, 6).fan, false,
    'a sensor that was never read cannot satisfy a test');
  // The guard covers ONE line, not the rest of the program.
  const oneLine = ['readTemp', 'ledOff', 'ifHot', 'ledOn', 'fanOn'];
  const cold = D.run(oneLine, { tempF: 50, light: 50 }, 6);
  assert.equal(cold.led, false, 'the guarded line is skipped when it is cold');
  assert.equal(cold.fan, true, 'the line after the guarded one still runs');
  // Its thresholds come from the divider, not from a number typed twice.
  const EDP = vm.runInContext('EDP', context);
  assert.equal(D.HOT_V, EDP.tempVolts(70));
  assert.equal(D.DARK_V, EDP.lightVolts(25));
});

// ---- the drag and drop --------------------------------------------------------------------

/* Reading the source cannot show that a block lands in a slot. These drive the real pointer
   handlers the lesson attached, at real canvas coordinates taken from its own layout. */
test('a block can be dragged from the palette into a slot, and back out again', () => {
  const { inst, handlers } = instanceOf('design');
  assert.ok(handlers.pointerdown && handlers.pointermove && handlers.pointerup,
    'the lesson must attach its own pointer handlers — the player has none');

  const palette = inst.constructor.prototype.paletteLayout.call(inst);
  const slots = inst.constructor.prototype.slotLayout.call(inst);
  const mid = (b) => ({ clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 });
  const ledOn = palette.find((b) => b.id === 'ledOn');

  handlers.pointerdown(mid(ledOn));
  handlers.pointermove(mid(slots[0]));
  handlers.pointerup(mid(slots[0]));
  assert.equal(inst.program[0], 'ledOn', 'the block must land in the slot it was dropped on');

  // Dragging it back out of the program is the only way to change your mind.
  handlers.pointerdown(mid(slots[0]));
  handlers.pointermove({ clientX: 480, clientY: 40 });
  handlers.pointerup({ clientX: 480, clientY: 40 });
  assert.equal(inst.program[0], null, 'dragging a block off the slots removes it');

  // A tap with no movement — a finger on a tablet — fills the first empty slot.
  const wait = palette.find((b) => b.id === 'wait1s');
  handlers.pointerdown(mid(wait));
  handlers.pointerup(mid(wait));
  assert.equal(inst.program[0], 'wait1s', 'a tap must place the block, not silently do nothing');

  // Every palette block is a block the interpreter knows.
  for (const b of palette) {
    assert.ok(inst.constructor.blockById(b.id), `palette offers ${b.id}, which exec() ignores`);
  }
  assert.equal(palette.length, inst.constructor.BLOCKS.length, 'every block must be reachable');
});

test('the program the child drags in is the program that runs', () => {
  const { inst, handlers } = instanceOf('design');
  const palette = inst.constructor.prototype.paletteLayout.call(inst);
  const slots = inst.constructor.prototype.slotLayout.call(inst);
  const drop = (id, slot) => {
    const b = palette.find((x) => x.id === id);
    handlers.pointerdown({ clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 });
    handlers.pointermove({ clientX: slots[slot].x + 40, clientY: slots[slot].y + 10 });
    handlers.pointerup({ clientX: slots[slot].x + 40, clientY: slots[slot].y + 10 });
  };
  ['readTemp', 'fanOff', 'ifHot', 'fanOn'].forEach((id, i) => drop(id, i));
  assert.deepEqual([...inst.program], ['readTemp', 'fanOff', 'ifHot', 'fanOn', null]);

  // Now step it by hand, hot, and watch the fan come on through the real state machine.
  inst.setInput('tempF', 85);
  for (let i = 0; i < 8; i++) inst.step();
  assert.equal(inst.state.fan, true, 'stepping a hot room must start the fan');
  inst.setInput('tempF', 55);
  for (let i = 0; i < 8; i++) inst.step();
  assert.equal(inst.state.fan, false, 'stepping a cool room must stop it');
  assert.equal(inst.constructor.meets('fan', inst.program), true);

  // Reset returns to an empty program — the opening state, not a half-built one.
  inst.reset();
  assert.deepEqual([...inst.program], [null, null, null, null, null]);
  assert.equal(inst.state.fan, false);
});

// ---- it stays Learn-only --------------------------------------------------------------------

/* Comments are stripped first. The sources DOCUMENT that this topic writes nothing, so
   scanning raw text would match the very sentence promising the opposite. */
const stripComments = (js) => js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the topic writes nothing — no Firestore, no progress, no rules change', () => {
  const sources = ['app/js/electrical-design.js', 'app/js/lesson.js', 'app/js/electrical-design-data.js']
    .map(read)
    .concat(LESSONS.flatMap((l) => l.scripts.map((s) => readFileSync(served(s), 'utf8'))))
    .map(stripComments)
    .join('\n');
  for (const forbidden of ['firebase', 'firestore', 'emitAttempt', 'setDoc', 'addDoc', 'writeBatch']) {
    assert.ok(!new RegExp(forbidden, 'i').test(sources),
      `Electrical Design must not reference ${forbidden} — it is Learn-only by owner decision`);
  }
  // And the Firestore rules' topic list must stay as it was; this topic sits outside it.
  assert.match(read('dbmgr/firestore.rules'), /d\.topic in \['math', 'english', 'science'\]/);
});

test('no lesson has a score, timer or failure state', () => {
  for (const l of LESSONS) {
    const code = l.scripts.map((s) => readFileSync(served(s), 'utf8')).join('\n');
    assert.doesNotMatch(code, /\bthis\.score\b/, `${l.slug} must not keep a score`);
    assert.doesNotMatch(code, /\bgameOver\b/, `${l.slug} must not have a game-over state`);
    assert.doesNotMatch(code, /\bthis\.lives\b/, `${l.slug} must not have lives`);
    assert.ok(!('pauseMethod' in l), `${l.slug}: pause belongs to games, not lessons`);
  }
});

test('the taxonomy is untouched — these two are not legacy subtopics', () => {
  /* Matched as a quoted identifier, not as a substring: "design" is an ordinary English word
     and already appears inside a science subtopic's DESCRIPTION ("designing experiments").
     What must never appear is an id or slug of that name. */
  const taxonomy = read('app/js/subtopics-data.js');
  for (const l of LESSONS) {
    assert.doesNotMatch(taxonomy, new RegExp(`['"\`]${l.slug}['"\`]`),
      `${l.slug} must not be added to subtopics-data.js`);
  }
});

// ---- routing and pages ----------------------------------------------------------------------

test('the topics tile appears at grade 7 and not below', () => {
  assert.equal(MIN_GRADE, 7, 'owner set this topic at grade 7');
  const src = read('app/js/topics.js');
  assert.match(src, /electrical-design-data\.js/, 'topics.js must read the floor, not hardcode it');
  assert.match(src, /grade >= ELECTRICAL_DESIGN_MIN_GRADE/, 'the tile must be gated on the floor');
  assert.match(src, /pages\/electrical-design\.html\?grade=/);
  // Control Logic still comes first; Electrical Design is appended after it.
  assert.ok(src.indexOf('pages/control-logic.html?grade=') < src.indexOf('pages/electrical-design.html?grade='),
    'Electrical Design belongs after Control Logic');
});

test('the list page refuses a grade below the floor and tags its lesson links', () => {
  const src = read('app/js/electrical-design.js');
  assert.match(src, /grade < MIN_GRADE/, 'a hand-typed URL below the floor must not render');
  assert.match(src, /location\.replace\('index\.html'\)/);
  // Without the topic tag the shared player would load the Control Logic manifest.
  assert.match(src, /topic=electrical-design/);
});

test('the list page carries a <base> and the shared shell', () => {
  const html = read('app/pages/electrical-design.html');
  assert.match(html, /<base href="\.\.\/" \/>/, 'the page needs the <base> tag');
  assert.match(html, /data-nn-header/);
  assert.match(html, /data-nn-footer/);
  assert.match(html, /assets\/js\/layout\.js/);
  assert.doesNotMatch(html, /(?:href|src)="\//, 'a root-absolute path 404s under the Pages sub-path');
  assert.match(html, /id="nn-ed-grid"/);
  assert.match(html, /src="js\/electrical-design\.js"/);
  assert.match(html, /Back to Topics/);
});

/* One player, two topics. The registry is the whole of what lesson.js knows about this topic;
   everything else it needs comes out of the manifest. */
test('the shared player routes by topic and still defaults to Control Logic', () => {
  const src = read('app/js/lesson.js');
  assert.match(src, /electrical-design-data\.js/, 'the player must import this manifest');
  assert.match(src, /'electrical-design':/, 'the topic registry must name it');
  assert.match(src, /TOPICS\[param\('topic'\)\] \|\| TOPICS\['control-logic'\]/,
    'a link with no ?topic= must still resolve to Control Logic');
  assert.match(src, /topic\.data\.lessonBySlug/, 'the manifest is chosen, not hardcoded');
  assert.match(src, /meta\.canvasHeight/, 'a lesson must be able to ask for a taller canvas');
  assert.match(src, /input\.type === 'range'/, 'the analogue lessons need a slider control');
  const html = read('app/pages/lesson.html');
  assert.match(html, /id="nn-back-label"/, 'the Back label is set from the topic');
});

// ---- it actually draws ------------------------------------------------------------------------

/* Canvas code fails quietly: pass NaN as a coordinate and the call succeeds while nothing
   appears. Walk every state a child can reach and reject any non-finite argument, and catch
   the opposite failure too — a lesson that runs but draws almost nothing is a blank box. */
test('every lesson actually draws, with no NaN coordinates', () => {
  for (const l of LESSONS) {
    const env = runLesson(l, { recordDraws: true });
    const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, env.context);
    for (const input of l.inputs) {
      if (input.type === 'choice') {
        for (const c of input.choices) {
          inst.setInput(input.key, c);
          for (let i = 0; i < 6; i++) inst.step();
        }
      } else if (input.type === 'range') {
        for (const v of [input.min, (input.min + input.max) / 2, input.max]) inst.setInput(input.key, v);
      } else {
        inst.setInput(input.key, 1);
        inst.setInput(input.key, 0);
      }
    }
    for (let i = 0; i < 20; i++) inst.step();
    inst.reset();

    assert.deepEqual([...new Set(env.bad)], [], `${l.slug} drew with non-finite coordinates`);
    const drawOps = (env.counts.fillText || 0) + (env.counts.stroke || 0) + (env.counts.fill || 0);
    assert.ok(drawOps > 50, `${l.slug} issued only ${drawOps} draw calls — it may render blank`);
    assert.ok((env.counts.fillText || 0) > 0, `${l.slug} drew no text at all`);
  }
});

test('the Design lesson keeps drawing once blocks are in the program', () => {
  const env = runLesson(lessonBySlug('design'), { recordDraws: true });
  const inst = vm.runInContext("new DesignLesson('lessonCanvas')", env.context);
  const palette = inst.constructor.prototype.paletteLayout.call(inst);
  const slots = inst.constructor.prototype.slotLayout.call(inst);
  ['readTemp', 'fanOff', 'ifHot', 'fanOn'].forEach((id, i) => {
    const b = palette.find((x) => x.id === id);
    env.handlers.pointerdown({ clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 });
    env.handlers.pointermove({ clientX: slots[i].x + 40, clientY: slots[i].y + 10 });
    env.handlers.pointerup({ clientX: slots[i].x + 40, clientY: slots[i].y + 10 });
  });
  // A block mid-drag is drawn under the pointer; that ghost is its own drawing path.
  const b = palette.find((x) => x.id === 'ledOn');
  env.handlers.pointerdown({ clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 });
  env.handlers.pointermove({ clientX: 500, clientY: 470 });
  for (let i = 0; i < 20; i++) inst.step();
  assert.deepEqual([...new Set(env.bad)], [], 'the running program drew with non-finite coordinates');
});
