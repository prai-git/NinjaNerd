/* Programming — the third Learn-only animation topic (2026-10-30).

   Modelled on test_control_logic.test.js and test_electrical_design.test.js, and holding the
   same promises: the lessons RUN (via vm, against a recording canvas that rejects non-finite
   coordinates), the topic writes nothing, the taxonomy is untouched, and the tile respects its
   own MIN_GRADE.

   What is checked by EXECUTION rather than by reading the source, because canvas code fails
   quietly and a lesson that teaches the wrong thing confidently is the worst outcome here:
     - every lesson constructs, steps, toggles, drags and resets without throwing;
     - no draw call receives NaN or Infinity (nothing is silently not drawn);
     - the interpreters are right: the loop traces, the branch selection, the variable
       assignment and the pipeline's stop-stage are asserted against the semantics, not
       against a copied table. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { LESSONS, MIN_GRADE, lessonBySlug } from '../app/js/programming-data.js';
import { enumerate, sweep, interactionSweep, signature, factory } from './helpers/lesson-harness.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const served = (p) => join(repoRoot, 'app', p);

/* Comments are stripped before the writes-nothing scan. The sources DOCUMENT that this topic
   writes nothing, so scanning raw text would match the very sentence promising the opposite —
   the assertion would fail on its own explanation. Only executable code is checked. */
const stripComments = (js) => js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---- the manifest --------------------------------------------------------------------------

test('the manifest holds the four lessons the owner asked for, in teaching order', () => {
  assert.deepEqual(LESSONS.map((l) => l.slug),
    ['variables', 'conditionals', 'loops', 'build-pipeline']);
  // Order is content: a loop condition means nothing before variables and conditionals.
  assert.equal(lessonBySlug('loops').name, 'Loops');
  assert.equal(lessonBySlug('nope'), null);
});

test('the topic is offered from grade 6 up — the owner asked for 6th and 7th', () => {
  assert.equal(MIN_GRADE, 6);
  /* Written as a FLOOR, not a range, like both sibling topics: grade 7 is the top grade today,
     so "6 and above" and "6 and 7" are the same set, and a grade 8 would pick it up with no
     edit here. test_landing/test_data pin the current MAX_GRADE separately. */
  const flow = read('app/js/flow.js');
  assert.match(flow, /MAX_GRADE = 7/, 'if MAX_GRADE moves, re-read this test');
});

test('every declared css and script exists and is a relative served path', () => {
  for (const l of LESSONS) {
    for (const p of [...l.css, ...l.scripts]) {
      assert.ok(!p.startsWith('/'), `${l.slug}: ${p} must not be root-absolute`);
      assert.ok(existsSync(served(p)), `${l.slug}: missing file ${p} (expected app/${p})`);
    }
  }
});

test('lesson sources are CLASSIC scripts, not ES modules', () => {
  for (const l of LESSONS) {
    for (const src of l.scripts) {
      const code = readFileSync(served(src), 'utf8');
      // An `export` makes it a module, and lesson.js resolves the class off the global lexical
      // binding — which a module scope breaks SILENTLY.
      assert.doesNotMatch(code, /^\s*export\s/m, `${src} must not use export`);
      assert.doesNotMatch(code, /^\s*import\s/m, `${src} must not use import`);
    }
  }
});

test('every lesson declares inputs the child can interact with', () => {
  for (const l of LESSONS) {
    assert.ok(Array.isArray(l.inputs) && l.inputs.length > 0, `${l.slug}: needs inputs`);
    for (const i of l.inputs) {
      assert.ok(i.key && i.label, `${l.slug}: an input needs a key and a label`);
      assert.ok(['toggle', 'choice', 'range'].includes(i.type), `${l.slug}: bad type ${i.type}`);
      if (i.type === 'choice') assert.ok(i.choices.length >= 2, `${l.slug}: ${i.key}`);
      if (i.type === 'range') {
        assert.ok(Number.isFinite(i.min) && Number.isFinite(i.max) && i.max > i.min,
          `${l.slug}: ${i.key} needs a sane min/max`);
      }
    }
  }
});

