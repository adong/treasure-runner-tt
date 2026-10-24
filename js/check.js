/* TT Treasure Runner: the headless checks (TR.check), run by tools/check.js in Node and by game.check() in the page.
   They drive js/rules.js only (no drawing), so they test the same rules the game plays by. Groups:
     levels   every level is well formed, the solver clears it, and its answer plays out through the real game (TR.step,
              robots off) on 🐣 EASY and 🔥 NORMAL, landing exactly where the solver said after every move
     holes    a dug hole opens, stays open for the tier's time, then fills; only bricks, never under a ladder or gold,
              never while falling or hanging; a runner inside pops up out of it when it fills
     moves    falling, ladders, bars, walls; → is +1 cell and ← is -1 on every level
     robots   a robot falls into a hole and is stuck, drops its gold on top, can be walked over, climbs out if the hole is
              still open, or pops back in at the top if it fills first; gold is never lost
     buddy    your brother's row of holes: in front of the nearest robot, never under you, gold, a ladder or a bar, open a
              while longer than yours; on a brick floor the robot drops in; every level with robots gets some
     trap     random play with robots on every level: nobody inside a wall, no state that lasts forever, a runner who can't
              move is told he's stuck (press R), and R always gives back the very start
   check({ sabotage }) proves the checks can fail: nofill, float, nobar, keepgold, trap, nostuck, restart, wall. */
