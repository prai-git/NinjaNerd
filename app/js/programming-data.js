/* Programming manifest. Third of the Learn-only animation topics, after control-logic-data.js
   and electrical-design-data.js, and loaded by the SAME player (lesson.js) through its topic
   registry — three topics share one player rather than each having a near-copy of it.

   LEARN-ONLY, exactly like its two siblings. It writes nothing — no Firestore, no progress, no
   score, no timer, no failure state — so it needs no security-rules change and sits entirely
   outside `d.topic in ['math','english','science']` and the 21-key roll-up cap.
   `test_programming.test.js` asserts that by scanning the sources.

   THE LESSON CONTRACT is unchanged from control-logic-data.js:

     constructor(canvasId) · start() · stop() · reset() · step() · setInput(key, value)
     getInput(key) · activeInputs()

   Scripts are CLASSIC (non-module) files loaded in order. A top-level `class X {}` binds in
   the global LEXICAL scope, which is what lesson.js resolves; an `export` breaks it silently.
   Paths omit the leading slash so they resolve at both mount points via each page's <base>.

   TWO OWNER DECISIONS SHAPE EVERY LESSON HERE (2026-10-30), and both cut against the obvious:

   1. THE CODE ON SCREEN IS LANGUAGE-NEUTRAL PSEUDOCODE, not C and not Python. The owner was
      shown all three and chose pseudocode. The consequence is worth stating because it is not
      free: `switch`/`case` and `do`/`while` are C keywords and pseudocode has neither, yet the
      owner asked for both concepts by name. They are taught as SHAPES — `CHOOSE … WHEN …
      OTHERWISE` and `REPEAT … UNTIL` — with the real keyword named beside each, so a child
      learns the idea without a language and still recognises `switch` when they meet it. Every
      lesson keeps that pairing; dropping it would quietly drop half the ask.

   2. EVERY CONCEPT LESSON HAS TWO MODES: watch, then build. The child first runs a finished
      program line by line and watches memory change, then switches to Build and assembles the
      key statement from dragged blocks. The watch half is Control Logic's idiom; the build half
      is Electrical Design's Design lesson. Both were asked for, so `mode` is an input on
      lessons 1-3 rather than two separate lessons.

   The build pipeline (lesson 4) has no build mode and NO pseudocode — see its own note. */

/* Owner decision (2026-10-30): "add Programming under 6th and 7th grade". Written as a FLOOR,
   like both siblings, so it picks up any grade added above it rather than needing another edit.
   Grade 7 is the top grade today, so today the floor and "grades 6 and 7" are the same set.
   The content is not grade-scaled — a loop is a loop — so there is ONE set of four lessons. */
export const MIN_GRADE = 6;

const draw = 'static/programming/common/draw.js';

/* Lessons 1-3 stack code, a memory panel, an output console and a block palette, which does
   not fit in the 500 px the Control Logic lessons use. Lesson 4 is a horizontal pipeline and
   needs less. Both are data, not player behaviour — lesson.js already reads `canvasHeight`. */
const CONCEPT_HEIGHT = 640;

