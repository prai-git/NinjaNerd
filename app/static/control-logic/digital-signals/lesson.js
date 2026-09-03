/* Lesson 2 — Digital Signals (prompt 20). CLASSIC script; see common/draw.js.

   Teaching shape: a byte is eight switches, and a signal is those switches read one after
   another over time. The child toggles bits and watches BOTH representations change at once —
   the square wave on the left and the number on the right — so "10110100 is 180" stops being
   arithmetic and becomes the same fact seen twice.

   The sweeping playhead is the animation: it is what turns eight static bits into a signal
   that happens over time, which is the whole distinction the lesson exists to make. */

class DigitalSignalsLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.reset();
  }

  static get BIT_COUNT() { return 8; }

  reset() {
    // 0b10110100 — a byte with a mix of runs and single bits, so the wave has shape.
    this.bits = [1, 0, 1, 1, 0, 1, 0, 0];
    this.cursor = 0;      // which bit the playhead is over, 0..7
    this.sweeping = true;
    this.draw();
  }

  get value() { return this.bits.reduce((n, b) => n * 2 + b, 0); }

  get binary() { return this.bits.join(''); }

  // Step advances the playhead one bit — reading the signal by hand, one clock tick at a time.
  step() {
    this.sweeping = false;
    this.cursor = (Math.floor(this.cursor) + 1) % DigitalSignalsLesson.BIT_COUNT;
    this.draw();
  }

  setInput(key, value) {
    const m = /^bit(\d)$/.exec(key);
    if (m) this.bits[Number(m[1])] = value ? 1 : 0;
    this.draw();
  }

  getInput(key) {
    const m = /^bit(\d)$/.exec(key);
    return m ? this.bits[Number(m[1])] : null;
  }

  activeInputs() {
    return Array.from({ length: DigitalSignalsLesson.BIT_COUNT }, (_, i) => `bit${i}`);
  }

  draw() {
    const ctx = this.ctx;
    const { w } = CL.clear(ctx);
    const n = DigitalSignalsLesson.BIT_COUNT;

    CL.text(ctx, 'Digital signals: bits and bytes', w / 2, 32, { size: 26, bold: true });
    CL.text(ctx, 'A bit is one switch: 0 or 1. Eight bits make a byte. Read in order, they are a signal.',
      w / 2, 60, { size: 15, color: '#6c757d' });

    // ---- the waveform ---------------------------------------------------------------
    const x0 = 90; const cellW = 76; const hi = 140; const lo = 240;
    ctx.save();
    ctx.strokeStyle = CL.COLORS.faint;
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + cellW * i, hi - 26);
      ctx.lineTo(x0 + cellW * i, lo + 26);
      ctx.stroke();
    }
    ctx.restore();
    CL.text(ctx, '1', x0 - 26, hi, { size: 15, bold: true, color: CL.COLORS.on });
    CL.text(ctx, '0', x0 - 26, lo, { size: 15, bold: true, color: '#6c757d' });

    // One continuous line: rises and falls are drawn as the vertical edges between cells.
    const pts = [];
    for (let i = 0; i < n; i++) {
      const y = this.bits[i] ? hi : lo;
      pts.push([x0 + cellW * i, y], [x0 + cellW * (i + 1), y]);
    }
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CL.COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();

    // Bit labels and place values under each cell.
    for (let i = 0; i < n; i++) {
      const cx = x0 + cellW * i + cellW / 2;
      CL.text(ctx, String(this.bits[i]), cx, lo + 48,
        { size: 20, bold: true, color: this.bits[i] ? CL.COLORS.on : '#6c757d' });
      CL.text(ctx, String(2 ** (n - 1 - i)), cx, lo + 76, { size: 13, color: '#6c757d' });
    }
    CL.text(ctx, 'place value', x0 - 26, lo + 76, { size: 12, color: '#adb5bd', align: 'right' });

    // ---- the playhead ---------------------------------------------------------------
    const cx = x0 + cellW * this.cursor;
    ctx.save();
    ctx.fillStyle = 'rgba(253,126,20,0.16)';
    ctx.fillRect(cx, hi - 26, cellW, lo - hi + 52);
    ctx.strokeStyle = CL.COLORS.warn;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + cellW / 2, hi - 34);
    ctx.lineTo(cx + cellW / 2, lo + 30);
    ctx.stroke();
    ctx.restore();
    const at = this.bits[Math.floor(this.cursor)];
    CL.text(ctx, `reading ${at}`, cx + cellW / 2, hi - 48,
      { size: 14, bold: true, color: CL.COLORS.warn });

    // ---- the same byte as a number --------------------------------------------------
    CL.text(ctx, this.binary, w / 2, 380, { size: 30, bold: true, color: CL.COLORS.accent });
    CL.text(ctx, `= ${this.value} in decimal`, w / 2, 414, { size: 18 });
    CL.text(ctx, 'Toggle any bit and watch both the wave and the number change.',
      w / 2, 444, { size: 15, color: '#6c757d' });
  }

  start() {
    if (this.raf) return;
    const tick = () => {
      this.phase += 0.02;
      if (this.sweeping) {
        this.cursor += 0.03;
        if (this.cursor >= DigitalSignalsLesson.BIT_COUNT) this.cursor = 0;
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
