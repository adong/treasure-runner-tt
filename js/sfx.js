/* TT Treasure Runner: the game's own sounds, built on Kit.sound.tone / hiss (all synthesised, no files).
   TR.sfx.kit(name, ...args) plays a kit effect; the rest are ours. Every call is a silent no-op until Kit.sound.init() has
   run from the first tap or key, and Kit.sound mutes them all with the page's one sound switch. */
(function () {
  'use strict';
  const TR = window.TR;
  const S = Kit.sound;
  const tone = (o) => S.tone(o);
  const hiss = (o) => S.hiss(o);

  TR.sfx = {
    kit(name, ...args) {
      if (S[name]) S[name](...args);
    },
    // a footstep, a little higher every other step
    step(odd) { tone({ type: 'triangle', f: odd ? 320 : 270, to: 190, dur: 0.04, vol: 0.035 }); },
    // a rung of a ladder or a bar: a soft clink
    rung(odd) { tone({ type: 'triangle', f: odd ? 880 : 784, dur: 0.05, vol: 0.03 }); },
    // the spade chops a brick: a crunch and a thud
    dig() {
      hiss({ filter: 'bandpass', f: 900, to: 300, q: 1.4, dur: 0.22, vol: 0.12 });
      tone({ type: 'square', f: 120, to: 70, dur: 0.14, vol: 0.07, lp: 700 });
    },
    // a hole fills back in: a bouncy pop
    fill() { tone({ type: 'triangle', f: 260, to: 520, dur: 0.12, vol: 0.06 }); },
    // gold: the kit's coin, brighter with each one
    gold(n) { S.coin(n); },
    // the last gold: the exit ladder grows up with a rising sparkle
    exit() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.09, dur: 0.22, vol: 0.09 }));
      hiss({ filter: 'highpass', f: 6000, dur: 0.6, vol: 0.05, at: 0.1 });
    },
    // you fall / land
    fall() { tone({ type: 'sine', f: 700, to: 300, dur: 0.25, vol: 0.04 }); },
    land() { tone({ type: 'triangle', f: 140, to: 90, dur: 0.08, vol: 0.07 }); },
    // a robot drops into a hole: boing and a whirr winding down
    stuck() {
      tone({ type: 'sine', f: 420, to: 160, dur: 0.3, vol: 0.1 });
      tone({ type: 'sawtooth', f: 220, to: 60, dur: 0.6, vol: 0.03, lp: 900, at: 0.15 });
    },
    // the hole fills on a robot: AH-AH-CHOO! and it floats away
    sneeze() {
      tone({ type: 'triangle', f: 520, to: 700, dur: 0.18, vol: 0.06 });
      tone({ type: 'triangle', f: 600, to: 820, dur: 0.18, vol: 0.06, at: 0.22 });
      hiss({ filter: 'bandpass', f: 3000, to: 800, q: 0.8, dur: 0.3, vol: 0.18, at: 0.48 });
      tone({ type: 'sine', f: 600, to: 1400, dur: 0.8, vol: 0.04, at: 0.6 });
    },
    // a robot drops back in at the top
    boing() { tone({ type: 'sine', f: 200, to: 700, dur: 0.18, vol: 0.06 }); tone({ type: 'sine', f: 700, to: 300, dur: 0.15, vol: 0.05, at: 0.18 }); },
    // a robot climbs out of its hole
    climb() { tone({ type: 'square', f: 300, to: 600, dur: 0.15, vol: 0.03, lp: 1500 }); },
    // a robot picks up gold: a cheeky bleep-bloop
    grab() { tone({ type: 'square', f: 660, dur: 0.06, vol: 0.03, lp: 2000 }); tone({ type: 'square', f: 440, dur: 0.08, vol: 0.03, lp: 2000, at: 0.07 }); },
    // tickled! a run of giggly blips
    giggle() {
      for (let i = 0; i < 7; i++) tone({ type: 'triangle', f: 900 + (i % 2) * 220 - i * 30, dur: 0.06, vol: 0.06, at: i * 0.075 });
    },
    // popped up out of a filled hole
    pop() { tone({ type: 'sine', f: 300, to: 900, dur: 0.12, vol: 0.08 }); },
    // menus
    tick() { tone({ type: 'square', f: 1200, dur: 0.025, vol: 0.025, lp: 3000 }); },
    // can't do that
    nope() { tone({ f: 200, dur: 0.06, vol: 0.05 }); },
    // READY! GO!
    beep(go) { tone({ type: 'square', f: go ? 1046 : 523, dur: go ? 0.3 : 0.12, vol: 0.05, lp: 3200 }); },
    // the level's done: a fanfare
    win() {
      [523, 659, 784].forEach((f) => tone({ type: 'triangle', f: f * 2, dur: 0.6, vol: 0.07 }));
      hiss({ filter: 'highpass', f: 6000, dur: 0.5, vol: 0.05 });
      [1046, 1318, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f, at: 0.5 + i * 0.12, dur: 0.25, vol: 0.08 }));
    },
    // out of lives: a soft wah-wah, never harsh
    over() { [392, 370, 349, 311].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.22, dur: i === 3 ? 0.5 : 0.22, vol: 0.08 })); },
    // your brother pops in (and out)
    hello() {
      tone({ f: 300, to: 900, dur: 0.12, vol: 0.09 });
      hiss({ f: 2000, to: 6000, dur: 0.15, vol: 0.04 });
    },
    // the brother's holes: a quick chop each
    zap(i) { tone({ type: 'triangle', f: 500 + i * 120, to: 300, dur: 0.1, vol: 0.06 }); hiss({ filter: 'bandpass', f: 1200, q: 1, dur: 0.1, vol: 0.06 }); },
    // the high five: a clap
    clap() {
      hiss({ filter: 'bandpass', f: 1500, q: 0.8, dur: 0.09, vol: 0.2 });
      hiss({ filter: 'highpass', f: 3000, dur: 0.05, vol: 0.09, at: 0.01 });
    },
  };
})();
