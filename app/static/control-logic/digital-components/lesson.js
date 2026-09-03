/* Lesson 5 — Digital Components (prompt 20). CLASSIC script; see common/draw.js.

   Teaching shape: the gates of lesson 3 are not magic, they are built from parts. A diode
   lets current one way only; a transistor lets a small current control a big one. Toggling
   the battery round on the diode, and the base on the transistor, is the whole lesson — the
   child sees the lamp go out when the diode is backwards, and sees a tiny base current switch
   a lamp the base itself could never light.

   The transistor is deliberately shown as a SWITCH, because that is the job it does inside
   every gate the child met two lessons ago. */

class DigitalComponentsLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.reset();
  }

  static get PARTS() { return ['diode', 'transistor']; }

  reset() {
    this.part = 'diode';
    this.forward = 1;   // diode: battery the right way round
    this.base = 0;      // transistor: the small controlling current
    this.draw();
  }

  // A diode conducts only when forward-biased; a transistor conducts only when its base is on.
  get conducting() { return this.part === 'diode' ? !!this.forward : !!this.base; }

  step() {
    // One control each, so Step just flips the interesting one.
    if (this.part === 'diode') this.forward = this.forward ? 0 : 1;
    else this.base = this.base ? 0 : 1;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'part') this.part = DigitalComponentsLesson.PARTS.includes(value) ? value : 'diode';
    else if (key === 'forward') this.forward = value ? 1 : 0;
    else if (key === 'base') this.base = value ? 1 : 0;
    this.draw();
  }

  getInput(key) {
    if (key === 'part') return this.part;
    if (key === 'forward') return this.forward;
    if (key === 'base') return this.base;
    return null;
  }

  activeInputs() { return this.part === 'diode' ? ['part', 'forward'] : ['part', 'base']; }

  // The diode's triangle-and-bar symbol, pointing the way current is allowed to travel.
  drawDiodeSymbol(ctx, x, y, pointingRight) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CL.COLORS.stroke;
    ctx.fillStyle = this.conducting ? CL.COLORS.on : CL.COLORS.off;
    const d = pointingRight ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x - 20 * d, y - 22);
    ctx.lineTo(x + 20 * d, y);
    ctx.lineTo(x - 20 * d, y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 20 * d, y - 24);
    ctx.lineTo(x + 20 * d, y + 24);
    ctx.stroke();
    ctx.restore();
  }

  drawDiode(ctx, w) {
    const on = this.conducting;
    CL.text(ctx, 'A diode: a one-way street for current', w / 2, 32, { size: 26, bold: true });
    CL.text(ctx, 'Current can pass one way only. Turn the battery around and the lamp goes out.',
      w / 2, 60, { size: 15, color: '#6c757d' });

    const top = 190; const bottom = 330; const left = 190; const right = 760;
    CL.box(ctx, { x: 90, y: top - 34, w: 100, h: 68,
      label: 'Battery', sub: this.forward ? '+  →' : '←  +' });

    // The loop: battery -> diode -> lamp -> back.
    const loop = [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]];
    CL.wire(ctx, loop, on);
    if (on) CL.flow(ctx, this.forward ? loop : [...loop].reverse(), true, this.phase);

    this.drawDiodeSymbol(ctx, 400, top, true);
    CL.text(ctx, 'diode', 400, top - 48, { size: 15, bold: true });
    CL.text(ctx, this.forward ? 'current flows this way →' : '← battery is pushing the other way',
      400, top + 48, { size: 14, color: on ? CL.COLORS.on : CL.COLORS.warn });

    CL.lamp(ctx, right, (top + bottom) / 2, on, on ? 'LIT' : 'DARK');
    CL.text(ctx, on
      ? 'Forward: the diode conducts, so the lamp lights.'
      : 'Backward: the diode blocks, so nothing flows at all.',
    w / 2, 420, { size: 17, bold: true, color: on ? CL.COLORS.on : CL.COLORS.warn });
  }

  drawTransistor(ctx, w) {
    const on = this.conducting;
    CL.text(ctx, 'A transistor: a switch with no moving parts', w / 2, 32, { size: 26, bold: true });
    CL.text(ctx, 'A tiny current at the base lets a much bigger one flow — this is what builds a gate.',
      w / 2, 60, { size: 15, color: '#6c757d' });

    const cx = 470; const cy = 260;
    // Collector down to the transistor, emitter down to ground.
    const collector = [[cx, 140], [cx, cy - 40]];
    const emitter = [[cx, cy + 40], [cx, 400]];
    CL.wire(ctx, collector, on);
    CL.wire(ctx, emitter, on);
    CL.flow(ctx, [...collector, ...emitter], on, this.phase);

    // The base: a small current in from the left, always drawn thin.
    const basePath = [[250, cy], [cx - 46, cy]];
    CL.wire(ctx, basePath, this.base);
    CL.flow(ctx, basePath, this.base, this.phase, 22);
    CL.bit(ctx, 218, cy, this.base, 'Base');

    // The transistor body: the bar and its two angled legs.
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = on ? CL.COLORS.on : CL.COLORS.stroke;
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy - 34);
    ctx.lineTo(cx - 46, cy + 34);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy - 20); ctx.lineTo(cx, cy - 40);
    ctx.moveTo(cx - 46, cy + 20); ctx.lineTo(cx, cy + 40);
    ctx.stroke();
    ctx.restore();
    CL.text(ctx, 'collector', cx + 66, 170, { size: 14, color: '#6c757d' });
    CL.text(ctx, 'emitter', cx + 60, 380, { size: 14, color: '#6c757d' });

    CL.lamp(ctx, cx, 110, on, on ? 'LIT' : 'DARK');
    CL.text(ctx, on
      ? 'Base on: the transistor conducts, so the lamp lights.'
      : 'Base off: the transistor blocks, so the lamp stays dark.',
    w / 2, 450, { size: 17, bold: true, color: on ? CL.COLORS.on : CL.COLORS.warn });
  }

  draw() {
    const ctx = this.ctx;
    const { w } = CL.clear(ctx);
    if (this.part === 'diode') this.drawDiode(ctx, w);
    else this.drawTransistor(ctx, w);
  }

  start() {
    if (this.raf) return;
    const tick = () => {
      this.phase += 0.02;
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
