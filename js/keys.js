/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). The ? and language buttons sit at the top of
   the left edge here, under the pause button, so the touch pad has the bottom corners to itself. */
Kit.help.setup({
  title: window.TR_TITLE, // the name lives in js/title.js
  cols: ['1 player · Teddy (2 players)', 'Tommy (2 players)'],
  keys: [
    ['run · climb · hang on bars', 'W A S D', '← ↑ → ↓'],
    ['dig a hole down to the left · right', 'Z · X', ', · .'],
    ['let go of a bar', 'S', '↓'],
    ['call your brother (2 players: high five)', 'T', 'T'],
    ['start this level again', 'R', 'R'],
    ['pause · sound', 'P or Esc · M', 'P or Esc · M'],
    ['menu: PLAY · MAKE A LEVEL', '1 · 2', '1 · 2'],
    ['menu: Teddy or Tommy · 1 or 2 players · level', '← → · ↑ ↓ · L', '← → · ↑ ↓ · L'],
  ],
  note: 'Get all the gold, then climb the rainbow ladder to the top. You can\'t jump: dig a hole beside your feet to drop through the floor or trap a robot. In 1 player both sets of keys work.',
  touch: 'The pad bottom left runs and climbs; the two ⛏️ buttons dig left and right. Tap your brother\'s face for help. In 2 players each brother has a pad.',
  button: { top: 'calc(max(10px, env(safe-area-inset-top)) + 76px)', left: 'max(12px, env(safe-area-inset-left))' },
});
Kit.lang.setup({ button: { top: 'calc(max(10px, env(safe-area-inset-top)) + 124px)', left: 'max(12px, env(safe-area-inset-left))' } });
