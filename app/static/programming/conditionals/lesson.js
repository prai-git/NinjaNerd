/* Lesson 2 — Conditional Statements. CLASSIC script; see common/draw.js.

   Teaching shape: a program tests a condition and takes ONE path. Two things are easy to get
   wrong and both are shown rather than stated:

     - the branches are tested IN ORDER and the first true one wins. The child slides the
       temperature and watches earlier tests fail (dimmed) before one succeeds.
     - ELSE / OTHERWISE is not a test. It runs when nothing above it matched, which is why it
       has no condition to show.

   TWO SHAPES, ONE DECISION. `IF / ELSE` tests ranges; `CHOOSE / WHEN` matches exact values.
   The owner asked for if-else AND switch-case, and chose language-neutral pseudocode — which
   has neither keyword. So the shapes are taught as shapes, with `PG.realName` naming the real
   keyword beside each. The lesson's point is that CHOOSE reads better for exact values and IF
   reads better for ranges, which is also the honest answer to "when do I use which".

   `evaluate()` is static and pure: given a shape and a reading it returns which branch wins
   and why. The listing, the caption and the build-mode check all call it, so the highlighted
   line and the stated reason cannot drift apart. */

class ConditionalsLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.mode = 'watch';
    this.form = 'ifelse';
    this.temp = 24;
    this.level = 2;
    this.pick = null;
    this.drag = null;
    this.reset();
    this.bindPointer();
  }

  /* The IF chain, as data: an ordered list of tests. `test` is a predicate on the reading, so
     `evaluate` is a loop rather than a nest of ifs — and so the drawn condition text and the
     condition actually applied come from the same row. */
  static get IF_BRANCHES() {
    return [
      { cond: 'temperature > 30', test: (t) => t > 30, then: 'SHOW "fan on"', out: 'fan on' },
      { cond: 'temperature > 20', test: (t) => t > 20, then: 'SHOW "window open"', out: 'window open' },
      { cond: 'temperature > 10', test: (t) => t > 10, then: 'SHOW "just right"', out: 'just right' },
      { cond: null, test: () => true, then: 'SHOW "put a coat on"', out: 'put a coat on' },
    ];
  }

  // CHOOSE matches an exact value. Level 4 is deliberately absent so the child can land on
  // OTHERWISE and see that a value with no WHEN of its own falls through to it.
  static get WHEN_BRANCHES() {
    return [
      { cond: 'WHEN 1', test: (v) => v === 1, then: 'SHOW "slow"', out: 'slow' },
      { cond: 'WHEN 2', test: (v) => v === 2, then: 'SHOW "normal"', out: 'normal' },
      { cond: 'WHEN 3', test: (v) => v === 3, then: 'SHOW "fast"', out: 'fast' },
      { cond: null, test: () => true, then: 'SHOW "unknown level"', out: 'unknown level' },
    ];
  }

  /* Pure. Returns the index of the branch that runs, and the verdict of every test up to it,
     so the drawing can dim the ones that were tried and failed. `upto` limits how many tests
     have been performed yet, which is what the Step button advances. */
  static evaluate(form, reading, upto = 99) {
    const branches = form === 'choose'
      ? ConditionalsLesson.WHEN_BRANCHES
      : ConditionalsLesson.IF_BRANCHES;
    const verdicts = [];
    let taken = -1;
    for (let i = 0; i < branches.length; i++) {
      if (i >= upto) break;
      const ok = branches[i].test(reading);
      verdicts.push(ok);
      if (ok) { taken = i; break; }
    }
    return { branches, verdicts, taken };
  }

  /* BUILD MODE IS A DIFFERENT PROGRAM, not a widget bolted under the same one.

     The first version drew the four-branch chain in both modes and put an unrelated slot in
     the bottom panel, so watch and build showed the SAME program and the owner could not tell
     the modes apart — and the slot said `IF ... THEN fan on` even when the shape control was
     set to CHOOSE. Build mode now replaces the listing with a SHORT program that has a visible
     hole in it, which is what Variables already does with its line 4. Watch = a finished
     program you follow; Build = a program with a gap you close. */
  static blocksFor(form) {
    return form === 'choose'
      ? [
        { id: 'when1', label: 'WHEN 1' },
        { id: 'when2', label: 'WHEN 2' },
        { id: 'when3', label: 'WHEN 3' },
        { id: 'otherwise', label: 'OTHERWISE' },
      ]
      : [
        { id: 'gt30', label: 'temperature > 30' },
        { id: 'lt30', label: 'temperature < 30' },
        { id: 'gt10', label: 'temperature > 10' },
        { id: 'eq30', label: 'temperature = 30' },
      ];
  }

  // What the build task asks for, per shape. The goal and the check come from one place.
  static goalFor(form) {
    return form === 'choose'
      ? { text: 'Goal: show "fast" ONLY when the level is 3.', correct: 'when3' }
      : { text: 'Goal: turn the fan on ONLY when it is hotter than 30°C.', correct: 'gt30' };
  }

  /* The two-branch program build mode shows. `cond: null` is the hole: until a block is
     dropped the branch cannot be tested, which is why `taken` stays -1 and the console is
     empty — a program with a gap does not run. */
  static buildBranches(form, pick) {
    const picked = ConditionalsLesson.blocksFor(form).find((b) => b.id === pick) || null;
    return form === 'choose'
      ? [
        { cond: picked ? picked.label : null, then: 'SHOW "fast"', out: 'fast' },
        { cond: null, fallback: true, then: 'SHOW "not fast"', out: 'not fast' },
      ]
      : [
        { cond: picked ? picked.label : null, then: 'SHOW "fan on"', out: 'fan on' },
        { cond: null, fallback: true, then: 'SHOW "fan off"', out: 'fan off' },
      ];
  }

  /* Which branch of the BUILD program runs: 0 when the dropped condition holds, 1 when it
     does not, -1 while the hole is still empty. Pure, and the goal check below uses it, so
     the screen and the verdict cannot disagree. */
  static buildTaken(form, pick, reading) {
    if (!pick) return -1;
    return ConditionalsLesson.picked(form, pick, reading) ? 0 : 1;
  }

  reset() {
    this.tested = 0;      // how many branches have been tested
    this.drag = null;
    this.draw();
  }

  get reading() { return this.form === 'choose' ? this.level : this.temp; }

  step() {
    if (this.mode === 'build') {
      // The build program is two branches and its condition is either filled or not; one step
      // tests it, a second starts over.
      this.tested = this.tested >= 1 ? 0 : 1;
      this.draw();
      return;
    }
    const n = ConditionalsLesson.IF_BRANCHES.length;
    const ev = ConditionalsLesson.evaluate(this.form, this.reading, this.tested);
    // Once a branch has been taken the chain is finished; stepping again starts over.
    this.tested = (ev.taken >= 0 || this.tested >= n) ? 0 : this.tested + 1;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'mode') { this.mode = value; this.tested = 0; }
    else if (key === 'form') {
      this.form = value;
      this.tested = 0;
      // The two shapes have different palettes, so a block dropped for one is meaningless in
      // the other. Clearing it is what stops CHOOSE showing an IF condition in its hole.
      this.pick = null;
    }
    else if (key === 'temp') { this.temp = Number(value); this.tested = 0; }
    else if (key === 'level') { this.level = Number(value); this.tested = 0; }
    this.draw();
  }

  getInput(key) {
    if (key === 'mode') return this.mode;
    if (key === 'form') return this.form;
    if (key === 'temp') return this.temp;
    if (key === 'level') return this.level;
    return null;
  }

  /* The slider that matters depends on the shape: CHOOSE matches a level, IF tests a
     temperature. Showing both would invite the child to move the one that does nothing. */
  activeInputs() {
    return this.form === 'choose' ? ['mode', 'form', 'level'] : ['mode', 'form', 'temp'];
  }

  // ---- drag and drop (build mode) ----------------------------------------------------------

  paletteLayout() {
    return ConditionalsLesson.blocksFor(this.form).map((b, i) => ({
      ...b, x: 60 + i * 215, y: 556, w: 195, h: 32,
    }));
  }

  slotRect() { return { x: 300, y: 500, w: 215, h: 32 }; }

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
    if (PG.inside(this.slotRect(), x, y)) this.pick = drag.id;
    this.draw();
  }

  // The dropped condition, applied to a reading. Form-aware: CHOOSE matches an exact level,
  // IF tests a temperature range.
  static picked(form, pick, reading) {
    if (form === 'choose') {
      if (pick === 'when1') return reading === 1;
      if (pick === 'when2') return reading === 2;
      if (pick === 'when3') return reading === 3;
      if (pick === 'otherwise') return true;   // matches everything — which is the mistake
      return null;
    }
    if (pick === 'gt30') return reading > 30;
    if (pick === 'lt30') return reading < 30;
    if (pick === 'gt10') return reading > 10;
    if (pick === 'eq30') return reading === 30;
    return null;
  }

  /* Probed at three readings, because one probe cannot tell `> 30` from `> 10`, and cannot
     tell `WHEN 3` from `OTHERWISE` (which is true for every level). */
  get goalMet() {
    if (!this.pick) return false;
    const p = (r) => ConditionalsLesson.picked(this.form, this.pick, r);
    return this.form === 'choose'
      ? p(3) === true && p(1) === false && p(2) === false
      : p(35) === true && p(25) === false && p(5) === false;
  }

  draw() {
    const ctx = this.ctx;
    const { w } = PG.clear(ctx);
    const build = this.mode === 'build';
    const choose = this.form === 'choose';
    const ev = ConditionalsLesson.evaluate(this.form, this.reading, this.tested);

    PG.text(ctx, 'Conditional statements', w / 2, 30, { size: 26, bold: true });
    PG.text(ctx, 'The tests happen in order, top to bottom. The FIRST one that is true wins — and the rest never run.',
      w / 2, 56, { size: 15, color: PG.COLORS.muted });

    /* ---- the program -------------------------------------------------------------------
       Build mode draws a DIFFERENT, shorter program with a hole in it. That is the whole
       answer to "I cannot tell the two modes apart": watch follows a finished four-branch
       chain, build closes a gap in a two-branch one. */
    const bBranches = ConditionalsLesson.buildBranches(this.form, this.pick);
    const bTaken = build && this.tested >= 1
      ? ConditionalsLesson.buildTaken(this.form, this.pick, this.reading)
      : -1;

    PG.panel(ctx, { x: 40, y: 80, w: 560, h: 290,
      title: build ? 'PROGRAM — one piece missing' : 'PROGRAM' });
    let y = 116;
    let n = 1;
    if (choose) {
      PG.codeLine(ctx, { x: 52, y, w: 536, n: n++, tokens: [
        { t: 'CHOOSE ', c: 'codeKey', b: true }, { t: 'level' }] });
      y += 30;
    }

    if (build) {
      bBranches.forEach((br, i) => {
        const taken = bTaken === i;
        const tried = bTaken >= 0;
        const state = taken ? 'current' : (tried ? 'skipped' : 'idle');
        const toks = [];
        if (br.fallback) {
          toks.push({ t: choose ? 'OTHERWISE' : 'ELSE', c: 'codeKey', b: true });
        } else {
          if (!choose) toks.push({ t: 'IF ', c: 'codeKey', b: true });
          // The hole, drawn as the gap it is.
          toks.push(br.cond ? { t: br.cond, c: 'codeNum', b: true } : { t: '____________', c: 'warn', b: true });
          toks.push({ t: ' THEN', c: 'codeKey', b: true });
        }
        PG.codeLine(ctx, { x: 52, y, w: 536, n: n++, indent: choose ? 1 : 0, tokens: toks, state });
        y += 28;
        PG.codeLine(ctx, { x: 52, y, w: 536, n: n++, indent: choose ? 2 : 1,
          tokens: PG.tokens(br.then), state });
        y += 30;
      });
    } else {
      ev.branches.forEach((br, i) => {
        const tried = i < ev.verdicts.length;
        const taken = ev.taken === i;
        const state = taken ? 'current' : (tried ? 'skipped' : 'idle');
        const toks = [];
        if (choose) {
          toks.push({ t: br.cond ? `${br.cond}` : 'OTHERWISE', c: 'codeKey', b: true });
          toks.push({ t: ' THEN', c: 'codeKey', b: true });
        } else if (br.cond) {
          toks.push({ t: i === 0 ? 'IF ' : 'ELSE IF ', c: 'codeKey', b: true });
          toks.push({ t: br.cond });
          toks.push({ t: ' THEN', c: 'codeKey', b: true });
        } else {
          toks.push({ t: 'ELSE', c: 'codeKey', b: true });
        }
        PG.codeLine(ctx, { x: 52, y, w: 536, n: n++, indent: choose ? 1 : 0, tokens: toks, state });
        y += 28;
        PG.codeLine(ctx, {
          x: 52, y, w: 536, n: n++, indent: choose ? 2 : 1,
          tokens: PG.tokens(br.then), state,
        });
        y += 30;
      });
    }

    // ---- the reading and the verdicts --------------------------------------------------
    PG.panel(ctx, { x: 620, y: 80, w: 300, h: 198, title: 'WHAT THE PROGRAM SEES' });
    PG.varBox(ctx, {
      x: 672, y: 114, w: 196, h: 56,
      name: choose ? 'level' : 'temperature',
      value: choose ? this.level : `${this.temp}°C`,
      live: true, type: 'number',
    });
    const rows = build
      ? bBranches.map((br, i) => {
        const label = br.fallback ? (choose ? 'OTHERWISE' : 'ELSE') : (br.cond || 'your condition');
        if (!this.pick) return { label, verdict: 'empty', color: PG.COLORS.warn };
        if (bTaken < 0) return { label, verdict: '—', color: PG.COLORS.faint };
        if (br.fallback) return { label, verdict: bTaken === i ? 'runs' : 'skipped', color: bTaken === i ? PG.COLORS.live : PG.COLORS.faint };
        return bTaken === i
          ? { label, verdict: 'true', color: PG.COLORS.live }
          : { label, verdict: 'false', color: PG.COLORS.warn };
      })
      : ev.branches.map((br, i) => {
        const label = br.cond ? br.cond : (choose ? 'OTHERWISE' : 'ELSE');
        if (i >= ev.verdicts.length) return { label, verdict: '—', color: PG.COLORS.faint };
        if (!br.cond) return { label, verdict: 'runs', color: PG.COLORS.live };
        return ev.verdicts[i]
          ? { label, verdict: 'true', color: PG.COLORS.live }
          : { label, verdict: 'false', color: PG.COLORS.warn };
      });
    rows.forEach((r, i) => {
      PG.text(ctx, r.label, 648, 192 + i * 24, { size: 13, mono: true, align: 'left' });
      PG.text(ctx, r.verdict, 898, 192 + i * 24,
        { size: 13, mono: true, bold: true, align: 'right', color: r.color });
    });

    /* ---- output -----------------------------------------------------------------------
       The program's listing says SHOW on every branch, and until the owner looked there was
       nowhere on screen for it to print. Only the branch that was TAKEN prints — which is the
       lesson restated: the others never ran. */
    const out = build
      ? (bTaken >= 0 ? [bBranches[bTaken].out] : [])
      : (ev.taken >= 0 ? [ev.branches[ev.taken].out] : []);
    PG.console(ctx, { x: 620, y: 288, w: 300, h: 82, lines: out });

    // ---- what just happened ------------------------------------------------------------
    let msg;
    let color = PG.COLORS.accent;
    if (build) {
      if (!this.pick) {
        msg = 'The program has a gap. Drag a condition into it, then press Test next branch.';
        color = PG.COLORS.warn;
      } else if (bTaken < 0) {
        msg = 'Press "Test next branch" to run your condition against the current reading.';
      } else if (bTaken === 0) {
        msg = `${bBranches[0].cond} is true here, so the first branch runs.`;
        color = PG.COLORS.live;
      } else {
        msg = `${bBranches[0].cond} is false here, so the program falls through to the last branch.`;
        color = PG.COLORS.warn;
      }
    } else if (this.tested === 0) {
      msg = 'Press "Test next branch" to check the conditions one at a time.';
    } else if (ev.taken >= 0) {
      const br = ev.branches[ev.taken];
      msg = br.cond
        ? `${br.cond} is true, so this branch runs — and nothing below it is even tested.`
        : 'Nothing above matched, so the last branch runs. It has no condition of its own.';
      color = PG.COLORS.live;
    } else {
      const br = ev.branches[ev.verdicts.length - 1];
      msg = `${br.cond} is false, so the program moves on to the next test.`;
      color = PG.COLORS.warn;
    }
    /* y=374, not 384: the caption grows to 62px when its sentence wraps, and 384 + 62 = 446
       would have run into the panel at 442. No current message wraps, so the panel-overlap
       guard does not fire today — which is exactly why the headroom is taken now. */
    PG.caption(ctx, { x: 40, y: 374, w: 880, text: msg, color });

    // ---- bottom half -------------------------------------------------------------------
    if (build) {
      PG.panel(ctx, { x: 40, y: 442, w: 880, h: 168, title: 'BUILD IT YOURSELF' });
      /* y=480, not 468: PG.panel writes its title at y+17 = 459, and a 14px line centred at
         468 overlaps it. The label-overlap guard did not catch it because the two sit 9px
         apart and that test only compared text on roughly the same baseline — see the test. */
      const goal = ConditionalsLesson.goalFor(this.form);
      PG.text(ctx, goal.text, 56, 480, { size: 14, align: 'left' });
      const slot = this.slotRect();
      const chosen = this.pick
        ? ConditionalsLesson.blocksFor(this.form).find((b) => b.id === this.pick)
        : null;
      // The lead-in and the tail follow the SHAPE. The first version hardcoded `IF ... THEN
      // fan on`, so CHOOSE showed an IF statement it was not building.
      PG.text(ctx, choose ? 'CHOOSE level' : 'IF', 282, 516,
        { size: 15, mono: true, bold: true, align: 'right', color: PG.COLORS.codeKey });
      if (chosen) PG.block(ctx, { ...slot, label: chosen.label, fill: '#d1e7dd' });
      else PG.slot(ctx, { ...slot, label: 'drag a condition here', hot: !!this.drag });
      PG.text(ctx, choose ? 'THEN show "fast"' : 'THEN fan on', 530, 516,
        { size: 15, mono: true, align: 'left', color: PG.COLORS.codeKey });
      for (const b of this.paletteLayout()) {
        PG.block(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: b.label });
      }
      if (this.pick) {
        const ok = this.goalMet;
        const p = (r) => ConditionalsLesson.picked(this.form, this.pick, r);
        let why;
        if (ok) {
          why = choose
            ? 'Correct — true at level 3, false at 1 and 2.'
            : 'Correct — true at 35°C, false at 25°C and at 5°C.';
        } else if (choose) {
          why = `Not quite: that matches level 3 (${p(3)}) but also level 1 (${p(1)}).`;
        } else {
          why = `Not quite: at 25°C it is ${p(25)}, and at 35°C it is ${p(35)}.`;
        }
        PG.text(ctx, why, 56, 540,
          { size: 14, align: 'left', color: ok ? PG.COLORS.live : PG.COLORS.warn });
      }
      if (this.drag) {
        PG.block(ctx, {
          x: this.drag.x - this.drag.w / 2, y: this.drag.y - this.drag.h / 2,
          w: this.drag.w, h: this.drag.h, label: this.drag.label, ghost: true,
        });
      }
    } else {
      PG.panel(ctx, { x: 40, y: 442, w: 880, h: 168, title: 'THE TWO SHAPES' });
      PG.realName(ctx, { x: 60, y: 476, pseudo: 'IF / ELSE IF / ELSE', real: 'if / else if / else' });
      PG.realName(ctx, { x: 470, y: 476, pseudo: 'CHOOSE / WHEN', real: 'switch / case' });
      PG.text(ctx, 'the word after each arrow is what most real languages call it',
        60, 504, { size: 12, align: 'left', color: PG.COLORS.muted });
      const notes = [
        'IF suits RANGES — "hotter than 30", "between 10 and 20". Each branch asks its own question.',
        'CHOOSE suits EXACT VALUES — level 1, 2 or 3. One thing is compared against a list.',
        'Both stop at the first match, and both end with a catch-all that has no condition.',
      ];
      notes.forEach((t, i) => {
        PG.text(ctx, '•', 60, 534 + i * 26, { size: 16, align: 'left', color: PG.COLORS.accent });
        PG.text(ctx, t, 78, 534 + i * 26, { size: 14, align: 'left' });
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
