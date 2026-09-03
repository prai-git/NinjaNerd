/* Control Logic — a Learn-only, animation-taught topic (prompt 20).

   A fifth tile beside English, Math, Science and Games, teaching digital electronics bottom
   up. It reuses the GAMES packaging (classic scripts, a manifest, a data-driven player) and
   deliberately reuses none of its gameplay: no start overlay, no pause, no game-over, no
   score. Nothing is recorded, so nothing can be failed.

   These tests pin the three things that would break it silently:
     - a classic script turned into an ES module (the class stops resolving),
     - a root-absolute asset path (404s under the GitHub Pages sub-path only),
     - the topic writing to Firestore (it must stay outside the rules' topic list). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { LESSONS, MIN_GRADE, lessonBySlug } from '../app/js/control-logic-data.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'app');
const served = (p) => join(appRoot, p.replace(/^\//, ''));
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

test('the manifest holds the five lessons, in teaching order', () => {
  // Order is content: each lesson depends on the one before it.
  assert.deepEqual(LESSONS.map((l) => l.slug), [
    'control-system', 'digital-signals', 'logic-gates', 'truth-tables', 'digital-components',
  ]);
  for (const l of LESSONS) {
    assert.ok(l.name, `${l.slug} needs a name`);
    assert.ok(l.description.length > 20, `${l.slug} needs a description`);
    assert.ok(l.icon.startsWith('fa-'), `${l.slug} needs an icon`);
    assert.ok(l.color, `${l.slug} needs a colour`);
  }
  assert.equal(lessonBySlug('logic-gates').globalName, 'LogicGatesLesson');
  assert.equal(lessonBySlug('not-a-lesson'), null);
});

test('every declared css and script exists and is a relative served path', () => {
  for (const l of LESSONS) {
    assert.ok(l.scripts.length > 0, `${l.slug} has no scripts`);
    for (const p of [...l.css, ...l.scripts]) {
      // A leading slash resolves from the host root and 404s under the Pages sub-path.
      assert.ok(!p.startsWith('/'), `${l.slug}: ${p} must not be root-absolute`);
      assert.ok(p.startsWith('static/control-logic/'), `${l.slug}: ${p} unexpected location`);
      assert.ok(existsSync(served(p)), `${l.slug}: missing file ${p} (expected app/${p})`);
    }
    // The shared drawing helpers must load before the lesson that uses them.
    assert.match(l.scripts[0], /common\/draw\.js$/, `${l.slug}: draw.js must load first`);
    assert.match(l.scripts[l.scripts.length - 1], /\/lesson\.js$/, `${l.slug}: lesson.js last`);
  }
});

test('lesson sources are CLASSIC scripts, not ES modules', () => {
  /* game.js and lesson.js both resolve a class off the global lexical binding a top-level
     `class X {}` creates. An `export` makes the file a module, the binding never becomes
     global, and the page fails with "failed to load" — silently, at runtime only. */
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
    // The player calls these directly.
    for (const m of ['start', 'stop', 'reset', 'setInput', 'getInput']) {
      assert.match(code, new RegExp(`^\\s*${m}\\s*\\(`, 'm'), `${l.slug}: ${m}() not found`);
    }
    if (l.hasStep) assert.match(code, /^\s*step\s*\(/m, `${l.slug}: step() not found`);
  }
});

test('a lesson declares inputs the child can toggle — the poking is the learning', () => {
  for (const l of LESSONS) {
    assert.ok(Array.isArray(l.inputs) && l.inputs.length > 0, `${l.slug} needs inputs`);
    for (const i of l.inputs) {
      assert.ok(i.key && i.label, `${l.slug}: an input needs a key and a label`);
      assert.ok(['toggle', 'choice'].includes(i.type), `${l.slug}: ${i.key} bad type`);
      if (i.type === 'choice') {
        assert.ok(Array.isArray(i.choices) && i.choices.length >= 2,
          `${l.slug}: ${i.key} needs choices`);
      }
    }
  }
});

