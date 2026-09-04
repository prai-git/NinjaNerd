/* Lesson 1 — Components (prompt 21). CLASSIC script; see common/draw.js.

   Nine parts, one at a time, each in a working circuit rather than on a page of symbols. The
   child changes the ONE thing that matters for that part — the resistance, the switch, which
   way round the battery is, how much light falls on the sensor — and watches the current,
   the voltage and the lamp answer.

   Every number on screen is computed, never written down:
     - Ohm's law for the resistor and the LED's series resistor,
     - an RC exponential for the capacitor, an L/R exponential for the inductor,
     - the standard NTC thermistor equation (Beta model) for temperature,
     - a log-linear light/resistance curve for the LDR,
     - the two-resistor divider formula for all three sensor circuits.
   That matters because lesson 2 asks the child to design with these parts, and a part that
   behaved by hand-waving here would mislead them there.

   The LDR and the thermistor are drawn in the SAME divider topology lesson 2 wires to the
   MCU — sensor on the supply side, fixed resistor to ground — so "more light" and "more heat"
   both mean "higher voltage at the tap" in both lessons. */

class ComponentsLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.t = 0;          // seconds since the last transient started (capacitor, inductor)
    this.reset();
  }

  static get PARTS() {
    return ['resistor', 'capacitor', 'inductor', 'diode', 'led',
      'transistor', 'ldr', 'thermistor', 'divider'];
  }

  // ---- the physics, kept out of the drawing so the test can check it directly -------------

  /* Delegated to common/parts.js, never re-derived here: lesson 2 designs around these exact
     curves, and two copies of the physics is how the two lessons would end up teaching
     different things. */
  static get VCC() { return EDP.VCC; }

  static thermistorOhms(tempF) { return EDP.thermistorOhms(tempF); }

  static ldrOhms(lightPct) { return EDP.ldrOhms(lightPct); }

  static divider(rTop, rBottom) { return EDP.divider(rTop, rBottom); }

  reset() {
    this.part = 'resistor';
    this.ohms = 1000;       // the resistor slider
    this.closed = 0;        // the switch, for the capacitor and the inductor
    this.forward = 1;       // which way round the diode / LED sits
    this.series = 1;        // the LED's current-limiting resistor — in circuit or bypassed
    this.base = 0;          // the transistor's controlling current
    this.light = 20;        // % of full daylight on the LDR
    this.tempF = 72;
    this.r2k = 10;          // the divider's lower resistor, in kΩ
    this.t = 0;
    this.vc = 0;            // volts across the capacitor, integrated in start()
    this.iL = 0;            // amps through the inductor, likewise
    this.spike = 0;         // the inductor's kick, decayed over a few frames
    this.draw();
  }

  step() {
    // Step walks to the next part: the lesson is a tour, and each part is a stop on it.
    const parts = ComponentsLesson.PARTS;
    this.part = parts[(parts.indexOf(this.part) + 1) % parts.length];
    this.t = 0;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'part') {
      if (ComponentsLesson.PARTS.includes(value)) { this.part = value; this.t = 0; }
    } else if (key === 'closed') {
      const next = value ? 1 : 0;
      // Opening an energised coil is the moment the inductor lesson exists for.
      if (this.part === 'inductor' && this.closed && !next && this.iL > 0.001) this.spike = 1;
      if (!next) this.iL = 0;   // the current has nowhere to go; it collapses at once
      this.closed = next;
      this.t = 0;
    } else if (key === 'forward') this.forward = value ? 1 : 0;
    else if (key === 'series') this.series = value ? 1 : 0;
    else if (key === 'base') this.base = value ? 1 : 0;
    else if (key === 'ohms') this.ohms = Math.max(100, Math.min(4700, Number(value) || 100));
    else if (key === 'light') this.light = Math.max(0, Math.min(100, Number(value)));
    else if (key === 'tempF') this.tempF = Math.max(32, Math.min(120, Number(value)));
    else if (key === 'r2k') this.r2k = Math.max(1, Math.min(20, Number(value) || 1));
    this.draw();
  }

  getInput(key) {
    const v = {
      part: this.part, ohms: this.ohms, closed: this.closed, forward: this.forward,
      series: this.series, base: this.base, light: this.light, tempF: this.tempF, r2k: this.r2k,
    }[key];
    return v === undefined ? null : v;
  }

  // Which controls apply right now. A resistor has no switch; a capacitor has no direction.
  activeInputs() {
    return {
      resistor: ['part', 'ohms'],
      capacitor: ['part', 'closed'],
      inductor: ['part', 'closed'],
      diode: ['part', 'forward'],
      led: ['part', 'forward', 'series'],
      transistor: ['part', 'base'],
      ldr: ['part', 'light'],
      thermistor: ['part', 'tempF'],
      divider: ['part', 'r2k'],
    }[this.part];
  }

  // ---- drawing ---------------------------------------------------------------------------

  heading(ctx, title, sub) {
    ED.text(ctx, title, 480, 30, { size: 25, bold: true });
    ED.text(ctx, sub, 480, 56, { size: 14.5, color: ED.COLORS.muted });
  }

  takeaway(ctx, str, color) {
    ED.text(ctx, str, 480, 470, { size: 16.5, bold: true, color: color || ED.COLORS.text });
  }

  // The readout panel: what the circuit is actually doing, in the units an engineer uses.
  readout(ctx, rows) {
    ED.panel(ctx, 700, 96, 232, 26 + rows.length * 26, 'MEASURED');
    rows.forEach(([k, v, color], i) => {
      ED.text(ctx, k, 714, 130 + i * 26, { size: 13.5, color: ED.COLORS.muted, align: 'left' });
      ED.text(ctx, v, 918, 130 + i * 26, { size: 14.5, bold: true, align: 'right', color: color || ED.COLORS.text });
    });
  }

  // The supply rail across the top and the ground symbol at the bottom, shared by every part.
  frame(ctx) {
    ED.rail(ctx, 200, 640, 100, '+5 V', ED.COLORS.live);
    ED.wire(ctx, [[420, 408], [540, 408]], { color: ED.COLORS.gnd, width: 4 });
    ED.ground(ctx, 480, 412);
    ED.text(ctx, 'GND', 480, 442, { size: 12, bold: true, color: ED.COLORS.gnd });
  }

  // A single branch from the rail, down through whatever the part is, to ground.
  branch(ctx, amps, gapTop, gapBottom) {
    ED.wire(ctx, [[480, 100], [480, gapTop]]);
    ED.wire(ctx, [[480, gapBottom], [480, 408]]);
    ED.node(ctx, 480, 100, ED.COLORS.live);
    if (amps > 0) {
      ED.flow(ctx, [[480, 100], [480, gapTop]], amps, this.phase);
      ED.flow(ctx, [[480, gapBottom], [480, 408]], amps, this.phase);
    }
  }

  mA(a) { return `${(a * 1000).toFixed(a < 0.01 ? 2 : 1)} mA`; }

  kOhm(r) { return r >= 1000 ? `${(r / 1000).toFixed(r >= 10000 ? 0 : 2)} kΩ` : `${Math.round(r)} Ω`; }

  drawResistor(ctx) {
    const i = ComponentsLesson.VCC / this.ohms;
    this.heading(ctx, 'Resistor — it decides how much current flows',
      'Ohm\'s law: current = voltage ÷ resistance. Nothing else on this page is more useful.');
    this.frame(ctx);
    this.branch(ctx, i, 210, 310);
    ED.resistor(ctx, 480, 210, 100, true, { label: 'R', value: this.kOhm(this.ohms), hot: i > 0.02 });
    this.readout(ctx, [
      ['Voltage', '5.00 V'],
      ['Resistance', this.kOhm(this.ohms)],
      ['Current', this.mA(i), ED.COLORS.flow],
      ['Power', `${(i * i * this.ohms).toFixed(3)} W`],
    ]);
    ED.text(ctx, `I = 5 V ÷ ${Math.round(this.ohms)} Ω = ${this.mA(i)}`, 300, 260,
      { size: 15, align: 'right', color: ED.COLORS.muted });
    this.takeaway(ctx, this.ohms <= 250
      ? 'Small resistance, big current — the dots move fast and the part gets warm.'
      : 'Raise the resistance and the current falls in exact proportion.');
  }

  drawCapacitor(ctx) {
    // R = 10 kΩ with 100 µF: the time constant is exactly 1 second. `vc` is integrated by the
    // animation loop rather than read off a stopwatch, so the curve follows what the child
    // did — flip the switch halfway up and it charges from where it actually was.
    const v = this.vc;
    const i = Math.abs((this.closed ? ComponentsLesson.VCC : 0) - v) / 10000;
    this.heading(ctx, 'Capacitor — it stores charge, and takes time to do it',
      'Through a 10 kΩ resistor with 100 µF, it needs about 1 second to get most of the way.');
    this.frame(ctx);
    ED.wire(ctx, [[480, 100], [480, 124]]);
    ED.node(ctx, 480, 100, ED.COLORS.live);
    ED.switchSym(ctx, 480, 140, this.closed);
    ED.wire(ctx, [[480, 156], [480, 180]]);
    ED.resistor(ctx, 480, 180, 70, true, { label: 'R', value: '10 kΩ' });
    ED.wire(ctx, [[480, 250], [480, 262]]);
    ED.capacitor(ctx, 480, 262, 80, { charge: v / 5, label: 'C', value: '100 µF' });
    ED.wire(ctx, [[480, 342], [480, 408]]);
    if (i > 1e-6) ED.flow(ctx, [[480, 156], [480, 408]], i, this.phase);

    // The charging curve — the shape IS the lesson, and the dot is where the child is on it.
    // Below the two-row readout, which ends at y = 174; a panel drawn under it would put its
    // own title behind the readout's last line.
    ED.panel(ctx, 660, 182, 280, 178, 'VOLTAGE OVER TIME');
    const x0 = 680; const y0 = 334; const wCurve = 240; const hCurve = 112;
    ED.wire(ctx, [[x0, y0 - hCurve], [x0, y0], [x0 + wCurve, y0]], { color: ED.COLORS.faint, width: 1.5 });
    ctx.save();
    ctx.strokeStyle = ED.COLORS.gnd;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 0; px <= wCurve; px++) {
      const tt = (px / wCurve) * 4;
      const vv = this.closed ? 5 * (1 - Math.exp(-tt)) : 5 * Math.exp(-tt);
      const py = y0 - (vv / 5) * hCurve;
      if (px === 0) ctx.moveTo(x0, py); else ctx.lineTo(x0 + px, py);
    }
    ctx.stroke();
    ctx.restore();
    // Where on that curve the present voltage sits, found by inverting it.
    const frac = Math.min(0.999, Math.max(0.001, v / 5));
    const tNow = this.closed ? -Math.log(1 - frac) : -Math.log(frac);
    ED.node(ctx, x0 + Math.min(wCurve, (Math.min(tNow, 4) / 4) * wCurve),
      y0 - (v / 5) * hCurve, ED.COLORS.danger);
    ED.text(ctx, '0 s', x0, y0 + 14, { size: 11, color: ED.COLORS.muted });
    ED.text(ctx, '4 s', x0 + wCurve, y0 + 14, { size: 11, color: ED.COLORS.muted });

    this.readout(ctx, [
      ['Capacitor', `${v.toFixed(2)} V`, ED.COLORS.gnd],
      ['Current', this.mA(i), ED.COLORS.flow],
    ]);
    this.takeaway(ctx, this.closed
      ? 'Charging: the current is largest at the start and fades as the capacitor fills.'
      : 'Open the switch and it discharges back down the same curve.');
  }

  drawInductor(ctx) {
    // 100 mH with 100 Ω settles at 50 mA. The real time constant is a millisecond, so the
    // animation runs it in slow motion — the SHAPE is the point, not the stopwatch.
    const iFinal = ComponentsLesson.VCC / 100;
    const i = this.iL;
    this.heading(ctx, 'Inductor — it fights any change in current',
      'Switch it on and the current ramps up. Switch it OFF and the coil kicks back, hard.');
    this.frame(ctx);
    ED.wire(ctx, [[480, 100], [480, 124]]);
    ED.node(ctx, 480, 100, ED.COLORS.live);
    ED.switchSym(ctx, 480, 140, this.closed);
    ED.wire(ctx, [[480, 156], [480, 180]]);
    ED.resistor(ctx, 480, 180, 70, true, { label: 'R', value: '100 Ω' });
    ED.wire(ctx, [[480, 250], [480, 262]]);
    ED.inductor(ctx, 480, 262, 90, { label: 'L', value: '100 mH', energised: i > 0.001 });
    ED.wire(ctx, [[480, 352], [480, 408]]);
    if (i > 1e-6) ED.flow(ctx, [[480, 156], [480, 408]], i, this.phase);
    if (this.spike > 0.02) {
      // The flyback spike, drawn as an arc jumping the switch it was just opened by.
      ctx.save();
      ctx.strokeStyle = ED.COLORS.danger;
      ctx.globalAlpha = this.spike;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(496, 150);
      ctx.lineTo(524, 132);
      ctx.lineTo(510, 162);
      ctx.lineTo(544, 144);
      ctx.stroke();
      ctx.restore();
      ED.text(ctx, 'voltage SPIKE', 556, 144,
        { size: 14, bold: true, align: 'left', color: ED.COLORS.danger });
    }
    this.readout(ctx, [
      ['Current', this.mA(i), ED.COLORS.flow],
      ['Settles at', this.mA(iFinal)],
      ['On opening', this.spike > 0.02 ? 'hundreds of volts' : '—',
        this.spike > 0.02 ? ED.COLORS.danger : ED.COLORS.muted],
    ]);
    this.takeaway(ctx,
      'A motor is a big inductor. That kick is why lesson 2 puts a diode across the fan.',
      ED.COLORS.warn);
  }

  drawDiode(ctx) {
    const on = !!this.forward;
    this.heading(ctx, 'Diode — a one-way valve for current',
      'The arrow on the symbol is the only direction current is allowed to travel.');
    this.frame(ctx);
    this.branch(ctx, on ? 0.0043 : 0, 200, 320);
    ED.resistor(ctx, 480, 200, 70, true, { label: 'R', value: '1 kΩ' });
    ED.diode(ctx, 480, 290, this.forward ? 'down' : 'up',
      { conducting: on, label: this.forward ? 'forward biased' : 'reverse biased' });
    this.readout(ctx, [
      ['Direction', this.forward ? 'with the arrow' : 'against it'],
      ['Diode drop', on ? '0.7 V' : '5.0 V (blocking)'],
      ['Current', on ? this.mA(0.0043) : '0.00 mA', on ? ED.COLORS.flow : ED.COLORS.muted],
    ]);
    this.takeaway(ctx, on
      ? 'Forward: it conducts, losing about 0.7 V across itself.'
      : 'Reverse: it blocks completely, and the whole 5 V sits across it.',
    on ? ED.COLORS.ok : ED.COLORS.warn);
  }

  drawLed(ctx) {
    // An LED holds about 2 V across itself; the resistor takes the rest. Without it there is
    // nothing to set the current, and the LED is destroyed — which is exactly the point.
    const rSeries = 220;
    const on = !!this.forward;
    const i = !on ? 0 : (this.series ? (5 - 2.0) / rSeries : (5 - 2.0) / 5);
    this.heading(ctx, 'LED — a diode that gives off light',
      'It never sets its own current. The series resistor does that, and it is not optional.');
    this.frame(ctx);
    this.branch(ctx, i, 190, 330);
    if (this.series) {
      ED.resistor(ctx, 480, 190, 80, true, { label: 'R', value: '220 Ω', hot: false });
    } else {
      ED.wire(ctx, [[480, 190], [480, 270]], { color: ED.COLORS.danger, width: 3 });
      ED.text(ctx, 'no resistor!', 512, 230,
        { size: 14, bold: true, align: 'left', color: ED.COLORS.danger });
    }
    ED.diode(ctx, 480, 300, this.forward ? 'down' : 'up', { conducting: on && i < 0.05, led: true });
    this.readout(ctx, [
      ['LED drop', '2.0 V'],
      ['Series R', this.series ? '220 Ω' : 'none'],
      ['Current', on ? this.mA(i) : '0.00 mA',
        i > 0.05 ? ED.COLORS.danger : ED.COLORS.flow],
      ['Safe?', !on ? '—' : (i > 0.05 ? 'NO' : 'yes'),
        i > 0.05 ? ED.COLORS.danger : ED.COLORS.ok],
    ]);
    if (on && this.series) {
      ED.text(ctx, 'I = (5 V − 2 V) ÷ 220 Ω = 13.6 mA', 300, 250,
        { size: 15, align: 'right', color: ED.COLORS.muted });
    }
    this.takeaway(ctx, !on
      ? 'Backwards, an LED simply does not light — it is still a diode.'
      : (this.series
        ? 'The resistor drops the leftover 3 V and fixes the current at a safe 13.6 mA.'
        : 'With no resistor the current is hundreds of milliamps. This is how an LED dies.'),
    on && !this.series ? ED.COLORS.danger : ED.COLORS.ok);
  }

  drawTransistor(ctx) {
    const on = !!this.base;
    this.heading(ctx, 'Transistor — a switch with no moving parts',
      'A few milliamps into the base let hundreds of milliamps through the collector.');
    this.frame(ctx);
    /* ED.npn puts the collector and emitter terminals at x + 28, so the device is drawn 28 px
       to the LEFT of the branch it switches. Line them up any other way and the collector
       wire stops 28 px short of the transistor — a gap that still renders perfectly. */
    ED.wire(ctx, [[480, 100], [480, 150]]);
    ED.node(ctx, 480, 100, ED.COLORS.live);
    ED.resistor(ctx, 480, 150, 80, true, { label: 'load', value: '25 Ω' });
    ED.wire(ctx, [[480, 230], [480, 266]], { color: on ? ED.COLORS.ok : ED.COLORS.wire });
    ED.npn(ctx, 452, 300, { on, label: on ? 'conducting' : 'blocking' });
    ED.wire(ctx, [[480, 334], [480, 408]], { color: on ? ED.COLORS.ok : ED.COLORS.wire });
    // The base leg: a small current in from the left, through its own resistor.
    ED.wire(ctx, [[380, 300], [452, 300]], { color: on ? ED.COLORS.ok : ED.COLORS.wire });
    ED.resistor(ctx, 300, 300, 80, false, { label: 'Rb', value: '1 kΩ' });
    ED.wire(ctx, [[236, 300], [300, 300]], { color: on ? ED.COLORS.ok : ED.COLORS.wire });
    ED.text(ctx, on ? '3.3 V in' : '0 V in', 228, 300,
      { size: 14, bold: true, align: 'right', color: on ? ED.COLORS.ok : ED.COLORS.muted });
    if (on) {
      ED.flow(ctx, [[236, 300], [452, 300]], 0.003, this.phase);
      ED.flow(ctx, [[480, 100], [480, 266]], 0.2, this.phase);
      ED.flow(ctx, [[480, 334], [480, 408]], 0.2, this.phase);
    }
    this.readout(ctx, [
      ['Base current', on ? '2.6 mA' : '0.00 mA'],
      ['Load current', on ? '200 mA' : '0.00 mA', on ? ED.COLORS.flow : ED.COLORS.muted],
      ['Gain', 'about 75×'],
    ]);
    this.takeaway(ctx, on
      ? 'A tiny base current is switching a load 75 times bigger than itself.'
      : 'No base current, no collector current — the switch is open.',
    on ? ED.COLORS.ok : ED.COLORS.muted);
  }

  // The LDR and the thermistor share a drawing: both are resistors that something outside
  // the circuit changes, both sit on top of a fixed resistor, both are read at the tap.
  drawSensorDivider(ctx, kind) {
    const rTop = kind === 'ldr'
      ? ComponentsLesson.ldrOhms(this.light)
      : ComponentsLesson.thermistorOhms(this.tempF);
    const rBottom = 10000;
    const vOut = ComponentsLesson.divider(rTop, rBottom);
    const isLdr = kind === 'ldr';
    this.heading(ctx,
      isLdr ? 'LDR — a resistor that light changes' : 'Thermistor — a resistor that heat changes',
      isLdr
        ? 'Bright light: about 1 kΩ. Darkness: about 200 kΩ. A divider turns that into a voltage.'
        : 'An NTC thermistor: 10 kΩ at 77 °F, and LESS as it gets hotter.');
    this.frame(ctx);
    ED.wire(ctx, [[480, 100], [480, 150]]);
    ED.node(ctx, 480, 100, ED.COLORS.live);
    ED.sensorResistor(ctx, 480, 150, 90, kind, {
      label: isLdr ? 'LDR' : 'thermistor',
      value: this.kOhm(rTop),
    });
    ED.wire(ctx, [[480, 240], [480, 280]]);
    ED.node(ctx, 480, 260);
    ED.wire(ctx, [[480, 260], [640, 260]], { color: ED.COLORS.ok });
    ED.text(ctx, 'to the MCU', 650, 260, { size: 13.5, bold: true, align: 'left', color: ED.COLORS.ok });
    ED.resistor(ctx, 480, 280, 90, true, { label: 'R fixed', value: '10 kΩ' });
    ED.wire(ctx, [[480, 370], [480, 408]]);
    ED.flow(ctx, [[480, 100], [480, 408]], ComponentsLesson.VCC / (rTop + rBottom), this.phase);
    if (isLdr) {
      // Sunlight falling on the part, drawn brighter as the slider rises.
      ctx.save();
      ctx.globalAlpha = 0.15 + (this.light / 100) * 0.7;
      ctx.fillStyle = ED.COLORS.glow;
      ctx.beginPath();
      ctx.arc(330, 150, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ED.text(ctx, `${Math.round(this.light)}% light`, 330, 210, { size: 14, bold: true });
    } else {
      ctx.save();
      ctx.fillStyle = this.tempF > 77 ? ED.COLORS.danger : ED.COLORS.gnd;
      ctx.globalAlpha = 0.25 + Math.min(0.7, Math.abs(this.tempF - 77) / 60);
      ED.roundRect(ctx, 312, 120, 36, 70, 8);
      ctx.fill();
      ctx.restore();
      ED.text(ctx, `${Math.round(this.tempF)} °F`, 330, 210, { size: 14, bold: true });
    }
    this.readout(ctx, [
      [isLdr ? 'Light' : 'Temperature', isLdr ? `${Math.round(this.light)} %` : `${Math.round(this.tempF)} °F`],
      [isLdr ? 'LDR' : 'Thermistor', this.kOhm(rTop)],
      ['Fixed R', '10 kΩ'],
      ['Tap voltage', `${vOut.toFixed(2)} V`, ED.COLORS.ok],
    ]);
    /* Both lines are pivoted on the point where the sensor equals the fixed 10 kΩ — 77 °F for
       the thermistor, about 50% light for the LDR — because that is the only place the
       statement flips. A threshold of "70 °F" here would read as hot at 71 and cool at 69,
       which is not what the divider does. */
    this.takeaway(ctx, isLdr
      ? (rTop > rBottom
        ? 'Dim: the LDR is larger than the fixed resistor, so it keeps most of the 5 V and the tap reads LOW.'
        : 'Bright: the LDR is the smaller of the two, so the tap reads HIGH. That is how the MCU sees light.')
      : (rTop > rBottom
        ? 'Below 77 °F the thermistor is over 10 kΩ, so the tap sits under half the supply.'
        : 'Above 77 °F the thermistor is under 10 kΩ, so the tap voltage RISES past half the supply.'));
  }

  drawDivider(ctx) {
    const rTop = 10000;
    const rBottom = this.r2k * 1000;
    const vOut = ComponentsLesson.divider(rTop, rBottom);
    this.heading(ctx, 'Voltage divider — two resistors that share the supply',
      'Each resistor keeps a share of the 5 V, in proportion to its resistance. That is the whole trick.');
    this.frame(ctx);
    ED.wire(ctx, [[480, 100], [480, 150]]);
    ED.node(ctx, 480, 100, ED.COLORS.live);
    ED.resistor(ctx, 480, 150, 90, true, { label: 'R1', value: '10 kΩ' });
    ED.wire(ctx, [[480, 240], [480, 280]]);
    ED.node(ctx, 480, 260);
    ED.wire(ctx, [[480, 260], [640, 260]], { color: ED.COLORS.ok });
    ED.text(ctx, `V out = ${vOut.toFixed(2)} V`, 650, 260,
      { size: 15, bold: true, align: 'left', color: ED.COLORS.ok });
    ED.resistor(ctx, 480, 280, 90, true, { label: 'R2', value: this.kOhm(rBottom) });
    ED.wire(ctx, [[480, 370], [480, 408]]);
    ED.flow(ctx, [[480, 100], [480, 408]], ComponentsLesson.VCC / (rTop + rBottom), this.phase);
    ED.text(ctx, `V out = 5 V × R2 ÷ (R1 + R2)`, 300, 240,
      { size: 15, align: 'right', color: ED.COLORS.muted });
    ED.text(ctx, `= 5 × ${this.r2k} ÷ (10 + ${this.r2k})`, 300, 264,
      { size: 15, align: 'right', color: ED.COLORS.muted });
    this.readout(ctx, [
      ['R1 (top)', '10 kΩ'],
      ['R2 (bottom)', this.kOhm(rBottom)],
      ['V out', `${vOut.toFixed(2)} V`, ED.COLORS.ok],
      ['R1 keeps', `${(5 - vOut).toFixed(2)} V`],
    ]);
    this.takeaway(ctx,
      'Swap R1 for an LDR or a thermistor and this becomes a sensor the MCU can read.');
  }

  draw() {
    const ctx = this.ctx;
    ED.clear(ctx);
    switch (this.part) {
      case 'capacitor': this.drawCapacitor(ctx); break;
      case 'inductor': this.drawInductor(ctx); break;
      case 'diode': this.drawDiode(ctx); break;
      case 'led': this.drawLed(ctx); break;
      case 'transistor': this.drawTransistor(ctx); break;
      case 'ldr': this.drawSensorDivider(ctx, 'ldr'); break;
      case 'thermistor': this.drawSensorDivider(ctx, 'thermistor'); break;
      case 'divider': this.drawDivider(ctx); break;
      default: this.drawResistor(ctx);
    }
  }

  start() {
    if (this.raf) return;
    const tick = () => {
      const dt = 1 / 60;
      this.phase += 0.02;
      this.t += dt;
      // RC: one second per time constant. L/R: run at half a second so the ramp is watchable.
      this.vc += ((this.closed ? ComponentsLesson.VCC : 0) - this.vc) * dt;
      if (this.closed) this.iL += (ComponentsLesson.VCC / 100 - this.iL) * (dt / 0.5);
      if (this.spike > 0) this.spike = Math.max(0, this.spike - 0.02);
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