test('the three concept lessons offer both watch and build, as the owner chose', () => {
  for (const slug of ['variables', 'conditionals', 'loops']) {
    const mode = lessonBySlug(slug).inputs.find((i) => i.key === 'mode');
    assert.ok(mode, `${slug}: needs a mode control`);
    assert.deepEqual(mode.choices, ['watch', 'build']);
  }
  // The pipeline has no build mode: there is nothing to assemble, only stages to follow.
  assert.equal(lessonBySlug('build-pipeline').inputs.find((i) => i.key === 'mode'), undefined);
});

// ---- the Learn-only promise ----------------------------------------------------------------

test('no lesson has a score, timer or failure state', () => {
  for (const l of LESSONS) {
    const code = l.scripts.map((s) => readFileSync(served(s), 'utf8')).map(stripComments).join('\n');
    for (const forbidden of ['score++', 'gameOver', 'lives--', 'setInterval']) {
      assert.ok(!code.includes(forbidden), `${l.slug} must not use ${forbidden}`);
    }
  }
});

test('the topic writes nothing — no Firestore, no progress, no rules change', () => {
  const sources = ['app/js/programming.js', 'app/js/lesson.js', 'app/js/programming-data.js']
    .map(read)
    .concat(LESSONS.flatMap((l) => l.scripts.map((s) => readFileSync(served(s), 'utf8'))))
    .map(stripComments)
    .join('\n');
  for (const forbidden of ['firebase', 'firestore', 'emitAttempt', 'setDoc', 'addDoc', 'writeBatch']) {
    assert.ok(!new RegExp(forbidden, 'i').test(sources),
      `Programming must not reference ${forbidden} — it is Learn-only by owner decision`);
  }
  // And the Firestore rules' topic list must stay as it was; this topic sits outside it.
  assert.match(read('dbmgr/firestore.rules'), /d\.topic in \['math', 'english', 'science'\]/);
});

test('the taxonomy is untouched — these four are not legacy subtopics', () => {
  const taxonomy = read('app/js/subtopics-data.js');
  for (const l of LESSONS) {
    assert.ok(!taxonomy.includes(l.slug),
      `${l.slug} must not be added to the curated SUBTOPICS taxonomy`);
  }
});

// ---- wiring ---------------------------------------------------------------------------------

test('the topics tile appears from MIN_GRADE up and not below', () => {
  const src = read('app/js/topics.js');
  assert.match(src, /import \{ MIN_GRADE as PROGRAMMING_MIN_GRADE \}/,
    'the floor must be read from the manifest, never hardcoded in topics.js');
  assert.match(src, /grade >= PROGRAMMING_MIN_GRADE/);
  assert.match(src, /pages\/programming\.html\?grade=/);
});

test('the list page refuses a grade below the floor', () => {
  const src = read('app/js/programming.js');
  assert.match(src, /grade < MIN_GRADE/);
  assert.match(src, /location\.replace\('index\.html'\)/);
});

