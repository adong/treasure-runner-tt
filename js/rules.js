/* TT Treasure Runner: the rules, with no Three.js and no page in them (tools/check.js runs this same file in Node).
   A level is a grid of cells, row 0 at the top (the sky):
     .  empty          #  brick (you can dig it)        @  stone (you can't)
     H  ladder         -  bar (hand over hand)           $  gold
     S  the exit ladder: hidden until every bit of gold is in, then a ladder
     1  Teddy's start (1 player: you)    2  Tommy's start (2 players)    R  a robot vacuum's start
   Everyone moves one cell at a time (and slides smoothly between cells). You can't jump: you walk, climb, hang from bars and
   fall. Z / X dig the brick to your lower left / lower right; the hole stays open a few seconds, then fills back in. A robot
   that falls into a hole is stuck there for a while (and drops any gold it was carrying), then climbs out; if the hole fills
   first it pops back in at the top. You can walk over a stuck robot. If a hole fills with you inside, you pop up out of it.
   Collect all the gold and the exit ladder appears: climb to the top row to win.
     TR.parse(level)               a level's rows → spec (cells, gold, starts, robots)
     TR.create(spec, opts)         a fresh game: { tier: 'easy' | 'normal', players: 1 | 2, robots: true, lives, seed, sabotage }
     TR.step(s, dt, inputs)        advance dt seconds; inputs[i] = { dir: 0 none, 1 left, 2 right, 3 up, 4 down, dig: -1 / 1 }
     TR.restart(s)                 the level from the start again (lives kept)
     TR.solve(spec)                the solver: the moves that clear the level with the robots switched off
     TR.reach(s, r)                can runner r still get some gold (or the exit)? (the "stuck? press R" helper) */
