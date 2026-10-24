#!/usr/bin/env node
/* Run the headless checks from a terminal, with the same files the page loads (js/rules.js, js/levels.js, js/check.js).
     node tools/check.js                      every level cleared by the solver and replayed through the game, holes, moves,
                                              robots, and random play that can't trap you (with R always restarting)
     node tools/check.js --quick              shorter random play
     node tools/check.js --only robots        just one group (levels, holes, moves, robots or trap)
     node tools/check.js --sabotage nofill    proves the checks can fail (one at a time): nofill (holes never fill), float
                                              (no falling), nobar (falls go through bars), keepgold (stuck robots keep their
                                              gold), trap (no popping out of a filled hole), nostuck (never says stuck),
                                              restart (R keeps your gold),
                                              wall (an extra level that can't be cleared) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, Number, JSON, Object, Array, Map, Set, Error, Infinity, Uint8Array, Int8Array, Int16Array, Int32Array, Float32Array, String, Date };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/rules.js', 'js/levels.js', 'js/check.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = ctx.TR.check({ sabotage: opt('sabotage'), quick: args.includes('--quick'), seed: opt('seed') ? +opt('seed') : undefined, only: opt('only') });
console.log(JSON.stringify(out, null, 1));
console.log(out.ok ? 'CHECK PASSED' : 'CHECK FAILED');
process.exitCode = out.ok ? 0 : 1;