/* A lesson is not a game (prompt 20). Reusing the packaging is the point; reusing the
   gameplay would be the mistake — a child cannot lose a lesson. */
test('no lesson has a score, timer or failure state', () => {
  for (const l of LESSONS) {
    const code = l.scripts.map((s) => readFileSync(served(s), 'utf8')).join('\n');
    assert.doesNotMatch(code, /\bthis\.score\b/, `${l.slug} must not keep a score`);
    assert.doesNotMatch(code, /\bgameOver\b/, `${l.slug} must not have a game-over state`);
    assert.doesNotMatch(code, /\bthis\.lives\b/, `${l.slug} must not have lives`);
    assert.ok(!('pauseMethod' in l), `${l.slug}: pause belongs to games, not lessons`);
    assert.ok(!('gameOverMode' in l), `${l.slug}: game-over belongs to games, not lessons`);
  }
});

/* Comments are stripped first. The sources DOCUMENT that this topic writes nothing, so
   scanning raw text would match the very sentence promising the opposite — the assertion
   would fail on its own explanation. Only executable code is checked. */
const stripComments = (js) => js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the topic writes nothing — no Firestore, no progress, no rules change', () => {
  const sources = ['app/js/control-logic.js', 'app/js/lesson.js', 'app/js/control-logic-data.js']
    .map(read)
    .concat(LESSONS.flatMap((l) => l.scripts.map((s) => readFileSync(served(s), 'utf8'))))
    .map(stripComments)
    .join('\n');
  for (const forbidden of ['firebase', 'firestore', 'emitAttempt', 'setDoc', 'addDoc', 'writeBatch']) {
    assert.ok(!new RegExp(forbidden, 'i').test(sources),
      `Control Logic must not reference ${forbidden} — it is Learn-only by owner decision`);
  }
  // And the Firestore rules' topic list must stay as it was; this topic sits outside it.
  assert.match(read('dbmgr/firestore.rules'), /d\.topic in \['math', 'english', 'science'\]/);
});

test('the taxonomy is untouched — these five are not legacy subtopics', () => {
  const taxonomy = read('app/js/subtopics-data.js');
  for (const l of LESSONS) {
    assert.ok(!taxonomy.includes(l.slug), `${l.slug} must not be added to subtopics-data.js`);
  }
});

test('the topics tile appears from MIN_GRADE up and not below', () => {
  assert.equal(MIN_GRADE, 5, 'owner set the floor at grade 5');
  const src = read('app/js/topics.js');
  assert.match(src, /control-logic-data\.js/, 'topics.js must read the floor, not hardcode it');
  assert.match(src, /grade >= CONTROL_LOGIC_MIN_GRADE/, 'the tile must be gated on the floor');
  assert.match(src, /pages\/control-logic\.html\?grade=/);
  // The Games card still comes first; Control Logic is appended after it.
  assert.ok(src.indexOf('pages/games.html?grade=') < src.indexOf('pages/control-logic.html?grade='),
    'Control Logic belongs after Games');
});

test('the list page refuses a grade below the floor', () => {
  const src = read('app/js/control-logic.js');
  assert.match(src, /grade < MIN_GRADE/, 'a hand-typed URL below the floor must not render');
  assert.match(src, /location\.replace\('index\.html'\)/);
});