(function () {
  'use strict';
  const TR = (typeof window !== 'undefined' ? window : globalThis).TR = (typeof window !== 'undefined' ? window : globalThis).TR || {};

  const E = 0, BRICK = 1, STONE = 2, LADDER = 3, BAR = 4, EXIT = 5;
  const TILE = { '.': E, ' ': E, '#': BRICK, '@': STONE, H: LADDER, '-': BAR, S: EXIT, $: E, 1: E, 2: E, R: E };
  const CHAR = ['.', '#', '@', 'H', '-', 'S'];
  const NONE = 0, LEFT = 1, RIGHT = 2, UP = 3, DOWN = 4;

  // 🐣 EASY (Tommy, 5): slower robots, holes that stay open longer, more lives. 🔥 NORMAL (Teddy, 8). Speeds in cells a second.
  const TIERS = {
    easy: { run: 4.2, climb: 3.6, fall: 6.5, robot: 1.8, robotFall: 4.2, hole: 8, stuck: 4.5, dig: 0.34, catchR: 0.5, lives: 5, respawn: 1.8, caught: 1.7, ready: 1.4, carry: [4, 8], pick: 0.5 },
    normal: { run: 4.8, climb: 4.2, fall: 7.5, robot: 3.0, robotFall: 5.5, hole: 5, stuck: 3, dig: 0.3, catchR: 0.62, lives: 3, respawn: 1.2, caught: 1.7, ready: 1.1, carry: [3, 7], pick: 0.6 },
  };
  const SCORE = { gold: 100, stuck: 50, trap: 200, clear: 1000 };
  const BUDDY_HOLE = 1.6; // your brother's holes stay open this many times as long as yours
  const TICK = 1 / 60;

  // ---------------------------------------------------------------- levels

  function parse(level) {
    const rows = level.rows.map((r) => r.replace(/\s+$/, ''));
    const H = rows.length, W = Math.max(...rows.map((r) => r.length));
    const n = W * H;
    const tiles = new Uint8Array(n), gold = new Uint8Array(n);
    const starts = [], robots = [], exits = [], goldList = [], bad = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = rows[y][x] || '.';
        const c = y * W + x;
        if (!(ch in TILE)) bad.push(ch);
        tiles[c] = TILE[ch] || E;
        if (ch === '$') { gold[c] = 1; goldList.push(c); }
        if (ch === '1') starts[0] = c;
        if (ch === '2') starts[1] = c;
        if (ch === 'R') robots.push(c);
        if (ch === 'S') exits.push(c);
      }
    }
    const gi = new Int8Array(n).fill(-1);
    goldList.forEach((c, i) => (gi[c] = i));
    const spec = { id: level.id, name: level.name || '', W, H, n, tiles, gold, gi, goldList, total: goldList.length, starts, robots, exits, bad, rows };
    if (starts[0] == null) starts[0] = 0;
    if (starts[1] == null) starts[1] = partnerStart(spec);
    spec.rest = restCells(spec);
    return spec;
  }

  // 2 players and no '2' in the level: the nearest standing spot beside the first start
  function partnerStart(spec) {
    const { W, starts } = spec, s0 = starts[0], x0 = s0 % W, y0 = (s0 / W) | 0;
    for (const dx of [1, -1, 2, -2, 3, -3]) {
      const x = x0 + dx;
      if (x < 0 || x >= W) continue;
      const c = y0 * W + x;
      if (spec.tiles[c] !== BRICK && spec.tiles[c] !== STONE && !spec.gold[c] && staticSup(spec, x, y0)) return c;
    }
    return s0;
  }

  function staticSup(spec, x, y) {
    const { W, H, tiles } = spec;
    if (y >= H - 1) return true;
    const t = tiles[y * W + x];
    if (t === BAR || t === LADDER) return true;
    const b = tiles[(y + 1) * W + x];
    return b === BRICK || b === STONE || b === LADDER;
  }

  // The cells a runner can stand in, reachable from the start (exit shut): where a robot may put gold down.
  function restCells(spec) {
    const rest = new Uint8Array(spec.n);
    const r = reachFrom(spec, { x: spec.starts[0] % spec.W, y: (spec.starts[0] / spec.W) | 0, h: false }, { mask: 0, full: -1, open: false });
    for (let k = 0; k < r.seen.length; k++) {
      if (r.seen[k] && !(k & 1)) {
        const c = k >> 1;
        if (spec.tiles[c] === E) rest[c] = 1;
      }
    }
    for (const c of spec.goldList) rest[c] = 1; // gold's own homes always count
    return rest;
  }

  // ---------------------------------------------------------------- a game

  function create(spec, opts = {}) {
    const tier = TIERS[opts.tier] ? opts.tier : 'easy';
    const cfg = Object.assign({}, TIERS[tier]);
    const s = {
      spec, tier, cfg, opts, W: spec.W, H: spec.H, t: 0,
      hole: new Uint8Array(spec.n), holeT: new Float32Array(spec.n), holes: 0, long: new Uint8Array(spec.n),
      gold: spec.gold.slice(), left: spec.total, carried: 0, got: 0, exitOpen: false,
      runners: [], robots: [], events: [], score: 0, lives: opts.lives != null ? opts.lives : cfg.lives,
      won: false, wonBy: -1, over: false, ready: 0, seed: (opts.seed != null ? opts.seed : 20261024) >>> 0, sab: opts.sabotage || null,
      reachT: 0,
    };
    const players = opts.players === 2 ? 2 : 1;
    for (let i = 0; i < players; i++) s.runners.push(actor('runner', i, spec.starts[i], spec.W));
    if (opts.robots !== false) spec.robots.forEach((c, i) => s.robots.push(actor('robot', i, c, spec.W)));
    if (s.left === 0) s.exitOpen = true;
    return s;
  }

  function actor(kind, i, c, W) {
    const x = c % W, y = (c / W) | 0;
    return {
      kind, i, home: c, x, y, tx: x, ty: y, p: 0, moving: false, how: 'stand', face: kind === 'robot' ? -1 : 1,
      digT: 0, digAt: -1, digBuf: 0, digBufT: 0, dir: 0, stuckT: 0, gold: -1, carryT: 0, outT: 0, caughtT: 0, waitT: 0,
      stuck: false, cx: x, cy: y,
    };
  }

  function restart(s) {
    const n = create(s.spec, Object.assign({}, s.opts, { lives: s.lives }));
    if (s.sab === 'restart') { // sabotage: R keeps the gold you'd picked up
      n.gold = s.gold.slice();
      n.left = s.left;
      n.got = s.got;
    }
    return n;
  }

  // ---------------------------------------------------------------- helpers

  const rnd = (s) => {
    s.seed = (s.seed + 0x6d2b79f5) >>> 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ev = (s, type, a, b) => s.events.push({ type, a, b, t: s.t });
  const inB = (s, x, y) => x >= 0 && x < s.W && y >= 0 && y < s.H;
  const tileAt = (s, x, y) => s.spec.tiles[y * s.W + x];
  const ladderish = (s, t) => t === LADDER || (t === EXIT && s.exitOpen);
  // the cell an actor is nearest to (half way through a step it belongs to the next cell)
  const cellOf = (s, a) => (a.moving && a.p >= 0.5 ? a.ty * s.W + a.tx : a.y * s.W + a.x);
  const fx = (a) => (a.how === 'caught' ? a.cx : a.x + (a.tx - a.x) * a.p);
  const fy = (a) => (a.how === 'caught' ? a.cy : a.y + (a.ty - a.y) * a.p);

  function passable(s, x, y) {
    if (!inB(s, x, y)) return false;
    const c = y * s.W + x, t = s.spec.tiles[c];
    if (t === STONE) return false;
    if (t === BRICK) return s.hole[c] === 2;
    return true;
  }

  function robotAt(s, c, not) {
    for (const o of s.robots) if (o !== not && o.how !== 'out' && cellOf(s, o) === c) return o;
    return null;
  }
  // a robot standing or moving into cell c (robots never share a cell)
  function robotIn(s, c, not) {
    for (const o of s.robots) {
      if (o === not || o.how === 'out') continue;
      if (o.y * s.W + o.x === c || (o.moving && o.ty * s.W + o.tx === c)) return o;
    }
    return null;
  }

  function supported(s, x, y, a) {
    if (a && a.kind === 'runner' && s.sab === 'float') return true; // sabotage: runners never fall
    if (y >= s.H - 1) return true;
    const t = tileAt(s, x, y);
    if (ladderish(s, t)) return true;
    if (t === BAR) return true;
    const c2 = (y + 1) * s.W + x, b = s.spec.tiles[c2];
    if (b === STONE || ladderish(s, b)) return true;
    if (b === BRICK && s.hole[c2] !== 2) return true;
    return !s.opts.ghost && !!robotAt(s, c2, a); // standing on a robot's head (not on the title screen's ghost robots)
  }

  function canEnter(s, x, y, a) {
    if (!passable(s, x, y)) return false;
    const c = y * s.W + x;
    if (a.kind === 'runner') {
      if (s.opts.ghost) return true;
      const o = robotAt(s, c, null);
      return !(o && o.how === 'hole'); // a stuck robot fills its hole: walk over it, not into it
    }
    return !robotIn(s, c, a);
  }

  function go(a, dx, dy, how) {
    a.tx = a.x + dx;
    a.ty = a.y + dy;
    a.p = 0;
    a.moving = true;
    a.how = how;
    if (dx) a.face = dx;
  }

  function stop(a, x, y) {
    a.x = a.tx = x;
    a.y = a.ty = y;
    a.p = 0;
    a.moving = false;
  }

  function speedOf(s, a) {
    const c = s.cfg;
    if (a.kind === 'runner') return a.how === 'fall' ? c.fall : a.how === 'climb' ? c.climb : c.run;
    if (a.how === 'fall') return c.robotFall;
    if (a.how === 'climbout') return c.robot * 0.8;
    return c.robot;
  }

  const restingHow = (s, x, y) => {
    const t = tileAt(s, x, y);
    if (t === BAR) return 'bar';
    if (ladderish(s, t)) return 'ladder';
    if (t === BRICK && s.hole[y * s.W + x] === 2) return 'hole';
    return 'stand';
  };

  // ---------------------------------------------------------------- the clock

  function step(s, dt, inputs) {
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, TICK);
      tick(s, h, inputs || []);
      left -= h;
    }
    return s;
  }

  function tick(s, dt, inputs) {
    s.t += dt;
    if (s.won || s.over) return;
    if (s.ready > 0) s.ready = Math.max(0, s.ready - dt);
    holes(s, dt);
    s.runners.forEach((r, i) => runner(s, r, inputs[i], dt));
    if (s.won) return;
    if (!s.ready) for (const b of s.robots) robot(s, b, dt);
    if (!s.ready) catches(s);
    for (const r of s.runners) if (s.exitOpen && !r.moving && r.y === 0 && r.how !== 'caught' && !s.won) win(s, r);
    s.reachT -= dt;
    if (s.reachT <= 0) {
      s.reachT = 0.5;
      for (const r of s.runners) if (atRest(s, r)) r.stuck = !reach(s, r);
    }
  }

  const atRest = (s, r) => !r.moving && r.how !== 'dig' && r.how !== 'caught' && r.how !== 'fall' && supported(s, r.x, r.y, r);

  // ---------------------------------------------------------------- holes

  function holes(s, dt) {
    if (!s.holes) return;
    let open = 0;
    for (let c = 0; c < s.spec.n; c++) {
      if (!s.hole[c]) continue;
      s.holeT[c] -= dt;
      if (s.holeT[c] > 0) { open++; continue; }
      if (s.hole[c] === 1) {
        s.hole[c] = 2;
        s.holeT[c] = s.cfg.hole * (s.long[c] ? BUDDY_HOLE : 1); // your brother's holes stay open a bit longer
        s.long[c] = 0;
        open++;
        ev(s, 'open', c);
      } else if (s.sab === 'nofill') {
        s.holeT[c] = 1e9; // sabotage: holes never fill
        open++;
      } else fill(s, c);
    }
    s.holes = open;
  }

  function fill(s, c) {
    s.hole[c] = 0;
    s.holeT[c] = 0;
    ev(s, 'fill', c);
    // anyone less than half way into the cell turns back; anyone in it pops out (a runner) or is trapped (a robot)
    for (const a of s.runners.concat(s.robots)) {
      if (a.moving && a.ty * s.W + a.tx === c && a.p < 0.5) stop(a, a.x, a.y);
    }
    for (const r of s.runners) if (r.how !== 'caught' && cellOf(s, r) === c) pop(s, r, c);
    for (const b of s.robots) if (b.how !== 'out' && cellOf(s, b) === c) trapped(s, b, c);
  }

  // The brick grows back with a runner inside: he pops up out of it (never stuck, never squashed).
  function pop(s, r, c) {
    const W = s.W, x = c % W, y = (c / W) | 0;
    if (s.sab === 'trap') { // sabotage: he stays inside the brick
      stop(r, x, y);
      r.how = 'stand';
      return;
    }
    let to = -1;
    for (let yy = y - 1; yy >= 0 && to < 0; yy--) if (passable(s, x, yy)) to = yy * W + x;
    if (to < 0) {
      let best = 1e9;
      for (let k = 0; k < s.spec.n; k++) {
        const kx = k % W, ky = (k / W) | 0;
        const d = Math.abs(kx - x) + Math.abs(ky - y);
        if (d && d < best && passable(s, kx, ky)) { best = d; to = k; }
      }
    }
    stop(r, to % W, (to / W) | 0);
    r.how = 'stand';
    r.digT = 0;
    ev(s, 'pop', r.i, c);
  }

  function trapped(s, b, c) {
    if (b.gold >= 0) dropGold(s, b, b.gold);
    stop(b, c % s.W, (c / s.W) | 0);
    b.how = 'out';
    b.outT = s.cfg.respawn;
    s.score += SCORE.trap;
    ev(s, 'trap', b.i, c);
  }

  function canDig(s, r, d) {
    if (r.moving || r.how === 'dig' || r.how === 'caught') return false;
    const x = r.x, y = r.y;
    if (!supported(s, x, y, r) || tileAt(s, x, y) === BAR) return false; // not while falling or hanging
    const tx = x + d, ty = y + 1;
    if (!inB(s, tx, ty)) return false;
    const c = ty * s.W + tx, above = y * s.W + tx;
    if (s.spec.tiles[c] !== BRICK || s.hole[c]) return false; // bricks only, and not one that's already dug
    const ta = s.spec.tiles[above];
    // the cell beside him must be clear: no ladder, bar, wall, gold or anybody in it (an open hole is fine)
    if (!(ta === E || (ta === BRICK && s.hole[above] === 2)) || s.gold[above]) return false;
    for (const o of s.runners) if (o !== r && o.how !== 'caught' && cellOf(s, o) === above) return false;
    if (!s.opts.ghost && robotIn(s, above, null)) return false;
    return true;
  }

  function startDig(s, r, d) {
    const c = (r.y + 1) * s.W + r.x + d;
    r.how = 'dig';
    r.digT = s.cfg.dig;
    r.face = d;
    r.digAt = c;
    s.hole[c] = 1;
    s.holeT[c] = s.cfg.dig;
    s.holes++;
    ev(s, 'dig', r.i, c);
  }

  // ---------------------------------------------------------------- runners

  function runner(s, r, inp, dt) {
    if (inp) {
      if (inp.dig) {
        r.digBuf = inp.dig;
        r.digBufT = 0.35;
        inp.dig = 0;
      }
      r.dir = inp.dir || 0;
    }
    if (r.digBufT > 0) {
      r.digBufT -= dt;
      if (r.digBufT <= 0) r.digBuf = 0;
    }
    if (r.how === 'caught') {
      r.caughtT -= dt;
      if (r.caughtT <= 0) respawnRunner(s, r);
      return;
    }
    if (r.how === 'dig') {
      r.digT -= dt;
      if (r.digT > 0) return;
      r.how = restingHow(s, r.x, r.y);
    }
    let time = dt;
    for (let guard = 0; guard < 4 && time > 1e-9; guard++) {
      if (r.moving) {
        reverse(s, r);
        const sp = speedOf(s, r), need = (1 - r.p) / sp;
        if (time < need) {
          r.p += time * sp;
          break;
        }
        time -= need;
        arrive(s, r);
        if (s.won || r.how === 'caught') return;
      } else if (!decide(s, r)) break;
    }
  }

  // Turn round half way through a step (walking, hanging or climbing), so the keys feel quick.
  function reverse(s, r) {
    const d = r.dir, dx = r.tx - r.x, dy = r.ty - r.y;
    const back = (dx === 1 && d === LEFT) || (dx === -1 && d === RIGHT) || (dy === -1 && d === DOWN && r.how === 'climb') || (dy === 1 && d === UP && r.how === 'climb');
    if (!back || r.how === 'fall') return;
    [r.x, r.tx] = [r.tx, r.x];
    [r.y, r.ty] = [r.ty, r.y];
    r.p = 1 - r.p;
    if (dx) r.face = -dx;
  }

  function decide(s, r) {
    const x = r.x, y = r.y;
    if (!supported(s, x, y, r)) {
      if (r.how !== 'fall') ev(s, 'fall', r.i);
      go(r, 0, 1, 'fall');
      return true;
    }
    if (r.how === 'fall') ev(s, 'land', r.i);
    const t = tileAt(s, x, y);
    r.how = restingHow(s, x, y);
    if (r.digBuf && canDig(s, r, r.digBuf)) {
      startDig(s, r, r.digBuf);
      r.digBuf = 0;
      r.digBufT = 0;
      return false;
    }
    const d = r.dir;
    if (d === LEFT || d === RIGHT) {
      const dx = d === LEFT ? -1 : 1;
      r.face = dx;
      if (!canEnter(s, x + dx, y, r)) return false;
      go(r, dx, 0, t === BAR || tileAt(s, x + dx, y) === BAR ? 'bar' : 'walk');
      return true;
    }
    if (d === UP) {
      if (!ladderish(s, t) || y === 0 || !canEnter(s, x, y - 1, r)) return false;
      go(r, 0, -1, 'climb');
      return true;
    }
    if (d === DOWN) {
      if (y >= s.H - 1 || !canEnter(s, x, y + 1, r)) return false;
      if (ladderish(s, tileAt(s, x, y + 1)) || ladderish(s, t)) go(r, 0, 1, 'climb');
      else if (t === BAR) go(r, 0, 1, 'fall'); // let go of the bar
      else return false;
      return true;
    }
    return false;
  }

  function arrive(s, a) {
    a.x = a.tx;
    a.y = a.ty;
    a.p = 0;
    a.moving = false;
    const c = a.y * s.W + a.x;
    if (a.kind === 'robot') return robotArrive(s, a, c);
    // sabotage 'nobar': a falling runner goes straight through bars
    if (a.how === 'fall' && s.sab === 'nobar' && tileAt(s, a.x, a.y) === BAR && !supportedBelow(s, a.x, a.y, a)) {
      a.moving = true;
      a.ty = a.y + 1;
      a.tx = a.x;
    }
    if (s.gold[c]) {
      s.gold[c] = 0;
      s.left--;
      s.got++;
      s.score += SCORE.gold;
      ev(s, 'gold', a.i, c);
      openExit(s);
    }
    if (s.exitOpen && a.y === 0 && !a.moving) win(s, a);
  }

  function supportedBelow(s, x, y, a) {
    if (y >= s.H - 1) return true;
    const c2 = (y + 1) * s.W + x, b = s.spec.tiles[c2];
    return b === STONE || ladderish(s, b) || (b === BRICK && s.hole[c2] !== 2) || !!robotAt(s, c2, a);
  }

  function openExit(s) {
    if (!s.exitOpen && s.left === 0 && s.carried === 0) {
      s.exitOpen = true;
      ev(s, 'exit');
    }
  }

  function win(s, r) {
    s.won = true;
    s.wonBy = r.i;
    s.score += SCORE.clear;
    ev(s, 'win', r.i);
  }

  function respawnRunner(s, r) {
    if (s.lives <= 0) {
      s.over = true;
      ev(s, 'over');
      return;
    }
    stop(r, r.home % s.W, (r.home / s.W) | 0);
    r.how = 'stand';
    r.digBuf = 0;
    r.stuck = false;
    for (const b of s.robots) {
      if (b.gold >= 0) dropGold(s, b, b.gold);
      stop(b, b.home % s.W, (b.home / s.W) | 0);
      b.how = 'stand';
      b.stuckT = b.outT = b.waitT = 0;
    }
    s.ready = s.cfg.ready;
    ev(s, 'ready', r.i);
  }

  function catches(s) {
    if (s.opts.ghost) return;
    const R = s.cfg.catchR;
    for (const r of s.runners) {
      if (r.how === 'caught') continue;
      const rx = fx(r), ry = fy(r);
      for (const b of s.robots) {
        if (b.how === 'out' || b.how === 'hole') continue;
        if (Math.abs(fx(b) - rx) < R && Math.abs(fy(b) - ry) < R) {
          r.cx = rx;
          r.cy = ry;
          r.how = 'caught';
          r.caughtT = s.cfg.caught;
          r.moving = false;
          r.digBuf = 0;
          s.lives--;
          ev(s, 'caught', r.i, b.i);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- your brother's holes
  // Called in (1 player), the other brother digs a row of holes in the floor in front of the nearest robot, on the side
  // it would walk to get you. A hole needs a brick with nothing in the cell above it (no ladder, bar, gold or anybody).

  function holeOK(s, x, y) {
    if (!inB(s, x, y) || y === 0) return false;
    const c = y * s.W + x, above = c - s.W;
    if (s.spec.tiles[c] !== BRICK || s.hole[c] || s.spec.tiles[above] !== E || s.gold[above]) return false;
    for (const r of s.runners) if (r.how !== 'caught' && (cellOf(s, r) === above || cellOf(s, r) === c)) return false;
    return !robotIn(s, above, null);
  }

  function buddyPlan(s, max = 3) {
    // robots walking about, nearest to a runner first
    const cand = [];
    for (const b of s.robots) {
      if (b.how === 'out' || b.how === 'hole') continue;
      let bd = 1e9, near = null;
      for (const r of s.runners) {
        if (r.how === 'caught') continue;
        const d = Math.abs(fx(r) - fx(b)) + Math.abs(fy(r) - fy(b)) * 1.5;
        if (d < bd) { bd = d; near = r; }
      }
      if (near) cand.push({ b, d: bd, near });
    }
    if (!cand.length) return { robot: -1, cells: [] };
    cand.sort((p, q) => p.d - q.d);
    for (const { b, near } of cand) {
      // first choice: bricks under the cells it's about to walk through on its way to you, as far as it gets before they fill
      const route = chase(s, b, near, true) || [];
      const reach = Math.max(2, Math.floor((s.cfg.hole * BUDDY_HOLE - 1.5) * s.cfg.robot));
      // holes with something solid under them trap it; ones over thin air just drop it down a floor
      const traps = [], drops = [];
      for (const c of route.slice(0, reach)) {
        const x = c % s.W, y = (c / s.W) | 0;
        if (cellOf(s, near) === c) break; // not under your own feet
        if (s.spec.tiles[c] !== E || !holeOK(s, x, y + 1)) continue;
        const under = y + 2 >= s.H ? STONE : s.spec.tiles[c + 2 * s.W];
        (under === BRICK || under === STONE ? traps : drops).push(c + s.W);
      }
      const cells = (traps.length ? traps : drops).slice(0, max);
      if (cells.length) return { robot: b.i, cells, dir: 0 };
      const toward = fx(near) >= fx(b) ? 1 : -1;
      for (const dir of [toward, -toward]) {
        // the floor in front of it: up to three bricks within eight cells (a ladder or gold in the way is skipped)
        const cells = [];
        for (let k = 1; k <= 8 && cells.length < max; k++) {
          const x = b.x + dir * k, y = b.y + 1;
          if (!inB(s, x, b.y) || !passable(s, x, b.y)) break; // a wall: it can't come this way
          if (holeOK(s, x, y)) cells.push(y * s.W + x);
        }
        if (cells.length) return { robot: b.i, cells, dir };
      }
    }
    return { robot: cand[0].b.i, cells: [] };
  }

  function digAt(s, c) {
    if (!holeOK(s, c % s.W, (c / s.W) | 0)) return false;
    s.hole[c] = 1;
    s.holeT[c] = s.cfg.dig;
    s.long[c] = 1;
    s.holes++;
    ev(s, 'dig', -1, c);
    return true;
  }

  // ---------------------------------------------------------------- robots

  function robot(s, b, dt) {
    if (b.how === 'out') {
      b.outT -= dt;
      if (b.outT <= 0) respawnRobot(s, b);
      return;
    }
    if (b.gold >= 0 && b.how !== 'hole') b.carryT -= dt;
    if (b.how === 'hole') {
      b.stuckT -= dt;
      if (b.stuckT > 0) return;
      if (!climbOut(s, b)) {
        b.stuckT = 0.2;
        return;
      }
    }
    if (b.waitT > 0) {
      b.waitT -= dt;
      if (b.waitT > 0 && !b.moving) return;
    }
    let time = dt;
    for (let guard = 0; guard < 3 && time > 1e-9; guard++) {
      if (b.moving) {
        const sp = speedOf(s, b), need = (1 - b.p) / sp;
        if (time < need) {
          b.p += time * sp;
          break;
        }
        time -= need;
        arrive(s, b);
        if (b.how === 'hole' || b.how === 'out') break;
      } else if (!decideRobot(s, b)) break;
    }
  }

  function robotArrive(s, b, c) {
    if (s.hole[c] === 2 && supportedBelow(s, b.x, b.y, b)) {
      // in a hole: stuck for a while, and any gold it carried pops out on top
      b.how = 'hole';
      b.stuckT = s.cfg.stuck;
      s.score += SCORE.stuck;
      ev(s, 'stuck', b.i, c);
      if (b.gold >= 0 && s.sab !== 'keepgold') dropGold(s, b, c - s.W);
      return;
    }
    if (b.how === 'climbout') b.how = 'stand';
    if (s.gold[c] && b.gold < 0 && rnd(s) < s.cfg.pick) {
      s.gold[c] = 0;
      s.left--;
      s.carried++;
      b.gold = c;
      b.carryT = s.cfg.carry[0] + rnd(s) * (s.cfg.carry[1] - s.cfg.carry[0]);
      ev(s, 'grab', b.i, c);
    }
    if (b.gold >= 0 && b.carryT <= 0 && canHold(s, c) && staticSup(s.spec, b.x, b.y) && s.spec.tiles[c] === E) dropGold(s, b, c);
  }

  const canHold = (s, c) => c >= 0 && c < s.spec.n && s.spec.tiles[c] === E && !s.gold[c] && !!s.spec.rest[c];

  // Gold a robot lets go of lands at `c` if a runner could get it there, otherwise back where the robot found it.
  function dropGold(s, b, c) {
    let at = canHold(s, c) ? c : canHold(s, b.gold) ? b.gold : -1;
    if (at < 0) {
      let best = 1e9;
      const W = s.W, ox = b.gold % W, oy = (b.gold / W) | 0;
      for (let k = 0; k < s.spec.n; k++) {
        if (!canHold(s, k)) continue;
        const d = Math.abs((k % W) - ox) + Math.abs(((k / W) | 0) - oy);
        if (d < best) { best = d; at = k; }
      }
    }
    s.gold[at] = 1;
    s.left++;
    s.carried--;
    b.gold = -1;
    ev(s, 'drop', b.i, at);
  }

  // Out of the hole on the side away from nobody: a hop up and over the edge (it waits while you stand on its head).
  function climbOut(s, b) {
    const W = s.W, x = b.x, y = b.y;
    if (y === 0) return false;
    for (const r of s.runners) if (r.how !== 'caught' && cellOf(s, r) === (y - 1) * W + x) return false; // you're on its head
    const t = target(s, b);
    const first = t && fx(t) < x ? -1 : 1;
    for (const d of [first, -first]) {
      const nx = x + d, ny = y - 1;
      if (!passable(s, nx, ny) || robotIn(s, ny * W + nx, b)) continue;
      if (s.runners.some((r) => r.how !== 'caught' && Math.abs(fx(r) - nx) < 1 && Math.abs(fy(r) - ny) < 1)) continue; // not right into you
      go(b, d, -1, 'climbout');
      ev(s, 'climbout', b.i);
      return true;
    }
    return false;
  }

  function respawnRobot(s, b) {
    const W = s.W;
    let cells = [];
    for (let y = 0; y < s.H && !cells.length; y++) {
      for (let x = 0; x < W; x++) {
        const c = y * W + x;
        if (passable(s, x, y) && !robotIn(s, c, b) && !s.gold[c]) cells.push(c);
      }
    }
    const far = cells.filter((c) => s.runners.every((r) => Math.abs(fx(r) - (c % W)) + Math.abs(fy(r) - ((c / W) | 0)) >= 5));
    if (far.length) cells = far;
    const c = cells.length ? cells[Math.floor(rnd(s) * cells.length)] : b.home;
    stop(b, c % W, (c / W) | 0);
    b.how = 'stand';
    b.gold = -1;
    b.waitT = 0.4;
    ev(s, 'respawn', b.i, c);
  }

  function target(s, b) {
    let best = null, bd = 1e9;
    for (const r of s.runners) {
      if (r.how === 'caught') continue;
      const d = Math.abs(fx(r) - b.x) + Math.abs(fy(r) - b.y) * 1.5;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function decideRobot(s, b) {
    const x = b.x, y = b.y;
    if (!supported(s, x, y, b)) {
      go(b, 0, 1, 'fall');
      return true;
    }
    b.how = restingHow(s, x, y) === 'hole' ? 'stand' : restingHow(s, x, y);
    let r = target(s, b);
    if (!r) return false;
    // the title screen's ghost robots chase a mirror image of the runner, so they roam about without sitting on him
    if (s.opts.ghost) r = { x: s.W - 1 - r.x, y: r.y, tx: s.W - 1 - r.x, ty: r.y, p: 0, moving: false, how: 'stand' };
    const m = chase(s, b, r);
    if (!m) {
      b.waitT = 0.2;
      return false;
    }
    const t = tileAt(s, x, y), nt = tileAt(s, x + m[0], y + m[1]);
    let how = 'walk';
    if (m[1] === -1) how = 'climb';
    else if (m[1] === 1) how = ladderish(s, nt) || ladderish(s, t) ? 'climb' : 'fall';
    else if (t === BAR || nt === BAR) how = 'bar';
    go(b, m[0], m[1], how);
    return true;
  }

  // The robot's next step: breadth-first over where a robot can go, to the runner (or as close as it can get).
  // Robots don't know about holes: an open hole looks like a dip in the floor, so they walk right into it.
  function chase(s, b, r, wantPath) {
    const W = s.W, H = s.H, n = s.spec.n;
    const start = b.y * W + b.x, goal = cellOf(s, r);
    const first = new Int16Array(n).fill(-1), prev = new Int16Array(n).fill(-1);
    const seen = new Uint8Array(n);
    const q = [start];
    seen[start] = 1;
    let found = -1;
    const gx = goal % W, gy = (goal / W) | 0;
    let best = -1, bestScore = 1e9;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], x = c % W, y = (c / W) | 0;
      if (c === goal) { found = c; break; }
      const sc = Math.abs(x - gx) + Math.abs(y - gy) * 2;
      if (sc < bestScore && c !== start) { bestScore = sc; best = c; }
      const nb = [];
      const t = s.spec.tiles[c];
      if (y < H - 1 && !supported(s, x, y, b)) nb.push(c + W);
      else {
        if (passable(s, x - 1, y)) nb.push(c - 1);
        if (passable(s, x + 1, y)) nb.push(c + 1);
        if (y > 0 && ladderish(s, t) && passable(s, x, y - 1)) nb.push(c - W);
        if (y < H - 1 && passable(s, x, y + 1) && (ladderish(s, s.spec.tiles[c + W]) || ladderish(s, t) || t === BAR)) nb.push(c + W);
      }
      for (const k of nb) {
        if (seen[k]) continue;
        if (c === start && robotIn(s, k, b)) continue; // another robot is there now
        seen[k] = 1;
        prev[k] = c;
        first[k] = c === start ? k : first[c];
        q.push(k);
      }
    }
    const to = found >= 0 ? found : best;
    if (to < 0 || to === start || first[to] < 0) return null;
    if (wantPath) {
      const path = [];
      for (let c = to; c >= 0 && c !== start; c = prev[c]) path.push(c);
      return path.reverse();
    }
    const f = first[to];
    return [(f % W) - b.x, ((f / W) | 0) - b.y];
  }

  // ---------------------------------------------------------------- the solver
  // A rest state is a cell where a runner stands still (on a floor, a ladder, a bar or in a hole he dug), plus `h`: he's in an
  // open hole. A move is walk left / right, climb up / down (or let go of a bar), dig left / right then step into the hole,
  // or (in a hole) wait for it to fill and pop up. Falls happen inside a move. The hole a move digs is open while he drops
  // through it; any other hole counts as filled in (the replay waits for that). Gold is a bit mask; the exit ladders are
  // ladders once the mask is full. sim() follows the same rules as the game (decide / supported / canDig above).

  const ACTS = ['walkL', 'walkR', 'up', 'down', 'digL', 'digR', 'pop'];

  function sim(spec, st, act, ctx) {
    const { W, H, tiles: T, gi } = spec;
    let mask = st.mask, hole = -1;
    const x = st.x, y = st.y, c = y * W + x, t = T[c];
    const lad = (k) => T[k] === LADDER || (T[k] === EXIT && (ctx.open || mask === ctx.full));
    const solid = (k) => (T[k] === BRICK && k !== hole) || T[k] === STONE;
    const pass = (xx, yy) => xx >= 0 && xx < W && yy >= 0 && yy < H && !solid(yy * W + xx);
    const sup = (xx, yy) => {
      if (yy >= H - 1) return true;
      const k = yy * W + xx;
      if (T[k] === BAR || lad(k)) return true;
      return solid(k + W) || lad(k + W);
    };
    const visit = (xx, yy) => {
      const k = yy * W + xx;
      if (gi[k] >= 0) mask |= 1 << gi[k];
      if (ctx.touch) ctx.touch[k] = 1;
    };
    const fallFrom = (xx, yy) => {
      visit(xx, yy);
      while (!sup(xx, yy)) visit(xx, ++yy);
      return yy;
    };
    let nx = x, ny = y, nh = false;
    switch (act) {
      case 0: case 1: {
        const d = act === 0 ? -1 : 1;
        if (!pass(x + d, y)) return null;
        nx = x + d;
        ny = fallFrom(nx, y);
        break;
      }
      case 2:
        if (!lad(c) || y === 0 || !pass(x, y - 1)) return null;
        ny = fallFrom(x, y - 1);
        break;
      case 3:
        if (y >= H - 1 || !pass(x, y + 1)) return null;
        if (!(lad(c + W) || lad(c) || t === BAR)) return null;
        ny = fallFrom(x, y + 1);
        break;
      case 4: case 5: {
        const d = act === 4 ? -1 : 1, hx = x + d, hy = y + 1;
        if (t === BAR || hx < 0 || hx >= W || hy >= H) return null;
        const hc = hy * W + hx, ac = y * W + hx;
        if (T[hc] !== BRICK || T[ac] !== E) return null;
        if (gi[ac] >= 0 && !(mask & (1 << gi[ac]))) return null; // gold beside him: no digging under it
        hole = hc;
        nx = hx;
        ny = fallFrom(hx, y);
        nh = ny === hy;
        break;
      }
      case 6:
        if (!st.h || !pass(x, y - 1)) return null;
        ny = fallFrom(x, y - 1);
        break;
      default:
        return null;
    }
    return { x: nx, y: ny, h: nh, mask };
  }

  // Every rest state reachable from `from` (gold mask fixed): for the rest cells and the stuck helper.
  function reachFrom(spec, from, ctx) {
    const seen = new Uint8Array(spec.n * 2), q = [];
    const k0 = (from.y * spec.W + from.x) * 2 + (from.h ? 1 : 0);
    seen[k0] = 1;
    q.push({ x: from.x, y: from.y, h: !!from.h, mask: ctx.mask });
    let top = false;
    for (let qi = 0; qi < q.length; qi++) {
      const st = q[qi];
      if (st.y === 0) top = true;
      for (let a = 0; a < 7; a++) {
        const r = sim(spec, st, a, ctx);
        if (!r) continue;
        r.mask = ctx.mask;
        const k = (r.y * spec.W + r.x) * 2 + (r.h ? 1 : 0);
        if (seen[k]) continue;
        seen[k] = 1;
        q.push(r);
      }
    }
    return { seen, top };
  }

  // Can runner r still get some gold, or (exit open) the top? If a robot is carrying gold the answer is yes: it'll drop it.
  function reach(s, r) {
    if (s.sab === 'nostuck') return true; // sabotage: never say stuck
    if (s.carried > 0) return true;
    const spec = s.spec, touch = new Uint8Array(spec.n);
    let mask = 0;
    spec.goldList.forEach((c, i) => { if (!s.gold[c]) mask |= 1 << i; });
    const inHole = s.hole[r.y * s.W + r.x] === 2;
    const res = reachFrom(spec, { x: r.x, y: r.y, h: inHole }, { mask, full: -1, open: s.exitOpen, touch });
    touch[r.y * s.W + r.x] = 1;
    if (s.exitOpen) return res.top;
    for (let c = 0; c < spec.n; c++) if (s.gold[c] && touch[c]) return true;
    return false;
  }

  // Breadth-first over (rest state, gold mask): the fewest moves that get every bit of gold and then the top row.
  function solve(spec, opts = {}) {
    const G = spec.total, full = (1 << G) - 1, M = 1 << G, n = spec.n;
    if (G > 14) return { ok: false, reason: 'too much gold to check (14 at most)' };
    const N = n * 2 * M;
    const seen = new Uint8Array(N), prev = new Int32Array(N), how = new Uint8Array(N);
    const s0 = spec.starts[0], x0 = s0 % spec.W, y0 = (s0 / spec.W) | 0;
    if (!staticSup(spec, x0, y0)) return { ok: false, reason: 'the start is in mid-air' };
    const key = (st) => ((st.y * spec.W + st.x) * 2 + (st.h ? 1 : 0)) * M + st.mask;
    const start = { x: x0, y: y0, h: false, mask: 0 };
    const k0 = key(start);
    seen[k0] = 1;
    prev[k0] = -1;
    const q = [start], qk = [k0];
    const ctx = { full, open: false };
    let goal = -1, states = 0;
    const limit = opts.limit || 4e6;
    for (let qi = 0; qi < q.length && goal < 0; qi++) {
      const st = q[qi], k = qk[qi];
      if (++states > limit) return { ok: false, reason: 'search too big', states };
      for (let a = 0; a < 7; a++) {
        const r = sim(spec, st, a, ctx);
        if (!r) continue;
        const k2 = key(r);
        if (seen[k2]) continue;
        seen[k2] = 1;
        prev[k2] = k;
        how[k2] = a;
        if (r.mask === full && r.y === 0) { goal = k2; break; }
        q.push(r);
        qk.push(k2);
      }
    }
    if (goal < 0) return { ok: false, reason: 'no way to clear it', states };
    const moves = [];
    for (let k = goal; prev[k] !== -1; k = prev[k]) {
      const m = Math.floor(k / M), c = m >> 1;
      moves.push({ act: ACTS[how[k]], a: how[k], x: c % spec.W, y: (c / spec.W) | 0, h: !!(m & 1), mask: k % M });
    }
    moves.reverse();
    return { ok: true, moves, states, digs: moves.filter((m) => m.a === 4 || m.a === 5).length };
  }

  // A plain-text picture of a game (for the checks): robots r, runners 1 2, holes o, gold $.
  function draw(s) {
    const out = [];
    for (let y = 0; y < s.H; y++) {
      let line = '';
      for (let x = 0; x < s.W; x++) {
        const c = y * s.W + x;
        let ch = CHAR[s.spec.tiles[c]];
        if (ch === 'S' && !s.exitOpen) ch = ',';
        if (s.hole[c] === 2) ch = 'o';
        if (s.gold[c]) ch = '$';
        for (const b of s.robots) if (b.how !== 'out' && cellOf(s, b) === c) ch = 'r';
        for (const r of s.runners) if (cellOf(s, r) === c) ch = String(r.i + 1);
        line += ch;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  Object.assign(TR, {
    E, BRICK, STONE, LADDER, BAR, EXIT, NONE, LEFT, RIGHT, UP, DOWN, TIERS, SCORE, TICK, ACTS, BUDDY_HOLE,
    parse, create, restart, step, solve, sim, reach, reachFrom, draw, cellOf, px: fx, py: fy, supported, passable, canDig, staticSup,
    atRest, ladderish, buddyPlan, digAt, holeOK,
  });
})();
