#!/usr/bin/env node
/* The real-key play check: headless Chrome over the DevTools protocol (node's built-in WebSocket, no npm), driving the page
   with real key presses (Input.dispatchKeyEvent: trusted keydown / keyup on the window) and real touches on the on-screen
   pad (Input.dispatchTouchEvent), in real time with the page's own animation loop. game.start() and game.place() only set
   the scene; every move comes from a key or a finger.
     node tools/play.js                       all of it
     node tools/play.js --sabotage mirror     proves it can fail: ← and → swapped in the page's key handling
     node tools/play.js --sabotage stuck      proves it can fail: a tickle from a robot never ends
     node tools/play.js --levels 1,5,9        just some levels for the per-level checks
   Checks, on every level: → moves the runner one cell right in the rules and right on the screen, ← left; on every level
   with a ladder ↑ climbs up the screen and ↓ down; on every level with a bar → / ← go along it hanging and ↓ lets go; X / Z
   dig at his lower right / left. Then nothing leaves him stuck: after a robot's tickle, after digging, in his own hole (it
   fills and he pops out), hanging from a bar, after pause, while his brother visits. Touch: the pad's right and left halves
   and the dig buttons on a phone-sized screen. Opens index.html from file:// (set URL=... for a server). */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const sabotage = opt('sabotage');
const onlyLevels = opt('levels') ? opt('levels').split(',').map(Number) : null;
const base = process.env.URL || 'file://' + path.join(dir, 'index.html');
const url = base + (sabotage ? (base.includes('?') ? '&' : '?') + 'sabotage=' + sabotage : '');
const port = 9400 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'treasurerunnertt-play-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1200,750',
  '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = {
  ArrowRight: { code: 'ArrowRight', vk: 39 }, ArrowLeft: { code: 'ArrowLeft', vk: 37 }, ArrowUp: { code: 'ArrowUp', vk: 38 }, ArrowDown: { code: 'ArrowDown', vk: 40 },
  x: { code: 'KeyX', vk: 88, text: 'x' }, z: { code: 'KeyZ', vk: 90, text: 'z' }, p: { code: 'KeyP', vk: 80, text: 'p' }, t: { code: 'KeyT', vk: 84, text: 't' },
  d: { code: 'KeyD', vk: 68, text: 'd' }, a: { code: 'KeyA', vk: 65, text: 'a' }, r: { code: 'KeyR', vk: 82, text: 'r' },
};

