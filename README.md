# TT Treasure Runner

[![TT Treasure Runner title screen](docs/screenshot.jpg)](https://adong.github.io/treasure-runner-tt/)

Press **?** any time (or tap the round **?** button on the left edge) to see the keys. The game waits while you look.
Tap the language button under it (the A文 icon) to switch between English and 中文; the dashboard and every game remember the choice.

**中文：** 寻宝跑跑：拿到所有金子，再爬彩虹梯子到最上面！不能跳，但可以在脚边挖洞，往下掉，或者让追你的机器人掉进洞里。30 关，还能自己做关卡；叫兄弟来，他会给你挖一排洞。

A side-on puzzle platformer starring Teddy and Tommy, built with Claude Code from plain JavaScript and Three.js on the shared Claude Games kit. Each level is a wall of chunky toy bricks, blue steel blocks, yellow ladders and cyan monkey bars, standing in a sunny meadow, with stacks of gold coins to collect and googly-eyed robot vacuums trundling after you. You can't jump: you run, climb, hang hand over hand from bars, fall, and dig. Nobody gets hurt: a robot that catches you just tickles you (you giggle and go back to the start), and a robot shut in a hole sneezes ("ACHOO!") and floats away under a balloon, then drops back in at the top. There are no image, model or audio files: the boys are the kit's blocky characters, every texture is painted on a canvas, and every sound is synthesised.

Alan names the games himself. The name lives in one constant, `TR_TITLE` in `js/title.js`, and the page title, the logo and the ? panel read it from there.

## Play

- **Double-click `index.html`.** It works offline because Three.js and the kit are copied into `kit/`. Without internet the title font falls back to Arial Black.
- **Send one file:** `dist/treasure-runner-tt.html` is the whole game in one page. AirDrop or email it, then open it in a browser.
- Rebuild that file after any edit: `python3 kit/tools/bundle.py . --name treasure-runner-tt`

### How to play

- **Get all the gold.** Walk into a stack of coins (or fall through it) to pick it up. The HUD counts it (💰 3/8).
- **Then climb out.** When the last gold is in, the rainbow exit ladder grows up out of the floor, rung by rung, with a 🏁 on top ("ALL THE GOLD! CLIMB THE RAINBOW LADDER!"). Climb it to the top row and the level's done. Before that, a see-through ghost of it shows where it will appear.
- **Moving:** run left and right, climb ladders up and down (you can stand on top of a ladder), hang from a bar and go along it hand over hand (↓ lets go). Walk off an edge and you fall until something stops you; falling past a bar, you grab it. You can't jump.
- **Digging:** Z digs the brick at your lower left, X the one at your lower right (or the ⛏️◀ and ⛏️▶ buttons). Only toy bricks dig, not steel, and only when the cell beside you is clear (no ladder, bar, gold or anybody in it). A hole stays open for a few seconds, then the brick grows back with a wobble. Dig to drop through a floor, or to trap a robot.
- **If a hole fills with you inside,** you pop up out of it ("BOING!"), standing on the new brick. You're never squashed and never stuck inside a wall.
- **Robot vacuums** chase you: they work out the shortest way to you over the floors, ladders and bars, but they don't know about holes, so they walk right into them.
  - A robot in a hole is stuck for a while (💫, its eyes spin). You can walk right over its head.
  - Robots pick up gold they roll over (you'll see it on their back); one that drops into a hole lets go of it, on top of the hole where you can reach it. The exit only opens when the robots have given all their gold back too.
  - If the hole is still open when its time's up, it climbs out (never straight into you, and not while you're standing on it). If the hole fills first, it sneezes and floats away, and drops back in at the top of the level a moment later (200 points).
  - **Tickled:** if a robot touches you, you giggle (BOOP! 😆) and lose a heart. You go back to your start, the robots go back to theirs, and READY? GO! gives you a moment before they move again. The gold you've picked up stays picked up.
- **Stuck?** If you've fallen somewhere you can't get out of (a pit with no ladder, a room with the gold out of reach), the game notices within a second: "STUCK? PRESS R TO TRY AGAIN!" and the 🔄 button glows. **R** (or 🔄) starts the level again any time, and doesn't cost a heart.
- **Score:** 100 a gold, 50 for a robot in a hole, 200 for a robot shut in, 1000 for climbing out. Your score runs on from level to level; the HI-SCORE is kept for 🐣 and for 🔥. Each level you finish gives you another heart (up to 9). Out of hearts: "OUT OF LIVES!" with your score and PLAY AGAIN.
- **A win:** the boy who climbed out turns round and does his signature move (Teddy's boxing combo or 🏀 jump shot, Tommy's Y with peace fingers), confetti, then the panel: SCORE, HI-SCORE, the gold and ❤️ +1, with **▶** for the next level, **PLAY AGAIN**, **🔢** for the level picker and **🏠**.

### The levels

30 levels, drawn by hand, from three gold on a flat floor to castles, towers, monkey-bar mazes and caves with three robots. The first four have no robots (gold, ladders, monkey bars, digging down); level 5 brings the first robot. Every level is open in the level picker; the next one you haven't finished bounces, finished ones show 💰 (kept for Teddy, for Tommy and for the two of you separately). Each level is at most 21 × 12 cells with up to 10 gold, and the solver in `js/rules.js` has cleared every one (see below).

- **🐣 EASY** (the default, for Tommy, 5): robots roll at 1.8 cells a second, holes stay open 8 s, a stuck robot waits 4.5 s, 5 hearts.
- **🔥 NORMAL** (for Teddy, 8): robots at 3 cells a second, holes open 5 s, stuck robots wait 3 s, 3 hearts. You run at 4.2 cells a second on 🐣 and 4.8 on 🔥.

### Make a level (for Teddy)

**🧱 MAKE A LEVEL** on the title (or ✏️ in the level picker) opens the level maker: a 20 × 12 grid. Pick a tool (🧱 brick, 🔩 steel, 🪜 ladder, ➖ bar, 💰 gold, 🤖 robot, 🌈 the exit ladder, Teddy, Tommy, 🧽 rub out) and tap or drag on the grid. Keys: 1-9 and 0 pick a tool, the arrows move the pink box, Space puts the tool there, Enter tries it, Esc goes home. There are three slots (MY LEVEL 1, 2, 3); each saves as you go (in the browser). **TRY IT** checks there's a Teddy, some gold (12 at most) and a rainbow ladder reaching the top row, asks the solver ("I CHECKED: YOU CAN WIN THIS ONE! ✅" or "HMM, I CAN'T FIND A WAY TO WIN. TRY IT ANYWAY!"), then plays it. Your levels are in the level picker too, under MY LEVELS. **🆕** starts a fresh level in the slot.

### 2 players

Both brothers on the same level at once: Teddy on W A S D with Z / X to dig, Tommy on the arrows with , and . to dig. Either of you climbing out finishes the level, and you share the hearts. You walk through each other. On a touch screen each brother gets a pad and two dig buttons (Teddy bottom left, Tommy bottom right).

## Controls

| | 1 player · Teddy (2 players) | Tommy (2 players) | Touch |
|---|---|---|---|
| run · climb · hang on bars | W A S D | ← ↑ → ↓ | the round pad, bottom left |
| dig a hole down to the left · right | Z · X | , · . | ⛏️◀ · ⛏️▶, bottom right |
| let go of a bar | S | ↓ | ▼ on the pad |
| call your brother (2 players: high five) | T | T | his face (🙌 in 2 players) |
| start this level again | R | R | 🔄 |
| pause · sound | P or Esc · M | P or Esc · M | ⏸️ · 🔊 |
| menu: PLAY · MAKE A LEVEL | 1 · 2 | | the two big tiles |
| menu: Teddy or Tommy · 1 or 2 players · level | ← → · ↑ ↓ · L | | the buttons under the tiles |

In 1 player both sets of keys work (and Q / E dig too). In the level picker the arrows choose a level, Enter plays it and L switches 🐣 / 🔥. On a touch screen the ? and language buttons sit at the top of the left edge, under ⏸️, so the pad has the bottom corner to itself.

## Call your brother (companion mode)

**1 player:** call your brother with **T** or by tapping his face, **any time and as often as you like** (`Kit.roster.buddyFor`: Tommy for Teddy, Teddy for Tommy).

- **He pops in** on the grass beside the level (on the side the robots are), in a puff of stars, at his roster `buddyScale`, with his name tag.
- **He says hi** with his signature move and **tosses you a treat** (🍦 💧 🧃 🍪 🍉 🍌) that arcs into your hand: "🍪 COOKIE FROM TOMMY!"
- **Then he digs a row of holes in front of the nearest robot:** "TOMMY SAYS: HOLES FOR THE ROBOT!" He points, little ⛏️ fly over, and up to three bricks crumble. He picks bricks under the cells the robot is about to roll through on its way to you, as far as it will get before they fill (holes with something solid under them first, so it gets stuck rather than just dropping a floor); if its way has no bricks, the floor right in front of it. Never under you, gold, a ladder or a bar. His holes stay open 1.6 times as long as yours.
  - No robots on the level: "NO ROBOTS HERE! GO GET THE GOLD!" No bricks by the robot: "NO BRICKS BY THE ROBOT! RUN!"
- Then his goodbye move and he pops out. Call him again while he's there and he brings another treat and another row of holes.
- **How often it works:** in the check below, a visit one second into each level (robots chasing, you standing still) caught or dropped the robot within the holes' time on 36 of 50 level-and-level-of-difficulty pairs. The others are robots whose way to you crosses no bricks just then.

**2 players:** both brothers are already playing, so **T** (or 🙌) is a **high five**: they jump with their hands up and clap (💥 🙌). It doesn't change the game.

## Make it yours

- `js/title.js`: the game's name.
- `js/levels.js`: the 30 levels as rows of text (the legend is at the top). Run `node tools/check.js` after any change: it proves the solver can still clear every level.
- `js/rules.js`, top: `TIERS` (speeds, hole and stuck times, hearts for 🐣 and 🔥), `SCORE`, `BUDDY_HOLE`.
- `js/game.js`, top: `CFG` (the boys' size, the brother's size, the level behind the title).
- `js/world.js`: the colours and shapes of the bricks, steel, ladders, bars, coins and robots (`ROBOT_COLORS`).

## How it works, and how it's tested

- `js/rules.js` has no Three.js and no page in it. Everyone moves one cell at a time and slides smoothly between cells; at each cell the rules decide what's next (fall if nothing holds you up, else what the keys say). Holes are timers on brick cells. Robots plan with a breadth-first search over the cells a robot can reach (falls are forced; open holes look like a dip in the floor). The solver (`TR.solve`) searches every (cell you stand in, in a hole or not, gold collected) state, with moves walk, climb, let go, dig and step into the hole, and wait in a hole until you pop out; the biggest level takes about 52,000 states (20 ms). The "stuck?" helper (`TR.reach`) is the same search without the gold: can you still reach any gold, or the top once the exit's open?
- Console hooks (`window.game`):

```js
game.start({ level: 5, tier: 'easy', players: 1, who: 'teddy', go: true })  // straight into a level (go: skip READY?)
game.key('ArrowRight'); game.key('ArrowRight', false)                       // a key down and up on the window
game.place(6, 5)          // put him on cell (6, 5), standing (to test the keys somewhere)
game.call()               // call your brother (2 players: high five)
game.restart()            // R
game.auto(true)           // a bot plays the solver's moves (robots still chase): for the win panel and the flow
game.step(2)              // advance 2 s and draw (when the tab's animation is throttled)
game.hold(true)           // freeze the live loop, so only game.step() moves time
game.editor(0)            // the level maker, slot 1
game.check()              // the headless checks below (quick)
game.info()               // state, runners, robots, gold, holes, your brother, the panel on screen
```

### The headless check

```bash
node tools/check.js
```

- **levels:** every level is well formed (rows the same length, known tiles, one Teddy, 1 to 12 gold, the exit ladder reaching the top row, nobody starting in mid-air), the solver clears it, and its moves play out through the real game (`TR.step`, robots off) on 🐣 and on 🔥, keys held like a player would, landing exactly where the solver said after every single move. Nobody is "stuck" at the start of any level.
- **holes:** X starts a dig at the lower right; the brick is solid until it's dug; it opens after the dig (0.34 s / 0.3 s), stays open exactly 8 s / 5 s, then it's back. No digging under gold or a ladder, on steel, while hanging or while falling. Walk into your own hole: ↑ does nothing, and when it fills you pop up on top of it.
- **moves:** falling (3 cells in the right time), ladders (↑ only on a ladder, standing on top, ↓ back down), bars (hang, don't fall, ↓ lets go, falling past one grabs it), walls stop you, turning round half way through a step, and → is one cell right / ← one cell left on every level.
- **robots:** a robot picks up gold, falls into a hole in front of you and is stuck, drops the gold on top, doesn't move while stuck; you walk over its head without falling or being tickled and pick the gold up; with the hole still open it climbs out; with you standing on it the hole fills, it floats away (200 points) and pops back in at the top row, in an open cell. Gold is counted everywhere (on the floor, carried, picked up).
- **buddy:** on a brick floor your brother digs three holes between the robot and you, they open, last 1.6 times as long, the robot drops in and you're not tickled; never under you, gold, a ladder or a bar; no robots, no holes; on every level with robots (🐣 and 🔥) he finds 1 to 3 bricks he can dig.
- **trap:** 40 s of random keys and digs with robots on every level on 🐣 and 🔥 (every third level with two runners): nobody is ever inside a wall, no robot inside a wall, gold never miscounted, nobody tickled or digging for longer than it takes, a runner who can't move at all is told he's stuck within 1.2 s, and R (at random moments and at the end) gives back exactly the start, keeping your hearts. Then on purpose: shut in a steel box, shut in a room with the gold out of reach and fallen down a pit with no way out are each called "stuck" within a second, and R puts you back; with the gold in reach you're not stuck.
- **It can fail** (`--sabotage`, one at a time; a sabotaged run stops at the first group that fails): `nofill` (holes never fill: the level 9 replay ends up somewhere else), `float` (no falling: level 3's replay), `nobar` (falls go through bars: level 11's replay), `keepgold` (stuck robots keep their gold: robots), `trap` (no popping out of a filled hole: holes), `nostuck` (never says stuck: trap), `restart` (R keeps your gold: trap), `wall` (an extra level with its gold sealed in steel: the solver can't clear it).

```bash
node tools/check.js --sabotage nofill
```

- **At the last check** (1.4 s): levels 434, holes 28, moves 73, robots 28, buddy 117, trap 708,336 passed, nothing failed. The random play ran 2,401 s of game time, with 272 tickles, 43 pops out of a filled hole and 319 R presses checked; it never shut a runner in by chance, which is why the stuck cases are also set up on purpose. Every sabotage failed where it should.

### The real-key play check

```bash
node tools/play.js
```

Headless Chrome over the DevTools protocol, with real key presses (trusted keydown / keyup on the window) and real touches on the on-screen pad, in real time with the game's own animation loop. `game.start()` and `game.place()` only set the scene; every move comes from a key or a finger.

- **Every level:** → moves the runner one cell right in the rules and to the right on the screen, ← one cell left and to the left (30 levels); ↑ on a ladder climbs up the screen and ↓ down (29 levels with a ladder long enough); along a bar → and ← go hanging and ↓ lets go (7 levels with bars); X digs at the lower right and Z at the lower left (27 levels with room to dig both ways). No level is drawn mirrored, and the checks would catch it if one were.
- **Nothing leaves him stuck:** after a robot's tickle (he's back at the start and → works), after digging, in his own hole (↑ does nothing, it fills, he pops out, → works), hanging from a bar (→, ←, ↓), after pause, while his brother visits (→ works; the treat and the holes arrive), and R from the middle of a level.
- **Touch** (a phone on its side, 740 × 360, touch emulation): the pad and the dig buttons show; the right side of the pad moves him right on screen, the left side left; the ⛏️▶ button digs; the ? and language buttons don't cover the pad.
- **No console errors.**
- **It can fail:** `--sabotage mirror` swaps ← and → in the page's own key and touch handling (26 of 57 checks failed on levels 1 to 3), `--sabotage stuck` makes a robot's tickle never end (the two "free again after the tickle" checks failed).
- **At the last run:** 343 passed, nothing failed.

## Not verified

- Sound: tested muted, checked in code, never listened to.
- Real touch devices (iPhone, iPad) and two kids on one iPad: touch was tested with emulated touches in headless Chrome. Layouts were checked in headless Chrome at 390 × 844, 740 × 360, 768 × 1024, 1024 × 768 and 1200 × 750. On a phone held upright the level is small (about 16 px a cell); it's much better on its side or on an iPad.
- How hard it is for real kids: whether Tommy can do the later levels on 🐣, whether 🔥 robots are fair for Teddy. The solver proves each level can be cleared with the robots switched off; with robots it's a matter of skill (and of your brother's holes).
- The robots' chasing was checked for rules (never in a wall, stuck in holes, climbing out, respawning), not for how clever or fun it feels.
- Double-click from Finder (headless Chrome opened `index.html` and `dist/treasure-runner-tt.html` from file:// and played level 4 to the win panel) and the iPad home-screen icon.
- Kit observation, not changed: switching 中文 → English with the ? panel closed leaves the hidden panel in Chinese until it's opened again.

Built with [Claude Code](https://claude.com/claude-code). Three.js is MIT licensed (`kit/three.LICENSE`); the kit's icons are Lucide (ISC).