test('both pages carry a <base> and the shared shell', () => {
  for (const p of ['app/pages/control-logic.html', 'app/pages/lesson.html']) {
    const html = read(p);
    assert.match(html, /<base href="\.\.\/" \/>/, `${p} needs the <base> tag`);
    assert.match(html, /data-nn-header/, `${p} needs the shared header`);
    assert.match(html, /data-nn-footer/, `${p} needs the shared footer`);
    assert.match(html, /assets\/js\/layout\.js/, `${p} needs layout.js`);
    // Nothing on either page may be root-absolute; test_base_path.test.js enforces this
    // repo-wide, but naming it here keeps the reason attached to the topic.
    assert.doesNotMatch(html, /(?:href|src)="\//, `${p} has a root-absolute path`);
  }
  const list = read('app/pages/control-logic.html');
  assert.match(list, /id="nn-cl-grid"/);
  assert.match(list, /src="js\/control-logic\.js"/);
  assert.match(list, /Back to Topics/);

  const player = read('app/pages/lesson.html');
  assert.match(player, /id="lessonCanvas"/);
  assert.match(player, /id="nn-step"/);
  assert.match(player, /id="nn-reset"/);
  assert.match(player, /id="nn-lesson-controls"/);
  assert.match(player, /Back to Control Logic/);
  assert.match(player, /src="js\/lesson\.js"/);
  // A lesson has none of the game player's chrome.
  assert.doesNotMatch(player, /id="startBtn"|id="pauseBtn"|id="restartBtn"/);
});

test('the player resolves constructors by identifier, not off window', () => {
  const src = read('app/js/lesson.js');
  assert.doesNotMatch(src, /window\[\s*meta\.globalName\s*\]/,
    'window[globalName] is always undefined for classic-script classes');
  assert.match(src, /function globalCtor\(/);
});

/* Run the real sources the way the browser does, and drive each lesson through the contract.
   This is what proves the classes work rather than merely that the text looks right. */
function runLesson(l) {
  const calls = [];
  const ctxStub = new Proxy({ canvas: { width: 960, height: 500 } }, {
    get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
  });
  const context = vm.createContext({
    console,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    window: { addEventListener() {}, removeEventListener() {} },
    document: {
      addEventListener() {}, removeEventListener() {},
      getElementById: () => ({ getContext: () => ctxStub }),
    },
  });
  for (const src of l.scripts) {
    vm.runInContext(readFileSync(served(src), 'utf8'), context, { filename: src });
  }
  return { context, calls };
}

test('every lesson class binds lexically, not onto window', () => {
  for (const l of LESSONS) {
    const { context } = runLesson(l);
    assert.equal(vm.runInContext(`typeof globalThis[${JSON.stringify(l.globalName)}]`, context),
      'undefined', `${l.slug}: a window[...] lookup would fail — globalCtor exists for this`);
    assert.equal(
      vm.runInContext(`typeof ${l.globalName}`, context), 'function',
      `${l.slug}: ${l.globalName} should resolve as a global lexical binding`);
  }
});

test('every lesson constructs, steps, toggles and resets without throwing', () => {
  for (const l of LESSONS) {
    const { context } = runLesson(l);
    const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);
    assert.ok(inst, `${l.slug} did not construct`);
    // Whatever the lesson says its live inputs are, the player will read and write them.
    const active = inst.activeInputs();
    assert.ok(active.length > 0, `${l.slug}: activeInputs() is empty`);
    for (const key of active) {
      assert.ok(l.inputs.some((i) => i.key === key),
        `${l.slug}: activeInputs() names ${key}, which the manifest does not declare`);
      assert.notEqual(inst.getInput(key), null, `${l.slug}: getInput(${key}) returned null`);
    }
    // Toggle every declared toggle both ways, and select every choice.
    for (const input of l.inputs) {
      if (input.type === 'toggle') {
        inst.setInput(input.key, 1);
        inst.setInput(input.key, 0);
      } else {
        for (const c of input.choices) {
          inst.setInput(input.key, c);
          assert.equal(inst.getInput(input.key), c, `${l.slug}: ${input.key} did not take ${c}`);
        }
      }
    }
    // Step round more than a full cycle of any lesson's state.
    for (let i = 0; i < 12; i++) inst.step();
    inst.reset();
    inst.stop();
  }
});

/* The two lessons that assert arithmetic are checked against the arithmetic itself, not
   against a copied table — a wrong truth table taught confidently is the worst outcome here. */
test('logic gate outputs are correct for every input combination', () => {
  const { context } = runLesson(lessonBySlug('logic-gates'));
  const evaluate = vm.runInContext('LogicGatesLesson.evaluate', context);
  const expected = {
    AND: [0, 0, 0, 1], OR: [0, 1, 1, 1], NAND: [1, 1, 1, 0],
    NOR: [1, 0, 0, 0], XOR: [0, 1, 1, 0],
  };
  for (const [type, want] of Object.entries(expected)) {
    const got = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => evaluate(type, a, b));
    assert.deepEqual(got, want, `${type} truth table`);
  }
  assert.equal(evaluate('NOT', 0, 0), 1);
  assert.equal(evaluate('NOT', 1, 0), 0);
});

