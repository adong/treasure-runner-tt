/* 中文 for TT Treasure Runner: the words on the page, the toasts, the canvas text (the STUCK! / ACHOO! / BOOP! bursts) and the
   ? panel (Kit.lang, from kit/lang.js). Simple words for Tommy (5): 金子, 梯子, 挖洞, 绳子 (the bars), 机器人. The kids' names
   and the game's own name stay English. */
(function () {
  const L = Kit.lang;
  L.keep(['TT Treasure Runner', 'TT', 'Treasure Runner', 'TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'Esc', 'Enter', 'W A S D', 'HI', 'MY LEVEL 1', 'MY LEVEL 2', 'MY LEVEL 3']);

  const NAMES = {
    'HELLO GOLD': '你好，金子', 'LADDER LAND': '梯子乐园', 'MONKEY BARS': '爬绳子', 'DIG DOWN': '往下挖洞', 'HELLO ROBOT': '你好，机器人',
    'DIG A TRAP': '挖个洞', 'BAR HOP': '绳子跳跳', STAIRS: '楼梯', 'THE PIT': '大坑', 'ROBOT BRIDGE': '机器人桥', 'TWO ROBOTS': '两个机器人',
    TOWER: '高塔', TUNNELS: '地道', 'SLIDE DOWN': '滑下去', 'GOLD RAIN': '金子雨', 'DEEP DIG': '深深挖', 'CRISS CROSS': '交叉路',
    'BRICK MAZE': '砖块迷宫', 'BAR MAZE': '绳子迷宫', 'ROBOT PARTY': '机器人派对', 'SKY HIGH': '高高的天上', UNDERGROUND: '地底下',
    ZIGZAG: '弯弯曲曲', 'DIG DIG DIG': '挖挖挖', 'MONKEY MADNESS': '绳子大冒险', CASTLE: '城堡', 'ROBOT ROUNDUP': '机器人大集合',
    'BIG DROP': '往下掉', 'TREASURE CAVE': '宝藏山洞', 'GOLD MOUNTAIN': '金子山',
  };

  L.add({
    // home
    'GRAB ALL THE GOLD! DIG HOLES! DODGE THE ROBOTS!': '拿到所有金子！挖洞！躲开机器人！',
    PLAY: '开始玩', 'Play': '开始玩', 'Play (1)': '开始玩 (1)', 'MAKE A LEVEL': '自己做关卡', 'Make a level': '自己做关卡', 'Make a level (2)': '自己做关卡 (2)',
    '1 PLAYER': '单人', '2 PLAYERS': '双人', 'Players': '几个人玩', 'Who are you?': '你是谁？', 'Level': '难度', 'HI-SCORE': '最高分',
    // the level picker and the panels
    'MY LEVELS': '我的关卡', 'Home': '主页', 'Levels': '选关', 'Next level': '下一关', 'Play again': '再玩一次', 'PLAY AGAIN': '再玩一次',
    'Keep playing': '继续玩', 'Start again': '重新开始', 'Start again (R)': '重新开始 (R)', 'Back to the level maker': '回去做关卡',
    'OUT OF LIVES!': '没有命了！', 'SCORE': '分数', 'NEW HI-SCORE!': '新的最高分！', 'TEAM TT DID IT!': 'TT 兄弟成功啦！',
    'ALL 30 LEVELS! TREASURE CHAMPION!': '30 关全过！寻宝冠军！',
    // while playing
    'Pause': '暂停', 'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Sound on or off': '声音 开 / 关',
    'Call your brother': '叫兄弟来帮忙', 'High five! (T)': '击掌！(T)', 'HIGH FIVE! 🙌': '击掌！🙌', 'Dig left': '往左挖洞', 'Dig right': '往右挖洞',
    'READY?': '准备好了吗？', 'GO!': '出发！', 'READY? GO!': '准备……出发！',
    'ALL THE GOLD! CLIMB THE RAINBOW LADDER!': '金子都拿到啦！快爬彩虹梯子！',
    'A ROBOT TOOK SOME GOLD! TRAP IT TO GET IT BACK!': '机器人拿走了金子！挖洞让它掉进去，金子就回来啦！',
    'BOING! OUT OF THE HOLE!': '嘣！从洞里跳出来啦！', 'TICKLED! 😆': '被挠痒痒啦！😆',
    'STUCK? PRESS R TO TRY AGAIN!': '出不去了？按 R 重新来！', 'STUCK? TAP 🔄 TO TRY AGAIN!': '出不去了？点 🔄 重新来！',
    // canvas text
    'STUCK!': '卡住啦！', 'ACHOO!': '阿嚏！', 'BOOP!': '嘟！',
    // the level maker
    'TRY IT': '试一试', 'Try it': '试一试', 'Start a new level': '重新做一个', 'PUT TEDDY IN!': '把 Teddy 放进去！', 'ADD SOME GOLD!': '放一些金子！',
    '12 GOLD AT MOST!': '金子最多 12 个！', 'THE RAINBOW LADDER MUST REACH THE TOP ROW!': '彩虹梯子要通到最上面一排！',
    'I CHECKED: YOU CAN WIN THIS ONE! ✅': '我查过了：这关能过！✅', "HMM, I CAN'T FIND A WAY TO WIN. TRY IT ANYWAY!": '嗯……我没找到过关的办法。还是试试吧！',
    'Brick: you can dig it': '砖块：可以挖', 'Steel: no digging': '铁块：挖不动', 'Ladder': '梯子', 'Bar': '绳子', 'Gold': '金子', 'Robot': '机器人',
    'Rainbow exit ladder': '彩虹出口梯子', 'Rub out': '擦掉',
    // the ? panel (js/keys.js)
    '1 player · Teddy (2 players)': '单人 · Teddy（双人）', 'Tommy (2 players)': 'Tommy（双人）',
    'run · climb · hang on bars': '跑 · 爬梯子 · 抓绳子', 'dig a hole down to the left · right': '在左下 · 右下挖洞', 'let go of a bar': '松开绳子',
    'call your brother (2 players: high five)': '叫兄弟来帮忙（双人：击掌）', 'start this level again': '这一关重新开始',
    'menu: PLAY · MAKE A LEVEL': '菜单：开始玩 · 自己做关卡', 'menu: Teddy or Tommy · 1 or 2 players · level': '菜单：Teddy 还是 Tommy · 单人或双人 · 难度',
    "Get all the gold, then climb the rainbow ladder to the top. You can't jump: dig a hole beside your feet to drop through the floor or trap a robot. In 1 player both sets of keys work.":
      '拿到所有金子，再爬彩虹梯子到最上面。不能跳：在脚边挖洞，可以掉到下面，也可以让机器人掉进洞里。单人时两套按键都能用。',
    "The pad bottom left runs and climbs; the two ⛏️ buttons dig left and right. Tap your brother's face for help. In 2 players each brother has a pad.":
      '左下角的圆盘用来跑和爬；两个 ⛏️ 按钮往左、往右挖洞。点兄弟的头像，他会来帮忙。双人时每人一个圆盘。',
    'Z · X': 'Z · X', ', · .': ', · .', 'P or Esc · M': 'P 或 Esc · M',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  L.rule(/^LEVEL (\d+): (.+)$/, (m, n, name) => `第 ${n} 关：${NAMES[name] || name}`);
  L.rule(/^MY LEVEL (\d)$/, '我的关卡 $1');
  L.rule(/^Call (\S+) \(T\)$/, '叫 $1 (T)');
  L.rule(/^(\S+)'S HERE!$/, '$1 来啦！');
  L.rule(/^YOU DID IT, (\S+)!$/, '$1，你做到啦！');
  L.rule(/^(\S+) SAYS: HOLES FOR THE ROBOT!$/, '$1 说：给机器人挖洞！');
  L.rule(/^(\S+) SAYS: NO ROBOTS HERE! GO GET THE GOLD!$/, '$1 说：这里没有机器人！快去拿金子！');
  L.rule(/^(\S+) SAYS: NO BRICKS BY THE ROBOT! RUN!$/, '$1 说：机器人旁边没有砖块！快跑！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (\S+)!$/, (m, emoji, item, who) => `${emoji} ${who} 给你${TREAT[item]}！`);
  L.rule(/^💰 (\d+) · 🤖 (\d+) · TAP A TOOL, THEN THE GRID\. THEN TRY IT!$/, '💰 $1 · 🤖 $2 · 先点工具，再点格子。然后试一试！');
})();
