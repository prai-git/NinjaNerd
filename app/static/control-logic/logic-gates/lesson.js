/* Lesson 3 — Logic Gates (prompt 20).

   A CLASSIC script. `class LogicGatesLesson` binds in the global lexical scope, which is what
   lesson.js resolves it by; an `export` here would break loading silently.

   Teaching shape: one gate on screen, two inputs the child toggles, and the answer appearing
   on the output wire immediately. The truth table beside it highlights the row being made, so
   the table stops being something to memorise and becomes a record of what was just done.

   No score, no timer, no failure state — nothing here can be got wrong (prompt 20). */

class LogicGatesLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.reset();
  }

  // The gate order is the teaching order: the two everyday ones, then NOT, then the
  // inverted pair that is just "…and then flip it", and XOR last as the odd one out.
  static get TYPES() { return ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR']; }

  static evaluate(type, a, b) {
    switch (type) {
      case 'AND': return a && b ? 1 : 0;
      case 'OR': return a || b ? 1 : 0;
      case 'NOT': return a ? 0 : 1;
      case 'NAND': return a && b ? 0 : 1;
      case 'NOR': return a || b ? 0 : 1;
      case 'XOR': return (a ? 1 : 0) !== (b ? 1 : 0) ? 1 : 0;
      default: return 0;
    }
  }

  static describe(type) {
    switch (type) {
      case 'AND': return 'Output is 1 only when BOTH inputs are 1.';
      case 'OR': return 'Output is 1 when EITHER input is 1 (or both).';
      case 'NOT': return 'One input. Output is the opposite of it.';
      case 'NAND': return 'AND, then flipped. Output is 0 only when both inputs are 1.';
      case 'NOR': return 'OR, then flipped. Output is 1 only when both inputs are 0.';
      case 'XOR': return 'Output is 1 when the inputs are DIFFERENT.';
      default: return '';
    }
  }

  reset() {
    this.type = 'AND';
    this.a = 0;
    this.b = 0;
    this.draw();
  }

  // Step walks the input combinations in truth-table order, so a child can watch every row
  // of the table fill in without having to work out which toggles to press.
  step() {
    if (this.type === 'NOT') {
      this.a = this.a ? 0 : 1;
    } else {
      const next = (((this.a ? 2 : 0) + (this.b ? 1 : 0)) + 1) % 4;
      this.a = next >= 2 ? 1 : 0;
      this.b = next % 2;
    }
    this.draw();
  }

  setInput(key, value) {
    if (key === 'type') this.type = LogicGatesLesson.TYPES.includes(value) ? value : 'AND';
    else if (key === 'a') this.a = value ? 1 : 0;
    else if (key === 'b') this.b = value ? 1 : 0;
    this.draw();
  }

  getInput(key) {
    if (key === 'type') return this.type;
    if (key === 'a') return this.a;
    if (key === 'b') return this.b;
    return null;
  }

  // Which inputs are meaningful right now. NOT has only one, so the player hides B.
  activeInputs() { return this.type === 'NOT' ? ['type', 'a'] : ['type', 'a', 'b']; }

  get rows() {
    const combos = this.type === 'NOT' ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
    return combos.map((c) => [...c, LogicGatesLesson.evaluate(this.type, c[0], c[1])]);
  }

  get highlightIndex() {
    return this.type === 'NOT' ? this.a : (this.a ? 2 : 0) + (this.b ? 1 : 0);
  }

  draw() {
    const ctx = this.ctx;
    const { w } = CL.clear(ctx);
    const single = this.type === 'NOT';
    const out = LogicGatesLesson.evaluate(this.type, this.a, this.b);

    CL.text(ctx, `${this.type} gate`, w / 2, 34, { size: 26, bold: true });
    CL.text(ctx, LogicGatesLesson.describe(this.type), w / 2, 64, { size: 16, color: '#6c757d' });

    const gx = 300; const gy = 150; const gw = 130; const gh = 130;
    const aY = single ? gy + gh / 2 : gy + 32;
    const bY = gy + gh - 32;

    // Input A: terminal, wire into the gate.
    const aPath = [[150, aY], [gx, aY]];
    CL.wire(ctx, aPath, this.a);
    CL.flow(ctx, aPath, this.a, this.phase);
    CL.bit(ctx, 150, aY, this.a, 'A');

    if (!single) {
      const bPath = [[150, bY], [gx, bY]];
      CL.wire(ctx, bPath, this.b);
      CL.flow(ctx, bPath, this.b, this.phase);
      CL.bit(ctx, 150, bY, this.b, 'B');
    }

    CL.gate(ctx, this.type, gx, gy, gw, gh);

    // Output: wire out of the gate to a terminal and a lamp.
    const ox = CL.gateOutX(this.type, gx, gw);
    const oPath = [[ox, gy + gh / 2], [ox + 120, gy + gh / 2]];
    CL.wire(ctx, oPath, out);
    CL.flow(ctx, oPath, out, this.phase);
    CL.bit(ctx, ox + 120, gy + gh / 2, out, 'Output');
    CL.lamp(ctx, ox + 215, gy + gh / 2, out, out ? 'ON' : 'OFF');

    // The truth table, with the row the child is currently standing on highlighted.
    const headers = single ? ['A', 'Out'] : ['A', 'B', 'Out'];
    CL.table(ctx, {
      x: 700, y: 120, colW: 62, rowH: 34, headers, rows: this.rows, highlight: this.highlightIndex,
    });
    CL.text(ctx, 'Truth table', 700 + (62 * headers.length) / 2, 96, { size: 17, bold: true });

    CL.text(ctx, 'Toggle A and B, or press Step to walk every row.',
      w / 2, 400, { size: 15, color: '#6c757d' });
  }

  // The only animation is the flow of dots along a live wire; nothing else moves, so a
  // lesson left open costs almost nothing.
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
