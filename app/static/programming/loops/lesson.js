/* Lesson 3 — Loops. CLASSIC script; see common/draw.js.

   Teaching shape: a loop repeats work, and the interesting question is always "how does it
   know when to stop?". Two shapes answer it differently, and the difference is the lesson:

     COUNTING   checks BEFORE each pass, so a limit already reached runs the body ZERO times.
     REPEAT-UNTIL checks AFTER each pass, so the body always runs at least ONCE.

   That one-pass difference is the classic for-vs-do-while confusion, and it is visible here:
   set the counting loop's limit so the test fails immediately and the output stays empty,
   while repeat-until still prints a line. The caption says which check just happened.

   The owner chose language-neutral pseudocode, which has no `do`/`while`, so `PG.realName`
   names the real keywords beside each shape.

   `trace()` is static and pure: it returns the whole execution as a list of passes. The
   animation, the counters and the build-mode goal check all read that one trace, so the
   iteration count on screen and the output beside it cannot disagree. */

class LoopsLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.mode = 'watch';
    this.kind = 'count';
    this.limit = 4;
    this.pick = null;
    this.drag = null;
    this.reset();
    this.bindPointer();
  }

  /* BOTH SHAPES HAVE A BUILD TASK, and they are different tasks.

     The first version only offered one for the counting loop and told the child to "switch to
     Counting" when the shape was repeat-until — so selecting the other shape in build mode
     showed no task at all. A repeat-until does have a condition to write: it is the UNTIL line
     at the bottom. Keyed separately (`t*`/`i*`) from the counting ids so a block dropped for
     one shape can never be read as a condition for the other. */
  static blocksFor(kind) {
    return kind === 'until'
      ? [
        /* All four are about `total`, because that is what this loop's UNTIL line tests.
           `i >= limit` was offered here and was wrong to be: the pass counter belongs to the
           counting shape, so it read as a block from the other lesson. `total < limit` replaces
           it — the inverted-logic mistake, which stops after a single pass. */
        { id: 'tge', label: 'total >= limit' },
        { id: 'tgt', label: 'total > limit' },
        { id: 'teq', label: 'total = limit' },
        { id: 'tlt', label: 'total < limit' },
      ]
      : [
        { id: 'lt', label: 'i < limit' },
        { id: 'le', label: 'i <= limit' },
        { id: 'gt', label: 'i > limit' },
        { id: 'eq', label: 'i = limit' },
      ];
  }

  static goalFor(kind, limit) {
    return kind === 'until'
      ? { text: `Goal: keep adding 2 and stop as soon as total reaches ${limit}.`, correct: 'tge' }
      : { text: `Goal: add up every number from 1 to ${limit}. The body must run exactly ${limit} times.`, correct: 'le' };
  }

  // The dropped condition, applied to the loop's current state. Shape-aware.
  static cond(kind, pick, st) {
    const { i, total, limit } = st;
    if (kind === 'until') {
      if (pick === 'tge') return total >= limit;
      if (pick === 'tgt') return total > limit;
      if (pick === 'teq') return total === limit;
      if (pick === 'tlt') return total < limit;
      return null;
    }
    if (pick === 'lt') return i < limit;
    if (pick === 'le') return i <= limit;
    if (pick === 'gt') return i > limit;
    if (pick === 'eq') return i === limit;
    return null;
  }

  /* Pure. Returns every pass the loop makes, each recording the test that allowed (or ended)
     it. Capped at 50 passes: `i > limit` as a counting condition never becomes false, and a
     lesson must not hang the page because a child dragged in the wrong block. The cap is a
     SAFETY net, and `runaway` is reported so the lesson can say what happened rather than
     silently truncate — "your condition never becomes false" is the most useful thing a loop
     lesson can tell a child. */
  static trace(kind, limit, pick) {
    const MAX = 50;
    const passes = [];
    let total = 0;
    let runaway = false;
    if (kind === 'count') {
      let i = 1;
      for (;;) {
        const ok = pick ? LoopsLesson.cond('count', pick, { i, total, limit }) : i <= limit;
        if (!ok) { passes.push({ i, test: false, checkedBefore: true }); break; }
        if (passes.filter((p) => p.test).length >= MAX) { runaway = true; break; }
        total += i;
        passes.push({ i, test: true, checkedBefore: true, total });
        i += 1;
      }
    } else {
      // REPEAT ... UNTIL: body first, test afterwards.
      let i = 1;
      for (;;) {
        total += 2;
        const done = pick
          ? LoopsLesson.cond('until', pick, { i, total, limit })
          : total >= limit;
        passes.push({ i, test: !done, checkedBefore: false, total, stopped: done });
        if (done) break;
        if (passes.length >= MAX) { runaway = true; break; }
        i += 1;
      }
    }
    return { passes, total, runaway };
  }

  reset() {
    this.shown = 0;        // how many passes the child has stepped through
    this.drag = null;
    this.draw();
  }

  /* WATCH MODE IGNORES THE DROPPED BLOCK. "Watch it run" means watching a finished loop, so
     the condition is the written one; only BUILD mode leaves the hole for the child. Without
     this the two modes showed an identical listing and the owner could not tell them apart —
     the same fix Variables needed for its line 4. */
  get effectivePick() { return this.mode === 'build' ? this.pick : null; }

  get full() { return LoopsLesson.trace(this.kind, this.limit, this.effectivePick); }

  step() {
    const t = this.full;
    this.shown = this.shown >= t.passes.length ? 0 : this.shown + 1;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'mode') this.mode = value;
    else if (key === 'kind') {
      this.kind = value;
      // The shapes have different palettes; a block dropped for one means nothing in the other.
      this.pick = null;
    } else if (key === 'limit') this.limit = Number(value);
    this.shown = 0;        // any change re-runs the loop from the top
    this.draw();
  }

  getInput(key) {
    if (key === 'mode') return this.mode;
    if (key === 'kind') return this.kind;
    if (key === 'limit') return this.limit;
    return null;
  }

  /* Build mode only offers a condition for the COUNTING loop — that is where the condition is
     written by hand. Switching to repeat-until in build mode would present a slot with nothing
     sensible to drop into it, so the shape control stays and the mode quietly has nothing to
     build; the panel says so rather than showing an empty slot. */
  activeInputs() { return ['mode', 'kind', 'limit']; }

  // ---- drag and drop (build mode) ----------------------------------------------------------

  paletteLayout() {
    return LoopsLesson.blocksFor(this.kind).map((b, i) => ({ ...b, x: 70 + i * 200, y: 556, w: 180, h: 32 }));
  }

  slotRect() { return { x: 360, y: 500, w: 180, h: 32 }; }

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
    /* Only the mode gates dragging. `&& this.kind === 'count'` was left here from when the
       counting loop was the only shape with a build task; once repeat-until got one, this line
       silently made its palette undraggable while still drawing it. */
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
    this.drag.x = x; this.drag.y = y;
    this.draw();
  }

  onUp({ x, y }) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    if (PG.inside(this.slotRect(), x, y)) { this.pick = drag.id; this.shown = 0; }
    this.draw();
  }

  /* Goal: add up 1..limit, so the body must run exactly `limit` times. Checked at two limits
     through the SAME trace the animation uses — `i <= limit` passes, `i < limit` is one pass
     short, and `i > limit` runs away into the cap. */
  get goalMet() {
    if (!this.pick) return false;
    if (this.kind === 'until') {
      /* Stop AS SOON AS total reaches the limit. THREE probes, and the odd one is essential:
         total climbs in twos, so `total = limit` lands exactly on every EVEN limit and passed
         a two-even-probe check. At limit 7 it never matches and runs away, which is what
         distinguishes it from `total >= limit`. */
      const a = LoopsLesson.trace('until', 10, this.pick);
      const b = LoopsLesson.trace('until', 8, this.pick);
      const c = LoopsLesson.trace('until', 7, this.pick);
      return !a.runaway && !b.runaway && !c.runaway
        && a.total === 10 && b.total === 8 && c.total === 8;
    }
    const a = LoopsLesson.trace('count', 4, this.pick);
    const b = LoopsLesson.trace('count', 6, this.pick);
    return !a.runaway && !b.runaway && a.total === 10 && b.total === 21;
  }

  draw() {
    const ctx = this.ctx;
    const { w } = PG.clear(ctx);
    const build = this.mode === 'build';
    const count = this.kind === 'count';
    const t = this.full;
    const shown = t.passes.slice(0, this.shown);
    const last = shown.length ? shown[shown.length - 1] : null;
    const bodyDone = shown.filter((p) => p.test || p.stopped).length;
    const running = last && (last.test || last.stopped);

    PG.text(ctx, 'Loops', w / 2, 30, { size: 26, bold: true });
    PG.text(ctx, count
      ? 'A counting loop checks its condition BEFORE each pass — so it can run zero times.'
      : 'A repeat-until loop checks AFTER each pass — so the body always runs at least once.',
    w / 2, 56, { size: 15, color: PG.COLORS.muted });

    // ---- the program -------------------------------------------------------------------
    PG.panel(ctx, { x: 40, y: 80, w: 560, h: 230,
      title: build ? 'PROGRAM — one piece missing' : 'PROGRAM' });
    /* The hole is in the LISTING, which is what makes build mode visibly a different thing
       from watch mode rather than the same program with a widget under it. */
    const dropped = this.pick
      ? LoopsLesson.blocksFor(this.kind).find((b) => b.id === this.pick)
      : null;
    const written = count ? `i <= ${this.limit}` : `total >= ${this.limit}`;
    const condText = build
      ? (dropped ? dropped.label : '____________')
      : written;
    const listing = count
      ? [
        { t: 'SET total TO 0', ind: 0 },
        { t: 'SET i TO 1', ind: 0 },
        { t: `REPEAT WHILE ${condText}`, ind: 0, head: true },
        { t: 'SET total TO total + i', ind: 1, body: true },
        { t: 'SET i TO i + 1', ind: 1, body: true },
        { t: 'SHOW total', ind: 0, tail: true },
      ]
      : [
        { t: 'SET total TO 0', ind: 0 },
        { t: 'REPEAT', ind: 0, head: true },
        { t: 'SET total TO total + 2', ind: 1, body: true },
        { t: `UNTIL ${condText}`, ind: 0, test: true },
        { t: 'SHOW total', ind: 0, tail: true },
      ];
    listing.forEach((ln, i) => {
      let state = 'idle';
      if (running && ln.body) state = 'current';
      else if (last && !running && (ln.head || ln.test)) state = 'current';
      PG.codeLine(ctx, {
        x: 52, y: 116 + i * 30, w: 536, n: i + 1, indent: ln.ind,
        tokens: PG.tokens(ln.t), state,
      });
    });

    // ---- the counters ------------------------------------------------------------------
    PG.panel(ctx, { x: 620, y: 80, w: 300, h: 230, title: 'WHILE IT RUNS' });
    PG.varBox(ctx, {
      x: 648, y: 124, w: 118, h: 56, name: count ? 'i' : 'pass',
      value: last ? last.i : (count ? 1 : 0), live: !!running, type: 'number',
    });
    PG.varBox(ctx, {
      x: 786, y: 124, w: 110, h: 56, name: 'total',
      value: last && last.total !== undefined ? last.total : 0,
      live: !!running, type: 'number',
    });
    PG.text(ctx, `Body has run ${bodyDone} time${bodyDone === 1 ? '' : 's'}`,
      770, 212, { size: 15, bold: true, color: PG.COLORS.accent });
    PG.text(ctx, count
      ? `Condition: ${condText}`
      : `Stops when: ${condText}`,
    770, 240, { size: 13, mono: true, color: PG.COLORS.muted });
    PG.text(ctx, `Checks ${count ? 'before' : 'after'} the body`,
      770, 266, { size: 13, color: PG.COLORS.muted });

    // ---- output ------------------------------------------------------------------------
    const outLines = [];
    if (this.shown >= t.passes.length && t.passes.length && !t.runaway) outLines.push(String(t.total));
    PG.console(ctx, { x: 620, y: 324, w: 300, h: 96, lines: outLines });

    // ---- what just happened ------------------------------------------------------------
    let msg = 'Press "Next time round" to run the loop one pass at a time.';
    let color = PG.COLORS.accent;
    if (t.runaway) {
      msg = 'That condition never becomes false — the loop would run for ever.';
      color = PG.COLORS.danger;
    } else if (last && count && !last.test) {
      msg = bodyDone === 0
        ? `${condText} was false straight away, so the body ran ZERO times.`
        : `${condText} is now false, so the loop ends. The body ran ${bodyDone} times.`;
      color = bodyDone === 0 ? PG.COLORS.warn : PG.COLORS.live;
    } else if (last && count) {
      msg = `${condText} is true, so the body runs again. total is now ${last.total}.`;
    } else if (last && last.stopped) {
      msg = `total reached ${last.total}, so UNTIL is satisfied — the loop ends after ${bodyDone} passes.`;
      color = PG.COLORS.live;
    } else if (last) {
      msg = `The body ran (total is ${last.total}) and only THEN was the condition checked.`;
    }
    PG.caption(ctx, { x: 40, y: 324, w: 560, text: msg, color });

    // ---- bottom half -------------------------------------------------------------------
    if (build) {
      PG.panel(ctx, { x: 40, y: 442, w: 880, h: 168, title: 'BUILD IT YOURSELF' });
      /* y=480, not 468: PG.panel writes its title at y+17 = 459, and a 14px line centred at
         468 overlaps it. The label-overlap guard missed it because the two sit 9px apart and
         that test only compared text sharing a baseline — see the test for the widened rule. */
      const goal = LoopsLesson.goalFor(this.kind, this.limit);
      PG.text(ctx, goal.text, 56, 480, { size: 14, align: 'left' });
      // The lead-in follows the SHAPE: a counting loop writes its test at the top, a
      // repeat-until writes it at the bottom. Showing `REPEAT WHILE` for both would be a lie.
      PG.text(ctx, count ? 'REPEAT WHILE' : 'UNTIL', 346, 516,
        { size: 15, mono: true, bold: true, align: 'right', color: PG.COLORS.codeKey });
      const slot = this.slotRect();
      if (dropped) PG.block(ctx, { ...slot, label: dropped.label, fill: '#d1e7dd' });
      else PG.slot(ctx, { ...slot, label: 'drag a condition', hot: !!this.drag });
      for (const b of this.paletteLayout()) {
        PG.block(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: b.label });
      }
      if (this.pick) {
        const probe = LoopsLesson.trace(this.kind, this.limit, this.pick);
        let why;
        if (this.goalMet) {
          why = count
            ? `Correct — 1+2+...+${this.limit} with the body running ${this.limit} times.`
            : 'Correct — it stops on the first pass that reaches the limit, not after it.';
        } else if (probe.runaway) {
          why = 'That never stops: nothing it tests ever becomes false.';
        } else {
          why = `With a limit of ${this.limit} that gives total = ${probe.total}. Count the passes.`;
        }
        PG.text(ctx, why, 560, 540,
          { size: 14, align: 'left', color: this.goalMet ? PG.COLORS.live : PG.COLORS.warn });
      }
      if (this.drag) {
        PG.block(ctx, {
          x: this.drag.x - this.drag.w / 2, y: this.drag.y - this.drag.h / 2,
          w: this.drag.w, h: this.drag.h, label: this.drag.label, ghost: true,
        });
      }
    } else {
      PG.panel(ctx, { x: 40, y: 442, w: 880, h: 168, title: 'THE TWO SHAPES' });
      PG.realName(ctx, { x: 60, y: 476, pseudo: 'REPEAT WHILE', real: 'for / while' });
      PG.realName(ctx, { x: 400, y: 476, pseudo: 'REPEAT ... UNTIL', real: 'do ... while' });
      PG.text(ctx, 'the word after each arrow is what most real languages call it',
        60, 504, { size: 12, align: 'left', color: PG.COLORS.muted });
      const notes = [
        'Counting checks first — if the condition is already false the body runs ZERO times.',
        'Repeat-until checks last — so the body always runs AT LEAST ONCE, even when it should not.',
        'Every loop needs something that changes, or the condition never flips and it runs for ever.',
      ];
      notes.forEach((text, i) => {
        PG.text(ctx, '•', 60, 534 + i * 26, { size: 16, align: 'left', color: PG.COLORS.accent });
        PG.text(ctx, text, 78, 534 + i * 26, { size: 14, align: 'left' });
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
