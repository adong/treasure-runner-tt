/* TT Treasure Runner: your brother. In 1 player the other brother (Kit.roster.buddyFor: Teddy when Tommy plays, Tommy for
   Teddy) comes when called with T or his face button, any time and as often as you like. A visit:
     pop in beside the level (at his roster buddyScale, in a puff of stars) → hello with his signature move (Teddy's boxing
     or jump shot, Tommy's Y with ✌️) → toss you a treat (🍦 💧 🧃 🍪 🍉 🍌) → dig a row of holes in the floor in front of the
     nearest robot ("TOMMY SAYS: HOLES FOR THE ROBOT!"): little spades fly over and each brick crumbles → goodbye → pop out.
   Calling him again while he's there brings another treat and another row of holes.
   In 2 players both brothers are already playing, so T is a high five (TR.highFive): they jump and clap (💥 🙌). */
(function () {
  'use strict';
  const T = THREE;
  const TR = window.TR;
  const { pick, emojiTexture, rand } = Kit.gfx;

  const V = { pop: 0.35, treatAt: 1.9, helpAt: 2.5, stay: 2.4 };
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];

  let api = null, entry = null, flyers = null;
  const actor = TR.makeActor();
  // phase: off | in | here | bye | out
  const b = { phase: 'off', t: 0, given: false, treatAt: V.treatAt, helped: false, doneAt: -1, calls: 0, treats: 0, holes: 0, lastTreat: null, lastPlan: null, popT: 0, side: 1 };
  const treat = { sprite: null, flyT: -1, emoji: '', from: new T.Vector3(), to: new T.Vector3() };
  const spades = []; // { sprite, from, to, t, cell }
  const tmp = new T.Vector3();

  function init(a) {
    api = a;
    flyers = a.flyers;
    treat.sprite = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true }));
    treat.sprite.visible = false;
    treat.sprite.renderOrder = 22;
    TR.stage.scene.add(treat.sprite);
    actor.attach(TR.stage.scene, flyers);
    actor.visible = false;
  }

  function setFor(playerId) {
    const id = Kit.roster.buddyFor(playerId);
    if (entry && entry.id === id) return entry;
    dismiss();
    entry = Kit.roster.get(id);
    actor.set(id, 1);
    const tag = Kit.gfx.nameTag(entry.name, entry.tag || '#ffb02e');
    tag.position.y = 2.75;
    actor.person.root.add(tag);
    actor.visible = false;
    return entry;
  }

  const scaleNow = () => (entry.buddyScale || 0.8) * api.scale();

  // beside the level, on the grass, on the side nearer the robots
  function spot() {
    const w = api.world(), s = api.state();
    let side = b.side;
    if (s && s.robots.length && b.phase === 'off') {
      const plan = TR.buddyPlan(s);
      const rb = plan.robot >= 0 ? s.robots[plan.robot] : null;
      side = rb && rb.x < s.W / 2 ? -1 : 1;
    }
    return { x: side * (w.W / 2 + 1.0), y: -0.34, z: 0.5, side };
  }

  function call() {
    if (!entry) return 'none';
    b.calls++;
    if (b.phase === 'off' || b.phase === 'out') return summon();
    actor.react('hello');
    b.phase = 'here';
    b.t = Math.min(b.t, V.pop + 0.1);
    b.given = false;
    b.treatAt = b.t + 1.4;
    b.helped = false;
    b.doneAt = -1;
    api.toast(`${entry.name}'S HERE!`, 'buddy');
    TR.sfx.hello();
    return 'again';
  }

  function summon() {
    const sp = spot();
    b.side = sp.side;
    Object.assign(b, { phase: 'in', t: 0, given: false, treatAt: V.treatAt, helped: false, doneAt: -1, popT: 0 });
    actor.setScale(0.01);
    actor.place(sp.x, sp.y, sp.z);
    actor.show('stand', false, 'you');
    actor.visible = true;
    actor.react('idle');
    for (let i = 0; i < 14; i++) flyers.add(i % 3 ? '⭐' : '✨', sp.x, 0.6 + rand(0, 0.6), sp.z, rand(-2, 2), rand(1, 3), rand(0.22, 0.36), 0.8, rand(-4, 4), 3);
    api.toast(`${entry.name}'S HERE!`, 'buddy');
    TR.sfx.hello();
    return 'summoned';
  }

  function dismiss() {
    b.phase = 'off';
    actor.visible = false;
    treat.flyT = -1;
    if (treat.sprite) treat.sprite.visible = false;
    for (const sp of spades) TR.stage.scene.remove(sp.sprite);
    spades.length = 0;
  }

  // ---------------------------------------------------------------- the treat

  function giveTreat() {
    const [emoji, label] = pick(TREATS);
    treat.emoji = emoji;
    b.treats++;
    b.lastTreat = emoji;
    treat.sprite.material.map = emojiTexture(emoji);
    treat.sprite.material.needsUpdate = true;
    actor.root.updateMatrixWorld(true);
    Kit.people.handWorld(actor.person, 1, treat.from);
    treat.sprite.position.copy(treat.from);
    treat.sprite.scale.setScalar(0.6);
    treat.sprite.visible = true;
    treat.flyT = 0;
    api.toast(`${emoji} ${label} FROM ${entry.name}!`, 'treat');
    TR.sfx.kit('coin', 6);
  }

  function updateTreat(dt) {
    if (treat.flyT < 0) return;
    const player = api.player();
    treat.flyT += dt / 0.8;
    player.root.updateMatrixWorld(true);
    Kit.people.handWorld(player.person, -1, treat.to);
    const k = Math.min(1, treat.flyT);
    treat.sprite.position.lerpVectors(treat.from, treat.to, k);
    treat.sprite.position.y += Math.sin(k * Math.PI) * 2;
    treat.sprite.material.rotation = k * Math.PI * 2;
    if (k >= 1) {
      treat.flyT = -1;
      treat.sprite.visible = false;
      treat.sprite.material.rotation = 0;
      player.hold(treat.emoji, 6);
    }
  }

  // ---------------------------------------------------------------- the holes

  function digHoles() {
    const s = api.state();
    const plan = TR.buddyPlan(s);
    b.lastPlan = { robot: plan.robot, cells: plan.cells.slice() };
    if (plan.robot < 0) {
      api.toast(`${entry.name} SAYS: NO ROBOTS HERE! GO GET THE GOLD!`, 'save');
      actor.react('signature');
      return;
    }
    if (!plan.cells.length) {
      api.toast(`${entry.name} SAYS: NO BRICKS BY THE ROBOT! RUN!`, 'save');
      actor.react('signature');
      return;
    }
    api.toast(`${entry.name} SAYS: HOLES FOR THE ROBOT!`, 'save');
    actor.act('point', 1.6, 0, true);
    const w = api.world();
    actor.root.updateMatrixWorld(true);
    Kit.people.handWorld(actor.person, 1, tmp);
    plan.cells.forEach((c, i) => {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture('⛏️'), depthWrite: false, depthTest: false, transparent: true }));
      sp.scale.setScalar(0.55);
      sp.renderOrder = 23;
      sp.visible = false;
      TR.stage.scene.add(sp);
      const to = w.at(c % s.W, ((c / s.W) | 0) - 1).add(new T.Vector3(0, 0.2, 0.5));
      spades.push({ sprite: sp, from: tmp.clone(), to, t: -i * 0.18, cell: c, n: i });
    });
  }

  function updateSpades(dt) {
    for (let i = spades.length - 1; i >= 0; i--) {
      const sp = spades[i];
      sp.t += dt;
      if (sp.t < 0) continue;
      const k = Math.min(1, sp.t / 0.45);
      sp.sprite.visible = true;
      sp.sprite.position.lerpVectors(sp.from, sp.to, k);
      sp.sprite.position.y += Math.sin(k * Math.PI) * 1.6;
      sp.sprite.material.rotation = -k * Math.PI * 3;
      if (k >= 1) {
        const s = api.state();
        if (s && TR.digAt(s, sp.cell)) b.holes++;
        TR.sfx.zap(sp.n);
        for (let n = 0; n < 6; n++) flyers.add(n % 2 ? '💨' : '✨', sp.to.x, sp.to.y - 0.3, sp.to.z, rand(-1.2, 1.2), rand(0.5, 2), 0.3, 0.6, rand(-3, 3), 3);
        TR.stage.scene.remove(sp.sprite);
        spades.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- the visit

  function update(dt) {
    updateTreat(dt);
    updateSpades(dt);
    if (b.phase === 'off') return;
    b.t += dt;
    const full = scaleNow();
    if (b.phase === 'in' || b.phase === 'here' || b.phase === 'bye') {
      b.popT += dt;
      const u = Math.min(1, b.popT / V.pop);
      const spring = u < 1 ? 1 + Math.sin(u * Math.PI) * 0.25 : 1;
      actor.setScale(full * Math.max(0.01, u) * spring);
    }
    if (b.phase === 'in' && b.t >= V.pop) {
      b.phase = 'here';
      actor.react('hello');
    }
    if (b.phase === 'here') {
      if (!b.given && b.t > b.treatAt - 0.35) actor.act('give', 0.6, 0, true);
      if (!b.given && b.t > b.treatAt) {
        b.given = true;
        giveTreat();
      }
      if (b.given && !b.helped && b.t > Math.max(V.helpAt, b.treatAt + 0.6)) {
        b.helped = true;
        digHoles();
        b.doneAt = b.t;
      }
      if (b.doneAt >= 0 && b.t > b.doneAt + V.stay && !spades.length && treat.flyT < 0) {
        b.phase = 'bye';
        b.t = 0;
        actor.react('goodbye');
      }
    } else if (b.phase === 'bye') {
      if (b.t > 1.7) {
        b.phase = 'out';
        b.t = 0;
        TR.sfx.hello();
      }
    } else if (b.phase === 'out') {
      const u = Math.min(1, b.t / 0.25);
      actor.setScale(full * Math.max(0.01, 1 - u) * (1 + Math.sin(u * Math.PI) * 0.2));
      if (u >= 1) {
        const p = actor.root.position;
        for (let i = 0; i < 8; i++) flyers.add('✨', p.x, 0.6, p.z, rand(-1.5, 1.5), rand(1, 2.5), 0.25, 0.6, rand(-4, 4), 3);
        dismiss();
      }
    }
    actor.update(dt);
  }

  // ---------------------------------------------------------------- 2 players: the high five

  const hf = { on: false, t: 0, clapped: false, count: 0 };
  function highFive() {
    if (hf.on) return 'busy';
    Object.assign(hf, { on: true, t: 0, clapped: false });
    hf.count++;
    for (const a of api.players()) a.act('high5', 0.9, 2.6, true);
    return 'high5';
  }
  function updateHighFive(dt) {
    if (!hf.on) return;
    hf.t += dt;
    if (!hf.clapped && hf.t > 0.3) {
      hf.clapped = true;
      TR.sfx.clap();
      const ps = api.players().map((a) => a.root.position);
      const near = ps.length > 1 && ps[0].distanceTo(ps[1]) < 1.6;
      const at = near ? [ps[0].clone().add(ps[1]).multiplyScalar(0.5)] : ps;
      for (const p of at) {
        flyers.add('💥', p.x, p.y + 1.1, p.z + 0.4, 0, 0.5, 0.6, 0.5, 0, 0);
        for (let i = 0; i < 6; i++) flyers.add(i % 2 ? '🙌' : '⭐', p.x, p.y + 1.1, p.z + 0.4, rand(-2, 2), rand(1.2, 3), rand(0.28, 0.4), 1, rand(-3, 3), 4);
      }
      api.toast('HIGH FIVE! 🙌', 'buddy');
    }
    if (hf.t > 1.1) hf.on = false;
  }

  TR.buddy = {
    init, setFor, call, summon, dismiss, update, V,
    get entry() { return entry; },
    get actor() { return actor; },
    get on() { return b.phase !== 'off'; },
    get phase() { return b.phase; },
    info() {
      const r = actor.root.position;
      return {
        phase: b.phase, id: entry && entry.id, t: +b.t.toFixed(2), given: b.given, helped: b.helped, calls: b.calls, treats: b.treats, holes: b.holes,
        lastTreat: b.lastTreat, lastPlan: b.lastPlan, pose: actor.pose, x: +r.x.toFixed(2), scale: +actor.scale.toFixed(2), visible: actor.visible,
        flying: treat.flyT >= 0, spades: spades.length, highFives: hf.count, highFiving: hf.on,
      };
    },
  };
  TR.highFive = { start: highFive, update: updateHighFive, get on() { return hf.on; } };
})();