test('the adders actually add, for all 4 and all 8 cases', () => {
  const { context } = runLesson(lessonBySlug('truth-tables'));
  const half = vm.runInContext('TruthTablesLesson.half', context);
  const full = vm.runInContext('TruthTablesLesson.full', context);
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const r = half(a, b);
    assert.equal(r.carry * 2 + r.sum, a + b, `half adder ${a}+${b}`);
  }
  for (let i = 0; i < 8; i++) {
    const [a, b, cin] = [(i >> 2) & 1, (i >> 1) & 1, i & 1];
    const r = full(a, b, cin);
    assert.equal(r.carry * 2 + r.sum, a + b + cin, `full adder ${a}+${b}+${cin}`);
  }
});

test('a byte reads as the number it represents', () => {
  const { context } = runLesson(lessonBySlug('digital-signals'));
  const inst = vm.runInContext("new DigitalSignalsLesson('lessonCanvas')", context);
  assert.equal(inst.binary, '10110100');
  assert.equal(inst.value, 180, 'the wave and the number must be the same fact');
  for (let i = 0; i < 8; i++) inst.setInput(`bit${i}`, 1);
  assert.equal(inst.value, 255, 'all eight bits set is 255 — the largest byte');
  for (let i = 0; i < 8; i++) inst.setInput(`bit${i}`, 0);
  assert.equal(inst.value, 0);
});

/* Every lesson is drawn on a canvas, and canvas code fails quietly: pass NaN as a coordinate
   and the call succeeds while nothing appears. The vm tests above prove the classes run; this
   proves they DRAW, by recording the context and rejecting any non-finite numeric argument.

   It also catches the opposite failure — a lesson that runs but issues almost no drawing
   calls, which on screen is a blank white box. */
test('every lesson actually draws, with no NaN coordinates', () => {
  const NUMERIC = new Set(['fillRect', 'clearRect', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'quadraticCurveTo', 'fillText', 'strokeText', 'createRadialGradient', 'rect']);

  for (const l of LESSONS) {
    const bad = [];
    const counts = {};
    const ctx = new Proxy({ canvas: { width: 960, height: 500 } }, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k !== 'string') return undefined;
        return (...args) => {
          counts[k] = (counts[k] || 0) + 1;
          if (NUMERIC.has(k)) {
            args.forEach((a, i) => {
              if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${k} arg${i}=${a}`);
            });
          }
          return k === 'createRadialGradient' ? { addColorStop() {} } : undefined;
        };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    const context = vm.createContext({
      console,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
      window: { addEventListener() {}, removeEventListener() {} },
      document: {
        addEventListener() {}, removeEventListener() {},
        getElementById: () => ({ getContext: () => ctx }),
      },
    });
    for (const s of l.scripts) {
      vm.runInContext(readFileSync(served(s), 'utf8'), context, { filename: s });
    }
    const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);
    // Walk every state a child can reach: each choice, each toggle, and a full step cycle.
    for (const input of l.inputs) {
      if (input.type === 'choice') {
        for (const c of input.choices) {
          inst.setInput(input.key, c);
          for (let i = 0; i < 10; i++) inst.step();
        }
      } else {
        inst.setInput(input.key, 1);
        inst.setInput(input.key, 0);
      }
    }
    for (let i = 0; i < 20; i++) inst.step();
    inst.reset();

    assert.deepEqual([...new Set(bad)], [], `${l.slug} drew with non-finite coordinates`);
    const drawOps = (counts.fillText || 0) + (counts.stroke || 0) + (counts.fill || 0);
    assert.ok(drawOps > 50, `${l.slug} issued only ${drawOps} draw calls — it may render blank`);
    assert.ok((counts.fillText || 0) > 0, `${l.slug} drew no text at all`);
  }
});