test('the lesson link names its topic, or the player would load the wrong manifest', () => {
  /* Comments stripped: the header of programming.js DOCUMENTS that the link carries
     `&topic=programming`, so scanning raw text matches the promise rather than the code. A
     mutation that deleted the parameter from the template literal passed until this line was
     added — the same failure mode the writes-nothing scan above is written to avoid. */
  assert.match(stripComments(read('app/js/programming.js')), /topic=programming/);
  const player = read('app/js/lesson.js');
  assert.match(player, /programming: \{/);
  assert.match(player, /page: 'pages\/programming\.html'/);
  // Control Logic deliberately relies on the default, so that must survive.
  assert.match(player, /TOPICS\[param\('topic'\)\] \|\| TOPICS\['control-logic'\]/);
});

test('the list page carries a <base> and the shared shell', () => {
  const list = read('app/pages/programming.html');
  assert.match(list, /<base href="\.\.\/" \/>/);
  assert.ok(list.indexOf('<base') < list.indexOf('<link rel="stylesheet"'),
    '<base> must precede any URL-bearing element');
  assert.doesNotMatch(list, /(href|src)="\//, 'no root-absolute paths');
  for (const needed of ['data-nn-header', 'data-nn-footer', 'assets/js/layout.js',
    'js/programming.js']) {
    assert.ok(list.includes(needed), `programming.html must include ${needed}`);
  }
});

// ---- execution ------------------------------------------------------------------------------

/* A recording 2d context. Every call is logged, and any non-finite numeric argument throws:
   canvas silently draws nothing for NaN, so without this a broken lesson looks like a blank
   panel and every assertion still passes. */
function recorder(height) {
  const calls = [];
  const bad = [];
  const ctx = new Proxy({ canvas: { width: 960, height } }, {
    get(target, key) {
      if (key === 'canvas') return target.canvas;
      if (key === 'measureText') return (s) => ({ width: String(s).length * 8 });
      return (...args) => {
        args.forEach((a, i) => {
          if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${String(key)} arg${i}=${a}`);
        });
        calls.push(String(key));
      };
    },
    set() { return true; },
  });
  return { ctx, calls, bad };
}

function runLesson(l) {
  const { ctx, calls, bad } = recorder(l.canvasHeight || 500);
  const canvas = {
    width: 960,
    height: l.canvasHeight || 500,
    getContext: () => ctx,
    // No addEventListener and no getBoundingClientRect: bindPointer() and toCanvas() must both
    // guard for this, because the lesson is constructed here with no DOM at all.
  };
  const context = vm.createContext({
    document: { getElementById: () => canvas },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    console,
  });
  for (const src of l.scripts) {
    vm.runInContext(readFileSync(served(src), 'utf8'), context, { filename: src });
  }
  return { context, calls, bad, canvas };
}

test('every lesson class binds lexically, not onto window', () => {
  for (const l of LESSONS) {
    const { context } = runLesson(l);
    assert.equal(vm.runInContext(`typeof globalThis[${JSON.stringify(l.globalName)}]`, context),
      'undefined', `${l.slug}: a window[...] lookup would fail — globalCtor exists for this`);
    assert.equal(vm.runInContext(`typeof ${l.globalName}`, context), 'function',
      `${l.slug}: ${l.globalName} must be a class in global lexical scope`);
  }
});

test('every lesson constructs, steps, toggles and resets without throwing', () => {
  for (const l of LESSONS) {
    const { context, calls, bad } = runLesson(l);
    const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);
    assert.ok(inst, `${l.slug}: construction returned nothing`);

    // Exercise every input through every value it declares.
    for (const input of l.inputs) {
      if (input.type === 'choice') {
        for (const c of input.choices) {
          inst.setInput(input.key, c);
          assert.equal(inst.getInput(input.key), c, `${l.slug}: ${input.key} did not take ${c}`);
        }
      } else if (input.type === 'range') {
        for (const v of [input.min, input.max, Math.round((input.min + input.max) / 2)]) {
          inst.setInput(input.key, v);
          assert.ok(Number.isFinite(inst.getInput(input.key)), `${l.slug}: ${input.key} rejected ${v}`);
        }
      } else {
        inst.setInput(input.key, true);
        inst.setInput(input.key, false);
      }
      assert.ok(Array.isArray(inst.activeInputs()), `${l.slug}: activeInputs must return a list`);
    }

    // Step well past the end: every lesson must wrap rather than run off its own program.
    for (let i = 0; i < 24; i++) inst.step();
    inst.reset();
    inst.start();
    inst.stop();

    assert.deepEqual(bad, [], `${l.slug}: non-finite canvas arguments — these draw NOTHING`);
    assert.ok(calls.length > 60,
      `${l.slug}: only ${calls.length} draw calls, which is too few to be a drawn lesson`);
  }
});

test('build mode drags and drops without a DOM, and an undropped slot blocks nothing', () => {
  for (const slug of ['variables', 'conditionals', 'loops']) {
    const l = lessonBySlug(slug);
    const { context, bad } = runLesson(l);
    const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);
    inst.setInput('mode', 'build');
    if (slug === 'loops') inst.setInput('kind', 'count');

    // Nothing dropped yet: the lesson must still draw and must not claim the goal is met.
    assert.equal(inst.goalMet, false, `${slug}: no block dropped, so no goal`);

    const palette = inst.paletteLayout();
    const slot = inst.slotRect();
    assert.ok(palette.length >= 2, `${slug}: needs a palette`);
    // Drag the first block into the slot, the way a pointer would.
    inst.onDown({ x: palette[0].x + 4, y: palette[0].y + 4 });
    inst.onMove({ x: slot.x + 10, y: slot.y + 10 });
    inst.onUp({ x: slot.x + 10, y: slot.y + 10 });
    assert.equal(typeof inst.goalMet, 'boolean', `${slug}: goalMet must be decidable`);

    // A drop that misses every slot must not leave a dangling drag or change the answer.
    inst.onDown({ x: palette[1].x + 4, y: palette[1].y + 4 });
    inst.onUp({ x: 5, y: 5 });
    assert.equal(inst.drag, null, `${slug}: a missed drop must clear the drag`);
    for (let i = 0; i < 12; i++) inst.step();
    assert.deepEqual(bad, [], `${slug}: non-finite canvas arguments in build mode`);
  }
});

// ---- the interpreters are checked against the semantics, not a copied table ----------------

test('a variable assignment REPLACES, and reading does not change it', () => {
  const l = lessonBySlug('variables');
  const { context } = runLesson(l);
  const run = vm.runInContext('VariablesLesson.run', context);

  // Line 1 creates score; line 4 replaces it. `add` = score + bonus.
  const after1 = run({ start: 10, bonus: 5, pick: 'add', upto: 1 });
  assert.equal(after1.mem.score, 10);
  const after4 = run({ start: 10, bonus: 5, pick: 'add', upto: 4 });
  assert.equal(after4.mem.score, 15, 'the bonus is added to the value already there');
  assert.equal(after4.changed.was, 10, 'and the old value is reported as replaced');

  // SHOW appends to output and leaves memory alone.
  const all = run({ start: 10, bonus: 5, pick: 'add', upto: 99 });
  assert.equal(all.mem.score, 15);
  assert.ok(all.out.includes('15'), 'SHOW score prints what the box holds');
  assert.equal(all.mem.lives, 2, 'lives went 3 then 3-1');

  // The wrong blocks must actually produce wrong numbers — that is what makes build mode real.
  assert.equal(run({ start: 10, bonus: 5, pick: 'bonusonly', upto: 4 }).mem.score, 5);
  assert.equal(run({ start: 10, bonus: 5, pick: 'double', upto: 4 }).mem.score, 20);
  assert.equal(run({ start: 10, bonus: 5, pick: 'sub', upto: 4 }).mem.score, 5);

  // With nothing dropped the line cannot run at all, and says so rather than inventing 0.
  const blocked = run({ start: 10, bonus: 5, pick: null, upto: 99 });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.mem.score, 10, 'memory stops at the last line that could run');
});

test('the first true branch wins, and the ones below it are never tested', () => {
  const l = lessonBySlug('conditionals');
  const { context } = runLesson(l);
  const evaluate = vm.runInContext('ConditionalsLesson.evaluate', context);

  // IF chain: > 30, > 20, > 10, else.
  assert.equal(evaluate('ifelse', 35).taken, 0, '35 takes the first branch');
  assert.equal(evaluate('ifelse', 25).taken, 1);
  assert.equal(evaluate('ifelse', 15).taken, 2);
  assert.equal(evaluate('ifelse', 5).taken, 3, 'nothing matched, so ELSE runs');

  // The branches below the winner must not even be evaluated.
  const hot = evaluate('ifelse', 35);
  assert.equal(hot.verdicts.length, 1, 'only one test was performed');

  // 25 is > 20 AND > 10, but only the FIRST true one is taken — the classic mistake.
  const warm = evaluate('ifelse', 25);
  // Spread across the realm boundary: an array built inside the vm has that context's
  // Array.prototype, so deepStrictEqual fails on identity even when the contents match.
  assert.deepEqual([...warm.verdicts], [false, true]);
  assert.equal(warm.branches[warm.taken].out, 'window open');

  // CHOOSE matches exact values; 4 has no WHEN of its own and falls to OTHERWISE.
  assert.equal(evaluate('choose', 1).branches[evaluate('choose', 1).taken].out, 'slow');
  assert.equal(evaluate('choose', 3).branches[evaluate('choose', 3).taken].out, 'fast');
  assert.equal(evaluate('choose', 4).taken, 3, 'no WHEN matches 4');
});

test('a counting loop can run zero times; repeat-until always runs once', () => {
  const l = lessonBySlug('loops');
  const { context } = runLesson(l);
  const trace = vm.runInContext('LoopsLesson.trace', context);

  /* THE point of this lesson. A counting loop tests first, so a condition that is already
     false runs the body zero times. Repeat-until tests last, so it cannot. */
  const zero = trace('count', 0, null);
  assert.equal(zero.total, 0, 'i <= 0 is false at i = 1, so nothing is added');
  assert.equal(zero.passes.filter((p) => p.test).length, 0, 'the body ran zero times');

  const once = trace('until', 0, null);
  assert.ok(once.total >= 2, 'repeat-until added 2 before it was allowed to test');
  assert.equal(once.passes.length, 1, 'exactly one pass, then it stopped');

  // 1+2+3+4 = 10, and the body ran four times.
  const four = trace('count', 4, null);
  assert.equal(four.total, 10);
  assert.equal(four.passes.filter((p) => p.test).length, 4);
  assert.equal(trace('count', 6, null).total, 21, '1+2+3+4+5+6');

  // The build-mode blocks: `i <= limit` is right, `i < limit` is one pass short.
  assert.equal(trace('count', 4, 'le').total, 10);
  assert.equal(trace('count', 4, 'lt').total, 6, 'i < 4 stops before adding 4');

  /* A runaway must be REPORTED, not hang the page and not silently truncate. `i > limit` is
     false at i = 1 for a positive limit, so it ends immediately; `i = limit` never becomes
     false once passed. Either way the trace must terminate. */
  const eq = trace('count', 4, 'eq');
  assert.ok(eq.passes.length <= 51, 'the trace is capped rather than looping for ever');
  assert.ok(eq.runaway || eq.passes.length < 51, 'and it says which happened');
});

test('each build fault stops at the one tool whose job it is', () => {
  const l = lessonBySlug('build-pipeline');
  const { context } = runLesson(l);
  const pipeline = vm.runInContext('BuildPipelineLesson.pipeline', context);

  const clean = pipeline({ library: false, fault: 'none', upto: 5 });
  assert.equal(clean.halted, false);
  assert.equal(clean.stages[4].state, 'active', 'a clean build reaches the executable');

  // A missing header dies in the PREPROCESSOR — it never reaches the compiler.
  const h = pipeline({ library: false, fault: 'header', upto: 5 });
  assert.equal(h.halted, true);
  assert.equal(h.stages[h.stopIndex].key, 'pre');
  assert.equal(h.stages[2].state, 'pending', 'the compiler never ran');

  // A typo dies in the COMPILER: the preprocessor only moves text, it does not parse.
  const s = pipeline({ library: false, fault: 'syntax', upto: 5 });
  assert.equal(s.stages[s.stopIndex].key, 'compile');
  assert.equal(s.stages[1].state, 'done', 'the preprocessor finished fine');

  /* The most important one: a function declared but never written COMPILES and fails at the
     LINKER. "It compiled" and "it built" are different sentences, and this is why. */
  const m = pipeline({ library: false, fault: 'missing', upto: 5 });
  assert.equal(m.stages[m.stopIndex].key, 'link');
  assert.equal(m.stages[2].state, 'done', 'it really did compile');
  assert.match(m.fault.msg, /undefined reference/);

  // The linker only has two inputs when a library is in play — that is what makes it visible.
  assert.deepEqual([...pipeline({ library: false, fault: 'none', upto: 1 }).linkInputs],
    ['main.o']);
  assert.deepEqual([...pipeline({ library: true, fault: 'none', upto: 1 }).linkInputs],
    ['main.o', 'libm.a']);
});

test('the pipeline lesson shows real C, and says so — the one flagged divergence', () => {
  /* The owner chose language-neutral pseudocode for this topic and lessons 1-3 honour it.
     This lesson cannot: #include is the preprocessor's input and an object file is what a
     compiler emits, so a pseudocode toolchain would be invented rather than taught. The
     divergence is recorded in the lesson header and in CLAUDE.md; this test pins the one
     thing that makes it safe — the screen tells the child it has switched to a real language. */
  const code = readFileSync(served('static/programming/build-pipeline/lesson.js'), 'utf8');
  assert.match(code, /#include/, 'the preprocessor stage needs a real directive');
  assert.match(stripComments(code), /This is C — one real language/,
    'the child must be told this lesson is not pseudocode');

  // And the three concept lessons must NOT have drifted into C syntax.
  for (const slug of ['variables', 'conditionals', 'loops']) {
    const src = stripComments(
      readFileSync(served(`static/programming/${slug}/lesson.js`), 'utf8'));
    assert.doesNotMatch(src, /#include|printf|\bint main\b/,
      `${slug} must stay language-neutral pseudocode`);
  }
});

// ---- layout, replayed with real geometry ---------------------------------------------------

/* THE OWNER FOUND THREE DEFECTS THAT EVERY TEST ABOVE PASSED THROUGH, and all three were
   layout: the OUTPUT console was painted over by the panel drawn after it, so `SHOW name`
   vanished. The recording context used above only rejects NON-FINITE coordinates — it cannot
   see that two finite rectangles overlap.

   So this replays each lesson through a context that keeps every rectangle, in order, and
   asserts the two things a reader actually notices:
     - nothing is drawn outside the canvas;
     - no text is covered by an opaque fill drawn LATER than it.
   Text metrics are approximated at 0.56em per character. That is coarse, and deliberately so:
   the point is to catch a panel sitting on top of a console, not to typeset. */// ---- layout and interaction, swept over the WHOLE declared state space --------------------

/* These used to drive an 18-entry hand-written state list. The owner then found ten defects
   that the suite passed through, every one of them in a combination the list did not contain.
   The list is gone: `enumerate()` derives the states from each lesson's own manifest — 592 for
   this topic — and `sweep()` runs the invariant battery over all of them.

   The test NAMES below are unchanged on purpose. Each one is the regression record for a defect
   the owner reported, and `comm -23` in /fix-or-ferment step 5 would flag a vanished name as
   lost coverage. They are now thin assertions over one shared battery instead of six
   re-implementations of the same recording canvas. */

const SWEPT = LESSONS.map((l) => ({ lesson: l, ...sweep(l, served) }));
const INTERACTED = LESSONS.map((l) => ({ lesson: l, ...interactionSweep(l, served) }));

// The sweep must actually visit everything the manifest describes. Without this a future
// change could shrink the space to one state and every invariant below would pass.
test('the sweep visits every state the manifests declare', () => {
  for (const { lesson, frames } of SWEPT) {
    assert.equal(frames, enumerate(lesson).length,
      `${lesson.slug}: swept ${frames} frames but the manifest describes ${enumerate(lesson).length}`);
  }
  const total = SWEPT.reduce((n, s) => n + s.frames, 0);
  assert.ok(total >= 592,
    `${total} frames swept; 592 was the measured size of this topic's state space`);
});

// One assertion per invariant, so a failure names the defect CLASS rather than "layout broke".
const invariant = (name) => {
  const all = SWEPT.flatMap(({ failures }) => failures.get(name) || []);
  assert.deepEqual([...new Set(all)].slice(0, 12), [],
    `${name}: ${all.length} failures across the swept state space`);
};

test('nothing is drawn outside the canvas, in any reachable state', () => {
  invariant('I1 nothing drawn outside the canvas');
});

test('no two panels overlap — the defect that hid the OUTPUT box', () => {
  invariant('I2 no two panels overlap');
});

test('no two labels overlap, in either direction', () => {
  invariant('I3 no two labels overlap');
});

test('no text is painted over by a panel drawn after it', () => {
  invariant('I4 no text fully covered by a later fill');
});

test('no lesson draws with a non-finite coordinate, and no frame is blank', () => {
  invariant('I5 no non-finite coordinate');
  invariant('I6 the frame is not blank');
});

// ---- interaction invariants ----------------------------------------------------------------

const interaction = (name) => {
  const all = INTERACTED.flatMap(({ failures }) => failures.get(name) || []);
  assert.deepEqual([...new Set(all)], [], `${name}: ${all.length} failures`);
};

test('the interaction sweep actually ran checks', () => {
  const total = INTERACTED.reduce((n, s) => n + s.checks, 0);
  assert.ok(total >= 40, `only ${total} interaction checks ran`);
});

test('every value of every control changes what is drawn', () => {
  interaction('B1 every control value changes the frame');
});

test('watch and build are visibly DIFFERENT modes', () => {
  interaction('B2 modes differ');
});

test('a block can be dropped in EVERY shape, not just the default one', () => {
  interaction('B6 a drawn palette is draggable');
  interaction('B8 exactly one block satisfies the goal');
});

test('switching back to Watch shows the WRITTEN program, not what you built', () => {
  interaction('B9 watch ignores what was built');
});

test('every condition offered tests the value its own shape is about', () => {
  /* `i >= limit` was offered as a repeat-until condition. The pass counter belongs to the
     counting shape; this loop's UNTIL line tests the accumulator, so a block about `i` reads
     as one borrowed from the other lesson. The two palettes must speak about different
     things, not merely be different lists. */
  const l = lessonBySlug('loops');
  const { context } = runLesson(l);
  const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);

  inst.setInput('mode', 'build');
  inst.setInput('kind', 'until');
  for (const b of inst.paletteLayout()) {
    assert.match(b.label, /^total /,
      `repeat-until offers "${b.label}", which is not about the value its UNTIL line tests`);
  }

  inst.setInput('kind', 'count');
  for (const b of inst.paletteLayout()) {
    assert.match(b.label, /^i /,
      `the counting loop offers "${b.label}", which is not about its counter`);
  }
});

test('a block dropped for one shape is not offered as the other shape\'s condition', () => {
  /* Conditionals and Loops each have two shapes with different palettes. Switching shape must
     clear the pick, or the hole shows a condition from the wrong language. */
  for (const [slug, key, a, b] of [
    ['conditionals', 'form', 'ifelse', 'choose'],
    ['loops', 'kind', 'count', 'until'],
  ]) {
    const l = lessonBySlug(slug);
    const { context } = runLesson(l);
    const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);
    inst.setInput('mode', 'build');
    inst.setInput(key, a);
    const palA = inst.paletteLayout();
    const slot = inst.slotRect();
    inst.onDown({ x: palA[0].x + 4, y: palA[0].y + 4 });
    inst.onUp({ x: slot.x + 10, y: slot.y + 10 });
    assert.ok(inst.pick, `${slug}: the drop should have registered`);

    inst.setInput(key, b);
    assert.equal(inst.pick, null,
      `${slug}: switching ${key} must clear a pick belonging to the other palette`);
    // ...and the other shape must offer its OWN blocks.
    const palB = inst.paletteLayout();
    assert.notDeepEqual(palB.map((x) => x.label), palA.map((x) => x.label),
      `${slug}: ${b} must offer different blocks from ${a}`);
    assert.equal(inst.goalMet, false, `${slug}: no pick, so no goal`);
  }
});

// ---- the defects the owner found ------------------------------------------------------------

test('SHOW actually prints: both lessons with output render a console', () => {
  /* The conditionals listing says SHOW on every branch and printed NOWHERE until the owner
     looked. The console is the only thing on screen that can honour the word SHOW, so its
     presence is asserted rather than assumed. */
  const vars = factory(lessonBySlug('variables'), served)({ steps: 7 });
  const varTexts = vars.ops.filter((o) => o.op === 'text').map((o) => o.s);
  assert.ok(varTexts.includes('OUTPUT'), 'variables must show an OUTPUT console');
  assert.ok(varTexts.includes('15'), 'SHOW score must print the score');
  assert.ok(varTexts.includes('"Ninja"'), 'SHOW name must print the name — and stay visible');

  /* ONE step, not two: 35 makes the first branch true immediately, and stepping again wraps
     the chain back to "nothing tested yet" — which is correct behaviour, not a bug. */
  const cond = factory(lessonBySlug('conditionals'), served)({ state: { temp: 35 }, steps: 1 });
  const condTexts = cond.ops.filter((o) => o.op === 'text').map((o) => o.s);
  assert.ok(condTexts.includes('OUTPUT'), 'conditionals must show an OUTPUT console');
  assert.ok(condTexts.includes('fan on'), 'the branch that was taken must print its output');

  // And only the taken branch prints — the others never ran.
  assert.ok(!condTexts.includes('window open'), 'a branch that did not run must not print');
});

test('each build fault is VISIBLE in the source the child is shown', () => {
  /* Two defects the owner found: "Typo" showed clean source and then a compiler error out of
     nowhere, and "Function never written" reported `undefined reference to bonus_points` when
     nothing on screen mentioned bonus_points. The symbol the error names is now required to
     appear in the source, which ties the two together so they cannot drift apart again. */
  const l = lessonBySlug('build-pipeline');
  const { context } = runLesson(l);
  const Ctor = vm.runInContext('BuildPipelineLesson', context);
  const inst = vm.runInContext(`new ${l.globalName}('lessonCanvas')`, context);
  const faults = Ctor.FAULTS;

  for (const name of ['header', 'syntax', 'missing']) {
    inst.setInput('fault', name);
    const source = [...inst.artefact('source')].join('\n');
    const symbol = faults[name].symbol;
    assert.ok(symbol, `${name}: the fault must declare the symbol it blames`);
    assert.ok(source.includes(symbol),
      `${name}: the fault blames "${symbol}" but the source never shows it:\n${source}`);
    /* `symbol` is what must be VISIBLE IN THE SOURCE. Only header and missing name an
       identifier in the message too; the syntax error names a semicolon, not a function, so
       requiring msg to contain the symbol would be wrong rather than strict. */
    if (name !== 'syntax') {
      assert.ok(faults[name].msg.includes(symbol),
        `${name}: the error message must name the same symbol the source shows`);
    }
  }
  assert.match(faults.syntax.msg, /';'/, 'the typo error names the missing semicolon');

  // The typo must be a REAL missing semicolon, not a clean line with a scary caption.
  inst.setInput('fault', 'syntax');
  const typo = [...inst.artefact('source')];
  const callLine = typo.find((ln) => ln.includes('printf'));
  assert.ok(callLine && !callLine.includes(');'),
    `the "typo" source must actually be missing its semicolon, got: ${callLine}`);
  // ...and the preprocessor must carry it through, because it moves text without reading it.
  /* `printf("` not `printf(`: the preprocessor's output also contains the pasted-in
     declaration `extern int printf(const char*, ...);`, which legitimately ends in `);`. */
  const pre = [...inst.artefact('pre')].find((ln) => ln.includes('printf("'));
  assert.ok(pre && !pre.includes(');'),
    `the typo must survive the preprocessor, got: ${pre}`);

  // A declared-but-never-defined function is what makes this a LINKER error, so the source
  // must both declare it and call it.
  inst.setInput('fault', 'missing');
  const miss = [...inst.artefact('source')].join('\n');
  assert.match(miss, /int bonus_points\(void\);/, 'declared');
  assert.match(miss, /bonus_points\(\)/, 'and called');
  assert.match([...inst.artefact('compile')].join('\n'), /bonus_points/,
    'the object code must show the hole named after the missing function, not printf');

  // With no fault the source must be clean — no scary markers left behind.
  inst.setInput('fault', 'none');
  const clean = [...inst.artefact('source')].join('\n');
  assert.doesNotMatch(clean, /<-/, 'a clean build shows unannotated source');
  assert.match(clean, /printf\("hello"\);/, 'and a properly terminated statement');
});
