/* TT Treasure Runner: the renderer, the sunny sky and hills behind the level, and the fixed arcade camera.
   The level itself (bricks, ladders, gold, robots) is js/world.js.
     fit(box, margins)   aim the camera so a world box { x0, x1, y0, y1 } fills the screen minus margins (in pixels)
     toScreen(v)         a world point in screen pixels
     shake(secs)         the camera shakes for a moment */
(function () {
  'use strict';
  const T = THREE;
  const TR = window.TR;
  const { makeCanvas, toTexture, std, rand } = Kit.gfx;

  let renderer = null, W = 1, H = 1, sunLight = null;
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(18, 1, 0.5, 900); // a long lens: the grid stays square, the blocks still look 3D
  const camBase = new T.Vector3();
  const fx = { shake: 0 };
  const SKY = '#9fdcff';
  const ELEV = 0.13; // the camera looks down a little, so you see the tops of the bricks

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    buildSky();
    resize();
  }

  function resize() {
    W = Math.max(1, innerWidth || 1);
    H = Math.max(1, innerHeight || 1);
    if (renderer) renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- the sky, clouds and hills

  function skyTexture() {
    const [c, g] = makeCanvas(4, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#5fc4ff');
    grd.addColorStop(0.6, '#a8e2ff');
    grd.addColorStop(1, '#fff3c9');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    return toTexture(c);
  }

  const cloudMat = std('#ffffff', { roughness: 1 });
  function cloud(x, y, z, s) {
    const g = new T.Group();
    for (let i = 0; i < 5; i++) {
      const m = new T.Mesh(new T.SphereGeometry(1, 16, 12), cloudMat);
      m.position.set((i - 2) * 1.1 * s, Math.sin(i * 1.7) * 0.3 * s, 0);
      m.scale.set(1.2 * s, (0.8 + (i % 2) * 0.3) * s, 0.6 * s);
      g.add(m);
    }
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  }

  const clouds = [];
  function buildSky() {
    scene.background = new T.Color(SKY);
    const sky = new T.Mesh(new T.PlaneGeometry(600, 260), new T.MeshBasicMaterial({ map: skyTexture(), depthWrite: false, fog: false }));
    sky.position.set(0, 40, -160);
    scene.add(sky);
    scene.fog = new T.Fog(SKY, 120, 260);
    scene.add(new T.HemisphereLight('#ffffff', '#7fae6a', 0.7));
    const sun = new T.DirectionalLight('#fff4dc', 0.75);
    sun.position.set(-8, 14, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.001;
    scene.add(sun);
    scene.add(sun.target);
    sunLight = sun;
    // rolling green hills and a sandy beach far behind the level
    const hillMats = ['#7fd36b', '#5fbf5a', '#9be27a'].map((c) => std(c, { roughness: 1 }));
    for (let i = 0; i < 9; i++) {
      const h = new T.Mesh(new T.SphereGeometry(1, 24, 16), hillMats[i % 3]);
      const r = rand(14, 26);
      h.scale.set(r * 1.4, r * 0.55, r * 0.6);
      h.position.set(-70 + i * 18 + rand(-4, 4), -6 - r * 0.15, -60 - (i % 2) * 14);
      scene.add(h);
    }
    for (const [x, y, z, s] of [[-30, 22, -70, 2.6], [8, 27, -90, 3.2], [36, 20, -75, 2.4], [-55, 30, -110, 3.4], [62, 30, -110, 3]]) clouds.push(cloud(x, y, z, s));
    // a little sun
    const disc = new T.Mesh(new T.CircleGeometry(7, 32), new T.MeshBasicMaterial({ color: '#fff6a8', fog: false }));
    disc.position.set(48, 46, -150);
    scene.add(disc);
  }

  // ---------------------------------------------------------------- camera

  // Aim the camera (looking a little down) so the world box fills the screen minus margins { l, r, t, b } in pixels.
  // It fits the box in the middle of the picture, then slides the picture (the view offset) over the free part of the screen.
  const tmp = new T.Vector3();
  function fit(box, m) {
    cam.clearViewOffset();
    const dir = new T.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
    const center = new T.Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 0);
    const pts = [];
    for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [-0.5, 0.6]) pts.push(new T.Vector3(x, y, z));
    const fw = Math.max(0.1, (W - m.l - m.r) / W), fh = Math.max(0.1, (H - m.t - m.b) / H);
    const place = (d) => {
      cam.position.copy(center).addScaledVector(dir, d);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
    };
    const fits = () => {
      for (const p of pts) {
        tmp.copy(p).project(cam);
        if (Math.abs(tmp.x) > fw || Math.abs(tmp.y) > fh) return false;
      }
      return true;
    };
    let lo = 2, hi = 600;
    for (let i = 0; i < 36; i++) {
      const mid = (lo + hi) / 2;
      place(mid);
      if (fits()) hi = mid;
      else lo = mid;
    }
    place(hi);
    // the haze starts behind the level however far back the camera had to go (a tall phone puts it far away)
    scene.fog.near = hi + 60;
    scene.fog.far = hi + 220;
    const bx = (m.l + W - m.r) / 2, by = (m.t + H - m.b) / 2;
    cam.setViewOffset(W, H, W / 2 - bx, H / 2 - by, W, H);
    cam.updateMatrixWorld(true);
    camBase.copy(cam.position);
  }

  function toScreen(v, out = { x: 0, y: 0 }) {
    tmp.copy(v).project(cam);
    out.x = ((tmp.x + 1) / 2) * W;
    out.y = ((1 - tmp.y) / 2) * H;
    return out;
  }

  function shake(secs = 0.3) {
    fx.shake = Math.max(fx.shake, secs);
  }

  let t = 0;
  function update(dt) {
    t += dt;
    clouds.forEach((c, i) => (c.position.x += dt * (0.6 + i * 0.15) * (i % 2 ? 1 : -1) * 0.5));
    if (fx.shake > 0) {
      fx.shake -= dt;
      const a = Math.max(0, fx.shake) * 0.25;
      cam.position.set(camBase.x + rand(-a, a), camBase.y + rand(-a, a), camBase.z);
      cam.updateMatrixWorld(true);
    } else if (!cam.position.equals(camBase) && camBase.lengthSq()) {
      cam.position.copy(camBase);
      cam.updateMatrixWorld(true);
    }
  }

  function render() {
    if (renderer) renderer.render(scene, cam);
  }

  TR.stage = { // (a plain object literal: Object.assign would copy the getters' values once)
    init, resize, render, update, fit, toScreen, shake, scene, cam,
    get W() { return W; },
    get H() { return H; },
    get renderer() { return renderer; },
    get sun() { return sunLight; },
  };
})();
