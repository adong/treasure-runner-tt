#!/usr/bin/env node
/* Screenshots with headless Chrome over the DevTools protocol (node 22's built-in WebSocket, no npm).
   node tools/shoot.js [steps.json] [outdir] [width height mobile]
   Defaults: tools/shots.json, docs/, 1280 x 800. Opens index.html from file:// by default, or set
   URL=... Each step may have js (run in the page, using the window.game hooks), wait (ms) and shot (file name).
   From TT Box Push (by way of TT Slide Escape). docs/screenshot.jpg: node tools/shoot.js tools/shots.json docs 1200 750 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const [stepsFile = path.join(__dirname, 'shots.json'), outDir = path.join(dir, 'docs'), W = '1280', H = '800', mobile = '0'] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'treasurerunnertt-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ws;
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); }
    }
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map(), logs = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description));
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map((a) => a.value || a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: mobile === '1' });
    if (mobile === '1') await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: process.env.URL || 'file://' + path.join(dir, 'index.html') });
    await sleep(4000);
    for (const s of steps) {
      if (s.size) await send('Emulation.setDeviceMetricsOverride', { width: s.size[0], height: s.size[1], deviceScaleFactor: 1, mobile: false });
      if (s.js) {
        const r = await send('Runtime.evaluate', { expression: s.js, awaitPromise: true, returnByValue: true });
        const v = r.result && r.result.result ? r.result.result.value : r;
        console.log((s.label || s.shot || 'js') + ':', typeof v === 'string' ? v : JSON.stringify(v));
      }
      if (s.wait) await sleep(s.wait);
      if (s.shot) {
        const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
        fs.writeFileSync(path.join(outDir, s.shot + '.jpg'), Buffer.from(r.result.data, 'base64'));
        console.log('saved', s.shot);
      }
    }
    if (logs.length) console.log('page errors:\n' + logs.join('\n'));
  } catch (e) {
    console.error(e);
  } finally {
    try { ws && ws.close(); } catch (e) { /* closed */ }
    await new Promise((r) => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 3000); });
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp folder, the OS cleans it */ }
  }
})();
