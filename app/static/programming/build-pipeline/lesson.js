/* Lesson 4 — How Code Is Built. CLASSIC script; see common/draw.js.

   Teaching shape: the code a person writes is NOT what the machine runs. Four separate tools
   each do one job, in order, and the thing being carried changes shape at every arrow:

     source .c  --preprocessor-->  one big expanded file
                --compiler------->  object code (machine code with holes)
                --linker--------->  executable (holes filled in)
                --run----------->  the program

   A DELIBERATE DIVERGENCE, FLAGGED HERE RATHER THAN HIDDEN. The owner chose language-neutral
   pseudocode for this topic, and lessons 1-3 honour that. This lesson cannot: `#include` IS
   the preprocessor's input, an object file IS what a compiler emits, and an unresolved symbol
   IS what a linker complains about. Pseudocode has no preprocessor, no object files and no
   linker, so a pseudocode version of this lesson would have to invent a toolchain that exists
   nowhere — which is the opposite of teaching. The owner's own subtopic named "programming
   language -> pre-processor -> compiler -> linker -> machine code", which is the C/C++ build
   verbatim, so real C is shown HERE and only here. The pipeline is introduced on screen as
   "this is C, one real language" so the child is not left thinking pseudocode compiles.

   THE FAULT CONTROL IS NOT A TEST. Nothing is scored. Choosing a fault is how a child sees
   that the stages are different jobs: a missing header dies in the preprocessor, a typo dies
   in the compiler, and a function that was declared but never written gets all the way to the
   linker before anything complains. That last one is the most useful thing here — it is why
   "it compiled" and "it built" are not the same sentence.

   `pipeline()` is static and pure: given the inputs it returns every stage with its state and
   its message. The drawing and the caption both read that one result. */

class BuildPipelineLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.library = false;
    this.fault = 'none';
    this.reset();
  }

  // The five things on screen. 'run' is a stage too: a child should see that building and
  // running are separate events, and that the executable outlives the build.
  static get STAGES() {
    return [
      { key: 'source', label: 'Source code', tool: 'you write it', ext: '.c' },
      { key: 'pre', label: 'Preprocessor', tool: 'pastes in #include', ext: '.i' },
      { key: 'compile', label: 'Compiler', tool: 'turns it into object code', ext: '.o' },
      { key: 'link', label: 'Linker', tool: 'joins the pieces up', ext: '' },
      { key: 'run', label: 'Executable', tool: 'the machine runs it', ext: '' },
    ];
  }

  /* Which stage a fault stops at. This mapping IS the lesson, so it is data rather than
     scattered conditionals: the child picks a fault and watches the pipeline halt at the one
     tool whose job that fault belongs to. */
  static get FAULTS() {
    return {
      none: { stopAt: null },
      header: {
        stopAt: 'pre',
        symbol: 'stdio.h',
        msg: 'fatal error: stdio.h: No such file or directory',
        why: 'The preprocessor is the tool that pastes #include files in. It cannot find this one, so it never produces a file for the compiler.',
      },
      syntax: {
        stopAt: 'compile',
        symbol: 'printf',
        msg: "error: expected ';' before '}' token",
        why: 'The preprocessor does not read your code as code — it only pastes text. The COMPILER is the first tool that checks grammar, so a typo surfaces here.',
      },
      missing: {
        stopAt: 'link',
        symbol: 'bonus_points',
        msg: 'undefined reference to `bonus_points\'',
        why: 'This one COMPILED. The compiler trusted that bonus_points exists somewhere and left a hole. The LINKER is what fills holes, and there is nothing to fill it with — which is why "it compiled" does not mean "it built".',
      },
    };
  }

  /* Pure. `upto` is how many stages the child has stepped through. Returns each stage's state
     plus the failure, if any — no canvas, no clock. */
  static pipeline({ library, fault, upto }) {
    const stages = BuildPipelineLesson.STAGES;
    const f = BuildPipelineLesson.FAULTS[fault] || BuildPipelineLesson.FAULTS.none;
    const stopIndex = f.stopAt ? stages.findIndex((s) => s.key === f.stopAt) : -1;
    const out = stages.map((s, i) => {
      let state = 'pending';
      if (stopIndex >= 0 && i === stopIndex && upto > i) state = 'failed';
      else if (stopIndex >= 0 && i > stopIndex) state = 'pending';
      else if (upto > i + 1) state = 'done';
      else if (upto === i + 1) state = 'active';
      return { ...s, state };
    });
    const halted = stopIndex >= 0 && upto > stopIndex;
    const reached = halted ? stopIndex + 1 : Math.min(upto, stages.length);
    return {
      stages: out, halted, stopIndex, fault: f, reached, total: stages.length,
      // The linker has two inputs only when a library is in play; that is what makes its job
      // visible rather than a box that passes one file through unchanged.
      linkInputs: library ? ['main.o', 'libm.a'] : ['main.o'],
    };
  }

  reset() {
    this.upto = 0;
    this.draw();
  }

  get state() {
    return BuildPipelineLesson.pipeline({ library: this.library, fault: this.fault, upto: this.upto });
  }

  step() {
    const st = this.state;
    // A halted build does not continue — stepping again starts the build over, which is what
    // a person actually does after a build error.
    const end = st.halted ? st.stopIndex + 1 : BuildPipelineLesson.STAGES.length;
    this.upto = this.upto >= end ? 0 : this.upto + 1;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'library') this.library = !!value;
    else if (key === 'fault') this.fault = value;
    this.upto = 0;        // a different build is a different build; start it from the top
    this.draw();
  }

  getInput(key) {
    if (key === 'library') return this.library;
    if (key === 'fault') return this.fault;
    return null;
  }

  activeInputs() { return ['library', 'fault']; }

  // What the artefact looks like at each stage. Short, real, and different every time — the
  // whole point is that the thing being carried CHANGES.
  /* What the artefact looks like at each stage. Short, real, and different every time — the
     whole point is that the thing being carried CHANGES.

     IT MUST SHOW THE FAULT. Two defects the owner found by looking: choosing "Typo" showed
     clean source and then a compiler error out of nowhere, and choosing "Function never
     written" produced `undefined reference to bonus_points` when nothing on screen mentioned
     bonus_points. A stage that reports an error the source cannot explain teaches the child
     that build errors are arbitrary, which is the opposite of this lesson. The fault is now
     visible in the source, carried through the preprocessor (which only moves text, so a typo
     survives it), and named in the object code's hole. */
  artefact(stage) {
    const lib = this.library;
    const f = this.fault;
    const call = lib ? 'printf("%f", sqrt(9.0));' : 'printf("hello");';

    if (stage === 'source') {
      const lines = [];
      lines.push(f === 'header' ? '#include <stdio.h>   <- cannot be found'
        : (lib ? '#include <math.h>' : '#include <stdio.h>'));
      // Declared but never defined: exactly what makes a LINKER error rather than a compiler one.
      if (f === 'missing') lines.push('int bonus_points(void);   <- declared, never written');
      lines.push('int main(void) {');
      if (f === 'missing') lines.push('  printf("%d", bonus_points());');
      else if (f === 'syntax') lines.push(`  ${call.replace(/;$/, '')}   <- no semicolon`);
      else lines.push(`  ${call}`);
      lines.push('  return 0;');
      lines.push('}');
      return lines;
    }

    if (stage === 'pre') {
      const lines = ['/* 700+ lines pasted in */', 'extern int printf(const char*, ...);'];
      if (lib) lines.push('extern double sqrt(double);');
      if (f === 'missing') lines.push('extern int bonus_points(void);');
      lines.push('int main(void) {');
      // The typo is STILL HERE: the preprocessor moves text, it does not read code.
      if (f === 'syntax') lines.push(`  ${call.replace(/;$/, '')}   <- typo still here`);
      else if (f === 'missing') lines.push('  printf("%d", bonus_points());');
      else lines.push(`  ${call}`);
      lines.push('}');
      return lines;
    }

    if (stage === 'compile') {
      return ['main.o  (object code)', '',
        '55 48 89 e5 48 8d 3d', '00 00 00 00 e8 ??  <- hole', '',
        f === 'missing' ? 'bonus_points: not here yet' : 'printf: not here yet'];
    }

    if (stage === 'link') {
      return [lib ? 'a.out  (main.o + libm.a)' : 'a.out  (main.o + libc)', '',
        '55 48 89 e5 48 8d 3d', '00 00 00 00 e8 4c 20', '', 'every hole filled'];
    }

    return [lib ? '3.000000' : 'hello', '', '(the program ran)'];
  }

  draw() {
    const ctx = this.ctx;
    const { w } = PG.clear(ctx);
    const st = this.state;

    PG.text(ctx, 'How code is built', w / 2, 30, { size: 26, bold: true });
    PG.text(ctx, 'What you write is not what the machine runs. Four tools, each with one job, in this order.',
      w / 2, 56, { size: 15, color: PG.COLORS.muted });

    // ---- the pipeline ------------------------------------------------------------------
    const boxW = 158;
    const boxH = 78;
    const gap = 24;
    const y = 96;
    const x0 = (w - (boxW * 5 + gap * 4)) / 2;
    st.stages.forEach((s, i) => {
      const x = x0 + i * (boxW + gap);
      PG.stage(ctx, { x, y, w: boxW, h: boxH, label: s.label, sub: s.tool, state: s.state });
      if (s.ext) {
        PG.text(ctx, s.ext, x + boxW - 8, y + 12,
          { size: 12, mono: true, align: 'right', color: PG.COLORS.muted });
      }
      if (i < st.stages.length - 1) {
        const ax = x + boxW + 4;
        const ay = y + boxH / 2;
        const live = s.state === 'done';
        PG.arrow(ctx, ax, ay, ax + gap - 8, ay,
          { color: live ? PG.COLORS.live : PG.COLORS.faint });
        if (st.stages[i + 1].state === 'active') {
          PG.travel(ctx, ax, ay, ax + gap - 8, ay, this.phase);
        }
      }
    });

    /* The library joining at the linker. Drawn as a second arrow INTO the linker from below,
       because "the linker has more than one input" is the only reason that stage exists. */
    const linkX = x0 + 3 * (boxW + gap);
    if (this.library) {
      PG.stage(ctx, { x: linkX - 40, y: 208, w: 150, h: 46, label: 'libm.a', sub: 'a library', state: st.reached > 3 ? 'done' : 'pending' });
      PG.arrow(ctx, linkX + 35, 206, linkX + boxW / 2, y + boxH + 6,
        { color: st.reached > 3 ? PG.COLORS.live : PG.COLORS.faint });
      PG.text(ctx, 'code someone else already wrote', linkX + 35, 268,
        { size: 12, color: PG.COLORS.muted });
    }

    // ---- what the thing looks like right now -------------------------------------------
    const stageNow = st.reached > 0 ? st.stages[st.reached - 1] : null;
    PG.panel(ctx, { x: 40, y: 300, w: 470, h: 180,
      title: stageNow ? `AFTER: ${stageNow.label.toUpperCase()}` : 'NOTHING HAS RUN YET' });
    if (!stageNow) {
      PG.text(ctx, 'Press "Next stage" to start the build.', 275, 390,
        { size: 15, color: PG.COLORS.faint });
    } else {
      this.artefact(stageNow.key).forEach((ln, i) => {
        PG.text(ctx, ln, 56, 334 + i * 22,
          { size: 13, mono: true, align: 'left',
            color: ln.includes('hole') ? PG.COLORS.warn : PG.COLORS.text });
      });
    }

    // ---- the stage's job, or its error --------------------------------------------------
    PG.panel(ctx, { x: 526, y: 300, w: 394, h: 180,
      title: st.halted ? 'THE BUILD STOPPED HERE' : 'WHAT THIS TOOL DOES' });
    if (st.halted) {
      PG.text(ctx, st.fault.msg, 542, 336,
        { size: 13, mono: true, align: 'left', color: PG.COLORS.danger });
      PG.wrap(st.fault.why, 46).forEach((ln, i) => {
        PG.text(ctx, ln, 542, 366 + i * 21, { size: 13, align: 'left' });
      });
    } else if (stageNow) {
      const jobs = {
        source: 'This is C — one real language. You typed this. The machine cannot run a single line of it yet.',
        pre: 'Pastes every #include file in and resolves the # lines. It does NOT check your grammar — it only moves text.',
        compile: 'Turns the expanded text into machine code for one file. Where you call something it does not have, it leaves a hole.',
        link: 'Joins the object files and libraries together and fills in every hole. The result can finally be run.',
        run: 'The operating system loads the executable and the CPU runs the machine code.',
      };
      PG.wrap(jobs[stageNow.key], 46).forEach((ln, i) => {
        PG.text(ctx, ln, 542, 340 + i * 22, { size: 14, align: 'left' });
      });
    } else {
      PG.text(ctx, 'Each tool hands its output to the next one.', 542, 340,
        { size: 14, align: 'left', color: PG.COLORS.muted });
    }

    // ---- caption -----------------------------------------------------------------------
    let msg = 'Press "Next stage" to follow one file all the way to a running program.';
    let color = PG.COLORS.accent;
    if (st.halted) {
      msg = `The ${st.stages[st.stopIndex].label.toLowerCase()} stopped the build — nothing after it ever ran.`;
      color = PG.COLORS.danger;
    } else if (st.reached === st.total) {
      msg = 'Built and run. Four separate tools, each one handing its work to the next.';
      color = PG.COLORS.live;
    } else if (stageNow) {
      msg = `${stageNow.label}: ${stageNow.tool}.`;
    }
    PG.caption(ctx, { x: 40, y: 496, w: 880, text: msg, color });
  }

  start() {
    if (this.raf) return;
    const tick = () => {
      this.phase += 0.03;
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