export const LESSONS = [
  {
    slug: 'variables',
    name: 'Variables',
    description: 'A variable is a labelled box. Watch values go in, get replaced, and get read back out.',
    icon: 'fa-box',
    color: 'primary',
    css: [],
    scripts: [draw, 'static/programming/variables/lesson.js'],
    globalName: 'VariablesLesson',
    canvasHeight: CONCEPT_HEIGHT,
    hasStep: true,
    stepLabel: 'Run next line',
    inputs: [
      { key: 'mode', label: 'Mode', type: 'choice', choices: ['watch', 'build'],
        choiceLabels: { watch: 'Watch it run', build: 'Build it yourself' } },
      // The child re-runs the same program with different numbers, which is the whole point of
      // a variable: the code does not change, the value does.
      /* NOT `start`: a lesson storing its slider as `this.start` would shadow the contract's
         start() method, and the player calls that to begin the animation loop. The collision
         throws at runtime and draws nothing — the test caught it, the browser would not have. */
      { key: 'startScore', label: 'Starting score', type: 'range', min: 0, max: 50, step: 5 },
      { key: 'bonus', label: 'Bonus', type: 'range', min: 1, max: 20, step: 1 },
    ],
  },
  {
    slug: 'conditionals',
    name: 'Conditional Statements',
    description: 'if / else and choose / when: how a program picks one path out of several, and when each shape fits.',
    icon: 'fa-code-branch',
    color: 'info',
    css: [],
    scripts: [draw, 'static/programming/conditionals/lesson.js'],
    globalName: 'ConditionalsLesson',
    canvasHeight: CONCEPT_HEIGHT,
    hasStep: true,
    stepLabel: 'Test next branch',
    inputs: [
      { key: 'mode', label: 'Mode', type: 'choice', choices: ['watch', 'build'],
        choiceLabels: { watch: 'Watch it run', build: 'Build it yourself' } },
      /* Two shapes side by side rather than two lessons: the teaching is that they are the
         same decision written differently, and that one reads better when you are testing
         RANGES and the other when you are matching exact VALUES. */
      { key: 'form', label: 'Shape', type: 'choice', choices: ['ifelse', 'choose'],
        choiceLabels: { ifelse: 'IF / ELSE', choose: 'CHOOSE / WHEN' } },
      { key: 'temp', label: 'Temperature', type: 'range', min: 0, max: 40, step: 1, unit: '°C' },
      { key: 'level', label: 'Level', type: 'range', min: 1, max: 4, step: 1 },
    ],
  },
  {
    slug: 'loops',
    name: 'Loops',
    description: 'Counting loops and repeat-until loops: how a program repeats work, and how it knows when to stop.',
    icon: 'fa-rotate',
    color: 'success',
    css: [],
    scripts: [draw, 'static/programming/loops/lesson.js'],
    globalName: 'LoopsLesson',
    canvasHeight: CONCEPT_HEIGHT,
    hasStep: true,
    stepLabel: 'Next time round',
    inputs: [
      { key: 'mode', label: 'Mode', type: 'choice', choices: ['watch', 'build'],
        choiceLabels: { watch: 'Watch it run', build: 'Build it yourself' } },
      { key: 'kind', label: 'Loop', type: 'choice', choices: ['count', 'until'],
        choiceLabels: { count: 'Counting (for)', until: 'Repeat-until (do-while)' } },
      { key: 'limit', label: 'Stop at', type: 'range', min: 2, max: 10, step: 1 },
    ],
  },
  {
    slug: 'build-pipeline',
    name: 'How Code Is Built',
    description: 'Source code to a running program: preprocessor, compiler, linker, and the machine code at the end.',
    icon: 'fa-gears',
    color: 'warning',
    css: [],
    scripts: [draw, 'static/programming/build-pipeline/lesson.js'],
    globalName: 'BuildPipelineLesson',
    canvasHeight: 560,
    hasStep: true,
    stepLabel: 'Next stage',
    inputs: [
      /* A library is what gives the LINKER something to do. With it off the child sees the
         linker pass one object file straight through; with it on they watch two inputs become
         one executable, which is the only way that stage means anything. */
      { key: 'library', label: 'Use a library', type: 'toggle' },
      // An error at one stage is the clearest way to show that the stages are DIFFERENT jobs:
      // a missing header dies in the preprocessor, a typo in the compiler, a missing function
      // body in the linker. Nothing is scored — the child chooses the fault to watch.
      { key: 'fault', label: 'Break it', type: 'choice',
        choices: ['none', 'header', 'syntax', 'missing'],
        choiceLabels: { none: 'No fault', header: 'Missing #include',
          syntax: 'Typo', missing: 'Function never written' } },
    ],
  },
];

export function lessonBySlug(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}