(async () => {
  let ws;
  const results = { passed: 0, failed: 0, fails: [], notes: [] };
  const ok = (cond, msg) => {
    if (cond) results.passed++;
    else {
      results.failed++;
      if (results.fails.length < 40) results.fails.push(msg);
    }
    return cond;
  };
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); }
    }
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map(), errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description));
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR ' + d.params.args.map((a) => a.value || a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    const key = async (k, type) => {
      const K = KEYS[k];
      await send('Input.dispatchKeyEvent', { type, key: k, code: K.code, windowsVirtualKeyCode: K.vk, nativeVirtualKeyCode: K.vk, text: type === 'keyDown' ? K.text : undefined });
    };
    const press = async (k, ms = 60) => {
      await key(k, 'keyDown');
      await sleep(ms);
      await key(k, 'keyUp');
    };
    const info = () => js('JSON.stringify(game.info())').then(JSON.parse);
    // wait for the page to draw n more frames (its own loop), so what's on screen has caught up with the rules
    const frames = (n = 2) => js(`new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
    const runner = async () => {
      await frames(2);
      return js('JSON.stringify(Object.assign({}, game.info().runners[0], { scr: game.runnerScreen(0) }))').then(JSON.parse);
    };
    const until = async (expr, ms = 3000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await js(expr)) return true;
        await sleep(40);
      }
      return false;
    };
    // hold a key until the runner sets off (real time), let go, then wait until he stands still
    async function step(k, maxMs = 900) {
      await key(k, 'keyDown');
      const t0 = Date.now();
      let r;
      do {
        await sleep(25);
        r = await runner();
      } while (!r.moving && Date.now() - t0 < maxMs);
      await key(k, 'keyUp');
      const t1 = Date.now();
      do {
        await sleep(40);
        r = await runner();
      } while ((r.moving || r.how === 'fall') && Date.now() - t1 < 3000);
      await sleep(80);
      return runner();
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 750, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await sleep(2500);
    await js("localStorage.setItem('claudeGames.muted', '1'); localStorage.removeItem('treasureRunnerTT.v1'); location.reload(); 1").catch(() => 0);
    await sleep(4000);
    for (let i = 0; i < 40 && !(await js('typeof game === "object" && game.info().state === "home"').catch(() => false)); i++) await sleep(250);
    ok(await js('typeof game === "object" && game.info().state === "home"'), 'the page boots to the title screen (' + (await js('location.href + " " + document.readyState')) + ')');
    ok(await js('Kit.sound.isMuted()'), 'testing muted');
    results.notes.push('sabotage: ' + (await js('game.sabotage')));

    // a spot on level lv for each test, found from the level's own map (the rules decide; the keys move)
    const findSpots = (lvId) => js(`(function () {
      const lv = TR.LEVELS.find((l) => l.id === ${lvId}), spec = TR.parse(lv), W = spec.W, H = spec.H, T = spec.tiles;
      const s = TR.create(spec, { tier: 'normal', robots: false });
      const free = (x, y) => TR.passable(s, x, y) && !spec.gold[y * W + x];
      const stand = (x, y) => free(x, y) && TR.staticSup(spec, x, y) && T[y * W + x] === TR.E && y < H - 1 && T[(y + 1) * W + x] !== TR.LADDER;
      const out = {};
      const s0 = spec.starts[0], sx = s0 % W, sy = (s0 / W) | 0;
      const dist = (x, y) => Math.abs(x - sx) + Math.abs(y - sy);
      let best = 1e9;
      for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) {
        if (stand(x, y) && stand(x + 1, y) && stand(x - 1, y) && dist(x, y) < best) { best = dist(x, y); out.walk = [x, y]; }
      }
      for (let y = 2; y < H; y++) for (let x = 0; x < W && !out.ladder; x++) {
        if (T[y * W + x] === TR.LADDER && T[(y - 1) * W + x] === TR.LADDER && y + 1 < H && T[(y + 1) * W + x] === TR.LADDER) out.ladder = [x, y];
      }
      for (let y = 1; y < H - 1; y++) for (let x = 0; x < W - 1 && !out.bar; x++) {
        if (T[y * W + x] === TR.BAR && T[y * W + x + 1] === TR.BAR && free(x, y + 1) && !spec.gold[(y + 1) * W + x]) out.bar = [x, y];
      }
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1 && !out.dig; x++) {
        if (!stand(x, y)) continue;
        s.runners[0].x = s.runners[0].tx = x; s.runners[0].y = s.runners[0].ty = y;
        if (TR.canDig(s, s.runners[0], 1) && TR.canDig(s, s.runners[0], -1)) out.dig = [x, y];
      }
      return JSON.stringify(out);
    })()`).then(JSON.parse);

    // ---------------------------------------------------------------- every level: the keys go the way they show
    const ids = await js('JSON.stringify(TR.LEVELS.map((l) => l.id))').then(JSON.parse);
    const counts = { walk: 0, ladder: 0, bar: 0, dig: 0 };
    for (const lv of ids) {
      if (onlyLevels && !onlyLevels.includes(lv)) continue;
      const spots = await findSpots(lv);
      // robots switched off for the direction checks (a robot walking up would tickle him mid-check)
      await js(`game.start({ level: ${lv}, tier: 'normal', go: true }); game.G.s.robots.length = 0; 1`);
      await sleep(250);
      if (spots.walk) {
        counts.walk++;
        await js(`game.place(${spots.walk[0]}, ${spots.walk[1]})`);
        await sleep(150);
        const a = await runner();
        const b = await step('ArrowRight');
        ok(b.x === a.x + 1 && b.y === a.y, `level ${lv}: → moved him from ${a.x},${a.y} to ${b.x},${b.y}`);
        ok(b.scr.x > a.scr.x + 5, `level ${lv}: → moved him right on the screen (${a.scr.x.toFixed(0)} → ${b.scr.x.toFixed(0)})`);
        const c = await step('ArrowLeft');
        ok(c.x === b.x - 1 && c.y === b.y, `level ${lv}: ← moved him from ${b.x},${b.y} to ${c.x},${c.y}`);
        ok(c.scr.x < b.scr.x - 5, `level ${lv}: ← moved him left on the screen (${b.scr.x.toFixed(0)} → ${c.scr.x.toFixed(0)})`);
      } else results.notes.push(`level ${lv}: no spot with room both sides`);
      if (spots.ladder) {
        counts.ladder++;
        await js(`game.place(${spots.ladder[0]}, ${spots.ladder[1]})`);
        await sleep(150);
        const a = await runner();
        const b = await step('ArrowUp');
        ok(b.y === a.y - 1 && b.x === a.x, `level ${lv}: ↑ on a ladder climbed from ${a.x},${a.y} to ${b.x},${b.y}`);
        ok(b.scr.y < a.scr.y - 5, `level ${lv}: ↑ went up the screen (${a.scr.y.toFixed(0)} → ${b.scr.y.toFixed(0)})`);
        const c = await step('ArrowDown');
        ok(c.y === b.y + 1, `level ${lv}: ↓ on a ladder climbed down to ${c.x},${c.y}`);
        ok(c.scr.y > b.scr.y + 5, `level ${lv}: ↓ went down the screen (${b.scr.y.toFixed(0)} → ${c.scr.y.toFixed(0)})`);
      }
      if (spots.bar) {
        counts.bar++;
        await js(`game.place(${spots.bar[0]}, ${spots.bar[1]})`);
        await sleep(150);
        const a = await runner();
        const b = await step('ArrowRight');
        ok(b.x === a.x + 1 && b.y === a.y && b.how === 'bar', `level ${lv}: → along a bar went from ${a.x},${a.y} to ${b.x},${b.y} (${b.how})`);
        ok(b.scr.x > a.scr.x + 5, `level ${lv}: → along a bar moved right on the screen`);
        const c = await step('ArrowLeft');
        ok(c.x === a.x && c.how === 'bar', `level ${lv}: ← along a bar went back (${c.x},${c.y}, ${c.how})`);
        const d = await step('ArrowDown');
        ok(d.y > c.y, `level ${lv}: ↓ let go of the bar (${c.y} → ${d.y})`);
      }
      if (spots.dig) {
        counts.dig++;
        await js(`game.place(${spots.dig[0]}, ${spots.dig[1]})`);
        await sleep(150);
        const hx = (d) => `game.G.s.hole[(${spots.dig[1]} + 1) * game.G.s.W + ${spots.dig[0]} + (${d})]`;
        await press('x');
        ok(await until(`${hx(1)} === 2`), `level ${lv}: X dug at his lower right (hole state ${await js(hx(1))})`);
        await until(`game.info().runners[0].how !== 'dig'`);
        await press('z');
        ok(await until(`${hx(-1)} === 2`), `level ${lv}: Z dug at his lower left (hole state ${await js(hx(-1))})`);
      }
    }
    results.notes.push(`levels with: room to walk ${counts.walk}, a ladder ${counts.ladder}, a bar ${counts.bar}, room to dig ${counts.dig}`);

    // ---------------------------------------------------------------- nothing leaves him stuck
    // 1. a robot's tickle: he loses a life, goes back to the start, and the keys work again
    await js("game.start({ level: 5, tier: 'normal', go: true }); 1");
    await sleep(200);
    await js('game.place(14, 5); 1'); // right in front of the robot
    let caught = false;
    for (let i = 0; i < 40 && !caught; i++) {
      await sleep(100);
      caught = (await runner()).how === 'caught';
    }
    ok(caught, 'a robot catches (tickles) him');
    await until("game.info().runners[0].how !== 'caught' && game.G.s.ready === 0", 8000); // the giggle, then READY? GO!
    {
      const a = await runner();
      ok(a.how !== 'caught', `after the tickle he's free again (${a.how})`);
      await js('game.G.s.robots.length = 0; 1');
      const b = await step('ArrowRight');
      ok(b.x === a.x + 1, `after the tickle → works again (${a.x} → ${b.x})`);
    }
    // 2. digging, then walking into his own hole: ↑ does nothing, he pops out when it fills, then the keys work
    await js("game.start({ level: 5, tier: 'normal', go: true }); game.G.s.robots.length = 0; game.place(6, 5); 1");
    await sleep(200);
    await press('x');
    await until('game.G.s.hole[6 * game.G.s.W + 7] === 2');
    await until("game.info().runners[0].how !== 'dig'");
    {
      const a = await runner();
      ok(a.how !== 'dig', `after digging he can move (${a.how})`);
      const b = await step('ArrowRight');
      ok(b.x === 7 && b.y === 6, `he walks into his own hole (at ${b.x},${b.y})`);
      const c = await step('ArrowUp', 400);
      ok(c.y === 6, `↑ in a hole does nothing (at ${c.x},${c.y})`);
      const popped = await until('game.info().runners[0].y === 5 && !game.info().runners[0].moving', 16000);
      ok(popped, 'the hole fills and he pops up out of it');
      const d = await step('ArrowRight');
      ok(d.x === 8, `after popping out → works (at ${d.x},${d.y})`);
    }
    // 3. hanging from a bar: along, back, let go
    await js("game.start({ level: 3, tier: 'normal', go: true }); game.place(6, 2); 1");
    await sleep(300);
    {
      const a = await runner();
      ok(a.how === 'bar', `hanging from a bar (${a.how})`);
      const b = await step('ArrowRight');
      const c = await step('ArrowLeft');
      ok(b.x === 7 && c.x === 6 && c.how === 'bar', `hanging, → and ← both work (${b.x}, ${c.x}, ${c.how})`);
      const d = await step('ArrowDown');
      ok(d.y > 2, `↓ lets go of the bar (y ${d.y})`);
    }
    // 4. pause and back
    await js("game.start({ level: 1, tier: 'normal', go: true }); 1");
    await sleep(200);
    await press('p');
    ok(await until("game.info().state === 'paused'", 1500), 'P pauses');
    await press('p');
    await until("game.info().state === 'play'", 1500);
    {
      const a = await runner();
      const b = await step('ArrowRight');
      ok(b.x === a.x + 1, `after pause → works (${a.x} → ${b.x})`);
    }
    // 5. his brother visits (T): the keys keep working while he's there, and the holes appear by the robot
    await js("game.start({ level: 5, tier: 'easy', go: true }); 1");
    await sleep(300);
    await press('t');
    await until("game.info().buddy.phase !== 'off'", 2000);
    {
      const bi = (await info()).buddy;
      ok(bi.phase !== 'off', `T calls his brother (${bi.phase})`);
      const a = await runner();
      const b = await step('ArrowRight');
      ok(b.x === a.x + 1, `→ works while his brother visits (${a.x} → ${b.x})`);
      await until('game.info().buddy.holes >= 1', 12000);
      const bj = (await info()).buddy;
      ok(bj.treats >= 1 && bj.holes >= 1, `his brother brought a treat (${bj.treats}) and dug holes by the robot (${bj.holes})`);
    }
    // 6. R starts the level again from anywhere
    await js("game.start({ level: 2, tier: 'normal', go: true }); 1");
    await sleep(200);
    await step('ArrowRight');
    await press('r');
    await until("game.info().state === 'ready'", 1500);
    {
      const i = await info();
      ok(i.runners[0].x === 8 && i.runners[0].y === 7 && i.state === 'ready', `R starts the level again (${i.runners[0].x},${i.runners[0].y}, ${i.state})`);
    }

    // ---------------------------------------------------------------- touch, on a phone held sideways
    await send('Emulation.setDeviceMetricsOverride', { width: 740, height: 360, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await sleep(300);
    await js("game.start({ level: 1, tier: 'normal', go: true }); 1");
    await sleep(500);
    const touch = async (x, y, ms = 0, hold) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      if (hold) await hold();
      else await sleep(ms);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    async function touchStep(x, y) {
      let r;
      await touch(x, y, 0, async () => {
        const t0 = Date.now();
        do {
          await sleep(25);
          r = await runner();
        } while (!r.moving && Date.now() - t0 < 900);
      });
      const t1 = Date.now();
      do {
        await sleep(40);
        r = await runner();
      } while ((r.moving || r.how === 'fall') && Date.now() - t1 < 3000);
      await sleep(80);
      return runner();
    }
    {
      const pads = (await info()).pads;
      ok(pads.includes('pad0') && pads.includes('digpad'), `on a touch screen the pad and dig buttons show (${pads.join(', ')})`);
      const pad = await js("JSON.stringify(document.getElementById('dpad0').getBoundingClientRect())").then(JSON.parse);
      const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
      await js('game.place(3, 5); 1');
      await sleep(150);
      const a = await runner();
      const b = await touchStep(cx + pad.width * 0.38, cy);
      ok(b.x > a.x && b.y === a.y && b.scr.x > a.scr.x + 3, `touch: the pad's right side moves him right (${a.x} → ${b.x})`);
      const c = await touchStep(cx - pad.width * 0.38, cy);
      ok(c.x < b.x && c.y === b.y && c.scr.x < b.scr.x - 3, `touch: the pad's left side moves him left (${b.x} → ${c.x})`);
      // the kit's buttons down the left edge stay clear of the pad and the level
      const clash = await js(`(function () {
        const a = ['kit-help-btn', 'kit-lang-btn'].map((i) => document.getElementById(i)).filter(Boolean).map((e) => e.getBoundingClientRect());
        const p = document.getElementById('pad0').getBoundingClientRect();
        return a.some((r) => r.bottom > p.top && r.top < p.bottom && r.right > p.left && r.left < p.right);
      })()`);
      ok(!clash, 'the ? and language buttons don\'t cover the touch pad');
      const dig = await js("JSON.stringify(document.getElementById('digR').getBoundingClientRect())").then(JSON.parse);
      // a spot where he can dig right on level 1: the brick floor of the top platform
      await js("game.start({ level: 1, tier: 'normal', go: true }); game.place(5, 2); 1");
      await sleep(300);
      await touch(dig.x + dig.width / 2, dig.y + dig.height / 2, 80);
      ok(await until('game.G.s.hole[3 * game.G.s.W + 6] === 2'), 'touch: the ⛏️▶ button digs at his lower right');
    }

    if (errors.length) results.notes.push('page errors: ' + errors.slice(0, 5).join(' | '));
    ok(errors.length === 0, `no console errors (${errors.length})`);
  } catch (e) {
    ok(false, 'the run threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  } finally {
    try { ws && ws.close(); } catch (e) { /* closed */ }
    await new Promise((r) => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 3000); });
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp folder */ }
  }
  console.log(JSON.stringify(results, null, 1));
  console.log(results.failed ? 'PLAY CHECK FAILED' : 'PLAY CHECK PASSED');
  process.exitCode = results.failed ? 1 : 0;
})();
