/* Shared drawing helpers for the Electrical Design lessons (prompt 21).

   A CLASSIC script, exactly like control-logic/common/draw.js and every game source: it must
   not use `export`, because lesson.js resolves a lesson's class off the global LEXICAL binding
   a top-level `class X {}` creates, and a module scope would break that silently.

   Why a second helper file rather than reusing the Control Logic one: that palette draws
   LOGIC — a wire is green for 1 and grey for 0. Here a wire carries volts and amps, a
   component has a value, and "on" is a matter of degree. The two vocabularies would fight if
   they shared a file. What IS shared is the discipline: pure drawing, no state, no timers,
   no DOM beyond the context it is handed.

   The symbols below are the standard schematic ones (IEEE/ANSI zig-zag resistor, the coil
   inductor, the triangle-and-bar diode, the NPN transistor with its arrow on the emitter),
   because the point of this topic is that the drawing on the screen is the drawing an
   engineer would hand a factory. */

const ED = {
  COLORS: {
    wire: '#495057',       // an idle conductor — copper, not "off"
    live: '#dc3545',       // the Vcc rail and anything sitting at supply voltage
    gnd: '#0d6efd',        // the ground rail
    flow: '#fd7e14',       // current actually moving
    body: '#ffffff',
    stroke: '#212529',
    text: '#212529',
    muted: '#6c757d',
    faint: '#dee2e6',
    ok: '#198754',
    warn: '#fd7e14',
    danger: '#dc3545',
    chip: '#e7f1ff',
    glow: '#ffc107',
  },

  clear(ctx) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    return { w: width, h: height };
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  text(ctx, str, x, y, { size = 15, bold = false, color = ED.COLORS.text, align = 'center' } = {}) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
    ctx.fillText(String(str), x, y);
    ctx.restore();
  },

  // A plain conductor. Colour says what it is (rail, ground, signal), never 1 or 0.
  wire(ctx, pts, { color = ED.COLORS.wire, width = 3 } = {}) {
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  },

  // A junction where three or more conductors meet. Its absence is how a schematic says
  // "these two cross but do not connect" — so it has to be drawn deliberately.
  node(ctx, x, y, color = ED.COLORS.wire) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /* Moving charge along a polyline. `amps` scales the spacing, so a bigger current visibly
     moves more charge — the whole reason a resistor slider is worth having. */
  flow(ctx, pts, amps, phase, { color = ED.COLORS.flow } = {}) {
    if (!(amps > 0)) return;
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push(d);
      total += d;
    }
    if (total === 0) return;
    const spacing = Math.max(16, 70 - Math.min(60, amps * 900));
    ctx.save();
    ctx.fillStyle = color;
    for (let d = (phase % 1) * spacing; d < total; d += spacing) {
      let rem = d;
      let i = 0;
      while (i < segs.length && rem > segs[i]) { rem -= segs[i]; i++; }
      if (i >= segs.length) break;
      const t = segs[i] === 0 ? 0 : rem / segs[i];
      ctx.beginPath();
      ctx.arc(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // The supply rail, drawn as a rail rather than a battery so the MCU circuit reads like a
  // real schematic sheet.
  rail(ctx, x1, x2, y, label, color) {
    ED.wire(ctx, [[x1, y], [x2, y]], { color, width: 4 });
    ED.text(ctx, label, x1 - 8, y, { size: 13, bold: true, color, align: 'right' });
  },

  // The three-bar ground symbol. Every circuit in this topic returns here; a child who never
  // sees it never learns that current needs a way back.
  ground(ctx, x, y, color = ED.COLORS.gnd) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    [[16, 0], [10, 6], [4, 12]].forEach(([half, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x - half, y + dy);
      ctx.lineTo(x + half, y + dy);
      ctx.stroke();
    });
    ctx.restore();
  },

  /* The zig-zag resistor, drawn along a horizontal or vertical run of length `len` from
     (x, y). `hot` tints it when it is dissipating real power. */
  resistor(ctx, x, y, len, vertical, { label, value, hot = false } = {}) {
    ctx.save();
    ctx.strokeStyle = hot ? ED.COLORS.warn : ED.COLORS.stroke;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    const zig = 26;                       // length of the zig-zag body
    const lead = (len - zig * 2) / 2;
    ctx.beginPath();
    if (!vertical) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + lead, y);
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(x + lead + (zig * 2 / 6) * (i + 0.5), y + (i % 2 === 0 ? -9 : 9));
      }
      ctx.lineTo(x + lead + zig * 2, y);
      ctx.lineTo(x + len, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + lead);
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(x + (i % 2 === 0 ? -9 : 9), y + lead + (zig * 2 / 6) * (i + 0.5));
      }
      ctx.lineTo(x, y + lead + zig * 2);
      ctx.lineTo(x, y + len);
    }
    ctx.stroke();
    ctx.restore();
    if (label) {
      if (!vertical) ED.text(ctx, label, x + len / 2, y - 24, { size: 14, bold: true });
      else ED.text(ctx, label, x + 30, y + len / 2 - 9, { size: 14, bold: true, align: 'left' });
    }
    if (value) {
      if (!vertical) ED.text(ctx, value, x + len / 2, y + 26, { size: 13, color: ED.COLORS.muted });
      else ED.text(ctx, value, x + 30, y + len / 2 + 9, { size: 13, color: ED.COLORS.muted, align: 'left' });
    }
  },

  // A resistor inside a circle with two arrows pointing at it: the standard symbol for a
  // resistor whose value is set by something outside the circuit — light for an LDR, heat
  // for a thermistor.
  sensorResistor(ctx, x, y, len, kind, { label, value } = {}) {
    ED.resistor(ctx, x, y, len, true, {});
    ctx.save();
    ctx.strokeStyle = kind === 'ldr' ? ED.COLORS.glow : ED.COLORS.danger;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const dy of [-8, 8]) {
      const sy = y + len / 2 + dy;
      ctx.beginPath();
      ctx.moveTo(x - 46, sy - 10);
      ctx.lineTo(x - 22, sy);
      ctx.stroke();
      ctx.beginPath();          // arrow head
      ctx.moveTo(x - 22, sy);
      ctx.lineTo(x - 31, sy - 4);
      ctx.moveTo(x - 22, sy);
      ctx.lineTo(x - 30, sy + 5);
      ctx.stroke();
    }
    ctx.restore();
    if (label) ED.text(ctx, label, x + 28, y + len / 2 - 9, { size: 14, bold: true, align: 'left' });
    if (value) ED.text(ctx, value, x + 28, y + len / 2 + 9, { size: 13, color: ED.COLORS.muted, align: 'left' });
  },

  // Two parallel plates: a capacitor stores charge in the gap between them.
  capacitor(ctx, x, y, len, { charge = 0, label, value } = {}) {
    ctx.save();
    ctx.strokeStyle = ED.COLORS.stroke;
    ctx.lineWidth = 3;
    const mid = y + len / 2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, mid - 7);
    ctx.moveTo(x, mid + 7); ctx.lineTo(x, y + len);
    ctx.stroke();
    ctx.lineWidth = 4;
    for (const dy of [-7, 7]) {
      ctx.beginPath();
      ctx.moveTo(x - 22, mid + dy);
      ctx.lineTo(x + 22, mid + dy);
      ctx.stroke();
    }
    // The stored charge, drawn in the gap — this is the thing the symbol is about.
    if (charge > 0.02) {
      ctx.fillStyle = `rgba(13,110,253,${Math.min(0.85, charge)})`;
      ctx.fillRect(x - 22, mid - 5, 44, 10);
    }
    ctx.restore();
    if (label) ED.text(ctx, label, x + 34, mid - 9, { size: 14, bold: true, align: 'left' });
    if (value) ED.text(ctx, value, x + 34, mid + 9, { size: 13, color: ED.COLORS.muted, align: 'left' });
  },

  // The coil inductor: four half-loops on a straight run.
  inductor(ctx, x, y, len, { label, value, energised = false } = {}) {
    ctx.save();
    ctx.strokeStyle = energised ? ED.COLORS.flow : ED.COLORS.stroke;
    ctx.lineWidth = 3;
    const lead = (len - 64) / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + lead);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x, y + lead + 8 + i * 16, 8, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, y + lead + 64);
    ctx.lineTo(x, y + len);
    ctx.stroke();
    ctx.restore();
    if (label) ED.text(ctx, label, x + 24, y + len / 2 - 9, { size: 14, bold: true, align: 'left' });
    if (value) ED.text(ctx, value, x + 24, y + len / 2 + 9, { size: 13, color: ED.COLORS.muted, align: 'left' });
  },

  /* Triangle-and-bar diode. `dir` is the direction the arrow points — which IS the direction
     conventional current is allowed to travel, and the single most important thing on the
     symbol. 'up' | 'down' | 'right' | 'left'. */
  diode(ctx, x, y, dir, { conducting = false, led = false, label } = {}) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ED.COLORS.stroke;
    ctx.fillStyle = conducting ? (led ? ED.COLORS.glow : ED.COLORS.ok) : '#ffffff';
    const v = dir === 'up' || dir === 'down';
    const s = (dir === 'down' || dir === 'right') ? 1 : -1;
    ctx.beginPath();
    if (v) {
      ctx.moveTo(x - 17, y - 15 * s);
      ctx.lineTo(x + 17, y - 15 * s);
      ctx.lineTo(x, y + 15 * s);
    } else {
      ctx.moveTo(x - 15 * s, y - 17);
      ctx.lineTo(x - 15 * s, y + 17);
      ctx.lineTo(x + 15 * s, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();            // the cathode bar, at the arrow's point
    if (v) { ctx.moveTo(x - 17, y + 15 * s); ctx.lineTo(x + 17, y + 15 * s); }
    else { ctx.moveTo(x + 15 * s, y - 17); ctx.lineTo(x + 15 * s, y + 17); }
    ctx.stroke();
    // An LED is a diode that emits: the two outward arrows are the only difference.
    if (led) {
      ctx.strokeStyle = conducting ? ED.COLORS.glow : ED.COLORS.muted;
      ctx.lineWidth = 2;
      for (const off of [-8, 6]) {
        ctx.beginPath();
        ctx.moveTo(x + 22, y + off - 6);
        ctx.lineTo(x + 38, y + off - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 38, y + off - 18);
        ctx.lineTo(x + 31, y + off - 16);
        ctx.moveTo(x + 38, y + off - 18);
        ctx.lineTo(x + 36, y + off - 11);
        ctx.stroke();
      }
      if (conducting) {
        const g = ctx.createRadialGradient(x, y, 3, x, y, 44);
        g.addColorStop(0, 'rgba(255,193,7,0.75)');
        g.addColorStop(1, 'rgba(255,193,7,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 44, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (label) ED.text(ctx, label, x + (led ? 46 : 30), y, { size: 14, bold: true, align: 'left' });
  },

  /* NPN transistor: base bar on the left, collector up, emitter down with the arrow pointing
     OUT — that arrow is what makes it NPN rather than PNP. */
  npn(ctx, x, y, { on = false, label } = {}) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = on ? ED.COLORS.ok : ED.COLORS.stroke;
    ctx.beginPath();
    ctx.moveTo(x, y - 26);
    ctx.lineTo(x, y + 26);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 14); ctx.lineTo(x + 28, y - 34);
    ctx.moveTo(x, y + 14); ctx.lineTo(x + 28, y + 34);
    ctx.stroke();
    // Emitter arrow.
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 28);
    ctx.lineTo(x + 28, y + 34);
    ctx.lineTo(x + 17, y + 34);
    ctx.closePath();
    ctx.fillStyle = on ? ED.COLORS.ok : ED.COLORS.stroke;
    ctx.fill();
    ctx.restore();
    if (label) ED.text(ctx, label, x + 34, y - 2, { size: 14, bold: true, align: 'left' });
  },

  // A DC motor / fan: a circle with an M, and blades that turn while it is running.
  motor(ctx, x, y, r, spin, running, label) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = running ? ED.COLORS.ok : ED.COLORS.stroke;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(running ? spin : 0);
    ctx.fillStyle = running ? 'rgba(25,135,84,0.55)' : '#ced4da';
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r - 7, -0.45, 0.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (label) ED.text(ctx, label, x, y + r + 16, { size: 14, bold: true });
  },

  /* The MCU, drawn as a chip with named pins so a wire lands on a PIN rather than on a box.
     `pins` is { left: [...], right: [...] } of { name, y, active }. */
  chip(ctx, { x, y, w, h, label, sub, pins }) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.fillStyle = ED.COLORS.chip;
    ctx.strokeStyle = ED.COLORS.stroke;
    ED.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ED.text(ctx, label, x + w / 2, y + 20, { size: 17, bold: true });
    if (sub) ED.text(ctx, sub, x + w / 2, y + 40, { size: 12, color: ED.COLORS.muted });
    for (const side of ['left', 'right']) {
      for (const pin of (pins && pins[side]) || []) {
        const px = side === 'left' ? x : x + w;
        const dir = side === 'left' ? -1 : 1;
        ED.wire(ctx, [[px, pin.y], [px + 14 * dir, pin.y]],
          { color: pin.active ? ED.COLORS.ok : ED.COLORS.wire, width: 3 });
        ED.text(ctx, pin.name, px + 8 * -dir + (dir < 0 ? 0 : 0), pin.y,
          { size: 12, bold: true, align: side === 'left' ? 'left' : 'right', color: ED.COLORS.muted });
      }
    }
  },

  /* A single-pole switch, drawn open or closed. Without it the lesson says "switch OPEN"
     beside an unbroken wire, which is worse than saying nothing: the picture contradicts the
     words, and the picture is what a child believes. */
  switchSym(ctx, x, y, closed) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = closed ? ED.COLORS.stroke : ED.COLORS.muted;
    ctx.beginPath();
    ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 10);
    ctx.moveTo(x, y + 10); ctx.lineTo(x, y + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    if (closed) ctx.lineTo(x, y - 10); else ctx.lineTo(x + 20, y - 14);
    ctx.stroke();
    ctx.fillStyle = ED.COLORS.stroke;
    for (const dy of [-10, 10]) {
      ctx.beginPath();
      ctx.arc(x, y + dy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ED.text(ctx, closed ? 'switch CLOSED' : 'switch OPEN', x - 34, y,
      { size: 13, bold: true, align: 'right', color: closed ? ED.COLORS.ok : ED.COLORS.muted });
  },

  // A soft panel behind a region of the canvas, so the circuit and the program area read as
  // two different places.
  panel(ctx, x, y, w, h, title) {
    ctx.save();
    ctx.fillStyle = '#f8f9fa';
    ctx.strokeStyle = ED.COLORS.faint;
    ctx.lineWidth = 1;
    ED.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (title) ED.text(ctx, title, x + 12, y + 15, { size: 12, bold: true, color: ED.COLORS.muted, align: 'left' });
  },

  // A draggable command block, and the empty slot it drops into.
  block(ctx, b, { ghost = false, running = false } = {}) {
    ctx.save();
    ctx.globalAlpha = ghost ? 0.75 : 1;
    ctx.lineWidth = running ? 3 : 1.5;
    ctx.fillStyle = b.fill || '#ffffff';
    ctx.strokeStyle = running ? ED.COLORS.ok : ED.COLORS.stroke;
    ED.roundRect(ctx, b.x, b.y, b.w, b.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ED.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, { size: 12.5, bold: running });
  },

  slot(ctx, s, index) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ED.COLORS.faint;
    ED.roundRect(ctx, s.x, s.y, s.w, s.h, 7);
    ctx.stroke();
    ctx.restore();
    // Muted, not faint: #dee2e6 numerals on the panel's #f8f9fa are invisible, and the slot
    // order is the program order — it is the one label here that has to be readable.
    ED.text(ctx, String(index + 1), s.x - 8, s.y + s.h / 2, { size: 12, color: ED.COLORS.muted, align: 'right' });
  },
};
