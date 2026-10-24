/* TT Treasure Runner: effects (from TT Box Push, by way of TT Slide Escape).
   TR.fx.flyers(scene): emoji sprites that fly, spin and fade in a 3D scene (stars, 💥, ✌️, treats).
   TR.fx.bursts(scene): comic "ACHOO!" / "BOOP!" starbursts that pop and fade.
   TR.fx.overlay: confetti and emoji on the 2D canvas over the page, in screen pixels (confetti for a win). */
(function () {
  'use strict';
  const T = THREE;
  const TR = window.TR;
  const { makeCanvas, toTexture, emojiTexture, rand, pick, FONT } = Kit.gfx;

  // ---------------------------------------------------------------- 3D emoji flyers

  function flyers(scene, max = 48) {
    const pool = [];
    for (let i = 0; i < max; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true }));
      s.visible = false;
      s.renderOrder = 20;
      scene.add(s);
      pool.push({ s, life: 0, age: 0, vx: 0, vy: 0, vz: 0, spin: 0, g: 0, size: 1 });
    }
    let next = 0;
    return {
      // emoji at (x, y, z), velocity (vx, vy) in m/s, size in m, life in s, spin in rad/s, gravity in m/s²
      add(emoji, x, y, z, vx, vy, size, life, spin = 0, g = 6, vz = 0) {
        const f = pool[next];
        next = (next + 1) % max;
        f.s.material.map = emojiTexture(emoji);
        f.s.material.needsUpdate = true;
        f.s.material.rotation = 0;
        f.s.position.set(x, y, z);
        f.s.scale.setScalar(size);
        f.s.visible = true;
        Object.assign(f, { life, age: 0, vx, vy, vz, spin, g, size });
        return f;
      },
      update(dt) {
        for (const f of pool) {
          if (!f.s.visible) continue;
          f.age += dt;
          if (f.age >= f.life) {
            f.s.visible = false;
            continue;
          }
          f.vy -= f.g * dt;
          f.s.position.x += f.vx * dt;
          f.s.position.y += f.vy * dt;
          f.s.position.z += f.vz * dt;
          f.s.material.rotation += f.spin * dt;
          const u = f.age / f.life;
          const pop = Math.min(1, f.age / 0.12);
          f.s.scale.setScalar(f.size * (0.5 + 0.5 * pop));
          f.s.material.opacity = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
        }
      },
      clear() {
        for (const f of pool) f.s.visible = false;
      },
    };
  }

  // ---------------------------------------------------------------- comic starbursts

  const burstCache = {};
  // The word is translated when drawn (ACHOO! has its 中文 too), and cached per language.
  function burstTexture(en, fill = '#ffd400', ink = '#e8372c') {
    const word = Kit.lang ? Kit.lang.t(en) : en;
    const key = word + fill + ink;
    if (burstCache[key]) return burstCache[key];
    const [c, g] = makeCanvas(256, 256);
    const spikes = 12;
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 78 : 122 - (i % 4 === 0 ? 0 : 10);
      g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = ink;
    g.lineJoin = 'round';
    g.stroke();
    let size = word.length > 4 ? 46 : 56;
    g.font = `${size}px ${FONT}`;
    const w = g.measureText(word).width;
    if (w > 190) g.font = `${Math.floor((size * 190) / w)}px ${FONT}`; // keep it inside the star
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#14121f';
    g.strokeText(word, 128, 134);
    g.fillStyle = '#ffffff';
    g.fillText(word, 128, 134);
    return (burstCache[key] = toTexture(c));
  }

  function bursts(scene, max = 6) {
    const pool = [];
    for (let i = 0; i < max; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true }));
      s.visible = false;
      s.renderOrder = 21;
      scene.add(s);
      pool.push({ s, age: 0, size: 1, life: 0.6 });
    }
    let next = 0;
    return {
      add(word, x, y, z, size = 1.6, fill, ink) {
        const b = pool[next];
        next = (next + 1) % max;
        b.s.material.map = burstTexture(word, fill, ink);
        b.s.material.needsUpdate = true;
        b.s.material.rotation = rand(-0.3, 0.3);
        b.s.position.set(x, y, z);
        b.s.visible = true;
        Object.assign(b, { age: 0, size, life: 0.62 });
      },
      update(dt) {
        for (const b of pool) {
          if (!b.s.visible) continue;
          b.age += dt;
          const u = b.age / b.life;
          if (u >= 1) {
            b.s.visible = false;
            continue;
          }
          const pop = u < 0.2 ? (u / 0.2) * 1.25 : 1.25 - Math.min(0.25, (u - 0.2) * 1.2);
          b.s.scale.setScalar(b.size * pop);
          b.s.position.y += dt * 0.6;
          b.s.material.opacity = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
        }
      },
      clear() {
        for (const b of pool) b.s.visible = false;
      },
    };
  }

  // ---------------------------------------------------------------- 2D overlay: confetti and emoji in screen pixels

  const overlay = (function () {
    let cv = null, g = null, dpr = 1;
    const parts = [];
    const COLORS = ['#ffd400', '#ff3d7f', '#18d4ff', '#3fe0b0', '#ff8a1f', '#a77bff'];
    function init(canvas) {
      cv = canvas;
      g = cv.getContext('2d');
      resize();
    }
    function resize() {
      if (!cv) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, Math.round(innerWidth * dpr));
      cv.height = Math.max(1, Math.round(innerHeight * dpr));
    }
    // a burst of confetti (and optionally emoji) at screen point (x, y)
    function burst(x, y, n = 24, emojis = null, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(180, 520) * power;
        const emo = emojis && Math.random() < 0.4 ? pick(emojis) : null;
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260 * power, life: rand(0.9, 1.5), age: 0,
          rot: rand(0, 6), vr: rand(-10, 10), w: rand(8, 15), h: rand(5, 9), color: pick(COLORS), emo, size: rand(26, 40),
        });
      }
      while (parts.length > 400) parts.shift();
    }
    // confetti raining down from the top edge
    function rain(n = 80) {
      for (let i = 0; i < n; i++) {
        parts.push({
          x: rand(0, innerWidth), y: rand(-200, -10), vx: rand(-60, 60), vy: rand(80, 260), life: rand(2, 3.2), age: 0,
          rot: rand(0, 6), vr: rand(-8, 8), w: rand(8, 15), h: rand(5, 9), color: pick(COLORS), emo: null, size: 0,
        });
      }
    }
    function update(dt) {
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) {
          parts.splice(i, 1);
          continue;
        }
        p.vy += 700 * dt;
        p.vx *= 1 - 1.6 * dt;
        p.vy *= 1 - 0.9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const u = p.age / p.life;
        g.globalAlpha = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        if (p.emo) {
          g.font = `${p.size}px ${Kit.gfx.EMOJI_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(p.emo, 0, 0);
        } else {
          g.fillStyle = p.color;
          g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)) + 1);
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }
    const clear = () => { parts.length = 0; };
    return { init, resize, burst, rain, update, clear, get count() { return parts.length; } };
  })();

  TR.fx = { flyers, bursts, burstTexture, overlay };
})();
