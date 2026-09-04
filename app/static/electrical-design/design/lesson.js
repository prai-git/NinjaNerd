/* Lesson 2 — Design (prompt 21). CLASSIC script; see common/draw.js and common/parts.js.

   One complete circuit, drawn the way an engineer would draw it, and a program the child
   builds by dragging command blocks into the MCU.

   THE CIRCUIT IS THE LESSON. Every part on it is there because it has to be:
     - each sensor sits in a VOLTAGE DIVIDER with a fixed resistor, because a bare thermistor
       or LDR wired to a pin gives the MCU nothing to measure — a resistance is not a voltage.
       This is the commonest beginner mistake and the reason the dividers are drawn in full;
     - the LED has a SERIES RESISTOR, because an LED does not limit its own current;
     - the fan runs through an NPN TRANSISTOR, because a GPIO pin can supply about 20 mA and a
       fan wants ten times that;
     - a FLYBACK DIODE sits across the motor, because a motor is an inductor (lesson 1) and an
       inductor answers a sudden switch-off with a huge reverse voltage that would destroy the
       transistor. It points at +5 V so it does nothing at all until that moment.

   Nothing here is scored, timed or failed. A program that does not do the task simply does
   not do it, and the circuit keeps telling the truth about what it is doing. */

class DesignLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.spin = 0;
    this.drag = null;
    this.reset();
    this.bindPointer();
  }

  // ---- the program model -----------------------------------------------------------------

  static get SLOTS() { return 5; }

  static get BLOCKS() {
    return [
      { id: 'readTemp', label: 'read A0 (temp)', w: 132, fill: '#e7f1ff' },
      { id: 'readLight', label: 'read A1 (light)', w: 132, fill: '#e7f1ff' },
      { id: 'ifHot', label: 'if temp > 70 °F', w: 126, fill: '#fff3cd' },
      { id: 'ifDark', label: 'if it is dark', w: 112, fill: '#fff3cd' },
      { id: 'wait1s', label: 'wait 1 second', w: 122, fill: '#e2e3e5' },
      { id: 'ledOn', label: 'LED on', w: 92, fill: '#d1e7dd' },
      { id: 'ledOff', label: 'LED off', w: 92, fill: '#d1e7dd' },
      { id: 'fanOn', label: 'fan on', w: 92, fill: '#d1e7dd' },
      { id: 'fanOff', label: 'fan off', w: 92, fill: '#d1e7dd' },
    ];
  }

  static blockById(id) { return DesignLesson.BLOCKS.find((b) => b.id === id) || null; }

  static get TASKS() {
    return {
      blink: 'Blink the LED on and off every 1 second.',
      fan: 'Turn the fan on when the thermistor reads hotter than 70 °F.',
      dark: 'Turn the LED on when the LDR reads dark.',
    };
  }

  /* The thresholds the MCU compares against are VOLTAGES, because a voltage is all an analogue
     pin can see. They are computed from the same divider the circuit is drawn with, so if the
     sensor curve in parts.js changes, the comparison moves with it. */
  static get HOT_V() { return EDP.tempVolts(70); }
  static get DARK_V() { return EDP.lightVolts(25); }

  // How long one line of the program takes. A `wait` is the only slow one.
  static duration(id) { return id === 'wait1s' ? 1 : 0.25; }

  static freshState() {
    return { led: false, fan: false, regTemp: null, regLight: null, skip: false };
  }

  /* Execute one line. `skip` is how the two `if` blocks work: a test that fails does not stop
     the program, it skips the ONE line after it — which is exactly what an `if` does. */
  static exec(state, id, env) {
    if (state.skip) { state.skip = false; return state; }
    switch (id) {
      case 'readTemp': state.regTemp = EDP.tempVolts(env.tempF); break;
      case 'readLight': state.regLight = EDP.lightVolts(env.light); break;
      // A sensor that has never been read is not a reading of zero — it is no reading at all,
      // so the test is false and the guarded line is skipped.
      case 'ifHot': state.skip = !(state.regTemp !== null && state.regTemp > DesignLesson.HOT_V); break;
      case 'ifDark': state.skip = !(state.regLight !== null && state.regLight < DesignLesson.DARK_V); break;
      case 'ledOn': state.led = true; break;
      case 'ledOff': state.led = false; break;
      case 'fanOn': state.fan = true; break;
      case 'fanOff': state.fan = false; break;
      default: break;   // wait, and an empty slot
    }
    return state;
  }

  /* Run a program straight through for `seconds`, with no canvas and no animation. The live
     loop and the goal check both go through this, so what the child sees and what the lesson
     says about it can never disagree. */
  static run(program, env, seconds = 6) {
    const seq = (program || []).filter(Boolean);
    const state = DesignLesson.freshState();
    let transitions = 0;
    if (seq.length === 0) return { ...state, transitions };
    let t = 0;
    let i = 0;
    while (t < seconds && i < 4000) {
      const before = state.led;
      DesignLesson.exec(state, seq[i % seq.length], env);
      if (state.led !== before) transitions++;
      t += DesignLesson.duration(seq[i % seq.length]);
      i++;
    }
    return { ...state, transitions };
  }

  /* Does this program do the task? Checked by RUNNING it against the electronics — hot and
     cold, dark and bright — never by comparing it to a stored "right answer", because there
     is more than one right answer and a child who finds a different one is not wrong. */
  static meets(task, program) {
    const seq = (program || []).filter(Boolean);
    if (seq.length === 0) return false;
    if (task === 'blink') {
      return seq.includes('wait1s')
        && DesignLesson.run(program, { tempF: 72, light: 50 }, 6).transitions >= 4;
    }
    if (task === 'fan') {
      return DesignLesson.run(program, { tempF: 80, light: 50 }, 6).fan === true
        && DesignLesson.run(program, { tempF: 60, light: 50 }, 6).fan === false;
    }
    if (task === 'dark') {
      return DesignLesson.run(program, { tempF: 72, light: 5 }, 6).led === true
        && DesignLesson.run(program, { tempF: 72, light: 95 }, 6).led === false;
    }
    return false;
  }

  // ---- lesson contract -------------------------------------------------------------------

  reset() {
    this.task = 'blink';
    this.tempF = 72;
    this.light = 60;
    this.program = new Array(DesignLesson.SLOTS).fill(null);
    this.state = DesignLesson.freshState();
    this.pc = -1;          // slot index currently running; -1 before the first line
    this.clock = 0;
    this.drag = null;
    this.draw();
  }

  get env() { return { tempF: this.tempF, light: this.light }; }

  // The next filled slot after `from`, wrapping — an MCU program runs in a loop for ever.
  nextSlot(from) {
    for (let n = 1; n <= DesignLesson.SLOTS; n++) {
      const i = (from + n + DesignLesson.SLOTS) % DesignLesson.SLOTS;
      if (this.program[i]) return i;
    }
    return -1;
  }

  step() {
    const next = this.nextSlot(this.pc);
    if (next < 0) return;              // nothing dropped in yet
    this.pc = next;
    DesignLesson.exec(this.state, this.program[next], this.env);
    this.clock = 0;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'task') {
      if (Object.prototype.hasOwnProperty.call(DesignLesson.TASKS, value)) this.task = value;
    } else if (key === 'tempF') this.tempF = Math.max(40, Math.min(110, Number(value)));
    else if (key === 'light') this.light = Math.max(0, Math.min(100, Number(value)));
    this.draw();
  }

  getInput(key) {
    const v = { task: this.task, tempF: this.tempF, light: this.light }[key];
    return v === undefined ? null : v;
  }

  activeInputs() { return ['task', 'tempF', 'light']; }

  // ---- drag and drop ---------------------------------------------------------------------

  /* The palette and the program slots are drawn on the lesson's OWN canvas and driven by
     pointer events this class attaches. The generic player (lesson.js) knows nothing about
     any of it — it still only offers Reset, Step and the declared inputs. */
  paletteLayout() {
    const out = [];
    const rows = [DesignLesson.BLOCKS.slice(0, 5), DesignLesson.BLOCKS.slice(5)];
    rows.forEach((row, r) => {
      let x = 40;
      for (const b of row) {
        out.push({ ...b, x, y: 472 + r * 38, h: 30 });
        x += b.w + 16;
      }
    });
    return out;
  }

  slotLayout() {
    return Array.from({ length: DesignLesson.SLOTS }, (_, i) => ({
      x: 60 + i * 174, y: 560, w: 160, h: 34,
    }));
  }

  static inside(box, x, y) {
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  }

  toCanvas(e) {
    const r = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    if (!r || !r.width) return { x: e.clientX || 0, y: e.clientY || 0 };
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height),
    };
  }

  bindPointer() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(this.toCanvas(e)));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(this.toCanvas(e)));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(this.toCanvas(e)));
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
  }

  onDown({ x, y }) {
    for (const b of this.paletteLayout()) {
      if (DesignLesson.inside(b, x, y)) {
        this.drag = { id: b.id, label: b.label, w: b.w, h: b.h, fill: b.fill, x, y, from: -1, moved: false };
        return;
      }
    }
    // Picking a block back out of the program: dragging it away deletes it, which is the only
    // way to change your mind.
    this.slotLayout().forEach((s, i) => {
      if (this.program[i] && DesignLesson.inside(s, x, y)) {
        const b = DesignLesson.blockById(this.program[i]);
        this.program[i] = null;
        if (this.pc === i) this.pc = -1;
        this.drag = { id: b.id, label: b.label, w: b.w, h: b.h, fill: b.fill, x, y, from: i, moved: false };
      }
    });
  }

  onMove({ x, y }) {
    if (!this.drag) return;
    if (Math.abs(x - this.drag.x) > 3 || Math.abs(y - this.drag.y) > 3) this.drag.moved = true;
    this.drag.x = x;
    this.drag.y = y;
    this.draw();
  }

  onUp({ x, y }) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    const slots = this.slotLayout();
    for (let i = 0; i < slots.length; i++) {
      if (DesignLesson.inside(slots[i], x, y)) {
        this.program[i] = drag.id;
        this.draw();
        return;
      }
    }
    /* A tap with no drag — how a finger uses this on a tablet — drops the block into the first
       empty slot instead of doing nothing. */
    if (!drag.moved && drag.from < 0) {
      const empty = this.program.indexOf(null);
      if (empty >= 0) this.program[empty] = drag.id;
    }
    this.draw();
  }

  // ---- drawing ---------------------------------------------------------------------------

  drawSensor(ctx, x, kind, pinName, reading) {
    const rs = kind === 'ldr' ? EDP.ldrOhms(this.light) : EDP.thermistorOhms(this.tempF);
    ED.text(ctx, '+5 V', x, 66, { size: 12, bold: true, color: ED.COLORS.live });
    ED.wire(ctx, [[x - 14, 76], [x + 14, 76]], { color: ED.COLORS.live, width: 4 });
    ED.wire(ctx, [[x, 76], [x, 88]]);
    ED.sensorResistor(ctx, x, 88, 70, kind, {
      label: kind === 'ldr' ? 'LDR' : 'thermistor',
      value: rs >= 1000 ? `${(rs / 1000).toFixed(1)} kΩ` : `${Math.round(rs)} Ω`,
    });
    ED.wire(ctx, [[x, 158], [x, 186]]);
    ED.node(ctx, x, 172);
    ED.resistor(ctx, x, 186, 70, true, { label: '10 kΩ', value: 'fixed' });
    ED.wire(ctx, [[x, 256], [x, 276]]);
    ED.ground(ctx, x, 280);
    // The current that makes the divider work at all.
    ED.flow(ctx, [[x, 76], [x, 276]], EDP.VCC / (rs + EDP.FIXED_R), this.phase);
    // Below the ground symbol and above the routing lane at y = 352 — a label sitting on a
    // wire reads as a connection.
    ED.text(ctx, `${pinName}: ${reading.toFixed(2)} V`, x, 320,
      { size: 13, bold: true, color: ED.COLORS.ok });
  }

  drawCircuit(ctx) {
    const tempV = EDP.tempVolts(this.tempF);
    const lightV = EDP.lightVolts(this.light);
    const led = this.state.led;
    const fan = this.state.fan;

    // --- inputs: two dividers. The LDR's tap is routed round the outside to reach A1 without
    // crossing the thermistor's: two nets that touch are one net, and a child cannot tell a
    // drawn crossing from a joint unless they never overlap.
    this.drawSensor(ctx, 120, 'ldr', 'A1', lightV);
    this.drawSensor(ctx, 260, 'thermistor', 'A0', tempV);
    ED.wire(ctx, [[260, 172], [376, 172]], { color: ED.COLORS.ok });
    ED.wire(ctx, [[120, 172], [64, 172], [64, 352], [356, 352], [356, 242], [376, 242]],
      { color: ED.COLORS.ok });

    // --- the MCU
    ED.chip(ctx, {
      x: 390, y: 110, w: 180, h: 190,
      label: 'MCU',
      sub: 'runs your program',
      pins: {
        left: [{ name: 'A0', y: 172, active: true }, { name: 'A1', y: 242, active: true }],
        right: [{ name: 'D5', y: 150, active: led }, { name: 'D6', y: 260, active: fan }],
      },
    });
    ED.text(ctx, `A0 ${EDP.adcCounts(tempV)}  ·  A1 ${EDP.adcCounts(lightV)}`, 480, 230,
      { size: 12, color: ED.COLORS.muted });

    // --- output 1: the LED on D5, with the resistor that keeps it alive
    ED.text(ctx, led ? `LED  ${(EDP.ledCurrent(EDP.LED_SERIES_R) * 1000).toFixed(1)} mA` : 'LED  off',
      700, 120, { size: 13, bold: true, color: led ? ED.COLORS.ok : ED.COLORS.muted });
    ED.wire(ctx, [[584, 150], [700, 150], [700, 170]], { color: led ? ED.COLORS.ok : ED.COLORS.wire });
    ED.resistor(ctx, 700, 170, 70, true, { label: '220 Ω', value: 'limits current' });
    ED.wire(ctx, [[700, 240], [700, 261]], { color: led ? ED.COLORS.ok : ED.COLORS.wire });
    ED.diode(ctx, 700, 276, 'down', { conducting: led, led: true });
    ED.wire(ctx, [[700, 291], [700, 326]], { color: led ? ED.COLORS.ok : ED.COLORS.wire });
    ED.ground(ctx, 700, 330);
    if (led) {
      ED.flow(ctx, [[584, 150], [700, 150], [700, 326]], EDP.ledCurrent(EDP.LED_SERIES_R), this.phase);
    }

    // --- output 2: the fan, switched by a transistor, protected by a flyback diode
    ED.text(ctx, '+5 V', 880, 66, { size: 12, bold: true, color: ED.COLORS.live });
    ED.wire(ctx, [[866, 76], [894, 76]], { color: ED.COLORS.live, width: 4 });
    ED.wire(ctx, [[880, 76], [880, 100]]);
    ED.node(ctx, 880, 100);
    ED.motor(ctx, 880, 126, 26, this.spin, fan, null);
    // Beside the motor rather than under it: below the ground symbol is where the base leg
    // runs, and a status line sitting on a wire reads as part of the circuit.
    ED.text(ctx, fan ? 'fan  200 mA' : 'fan  off', 838, 126,
      { size: 13, bold: true, align: 'right', color: fan ? ED.COLORS.ok : ED.COLORS.muted });
    ED.wire(ctx, [[880, 152], [880, 198]], { color: fan ? ED.COLORS.ok : ED.COLORS.wire });
    ED.node(ctx, 880, 178);
    ED.npn(ctx, 852, 232, { on: fan });
    ED.wire(ctx, [[880, 266], [880, 326]], { color: fan ? ED.COLORS.ok : ED.COLORS.wire });
    ED.ground(ctx, 880, 330);
    /* The flyback diode: anode on the motor's switched side, cathode to +5 V, so it is
       REVERSE biased and does nothing at all — until the transistor turns off and the coil
       drives that node above the supply, when it becomes the only path the collapsing current
       has. Without it that current has nowhere to go and finds a way through the transistor. */
    ED.wire(ctx, [[880, 178], [930, 178], [930, 141]]);
    ED.diode(ctx, 930, 126, 'up', { conducting: false });
    ED.wire(ctx, [[930, 111], [930, 100], [880, 100]]);
    ED.text(ctx, 'flyback', 924, 204, { size: 11, bold: true, color: ED.COLORS.muted });
    /* The base leg from D6, routed DOWN and under the LED branch rather than straight across
       it — a pin never drives a base directly, and two output nets never share a wire. */
    ED.wire(ctx, [[584, 260], [620, 260], [620, 370], [745, 370]],
      { color: fan ? ED.COLORS.ok : ED.COLORS.wire });
    ED.resistor(ctx, 745, 370, 70, false, { label: '1 kΩ', value: 'base resistor' });
    ED.wire(ctx, [[815, 370], [830, 370], [830, 252], [852, 252]],
      { color: fan ? ED.COLORS.ok : ED.COLORS.wire });
    if (fan) {
      ED.flow(ctx, [[880, 76], [880, 198]], 0.2, this.phase);
      ED.flow(ctx, [[880, 266], [880, 326]], 0.2, this.phase);
    }
  }

  drawProgram(ctx) {
    ED.panel(ctx, 16, 412, 928, 248, 'PROGRAM');
    ED.text(ctx, `Goal: ${DesignLesson.TASKS[this.task]}`, 480, 438, { size: 16, bold: true });

    ED.text(ctx, 'BLOCKS — drag one down into a slot', 40, 460,
      { size: 11.5, bold: true, color: ED.COLORS.muted, align: 'left' });
    for (const b of this.paletteLayout()) ED.block(ctx, b);

    ED.text(ctx, 'YOUR PROGRAM — the MCU runs it top to bottom, then starts again', 40, 546,
      { size: 11.5, bold: true, color: ED.COLORS.muted, align: 'left' });
    const slots = this.slotLayout();
    slots.forEach((s, i) => {
      ED.slot(ctx, s, i);
      const id = this.program[i];
      if (!id) return;
      const b = DesignLesson.blockById(id);
      ED.block(ctx, { ...b, x: s.x, y: s.y, w: s.w, h: s.h }, { running: this.pc === i });
    });

    // What the machine is doing right now, in words. Never a mark — just the truth.
    const done = DesignLesson.meets(this.task, this.program);
    const lastTemp = this.state.regTemp === null ? 'not read yet' : `${this.state.regTemp.toFixed(2)} V`;
    const lastLight = this.state.regLight === null ? 'not read yet' : `${this.state.regLight.toFixed(2)} V`;
    ED.text(ctx, done
      ? 'That does it — the circuit now behaves the way the goal describes.'
      : (this.program.some(Boolean)
        ? 'Running your program. Watch the pins, the LED and the fan.'
        : 'Drag blocks into the slots and the MCU will start running them.'),
    480, 620, { size: 15, bold: true, color: done ? ED.COLORS.ok : ED.COLORS.muted });
    ED.text(ctx,
      `A0 last read: ${lastTemp}   ·   A1 last read: ${lastLight}   ·   the MCU only sees a sensor when the program reads it`,
      480, 644, { size: 12, color: ED.COLORS.muted });
  }

  draw() {
    const ctx = this.ctx;
    ED.clear(ctx);
    ED.text(ctx, 'Design a real circuit, then program it', 480, 26, { size: 23, bold: true });
    ED.text(ctx,
      'Two sensors in, an LED and a fan out. Every extra part on this page is there for a reason.',
      480, 48, { size: 13.5, color: ED.COLORS.muted });
    this.drawCircuit(ctx);
    this.drawProgram(ctx);
    if (this.drag) {
      ED.block(ctx, {
        ...this.drag, x: this.drag.x - this.drag.w / 2, y: this.drag.y - this.drag.h / 2,
      }, { ghost: true });
    }
  }

  start() {
    if (this.raf) return;
    const tick = () => {
      const dt = 1 / 60;
      this.phase += 0.02;
      if (this.state.fan) this.spin += 0.22;
      // Run the program in real time: the current line finishes, then the next one starts.
      if (this.program.some(Boolean)) {
        this.clock += dt;
        const current = this.pc >= 0 && this.program[this.pc] ? this.program[this.pc] : null;
        if (!current || this.clock >= DesignLesson.duration(current)) this.step();
      }
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}
