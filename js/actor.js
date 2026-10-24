/* TT Treasure Runner: a runner (Teddy or Tommy) or the visiting brother, a Kit.people person in the level (from TT Box Push,
   by way of TT Slide Escape). The game sets where he is each frame and what he's doing (show()):
     run       side on, running (left or right)          climb   his back to you, hand over hand up a ladder
     hang      facing you, hanging from a bar             fall    arms up, legs kicking
     dig       side on, a toy spade swung at the brick    giggle  tickled by a robot: wobbling, hugging his tummy
     stand     facing you, breathing
   and reactions on top: react('signature' | 'hello' | 'goodbye' | 'cheer' | 'over'), act(pose, secs), hold(emoji).
   Signatures: Teddy's boxing (💥) and 🏀 jump shot, Tommy's Y with ✌️. */
(function () {
  'use strict';
  const T = THREE;
  const TR = window.TR;
  const { rand, emojiTexture, radialTexture, std } = Kit.gfx;

  const DUR = { cheer: 0.7, signature: 1.8, hello: 1.8 };
  const SPEED = { idle: 2.2, jump: 3, boxing: 6, peace: 4.2, wave: 5, jumpshot: 3, run: 13, give: 6, fall: 8, climb: 9, hang: 7, dig: 9, giggle: 14, high5: 3, point: 3 };
  const STANDING = { peace: 1, wave: 1, idle: 1, give: 1, high5: 1, point: 1 };
  const OURS = { climb: 1, hang: 1, dig: 1, giggle: 1, high5: 1, point: 1 };
  const FACE = { right: -Math.PI / 2, left: Math.PI / 2, you: 0.000001 + Math.PI, away: 0 };

  let shadowTex = null;

  function makeActor() {
    const holder = new T.Group();
    const shadow = new T.Mesh(new T.PlaneGeometry(1.3, 0.8), new T.MeshBasicMaterial({ depthWrite: false, transparent: true }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    const ball = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture('🏀'), depthWrite: false, transparent: true }));
    ball.visible = false;
    ball.renderOrder = 19;
    const held = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, transparent: true }));
    held.visible = false;
    held.renderOrder = 18;
    // a little blue toy spade for digging
    const spade = new T.Group();
    const handle = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.5, 6), std('#ffcf1f'));
    handle.position.y = -0.25;
    spade.add(handle);
    const blade = new T.Mesh(new T.BoxGeometry(0.22, 0.26, 0.04), std('#2f8fff', { roughness: 0.4 }));
    blade.position.y = -0.58;
    spade.add(blade);
    spade.visible = false;
    let p = null, entry = null, flyers = null;
    const st = {
      mode: 'idle', pose: 'idle', t: 0, phase: 0, hopY: 0, hopV: 0, wob: 9, wobAmp: 0, sigIx: 0, beat: -1, loop: null,
      ballT: -1, scale: 1, since: 0, bursts: 0, heldT: 0, base: 'stand', moving: false, face: 'you', giggleT: 0,
    };
    const tmp = new T.Vector3(), tmp2 = new T.Vector3(), ballFrom = new T.Vector3(), ballTo = new T.Vector3();

    function attach(scene, fl) {
      flyers = fl;
      scene.add(holder);
      scene.add(ball);
      if (!shadowTex) shadowTex = radialTexture(128, [[0, 'rgba(20,30,10,0.45)'], [0.6, 'rgba(20,30,10,0.2)'], [1, 'rgba(20,30,10,0)']]);
      shadow.material.map = shadowTex;
      shadow.material.needsUpdate = true;
      if (!shadow.parent) holder.add(shadow);
    }

    function set(id, scale = 1) {
      entry = Kit.roster.get(id) || Kit.roster.list[0];
      if (p) {
        holder.remove(p.root);
        p.root.traverse((o) => {
          if (o.isMesh) o.geometry.dispose();
        });
      }
      p = Kit.people.build(entry.look);
      p.root.rotation.y = FACE.you;
      holder.add(p.root);
      p.armR.add(spade);
      spade.position.set(0, -0.75, -0.1);
      Object.assign(st, { sigIx: 0, mode: 'idle', pose: 'idle', loop: null, ballT: -1 });
      ball.visible = false;
      setScale(scale);
      Kit.people.pose(p, 0, 'idle', 1);
      return entry;
    }

    function setScale(s) {
      st.scale = s;
      holder.scale.setScalar(s);
    }

    function place(x, y, z) {
      holder.position.set(x, y, z);
    }

    // What he's doing in the game this frame: base pose (run, climb, hang, fall, dig, giggle, stand), moving, facing.
    function show(base, moving, face) {
      st.base = base;
      st.moving = moving;
      st.face = face;
    }

    function react(kind) {
      if (!p) return null;
      if (st.loop && kind !== 'hello' && kind !== 'idle') return st.pose;
      switch (kind) {
        case 'hop':
          if (st.hopY < 0.05) st.hopV = Math.max(st.hopV, 2.2);
          return st.pose;
        case 'cheer':
          if (st.mode === 'signature') return st.pose;
          return begin('cheer', 'jump', DUR.cheer, 3.4);
        case 'signature': {
          if (st.mode === 'signature' && st.t > 0.4) return st.pose;
          const sig = entry.signature || ['wave'];
          const pose = sig[st.sigIx++ % sig.length];
          return begin('signature', pose, DUR.signature, hopFor(pose));
        }
        case 'hello':
          st.loop = null;
          return begin('signature', Kit.roster.signature(entry, 'hello'), DUR.hello, 2.6);
        case 'goodbye': {
          const pose = Kit.roster.signature(entry, 'goodbye');
          return begin('signature', pose, DUR.signature, hopFor(pose));
        }
        case 'over': {
          const sig = entry.signature || ['wave'];
          const pose = Kit.roster.signature(entry, 'goodbye');
          st.sigIx = sig.indexOf(pose) + 1;
          st.loop = true;
          st.loopWait = 0.6;
          return begin('signature', pose, DUR.signature, hopFor(pose));
        }
        case 'idle':
          st.loop = null;
          st.mode = 'idle';
          st.pose = 'idle';
          return 'idle';
      }
      return null;
    }

    function act(pose, dur, hop = 0, force = false) {
      if (!p || (!force && st.mode === 'signature' && st.t > 0.2)) return st.pose;
      if (st.mode === 'act' && st.pose === pose) {
        st.t = Math.max(st.t, dur);
        return pose;
      }
      return begin('act', pose, dur, hop);
    }

    const hopFor = (pose) => (pose === 'jumpshot' ? 5.4 : pose === 'peace' ? 2.6 : 1.4);

    function begin(mode, pose, dur, hop) {
      Object.assign(st, { mode, pose, t: dur, phase: 0, beat: -1, since: 0, bursts: 0 });
      if (hop) st.hopV = hop;
      if (pose === 'jumpshot') st.ballT = 0;
      return pose;
    }

    function hold(emoji, secs = 6) {
      if (!p) return;
      held.material.map = emojiTexture(emoji);
      held.material.needsUpdate = true;
      p.armL.add(held);
      held.position.set(0, -0.86, -0.25);
      held.scale.setScalar(0.62);
      held.visible = true;
      st.heldT = secs;
    }
    function drop() {
      held.visible = false;
      st.heldT = 0;
    }

    function update(dt) {
      if (!p) return;
      st.t -= dt;
      if (st.mode !== 'idle' && st.t <= 0) {
        st.mode = 'idle';
        st.pose = 'idle';
      }
      if (st.loop && st.mode === 'idle') {
        st.loopWait -= dt;
        if (st.loopWait <= 0) {
          st.loopWait = 0.6;
          const sig = entry.signature || ['wave'];
          const pose = sig[st.sigIx++ % sig.length];
          begin('signature', pose, DUR.signature, hopFor(pose));
        }
      }
      // a reaction (signature, cheer, wave, point) shows over standing or running; climbing, hanging, falling, digging
      // and giggling are what the game says he's doing
      const busy = st.base === 'climb' || st.base === 'hang' || st.base === 'fall' || st.base === 'dig' || st.base === 'giggle';
      let pose;
      if (st.mode !== 'idle' && !busy) pose = st.pose;
      else if (st.base === 'run') pose = st.moving ? 'run' : 'idle';
      else if (st.base === 'stand') pose = 'idle';
      else pose = st.base;
      const climbing = pose === 'climb' || pose === 'hang';
      st.phase += dt * (SPEED[pose] || 2.2) * (climbing && !st.moving ? 0 : 1);
      // which way he faces: the way he runs, his back to you on a ladder, towards you hanging, celebrating and standing
      let face = FACE.you;
      if (pose === 'run' || pose === 'dig' || pose === 'fall') face = st.face === 'left' ? FACE.left : st.face === 'right' ? FACE.right : FACE.you;
      else if (pose === 'climb') face = FACE.away;
      if (pose === 'fall' && st.face !== 'left' && st.face !== 'right') face = FACE.you;
      let da = face - p.root.rotation.y;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      p.root.rotation.y += da * (1 - Math.exp(-14 * dt));
      const k = 1 - Math.exp(-16 * dt);
      const was = OURS[pose] ? { rx: p.armR.rotation.x, rz: p.armR.rotation.z, lx: p.armL.rotation.x, lz: p.armL.rotation.z, hx: p.head.rotation.x, llx: p.legL.rotation.x, lrx: p.legR.rotation.x } : null;
      Kit.people.pose(p, st.phase, OURS[pose] ? 'idle' : pose, k);
      let tilt = 0;
      if (OURS[pose]) tilt = ours(pose, k, was);
      p.head.rotation.z += (tilt - p.head.rotation.z) * k;
      if (STANDING[pose]) {
        p.legL.rotation.x *= 0.35;
        p.legR.rotation.x *= 0.35;
      }
      if (pose === 'idle') {
        const breathe = Math.sin(st.phase) * 0.03;
        p.armL.rotation.z = -0.08 - breathe;
        p.armR.rotation.z = 0.08 + breathe;
      }
      spade.visible = pose === 'dig';
      // hanging: he hangs below the bar (his hands at the top of the cell)
      const hangDrop = pose === 'hang' ? -0.12 : 0;
      st.hopV -= 14 * dt;
      st.hopY = Math.max(0, st.hopY + st.hopV * dt);
      if (st.hopY === 0 && st.hopV < 0) st.hopV = 0;
      p.root.position.y = st.hopY + hangDrop;
      shadow.visible = pose !== 'hang' && pose !== 'climb' && pose !== 'fall';
      shadow.material.opacity = 1 / (1 + st.hopY * 1.2);
      st.wob += dt;
      p.root.rotation.z = st.wobAmp * Math.sin(st.wob * 17) * Math.exp(-st.wob * 3.2) + (pose === 'giggle' ? Math.sin(st.phase * 1.3) * 0.18 : 0);
      st.since += dt;
      if (st.heldT > 0) {
        st.heldT -= dt;
        if (st.heldT <= 0) drop();
      }
      holder.updateMatrixWorld(true);
      if (!flyers) return;
      const s = st.scale;
      if (pose === 'boxing') {
        const beat = Math.floor((((st.phase / (Math.PI * 2)) % 1) + 1) % 1 * 4);
        if (beat !== st.beat) {
          st.beat = beat;
          if (beat === 0 || beat === 2) {
            TR.sfx.kit('punch');
            Kit.people.handWorld(p, beat === 0 ? -1 : 1, tmp);
            flyers.add('💥', tmp.x, tmp.y, tmp.z + 0.3 * s, rand(-0.4, 0.4), rand(0.4, 1), 0.6 * s, 0.45, 0, 0);
          }
        }
      }
      if (pose === 'peace' && st.bursts < 3 && st.since > 0.15 + st.bursts * 0.55) {
        st.bursts++;
        for (const side of [-1, 1]) {
          Kit.people.handWorld(p, side, tmp);
          flyers.add(Math.random() < 0.7 ? '✌️' : '⭐', tmp.x, tmp.y + 0.1, tmp.z + 0.3, side * rand(0.3, 0.9), rand(1.6, 2.6), rand(0.45, 0.6) * s, 1.1, rand(-1, 1), 0.15);
        }
      }
      if (pose === 'giggle') {
        st.giggleT -= dt;
        if (st.giggleT <= 0) {
          st.giggleT = 0.28;
          const hp = holder.position;
          flyers.add(Math.random() < 0.6 ? '😆' : Math.random() < 0.5 ? '✨' : '💖', hp.x + rand(-0.3, 0.3), hp.y + 1.9 * s, hp.z + 0.4, rand(-0.8, 0.8), rand(1, 2), rand(0.35, 0.5), 0.9, rand(-2, 2), 0.5);
        }
      }
      updateBall(dt);
    }

    // Our poses on top of the Kit's standing pose. Returns the head's sideways tilt.
    function ours(pose, k, was) {
      const KEY = { rx: [p.armR.rotation, 'x'], rz: [p.armR.rotation, 'z'], lx: [p.armL.rotation, 'x'], lz: [p.armL.rotation, 'z'], hx: [p.head.rotation, 'x'], llx: [p.legL.rotation, 'x'], lrx: [p.legR.rotation, 'x'] };
      const to = (key, v) => {
        const [o, prop] = KEY[key];
        o[prop] = was[key] + (v - was[key]) * k;
      };
      const s = Math.sin(st.phase);
      if (pose === 'climb') {
        // hand over hand, knees up and down
        to('rx', 2.65 + s * 0.45);
        to('lx', 2.65 - s * 0.45);
        to('rz', 0.15);
        to('lz', -0.15);
        to('llx', 0.55 + s * 0.45);
        to('lrx', 0.55 - s * 0.45);
        return 0;
      }
      if (pose === 'hang') {
        // both hands up on the bar, swapping as he goes; legs together, swinging a little
        to('rx', 3.0 + (st.moving ? s * 0.25 : 0));
        to('lx', 3.0 - (st.moving ? s * 0.25 : 0));
        to('rz', 0.22);
        to('lz', -0.22);
        to('llx', 0.12 + Math.sin(st.phase * 0.5) * 0.15);
        to('lrx', 0.12 + Math.sin(st.phase * 0.5) * 0.15);
        return 0;
      }
      if (pose === 'dig') {
        // the spade swings up and chops down at the brick by his feet
        const u = (Math.sin(st.phase) + 1) / 2;
        to('rx', 0.4 + u * 1.9);
        to('rz', 0.05);
        to('lx', 0.9);
        to('lz', -0.2);
        to('hx', 0.35);
        to('llx', 0.3);
        to('lrx', -0.2);
        return 0;
      }
      if (pose === 'giggle') {
        // hugging his tummy and wriggling
        to('rx', 0.9 + s * 0.15);
        to('lx', 0.9 - s * 0.15);
        to('rz', -0.55);
        to('lz', 0.55);
        to('hx', -0.2);
        to('llx', s * 0.3);
        to('lrx', -s * 0.3);
        return 0.25 * Math.sin(st.phase * 0.7);
      }
      if (pose === 'point') {
        to('rx', 1.55 + s * 0.06);
        to('rz', 0);
        return 0;
      }
      if (pose === 'high5') {
        to('rx', 2.6);
        to('lx', 2.6);
        to('rz', 0.12);
        to('lz', -0.12);
        return 0;
      }
      return 0;
    }

    function fwd(out, len) {
      const a = p.root.rotation.y;
      return out.set(-Math.sin(a) * len, 0, -Math.cos(a) * len);
    }

    function updateBall(dt) {
      if (st.ballT < 0) return;
      st.ballT += dt;
      const s = st.scale;
      ball.scale.setScalar(0.5 * s);
      if (st.ballT < 0.38) {
        Kit.people.handWorld(p, -1, tmp);
        Kit.people.handWorld(p, 1, tmp2);
        ballFrom.copy(tmp).add(tmp2).multiplyScalar(0.5);
        ballFrom.y += 0.2 * s;
        ball.position.copy(ballFrom);
        ball.visible = true;
        ballTo.copy(ballFrom);
        fwd(tmp, 1.6 * s);
        ballTo.x += tmp.x + 1.2 * s;
        ballTo.z += tmp.z;
        ballTo.y += 1.4 * s;
      } else {
        const u = Math.min(1, (st.ballT - 0.38) / 0.8);
        ball.position.lerpVectors(ballFrom, ballTo, u);
        ball.position.y += Math.sin(u * Math.PI) * 1.4 * s;
        ball.material.rotation -= 8 * dt;
        if (u >= 1) {
          ball.visible = false;
          st.ballT = -1;
          TR.sfx.kit('swish');
          for (let i = 0; i < 6; i++) flyers.add('⭐', ballTo.x, ballTo.y, ballTo.z, rand(-1.5, 1.5), rand(0.5, 2.5), 0.35 * s, 0.7, rand(-3, 3), 4);
        }
      }
    }

    return {
      attach, set, setScale, place, show, react, act, update, hold, drop,
      get entry() { return entry; },
      get person() { return p; },
      get mode() { return st.mode; },
      get pose() { return st.pose; },
      get base() { return st.base; },
      get root() { return holder; },
      get scale() { return st.scale; },
      get holding() { return st.heldT > 0; },
      set visible(v) {
        holder.visible = v;
        if (!v) {
          ball.visible = false;
          st.ballT = -1;
        }
      },
      get visible() { return holder.visible; },
    };
  }

  TR.makeActor = makeActor;
})();
