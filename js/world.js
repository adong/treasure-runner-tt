/* TT Treasure Runner: a level in 3D. Chunky toy bricks with studs (you can dig them), blue steel blocks with rivets (you
   can't), yellow ladders, cyan monkey bars, stacks of gold coins, the rainbow exit ladder (it grows up out of the floor when
   the gold's all in) and the googly-eyed robot vacuums. Everything is drawn from the rules' state each frame.
     TR.makeWorld(spec)          → world { group, update(s, dt), dispose(), at(x, y), box }
     world.at(x, y)              the bottom middle of cell (x, y) in world units (one cell = 1)
   Robots: every robot gets a vacuum (robotMesh) the world moves; stuck in a hole its eyes spin, trapped it sneezes and
   floats away under a balloon. */
(function () {
  'use strict';
  const T = THREE;
  const TR = window.TR;
  const { makeCanvas, toTexture, std, emojiTexture, rand, roundRect } = Kit.gfx;
  const { BRICK, STONE, LADDER, BAR, EXIT } = TR;

  // ---------------------------------------------------------------- textures (painted once)

  let tex = null;
  function textures() {
    if (tex) return tex;
    tex = {};
    {
      // toy bricks: warm orange-red with two rows of little bricks and a soft bevel
      const [c, g] = makeCanvas(128, 128);
      g.fillStyle = '#f2643a';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ff8a5c';
      for (const [x, y, w] of [[4, 4, 56], [68, 4, 56], [-28, 68, 56], [36, 68, 56], [100, 68, 56]]) {
        roundRect(g, x, y, w, 56, 9);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.28)';
      for (const [x, y, w] of [[8, 8, 48], [72, 8, 48], [40, 72, 48]]) g.fillRect(x, y, w, 7);
      g.strokeStyle = 'rgba(120,30,10,0.45)';
      g.lineWidth = 5;
      g.strokeRect(2.5, 2.5, 123, 123);
      tex.brick = toTexture(c);
    }
    {
      // steel blocks: blue-grey with a frame and four rivets ("can't dig this one")
      const [c, g] = makeCanvas(128, 128);
      g.fillStyle = '#7f93b8';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#93a8cf';
      roundRect(g, 12, 12, 104, 104, 10);
      g.fill();
      g.strokeStyle = '#56688f';
      g.lineWidth = 6;
      g.strokeRect(3, 3, 122, 122);
      for (const [x, y] of [[22, 22], [106, 22], [22, 106], [106, 106]]) {
        g.fillStyle = '#56688f';
        g.beginPath();
        g.arc(x, y, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d7e2f7';
        g.beginPath();
        g.arc(x - 2, y - 2, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(34, 94);
      g.lineTo(94, 34);
      g.stroke();
      tex.stone = toTexture(c);
    }
    {
      // the wall behind the level: soft cream tiles
      const [c, g] = makeCanvas(128, 128);
      g.fillStyle = '#fff1d2';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(214,170,110,0.35)';
      g.lineWidth = 4;
      g.strokeRect(2, 2, 124, 124);
      g.fillStyle = 'rgba(255,214,120,0.35)';
      g.beginPath();
      g.arc(64, 64, 10, 0, Math.PI * 2);
      g.fill();
      tex.wall = toTexture(c, true);
    }
    return tex;
  }

  // shared geometry and materials
  let kit = null;
  function parts() {
    if (kit) return kit;
    const t = textures();
    kit = {
      brickGeo: new T.BoxGeometry(0.98, 0.98, 1),
      studGeo: new T.CylinderGeometry(0.15, 0.15, 0.1, 14),
      brickMat: std('#ffffff', { map: t.brick, roughness: 0.55 }),
      studMat: std('#ff7a4c', { roughness: 0.45 }),
      stoneMat: std('#ffffff', { map: t.stone, roughness: 0.35, metalness: 0.25 }),
      railMat: std('#ffcf1f', { roughness: 0.5 }),
      rungMat: std('#ffb000', { roughness: 0.5 }),
      barMat: std('#28c8f0', { roughness: 0.3, metalness: 0.2 }),
      capMat: std('#1a8fd0', { roughness: 0.4 }),
      coinMat: std('#ffcf2e', { roughness: 0.3, metalness: 0.12, emissive: '#c07a00', emissiveIntensity: 0.38 }),
      coinEdge: std('#f0a800', { roughness: 0.35, metalness: 0.1, emissive: '#8a5200', emissiveIntensity: 0.3 }),
      ghostMat: new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false }),
      frameMat: std('#b5763c', { roughness: 0.8 }),
      rainbow: ['#ff5a4e', '#ff9a3c', '#ffd400', '#3fd17a', '#28b8f0', '#a77bff'].map((c) => std(c, { roughness: 0.45, emissive: c, emissiveIntensity: 0.2 })),
    };
    return kit;
  }

  // a stack of three gold coins (and a sparkle)
  function coinStack(k) {
    const g = new T.Group();
    for (let i = 0; i < 3; i++) {
      const coin = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.08, 20), [k.coinEdge, k.coinMat, k.coinMat]);
      coin.position.set((i - 1) * 0.05, 0.05 + i * 0.085, (i % 2) * 0.03);
      coin.castShadow = true;
      g.add(coin);
    }
    const big = new T.Mesh(new T.CylinderGeometry(0.27, 0.27, 0.07, 22), [k.coinEdge, k.coinMat, k.coinMat]);
    big.rotation.x = Math.PI / 2;
    big.position.set(0, 0.5, 0.05);
    big.castShadow = true;
    g.add(big);
    g.userData.big = big;
    return g;
  }

  function ladderCell(k, rungMats) {
    const g = new T.Group();
    for (const sx of [-0.32, 0.32]) {
      const rail = new T.Mesh(new T.BoxGeometry(0.08, 1, 0.08), k.railMat);
      rail.position.set(sx, 0.5, -0.3);
      g.add(rail);
    }
    for (let i = 0; i < 3; i++) {
      const rung = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.64, 8), rungMats ? rungMats[i % rungMats.length] : k.rungMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, 0.18 + i * 0.33, -0.3);
      g.add(rung);
    }
    return g;
  }

  function barCell(k, left, right) {
    const g = new T.Group();
    const bar = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1, 10), k.barMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.88, 0);
    bar.castShadow = true;
    g.add(bar);
    for (const [on, sx] of [[left, -0.5], [right, 0.5]]) {
      if (!on) continue;
      const cap = new T.Mesh(new T.SphereGeometry(0.09, 12, 8), k.capMat);
      cap.position.set(sx, 0.88, 0);
      g.add(cap);
    }
    return g;
  }

  // ---------------------------------------------------------------- a robot vacuum

  const ROBOT_COLORS = ['#ff6fae', '#2fd0c0', '#a77bff', '#ff9a3c', '#5fa8ff', '#9be15d'];
  function robotMesh(i, k) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const col = ROBOT_COLORS[i % ROBOT_COLORS.length];
    const shell = new T.Mesh(new T.CylinderGeometry(0.36, 0.38, 0.22, 28), std(col, { roughness: 0.35 }));
    shell.position.y = 0.15;
    shell.castShadow = true;
    body.add(shell);
    const bumper = new T.Mesh(new T.CylinderGeometry(0.395, 0.395, 0.08, 28), std('#3a3550', { roughness: 0.6 }));
    bumper.position.y = 0.08;
    body.add(bumper);
    const top = new T.Mesh(new T.CylinderGeometry(0.24, 0.24, 0.03, 24), std(Kit.gfx.shade(col, 0.35), { roughness: 0.3 }));
    top.position.y = 0.27;
    body.add(top);
    const btn = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }));
    btn.position.set(0, 0.29, -0.08);
    body.add(btn);
    // antenna with a bobble
    const ant = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.22, 6), std('#3a3550'));
    ant.position.set(0.12, 0.38, -0.05);
    body.add(ant);
    const bob = new T.Mesh(new T.SphereGeometry(0.045, 10, 8), std('#ffd400', { emissive: '#ffd400', emissiveIntensity: 0.4 }));
    bob.position.set(0.12, 0.5, -0.05);
    body.add(bob);
    // googly eyes on the front, looking at you
    const eyes = [];
    for (const sx of [-0.13, 0.13]) {
      const white = new T.Mesh(new T.SphereGeometry(0.12, 18, 12), std('#ffffff', { roughness: 0.2 }));
      white.position.set(sx, 0.33, 0.2);
      body.add(white);
      const pupil = new T.Mesh(new T.SphereGeometry(0.06, 12, 10), std('#14121f', { roughness: 0.2 }));
      pupil.position.set(sx, 0.33, 0.31);
      body.add(pupil);
      eyes.push({ pupil, x: sx, ox: 0, oy: 0, vx: 0, vy: 0 });
    }
    // a little spinning side brush
    const brush = new T.Group();
    for (let a = 0; a < 3; a++) {
      const bristle = new T.Mesh(new T.BoxGeometry(0.2, 0.012, 0.03), std('#ffffff'));
      bristle.position.x = 0.1;
      const arm = new T.Group();
      arm.rotation.y = (a / 3) * Math.PI * 2;
      arm.add(bristle);
      brush.add(arm);
    }
    brush.position.set(0.26, 0.03, 0.22);
    body.add(brush);
    // the hook it hangs from a bar by, and the gold it carries
    const hook = new T.Group();
    const stick = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.5, 6), std('#3a3550'));
    stick.position.y = 0.55;
    hook.add(stick);
    const curl = new T.Mesh(new T.TorusGeometry(0.07, 0.02, 6, 12, Math.PI * 1.3), std('#3a3550'));
    curl.position.set(0.05, 0.82, 0);
    hook.add(curl);
    hook.visible = false;
    body.add(hook);
    const loot = coinStack(k);
    loot.scale.setScalar(0.7);
    loot.position.set(-0.12, 0.28, -0.05);
    loot.visible = false;
    body.add(loot);
    // a balloon (floating away) and dizzy stars (stuck)
    const balloon = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture('🎈'), depthWrite: false, transparent: true }));
    balloon.scale.setScalar(0.7);
    balloon.position.y = 1.05;
    balloon.visible = false;
    root.add(balloon);
    const dizzy = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture('💫'), depthWrite: false, transparent: true }));
    dizzy.scale.setScalar(0.45);
    dizzy.position.y = 0.75;
    dizzy.visible = false;
    root.add(dizzy);
    return { root, body, eyes, brush, hook, loot, balloon, dizzy, bob, t: rand(0, 6), lastX: 0, lastY: 0, outT: 0, wasOut: false, spin: 0 };
  }

  // ---------------------------------------------------------------- the level

  function makeWorld(spec) {
    const k = parts();
    const t = textures();
    const { W, H, tiles } = spec;
    const group = new T.Group();
    const X = (x) => x - (W - 1) / 2;
    const Y = (y) => H - 1 - y; // the bottom of row y
    const at = (x, y, out = new T.Vector3()) => out.set(X(x), Y(y), 0);

    // the wall behind and a wooden frame round the sides and the bottom
    const wt = t.wall.clone();
    wt.needsUpdate = true;
    wt.repeat.set(W / 2, H / 2);
    const wall = new T.Mesh(new T.PlaneGeometry(W, H), std('#ffffff', { map: wt, roughness: 1 }));
    wall.position.set(0, H / 2, -0.55);
    wall.receiveShadow = true;
    group.add(wall);
    const F = 0.34;
    for (const [w, h, x, y] of [[F, H + F, -W / 2 - F / 2, (H - F) / 2], [F, H + F, W / 2 + F / 2, (H - F) / 2], [W + 2 * F, F, 0, -F / 2]]) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, 1.2), k.frameMat);
      m.position.set(x, y, -0.05);
      m.receiveShadow = true;
      group.add(m);
    }
    // the meadow the frame stands in
    const grass = new T.Mesh(new T.PlaneGeometry(600, 240), std('#86d96f', { roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.34, -60);
    group.add(grass);

    // bricks and studs (instanced: one draw each), steel blocks
    const bricks = [], stones = [];
    for (let c = 0; c < spec.n; c++) {
      if (tiles[c] === BRICK) bricks.push(c);
      else if (tiles[c] === STONE) stones.push(c);
    }
    const brickIx = new Int32Array(spec.n).fill(-1);
    const brickMesh = new T.InstancedMesh(k.brickGeo, k.brickMat, Math.max(1, bricks.length));
    const studMesh = new T.InstancedMesh(k.studGeo, k.studMat, Math.max(1, bricks.length * 2));
    const stoneMesh = new T.InstancedMesh(k.brickGeo, k.stoneMat, Math.max(1, stones.length));
    for (const m of [brickMesh, studMesh, stoneMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      group.add(m);
    }
    const mtx = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3();
    const exposed = (c) => c < W || (tiles[c - W] !== BRICK && tiles[c - W] !== STONE);
    function placeBrick(i, c, s = 1, wob = 0) {
      const x = c % W, y = (c / W) | 0;
      pos.set(X(x) + wob, Y(y) + 0.5 - (1 - s) * 0.45, 0);
      sc.set(s, s, s);
      mtx.compose(pos, q, sc);
      brickMesh.setMatrixAt(i, mtx);
      const on = exposed(c) ? s : 0;
      for (const [j, dx] of [[0, -0.24], [1, 0.24]]) {
        pos.set(X(x) + dx * s + wob, Y(y) + 0.5 - (1 - s) * 0.45 + 0.5 * s + 0.04, 0.22 * s);
        sc.set(on, on, on);
        mtx.compose(pos, q, sc);
        studMesh.setMatrixAt(i * 2 + j, mtx);
      }
    }
    bricks.forEach((c, i) => {
      brickIx[c] = i;
      placeBrick(i, c);
    });
    stones.forEach((c, i) => {
      pos.set(X(c % W), Y((c / W) | 0) + 0.5, 0);
      sc.set(1, 1, 1);
      mtx.compose(pos, q, sc);
      stoneMesh.setMatrixAt(i, mtx);
    });
    brickMesh.count = bricks.length;
    studMesh.count = bricks.length * 2;
    stoneMesh.count = stones.length;
    brickMesh.instanceMatrix.needsUpdate = studMesh.instanceMatrix.needsUpdate = stoneMesh.instanceMatrix.needsUpdate = true;

    // ladders, bars, the exit ladder
    const exitParts = [];
    for (let c = 0; c < spec.n; c++) {
      const x = c % W, y = (c / W) | 0, tl = tiles[c];
      if (tl === LADDER || tl === EXIT) {
        const l = ladderCell(k, tl === EXIT ? k.rainbow.slice((y * 2) % 6).concat(k.rainbow) : null);
        l.position.copy(at(x, y));
        group.add(l);
        if (tl === EXIT) {
          l.visible = false;
          // a see-through ghost of it shows where it will grow
          const ghost = ladderCell(k, [k.ghostMat]);
          ghost.traverse((o) => { if (o.isMesh) { o.material = k.ghostMat; o.castShadow = false; } });
          ghost.position.copy(l.position);
          group.add(ghost);
          exitParts.push({ g: l, y, ghost });
        }
      } else if (tl === BAR) {
        const b = barCell(k, x === 0 || tiles[c - 1] !== BAR, x === W - 1 || tiles[c + 1] !== BAR);
        b.position.copy(at(x, y));
        group.add(b);
      }
    }
    // a flag on top of the exit, shown when it opens
    const flag = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture('🏁'), depthWrite: false, transparent: true }));
    flag.scale.setScalar(0.9);
    flag.visible = false;
    const topExit = spec.exits.filter((c) => c < W).map((c) => c % W)[0];
    if (topExit != null) flag.position.copy(at(topExit, 0)).add(new T.Vector3(0.55, 0.75, 0.3));
    group.add(flag);

    // gold: a pool of coin stacks put where the gold is each frame
    const coins = [];
    for (let i = 0; i < spec.total; i++) {
      const g = coinStack(k);
      g.visible = false;
      group.add(g);
      coins.push(g);
    }

    // robots
    const robots = spec.robots.map((c, i) => {
      const r = robotMesh(i, k);
      r.root.scale.setScalar(1.25);
      r.root.position.copy(at(c % W, (c / W) | 0));
      group.add(r.root);
      return r;
    });

    // ---------------------------------------------------------------- each frame

    let clock = 0, exitT = -1;
    const dirty = new Set();
    function update(s, dt) {
      clock += dt;
      // holes: a brick being dug crumbles, an open hole is empty, a closing one grows back with a wobble
      for (let c = 0; c < spec.n; c++) if (s.hole[c]) dirty.add(c);
      for (const c of dirty) {
        const i = brickIx[c];
        if (i < 0) { dirty.delete(c); continue; }
        let sc1 = 1, wob = 0;
        if (s.hole[c] === 1) {
          const u = 1 - Math.max(0, s.holeT[c]) / s.cfg.dig;
          sc1 = 1 - u * 0.75;
          wob = Math.sin(clock * 60) * 0.04;
        } else if (s.hole[c] === 2) {
          const left = s.holeT[c];
          sc1 = left < 0.7 ? Math.max(0.01, (0.7 - left) / 0.7) : 0.0001;
          if (left < 0.7) wob = Math.sin(clock * 40) * 0.03 * (left / 0.7);
        } else dirty.delete(c);
        placeBrick(i, c, sc1, wob);
      }
      brickMesh.instanceMatrix.needsUpdate = studMesh.instanceMatrix.needsUpdate = true;
      // gold
      let gi = 0;
      for (let c = 0; c < spec.n && gi < coins.length; c++) {
        if (!s.gold[c]) continue;
        const g = coins[gi++];
        g.visible = true;
        at(c % W, (c / W) | 0, g.position);
        g.position.y += 0.06 + Math.sin(clock * 3 + c) * 0.04;
        g.userData.big.rotation.z = 0;
        g.userData.big.rotation.y = clock * 2 + c;
      }
      for (; gi < coins.length; gi++) coins[gi].visible = false;
      // the exit ladder grows up out of the ground, rung by rung
      if (s.exitOpen && exitT < 0) exitT = 0;
      if (!s.exitOpen) exitT = -1;
      if (exitT >= 0) exitT += dt;
      for (const e of exitParts) {
        const delay = (H - 1 - e.y) * 0.08;
        const u = exitT < 0 ? 0 : Math.min(1, Math.max(0, (exitT - delay) / 0.25));
        e.g.visible = u > 0;
        e.g.scale.set(1, Math.max(0.01, u), 1);
        e.ghost.visible = u < 1;
      }
      flag.visible = exitT > 0.3;
      if (flag.visible) flag.material.rotation = Math.sin(clock * 3) * 0.15;
      // robots
      s.robots.forEach((b, i) => robotUpdate(robots[i], b, s, dt));
    }

    function robotUpdate(r, b, s, dt) {
      r.t += dt;
      const fx = TR.px(b), fy = TR.py(b);
      const tgt = at(fx, fy, new T.Vector3());
      const out = b.how === 'out';
      if (out && !r.wasOut) r.outT = 0;
      r.wasOut = out;
      if (out) {
        // sneezed out of the hole: up and away under a balloon
        r.outT += dt;
        r.root.visible = r.outT < 1.6;
        r.balloon.visible = true;
        r.root.position.set(tgt.x + Math.sin(r.outT * 4) * 0.15, tgt.y + r.outT * r.outT * 3.5, 0.1);
        r.body.rotation.z = Math.sin(r.outT * 6) * 0.25;
        r.dizzy.visible = false;
        return;
      }
      r.root.visible = true;
      r.balloon.visible = false;
      const vx = (fx - r.lastX) / Math.max(dt, 1e-3), vy = (fy - r.lastY) / Math.max(dt, 1e-3);
      r.lastX = fx;
      r.lastY = fy;
      r.root.position.set(tgt.x, tgt.y, 0.1);
      const moving = b.moving;
      // a little hop as it rolls, a lean into the turn
      r.body.position.y = moving && b.how === 'walk' ? Math.abs(Math.sin(r.t * 18)) * 0.04 : 0;
      r.body.rotation.z += ((moving && b.how === 'walk' ? -b.face * 0.12 : 0) - r.body.rotation.z) * Math.min(1, dt * 10);
      r.brush.rotation.y += dt * (moving ? 22 : 6);
      r.bob.position.y = 0.5 + Math.sin(r.t * 7) * 0.02;
      // on a bar it hangs from its hook; on a ladder it climbs flat against it
      const onBar = b.how === 'bar';
      r.hook.visible = onBar;
      r.body.position.y += onBar ? 0.05 : 0;
      r.loot.visible = b.gold >= 0;
      const stuck = b.how === 'hole';
      r.dizzy.visible = stuck;
      if (stuck) r.dizzy.material.rotation = r.t * 4;
      // googly eyes: the pupils lag behind the motion on springs (and spin round when stuck)
      for (const e of r.eyes) {
        let tx = Math.max(-1, Math.min(1, -vx * 0.04)) * 0.05 + b.face * 0.02, ty = Math.max(-1, Math.min(1, -vy * 0.04)) * 0.05;
        if (stuck) {
          tx = Math.cos(r.t * 9 + e.x * 20) * 0.05;
          ty = Math.sin(r.t * 9 + e.x * 20) * 0.05;
        }
        e.vx += ((tx - e.ox) * 160 - e.vx * 9) * dt;
        e.vy += ((ty - e.oy) * 160 - e.vy * 9) * dt;
        e.ox += e.vx * dt;
        e.oy += e.vy * dt;
        e.pupil.position.set(e.x + e.ox, 0.33 + e.oy, 0.31);
      }
    }

    function dispose() {
      group.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry !== k.brickGeo && o.geometry !== k.studGeo) o.geometry.dispose();
      });
      if (group.parent) group.parent.remove(group);
    }

    // the level's box on screen: the frame, plus room beside it for your brother
    const box = { x0: -W / 2 - 1.6, x1: W / 2 + 1.6, y0: -0.4, y1: H + 0.2 };
    return { group, update, dispose, at, box, robots, W, H, spec };
  }

  TR.makeWorld = makeWorld;
  TR.coinStack = (k) => coinStack(k || parts());
})();
