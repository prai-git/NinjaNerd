/* Lesson 1 — Control System (prompt 20). CLASSIC script; see common/draw.js.

   Teaching shape: input devices feed a CPU, the CPU decides, output devices act. The child
   presses an input and watches a single packet travel the whole path, so "the computer read
   the sensor and turned the fan on" becomes something seen rather than described.

   Step moves the packet ONE hop, which is the point of having a step control at all: the
   stages are separate, and at full speed they look like one instant. */

class ControlSystemLesson {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.phase = 0;
    this.reset();
  }

  // Where the packet is: which leg of input -> CPU -> output it is travelling.
  static get STAGES() { return ['idle', 'to-cpu', 'thinking', 'to-output', 'acting']; }

  reset() {
    this.button = 0;   // the input device the child controls
    this.sensor = 0;   // a second input, so the CPU has more than one thing to read
    this.stageIndex = 0;
    this.travel = 0;   // 0..1 along the current leg
    this.auto = true;  // packets flow on their own until Step is used
    this.draw();
  }

  // The CPU's rule, kept deliberately simple and stated on screen: act if EITHER input is on.
  get decision() { return (this.button || this.sensor) ? 1 : 0; }

  get stage() { return ControlSystemLesson.STAGES[this.stageIndex]; }

  step() {
    this.auto = false;
    this.stageIndex = (this.stageIndex + 1) % ControlSystemLesson.STAGES.length;
    this.travel = this.stage === 'to-cpu' || this.stage === 'to-output' ? 1 : 0;
    this.draw();
  }

  setInput(key, value) {
    if (key === 'button') this.button = value ? 1 : 0;
    else if (key === 'sensor') this.sensor = value ? 1 : 0;
    // Changing an input restarts the journey — that IS the causal story.
    this.stageIndex = this.decision ? 1 : 0;
    this.travel = 0;
    this.auto = true;
    this.draw();
  }

  getInput(key) {
    if (key === 'button') return this.button;
    if (key === 'sensor') return this.sensor;
    return null;
  }

  activeInputs() { return ['button', 'sensor']; }

  draw() {
    const ctx = this.ctx;
    const { w } = CL.clear(ctx);
    const act = this.decision;
    const reached = (name) =>
      ControlSystemLesson.STAGES.indexOf(this.stage) >= ControlSystemLesson.STAGES.indexOf(name);

    CL.text(ctx, 'A control system', w / 2, 32, { size: 26, bold: true });
    CL.text(ctx, 'Input devices tell the CPU what is happening. The CPU decides. Output devices act.',
      w / 2, 60, { size: 15, color: '#6c757d' });

    // ---- input devices -------------------------------------------------------------
    CL.box(ctx, { x: 60, y: 120, w: 170, h: 74, label: 'Button', sub: this.button ? 'pressed' : 'not pressed',
      fill: this.button ? '#d1e7dd' : CL.COLORS.body });
    CL.box(ctx, { x: 60, y: 226, w: 170, h: 74, label: 'Sensor', sub: this.sensor ? 'too hot' : 'cool',
      fill: this.sensor ? '#d1e7dd' : CL.COLORS.body });
    CL.text(ctx, 'INPUT DEVICES', 145, 104, { size: 13, bold: true, color: CL.COLORS.accent });

    // ---- CPU -----------------------------------------------------------------------
    const cpuX = 390; const cpuY = 152; const cpuW = 180; const cpuH = 120;
    const busy = this.stage === 'thinking';
    CL.box(ctx, { x: cpuX, y: cpuY, w: cpuW, h: cpuH, label: 'CPU',
      sub: busy ? 'deciding…' : 'if button OR sensor',
      fill: busy ? '#cfe2ff' : CL.COLORS.body, stroke: CL.COLORS.accent });
    CL.text(ctx, 'THE BRAIN', cpuX + cpuW / 2, 134, { size: 13, bold: true, color: CL.COLORS.accent });

    // ---- output device -------------------------------------------------------------
    const outOn = act && reached('acting');
    CL.box(ctx, { x: 720, y: 120, w: 180, h: 74, label: 'Screen',
      sub: outOn ? 'shows ALERT' : 'blank', fill: outOn ? '#fff3cd' : CL.COLORS.body });
    CL.box(ctx, { x: 720, y: 226, w: 180, h: 74, label: 'Fan',
      sub: outOn ? 'spinning' : 'stopped', fill: outOn ? '#fff3cd' : CL.COLORS.body });
    CL.text(ctx, 'OUTPUT DEVICES', 810, 104, { size: 13, bold: true, color: CL.COLORS.accent });

    // ---- wiring, with the packet on whichever leg it is on -------------------------
    const inLegs = [
      { pts: [[230, 157], [310, 157], [310, 190], [cpuX, 190]], live: this.button },
      { pts: [[230, 263], [310, 263], [310, 234], [cpuX, 234]], live: this.sensor },
    ];
    for (const leg of inLegs) {
      CL.wire(ctx, leg.pts, leg.live);
      if (leg.live && (this.stage === 'to-cpu' || this.auto)) CL.flow(ctx, leg.pts, 1, this.phase);
    }
    const outLegs = [
      [[cpuX + cpuW, 190], [650, 190], [650, 157], [720, 157]],
      [[cpuX + cpuW, 234], [650, 234], [650, 263], [720, 263]],
    ];
    const outLive = act && reached('to-output');
    for (const pts of outLegs) {
      CL.wire(ctx, pts, outLive);
      if (outLive) CL.flow(ctx, pts, 1, this.phase);
    }

    // ---- the stage read-out, so Step has something to point at ---------------------
    const labels = {
      idle: 'Waiting — no input is on.',
      'to-cpu': 'The input device sends its signal to the CPU.',
      thinking: 'The CPU checks its rule: is either input on?',
      'to-output': 'The CPU sends its decision to the output devices.',
      acting: 'The output devices act.',
    };
    CL.text(ctx, labels[this.stage], w / 2, 350, { size: 17, bold: true, color: CL.COLORS.accent });
    CL.text(ctx, 'Toggle an input to start the signal. Press Step to follow it one stage at a time.',
      w / 2, 392, { size: 15, color: '#6c757d' });
  }

  start() {
    if (this.raf) return;
    const tick = () => {
      this.phase += 0.02;
      // Left alone, the packet completes its journey on its own; Step takes manual control.
      if (this.auto && this.decision) {
        this.travel += 0.012;
        if (this.travel >= 1) {
          this.travel = 0;
          if (this.stageIndex < ControlSystemLesson.STAGES.length - 1) this.stageIndex += 1;
        }
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
