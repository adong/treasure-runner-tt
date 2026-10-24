/* TT Treasure Runner: the level maker, for Teddy. A 20 x 12 grid: pick a tool (brick, steel, ladder, bar, gold, robot, the
   rainbow exit ladder, Teddy, Tommy, the sponge to rub things out) and tap or drag on the grid. Three slots (MY LEVEL 1, 2,
   3) save as you go. TRY IT checks the level (Teddy, some gold, the rainbow ladder up to the top row), asks the solver whether
   it can be cleared, then plays it. Your levels are in the level picker too. Keys: 1-9 and 0 pick a tool, the arrows move
   the pink box, Space puts the tool there, Enter tries it, Esc goes home. */
(function () {
  'use strict';
  const TR = window.TR;
  const W = 20, H = 12;
  const TOOLS = [
    ['#', '🧱', 'Brick: you can dig it'], ['@', '🔩', 'Steel: no digging'], ['H', '🪜', 'Ladder'], ['-', '➖', 'Bar'], ['$', '💰', 'Gold'],
    ['R', '🤖', 'Robot'], ['S', '🌈', 'Rainbow exit ladder'], ['1', 'teddy', 'Teddy'], ['2', 'tommy', 'Tommy'], ['.', '🧽', 'Rub out'],
  ];
  const BG = { '#': '#f2643a', '@': '#8fa3c8' };

  let api = null, ui = null, slot = 0, tool = '#', rows = null, cursor = { x: 1, y: 10 }, painting = false, open = false;

  function template() {
    const r = [];
    for (let y = 0; y < H; y++) {
      let line = '';
      for (let x = 0; x < W; x++) {
        let ch = '.';
        if (y === H - 1) ch = '@';
        else if (x === W - 2) ch = 'S';
        else if (y === H - 2 && x === 1) ch = '1';
        else if (y === H - 2 && x === 9) ch = '$';
        line += ch;
      }
      r.push(line);
    }
    return r;
  }

  function init(a) {
    api = a;
    ui = { tools: document.getElementById('edTools'), grid: document.getElementById('edGrid'), info: document.getElementById('edInfo'), slots: document.getElementById('edSlots') };
    const art = api.art();
    TOOLS.forEach(([ch, icon, label], i) => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.t = ch;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = (art[icon] ? `<img src="${art[icon]}" alt="">` : icon) + `<kbd>${(i + 1) % 10}</kbd>`;
      b.addEventListener('click', () => pick(ch));
      ui.tools.appendChild(b);
    });
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button');
      b.textContent = `MY LEVEL ${i + 1}`;
      b.addEventListener('click', () => load(i));
      ui.slots.appendChild(b);
    }
    ui.grid.style.gridTemplateColumns = `repeat(${W}, var(--cell))`;
    for (let i = 0; i < W * H; i++) ui.grid.appendChild(document.createElement('i'));
    const at = (e) => {
      const r = ui.grid.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H);
      return x >= 0 && x < W && y >= 0 && y < H ? { x, y } : null;
    };
    ui.grid.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      painting = true;
      try { ui.grid.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      const c = at(e);
      if (c) paint(c.x, c.y);
    });
    ui.grid.addEventListener('pointermove', (e) => {
      if (!painting) return;
      const c = at(e);
      if (c) paint(c.x, c.y);
    });
    for (const t of ['pointerup', 'pointercancel']) ui.grid.addEventListener(t, () => (painting = false));
    document.getElementById('edTest').addEventListener('click', tryIt);
    document.getElementById('edClear').addEventListener('click', () => {
      rows = template();
      keep();
      draw();
    });
    document.getElementById('edHome').addEventListener('click', () => api.home());
    addEventListener('keydown', key);
    addEventListener('resize', size);
  }

  function key(e) {
    if (!open) return;
    const k = e.key.toLowerCase();
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    if (k >= '0' && k <= '9') return pick(TOOLS[(+k + 9) % 10][0]);
    if (k === 'arrowleft') cursor.x = Math.max(0, cursor.x - 1);
    else if (k === 'arrowright') cursor.x = Math.min(W - 1, cursor.x + 1);
    else if (k === 'arrowup') cursor.y = Math.max(0, cursor.y - 1);
    else if (k === 'arrowdown') cursor.y = Math.min(H - 1, cursor.y + 1);
    else if (k === ' ') return paint(cursor.x, cursor.y);
    else if (k === 'enter') return tryIt();
    else if (k === 'escape') return api.home();
    else return;
    draw();
  }

  function pick(ch) {
    tool = ch;
    for (const b of ui.tools.children) b.classList.toggle('on', b.dataset.t === ch);
    TR.sfx.tick();
  }

  function paint(x, y) {
    cursor = { x, y };
    if (rows[y][x] === tool) return draw();
    // one Teddy and one Tommy: putting one down moves him
    if (tool === '1' || tool === '2') rows = rows.map((r) => r.split(tool).join('.'));
    rows[y] = rows[y].slice(0, x) + tool + rows[y].slice(x + 1);
    keep();
    draw();
    TR.sfx.tick();
  }

  function keep() {
    api.save(slot, rows.slice());
  }

  function load(i) {
    slot = i;
    const saved = api.load(i);
    rows = saved && saved.length === H ? saved.map((r) => (r + '.'.repeat(W)).slice(0, W)) : template();
    if (!saved) keep();
    [...ui.slots.children].forEach((b, k) => b.classList.toggle('on', k === i));
    draw();
  }

  // what's missing before it can be played
  function problems() {
    const all = rows.join('');
    const out = [];
    if (!all.includes('1')) out.push('PUT TEDDY IN!');
    const gold = all.split('$').length - 1;
    if (!gold) out.push('ADD SOME GOLD!');
    if (gold > 12) out.push('12 GOLD AT MOST!');
    if (!rows[0].includes('S')) out.push('THE RAINBOW LADDER MUST REACH THE TOP ROW!');
    return out;
  }

  function draw() {
    const art = api.art();
    const cells = ui.grid.children;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = rows[y][x], el = cells[y * W + x];
        const t = TOOLS.find((tt) => tt[0] === ch);
        el.style.background = BG[ch] || '';
        el.innerHTML = ch === '.' || ch === '#' || ch === '@' || !t ? '' : art[t[1]] ? `<img src="${art[t[1]]}" alt="">` : t[1];
        el.style.opacity = ch === 'S' ? 0.75 : '';
        el.classList.toggle('k', x === cursor.x && y === cursor.y);
      }
    }
    const all = rows.join('');
    const p = problems();
    ui.info.textContent = p.length ? p[0] : `💰 ${all.split('$').length - 1} · 🤖 ${all.split('R').length - 1} · TAP A TOOL, THEN THE GRID. THEN TRY IT!`;
  }

  function size() {
    if (!open) return;
    const top = ui.tools.getBoundingClientRect().bottom, bottom = ui.slots.parentElement.getBoundingClientRect().height + ui.info.getBoundingClientRect().height + 40;
    const availW = innerWidth - 62 - 24, availH = innerHeight - top - bottom - 10;
    const cell = Math.max(12, Math.floor(Math.min(availW / W, availH / H)));
    ui.grid.style.setProperty('--cell', cell + 'px');
    ui.grid.style.gridTemplateRows = `repeat(${H}, ${cell}px)`;
    ui.grid.style.fontSize = Math.round(cell * 0.7) + 'px';
  }

  function tryIt() {
    const p = problems();
    if (p.length) {
      api.toast(p[0], 'hint');
      TR.sfx.nope();
      return;
    }
    const spec = TR.parse({ id: 'mine', rows });
    const sol = TR.solve(spec, { limit: 3e6 });
    api.toast(sol.ok ? 'I CHECKED: YOU CAN WIN THIS ONE! ✅' : "HMM, I CAN'T FIND A WAY TO WIN. TRY IT ANYWAY!", 'save');
    open = false;
    api.test(slot);
  }

  TR.editor = {
    init,
    open(i = 0) {
      open = true;
      load(i);
      pick(tool);
      size();
      requestAnimationFrame(size);
    },
    close() { open = false; },
    get rows() { return rows && rows.slice(); },
    get slot() { return slot; },
    paint, pick, tryIt, problems,
    get isOpen() { return open; },
  };
})();
