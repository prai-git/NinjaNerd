/* Shared drawing helpers for the Control Logic lessons (prompt 20).

   A CLASSIC script, like every game source under app/static/games/. It must not use `export`:
   lesson.js resolves a lesson's class off the global lexical binding a top-level `class X {}`
   creates, and a module scope would break that silently (see game.js globalCtor).

   This is the lessons' equivalent of a game's config.js — loaded first, depended on by the
   lesson that follows it in the manifest. Everything here is pure drawing: no state, no
   timers, no DOM beyond the canvas context it is handed. */

const CL = {
  // One palette for all five lessons, so "on" means the same colour everywhere.
  COLORS: {
    on: '#198754',        // Bootstrap success — a signal that is HIGH / 1
    off: '#adb5bd',       // muted grey — LOW / 0
    body: '#f8f9fa',
    stroke: '#343a40',
    accent: '#0d6efd',
    warn: '#fd7e14',
    text: '#212529',
    faint: '#dee2e6',
  },

  // Fill the canvas and return its logical size. Every lesson starts a frame with this.
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

  // A labelled block: the CPU, a device, a component body.
  box(ctx, { x, y, w, h, label, sub, fill, stroke, textColor }) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.fillStyle = fill || CL.COLORS.body;
    ctx.strokeStyle = stroke || CL.COLORS.stroke;
    CL.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = textColor || CL.COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(label, x + w / 2, sub ? y + h / 2 - 11 : y + h / 2);
    if (sub) {
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#6c757d';
      ctx.fillText(sub, x + w / 2, y + h / 2 + 13);
    }
    ctx.restore();
  },

  text(ctx, str, x, y, { size = 16, bold = false, color = CL.COLORS.text, align = 'center' } = {}) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
    ctx.fillText(str, x, y);
    ctx.restore();
  },

  /* A wire between two points, drawn green when carrying a 1 and grey when carrying a 0.
     `pts` is a polyline so a lesson can route around a box. */
  wire(ctx, pts, on) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = on ? CL.COLORS.on : CL.COLORS.off;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  },

  /* Moving dots along a wire — this is what makes a signal look like it FLOWS rather than
     just changing colour. `phase` is 0..1 and comes from the lesson's animation clock, so a
     paused lesson simply stops advancing it. Only drawn when the wire is carrying a 1. */
  flow(ctx, pts, on, phase, spacing = 34) {
    if (!on) return;
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push(d);
      total += d;
    }
    if (total === 0) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let d = (phase % 1) * spacing; d < total; d += spacing) {
      let rem = d;
      let i = 0;
      while (i < segs.length && rem > segs[i]) { rem -= segs[i]; i++; }
      if (i >= segs.length) break;
      const t = segs[i] === 0 ? 0 : rem / segs[i];
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
      const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // A 0/1 terminal marker at the end of a wire.
  bit(ctx, x, y, value, label) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fillStyle = value ? CL.COLORS.on : CL.COLORS.off;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CL.COLORS.stroke;
    ctx.stroke();
    CL.text(ctx, String(value ? 1 : 0), x, y + 1, { size: 16, bold: true, color: '#fff' });
    if (label) CL.text(ctx, label, x, y - 32, { size: 15, bold: true });
    ctx.restore();
  },

  // A lamp that lights when its input is 1 — the payoff in several lessons.
  lamp(ctx, x, y, on, label) {
    ctx.save();
    if (on) {
      const g = ctx.createRadialGradient(x, y, 4, x, y, 46);
      g.addColorStop(0, 'rgba(255,193,7,0.85)');
      g.addColorStop(1, 'rgba(255,193,7,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#ffc107' : '#e9ecef';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CL.COLORS.stroke;
    ctx.stroke();
    if (label) CL.text(ctx, label, x, y + 40, { size: 15, bold: true });
    ctx.restore();
  },

  /* The distinctive outline of each logic gate, drawn at (x,y) with the given width/height.
     AND is a D, OR/XOR are curved shields, NOT is a triangle. The inverting gates (NAND,
     NOR, NOT) additionally get the small bubble on the output, which is what the bubble
     MEANS: "and then flip it". */
  gate(ctx, type, x, y, w, h) {
    const t = String(type).toUpperCase();
    const base = t.replace(/^N(AND|OR)$/, '$1');
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CL.COLORS.stroke;
    ctx.fillStyle = CL.COLORS.body;
    ctx.beginPath();
    if (base === 'AND') {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.45, y);
      ctx.arc(x + w * 0.45, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    } else if (base === 'OR' || t === 'XOR') {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w * 0.45, y, x + w, y + h / 2);
      ctx.quadraticCurveTo(x + w * 0.45, y + h, x, y + h);
      ctx.quadraticCurveTo(x + w * 0.28, y + h / 2, x, y);
      ctx.closePath();
    } else { // NOT — a triangle pointing at its bubble
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.8, y + h / 2);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    // XOR's extra leading arc is the only thing that tells it apart from OR.
    if (t === 'XOR') {
      ctx.beginPath();
      ctx.moveTo(x - 11, y);
      ctx.quadraticCurveTo(x + w * 0.17, y + h / 2, x - 11, y + h);
      ctx.stroke();
    }
    if (t === 'NOT' || t === 'NAND' || t === 'NOR' || t === 'XNOR') {
      ctx.beginPath();
      ctx.arc(x + (t === 'NOT' ? w * 0.8 : w) + 9, y + h / 2, 9, 0, Math.PI * 2);
      ctx.fillStyle = CL.COLORS.body;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  // Where a gate's output wire starts — past the inverting bubble when there is one.
  gateOutX(type, x, w) {
    const t = String(type).toUpperCase();
    if (t === 'NOT') return x + w * 0.8 + 18;
    if (t === 'NAND' || t === 'NOR' || t === 'XNOR') return x + w + 18;
    return x + w;
  },

  // A table of rows, with one row optionally highlighted — used by gates and truth tables.
  table(ctx, { x, y, colW, rowH, headers, rows, highlight = -1 }) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = CL.COLORS.faint;
    headers.forEach((hd, c) => {
      CL.text(ctx, hd, x + colW * c + colW / 2, y + rowH / 2, { size: 15, bold: true, color: '#6c757d' });
    });
    rows.forEach((row, r) => {
      const ry = y + rowH * (r + 1);
      if (r === highlight) {
        ctx.fillStyle = 'rgba(13,110,253,0.12)';
        CL.roundRect(ctx, x - 6, ry + 2, colW * headers.length + 12, rowH - 4, 6);
        ctx.fill();
      }
      row.forEach((cell, c) => {
        const isOut = c === headers.length - 1;
        CL.text(ctx, String(cell), x + colW * c + colW / 2, ry + rowH / 2, {
          size: 16,
          bold: r === highlight,
          color: isOut ? (String(cell) === '1' ? CL.COLORS.on : '#6c757d') : CL.COLORS.text,
        });
      });
      ctx.beginPath();
      ctx.moveTo(x - 6, ry + rowH);
      ctx.lineTo(x + colW * headers.length + 6, ry + rowH);
      ctx.stroke();
    });
    ctx.restore();
  },
};