(function () {
  'use strict';
  const TR = (typeof window !== 'undefined' ? window : globalThis).TR;
  const { LEFT, RIGHT, UP, DOWN, TICK } = TR;

  function group(name) {
    return { name, passed: 0, failed: 0, fails: [], ok(cond, msg) {
      if (cond) this.passed++;
      else {
        this.failed++;
        if (this.fails.length < 8) this.fails.push(msg);
      }
      return cond;
    } };
  }

  // a tiny level from rows (for the rule fixtures)
  const fixture = (rows, id = 'fixture') => TR.parse({ id, rows });
  const game = (rows, opts = {}) => {
    const s = TR.create(fixture(rows), Object.assign({ tier: 'normal', robots: true }, opts));
    if (!s.spec.total) s.exitOpen = false; // a fixture with no gold keeps its exit shut (or reaching the top row would win)
    return s;
  };
  const run = (s, secs, inp) => TR.step(s, secs, inp || [{ dir: 0, dig: 0 }]);
  const cell = (s, a) => a.y * s.W + a.x;

  // hold a direction until he's heading for cell (x, y), then let go and let him settle there
  function walkTo(s, inp, dir, x, y, max = 6) {
    const r = s.runners[0];
    inp[0].dir = dir;
    stepUntil(s, inp, () => (r.moving && r.tx === x && r.ty === y) || (!r.moving && r.x === x && r.y === y), max);
    inp[0].dir = 0;
    return stepUntil(s, inp, () => !r.moving, 2);
  }

  function stepUntil(s, inp, cond, max = 10) {
    for (let t = 0; t < max; t += TICK) {
      TR.step(s, TICK, inp);
      if (cond()) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- levels

  // Play the solver's moves through the real game, one at a time, with keys held like a player would.
  function replay(spec, sol, tier, sab) {
    const s = TR.create(spec, { tier, players: 1, robots: false, sabotage: sab });
    const r = s.runners[0], inp = [{ dir: 0, dig: 0 }], W = spec.W;
    const rest = () => s.won || (TR.atRest(s, r) && r.how !== 'dig');
    const hold = (dir) => {
      inp[0].dir = dir;
      const moved = stepUntil(s, inp, () => r.moving || s.won, 1.5);
      inp[0].dir = 0;
      return moved && stepUntil(s, inp, rest, 6);
    };
    for (let i = 0; i < sol.moves.length; i++) {
      const m = sol.moves[i];
      const mine = r.y * W + r.x;
      // holes he isn't in fill back in before he goes on (the solver counts them as filled)
      stepUntil(s, inp, () => { for (let c = 0; c < spec.n; c++) if (s.hole[c] && c !== mine) return false; return true; }, 20);
      let ok = true;
      if (m.act === 'walkL') ok = hold(LEFT);
      else if (m.act === 'walkR') ok = hold(RIGHT);
      else if (m.act === 'up') ok = hold(UP);
      else if (m.act === 'down') ok = hold(DOWN);
      else if (m.act === 'digL' || m.act === 'digR') {
        const d = m.act === 'digL' ? -1 : 1;
        inp[0].dig = d;
        ok = stepUntil(s, inp, () => r.how === 'dig', 0.5) && stepUntil(s, inp, () => r.how !== 'dig', 1) && hold(d === -1 ? LEFT : RIGHT);
      } else if (m.act === 'pop') ok = stepUntil(s, inp, () => s.hole[mine] === 0 && rest(), 20);
      const inHole = s.hole[r.y * W + r.x] === 2;
      if (!ok || r.x !== m.x || r.y !== m.y || (inHole !== m.h && !s.won)) {
        return { ok: false, at: i, msg: `move ${i} ${m.act}: solver says ${m.x},${m.y}${m.h ? ' in a hole' : ''}, the game has ${r.x},${r.y}${inHole ? ' in a hole' : ''} (${r.how})\n${TR.draw(s)}` };
      }
      if (s.won) return { ok: i === sol.moves.length - 1, at: i, msg: 'won early', t: s.t };
    }
    return { ok: s.won, msg: s.won ? '' : 'played every move but did not win', t: s.t };
  }

  function checkLevels(g, opts) {
    const levels = TR.LEVELS.slice();
    if (opts.sabotage === 'wall') {
      // a level whose gold is sealed in stone
      levels.push({ id: 99, name: 'SEALED', rows: ['......S', '.1....S', '@@@@@@@', '@@$@@@@', '@@@@@@@'] });
    }
    g.ok(levels.length >= 30 || opts.sabotage === 'wall', `only ${levels.length} levels`);
    const ids = new Set();
    const rows = [];
    for (const lv of levels) {
      const spec = TR.parse(lv);
      const name = `level ${lv.id} ${lv.name}`;
      g.ok(!ids.has(lv.id), `${name}: the id is used twice`);
      ids.add(lv.id);
      g.ok(lv.rows.every((r) => r.length === spec.W), `${name}: rows of different lengths`);
      g.ok(spec.bad.length === 0, `${name}: unknown tiles ${spec.bad.join('')}`);
      g.ok(lv.rows.join('').split('1').length === 2, `${name}: needs exactly one 1`);
      g.ok(spec.W <= 24 && spec.H <= 14, `${name}: too big (${spec.W} x ${spec.H})`);
      g.ok(spec.total >= 1 && spec.total <= 12, `${name}: ${spec.total} gold (1 to 12)`);
      g.ok(spec.exits.some((c) => c < spec.W), `${name}: the exit ladder must reach the top row`);
      for (const c of spec.starts.concat(spec.robots)) g.ok(TR.staticSup(spec, c % spec.W, (c / spec.W) | 0), `${name}: a start in mid-air at ${c % spec.W},${(c / spec.W) | 0}`);
      const sol = TR.solve(spec);
      if (!g.ok(sol.ok, `${name}: the solver can't clear it (${sol.reason})`)) continue;
      for (const tier of ['easy', 'normal']) {
        const rp = replay(spec, sol, tier, opts.sabotage);
        g.ok(rp.ok, `${name} on ${tier}: ${rp.msg}`);
      }
      // the stuck helper agrees: nobody is stuck at the start
      const s = TR.create(spec, { tier: 'easy', robots: false });
      g.ok(TR.reach(s, s.runners[0]), `${name}: the stuck helper says stuck at the start`);
      rows.push({ id: lv.id, moves: sol.moves.length, digs: sol.digs, gold: spec.total, robots: spec.robots.length });
    }
    g.summary = rows;
  }

  // ---------------------------------------------------------------- holes

  function checkHoles(g, opts) {
    const sab = opts.sabotage;
    const A = ['S........', 'S..1.....', '@#######@', '@@@@@@@@@'];
    for (const tier of ['easy', 'normal']) {
      const s = game(A, { tier, robots: false, sabotage: sab });
      const r = s.runners[0], cfg = s.cfg, h = 2 * s.W + 4;
      const inp = [{ dir: 0, dig: 1 }];
      run(s, TICK, inp);
      g.ok(r.how === 'dig' && s.hole[h] === 1, `${tier}: X starts a dig at his lower right`);
      g.ok(!TR.passable(s, 4, 2), `${tier}: a brick being dug is still solid`);
      stepUntil(s, inp, () => s.hole[h] === 2, 2);
      g.ok(Math.abs(s.t - cfg.dig) < 0.04, `${tier}: the hole opens after the dig (${s.t.toFixed(2)} s, wants ${cfg.dig})`);
      g.ok(TR.passable(s, 4, 2), `${tier}: an open hole is passable`);
      const opened = s.t;
      stepUntil(s, inp, () => s.hole[h] === 0, cfg.hole + 2);
      const open = s.t - opened;
      g.ok(Math.abs(open - cfg.hole) < 0.04, `${tier}: the hole stays open ${cfg.hole} s (was ${open.toFixed(2)} s)`);
      g.ok(!TR.passable(s, 4, 2), `${tier}: then the brick is back`);
      g.ok(tier === 'normal' || cfg.hole > TR.TIERS.normal.hole, 'EASY holes stay open longer than NORMAL ones');
    }
    // what you can't dig
    {
      const s = game(['.........', '.H.1$....', '@######@@', '@@@@@@@@@'], { robots: false, sabotage: sab });
      const r = s.runners[0];
      g.ok(!TR.canDig(s, r, 1), 'no digging under gold');
      g.ok(TR.canDig(s, r, -1) === true, 'a brick with nothing above it can be dug');
      const s2 = game(['.........', '..H1.....', '@######@@', '@@@@@@@@@'], { robots: false, sabotage: sab });
      g.ok(!TR.canDig(s2, s2.runners[0], -1), 'no digging under a ladder');
      const s3 = game(['.........', '.....1...', '@@@@@@@@@', '@@@@@@@@@'], { robots: false, sabotage: sab });
      g.ok(!TR.canDig(s3, s3.runners[0], 1) && !TR.canDig(s3, s3.runners[0], -1), 'no digging stone');
      const s4 = game(['.........', '..-1-....', '..#.#....', '@@@@@@@@@'], { robots: false, sabotage: sab });
      g.ok(!TR.canDig(s4, s4.runners[0], 1), 'no digging while hanging from a bar');
      const s5 = game(['...1.....', '.........', '.........', '@@@@@@@@@'], { robots: false, sabotage: sab });
      run(s5, TICK);
      g.ok(s5.runners[0].moving && !TR.canDig(s5, s5.runners[0], 1), 'no digging while falling');
    }
    // in a hole when it fills: up and out, never inside the brick
    for (const tier of ['easy', 'normal']) {
      const s = game(['S........', 'S..1.....', '@#######@', '@@@@@@@@@'], { tier, robots: false, sabotage: sab });
      const r = s.runners[0], h = 2 * s.W + 4, inp = [{ dir: 0, dig: 1 }];
      stepUntil(s, inp, () => s.hole[h] === 2, 2);
      inp[0].dir = RIGHT;
      stepUntil(s, inp, () => r.moving, 1);
      inp[0].dir = 0;
      stepUntil(s, inp, () => TR.atRest(s, r), 3);
      g.ok(cell(s, r) === h, `${tier}: he walks into his own hole and stands in it`);
      inp[0].dir = UP;
      run(s, 0.5, inp);
      g.ok(cell(s, r) === h, `${tier}: ↑ in a hole (no ladder) does nothing`);
      inp[0].dir = 0;
      stepUntil(s, inp, () => s.hole[h] === 0, s.cfg.hole + 1);
      run(s, 0.1, inp);
      g.ok(cell(s, r) === h - s.W && TR.passable(s, r.x, r.y), `${tier}: when it fills he pops up on top of it (at ${r.x},${r.y})`);
      g.ok(s.events.some((e) => e.type === 'pop'), `${tier}: a pop`);
    }
  }

  // ---------------------------------------------------------------- moves

  function checkMoves(g, opts) {
    const sab = opts.sabotage;
    // falling: from the top of a shaft to the floor
    {
      const s = game(['...1.....', '.........', '.........', '.........', '@@@@@@@@@'], { robots: false, sabotage: sab });
      const r = s.runners[0];
      stepUntil(s, [{ dir: 0 }], () => TR.atRest(s, r) && r.y > 0, 3);
      g.ok(r.y === 3 && r.x === 3, `with nothing under him he falls to the floor (at ${r.x},${r.y})`);
      g.ok(Math.abs(s.t - 3 / s.cfg.fall) < 0.1, `falling takes ${(3 / s.cfg.fall).toFixed(2)} s for 3 cells (took ${s.t.toFixed(2)})`);
    }
    // ladders: up only on a ladder; standing on top; down again
    {
      const s = game(['.........', '...H.....', '...H.....', '..1H.....', '@@@@@@@@@'], { robots: false, sabotage: sab });
      const r = s.runners[0], inp = [{ dir: UP }];
      run(s, 0.5, inp);
      g.ok(r.y === 3, '↑ off a ladder does nothing');
      walkTo(s, inp, RIGHT, 3, 3);
      walkTo(s, inp, UP, 3, 0);
      g.ok(r.y === 0 && r.x === 3, `↑ climbs to the top of the ladder and stands on it (at ${r.x},${r.y})`);
      inp[0].dir = 0;
      run(s, 0.5, inp);
      g.ok(r.y === 0, 'on top of a ladder he stays put');
      walkTo(s, inp, DOWN, 3, 3);
      g.ok(r.y === 3, '↓ climbs back down');
    }
    // bars: walk onto one and hang; along it; ↓ lets go; falling past a bar grabs it
    {
      const s = game(['.........', '.1-----..', '@@.......', '.........', '.........', '@@@@@@@@@'], { robots: false, sabotage: sab });
      const r = s.runners[0], inp = [{ dir: 0 }];
      walkTo(s, inp, RIGHT, 4, 1);
      g.ok(r.x === 4 && r.y === 1 && r.how === 'bar', `along a bar he hangs on (at ${r.x},${r.y}, ${r.how})`);
      inp[0].dir = 0;
      run(s, 0.5, inp);
      g.ok(r.y === 1, 'hanging still, he doesn\'t fall');
      inp[0].dir = DOWN;
      run(s, TICK * 2, inp);
      inp[0].dir = 0;
      stepUntil(s, inp, () => TR.atRest(s, r), 2);
      g.ok(r.y === 4, `↓ lets go and he drops to the floor (at ${r.x},${r.y})`);
      const s2 = game(['...1.....', '.........', '..---....', '.........', '@@@@@@@@@'], { robots: false, sabotage: sab });
      stepUntil(s2, [{ dir: 0 }], () => TR.atRest(s2, s2.runners[0]) && s2.t > 0.1, 2);
      g.ok(s2.runners[0].y === 2 && s2.runners[0].how === 'bar', `falling past a bar he grabs it (at y ${s2.runners[0].y})`);
    }
    // walls and stone stop you
    {
      const s = game(['.........', '..#1@....', '@@@@@@@@@'], { robots: false, sabotage: sab });
      const r = s.runners[0];
      run(s, 0.6, [{ dir: LEFT }]);
      g.ok(r.x === 3, 'a brick wall stops you');
      run(s, 0.6, [{ dir: RIGHT }]);
      g.ok(r.x === 3, 'a stone wall stops you');
    }
    // turning round half way through a step
    {
      const s = game(['.........', '....1....', '@@@@@@@@@'], { robots: false, sabotage: sab });
      const r = s.runners[0], inp = [{ dir: RIGHT }];
      run(s, 0.1, inp);
      const half = r.moving && r.tx === 5;
      inp[0].dir = LEFT;
      run(s, TICK, inp);
      inp[0].dir = 0;
      stepUntil(s, inp, () => !r.moving, 1);
      g.ok(half && r.x === 4 && !r.moving, `→ then ← half way turns him round, back where he was (at ${r.x})`);
    }
    // → is one cell to the right and ← one to the left, on every level (where there's room)
    for (const lv of TR.LEVELS) {
      const spec = TR.parse(lv);
      for (const [dir, dx] of [[RIGHT, 1], [LEFT, -1]]) {
        const s = TR.create(spec, { tier: 'normal', robots: false, sabotage: sab });
        const r = s.runners[0], x0 = r.x;
        if (!TR.passable(s, x0 + dx, r.y)) continue;
        run(s, TICK * 2, [{ dir }]);
        stepUntil(s, [{ dir: 0 }], () => !r.moving && r.x !== x0, 1);
        g.ok(r.x === x0 + dx || (r.y > (spec.starts[0] / spec.W | 0) && r.x === x0 + dx), `level ${lv.id}: ${dir === RIGHT ? '→' : '←'} moved him to x ${r.x} from ${x0}`);
      }
    }
  }

  // ---------------------------------------------------------------- robots

  const goldSum = (s) => {
    let map = 0;
    for (let c = 0; c < s.spec.n; c++) map += s.gold[c];
    return { ok: map === s.left && s.left + s.carried + s.got === s.spec.total, map };
  };

  function checkRobots(g, opts) {
    const sab = opts.sabotage;
    const rows = ['S..............', 'S.1......$...R.', '@##############', '@@@@@@@@@@@@@@@'];
    for (const tier of ['easy', 'normal']) {
      const s = game(rows, { tier, sabotage: sab });
      s.cfg.pick = 1; // this robot always picks the gold up
      const r = s.runners[0], b = s.robots[0], inp = [{ dir: 0, dig: 1 }];
      const h = 2 * s.W + 3;
      // wait for it to come with the gold, then dig in front of you
      const got = stepUntil(s, [{ dir: 0 }], () => b.gold >= 0, 8);
      g.ok(got, `${tier}: the robot picks up gold it walks over`);
      g.ok(goldSum(s).ok, `${tier}: carried gold is still counted`);
      stepUntil(s, [{ dir: 0 }], () => b.x <= 7, 8);
      run(s, TICK, inp);
      const stuck = stepUntil(s, [{ dir: 0 }], () => b.how === 'hole', 6);
      g.ok(stuck && cell(s, b) === h, `${tier}: it falls into the hole and is stuck (at ${b.x},${b.y}, ${b.how})`);
      g.ok(b.gold < 0 && s.gold[h - s.W] === 1, `${tier}: it drops its gold on top of the hole`);
      g.ok(goldSum(s).ok, `${tier}: no gold lost`);
      const at = cell(s, b);
      run(s, Math.min(1, s.cfg.stuck - 0.3), [{ dir: 0 }]);
      g.ok(cell(s, b) === at && b.how === 'hole', `${tier}: stuck, it doesn't move`);
      // walk over it: right across its head, no fall, no catch
      const lives = s.lives;
      walkTo(s, inp, RIGHT, 4, 1);
      g.ok(r.x === 4 && r.y === 1 && s.lives === lives && r.how !== 'caught', `${tier}: you can walk over a stuck robot (at ${r.x},${r.y})`);
      g.ok(s.got === 1, `${tier}: and pick up the gold it dropped`);
      // run away, then it climbs out if the hole's still open (NORMAL), or the hole fills and it pops back at the top
      walkTo(s, inp, RIGHT, 13, 1);
      const done = stepUntil(s, inp, () => b.how !== 'hole' && b.how !== 'climbout', s.cfg.hole + 2);
      if (s.cfg.stuck < s.cfg.hole) {
        g.ok(done && b.how !== 'out' && b.y === 1, `${tier}: with the hole still open it climbs out (${b.how} at ${b.x},${b.y})`);
      }
    }
    // the hole fills before it can climb out: it pops back in at the top
    for (const tier of ['easy', 'normal']) {
      const s = game(['...............', 'S.1..........R.', '@##############', '@@@@@@@@@@@@@@@'], { tier, sabotage: sab });
      const b = s.robots[0], h = 2 * s.W + 3;
      // dig late, so the hole is near its end when the robot drops in
      stepUntil(s, [{ dir: 0 }], () => b.x <= 4 + Math.ceil(s.cfg.robot * 0.6), 10);
      run(s, TICK, [{ dir: 0, dig: 1 }]);
      stepUntil(s, [{ dir: 0 }], () => b.how === 'hole', 6);
      // keep it from climbing out: stand on its head
      const r = s.runners[0];
      const inp = [{ dir: 0 }];
      walkTo(s, inp, RIGHT, 3, 1);
      g.ok(r.x === 3 && r.y === 1, `${tier}: he stands on the stuck robot's head (at ${r.x},${r.y})`);
      const score = s.score;
      const trapped = stepUntil(s, inp, () => b.how === 'out', s.cfg.hole + 1);
      g.ok(trapped && s.hole[h] === 0, `${tier}: the hole fills with the robot in it and it's puffed away (${b.how})`);
      g.ok(s.score - score >= TR.SCORE.trap, `${tier}: that scores ${TR.SCORE.trap}`);
      const back = stepUntil(s, inp, () => b.how !== 'out', s.cfg.respawn + 1);
      g.ok(back && b.y === 0, `${tier}: it pops back in at the top (at ${b.x},${b.y})`);
      g.ok(TR.passable(s, b.x, b.y), `${tier}: in an open cell`);
    }
  }

  // ---------------------------------------------------------------- your brother's holes

  function checkBuddy(g, opts) {
    const sab = opts.sabotage;
    // a robot coming along a brick floor: he digs in front of it, the holes open, last longer than yours, and it drops in
    for (const tier of ['easy', 'normal']) {
      const s = game(['S...............', 'S.1..........R..', '@###############', '@@@@@@@@@@@@@@@@'], { tier, sabotage: sab });
      const b = s.robots[0], r = s.runners[0];
      run(s, 0.4);
      const plan = TR.buddyPlan(s);
      g.ok(plan.robot === 0 && plan.cells.length === 3, `${tier}: a row of three holes for the robot (${plan.cells.length})`);
      g.ok(plan.cells.every((c) => (c % s.W) < b.x && (c % s.W) > r.x && ((c / s.W) | 0) === b.y + 1), `${tier}: in the floor between the robot and you`);
      plan.cells.forEach((c) => TR.digAt(s, c));
      g.ok(plan.cells.every((c) => s.hole[c] === 1), `${tier}: the bricks start to crumble`);
      run(s, s.cfg.dig + TICK);
      g.ok(plan.cells.every((c) => s.hole[c] === 2), `${tier}: and open`);
      g.ok(plan.cells.every((c) => Math.abs(s.holeT[c] - s.cfg.hole * TR.BUDDY_HOLE) < 0.1), `${tier}: your brother's holes stay open ${TR.BUDDY_HOLE} times as long`);
      const got = stepUntil(s, [{ dir: 0 }], () => b.how === 'hole', s.cfg.hole * TR.BUDDY_HOLE);
      g.ok(got && plan.cells.includes(b.y * s.W + b.x), `${tier}: the robot drops into one`);
      g.ok(r.how !== 'caught', `${tier}: and you weren't tickled`);
    }
    // never under you, never under gold, a ladder or a bar; and nothing to do when there are no robots
    {
      const s = game(['S...........', 'S.1$H-...R..', '@###########', '@@@@@@@@@@@@'], { sabotage: sab });
      run(s, 0.3);
      const plan = TR.buddyPlan(s);
      for (const c of plan.cells) {
        const above = s.spec.tiles[c - s.W];
        g.ok(above === TR.E && !s.gold[c - s.W] && TR.cellOf(s, s.runners[0]) !== c - s.W, `no hole under you, gold, a ladder or a bar (cell ${c % s.W},${(c / s.W) | 0})`);
      }
      const n = game(['S.....', 'S.1...', '@#####', '@@@@@@'], { sabotage: sab });
      g.ok(TR.buddyPlan(n).robot === -1, 'no robots: no holes');
    }
    // every level with robots: he finds bricks to dig for the nearest one
    const st = { levels: 0, withHoles: 0, trappedOrDropped: 0 };
    for (const lv of TR.LEVELS) {
      for (const tier of ['easy', 'normal']) {
        const s = TR.create(TR.parse(lv), { tier, lives: 99, sabotage: sab });
        if (!s.robots.length) continue;
        st.levels++;
        run(s, 1);
        const plan = TR.buddyPlan(s);
        if (plan.cells.length) st.withHoles++;
        g.ok(plan.cells.length >= 1 && plan.cells.length <= 3, `level ${lv.id} ${tier}: holes for the nearest robot (${plan.cells.length})`);
        g.ok(plan.cells.every((c) => TR.holeOK(s, c % s.W, (c / s.W) | 0)), `level ${lv.id} ${tier}: every hole is a brick he can dig`);
        plan.cells.forEach((c) => TR.digAt(s, c));
        let hit = false;
        for (let t = 0; t < s.cfg.hole * TR.BUDDY_HOLE + s.cfg.dig && !hit; t += TICK) {
          TR.step(s, TICK, [{ dir: 0 }]);
          hit = s.robots.some((b) => plan.cells.includes(TR.cellOf(s, b)) && b.how !== 'out');
        }
        if (hit) st.trappedOrDropped++;
      }
    }
    g.stats = st;
  }

  // ---------------------------------------------------------------- trap and restart

  const snap = (s) => JSON.stringify({
    hole: Array.from(s.hole), gold: Array.from(s.gold), left: s.left, carried: s.carried, got: s.got, exit: s.exitOpen, score: s.score, won: s.won, over: s.over,
    runners: s.runners.map((r) => [r.x, r.y, r.tx, r.ty, r.p, r.how, r.moving, r.digT]), robots: s.robots.map((b) => [b.x, b.y, b.how, b.gold, b.moving]),
  });

  // Could he do anything at all? (a step, a climb, a drop, a dig, or a hole that will spit him out)
  function canAct(s, r) {
    const x = r.x, y = r.y, t = s.spec.tiles[y * s.W + x];
    if (s.hole[y * s.W + x] === 2) return true;
    for (const d of [-1, 1]) if (TR.passable(s, x + d, y) || TR.canDig(s, r, d)) return true;
    if (TR.ladderish(s, t) && y > 0 && TR.passable(s, x, y - 1)) return true;
    if (y < s.H - 1 && TR.passable(s, x, y + 1) && (TR.ladderish(s, s.spec.tiles[(y + 1) * s.W + x]) || TR.ladderish(s, t) || t === TR.BAR)) return true;
    return false;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function checkTrap(g, opts) {
    const rand = rng(opts.seed || 7);
    const stats = { seconds: 0, immobile: 0, told: 0, caught: 0, pops: 0, restarts: 0, wins: 0 };
    g.stats = stats;
    const secs = opts.quick ? 12 : 40;
    for (const lv of TR.LEVELS) {
      const spec = TR.parse(lv);
      for (const tier of ['easy', 'normal']) {
        const players = lv.id % 3 === 0 ? 2 : 1;
        let s = TR.create(spec, { tier, players, seed: lv.id * 31 + (tier === 'easy' ? 1 : 2), lives: 99, sabotage: opts.sabotage });
        const fresh = snap(TR.create(spec, { tier, players, seed: lv.id * 31 + (tier === 'easy' ? 1 : 2), lives: 99 }));
        const inp = s.runners.map(() => ({ dir: 0, dig: 0 }));
        const hold = s.runners.map(() => 0);
        const since = s.runners.map(() => ({ how: '', t: 0, still: 0 }));
        let bad = 0;
        const name = `level ${lv.id} ${tier}`;
        for (let t = 0; t < secs && bad < 3; t += TICK) {
          s.runners.forEach((r, i) => {
            hold[i] -= TICK;
            if (hold[i] <= 0) {
              hold[i] = 0.1 + rand() * 0.6;
              inp[i].dir = rand() < 0.15 ? 0 : 1 + Math.floor(rand() * 4);
              if (rand() < 0.2) inp[i].dig = rand() < 0.5 ? -1 : 1;
            }
          });
          TR.step(s, TICK, inp);
          const digs = s.events.filter((e) => e.type === 'dig').map((e) => e.a);
          for (const e of s.events) {
            if (e.type === 'caught') stats.caught++;
            if (e.type === 'pop') stats.pops++;
          }
          s.events.length = 0;
          stats.seconds += TICK;
          if (s.won) { // start again and keep going
            stats.wins++;
            s = TR.restart(s);
            continue;
          }
          if (!g.ok(goldSum(s).ok, `${name}: gold miscounted at ${t.toFixed(1)} s`)) bad++;
          s.runners.forEach((r, i) => {
            const cx = TR.cellOf(s, r) % s.W, cy = (TR.cellOf(s, r) / s.W) | 0;
            if (r.how !== 'caught' && !g.ok(TR.passable(s, cx, cy), `${name}: runner ${i + 1} inside a wall at ${cx},${cy} (${r.how}) at ${t.toFixed(1)} s\n${TR.draw(s)}`)) bad++;
            const sn = since[i];
            if (r.how !== sn.how || digs.includes(i)) { sn.how = r.how; sn.t = 0; }
            sn.t += TICK;
            const limit = r.how === 'caught' ? s.cfg.caught + 0.05 : r.how === 'dig' ? s.cfg.dig + 0.05 : 1e9;
            if (!g.ok(sn.t <= limit, `${name}: runner ${i + 1} stuck in '${r.how}' for ${sn.t.toFixed(2)} s`)) bad++;
            // can't move at all: within a moment the game must say "stuck? press R"
            if (TR.atRest(s, r) && !canAct(s, r)) sn.still += TICK;
            else sn.still = 0;
            if (sn.still > 1.2 && sn.still <= 1.2 + TICK) {
              stats.immobile++;
              if (r.stuck) stats.told++;
            }
            if (sn.still > 1.2 && !g.ok(r.stuck, `${name}: runner ${i + 1} can't move at ${r.x},${r.y} and isn't told he's stuck\n${TR.draw(s)}`)) bad++;
          });
          for (const b of s.robots) {
            if (b.how === 'out') continue;
            const c = TR.cellOf(s, b);
            if (!g.ok(TR.passable(s, c % s.W, (c / s.W) | 0), `${name}: a robot inside a wall at ${c % s.W},${(c / s.W) | 0}`)) bad++;
          }
          // now and then: R, and it must be the very start again
          if (rand() < 0.002) {
            stats.restarts++;
            const n = TR.restart(s);
            if (!g.ok(snap(n) === fresh, `${name}: R at ${t.toFixed(1)} s didn't give back the start`)) bad++;
            if (rand() < 0.5) s = n;
          }
        }
        const n = TR.restart(s);
        g.ok(snap(n) === fresh, `${name}: R after play didn't give back the start`);
        g.ok(n.lives === s.lives, `${name}: R keeps your lives`);
      }
    }
    // the stuck helper, on purpose: shut in a steel box (no move at all), and in a room with the gold out of reach
    const cases = [
      ['in a steel box', ['S.....', 'S..$..', '@@@@@@', '@@1@@@', '@@@@@@']],
      ['shut in a room, gold out of reach', ['S......', 'S..$...', '@@@@@@@', '@.1...@', '@@@@@@@']],
      ['fell down a pit he can\'t climb out of', ['S.......', 'S1..$...', '@@.@@@@@', '@@.@@@@@', '@@.@@@@@', '@@@@@@@@']],
    ];
    for (const [what, rows] of cases) {
      const s = game(rows, { robots: false, sabotage: opts.sabotage });
      const r = s.runners[0];
      if (what.startsWith('fell')) {
        TR.step(s, 0.3, [{ dir: RIGHT }]);
        stepUntil(s, [{ dir: 0 }], () => TR.atRest(s, r), 3);
      }
      run(s, 1.1);
      g.ok(r.stuck, `${what}: the game says he's stuck (so "press R" shows)`);
      const n = TR.restart(s);
      g.ok(!n.runners[0].stuck && n.runners[0].home === r.home, `${what}: R puts him back at the start`);
    }
    {
      const s = game(['S........', 'S.1....$.', '@@@@@@@@@'], { robots: false, sabotage: opts.sabotage });
      run(s, 1.1);
      g.ok(!s.runners[0].stuck, 'with the gold in reach he is not stuck');
    }
  }

  // ---------------------------------------------------------------- all of it

  function check(opts = {}) {
    const t0 = Date.now();
    const order = [['levels', checkLevels], ['holes', checkHoles], ['moves', checkMoves], ['robots', checkRobots], ['buddy', checkBuddy], ['trap', checkTrap]];
    const out = { ok: true, groups: {} };
    for (const [name, fn] of order) {
      if (opts.only && opts.only !== name) continue;
      const g = group(name);
      try {
        fn(g, opts);
      } catch (e) {
        g.ok(false, `${name} threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
      }
      out.groups[name] = { passed: g.passed, failed: g.failed, fails: g.fails };
      if (g.stats) out.groups[name].stats = g.stats;
      if (g.summary) out.groups[name].levels = g.summary.map((l) => `${l.id}: ${l.moves} moves, ${l.digs} digs, ${l.gold} gold, ${l.robots} robots`).join(' · ');
      if (g.failed) {
        out.ok = false;
        if (opts.sabotage) break; // a sabotaged run stops at the first group that fails
      }
    }
    out.sabotage = opts.sabotage || null;
    out.ms = Date.now() - t0;
    return out;
  }

  TR.check = check;
  TR.replay = replay;
})();
