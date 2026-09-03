/* Control Logic manifest (prompt 20). Mirrors games-data.js in shape and purpose: the lesson
   player page stays data-driven instead of branching per slug.

   This topic is LEARN-ONLY by owner decision. It writes nothing — no Firestore, no progress,
   no score, no timer, no failure state — so it needs no security-rules change and sits
   entirely outside `d.topic in ['math','english','science']`.

   THE LESSON CONTRACT (what lesson.js expects of every class named in `globalName`):

     constructor(canvasId)     same shape as a game
     start()                   begin the animation loop
     stop()                    cancel it; the player calls this on unload
     reset()                   back to the opening state
     step()                    advance one discrete step        [when hasStep]
     setInput(key, value)      a control changed
     getInput(key)             current value, so the player can label the control
     activeInputs()            which of `inputs` apply right now — NOT has no B input,
                               and the diode and transistor have different controls

   Deliberately NOT reused from games: start/pause/game-over. A lesson is not a game (prompt
   20); the controls a lesson needs are reset, step, and inputs the child can toggle, because
   for gates and truth tables the poking IS the learning.

   Scripts are CLASSIC (non-module) files loaded in order, exactly like the games: a top-level
   `class X {}` binds in the global LEXICAL scope, which is what lesson.js resolves. An
   `export` would break loading silently. Paths omit the leading slash so they resolve at both
   mount points via each page's <base> tag. */

/* Lowest grade offered the topic. The content is not grade-scaled — a logic gate is a logic
   gate — so there is ONE set of five lessons rather than per-grade variants. Lessons 1-3 are
   comfortable at grade 5 and 4-5 are a stretch there; the stretch costs nothing because there
   is no assessment, so a child who does not follow the adder watches it and comes back.
   Raising the bar is a one-line change here. */
export const MIN_GRADE = 5;

const common = 'static/control-logic/common/draw.js';

export const LESSONS = [
  {
    slug: 'control-system',
    name: 'Control System',
    description: 'How input devices, a CPU and output devices connect — and what travels between them.',
    icon: 'fa-microchip',
    color: 'primary',
    css: [],
    scripts: [common, 'static/control-logic/control-system/lesson.js'],
    globalName: 'ControlSystemLesson',
    hasStep: true,
    stepLabel: 'Next stage',
    inputs: [
      { key: 'button', label: 'Button', type: 'toggle' },
      { key: 'sensor', label: 'Heat sensor', type: 'toggle' },
    ],
  },
  {
    slug: 'digital-signals',
    name: 'Digital Signals',
    description: 'Bits, bytes, and what a signal actually looks like as it changes over time.',
    icon: 'fa-wave-square',
    color: 'info',
    css: [],
    scripts: [common, 'static/control-logic/digital-signals/lesson.js'],
    globalName: 'DigitalSignalsLesson',
    hasStep: true,
    stepLabel: 'Next bit',
    // Eight switches, because that is exactly what a byte is.
    inputs: Array.from({ length: 8 }, (_, i) => ({
      key: `bit${i}`, label: String(2 ** (7 - i)), type: 'toggle',
    })),
  },
  {
    slug: 'logic-gates',
    name: 'Logic Gates',
    description: 'AND, OR, NOT, NAND, NOR and XOR — what each one does to the signals you give it.',
    icon: 'fa-sitemap',
    color: 'success',
    css: [],
    scripts: [common, 'static/control-logic/logic-gates/lesson.js'],
    globalName: 'LogicGatesLesson',
    hasStep: true,
    stepLabel: 'Next row',
    inputs: [
      { key: 'type', label: 'Gate', type: 'choice',
        choices: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'] },
      { key: 'a', label: 'A', type: 'toggle' },
      { key: 'b', label: 'B', type: 'toggle' },
    ],
  },
  {
    slug: 'truth-tables',
    name: 'Truth Tables',
    description: 'Build a truth table row by row, then use one to add binary numbers with a carry.',
    icon: 'fa-table',
    color: 'warning',
    css: [],
    scripts: [common, 'static/control-logic/truth-tables/lesson.js'],
    globalName: 'TruthTablesLesson',
    hasStep: true,
    stepLabel: 'Fill next row',
    inputs: [
      { key: 'mode', label: 'Adder', type: 'choice', choices: ['half', 'full'],
        choiceLabels: { half: '2 bits (half)', full: '3 bits (full)' } },
      { key: 'a', label: 'A', type: 'toggle' },
      { key: 'b', label: 'B', type: 'toggle' },
      { key: 'cin', label: 'Carry in', type: 'toggle' },
    ],
  },
  {
    slug: 'digital-components',
    name: 'Digital Components',
    description: 'Diodes and transistors: the parts a logic gate is actually built from.',
    icon: 'fa-bolt',
    color: 'danger',
    css: [],
    scripts: [common, 'static/control-logic/digital-components/lesson.js'],
    globalName: 'DigitalComponentsLesson',
    hasStep: true,
    stepLabel: 'Flip it',
    inputs: [
      { key: 'part', label: 'Part', type: 'choice', choices: ['diode', 'transistor'],
        choiceLabels: { diode: 'Diode', transistor: 'Transistor' } },
      { key: 'forward', label: 'Battery forward', type: 'toggle' },
      { key: 'base', label: 'Base current', type: 'toggle' },
    ],
  },
];

export function lessonBySlug(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}
