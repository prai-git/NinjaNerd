/* Electrical Design manifest (prompt 21). Mirrors control-logic-data.js in shape and purpose,
   and is loaded by the SAME player (lesson.js) through its topic registry — the two topics
   share one player rather than each having a near-copy of it.

   LEARN-ONLY, exactly like Control Logic. It writes nothing — no Firestore, no progress, no
   score, no timer, no failure state — so it needs no security-rules change and sits entirely
   outside `d.topic in ['math','english','science']` and the 21-key roll-up cap.

   THE LESSON CONTRACT is unchanged from control-logic-data.js:

     constructor(canvasId) · start() · stop() · reset() · step() · setInput(key, value)
     getInput(key) · activeInputs()

   Two additions this topic needed, both DATA rather than player behaviour:
     - `canvasHeight`, because lesson 2 draws a full schematic AND a program editor, which do
       not fit in the 500 px the Control Logic lessons use;
     - an input `type: 'range'`, because a thermistor and an LDR are analogue: the teaching is
       that the reading slides, not that it flips. A toggle would say the opposite.

   Scripts are CLASSIC (non-module) files loaded in order. A top-level `class X {}` binds in
   the global LEXICAL scope, which is what lesson.js resolves; an `export` breaks it silently.
   Paths omit the leading slash so they resolve at both mount points via each page's <base>. */

/* Owner decision (2026-09-04): this topic is for grade 7. Written as a floor, like Control
   Logic's, so it picks up any grade added above it rather than needing another edit; grade 7
   is the top grade today, so today the floor and "grade 7 only" are the same thing. The
   content is not grade-scaled — a resistor is a resistor — so there is ONE pair of lessons. */
export const MIN_GRADE = 7;

const draw = 'static/electrical-design/common/draw.js';
const parts = 'static/electrical-design/common/parts.js';

export const LESSONS = [
  {
    slug: 'components',
    name: 'Components',
    description: 'Resistors, capacitors, inductors, diodes, LEDs, transistors — and the LDR and thermistor that sense the world.',
    icon: 'fa-microchip',
    color: 'primary',
    css: [],
    scripts: [draw, parts, 'static/electrical-design/components/lesson.js'],
    globalName: 'ComponentsLesson',
    canvasHeight: 500,
    hasStep: true,
    stepLabel: 'Next part',
    inputs: [
      {
        key: 'part',
        label: 'Part',
        type: 'choice',
        choices: ['resistor', 'capacitor', 'inductor', 'diode', 'led',
          'transistor', 'ldr', 'thermistor', 'divider'],
        choiceLabels: {
          resistor: 'Resistor', capacitor: 'Capacitor', inductor: 'Inductor',
          diode: 'Diode', led: 'LED', transistor: 'Transistor',
          ldr: 'LDR', thermistor: 'Thermistor', divider: 'Divider',
        },
      },
      // Each of these applies to some parts and not others; activeInputs() decides.
      { key: 'ohms', label: 'Resistance', type: 'range', min: 100, max: 4700, step: 100, unit: 'Ω' },
      { key: 'closed', label: 'Switch closed', type: 'toggle' },
      { key: 'forward', label: 'Forward biased', type: 'toggle' },
      { key: 'series', label: '220 Ω series resistor', type: 'toggle' },
      { key: 'base', label: 'Base current', type: 'toggle' },
      { key: 'light', label: 'Light', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
      { key: 'tempF', label: 'Temperature', type: 'range', min: 32, max: 120, step: 2, unit: '°F' },
      { key: 'r2k', label: 'R2', type: 'range', min: 1, max: 20, step: 1, unit: 'kΩ' },
    ],
  },
  {
    slug: 'design',
    name: 'Design',
    description: 'One real circuit — two sensors, an LED and a fan — and a program you build by dragging commands into the MCU.',
    icon: 'fa-diagram-project',
    color: 'success',
    css: [],
    scripts: [draw, parts, 'static/electrical-design/design/lesson.js'],
    globalName: 'DesignLesson',
    // A schematic plus a block editor; 500 px would put the program under the fold.
    canvasHeight: 690,
    hasStep: true,
    stepLabel: 'Run next line',
    inputs: [
      {
        key: 'task',
        label: 'Task',
        type: 'choice',
        choices: ['blink', 'fan', 'dark'],
        choiceLabels: {
          blink: 'Blink the LED', fan: 'Fan above 70 °F', dark: 'LED when dark',
        },
      },
      // The two things a child can change about the world the circuit sits in.
      { key: 'tempF', label: 'Room temperature', type: 'range', min: 40, max: 110, step: 1, unit: '°F' },
      { key: 'light', label: 'Light on the LDR', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
    ],
  },
];

export function lessonBySlug(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}
