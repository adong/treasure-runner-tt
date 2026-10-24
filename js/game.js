/* TT Treasure Runner: the game. Grab all the gold, then climb the rainbow exit ladder to the top. You can't jump: dig holes
   to your lower left or right (Z / X) to drop through floors and to trap the googly-eyed robot vacuums.
   Screens: home (PLAY, MAKE A LEVEL, 1 or 2 players, Teddy or Tommy, 🐣 EASY or 🔥 NORMAL) → the level picker (30 levels and
   your own) → READY? GO! → play → LEVEL CLEARED (signature move, confetti, score) or OUT OF LIVES. The level maker is
   js/editor.js. 1 player: your brother comes when you call (js/buddy.js). 2 players: two runners on the same level.
   window.game is a test hook: see the README. */
(function () {
  'use strict';
  const T = THREE;
  const TR = window.TR;
  const S = Kit.sound;
  const ST = TR.stage;
  const { rand } = Kit.gfx;
  const { LEFT, RIGHT, UP, DOWN } = TR;
  const $ = (id) => document.getElementById(id);
  const SAB = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('sabotage')) || null;

  const CFG = {
    scale: 0.46, // the runners in a level of 1 m cells (a boy is about 0.9 m tall)
    buddy: 0.85, // the visiting brother, times his roster buddyScale (he stands beside the level on the grass, so bigger)
    demoLevel: 8, // the level running behind the title
    maxLives: 9,
  };
  const LEVELS = TR.LEVELS;
  const NAME = { teddy: 'TEDDY', tommy: 'TOMMY' };

  // ---------------------------------------------------------------- saves

  const SAVE = 'treasureRunnerTT.v1';
  const save = { prefs: { players: 1, who: 'teddy', tier: 'easy' }, done: { teddy: {}, tommy: {}, team: {} }, hi: { easy: 0, normal: 0 }, mine: [null, null, null] };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (s && s.prefs) Object.assign(save.prefs, s.prefs);
    if (s && s.done) for (const k of ['teddy', 'tommy', 'team']) Object.assign(save.done[k], s.done[k] || {});
    if (s && s.hi) Object.assign(save.hi, s.hi);
    if (s && Array.isArray(s.mine)) s.mine.slice(0, 3).forEach((m, i) => (save.mine[i] = m));
  } catch (e) { /* storage blocked: play without saving */ }
  function store() {
    try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) { /* storage blocked */ }
  }
  const prefs = save.prefs;
  const profile = () => (G.players === 2 ? 'team' : G.who);

  // ---------------------------------------------------------------- state

  const G = {
    state: 'boot', players: 1, who: 'teddy', tier: 'easy', level: null, s: null, world: null, runScore: 0, lives: 3, timers: [], held: false, last: 0,
    demo: null, pausedFrom: null, focus: 0, result: null, count: 0, countT: 0, stuckT: 0, stuckSaid: false, auto: null, grabSaid: false, streak: 0,
  };
  let ui = null, art = null, flyers = null, bursts = null;
  const people = { teddy: TR.makeActor(), tommy: TR.makeActor() };
  const tags = {};
  const inputs = [{ dir: 0, dig: 0 }, { dir: 0, dig: 0 }];
  const heldKeys = [[], []]; // directions held down, latest last, per player
  const touchDir = [0, 0];
  let touchSeen = false;

  const later = (secs, fn) => G.timers.push({ t: secs, fn });

  // ---------------------------------------------------------------- toasts and bits

  function toast(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.textContent = text;
    ui.toasts.appendChild(d);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
    setTimeout(() => d.remove(), cls === 'save' || cls === 'hint' ? 3100 : 2100);
  }
  const show = (el, on) => el.classList.toggle('hidden', !on);
  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  const faceImg = (id) => `<img src="${art[id]}" alt="">`;
  const levelLabel = (lv) => (lv.mine ? `MY LEVEL ${lv.mine}` : `LEVEL ${lv.id}: ${lv.name}`);
  const runnerIds = () => (G.players === 2 ? ['teddy', 'tommy'] : [G.who]);
  const runnerActor = (i) => people[runnerIds()[i]];

  // ---------------------------------------------------------------- the autopilot (the title screen's demo, and game.auto for tests)
  // It plays the solver's moves one at a time by holding a direction until the runner sets off, like a player would.

  function makePilot(s, moves) {
    const r = s.runners[0];
    let i = 0, phase = 'next', dir = 0, t = 0;
    const W = s.W;
    const rest = () => TR.atRest(s, r) && r.how !== 'dig';
    return {
      get done() { return i >= moves.length; },
      get index() { return i; },
      tick(inp, dt) {
        inp.dir = 0;
        t += dt;
        if (i >= moves.length || s.won || r.how === 'caught') return;
        const m = moves[i], mine = r.y * W + r.x;
        if (phase === 'next') {
          for (let c = 0; c < s.spec.n; c++) if (s.hole[c] && c !== mine) return; // wait for other holes to fill
          if (!rest()) return;
          t = 0;
          if (m.act === 'pop') phase = 'pop';
          else if (m.act === 'digL' || m.act === 'digR') {
            inp.dig = m.act === 'digL' ? -1 : 1;
            dir = m.act === 'digL' ? LEFT : RIGHT;
            phase = 'digging';
          } else {
            dir = { walkL: LEFT, walkR: RIGHT, up: UP, down: DOWN }[m.act];
            phase = 'hold';
          }
          return;
        }
        if (phase === 'digging') {
          if (r.how === 'dig' || t < 0.05) return;
          phase = 'hold';
          t = 0;
        }
        if (phase === 'hold') {
          if (r.moving || t > 1.2) phase = 'settle';
          else inp.dir = dir;
          return;
        }
        if (phase === 'settle' && rest()) {
          i++;
          phase = 'next';
        }
        if (phase === 'pop' && !s.hole[mine] && rest()) {
          i++;
          phase = 'next';
        }
      },
    };
  }

  // ---------------------------------------------------------------- the people in the level

  function setupPeople(ids, withTags) {
    for (const id of ['teddy', 'tommy']) {
      people[id].visible = ids.includes(id);
      people[id].setScale(CFG.scale);
      people[id].react('idle');
      people[id].drop();
      tags[id].visible = withTags;
    }
  }

  // Put each runner's character where the rules say he is, doing what he's doing.
  const lastMove = [0, 0];
  function syncRunners(s, world, ids, dt) {
    s.runners.forEach((r, i) => {
      const a = people[ids[i]];
      if (!a) return;
      const x = TR.px(r), y = TR.py(r);
      const p = world.at(x, y, a.root.position);
      p.z = 0.28;
      if (r.moving) lastMove[i] = 0;
      else lastMove[i] += dt;
      let base = 'stand';
      const face = r.face < 0 ? 'left' : 'right';
      const below = r.y >= s.H - 1 ? TR.STONE : s.spec.tiles[(r.y + 1) * s.W + r.x];
      const onFloor = (below === TR.BRICK && !s.hole[(r.y + 1) * s.W + r.x]) || below === TR.STONE;
      if (s.won || s.over) base = r.how === 'caught' ? 'giggle' : 'stand'; // the winner turns round for his signature move
      else if (r.how === 'caught') base = 'giggle';
      else if (r.how === 'dig') base = 'dig';
      else if (r.how === 'fall') base = 'fall';
      else if (r.how === 'climb' || (r.how === 'ladder' && !onFloor)) base = 'climb';
      else if (r.how === 'bar') base = 'hang';
      else if (r.how === 'walk' || lastMove[i] < 0.25) base = 'run';
      a.show(base, r.moving, base === 'run' || base === 'dig' ? face : 'you');
    });
  }

  // ---------------------------------------------------------------- layout

  function hudBottom() {
    const r = ui.hudtop.getBoundingClientRect();
    return r.height ? r.bottom + 6 : 70;
  }

  // Margins round the level: the HUD on top, the kit's buttons down the left, the touch pads and your brother's button.
  function margins(forDemo) {
    const W = ST.W, H = ST.H, wide = W / H > 1.15;
    if (forDemo) return wide ? { l: 60, r: W * 0.5, t: 20, b: 20 } : { l: 56, r: 12, t: 40, b: H * 0.58 };
    const m = { l: 60, r: 12, t: hudBottom(), b: 12 };
    const boxes = [ui.pad0, ui.pad1, ui.digpad, ui.callBtn].filter((el) => !el.classList.contains('hidden') && !el.classList.contains('gone')).map((el) => el.getBoundingClientRect());
    for (const b of boxes) {
      if (!b.width) continue;
      if (wide) {
        if (b.left < W / 2) m.l = Math.max(m.l, b.right + 8);
        else m.r = Math.max(m.r, W - b.left + 8);
      } else m.b = Math.max(m.b, H - b.top + 8);
    }
    return m;
  }

  function layout() {
    ST.resize();
    TR.fx.overlay.resize();
    placePads();
    if (G.world && G.state !== 'home' && G.state !== 'levels' && G.state !== 'editor') ST.fit(G.world.box, margins(false));
    else if (G.demo) ST.fit(G.demo.world.box, margins(true));
    // shadows cover the level
    const sun = ST.sun, w = G.world || (G.demo && G.demo.world);
    if (sun && w) {
      const sc = sun.shadow.camera, half = Math.max(w.W, w.H) / 2 + 3;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
      sun.position.set(-8, w.H + 10, 22);
      sun.target.position.set(0, w.H / 2, 0);
    }
  }

  // ---------------------------------------------------------------- touch pads

  const usingTouch = () => touchSeen || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  function placePads() {
    const playing = ['ready', 'play', 'won', 'paused', 'out'].includes(G.state);
    const touch = playing && usingTouch();
    const two = G.players === 2;
    show(ui.pad0, touch);
    show(ui.pad1, touch && two);
    show(ui.digpad, touch && !two);
    ui.pad0.classList.toggle('two', two);
    ui.pad1.classList.toggle('two', two);
    ui.digs0b.classList.toggle('gone', !two);
    ui.digs1b.classList.toggle('gone', !two);
    show(ui.callBtn, playing);
    ui.callBtn.classList.toggle('touch', usingTouch());
    ui.callBtn.classList.toggle('center', two && touch);
    // your brother's button sits above the dig buttons on a touch screen
    if (touch && !two) {
      const r = ui.digpad.getBoundingClientRect();
      ui.callBtn.style.bottom = `${Math.round(ST.H - r.top + 12)}px`;
    } else ui.callBtn.style.bottom = '';
  }

  function bindPad(el, p) {
    const ids = new Set();
    const marks = { [UP]: el.querySelector('.u'), [DOWN]: el.querySelector('.d'), [LEFT]: el.querySelector('.l'), [RIGHT]: el.querySelector('.r') };
    const paint = () => { for (const d of [UP, DOWN, LEFT, RIGHT]) marks[d].classList.toggle('on', touchDir[p] === d); };
    const aim = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      touchDir[p] = Math.hypot(dx, dy) < r.width * 0.12 ? 0 : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? LEFT : RIGHT) : dy < 0 ? UP : DOWN;
      if (SAB === 'mirror' && (touchDir[p] === LEFT || touchDir[p] === RIGHT)) touchDir[p] = touchDir[p] === LEFT ? RIGHT : LEFT;
      paint();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      gesture();
      touchSeen = true;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      ids.add(e.pointerId);
      aim(e);
    });
    el.addEventListener('pointermove', (e) => { if (ids.has(e.pointerId)) aim(e); });
    const end = (e) => {
      ids.delete(e.pointerId);
      if (!ids.size) {
        touchDir[p] = 0;
        paint();
      }
    };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, end);
  }

  function digButton(btn, p, d) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      gesture();
      touchSeen = true;
      inputs[p].dig = SAB === 'mirror' ? -d : d;
      btn.classList.add('on');
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(t, () => btn.classList.remove('on'));
  }

  // ---------------------------------------------------------------- home and the level picker

  function setPref(k, v) {
    prefs[k] = v;
    store();
    refreshHome();
    if (G.demo && k === 'who') setupDemoPeople();
    TR.sfx.tick();
  }

  function refreshHome() {
    for (const b of ui.segPlayers.children) b.classList.toggle('on', +b.dataset.v === prefs.players);
    for (const b of ui.segWho.children) b.classList.toggle('on', b.dataset.v === prefs.who);
    for (const b of ui.segLevel.children) b.classList.toggle('on', b.dataset.v === prefs.tier);
    ui.segWho.classList.toggle('gone', prefs.players === 2);
    ui.hiEasy.textContent = save.hi.easy;
    ui.hiNormal.textContent = save.hi.normal;
  }

  function hideAll() {
    TR.editor.close();
    for (const k of ['home', 'levels', 'hud', 'winPanel', 'overPanel', 'pause', 'editor']) show(ui[k], false);
    show(ui.count, false);
  }

  function clearLevel() {
    if (G.world) G.world.dispose();
    G.world = null;
    G.s = null;
    TR.buddy.dismiss();
    G.auto = null;
    flyers.clear();
    bursts.clear();
    ui.restartBtn.classList.remove('glow');
  }

  function goHome() {
    clearLevel();
    hideAll();
    G.state = 'home';
    G.timers = [];
    TR.fx.overlay.clear();
    show(ui.home, true);
    refreshHome();
    startDemo();
    S.music('title');
    layout();
  }

  // the title screen: a level plays itself behind the menu (the robots there are friendly ghosts: they never catch him)
  function startDemo() {
    if (G.demo) return;
    const lv = LEVELS.find((l) => l.id === CFG.demoLevel) || LEVELS[0];
    const spec = TR.parse(lv);
    const s = TR.create(spec, { tier: 'normal', robots: true, ghost: true, seed: 5 });
    const world = TR.makeWorld(spec);
    ST.scene.add(world.group);
    const sol = TR.solve(spec);
    G.demo = { s, world, spec, sol, pilot: makePilot(s, sol.ok ? sol.moves : []), inp: [{ dir: 0, dig: 0 }], wonT: 0 };
    setupDemoPeople();
  }
  function setupDemoPeople() {
    setupPeople([prefs.who], false);
  }
  function stopDemo() {
    if (!G.demo) return;
    G.demo.world.dispose();
    G.demo = null;
  }
  function demoUpdate(dt) {
    const d = G.demo;
    if (!d) return;
    if (d.s.won) {
      d.wonT += dt;
      if (d.wonT > 2.5) {
        d.s = TR.create(d.spec, { tier: 'normal', robots: true, ghost: true, seed: 5 + Math.floor(rand(0, 99)) });
        d.pilot = makePilot(d.s, d.sol.ok ? d.sol.moves : []);
        d.wonT = 0;
      }
    } else {
      d.pilot.tick(d.inp[0], dt);
      TR.step(d.s, dt, d.inp);
      if (d.s.won) people[prefs.who].react('over');
    }
    d.s.events.length = 0;
    d.world.update(d.s, dt);
    syncRunners(d.s, d.world, [prefs.who], dt);
  }

  function showLevels() {
    stopDemo();
    clearLevel();
    hideAll();
    G.state = 'levels';
    G.timers = [];
    G.players = prefs.players;
    G.who = prefs.who;
    G.tier = prefs.tier;
    startDemo();
    for (const b of ui.lvTier.children) b.classList.toggle('on', b.dataset.v === prefs.tier);
    ui.lvFace.src = art[G.players === 2 ? 'teddy' : G.who];
    buildGrid();
    show(ui.levels, true);
    layout();
  }

  function buildGrid() {
    const done = save.done[profile()];
    ui.lvGrid.innerHTML = '';
    let next = -1;
    LEVELS.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'lv' + (done[lv.id] ? ' done' : '');
      if (!done[lv.id] && next < 0) {
        next = i;
        b.classList.add('next');
      }
      b.innerHTML = `<span class="n">${lv.id}</span><span class="s">${done[lv.id] ? '💰' : lv.robots ? '' : ''}</span>`;
      b.title = levelLabel(lv);
      b.setAttribute('aria-label', levelLabel(lv));
      b.addEventListener('click', () => {
        gesture();
        G.runScore = 0;
        G.lives = TR.TIERS[G.tier].lives;
        startLevel(lv);
      });
      ui.lvGrid.appendChild(b);
    });
    if (G.focus < 0 || G.focus >= LEVELS.length) G.focus = Math.max(0, next);
    [...ui.lvGrid.children].forEach((b, i) => b.classList.toggle('focus', i === G.focus));
    ui.lvDone.textContent = LEVELS.filter((l) => done[l.id]).length;
    // your own levels from the level maker
    ui.lvMine.innerHTML = '';
    save.mine.forEach((m, i) => {
      if (!m) return;
      const b = document.createElement('button');
      b.className = 'lv mine';
      b.innerHTML = `<span class="n">✏️${i + 1}</span>`;
      b.setAttribute('aria-label', `MY LEVEL ${i + 1}`);
      b.title = `MY LEVEL ${i + 1}`;
      b.addEventListener('click', () => {
        gesture();
        G.runScore = 0;
        G.lives = TR.TIERS[G.tier].lives;
        startLevel(mineLevel(i));
      });
      ui.lvMine.appendChild(b);
    });
    ui.lvMineLabel.classList.toggle('gone', !ui.lvMine.children.length);
  }

  const mineLevel = (i) => ({ id: `mine${i + 1}`, name: `MY LEVEL ${i + 1}`, rows: save.mine[i].slice(), mine: i + 1 });

  function moveFocus(d) {
    G.focus = Math.max(0, Math.min(LEVELS.length - 1, G.focus + d));
    [...ui.lvGrid.children].forEach((b, i) => b.classList.toggle('focus', i === G.focus));
    TR.sfx.tick();
  }

  // ---------------------------------------------------------------- a level

  function startLevel(lv, opts = {}) {
    stopDemo();
    clearLevel();
    hideAll();
    G.timers = [];
    TR.fx.overlay.clear();
    G.players = prefs.players;
    G.who = prefs.who;
    G.tier = prefs.tier;
    G.level = lv;
    G.banked = false;
    const spec = TR.parse(lv);
    G.s = TR.create(spec, { tier: G.tier, players: G.players, lives: G.lives, seed: (Date.now() & 0xffff) + 1, sabotage: opts.sabotage });
    G.world = TR.makeWorld(spec);
    ST.scene.add(G.world.group);
    setupPeople(runnerIds(), G.players === 2);
    if (G.players === 1) {
      const e = TR.buddy.setFor(G.who);
      ui.callFace.src = art[e.id];
      ui.callFace.classList.remove('gone');
      ui.five.classList.add('gone');
      ui.callBtn.setAttribute('aria-label', `Call ${e.name} (T)`);
      ui.callBtn.title = `Call ${e.name} (T)`;
    } else {
      ui.callFace.classList.add('gone');
      ui.five.classList.remove('gone');
      ui.callBtn.setAttribute('aria-label', 'High five! (T)');
      ui.callBtn.title = 'High five! (T)';
    }
    for (const i of [0, 1]) {
      inputs[i].dir = inputs[i].dig = 0;
      heldKeys[i].length = 0;
      touchDir[i] = 0;
    }
    G.stuckT = 0;
    G.stuckSaid = false;
    G.grabSaid = false;
    G.streak = 0;
    show(ui.hud, true);
    ready();
    refreshHud();
    syncRunners(G.s, G.world, runnerIds(), 0);
    G.world.update(G.s, 0);
    layout();
    S.music('play');
  }

  // READY? … GO! (robots wait; you can look round)
  function ready() {
    G.state = 'ready';
    G.count = 2;
    G.countT = 0;
    countShow('READY?');
    TR.sfx.beep(false);
  }
  function countShow(t) {
    ui.count.innerHTML = `<span>${t}</span>`;
    show(ui.count, true);
  }
  function countUpdate(dt) {
    G.countT += dt;
    if (G.count === 2 && G.countT > 0.9) {
      G.count = 1;
      countShow('GO!');
      TR.sfx.beep(true);
      G.state = 'play';
    } else if (G.count === 1 && G.countT > 1.4) {
      G.count = 0;
      show(ui.count, false);
    }
  }

  function restartLevel() {
    if (!G.s || !G.level) return;
    if (G.state === 'out' || ui.overPanel.classList.contains('hidden') === false) return againAfterOver();
    G.lives = G.state === 'result' || G.state === 'won' ? G.lives : G.s.lives;
    if (G.state === 'result' || G.state === 'won') G.runScore = Math.max(0, G.runScore - (G.result ? G.result.levelScore : 0));
    startLevel(G.level);
  }

  function againAfterOver() {
    G.runScore = 0;
    G.lives = TR.TIERS[G.tier].lives;
    startLevel(G.level);
  }

  function nextLevel() {
    if (!G.level) return showLevels();
    if (G.level.mine) return openEditor(G.level.mine - 1);
    const i = LEVELS.indexOf(G.level);
    if (i < 0 || i >= LEVELS.length - 1) return showLevels();
    startLevel(LEVELS[i + 1]);
  }

  const shownScore = () => G.runScore + (G.s && !G.banked ? G.s.score : 0); // once won, the level's score is in runScore
  function refreshHud() {
    const s = G.s;
    if (!s) return;
    ui.lvlName.textContent = levelLabel(G.level);
    ui.goldGot.textContent = s.got;
    ui.goldAll.textContent = s.spec.total;
    const sc = shownScore();
    if (+ui.score.textContent !== sc) {
      ui.score.textContent = sc;
      bump(ui.score);
    }
    const hi = Math.max(save.hi[G.tier], sc);
    ui.hi.textContent = hi;
    if (+ui.lives.textContent !== s.lives) {
      ui.lives.textContent = Math.max(0, s.lives);
      bump(ui.lives);
    }
  }

  // ---------------------------------------------------------------- what happened this frame

  function events(s) {
    const w = G.world, ids = runnerIds();
    const cellPos = (c, up = 0.5) => w.at(c % s.W, (c / s.W) | 0).add(new T.Vector3(0, up, 0.5));
    for (const e of s.events) {
      switch (e.type) {
        case 'gold': {
          G.streak++;
          TR.sfx.gold(Math.min(12, G.streak));
          const p = cellPos(e.b);
          for (let i = 0; i < 8; i++) flyers.add(i % 2 ? '✨' : '⭐', p.x, p.y, p.z, rand(-1.6, 1.6), rand(1.5, 3), rand(0.22, 0.34), 0.7, rand(-4, 4), 4);
          bump(ui.goldGot);
          break;
        }
        case 'exit':
          TR.sfx.exit();
          toast('ALL THE GOLD! CLIMB THE RAINBOW LADDER!', 'save');
          break;
        case 'dig': {
          if (e.a >= 0) TR.sfx.dig();
          const p = cellPos(e.b, 0.9);
          for (let i = 0; i < 6; i++) flyers.add('🧱', p.x, p.y, p.z, rand(-1.4, 1.4), rand(1, 2.6), rand(0.16, 0.26), 0.7, rand(-6, 6), 7);
          break;
        }
        case 'fill':
          TR.sfx.fill();
          break;
        case 'stuck': {
          TR.sfx.stuck();
          const p = cellPos(e.b, 0.7);
          bursts.add('STUCK!', p.x, p.y + 0.6, p.z, 1.3, '#9be7ff', '#2f6fe0');
          break;
        }
        case 'trap': {
          TR.sfx.sneeze();
          const p = cellPos(e.b, 0.8);
          later(0.5, () => {
            bursts.add('ACHOO!', p.x, p.y + 0.7, p.z, 1.7);
            for (let i = 0; i < 14; i++) flyers.add(['🎉', '✨', '💨', '🎊'][i % 4], p.x, p.y, p.z, rand(-2.2, 2.2), rand(1.5, 3.5), rand(0.25, 0.4), 1, rand(-5, 5), 3);
          });
          break;
        }
        case 'respawn':
          TR.sfx.boing();
          break;
        case 'climbout':
          TR.sfx.climb();
          break;
        case 'grab':
          TR.sfx.grab();
          if (!G.grabSaid) {
            G.grabSaid = true;
            toast('A ROBOT TOOK SOME GOLD! TRAP IT TO GET IT BACK!', 'hint');
          }
          break;
        case 'drop': {
          const p = cellPos(e.b, 0.4);
          for (let i = 0; i < 6; i++) flyers.add('✨', p.x, p.y, p.z, rand(-1.2, 1.2), rand(1, 2), 0.25, 0.6, rand(-3, 3), 3);
          break;
        }
        case 'caught': {
          TR.sfx.giggle();
          G.streak = 0;
          const a = people[ids[e.a]];
          if (a) {
            const p = a.root.position;
            bursts.add('BOOP!', p.x, p.y + 1.4, p.z + 0.4, 1.4, '#ffe0f0', '#ff3d7f');
          }
          toast(`TICKLED! 😆 ${s.lives > 0 ? '' : ''}`.trim(), 'buddy');
          ST.shake(0.25);
          if (SAB === 'stuck') s.runners[e.a].caughtT = 1e9; // sabotage for the play check: the tickle never ends
          break;
        }
        case 'ready':
          toast('READY? GO!', 'buddy');
          break;
        case 'pop':
          TR.sfx.pop();
          toast('BOING! OUT OF THE HOLE!', 'buddy');
          break;
        case 'fall':
          break;
        case 'land':
          TR.sfx.land();
          break;
        case 'over':
          outOfLives();
          break;
        case 'win':
          won(e.a);
          break;
      }
    }
    s.events.length = 0;
  }

  // ---------------------------------------------------------------- winning and losing

  function won(i) {
    G.state = 'won';
    const s = G.s, ids = runnerIds();
    const a = people[ids[i]];
    a.react('over');
    ids.forEach((id, k) => { if (k !== i) people[id].react('cheer'); });
    TR.sfx.win();
    TR.buddy.dismiss();
    const p = ST.toScreen(a.root.position.clone().setY(a.root.position.y + 0.8));
    TR.fx.overlay.burst(p.x, p.y, 50, ['💰', '⭐', '🎉'], 1.2);
    later(0.4, () => TR.fx.overlay.rain(110));
    const levelScore = s.score;
    G.runScore += levelScore;
    G.banked = true;
    G.lives = Math.min(CFG.maxLives, s.lives + 1);
    const hiWas = save.hi[G.tier];
    const newHi = G.runScore > hiWas;
    if (newHi) save.hi[G.tier] = G.runScore;
    if (!G.level.mine) save.done[profile()][G.level.id] = 1;
    store();
    G.result = { who: ids[i], levelScore, score: G.runScore, hi: save.hi[G.tier], newHi, gold: s.got, level: G.level.id };
    later(2.4, showWinPanel);
  }

  function showWinPanel() {
    if (G.state !== 'won') return;
    G.state = 'result';
    const r = G.result, lv = G.level;
    const last = !lv.mine && LEVELS.indexOf(lv) === LEVELS.length - 1;
    ui.wFace.innerHTML = G.players === 2 ? faceImg('teddy') + faceImg('tommy') : faceImg(r.who) + '<span class="big">💰</span>';
    ui.wTitle.textContent = last ? 'ALL 30 LEVELS! TREASURE CHAMPION!' : G.players === 2 ? 'TEAM TT DID IT!' : `YOU DID IT, ${NAME[r.who]}!`;
    ui.wInfo.innerHTML = `<span>SCORE <b>${r.score}</b></span><span>HI-SCORE <b>${r.hi}</b></span><span>💰 <b>${r.gold}</b></span><span>❤️ +1</span>` + (r.newHi ? '<span class="rec">NEW HI-SCORE!</span>' : '');
    ui.wNext.innerHTML = lv.mine ? '✏️' : '▶';
    ui.wNext.setAttribute('aria-label', lv.mine ? 'Back to the level maker' : 'Next level');
    show(ui.winPanel, true);
    TR.sfx.win();
  }

  function outOfLives() {
    G.state = 'out';
    TR.sfx.over();
    TR.buddy.dismiss();
    const hiWas = save.hi[G.tier];
    const score = shownScore();
    if (score > hiWas) save.hi[G.tier] = score;
    store();
    G.result = { score, hi: save.hi[G.tier], newHi: score > hiWas };
    later(1.6, () => {
      if (G.state !== 'out') return;
      ui.oFace.innerHTML = runnerIds().map(faceImg).join('') + '<span class="big">🎈</span>';
      ui.oInfo.innerHTML = `<span>SCORE <b>${G.result.score}</b></span><span>HI-SCORE <b>${G.result.hi}</b></span>` + (G.result.newHi ? '<span class="rec">NEW HI-SCORE!</span>' : '');
      show(ui.overPanel, true);
    });
  }

  // ---------------------------------------------------------------- your brother, the high five

  function call() {
    if (!['play', 'ready', 'won'].includes(G.state)) return;
    if (G.players === 2) return TR.highFive.start();
    return TR.buddy.call();
  }

  const buddyApi = {
    get flyers() { return flyers; },
    scale: () => CFG.buddy,
    toast,
    state: () => G.s,
    world: () => G.world,
    player: () => runnerActor(0),
    players: () => runnerIds().map((id) => people[id]),
  };

  // ---------------------------------------------------------------- the level maker

  function openEditor(slot) {
    stopDemo();
    clearLevel();
    hideAll();
    G.state = 'editor';
    G.timers = [];
    show(ui.editor, true);
    TR.editor.open(slot);
    layout();
  }

  const editorApi = {
    art: () => art,
    toast,
    save: (slot, rows) => {
      save.mine[slot] = rows;
      store();
    },
    load: (slot) => save.mine[slot],
    test: (slot) => {
      G.runScore = 0;
      G.players = prefs.players;
      G.tier = prefs.tier;
      G.lives = TR.TIERS[prefs.tier].lives;
      startLevel(mineLevel(slot));
    },
    home: () => goHome(),
  };

  // ---------------------------------------------------------------- input

  let gestured = false;
  function gesture() {
    if (gestured) return;
    gestured = true;
    S.init();
    S.music(G.state === 'home' ? 'title' : 'play');
  }

  const DIRKEY = { arrowleft: [1, LEFT], arrowright: [1, RIGHT], arrowup: [1, UP], arrowdown: [1, DOWN], a: [0, LEFT], d: [0, RIGHT], w: [0, UP], s: [0, DOWN] };
  const DIGKEY = { z: [0, -1], x: [0, 1], q: [0, -1], e: [0, 1], ',': [1, -1], '.': [1, 1], '<': [1, -1], '>': [1, 1] };
  const playerFor = (p) => (G.players === 2 ? p : 0);
  function mirrored(dir) {
    if (SAB !== 'mirror') return dir;
    return dir === LEFT ? RIGHT : dir === RIGHT ? LEFT : dir;
  }

  function bindInput() {
    const tap = (el, fn) => el.addEventListener('click', (e) => {
      gesture();
      fn(e);
    });
    tap(ui.goPlay, () => showLevels());
    tap(ui.goMake, () => openEditor(0));
    for (const b of ui.segPlayers.children) tap(b, () => setPref('players', +b.dataset.v));
    for (const b of ui.segWho.children) tap(b, () => setPref('who', b.dataset.v));
    for (const b of ui.segLevel.children) tap(b, () => setPref('tier', b.dataset.v));
    for (const b of ui.lvTier.children) tap(b, () => {
      setPref('tier', b.dataset.v);
      G.tier = prefs.tier;
      for (const c of ui.lvTier.children) c.classList.toggle('on', c.dataset.v === prefs.tier);
    });
    tap(ui.lvHome, goHome);
    tap(ui.lvMake, () => openEditor(0));
    ui.callBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      gesture();
      call();
    });
    tap(ui.pauseBtn, () => pause(true));
    tap(ui.pResume, () => pause(false));
    tap(ui.pRestart, () => {
      show(ui.pause, false);
      restartLevel();
    });
    tap(ui.pLevels, () => showLevels());
    tap(ui.pHome, goHome);
    tap(ui.restartBtn, restartLevel);
    tap(ui.muteBtn, toggleMute);
    tap(ui.wNext, nextLevel);
    tap(ui.wAgain, () => restartLevel());
    tap(ui.wLevels, () => showLevels());
    tap(ui.wHome, goHome);
    tap(ui.oAgain, againAfterOver);
    tap(ui.oLevels, () => showLevels());
    tap(ui.oHome, goHome);
    bindPad(ui.dpad0, 0);
    bindPad(ui.dpad1, 1);
    digButton(ui.digL, 0, -1);
    digButton(ui.digR, 0, 1);
    // 2 players on a touch screen: each pad gets its own two dig buttons
    for (const p of [0, 1]) {
      const box = ui['digs' + p + 'b'];
      for (const d of [-1, 1]) {
        const b = document.createElement('button');
        b.className = 'digbtn';
        b.setAttribute('aria-label', d < 0 ? 'Dig left' : 'Dig right');
        b.innerHTML = `⛏️<span>${d < 0 ? '◀' : '▶'}</span>`;
        digButton(b, p, d);
        box.appendChild(b);
      }
    }
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchSeen = true; }, true);

    addEventListener('keydown', (e) => {
      if (G.state === 'editor') return; // js/editor.js has its own keys
      gesture();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      if (k === 'm' && !e.repeat) return toggleMute();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (e.repeat && !(k in DIRKEY)) return;
      if (G.state === 'home') {
        if (k === '1' || k === 'enter' || k === ' ') showLevels();
        else if (k === '2') openEditor(0);
        else if (k === 'arrowleft' || k === 'arrowright') setPref('who', prefs.who === 'teddy' ? 'tommy' : 'teddy');
        else if (k === 'arrowup' || k === 'arrowdown') setPref('players', prefs.players === 1 ? 2 : 1);
        else if (k === 'l') setPref('tier', prefs.tier === 'easy' ? 'normal' : 'easy');
        return;
      }
      if (G.state === 'levels') {
        const cols = getComputedStyle(ui.lvGrid).gridTemplateColumns.split(' ').length || 10;
        if (k === 'arrowleft' || k === 'a') moveFocus(-1);
        else if (k === 'arrowright' || k === 'd') moveFocus(1);
        else if (k === 'arrowup' || k === 'w') moveFocus(-cols);
        else if (k === 'arrowdown' || k === 's') moveFocus(cols);
        else if (k === 'enter' || k === ' ') {
          G.runScore = 0;
          G.lives = TR.TIERS[G.tier].lives;
          startLevel(LEVELS[G.focus]);
        } else if (k === 'l') {
          setPref('tier', prefs.tier === 'easy' ? 'normal' : 'easy');
          G.tier = prefs.tier;
          for (const c of ui.lvTier.children) c.classList.toggle('on', c.dataset.v === prefs.tier);
        } else if (k === 'escape' || k === 'h') goHome();
        return;
      }
      if (k === 't') return call();
      if (G.state === 'paused') {
        if (k === 'escape' || k === 'p' || k === 'enter' || k === ' ') pause(false);
        else if (k === 'r') ui.pRestart.click();
        else if (k === 'l') showLevels();
        else if (k === 'h') goHome();
        return;
      }
      if (G.state === 'result') {
        if (k === 'enter' || k === ' ' || k === 'n') nextLevel();
        else if (k === 'r') restartLevel();
        else if (k === 'l') showLevels();
        else if (k === 'escape' || k === 'h') goHome();
        return;
      }
      if (G.state === 'out') {
        if (k === 'enter' || k === ' ' || k === 'r') againAfterOver();
        else if (k === 'l') showLevels();
        else if (k === 'escape' || k === 'h') goHome();
        return;
      }
      if (k === 'escape' || k === 'p') return pause(true);
      if (G.state !== 'play' && G.state !== 'ready') return;
      if (k === 'r') return restartLevel();
      if (k in DIRKEY) {
        const [p0, dir0] = DIRKEY[k], p = playerFor(p0), dir = mirrored(dir0);
        const h = heldKeys[p];
        const at = h.indexOf(dir);
        if (at >= 0) h.splice(at, 1);
        h.push(dir);
        return;
      }
      if (k in DIGKEY && !e.repeat) {
        const [p0, d] = DIGKEY[k];
        inputs[playerFor(p0)].dig = SAB === 'mirror' ? -d : d;
      }
    });
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (!(k in DIRKEY)) return;
      const [p0, dir0] = DIRKEY[k], dir = mirrored(dir0);
      // a key let go: take it out for both players (the player count may have changed since it went down)
      for (const p of [0, 1]) {
        const at = heldKeys[p].indexOf(dir);
        if (at >= 0 && (p === playerFor(p0) || G.players === 1)) heldKeys[p].splice(at, 1);
      }
    });
    addEventListener('blur', () => { heldKeys[0].length = heldKeys[1].length = 0; });
    addEventListener('resize', layout);
    document.addEventListener('visibilitychange', () => (document.hidden ? S.suspend() : S.resume()));
    Kit.lang.onChange(() => {
      if (G.state === 'levels') buildGrid();
      bursts.clear();
      layout();
    });
  }

  function pause(on) {
    if (on && (G.state === 'play' || G.state === 'ready')) {
      G.pausedFrom = G.state;
      G.state = 'paused';
      show(ui.pause, true);
      S.music('pause');
    } else if (!on && G.state === 'paused') {
      G.state = G.pausedFrom || 'play';
      show(ui.pause, false);
      S.music('play');
    }
  }

  function toggleMute() {
    const muted = S.toggleMute();
    ui.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  // ---------------------------------------------------------------- the loop

  function step(dt, draw = true) {
    dt = Math.min(dt, 0.1);
    if ((innerWidth || 1) !== ST.W || (innerHeight || 1) !== ST.H) layout();
    const running = G.state !== 'paused' && G.state !== 'boot';
    if (running) {
      for (let i = G.timers.length - 1; i >= 0; i--) {
        const tm = G.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) {
          G.timers.splice(i, 1);
          tm.fn();
        }
      }
      if (G.state === 'home' || G.state === 'levels') demoUpdate(dt);
      if (G.count > 0) countUpdate(dt);
      const s = G.s;
      if (s && (G.state === 'play' || G.state === 'won' || G.state === 'out' || G.state === 'result')) {
        if (G.state === 'play') {
          for (const p of [0, 1]) inputs[p].dir = touchDir[p] || heldKeys[p][heldKeys[p].length - 1] || 0;
          if (G.auto) G.auto.tick(inputs[0], dt);
        }
        TR.step(s, dt, G.state === 'play' ? inputs : []);
        events(s);
        refreshHud();
        stuckHint(s, dt);
      }
      if (s && G.world) {
        G.world.update(s, dt);
        syncRunners(s, G.world, runnerIds(), dt);
      }
      ST.update(dt);
      flyers.update(dt);
      bursts.update(dt);
      people.teddy.update(dt);
      people.tommy.update(dt);
      TR.buddy.update(dt);
      TR.highFive.update(dt);
    }
    TR.fx.overlay.update(dt);
    ui.callBtn.classList.toggle('here', TR.buddy.on || TR.highFive.on);
    if (draw) ST.render();
  }

  // stuck where nothing can get you to the gold (or the exit)? say so, and the 🔄 button glows
  function stuckHint(s, dt) {
    const stuck = G.state === 'play' && s.runners.some((r) => r.stuck);
    G.stuckT = stuck ? G.stuckT + dt : 0;
    ui.restartBtn.classList.toggle('glow', G.stuckT > 1);
    if (G.stuckT > 1 && !G.stuckSaid) {
      G.stuckSaid = true;
      toast(usingTouch() ? 'STUCK? TAP 🔄 TO TRY AGAIN!' : 'STUCK? PRESS R TO TRY AGAIN!', 'hint');
    }
    if (!stuck) G.stuckSaid = false;
  }

  function frame(now) {
    const dt = G.last ? (now - G.last) / 1000 : 0.016;
    G.last = now;
    if (!G.held) step(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot

  function boot() {
    const ids = ['canvas:game', 'home', 'hud', 'logo', 'goPlay', 'goMake', 'segPlayers', 'segWho', 'segLevel', 'hiEasy', 'hiNormal', 'levels', 'lvFace', 'lvTier', 'lvDone',
      'lvGrid', 'lvMine', 'lvMineLabel', 'lvMake', 'lvHome', 'pauseBtn', 'lvlName', 'goldGot', 'goldAll', 'score', 'hi', 'lives', 'restartBtn', 'muteBtn',
      'pad0', 'pad1', 'dpad0', 'dpad1', 'digpad', 'digL', 'digR', 'digs0b', 'digs1b', 'callBtn', 'callFace', 'five', 'toasts', 'count',
      'winPanel', 'wFace', 'wTitle', 'wInfo', 'wNext', 'wAgain', 'wLevels', 'wHome', 'overPanel', 'oFace', 'oInfo', 'oAgain', 'oLevels', 'oHome',
      'pause', 'pResume', 'pRestart', 'pLevels', 'pHome', 'editor'];
    ui = {};
    for (const s of ids) {
      const [k, id] = s.includes(':') ? s.split(':') : [s, s];
      ui[k] = $(id);
    }
    ui.hudtop = document.querySelector('.hudtop');
    const words = window.TR_TITLE.split(' ');
    ui.logo.querySelector('small').textContent = words.length > 1 ? words[0] : '';
    ui.logo.querySelector('big').textContent = words.length > 1 ? words.slice(1).join(' ') : words[0];
    ui.muteBtn.textContent = S.isMuted() ? '🔇' : '🔊';
    ST.init(ui.canvas);
    TR.fx.overlay.init($('fx'));
    flyers = TR.fx.flyers(ST.scene, 80);
    bursts = TR.fx.bursts(ST.scene, 6);
    for (const id of ['teddy', 'tommy']) {
      people[id].attach(ST.scene, flyers);
      const e = people[id].set(id, CFG.scale);
      tags[id] = Kit.gfx.nameTag(e.name, e.tag || '#ffffff');
      tags[id].position.y = 2.75;
      tags[id].scale.multiplyScalar(2.6);
      people[id].person.root.add(tags[id]);
    }
    art = Kit.portraits(['teddy', 'tommy'].map((id) => Kit.roster.get(id)), { size: 160 });
    ui.segWho.children[0].querySelector('img').src = art.teddy;
    ui.segWho.children[1].querySelector('img').src = art.tommy;
    TR.buddy.init(buddyApi);
    TR.editor.init(editorApi);
    bindInput();
    goHome();
    $('loading').classList.add('hidden');
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hook

  window.game = {
    // advance `secs` of game time in 1/60 s steps, rendering once at the end (works while the tab's animation is throttled)
    step(secs = 0.1) {
      const n = Math.max(1, Math.round(secs * 60));
      for (let i = 0; i < n; i++) step(1 / 60, i === n - 1);
      return game.info();
    },
    hold(on = true) { G.held = on; },
    // start({ level: 1..30, tier: 'easy' | 'normal', players: 1 | 2, who: 'teddy' | 'tommy', go: true (skip READY?) })
    start(opts = {}) {
      gesture();
      for (const k of ['players', 'who', 'tier']) if (opts[k]) prefs[k] = opts[k];
      store();
      G.runScore = 0;
      G.lives = opts.lives || TR.TIERS[prefs.tier].lives;
      const lv = typeof opts.level === 'object' ? opts.level : LEVELS.find((l) => l.id === (opts.level || 1)) || LEVELS[0];
      startLevel(lv, opts);
      if (opts.go) {
        G.state = 'play';
        G.count = 0;
        show(ui.count, false);
      }
      return game.info();
    },
    home: () => goHome(),
    levels: () => showLevels(),
    editor: (slot = 0) => openEditor(slot),
    restart: () => restartLevel(),
    next: () => nextLevel(),
    call: () => call(),
    pause: (on = true) => pause(on),
    // real key events on the window, like a keyboard
    key(k, down = true) {
      const code = k.length === 1 ? 'Key' + k.toUpperCase() : k;
      dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code, bubbles: true }));
    },
    // put runner i on cell (x, y), standing still (to test the keys on a ladder or a bar)
    place(x, y, i = 0) {
      const r = G.s.runners[i];
      Object.assign(r, { x, y, tx: x, ty: y, p: 0, moving: false, how: 'stand' });
      return game.info();
    },
    // the autopilot plays the solver's moves (robots still chase you): for the win panel and the flow, not the keys
    auto(on = true) {
      G.auto = on && G.s ? makePilot(G.s, TR.solve(G.s.spec).moves || []) : null;
    },
    check: (opts) => TR.check(Object.assign({ quick: true }, opts)),
    // where a cell, or a runner, is on the screen (pixels)
    screen(x, y) {
      return ST.toScreen(G.world.at(x, y).setY(G.world.at(x, y).y + 0.4));
    },
    runnerScreen(i = 0) {
      const a = runnerActor(i);
      return ST.toScreen(a.root.position.clone().setY(a.root.position.y + 0.4));
    },
    info() {
      const s = G.s;
      return {
        state: G.state, players: G.players, who: G.who, tier: G.tier, level: G.level && G.level.id, score: shownScore(), lives: s ? s.lives : G.lives,
        runners: s ? s.runners.map((r) => ({ x: r.x, y: r.y, tx: r.tx, ty: r.ty, p: +r.p.toFixed(2), how: r.how, moving: r.moving, stuck: r.stuck, face: r.face })) : [],
        robots: s ? s.robots.map((b) => ({ x: b.x, y: b.y, how: b.how, gold: b.gold })) : [],
        gold: s ? { got: s.got, left: s.left, carried: s.carried, total: s.spec.total } : null, exitOpen: s ? s.exitOpen : false, won: s ? s.won : false,
        holes: s ? s.holes : 0, inputs: inputs.map((i) => i.dir), buddy: TR.buddy.info(), result: G.result,
        panel: ['winPanel', 'overPanel', 'pause', 'levels', 'editor'].find((p) => !ui[p].classList.contains('hidden')) || null,
        pads: ['pad0', 'pad1', 'digpad'].filter((p) => !ui[p].classList.contains('hidden')),
      };
    },
    get G() { return G; },
    get save() { return save; },
    CFG,
    sabotage: SAB,
  };

  let booted = false;
  const go = () => {
    if (booted) return;
    booted = true;
    boot();
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
  setTimeout(go, 1500);
})();
