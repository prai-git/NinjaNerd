/* Lesson 4 — Truth Tables (prompt 20). CLASSIC script; see common/draw.js.

   Teaching shape: a truth table is not a thing to memorise, it is the complete list of what a
   circuit does. So the child builds one row at a time (Step), then uses it: the same table,
   read as a half adder and then a full adder, is how a computer adds.

   2-bit mode is A + B -> Sum, Carry (a half adder). 3-bit mode adds a carry-IN, which is what
   lets adders chain into wider numbers — the reason the third input exists at all. */

class TruthTablesLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.reset();
  }

  static get MODES() { return ['half', 'full']; }

  // A half adder: sum is A XOR B, carry is A AND B.
  static half(a, b) { return { sum: (a ^ b) & 1, carry: a & b }; }

  /* A full adder: the same two bits plus a carry-in. Written as the arithmetic it is, so the
     table and the sum can be checked against each other rather than asserted. */
  static full(a, b, cin) {
    const total = a + b + cin;
    return { sum: total & 1, carry: total >= 2 ? 1 : 0 };
  }

  static evaluate(mode, a, b, cin) {
    return mode === 'full' ? TruthTablesLesson.full(a, b, cin) : TruthTablesLesson.half(a, b);
  }

  reset() {
    this.mode = 'half';
    this.a = 0;
    this.b = 0;
    this.cin = 0;
    this.revealed = 1;   // how many rows of the table are filled in so far
    this.draw();
  }

  get rowCount() { return this.mode === 'full' ? 8 : 4; }

  // Every input combination, in counting order — which is what makes a truth table complete.
  get combos() {
    const out = [];
    for (let i = 0; i < this.rowCount; i++) {
      out.push(this.mode === 'full'
        ? [(i >> 2) & 1, (i >> 1) & 1, i & 1]
        : [(i >> 1) & 1, i & 1]);
    }
    return out;
  }

  get rowIndex() {
    return this.mode === 'full'
      ? (this.a << 2) | (this.b << 1) | this.cin
      : (this.a << 1) | this.b;
  }

  /* Step fills in the next row AND moves the inputs to it, so the row being written is always
     the row the circuit is showing. Filling the table without moving the circuit would teach
     the table as a separate object, which is the misconception. */
  step() {
    if (this.revealed < this.rowCount) this.revealed += 1;
    const i = (this.revealed - 1) % this.rowCount;
    const c = this.combos[i];
    this.a = c[0];
    this.b = c[1];
    this.cin = this.mode === 'full' ? c[2] : 0;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'mode') {
      this.mode = TruthTablesLesson.MODES.includes(value) ? value : 'half';
      this.revealed = Math.max(1, Math.min(this.revealed, this.rowCount));
      if (this.mode === 'half') this.cin = 0;
    } else if (key === 'a') this.a = value ? 1 : 0;
    else if (key === 'b') this.b = value ? 1 : 0;
    else if (key === 'cin') this.cin = value ? 1 : 0;
    // Toggling to a row reveals at least that far, or the answer would be hidden.
    this.revealed = Math.max(this.revealed, this.rowIndex + 1);
    this.draw();
  }

  getInput(key) {
    if (key === 'mode') return this.mode;
    if (key === 'a') return this.a;
    if (key === 'b') return this.b;
    if (key === 'cin') return this.cin;
    return null;
  }

  activeInputs() {
    return this.mode === 'full' ? ['mode', 'a', 'b', 'cin'] : ['mode', 'a', 'b'];
  }

  draw() {
    const ctx = this.ctx;
    const { w } = CL.clear(ctx);
    const full = this.mode === 'full';
    const r = TruthTablesLesson.evaluate(this.mode, this.a, this.b, this.cin);

    CL.text(ctx, full ? 'Full adder — 3 bits in' : 'Half adder — 2 bits in',
      w / 2, 32, { size: 26, bold: true });
    CL.text(ctx, full
      ? 'A + B + carry-in. The carry-out feeds the next column, which is how bigger numbers add.'
      : 'A + B. Sum is A XOR B, carry is A AND B — the two gates from the last lesson.',
      w / 2, 60, { size: 15, color: '#6c757d' });

    // ---- the sum, written as arithmetic ---------------------------------------------
    const total = this.a + this.b + (full ? this.cin : 0);
    CL.text(ctx, full
      ? `${this.a} + ${this.b} + ${this.cin}  =  ${total}`
      : `${this.a} + ${this.b}  =  ${total}`,
    250, 130, { size: 28, bold: true });
    CL.text(ctx, `in binary that is  ${r.carry}${r.sum}`, 250, 172,
      { size: 20, color: CL.COLORS.accent });

    // ---- input terminals -------------------------------------------------------------
    CL.bit(ctx, 120, 250, this.a, 'A');
    CL.bit(ctx, 210, 250, this.b, 'B');
    if (full) CL.bit(ctx, 300, 250, this.cin, 'Carry in');

    // ---- the adder block and its two outputs ----------------------------------------
    const bx = 150; const by = 310; const bw = 220; const bh = 66;
    CL.box(ctx, { x: bx, y: by, w: bw, h: bh, label: full ? 'FULL ADDER' : 'HALF ADDER',
      stroke: CL.COLORS.accent });
    const sumPath = [[bx + 55, by + bh], [bx + 55, by + bh + 44]];
    const carPath = [[bx + bw - 55, by + bh], [bx + bw - 55, by + bh + 44]];
    CL.wire(ctx, sumPath, r.sum);
    CL.wire(ctx, carPath, r.carry);
    CL.flow(ctx, sumPath, r.sum, this.phase);
    CL.flow(ctx, carPath, r.carry, this.phase);
    CL.bit(ctx, bx + 55, by + bh + 62, r.sum, null);
    CL.bit(ctx, bx + bw - 55, by + bh + 62, r.carry, null);
    CL.text(ctx, 'Sum', bx + 55, by + bh + 96, { size: 14, bold: true });
    CL.text(ctx, 'Carry out', bx + bw - 55, by + bh + 96, { size: 14, bold: true });

    // ---- the table being built ------------------------------------------------------
    const headers = full ? ['A', 'B', 'Cin', 'Sum', 'Cout'] : ['A', 'B', 'Sum', 'Carry'];
    const rows = this.combos.map((c, i) => {
      if (i >= this.revealed) return [...c, ...(full ? ['·', '·'] : ['·', '·'])];
      const v = TruthTablesLesson.evaluate(this.mode, c[0], c[1], full ? c[2] : 0);
      return [...c, v.sum, v.carry];
    });
    const tx = 640;
    CL.text(ctx, 'Truth table', tx + (58 * headers.length) / 2, 100, { size: 17, bold: true });
    CL.table(ctx, {
      x: tx, y: 124, colW: 58, rowH: 32, headers, rows, highlight: this.rowIndex,
    });
    CL.text(ctx, `${this.revealed} of ${this.rowCount} rows filled in`,
      tx + (58 * headers.length) / 2, 148 + 32 * (this.rowCount + 1),
      { size: 14, color: '#6c757d' });

    CL.text(ctx, 'Press Step to fill the next row, or toggle the inputs to jump to any row.',
      w / 2, 470, { size: 15, color: '#6c757d' });
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
