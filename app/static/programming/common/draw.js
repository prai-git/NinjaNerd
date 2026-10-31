/* Shared drawing helpers for the Programming lessons.

   A CLASSIC script, like every lesson source under app/static/. It must not use `export`:
   lesson.js resolves a lesson's class off the global lexical binding a top-level `class X {}`
   creates, and a module scope would break that silently (see game.js globalCtor).

   Loaded first and depended on by the lesson that follows it in the manifest. Everything here
   is pure drawing: no state, no timers, no DOM beyond the canvas context it is handed.

   WHY A THIRD `common/draw.js` RATHER THAN REUSING CONTROL LOGIC'S. That one draws circuits —
   wires, gates, lamps, bits. This one draws CODE: monospaced listings with a highlighted
   current line, variable boxes whose contents change, an output console, and draggable blocks.
   The two share no primitive beyond a rounded rectangle, and Electrical Design set the
   precedent of a topic owning its own drawing module (app/static/electrical-design/common/).

   CANVAS CODE FAILS QUIETLY. Pass NaN as a coordinate and the call succeeds while nothing is
   drawn. Every helper here takes plain numbers and does no arithmetic on undefined fields for
   that reason, and test_programming.test.js replays each lesson against a recording context
   that rejects non-finite arguments. */

const PG = {
  /* One palette for all four lessons, so a colour means the same thing everywhere. The
     syntax colours are deliberately few: a child reading five lines does not need eight
     token classes, and more colour would compete with the highlighted-line cue. */
  COLORS: {
    bg: '#ffffff',
    panel: '#f8f9fa',
    stroke: '#343a40',
    faint: '#dee2e6',
    text: '#212529',
    muted: '#6c757d',
    accent: '#0d6efd',      // the line that is running now
    live: '#198754',        // a value that just changed, a branch that was taken
    warn: '#fd7e14',        // a branch that was tested and not taken
    danger: '#dc3545',      // a build that stopped at this stage
    codeKey: '#6f42c1',     // keyword: SET, IF, REPEAT
    codeNum: '#0d6efd',     // a number
    codeStr: '#198754',     // a quoted string
  },

  // The monospace stack used for every code listing. One place, so the gutter arithmetic in
  // `codeLine` and the width of a dragged block cannot disagree about character width.
  MONO: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',

  // Fill the canvas and return its logical size. Every lesson starts a frame with this.
  clear(ctx) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PG.COLORS.bg;
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

  text(ctx, str, x, y, { size = 16, bold = false, color = PG.COLORS.text, align = 'center', mono = false } = {}) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${mono ? PG.MONO : 'system-ui, sans-serif'}`;
    ctx.fillText(str, x, y);
    ctx.restore();
  },

  // A titled panel. Every region of every lesson sits in one of these, so the child can tell
  // the code from the memory from the output without reading the headings twice.
  panel(ctx, { x, y, w, h, title, titleColor }) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.fillStyle = PG.COLORS.panel;
    ctx.strokeStyle = PG.COLORS.faint;
    PG.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (title) {
      PG.text(ctx, title, x + 14, y + 17,
        { size: 12, bold: true, color: titleColor || PG.COLORS.muted, align: 'left' });
    }
  },

  /* ONE line of a code listing, with a line number, optional indent, and three states:
       current  — running now: accent bar down the left and a tinted row
       done     — already run: normal
       skipped  — a branch that was NOT taken: dimmed, because "the program never went here"
                  is a fact the child has to be able to see.
     `tokens` is an array of {t, c} where c is a COLORS key, so a lesson decides its own
     highlighting without this module having to parse pseudocode. */
  codeLine(ctx, { x, y, w, n, indent = 0, tokens, state = 'idle', h = 26 }) {
    const pad = 12;
    if (state === 'current') {
      ctx.save();
      ctx.fillStyle = '#cfe2ff';
      PG.roundRect(ctx, x + 2, y - h / 2, w - 4, h, 6);
      ctx.fill();
      ctx.fillStyle = PG.COLORS.accent;
      PG.roundRect(ctx, x + 2, y - h / 2, 4, h, 2);
      ctx.fill();
      ctx.restore();
    }
    if (n !== undefined && n !== null) {
      PG.text(ctx, String(n), x + 26, y,
        { size: 13, mono: true, align: 'right', color: PG.COLORS.faint });
    }
    let cx = x + 38 + pad + indent * 22;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `15px ${PG.MONO}`;
    for (const tok of tokens) {
      const dim = state === 'skipped';
      let color = tok.c ? PG.COLORS[tok.c] : PG.COLORS.text;
      if (!color) color = PG.COLORS.text;
      ctx.fillStyle = dim ? PG.COLORS.faint : color;
      ctx.font = `${tok.b ? 'bold ' : ''}15px ${PG.MONO}`;
      ctx.fillText(tok.t, cx, y);
      cx += ctx.measureText(tok.t).width;
    }
    ctx.restore();
    return cx;
  },

  /* A variable as a labelled box with its value inside — the picture the word "variable"
     should leave behind. `was` draws the previous value struck through above the new one,
     which is how the lesson shows that assignment REPLACES rather than accumulates. */
  varBox(ctx, { x, y, w = 128, h = 58, name, value, was, live, type }) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.fillStyle = live ? '#d1e7dd' : '#ffffff';
    ctx.strokeStyle = live ? PG.COLORS.live : PG.COLORS.stroke;
    PG.roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // The name sits ON the box's top edge, like a label stuck on a jar.
    ctx.save();
    ctx.fillStyle = PG.COLORS.bg;
    const nameW = 10 + name.length * 8;
    ctx.fillRect(x + 10, y - 7, nameW, 14);
    ctx.restore();
    PG.text(ctx, name, x + 14, y, { size: 13, bold: true, mono: true, align: 'left', color: live ? PG.COLORS.live : PG.COLORS.muted });
    PG.text(ctx, String(value), x + w / 2, y + h / 2 + (was !== undefined && was !== null ? 7 : 0),
      { size: 22, bold: true, mono: true, color: PG.COLORS.text });
    if (was !== undefined && was !== null) {
      const ty = y + h / 2 - 14;
      PG.text(ctx, String(was), x + w / 2, ty, { size: 14, mono: true, color: PG.COLORS.muted });
      ctx.save();
      ctx.strokeStyle = PG.COLORS.muted;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const half = 7 + String(was).length * 4;
      ctx.moveTo(x + w / 2 - half, ty);
      ctx.lineTo(x + w / 2 + half, ty);
      ctx.stroke();
      ctx.restore();
    }
    if (type) {
      PG.text(ctx, type, x + w - 8, y + h - 9,
        { size: 11, mono: true, align: 'right', color: PG.COLORS.muted });
    }
  },

  // The program's output, newest line last — the thing a child actually wants to see happen.
  console(ctx, { x, y, w, h, lines, title = 'OUTPUT' }) {
    PG.panel(ctx, { x, y, w, h, title });
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 24, w - 4, h - 26);
    ctx.clip();
    const rowH = 22;
    const visible = Math.max(0, Math.floor((h - 32) / rowH));
    const shown = lines.slice(-visible);
    shown.forEach((ln, i) => {
      PG.text(ctx, ln, x + 14, y + 38 + i * rowH,
        { size: 14, mono: true, align: 'left', color: PG.COLORS.text });
    });
    ctx.restore();
    if (!lines.length) {
      PG.text(ctx, 'nothing yet', x + 14, y + 38,
        { size: 14, mono: true, align: 'left', color: PG.COLORS.faint });
    }
  },

  /* A draggable block, and the empty slot it drops into. Mirrors the Design lesson in
     Electrical Design: palette and slots are drawn on the lesson's own canvas and driven by
     pointer events, because the player gives a lesson one canvas and no DOM of its own. */
  block(ctx, { x, y, w, h = 32, label, fill, ghost }) {
    ctx.save();
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.lineWidth = 2;
    ctx.fillStyle = fill || '#e7f1ff';
    ctx.strokeStyle = PG.COLORS.accent;
    PG.roundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    PG.text(ctx, label, x + w / 2, y + h / 2,
      { size: 14, mono: true, color: PG.COLORS.text });
  },

  slot(ctx, { x, y, w, h = 32, label, hot }) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = hot ? PG.COLORS.accent : PG.COLORS.muted;
    ctx.fillStyle = hot ? '#e7f1ff' : '#ffffff';
    PG.roundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (label) {
      PG.text(ctx, label, x + w / 2, y + h / 2,
        { size: 13, mono: true, color: PG.COLORS.muted });
    }
  },

  /* One stage of the build pipeline: a box with an arrow leading out of it. `state` is
     'pending' | 'active' | 'done' | 'failed', so a stage that stopped the build is obvious
     without reading the caption. */
  stage(ctx, { x, y, w, h, label, sub, state }) {
    const fill = { pending: '#ffffff', active: '#cfe2ff', done: '#d1e7dd', failed: '#f8d7da' }[state] || '#ffffff';
    const stroke = { pending: PG.COLORS.faint, active: PG.COLORS.accent, done: PG.COLORS.live, failed: PG.COLORS.danger }[state] || PG.COLORS.faint;
    ctx.save();
    ctx.lineWidth = state === 'pending' ? 1.5 : 2.5;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    PG.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    PG.text(ctx, label, x + w / 2, y + h / 2 - (sub ? 10 : 0), { size: 15, bold: true });
    if (sub) {
      PG.text(ctx, sub, x + w / 2, y + h / 2 + 12, { size: 12, color: PG.COLORS.muted });
    }
  },

  arrow(ctx, x1, y1, x2, y2, { color = PG.COLORS.muted, width = 3 } = {}) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    const head = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  /* Moving dots along a straight run, so a pipeline stage looks like it is WORKING rather
     than just changing colour. `phase` is 0..1 from the lesson's clock, so a lesson that is
     not animating simply stops advancing it. */
  travel(ctx, x1, y1, x2, y2, phase, { spacing = 26, color = PG.COLORS.accent } = {}) {
    const total = Math.hypot(x2 - x1, y2 - y1);
    if (total === 0) return;
    ctx.save();
    ctx.fillStyle = color;
    for (let d = (phase % 1) * spacing; d < total; d += spacing) {
      const t = d / total;
      ctx.beginPath();
      ctx.arc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  /* The caption strip every lesson ends its frame with: what just happened, in words.

     IT WRAPS, and that is not decoration. A one-line caption centred in a 560px box silently
     ran off the LEFT edge of the canvas and across the OUTPUT panel when the sentence grew to
     71 characters — found by replaying the lesson and auditing the geometry, not by any
     assertion, because canvas text neither clips nor complains. */
  caption(ctx, { x, y, w, text, color }) {
    const size = 16;
    // 0.56em per character is a close enough average for this font at this size; the point is
    // to break the line BEFORE the box edge, not to typeset precisely.
    const perChar = size * 0.56;
    const budget = Math.max(12, Math.floor((w - 28) / perChar));
    const lines = PG.wrap(text, budget).slice(0, 2);
    const h = lines.length > 1 ? 62 : 44;
    ctx.save();
    ctx.fillStyle = '#e7f1ff';
    PG.roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.restore();
    lines.forEach((ln, i) => {
      PG.text(ctx, ln, x + w / 2, y + (lines.length > 1 ? 22 + i * 21 : 22),
        { size, bold: true, color: color || PG.COLORS.accent });
    });
    return h;
  },

  /* Wrap a sentence to roughly `n` characters without breaking a word. The canvas has no text
     layout of its own, and a caption that runs off its panel is the commonest way a lesson
     like this looks broken. Lives here because three lessons need it. */
  wrap(str, n) {
    const words = String(str).split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      if (cur && (cur.length + 1 + word.length) > n) { lines.push(cur); cur = word; }
      else cur = cur ? `${cur} ${word}` : word;
    }
    if (cur) lines.push(cur);
    return lines;
  },

  /* A keyword-pairing badge. The owner chose language-neutral pseudocode, and the cost of
     that choice is that `switch` and `do-while` never appear on screen. This puts the real
     keyword beside the pseudocode shape so the concept stays language-free and the child
     still recognises the word later. Used by the conditionals and loops lessons. */
  realName(ctx, { x, y, pseudo, real }) {
    // Compact on purpose: the long "... in most languages" form made two badges on one row
    // overlap by 35px. The row's own caption carries that phrase once instead.
    const label = `${pseudo}  →  ${real}`;
    ctx.save();
    ctx.font = `13px ${PG.MONO}`;
    const w = ctx.measureText(label).width + 20;
    ctx.fillStyle = '#fff3cd';
    PG.roundRect(ctx, x, y - 12, w, 24, 6);
    ctx.fill();
    ctx.restore();
    PG.text(ctx, label, x + 10, y, { size: 13, mono: true, align: 'left', color: '#664d03' });
  },

  // Hit test, shared by every lesson that drags. Kept here so three lessons cannot disagree.
  inside(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  },

  /* Colour one line of pseudocode for `codeLine`. A tokeniser, not a parser: split on spaces
     and colour the words we know. Every listing in this topic is ours, so there is no
     untrusted input — and it lives HERE, loaded first, because three lessons need it and a
     copy per lesson would let one keyword list drift away from the others. */
  tokens(label) {
    const KEY = ['SET', 'TO', 'SHOW', 'IF', 'THEN', 'ELSE', 'CHOOSE', 'WHEN', 'OTHERWISE',
      'REPEAT', 'UNTIL', 'WITH', 'FROM', 'TIMES', 'ADD'];
    const out = [];
    for (const part of label.split(/(\s+)/)) {
      if (!part.trim()) { out.push({ t: part }); continue; }
      if (KEY.includes(part)) out.push({ t: part, c: 'codeKey', b: true });
      else if (/^"/.test(part)) out.push({ t: part, c: 'codeStr' });
      else if (/^-?\d+(\.\d+)?$/.test(part)) out.push({ t: part, c: 'codeNum' });
      else out.push({ t: part });
    }
    return out;
  },
};
