/* Lesson 1 — Variables. CLASSIC script; see common/draw.js.

   Teaching shape: a variable is a labelled box, assignment REPLACES what is in the box, and
   reading a variable does not empty it. Those three facts are the whole lesson, and each one
   is something the child can watch happen rather than be told.

   The program is fixed; the child changes the NUMBERS with two sliders and re-runs it. That is
   the point of a variable and it is hard to say in words: the code did not change, the values
   did. A lesson where the child edits the code instead would teach editing, not variables.

   `run()` is a static pure interpreter with no canvas. The animation and the build-mode goal
   check both go through it, so what the child sees and what the lesson claims cannot disagree
   — the discipline Electrical Design's Design lesson established. */

class VariablesLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.mode = 'watch';
    this.startScore = 10;
    this.bonus = 5;
    this.pick = null;          // build mode: which block is in the slot
    this.drag = null;
    this.reset();
    this.bindPointer();
  }

  /* The program, as data. Each line declares what it DOES to memory, so the interpreter below
     stays a loop over this array instead of a switch over line numbers — and so the listing
     and the behaviour are generated from the same source.

     `expr` is only ever a tiny closure over the two slider values; there is no parser here
     because the child is not editing the code. */
  static program() {
    return [
      { kind: 'set', name: 'score', type: 'number', label: (s) => `SET score TO ${s.start}`,
        value: (s) => s.start },
      { kind: 'set', name: 'lives', type: 'number', label: () => 'SET lives TO 3', value: () => 3 },
      { kind: 'set', name: 'name', type: 'text', label: () => 'SET name TO "Ninja"',
        value: () => '"Ninja"' },
      /* The line that carries the lesson. In build mode its right-hand side is whatever the
         child dropped in, which is why `pick` reaches the interpreter rather than the drawing
         code: a wrong block must actually produce a wrong number in the box. */
      { kind: 'set', name: 'score', type: 'number',
        label: (s) => `SET score TO ${VariablesLesson.rhsText(s.pick, s.bonus)}`,
        value: (s) => VariablesLesson.rhs(s.pick, s.score, s.bonus), needsPick: true },
      { kind: 'set', name: 'lives', type: 'number', label: () => 'SET lives TO lives - 1',
        value: (s) => s.lives - 1 },
      { kind: 'show', label: () => 'SHOW score', read: 'score' },
      { kind: 'show', label: () => 'SHOW name', read: 'name' },
    ];
  }

  // The four blocks offered in build mode. `score + bonus` is the one that adds the bonus on
  // TOP of what the child already has; the others are the believable mistakes.
  static get BLOCKS() {
    return [
      { id: 'add', label: 'score + bonus' },
      { id: 'bonusonly', label: 'bonus' },
      { id: 'double', label: 'score + score' },
      { id: 'sub', label: 'score - bonus' },
    ];
  }

  static rhsText(pick, bonus) {
    if (!pick) return '____';
    return { add: 'score + bonus', bonusonly: 'bonus', double: 'score + score', sub: 'score - bonus' }[pick];
  }

  static rhs(pick, score, bonus) {
    if (pick === 'add') return score + bonus;
    if (pick === 'bonusonly') return bonus;
    if (pick === 'double') return score + score;
    if (pick === 'sub') return score - bonus;
    return null;      // nothing dropped yet: the line cannot run, and says so
  }

  /* Pure interpreter. Runs the first `upto` lines and returns the memory, the output and a
     record of what the last line changed — everything the drawing needs and nothing else.
     No canvas, no DOM, no clock. */
  static run({ start, bonus, pick, upto }) {
    const mem = {};
    const order = [];
    const out = [];
    let changed = null;
    let blocked = false;
    const lines = VariablesLesson.program();
    for (let i = 0; i < Math.min(upto, lines.length); i++) {
      const ln = lines[i];
      if (ln.kind === 'set') {
        if (ln.needsPick && !pick) { blocked = true; break; }
        const prev = Object.prototype.hasOwnProperty.call(mem, ln.name) ? mem[ln.name] : undefined;
        const v = ln.value({ start, bonus, pick, score: mem.score, lives: mem.lives });
        if (!order.includes(ln.name)) order.push(ln.name);
        mem[ln.name] = v;
        changed = { name: ln.name, was: prev, now: v, type: ln.type };
      } else if (ln.kind === 'show') {
        // Reading does not change the box — the output grows, memory does not.
        out.push(String(mem[ln.read]));
        changed = { read: ln.read };
      }
    }
    return { mem, order, out, changed, blocked, total: lines.length };
  }

  reset() {
    this.pc = 0;              // how many lines have run; the output is derived, not stored
    this.drag = null;
    this.draw();
  }

  /* In WATCH mode line 4 is already written — `score + bonus` — because "watch it run" means
     watching a finished program. Only BUILD mode leaves the right-hand side empty for the child
     to fill. Without this the watch-mode program halted at line 3 for ever and printed nothing,
     while the caption asked for a block from a palette that is not on screen in watch mode. */
  get effectivePick() { return this.mode === 'build' ? this.pick : 'add'; }

  get state() {
    return VariablesLesson.run({
      start: this.startScore, bonus: this.bonus, pick: this.effectivePick, upto: this.pc,
    });
  }

  step() {
    const lines = VariablesLesson.program();
    this.pc = this.pc >= lines.length ? 0 : this.pc + 1;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'mode') {
      this.mode = value;
      // Switching mode restarts the run: the program's 4th line differs between modes, so a
      // half-finished run would show memory that the visible code could not have produced.
      this.pc = 0;
    } else if (key === 'startScore') this.startScore = Number(value);
    else if (key === 'bonus') this.bonus = Number(value);
    // Changing a number re-runs from the top; that IS the demonstration.
    if (key === 'startScore' || key === 'bonus') this.pc = 0;
    this.draw();
  }

  getInput(key) {
    if (key === 'mode') return this.mode;
    if (key === 'startScore') return this.startScore;
    if (key === 'bonus') return this.bonus;
    return null;
  }

  // All three apply in both modes: the sliders are what make a variable's point either way.
  activeInputs() { return ['mode', 'startScore', 'bonus']; }

  // ---- drag and drop (build mode) ----------------------------------------------------------

  /* Palette and slot are drawn on this lesson's own canvas and driven by pointer events,
     exactly as Electrical Design's Design lesson does it: the player hands a lesson one
     canvas and no DOM of its own. */
  paletteLayout() {
    return VariablesLesson.BLOCKS.map((b, i) => ({
      ...b, x: 60 + i * 190, y: 558, w: 170, h: 32,
    }));
  }

  slotRect() { return { x: 430, y: 494, w: 190, h: 32 }; }

  toCanvas(e) {
    const r = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    if (!r || !r.width) return { x: e.clientX || 0, y: e.clientY || 0 };
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height),
    };
  }

  bindPointer() {
    // Guarded: the test drives the lesson against a canvas stub with no event target.
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(this.toCanvas(e)));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(this.toCanvas(e)));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(this.toCanvas(e)));
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
  }

  onDown({ x, y }) {
    if (this.mode !== 'build') return;
    for (const b of this.paletteLayout()) {
      if (PG.inside(b, x, y)) {
        this.drag = { id: b.id, label: b.label, w: b.w, h: b.h, x, y };
        this.draw();
        return;
      }
    }
  }

  onMove({ x, y }) {
    if (!this.drag) return;
    this.drag.x = x;
    this.drag.y = y;
    this.draw();
  }

  onUp({ x, y }) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    if (PG.inside(this.slotRect(), x, y)) {
      this.pick = drag.id;
      this.pc = 0;        // a new right-hand side means the old run no longer applies
    }
    this.draw();
  }

  // Build mode's goal, checked through the SAME interpreter the animation uses.
  get goalMet() {
    if (!this.pick) return false;
    const a = VariablesLesson.run({ start: 10, bonus: 5, pick: this.pick, upto: 99 });
    const b = VariablesLesson.run({ start: 30, bonus: 2, pick: this.pick, upto: 99 });
    // "Add the bonus to the score you already have" must hold for more than one pair of
    // numbers, or `score + score` would pass whenever bonus happens to equal score.
    return a.mem.score === 15 && b.mem.score === 32;
  }

  draw() {
    const ctx = this.ctx;
    const { w } = PG.clear(ctx);
    const st = this.state;
    const lines = VariablesLesson.program();
    const build = this.mode === 'build';

    PG.text(ctx, 'Variables', w / 2, 30, { size: 26, bold: true });
    PG.text(ctx, 'A variable is a box with a label. Putting a new value in REPLACES the old one.',
      w / 2, 56, { size: 15, color: PG.COLORS.muted });

    // ---- the program -------------------------------------------------------------------
    PG.panel(ctx, { x: 40, y: 76, w: 540, h: 232,
      title: build ? 'PROGRAM — one piece missing' : 'PROGRAM' });
    lines.forEach((ln, i) => {
      const state = i === this.pc - 1 ? 'current' : 'idle';
      const label = ln.label({ start: this.startScore, bonus: this.bonus, pick: this.effectivePick });
      const toks = PG.tokens(label);
      PG.codeLine(ctx, { x: 52, y: 108 + i * 28, w: 516, n: i + 1, tokens: toks, state });
    });

    // ---- memory ------------------------------------------------------------------------
    PG.panel(ctx, { x: 600, y: 76, w: 320, h: 232, title: 'MEMORY' });
    const names = st.order;
    if (!names.length) {
      PG.text(ctx, 'no variables yet', 760, 192, { size: 15, color: PG.COLORS.faint });
    }
    names.forEach((name, i) => {
      const live = !!(st.changed && st.changed.name === name);
      const reading = !!(st.changed && st.changed.read === name);
      PG.varBox(ctx, {
        x: 632 + (i % 2) * 150, y: 108 + Math.floor(i / 2) * 74,
        name, value: st.mem[name],
        was: live && st.changed.was !== undefined ? st.changed.was : null,
        live: live || reading,
        type: typeof st.mem[name] === 'string' ? 'text' : 'number',
      });
    });

    // ---- output ------------------------------------------------------------------------
    /* h = 98 gives three visible rows (32px of chrome plus 3 x 22), and 318 + 98 = 416 clears
       the bottom panel at 424. The first version was y=344 h=120, ending at 464 — 54px UNDER
       the panel drawn after it, so `SHOW name` was painted over. The owner found it by looking;
       the layout test added with this fix fails on any repeat. */
    PG.console(ctx, { x: 600, y: 318, w: 320, h: 98, lines: st.out });

    // ---- what just happened ------------------------------------------------------------
    let msg = 'Press "Run next line" to start.';
    let color = PG.COLORS.accent;
    if (st.blocked) {
      msg = 'Line 4 has an empty space — drag a block into it first.';
      color = PG.COLORS.warn;
    } else if (this.pc > 0 && st.changed) {
      if (st.changed.read) {
        msg = `SHOW reads ${st.changed.read} — the box still holds its value.`;
      } else if (st.changed.was === undefined) {
        msg = `A new box called ${st.changed.name} is created, holding ${st.changed.now}.`;
      } else {
        msg = `${st.changed.name} was ${st.changed.was}, and is now ${st.changed.now}. The old value is gone.`;
      }
    }
    PG.caption(ctx, { x: 40, y: 318, w: 540, text: msg, color });

    // ---- build mode --------------------------------------------------------------------
    if (build) {
      PG.panel(ctx, { x: 40, y: 424, w: 880, h: 186, title: 'BUILD IT YOURSELF' });
      /* y=466, not 450: PG.panel writes its title at y+17 = 441, and a 14px line at 450
         overlaps it by 4px. Same crowding the owner found in Conditionals and Loops. */
      PG.text(ctx, 'Goal: line 4 should add the bonus to the score you already have.',
        56, 466, { size: 14, align: 'left', color: PG.COLORS.text });
      PG.text(ctx, 'SET score TO', 320, 510, { size: 15, mono: true, align: 'right' });
      const slot = this.slotRect();
      const chosen = this.pick
        ? VariablesLesson.BLOCKS.find((b) => b.id === this.pick)
        : null;
      if (chosen) PG.block(ctx, { ...slot, label: chosen.label, fill: '#d1e7dd' });
      else PG.slot(ctx, { ...slot, label: 'drag a block here', hot: !!this.drag });
      for (const b of this.paletteLayout()) {
        PG.block(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: b.label });
      }
      if (this.pick) {
        PG.text(ctx, this.goalMet
          ? 'That is it — the bonus is added to whatever the score already was.'
          : 'Run it and watch line 4: that is not adding the bonus to the score.',
        480, 540, { size: 14, color: this.goalMet ? PG.COLORS.live : PG.COLORS.warn });
      }
      if (this.drag) {
        PG.block(ctx, {
          x: this.drag.x - this.drag.w / 2, y: this.drag.y - this.drag.h / 2,
          w: this.drag.w, h: this.drag.h, label: this.drag.label, ghost: true,
        });
      }
    } else {
      PG.panel(ctx, { x: 40, y: 424, w: 880, h: 186, title: 'THE THREE THINGS TO NOTICE' });
      const notes = [
        'A variable has a NAME, a VALUE, and a kind of thing it holds (a number, some text).',
        'SET replaces the value. The old one is not kept anywhere — look at line 4 and line 5.',
        'SHOW reads a variable. Reading it does not empty the box.',
        'Move the sliders and run it again: the CODE never changes, only the values do.',
      ];
      notes.forEach((n, i) => {
        PG.text(ctx, '•', 60, 458 + i * 32, { size: 16, align: 'left', color: PG.COLORS.accent });
        PG.text(ctx, n, 78, 458 + i * 32, { size: 15, align: 'left', color: PG.COLORS.text });
      });
    }
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
