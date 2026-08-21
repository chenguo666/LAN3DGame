/* ============================================================
 * LAN 3D 射击对战 - 客户端 V2（优化版）
 * 优化内容：
 *   - 人物模型美化：头/身/四肢/护甲/血条/名字/行走动画/死亡倒地
 *   - 近战与枪械模型细化
 *   - 新增一枪毙命狙击步枪（AWP），支持右键开镜
 *   - 枪口火焰、命中火花、弹道、粒子特效强化
 *   - 全新准星样式（十字线 + 中心点 + 动态扩散）
 * 依赖：Three.js（由 index.html 负责加载）
 * ============================================================ */
(function () {
  'use strict';

  if (!window.THREE) return;

  // ----------------------------------------------------------
  // 武器配置（与服务器 server.js 保持一致）
  // ----------------------------------------------------------
  //
  // moveSpeed：持这把武器时的移动速度系数，乘在 WALK_SPEED / SPRINT_SPEED 上。
  //   刀最快、机枪最慢、步枪 = 1.0 为基准。这是武器之间的主要制衡之一，
  //   两端的表必须一致：服务端拿它算移动散射的归一化上限（effectiveSpread），
  //   客户端拿它算实际速度，不一致会出现「跑到最快但散射没吃满」之类的错位。
  // reserve：弹匣之外的备弹总数，0 备弹无法换弹。
  var WALK_SPEED = 4.2;         // 原 8：太快，掩体间的推进没有暴露时间可言
  var SPRINT_SPEED = 6.6;       // 原 13：比人类百米峰值还快
  var WEAPONS = {
    knife: { id: 'knife', name: '战术匕首', type: 'melee', damage: 30, range: 2.4, cooldown: 320, arcDot: 0.45, moveSpeed: 1.15, color: 0xc0c0c0 },
    axe: { id: 'axe', name: '消防斧', type: 'melee', damage: 55, range: 3.0, cooldown: 780, arcDot: 0.55, moveSpeed: 0.96, color: 0xcc3333 },
    katana: { id: 'katana', name: '武士刀', type: 'melee', damage: 45, range: 3.2, cooldown: 480, arcDot: 0.5, moveSpeed: 1.06, color: 0x8a8a8a },
      kukri: { id: 'kukri', name: '尼泊尔军刀', type: 'melee', damage: 40, range: 2.6, cooldown: 420, arcDot: 0.5, moveSpeed: 1.12, color: 0x9aa0a0 },
      chainsaw: { id: 'chainsaw', name: '电锯', type: 'melee', damage: 30, range: 2.7, cooldown: 300, arcDot: 0.6, moveSpeed: 0.90, color: 0xff6600 },
    // 散射/后坐力字段（必须与 server.js 的 WEAPONS 表逐字一致，否则准星画的
    // 散射圈和服务端真正判定的散射不是一回事）：
    //   spread 首发锥形散射半角(rad) / bloom 每发累加 / bloomMax 上限 / bloomDecay 每秒回落
    //   moveSpread 跑动附加 / airSpread 离地附加 / adsSpread 开镜对「基础+累积」的缩放
    //   hipSpread 腰射（不开镜）附加的固定锥角 —— 加法项，理由见 server.js 同处注释
    //   recoil 每发抬枪量(rad) / recoilH 横向抖动 / recoilRamp 连发时后坐力增长系数
    //
    // bloom 的取值有一个硬约束，之前六把枪全违反了：
    //     bloom 必须 > bloomDecay × cooldown/1000
    // 因为每次开火前都会先按「距上次开火的时间」回落一次。步枪 105ms 一发、
    // bloomDecay 0.055/s，两发之间就要掉 0.00577，而每发只加 0.0035 —— 净值是负的，
    // 于是 bloom 在 0 和 0.0035 之间原地弹跳，永远到不了 bloomMax。
    // 后果是连发散射和（依赖 bloom/bloomMax 当进度的）后坐力增长**两个都是死的**：
    // 模拟一梭子 30 发，每一发的散射和抬枪量分毫不差。
    // 现在按「打满 N 发到上限」反解：bloom = bloomDecay×cooldown/1000 + bloomMax/N。
    // N 取值：手枪 6、霰弹 4、步枪 12、狙 5、连狙 5、机枪 25。
    pistol: { id: 'pistol', name: '手枪', type: 'ranged', damage: 26, mag: 12, reserve: 48, cooldown: 240, range: 90, pellets: 1, spread: 0.006, reloadTime: 1.3, auto: false, bloom: 0.0170, bloomMax: 0.030, bloomDecay: 0.050, moveSpread: 0.012, airSpread: 0.020, adsSpread: 0.55, hipSpread: 0.020, recoil: 0.0130, recoilH: 0.0045, recoilRamp: 0.85, moveSpeed: 1.06, color: 0x444444 },
    shotgun: { id: 'shotgun', name: '霰弹枪', type: 'ranged', damage: 18, mag: 8, reserve: 32, cooldown: 700, range: 55, pellets: 10, spread: 0.060, reloadTime: 2.1, auto: false, bloom: 0.0380, bloomMax: 0.070, bloomDecay: 0.032, moveSpread: 0.018, airSpread: 0.028, adsSpread: 0.65, hipSpread: 0.014, recoil: 0.0400, recoilH: 0.0100, recoilRamp: 0.50, moveSpeed: 0.94, color: 0x553311 },
    rifle: { id: 'rifle', name: '突击步枪', type: 'ranged', damage: 19, mag: 30, reserve: 120, cooldown: 105, range: 110, pellets: 1, spread: 0.005, reloadTime: 1.9, auto: true, bloom: 0.0093, bloomMax: 0.042, bloomDecay: 0.055, moveSpread: 0.016, airSpread: 0.028, adsSpread: 0.45, hipSpread: 0.034, recoil: 0.0090, recoilH: 0.0038, recoilRamp: 1.30, moveSpeed: 1.00, color: 0x222222 },
    awp: { id: 'awp', name: '狙击步枪', type: 'ranged', damage: 120, mag: 5, reserve: 20, cooldown: 1400, range: 160, pellets: 1, spread: 0.0004, reloadTime: 2.6, auto: false, bloom: 0.0200, bloomMax: 0.030, bloomDecay: 0.010, moveSpread: 0.030, airSpread: 0.045, adsSpread: 0.15, hipSpread: 0.070, recoil: 0.0460, recoilH: 0.0060, recoilRamp: 0.45, moveSpeed: 0.86, color: 0x1a3a1a },
      dmr: { id: 'dmr', name: '连狙', type: 'ranged', damage: 55, mag: 10, reserve: 40, cooldown: 300, range: 120, pellets: 1, spread: 0.002, reloadTime: 2.1, auto: false, bloom: 0.0150, bloomMax: 0.022, bloomDecay: 0.035, moveSpread: 0.020, airSpread: 0.032, adsSpread: 0.30, hipSpread: 0.046, recoil: 0.0230, recoilH: 0.0050, recoilRamp: 1.00, moveSpeed: 0.93, color: 0x2a4a2a },
      lmg: { id: 'lmg', name: '重机枪', type: 'ranged', damage: 16, mag: 125, reserve: 125, cooldown: 95, range: 100, pellets: 1, spread: 0.009, reloadTime: 3.8, auto: true, bloom: 0.0070, bloomMax: 0.055, bloomDecay: 0.050, moveSpread: 0.024, airSpread: 0.036, adsSpread: 0.60, hipSpread: 0.042, recoil: 0.0062, recoilH: 0.0042, recoilRamp: 1.70, moveSpeed: 0.76, color: 0x3a3a3a }
  };

  // 投掷物携带上限（与 server.js 一致）
  var GRENADE_MAX = 2;
  var SMOKE_MAX = 2;

  var BOXES = [
    { x: -12, z: -8, w: 4, h: 3, d: 4 },
    { x: 12, z: -12, w: 4, h: 3, d: 4 },
    { x: -15, z: 10, w: 4, h: 3, d: 4 },
    { x: 0, z: 0, w: 5, h: 4, d: 5 },
    { x: 18, z: 15, w: 3, h: 3, d: 3 },
    { x: -20, z: -18, w: 4, h: 2, d: 4 },
    { x: 20, z: -20, w: 4, h: 2, d: 4 },
    { x: -8, z: -20, w: 3, h: 3, d: 3 },
    { x: 8, z: 20, w: 3, h: 3, d: 3 },
    { x: -25, z: 5, w: 3, h: 2, d: 3 },
    { x: 25, z: -5, w: 3, h: 2, d: 3 },
    { x: -28, z: 20, w: 8, h: 2.8, d: 3 },
    { x: 28, z: 20, w: 8, h: 2.8, d: 3 },
    { x: -28, z: -20, w: 8, h: 2.8, d: 3 },
    { x: 28, z: -20, w: 8, h: 2.8, d: 3 },
    { x: -18, z: 0, w: 2, h: 4, d: 20 },
    { x: 18, z: 0, w: 2, h: 4, d: 20 },
    { x: 0, z: -35, w: 6, h: 2.2, d: 2 },
    { x: 0, z: 35, w: 6, h: 2.2, d: 2 },
    { x: -35, z: 0, w: 2, h: 2.2, d: 6 },
    { x: 35, z: 0, w: 2, h: 2.2, d: 6 },
    { x: -10, z: 15, w: 3, h: 2.5, d: 3 },
    { x: 10, z: -15, w: 3, h: 2.5, d: 3 },
    { x: -6, z: 10, w: 3, h: 2, d: 3 },
    { x: 6, z: -10, w: 3, h: 2, d: 3 },
    { x: 0, z: -25, w: 4, h: 2.5, d: 4 },
    { x: 0, z: 25, w: 4, h: 2.5, d: 4 },
      { x: 5, z: 5, w: 1.2, h: 3.8, d: 1.2 },
      { x: -5, z: 5, w: 1.2, h: 3.8, d: 1.2 },
      { x: 5, z: -5, w: 1.2, h: 3.8, d: 1.2 },
      { x: -5, z: -5, w: 1.2, h: 3.8, d: 1.2 },
      { x: 0, z: 12, w: 12, h: 1.1, d: 1.2 },
      { x: 0, z: -12, w: 12, h: 1.1, d: 1.2 },
      { x: 12, z: 0, w: 1.2, h: 1.1, d: 12 },
      { x: -12, z: 0, w: 1.2, h: 1.1, d: 12 },
      { x: -35, z: -30, w: 7, h: 2.8, d: 3 },
      { x: 35, z: 30, w: 7, h: 2.8, d: 3 },
      { x: -35, z: 30, w: 7, h: 2.8, d: 3 },
      { x: 35, z: -30, w: 7, h: 2.8, d: 3 },
      { x: 30, z: 10, w: 3, h: 2, d: 3 },
      { x: -30, z: -10, w: 3, h: 2, d: 3 },
      { x: 30, z: -10, w: 3, h: 2, d: 3 },
      { x: -30, z: 10, w: 3, h: 2, d: 3 },
      { x: 25, z: 0, w: 2, h: 1.2, d: 6 },
      { x: -25, z: 0, w: 2, h: 1.2, d: 6 },
      { x: 8, z: 8, w: 2, h: 1.8, d: 2 },
      { x: -8, z: -8, w: 2, h: 1.8, d: 2 },
  ];

  var ARENA_HALF = 46;
  var EYE = 1.55;
  var PLAYER_RADIUS = 0.5;
  // 远端玩家持枪时手臂的基准角度由 solveArm() 反解出来（见 createRemotePlayer），
  // 不再手写。这里只留武器侧的常量。
  // 第三人称武器缩放：第一人称模型是放大的，缩到实物尺寸手才够得到（见 ensureRemoteWeapon）
  var WEAPON_TP_SCALE = 0.68;
  var MELEE_TP_SCALE = 0.80;
  // 握把 / 护木在武器模型自身局部坐标里的位置（量自 addHands 摆手的位置），
  // 已按 WEAPON_TP_SCALE 折算。手臂就是照这两个点反解的。
  var GRIP_LOCAL = [0, -0.112 * WEAPON_TP_SCALE, 0.16 * WEAPON_TP_SCALE];
  var SUPP_LOCAL = [0, -0.075 * WEAPON_TP_SCALE, -0.30 * WEAPON_TP_SCALE];
  // 远端武器挂点（aimGroup 局部）。开火后坐动画要拿它当基准，
  // 写死两个 -0.28 的话挪挂点必然漏改一处，枪会瞬移。
  // z 定在 -0.36 是量出来的：枪托末端在武器局部 +0.324 处，摆到 -0.36 正好让
  // 托底停在背心前脸（-0.14 一带）——**托要顶在肩窝上**。原来是 -0.500，
  // 枪整把浮在胸前 0.3m，右肩到握把 0.52m，手臂只能整条向前伸直，
  // 肘必然顶到胸口；收回来之后肘弯到 95° 自然垂在体侧。
  // x 定在 0.215：胸挂弹匣包外缘收窄到 0.124、前载具外缘 0.125 之后，
  // 右肩窝（chest 局部 x≈0.15 一带）才空出来。挂在 0.19 时枪托底
  // 埋进前载具 20.6mm，再往内就直接从弹匣包里穿出来。
  // y 从 -0.106 抬到 -0.02：肩点在 1.435，原来托底落在 1.33，等于夹在腋下而不是
  // 肩窝里；抬起来之后托底刚好蹭到护肩前下沿，瞄具也从胸口抬到下巴高度。
  var WEAPON_MOUNT = [0.215, -0.02, -0.375];
  // 这里曾经按「托底对齐」给每把枪单独往前错一段（TP_POCKET_Z），为的是把长枪的
  // 托从护肩里拔出来。后来用精确椭球（而不是外接盒）重测才发现两件事：
  // 一是外接盒把圆角处的深度虚报了——霰弹枪所谓的 26.4mm 其实是 0；
  // 二是错位的代价全压在**支撑手**上：枪往前错 147mm，护木就跑出左臂可达范围，
  // 静止时 AWP 的左手被迫退到弹匣井（suppFrac 0.38），长枪双手并在一起。
  // 两害相权：托陷进护肩是「顶肩」本来的样子，而支撑手离开护木是随时都看得见的
  // 错误。所以不再错位，只把护肩收薄（见 shoulderL）来减少重叠。

  // ---------------- 近战：握持点 / 挂点 / 连段 / 挥砍弧线 ----------------
  // 握把点直接引用第一人称 addHands 摆手的那组坐标（同一套模型局部坐标系），
  // 用时乘 MELEE_TP_SCALE 折算到身体尺度。l 为 null = 单手武器，左手不参与握持。
  // 这一步是必须的：以前近战沿用 GRIP_LOCAL/SUPP_LOCAL（步枪的握把 + 护木），
  // 那两个点相距 310mm，套到一把 135mm 长的匕首上就是「双手各握一头空气」。
  var MELEE_GRIP = {
    knife:    { r: [0, 0, 0.085],      l: null },
    kukri:    { r: [0, 0, 0.082],      l: null },
    axe:      { r: [0, -0.01, 0.215],  l: [0, -0.01, 0.045] },
    katana:   { r: [0, 0, 0.075],      l: [0, 0, 0.195] },
    chainsaw: { r: [0, -0.038, 0.195], l: [0, 0.135, -0.02] }
  };
  // 近战挂点不能用 WEAPON_MOUNT——那是「枪托顶肩」的位置，刀顶在肩上没道理。
  // 刀端在胸前偏右、比枪低一档、离身体远一点，右手才有地方握。
  // z 定在 -0.40：挥砍时扎进躯干最深的点**不是刀尖，是柄尾**（实测太刀最深点在
  // 模型局部 z=+0.278 = 刀柄末端、斧头在 z=+0.349 = 柄尾），柄尾在手后面 20cm，
  // 挂点越靠身体柄尾越往肚子里转。-0.33 时太刀第二段实测扎进躯干 64.4mm，
  // 挪到 -0.40 只剩 4.0mm（低于模型自身圆角误差）。再往前会让待机姿势变成
  // 直臂：-0.44 时静止臂展 0.532，已经是臂展上限 0.592 的 90%。
  // 之前不敢挪是因为往前挪左手就够不到（-0.40 实测左手离刀柄 25.6mm），
  // 现在 clampMeleeReach 是双手约束的，左手照样精确落在把上。
  var MELEE_MOUNT = [0.190, -0.115, -0.400];
  // 预备姿势：刀尖上挑 + 略微内收。刃口朝前是 -z，绕 x 转正角把刀尖抬起来。
  var MELEE_REST = [0.42, 0.26, 0.12];
  var ZERO3 = [0, 0, 0];

  // 挥砍弧线。u∈[0,1] 分三段：抬手 → 劈落 → 收势。返回的是**相对预备姿势**的
  // 偏移（w/s = 蓄势位与终点位的旋转，wp/sp = 对应的位移，米，第一人称口径）。
  // 第三人称位移要乘 MELEE_TP_ARC 收窄，否则手会甩出 0.61 的臂展，
  // IK 一夹就变成两条直臂在空中乱划。
  var MELEE_ARC = {
    // 右上 → 左下 斜劈
    slashR:   { w: [-0.30,  0.85, -0.60], s: [ 0.62, -0.80,  0.72], wp: [ 0.06,  0.10,  0.05], sp: [-0.14, -0.10, -0.16] },
    // 左下 → 右上 反手横撩
    slashL:   { w: [ 0.45, -0.80,  0.62], s: [-0.28,  0.88, -0.66], wp: [-0.10, -0.08,  0.04], sp: [ 0.13,  0.09, -0.15] },
    // 上举 → 直劈（斧、刀的重段）
    overhead: { w: [-1.05,  0.16, -0.10], s: [ 1.00, -0.10,  0.06], wp: [ 0.02,  0.20,  0.10], sp: [-0.02, -0.16, -0.20] },
    // 直刺：几乎不转，全靠前送
    stab:     { w: [ 0.10,  0.20, -0.05], s: [-0.06, -0.04,  0.02], wp: [ 0.04,  0.02,  0.14], sp: [-0.05, -0.02, -0.34] },
    // 电锯：小幅推锯，不是挥砍
    saw:      { w: [ 0.06,  0.05,  0.02], s: [-0.10, -0.04, -0.02], wp: [ 0.01,  0.03,  0.05], sp: [-0.01, -0.02, -0.12] },
    sawB:     { w: [-0.06, -0.05, -0.02], s: [ 0.10,  0.04,  0.02], wp: [-0.01, -0.03,  0.05], sp: [ 0.01,  0.02, -0.12] }
  };
  var MELEE_TP_ARC = 0.55;
  // 抬手结束 / 劈落结束的时间点。抬手只占 20%：服务端是**点击即判定**，
  // 抬手拖长了就会看到「人已经倒了刀还没落下」。
  var ARC_W = 0.20, ARC_S = 0.52;
  var ARC_TMP = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 };
  function meleeArcPose(style, u, out) {
    var a = MELEE_ARC[style] || MELEE_ARC.slashR, e;
    if (u < ARC_W) {                                  // 抬手：本位 → 蓄势位
      e = rlEase(u / ARC_W);
      out.rx = a.w[0] * e; out.ry = a.w[1] * e; out.rz = a.w[2] * e;
      out.px = a.wp[0] * e; out.py = a.wp[1] * e; out.pz = a.wp[2] * e;
    } else if (u < ARC_S) {                           // 劈落：蓄势位 → 终点位
      // 混一点线性进去（0.55 平滑 + 0.45 线性）：纯 smoothstep 的中段太"软"，
      // 挥砍要的是中途最快、末端还带着速度撞上去。
      var t = (u - ARC_W) / (ARC_S - ARC_W);
      e = rlEase(t) * 0.55 + t * 0.45;
      out.rx = rlMix(a.w[0], a.s[0], e); out.ry = rlMix(a.w[1], a.s[1], e); out.rz = rlMix(a.w[2], a.s[2], e);
      out.px = rlMix(a.wp[0], a.sp[0], e); out.py = rlMix(a.wp[1], a.sp[1], e); out.pz = rlMix(a.wp[2], a.sp[2], e);
    } else {                                          // 收势：终点位 → 本位
      e = 1 - rlEase((u - ARC_S) / (1 - ARC_S));
      out.rx = a.s[0] * e; out.ry = a.s[1] * e; out.rz = a.s[2] * e;
      out.px = a.sp[0] * e; out.py = a.sp[1] * e; out.pz = a.sp[2] * e;
    }
    return out;
  }

  // 连段：窗口内连续挥砍接下一段，超时归零。dmg/cd 是**倍率**，乘在 WEAPONS 的
  // 基础值上；arcK 乘在 arcDot 上（arcDot 是命中所需的最小 dot，所以 >1 = 扇区更窄），
  // rngK 乘在 range 上。server.js 有同一张表，两边必须一致，
  // 否则客户端预测的段号和服务端真正结算的段号会错开，动作和伤害就对不上。
  var MELEE_COMBO_WINDOW = 900;
  // 轻击（左键）连段。dmg/cd 是**倍率**，乘在 WEAPONS 的基础值上；arcK 乘在 arcDot 上
  // （arcDot 是命中所需的最小 dot，所以 >1 = 扇区更窄），rngK 乘在 range 上。
  // server.js 有同一张表，两边必须一致。
  // 轻击伤害必须压到重击的 25%~75%——轻击是磨血/补刀，重击才是终结手段。
  // 轻击节奏（基础 cooldown × cd 倍率）按武器类型排在 0.3~0.8 秒一刀：
  //   电锯 0.30/0.33 · 匕首 0.32/0.32/0.48 · 尼泊尔 0.42/0.55
  //   武士刀 0.48/0.53/0.70 · 斧 0.78/0.86
  var MELEE_COMBO = {
    knife: [{ s: 'slashR', dmg: 1.00, cd: 1.00 },
            { s: 'slashL', dmg: 1.00, cd: 1.00 },
            { s: 'stab',   dmg: 1.50, cd: 1.50, arcK: 1.35, rngK: 1.15 }],
    kukri: [{ s: 'slashR', dmg: 1.00, cd: 1.00 },
            { s: 'slashL', dmg: 1.20, cd: 1.30 }],
    katana:[{ s: 'slashR',   dmg: 1.00, cd: 1.00 },
            { s: 'slashL',   dmg: 1.10, cd: 1.10 },
            { s: 'overhead', dmg: 1.40, cd: 1.45, arcK: 0.85 }],
    axe:   [{ s: 'overhead', dmg: 1.00, cd: 1.00 },
            { s: 'slashR',   dmg: 1.10, cd: 1.10, arcK: 0.85 }],
    chainsaw: [{ s: 'saw',  dmg: 1.00, cd: 1.00 },
               { s: 'sawB', dmg: 1.30, cd: 1.10 }]
  };
  // 近战重击（右键，带前摇）。与轻击完全独立：
  //   dmg     重击绝对伤害（不乘轻击基础值）——重击两下必须 >100，所以 dmg 都 ≥ 50
  //   windup  前摇秒数——右键一下就进前摇，走完由 updateLocal 自动挥出
  //   cd      重击收势秒数（从结算起算）——一刀总时长 = windup + cd
  //   s       挥砍弧线风格（对齐 MELEE_ARC）
  //   rngK/arcK 范围与扇区倍率
  // server.js 有同一张表，两边必须逐字一致。
  var MELEE_HEAVY = {
    knife:    { dmg: 60,  windup: 0.45, cd: 0.55, s: 'stab',     rngK: 1.15, arcK: 1.35 },
    kukri:    { dmg: 66,  windup: 0.60, cd: 0.70, s: 'overhead', rngK: 1.10, arcK: 0.90 },
    katana:   { dmg: 66,  windup: 0.70, cd: 0.75, s: 'overhead', rngK: 1.10, arcK: 0.85 },
    axe:      { dmg: 80,  windup: 0.90, cd: 0.95, s: 'overhead', rngK: 1.05, arcK: 0.85 },
    chainsaw: { dmg: 62,  windup: 0.65, cd: 0.75, s: 'sawB',     rngK: 1.05, arcK: 0.90 }
  };
  function meleeStep(id, stage) {
    var c = MELEE_COMBO[id] || MELEE_COMBO.knife;
    return c[((stage % c.length) + c.length) % c.length];
  }
  // 动作时长跟着这一段的冷却走（占 82%，留一点收势余量）。
  // 匕首连段一刀 181ms、收尾直刺 405ms、斧子重砍 779ms——节奏差别是看得出来的。
  function meleeSwingDur(id, stage) {
    var wpn = WEAPONS[id] || WEAPONS.knife;
    return clamp(wpn.cooldown * meleeStep(id, stage).cd * 0.82 / 1000, 0.14, 0.85);
  }
  var ARM_L1 = 0.315;    // 肩→肘
  var ARM_L2 = 0.295;    // 肘→掌心
  // 持枪时肘该往哪拐：斜下 + 外侧 + 略后。左右对称（x 乘 side）。
  var ARM_POLE = [0.45, -1, 0.30];
  // 上身侧转角（chest 组，绕脊柱竖轴）。这不是为了好看，是**几何上必须的**：
  // 托肩姿势下支撑手要落在肩前方约 0.70m 处，而人的臂展只有 0.61——正面站直
  // 端枪，左手无论怎么解都够不到，IK 会把两只手全堆在握把上。
  // 真人的解法就是侧身（blading）：左肩往前转、横向偏移缩短，够得到了。
  // 负角才是左肩向前（局部 -z 为前）。头和 aimGroup 不跟着转，
  // 所以脸依然朝目标、枪口依然对准准心。
  var BLADE = -0.55;

  // 两骨 IK：让掌心落在 (tx,ty,tz)（手臂所在父节点 chest 的局部坐标，见 bladeSpace），
  // 同时用 pole 向量指定**肘往哪边拐**。
  // 手写角度试出来的姿势一改挂点就散架，而这套关系是纯几何的，反解才靠得住。
  // 为什么需要 pole：肩到掌的距离只锁定了屈肘角，肘还能绕「肩—掌」这根轴自由转一圈。
  // 上一版把这个自由度写死成「肩只有 x/z 两个欧拉角」，等于让引擎替你随便挑一个——
  // 右肘就被挑到了胸前，直接扎进胸挂弹匣包里。pole 指向「肘该去的大方向」
  // （持枪时是斜下后方），肘才会落在身体外侧。
  // 推导：u = 肩→掌单位向量；肘在以 u 为轴、半顶角 acos((L1²+d²-L2²)/(2·L1·d)) 的圆锥面上，
  // 取 pole 垂直于 u 的分量 v 定位圆锥面上的那一点。
  // 再由「上臂沿局部 -y、小臂绕局部 x 往 -z 屈」反推出肩的完整朝向矩阵：
  // 局部 +y = -肩→肘方向，肘→掌方向 w = -cos e·Y - sin e·Z 解出 Z，X = Y×Z。
  // （可以验算 Y·w = -cos e，所以这三个轴天然正交，不需要再做正交化。）
  var ARM_M = new THREE.Matrix4();
  function solveArm(arm, tx, ty, tz, plx, ply, plz, keepBase) {
    var dx = tx - arm.position.x, dy = ty - arm.position.y, dz = tz - arm.position.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var reach = (ARM_L1 + ARM_L2) * 0.999;
    if (d > reach) { var k = reach / d; dx *= k; dy *= k; dz *= k; d = reach; }
    if (d < 1e-4) return;
    var cosE = (ARM_L1 * ARM_L1 + ARM_L2 * ARM_L2 - d * d) / (2 * ARM_L1 * ARM_L2);
    var e = Math.PI - Math.acos(clamp(cosE, -1, 1));
    var ux = dx / d, uy = dy / d, uz = dz / d;
    var cosA = clamp((ARM_L1 * ARM_L1 + d * d - ARM_L2 * ARM_L2) / (2 * ARM_L1 * d), -1, 1);
    var sinA = Math.sqrt(1 - cosA * cosA);
    var pd = plx * ux + ply * uy + plz * uz;
    var vx = plx - ux * pd, vy = ply - uy * pd, vz = plz - uz * pd;
    var vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
    // pole 与手臂共线时垂直分量退化，随便挑个下方向兜住，别让整条手臂变 NaN
    if (vl < 1e-5) { vx = 0; vy = -1; vz = 0; vl = 1; }
    vx /= vl; vy /= vl; vz /= vl;
    var ex = ux * cosA + vx * sinA, ey = uy * cosA + vy * sinA, ez = uz * cosA + vz * sinA;
    var Yx = -ex, Yy = -ey, Yz = -ez;
    var hx = dx - ARM_L1 * ex, hy = dy - ARM_L1 * ey, hz = dz - ARM_L1 * ez;
    var hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hl > 1e-6) { hx /= hl; hy /= hl; hz /= hl; }
    var se = Math.sin(e), ce = Math.cos(e);
    var Zx, Zy, Zz;
    if (Math.abs(se) < 1e-4) { Zx = vx; Zy = vy; Zz = vz; }   // 伸直时 Z 的极限就是 v
    else { Zx = -(hx + ce * Yx) / se; Zy = -(hy + ce * Yy) / se; Zz = -(hz + ce * Yz) / se; }
    var Xx = Yy * Zz - Yz * Zy, Xy = Yz * Zx - Yx * Zz, Xz = Yx * Zy - Yy * Zx;
    ARM_M.set(Xx, Yx, Zx, 0, Xy, Yy, Zy, 0, Xz, Yz, Zz, 0, 0, 0, 0, 1);
    arm.quaternion.setFromRotationMatrix(ARM_M);
    arm.foreJoint.rotation.x = e;
    // 动画要以这套解出来的姿势为基线。四元数赋值会同步刷新 .rotation，
    // 所以后面那些直接改 rotation.x 的动画照旧能用。
    // keepBase：换弹这类**逐帧重解**的动画会一直调 solveArm，如果每帧都刷新基线，
    // 基线就跟着动画跑了，动作结束后手臂再也回不到持枪姿势。这时传 true 只出姿势、不动基线。
    if (keepBase) return;
    arm.baseX = arm.rotation.x; arm.baseY = arm.rotation.y;
    arm.baseZ = arm.rotation.z; arm.baseE = e;
  }

  // 把 bodyGroup 局部坐标的点换算到 chest 局部坐标。
  // chest 只绕 y 转了 BLADE，所以反变换就是绕 y 转 -BLADE。
  // 挂点（WEAPON_MOUNT/GRIP_LOCAL）都是按身体正朝向量的，手臂却长在侧转过的
  // chest 上；不换算就等于把目标点也一起转了，手会偏到枪外面去。
  function bladeSpace(p) {
    var c = Math.cos(BLADE), s = Math.sin(BLADE);
    return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
  }

  // 投掷物弹道：这一组常量 + stepThrown() 必须与 server.js 里的同名副本逐字一致。
  // 服务端只广播「出手点 + 出手速度」，落点由两端各自积分算出来——参数差一点，
  // 客户端看到的手雷就会停在服务端判定爆炸点之外的地方。
  var THROW_GRAVITY = 20;
  var THROW_RADIUS = 0.085;
  var THROW_RESTITUTION = 0.40;
  var THROW_FRICTION = 0.72;
  var THROW_STEP = 1 / 120;

  // ----------------------------------------------------------
  // DOM
  // ----------------------------------------------------------
  var canvas = document.getElementById('gameCanvas');
  var menu = document.getElementById('menu');
  var hud = document.getElementById('hud');
  var nameInput = document.getElementById('nameInput');
  var nameHint = document.getElementById('nameHint');
  var startBtn = document.getElementById('startBtn');
  var healthFill = document.getElementById('healthFill');
  var healthText = document.getElementById('healthText');
var statText = document.getElementById('statText');
var respawnCountdownEl = document.getElementById('respawnCountdown');
var localNameTag = document.getElementById('localNameTag');
  var weaponName = document.getElementById('weaponName');
  var ammoText = document.getElementById('ammoText');
  var throwText = document.getElementById('throwText');
  var reloadTip = document.getElementById('reloadTip');
  var reloadFill = document.querySelector('#reloadBar > i');
  var reloadBar = document.getElementById('reloadBar');
  var crosshair = document.getElementById('crosshair');
  var scopeOverlay = document.getElementById('scopeOverlay');
  var hitmarker = document.getElementById('hitmarker');
  var heavyChargeWrap = document.getElementById('heavyChargeWrap');
  var heavyChargeFill = document.getElementById('heavyChargeFill');
  var damageOverlay = document.getElementById('damageOverlay');
  var deathOverlay = document.getElementById('deathOverlay');
  var killfeed = document.getElementById('killfeed');
  var scoreboard = document.getElementById('scoreboard');
  var scoreBody = document.getElementById('scoreBody');
var leaderboardList = document.getElementById('leaderboardList');
  var streakBanner = document.getElementById('streakBanner');
  var streakLabel = document.getElementById('streakLabel');
  var streakCount = document.getElementById('streakCount');
  var healPopup = document.getElementById('healPopup');
  var streakHideTimer = 0;
  var healHideTimer = 0;

  // ----------------------------------------------------------
  // 状态
  // ----------------------------------------------------------
  var local = {
    id: null,
    name: '',
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    hp: 100,
    maxHp: 100,
    alive: false,
    initialized: false,
    onGround: true,
    current: 'primary',
    melee: 'knife',
    primary: 'rifle',
      secondary: 'pistol',
      ranged: 'rifle',
    kills: 0,
    deaths: 0,
    streak: 0,
    bestStreak: 0,
    ammo: WEAPONS.rifle.mag,
      ammoPrimary: WEAPONS.rifle.mag,
      ammoSecondary: WEAPONS.pistol.mag,
    // 备弹镜像，规则同 ammo：reserve 是手上这把枪的，换枪/换弹完成时与
    // reservePrimary / reserveSecondary 同步（服务端 handleSwitch 也这么做）
    reserve: WEAPONS.rifle.reserve,
      reservePrimary: WEAPONS.rifle.reserve,
      reserveSecondary: WEAPONS.pistol.reserve,
    grenadeCount: GRENADE_MAX,
    smokeCount: SMOKE_MAX,
    reloading: false
  };

  var remotePlayers = new Map();
  // 练枪靶子。位置/朝向/血量全由服务端给（见 server.js 的 DUMMY_SPOTS），
  // 这边只负责建模型和放反馈——**不**自己造判定，否则练出来的手感和实战对不上。
  var dummies = new Map();
  var socket = null;
  var gameStarted = false;
  var pointerLocked = false;
  var triggerDown = false;
  var ads = false;            // 右键开镜
  var selectedMelee = 'knife';
  var selectedPrimary = 'rifle';
  var showScore = false;
  var lastHp = 100;

  var keys = { f: false, b: false, l: false, r: false, jump: false, run: false, crouch: false };

  var lastLocalFire = 0;
  var lastLocalMelee = 0;
var lastDrySound = 0;
  var recoilPitch = 0;
  var recoilYaw = 0;
  var recoilZ = 0;
  var bloom = 0;              // 连发累积散射（与服务端各自维护，参数相同所以结果一致）
  var swingTime = 0;
  var swingStyle = 'slashR';     // 当前挥砍用的弧线
  var swingDur = 0.24;           // 当前挥砍时长（按连段的 cd 倍率算）
  var localComboStage = 0;       // 本地预测的连段段号
  var heavyWindup = 0;           // 重击前摇剩余秒数（>0 = 前摇进行中）
  var heavyWindupTotal = 0;      // 本次前摇总时长（进度条用）
  var heavyCooldownUntil = 0;    // 重击收势到期时间戳（performance.now 口径）
  var bobPhase = 0;
  var sendStateTimer = 0;
var lastLeaderboardUpdate = 0;
  var damageShake = 0;
  var muzzleLight = null;
  var muzzleLightLife = 0;
var lastSmokeTime = 0;
var lastGrenadeTime = 0;
var respawnCountdownEnd = 0;
var smokeTexture = null;

  // 特效数组
  var tracerLines = [];
  var impacts = [];
  var slashEffects = [];
  var flashes = [];
  var glowTexture = null;
var smokeParticles = [];
  var throwables = [];        // 飞行中的手雷/烟雾弹
  var throwAnim = 0;          // 投掷手臂动画剩余时间
  // 第一人称换弹动画：已播时长 / 总时长 / 播的是哪把枪。
  // 用"已播时长"而不是"剩余时间"，是因为总时长各枪不同（reloadTime），
  // 进度必须按比例走完，1.3 秒的手枪和 3.8 秒的机枪才会是同一套动作节奏。
  var reloadAnimT = 0, reloadAnimDur = 0, reloadAnimId = '';
  var reloadSndStage = 0;     // 换弹音效已经播到第几段
  var reloadTimer = 0;        // startReload 的上膛完成定时器，切枪/重生要能取消它

  // ----------------------------------------------------------
  // Three.js 初始化
  // ----------------------------------------------------------
  var renderer, scene, camera, skyMesh;
  camera = new THREE.PerspectiveCamera(); // 临时相机，initThree 中会重新创建
  var vmGroup, vmGunGroup, vmMeleeGroup;
  var gunModels = {};
  var meleeModels = {};
  var muzzleAnchors = {};
  var clock = new THREE.Clock();

  var SUN_DIR = new THREE.Vector3(0.48, 0.62, 0.30).normalize();
  var skyUniforms = null;      // 云已经并进天空 shader，不再有独立的 cloudLayer mesh
  var cloudDrift = 0;

  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9c6dd);
    // 远景大气透视：近处清晰，远山雾化
    scene.fog = new THREE.Fog(0xbdd2e2, 80, 340);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.06, 1400);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, EYE, 0);
    scene.add(camera);

    buildSky();
    buildEnvironment();

    // ---- 光照：天光 + 主太阳 + 冷补光 ----
    // groundColor 原来是 0x55503f，比场地实际的地面暗得多也脏得多：
    // 场地是沥青罩面 + 夯土，被 2.45 强度的太阳照着，反弹回来的是**中等暖灰**。
    // 用那个暗橄榄色的后果是所有朝下的面（掩体顶盖底面、集装箱底、枪械与手臂
    // 的阴面）都糊成深棕——实测掩体顶盖底面只有 rgb(47,39,27)，暗部细节全丢。
    // 提到 0x6f6858：线性亮度约为原来的 1.8 倍，暗部读得出结构，又没有反弹光
    // 越过受光面的危险（天光顶色仍然更亮）。
    var hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6f6858, 0.8);
    scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xfff2dc, 2.45);
    sun.position.copy(SUN_DIR).multiplyScalar(110);
    sun.target.position.set(0, 0, 0);
    scene.add(sun);
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -68;
    sun.shadow.camera.right = 68;
    sun.shadow.camera.top = 68;
    sun.shadow.camera.bottom = -68;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 230;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix();

    var fill = new THREE.DirectionalLight(0x9dc0e8, 0.42);
    fill.position.set(-40, 26, -55);
    scene.add(fill);

    // 地面反弹的暖色补光，避免下半身死黑
    var bounce = new THREE.DirectionalLight(0xffd9a8, 0.18);
    bounce.position.set(-20, -30, 25);
    scene.add(bounce);

    muzzleLight = new THREE.PointLight(0xffcc66, 0, 5);
    scene.add(muzzleLight);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // 天空：三段渐变 + 日盘 + 日晕 + 漂移云层
  // 云原来是一块 1600×1600 的 PlaneGeometry 摆在 y=210、跟着相机平移。
  // 它有个躲不掉的毛病：平面是**有限**的，边缘在水平 800m / 高 210m 处，
  // 也就是仰角 atan(210/800)=14.7°——天上永远横着一条硬邊，
  // 边线以下（地平线到 14.7°）一丝云都没有，而且透视会把边缘那圈斑块
  // 压成一排收敛到天际线的横条。全景截图上方那几道诡异的斜线就是这个。
  // 现在把云并进天空 shader：按视线方向解算与云平面的交点来采样，
  // 越接近水平就越淡（smoothstep 到 0）。这样既没有几何边缘，
  // 透视收敛也是连续的，还省掉一个 mesh 和一次半透明 draw call。
  function buildSky() {
    var cloudTex = getCloudTexture();
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    skyUniforms = {
      topColor: { value: new THREE.Color(0x2f6ba6) },
      midColor: { value: new THREE.Color(0x8fb8d8) },
      bottomColor: { value: new THREE.Color(0xd8e4ea) },
      sunColor: { value: new THREE.Color(0xfff4d8) },
      sunDir: { value: SUN_DIR.clone() },
      cloudMap: { value: cloudTex },
      cloudOffset: { value: new THREE.Vector2(0, 0) }
    };
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main(){',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vWorldPosition = wp.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor;',
        'uniform vec3 sunColor; uniform vec3 sunDir;',
        'uniform sampler2D cloudMap; uniform vec2 cloudOffset;',
        'varying vec3 vWorldPosition;',
        'void main(){',
        '  vec3 dir = normalize(vWorldPosition - cameraPosition);',
        '  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(bottomColor, midColor, smoothstep(0.42, 0.53, h));',
        '  col = mix(col, topColor, smoothstep(0.55, 0.96, h));',
        '  float sd = max(dot(dir, normalize(sunDir)), 0.0);',
        // 云：先算再叠日盘，否则日盘会被云糊掉——云在太阳前面时该是被照亮的边缘，
        // 而不是把整个日盘抹平。这里简化成「云挡不住日盘」。
        '  float cy = max(dir.y, 0.0);',
        // dir.xz / cy 是视线与云平面的交点，乘的系数就是「云层高度 / 贴图一格的边长」。
        // 第一版随手写了 0.021，等于一格 tile 铺一万米——整片天只采到贴图中心
        // 一小块，结果是一道从天顶抹到地平线的巨大竖向糊斑（截图 32-sky）。
        // 按角径反推：一簇云占贴图 0.2 格，想让它在天上张 ~11°，需要 tile ≈ 云高，
        // 所以系数取 1.15 这个量级，而不是 0.02。
        // 分母用 cy + 0.28 而不是 max(cy, 0.30)：max 在钳位点处导数不连续，
        // 低于钳位点 uv 就完全不随仰角变化，于是贴图沿视线方向被径向拉成一条条
        // 竖直光柱（截图 62-sky 地平线上方那一排）。加常数是处处平滑且有界的：
        // 天顶 /1.28、仰角 17° /0.58、地平线 /0.28，最大拉伸 3.6 倍且没有折点。
        '  vec2 cuv = dir.xz / (cy + 0.28) * 1.15 + cloudOffset;',
        // 两次采样、尺度和方向都错开：单层平铺一眼就能看出重复的方格，
        // 相乘之后周期变成两者的最小公倍数，实际看不出来。
        // 注意这只能打散**周期性**，贴图内容本身不自环绕的话，tile 边界的密度
        // 突变照样是一条直线接缝——那个得在 getCloudTexture 里画 3×3 环绕副本解决。
        '  float c1 = texture2D(cloudMap, cuv).a;',
        '  float c2 = texture2D(cloudMap, cuv * 0.43 + vec2(0.37, 0.61) - cloudOffset * 0.6).a;',
        // 两层叠加出来的 alpha 是一片连绵的灰霾，中间没有透出蓝天的缝，
        // 看着像高层卷云而不是积云。用 smoothstep 提对比度：低值压到 0（露出蓝天），
        // 高值推到 1（云心结实），边缘自然就锐了。
        '  float ca = smoothstep(0.13, 0.52, c1 * 0.80 + c2 * 0.52);',
        // fade 在 0.05~0.28 之间收完：地平线附近云本来就被大气霾吃掉，
        // 顺手把拉伸最厉害的那一段也一起淡掉。
        '  ca *= smoothstep(0.05, 0.28, cy) * 0.86;',
        // 云不是纯白：正对太阳那侧提亮、背面偏冷灰，否则一团纯白 alpha 在
        // ACES 下就是一块过曝的补丁，看不出体积。
        // 数值是**线性辐亮度**（下面要过 ACES），所以别写到 1.0 附近——
        // ACES 把高光压得厉害，0.80 和 1.0 出来几乎一样白，体积感就没了。
        // 压到 0.42/0.86 落在曲线还接近线性的段，明暗比才留得住。
        '  vec3 cloudCol = mix(vec3(0.42, 0.44, 0.48), vec3(0.86, 0.84, 0.78), pow(sd, 3.0));',
        '  col = mix(col, cloudCol, ca);',
        '  col += sunColor * pow(sd, 320.0) * 1.8;',   // 日盘
        '  col += sunColor * pow(sd, 8.0) * 0.20;',    // 日晕
        '  col += sunColor * pow(sd, 2.0) * 0.05;',    // 大范围散射
        '  gl_FragColor = vec4(col, 1.0);',
        // 这两行不能省。ShaderMaterial 的 fragmentShader 是**原样**使用的，
        // 渲染器只会自动给内置材质追加色调映射和输出色彩空间转换。
        // 而 uniform 里的 THREE.Color 在 r152+ 已经被 ColorManagement 转成线性了，
        // 于是 0x8fb8d8（sRGB 0.72）以线性值 0.48 直接写进 sRGB 帧缓冲——
        // 天空整体压暗又过饱和，成了深藏青（截图 60/61）。
        // 补上这两个 chunk 后天空才和场景走同一条 ACES + sRGB 通路：
        // 中天由 (70,122,177) 回到 (161,195,213)，地平线亮度也终于和雾色对齐。
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
      ].join('\n')
    });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -2;
    scene.add(skyMesh);
  }

  function updateSky(dt) {
    if (skyMesh) skyMesh.position.copy(camera.position);
    if (skyUniforms) {
      cloudDrift += dt * 0.0022;
      skyUniforms.cloudOffset.value.set(cloudDrift, cloudDrift * 0.45);
    }
  }

  // 预过滤环境贴图（IBL）：让金属枪械/护甲有真实反射与高光，而非死板的灰色
  function buildEnvironment() {
    if (!THREE.PMREMGenerator) return;
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envScene = new THREE.Scene();

    // 渐变天穹
    var skyGeo = new THREE.SphereGeometry(40, 24, 12);
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x3d74ab) },
        mid: { value: new THREE.Color(0x9fc0da) },
        bot: { value: new THREE.Color(0xe6eef2) }
      },
      vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vp;',
        'void main(){',
        '  float h = clamp(normalize(vp).y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 c = mix(bot, mid, smoothstep(0.35, 0.55, h));',
        '  c = mix(c, top, smoothstep(0.55, 0.95, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));

    // 太阳亮斑：为金属提供锐利高光
    var sunGeo = new THREE.SphereGeometry(2.4, 16, 12);
    var sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.copy(SUN_DIR).multiplyScalar(28);
    envScene.add(sunMesh);

    // 地面反弹：让朝下的反射带暖色，避免下缘死黑
    var gd = new THREE.Mesh(
      new THREE.CircleGeometry(40, 24),
      new THREE.MeshBasicMaterial({ color: 0x6b6150, side: THREE.DoubleSide })
    );
    gd.rotation.x = -Math.PI / 2; gd.position.y = -7;
    envScene.add(gd);

    var rt = pmrem.fromScene(envScene, 0.04, 0.1, 100);
    scene.environment = rt.texture;

    pmrem.dispose();
    skyGeo.dispose(); skyMat.dispose();
    sunGeo.dispose(); sunMat.dispose();
    gd.geometry.dispose(); gd.material.dispose();
  }

  // ----------------------------------------------------------
  // 场景
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // 程序化贴图库（Canvas 生成，带缓存）
  // ----------------------------------------------------------
  var texCache = {};
  function makeTex(key, size, draw, opts) {
    if (key && texCache[key]) return texCache[key];
    opts = opts || {};
    var c = document.createElement('canvas');
    c.width = size; c.height = opts.height || size;
    var ctx = c.getContext('2d');
    draw(ctx, c.width, c.height);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    if (key) texCache[key] = tex;
    return tex;
  }

  // 值噪声：叠几层随机点做污渍/颗粒
  function speckle(ctx, w, h, count, minA, maxA, size, colorFn) {
    for (var i = 0; i < count; i++) {
      var x = Math.random() * w, y = Math.random() * h;
      var a = minA + Math.random() * (maxA - minA);
      var s = size * (0.4 + Math.random() * 0.8);
      ctx.fillStyle = colorFn(a);
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 沥青/水泥地面 —— 可平铺
  // 重做过一轮。原来底色 #3b4149（59,65,73）是一块偏蓝的深板岩，实测地面渲染亮度
  // 只有 0.196，而掩体块身是 0.349 —— 差 1.8 倍。于是整个场地读成「一堆浅色盒子
  // 摆在近黑的地上」，也是画面显得阴沉的主因（地面占 40~66% 的像素）。
  // 三处改：
  //   1) 底色抬到 (88,86,80) 并去蓝转微暖 → 目标亮度 0.29，和块身 0.349 只差 1.2 倍，
  //      同时仍比块底座（0.199）亮，块和地的接缝还在。
  //   2) 骨料亮点 2600 → 1500、最大 alpha 0.22 → 0.14。原来俯视像撒了一层雪。
  //   3) 加**伸缩缝**：真实机坪是一格一格浇的。贴图内切 3×3、外面 repeat 4 次，
  //      合起来约每 8.3m 一道缝，正好是重型机坪的尺度。
  //      这一笔顺便把「平铺」变成了特征：缝对齐到 tile 边界，看到的是格子而不是重复。
  function getAsphaltTexture() {
    return makeTex('asphalt', 512, function (ctx, w, h) {
      ctx.fillStyle = '#585650'; ctx.fillRect(0, 0, w, h);
      // 大块色差。冷暖各来一半：真实水泥的批次差是往两个方向偏的，
      // 全部往一个方向偏只会整体染色，看不出斑
      for (var i = 0; i < 26; i++) {
        var g = 74 + Math.floor(Math.random() * 30);
        ctx.fillStyle = i % 2
          ? 'rgba(' + (g + 8) + ',' + (g + 5) + ',' + g + ',0.5)'
          : 'rgba(' + g + ',' + (g + 4) + ',' + (g + 9) + ',0.5)';
        var bw = 40 + Math.random() * 120, bh = 40 + Math.random() * 120;
        ctx.fillRect(Math.random() * w, Math.random() * h, bw, bh);
      }
      // 伸缩缝：暗线 + 紧贴一侧的亮边，才有凹槽的错觉（和防爆块的模板缝同一手法）
      for (var j = 1; j < 3; j++) {
        var p = w * j / 3;
        ctx.fillStyle = 'rgba(26,25,22,0.45)';
        ctx.fillRect(p - 1.4, 0, 2.8, h); ctx.fillRect(0, p - 1.4, w, 2.8);
        ctx.fillStyle = 'rgba(196,192,184,0.16)';
        ctx.fillRect(p + 1.4, 0, 1.4, h); ctx.fillRect(0, p + 1.4, w, 1.4);
      }
      // 骨料颗粒
      speckle(ctx, w, h, 1500, 0.04, 0.14, 1.6, function (a) { return 'rgba(206,202,192,' + a + ')'; });
      speckle(ctx, w, h, 1800, 0.05, 0.3, 1.4, function (a) { return 'rgba(18,16,14,' + a + ')'; });
      // 裂缝
      ctx.strokeStyle = 'rgba(10,12,15,0.5)';
      for (var k = 0; k < 7; k++) {
        ctx.lineWidth = 0.6 + Math.random() * 1.6;
        ctx.beginPath();
        var x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        for (var s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // 油渍
      speckle(ctx, w, h, 5, 0.1, 0.22, 34, function (a) { return 'rgba(0,0,0,' + a + ')'; });
      // repeat 12 → 4 → 7。这张图只铺 99×99 的场内机坪（不再是 300×300 的整块地）。
      // 12 时缝密到每 2.75m 一道，俯视是一张纱窗；退到 4 之后缝的间距对了，
      // 但一格 24.8m 意味着一个纹素 4.8cm、图里那些 40~120px 的色斑放大到 3.7m，
      // 眼平视角看就是一摊摊没对上焦的糊斑（截图 91 地面）。
      // 7 是两头的折中：一格 14.1m（纹素 2.76cm），伸缩缝每 4.7m 一道 —— 仍是重型
      // 机坪的真实板块尺寸，而色斑缩到 2.1m，重新读成沥青的批次色差而不是污渍。
    }, { repeat: [7, 7] });
  }

  // 地面标线覆盖层（透明底，1:1 铺在竞技场上）
  // 这一层的颜色下调过两轮。标线画在 MeshStandardMaterial 上，纯白 albedo
  // 经 ACES + 2.45 太阳会顶到过曝，结果不像「刷在沥青上的漆」而像地上嵌了灯带；
  // 全景截图里最抢眼的三样东西是外圈红框、中央的黄 H、直升机坪白圈，
  // 全是这里画的。露天磨过的路漆本来就是脏的，压暗才是写实方向。
  // 第二轮又整体降了一档：第一轮之后眼平视角里两条蓝色出生区边框仍然是全画面
  // 最亮最饱和的东西，读成发光的霓虹带（截图 91）。原因是 albedo 只降到 ~0.5
  // 反射率，而阳光直射会再把它抬上去；真实道路漆在沥青上大约 0.2~0.25，
  // 所以蓝/橙/红/黄全部再砍到原值的六七成——仍然一眼能分辨，但不再自发光。
  function getMarkingTexture() {
    return makeTex('markings', 1024, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var C = w / 2;
      // 中央直升机坪
      ctx.strokeStyle = 'rgba(150,154,160,0.46)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(C, C, 168, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(C, C, 150, 0, Math.PI * 2); ctx.stroke();
      // "H"
      ctx.strokeStyle = 'rgba(168,152,92,0.76)';
      ctx.lineWidth = 22; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(C - 54, C - 70); ctx.lineTo(C - 54, C + 70);
      ctx.moveTo(C + 54, C - 70); ctx.lineTo(C + 54, C + 70);
      ctx.moveTo(C - 54, C); ctx.lineTo(C + 54, C);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // 出生区（蓝/橙）
      function zone(cx, cy, col) {
        ctx.strokeStyle = col; ctx.lineWidth = 6;
        ctx.setLineDash([26, 18]);
        ctx.strokeRect(cx - 150, cy - 60, 300, 120);
        ctx.setLineDash([]);
      }
      zone(C, 120, 'rgba(52,84,120,0.62)');
      zone(C, h - 120, 'rgba(52,84,120,0.62)');
      zone(120, C, 'rgba(128,76,38,0.62)');
      zone(w - 120, C, 'rgba(128,76,38,0.62)');
      // 跑道虚线
      ctx.strokeStyle = 'rgba(140,128,76,0.34)';
      ctx.lineWidth = 5; ctx.setLineDash([40, 40]);
      ctx.beginPath(); ctx.moveTo(0, C); ctx.lineTo(w, C); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(C, 0); ctx.lineTo(C, h); ctx.stroke();
      ctx.setLineDash([]);
      // 边界危险条
      ctx.strokeStyle = 'rgba(122,50,36,0.66)';
      ctx.lineWidth = 12; ctx.strokeRect(26, 26, w - 52, h - 52);
      // 磨损脏污。260 → 420、半径抬到 30：漆面必须被啃掉一部分，
      // 一条粗细均匀、通到底的实线在露天场地上是不存在的。
      speckle(ctx, w, h, 420, 0.03, 0.13, 30, function (a) { return 'rgba(20,18,14,' + a + ')'; });
    });
  }

  // 波纹钢集装箱贴图（按颜色缓存）
  function getContainerTexture(hex) {
    var key = 'cont_' + hex;
    return makeTex(key, 512, function (ctx, w, h) {
      // 这里原来是 new THREE.Color(hex) 然后 base.r * 255 —— 一个色彩管理的坑。
      // three r152 之后 ColorManagement 默认开着，Color 内部存的是**线性**值，
      // 而 canvas 的 fillStyle 吃的是 sRGB。把线性数当 sRGB 填进去，
      // 0xb5533f (181,83,63) 会变成 (118,22,13)：又暗一大截、又过饱和。
      // getStyle() 会做 working→sRGB 的反变换，这才是往 canvas 上画的正确取值。
      // 集装箱那种「颜色又浓又闷」的塑料感就是这一处来的。
      var base = new THREE.Color(hex);
      ctx.fillStyle = base.getStyle();
      ctx.fillRect(0, 0, w, h);
      // 竖向波纹（明暗交替）
      var ribs = 26, rw = w / ribs;
      for (var i = 0; i < ribs; i++) {
        var t = i / ribs;
        var shade = Math.sin(t * Math.PI * 2 * ribs / 2) > 0 ? 0.16 : -0.18;
        ctx.fillStyle = shade > 0 ? 'rgba(255,255,255,' + shade + ')' : 'rgba(0,0,0,' + (-shade) + ')';
        ctx.fillRect(i * rw, 0, rw * 0.55, h);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(i * rw + rw * 0.55, 0, rw * 0.12, h);
      }
      // 顶/底加强梁
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 0, w, 26); ctx.fillRect(0, h - 26, w, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 26, w, 6); ctx.fillRect(0, h - 32, w, 6);
      // 锈迹/污渍
      speckle(ctx, w, h, 90, 0.04, 0.22, 10, function (a) { return 'rgba(120,60,26,' + a + ')'; });
      speckle(ctx, w, h, 60, 0.03, 0.16, 7, function (a) { return 'rgba(20,16,12,' + a + ')'; });
      // 流锈条纹
      ctx.strokeStyle = 'rgba(110,55,25,0.28)';
      for (var s = 0; s < 10; s++) {
        ctx.lineWidth = 1 + Math.random() * 3;
        var x = Math.random() * w;
        ctx.beginPath(); ctx.moveTo(x, 30 + Math.random() * 30); ctx.lineTo(x + (Math.random() - 0.5) * 10, 30 + Math.random() * (h - 80)); ctx.stroke();
      }
      // 集装箱编号牌
      ctx.fillStyle = 'rgba(240,240,235,0.9)';
      ctx.fillRect(w * 0.36, h * 0.30, w * 0.28, h * 0.1);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('MSCU', w * 0.5, h * 0.35);
    });
  }

  // 木箱贴图
  function getCrateTexture() {
    return makeTex('crate', 256, function (ctx, w, h) {
      ctx.fillStyle = '#9a6f3e'; ctx.fillRect(0, 0, w, h);
      // 木纹
      for (var i = 0; i < 60; i++) {
        ctx.strokeStyle = 'rgba(80,52,26,' + (0.05 + Math.random() * 0.14) + ')';
        ctx.lineWidth = 0.6 + Math.random() * 1.4;
        var y = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 8, w * 0.6, y + (Math.random() - 0.5) * 8, w, y + (Math.random() - 0.5) * 6);
        ctx.stroke();
      }
      // 边框与对角加固条
      ctx.strokeStyle = '#5e3f20'; ctx.lineWidth = 16;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(w - 14, h - 14);
      ctx.moveTo(w - 14, 14); ctx.lineTo(14, h - 14); ctx.stroke();
      // 螺栓
      ctx.fillStyle = '#3d2913';
      [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill();
      });
      // 印刷标记
      ctx.fillStyle = 'rgba(40,30,16,0.5)';
      ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.fillText('AMMO', 0, 8); ctx.restore();
    });
  }

  // 混凝土贴图
  function getConcreteTexture() {
    return makeTex('concrete', 256, function (ctx, w, h) {
      ctx.fillStyle = '#8b8d86'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 1400, 0.03, 0.12, 1.4, function (a) { return 'rgba(60,60,58,' + a + ')'; });
      speckle(ctx, w, h, 900, 0.03, 0.12, 1.4, function (a) { return 'rgba(240,240,235,' + a + ')'; });
      // 裂纹与水渍
      ctx.strokeStyle = 'rgba(50,50,48,0.4)';
      for (var k = 0; k < 5; k++) {
        ctx.lineWidth = 0.6 + Math.random();
        var x = Math.random() * w, y = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (var s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      speckle(ctx, w, h, 8, 0.05, 0.12, 22, function (a) { return 'rgba(40,44,40,' + a + ')'; });
    });
  }

  // 沙袋贴图
  // 底色和袋色整体压了约 28%。原来底 #8a7a4e、袋心最高到 R=170，
  // 在 2.45 强度的太阳下渲成一片发亮的奶油色，俯视图里四道沙袋墙比掩体还显眼。
  // 麻布袋装湿沙是很闷的土黄，本来就该是场地里较暗的一档。
  function getSandbagTexture() {
    return makeTex('sandbag', 256, function (ctx, w, h) {
      ctx.fillStyle = '#635838'; ctx.fillRect(0, 0, w, h);
      var rows = 4, cols = 5;
      var bw = w / cols, bh = h / rows;
      for (var ry = 0; ry < rows; ry++) {
        for (var cx = 0; cx < cols; cx++) {
          var ox = (ry % 2) * bw * 0.5;
          var x = cx * bw + ox, y = ry * bh;
          var g = ctx.createRadialGradient(x + bw * 0.5, y + bh * 0.4, 4, x + bw * 0.5, y + bh * 0.5, bw * 0.7);
          var tint = 88 + Math.floor(Math.random() * 24);
          g.addColorStop(0, 'rgb(' + (tint + 18) + ',' + (tint + 5) + ',' + Math.max(0, tint - 30) + ')');
          g.addColorStop(1, 'rgb(' + Math.max(0, tint - 34) + ',' + Math.max(0, tint - 42) + ',' + Math.max(0, tint - 62) + ')');
          ctx.fillStyle = g;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x + 2, y + 2, bw - 4, bh - 4, 12); else ctx.rect(x + 2, y + 2, bw - 4, bh - 4);
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,34,18,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }, { repeat: [1, 1] });
  }

  // 拉丝金属
  function getMetalTexture() {
    return makeTex('metal', 256, function (ctx, w, h) {
      ctx.fillStyle = '#6b7078'; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 400; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.05) + ')';
        var y = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random() - 0.5) * 2); ctx.stroke();
      }
      speckle(ctx, w, h, 40, 0.05, 0.18, 6, function (a) { return 'rgba(30,32,36,' + a + ')'; });
    });
  }

  // 云层贴图（软斑块）
  // 原来是 40 个大小随机、均匀撒开的圆形径向渐变——间距均匀就等于没有结构，
  // 摊在天上是一层麻子而不是云。真实积云是**成团**的：一簇里若干个大小不等的
  // 泡挤在一起，横向铺得比纵向宽（底部被逆温层压平）。
  // 所以改成 9 簇 × 每簇 7~13 个泡，泡的 y 半径只有 x 的 0.52 倍。
  //
  // 每个泡都要画 9 遍（3×3 环绕偏移）。这张图在天空 shader 里是平铺采样的，
  // 内容不自环绕的话，tile 交界处云的密度会突变 —— 实际看到的就是天上一张
  // 横竖笔直的网格（截图 62-sky）。画 9 遍是纯加载期开销，运行时零成本。
  function getCloudTexture() {
    return makeTex('cloud', 512, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      for (var c = 0; c < 9; c++) {
        var cx = Math.random() * w, cy = Math.random() * h;
        var spread = 46 + Math.random() * 54;
        var puffs = 7 + Math.floor(Math.random() * 7);
        for (var i = 0; i < puffs; i++) {
          // 簇内偏移用 sqrt 分布：泡往中心聚，边缘稀，团才有实心的核
          var t = Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2;
          var px = cx + Math.cos(ang) * spread * t * 1.5;
          var py = cy + Math.sin(ang) * spread * t * 0.62;
          var rad = spread * (0.36 + Math.random() * 0.5);
          var a = (0.14 + Math.random() * 0.22) * (1.15 - t * 0.55);   // 中心的泡更厚
          for (var wx = -1; wx <= 1; wx++) for (var wy = -1; wy <= 1; wy++) {
            var x = px + wx * w, y = py + wy * h;
            // 离画布太远的环绕副本直接跳过，别白画
            if (x < -rad * 2 || x > w + rad * 2 || y < -rad * 2 || y > h + rad * 2) continue;
            var g = ctx.createRadialGradient(x, y, rad * 0.12, x, y, rad);
            g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
            g.addColorStop(0.55, 'rgba(255,255,255,' + (a * 0.52).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.save();
            ctx.translate(x, y); ctx.scale(1, 0.52); ctx.translate(-x, -y);
            ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
      }
    }, { repeat: [1, 1] });
  }

  // 场外土面（砾石/硬土）。原来场内场外共用一张 300×300 的水泥机坪贴图，
  // 于是防爆墙外面也铺着一模一样的伸缩缝板 —— 场地边界完全读不出来，
  // 整个世界就是一块无限大的水泥砖。真实基地是「墙内浇混凝土、墙外是压实的土」。
  // 这一层还顺手把画面的色相拉开了：土是暖褐，机坪是中性灰，两者一交界，
  // 「场地」这个概念才立起来。
  function getDirtTexture() {
    return makeTex('dirt', 512, function (ctx, w, h) {
      ctx.fillStyle = '#6b6052'; ctx.fillRect(0, 0, w, h);
      // 大块土色差：干湿不均 + 车辙压过的深浅
      for (var i = 0; i < 30; i++) {
        var r = 96 + Math.floor(Math.random() * 34);
        ctx.globalAlpha = 0.22 + Math.random() * 0.26;
        ctx.fillStyle = 'rgb(' + r + ',' + Math.floor(r * 0.90) + ',' + Math.floor(r * 0.76) + ')';
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h,
          w * (0.08 + Math.random() * 0.22), h * (0.06 + Math.random() * 0.20),
          Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 稀疏矮灌丛：暗绿的小团。纯土面在大面积上还是太干净，
      // 撒一点暗色植被才有「野地」的杂乱感（暗色所以不会像树那样抢注意）
      for (var b = 0; b < 26; b++) {
        var bx = Math.random() * w, by = Math.random() * h, br = 5 + Math.random() * 13;
        var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, 'rgba(52,58,38,0.62)');
        g.addColorStop(1, 'rgba(52,58,38,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }
      // 碎石：亮暗两层，暗的在下（阴影）、亮的在上（受光面），才有颗粒的立体感
      speckle(ctx, w, h, 2200, 0.06, 0.30, 2.2, function (a) { return 'rgba(38,32,26,' + a + ')'; });
      speckle(ctx, w, h, 1800, 0.05, 0.22, 1.8, function (a) { return 'rgba(186,174,156,' + a + ')'; });
    }, { repeat: [22, 22] });
  }

  // 兼容旧调用
  function createGroundTexture() { return getAsphaltTexture(); }

  function buildArena() {
    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    // ---- 地面：场外土面 + 场内水泥机坪 + 标线覆盖层 ----
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ map: getDirtTexture(), roughness: 0.98, metalness: 0.0, color: 0xb0a695 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 机坪：99×99，刚好盖住 ±47.5 的防爆墙（墙外皮 ±48.25），
    // 墙脚两侧都还是水泥，不会露出土/水泥的接缝正好压在墙下这种巧合感。
    var apron = new THREE.Mesh(
      new THREE.PlaneGeometry(99, 99),
      // color 从 0xcfd4da 换成 0xc9c6c2：亮度基本不动，但去掉那点蓝偏。
      // 原来天光(#cfe2ff)、补光(#9dc0e8)、地面 tint 三层蓝叠在一起，
      // 整个画面就是一张蓝滤镜；地面占 40% 以上的像素，是最该先中性化的那一层。
      new THREE.MeshStandardMaterial({ map: getAsphaltTexture(), roughness: 0.97, metalness: 0.0, color: 0xc9c6c2 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = 0.012;
    apron.receiveShadow = true;
    scene.add(apron);

    var markTex = getMarkingTexture();
    var markings = new THREE.Mesh(
      new THREE.PlaneGeometry(94, 94),
      new THREE.MeshStandardMaterial({ map: markTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    markings.rotation.x = -Math.PI / 2;
    // 0.012 → 0.05：必须抬到直升机坪**顶面之上**。原来坪是 0.12 高、中心 y=0.06，
    // 也就是占满 0~0.12，而标线在 0.012 —— 那个黄色的 "H" 一直被埋在坪的内部，
    // 从进游戏第一天起就没被看见过。坪同时改薄到 0.04（见下），H 现在落在钢板上，
    // 这也正是真实直升机坪的样子：漆是刷在坪面上的，不是刷在坪旁边的地上。
    markings.position.y = 0.05;
    markings.receiveShadow = true;
    scene.add(markings);

    // 直升机坪金属圆盘。0.12 厚 → 0.04：把顶面压到标线（0.05）之下
    // 原来 color 0x555a60 + metalness 0.5 在俯视图里是一个近黑的洞（截图 60/72）：
    // metalness 会按比例吃掉漫反射，0.5 就等于把本来已经偏暗的 albedo 再砍一半，
    // 而朝上的粗糙面从环境贴图拿到的镜面反射又补不回来。
    // 改成镀锌钢板的做法：albedo 提亮、金属度降到 0.28、粗糙度提到 0.72，
    // 让它比周围沥青**亮**一档，中心区读成抬起的平台而不是坑。
    var helipad = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 9.5, 0.04, 48),
      new THREE.MeshStandardMaterial({ map: getMetalTexture(), color: 0x8f949b, roughness: 0.72, metalness: 0.28 })
    );
    helipad.position.set(0, 0.02, 0);
    helipad.receiveShadow = true;
    scene.add(helipad);

    // 积水反光块（低洼处）
    // metalness 0.5 → 0：水是电介质。金属度给 0.5 会让它变成一块「半金属镜」——
    // 漫反射被砍半、镜面又被 albedo 染色，结果是四片死黑的圆斑而不是反着天光的水。
    // 金属度 0 + 低粗糙度时 MeshStandardMaterial 会走 Fresnel：正视浅、斜视强，
    // 这正是真实水面的样子（走过去才会看到天空的倒影）。
    var puddleMat = new THREE.MeshStandardMaterial({ color: 0x2f363d, roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.5 });
    [[-14, 6, 3], [16, -9, 2.4], [7, 18, 2], [-22, -14, 2.6]].forEach(function (p) {
      var pud = new THREE.Mesh(new THREE.CircleGeometry(p[2], 20), puddleMat);
      pud.rotation.x = -Math.PI / 2;
      pud.position.set(p[0], 0.02, p[1]);
      scene.add(pud);
    });

    // ---- 外围混凝土防爆墙 + 顶部铁丝网 ----
    var concreteTex = getConcreteTexture();
    concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;
    var wallMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0x9aa0a2, roughness: 0.92, metalness: 0.02 });
    // 围墙压顶。同样是半金属的坑：metalness 0.45 把这条 97m 长的压顶压成一道死黑边，
    // 从场地里往外看就是「墙顶被剪掉了」。降到 0.22、albedo 抬到 0x565c63。
    var capMat = new THREE.MeshStandardMaterial({ color: 0x565c63, roughness: 0.7, metalness: 0.22 });
    var walls = [
      { x: 0, z: -47.5, w: 97, d: 1.5 },
      { x: 0, z: 47.5, w: 97, d: 1.5 },
      { x: -47.5, z: 0, w: 1.5, d: 97 },
      { x: 47.5, z: 0, w: 1.5, d: 97 }
    ];
    walls.forEach(function (w) {
      var horiz = w.w > w.d;
      var wm = wallMat.clone();
      wm.map = concreteTex.clone();
      wm.map.repeat.set(horiz ? w.w / 4 : 1, 2);
      wm.map.needsUpdate = true;
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, 3.0, w.d), wm);
      mesh.position.set(w.x, 1.5, w.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      // 顶部压顶横梁（深色金属压顶，取代刺眼红色危险条）
      var cap = new THREE.Mesh(
        new THREE.BoxGeometry(horiz ? w.w : w.w + 0.12, 0.14, horiz ? w.d + 0.12 : w.d),
        capMat
      );
      cap.position.set(w.x, 3.07, w.z);
      cap.castShadow = true; cap.receiveShadow = true;
      scene.add(cap);
      // 顶部铁丝网
      var fence = new THREE.Mesh(
        new THREE.PlaneGeometry(horiz ? w.w : w.d, 1.8),
        new THREE.MeshStandardMaterial({ map: getFenceTexture(horiz ? w.w : w.d), transparent: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.5, alphaTest: 0.35 })
      );
      if (!horiz) fence.rotation.y = Math.PI / 2;
      fence.position.set(w.x, 3.9, w.z);
      scene.add(fence);
    });

    // ---- BOXES：按尺寸分类，渲染写实掩体（保持碰撞体积不变）----
    var crateTex = getCrateTexture();
    var sandbagTex = getSandbagTexture();
    var metalTex = getMetalTexture();
    var containerColors = [0xb5533f, 0x2f5f86, 0x3f7a52, 0xc79a3a, 0x7a5090];

    BOXES.forEach(function (b, i) {
      if (b.w >= 7) {
        buildContainer(b, containerColors[i % containerColors.length]);
      } else if (b.h <= 1.4) {
        buildSandbagBarrier(b, sandbagTex);
      } else if (b.h >= 3.5) {
        buildPillar(b, concreteTex);
      } else if (b.w <= 2.2 && b.d <= 2.2) {
        buildCrate(b, crateTex);
      } else {
        buildConcreteBlock(b, i);
      }
    });

    buildProps(metalTex);
    buildWatchtowers();
    buildScenery();
  }

  // 集装箱：波纹钢箱体 + 角件 + 门把手
  function buildContainer(b, color) {
    var tex = getContainerTexture(color).clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(b.w / 6)), 1);
    tex.needsUpdate = true;
    // 颜色已经烤进贴图了，材质 color 必须留白。原来这里又乘一遍 color，
    // 等于把箱体颜色平方，配合上面那个线性/sRGB 的错，才有那种发闷的塑料色。
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.35 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // 角件（8个黑色铸钢角块）
    // 0x1a1a1a + metalness 0.4 等于纯黑：角件在画面里直接消失，
    // 集装箱四个角变成没有收口的锐边。真实角件是风化的铸钢（表面主要是氧化层，
    // 属电介质），所以抬 albedo、降金属度，让这八个块读得出体积。
    var cornerMat = new THREE.MeshStandardMaterial({ color: 0x33322f, roughness: 0.75, metalness: 0.2 });
    var hw = b.w / 2, hh = b.h / 2, hd = b.d / 2, cs = 0.28;
    for (var sx = -1; sx <= 1; sx += 2)
      for (var sy = -1; sy <= 1; sy += 2)
        for (var sz = -1; sz <= 1; sz += 2) {
          var corner = new THREE.Mesh(new THREE.BoxGeometry(cs, cs, cs), cornerMat);
          corner.position.set(b.x + sx * (hw - cs / 2), b.h / 2 + sy * (hh - cs / 2), b.z + sz * (hd - cs / 2));
          scene.add(corner);
        }
    // 顶盖。原来是 color: color，也就是「箱体的纯色、一点污渍都没有」，
    // 俯视时那块干净的纯色板比箱身还抢眼。第一版乘 0.55 压成阴面，但那是在
    // 箱体贴图还被重复上色（偏暗）的时候定的；贴图色彩空间修好之后，0.55
    // 在俯视图里就变成了一块块近黑的板（截图 72，蓝箱顶 0x2f5f86*0.55=0x1a3449）。
    // 改成往灰尘色插值而不是整体压暗：集装箱顶常年积灰，是**褪色**不是变黑，
    // 亮度基本保住、饱和度掉下来，俯视时既不抢眼也不成黑洞。
    var top = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.02, 0.06, b.d + 0.02),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0x8e8b80), 0.42),
        roughness: 0.9, metalness: 0.16
      }));
    top.position.set(b.x, b.h, b.z);
    top.receiveShadow = true;
    scene.add(top);
  }

  // 沙袋矮墙
  function buildSandbagBarrier(b, tex) {
    var t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(Math.max(b.w, b.d) / 2)), 1);
    t.needsUpdate = true;
    var mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // 顶部起伏的沙袋（用几个胶囊/圆角块）
    var bagMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    var along = b.w >= b.d;
    var n = Math.max(2, Math.round((along ? b.w : b.d) / 0.8));
    for (var k = 0; k < n; k++) {
      var f = (k + 0.5) / n - 0.5;
      var bag = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), bagMat);
      bag.scale.set(1.2, 0.7, 1);
      bag.position.set(b.x + (along ? f * b.w : 0), b.h + 0.06, b.z + (along ? 0 : f * b.d));
      bag.castShadow = true;
      scene.add(bag);
    }
  }

  // 高立柱：混凝土柱 + 金属顶帽 + 底座
  function buildPillar(b, concreteTex) {
    var t = concreteTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); t.needsUpdate = true;
    var mat = new THREE.MeshStandardMaterial({ map: t, color: 0x9a9c98, roughness: 0.9, metalness: 0.05 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // 立柱顶帽。原来 0x3a4450 + metalness 0.5，俯视图里是一整块近黑的板
    // （2.3×20.3 的顶帽，一根就是 47 m²，画面里四大块黑斑就是它们，实测
     // rgb(30,49,74)——比 albedo 还暗，且被环境贴图的蓝天染成了藏青）。
    // 半金属（0.4~0.6）在物理上不存在，只会把漫反射按比例删掉；
    // 压顶是**涂装钢板**，金属度给 0.25、albedo 抬到 0x5d646c：
    // 仍明显比柱身混凝土（0x9a9c98）暗一档，压顶的收边关系保住，但不再是黑洞。
    var capMat = new THREE.MeshStandardMaterial({ color: 0x5d646c, roughness: 0.62, metalness: 0.25 });
    var cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.22, b.d + 0.3), capMat);
    cap.position.set(b.x, b.h + 0.1, b.z); cap.castShadow = true; scene.add(cap);
    var base = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.3, b.d + 0.4), capMat);
    base.position.set(b.x, 0.15, b.z); base.receiveShadow = true; scene.add(base);
  }

  // 木箱（含堆叠感的边缘线）
  function buildCrate(b, tex) {
    var t = tex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
    var mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // 混凝土防爆块贴图。三个变体（浇筑色差 + 脏污分布不同），24 个块才不至于像复制粘贴。
  // 512 尺寸、**repeat 保持 1:1**：BoxGeometry 六个面的 UV 都是 0..1，所以
  // 「一个面上只该出现一次」的细节（模板板缝、拉杆孔、顶沿流锈）不会被平铺切碎。
  // 原来这里是 concreteTex 按 w/2 × h/2 平铺，整面只有一层灰噪声——而这类块占了
  // 掩体总数的一半（47 个里 24 个，多为 4×3×4 和 3×3×3），全是同一片灰噪声，
  // 这就是全景截图里「一堆没贴图的程序员方块」的主要来源。
  function getBlockTexture(variant) {
    // 这三组色比「真实混凝土的反射率」暗一截，是**量出来的**，不是凭感觉调的。
    // 实测（同一批面、同一套灯光，只改 albedo）：渲染亮度 ≈ albedo_sRGB ^ 1.36
    //     #6b675f(107) → 0.353 | #565349(86) → 0.262 | #413f38(65) → 0.179
    // 第一版用的是照片级的水泥灰（#8e8b80 一档），渲出来块身亮度 0.472，
    // 而天空只有 0.466 —— 24 个掩体成了画面里最亮的东西，明度秩序整个反了，
    // 所以远看就是一堆白色泡沫箱子。按上面的幂律反解，乘 0.77 落到 0.33。
    // 教训：ACES + 2.45 强度的太阳会把中灰顶到近白，贴图的 albedo 必须
    // 明显低于实物的反射率，光靠肉眼看贴图本身是判断不出来的。
    var tones = [
      ['#6d6b63', '#5f5d55', '#7c7970'],
      ['#706e69', '#62605c', '#807e78'],
      ['#6a655c', '#5c5750', '#79746a']
    ][variant];
    return makeTex('blk_' + variant, 512, function (ctx, w, h) {
      ctx.fillStyle = tones[0]; ctx.fillRect(0, 0, w, h);
      // 浇筑批次色差：几块很淡的大色斑。没有这一层，整面就是一个死板的均匀灰
      for (var i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? tones[1] : tones[2];
        ctx.globalAlpha = 0.16 + Math.random() * 0.14;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h,
          w * (0.14 + Math.random() * 0.20), h * (0.10 + Math.random() * 0.18),
          Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 模板板缝。做成「暗线 + 紧贴下方一道亮边」才有凹进去的错觉，
      // 单画一条暗线只会像用马克笔描了一圈。
      function seam(x1, y1, x2, y2, a) {
        ctx.strokeStyle = 'rgba(48,46,42,' + a + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, y1 + 3); ctx.lineTo(x2, y2 + 3); ctx.stroke();
      }
      var m = w * 0.055;
      seam(m, m, w - m, m, 0.42);
      seam(m, h - m, w - m, h - m, 0.42);
      seam(m, h * 0.5, w - m, h * 0.5, 0.36);   // 上下两块模板的拼缝
      ctx.strokeStyle = 'rgba(48,46,42,0.34)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(m, h - m); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - m, m); ctx.lineTo(w - m, h - m); ctx.stroke();
      // 拉杆孔：浇筑后用砂浆封过，所以是「暗孔 + 一圈略亮的补痕」，不是纯黑点
      for (var cy = 0; cy < 2; cy++) for (var cx = 0; cx < 3; cx++) {
        var px = w * (0.22 + cx * 0.28), py = h * (0.27 + cy * 0.46);
        ctx.fillStyle = 'rgba(215,212,203,0.30)';
        ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(40,38,34,0.55)';
        ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
      }
      // 顶沿往下的流锈/雨痕。混凝土上最能读出「露天放了很多年」的一笔
      for (var s = 0; s < 14; s++) {
        var len = h * (0.15 + Math.random() * 0.50);
        var grd = ctx.createLinearGradient(0, 0, 0, len);
        grd.addColorStop(0, 'rgba(96,74,48,0.30)');
        grd.addColorStop(1, 'rgba(96,74,48,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(Math.random() * w, 0, 3 + Math.random() * 6, len);
      }
      // 底部泥线。块的「重量感」全靠这一笔压住：不脏底边的话，
      // 块看起来是浮在地面上的，而不是压在地上的。
      var dirt = ctx.createLinearGradient(0, h, 0, h * 0.66);
      dirt.addColorStop(0, 'rgba(52,45,34,0.55)');
      dirt.addColorStop(1, 'rgba(52,45,34,0)');
      ctx.fillStyle = dirt; ctx.fillRect(0, h * 0.66, w, h * 0.34);
      // 崩边：磕掉一小块，露出里面颜色更浅的骨料
      for (var k = 0; k < 5; k++) {
        ctx.fillStyle = 'rgba(226,222,210,0.5)';
        var ex = Math.random() < 0.5 ? Math.random() * w * 0.20 : w - Math.random() * w * 0.20;
        var ey = Math.random() < 0.5 ? Math.random() * h * 0.14 : h - Math.random() * h * 0.14;
        ctx.beginPath();
        for (var p = 0; p < 6; p++) {
          var a2 = p / 6 * Math.PI * 2, rr = 7 + Math.random() * 12;
          var qx = ex + Math.cos(a2) * rr, qy = ey + Math.sin(a2) * rr;
          if (p === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
        }
        ctx.closePath(); ctx.fill();
      }
      // 骨料颗粒：一层暗一层亮，只用暗的会把整面压灰
      speckle(ctx, w, h, 900, 0.03, 0.13, 2.6, function (a) { return 'rgba(30,28,24,' + a + ')'; });
      speckle(ctx, w, h, 400, 0.03, 0.12, 2.2, function (a) { return 'rgba(255,255,252,' + a + ')'; });
    });
  }

  // 防爆块共用的材质（24 个块共用，不要每块 new 一套）
  var BLK_MATS = null;
  function blockMats() {
    if (BLK_MATS) return BLK_MATS;
    BLK_MATS = {
      // 底座压暗、压顶提亮。一块灰立方体最缺的就是明度梯度，
      // 靠这两块就能让单个块自己有「下重上轻」的层次。
      // 三段的目标渲染亮度是定好的：底座 0.20 < 地面 0.28 < 块身 0.33 < 压顶 0.40 < 天空 0.47。
      // 底座必须比地面**更暗**，块和地才有接缝感；压顶必须比天空更暗，
      // 否则轮廓线在天际线上就断掉了。数值都按 albedo^1.36 反解（见 getBlockTexture）。
      foot: new THREE.MeshStandardMaterial({ color: 0x47443f, roughness: 0.95, metalness: 0.02 }),
      cap: new THREE.MeshStandardMaterial({ color: 0x7c7870, roughness: 0.88, metalness: 0.03 }),
      // 危险条。原来是 0xe0a020——在 ACES + 曝光 1.02 下几乎是自发光的荧光黄，
      // 两张全景截图里这条边比块本身还抢眼。露天几年的警示漆是脏掉的土黄。
      // 0x9b7828 还是亮到 0.454（和天空齐平），再压一档到 0.36：
      // 比块身（0.33）高一点点就够「醒目」了，警示条不该抢过天空。
      haz: new THREE.MeshStandardMaterial({ color: 0x836522, roughness: 0.82, metalness: 0.04 }),
      body: [null, null, null]
    };
    return BLK_MATS;
  }

  // 混凝土防爆块。原来是「一个 Box + 顶上一块比本体更大的亮黄板」，24 个一模一样。
  // 现在按真实浇筑件分三段：**底座（满宽·暗） → 块身（收窄·带贴图） → 压顶（略窄·亮）**。
  // 宽—窄—宽的侧影本身就读得出是个铸件，两道台阶各自能啃住一条高光。
  // 三段高度加起来正好 b.h、水平方向都不超出 b.w/b.d —— 碰撞盒（BOXES）一点没动。
  function buildConcreteBlock(b, i) {
    var M = blockMats();
    // 变体由**位置**决定而不是 Math.random：同一个块每次进游戏长得一样，
    // 否则重连一次整片掩体的花纹全变，看着像在闪。
    var v = Math.abs(Math.round(b.x * 3 + b.z * 7) + i) % 3;
    if (!M.body[v]) {
      M.body[v] = new THREE.MeshStandardMaterial({ map: getBlockTexture(v), roughness: 0.93, metalness: 0.03 });
    }
    var footH = Math.min(0.24, b.h * 0.10);
    var capH = Math.min(0.18, b.h * 0.075);
    var bodyH = b.h - footH - capH;
    var inset = 0.15;                        // 块身相对底座每边收进 7.5cm

    var foot = new THREE.Mesh(new THREE.BoxGeometry(b.w, footH, b.d), M.foot);
    foot.position.set(b.x, footH / 2, b.z);
    foot.castShadow = true; foot.receiveShadow = true; scene.add(foot);

    var body = new THREE.Mesh(new THREE.BoxGeometry(b.w - inset, bodyH, b.d - inset), M.body[v]);
    body.position.set(b.x, footH + bodyH / 2, b.z);
    // 立方体块（w==d）可以整 90° 转：AABB 完全不变，但换了个面朝外，
    // 24 个块的重复感就散开了。非立方体绝对不能转——90° 会把 w 和 d 调包，
    // 视觉体积就和碰撞盒错开了。
    if (Math.abs(b.w - b.d) < 1e-6) body.rotation.y = (i % 4) * Math.PI / 2;
    body.castShadow = true; body.receiveShadow = true; scene.add(body);

    var cap = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.04, capH, b.d - 0.04), M.cap);
    cap.position.set(b.x, b.h - capH / 2, b.z);
    cap.castShadow = true; cap.receiveShadow = true; scene.add(cap);

    // 危险条只刷三分之一的块，而且刷在压顶的**侧面**。
    // 原来是在 y = b.h + 0.03 摆一块比本体还宽的板，等于给每个块戴了顶发光帽子。
    // 现在这条线在压顶内部，只凸出 5mm，是「漆」而不是「另一个物体」。
    if (v === 0) {
      var band = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.03, 0.055, b.d - 0.03), M.haz);
      band.position.set(b.x, b.h - capH + 0.045, b.z);
      scene.add(band);
    }
  }

  // 铁丝网贴图
  function getFenceTexture(width) {
    return makeTex('fence_' + Math.round(width), 256, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(190,196,205,0.85)';
      ctx.lineWidth = 2.4;
      var step = 22;
      for (var x = -h; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + h, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      // 顶部刺铁丝
      ctx.strokeStyle = 'rgba(210,215,222,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(w, 6); ctx.stroke();
    }, { repeat: [Math.max(1, Math.round(width / 4)), 1] });
  }

  // 道具落点避让：把写死的 (x,z) 推到最近的掩体外面。
  // 道具位置和 BOXES 都是手写常量，两张表各改各的，迟早会撞——实测就撞了 4 处：
  // (-5,12) 和 (-3,12) 两个油桶整只埋在 (0,12) 那道 12m 长的沙袋墙里，
  // 只剩 5cm 桶盖露在墙顶（截图 92 里集装箱式掩体顶上那个深色椭圆就是它）；
  // (-18,-5) 的油桶埋在 (-18,0) 那道 4m 高的长墙里，整只看不见；
  // (24,-3) 的轮胎堆和 (25,-5) 的木箱擦边。
  // 与其手改坐标（下次动 BOXES 又要重撞一遍），不如落点时算一次：
  // 沿「盒心 → 道具」方向推到盒子外缘 + r + 0.12 的间隙。用 Chebyshev 意义下
  // 溢出最少的那个轴推，位移最小，构图基本不变。
  function freeSpot(x, z, r) {
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < BOXES.length; i++) {
        var b = BOXES[i];
        var hx = b.w / 2 + r + 0.12, hz = b.d / 2 + r + 0.12;
        var dx = x - b.x, dz = z - b.z;
        if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
        // 推哪个轴：看哪个方向离出界更近
        if (hx - Math.abs(dx) <= hz - Math.abs(dz)) x = b.x + (dx >= 0 ? hx : -hx);
        else z = b.z + (dz >= 0 ? hz : -hz);
        moved = true;
      }
      if (!moved) break;
    }
    return [x, z];
  }

  // 场景道具：油桶、轮胎堆、木托盘、弹药箱、混凝土残块
  // 油桶（红/蓝/黄，带箍与顶盖）
  // metalness 0.55 → 0.20：油桶是**喷漆**的铁皮，漆是电介质，金属度就该接近 0。
  // 给 0.55 的后果是漫反射被砍掉一半多，四种漆色全部压暗压脏，红桶蓝桶在
  // 场地里读成两块深色斑（实测 lum 0.328 / 0.394，本该在 0.5 一带）。
  // 只有磨掉漆的箍才配得上高金属度。
  function buildProps(metalTex) {
    var drumColors = [0xb63a2f, 0x2f6f9a, 0xc7a53a, 0x3a7a4a];
    [[-5, 12, 0], [5, -15, 1], [-18, -5, 2], [15, 5, 0], [-30, 12, 1], [30, -12, 3], [-12, 30, 0], [12, -30, 2], [-3, 12, 3], [22, 3, 1]].forEach(function (p0) {
      var fs = freeSpot(p0[0], p0[1], 0.47);
      var p = [fs[0], fs[1], p0[2]];
      var col = drumColors[p[2]];
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.15, 16),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.52, metalness: 0.20 }));
      body.position.set(p[0], 0.58, p[1]);
      body.castShadow = true; body.receiveShadow = true; scene.add(body);
      var ringMat = new THREE.MeshStandardMaterial({ color: 0x2e2c29, roughness: 0.62, metalness: 0.25 });
      [-0.32, 0, 0.32].forEach(function (yy) {
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 6, 20), ringMat);
        ring.rotation.x = Math.PI / 2; ring.position.set(p[0], 0.58 + yy, p[1]); scene.add(ring);
      });
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 16), ringMat);
      lid.position.set(p[0], 1.16, p[1]); scene.add(lid);
    });

    // 轮胎堆
    // 轮胎堆。橡胶的金属度本来就该接近 0（这里 0.05 是对的），问题在 albedo：
    // 0x18181a 实测亮度只有 0.09，俯视时十几堆轮胎全是一团黑饼，看不出是轮胎。
    // 真实轮胎反射率确实只有 4~5%，但在 ACES 下暗部被压得更平，
    // 抬到 0x2a2a2d 才既保住「场上最暗的东西」的地位，又读得出圆环的体积。
    var tireMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.9, metalness: 0.05 });
    [[-9, 9], [10, 10], [-20, 18], [24, -3]].forEach(function (p0) {
      var p = freeSpot(p0[0], p0[1], 0.77);   // 0.55 环半径 + 0.22 管半径
      for (var k = 0; k < 3; k++) {
        var tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 10, 20), tireMat);
        tire.rotation.x = Math.PI / 2;
        tire.position.set(p[0] + (k % 2) * 0.1, 0.24 + k * 0.42, p[1]);
        tire.castShadow = true; tire.receiveShadow = true;
        scene.add(tire);
      }
    });

    // 木托盘
    var palletMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), color: 0xb98a52, roughness: 0.85 });
    [[-16, 22, 0.3], [17, 19, -0.6], [-24, -22, 1.2]].forEach(function (p0) {
      var fs = freeSpot(p0[0], p0[1], 1.0);   // 托盘 1.4×1.4，外接半径 ~1.0
      var p = [fs[0], fs[1], p0[2]];
      var pallet = new THREE.Group();
      for (var s = 0; s < 4; s++) {
        var slat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.18), palletMat);
        slat.position.set(0, 0.16, -0.6 + s * 0.4);
        pallet.add(slat);
      }
      var base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), palletMat);
      base.position.y = 0.06; pallet.add(base);
      pallet.position.set(p[0], 0, p[1]); pallet.rotation.y = p[2];
      pallet.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      scene.add(pallet);
    });

    // 混凝土残块 / 路障
    var rubbleMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(), color: 0x9a9c98, roughness: 0.95 });
    [[-2, -18], [3, 22], [-26, 2], [26, 14], [14, -24]].forEach(function (p0) {
      var p = freeSpot(p0[0], p0[1], 0.8);
      var chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.3), rubbleMat);
      chunk.position.set(p[0], 0.35, p[1]);
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
      chunk.castShadow = true; chunk.receiveShadow = true;
      scene.add(chunk);
    });
  }

  // 瞭望塔：桁架腿 + 平台 + 栏杆 + 斜顶 + 探照灯
  function buildWatchtowers() {
    // 瞭望塔三件套也是半金属：桁架腿是刷漆型钢、平台是花纹钢板、顶是涂装铁皮，
    // 三者都该按「漆面电介质」给低金属度。塔在场地四角、逆光居多，
    // 金属度 0.35~0.4 直接让它们变成四团剪影，塔身桁架的结构完全读不出来。
    var legMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.72, metalness: 0.18 });
    var platMat = new THREE.MeshStandardMaterial({ map: getMetalTexture(), color: 0x6a7076, roughness: 0.62, metalness: 0.22 });
    var roofMat = new THREE.MeshStandardMaterial({ color: 0x54606c, roughness: 0.6, metalness: 0.18 });
    [[-52, -52], [52, -52], [-52, 52], [52, 52]].forEach(function (p) {
      var g = new THREE.Group();
      var H = 6.6;
      [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(function (o) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, H, 8), legMat);
        leg.position.set(o[0], H / 2, o[1]); leg.castShadow = true; g.add(leg);
      });
      // 交叉支撑
      [[-1.4, 0, -1.4, 0], [1.4, 0, 1.4, 0]].forEach(function () {});
      var brace1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.0, 0.08), legMat);
      brace1.position.set(0, 2.4, -1.4); brace1.rotation.x = 0; brace1.rotation.z = 0.6; g.add(brace1);
      var brace2 = brace1.clone(); brace2.rotation.z = -0.6; brace2.position.z = 1.4; g.add(brace2);
      var platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), platMat);
      platform.position.set(0, H, 0); platform.castShadow = true; platform.receiveShadow = true; g.add(platform);
      // 栏杆
      var railMat = legMat;
      for (var s = 0; s < 4; s++) {
        var rail = new THREE.Mesh(new THREE.BoxGeometry(s % 2 ? 0.08 : 4, 0.9, s % 2 ? 4 : 0.08), railMat);
        var rx = s === 0 ? 0 : (s === 1 ? 1.95 : (s === 2 ? 0 : -1.95));
        var rz = s === 0 ? 1.95 : (s === 1 ? 0 : (s === 2 ? -1.95 : 0));
        rail.position.set(rx, H + 0.65, rz); g.add(rail);
      }
      var roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.8, 4), roofMat);
      roof.position.set(0, H + 1.9, 0); roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      // 探照灯
      var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.55, metalness: 0.2 }));
      lamp.rotation.z = Math.PI / 2; lamp.position.set(1.6, H + 0.8, 1.6); g.add(lamp);
      var lampGlow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16),
        new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdd88, emissiveIntensity: 1.4 }));
      lampGlow.position.set(1.38, H + 0.8, 1.6); lampGlow.rotation.y = -Math.PI / 2 + 0.6; g.add(lampGlow);

      // 让塔朝向场地中心
      g.position.set(p[0], 0, p[1]);
      g.rotation.y = Math.atan2(-p[0], -p[1]);
      scene.add(g);
    });
  }

  // 远景：树林 + 远山 + 停机坪外机库轮廓
  function buildScenery() {
    // 树木（三层锥形 + 颜色抖动）
    // 原来叶色是 HSL(0.32~0.44, 0.45, 0.32)。色相 0.44 已经拐到青绿了，
    // 加上 0.45 的饱和度和 2.45 强度的太阳，40 棵树在俯视图里是一圈发光的薄荷色锥子。
    // 针叶林的实际色相在 0.22~0.31（黄绿到绿），饱和度低、明度更低；
    // 把三个分量全部往下压，树才退回背景里，不再和场地抢注意力。
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 });
    var treeSpots = [];
    for (var a = 0; a < 40; a++) {
      var ang = (a / 40) * Math.PI * 2;
      var rad = 60 + (a % 3) * 5 + Math.random() * 6;
      treeSpots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    treeSpots.forEach(function (p) {
      // 整棵树的尺度抖动。原来 40 棵一样高，一圈下来像栅栏；
      // 高度差是远景里最容易读到的信息，比叶子形状重要得多。
      var sc = 0.78 + Math.random() * 0.55;
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sc, 0.34 * sc, 3.0 * sc, 6), trunkMat);
      trunk.position.set(p[0], 1.5 * sc, p[1]); trunk.castShadow = true; scene.add(trunk);
      var leafMat = new THREE.MeshStandardMaterial({
        // 第四个参数 THREE.SRGBColorSpace 不能省。Color.setHSL 的默认色彩空间是
        // **working space**（线性），不是 sRGB —— 也就是说 l=0.13 被当成线性亮度，
        // 换算回 sRGB 是 0.40，比想要的亮了三倍。上一版已经把色相饱和度都压下来了，
        // 树还是一圈发亮的薄荷色锥子，原因就在这里，不在 HSL 的取值上。
        // （注意本文件还有两处 setHSL 也是默认色彩空间：人物 accent 和碎石，
        //   那两处是按当时看到的效果调的，不在本次改动范围内。）
        color: new THREE.Color().setHSL(0.22 + Math.random() * 0.09, 0.26 + Math.random() * 0.16, 0.14 + Math.random() * 0.06, THREE.SRGBColorSpace),
        roughness: 0.9,
        // 七棱锥不关插值就是个光滑的圆锥鼓包；关掉之后每个侧面各吃一档亮度，
        // 远处才看得出是层叠的针叶而不是一个绿色水滴。
        flatShading: true
      });
      // 三层而不是两层：最下一层最宽、往上收，侧影有个明显的收分，
      // 单靠两层锥体上下一样宽，看着就是两个叠起来的甜筒。
      [[1.55, 3.0, 3.9], [1.20, 2.5, 5.3], [0.78, 1.9, 6.5]].forEach(function (t, ti) {
        var cone = new THREE.Mesh(
          new THREE.ConeGeometry((t[0] + (ti === 0 ? Math.random() * 0.35 : 0)) * sc, t[1] * sc, 7), leafMat);
        cone.position.set(p[0], t[2] * sc, p[1]);
        cone.rotation.y = Math.random() * Math.PI;
        cone.castShadow = true; scene.add(cone);
      });
    });

    // 远山（雾中低多边形，纯背景）
    // 原来是 22 个同一材质的锥体撒在 d=200~270 的一圈上，实测渲染亮度 0.739 ——
    // 比天空（0.466）还亮，而且和地平线雾色（#bdd2e2 过 ACES 后约 0.74）完全一样，
    // 所以它们既压不住天际线、又只剩一圈硬边的浅色三角形，读不出是山。
    // 两处改动：
    //   1) 分**三层**，近的一层压得最暗。雾的 near 80 / far 340 会自动把远层洗白，
    //      于是「近暗远淡」的空气透视是雾帮着做出来的，不用手调每座山。
    //   2) flatShading —— 五棱锥的侧面本来法线是插值的，看着是个圆滑鼓包；
    //      关掉插值之后每个面各自吃一个亮度，山脊线才出来。
    var hillBands = [
      { d: [150, 40], h: [26, 30], col: 0x39424e, n: 9 },   // 近：最暗，负责压住天际线
      { d: [215, 55], h: [34, 40], col: 0x47535f, n: 9 },
      { d: [285, 60], h: [46, 46], col: 0x57646f, n: 8 }    // 远：本身就被雾洗掉大半
    ];
    hillBands.forEach(function (band, bi) {
      var mat = new THREE.MeshStandardMaterial({
        color: band.col, roughness: 1, metalness: 0, fog: true, flatShading: true
      });
      for (var i = 0; i < band.n; i++) {
        // 每层错开相位，三层的山峰才不会在同一根方位角上叠成一个尖
        var ang2 = ((i + bi * 0.37) / band.n) * Math.PI * 2 + 0.3;
        var d = band.d[0] + Math.random() * band.d[1];
        var hgt = band.h[0] + Math.random() * band.h[1];
        var hill = new THREE.Mesh(new THREE.ConeGeometry(46 + Math.random() * 46, hgt, 5), mat);
        hill.position.set(Math.cos(ang2) * d, hgt / 2 - 8, Math.sin(ang2) * d);
        hill.rotation.y = Math.random() * Math.PI;
        scene.add(hill);
      }
    });

    // 场外机库（矩形轮廓，营造纵深）
    var hangarMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.8, metalness: 0.2 });
    var roofMat2 = new THREE.MeshStandardMaterial({ color: 0x3a444e, roughness: 0.7, metalness: 0.25 });
    [[-70, 30, 0.4], [72, -26, -0.5], [-30, -72, 0.1]].forEach(function (p) {
      var body = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 12), hangarMat);
      body.position.set(p[0], 4.5, p[1]); body.rotation.y = p[2];
      body.castShadow = true; scene.add(body);
      var roof = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 18.2, 16, 1, false, 0, Math.PI), roofMat2);
      roof.rotation.z = Math.PI / 2; roof.rotation.y = p[2];
      roof.position.set(p[0], 9, p[1]); scene.add(roof);
    });
  }

  // ----------------------------------------------------------
  // 模型辅助
  // ----------------------------------------------------------
  function boxMesh(w, h, d, color, opts) {
    opts = opts || {};
    return new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: color,
        roughness: opts.roughness !== undefined ? opts.roughness : 0.55,
        metalness: opts.metalness !== undefined ? opts.metalness : 0.25
      })
    );
  }

  function cylinderMesh(rTop, rBottom, len, color, opts, segments) {
    opts = opts || {};
    return new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBottom, len, segments || 12),
      new THREE.MeshStandardMaterial({
        color: color,
        roughness: opts.roughness !== undefined ? opts.roughness : 0.45,
        metalness: opts.metalness !== undefined ? opts.metalness : 0.55
      })
    );
  }

  // 轴线沿 Z 方向的圆柱（默认 CylinderGeometry 沿 Y）
  function cylinderZ(rTop, rBottom, len, color, opts, segments) {
    var mesh = cylinderMesh(rTop, rBottom, len, color, opts, segments);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  // ==========================================================
  // 武器工厂：枪械 / 近战（第一人称与远端玩家共用）
  // 所有枪口朝 -Z，握把朝 -Y。gun.userData.muzzle 为枪口锚点。
  // ==========================================================
  var WMAT = null;
  function weaponMats() {
    if (WMAT) return WMAT;
    WMAT = {
      gunmetal: new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.36, metalness: 0.9, envMapIntensity: 1.2 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb2b9c1, roughness: 0.19, metalness: 0.96, envMapIntensity: 1.45 }),
      // 刀身专用：近镜面的金属在大块平面上会把暗环境反射成一片死黑，
      // 所以刃面用"拉丝钢"——粗糙度更高、金属度略低，才能真正显出形体。
      blade: new THREE.MeshStandardMaterial({ color: 0xc6ccd4, roughness: 0.28, metalness: 0.72, envMapIntensity: 1.25 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.28, metalness: 0.88, envMapIntensity: 1.15 }),
      // 细节金属：比主体略亮，用于拉机柄/保险/卡榫等小件，让轮廓有层次
      trimSteel: new THREE.MeshStandardMaterial({ color: 0x5b626c, roughness: 0.3, metalness: 0.92, envMapIntensity: 1.3 }),
      polymer: new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.68, metalness: 0.06, envMapIntensity: 0.55 }),
      polymerLt: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.5 }),
      polymerTan: new THREE.MeshStandardMaterial({ color: 0x8a7148, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.55 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x7d5029, roughness: 0.5, metalness: 0.04, envMapIntensity: 0.7 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0x53331c, roughness: 0.48, metalness: 0.04, envMapIntensity: 0.7 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xcaa24a, roughness: 0.28, metalness: 0.88, envMapIntensity: 1.3 }),
      // 霰弹壳的塑料弹壳：换弹动画里唯一会露出来的"耗材"，红色是为了在
      // 一堆黑铁灰木里一眼能看见它在动（真弹也确实是红/绿塑料壳）。
      shellRed: new THREE.MeshStandardMaterial({ color: 0x9e2b22, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.6 }),
      greenPoly: new THREE.MeshStandardMaterial({ color: 0x36452c, roughness: 0.58, metalness: 0.08, envMapIntensity: 0.6 }),
      greenPolyLt: new THREE.MeshStandardMaterial({ color: 0x44543a, roughness: 0.62, metalness: 0.07, envMapIntensity: 0.55 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.78, metalness: 0.04, envMapIntensity: 0.4 }),
      glovePad: new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.4 }),
      lensRed: new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff2200, emissiveIntensity: 1.6, roughness: 0.2 }),
      lensBlue: new THREE.MeshStandardMaterial({ color: 0x3fd0ff, emissive: 0x1488bb, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.3 })
    };
    return WMAT;
  }

  // ==========================================================
  // 精细几何工具
  // 圆角盒是关键：硬边盒在任何光照下都只有一片死板的平光，
  // 倒角边缘能抓到一条高光，武器立刻有"加工过"的质感。
  // ==========================================================
  var GEO_CACHE = {};
  function roundRectShape(w, h, r) {
    r = Math.min(r, Math.min(w, h) * 0.49);
    var hw = w / 2 - r, hh = h / 2 - r, s = new THREE.Shape();
    s.moveTo(-hw - r, -hh);
    s.lineTo(-hw - r, hh);
    s.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
    s.lineTo(hw, hh + r);
    s.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
    s.lineTo(hw + r, -hh);
    s.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
    s.lineTo(-hw, -hh - r);
    s.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);
    return s;
  }
  // 圆角盒几何，两端带倒角。按「尺寸+轴向」缓存，避免每把枪重复生成。
  // 轴向旋转烘进几何体而不是放在 mesh.rotation 上——否则调用方一句
  // `box.rotation.x = 0.3`（握把前倾）就会把轴向映射整个覆盖掉，
  // 尺寸悄悄换到别的轴上，模型看着"差不多"但其实是错的。
  function rBoxGeo(w, h, d, r, axis) {
    var key = (axis || 'z') + w.toFixed(3) + '_' + h.toFixed(3) + '_' + d.toFixed(3) + '_' + r.toFixed(3);
    if (GEO_CACHE[key]) return GEO_CACHE[key];
    var a = w, b = h, c = d;                  // 挤出前：a×b 截面，沿局部 Z 挤出 c
    if (axis === 'y') { b = d; c = h; }       // 竖直：截面 w×d，挤出高度 h
    else if (axis === 'x') { a = d; c = w; }  // 横向：截面 d×h，挤出宽度 w
    var bev = Math.min(0.007, c * 0.22, a * 0.22, b * 0.22);
    var depth = Math.max(0.001, c - bev * 2);
    var geo = new THREE.ExtrudeGeometry(roundRectShape(a, b, r), {
      depth: depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
      bevelOffset: 0, bevelSegments: 1, curveSegments: 3
    });
    geo.translate(0, 0, -depth / 2);
    if (axis === 'y') geo.rotateX(-Math.PI / 2);
    else if (axis === 'x') geo.rotateY(Math.PI / 2);
    geo.computeVertexNormals();
    GEO_CACHE[key] = geo;
    return geo;
  }
  // axis 指定长轴方向：'z'（默认，枪管方向）/ 'y'（竖直，弹匣握把）/ 'x'（横向）
  // 返回的 mesh 没有自带旋转，调用方可以放心地再叠加倾角。
  function rBox(w, h, d, r, mat, x, y, z, axis) {
    var m = new THREE.Mesh(rBoxGeo(w, h, d, r, axis), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }

  function mBox(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }
  function mCylZ(rT, rB, len, mat, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, len, seg || 24), mat);
    m.rotation.x = -Math.PI / 2; m.castShadow = true;
    return m;
  }
  function mCylY(rT, rB, len, mat, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, len, seg || 24), mat);
    m.castShadow = true;
    return m;
  }
  // 圆环：TorusGeometry 天然位于 XY 平面（孔沿 Z），适合枪管箍/镜筒环
  function ringZ(r, tube, mat, x, y, z, seg) {
    var m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg || 20), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }
  // 竖立的环（孔沿 X）：扳机护圈、提把等从侧面看是一个立起的圈。
  // 旧代码用 rotation.x 把圈压成了水平薄片，从侧面只剩一团黑影。
  function loopX(r, tube, mat, x, y, z, seg) {
    var m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg || 20), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }
  // 沿 Z 排布的细密纹路（防滑纹、散热槽、弹匣筋）
  function addRibs(g, n, mat, x, y, z0, step, w, h, d) {
    for (var i = 0; i < n; i++) g.add(mBox(w, h, d, mat, x, y, z0 + i * step));
  }
  // 可单独动画的零件子组（弹匣、拉机柄、泵、套筒）。换弹动画要让这些零件相对枪身动，
  // 而它们原来都是直接 g.add 到枪身上的——散在一堆 mesh 里就没法整体位移。
  // 组的原点默认在枪身原点，所以原有的零件坐标一个字都不用改；
  // 需要绕铰点转的（比如泵、套筒）也照样能用，位移动画不吃原点位置。
  function part(g, key) {
    var p = new THREE.Group();
    g.add(p);
    g.userData[key] = p;
    return p;
  }
  // 换弹动画要知道弹匣口在哪：第三人称的左手会伸到这个点上去插弹匣。
  function anchor(g, key, x, y, z) {
    var o = new THREE.Object3D();
    o.position.set(x, y, z);
    g.add(o);
    g.userData[key] = o;
    return o;
  }
  // 螺钉/铆钉
  function addScrew(g, mat, x, y, z, r) {
    var s = mCylY(r, r, r * 0.5, mat, 10);
    s.rotation.z = Math.PI / 2; s.position.set(x, y, z);
    g.add(s);
  }
  // 弯弹匣：沿圆弧分段，段与段首尾相接不留缝
  function addCurvedMag(g, mat, ox, oy, oz, n, segH, w, d, dA) {
    var py = oy, pz = oz;
    for (var i = 0; i < n; i++) {
      var a = dA * (i + 0.5);
      var ca = Math.cos(a), sa = Math.sin(a);
      var seg = rBox(w, segH * 1.08, d, 0.012, mat, ox, py - ca * segH / 2, pz + sa * segH / 2, 'y');
      seg.rotation.x = -a;
      g.add(seg);
      py -= ca * segH; pz += sa * segH;
    }
    return [py, pz];
  }
  // 两脚架：从一个铰接点向下张开，脚尖着地——必须共点，否则就是两根悬空的棍子
  // 两脚架：两条腿从同一个铰接点向下外张，脚垫着地。
  // 腿心必须沿「从铰点朝下」的方向偏移半个腿长；符号搞反就会做成上宽下窄的倒 V，
  // 而且脚垫会甩到腿的末端之外去（AABB 检测抓不到这种斜向脱节）。
  function addBipod(g, mat, x, y, z, legLen, spread, tilt) {
    var pin = mCylY(0.013, 0.013, 0.044, mat, 14);
    pin.rotation.z = Math.PI / 2; pin.position.set(x, y, z); g.add(pin);
    var cs = Math.cos(spread);
    [-1, 1].forEach(function (s) {
      var dx = s * Math.sin(spread), dy = -cs * Math.cos(tilt), dz = cs * Math.sin(tilt);
      var leg = mCylY(0.0135, 0.0100, legLen, mat, 12);
      leg.rotation.z = s * spread;
      leg.rotation.x = -tilt;
      leg.position.set(x + dx * legLen / 2, y + dy * legLen / 2, z + dz * legLen / 2);
      g.add(leg);
      var ex = x + dx * legLen, ey = y + dy * legLen, ez = z + dz * legLen;
      // 腿上的调节套 + 触地的脚垫
      var collar = mCylY(0.015, 0.015, 0.020, mat, 12);
      collar.rotation.z = s * spread; collar.rotation.x = -tilt;
      collar.position.set(x + dx * legLen * 0.62, y + dy * legLen * 0.62, z + dz * legLen * 0.62);
      g.add(collar);
      var foot = rBox(0.030, 0.011, 0.046, 0.005, mat, ex, ey + 0.004, ez);
      foot.rotation.z = s * spread * 0.4; g.add(foot);
    });
  }


  // 戴手套的手（用于第一人称）
  function makeGlovedHand() {
    var M = weaponMats();
    var hand = new THREE.Group();
    var palm = mBox(0.09, 0.05, 0.10, M.glove, 0, 0, 0);
    hand.add(palm);
    for (var f = 0; f < 4; f++) {
      var fin = mBox(0.019, 0.028, 0.075, M.glove, -0.03 + f * 0.02, -0.005, -0.08);
      fin.rotation.x = -0.5;
      hand.add(fin);
      var pad = mBox(0.02, 0.012, 0.03, M.glovePad, -0.03 + f * 0.02, 0.02, -0.02);
      hand.add(pad);
    }
    var thumb = mBox(0.022, 0.026, 0.06, M.glove, 0.05, 0.005, -0.02);
    thumb.rotation.z = -0.7; thumb.rotation.x = -0.3;
    hand.add(thumb);
    var cuff = mBox(0.10, 0.07, 0.06, M.glovePad, 0, -0.005, 0.07);
    hand.add(cuff);
    return hand;
  }

  function addHands(group, rightPos, leftPos, opts) {
    opts = opts || {};
    var rh = makeGlovedHand();
    rh.position.set(rightPos[0], rightPos[1], rightPos[2]);
    if (opts.rRotX) rh.rotation.x = opts.rRotX;
    group.add(rh);
    // 记下手的引用和它的"本位"：第一人称的手是长在枪身上的固定件，
    // 换弹时左手要离开护木去抓弹匣，动完还得精确回到原位。
    group.userData.handR = rh;
    rh.userData.home = rh.position.clone();
    if (leftPos) {
      var lh = makeGlovedHand();
      lh.scale.x = -1;
      lh.position.set(leftPos[0], leftPos[1], leftPos[2]);
      if (opts.lRotX) lh.rotation.x = opts.lRotX;
      group.add(lh);
      group.userData.handL = lh;
      lh.userData.home = lh.position.clone();
      lh.userData.homeRotX = lh.rotation.x;
      // 手枪是单手持握（真枪第一人称也是这么摆的），但换弹必须两只手。
      // 所以给它挂一只**平时藏着**的支撑手，只在换弹动画里露出来。
      if (opts.lHidden) { lh.visible = false; lh.userData.hideIdle = true; }
    }
  }

  // -------------------- 手枪（Glock 风格）--------------------
  // 尺寸基准：其它枪都是实物的 1.1~1.35 倍（第一人称视角的常规夸张），
  // 这把原来做到了 1.9 倍，摆在同一套武器里就显得像玩具。全枪按实物 1.27 倍重做，
  // 长高比 1.49 ≈ 真 Glock 的 1.48。
  function buildPistol(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 套筒整体进 charge 组：换弹结束要放套筒（往后一点再"啪"地弹回），
    // 所以套筒上的纹路、抛壳口、膛口、准星都得跟着一起走。
    var pSlide = part(g, 'charge');
    // 套筒：真枪套筒的长高比约 7:1，做成 4:1 就是一块黑砖——这里 250×30 ≈ 8:1。
    // 宽度比握把窄（真 Glock 套筒 25.5mm / 握把 30mm），侧面才有台阶感。
    pSlide.add(rBox(0.034, 0.030, 0.250, 0.009, M.gunmetal, 0, 0.040, -0.025));
    // 前后防滑纹：只在侧面凸出的细纹在顶光下读不出来——侧面本身没有明暗梯度，
    // 2mm 的凸起和平面收到的光完全一样。要让纹路比套筒**高**一点（1.5mm），
    // 把顶面的边缘啃出锯齿，才有一条真正会亮的棱；间距也要放粗到 11mm，
    // 7.3mm 间距在这个像素密度下会糊成一片。
    addRibs(pSlide, 5, M.trimSteel, 0, 0.040, 0.048, 0.011, 0.040, 0.033, 0.005);
    addRibs(pSlide, 3, M.trimSteel, 0, 0.040, -0.128, 0.011, 0.040, 0.033, 0.005);
    // 抛壳口（右侧深色凹口）
    pSlide.add(mBox(0.006, 0.022, 0.055, M.darkSteel, 0.0165, 0.046, -0.010));
    // 膛口：枪管藏在套筒里，只在正面露出一小截膛线内壁；探出一段圆柱就成了"消音器头"
    var bore = mCylZ(0.0105, 0.0105, 0.030, M.darkSteel, 16);
    bore.position.set(0, 0.040, -0.138); pSlide.add(bore);
    // 套筒座（集尘盖）+ 下挂导轨：两块要咬得够深，否则侧面看像一条悬空的窄片
    g.add(rBox(0.034, 0.026, 0.200, 0.007, M.polymer, 0, 0.013, -0.040));
    g.add(rBox(0.026, 0.016, 0.080, 0.004, M.polymer, 0, -0.004, -0.095));
    addRibs(g, 3, M.darkSteel, 0, -0.008, -0.120, 0.024, 0.028, 0.007, 0.005);
    // 扳机护圈：立起的环（孔沿 X），侧面能看到镂空
    g.add(loopX(0.024, 0.0075, M.polymer, 0, -0.018, 0.006, 22));
    g.add(mBox(0.010, 0.026, 0.011, M.trimSteel, 0, -0.018, -0.004));
    // 握把：与套筒座连续，后倾用负角（底端偏向枪尾）；正角会把握把朝枪口方向倒
    var grip = rBox(0.040, 0.098, 0.048, 0.014, M.polymer, 0, -0.046, 0.048, 'y');
    grip.rotation.x = -0.28; g.add(grip);
    // 防滑纹挂在握把自己身上跟着倾角走；横向环带比颗粒点阵好读得多，
    // 3mm 的小颗粒在这个尺寸上等于不存在。
    for (var r = 0; r < 5; r++) {
      grip.add(mBox(0.043, 0.005, 0.050, M.polymerLt, 0, 0.030 - r * 0.018, 0));
    }
    // 虎口护突（把握把顶端和套筒座后端连成一体）+ 背带 + 弹匣底板
    g.add(rBox(0.036, 0.020, 0.030, 0.008, M.polymer, 0, 0.004, 0.070));
    var backstrap = rBox(0.036, 0.076, 0.016, 0.007, M.polymerLt, 0, -0.038, 0.070, 'y');
    backstrap.rotation.x = -0.28; g.add(backstrap);
    var pMag = part(g, 'mag');
    var mag = rBox(0.032, 0.018, 0.044, 0.006, M.darkSteel, 0, -0.099, 0.064, 'y');
    mag.rotation.x = -0.28; pMag.add(mag);
    anchor(g, 'magWell', 0, -0.096, 0.062);
    // 小五金：弹匣释放钮、套筒卡榫、分解杆
    var magRel = mCylY(0.006, 0.006, 0.010, M.trimSteel, 12);
    magRel.rotation.z = Math.PI / 2; magRel.position.set(0.021, -0.010, 0.030); g.add(magRel);
    g.add(mBox(0.008, 0.007, 0.022, M.trimSteel, 0.019, 0.014, 0.020));
    g.add(mBox(0.007, 0.006, 0.014, M.trimSteel, 0.019, 0.008, -0.030));
    // 照门（缺口式）+ 准星，三白点。都长在套筒上，放套筒才会跟着一起后坐
    pSlide.add(mBox(0.018, 0.009, 0.008, M.darkSteel, 0, 0.0575, 0.086));
    pSlide.add(mBox(0.0035, 0.0035, 0.004, M.lensBlue, -0.006, 0.059, 0.0845));
    pSlide.add(mBox(0.0035, 0.0035, 0.004, M.lensBlue, 0.006, 0.059, 0.0845));
    pSlide.add(mBox(0.005, 0.010, 0.008, M.darkSteel, 0, 0.058, -0.132));
    pSlide.add(mBox(0.004, 0.004, 0.004, M.lensBlue, 0, 0.059, -0.136));
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.040, -0.165); g.add(muzzle);
    g.userData.muzzle = muzzle;
    // 右手握把；左手是换弹专用的支撑手，平时隐藏（lHidden），只在换弹动画里出现
    if (withHands) addHands(g, [0.0, -0.062, 0.052], [-0.055, -0.150, 0.045],
      { rRotX: -0.28, lRotX: 0.45, lHidden: true });
    return g;
  }

  // -------------------- 霰弹枪（木质泵动，雷明顿风格）--------------------
  function buildShotgun(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 机匣（圆角，顶部有一条纵向脊线高光）
    g.add(rBox(0.078, 0.105, 0.30, 0.018, M.gunmetal, 0, 0.0, 0.0));
    g.add(rBox(0.056, 0.016, 0.28, 0.006, M.darkSteel, 0, 0.056, 0.0));
    // 抛壳口（右）与托弹板（下）
    g.add(mBox(0.012, 0.046, 0.095, M.darkSteel, 0.036, 0.018, -0.02));
    g.add(rBox(0.05, 0.014, 0.09, 0.005, M.darkSteel, 0, -0.05, -0.01));
    // 枪管 + 弹仓管：弹仓管必须**贴着**枪管（真枪就是箍在一起的），
    // 悬在下方 35mm 就是两根各自漂着的管子。管箍卡在弹仓管前端，前端要有堵头。
    var barrel = mCylZ(0.0255, 0.027, 0.66, M.darkSteel, 20);
    barrel.position.set(0, 0.055, -0.44); g.add(barrel);
    var tube = mCylZ(0.021, 0.021, 0.56, M.gunmetal, 16);
    tube.position.set(0, 0.007, -0.41); g.add(tube);
    g.add(rBox(0.052, 0.10, 0.028, 0.012, M.darkSteel, 0, 0.034, -0.665));
    var tubeCap = mCylZ(0.024, 0.019, 0.028, M.darkSteel, 16);
    tubeCap.position.set(0, 0.007, -0.703); g.add(tubeCap);
    g.add(ringZ(0.028, 0.005, M.darkSteel, 0, 0.055, -0.755, 20));
    // 泵动前握（胡桃木）：顶面顶到枪管下沿，把弹仓管包进去。
    // 指槽做成**环绕整圈**的凸棱：只在侧面凸出 2mm 的纹路在顶光下完全没有明暗差，
    // 等于没做（握把上那几道环带能读出来就是因为它们绕了一整圈）。
    // 整个前握进 charge 组：泵动枪的换弹动作全在这一推一拉上。
    var sPump = part(g, 'charge');
    sPump.add(rBox(0.082, 0.066, 0.21, 0.024, M.woodDark, 0, -0.005, -0.30));
    addRibs(sPump, 6, M.wood, 0, -0.005, -0.385, 0.030, 0.088, 0.072, 0.014);
    sPump.add(rBox(0.072, 0.05, 0.03, 0.010, M.darkSteel, 0, -0.005, -0.192));
    // 木托：手腕处收细，与机匣连续；带贴腮脊与防滑纹底板
    var wrist = rBox(0.062, 0.085, 0.16, 0.026, M.wood, 0, -0.018, 0.22);
    wrist.rotation.x = -0.05; g.add(wrist);
    var comb = rBox(0.070, 0.115, 0.26, 0.030, M.wood, 0, -0.006, 0.40);
    comb.rotation.x = -0.07; g.add(comb);
    g.add(rBox(0.072, 0.128, 0.026, 0.014, M.darkSteel, 0, -0.024, 0.525));
    addRibs(g, 4, M.polymer, 0, -0.024, 0.536, 0.0, 0.062, 0.010, 0.008);
    // 背带环
    g.add(loopX(0.016, 0.005, M.trimSteel, 0, -0.075, 0.47, 14));
    g.add(loopX(0.016, 0.005, M.trimSteel, 0, -0.020, -0.66, 14));
    // 准星珠（带底座）
    g.add(mBox(0.014, 0.016, 0.03, M.darkSteel, 0, 0.088, -0.72));
    var bead = mCylY(0.008, 0.008, 0.012, M.brass, 12);
    bead.position.set(0, 0.102, -0.72); g.add(bead);
    // 扳机护圈：立起的环
    g.add(loopX(0.032, 0.010, M.gunmetal, 0, -0.062, 0.055, 22));
    g.add(mBox(0.013, 0.036, 0.016, M.trimSteel, 0, -0.062, 0.042));
    // 保险钮
    var saf = mCylY(0.009, 0.009, 0.020, M.trimSteel, 12);
    saf.rotation.z = Math.PI / 2; saf.position.set(0, -0.04, 0.12); g.add(saf);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.055, -0.78); g.add(muzzle);
    g.userData.muzzle = muzzle;
    // 压弹口在托弹板下方：泵动枪没有可拆弹匣，换弹是一发一发从这里顶进去的。
    anchor(g, 'magWell', 0, -0.070, -0.01);
    // 一枚待压的霰弹（红塑料壳 + 黄铜底），平时藏着，只在压弹动画里出现。
    // 弹壳朝前（-z），底火朝后，和真枪压弹的方向一致。
    var sShell = part(g, 'shell');
    sShell.visible = false;
    var shHull = mCylZ(0.0094, 0.0094, 0.048, M.shellRed, 14);
    shHull.position.set(0, -0.070, -0.034); sShell.add(shHull);
    var shBase = mCylZ(0.0100, 0.0100, 0.016, M.brass, 14);
    shBase.position.set(0, -0.070, -0.002); sShell.add(shBase);
    if (withHands) addHands(g, [0.0, -0.085, 0.055], [0.0, -0.105, -0.30], { rRotX: 0.3, lRotX: 0.25 });
    return g;
  }

  // -------------------- 突击步枪（M4 风格）--------------------
  function buildRifle(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // ---- 机匣：上下两节咬合，顶部一条全长导轨 ----
    g.add(rBox(0.070, 0.082, 0.30, 0.014, M.gunmetal, 0, 0.022, 0.02));
    g.add(rBox(0.064, 0.062, 0.20, 0.012, M.polymer, 0, -0.030, 0.04));
    // 顶部导轨：连续基座 + 齿，齿不再是悬空的锯梳
    g.add(rBox(0.030, 0.010, 0.62, 0.003, M.darkSteel, 0, 0.068, -0.13));
    addRibs(g, 16, M.gunmetal, 0, 0.076, -0.42, 0.038, 0.036, 0.008, 0.020);
    // 抛壳口盖 + 辅助推机柄 + 拉机柄
    g.add(rBox(0.014, 0.040, 0.095, 0.005, M.darkSteel, 0.035, 0.030, -0.02));
    var fa = mCylZ(0.011, 0.011, 0.026, M.trimSteel, 12);
    fa.position.set(0.030, 0.050, 0.13); g.add(fa);
    // 拉机柄单独成组：换弹最后要往后拉一下再弹回（上膛）
    var rCharge = part(g, 'charge');
    rCharge.add(rBox(0.034, 0.020, 0.055, 0.006, M.darkSteel, 0, 0.060, 0.175));
    rCharge.add(mBox(0.052, 0.012, 0.016, M.trimSteel, 0, 0.060, 0.198));
    // ---- 护木：从机匣前端连续延伸到气块，顶面顶住导轨，侧面散热孔 ----
    g.add(rBox(0.068, 0.088, 0.36, 0.026, M.polymer, 0, 0.019, -0.30));
    for (var v = 0; v < 5; v++) {
      var vz = -0.19 - v * 0.058;
      [-0.034, 0.034].forEach(function (vx) {
        var vh = mCylY(0.011, 0.011, 0.014, M.darkSteel, 12);
        vh.rotation.z = Math.PI / 2;
        vh.position.set(vx, 0.012, vz);
        g.add(vh);
      });
    }
    // 护木下方的前握把（垂直握把，抓握点明确）
    var vfg = rBox(0.042, 0.10, 0.048, 0.016, M.polymer, 0, -0.060, -0.30, 'y');
    vfg.rotation.x = -0.12; g.add(vfg);
    addRibs(g, 4, M.polymerLt, 0, -0.075, -0.322, 0.016, 0.046, 0.008, 0.008);
    // ---- 气块 + 枪管 + 消焰器 ----
    g.add(rBox(0.044, 0.052, 0.055, 0.010, M.darkSteel, 0, 0.030, -0.485));
    var barrel = mCylZ(0.0165, 0.0175, 0.26, M.darkSteel, 18);
    barrel.position.set(0, 0.030, -0.63); g.add(barrel);
    g.add(ringZ(0.021, 0.004, M.gunmetal, 0, 0.030, -0.70, 18));
    var flash = mCylZ(0.027, 0.024, 0.085, M.darkSteel, 18);
    flash.position.set(0, 0.030, -0.795); g.add(flash);
    // 消焰器开槽：三道槽切在顶面
    addRibs(g, 3, M.gunmetal, 0, 0.049, -0.825, 0.024, 0.030, 0.010, 0.011);
    g.add(ringZ(0.029, 0.005, M.darkSteel, 0, 0.030, -0.755, 18));
    // ---- 弹匣井 + 弯弹匣（分段相接，无缝）----
    // 弹匣井留在枪身上，弹匣本体（含底板和加强筋）进 mag 组，换弹时整根抽出。
    g.add(rBox(0.058, 0.05, 0.085, 0.010, M.gunmetal, 0, -0.068, -0.035, 'y'));
    var rMag = part(g, 'mag');
    addCurvedMag(rMag, M.polymerTan, 0, -0.088, -0.035, 4, 0.058, 0.050, 0.078, 0.085);
    rMag.add(rBox(0.052, 0.016, 0.072, 0.006, M.darkSteel, 0, -0.318, 0.008, 'y'));
    // 弹匣筋
    addRibs(rMag, 3, M.polymer, 0.026, -0.16, -0.055, 0.030, 0.006, 0.10, 0.010);
    addRibs(rMag, 3, M.polymer, -0.026, -0.16, -0.055, 0.030, 0.006, 0.10, 0.010);
    anchor(g, 'magWell', 0, -0.098, -0.035);
    // ---- 手枪握把（与下机匣咬合，带指槽）----
    // 握把往后下方倾（底端在后），rotation.x 用负值；正值会把握把朝枪口方向倾。
    var grip = rBox(0.058, 0.145, 0.072, 0.020, M.polymer, 0, -0.095, 0.145, 'y');
    grip.rotation.x = -0.38; g.add(grip);
    addRibs(g, 4, M.polymerLt, 0, -0.10, 0.115, 0.006, 0.062, 0.012, 0.020);
    var gripCap = rBox(0.052, 0.026, 0.066, 0.010, M.polymer, 0, -0.167, 0.172);
    gripCap.rotation.x = -0.38; g.add(gripCap);
    // 扳机护圈（立起的环）+ 扳机 + 保险 + 弹匣卡榫 + 空仓挂机
    g.add(loopX(0.034, 0.010, M.polymer, 0, -0.056, 0.075, 22));
    g.add(mBox(0.013, 0.036, 0.015, M.trimSteel, 0, -0.056, 0.062));
    var sel = mCylY(0.013, 0.013, 0.024, M.trimSteel, 12);
    sel.rotation.z = Math.PI / 2; sel.position.set(0, -0.012, 0.115); g.add(sel);
    g.add(mBox(0.010, 0.016, 0.030, M.trimSteel, -0.032, -0.012, 0.108));
    var mr = mCylY(0.011, 0.011, 0.018, M.trimSteel, 12);
    mr.rotation.z = Math.PI / 2; mr.position.set(0.034, -0.016, 0.02); g.add(mr);
    g.add(mBox(0.012, 0.030, 0.022, M.trimSteel, -0.034, 0.006, 0.055));
    // ---- 伸缩托：缓冲管贯穿托体，托实实在在套在管上 ----
    var tube = mCylZ(0.0225, 0.0225, 0.30, M.gunmetal, 16);
    tube.position.set(0, 0.006, 0.28); g.add(tube);
    addRibs(g, 5, M.darkSteel, 0, 0.030, 0.20, 0.030, 0.030, 0.008, 0.010);
    // 托体做成「前细后粗」两段 + 明显下垂的腹部：一块等截面方块无论怎么斜切都还是砖。
    // 倾角也别抠 6°，那点角度在这个尺寸下看不出来。
    g.add(rBox(0.050, 0.062, 0.10, 0.014, M.polymer, 0, 0.004, 0.270));
    g.add(rBox(0.072, 0.100, 0.15, 0.024, M.polymer, 0, -0.004, 0.365));
    var rBelly = rBox(0.062, 0.044, 0.11, 0.016, M.polymer, 0, -0.062, 0.355);
    rBelly.rotation.x = 0.22; g.add(rBelly);
    var rComb = rBox(0.058, 0.042, 0.16, 0.014, M.polymerLt, 0, 0.054, 0.350);
    rComb.rotation.x = -0.20; g.add(rComb);
    var rButt = rBox(0.074, 0.130, 0.028, 0.014, M.darkSteel, 0, -0.008, 0.446);
    rButt.rotation.x = 0.24; g.add(rButt);
    addRibs(g, 4, M.polymer, 0, -0.008, 0.457, 0.0, 0.064, 0.010, 0.008);
    // 背带环（托后 + 护木前）
    g.add(loopX(0.015, 0.005, M.trimSteel, 0.030, 0.028, 0.412, 14));
    g.add(loopX(0.015, 0.005, M.trimSteel, 0.030, -0.020, -0.455, 14));
    // ---- 红点瞄具：底座落在导轨上，无悬空 ----
    g.add(rBox(0.038, 0.030, 0.075, 0.008, M.darkSteel, 0, 0.088, 0.03));
    var opticTube = mCylZ(0.026, 0.026, 0.085, M.darkSteel, 20);
    opticTube.position.set(0, 0.118, 0.03); g.add(opticTube);
    g.add(ringZ(0.028, 0.0045, M.gunmetal, 0, 0.118, -0.010, 20));
    g.add(ringZ(0.028, 0.0045, M.gunmetal, 0, 0.118, 0.070, 20));
    var oLens = mCylZ(0.023, 0.023, 0.006, M.lensBlue, 20);
    oLens.position.set(0, 0.118, -0.011); g.add(oLens);
    g.add(mBox(0.008, 0.008, 0.004, M.lensRed, 0, 0.118, -0.008));
    var knob = mCylY(0.010, 0.010, 0.016, M.trimSteel, 12);
    knob.position.set(0, 0.140, 0.045); g.add(knob);
    // 折叠式备用准星（坐在护木顶面上）
    g.add(mBox(0.030, 0.014, 0.030, M.darkSteel, 0, 0.070, -0.47));
    g.add(mBox(0.010, 0.042, 0.012, M.darkSteel, 0, 0.094, -0.47));
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.030, -0.845); g.add(muzzle);
    g.userData.muzzle = muzzle;
    if (withHands) addHands(g, [0.0, -0.112, 0.160], [0.0, -0.075, -0.30], { rRotX: -0.38, lRotX: -0.1 });
    return g;
  }

  // -------------------- 狙击步枪 AWP --------------------
  function buildAWP(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // ---- 机匣 + 底盘（圆角，侧面有减重槽做出层次）----
    g.add(rBox(0.076, 0.098, 0.46, 0.018, M.greenPoly, 0, 0.0, 0.04));
    g.add(rBox(0.082, 0.030, 0.40, 0.012, M.greenPolyLt, 0, -0.032, 0.05));
    g.add(rBox(0.030, 0.012, 0.40, 0.004, M.darkSteel, 0, 0.056, 0.02));
    g.add(mBox(0.014, 0.040, 0.11, M.darkSteel, 0.034, 0.014, -0.05));
    // ---- 枪管：从机匣内部起出（有重叠，不再悬空），带枪管座与制退器 ----
    g.add(rBox(0.056, 0.058, 0.10, 0.014, M.gunmetal, 0, 0.026, -0.235));
    var barrel = mCylZ(0.0185, 0.021, 0.62, M.darkSteel, 20);
    barrel.position.set(0, 0.026, -0.575); g.add(barrel);
    // 枪管开槽（散热纹），沿管身分布
    for (var f = 0; f < 7; f++) {
      g.add(ringZ(0.0215, 0.0035, M.gunmetal, 0, 0.026, -0.40 - f * 0.055, 18));
    }
    var brake = mCylZ(0.031, 0.028, 0.10, M.darkSteel, 20);
    brake.position.set(0, 0.026, -0.925); g.add(brake);
    addRibs(g, 3, M.gunmetal, 0, 0.049, -0.955, 0.028, 0.034, 0.011, 0.012);
    g.add(ringZ(0.033, 0.005, M.darkSteel, 0, 0.026, -0.878, 20));
    // ---- 拇指孔枪托：上下两条梁夹出真实的镂空 ----
    g.add(rBox(0.070, 0.048, 0.34, 0.018, M.greenPoly, 0, 0.040, 0.40));   // 上梁
    g.add(rBox(0.066, 0.040, 0.30, 0.016, M.greenPoly, 0, -0.050, 0.42));  // 下梁
    g.add(rBox(0.070, 0.11, 0.09, 0.020, M.greenPoly, 0, 0.0, 0.575));     // 后端合并
    var cheek = rBox(0.078, 0.052, 0.22, 0.020, M.greenPolyLt, 0, 0.080, 0.44);
    cheek.rotation.x = -0.09; g.add(cheek);                                // 贴腮板（前端削低）
    var riser = mCylY(0.010, 0.010, 0.03, M.trimSteel, 12);
    riser.position.set(0, 0.056, 0.36); g.add(riser);
    var aButt = rBox(0.072, 0.146, 0.030, 0.014, M.darkSteel, 0, 0.008, 0.631);
    aButt.rotation.x = 0.15; g.add(aButt);
    addRibs(g, 4, M.polymer, 0, 0.008, 0.641, 0.0, 0.062, 0.012, 0.008);
    // ---- 大倍镜：环座落在导轨上，环高刚好接住镜筒 ----
    var scopeY = 0.132;
    var scopeTube = mCylZ(0.030, 0.030, 0.30, M.darkSteel, 22);
    scopeTube.position.set(0, scopeY, 0.03); g.add(scopeTube);
    var bell = mCylZ(0.044, 0.032, 0.09, M.darkSteel, 22);
    bell.position.set(0, scopeY, -0.155); g.add(bell);
    var eye = mCylZ(0.038, 0.032, 0.07, M.darkSteel, 22);
    eye.position.set(0, scopeY, 0.20); g.add(eye);
    var lens = mCylZ(0.041, 0.041, 0.007, M.lensBlue, 22);
    lens.position.set(0, scopeY, -0.198); g.add(lens);
    g.add(ringZ(0.045, 0.005, M.gunmetal, 0, scopeY, -0.20, 22));
    // 镜环：从导轨顶面(0.062)接到镜筒底(0.102)，高 0.044 居中于 0.082
    [-0.06, 0.11].forEach(function (rz) {
      g.add(rBox(0.034, 0.046, 0.030, 0.008, M.gunmetal, 0, 0.081, rz));
      g.add(ringZ(0.033, 0.006, M.trimSteel, 0, scopeY, rz, 20));
      addScrew(g, M.trimSteel, 0.018, 0.070, rz, 0.005);
    });
    // 归零旋钮（上/侧）
    var kTop = mCylY(0.014, 0.014, 0.026, M.darkSteel, 14);
    kTop.position.set(0, scopeY + 0.030, 0.05); g.add(kTop);
    var kSide = mCylY(0.013, 0.013, 0.024, M.darkSteel, 14);
    kSide.rotation.z = Math.PI / 2; kSide.position.set(0.032, scopeY, 0.05); g.add(kSide);
    var zoom = mCylZ(0.034, 0.034, 0.03, M.gunmetal, 20);
    zoom.position.set(0, scopeY, 0.155); g.add(zoom);
    addRibs(g, 5, M.darkSteel, 0, scopeY + 0.032, 0.145, 0.008, 0.020, 0.006, 0.004);
    // ---- 枪栓：拉机柄根部贴在机匣上，末端球头 ----
    // 整根枪栓进 charge 组：换弹结束要拉栓上膛，这是栓动枪最该有的一下
    var aCharge = part(g, 'charge');
    var boltBase = rBox(0.030, 0.030, 0.07, 0.008, M.gunmetal, 0.040, 0.020, 0.175);
    aCharge.add(boltBase);
    var boltArm = mCylY(0.010, 0.010, 0.075, M.trimSteel, 12);
    boltArm.rotation.z = -1.05; boltArm.position.set(0.070, 0.008, 0.195); aCharge.add(boltArm);
    var boltKnob = mCylY(0.017, 0.017, 0.020, M.darkSteel, 14);
    boltKnob.rotation.z = -1.05; boltKnob.position.set(0.098, -0.006, 0.195); aCharge.add(boltKnob);
    // ---- 弹匣（插进弹匣井）----
    g.add(rBox(0.062, 0.036, 0.11, 0.010, M.gunmetal, 0, -0.056, 0.0, 'y'));
    var aMag = part(g, 'mag');
    aMag.add(rBox(0.056, 0.10, 0.10, 0.012, M.darkSteel, 0, -0.122, 0.0, 'y'));
    aMag.add(rBox(0.060, 0.016, 0.104, 0.006, M.darkSteel, 0, -0.180, 0.0, 'y'));
    anchor(g, 'magWell', 0, -0.080, 0.0);
    // ---- 握把 + 扳机组 ----
    var grip = rBox(0.058, 0.14, 0.072, 0.020, M.greenPoly, 0, -0.092, 0.205, 'y');
    grip.rotation.x = -0.34; g.add(grip);
    addRibs(g, 4, M.greenPolyLt, 0, -0.10, 0.176, 0.006, 0.062, 0.012, 0.020);
    g.add(loopX(0.033, 0.010, M.gunmetal, 0, -0.055, 0.128, 22));
    g.add(mBox(0.013, 0.036, 0.015, M.trimSteel, 0, -0.055, 0.115));
    var saf = mCylY(0.011, 0.011, 0.020, M.trimSteel, 12);
    saf.rotation.z = Math.PI / 2; saf.position.set(0.032, -0.008, 0.17); g.add(saf);
    // ---- 前托：托住枪管、给左手抓握点，也是两脚架的安装基座 ----
    g.add(rBox(0.074, 0.062, 0.40, 0.022, M.greenPoly, 0, -0.006, -0.36));
    addRibs(g, 5, M.greenPolyLt, 0, -0.036, -0.48, 0.048, 0.070, 0.010, 0.020);
    for (var fv = 0; fv < 4; fv++) {
      var fz = -0.24 - fv * 0.062;
      [-0.038, 0.038].forEach(function (fx) {
        var fh = mCylY(0.011, 0.011, 0.012, M.darkSteel, 12);
        fh.rotation.z = Math.PI / 2; fh.position.set(fx, 0.002, fz); g.add(fh);
      });
    }
    // ---- 两脚架：挂在前托下的座上，双腿共铰接点 ----
    g.add(rBox(0.038, 0.032, 0.055, 0.008, M.darkSteel, 0, -0.046, -0.50));
    addBipod(g, M.darkSteel, 0, -0.062, -0.50, 0.21, 0.42, -0.10);
    // 背带环
    g.add(loopX(0.015, 0.005, M.trimSteel, 0.030, -0.052, 0.55, 14));
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.026, -0.98); g.add(muzzle);
    g.userData.muzzle = muzzle;
    if (withHands) addHands(g, [0.0, -0.112, 0.205], [0.0, -0.062, -0.40], { rRotX: -0.34, lRotX: -0.1 });
    return g;
  }

  // -------------------- 连狙 DMR（SR-25 风格）--------------------
  function buildDMR(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 机匣 + 顶部全长导轨
    g.add(rBox(0.072, 0.090, 0.40, 0.016, M.greenPoly, 0, 0.0, 0.02));
    g.add(rBox(0.066, 0.058, 0.20, 0.012, M.polymer, 0, -0.046, 0.04));
    g.add(rBox(0.030, 0.010, 0.66, 0.003, M.darkSteel, 0, 0.052, -0.12));
    addRibs(g, 17, M.gunmetal, 0, 0.060, -0.44, 0.038, 0.036, 0.008, 0.020);
    g.add(mBox(0.014, 0.042, 0.10, M.darkSteel, 0.036, 0.012, -0.03));
    var dCharge = part(g, 'charge');
    dCharge.add(rBox(0.034, 0.020, 0.055, 0.006, M.darkSteel, 0, 0.044, 0.20));
    dCharge.add(mBox(0.052, 0.012, 0.016, M.trimSteel, 0, 0.044, 0.222));
    // 管状护木（带散热孔），连续接到机匣
    g.add(rBox(0.068, 0.072, 0.34, 0.030, M.polymer, 0, 0.0, -0.31));
    for (var v = 0; v < 6; v++) {
      var vz = -0.17 - v * 0.052;
      [-0.035, 0.035].forEach(function (vx) {
        var vh = mCylY(0.010, 0.010, 0.014, M.darkSteel, 12);
        vh.rotation.z = Math.PI / 2; vh.position.set(vx, 0.0, vz); g.add(vh);
      });
    }
    // 枪管 + 制退器
    g.add(rBox(0.046, 0.050, 0.055, 0.010, M.darkSteel, 0, 0.012, -0.495));
    var barrel = mCylZ(0.0165, 0.018, 0.28, M.darkSteel, 18);
    barrel.position.set(0, 0.012, -0.65); g.add(barrel);
    g.add(ringZ(0.021, 0.004, M.gunmetal, 0, 0.012, -0.73, 18));
    var brake = mCylZ(0.026, 0.024, 0.08, M.darkSteel, 18);
    brake.position.set(0, 0.012, -0.825); g.add(brake);
    addRibs(g, 3, M.gunmetal, 0, 0.031, -0.852, 0.024, 0.030, 0.010, 0.011);
    // 瞄准镜：环座落在导轨上（导轨顶 0.057 → 镜筒底 0.094）
    var sy = 0.122;
    var st = mCylZ(0.028, 0.028, 0.26, M.darkSteel, 22);
    st.position.set(0, sy, 0.02); g.add(st);
    var sb = mCylZ(0.038, 0.030, 0.07, M.darkSteel, 22);
    sb.position.set(0, sy, -0.145); g.add(sb);
    var se = mCylZ(0.034, 0.029, 0.06, M.darkSteel, 22);
    se.position.set(0, sy, 0.175); g.add(se);
    var sl = mCylZ(0.035, 0.035, 0.007, M.lensBlue, 22);
    sl.position.set(0, sy, -0.183); g.add(sl);
    g.add(ringZ(0.039, 0.005, M.gunmetal, 0, sy, -0.185, 22));
    [-0.055, 0.10].forEach(function (rz) {
      g.add(rBox(0.032, 0.042, 0.028, 0.008, M.gunmetal, 0, 0.075, rz));
      g.add(ringZ(0.031, 0.006, M.trimSteel, 0, sy, rz, 20));
      addScrew(g, M.trimSteel, 0.017, 0.064, rz, 0.005);
    });
    var dk = mCylY(0.013, 0.013, 0.024, M.darkSteel, 14);
    dk.position.set(0, sy + 0.028, 0.045); g.add(dk);
    // 弹匣井 + 弯弹匣
    g.add(rBox(0.058, 0.05, 0.088, 0.010, M.greenPolyLt, 0, -0.078, -0.03, 'y'));
    var dMag = part(g, 'mag');
    addCurvedMag(dMag, M.polymer, 0, -0.098, -0.03, 4, 0.062, 0.050, 0.080, 0.075);
    dMag.add(rBox(0.052, 0.016, 0.075, 0.006, M.darkSteel, 0, -0.352, 0.008, 'y'));
    anchor(g, 'magWell', 0, -0.108, -0.03);
    // 握把 + 扳机组
    var grip = rBox(0.058, 0.14, 0.072, 0.020, M.polymer, 0, -0.098, 0.165, 'y');
    grip.rotation.x = -0.36; g.add(grip);
    addRibs(g, 4, M.polymerLt, 0, -0.105, 0.136, 0.006, 0.062, 0.012, 0.020);
    g.add(loopX(0.033, 0.010, M.polymer, 0, -0.070, 0.09, 22));
    g.add(mBox(0.013, 0.036, 0.015, M.trimSteel, 0, -0.070, 0.077));
    var sel = mCylY(0.012, 0.012, 0.022, M.trimSteel, 12);
    sel.rotation.z = Math.PI / 2; sel.position.set(0, -0.030, 0.132); g.add(sel);
    // 固定托：与机匣连续，腮托往前削低、底板向后下方斜切
    g.add(rBox(0.070, 0.105, 0.26, 0.024, M.greenPoly, 0, -0.010, 0.345));
    var dComb = rBox(0.060, 0.044, 0.19, 0.016, M.greenPolyLt, 0, 0.044, 0.335);
    dComb.rotation.x = -0.12; g.add(dComb);
    var dButt = rBox(0.072, 0.130, 0.028, 0.014, M.darkSteel, 0, -0.016, 0.486);
    dButt.rotation.x = 0.18; g.add(dButt);
    addRibs(g, 4, M.polymer, 0, -0.016, 0.496, 0.0, 0.062, 0.012, 0.008);
    g.add(loopX(0.015, 0.005, M.trimSteel, 0.030, -0.058, 0.44, 14));
    g.add(loopX(0.015, 0.005, M.trimSteel, 0.030, -0.036, -0.45, 14));
    // 前置两脚架座
    g.add(rBox(0.034, 0.026, 0.05, 0.008, M.darkSteel, 0, -0.046, -0.40));
    addBipod(g, M.darkSteel, 0, -0.060, -0.40, 0.17, 0.40, -0.08);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -0.875); g.add(muzzle);
    g.userData.muzzle = muzzle;
    if (withHands) addHands(g, [0.0, -0.118, 0.165], [0.0, -0.062, -0.30], { rRotX: -0.36, lRotX: -0.1 });
    return g;
  }

  // -------------------- 重机枪 LMG（M249 风格）--------------------
  function buildLMG(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 机身 + 供弹机盖（盖子有铰链与卡扣）
    g.add(rBox(0.098, 0.125, 0.60, 0.020, M.gunmetal, 0, 0.015, 0.0));
    g.add(rBox(0.104, 0.055, 0.24, 0.016, M.darkSteel, 0, 0.088, -0.02));
    addRibs(g, 4, M.gunmetal, 0, 0.114, -0.08, 0.045, 0.090, 0.008, 0.014);
    g.add(mBox(0.108, 0.014, 0.028, M.trimSteel, 0, 0.062, 0.09));
    var lCharge = part(g, 'charge');
    lCharge.add(mBox(0.016, 0.030, 0.020, M.trimSteel, 0.052, 0.078, -0.12));
    // 抛壳口
    g.add(mBox(0.014, 0.048, 0.11, M.darkSteel, 0.048, 0.010, 0.02));
    // 枪管 + 散热护套（护套是连续管件，开真实的散热窗）
    var barrel = mCylZ(0.024, 0.026, 0.44, M.darkSteel, 20);
    barrel.position.set(0, 0.052, -0.52); g.add(barrel);
    var shroud = mCylZ(0.040, 0.042, 0.30, M.gunmetal, 22);
    shroud.position.set(0, 0.052, -0.44); g.add(shroud);
    for (var h = 0; h < 5; h++) {
      var hz = -0.33 - h * 0.052;
      [-0.040, 0.040].forEach(function (hx) {
        var hole = mCylY(0.014, 0.014, 0.014, M.darkSteel, 12);
        hole.rotation.z = Math.PI / 2; hole.position.set(hx, 0.052, hz); g.add(hole);
      });
    }
    g.add(ringZ(0.043, 0.005, M.darkSteel, 0, 0.052, -0.293, 22));
    g.add(ringZ(0.043, 0.005, M.darkSteel, 0, 0.052, -0.588, 22));
    var flash = mCylZ(0.030, 0.027, 0.09, M.darkSteel, 20);
    flash.position.set(0, 0.052, -0.785); g.add(flash);
    addRibs(g, 3, M.gunmetal, 0, 0.076, -0.815, 0.026, 0.034, 0.011, 0.012);
    // 提把（立起的环，侧面能看到镂空）
    g.add(loopX(0.048, 0.012, M.polymer, 0, 0.155, -0.10, 22));
    g.add(rBox(0.026, 0.040, 0.05, 0.008, M.darkSteel, 0, 0.120, -0.10));
    // 下护木 + 前握把
    g.add(rBox(0.086, 0.085, 0.24, 0.026, M.polymer, 0, -0.030, -0.34));
    addRibs(g, 5, M.polymerLt, 0, -0.070, -0.42, 0.040, 0.078, 0.010, 0.018);
    // 弹链箱：贴住机身下方，箱盖上有把手；弹链从箱口斜插进供弹口
    // 整箱 + 弹链进 mag 组：机枪换弹就是**整箱连弹链**一起换掉
    var lMag = part(g, 'mag');
    lMag.add(rBox(0.125, 0.155, 0.17, 0.022, M.polymerTan, 0, -0.115, 0.045));
    lMag.add(rBox(0.128, 0.020, 0.17, 0.008, M.polymer, 0, -0.032, 0.045));
    lMag.add(loopX(0.022, 0.006, M.polymer, 0, -0.020, 0.045, 16));
    addRibs(lMag, 3, M.polymer, 0.064, -0.13, -0.005, 0.045, 0.006, 0.10, 0.014);
    // 弹链：一整条链节带 + 紧挨着的黄铜弹，从箱口爬进供弹口。
    // 走左侧（-X）：M249 就是从左边供弹、右边抛壳，右侧已经被抛壳口和拉机柄占了。
    // 弹壳要粗、要挨着，否则远看只是一串金色小点。
    var beltA = -0.585, bDirY = Math.cos(beltA), bDirZ = -Math.sin(beltA);
    var strip = rBox(0.026, 0.132, 0.019, 0.006, M.darkSteel, -0.050, 0.014, 0.005, 'y');
    strip.rotation.x = beltA; lMag.add(strip);
    for (var b = 0; b < 6; b++) {
      var bt = (b - 2.5) * 0.023;
      var by = 0.014 + bt * bDirY, bz = 0.005 + bt * bDirZ;
      var rnd = mCylY(0.0105, 0.0105, 0.040, M.brass, 12);
      rnd.rotation.z = Math.PI / 2; rnd.position.set(-0.050, by, bz); lMag.add(rnd);
      var nose = mCylY(0.0042, 0.0100, 0.016, M.brass, 12);
      nose.rotation.z = Math.PI / 2; nose.position.set(-0.022, by, bz); lMag.add(nose);
      lMag.add(mBox(0.034, 0.021, 0.007, M.trimSteel, -0.050, by, bz));
    }
    anchor(g, 'magWell', 0, -0.040, 0.045);
    // 托：后端向下削出腮托斜面 + 斜切的托底板（不是一块方砖）
    g.add(rBox(0.078, 0.115, 0.26, 0.024, M.polymer, 0, 0.010, 0.42));
    var comb = rBox(0.062, 0.044, 0.18, 0.016, M.polymerLt, 0, 0.070, 0.41);
    comb.rotation.x = -0.10; g.add(comb);
    var butt = rBox(0.082, 0.132, 0.028, 0.014, M.darkSteel, 0, 0.004, 0.562);
    butt.rotation.x = 0.16; g.add(butt);
    addRibs(g, 4, M.polymer, 0, 0.004, 0.572, 0.0, 0.068, 0.012, 0.008);
    var grip = rBox(0.066, 0.145, 0.080, 0.022, M.polymer, 0, -0.088, 0.225, 'y');
    grip.rotation.x = -0.32; g.add(grip);
    addRibs(g, 4, M.polymerLt, 0, -0.095, 0.192, 0.006, 0.070, 0.012, 0.022);
    g.add(loopX(0.036, 0.011, M.gunmetal, 0, -0.048, 0.155, 22));
    g.add(mBox(0.014, 0.040, 0.016, M.trimSteel, 0, -0.048, 0.140));
    // 机械瞄具（可折叠照门 + 准星座）
    g.add(rBox(0.034, 0.016, 0.034, 0.006, M.darkSteel, 0, 0.122, 0.10));
    g.add(mBox(0.030, 0.042, 0.012, M.darkSteel, 0, 0.148, 0.10));
    g.add(mBox(0.008, 0.008, 0.005, M.lensRed, 0, 0.148, 0.106));
    g.add(rBox(0.030, 0.016, 0.030, 0.006, M.darkSteel, 0, 0.078, -0.60));
    g.add(mBox(0.010, 0.044, 0.012, M.darkSteel, 0, 0.104, -0.60));
    // 两脚架：挂在枪管座下，双腿共铰接点
    g.add(rBox(0.038, 0.030, 0.055, 0.008, M.darkSteel, 0, 0.020, -0.61));
    addBipod(g, M.darkSteel, 0, 0.002, -0.61, 0.24, 0.45, -0.12);
    // 背带环
    g.add(loopX(0.016, 0.005, M.trimSteel, 0.034, 0.058, 0.52, 14));
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.052, -0.835); g.add(muzzle);
    g.userData.muzzle = muzzle;
    if (withHands) addHands(g, [0.0, -0.108, 0.225], [0.0, -0.088, -0.34], { rRotX: -0.32, lRotX: 0.2 });
    return g;
  }

  var GUN_BUILDERS = { pistol: buildPistol, shotgun: buildShotgun, rifle: buildRifle, awp: buildAWP, dmr: buildDMR, lmg: buildLMG };
  function buildGunModel(id, withHands) {
    var fn = GUN_BUILDERS[id] || buildRifle;
    return fn(withHands);
  }

  // 刀身：用轮廓挤出 + 倒角，得到真正的"刃口"——
  // 倒角让刃缘收成一条亮线，这是平板盒子永远做不到的。
  // pts 为 [y, z] 轮廓点（y 为刀宽方向，z 为刀长方向、向前为负），thick 为刀身厚度。
  function bladeMesh(pts, thick, mat) {
    var key = 'bl' + thick.toFixed(4) + JSON.stringify(pts);
    var geo = GEO_CACHE[key];
    if (!geo) {
      // Shape 建在 XY 平面：X 放 z 值、Y 放 y 值，再绕 Y 转 -90°，
      // 使 shape.X→世界 Z、shape.Y→世界 Y、挤出方向→世界 X（厚度）。
      var s = new THREE.Shape();
      s.moveTo(pts[0][1], pts[0][0]);
      for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][1], pts[i][0]);
      s.closePath();
      var bev = thick * 0.42;
      geo = new THREE.ExtrudeGeometry(s, {
        depth: Math.max(0.0005, thick - bev * 2), bevelEnabled: true,
        bevelThickness: bev, bevelSize: bev * 1.6, bevelOffset: 0, bevelSegments: 2, curveSegments: 2
      });
      geo.translate(0, 0, -(thick - bev * 2) / 2);
      geo.rotateY(-Math.PI / 2);
      geo.computeVertexNormals();
      GEO_CACHE[key] = geo;
    }
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  // -------------------- 近战：战术匕首 --------------------
  function buildKnife(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 握把：中段收细的橡胶柄 + 指槽 + 尾锤
    g.add(rBox(0.030, 0.036, 0.135, 0.014, M.polymer, 0, 0, 0.085));
    addRibs(g, 4, M.polymerLt, 0, -0.020, 0.045, 0.028, 0.032, 0.008, 0.014);
    g.add(rBox(0.034, 0.040, 0.022, 0.010, M.darkSteel, 0, 0, 0.163));
    var lan = mCylY(0.004, 0.004, 0.032, M.trimSteel, 8);
    lan.rotation.z = Math.PI / 2; lan.position.set(0, 0, 0.168); g.add(lan);
    // 护手（带前指挡）
    g.add(rBox(0.056, 0.020, 0.024, 0.008, M.darkSteel, 0, 0, 0.008));
    g.add(rBox(0.020, 0.030, 0.020, 0.007, M.darkSteel, 0, -0.022, 0.006));
    // 刀身：直脊 + 弧刃 + 上翘刀尖，带血槽。
    // 尖角由「最后一段的刃宽 / 前伸距离」决定：宽 27mm 只前伸 22mm 就是 63° 的钝头，
    // 要 45° 就得让最后 25mm 把刃宽从 24mm 收到 0。
    var blade = bladeMesh([
      [0.022, 0.010], [0.022, -0.170], [0.014, -0.222], [0.004, -0.254],
      [-0.008, -0.278], [-0.016, -0.254], [-0.019, -0.200], [-0.020, -0.100], [-0.020, 0.010]
    ], 0.0075, M.blade);
    g.add(blade);
    g.add(mBox(0.003, 0.008, 0.14, M.darkSteel, 0.004, 0.009, -0.10));
    // 锯齿背（靠护手一段）
    addRibs(g, 5, M.darkSteel, 0, 0.024, -0.030, 0.016, 0.009, 0.010, 0.010);
    if (withHands) addHands(g, [0, 0, 0.085], null, { rRotX: 0.2 });
    return g;
  }
  // -------------------- 近战：消防斧 --------------------
  function buildAxe(withHands) {
    var M = weaponMats();
    var red = new THREE.MeshStandardMaterial({ color: 0xbb3a2b, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.9 });
    var g = new THREE.Group();
    // 斧柄：木柄，握持段包胶带纹；柄前端穿进斧眼
    var handle = mCylZ(0.020, 0.026, 0.62, M.wood, 16);
    handle.position.set(0, -0.01, 0.03); g.add(handle);
    g.add(rBox(0.033, 0.035, 0.17, 0.015, M.polymerLt, 0, -0.01, 0.245));
    addRibs(g, 6, M.polymer, 0, -0.031, 0.180, 0.026, 0.036, 0.008, 0.012);
    g.add(rBox(0.036, 0.040, 0.024, 0.010, M.darkSteel, 0, -0.01, 0.342));
    // 斧眼座（红漆）：套住柄前端，斧刃与鹤嘴都从这里长出去。
    // 座只做 52mm 高：78mm 的话会把斧刃的上半截整个吞掉，只剩下沿露出 55mm，
    // 整个头就读成"一块红砖 + 一把小凿子"。
    g.add(rBox(0.046, 0.052, 0.090, 0.012, red, 0, 0.002, -0.240));
    // 斧刃：**垂直于柄**向下张开——刃口顺着柄轴朝前的话那是把镐，不是斧。
    // 扇形从窄喉部张到微凸的刃口，全高 152mm（实物 180mm × 本模型 0.83 倍）；
    // 刃口宽度必须明显超过斧眼座的长度，否则张不出"斧"的扇形轮廓。
    // 刃口要接近**直线**（62mm 内只起 12mm）：中间凸太多就成了半圆的柴斧饼，
    // 趾角和踵角这两个转折读不出来。
    var bit = bladeMesh([
      [0.030, 0.026], [0.030, -0.026],
      [-0.020, -0.048], [-0.070, -0.064], [-0.112, -0.062],
      [-0.120, -0.030], [-0.124, 0.000], [-0.120, 0.030],
      [-0.112, 0.062], [-0.070, 0.064], [-0.020, 0.048]
    ], 0.017, M.blade);
    bit.position.set(0, -0.008, -0.245); g.add(bit);
    // 鹤嘴：与斧刃反向，从斧眼上方向后上掠出去收成一个尖
    var pick = bladeMesh([
      [0.006, 0.030], [0.006, -0.026], [0.038, -0.010], [0.072, 0.026],
      [0.082, 0.050], [0.052, 0.042], [0.024, 0.032]
    ], 0.024, red);
    pick.position.set(0, 0.016, -0.240); g.add(pick);
    // 斧眼铆钉
    addScrew(g, M.trimSteel, 0.023, -0.005, -0.240, 0.008);
    addScrew(g, M.trimSteel, -0.023, -0.005, -0.240, 0.008);
    if (withHands) addHands(g, [0, -0.01, 0.215], [0, -0.01, 0.045], { rRotX: 0.1, lRotX: 0.1 });
    return g;
  }
  // -------------------- 近战：武士刀 --------------------
  function buildKatana(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 柄（柄卷菱形交错）
    g.add(rBox(0.026, 0.034, 0.255, 0.010, M.darkSteel, 0, 0, 0.14));
    for (var w = 0; w < 7; w++) {
      var wr = mBox(0.030, 0.038, 0.020, w % 2 ? M.polymer : M.polymerLt, 0, 0, 0.035 + w * 0.033);
      wr.rotation.x = w % 2 ? 0.5 : -0.5;
      g.add(wr);
    }
    g.add(rBox(0.030, 0.038, 0.020, 0.008, M.brass, 0, 0, 0.268));
    // 镡（圆形护手）+ 鎺
    var tsuba = mCylZ(0.052, 0.052, 0.010, M.brass, 24);
    tsuba.position.set(0, 0, 0.006); g.add(tsuba);
    g.add(ringZ(0.050, 0.004, M.darkSteel, 0, 0, 0.006, 24));
    g.add(rBox(0.024, 0.036, 0.026, 0.008, M.brass, 0, 0, -0.012));
    // 刀身：分段沿弧线，段间重叠。
    // 关键一：链条前进方向必须与该段自身朝向一致——前进方向是局部 -Z 旋转后的
    // (0, +sin, -cos)。y 分量取反就成了"每段上翘、位置却往下挪"的锯齿楼梯。
    // 关键二：每段的截面必须是**矩形**。原来在段前端把刃侧收进 5mm 想做刃倒角，
    // 但那是在每一段内部各收一次，到下一段又弹回去，于是刃线一节一个台阶，
    // 整条刃变成 12 齿的锯子。收窄只能跨段做（halfW 随 t 递减），段内必须等宽。
    // 段数多、重叠少（0.52）刀脊才平顺；重叠给到 0.56 每节端角都会顶出 4mm 的小齿。
    var seg = 12, segLen = 0.60 / seg, py = 0.004, pz = -0.026, ang = 0;
    for (var i = 0; i < seg; i++) {
      var t = i / (seg - 1);
      var halfW = 0.019 - t * 0.005;
      var s = bladeMesh([
        [halfW, segLen * 0.52], [halfW, -segLen * 0.52],
        [-halfW, -segLen * 0.52], [-halfW, segLen * 0.52]
      ], 0.0075, M.blade);
      ang = t * 0.15;
      s.rotation.x = ang;
      s.position.set(0, py + Math.sin(ang) * segLen * 0.5, pz - Math.cos(ang) * segLen * 0.5);
      g.add(s);
      py += Math.sin(ang) * segLen; pz -= Math.cos(ang) * segLen;
    }
    // 切先（刀尖）
    var tip = bladeMesh([
      [0.014, 0.004], [0.005, -0.052], [-0.013, -0.028], [-0.012, 0.004]
    ], 0.0075, M.blade);
    tip.rotation.x = ang; tip.position.set(0, py, pz); g.add(tip);
    if (withHands) addHands(g, [0, 0, 0.075], [0, 0, 0.195], { rRotX: 0.15, lRotX: 0.15 });
    return g;
  }
  // -------------------- 近战：尼泊尔军刀 --------------------
  function buildKukri(withHands) {
    var M = weaponMats();
    var g = new THREE.Group();
    // 木柄：两端粗中间细，带黄铜箍与尾冠
    g.add(rBox(0.030, 0.034, 0.130, 0.014, M.woodDark, 0, 0, 0.082));
    g.add(ringZ(0.020, 0.005, M.brass, 0, 0, 0.024, 18));
    g.add(ringZ(0.021, 0.005, M.brass, 0, 0, 0.132, 18));
    g.add(rBox(0.034, 0.038, 0.020, 0.010, M.brass, 0, 0, 0.155));
    // 刃根护环：要和刀身根部一样高（44mm）才能把 44mm 高的刀身接到 34mm 的柄上。
    // 只有 18mm 高的话，刀身根部两侧各露出一截，看着像刀片直接插进木头。
    g.add(rBox(0.040, 0.042, 0.022, 0.008, M.darkSteel, 0, 0.003, 0.012));
    // 刀身：标志性的前弯下坠轮廓，一体挤出。
    // 刀尖要真的尖：最后 30mm 必须把刃宽从 48mm 收到 20mm 再收到 0，
    // 否则不管把顶点挪到哪儿，尖角都停在 60° 上，远看就是一截平头。
    // 刀脊也要多给几个点，从 0.02 到 0.5 逐段变斜；一步跳过去就是个明显的折角。
    var blade = bladeMesh([
      [0.026, 0.004], [0.025, -0.040], [0.020, -0.080], [0.010, -0.125],
      [-0.004, -0.170], [-0.018, -0.208], [-0.032, -0.240], [-0.054, -0.268],
      [-0.064, -0.296],
      [-0.074, -0.268], [-0.080, -0.244], [-0.078, -0.208], [-0.066, -0.170],
      [-0.050, -0.125], [-0.038, -0.080], [-0.024, -0.040], [-0.018, 0.004]
    ], 0.0085, M.blade);
    g.add(blade);
    // 刀脊暗色带。刃根的 cho 缺口不做了：缺口是往刃里**切**进去的，没有 CSG 只能
    // 贴一个凸出的小方块，渲出来就是刃下方悬着一颗黑点，比不做更假。
    g.add(mBox(0.005, 0.009, 0.090, M.darkSteel, 0.0045, 0.015, -0.060));
    if (withHands) addHands(g, [0, 0, 0.082], null, { rRotX: 0.2 });
    return g;
  }
  // -------------------- 近战：电锯 --------------------
  function buildChainsaw(withHands) {
    var M = weaponMats();
    var orange = new THREE.MeshStandardMaterial({ color: 0xe0631a, roughness: 0.42, metalness: 0.18, envMapIntensity: 0.8 });
    var orangeDk = new THREE.MeshStandardMaterial({ color: 0xa84710, roughness: 0.48, metalness: 0.15, envMapIntensity: 0.7 });
    var barMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.28, metalness: 0.88, envMapIntensity: 1.35 });
    var g = new THREE.Group();
    // 机体（圆角外壳 + 侧盖 + 散热格栅）
    g.add(rBox(0.125, 0.145, 0.30, 0.030, orange, 0, 0, -0.01));
    g.add(rBox(0.132, 0.070, 0.16, 0.020, orangeDk, 0, -0.045, 0.03));
    g.add(rBox(0.106, 0.110, 0.11, 0.024, M.darkSteel, 0.020, 0.020, 0.115));
    addRibs(g, 5, orangeDk, 0.066, 0.030, -0.075, 0.026, 0.006, 0.070, 0.014);
    // 启动拉绳盘 + 拉手
    var pull = mCylZ(0.030, 0.030, 0.016, M.polymer, 18);
    pull.position.set(0.020, 0.020, 0.176); g.add(pull);
    g.add(rBox(0.030, 0.014, 0.012, 0.005, M.polymerLt, 0.020, 0.055, 0.178));
    // 排气口 + 火花塞
    g.add(rBox(0.020, 0.034, 0.040, 0.008, M.darkSteel, -0.066, 0.010, 0.06));
    var plug = mCylY(0.010, 0.010, 0.024, M.trimSteel, 12);
    plug.position.set(-0.020, 0.082, 0.10); g.add(plug);
    // 顶部提把（立起的环）+ 后握把 + 护手挡板
    g.add(loopX(0.058, 0.014, M.polymer, 0.0, 0.135, -0.02, 24));
    g.add(rBox(0.030, 0.050, 0.05, 0.010, M.darkSteel, 0, 0.098, -0.02));
    g.add(rBox(0.048, 0.090, 0.09, 0.020, M.polymer, 0, -0.035, 0.195));
    addRibs(g, 4, M.polymerLt, 0, -0.072, 0.165, 0.022, 0.050, 0.010, 0.014);
    g.add(rBox(0.014, 0.075, 0.075, 0.010, M.polymerLt, 0, 0.075, 0.055));
    // 导板：从机体前端伸出（有重叠），前端为侧向圆盘（链条绕行的鼻轮）
    g.add(rBox(0.024, 0.120, 0.46, 0.010, barMat, 0, 0.020, -0.36));
    var barTip = mCylY(0.060, 0.060, 0.024, barMat, 24);
    barTip.rotation.z = Math.PI / 2;
    barTip.position.set(0, 0.020, -0.575); g.add(barTip);
    g.add(rBox(0.030, 0.075, 0.07, 0.012, M.darkSteel, 0, 0.020, -0.155));
    // 链条：贴着导板边缘环绕一圈（上、下、前端弧）
    var teeth = new THREE.Group();
    for (var k = 0; k < 13; k++) {
      var tz = -0.175 - k * 0.031;
      teeth.add(mBox(0.026, 0.014, 0.020, M.darkSteel, 0, 0.081, tz));
      teeth.add(mBox(0.026, 0.014, 0.020, M.darkSteel, 0, -0.041, tz));
    }
    for (var a = 0; a < 7; a++) {
      var th = -Math.PI / 2 + (a / 6) * Math.PI;
      teeth.add(mBox(0.026, 0.016, 0.016, M.darkSteel, 0,
        0.020 + Math.cos(th) * 0.061, -0.575 - Math.sin(th) * 0.061));
    }
    g.add(teeth);
    g.userData.chainTeeth = true;
    g.userData.chain = teeth;
    if (withHands) addHands(g, [0, -0.038, 0.195], [0, 0.135, -0.02], { rRotX: 0.2 });
    return g;
  }

  var MELEE_BUILDERS = { knife: buildKnife, axe: buildAxe, katana: buildKatana, kukri: buildKukri, chainsaw: buildChainsaw };
  function buildMeleeModel(id, withHands) {
    var fn = MELEE_BUILDERS[id] || buildKnife;
    return fn(withHands);
  }

  // ----------------------------------------------------------
  // 第一人称枪械模型
  // ----------------------------------------------------------
  function createGunModels() {
    vmGunGroup = new THREE.Group();
    ['pistol', 'shotgun', 'rifle', 'awp', 'dmr', 'lmg'].forEach(function (id) {
      var model = buildGunModel(id, true);
      muzzleAnchors[id] = model.userData.muzzle;
      vmGunGroup.add(model);
      gunModels[id] = model;
    });
    vmGroup.add(vmGunGroup);
  }

  // ----------------------------------------------------------
  // 第一人称近战模型
  // ----------------------------------------------------------
  function createMeleeModels() {
    vmMeleeGroup = new THREE.Group();
    ['knife', 'axe', 'katana', 'kukri', 'chainsaw'].forEach(function (id) {
      var model = buildMeleeModel(id, true);
      vmMeleeGroup.add(model);
      meleeModels[id] = model;
    });
    vmGroup.add(vmMeleeGroup);
  }

  function buildViewmodels() {
    vmGroup = new THREE.Group();
    vmGroup.position.set(0.32, -0.3, -0.55);
    camera.add(vmGroup);
    scene.add(camera);

    createGunModels();
    createMeleeModels();
    applyWeaponVisibility();
  }

  function applyWeaponVisibility() {
    var isMelee = local.current === 'melee';
    vmGunGroup.visible = !isMelee;
    vmMeleeGroup.visible = isMelee;
    // 切枪/重生都会走到这儿：正在播的换弹动画必须就地终止并把零件归位，
    // 不然下次把这把枪掏出来时，弹匣还悬在半空、套筒还是拉开的。
    cancelReloadAnim();

    Object.keys(gunModels).forEach(function (id) {
      gunModels[id].visible = !isMelee && id === currentRangedId();
    });
    Object.keys(meleeModels).forEach(function (id) {
      meleeModels[id].visible = isMelee && id === local.melee;
    });
  }

  // ----------------------------------------------------------
  // 换弹动作（第一人称 / 第三人称共用）
  //
  // 一份姿态函数两边用：零件（弹匣、拉机柄、泵、霰弹）的运动写在**模型本地
  // 坐标**里，所以第三人称把整枪缩到 0.68 倍时，位移会自动跟着缩，不用另写一套。
  // 函数只负责摆零件，再把"枪身该怎么歪"以偏移量的形式返回给调用方——
  // 第一人称歪的是 model 自己，第三人称歪的是 weaponGroup，两者坐标系不同，
  // 不能在这里直接写。
  // ----------------------------------------------------------
  var RELOAD_STYLE = {
    pistol: 'mag', rifle: 'mag', dmr: 'mag', lmg: 'mag', awp: 'bolt', shotgun: 'pump'
  };
  // 拉机柄/枪机/泵的行程：手枪套筒短，狙的枪机和泵的行程长
  var RELOAD_THROW = { pistol: 0.030, rifle: 0.055, dmr: 0.055, lmg: 0.040, awp: 0.085, shotgun: 0.100 };

  // 段内归一化进度：u 落在 [a,b] 外就吃 0/1，落在内就线性升到 1
  function rlSeg(u, a, b) {
    if (u <= a) return 0;
    if (u >= b) return 1;
    return (u - a) / (b - a);
  }
  function rlEase(t) { return t * t * (3 - 2 * t); }         // 平滑起停
  function rlMix(a, b, t) { return a + (b - a) * t; }

  // 零件回到原位。切枪、死亡、动画结束都要调，否则弹匣会永远悬在半空。
  function resetReloadParts(model) {
    if (!model || !model.userData) return;
    var d = model.userData;
    if (d.mag) { d.mag.position.set(0, 0, 0); d.mag.visible = true; }
    if (d.charge) d.charge.position.set(0, 0, 0);
    if (d.shell) { d.shell.position.set(0, 0, 0); d.shell.visible = false; }
    if (d.handL) {
      d.handL.position.copy(d.handL.userData.home);
      d.handL.rotation.x = d.handL.userData.homeRotX || 0;
      if (d.handL.userData.hideIdle) d.handL.visible = false;   // 手枪的支撑手收回去
    }
  }

  // 拉机柄组的几何中心：换弹尾段左手要伸过去拉一下。
  // 不能用 Box3.setFromObject —— 它算的是**世界**空间的盒子，而第一人称的枪挂在
  // camera 底下，量出来会把相机的位置一起算进去（左手会飞到 y≈1.0 的地方）。
  // 零件都是 charge 组的直接子级，而 charge 的原点就是枪身原点，
  // 所以直接平均子件的 position 就是模型本地坐标里的中心。
  function reloadChargeCenter(model) {
    var d = model.userData;
    if (d.chargeCenter) return d.chargeCenter;
    var c = new THREE.Vector3(0, 0.06, 0.18);
    if (d.charge && d.charge.children.length) {
      c.set(0, 0, 0);
      d.charge.children.forEach(function (ch) { c.add(ch.position); });
      c.multiplyScalar(1 / d.charge.children.length);
    }
    d.chargeCenter = c;
    return c;
  }

  // 摆一帧换弹姿态。
  //   model : 枪模型（buildGunModel 造的，userData 上有 mag/charge/shell/magWell）
  //   id    : 武器 id
  //   u     : 0→1 的动作进度
  //   hands : true 时顺便摆第一人称的左手（第三人称的手是骨骼，另算）
  // 返回 { px,py,pz, rx,ry,rz }：枪身相对本位该加的偏移。
  function poseReloadParts(model, id, u, hands) {
    var d = model.userData || {};
    var style = RELOAD_STYLE[id] || 'mag';
    var throwZ = RELOAD_THROW[id] || 0.05;
    var well = d.magWell ? d.magWell.position : new THREE.Vector3(0, -0.09, 0);
    // 枪身整体的"歪一下"：一个 sin 钟形，动作中段最歪，首尾自动归零
    var k = Math.sin(clamp(u, 0, 1) * Math.PI);
    var body = {
      px: -0.020 * k, py: -0.060 * k, pz: 0.050 * k,
      rx: 0.120 * k, ry: 0.220 * k, rz: -0.420 * k
    };
    var lh = d.handL, home = lh ? lh.userData.home : null;
    var hx = 0, hy = 0, hz = 0;               // 左手相对本位的偏移

    if (style === 'pump') {
      // 泵动枪：一发一发压弹，最后推一次泵。压 3 发够读出"在装弹"这件事了。
      var INS_A = 0.12, INS_B = 0.62, PUMP_A = 0.74;
      var sh = d.shell;
      // 取弹点：弹口外下方。整段动作都以它为"手的中转站"，
      // 进出压弹循环时都从这里出发/回到这里，接缝才不会瞬移（原来一次跳 20cm）。
      var gx = -0.075, gy = -0.170, gz = 0.065;
      if (u < INS_A) {
        var pin = rlEase(u / INS_A);
        hx = gx * pin; hy = gy * pin; hz = gz * pin;
        if (sh) sh.visible = false;
      } else if (u < INS_B) {
        // 一个循环＝顶进去（前 62%）+ 空手退回去拿下一发（后 38%）。
        // 循环首尾都落在取弹点上，所以循环之间也是连续的。
        var span = (INS_B - INS_A) / 3;
        var ph = ((u - INS_A) % span) / span;
        var fwd = ph < 0.62;
        var e = fwd ? rlEase(ph / 0.62) : (1 - rlEase((ph - 0.62) / 0.38));
        var sx = rlMix(-0.075, 0, e), sy = rlMix(-0.115, 0, e), sz = rlMix(0.045, 0, e);
        if (sh) { sh.visible = fwd; sh.position.set(sx, sy, sz); }   // 退回时弹已进膛，藏掉
        hx = sx; hy = sy - 0.055; hz = sz + 0.02;
      } else {
        if (sh) sh.visible = false;
        var pout = rlEase(rlSeg(u, INS_B, PUMP_A));
        hx = gx * (1 - pout); hy = gy * (1 - pout); hz = gz * (1 - pout);
      }
      if (d.charge) {
        var pz = 0;
        if (u >= PUMP_A) {
          // 拉到底再推回：前 45% 往后，后 55% 回位，回位收得更急才有"咔嚓"的力度
          var pu = rlSeg(u, PUMP_A, 1);
          pz = pu < 0.45 ? rlEase(pu / 0.45) : (1 - rlEase((pu - 0.45) / 0.55));
          hx = 0; hy = 0; hz = throwZ * pz;                // 左手压在泵上一起走
        }
        d.charge.position.z = throwZ * pz;
      }
      if (u > INS_A && u < INS_B) body.rz = -0.520 * k;    // 压弹时把弹口翻得更朝上
    } else {
      // 弹匣枪 / 栓动枪：退匣 → 上匣 → 拉栓（放套筒）
      var OUT_B = 0.18;      // 旧匣落到位
      var IN_A = 0.30, IN_B = 0.64;   // 新匣顶上
      var TAP = 0.70;        // 拍实
      var CH_A = 0.74;       // 拉机柄
      var DROP = -0.34;      // 弹匣脱出的落差
      if (d.mag) {
        if (u < IN_A) {
          var o = rlEase(rlSeg(u, 0, OUT_B));
          d.mag.position.set(0, DROP * o, -0.02 * o);
          d.mag.visible = u < OUT_B * 0.92;   // 落到位就当"掉出画面"，直接藏掉
        } else {
          d.mag.visible = true;
          var i = rlEase(rlSeg(u, IN_A, IN_B));
          var my = rlMix(DROP, -0.012, i);
          // 最后 12mm 不是插进去的，是拍进去的：单独一段更短的位移
          if (u >= IN_B) my = rlMix(-0.012, 0, rlEase(rlSeg(u, IN_B, TAP)));
          d.mag.position.set(0, my, 0);
        }
      }
      if (d.charge) {
        var cu = rlSeg(u, CH_A, 1);
        var cz = cu <= 0 ? 0 : (cu < 0.4 ? rlEase(cu / 0.4) : (1 - rlEase((cu - 0.4) / 0.6)));
        d.charge.position.z = throwZ * cz;
      }
      if (home) {
        // 三段的接缝必须**数值上**对齐，否则手会在段边界瞬移。
        // 上一版第 1 段瞄"弹匣井下方 16cm"、第 2 段起点却是"下方 10cm + 新匣落差"，
        // 差了 14cm；第 2 段结束还带着 -0.10 的偏移、第 3 段直接从弹匣井算，又差 11cm。
        // 现在把这几个点先算成命名量，段与段之间共用同一个端点值。
        var wellHx = well.x - home.x, wellHz = well.z - home.z;
        var wellHy = well.y - home.y - 0.10;          // 手托在弹匣井下方 10cm（中间隔着弹匣）
        var grabHx = wellHx - 0.05, grabHz = wellHz + 0.03;
        var grabHy = wellHy + DROP * 0.55;            // 掏匣的高度＝新匣起点的高度
        if (u < IN_A) {
          // 左手离开护木，下探到弹匣井外侧去接新匣
          var g1 = rlEase(rlSeg(u, 0, IN_A));
          hx = grabHx * g1; hy = grabHy * g1; hz = grabHz * g1;
        } else if (u < TAP) {
          // 托着新匣一路顶上去：手的高度直接跟弹匣绑定，不会脱开
          var g2 = rlEase(rlSeg(u, IN_A, TAP));
          hx = rlMix(grabHx, wellHx, g2);
          hy = wellHy + (d.mag ? d.mag.position.y : 0) * 0.55;
          hz = rlMix(grabHz, wellHz, g2);
        } else if (style === 'bolt') {
          // 栓动枪的枪机是**右手**的活（左手一直托着护木）。让左手横过机匣去拉栓
          // 会拧成一个不可能的姿势，所以这一段只把左手送回护木，枪机自己走。
          var gb = rlEase(rlSeg(u, TAP, 1));
          hx = wellHx * (1 - gb); hy = wellHy * (1 - gb); hz = wellHz * (1 - gb);
        } else {
          // 去拉机柄，再回护木
          var cc = reloadChargeCenter(model);
          var g3 = rlEase(rlSeg(u, TAP, 0.86));
          var g4 = rlEase(rlSeg(u, 0.86, 1));
          var tx = rlMix(wellHx, cc.x - home.x, g3);
          var ty = rlMix(wellHy, cc.y - home.y - 0.03, g3);
          var tz = rlMix(wellHz, cc.z - home.z + (d.charge ? d.charge.position.z : 0), g3);
          hx = rlMix(tx, 0, g4); hy = rlMix(ty, 0, g4); hz = rlMix(tz, 0, g4);
        }
      }
    }

    if (hands && lh && home) {
      lh.visible = true;                      // 手枪的支撑手在这一刻才出现
      lh.position.set(home.x + hx, home.y + hy, home.z + hz);
      // 手腕跟着翻一点，不然下探时手掌还是水平的，像块贴上去的方块
      lh.rotation.x = (lh.userData.homeRotX || 0) + 0.35 * k;
    }
    return body;
  }

  // ----------------------------------------------------------
  // 远端玩家模型（美化版）
  // ----------------------------------------------------------
  // color 可选：默认白色（玩家）。练枪靶子传橙色——头顶一排浮字的时候，
  // 靠颜色一眼分清哪个是真人、哪个是靶子，比去读字快。
  function makeNameSprite(name, color) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(10,14,18,0.72)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 14);
      ctx.fill();
    } else {
      ctx.fillRect(8, 8, 240, 48);
    }
    ctx.font = 'bold 28px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(name, 128, 34);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 0.65, 1);
    return sprite;
  }

  function createHealthBar() {
    var group = new THREE.Group();
    var bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide })
    );
    var fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x3fb950, side: THREE.DoubleSide })
    );
    fill.position.z = 0.002;
    group.add(bg);
    group.add(fill);
    return { group: group, fill: fill };
  }

  // 迷彩贴图（按色调分桶缓存）
  function getCamoTexture(bucket) {
    var palettes = [
      ['#4b5320', '#6b6b3a', '#3a4018', '#2b2f14'],
      ['#5a5240', '#7a6f52', '#403a2c', '#2e2a20'],
      ['#3a4a5a', '#54687a', '#2a3644', '#1e2833'],
      ['#5a3f2a', '#7a5a3c', '#402c1c', '#2c1e14'],
      ['#3a4a3a', '#556b52', '#2a382a', '#1e281e'],
      ['#4a4550', '#666070', '#332f3a', '#242028']
    ];
    var pal = palettes[bucket % palettes.length];
    // repeat 留在 [1,1]：迷彩的世界尺寸不在这里定，而是由 fixLatheCamoUV
    // 把 uv 直接写成「米 / CAMO_TILE」。用 repeat 调的话对每个部位都是同一个倍数，
    // 而各部位的胶囊尺寸差好几倍，必然对谁都不准。
    return makeTex('camo_' + bucket, 256, function (ctx, w, h) {
      ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, w, h);
      function blob(color, count, size) {
        ctx.fillStyle = color;
        for (var i = 0; i < count; i++) {
          var x = Math.random() * w, y = Math.random() * h;
          ctx.beginPath();
          var pts = 6 + Math.floor(Math.random() * 4);
          for (var p = 0; p < pts; p++) {
            var a = (p / pts) * Math.PI * 2;
            var rr = size * (0.5 + Math.random() * 0.7);
            var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
            if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill();
        }
      }
      blob(pal[1], 22, 30);
      blob(pal[2], 20, 24);
      blob(pal[3], 26, 16);
      speckle(ctx, w, h, 500, 0.03, 0.1, 2, function (a) { return 'rgba(0,0,0,' + a + ')'; });
    }, { repeat: [1, 1] });
  }

  // 迷彩斑的目标世界尺寸（米）：一个贴图 tile 的边长。
  // 真实多地形迷彩的斑块约 10~20cm。取 0.115 试过，近距离偏碎、像撒了一层confetti
  // （贴图里最小那层斑只有 16/256 → 0.7cm），抬到 0.15 之后大腿周向 4 个 tile、
  // 单斑 14.3cm，近看成块、远看糊成一个色调，两头都对。
  var CAMO_TILE = 0.15;

  // three.js 的 CapsuleGeometry 继承 LatheGeometry，v 坐标按**轮廓点序号**均分：
  //     uv.y = j / (points.length - 1)
  // 而胶囊的轮廓里，两个球冠各占 capSegments*2 段，圆柱侧面只占 **1 段**
  // （Path.absellipse 在两段圆弧之间补的那条 LineCurve，getPoints 只给它 1 段）。
  // 实测 CapsuleGeometry(0.091, 0.34, 6, 14)：26 个轮廓点，侧面那一段覆盖
  // 整整 0.34m 的高度却只分到 dv=0.04，周向却占满 u=1.0（周长 0.572m）——
  // 沿长度方向被拉伸 **14.87 倍**。这才是腿上那些竖条的真正来源。
  // 注意它和多边形段数无关：radialSegments 从 8 提到 14 之后画面一模一样，
  // 而且按「v 沿高均匀」估出来的长宽比是 0.91，看着完全正常——所以这个 bug
  // 靠算长宽比是发现不了的，必须去读 uv 属性本身。
  //
  // 这里按**轮廓弧长**重算 v、按周长重算 u，两个方向的单位都换成「米 / CAMO_TILE」。
  // 好处不只是消掉拉伸：各部位的迷彩尺寸自动统一（躯干和小臂的斑一样大），
  // 不再需要靠 map.repeat 去手调一个对谁都不准的折中值。
  function fixLatheCamoUV(geo, radialSeg, kx, ky) {
    var pos = geo.attributes.position, uv = geo.attributes.uv;
    var pc = pos.count / (radialSeg + 1);       // 每环的轮廓点数
    if (pc !== Math.floor(pc)) return geo;      // 不是预期的 lathe 排布，不动它
    var s = new Float32Array(pc), maxR = 0, prevR = 0, prevY = 0, acc = 0, j, i;
    for (j = 0; j < pc; j++) {
      // kx/ky 是这块网格自身的非等比缩放（躯干被压成 0.94/1/0.66）。
      // 弧长要在**缩放后**的尺度上算，否则扁躯干上的斑还是会横向压扁。
      var r = Math.hypot(pos.getX(j), pos.getZ(j)) * kx;
      var y = pos.getY(j) * ky;
      if (j > 0) acc += Math.hypot(r - prevR, y - prevY);
      s[j] = acc; prevR = r; prevY = y;
      if (r > maxR) maxR = r;
    }
    // 周向必须取**整数个 tile**：i=0 和 i=radialSeg 是同一条棱，
    // u 不落在整数上的话背面会留一条对不齐的竖缝。
    var uTiles = Math.max(1, Math.round(2 * Math.PI * maxR / CAMO_TILE));
    for (i = 0; i <= radialSeg; i++) {
      for (j = 0; j < pc; j++) {
        uv.setXY(i * pc + j, (i / radialSeg) * uTiles, s[j] / CAMO_TILE);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }
  function camoCapsule(radius, length, capSeg, radialSeg, kx, ky) {
    return fixLatheCamoUV(
      new THREE.CapsuleGeometry(radius, length, capSeg, radialSeg),
      radialSeg, kx || 1, ky || 1
    );
  }

  function createRemotePlayer(id, name) {
    var group = new THREE.Group();
    var bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    var bucket = Math.abs(id) % 6;
    var hue = (id * 0.61803398875) % 1;
    var camoTex = getCamoTexture(bucket);
    var accent = new THREE.Color().setHSL(hue, 0.55, 0.5);

    var suitMat = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.85, metalness: 0.05, transparent: true, opacity: 1 });
    // 装具分三档明度，否则整个上身糊成一块黑：
    // gearMat（最暗，硬件/背包）< armorMat（中间偏冷，护板护具）< vestMat（最亮偏暖，背心织带）
    // 再加一个土黄色的 pouchMat 给织物弹匣包——真实单兵装具就是这种狼棕色，
    // 全做成黑的既不写实也分不出层次。
    var gearMat = new THREE.MeshStandardMaterial({ color: 0x2e3129, roughness: 0.7, metalness: 0.2, transparent: true, opacity: 1 });
    var vestMat = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 0.8, metalness: 0.06, transparent: true, opacity: 1 });
    var pouchMat = new THREE.MeshStandardMaterial({ color: 0x6a5f45, roughness: 0.88, metalness: 0.04, transparent: true, opacity: 1 });
    var skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a878, roughness: 0.85, transparent: true, opacity: 1 });
    var maskMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7, transparent: true, opacity: 1 });
    // 头套/颈套。原来整个头就是一块 skinMat 倒角盒，护目镜之外全是没有五官的肉色平面——
    // 低多边形做人脸只会像块橡皮泥，而真实特勤装具本来就是全覆盖头套，索性顺着做。
    // 明度必须卡在头盔和镜体之间（头盔 0x3c4142 亮 > 头套 0x282c31 > 镜体 0x121316 暗），
    // 三件叠在一起才有层次；做得和镜体一样黑，整个头会糊成一团看不出形状。
    var hoodMat = new THREE.MeshStandardMaterial({ color: 0x282c31, roughness: 0.88, metalness: 0.02, transparent: true, opacity: 1 });
    var gogMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.25, metalness: 0.5, transparent: true, opacity: 1 });
    // 镜片。metalness 0.4 + roughness 0.2 时正面几乎全黑，只有左右两端擦到天光才亮——
    // 结果不像一整片风镜，而像太阳穴上贴了两个发光小方块。
    // 金属度压到 0.12、粗糙度抬到 0.34，镜面高光摊开，整片才有一致的色调；
    // 颜色也从 0x88e0ff 收深一档，否则在 ACES 下是一条霓虹灯管。
    var lensMat = new THREE.MeshStandardMaterial({ color: 0x6fbcd8, emissive: 0x2a6688, emissiveIntensity: 0.45, roughness: 0.34, metalness: 0.12, transparent: true, opacity: 1 });
    var helmetMat = new THREE.MeshStandardMaterial({ color: 0x3c4142, roughness: 0.55, metalness: 0.25, transparent: true, opacity: 1 });
    var bootMat = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.6, transparent: true, opacity: 1 });
    var accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent.clone().multiplyScalar(0.25), roughness: 0.5, transparent: true, opacity: 1 });
    // 护具（护膝/护肘/护板/扣具）。金属度别开高：0.35 + 粗糙度 0.5 会把整片蓝天
    // 镜面反射进来，正面看护膝就是两块发亮的浅蓝塑料片，一眼假。
    // 真实护具是橡胶/尼龙包边的哑光件，压到 0.16 / 0.62 才像。
    // 明度仍然排在 gearMat 和 vestMat 中间（偏冷），三档层次不能塌成一块。
    var armorMat = new THREE.MeshStandardMaterial({ color: 0x34383c, roughness: 0.62, metalness: 0.16, transparent: true, opacity: 1 });
    var bodyMats = [suitMat, gearMat, vestMat, pouchMat, skinMat, maskMat, hoodMat, helmetMat, bootMat, accentMat, armorMat, gogMat];

    // 硬边盒在任何光照下都只有一片死板的平光，倒角边能抓到一条高光。
    // 人物身上小件最多，所以装具全部走倒角盒（几何体按尺寸缓存，多个玩家共用）。
    function P(w, h, d, mat, x, y, z, axis) {
      var rr = Math.min(0.030, Math.min(w, Math.min(h, d)) * 0.26);
      var m = rBox(w, h, d, rr, mat, x, y, z, axis || 'z');
      m.receiveShadow = true;
      return m;
    }
    // 薄贴片（镜片、识别灯）没有厚度可倒角，保留硬边盒
    function PF(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; return m;
    }
    // 绕整圈的束带/箍带。只在侧面凸出一点的贴片在这个光照下读不出来
    // （侧立面本身没有明暗梯度），绕一整圈才能啃出一条会亮的边。
    // zk：人的躯干是扁的（宽 > 厚），正圆的环会在胸前和背后各鼓出四五厘米，
    // 所以必须把前后压扁。TorusGeometry 在局部 XY 面，转平之后局部 Y 才是世界 Z。
    function bandY(r, tube, mat, y, z, zk, seg) {
      var m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg || 18), mat);
      m.rotation.x = Math.PI / 2;
      m.scale.set(1, zk || 1, 1);
      m.position.set(0, y, z || 0);
      m.castShadow = true;
      return m;
    }
    var gear = new THREE.Group();   // 腰部及以下的静态装具，挂到 bodyGroup
    // 上身（躯干 + 背心 + 背包 + 护肩 + 两条手臂）整体绕脊柱侧转 BLADE。
    // 腰带/胯包不能进来：它们跟着骨盆，转了就会从骨盆盒里甩出去。
    var chest = new THREE.Group();
    chest.rotation.y = BLADE;


    // 朝向约定：**模型正面朝 -z**。
    // 这是引擎其他部分共同认定的方向——group.rotation.y = yaw 时局部 -z 正好
    // 映射到玩家前进方向 (-sin yaw, 0, -cos yaw)；weaponGroup 挂在负 z、
    // aimGroup.rotation.x = +pitch 抬起枪口，也都是按 -z 为前算的。
    // 原来这一块身体是照 +z 建的，结果背包挂在胸前、脸朝后、抬头时低头。

    // ---- 下半身 ----
    var pelvis = P(0.335, 0.20, 0.225, gearMat, 0, 0.94, 0);
    // 战术腰带：绕整圈 + 正面扣具（扣具用金属色，别做成荧光色的贴纸）
    // r/zk 跟着骨盆盒收窄，否则腰带会在腰的前后各鼓出三四厘米
    gear.add(bandY(0.182, 0.022, armorMat, 0.865, 0, 0.70, 20));
    gear.add(P(0.07, 0.05, 0.03, armorMat, 0, 0.865, -0.135));
    gear.add(P(0.10, 0.13, 0.085, pouchMat, -0.168, 0.94, -0.04));
    gear.add(P(0.10, 0.13, 0.085, pouchMat, 0.168, 0.94, -0.04));
    // 屁股后的水壶袋，让背面不空
    gear.add(P(0.12, 0.15, 0.085, pouchMat, -0.11, 0.95, 0.14));

    function createLeg(side) {
      var leg = new THREE.Group();
      // 站姿略微分开：原来 ±0.11 配 0.1 的大腿半径，两条大腿在 x=0.01 处几乎贴住，
      // 正面看下半身是一整块。
      leg.position.set(side * 0.118, 0.9, 0);
      // 段数 8→14 / 冠 4→6 纯粹是修轮廓：8 段的胶囊在几何上就是个八棱柱，
      // 侧影能看出直边。**它跟迷彩竖条无关**——提到 14 之后画面一模一样，
      // 竖条是 CapsuleGeometry 的 UV 坏的，由 camoCapsule 修（见 fixLatheCamoUV）。
      // 整具人物为此只多约 2000 面。
      var thigh = new THREE.Mesh(camoCapsule(0.091, 0.34, 6, 14), suitMat);
      thigh.position.y = -0.24; thigh.castShadow = true; leg.add(thigh);
      var shin = new THREE.Mesh(camoCapsule(0.079, 0.34, 6, 14), suitMat);
      shin.position.y = -0.62; shin.castShadow = true; leg.add(shin);
      // 护膝比小腿略宽（0.172 > 0.158），凸出轮廓才看得见"戴了护膝"
      var knee = P(0.172, 0.13, 0.15, armorMat, 0, -0.44, -0.055); leg.add(knee);
      // 大腿绑腿包（只右腿，避免左右完全对称的塑料感）
      if (side > 0) leg.add(P(0.11, 0.17, 0.09, pouchMat, 0.10, -0.30, -0.02));
      // 靴子：鞋帮 + 鞋头包头 + 鞋底，靴口一道绕圈的束带。
      // 高度是照「鞋底底面正好落在 y=0」倒推的：rBox 的倒角会让截面两个方向
      // 各外扩一个 bevelSize(7mm)，按标称尺寸摆会整只脚陷进地里 6cm。
      leg.add(P(0.145, 0.16, 0.20, bootMat, 0, -0.778, 0.01));
      leg.add(P(0.135, 0.10, 0.13, bootMat, 0, -0.811, -0.115));
      // 靴口箍带：z 方向要放大才会露在鞋帮外面（鞋帮前后比左右厚）
      var ank = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.011, 6, 14), gearMat);
      ank.rotation.x = Math.PI / 2; ank.scale.set(1, 1.28, 1);
      ank.position.set(0, -0.713, 0.01); ank.castShadow = true; leg.add(ank);
      var sole = P(0.155, 0.045, 0.33, gearMat, 0, -0.8705, -0.035); leg.add(sole);
      return leg;
    }
    var leftLeg = createLeg(-1);
    var rightLeg = createLeg(1);

    // ---- 躯干 + 战术背心 ----
    // 尺寸要按「背心只包胸背、包不到三角肌」来定。原来背心做到 0.44 宽，
    // 跟肩同宽，手臂插口在 ±0.245（上臂半径 0.073 → 内缘 0.172）直接埋进背心里，
    // 从正面看只有两个圆截面从胸口顶出来——这就是最明显的一处穿模。
    // 前后也一样：背心 0.33 厚 + 背包 0.20 摆在 z=0.245，整个人 0.55m 厚，
    // 侧视就是个带腿的冰箱。真人胸厚约 0.24、连背包约 0.45。
    // 躯干是压扁的（0.94/1/0.66），弧长得按压扁后的尺度算，
    // 所以把横向缩放（0.94 和 0.66 的均值 0.80）传给 camoCapsule——
    // 否则胸前的迷彩斑会跟着网格一起被横向挤窄三分之一。
    var torso = new THREE.Mesh(camoCapsule(0.2, 0.36, 7, 18, 0.80, 1), suitMat);
    torso.scale.set(0.94, 1, 0.66); torso.position.y = 1.28; torso.castShadow = true;
    chest.add(torso);
    chest.add(P(0.345, 0.48, 0.26, vestMat, 0, 1.28, -0.01));
    // 前后护板。**前板必须用偏亮的织物色**：真实防弹背心外面是一层尼龙载具，
    // 硬板在里面。之前前板用了 armorMat，0.305×0.40 的一整块暗色正好盖住整个胸口，
    // 分好的三档明度全被压在它后面，正面看就是一块带腿的黑板。
    // 现在反过来——载具是中间调，压在上面的织带/盖片才是暗的，暗色变成"线"而不是"面"。
    //
    // 宽度从 0.305 收到 0.250：真人 10×12" 硬板宽 25.4cm，躯干宽 40cm，
    // 折算到这里的 0.376 躯干应该是 0.24。原来的 0.305 等于板子从锁骨包到三角肌，
    // 把**右肩窝**整个填掉了——枪托靠肩时只能扎进板子里（实测 20.6mm）。
    chest.add(P(0.250, 0.40, 0.045, vestMat, 0, 1.31, -0.142));      // 前载具
    chest.add(P(0.258, 0.028, 0.050, gearMat, 0, 1.497, -0.145));    // 前载具上沿包边
    chest.add(P(0.250, 0.38, 0.045, armorMat, 0, 1.31, 0.122));      // 后护板
    // MOLLE 织带：横向一道，压在载具正面（z 要比载具前脸 -0.172 更靠前才看得见）
    chest.add(P(0.212, 0.022, 0.016, gearMat, 0, 1.315, -0.180));
    // 腰封（绕整圈）把前后护板箍在一起
    chest.add(bandY(0.178, 0.026, gearMat, 1.065, -0.01, 0.80, 20));
    // 胸前四联弹匣包：每个上沿压一道盖片，盖片吃掉一点顶面的光才读得出层次。
    // 间距跟着载具一起收窄，否则弹匣包会从板子两侧支出去。
    for (var pc = 0; pc < 4; pc++) {
      var px = -0.0945 + pc * 0.063;
      chest.add(P(0.058, 0.130, 0.070, pouchMat, px, 1.21, -0.180));
      chest.add(P(0.065, 0.022, 0.080, gearMat, px, 1.285, -0.183));
    }
    // 肩带 + 左肩无线电 + 右肩快拆扣
    // 肩带只到肩顶（y≈1.48）。做到 1.61 会和领子连成一片黑，正面看像下巴底下
    // 焊了块铁板，脖子完全没了。
    // z 也很关键：肩带原来在 -0.133，而前载具的前脸在 -0.172——整条肩带埋在板子
    // 后面，等于白做。要压在载具**外面**（-0.185）才看得见。
    // 长度只留「翻过肩膀」那一段（y 1.42~1.51）。原来从 y=1.327 一路拉到 1.509，
    // 那截贴在胸口正面的竖条解剖上并不是肩带，只是装饰，
    // 而它恰好占住了**右肩窝**——枪托往肩上一靠就扎进去 18.8mm。
    var strapL = P(0.056, 0.088, 0.040, vestMat, -0.088, 1.462, -0.185); strapL.rotation.x = 0.10; chest.add(strapL);
    var strapR = P(0.056, 0.088, 0.040, vestMat, 0.088, 1.462, -0.185); strapR.rotation.x = 0.10; chest.add(strapR);
    chest.add(P(0.062, 0.10, 0.048, gearMat, -0.090, 1.452, -0.212));     // 左肩无线电
    var radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6), gearMat);
    radioAnt.position.set(-0.090, 1.57, -0.215); radioAnt.rotation.z = 0.18; chest.add(radioAnt);
    chest.add(P(0.048, 0.042, 0.045, armorMat, 0.090, 1.452, -0.210));    // 右肩快拆扣
    var collar = P(0.255, 0.11, 0.215, vestMat, 0, 1.535, 0); chest.add(collar);
    // 队伍识别灯：小一点。做大了就是贴在胸口的一张荧光贴纸
    chest.add(PF(0.045, 0.020, 0.015, accentMat, 0, 1.462, -0.182));

    // 背包：两道**绕整圈**的压缩带（宽高都超过背包本体、Z 向很薄）
    chest.add(P(0.295, 0.42, 0.165, gearMat, 0, 1.30, 0.205));
    for (var bp = 0; bp < 2; bp++) {
      chest.add(P(0.310, 0.030, 0.180, vestMat, 0, 1.40 - bp * 0.19, 0.205));
    }
    chest.add(P(0.255, 0.15, 0.105, pouchMat, 0, 1.10, 0.235));
    // 背面的队伍色识别块：从背后也能一眼分清敌我
    chest.add(PF(0.075, 0.024, 0.015, accentMat, 0, 1.485, 0.293));
    var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.50, 6), gearMat);
    antenna.position.set(0.125, 1.70, 0.245); antenna.rotation.z = -0.12; chest.add(antenna);

    // 肩部护片：真实装具是一层织物护肩，不是个球关节。
    // 压扁 + 用织带色，别做成又黑又圆的球，否则整个人像个玩具手办。
    // 尺寸/位置要照着手臂插口（x=±0.245，上臂半径 0.073 → 外缘 0.318）来定：
    // 原来是 r=0.125 摆在 ±0.268，外缘直接顶到 0.40，肩宽做到 80cm，
    // 远看两片就是横着支出去的翅膀。真人连甲的肩宽也就 55~60cm。
    var shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.098, 14, 10), vestMat);
    // z 向从 1.10 收到 0.80：1.10 等于前后 21.6cm 厚，真装具的肩片也就 15cm 上下。
    // 顺带解决一件事：侧身站姿把右肩往后带了 11cm，长枪的托正好停在这片里，
    // 精确椭球实测 AWP 陷进去 72mm；收薄之后前表面往后退，只剩 55mm，
    // 而上臂插在护肩里的深度一点没变（66mm）——肩膀照样盖得住。
    shoulderL.scale.set(1.0, 0.64, 0.80); shoulderL.position.set(-0.228, 1.468, -0.01);
    shoulderL.castShadow = true;
    var shoulderR = shoulderL.clone(); shoulderR.position.x = 0.228;
    chest.add(shoulderL, shoulderR);
    chest.add(P(0.09, 0.07, 0.15, gearMat, -0.205, 1.455, 0));
    chest.add(P(0.09, 0.07, 0.15, gearMat, 0.205, 1.455, 0));

    // ---- 头部（含头盔/护目镜/面罩/耳机）----
    var headGroup = new THREE.Group();
    headGroup.position.set(0, 1.56, 0);
    // 颈套而不是裸脖子。段数 8→14：0.06 半径的八棱柱在领口那一小截也看得出棱。
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 14), hoodMat);
    neck.position.y = 0.02; headGroup.add(neck);
    var head = P(0.17, 0.20, 0.18, hoodMat, 0, 0.14, 0);
    headGroup.add(head);
    // 眼部露出的一条皮肤。全黑头套会让「头」退化成一个纯色块，看不出里面是个人；
    // 留一条 3cm 的皮肤带，眼窝位置就有了参照，头的朝向也一眼能看出来。
    // z 定在 -0.0965（比面罩前脸 -0.0975 退后 1mm）：皮肤是**凹**进装具里的，
    // 顶出来就变成一条贴在脸上的肉色胶布。护目镜（y 0.123~0.181）压在它上沿，
    // 面罩上沿抬到 0.0975 托住它下沿，中间正好留出这 25.5mm。
    headGroup.add(PF(0.152, 0.030, 0.007, skinMat, 0, 0.110, -0.0930));
    // 头盔（球冠 + 帽檐 + 侧轨 + 后配重袋）
    var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
    helmet.position.set(0, 0.17, 0); helmet.scale.set(1.05, 1.06, 1.12); helmet.castShadow = true; headGroup.add(helmet);
    headGroup.add(P(0.21, 0.028, 0.075, helmetMat, 0, 0.192, -0.108));
    headGroup.add(P(0.052, 0.042, 0.042, gearMat, 0, 0.205, -0.128));
    headGroup.add(P(0.022, 0.032, 0.17, gearMat, -0.132, 0.182, 0));
    headGroup.add(P(0.022, 0.032, 0.17, gearMat, 0.132, 0.182, 0));
    headGroup.add(P(0.16, 0.075, 0.07, gearMat, 0, 0.145, 0.135));
    // 护目镜 + 绕头盔一整圈的镜带
    headGroup.add(P(0.195, 0.058, 0.045, gogMat, 0, 0.152, -0.092));
    // 镜片加宽到 0.183（原 0.17）：镜体是 0.195 宽，留 6mm 一圈镜框刚好，
    // 原来两侧各露 12.5mm 的黑镜体，把镜片切成了「中间黑、两头亮」。
    headGroup.add(PF(0.183, 0.040, 0.02, lensMat, 0, 0.152, -0.114));
    var gogStrap = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.009, 6, 20), gogMat);
    gogStrap.rotation.x = Math.PI / 2; gogStrap.position.set(0, 0.168, 0.005);
    gogStrap.scale.set(1, 1.06, 1); headGroup.add(gogStrap);
    // 面罩（下半脸）+ 滤盒。整组比原来低 8mm：上沿从 0.1055 退到 0.0975，
    // 和护目镜下沿（0.123）之间的皮肤带就从 17.5mm 开到 25.5mm——
    // 17mm 那条太细，远看就是一道线，读不出是眼睛。三块必须一起挪，
    // 只挪主罩会让滤盒吊在罩子外面。
    headGroup.add(P(0.16, 0.095, 0.165, maskMat, 0, 0.050, -0.015));
    headGroup.add(P(0.10, 0.062, 0.05, maskMat, 0, 0.044, -0.105));
    headGroup.add(P(0.045, 0.035, 0.03, gearMat, 0, 0.032, -0.128));
    // 耳机 + 头梁 + 送话器
    var earL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.05, 12), gearMat);
    earL.rotation.z = Math.PI / 2; earL.position.set(-0.135, 0.12, 0);
    earL.castShadow = true; headGroup.add(earL);
    var earR = earL.clone(); earR.position.x = 0.135; headGroup.add(earR);
    var bow = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.008, 6, 14, Math.PI), gearMat);
    bow.rotation.y = Math.PI / 2; bow.position.set(0, 0.12, 0); headGroup.add(bow);
    var micBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 6), gearMat);
    micBoom.position.set(-0.09, 0.07, -0.08); micBoom.rotation.z = -0.7; headGroup.add(micBoom);
    headGroup.add(P(0.03, 0.025, 0.025, maskMat, -0.048, 0.032, -0.115));
    // 下颌带：从两侧耳机往下收到下巴扣
    var chinL = P(0.014, 0.085, 0.014, gearMat, -0.105, 0.055, -0.02); chinL.rotation.z = -0.22; headGroup.add(chinL);
    var chinR = P(0.014, 0.085, 0.014, gearMat, 0.105, 0.055, -0.02); chinR.rotation.z = 0.22; headGroup.add(chinR);
    headGroup.add(P(0.075, 0.03, 0.05, gearMat, 0, 0.012, -0.055));

    // ---- 手臂（肩 + 肘两段，末端带手）----
    // 分出肘关节这一层是必要的：单段刚性手臂只能整条摆，摆到能碰到握把的角度时
    // 整条手臂就是一根斜插在空中的管子。有了肘，上臂可以自然下垂、小臂才往前收。
    function createArm(side) {
      var arm = new THREE.Group();
      arm.position.set(side * 0.245, 1.435, 0);
      // 分段长度必须和 ARM_L1 / ARM_L2 对得上，IK 才解得准。
      // 按 1.95m 的身高算：上臂 0.315、肘到掌心 0.295，臂展 0.61。
      // 之前是 0.285+0.272，比例偏短，正好是左手够不到护木的原因之一。
      // 粗细也是量过的：上臂半径 0.073 时内缘落在 0.172，正好压在背心外缘
      // (0.1725+倒角) 上，肩一动就互相穿；收到 0.066 内缘 0.179，贴着但不穿，
      // 而且 0.146 的上臂直径本来就比真人（约 0.12）粗一圈。
      var upper = new THREE.Mesh(camoCapsule(0.066, 0.235, 6, 14), suitMat);
      upper.position.set(0, -0.157, -0.015); upper.castShadow = true; arm.add(upper);

      var fore = new THREE.Group();            // 肘关节
      fore.position.set(0, -ARM_L1, -0.012);
      arm.add(fore);
      // 护肘比小臂略宽，凸出轮廓
      fore.add(P(0.126, 0.098, 0.125, armorMat, 0, 0, 0));
      var foreMesh = new THREE.Mesh(camoCapsule(0.056, 0.19, 6, 14), suitMat);
      foreMesh.position.set(0, -0.135, 0); foreMesh.castShadow = true; fore.add(foreMesh);
      // 袖口束带（绕整圈）收住小臂末端
      var cuff = new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.010, 6, 18), gearMat);
      cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.255, 0); fore.add(cuff);
      // 手。之前小臂是直接截断的，正面看就是胸口上浮着一块圆形迷彩饼。
      // makeGlovedHand 的手腕朝局部 +z、指尖朝 -z，所以要绕 x 转 -90° 才能
      // 让手腕接上小臂（小臂沿局部 -y 往下）、指尖顺着手臂方向伸出去。
      var hand = makeGlovedHand();
      hand.rotation.x = -Math.PI / 2;
      hand.rotation.y = side * 0.25;
      hand.position.set(0, -ARM_L2, 0);
      hand.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      fore.add(hand);

      arm.foreJoint = fore;
      return arm;
    }
    var leftArm = createArm(-1);
    var rightArm = createArm(1);

    // ---- 瞄准/持枪骨架（随俯仰角转动）----
    var aimGroup = new THREE.Group();
    aimGroup.position.set(0, 1.44, 0);
    var weaponGroup = new THREE.Group();
    weaponGroup.position.set(WEAPON_MOUNT[0], WEAPON_MOUNT[1], WEAPON_MOUNT[2]);
    aimGroup.add(weaponGroup);

    // 持枪姿势：不再手写角度，直接照武器上的握把/护木反解。
    // 挂点是按身体正朝向量的，手臂长在侧转过的 chest 上，所以先过一遍 bladeSpace。
    // 右手落在握把上；左手沿枪身从握把往护木方向走，二分找出臂展够得到的最远那点，
    // 这样即使护木超出臂展，手也是**贴在枪身上**的（落在弹匣井/机匣附近，
    // 是真实存在的握法），不会像原来那样悬在空中差 20cm。
    var gripT = bladeSpace([
      WEAPON_MOUNT[0] + GRIP_LOCAL[0],
      1.44 + WEAPON_MOUNT[1] + GRIP_LOCAL[1],
      WEAPON_MOUNT[2] + GRIP_LOCAL[2]
    ]);
    var suppT = bladeSpace([
      WEAPON_MOUNT[0] + SUPP_LOCAL[0],
      1.44 + WEAPON_MOUNT[1] + SUPP_LOCAL[1],
      WEAPON_MOUNT[2] + SUPP_LOCAL[2]
    ]);
    solveArm(rightArm, gripT[0], gripT[1], gripT[2], ARM_POLE[0], ARM_POLE[1], ARM_POLE[2]);
    var suppFrac = (function () {
      // 0.97 而不是 1.0：解到满臂展时肘完全锁死，看着像根直棍，留 3% 好让肘微屈
      var maxR = (ARM_L1 + ARM_L2) * 0.97;
      function reach(t) {
        var dx = gripT[0] + (suppT[0] - gripT[0]) * t - leftArm.position.x;
        var dy = gripT[1] + (suppT[1] - gripT[1]) * t - leftArm.position.y;
        var dz = gripT[2] + (suppT[2] - gripT[2]) * t - leftArm.position.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      // 沿枪身走，距离随 t 单调增，所以二分找 reach(t) == maxR 的那个 t。
      // 之前是固定 0.08 步长扫 12 次，握把恰好在臂展边缘时一次都不会命中，
      // 最后被 max(t,0.15) 兜到握把上——两只手叠在同一个位置。
      var lo = 0, hi = 1;
      if (reach(1) > maxR) {
        for (var it = 0; it < 24; it++) {
          var mid = (lo + hi) * 0.5;
          if (reach(mid) > maxR) hi = mid; else lo = mid;
        }
      } else lo = 1;
      solveArm(leftArm,
        gripT[0] + (suppT[0] - gripT[0]) * lo,
        gripT[1] + (suppT[1] - gripT[1]) * lo,
        gripT[2] + (suppT[2] - gripT[2]) * lo,
        -ARM_POLE[0], ARM_POLE[1], ARM_POLE[2]);
      return lo;
    })();
    // 把两只手的落点换成 **weaponGroup 局部坐标** 存下来。上面解 IK 用的是 chest
    // 坐标里的固定点，那套点只在枪没动过的时候成立；换弹时枪要侧倾，手必须跟着
    // 枪走，所以得能每帧从枪身反算出新的落点。
    var gripWG = new THREE.Vector3(GRIP_LOCAL[0], GRIP_LOCAL[1], GRIP_LOCAL[2]);
    var suppWG = new THREE.Vector3(
      GRIP_LOCAL[0] + (SUPP_LOCAL[0] - GRIP_LOCAL[0]) * suppFrac,
      GRIP_LOCAL[1] + (SUPP_LOCAL[1] - GRIP_LOCAL[1]) * suppFrac,
      GRIP_LOCAL[2] + (SUPP_LOCAL[2] - GRIP_LOCAL[2]) * suppFrac
    );
    // 护木的**原始**落点也留着：suppFrac 是按 pitch=0 算的，枪一俯仰，
    // 够得到的最远点就变了，每帧得重新沿 grip→suppFull 这整条线去找。
    var suppFullWG = new THREE.Vector3(SUPP_LOCAL[0], SUPP_LOCAL[1], SUPP_LOCAL[2]);
    chest.add(leftArm, rightArm);

    bodyGroup.add(pelvis, leftLeg, rightLeg, gear, chest,
      headGroup, aimGroup);

    // 血条（挂在根节点，逐帧朝向相机）
    var hb = createHealthBar();
    hb.group.position.y = 2.15;
    group.add(hb.group);

    // 名字
    var nameSprite = makeNameSprite(name);
    nameSprite.position.y = 2.42;
    group.add(nameSprite);

    scene.add(group);

    var r = {
      id: id, name: name, group: group, bodyGroup: bodyGroup, bodyMats: bodyMats,
      nameSprite: nameSprite, healthFill: hb.fill, healthGroup: hb.group,
      weaponGroup: weaponGroup, aimGroup: aimGroup, headGroup: headGroup,
      // chest 要留出来：换弹时左手的目标点（胸挂弹匣包、弹匣井）要换算到 chest
      // 局部坐标里去，手臂就长在 chest 上。
      chest: chest,
      weaponCache: {}, shownWeapon: null,
      leftArm: leftArm, rightArm: rightArm, leftLeg: leftLeg, rightLeg: rightLeg,
      targetPos: new THREE.Vector3(0, 0, 0), renderPos: new THREE.Vector3(0, 0, 0),
      targetYaw: 0, renderYaw: 0, targetPitch: 0, renderPitch: 0,
      vel: new THREE.Vector3(0, 0, 0), walkPhase: Math.random() * Math.PI * 2,
      deadT: 0, hp: 100, alive: true, current: 'primary', melee: 'knife',
      primary: 'rifle', secondary: 'pistol', kills: 0, deaths: 0, streak: 0, bestStreak: 0,
      crouch: false,
      fireAnim: 0, swingAnim: 0, throwAnim: 0, firstUpdate: true,
      // 换弹动画：已播时长 / 总时长 / 播的是哪把枪的模型
      reloadAnim: 0, reloadDur: 0, reloadModel: null, reloadId: '',
      // 两只手在 weaponGroup 局部的落点（换弹时枪会侧倾，手要跟着枪重解）
      gripWG: gripWG, suppWG: suppWG, suppFullWG: suppFullWG, suppFrac: suppFrac,
      // 长枪护木点的**建模值**。suppFrac 每帧都会被 remoteSupportPoint 改写
      // （近战时会被写成 1.0），换回长枪时得有个干净的初值可用。
      gunSuppFrac: suppFrac,
      // 当前武器的挂点 / 预备姿势 / 是否双手持握，由 setHoldAnchors 维护
      mount: WEAPON_MOUNT, holdRest: null, twoHand: true,
      // 挥砍：这一刀是哪种弧线、多长
      swingStyle: 'slashR', swingDur: 0.18
    };
    remotePlayers.set(id, r);
    return r;
  }

  // 握持点随武器类型切换。近战有自己的握把点、挂点和预备姿势（MELEE_GRIP /
  // MELEE_MOUNT / MELEE_REST）；单手武器把左手点并到右手点上，并置 twoHand=false，
  // 让持握 IK 只解右臂——匕首上挂两只手是原来最明显的破绽。
  function setHoldAnchors(r, id, isMelee) {
    if (isMelee) {
      var mg = MELEE_GRIP[id] || MELEE_GRIP.knife, s = MELEE_TP_SCALE;
      r.gripWG.set(mg.r[0] * s, mg.r[1] * s, mg.r[2] * s);
      r.twoHand = !!mg.l;
      if (mg.l) r.suppFullWG.set(mg.l[0] * s, mg.l[1] * s, mg.l[2] * s);
      else r.suppFullWG.copy(r.gripWG);
      r.suppWG.copy(r.suppFullWG);
      r.mount = MELEE_MOUNT;
      r.holdRest = MELEE_REST;
    } else {
      r.gripWG.set(GRIP_LOCAL[0], GRIP_LOCAL[1], GRIP_LOCAL[2]);
      r.suppFullWG.set(SUPP_LOCAL[0], SUPP_LOCAL[1], SUPP_LOCAL[2]);
      // suppFrac 每帧被 remoteSupportPoint 改写，近战时会写成 1.0。
      // 换回长枪必须先取回建模值，否则左手第一帧落在整条护木的末端上。
      r.suppFrac = r.gunSuppFrac;
      // 长枪的护木点要按 suppFrac 往握把方向收（建模时按 pitch=0 搜出来的可达点）
      r.suppWG.set(
        GRIP_LOCAL[0] + (SUPP_LOCAL[0] - GRIP_LOCAL[0]) * r.suppFrac,
        GRIP_LOCAL[1] + (SUPP_LOCAL[1] - GRIP_LOCAL[1]) * r.suppFrac,
        GRIP_LOCAL[2] + (SUPP_LOCAL[2] - GRIP_LOCAL[2]) * r.suppFrac
      );
      r.twoHand = true;
      r.mount = WEAPON_MOUNT;
      r.holdRest = null;
    }
    var mo = r.mount, rest = r.holdRest || ZERO3;
    r.weaponGroup.position.set(mo[0], mo[1], mo[2]);
    r.weaponGroup.rotation.set(rest[0], rest[1], rest[2]);
  }

  // 确保远端玩家持有指定武器模型（懒加载 + 缓存）
  function ensureRemoteWeapon(r, id, isMelee) {
    var key = (isMelee ? 'm_' : 'g_') + id;
    if (!r.weaponCache[key]) {
      // 第三人称一律用**不带手**的武器模型：武器自带的那对手是按第一人称视角
      // 摆的（握把和护木相距 0.46m、离身体中心 0.6m 远），第三人称身体的肩宽
      // 和臂长根本够不到，两副手会同时出现在相距 30cm 的地方。
      // 手改挂在手臂末端（见 createArm），武器再对着右拳摆。
      var model = isMelee ? buildMeleeModel(id, false) : buildGunModel(id, false);
      // 第一人称视角模型一律是放大的（这把步枪全长 1.31m，真 M4 只有 0.84m）。
      // 放大的枪摆到第三人称身上，握把到护木的间距是 0.46m，而肩宽 0.49、
      // 臂长 0.55 的身体根本跨不过去——两只手怎么摆都够不到。缩到实物尺寸后
      // 手距变成 0.31m，右手握把、左手托护木才有可能同时成立。
      model.scale.setScalar(isMelee ? MELEE_TP_SCALE : WEAPON_TP_SCALE);
      r.weaponGroup.add(model);
      r.weaponCache[key] = model;
    }
    Object.keys(r.weaponCache).forEach(function (k) {
      r.weaponCache[k].visible = (k === key);
    });
    r.shownWeapon = key;
    // 缓存命中时上面整段是跳过的，所以挂点必须在**外面**设：
    // 换回一把用过的刀时，挂点还留在上一把枪的肩窝位置上。
    setHoldAnchors(r, id, isMelee);
  }

  function updateRemoteWeaponVisual(r) {
    var isMelee = r.current === 'melee';
    var rangedId = r.current === 'secondary' ? r.secondary : r.primary;
    var id = isMelee ? r.melee : rangedId;
    if (!id) return;
    // 换枪时把没播完的换弹动画掐掉：不然新枪一掏出来，
    // 手还停在上一把枪的弹匣井位置上，而那把枪已经不在手里了。
    if (r.reloadDur > 0 && ('g_' + id) !== r.shownWeapon) stopRemoteReload(r);
    ensureRemoteWeapon(r, id, isMelee);
  }

  // 起一段第三人称换弹动画。动作时长直接取这把枪的 reloadTime，
  // 和服务端的换弹计时同源，所以动作做完的那一刻弹药也正好补满。
  function startRemoteReload(id) {
    var r = remotePlayers.get(id);
    if (!r || !r.alive || r.current === 'melee') return;
    var wid = r.current === 'secondary' ? r.secondary : r.primary;
    var wpn = WEAPONS[wid];
    if (!wpn || wpn.type !== 'ranged') return;
    ensureRemoteWeapon(r, wid, false);       // 模型可能还没懒加载出来
    var model = r.weaponCache['g_' + wid];
    if (!model) return;
    if (r.reloadDur > 0) stopRemoteReload(r);
    resetReloadParts(model);
    r.reloadModel = model;
    r.reloadId = wid;
    r.reloadDur = wpn.reloadTime;
    r.reloadAnim = 0;
  }

  // ----------------------------------------------------------
  // 工具
  // ----------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }

    function currentRangedId() {
      return local.current === 'secondary' ? local.secondary : local.primary;
    }

  function lerpAngle(a, b, t) {
    var diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  // 实际瞄准方向 = 视角 + 后坐力偏移。
  // 后坐力必须算进来：只把它加到 camera.rotation 上的话，画面在抬、
  // 子弹却仍从原来的视线出去，等于后坐力对命中毫无影响（原来就是这样）。
  function aimYaw() { return local.yaw + recoilYaw; }
  function aimPitch() { return clamp(local.pitch + recoilPitch, -1.55, 1.55); }

  function aimDir() {
    var pitch = aimPitch();
    var yaw = aimYaw();
    var cp = Math.cos(pitch);
    return new THREE.Vector3(
      -Math.sin(yaw) * cp,
      Math.sin(pitch),
      -Math.cos(yaw) * cp
    ).normalize();
  }

  // 以 dir 为轴的锥形散射（与 server.js 的 spreadDir 同一套数学）。
  // 不能对 x/y/z 各加随机数：那是世界轴上的立方体扰动，实际角度会随朝向变，
  // 同一把枪朝不同方向打精度不同。
  function spreadDir(dir, halfAngle) {
    if (halfAngle <= 0) return dir.clone();
    var up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    var right = new THREE.Vector3().crossVectors(up, dir).normalize();
    var realUp = new THREE.Vector3().crossVectors(dir, right);
    var r = Math.tan(halfAngle) * Math.sqrt(Math.random());
    var a = Math.random() * Math.PI * 2;
    return dir.clone()
      .addScaledVector(right, Math.cos(a) * r)
      .addScaledVector(realUp, Math.sin(a) * r)
      .normalize();
  }

  // 当前这一发的散射半角。必须与服务端 effectiveSpread 逐字一致。
  // 腰射/移动/离地三个惩罚都是加法项，且都不受开镜缩放影响。
  function currentSpread(wpn) {
    var aiming = ads && local.current !== 'melee';
    var base = (wpn.spread + bloom) * (aiming ? (wpn.adsSpread || 1) : 1);
    var hip = aiming ? 0 : (wpn.hipSpread || 0);
    var speed = Math.sqrt(local.vel.x * local.vel.x + local.vel.z * local.vel.z);
    // 按这把枪自己的疾跑速度归一化（服务端 effectiveSpread 同此），
    // 不能沿用旧的写死常数 8 —— 那是降速前的步行速度。
    var moveFrac = clamp(speed / (SPRINT_SPEED * (wpn.moveSpeed || 1)), 0, 1);
    var air = (local.pos.y > 0.35 ? (wpn.airSpread || 0) : 0);
    return base + hip + moveFrac * (wpn.moveSpread || 0) + air;
  }

  function rayAABB(o, d, min, max) {
    var tmin = 0, tmax = Infinity;

    if (Math.abs(d.x) < 1e-8) {
      if (o.x < min.x || o.x > max.x) return null;
    } else {
      var t1 = (min.x - o.x) / d.x, t2 = (max.x - o.x) / d.x;
      if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (Math.abs(d.y) < 1e-8) {
      if (o.y < min.y || o.y > max.y) return null;
    } else {
      var t1y = (min.y - o.y) / d.y, t2y = (max.y - o.y) / d.y;
      if (t1y > t2y) { var tmpy = t1y; t1y = t2y; t2y = tmpy; }
      tmin = Math.max(tmin, t1y); tmax = Math.min(tmax, t2y);
      if (tmin > tmax) return null;
    }
    if (Math.abs(d.z) < 1e-8) {
      if (o.z < min.z || o.z > max.z) return null;
    } else {
      var t1z = (min.z - o.z) / d.z, t2z = (max.z - o.z) / d.z;
      if (t1z > t2z) { var tmpz = t1z; t1z = t2z; t2z = tmpz; }
      tmin = Math.max(tmin, t1z); tmax = Math.min(tmax, t2z);
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return tmin >= 0 ? tmin : tmax;
  }

  function castLocalRay(maxRange) {
    var origin = camera.position.clone();
    var dir = aimDir();
    var bestT = maxRange;
    BOXES.forEach(function (b) {
      var min = { x: b.x - b.w / 2, y: 0, z: b.z - b.d / 2 };
      var max = { x: b.x + b.w / 2, y: b.h, z: b.z + b.d / 2 };
      var t = rayAABB(origin, dir, min, max);
      if (t !== null && t < bestT) bestT = t;
    });
    return { origin: origin, dir: dir, end: origin.clone().add(dir.clone().multiplyScalar(bestT)) };
  }

  function collideBoxes(pos) {
    var r = PLAYER_RADIUS;
    BOXES.forEach(function (b) {
      if (pos.y >= b.h) return;
      var minX = b.x - b.w / 2 - r;
      var maxX = b.x + b.w / 2 + r;
      var minZ = b.z - b.d / 2 - r;
      var maxZ = b.z + b.d / 2 + r;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        var dx1 = pos.x - minX, dx2 = maxX - pos.x;
        var dz1 = pos.z - minZ, dz2 = maxZ - pos.z;
        var m = Math.min(dx1, dx2, dz1, dz2);
        if (m === dx1) pos.x = minX;
        else if (m === dx2) pos.x = maxX;
        else if (m === dz1) pos.z = minZ;
        else pos.z = maxZ;
      }
    });
  }

    function getGroundY(pos) {
      var groundY = 0;
      BOXES.forEach(function (b) {
        var minX = b.x - b.w / 2 - 0.05;
        var maxX = b.x + b.w / 2 + 0.05;
        var minZ = b.z - b.d / 2 - 0.05;
        var maxZ = b.z + b.d / 2 + 0.05;
        if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ && b.h > groundY) {
          groundY = b.h;
        }
      });
      return groundY;
    }

  // ----------------------------------------------------------
  // 音效
  // ----------------------------------------------------------
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playNoise(duration, freq, gainVal, type) {
    if (!audioCtx) return;
    try {
      var ctx = audioCtx;
      var buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = type || 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.9;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + duration);
    } catch (e) { /* 忽略音频错误 */ }
  }

  function playTone(freq, duration, gainVal, type) {
    if (!audioCtx) return;
    try {
      var ctx = audioCtx;
      var osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* 忽略音频错误 */ }
  }

  function playShotSound(weaponId, far) {
    ensureAudio();
    var v = far ? 0.22 : 0.7;
    if (weaponId === 'shotgun') { playNoise(0.24, 850, v * 0.9, 'bandpass'); playTone(110, 0.16, v * 0.5, 'sawtooth'); }
    else if (weaponId === 'awp') { playNoise(0.32, 500, v * 1.0, 'bandpass'); playTone(90, 0.22, v * 0.6, 'sawtooth'); playNoise(0.18, 2400, v * 0.35, 'bandpass'); }
    else if (weaponId === 'dmr') { playNoise(0.2, 900, v * 0.8, 'bandpass'); playTone(110, 0.12, v * 0.5, 'sawtooth'); }
      else if (weaponId === 'rifle') { playNoise(0.09, 2300, v * 0.45, 'bandpass'); playTone(180, 0.06, v * 0.3, 'square'); }
    else if (weaponId === 'lmg') { playNoise(0.11, 1500, v * 0.6, 'bandpass'); playTone(130, 0.08, v * 0.4, 'sawtooth'); }
      else { playNoise(0.12, 1700, v * 0.6, 'bandpass'); playTone(240, 0.08, v * 0.35, 'square'); }
  }

  function playMeleeSound(weaponId, far) {
      if (weaponId === 'chainsaw') {
        playNoise(0.28, far ? 600 : 900, far ? 0.22 : 0.5, 'sawtooth');
        playTone(far ? 70 : 90, 0.22, far ? 0.12 : 0.28, 'sawtooth');
        return;
      }
    ensureAudio();
    playNoise(0.16, far ? 500 : 700, far ? 0.2 : 0.5, 'lowpass');
  }

  // 爆头另给一声：高一个八度 + 紧跟一声更高的短音。
  // 只改音量或时长是听不出来的（命中音本来就只有 50ms），
  // 加第二个音头才能在连发的枪声里被分辨出来。
  function playHitSound(head) {
    ensureAudio();
    if (head) {
      playTone(2100, 0.05, 0.4, 'square');
      setTimeout(function () { playTone(2800, 0.045, 0.3, 'square'); }, 45);
      return;
    }
    playTone(1400, 0.05, 0.35, 'square');
  }

  function playReloadSound() {
    ensureAudio();
    playTone(500, 0.05, 0.3, 'square');
    setTimeout(function () { playTone(750, 0.05, 0.3, 'square'); }, 120);
  }

  // 换弹动作分段音：动画走到"插匣"和"上膛"时各补一声。
  // 原来只在按下 R 的瞬间响两下，后面一秒多的动作是无声的，
  // 听起来像手上做完了但枪没反应。
  function playReloadClick(stage) {
    ensureAudio();
    if (stage === 2) {                       // 插匣到位：闷一点的"咔"
      playTone(320, 0.05, 0.26, 'square');
      setTimeout(function () { playTone(240, 0.04, 0.18, 'square'); }, 55);
    } else if (stage === 3) {                 // 上膛：金属"咔嚓"，两声更脆
      playTone(880, 0.035, 0.22, 'square');
      setTimeout(function () { playTone(1180, 0.045, 0.26, 'square'); }, 70);
    }
  }

    function playDryFireSound() {
      ensureAudio();
      playTone(900, 0.04, 0.25, 'square');
    }

  function playDeathSound() {
    ensureAudio();
    playTone(220, 0.3, 0.4, 'sawtooth');
    playTone(110, 0.4, 0.35, 'sawtooth');
  }

  // 连杀播报音：一个向上的三音琶音，层级越高起音越高。
  // 用上行音阶而不是单音，是为了在连发枪声（1.4kHz 方波命中音、
  // 低频枪响）里留下一个"旋律"型的听觉标记——单音会被淹掉。
  function playStreakSound(streak) {
    ensureAudio();
    var base = 520 + Math.min(streak, 10) * 45;
    playTone(base, 0.09, 0.3, 'square');
    setTimeout(function () { playTone(base * 1.25, 0.09, 0.3, 'square'); }, 90);
    setTimeout(function () { playTone(base * 1.5, 0.14, 0.32, 'square'); }, 180);
  }

  // 击杀回血提示音：短促上扬，跟连杀播报的琶音区分开。
  function playHealSound() {
    ensureAudio();
    playTone(660, 0.06, 0.2, 'triangle');
    setTimeout(function () { playTone(990, 0.08, 0.22, 'triangle'); }, 60);
  }

  // 显示连杀横幅。
  //
  // 关键点是那个强制 reflow：连续两次跨阈值击杀（比如 2 连紧跟 3 连）之间，
  // 如果只是把 class 摘掉再加回去，浏览器会把这两次样式变更合并成"没变化"，
  // CSS 动画不会重播，第二次播报就是静止的。读一下 offsetWidth 强制布局，
  // 才能让动画真正重新开始。
  function showStreakBanner(label, streak) {
    if (!streakBanner) return;
    streakLabel.textContent = label;
    streakCount.textContent = streak + ' 连杀';
    streakBanner.classList.remove('show');
    void streakBanner.offsetWidth;
    streakBanner.classList.add('show');
    if (streakHideTimer) clearTimeout(streakHideTimer);
    streakHideTimer = setTimeout(function () {
      streakBanner.classList.remove('show');
      streakHideTimer = 0;
    }, 1600);
    playStreakSound(streak);
  }

  function showHealPopup(amount) {
    if (!healPopup) return;
    healPopup.textContent = '+' + amount + ' HP';
    healPopup.classList.remove('show');
    void healPopup.offsetWidth;
    healPopup.classList.add('show');
    if (healHideTimer) clearTimeout(healHideTimer);
    healHideTimer = setTimeout(function () {
      healPopup.classList.remove('show');
      healHideTimer = 0;
    }, 1100);
    playHealSound();
  }

  // ----------------------------------------------------------
  // 特效
  // ----------------------------------------------------------
  function getGlowTexture() {
    if (!glowTexture) {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var ctx = c.getContext('2d');
      var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,230,1)');
      g.addColorStop(0.35, 'rgba(255,200,90,0.9)');
      g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      glowTexture = new THREE.CanvasTexture(c);
      glowTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return glowTexture;
  }

  function addFlash(pos, color, size, life, grow) {
    var mat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    var spr = new THREE.Sprite(mat);
    spr.position.copy(pos);
    spr.scale.setScalar(size);
    scene.add(spr);
    flashes.push({ spr: spr, mat: mat, life: life || 0.08, maxLife: life || 0.08, grow: grow !== false });
  }

  function addTracer(from, to, life, color) {
    life = life || 0.07;
    var dir = to.clone().sub(from);
      var len = dir.length();
      if (len < 0.01) return;
      var mid = from.clone().add(to).multiplyScalar(0.5);
      var quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      var mat = new THREE.MeshBasicMaterial({
        color: color || 0xffb347,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var outer = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 6), mat);
      outer.quaternion.copy(quat);
      outer.position.copy(mid);
      scene.add(outer);
      var coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var core = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), coreMat);
      core.quaternion.copy(quat);
      core.position.copy(mid);
      scene.add(core);
      var tracerLife = Math.max(life || 0.12, 0.12);
      tracerLines.push({ mesh: outer, mat: mat, core: core, coreMat: coreMat, life: tracerLife, maxLife: tracerLife });
      return;
    var mat = new THREE.LineBasicMaterial({
      color: color || 0xfff2b0,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var line = new THREE.Line(geom, mat);
    scene.add(line);
    tracerLines.push({ line: line, mat: mat, life: life, maxLife: life });
  }

  function addImpact(pos, color, count, big) {
    count = count || 8;
    addFlash(pos, color || 0xffd27a, big ? 0.9 : 0.45, big ? 0.12 : 0.07);
    for (var i = 0; i < count; i++) {
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(big ? 0.06 : 0.035, 5, 5),
        new THREE.MeshBasicMaterial({ color: color || 0xffd27a, transparent: true })
      );
      mesh.position.copy(pos);
      var vel = new THREE.Vector3(rand(-1, 1), rand(-0.6, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(1, big ? 6 : 3.5));
      scene.add(mesh);
      impacts.push({ mesh: mesh, mat: mesh.material, vel: vel, life: rand(0.25, 0.55), maxLife: 0.55 });
    }
  }

    function getSmokeTexture() {
      if (!smokeTexture) {
        var c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        var ctx = c.getContext('2d');
        var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(230,230,230,0.9)');
        g.addColorStop(0.45, 'rgba(200,200,200,0.55)');
        g.addColorStop(1, 'rgba(180,180,180,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        smokeTexture = new THREE.CanvasTexture(c);
        smokeTexture.colorSpace = THREE.SRGBColorSpace;
      }
      return smokeTexture;
    }

    function createSmokeCloud(pos) {
      var count = 36;
      for (var i = 0; i < count; i++) {
        var mat = new THREE.SpriteMaterial({
          map: getSmokeTexture(),
          color: new THREE.Color().setHSL(0, 0, 0.65 + Math.random() * 0.3),
          transparent: true,
          opacity: 0.7 + Math.random() * 0.25,
          depthWrite: false
        });
        var spr = new THREE.Sprite(mat);
        spr.position.set(
          pos.x + rand(-2.2, 2.2),
          pos.y + rand(-0.2, 2.0),
          pos.z + rand(-2.2, 2.2)
        );
        var startScale = rand(2.2, 3.8);
        spr.scale.setScalar(startScale);
        scene.add(spr);
        smokeParticles.push({
          spr: spr,
          mat: mat,
          vel: new THREE.Vector3(rand(-0.8, 0.8), rand(1.0, 2.5), rand(-0.8, 0.8)),
          life: rand(4.0, 7.0),
          maxLife: 7.0,
          grow: rand(3.5, 6.5)
        });
      }
    }

    function updateSmoke(dt) {
      for (var i = smokeParticles.length - 1; i >= 0; i--) {
        var s = smokeParticles[i];
        s.life -= dt;
        if (s.life <= 0) {
          scene.remove(s.spr);
          s.spr.material.dispose();
          smokeParticles.splice(i, 1);
        } else {
          s.spr.position.addScaledVector(s.vel, dt);
          var k = 1 - s.life / s.maxLife;
          s.spr.scale.setScalar(s.spr.scale.x + s.grow * dt);
          var fadeIn = Math.min(1, k / 0.08);
            var fadeOut = Math.min(1, (1 - k) / 0.25);
            s.mat.opacity = Math.min(0.9, fadeIn * fadeOut * 0.85);
        }
      }
    }

    function createExplosionEffect(pos) {
      addFlash(pos, 0xff8833, 2.2, 0.18);
      addFlash(pos, 0xffffff, 1.2, 0.1);
      addImpact(pos, 0xff5533, 20, true);
      for (var i = 0; i < 6; i++) {
        var dir = new THREE.Vector3(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).normalize();
        addTracer(pos.clone(), pos.clone().addScaledVector(dir, rand(1.5, 4)), 0.18, 0xffaa44);
      }
      // 爆炸后附带少量烟雾
      for (var j = 0; j < 10; j++) {
        var mat = new THREE.SpriteMaterial({
          map: getSmokeTexture(),
          color: 0x555555,
          transparent: true,
          opacity: 0.5,
          depthWrite: false
        });
        var spr = new THREE.Sprite(mat);
        spr.position.set(pos.x + rand(-1, 1), pos.y + rand(0, 1.5), pos.z + rand(-1, 1));
        spr.scale.setScalar(rand(1.5, 3));
        scene.add(spr);
        smokeParticles.push({ spr: spr, mat: mat, vel: new THREE.Vector3(rand(-0.6, 0.6), rand(0.8, 1.8), rand(-0.6, 0.6)), life: rand(2, 3.5), maxLife: 3.5, grow: rand(2, 4) });
      }
    }

  // ==========================================================
  // 投掷物（手雷 / 烟雾弹）
  // 服务端只广播出手点与出手速度，落点两端各自算。所以 stepThrown 必须与
  // server.js 的副本逐字一致——差一个系数，手雷就会停在爆点之外的地方。
  // ==========================================================
  var THROW_MATS = null;
  function throwMats() {
    if (THROW_MATS) return THROW_MATS;
    THROW_MATS = {
      olive: new THREE.MeshStandardMaterial({ color: 0x3f4a2b, roughness: 0.62, metalness: 0.25, envMapIntensity: 0.8 }),
      oliveDark: new THREE.MeshStandardMaterial({ color: 0x2b331d, roughness: 0.6, metalness: 0.3, envMapIntensity: 0.8 }),
      gray: new THREE.MeshStandardMaterial({ color: 0x5a5f5c, roughness: 0.55, metalness: 0.4, envMapIntensity: 0.9 }),
      band: new THREE.MeshStandardMaterial({ color: 0xc4b243, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.9 })
    };
    return THROW_MATS;
  }

  // M67 破片手雷：椭球弹体 + 顶部引信座 + 侧面保险握片 + 拉环。
  // 尺寸放大到实物的约 1.7 倍（弹体直径 110mm）——真实的 64mm 球在
  // 十几米外只有两三个像素，飞出去等于看不见。
  function buildGrenadeModel() {
    var M = weaponMats(), T = throwMats();
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 14), T.olive);
    body.scale.set(1, 1.1, 1);
    g.add(body);
    // 赤道一圈黄漆识别带：绕整圈的环带才读得出来，只贴一小块会变成一个黑点。
    // TorusGeometry 默认躺在 XY 面上（孔沿 Z），绕竖轴的腰带要转到水平面。
    var band = new THREE.Mesh(new THREE.TorusGeometry(0.0552, 0.0035, 8, 22), T.band);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.026, 0.014, 14), T.oliveDark);
    neck.position.y = 0.058; g.add(neck);
    var fuze = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.020, 14), M.trimSteel);
    fuze.position.y = 0.072; g.add(fuze);
    // 保险握片：贴着弹体侧壁往下压，上端压在引信座下沿
    var lever = rBox(0.013, 0.070, 0.006, 0.0025, M.trimSteel, 0.052, 0.030, 0);
    lever.rotation.z = -0.12; g.add(lever);
    // 拉环：环面立起来（TorusGeometry 默认躺在 XY 面上）
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0028, 8, 16), M.trimSteel);
    ring.position.set(-0.026, 0.076, 0);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    return g;
  }

  // AN-M8 发烟罐：圆柱体 + 上下压边 + 顶部喷口
  function buildSmokeModel() {
    var M = weaponMats(), T = throwMats();
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.135, 16), T.gray);
    g.add(body);
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.010, 16), T.oliveDark);
    top.position.y = 0.070; g.add(top);
    var bot = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.010, 16), T.oliveDark);
    bot.position.y = -0.070; g.add(bot);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.020, 12), M.trimSteel);
    cap.position.y = 0.085; g.add(cap);
    var lever = rBox(0.012, 0.055, 0.006, 0.0025, M.trimSteel, 0.040, 0.048, 0);
    g.add(lever);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0026, 8, 16), M.trimSteel);
    ring.position.set(-0.022, 0.090, 0);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    // 中段两道识别带（同样要转到水平面才是"箍在罐子上"）
    for (var bi = 0; bi < 2; bi++) {
      var bd = new THREE.Mesh(new THREE.TorusGeometry(0.0425, 0.003, 8, 18), T.band);
      bd.rotation.x = Math.PI / 2;
      bd.position.y = bi === 0 ? 0.020 : -0.020;
      g.add(bd);
    }
    return g;
  }

  // 投掷物一个定步长：重力 → 位移 → 与地面/围墙/掩体求交并反弹。
  // 全程无随机数。pos / vel 原地修改。
  function stepThrown(pos, vel, dt) {
    vel.y -= THROW_GRAVITY * dt;
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    var R = THROW_RADIUS;

    if (pos.y < R) {
      pos.y = R;
      if (vel.y < 0) vel.y = -vel.y * THROW_RESTITUTION;
      vel.x *= THROW_FRICTION;
      vel.z *= THROW_FRICTION;
      if (Math.abs(vel.y) < 0.5) vel.y = 0;
    }

    var lim = ARENA_HALF - R;
    if (pos.x > lim) { pos.x = lim; vel.x = -vel.x * THROW_RESTITUTION; }
    else if (pos.x < -lim) { pos.x = -lim; vel.x = -vel.x * THROW_RESTITUTION; }
    if (pos.z > lim) { pos.z = lim; vel.z = -vel.z * THROW_RESTITUTION; }
    else if (pos.z < -lim) { pos.z = -lim; vel.z = -vel.z * THROW_RESTITUTION; }

    // 掩体：AABB 外扩半径，球心落在里面就沿「贯穿最浅的那个轴」推出并反弹。
    // 选最浅轴很关键——否则贴着侧面滑落的手雷会被弹到箱顶上去。
    for (var i = 0; i < BOXES.length; i++) {
      var b = BOXES[i];
      var minX = b.x - b.w / 2 - R, maxX = b.x + b.w / 2 + R;
      var minZ = b.z - b.d / 2 - R, maxZ = b.z + b.d / 2 + R;
      var maxY = b.h + R;
      if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ || pos.y > maxY || pos.y < -R) continue;

      var dxl = pos.x - minX, dxr = maxX - pos.x;
      var dzl = pos.z - minZ, dzr = maxZ - pos.z;
      var dyt = maxY - pos.y;
      var best = dxl, axis = 0;
      if (dxr < best) { best = dxr; axis = 1; }
      if (dzl < best) { best = dzl; axis = 2; }
      if (dzr < best) { best = dzr; axis = 3; }
      if (dyt < best) { best = dyt; axis = 4; }

      if (axis === 0) { pos.x = minX; if (vel.x > 0) vel.x = -vel.x * THROW_RESTITUTION; }
      else if (axis === 1) { pos.x = maxX; if (vel.x < 0) vel.x = -vel.x * THROW_RESTITUTION; }
      else if (axis === 2) { pos.z = minZ; if (vel.z > 0) vel.z = -vel.z * THROW_RESTITUTION; }
      else if (axis === 3) { pos.z = maxZ; if (vel.z < 0) vel.z = -vel.z * THROW_RESTITUTION; }
      else {
        pos.y = maxY;
        if (vel.y < 0) vel.y = -vel.y * THROW_RESTITUTION;
        vel.x *= THROW_FRICTION;
        vel.z *= THROW_FRICTION;
        if (Math.abs(vel.y) < 0.5) vel.y = 0;
      }
    }
  }

  function spawnThrowable(msg) {
    if (!msg.origin || !msg.vel) return;
    var isSmoke = msg.kind === 'smoke';
    var mesh = isSmoke ? buildSmokeModel() : buildGrenadeModel();
    mesh.position.set(msg.origin.x, msg.origin.y, msg.origin.z);
    mesh.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
    scene.add(mesh);
    throwables.push({
      mesh: mesh,
      pos: { x: msg.origin.x, y: msg.origin.y, z: msg.origin.z },
      vel: { x: msg.vel.x, y: msg.vel.y, z: msg.vel.z },
      left: (msg.fuse || 1500) / 1000,
      // 翻滚轴：取一个与初速垂直的方向，翻滚看起来才像被抛出去而不是自转
      spin: new THREE.Vector3(-msg.vel.z, 0.4, msg.vel.x).normalize(),
      kind: isSmoke ? 'smoke' : 'grenade'
    });
  }

  function updateThrowables(dt) {
    for (var i = throwables.length - 1; i >= 0; i--) {
      var g = throwables[i];
      // 用固定步长推进，剩余不足一步的时间单独走——与服务端 simulateThrown 同构，
      // 这样不管客户端多少帧率，落点都落在同一个位置。
      var t = Math.min(dt, g.left);
      while (t > 1e-6) {
        var step = t > THROW_STEP ? THROW_STEP : t;
        stepThrown(g.pos, g.vel, step);
        t -= step;
      }
      g.mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
      var speed = Math.sqrt(g.vel.x * g.vel.x + g.vel.y * g.vel.y + g.vel.z * g.vel.z);
      g.mesh.rotateOnAxis(g.spin, Math.min(speed, 22) * dt * 1.1);
      g.left -= dt;
      if (g.left <= 0) {
        scene.remove(g.mesh);
        disposeTree(g.mesh);
        throwables.splice(i, 1);
      }
    }
  }

  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.isMesh) {
        if (o.geometry && !o.geometry.__shared) o.geometry.dispose();
      }
    });
  }

  function throwAnimRemote(id) {
    var r = remotePlayers.get(id);
    if (r) r.throwAnim = 0.34;
  }

  function addSlashEffect(pos, yaw) {
    var pts = [];
    var segments = 14;
    for (var i = 0; i <= segments; i++) {
      var a = yaw - 1.1 + (2.2 * i) / segments;
      pts.push(new THREE.Vector3(
        pos.x - Math.sin(a) * 2.1,
        1.3,
        pos.z - Math.cos(a) * 2.1
      ));
    }
    var geom = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    var line = new THREE.Line(geom, mat);
    scene.add(line);
    slashEffects.push({ line: line, mat: mat, life: 0.14, maxLife: 0.14 });
  }

  function updateEffects(dt) {
    var i;

    for (i = tracerLines.length - 1; i >= 0; i--) {
      var t = tracerLines[i];
      t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.mesh);
          if (t.core) scene.remove(t.core);
        if (t.mesh) { t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
          if (t.core) { t.core.geometry.dispose(); t.core.material.dispose(); }
        t.mat.dispose();
        tracerLines.splice(i, 1);
      } else {
        t.mat.opacity = 0.9 * (t.life / t.maxLife);
          if (t.coreMat) t.coreMat.opacity = (t.life / t.maxLife);
      }
    }

    for (i = impacts.length - 1; i >= 0; i--) {
      var im = impacts[i];
      im.life -= dt;
      if (im.life <= 0) {
        scene.remove(im.mesh);
        im.mesh.geometry.dispose();
        im.mat.dispose();
        impacts.splice(i, 1);
      } else {
        im.vel.y -= 10 * dt;
        im.mesh.position.addScaledVector(im.vel, dt);
        if (im.mesh.position.y < 0.03) {
          im.mesh.position.y = 0.03;
          im.vel.y *= -0.35;
          im.vel.x *= 0.7;
          im.vel.z *= 0.7;
        }
        im.mat.opacity = im.life / im.maxLife;
        var sc = 0.5 + 0.5 * (im.life / im.maxLife);
        im.mesh.scale.setScalar(sc);
      }
    }

    for (i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        scene.remove(f.spr);
        f.spr.material.dispose();
        flashes.splice(i, 1);
      } else {
        f.mat.opacity = f.life / f.maxLife;
        if (f.grow) f.spr.scale.setScalar(f.spr.scale.x + dt * 6);
      }
    }

    for (i = slashEffects.length - 1; i >= 0; i--) {
      var s = slashEffects[i];
      s.life -= dt;
      if (s.life <= 0) {
        scene.remove(s.line);
        s.line.geometry.dispose();
        s.mat.dispose();
        slashEffects.splice(i, 1);
      } else {
        s.mat.opacity = 0.95 * (s.life / s.maxLife);
      }
    }

      updateSmoke(dt);

    // 枪口灯光衰减
    if (muzzleLightLife > 0) {
      muzzleLightLife -= dt;
      muzzleLight.intensity = 1.5 * Math.max(0, muzzleLightLife / 0.08);
      if (muzzleLightLife <= 0) muzzleLight.intensity = 0;
    }
  }

  // ----------------------------------------------------------
  // HUD
  // ----------------------------------------------------------
  function updateHUD() {
    healthFill.style.width = Math.max(0, (local.hp / local.maxHp) * 100) + '%';
    healthText.textContent = Math.max(0, Math.round(local.hp)) + ' / ' + local.maxHp;
      if (localNameTag) localNameTag.textContent = '玩家：' + (local.name || '未命名');
      if (statText) statText.textContent = '击杀 ' + local.kills + ' · 死亡 ' + local.deaths;
    healthFill.style.background = local.hp > 60 ? 'linear-gradient(90deg,#3fb950,#7ee787)' :
      (local.hp > 30 ? 'linear-gradient(90deg,#d29922,#e3b341)' : 'linear-gradient(90deg,#f85149,#ff7b72)');

    var isMelee = local.current === 'melee';
    weaponName.textContent = isMelee ? WEAPONS[local.melee].name : WEAPONS[currentRangedId()].name;
    if (isMelee) {
      ammoText.textContent = '—';
      ammoText.classList.remove('low');
    } else {
      // 弹匣 / 备弹。备弹用小字灰色，和弹匣数拉开层级：交火中要读的是前面那个数，
      // 后面那个是「打完这匣之后还有没有」，不该抢注意力。
      var rw = WEAPONS[currentRangedId()];
      ammoText.textContent = local.ammo + ' ';
      var rs = document.createElement('span');
      rs.className = 'ammo-reserve' + (local.reserve <= 0 ? ' empty' : '');
      rs.textContent = '/ ' + local.reserve;
      ammoText.appendChild(rs);
      ammoText.classList.toggle('low', local.ammo <= rw.mag * 0.25);
    }
    if (throwText) {
      throwText.textContent = '';
      var thr = [{ n: '💥', c: local.grenadeCount }, { n: '💨', c: local.smokeCount }];
      for (var ti = 0; ti < thr.length; ti++) {
        var sp = document.createElement('span');
        sp.className = 'th-item' + (thr[ti].c <= 0 ? ' out' : '');
        sp.textContent = thr[ti].n + ' ' + thr[ti].c;
        throwText.appendChild(sp);
      }
    }
    var rlShow = !isMelee && local.reloading;
    reloadTip.style.display = rlShow ? 'block' : 'none';
    if (rlShow) {
      // 进度直接读换弹动画的钟：动画和进度条本来就该是同一个时间轴。
      // 动画被中断过（换枪等）就把条藏起来，而不是让它假装 100%。
      var rlOn = reloadAnimDur > 0;
      reloadBar.style.visibility = rlOn ? 'visible' : 'hidden';
      if (rlOn) reloadFill.style.width = (clamp(reloadAnimT / reloadAnimDur, 0, 1) * 100).toFixed(1) + '%';
    }
  }

  function updateCrosshair() {
    // 准星开合直接由**真实散射角**换算而来，而不是随手凑的速度系数：
    // 半角 θ 在 fov 为 f 的画面上张开的像素数 = (tanθ / tan(f/2)) * (屏高/2)。
    // 这样跑动/跳跃/连发/开镜的准星大小与实际弹着范围永远对得上。
    var gap = 6;
    if (local.current !== 'melee') {
      var wpn = WEAPONS[local.ranged];
      if (wpn) {
        var half = camera.fov * Math.PI / 360;
        var px = Math.tan(currentSpread(wpn)) / Math.tan(half) * (window.innerHeight / 2);
        gap = 5 + Math.min(px, 160) + (triggerDown ? 1.5 : 0);
      }
    } else {
      // 近战准星靠速度张开。分母跟着降速一起改：还按 13 算的话
      // 现在最快也只有 7.6/13 = 0.58，准星永远张不开。
      var speedFrac = clamp(Math.sqrt(local.vel.x * local.vel.x + local.vel.z * local.vel.z) / (SPRINT_SPEED * 1.15), 0, 1);
      gap = 7 + speedFrac * 8;
    }
    crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');

    var scoped = ads && local.current !== 'melee' && currentRangedId() === 'awp';
    crosshair.classList.toggle('hidden', scoped);
    if (scopeOverlay) scopeOverlay.style.display = scoped ? 'block' : 'none';
  }

    function updateRespawnCountdown() {
      if (!respawnCountdownEl) return;
      if (local.alive) {
        if (deathOverlay) deathOverlay.style.display = 'none';
        return;
      }
      var remaining = respawnCountdownEnd - Date.now();
      if (remaining > 0) {
        var sec = Math.ceil(remaining / 1000);
        respawnCountdownEl.textContent = sec + ' 秒后自动复活…';
      } else {
        respawnCountdownEl.textContent = '正在复活…';
      }
    }

  // zone 为 'head' 时换一套配色（CSS 里的 .headshot），让爆头一眼可辨。
  // 每次都要先摘掉 class 再强制读一次 offsetWidth：不这样做，连续两次命中
  // 第二次不会重播动画（class 没变过，浏览器认为没有状态变化）。
  function showHitmarker(zone) {
    hitmarker.classList.remove('show');
    hitmarker.classList.toggle('headshot', zone === 'head');
    void hitmarker.offsetWidth;
    hitmarker.classList.add('show');
  }

  // 从一次开火的所有弹道里挑出「最值得反馈」的部位。
  // 霰弹枪一次 8 颗，可能同时打中头和腿，这时候该报头。
  function bestHitZone(tracers) {
    if (!tracers) return null;
    var rank = { head: 4, torso: 3, leg: 2, arm: 1 };
    var best = null;
    for (var i = 0; i < tracers.length; i++) {
      var z = tracers[i].hitZone;
      if (!z) continue;
      if (best === null || (rank[z] || 0) > (rank[best] || 0)) best = z;
    }
    return best;
  }

  function showDamageFlash() {
    damageOverlay.classList.remove('show');
    void damageOverlay.offsetWidth;
    damageOverlay.classList.add('show');
    damageShake = 0.45;
  }

  function addKillFeed(msg) {
    var div = document.createElement('div');
    div.className = 'kill-item';
    var killer = document.createElement('span');
    killer.className = 'killer';
    killer.textContent = (msg.killerId === local.id) ? '你' : (msg.killerName || '未知');
    var victim = document.createElement('span');
    victim.className = 'victim';
    victim.textContent = (msg.victimId === local.id) ? '你' : (msg.victimName || '未知');
    var weapon = document.createElement('span');
    weapon.className = 'weapon';
    weapon.textContent = ' [' + (WEAPONS[msg.weaponId] ? WEAPONS[msg.weaponId].name : msg.weaponId) + '] ';
    div.appendChild(killer);
    div.appendChild(document.createTextNode(' 击杀了 '));
    div.appendChild(victim);
    div.appendChild(weapon);
    // 命中部位。服务端只在枪械击杀时带 zone（近战/手雷没有命中点，见 server.js 的说明），
    // 所以这里 msg.zone 为空是正常情况，不是缺字段。
    if (msg.zoneLabel) {
      var zoneEl = document.createElement('span');
      zoneEl.className = 'zone' + (msg.zone === 'head' ? ' head' : '');
      zoneEl.textContent = msg.zone === 'head' ? '爆头' : msg.zoneLabel;
      div.appendChild(zoneEl);
    }
    killfeed.appendChild(div);
    while (killfeed.children.length > 5) killfeed.removeChild(killfeed.firstChild);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 5000);
  }

  function updateScoreboard() {
    var rows = [];
    remotePlayers.forEach(function (r) {
      rows.push({ name: r.name, kills: r.kills, deaths: r.deaths, streak: r.streak || 0, bestStreak: r.bestStreak || 0, alive: r.alive, me: false });
    });
    rows.push({ name: local.name || '你', kills: local.kills, deaths: local.deaths, streak: local.streak || 0, bestStreak: local.bestStreak || 0, alive: local.alive, me: true });
    rows.sort(function (a, b) {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.deaths - b.deaths;
    });
    scoreBody.innerHTML = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.me) tr.className = 'me';
      var tdName = document.createElement('td'); tdName.textContent = row.name + (row.me ? '（你）' : '');
      var tdAlive = document.createElement('td');
      var dot = document.createElement('span');
      dot.className = row.alive ? 'alive-dot' : 'dead-dot';
      tdAlive.appendChild(dot);
      tdAlive.appendChild(document.createTextNode(row.alive ? '存活' : '阵亡'));
      var tdKills = document.createElement('td'); tdKills.textContent = row.kills;
      var tdDeaths = document.createElement('td'); tdDeaths.textContent = row.deaths;
      // 连杀列：本命连杀（亮）+ 本局最高（灰）。
      // 本命连杀死一次就归零，单独一个数字信息量太低，所以把「最高」并排给出——
      // 前者是「现在有多危险」，后者是「这局打得怎么样」。
      var tdStreak = document.createElement('td');
      var cur = document.createElement('span');
      cur.className = 'sb-streak';
      cur.textContent = row.streak;
      tdStreak.appendChild(cur);
      if (row.bestStreak > 0) {
        var best = document.createElement('span');
        best.className = 'sb-best';
        best.textContent = '最高 ' + row.bestStreak;
        tdStreak.appendChild(best);
      }
      var tdKD = document.createElement('td');
      tdKD.textContent = row.deaths > 0 ? (row.kills / row.deaths).toFixed(2) : row.kills;
      tr.appendChild(tdName); tr.appendChild(tdAlive); tr.appendChild(tdKills); tr.appendChild(tdDeaths); tr.appendChild(tdStreak); tr.appendChild(tdKD);
      scoreBody.appendChild(tr);
    });
  }

    function updateLeaderboard() {
      if (!leaderboardList) return;
      var rows = [];
      remotePlayers.forEach(function (r) {
        rows.push({ name: r.name, kills: r.kills, deaths: r.deaths, streak: r.streak || 0, me: false });
      });
      rows.push({ name: local.name || '你', kills: local.kills, deaths: local.deaths, streak: local.streak || 0, me: true });
      rows.sort(function (a, b) {
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
      });

      leaderboardList.innerHTML = '';
      rows.slice(0, 8).forEach(function (row, index) {
        var div = document.createElement('div');
        div.className = 'lb-row' + (row.me ? ' me' : '');
        var rank = document.createElement('span');
        rank.className = 'lb-rank r' + (index + 1);
        rank.textContent = (index + 1);
        var nameSpan = document.createElement('span');
        nameSpan.className = 'lb-name';
        nameSpan.textContent = row.name + (row.me ? '（你）' : '');
        var killsSpan = document.createElement('span');
        killsSpan.className = 'lb-kills';
        killsSpan.textContent = row.kills + ' 杀';
        var deathsSpan = document.createElement('span');
        deathsSpan.className = 'lb-deaths';
        deathsSpan.textContent = row.deaths + ' 死';
        div.appendChild(rank);
        div.appendChild(nameSpan);
        div.appendChild(killsSpan);
        div.appendChild(deathsSpan);
        // 只给正在连杀（≥2）的人挂标记。挂 0/1 的话八行里全是「1 连」，
        // 反而看不出谁真的在滚雪球。
        if (row.streak >= 2) {
          var streakSpan = document.createElement('span');
          streakSpan.className = 'lb-streak';
          streakSpan.textContent = '🔥' + row.streak;
          div.appendChild(streakSpan);
        }
        leaderboardList.appendChild(div);
      });
    }

  // ----------------------------------------------------------
  // 网络
  // ----------------------------------------------------------
  function send(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    }
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(proto + location.host);
    socket.onopen = function () {
      send({
        t: 'join',
        name: local.name,
        melee: selectedMelee,
        primary: selectedPrimary
      });
    };
    socket.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handleServerMessage(msg);
    };
    socket.onclose = function () {
      if (gameStarted) {
        addKillFeed({ killerId: null, killerName: '服务器', victimId: local.id, victimName: local.name || '你', weaponId: '' });
      }
    };
    socket.onerror = function () { /* onclose 会处理 */ };
  }

  function handleServerMessage(msg) {
    switch (msg.t) {
      case 'welcome':
        local.id = msg.id;
        break;
      // 服务端也把「没昵称」拦一道：客户端被改过或旧页面缓存了，
      // 照样进不来，而不是被服务端补一个默认名混进对局。
      case 'joinDenied':
        gameStarted = false;
        local.alive = false;
        local.initialized = false;
        if (document.exitPointerLock) document.exitPointerLock();
        hud.style.display = 'none';
        menu.style.display = 'flex';
        if (socket) { socket.onclose = null; socket.close(); socket = null; }
        warnName(msg.reason || '请先输入昵称');
        break;
      case 'joined':
        local.id = msg.id;
        local.alive = true;
        local.initialized = true;
        if (msg.pos) {
          local.pos.set(msg.pos.x, msg.pos.y !== undefined ? msg.pos.y : 0, msg.pos.z);
          local.yaw = msg.yaw || 0;
          local.pitch = 0;
        }
        local.primary = msg.primary || selectedPrimary;
        local.secondary = 'pistol';
        // ranged 始终跟着 primary，不能再拿本地选的枪盖一遍：服务端如果回的
        // primary 和本地选的不一样，就会出现"弹匣按 A 枪算、模型是 B 枪"。
        local.ranged = local.primary;
        local.current = 'primary';
        local.melee = selectedMelee;
        local.ammoPrimary = WEAPONS[local.primary].mag;
        local.ammoSecondary = WEAPONS.pistol.mag;
        local.ammo = local.ammoPrimary;
        local.reservePrimary = (typeof msg.reservePrimary === 'number') ? msg.reservePrimary : WEAPONS[local.primary].reserve;
        local.reserveSecondary = (typeof msg.reserveSecondary === 'number') ? msg.reserveSecondary : WEAPONS.pistol.reserve;
        local.reserve = local.reservePrimary;
        local.grenadeCount = (typeof msg.grenadeCount === 'number') ? msg.grenadeCount : GRENADE_MAX;
        local.smokeCount = (typeof msg.smokeCount === 'number') ? msg.smokeCount : SMOKE_MAX;
        local.hp = local.maxHp;
        local.kills = 0;
        local.deaths = 0;
        lastHp = local.hp;
        deathOverlay.style.display = 'none';
        // 靶子只在 joined 里下发一次（位置和朝向是服务端常量，不进快照）
        spawnDummies(msg.dummies);
        applyWeaponVisibility();
        updateHUD();
        break;
      case 'snapshot':
        handleSnapshot(msg.players);
        break;
      case 'fire':
        handleFire(msg);
        break;
      case 'melee':
        handleMeleeEvent(msg);
        break;
      case 'smoke':
          if (msg.pos) createSmokeCloud(new THREE.Vector3(msg.pos.x, msg.pos.y, msg.pos.z));
          break;
        case 'throw':
            // 服务端只给出手状态，弹道由这里自己积分（见 stepThrown）
            spawnThrowable(msg);
            if (msg.id !== local.id) throwAnimRemote(msg.id);
            break;
        case 'explosion':
            if (msg.pos) createExplosionEffect(new THREE.Vector3(msg.pos.x, msg.pos.y, msg.pos.z));
            break;
        case 'kill':
        addKillFeed(msg);
        if (msg.victimId === local.id) {
          respawnCountdownEnd = Date.now() + 3000;
          playDeathSound();
          // 死亡时立刻把横幅收掉。服务端已经把 streak 归零了，
          // 让"神之领域"停在屏幕上跨过死亡画面很怪。
          if (streakBanner) streakBanner.classList.remove('show');
          // 死亡打断重击前摇：人都倒了不该还举着刀
          cancelHeavyWindup();
        }
        if (msg.killerId === local.id) {
          // 只在跨过阈值的那一杀有 streakLabel（服务端判定），所以这里不用自己去比。
          if (msg.streakLabel) showStreakBanner(msg.streakLabel, msg.streak);
          if (msg.healed > 0) showHealPopup(msg.healed);
        }
        break;
      case 'reload':
        // 别人开始换弹：起第三人称换弹动画。
        // 用这条广播当触发源而不是等快照里的 reloading 边沿——快照 20Hz，
        // 边沿最多晚 50ms，而这条消息是服务端收到 reload 的当帧就发的。
        startRemoteReload(msg.id);
        break;
      case 'respawn':
        handleRespawn(msg);
        break;
      case 'dummyHit':
        handleDummyHit(msg);
        break;
      case 'dummyReset':
        handleDummyReset(msg);
        break;
      case 'leave':
        removeRemote(msg.id);
        break;
      default:
        break;
    }
  }

  function handleSnapshot(list) {
    for (var i = 0; i < list.length; i++) {
      var pd = list[i];
      if (pd.id === local.id) {
        var hpChanged = pd.hp < lastHp;
        lastHp = pd.hp;
        local.hp = pd.hp;
        var wasAlive = local.alive;
          local.alive = pd.alive;
        if (!local.alive) { triggerDown = false; ads = false; if (scopeOverlay) scopeOverlay.style.display = 'none'; crosshair.classList.remove('hidden'); if (wasAlive) respawnCountdownEnd = Date.now() + 3000; }
        local.kills = pd.kills;
        local.deaths = pd.deaths;
        if (typeof pd.streak === 'number') local.streak = pd.streak;
        if (typeof pd.bestStreak === 'number') local.bestStreak = pd.bestStreak;
        local.ammo = pd.ammo;
        local.reloading = pd.reloading;
        local.current = pd.current;
        local.melee = pd.melee;
        local.ranged = pd.ranged;
          if (pd.primary) local.primary = pd.primary;
          if (pd.secondary) local.secondary = pd.secondary;
          if (typeof pd.ammoPrimary === 'number') local.ammoPrimary = pd.ammoPrimary;
          if (typeof pd.ammoSecondary === 'number') local.ammoSecondary = pd.ammoSecondary;
          if (typeof pd.reserve === 'number') local.reserve = pd.reserve;
          if (typeof pd.reservePrimary === 'number') local.reservePrimary = pd.reservePrimary;
          if (typeof pd.reserveSecondary === 'number') local.reserveSecondary = pd.reserveSecondary;
          if (typeof pd.grenadeCount === 'number') local.grenadeCount = pd.grenadeCount;
          if (typeof pd.smokeCount === 'number') local.smokeCount = pd.smokeCount;
        if (!local.initialized) {
          local.initialized = true;
          if (pd.pos) local.pos.set(pd.pos.x, pd.pos.y, pd.pos.z);
          local.yaw = pd.yaw || 0;
        }
        if (hpChanged) showDamageFlash();
        deathOverlay.style.display = local.alive ? 'none' : 'flex';
        updateHUD();
      } else {
        var r = remotePlayers.get(pd.id);
        if (!r) r = createRemotePlayer(pd.id, pd.name);
        r.name = pd.name;
        r.targetPos.set(pd.pos.x, pd.pos.y, pd.pos.z);
        r.targetYaw = pd.yaw;
        r.targetPitch = pd.pitch;
        if (typeof pd.crouch === 'boolean') r.crouch = pd.crouch;
        if (pd.vel) r.vel.set(pd.vel.x, pd.vel.y, pd.vel.z);
        r.hp = pd.hp;
        r.alive = pd.alive;
        r.current = pd.current;
        r.melee = pd.melee;
        r.ranged = pd.ranged;
          if (pd.primary) r.primary = pd.primary;
          if (pd.secondary) r.secondary = pd.secondary;
        r.kills = pd.kills;
        r.deaths = pd.deaths;
        if (typeof pd.streak === 'number') r.streak = pd.streak;
        if (typeof pd.bestStreak === 'number') r.bestStreak = pd.bestStreak;
        if (r.firstUpdate) {
          r.firstUpdate = false;
          r.renderPos.copy(r.targetPos);
          r.renderYaw = r.targetYaw;
          r.renderPitch = r.targetPitch;
        }
        updateRemoteWeaponVisual(r);

        // 更新血条
        var frac = clamp(r.hp / 100, 0, 1);
        r.healthFill.scale.x = Math.max(0.001, frac);
        r.healthFill.position.x = -0.42 * (1 - frac);
        r.healthFill.material.color.setHex(frac > 0.6 ? 0x3fb950 : (frac > 0.3 ? 0xd29922 : 0xf85149));
      }
    }
    var now = Date.now();
      if (now - lastLeaderboardUpdate > 500) {
        lastLeaderboardUpdate = now;
        updateLeaderboard();
      }
      if (showScore) updateScoreboard();
  }

  function handleFire(msg) {
    var isLocal = msg.id === local.id;
    if (isLocal) {
      // 打靶子和打人给完全一样的命中反馈（准星、音效、部位提示）。
      // 少一种反馈，练枪练出来的手感就和实战差一截——那这排靶子就白摆了。
      var hitAny = (msg.hitPlayers && msg.hitPlayers.length > 0) ||
                   (msg.hitDummies && msg.hitDummies.length > 0);
      if (hitAny) {
        var zone = bestHitZone(msg.tracers);
        showHitmarker(zone);
        playHitSound(zone === 'head');
      }
      return;
    }
    playShotSound(msg.weaponId, true);
    addFlash(new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z), 0xffcc66, 0.35, 0.06);
    if (msg.tracers) {
      msg.tracers.forEach(function (tr) {
        addTracer(
          new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z),
          new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z),
          0.06
        );
        if (tr.hitPlayer || tr.hitDummy) {
          // 爆头的血雾更亮更多：旁观者也该看得出刚才那一枪打的是头
          var head = tr.hitZone === 'head';
          addImpact(new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z), head ? 0xff2222 : 0xff6655, head ? 18 : 10, false);
        } else {
          addImpact(new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z), 0xffd27a, 6, false);
        }
      });
    }
    var r = remotePlayers.get(msg.id);
    if (r) r.fireAnim = 0.15;
  }

  function handleMeleeEvent(msg) {
    var isLocal = msg.id === local.id;
    if (isLocal) {
      if ((msg.hitPlayers && msg.hitPlayers.length > 0) ||
          (msg.hitDummies && msg.hitDummies.length > 0)) {
        // 从所有命中玩家里找出最高级别的部位，用作命中标记。
        // 只打中靶子时 hitPlayers 是空的（重击现在也会命中靶子），
        // 此时 bestZone 保持 null，showHitmarker 走默认标记。
        var rank = { head: 4, torso: 3, leg: 2, arm: 1 };
        var bestZone = null;
        if (msg.hitZones && msg.hitPlayers) {
          for (var i = 0; i < msg.hitPlayers.length; i++) {
            var z = msg.hitZones[msg.hitPlayers[i]];
            if (z && (bestZone === null || (rank[z] || 0) > (rank[bestZone] || 0))) bestZone = z;
          }
        }
        showHitmarker(bestZone);
        playHitSound();
      }
      return;
    }
    var r = remotePlayers.get(msg.id);
    if (r) {
      addSlashEffect(r.renderPos.clone(), r.renderYaw);
      if (msg.heavy) {
        // 重击：弧线和时长照 MELEE_HEAVY 取
        var hvs = MELEE_HEAVY[msg.weaponId] || MELEE_HEAVY.knife;
        r.swingStyle = hvs.s;
        r.swingDur = clamp(hvs.cd * 0.82, 0.18, 0.85);
      } else {
        // 段号由服务端给（它才是判定方），弧线和时长照段号取
        var stage = msg.stage || 0;
        r.swingStyle = meleeStep(msg.weaponId, stage).s;
        r.swingDur = meleeSwingDur(msg.weaponId, stage);
      }
      r.swingAnim = r.swingDur;
      playMeleeSound(msg.weaponId, true);
    }
  }

  function handleRespawn(msg) {
    if (msg.id === local.id) {
      local.alive = true;
      local.hp = local.maxHp;
      local.ammo = WEAPONS[local.ranged].mag;
        local.ammoPrimary = WEAPONS[local.primary].mag;
        local.ammoSecondary = WEAPONS.pistol.mag;
        // 补给重置，与服务端 spawn() 保持一致。这里本地先算一遍而不是等快照，
        // 是为了让复活瞬间的 HUD 就是对的——否则最多 50ms 内会显示上条命
        // 打空的弹药数，复活后第一眼看到「0 / 0」很容易误判成没子弹。
        local.reservePrimary = WEAPONS[local.primary].reserve;
        local.reserveSecondary = WEAPONS.pistol.reserve;
        local.grenadeCount = GRENADE_MAX;
        local.smokeCount = SMOKE_MAX;
        local.current = 'primary';
        local.ranged = local.primary;
        local.ammo = local.ammoPrimary;
        local.reserve = local.reservePrimary;
      cancelReload();          // 换弹途中阵亡：连定时器一起作废，别让它复活后补弹
      // 重生必须把「手上这把武器」的全部状态归零，而不只是作废换弹动画。
      //
      // 这里原来只有 cancelReloadAnim()，于是持刀阵亡再重生会出一个错乱状态：
      // 上面几行已经把 local.current 改回 'primary'（射击逻辑因此走枪械分支，
      // 能正常开枪），但 vmGunGroup/vmMeleeGroup 的 visible 是由
      // applyWeaponVisibility() 单独设置的，而它只在 switchWeapon() 里被调用——
      // 重生这条路径从来没调过。结果就是手上顶着刀的模型却在打枪。
      // （applyWeaponVisibility 的注释本来就写着「切枪/重生都会走到这儿」，
      //   是调用点漏了，不是设计如此。）
      //
      // 顺带把挥砍与散射/后坐力也清掉：死在挥刀中途的话 swingTime 还在跑、
      // vmMeleeGroup 停在半个劈砍的姿态上，下条命第一次拿刀就是歪的；
      // bloom/recoil 不清则准星张开度和抬枪量会跨越死亡继承下来，
      // 而服务端在 spawn() 里是把 bloom 和 comboStage 都归零的，不清就两边不一致。
      swingTime = 0;
      localComboStage = 0;
      lastLocalMelee = 0;
      cancelHeavyWindup();   // 复活打断重击前摇
      vmMeleeGroup.rotation.set(0, 0, 0);
      vmMeleeGroup.position.set(0, 0, 0);
      bloom = 0;
      recoilPitch = 0; recoilYaw = 0; recoilZ = 0;
      triggerDown = false;
      ads = false;
      applyWeaponVisibility();   // 内部已含 cancelReloadAnim()
      local.vel.set(0, 0, 0);
      if (msg.pos) {
        local.pos.set(msg.pos.x, 0, msg.pos.z);
        local.yaw = msg.yaw || 0;
      }
      lastHp = local.hp;
        damageShake = 0;
          respawnCountdownEnd = 0;
      deathOverlay.style.display = 'none';
      updateHUD();
    } else {
      var r = remotePlayers.get(msg.id);
      if (r && msg.pos) {
        r.targetPos.set(msg.pos.x, msg.pos.y !== undefined ? msg.pos.y : 0, msg.pos.z);
        r.alive = true;
        r.deadT = 0;
        r.bodyGroup.rotation.x = 0;
        r.bodyGroup.position.y = 0;
        // 重生时手上是满弹，之前那段换弹动画作废；不清的话零件会停在半空
        if (r.reloadDur > 0) stopRemoteReload(r);
      }
    }
  }

  function removeRemote(id) {
    var r = remotePlayers.get(id);
    if (!r) return;
    scene.remove(r.group);
    remotePlayers.delete(id);
  }

  // ----------------------------------------------------------
  // 练枪靶子
  //
  // 服务端实体（server.js 的 DUMMY_SPOTS / damageDummy）。客户端只做三件事：
  // 建模型、放命中反馈、按广播倒地和复位。判定一行都不在这边——靶子走的是
  // 和真人**同一套** raycastPlayerZones，练出来的手感才和实战对得上。
  //
  // 造型照参考照片：黑色紧身短袖 T、米白色束脚运动裤、黑色短发（顶部碎发、
  // 两侧推短）、赤手拳击站架。
  //
  // 站架收得紧（双肘贴肋、拳头到脸侧）不是风格选择，是**判定倒逼**的：
  // 服务端的躯干柱半径只有 0.34、手臂柱固定在体侧 ox=±0.26。前手一旦按标准
  // 架式伸到身前 0.35m 外，视觉上明明打中了、判定上却是空枪——练枪的靶子
  // 出这种事最坏。收成紧护架之后，肩→肘→拳整条手臂都落在躯干柱里，打哪都算数。
  // 以后再改姿势，先量一遍这件事，别只看像不像。
  // ----------------------------------------------------------
  var DUMMY_BLADE = -0.26;      // 上身侧转：负角＝左肩朝前（与 BLADE 同约定）
  var DUMMY_HIT_ANIM = 0.16;    // 挨一发之后的后仰时长
  var DUMMY_TAG_DIST = 45;      // 名牌/血条的显示距离：十个靶子排成一排，
                                // 全程挂着标签的话半个地图边缘都是浮字
  var DUMMY_FALL_MAX = 1.45;    // 倒地角（≈83°，几乎躺平）
  // 倒地时腿要**伸直**。之前是整个人当刚体绕后脚跟翻过去，"最低点贴地"这条
  // 也验过——但验错了：最低点就是支点本身，等于只证明了支点没陷进去。
  // 实际渲染出来是一根 83° 的斜板拿后脚跟当撑杆，躯干悬空 33cm、头悬空 39cm。
  // 根子在拳击站架的后脚落在 z=+0.30：刚体往后翻，这只脚必然变成撑杆。
  // 所以倒地过程里把髋/膝/踝插值到"平躺伸腿"，人才真躺在地上。
  // 这两个角是按躺平后大腿要水平反解的：大腿局部朝 -y，绕 x 转 h 之后
  // 世界 y 分量 = -cos(h)cos(FALL) + sin(h)sin(FALL)，令其为 0 得 h = FALL - π/2 ≈ 0.12。
  var DUMMY_DOWN_HIP = 0.12;
  var DUMMY_DOWN_KNEE = -0.05;  // 留一点余量，完全绷直的膝盖比躺着的人更像根棍子
  var DUMMY_DOWN_FOOT = 0.34;   // 脚尖跟着躺平（不转的话鞋底会朝天翘着）
  // 每个角度需要整体抬起多少才刚好贴地：拿真几何量出来的表（见 measureDummyFall）。
  // 十个靶子几何完全一样，所以只量第一个。
  var dummyFallLift = null;
  var dummyMats = null;
  var dummyGeo = {};
  var _dq = new THREE.Quaternion();

  // 十个靶子长得一模一样，所以**共用一套材质**（十份材质在画面上没有任何区别，
  // 只是白白多十份 draw state）。代价是不能单独把某一个调透明——所以倒地表现
  // 走的是「整个人后仰倒下」，不是玩家那种降 opacity。
  function getDummyMats() {
    if (dummyMats) return dummyMats;
    dummyMats = {
      // 不用纯黑：ACES 下 0x000000 的紧身衣是一整片没有明暗的剪影，
      // 抬到 0x1c1f24 才看得出布料的转折。
      tee: new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.87, metalness: 0.03 }),
      // 领口/袖口要比衣身亮一档，否则黑衣服的边缘线在暗处整个消失
      teeHi: new THREE.MeshStandardMaterial({ color: 0x2f343b, roughness: 0.82, metalness: 0.03 }),
      pants: new THREE.MeshStandardMaterial({ color: 0xdcd5c1, roughness: 0.93, metalness: 0.0 }),
      // 腰头/裤脚束口，比裤身暗一档才看得出是"一圈"而不是同色的一段
      band: new THREE.MeshStandardMaterial({ color: 0xbcb49e, roughness: 0.9, metalness: 0.0 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xd9a878, roughness: 0.84 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.66 }),
      // 两侧推短的鬓角：比头顶**亮**一档，这一档明度差就是"渐变"读得出来的全部原因
      fade: new THREE.MeshStandardMaterial({ color: 0x2b241f, roughness: 0.8 }),
      brow: new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.8 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.42 }),
      shoe: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.72 }),
      sole: new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.86 }),
      // 脚下的标记环：远处一眼能认出"那一排是靶子不是人"
      ring: new THREE.MeshStandardMaterial({ color: 0xc8781e, emissive: 0x4a2606, roughness: 0.6, metalness: 0.0 })
    };
    return dummyMats;
  }

  // 胶囊按尺寸缓存：十个靶子各建一遍的话是一百多个一模一样的 geometry。
  // （rBox 走的是 GEO_CACHE，本来就共用，不用管。）
  function dcap(r, len, capSeg, radSeg) {
    var cs = capSeg || 6, rs = radSeg || 14;
    var k = r.toFixed(3) + '_' + len.toFixed(3) + '_' + cs + '_' + rs;
    if (!dummyGeo[k]) dummyGeo[k] = new THREE.CapsuleGeometry(r, Math.max(0.005, len), cs, rs);
    return dummyGeo[k];
  }
  // 倒角盒（和人物模型里的 P 同一套理由：硬边盒在这套光照下只有一片死平光）
  function dP(w, h, d, mat, x, y, z, axis) {
    var rr = Math.min(0.030, Math.min(w, Math.min(h, d)) * 0.26);
    return rBox(w, h, d, rr, mat, x, y, z, axis || 'z');
  }
  // 薄贴片（眉毛/眼/嘴）：没有厚度可倒角，硬边盒
  function dF(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; return m;
  }
  // 绕一整圈的束带（腰头、裤脚束口、领口）。只在侧面凸一点的贴片在这套光照下
  // 读不出来，绕整圈才能啃出一条会亮的边。zk 把前后压扁——躯干是扁的，
  // 正圆的环会在身前身后各鼓出好几厘米。
  function dRing(r, tube, mat, y, z, zk, seg) {
    var m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg || 18), mat);
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, zk || 1, 1);
    m.position.set(0, y, z || 0);
    m.castShadow = true;
    return m;
  }
  // 绕 y 转 t：把身体正朝向量的点换算到侧转过的 chest 局部坐标（t 传 -DUMMY_BLADE）。
  // 和 bladeSpace 同一件事，只是那个把 BLADE 写死了，这边角度不一样。
  function dRotY(p, t) {
    var c = Math.cos(t), s = Math.sin(t);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  }

  // 赤手握拳。靶子没有手套（参考图是赤手），指节要能看出是攥着的，
  // 不然末端就是一截圆管，像被截肢。
  function makeDummyFist(mirror) {
    var M = getDummyMats();
    var g = new THREE.Group();
    g.add(dP(0.082, 0.088, 0.070, M.skin, 0, 0, 0));            // 掌
    for (var i = 0; i < 4; i++) {                               // 四指指节
      g.add(dP(0.019, 0.030, 0.062, M.skin, -0.028 + i * 0.019, 0.028, -0.012));
    }
    var th = dP(0.026, 0.062, 0.030, M.skin, mirror ? -0.040 : 0.040, -0.006, -0.024);
    th.rotation.z = mirror ? 0.5 : -0.5;                        // 拇指压在指节外侧
    g.add(th);
    return g;
  }

  // 一具靶子的完整模型。朝向约定和玩家一致：**正面朝 -z**。
  function buildDummyModel() {
    var M = getDummyMats();
    var group = new THREE.Group();
    var bodyGroup = new THREE.Group();          // 倒地时转这一层（脚下的标记环要留在原地）
    group.add(bodyGroup);

    // ---- 下半身（拳击站架：左脚在前、右脚后撇外八，双膝微屈）----
    // 髋高 0.90 照玩家模型定（服务端的腿部柱 y 0.02~0.98 就是按这个划的）。
    // 膝盖要弯，脚又必须踩在地上，所以两段之和 (0.85) 要比髋到踝的直线距离
    // (~0.82) 长一点：不留这点余量，"屈膝"只能靠把整个人往下压，
    // 头会跟着掉出服务端那颗头部判定球。
    var HIP_Y = 0.90, THIGH = 0.42, SHIN = 0.43, ANKLE_Y = 0.085;
    function makeLeg(hipX, footZ, footYaw, splay) {
      var leg = new THREE.Group();
      leg.position.set(hipX, HIP_Y, 0);
      // 外八站宽：绕 z 转一个固定角，踝就往外挪 (HIP_Y-ANKLE_Y)*tan(splay)。
      // 绕 z 转不改变 z 分量，所以下面矢状面那套解法照旧成立，
      // 只要把竖直落差按 1/cos 放大回来。
      var ay = (HIP_Y - ANKLE_Y) / Math.cos(splay);
      var d = Math.sqrt(ay * ay + footZ * footZ);
      // 矢状面两段反解：给定踝的落点，解出大腿倾角和屈膝角。手写角度的话，
      // 脚要么陷进地里要么悬空，而且改一次腿长就得重新试一遍。
      var knee = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
      var a = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
      // 绕 x 转正角＝肢体往前（-z）摆：(0,-1,0) → (0,-cos,-sin)
      var t1 = Math.asin(clamp(-footZ / d, -1, 1)) + a;
      leg.rotation.z = splay;
      leg.rotation.x = t1;

      // 大腿/小腿：胶囊总长 = len + 2r，所以 len 要按「段长 - 两个半径」给，
      // 否则一段一段地往下越接越长，膝盖会顶出裤子。
      var thigh = new THREE.Mesh(dcap(0.100, THIGH - 0.20), M.pants);
      thigh.position.y = -THIGH / 2; thigh.castShadow = true; leg.add(thigh);

      var kneeJoint = new THREE.Group();
      kneeJoint.position.y = -THIGH;
      kneeJoint.rotation.x = -knee;
      leg.add(kneeJoint);
      // 膝盖：大腿 r0.100 直接接小腿 r0.084，转折处是一个圆头突然缩一截，
      // 看着像玩偶的球窝关节。补一颗和大腿同粗的球把这段过渡吃掉——
      // 给 0.094 时 x 向只有 0.090，比大腿还细 1cm，正面看膝盖是掐进去的。
      var kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.100, 12, 10), M.pants);
      kneeCap.scale.set(0.98, 1, 1.02); kneeCap.castShadow = true;
      kneeJoint.add(kneeCap);
      var shin = new THREE.Mesh(dcap(0.084, SHIN - 0.168), M.pants);
      shin.position.y = -SHIN / 2; shin.castShadow = true; kneeJoint.add(shin);
      // 裤脚束口（束脚裤的标志，参考图裤腿在脚踝上方收住）
      kneeJoint.add(dRing(0.086, 0.017, M.band, -SHIN + 0.085, 0, 1.0, 16));

      // 脚：父级已经转了 (t1 - knee)，这里转回来鞋底才是水平的，
      // 否则整只鞋斜着插进地里。（splay 那 5° 的侧倾没抵消——绕 z 的旋转
      // 在父级最外层，从里面抵不掉，而 0.09rad 在 0.11 宽的鞋上是 5mm，看不出来。）
      var foot = new THREE.Group();
      foot.position.y = -SHIN;
      foot.rotation.x = knee - t1;
      foot.rotation.y = footYaw;
      kneeJoint.add(foot);
      // 白色运动鞋。鞋底底面要正好落在 y=0：rBox 的倒角会让上下各外扩一个
      // bevelSize(7mm)，按标称尺寸摆会整只脚陷进地里。
      foot.add(dP(0.116, 0.032, 0.285, M.sole, 0, -ANKLE_Y + 0.023, -0.030));
      foot.add(dP(0.110, 0.078, 0.245, M.shoe, 0, -0.012, -0.022));
      foot.add(dP(0.098, 0.056, 0.100, M.shoe, 0, -0.024, -0.128));   // 鞋头包头
      foot.add(dP(0.104, 0.056, 0.105, M.shoe, 0, 0.030, 0.042));     // 鞋帮后跟
      // 倒地要把腿插值成平躺，所以把三个关节和它们的站立角一起带出去
      leg.kneeJoint = kneeJoint;
      leg.footJoint = foot;
      leg.stand = { hip: t1, knee: -knee, foot: knee - t1 };
      return leg;
    }
    // 左脚在前（与左肩朝前的侧身一致），右脚后撇。footYaw 为负＝脚尖转向模型右侧，
    // 正是正架（orthodox）双脚该指的方向。
    var leftLeg = makeLeg(-0.115, -0.145, -0.24, -0.085);
    var rightLeg = makeLeg(0.115, 0.170, -0.62, 0.085);

    // 骨盆/胯（跟着腿，不进 chest：chest 要侧转，转了胯就从腿上甩出去）
    // 三版了，记一下前两版分别错在哪：
    //   倒角盒 —— 四条竖棱在胯这个圆的地方特别假，盒宽还得压过上身胶囊，
    //             于是在裤子侧面顶出一道台阶。
    //   上宽下窄的圆台 —— 台阶没了，但换成了一只白桶：上端面是个朝天的圆盘，
    //             正对阳光比任何竖面都亮；而且**收口方向是反的**，
    //             裤子在胯这里最窄（0.150）、大腿又鼓到 0.215，
    //             正面看就是"白桶架在两根气球腿上"。
    // 现在用椭球：没有任何朝天的平面（顶上是弧顶，怎么照都不会白成一圈），
    // 最宽处 0.194 正好接上大腿外沿 0.215，往下收进裤裆、往上收进 T 恤下摆
    // （下摆底圈在这一高度是 x 0.188 / z 0.119，椭球在 y=1.045 只有 0.133）。
    // 向下多伸 9cm 到 0.808 是为了填住两条大腿之间那道 3cm 的裆缝。
    var pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.190, 20, 14), M.pants);
    pelvis.scale.set(1.02, 0.72, 0.62);
    pelvis.position.y = 0.945; pelvis.castShadow = true;
    // 松紧腰头。露在 T 恤下摆和裤身之间那一截才是"运动裤"的读法。
    // 外沿 0.174/z 0.115 卡在两个尺寸之间：比椭球在这一高度的截面（0.162/0.099）
    // 大，才看得出是一圈；又必须小于 T 恤下摆（0.188/0.1215），
    // 否则整圈从黑衣服里钻出来——上一版给到 0.198/0.131，
    // 前后各钻出去 1cm，正面背面各是一道刺眼的白月牙（渲过）。
    var waist = dRing(0.160, 0.014, M.band, 1.020, 0, 0.66, 20);

    // ---- 上身（黑色紧身短袖 T）----
    var chest = new THREE.Group();
    chest.rotation.y = DUMMY_BLADE;
    // 躯干比玩家瘦一圈：那边的粗细是算上防弹背心和胸挂的，这边只有一件贴身 T。
    // 压扁 0.62 是照真人胸厚/胸宽（约 0.24/0.38）来的，不压就是个圆桶。
    var torso = new THREE.Mesh(dcap(0.185, 0.30, 7, 16), M.tee);
    torso.scale.set(0.98, 1, 0.62); torso.position.y = 1.27; torso.castShadow = true;
    chest.add(torso);
    // 下摆。原来是一块 0.399×0.260 的倒角盒，比躯干在这一段的截面
    // （x 半宽 0.180 / z 半厚 0.114）宽出两厘米——侧面看是一块黑托盘横在腰上，
    // 不是衣摆。换成微喇的圆台再按同一个 0.62 压扁：顶圈与胶囊齐平，
    // 底圈只外扩 1cm 压在裤腰上，正好是 T 恤下摆盖住裤头的那道边。
    var hem = new THREE.Mesh(new THREE.CylinderGeometry(0.187, 0.196, 0.082, 20), M.tee);
    hem.scale.set(0.98, 1, 0.62); hem.position.y = 1.086; hem.castShadow = true;
    chest.add(hem);
    // 下摆底口的卷边。圆柱的下沿是一条硬棱，从侧面看是一片黑色的尖角搭在胯上；
    // 沿着底口套一圈同色细环，棱就变成卷边（zk 按底口的椭圆比 0.1215/0.192 给）。
    chest.add(dRing(0.192, 0.011, M.tee, 1.045, 0, 0.633, 20));
    // 圆领口。半径必须超过胶囊在颈根那一圈的截面（1.575 处 x 半宽 0.099），
    // 照 0.079 给的话整圈埋在肩里看不见——圆环只有骑在表面上才读得出是领子。
    // 管径 0.014 太粗，渲出来是套在脖子上的护颈；0.009 才是一道领边。
    chest.add(dRing(0.105, 0.009, M.teeHi, 1.570, 0, 0.70, 18));
    // 胸/背的转折。紧身衣看得出胸肌和斜方肌，否则整个上身就是一个素胶囊。
    // 别用贴片盒：躯干截面是椭圆，一块平板的两个外角会翘出表面四五厘米，
    // 渲出来是绑在胸前的装甲板（前一版就是这样）。压扁的球才处处贴着弧面，
    // 凸出量从中心的 1.4cm 平滑收到边缘的 0。
    function dLump(rr, sx, sy, sz, x, y, z, mat) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(rr, 12, 10), mat);
      m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true;
      return m;
    }
    chest.add(dLump(0.078, 1.0, 0.80, 0.52, -0.070, 1.392, -0.074, M.tee));   // 左胸
    chest.add(dLump(0.078, 1.0, 0.80, 0.52, 0.070, 1.392, -0.074, M.tee));    // 右胸
    chest.add(dLump(0.105, 1.0, 0.62, 0.46, 0, 1.470, 0.070, M.tee));         // 上背/斜方肌

    // ---- 头（含五官与短发）----
    var headGroup = new THREE.Group();
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.070, 0.13, 14), M.skin);
    neck.position.y = 1.575; neck.castShadow = true;
    headGroup.add(neck);
    var head = dP(0.155, 0.190, 0.175, M.skin, 0, 1.700, 0);
    headGroup.add(head);
    headGroup.add(dP(0.118, 0.062, 0.150, M.skin, 0, 1.628, -0.008));   // 下颌收窄
    // 耳。位置按五官反推：真人耳廓上沿约与眼同高、下沿到嘴，也就是 1.65~1.71。
    // 之前给到 1.692±0.033（上沿越过眉毛）并且和下面那两块鬓角完全重叠，
    // 渲出来是黑鬓角上贴了一块亮肤色方片——特写下第一眼就是这个东西不对。
    headGroup.add(dP(0.020, 0.046, 0.036, M.skin, -0.081, 1.678, 0.014));
    headGroup.add(dP(0.020, 0.046, 0.036, M.skin, 0.081, 1.678, 0.014));
    // 五官。低多边形做脸只要多做就变橡皮泥，够用的量是：眉、眼、鼻、嘴。
    // z 都压在脸的前平面（-0.0875）上，凸出 7mm——凹进去就成了贴在脸上的色块。
    // 眼距原来给到 ±0.038（瞳距 76mm，真人 63mm），配上 46mm 宽的眉毛，
    // 特写下是"一副墨镜"；收到 ±0.033 才是一双眼。
    headGroup.add(dF(0.042, 0.011, 0.012, M.brow, -0.034, 1.727, -0.090));
    headGroup.add(dF(0.042, 0.011, 0.012, M.brow, 0.034, 1.727, -0.090));
    headGroup.add(dF(0.032, 0.015, 0.010, M.eye, -0.033, 1.706, -0.090));
    headGroup.add(dF(0.032, 0.015, 0.010, M.eye, 0.033, 1.706, -0.090));
    // 鼻。倒角盒的截面会被 bevelSize 向外扩 2×7mm，所以标称 0.030×0.052×0.040
    // 实际是 43×65mm、凸出脸面 25mm——一颗小丑鼻。按真人（宽 35、高 50、凸 20）
    // 反着算回标称值，就是下面这组。
    headGroup.add(dP(0.022, 0.040, 0.030, M.skin, 0, 1.682, -0.090));
    headGroup.add(dF(0.044, 0.010, 0.010, M.brow, 0, 1.650, -0.089));   // 嘴
    // 短发：顶盖 + 后脑到发际 + 两侧推短（更亮）+ 顶上几簇碎发。
    // 顶盖下沿卡在发际线 1.732（眉毛顶 1.7325 之上），再往下就盖住眉眼变成头盔了。
    // 尺寸也是照倒角外扩反算的：标称 0.161×0.072×0.180 → 实际 0.175×0.086×0.180，
    // 比脑袋（实际 0.169×0.204×0.175）四周只宽 2~3mm，正是"一层头发"的厚度。
    // 上一版标称 0.170/0.192 摆在 z=0.002：实际宽 0.184、前脸伸到 -0.094，
    // 比脸皮还往前 6.5mm，两侧各宽 7.5mm——渲出来是扣了个头盔，
    // 帽檐还在眉毛上压出一道硬阴影，眉和眼糊成一条黑杠。
    headGroup.add(dP(0.161, 0.072, 0.180, M.hair, 0, 1.781, 0.000));
    // 后脑那块原来给到 z 0.048±0.05，前沿压到 z=-0.002，正好把耳朵所在的
    // z≈0 那一段整个包住，于是耳朵成了从一团黑里横向戳出来的一块亮方片。
    // 往后挪到 0.030 起（耳朵后沿 0.032）：两者只擦一下，互不遮挡。
    headGroup.add(dP(0.162, 0.135, 0.076, M.hair, 0, 1.706, 0.068));
    // 两侧推短的鬓角只该在耳朵**上方**（真人的渐变就是从鬓角往上推的）。
    // 之前 1.712±0.053 正好压在耳朵上，把耳朵整块吃掉了。
    // x 也从 ±0.080 收到 ±0.076：倒角外扩后外沿 0.0868，只比脑袋侧面（0.0845）
    // 高出 2mm；给 0.080 时外沿 0.0908，是脸颊两侧各贴了一片 6mm 厚的黑翅膀。
    headGroup.add(dP(0.015, 0.062, 0.150, M.fade, -0.076, 1.748, 0.010));
    headGroup.add(dP(0.015, 0.062, 0.150, M.fade, 0.076, 1.748, 0.010));
    // 顶上的碎发。三簇分开摆是三个鼓包（像顶了朵蘑菇），改成一条压扁的横向
    // 起伏：前低后高、左右错开，远处只看得出"头顶不是个光滑的盖"，正是要的量。
    var tuft = [[-0.052, 0.030, 0.20], [-0.004, -0.014, -0.10], [0.050, 0.036, 0.26]];
    for (var tf = 0; tf < tuft.length; tf++) {
      var sp = dP(0.062, 0.024, 0.070, M.hair, tuft[tf][0], 1.822, tuft[tf][1]);
      sp.rotation.z = tuft[tf][2];
      headGroup.add(sp);
    }

    // ---- 手臂（护架：肘贴肋、拳到脸侧；短袖露小臂）----
    function makeArm(side) {
      var arm = new THREE.Group();
      arm.position.set(side * 0.180, 1.445, 0);
      // 上臂：肩到肘一段。上半截套短袖，下半截是裸的——参考图就是这样，
      // 而且这条袖口线是"穿着一件 T 恤"最直接的读法。
      var upper = new THREE.Mesh(dcap(0.058, ARM_L1 - 0.116), M.skin);
      upper.position.y = -ARM_L1 / 2; upper.castShadow = true; arm.add(upper);
      // 袖子用**圆柱**不是胶囊：短袖需要一条齐的切口，胶囊那个圆头收到尖了，
      // 袖口的圆环就箍在一个半径趋零的地方，等于箍在空气里。
      var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.066, 0.16, 14), M.tee);
      sleeve.position.y = -0.085; sleeve.castShadow = true; arm.add(sleeve);
      var sleeveHem = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.009, 6, 16), M.teeHi);
      sleeveHem.rotation.x = Math.PI / 2; sleeveHem.position.y = -0.163; arm.add(sleeveHem);
      // 三角肌：肩窝处不补一块，胶囊躯干和手臂之间会露出一条缝。
      // 它同时盖住袖子上端那个圆柱切口。
      var delt = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), M.tee);
      delt.scale.set(1.0, 0.86, 0.90); delt.position.set(side * 0.008, -0.010, 0);
      delt.castShadow = true; arm.add(delt);

      var fore = new THREE.Group();                 // 肘关节
      fore.position.set(0, -ARM_L1, 0);
      arm.add(fore);
      var foreMesh = new THREE.Mesh(dcap(0.050, ARM_L2 - 0.145), M.skin);
      foreMesh.position.y = -(ARM_L2 - 0.045) / 2; foreMesh.castShadow = true; fore.add(foreMesh);
      // 肘头用球而不是盒：这个护架屈肘接近 40°，两截胶囊的圆头在弯的外侧
      // 会豁开一道缝，球从任何角度都填得住，盒子只在正对某一面时填得住。
      var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.056, 12, 10), M.skin);
      elbow.castShadow = true; fore.add(elbow);
      var fist = makeDummyFist(side < 0);
      // makeDummyFist 的手腕朝 +y、指节朝 -z；小臂沿局部 -y 往下，
      // 所以直接挂在末端即可，指节自然朝前。
      fist.position.y = -ARM_L2;
      fist.rotation.x = -0.35;                      // 拳面略向上翻，像攥着的样子
      fist.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      fore.add(fist);

      arm.foreJoint = fore;
      return arm;
    }
    var leftArm = makeArm(-1);
    var rightArm = makeArm(1);
    chest.add(leftArm, rightArm);

    // 拳头的落点。坐标按**身体正朝向**给（好核对"离体轴多远"这件事），
    // 再换算到侧转过的 chest 里去——不换算就等于把目标点也一起转了。
    // 两个落点连同拳头半径都压在体轴 0.34 以内，见文件头那段说明。
    // 后手比前手高（到脸侧）但不敢再高：1.48+拳半径已经贴到躯干柱顶 1.56，
    // 再抬就有一小片拳头既不在躯干柱里、也进不了头部球（那颗球在 1.55 高度上
    // 只覆盖离轴 0.13 以内），成了打不中的死角。
    //
    // pole 决定肘往哪甩。x 只给 0.18：给到 0.35 时右肘会飞到离轴 0.32，
    // 离躯干柱边缘只剩 1.8cm，稍微改点姿势就出界。往前压 -0.10 是让肘贴着肋骨，
    // 也正是护架该有的样子。左右两侧各自转一遍，不要拿右边的结果去取负——
    // 镜像和旋转不交换，取负出来的那个 pole 前后偏了 3cm。
    var poleR = dRotY([0.18, -1, -0.10], -DUMMY_BLADE);
    var poleL = dRotY([-0.18, -1, -0.10], -DUMMY_BLADE);
    var lf = dRotY([-0.155, 1.435, -0.225], -DUMMY_BLADE);
    var rf = dRotY([0.150, 1.480, -0.205], -DUMMY_BLADE);
    solveArm(leftArm, lf[0], lf[1], lf[2], poleL[0], poleL[1], poleL[2]);
    solveArm(rightArm, rf[0], rf[1], rf[2], poleR[0], poleR[1], poleR[2]);

    bodyGroup.add(pelvis, waist, leftLeg, rightLeg, chest, headGroup);

    // 脚下的标记环：远处一眼分清"那一排是靶子不是人"
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.54, 26), M.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    var hb = createHealthBar();
    hb.group.position.y = 2.15;      // 和玩家同高，一排看过去不会高低错落
    group.add(hb.group);

    scene.add(group);
    var rec = {
      group: group, bodyGroup: bodyGroup, chest: chest, legs: [leftLeg, rightLeg],
      healthFill: hb.fill, healthGroup: hb.group, nameSprite: null,
      hp: 150, maxHp: 150, alive: true,
      fall: 0, hitAnim: 0, deadAt: 0, resetAt: 0
    };
    if (!dummyFallLift) measureDummyFall(rec);
    applyDummyFall(rec, 0);
    return rec;
  }

  // 倒地姿态：整个人绕两脚之间的地面点后翻，同时把腿插值成平躺，
  // 再整体抬 lift 让最低点正好贴地。三件事必须一起做，少一件就是悬空或陷地。
  function applyDummyFall(d, th) {
    var k = clamp(th / DUMMY_FALL_MAX, 0, 1);
    for (var i = 0; i < d.legs.length; i++) {
      var lg = d.legs[i], st = lg.stand;
      lg.rotation.x = st.hip + (DUMMY_DOWN_HIP - st.hip) * k;
      lg.kneeJoint.rotation.x = st.knee + (DUMMY_DOWN_KNEE - st.knee) * k;
      lg.footJoint.rotation.x = st.foot + (DUMMY_DOWN_FOOT - st.foot) * k;
    }
    d.bodyGroup.rotation.x = th;                 // 正角＝往 +z 倒＝朝后倒（正面朝 -z）
    d.bodyGroup.position.y = dummyLift(k);
  }

  // 抬升量的线性插值。表是按 k=fall/FALL_MAX 均匀采样的。
  function dummyLift(k) {
    if (!dummyFallLift) return 0;
    var n = dummyFallLift.length - 1;
    var u = clamp(k, 0, 1) * n, i0 = Math.floor(u), i1 = Math.min(n, i0 + 1);
    return dummyFallLift[i0] + (dummyFallLift[i1] - dummyFallLift[i0]) * (u - i0);
  }

  // 量出每个倒地角度下"整具身体的最低点在哪"，差值就是要抬（或压）多少。
  // 姿态是三个关节插值出来的，最低点在倒地过程中会从后脚跟换到裤腿、再换到后背，
  // 写不出封闭解，量一遍最省事也最不会错。
  //
  // 必须遍历**顶点**：Box3.setFromObject 是把每个 mesh 的局部包围盒按世界矩阵
  // 摊开再取 AABB，斜着的鞋盒/裤筒，盒角会伸到实体下方一大截——照它抬人，
  // 站姿抬 1cm、倒地抬 5cm，实测最低点反而浮在地面上方 2cm。
  // 基准取站姿的最低点（脚底按设计本来就陷进地面约 9mm，见 makeLeg 的外撇），
  // 于是整个倒地过程里陷入量始终和站着一样：既不露缝，也不浮空，站姿一动不动。
  function measureDummyFall(rec) {
    var steps = 11, raw = [], v = new THREE.Vector3(), lo = 0;
    var y0 = rec.group.position.y;
    function scan(o) {
      if (!o.isMesh || !o.geometry) return;
      var p = o.geometry.attributes && o.geometry.attributes.position;
      if (!p) return;
      for (var j = 0; j < p.count; j++) {
        v.fromBufferAttribute(p, j).applyMatrix4(o.matrixWorld);
        if (v.y < lo) lo = v.y;
      }
    }
    for (var i = 0; i < steps; i++) {
      var k = i / (steps - 1);
      applyDummyFallRaw(rec, k * DUMMY_FALL_MAX, k);
      rec.group.updateMatrixWorld(true);
      lo = 1e9;
      rec.bodyGroup.traverse(scan);
      raw.push(lo - y0);
    }
    var tab = [];
    for (var t = 0; t < raw.length; t++) tab.push(raw[0] - raw[t]);
    dummyFallLift = tab;
  }
  // measureDummyFall 专用：摆姿势但不加抬升（抬升正是要量的东西）
  function applyDummyFallRaw(d, th, k) {
    for (var i = 0; i < d.legs.length; i++) {
      var lg = d.legs[i], st = lg.stand;
      lg.rotation.x = st.hip + (DUMMY_DOWN_HIP - st.hip) * k;
      lg.kneeJoint.rotation.x = st.knee + (DUMMY_DOWN_KNEE - st.knee) * k;
      lg.footJoint.rotation.x = st.foot + (DUMMY_DOWN_FOOT - st.foot) * k;
    }
    d.bodyGroup.rotation.x = th;
    d.bodyGroup.position.y = 0;
  }

  // 倒地→复位的计时。服务端在 dummyHit 里给的是**剩余**时长
  // （中途进来的人拿到的也是剩余量），所以这里就以"收到的这一刻"当起点：
  // 进度条不一定从真正被打倒的时刻算起，但走满的那一刻一定是站起来的那一刻。
  function startDummyReset(d, ms) {
    d.deadAt = Date.now();
    d.resetAt = d.deadAt + Math.max(1, ms || 1);
  }

  function clearDummies() {
    dummies.forEach(function (d) { scene.remove(d.group); });
    dummies.clear();
  }

  // 服务端在 joined 里一次性给出全部靶子（位置和朝向是常量，血量/是否躺着不是）。
  // 先清一遍：断线重进会再来一份，不清就会在同一个地方叠两层靶子。
  function spawnDummies(list) {
    clearDummies();
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      var d = buildDummyModel();
      d.id = w.id;
      d.group.position.set(w.pos.x, w.pos.y || 0, w.pos.z);
      d.group.rotation.y = w.yaw || 0;
      d.hp = (typeof w.hp === 'number') ? w.hp : 150;
      d.maxHp = w.maxHp || 150;
      d.alive = w.alive !== false;
      d.fall = d.alive ? 0 : DUMMY_FALL_MAX;
      applyDummyFall(d, d.fall);        // 半路进来时已经躺着的那几个，第一帧就得是躺姿
      if (!d.alive) startDummyReset(d, w.resetIn);
      // 编号朝人看：练枪时说"三号靶"比说坐标快得多。橙色和玩家的白名字区分开。
      d.nameSprite = makeNameSprite('靶 ' + (w.id < 10 ? '0' + w.id : w.id), '#ffb454');
      d.nameSprite.position.y = 2.42;
      d.nameSprite.scale.set(1.7, 0.42, 1);
      d.group.add(d.nameSprite);
      dummies.set(w.id, d);
    }
  }

  function handleDummyHit(msg) {
    var d = dummies.get(msg.id);
    if (!d) return;
    d.hp = msg.hp;
    d.hitAnim = DUMMY_HIT_ANIM;
    if (msg.dead && d.alive) {
      d.alive = false;
      startDummyReset(d, msg.resetIn);
    }
  }

  function handleDummyReset(msg) {
    var d = dummies.get(msg.id);
    if (!d) return;
    d.hp = (typeof msg.hp === 'number') ? msg.hp : d.maxHp;
    d.alive = true;
    d.hitAnim = 0;
    d.deadAt = 0; d.resetAt = 0;
  }

  // 靶子每帧只有四件事：倒地/起身、挨枪后仰、血条（倒地后当复位进度条）、标签朝向。
  // **刻意没有待机晃动**：练枪要的是一个不动的参照物，靶子自己在那儿摇，
  // 打偏了都分不清是自己抖还是它动。
  function updateDummies(dt) {
    if (!dummies.size) return;
    var now = Date.now();
    dummies.forEach(function (d) {
      var tgt = d.alive ? 0 : DUMMY_FALL_MAX;
      d.fall += (tgt - d.fall) * (1 - Math.exp(-dt * (d.alive ? 7 : 10)));
      applyDummyFall(d, d.fall);

      if (d.hitAnim > 0) {
        d.hitAnim = Math.max(0, d.hitAnim - dt);
        // 上身整体后仰。手臂长在 chest 上，所以整条护架跟着一起后挫，
        // 这正是"被打了一下"该有的样子。
        d.chest.rotation.x = Math.sin((d.hitAnim / DUMMY_HIT_ANIM) * Math.PI) * 0.16;
      } else if (d.chest.rotation.x !== 0) {
        d.chest.rotation.x = 0;
      }

      if (d.alive) {
        var frac = clamp(d.hp / d.maxHp, 0, 1);
        d.healthFill.scale.x = Math.max(0.001, frac);
        d.healthFill.position.x = -0.42 * (1 - frac);
        d.healthFill.material.color.setHex(frac > 0.6 ? 0x3fb950 : (frac > 0.3 ? 0xd29922 : 0xf85149));
      } else {
        // 倒地后血条改画复位进度：一条空血条什么也没告诉你，而练枪时
        // 真正想知道的是"还有多久能再打这个"。
        var p = d.resetAt > d.deadAt ? clamp((now - d.deadAt) / (d.resetAt - d.deadAt), 0, 1) : 1;
        d.healthFill.scale.x = Math.max(0.001, p);
        d.healthFill.position.x = -0.42 * (1 - p);
        d.healthFill.material.color.setHex(0x58a6ff);
      }

      var far = d.group.position.distanceToSquared(camera.position) > DUMMY_TAG_DIST * DUMMY_TAG_DIST;
      d.healthGroup.visible = !far;
      if (d.nameSprite) d.nameSprite.visible = !far;
      if (far) return;
      // 血条朝相机（父节点转过 yaw，所以要先把父节点的旋转除掉）
      _dq.copy(d.group.quaternion).invert();
      d.healthGroup.quaternion.copy(camera.quaternion).premultiply(_dq);
    });
  }

  // ----------------------------------------------------------
  // 输入
  // ----------------------------------------------------------
  function bindInput() {
    window.addEventListener('keydown', function (e) {
      switch (e.code) {
        case 'KeyW': keys.f = true; e.preventDefault(); break;
        case 'KeyA': keys.l = true; e.preventDefault(); break;
        case 'KeyS': keys.b = true; e.preventDefault(); break;
        case 'KeyD': keys.r = true; e.preventDefault(); break;
        case 'Space':
          keys.jump = true;
          e.preventDefault();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.run = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          keys.crouch = true;
          break;
        case 'Tab':
          e.preventDefault();
          showScore = true;
          scoreboard.style.display = 'block';
          updateScoreboard();
          break;
        case 'KeyR':
          startReload();
          break;
        case 'Digit1':
          switchWeapon('primary');
          break;
        case 'Digit2':
          switchWeapon('secondary');
          break;
          case 'Digit3':
            switchWeapon('melee');
            break;
          case 'Digit4':
            throwGrenade();
            break;
          case 'KeyG':
            throwSmoke();
            break;
          break;
      }
    });

    window.addEventListener('keyup', function (e) {
      switch (e.code) {
        case 'KeyW': keys.f = false; break;
        case 'KeyA': keys.l = false; break;
        case 'KeyS': keys.b = false; break;
        case 'KeyD': keys.r = false; break;
        case 'Space': keys.jump = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.run = false; break;
        case 'ControlLeft':
        case 'ControlRight': keys.crouch = false; break;
        case 'Tab':
          showScore = false;
          scoreboard.style.display = 'none';
          break;
      }
    });

    document.addEventListener('mousemove', function (e) {
      if (!pointerLocked) return;
      var sens = (ads && local.current !== 'melee') ? 0.0012 : 0.0022;
      local.yaw -= e.movementX * sens;
      local.pitch = clamp(local.pitch - e.movementY * sens, -1.55, 1.55);
    });

    canvas.addEventListener('mousedown', function (e) {
      if (!gameStarted || !pointerLocked) return;
      if (e.button === 0) {
        if (!local.alive) return;
        e.preventDefault();
        triggerDown = true;
        send({ t: 'attack', down: true, yaw: aimYaw(), pitch: aimPitch(), ads: !!(ads && local.current !== 'melee') });
        if (local.current === 'melee') {
          localMelee();
        } else {
          var wpn = WEAPONS[local.ranged];
          if (!wpn.auto) localFire();
        }
      } else if (e.button === 2) {
        e.preventDefault();
        if (local.current === 'melee') {
          // 近战：右键一下 = 重击。前摇由 updateLocal 推进，走完自动挥出，
          // 没有「松手取消」——重击是承诺出去的一刀，点了就要落地。
          if (!local.alive) return;
          startHeavyWindup();
        } else {
          ads = true;
        }
      }
    });

    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) {
        if (triggerDown) {
          triggerDown = false;
          send({ t: 'attack', down: false });
        }
      } else if (e.button === 2) {
        // 近战重击没有「松手」语义，前摇照走；这里只处理枪械开镜松开
        ads = false;
      }
    });

    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    // 鼠标滚轮切换武器：顺序 近战(3) → 主武器(1) → 副武器(2) → 近战...
    // 向上滚（deltaY < 0）往前走，向下滚往后走。
    // 滚轮切换要走完整的 switchWeapon 流程（清 trigger / 清 ads / 清 bloom / 同步服务端），
    // 不能只改 local.current，否则切过去的瞬间还按着左键会直接开火。
    canvas.addEventListener('wheel', function (e) {
      if (!gameStarted || !pointerLocked || !local.alive) return;
      e.preventDefault();
      var order = ['melee', 'primary', 'secondary'];
      var idx = order.indexOf(local.current);
      if (idx < 0) idx = 1;
      // deltaY > 0 向下滚 → 下一把（index+1）；向上滚 → 上一把（index-1）
      var next = e.deltaY > 0
        ? order[(idx + 1) % order.length]
        : order[(idx - 1 + order.length) % order.length];
      switchWeapon(next);
    }, { passive: false });

    document.addEventListener('pointerlockchange', function () {
      pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked && gameStarted) {
        keys.f = keys.b = keys.l = keys.r = keys.jump = keys.run = keys.crouch = false;
        triggerDown = false;
        ads = false;
        send({ t: 'attack', down: false });
      }
    });

    canvas.addEventListener('click', function () {
      if (gameStarted && local.alive && !pointerLocked) {
        canvas.requestPointerLock();
      }
    });
  }

  // ----------------------------------------------------------
  // 本地武器动作
  // ----------------------------------------------------------

    function throwSmoke() {
      if (!gameStarted || !local.alive) return;
      if (local.smokeCount <= 0) { playDryFireSound(); return; }
      var now = performance.now();
      if (now - lastSmokeTime < 3000) return;
      lastSmokeTime = now;
      local.smokeCount--;          // 本地先扣，快照会用服务端的值覆盖
      // 只报朝向，弹道由两端各自积分（见 stepThrown）
      send({ t: 'smoke', yaw: aimYaw(), pitch: aimPitch() });
      throwAnim = 0.32;
      updateHUD();
    }

    function throwGrenade() {
      if (!gameStarted || !local.alive) return;
      if (local.grenadeCount <= 0) { playDryFireSound(); return; }
      var now = performance.now();
      if (now - lastGrenadeTime < 3000) return;
      lastGrenadeTime = now;
      local.grenadeCount--;
      send({ t: 'grenade', yaw: aimYaw(), pitch: aimPitch() });
      throwAnim = 0.32;
      updateHUD();
    }
  function switchWeapon(slot) {
    if (!gameStarted) return;
    if (slot === 'melee') { local.current = 'melee'; }
    else if (slot === 'secondary') { local.current = 'secondary'; local.ranged = local.secondary; local.ammo = local.ammoSecondary; local.reserve = local.reserveSecondary; }
      else if (slot === 'primary') { local.current = 'primary'; local.ranged = local.primary; local.ammo = local.ammoPrimary; local.reserve = local.reservePrimary; }
    else return;
    if (triggerDown) { triggerDown = false; send({ t: 'attack', down: false }); }
    cancelReload();            // 换弹中切枪：这次换弹作废，新枪立刻可用
    ads = false;
    // 切枪打断重击前摇：换成别的武器，前摇状态没有任何意义
    cancelHeavyWindup();
    bloom = 0;                 // 换枪清零累积散射（每把枪的 bloomMax 不同，不能沿用）
    // 连段归零：换手之后第一刀必须是第一段。不清的话拿起斧子的第一下
    // 可能直接播成第二段的横劈，而服务端那边算的是第一段。
    localComboStage = 0; lastLocalMelee = 0;
    swingTime = 0;
    vmMeleeGroup.rotation.set(0, 0, 0);
    vmMeleeGroup.position.set(0, 0, 0);
    applyWeaponVisibility();
    updateHUD();
    send({ t: 'switch', slot: local.current });
  }

  // 中断换弹动画并把零件归位。死亡、切枪、重生都要调，
  // 否则弹匣会停在半空，或者下一把枪拿出来时套筒是拉开的。
  function cancelReloadAnim() {
    if (reloadAnimDur > 0 && reloadAnimId && gunModels[reloadAnimId]) {
      resetReloadParts(gunModels[reloadAnimId]);
      var m = gunModels[reloadAnimId];
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
    }
    reloadAnimT = 0; reloadAnimDur = 0; reloadAnimId = ''; reloadSndStage = 0;
  }

  // 作废整次换弹（不只是动画）。切枪与重生都要调：服务端 handleSwitch / spawn
  // 会把 p.reloading 清成 false，客户端不跟着清的话，新掏出来的枪会被
  // localFire 的 `if (local.reloading) return` 挡住，一直挡到下一个快照到达——
  // 网络一抖就是明显的「换枪后打不出子弹」。
  function cancelReload() {
    if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = 0; }
    local.reloading = false;
    cancelReloadAnim();
  }

  // auto=true 表示这次换弹不是玩家按 R，而是打空后自动触发的。
  // 区别只在「备弹为 0 时要不要出声」：自动触发的场合枪声/干响已经响过了，
  // 再补一声干响会和枪声叠在一起，听着像卡带。
  function startReload(auto) {
    if (!gameStarted || !local.alive || local.current === 'melee') return;
    var wpn = WEAPONS[local.ranged];
    if (local.reloading || local.ammo >= wpn.mag) return;
    // 备弹见底：不能进换弹流程。这个判断必须和服务端 handleReload 一致，
    // 否则本地会播完一整套换弹动作、把 local.ammo 预测成满匣，
    // 然后被下一个快照打回 0 —— 弹药数会跳一下，看着像丢包。
    if (local.reserve <= 0) {
      if (!auto) {
        var nowDry = performance.now();
        if (nowDry - lastDrySound > 500) { lastDrySound = nowDry; playDryFireSound(); }
      }
      return;
    }
    local.reloading = true;
    bloom = 0;                 // 换弹期间枪口稳定下来，累积散射清零
    send({ t: 'reload' });
    playReloadSound();
    // 动画从头开始，长度就是这把枪的换弹时间：动作结束的那一刻正好上膛完成
    cancelReloadAnim();
    reloadAnimId = local.ranged;
    reloadAnimDur = wpn.reloadTime;
    reloadAnimT = 0;
    reloadSndStage = 1;        // 第 1 段（退匣）的声音已经由 playReloadSound 播了
    updateHUD();
    // 记下这次换弹是「哪个槽位的哪把枪」。定时器不能无条件把子弹算给
    // local.ranged —— 中途切了枪的话，那会拿步枪的弹匣容量去填手枪。
    var slotAtStart = local.current, gunAtStart = local.ranged;
    reloadTimer = setTimeout(function () {
      reloadTimer = 0;
      local.reloading = false;
      // 这次换弹已经作废（切枪 / 阵亡）。服务端 handleSwitch 同样会清掉 reloading，
      // 所以这里直接放弃，等下一个快照对齐，不要自己补弹。
      if (!local.alive || local.current !== slotAtStart || local.ranged !== gunAtStart) { updateHUD(); return; }
      // 从备弹里取，取不满就装半匣（服务端 tick 里的换弹完成逻辑同此）
      var take = Math.min(wpn.mag - local.ammo, local.reserve);
      local.ammo += take;
      local.reserve -= take;
        if (local.current === 'secondary') { local.ammoSecondary = local.ammo; local.reserveSecondary = local.reserve; }
        else { local.ammoPrimary = local.ammo; local.reservePrimary = local.reserve; }
      updateHUD();
    }, wpn.reloadTime * 1000);
  }

  function localFire() {
    var now = performance.now();
    var wpn = WEAPONS[local.ranged];
    if (local.reloading) return;
    if (now - lastLocalFire < wpn.cooldown) return;
    if (local.ammo <= 0) {
        if (!local.reloading) {
          if (now - lastDrySound > 500) { lastDrySound = now; playDryFireSound(); }
          startReload(true);     // 干响已经放过了，别让它再补一声
        }
        return;
    }
    lastLocalFire = now;
    local.ammo--;
      if (local.current === 'secondary') { local.ammoSecondary = local.ammo; } else { local.ammoPrimary = local.ammo; }
    updateHUD();

    // 这一发的散射要在累加本发 bloom **之前**算，否则第一发就自带累积量。
    // burstFrac 也必须在累加前取：它代表「这一发之前已经连打了多少」。
    var spread = currentSpread(wpn);
    var burstFrac = clamp(bloom / (wpn.bloomMax || 1), 0, 1);
    bloom = Math.min(bloom + (wpn.bloom || 0), wpn.bloomMax || 0);

    // 后坐力：抬枪 + 横向抖动。开镜时减轻 35%（贴腮更稳）。
    // recoilPitch/recoilYaw 同时进入画面和 aimDir()，所以它真的会打偏。
    //
    // 连发增长：抬枪量 = recoil × (1 + recoilRamp × burstFrac)。
    // 直接复用 bloom/bloomMax 当「连了多久」的度量，不再单开一个计数器——
    // 两者本来就是同一件事（连发累积），而且 bloom 已经有了正确的衰减、
    // 换枪清零、换弹清零逻辑，再开一个状态必然有一天忘了同步其中一处。
    // 效果：步枪 ramp 1.30，压满时抬枪是首发的 2.3 倍；机枪 1.70 → 2.7 倍。
    // 横向抖动额外再乘一次 (1 + 0.8×burstFrac)：真实全自动是先竖着爬、
    // 后半段开始左右画龙，只放大纵向的话弹道会是一条笔直的竖线，太好压了。
    var adsK = (ads && local.current !== 'melee') ? 0.65 : 1;
    var ramp = 1 + (wpn.recoilRamp || 0) * burstFrac;
    var kick = (wpn.recoil || 0.015) * adsK * ramp;
    recoilPitch += kick * (0.78 + Math.random() * 0.44);
    recoilYaw += (Math.random() - 0.5) * 2 * (wpn.recoilH || 0.004) * adsK * ramp * (1 + 0.8 * burstFrac);
    recoilZ += (wpn.id === 'awp' ? 0.16 : (wpn.id === 'shotgun' ? 0.1 : 0.05)) * (1 + 0.5 * burstFrac);

    // 枪口火焰
    var ray = castLocalRay(wpn.range);
    var muzzlePos = new THREE.Vector3();
    var anchor = muzzleAnchors[local.ranged];
    if (anchor) {
      camera.updateMatrixWorld(true);
      anchor.getWorldPosition(muzzlePos);
    } else {
      muzzlePos.copy(ray.origin).addScaledVector(ray.dir, 0.5);
    }
    var flashSize = wpn.id === 'awp' ? 0.5 : (wpn.id === 'shotgun' ? 0.4 : 0.25);
    addFlash(muzzlePos, 0xffcc66, flashSize, 0.06);
    muzzleLight.position.copy(muzzlePos);
    muzzleLight.intensity = 1.5;
    muzzleLightLife = 0.08;

    // 弹道：每颗弹丸都在锥内独立取向，并各自和掩体求交，
    // 这样打在箱子上的曳光弹会停在箱面上而不是穿过去。
    var tracerLife = wpn.pellets > 1 ? 0.16 : (wpn.id === 'awp' ? 0.28 : 0.12);
    for (var i = 0; i < wpn.pellets; i++) {
      var d = spreadDir(ray.dir, spread);
      var t = wpn.range;
      for (var b = 0; b < BOXES.length; b++) {
        var bx = BOXES[b];
        var hit = rayAABB(ray.origin, d,
          { x: bx.x - bx.w / 2, y: 0, z: bx.z - bx.d / 2 },
          { x: bx.x + bx.w / 2, y: bx.h, z: bx.z + bx.d / 2 });
        if (hit !== null && hit < t) t = hit;
      }
      var end = ray.origin.clone().addScaledVector(d, t);
      addTracer(ray.origin, end, tracerLife);
      if (i === 0 || wpn.pellets > 1) addImpact(end, 0xffe08a, wpn.pellets > 1 ? 2 : 4, false);
    }
    playShotSound(wpn.id, false);

    if (local.ammo <= 0) startReload(true);
  }

  function localMelee() {
    // 重击前摇期间不能塞轻击：重击是承诺出去的一刀，前摇中轻击会和
    // 服务端结算叠在同一段时间里。服务端 meleeAttack 有同一条检查。
    if (heavyWindup > 0) return;
    var now = performance.now();
    var wpn = WEAPONS[local.melee];
    var combo = MELEE_COMBO[local.melee] || MELEE_COMBO.knife;
    // 预测这一刀是第几段。规则必须和服务端 meleeAttack 逐字一致
    // （窗口 900ms、按上一段的 cd 倍率算冷却），否则本地播的动作
    // 和真正结算的段位会错开——看到的是收尾重砍，挨的是第一段的伤害。
    var stage = 0;
    if (lastLocalMelee && now - lastLocalMelee <= MELEE_COMBO_WINDOW) {
      stage = (localComboStage + 1) % combo.length;
    }
    var prev = combo[localComboStage] || combo[0];
    if (now - lastLocalMelee < wpn.cooldown * prev.cd) return;
    lastLocalMelee = now;
    localComboStage = stage;
    swingStyle = combo[stage].s;
    swingDur = meleeSwingDur(local.melee, stage);
    swingTime = swingDur;
    playMeleeSound(local.melee, false);
  }

  // 重击挥出（前摇走完后由 updateLocal 调用）。重击是独立节奏：
  // 打断轻击连段、走 MELEE_HEAVY 的弧线、收势时长按重击 cd 折算。
  function localHeavy() {
    var hv = MELEE_HEAVY[local.melee] || MELEE_HEAVY.knife;
    lastLocalMelee = 0;
    localComboStage = 0;               // 重击打断轻击连段
    swingStyle = hv.s;
    swingDur = clamp(hv.cd * 0.82, 0.18, 0.85);
    swingTime = swingDur;
    heavyCooldownUntil = performance.now() + hv.cd * 1000;
    playMeleeSound(local.melee, false);
    // 重击附加一声低频重音：前摇结束挥出的"闷响"，和轻击的短促"唰"区分开
    ensureAudio();
    playTone(120, 0.14, 0.5, 'sawtooth');
    playNoise(0.18, 300, 0.35, 'lowpass');
  }

  // 开始重击前摇：右键一下就进前摇，前摇走完由 updateLocal 自动挥出。
  // 不再有「按住蓄力/松手释放」——前摇期间这刀已经承诺出去了，只能等它落地。
  function startHeavyWindup() {
    if (heavyWindup > 0) return;                          // 前摇进行中，不接受二次起手
    if (performance.now() < heavyCooldownUntil) return;   // 上一刀收势没走完
    var hv = MELEE_HEAVY[local.melee] || MELEE_HEAVY.knife;
    heavyWindup = hv.windup;
    heavyWindupTotal = hv.windup;
    swingTime = 0;                    // 起手前先打断在播的轻击弧线
    send({ t: 'heavy', down: true });
    if (heavyChargeWrap) {
      heavyChargeWrap.style.display = 'block';
      heavyChargeWrap.classList.remove('full');
      if (heavyChargeFill) heavyChargeFill.style.width = '0%';
    }
  }

  // 取消前摇（切枪/死亡/复活时调）。服务端在 switch/spawn 里同样会清 heavyStrikeAt。
  function cancelHeavyWindup() {
    if (heavyWindup > 0) { heavyWindup = 0; heavyWindupTotal = 0; }
    if (heavyChargeWrap) {
      heavyChargeWrap.style.display = 'none';
      heavyChargeWrap.classList.remove('full');
    }
  }

  // ----------------------------------------------------------
  // 本地更新
  // ----------------------------------------------------------
  function updateLocal(dt) {
    if (!gameStarted || !local.alive || !local.initialized) return;

    var adsActive = ads && local.current !== 'melee';
    // 速度来自「手上这把武器」的 moveSpeed，不再是一个全局常数 + 机枪特例。
    // 原来是 (run ? 13 : 8) * (lmg ? 0.6 : 1)，除机枪外所有武器同速。
    var heldWpn = WEAPONS[local.current === 'melee' ? local.melee : currentRangedId()];
    var wpnMove = (heldWpn && heldWpn.moveSpeed) || 1;
    // 重击前摇时移动大幅减速：前摇是「站定出手」的承诺，边跑边挥还能全速绕圈
    // 就没法被反打了。前摇期间移速压到 40%。
    var chargeSlow = (heavyWindup > 0 && local.current === 'melee') ? 0.40 : 1;
    // 蹲下：移速压到 55%，且不能疾跑（跑速和蹲是互斥的两个状态）
    var crouchSlow = keys.crouch ? 0.55 : 1;
    var speed = (keys.crouch ? WALK_SPEED : (keys.run ? SPRINT_SPEED : WALK_SPEED))
      * wpnMove * (adsActive ? 0.55 : 1) * chargeSlow * crouchSlow;
    var forward = new THREE.Vector3(-Math.sin(local.yaw), 0, -Math.cos(local.yaw));
    var right = new THREE.Vector3(Math.cos(local.yaw), 0, -Math.sin(local.yaw));
    var wish = new THREE.Vector3();
    if (keys.f) wish.add(forward);
    if (keys.b) wish.sub(forward);
    if (keys.r) wish.add(right);
    if (keys.l) wish.sub(right);
    if (wish.lengthSq() > 0) {
      wish.normalize().multiplyScalar(speed);
      local.vel.x = wish.x;
      local.vel.z = wish.z;
    } else {
      local.vel.x = 0;
      local.vel.z = 0;
    }

    if (keys.jump && local.onGround && !keys.crouch) {
      local.vel.y = 8.5;
      local.onGround = false;
    }

    local.vel.y -= 20 * dt;
      var prevY = local.pos.y;
    local.pos.x += local.vel.x * dt;
    local.pos.y += local.vel.y * dt;
    local.pos.z += local.vel.z * dt;

    var groundY = getGroundY(local.pos);
      if (local.pos.y <= groundY && local.vel.y <= 0 && prevY >= groundY - 0.05) {
      local.pos.y = groundY;
      local.vel.y = 0;
      local.onGround = true;
    }

    collideBoxes(local.pos);
    local.pos.x = clamp(local.pos.x, -ARENA_HALF, ARENA_HALF);
    local.pos.z = clamp(local.pos.z, -ARENA_HALF, ARENA_HALF);

    // 自动武器连发
    if (triggerDown && local.current !== 'melee') {
      var wpn = WEAPONS[local.ranged];
      if (wpn.auto) localFire();
    }

    // 开镜 FOV
    var targetFov = adsActive ? (local.ranged === 'awp' ? 20 : (local.ranged === 'dmr' ? 35 : 50)) : 75;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * 16));
      camera.updateProjectionMatrix();
    }

    // 相机与武器
    var moving = (Math.abs(local.vel.x) > 0.5 || Math.abs(local.vel.z) > 0.5) && local.onGround;
    if (moving) bobPhase += dt * (keys.run ? 12 : 9);
    var bobX = moving ? Math.sin(bobPhase) * 0.014 : 0;
    var bobY = moving ? Math.abs(Math.sin(bobPhase)) * 0.012 : 0;

    // 伤害镜头震动
    var shakeX = 0, shakeY = 0;
    if (damageShake > 0) {
      damageShake -= dt;
      shakeX = Math.sin(performance.now() * 0.05) * damageShake * 0.04;
      shakeY = Math.cos(performance.now() * 0.043) * damageShake * 0.04;
    }

    // 蹲下：视线压到 0.8（站姿 1.55）。同时压低的还有服务端按 pos.y 算的部位判定——
    // 见 sendState 里同步的 crouch 与服务端 raycastPlayerZones 的整体下移。
    var eyeY = keys.crouch ? 0.80 : EYE;
    camera.position.set(local.pos.x + shakeX, local.pos.y + eyeY + bobY * 0.4 + shakeY, local.pos.z);
    camera.rotation.y = local.yaw + recoilYaw;
    camera.rotation.x = local.pitch + recoilPitch;
    camera.rotation.z = 0;

    vmGroup.position.set(0.32 + bobX, -0.3 + bobY, -0.55 + recoilZ);

    // 投掷动作：武器往右下沉一下（腾出扔手雷的手），比原来"什么都不动"有交代
    if (throwAnim > 0) {
      throwAnim -= dt;
      var tk = Math.sin(Math.max(throwAnim, 0) / 0.32 * Math.PI);
      vmGroup.position.x += tk * 0.10;
      vmGroup.position.y -= tk * 0.14;
      vmGroup.rotation.z = -tk * 0.35;
      if (throwAnim <= 0) vmGroup.rotation.z = 0;
    }

    // 第一人称换弹动画。零件（弹匣/拉机柄/泵）在模型本地空间动，
    // 枪身整体的下沉+侧倾加在 model 自己的 position/rotation 上——
    // 不能加在 vmGroup 上，那是行走摆动和后坐力在用的，两边会互相抹掉。
    if (reloadAnimDur > 0) {
      var rm = gunModels[reloadAnimId];
      if (!rm || local.current === 'melee' || !local.alive || reloadAnimId !== local.ranged) {
        cancelReloadAnim();
      } else {
        reloadAnimT += dt;
        var ru = clamp(reloadAnimT / reloadAnimDur, 0, 1);
        var rb = poseReloadParts(rm, reloadAnimId, ru, true);
        rm.position.set(rb.px, rb.py, rb.pz);
        rm.rotation.set(rb.rx, rb.ry, rb.rz);
        // 分段音效：插匣、上膛各补一声，光开头响一下听起来像动作没做完
        var stage = RELOAD_STYLE[reloadAnimId] === 'pump'
          ? (ru > 0.76 ? 3 : (ru > 0.20 ? 2 : 1))
          : (ru > 0.76 ? 3 : (ru > 0.62 ? 2 : 1));
        if (stage > reloadSndStage) { reloadSndStage = stage; playReloadClick(stage); }
        if (ru >= 1) cancelReloadAnim();
      }
    }

    // 开镜时隐藏/移动武器
    if (adsActive && local.ranged === 'awp') {
      vmGroup.visible = false;
    } else {
      vmGroup.visible = true;
    }

    // 后坐力恢复。
    //
    // 原来这里是固定 11/s（开镜 15/s），而恢复是**每帧**做的，于是恢复速度
    // 相对射速快得离谱：步枪两发间隔 105ms，1-exp(-0.105×11)=0.685，也就是
    // 每发之间要抹掉 68.5% 的已抬枪量。稳态抬枪 = kick/0.685 ≈ 1.46 发的量，
    // 模拟一梭子 30 发，画面只往上爬 0.75° 然后就停在那了 —— 全自动压枪
    // 这件事根本不存在，连打和点射的弹道一模一样。
    //
    // 改成分两档：扣着扳机（距上次开火 < 1.75 个射击间隔）时恢复只有 2.5/s，
    // 松开后恢复回 11/s。这才是真枪的行为——连发时枪口持续上爬，
    // 靠停火（或者手动下压）才回正。
    // 稳态抬枪 = kick_max / (1-exp(-dt×2.5))：
    //   步枪 0.009×2.3 / 0.230 = 0.090rad ≈ 5.2°，约 15 发爬到位；
    //   机枪 0.0062×2.7 / 0.211 = 0.079rad ≈ 4.5°。
    // 是「爬到一个平台」而不是无上限地飞出画面：平台高度可学、可预判、可压，
    // 完全抑制恢复的话一梭子能爬 30° 以上，那不是难度是失控。
    var curWpn = (local.current !== 'melee') ? WEAPONS[local.ranged] : null;
    var stillFiring = !!curWpn && (performance.now() - lastLocalFire) < curWpn.cooldown * 1.75;
    var recRate = stillFiring ? (adsActive ? 3.5 : 2.5) : (adsActive ? 15 : 11);
    var rec = 1 - Math.exp(-dt * recRate);
    recoilPitch -= recoilPitch * rec;
    recoilYaw -= recoilYaw * rec;
    recoilZ -= recoilZ * (1 - Math.exp(-dt * 12));

    // 累积散射回落（与服务端 decayBloom 用同一组 bloomDecay）
    if (bloom > 0 && curWpn) {
      bloom = Math.max(0, bloom - dt * (curWpn.bloomDecay || 0.05));
    }

    // 近战挥砍动画。和第三人称共用一张弧线表（MELEE_ARC），只是第一人称
    // 位移不打折——手是长在模型上的固定件，没有臂展约束。
    if (swingTime > 0) {
      swingTime -= dt;
      var su = clamp(1 - Math.max(swingTime, 0) / swingDur, 0, 1);
      var ap = meleeArcPose(swingStyle, su, ARC_TMP);
      vmMeleeGroup.rotation.set(ap.rx, ap.ry, ap.rz);
      vmMeleeGroup.position.set(ap.px, ap.py, ap.pz);
      if (swingTime <= 0) {
        vmMeleeGroup.rotation.set(0, 0, 0);
        vmMeleeGroup.position.set(0, 0, 0);
      }
    } else if (heavyWindup > 0 && local.current === 'melee') {
      // 重击前摇：武器随前摇进度从待机位扬到蓄势位，前摇走完自动挥出。
      // 复用 meleeArcPose 的「抬手段」（u∈[0,ARC_W]），进度 0 → 恰好举到蓄势位。
      // ARC_W=0.20，所以这 20% 的抬手被拉长到整个前摇里，
      // 观众能看到武器一点点抬起来、然后"锵"地劈出去的过程。
      var hv = MELEE_HEAVY[local.melee] || MELEE_HEAVY.knife;
      heavyWindup -= dt;
      var frac = heavyWindupTotal > 0 ? clamp(1 - heavyWindup / heavyWindupTotal, 0, 1) : 1;
      var cap = meleeArcPose(hv.s, ARC_W * frac, ARC_TMP);
      vmMeleeGroup.rotation.set(cap.rx, cap.ry, cap.rz);
      vmMeleeGroup.position.set(cap.px, cap.py, cap.pz);
      // HUD 前摇条：走到头（frac≈1）变亮，下一秒就挥出去
      if (heavyChargeWrap && heavyChargeFill) {
        heavyChargeFill.style.width = Math.round(frac * 100) + '%';
        if (frac >= 0.85) heavyChargeWrap.classList.add('full');
        else heavyChargeWrap.classList.remove('full');
      }
      if (heavyWindup <= 0) {
        // 前摇走完 → 自动挥出。服务端在同一时刻（heavyStrikeAt）于 tick 里结算。
        heavyWindup = 0;
        if (heavyChargeWrap) heavyChargeWrap.style.display = 'none';
        localHeavy();
      }
    }

    updateCrosshair();
  }

  function updateRemotePlayers(dt) {
    var k = 1 - Math.exp(-dt * 18);
    remotePlayers.forEach(function (r) {
      r.renderPos.lerp(r.targetPos, k);
      r.renderYaw = lerpAngle(r.renderYaw, r.targetYaw, k);
      r.renderPitch = lerpAngle(r.renderPitch, r.targetPitch, k);
      // 蹲下：整个模型压低 CROUCH_DROP（与服务端判定下移一致），
      // 并小幅收窄身位，看着就是「蹲着躲子弹」的样子。
      var crouchDrop = r.crouch ? 0.75 : 0;
      r.group.position.copy(r.renderPos);
      r.group.position.y -= crouchDrop;
      r.group.rotation.y = r.renderYaw;

      var speed = Math.sqrt(r.vel.x * r.vel.x + r.vel.z * r.vel.z);
      // 远端玩家的行走动画幅度。分母是「最快的那种走法」——持刀疾跑，
      // 沿用旧的 8 会让所有人的迈步幅度在半速就饱和，看着都在狂奔。
      var speedFrac = clamp(speed / (SPRINT_SPEED * 1.15), 0, 1);

      if (r.alive) {
        r.deadT = Math.max(0, r.deadT - dt * 3);
        r.walkPhase += dt * (4 + speedFrac * 10);
        var sw = Math.sin(r.walkPhase) * 0.6 * speedFrac;
        // 腿部行走摆动
        r.leftLeg.rotation.x = -sw;
        r.rightLeg.rotation.x = sw;
        // 双臂保持持枪姿势，仅轻微晃动（基线是 solveArm 反解出来的那套角度）
        r.rightArm.rotation.x = r.rightArm.baseX - sw * 0.10;
        r.leftArm.rotation.x = r.leftArm.baseX + sw * 0.10;
        // 上身/头部随俯仰角瞄准。行走时枪口跟着步频轻微上下——
        // 摆动加在**枪**上而不是加在手臂上：手臂是照枪反解的，
        // 在 IK 之后再去转肩膀等于把手从握把上拧下来（实测偏 2.8cm）。
        // 近战只跟 MELEE_PITCH_K 倍（见该常量处的实测数据），头照旧跟满。
        var aimP = r.current === 'melee'
          ? clamp(r.renderPitch * MELEE_PITCH_K, -MELEE_PITCH_MAX, MELEE_PITCH_MAX)
          : r.renderPitch;
        r.aimGroup.rotation.x = aimP + sw * 0.055;
        if (r.headGroup) r.headGroup.rotation.x = r.renderPitch * 0.7;
        // 行走上下起伏
        r.bodyGroup.rotation.x = 0;
        r.bodyGroup.position.y = Math.abs(Math.sin(r.walkPhase)) * 0.05 * speedFrac;
        r.bodyMats.forEach(function (m) { m.opacity = 1; });
        r.nameSprite.material.opacity = 1;
      } else {
        r.deadT = Math.min(1.4, r.deadT + dt * 3);
        r.aimGroup.rotation.x = Math.max(0, r.aimGroup.rotation.x - dt * 4);
        r.bodyGroup.rotation.x = Math.min(1.4, r.deadT);
        r.bodyGroup.position.y = Math.min(0.28, r.deadT * 0.2);
        r.bodyMats.forEach(function (m) { m.opacity = 0.4; });
        r.nameSprite.material.opacity = 0.5;
      }

      // 血条始终朝向相机
      if (r.healthGroup) {
        r.healthGroup.quaternion.copy(camera.quaternion)
          .premultiply(r.group.quaternion.clone().invert());
      }

      // 开火后坐 / 挥砍动画
      if (r.fireAnim > 0) {
        r.fireAnim -= dt;
        var fp = 1 - Math.max(r.fireAnim, 0) / 0.15;
        // 后坐是把枪往后（+z）推，基准取当前挂点（近战挂点和枪不一样）
        var fmo = r.mount || WEAPON_MOUNT;
        r.weaponGroup.position.z = fmo[2] + Math.sin(fp * Math.PI) * 0.1;
        if (r.fireAnim <= 0) r.weaponGroup.position.z = fmo[2];
      }
      // 近战挥砍：分段弧线，三个轴一起转 + 位移。原来是 rotation.x 一条正弦，
      // 而且手臂完全不参与——刀在空中自己翻，两只手还端在预备位置上，
      // 等于刀脱手了。现在挥砍只改 weaponGroup，手由下面的持握 IK 跟着刀走。
      // 计时在这儿走，摆位交给 poseMeleeWeapon（每帧都要重写一遍，
      // 见那个函数上的注释：clampMeleeReach 是原地累加的）。
      if (r.swingAnim > 0) r.swingAnim -= dt;

      // 双手跟住武器。必须放在后坐/挥砍**之后**（武器已经挪好位置）、
      // 投掷/换弹**之前**（那两个动作要抢手）。
      if (r.alive) {
        var isM = r.current === 'melee';
        // 俯射时左臂会穿胸：枪口往下压，护木落到左肩下方约 0.81m 处，超出 0.61 的
        // 臂展，肘就被拉直、小臂横切过胸口（pitch -1.2 实测扎进 96mm）。
        // 解法是加大侧身角——右肩再往后带一点，左肩让开，护木自然靠近左肩。
        // 系数 0.32、上限 0.35rad(20°) 是搜出来的：这一组让 pitch 0 到 -1.0 全程
        // 保持 37mm 的静态基线（不加时 -1.0 已经 57mm），-1.2 也从 96 降到 62。
        // 上限不能去掉：不封顶时 -1.4 能压到 76mm，但需要额外 36° 扭转，
        // 加上本来的 BLADE 就是胸对髋 67°，人转不到那个角度。
        // 近战不需要这一项：两个握把点最远也只隔 156mm（斧），够不到的问题不存在。
        var negP = Math.max(0, -r.renderPitch);
        r.chest.rotation.y = isM ? BLADE
          : BLADE - Math.min(AIM_BLADE_MAX, AIM_BLADE_K * negP * negP);
        // 单手近战只解右臂（mask 1），左臂留给走路/待机摆动
        var bothHands = r.twoHand !== false;
        var holdMask = r.reloadDur > 0 ? 0
          : (r.throwAnim > 0 ? (bothHands ? 2 : 0) : (bothHands ? 3 : 1));
        // 反解之前先把武器摆好、再把甩出臂展的部分拉回来（只对近战：枪的挂点
        // 是固定的，平移它会让画出来的枪口和真正的弹道错开）。
        // 传的是同一个 holdMask：拉回只约束真的握着武器的那只手。
        if (isM && holdMask) {
          poseMeleeWeapon(r);
          clampMeleeReach(r, holdMask);
        }
        if (holdMask) updateRemoteHold(r, holdMask);
      }
      // 投掷动作：右臂**先向后上方引拍**再过顶甩出。要覆盖在上面的持枪姿势之后写，
      // 否则每帧都会被基准姿势抹掉。
      // 原来这段是 baseX + a*1.9 来回摆，等于把手臂往前抬起再放下——
      // 引拍方向是反的，看着像举手而不是投弹。前摆为正，所以引拍必须走到负角。
      if (r.throwAnim > 0) {
        r.throwAnim -= dt;
        var tp = 1 - Math.max(r.throwAnim, 0) / 0.34;
        var bx = r.rightArm.baseX, be = r.rightArm.baseE;
        var ax, ez;
        if (tp < 0.4) {
          // 引拍：肩往后上方（负角），同时屈肘把手收到耳侧
          var w = tp / 0.4; w = w * w * (3 - 2 * w);
          ax = bx + (-1.90 - bx) * w;
          ez = be + (1.95 - be) * w;
        } else {
          // 甩出：起手要快，用 pow(.55) 把速度压到前段；同时伸肘完成鞭打
          var s = Math.pow((tp - 0.4) / 0.6, 0.55);
          ax = -1.90 + (1.30 - (-1.90)) * s;
          ez = 1.95 + (0.20 - 1.95) * s;
        }
        r.rightArm.rotation.x = ax;
        r.rightArm.rotation.z = r.rightArm.baseZ + Math.sin(tp * Math.PI) * 0.22;
        r.rightArm.foreJoint.rotation.x = ez;
        if (r.throwAnim <= 0) {
          r.rightArm.rotation.z = r.rightArm.baseZ;
          r.rightArm.foreJoint.rotation.x = r.rightArm.baseE;
        }
      }

      // 换弹动画（第三人称）。放在最后：它要覆盖上面的持枪基线姿势，
      // 而且两只手都得重解 IK——枪一侧倾，握把和护木在身体坐标里就换位置了，
      // 沿用基线角度会立刻脱手。
      if (r.reloadDur > 0) updateRemoteReload(r, dt);
    });
  }

  // 第三人称换弹：一套两手 IK 跟着枪走的动作。
  //   左手：护木 → 胸挂弹匣包（掏匣）→ 弹匣井（顶匣）→ 拉机柄 → 回护木
  //   右手：始终在握把上，但因为枪在侧倾，每帧都要按新的握把位置重解
  var RL_V = new THREE.Vector3();
  function remoteChestPoint(r, obj, lx, ly, lz) {
    RL_V.set(lx, ly, lz);
    obj.localToWorld(RL_V);
    r.chest.worldToLocal(RL_V);
    return RL_V;
  }

  // ---- 持枪姿势：每帧跟着枪重解 ----
  // 建模时按 pitch=0 解过一次 IK 就再没管过，可枪挂在 aimGroup 上是**跟着俯仰角
  // 转**的，手臂却长在 chest 上不动。实测抬到 ±1.2 rad 时右手离握把 30cm、
  // 左手离护木 64cm——枪整个飘在两手外面。所以每帧都得按枪的当前位置重解。
  var HOLD_A = new THREE.Vector3(), HOLD_B = new THREE.Vector3(), HOLD_P = new THREE.Vector3();
  // 支撑手允许伸到臂展的多少：0.97 已经贴着极限，但降下来只会把左手往握把方向
  // 拖（实测 0.84 时静止 suppFrac 从 0.86 掉到 0.44，双手并在一起），
  // 而对「手臂穿胸」几乎没有帮助——那个靠侧身角解决（见 AIM_BLADE_K）。
  var HOLD_SLACK = 0.97;
  // 俯射时追加的侧身角（见 updateRemotePlayers 里的用法与实测数据）
  var AIM_BLADE_K = 0.32, AIM_BLADE_MAX = 0.35;
  // 近战不跟满俯仰角。服务端的近战判定是**水平扇区**（meleeAttack 里 dot 只取
  // dx/dz），pitch -1.2 时前向的水平分量只剩 cos(1.2)=0.36，比任何一把刀的
  // arcDot(0.45~0.6) 都小——低头本来就打不中人。所以让刀跟着视线一起压下去
  // 纯亏：压 1.2rad 正好把刀转进小腹，实测刀扎进躯干 159mm、左手离刀柄 150mm。
  // 枪不能这么干：枪口画的方向就是子弹飞的方向，压系数会让两者对不上。
  //
  // 封顶值扫出来的：残留穿模只在极端俯角出现，而且深度随封顶值单调涨——
  // 0.50 时太刀第二段 52.4mm，0.44→31.2，0.40→17.6，0.36→4.1，0.32 起归零
  // （五把刀 × 全部段数 × pitch 一路扫到 -1.4 全为 0）。取 0.32=18.3°。
  // K=0.45 意味着只有 |pitch| > 0.71rad(41°) 才会撞到封顶，正常交战角度不受影响。
  var MELEE_PITCH_K = 0.45, MELEE_PITCH_MAX = 0.32;
  function remoteSupportPoint(r) {
    // 握把、护木都换到 chest 坐标，再沿这条线二分找臂展够得到的最远点。
    // 和建模时同一套逻辑，只是这回每帧算：枪一转，可达范围就跟着变。
    HOLD_A.copy(remoteChestPoint(r, r.weaponGroup, r.gripWG.x, r.gripWG.y, r.gripWG.z));
    HOLD_B.copy(remoteChestPoint(r, r.weaponGroup, r.suppFullWG.x, r.suppFullWG.y, r.suppFullWG.z));
    var sh = r.leftArm.position, maxR = (ARM_L1 + ARM_L2) * HOLD_SLACK;
    function reach(t) {
      var dx = HOLD_A.x + (HOLD_B.x - HOLD_A.x) * t - sh.x;
      var dy = HOLD_A.y + (HOLD_B.y - HOLD_A.y) * t - sh.y;
      var dz = HOLD_A.z + (HOLD_B.z - HOLD_A.z) * t - sh.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    var lo = 0, hi = 1;
    if (reach(1) > maxR) {
      if (reach(0) > maxR) {
        // 两端都够不到。原来这里二分会收敛到 t=0，也就是"退回握把"——可对刀来说
        // 握把那端往往比护木端**更远**（katana 的左手点在刀柄更后面），退回去等于
        // 主动选了最差的点，实测左手离刀柄 15.5mm 起、最多 43.2mm。
        // reach(t) 是点到线段的距离，对 t 是凸的，最近点直接投影就有，不用搜。
        var ex = HOLD_B.x - HOLD_A.x, ey = HOLD_B.y - HOLD_A.y, ez = HOLD_B.z - HOLD_A.z;
        var ll = ex * ex + ey * ey + ez * ez;
        lo = ll > 1e-9
          ? clamp(((sh.x - HOLD_A.x) * ex + (sh.y - HOLD_A.y) * ey + (sh.z - HOLD_A.z) * ez) / ll, 0, 1)
          : 0;
      } else {
        for (var it = 0; it < 20; it++) {
          var mid = (lo + hi) * 0.5;
          if (reach(mid) > maxR) hi = mid; else lo = mid;
        }
      }
    } else lo = 1;
    // 换弹动画拿 suppWG 当"手在枪上的本位"，这里顺手刷新它，
    // 免得俯仰着开始换弹时第一帧从一个过时的落点跳过去。
    r.suppFrac = lo;
    r.suppWG.set(
      r.gripWG.x + (r.suppFullWG.x - r.gripWG.x) * lo,
      r.gripWG.y + (r.suppFullWG.y - r.gripWG.y) * lo,
      r.gripWG.z + (r.suppFullWG.z - r.gripWG.z) * lo
    );
    return HOLD_P.lerpVectors(HOLD_A, HOLD_B, lo);
  }
  // 近战武器每帧的摆位（预备姿势 + 挥砍弧线）。必须**每帧从挂点重算**，
  // 不能只在挥砍时写一次：clampMeleeReach 是就地 add 的单向拉回，
  // 挥砍结束后没人重置的话，它会一帧一帧把刀往肩膀上拽，再也不回来。
  function poseMeleeWeapon(r) {
    var mo = r.mount || WEAPON_MOUNT, rest = r.holdRest || ZERO3;
    if (r.swingAnim > 0) {
      var su = clamp(1 - r.swingAnim / (r.swingDur || 0.18), 0, 1);
      var ap = meleeArcPose(r.swingStyle || 'slashR', su, ARC_TMP);
      r.weaponGroup.rotation.set(rest[0] + ap.rx, rest[1] + ap.ry, rest[2] + ap.rz);
      r.weaponGroup.position.set(
        mo[0] + ap.px * MELEE_TP_ARC,
        mo[1] + ap.py * MELEE_TP_ARC,
        mo[2] + ap.pz * MELEE_TP_ARC
      );
    } else {
      r.weaponGroup.rotation.set(rest[0], rest[1], rest[2]);
      r.weaponGroup.position.set(mo[0], mo[1], mo[2]);
    }
  }
  // 近战挥砍会把握把甩到臂展之外（斧头过顶劈实测 0.661m，臂展只有 0.61）。
  // IK 一撞极限就把肘拉直、手停在半空：实测右手离斧柄 52.9mm，等于斧子脱手。
  // 这里**不改弧线形状**（转起来才好看），只把武器整体沿「肩→握把」方向拉回来：
  // 平移对握把是刚性的，一步就精确落在臂展边界上。
  //
  // 双手武器要**同时**满足两只手：只拉右手的话左手照样脱把（刀柄挂在 z=-0.40 时
  // 实测左手离刀柄 25.6mm、左肩到左手点 0.689m）。「握把在右肩球内」和「护木点在
  // 左肩球内」各自都是凸集（球），所以交替往两个球上投影就会收敛到交集里
  // （POCS）。实测最多 3 轮就不动了，两只手同时精确落在 0.5917 上、间距都回到
  // 12mm 静态基线；握把速度在 N=120/480 下都是 6.68 m/s（完全平，说明没在
  // 迭代里引入抖动——真断点的 m/s 会随 N 线性涨）。
  var RCH_A = new THREE.Vector3(), RCH_B = new THREE.Vector3(), RCH_Q = new THREE.Quaternion();
  function clampReachOne(r, lp, arm, maxR) {
    RCH_A.set(lp.x, lp.y, lp.z);
    r.weaponGroup.localToWorld(RCH_A);
    arm.getWorldPosition(RCH_B);
    RCH_A.sub(RCH_B);
    var d = RCH_A.length();
    if (!(d > maxR)) return false;
    RCH_A.multiplyScalar(maxR / d - 1);         // 该手需要的世界位移（指向肩）
    r.aimGroup.getWorldQuaternion(RCH_Q).invert();
    r.weaponGroup.position.add(RCH_A.applyQuaternion(RCH_Q));  // 换到 aimGroup 空间再加
    r.group.updateMatrixWorld(true);
    return true;
  }
  function clampMeleeReach(r, mask) {
    var maxR = (ARM_L1 + ARM_L2) * HOLD_SLACK;
    r.group.updateMatrixWorld(true);
    for (var it = 0; it < 8; it++) {
      var moved = false;
      // 只约束**真的握着武器的那只手**（mask 和 updateRemoteHold 同一套：1=右 2=左）。
      // 投掷时右手去掏手雷了，这时候还按右手拉回，就会为了一只没握把的手平移武器。
      if ((mask & 1) && clampReachOne(r, r.gripWG, r.rightArm, maxR)) moved = true;
      // 左手用 suppFullWG（护木/刀柄后段的固定锚点），不用 suppWG——后者是
      // remoteSupportPoint 每帧在线段上滑出来的，会跟着这次平移变，不是刚性点。
      if ((mask & 2) && clampReachOne(r, r.suppFullWG, r.leftArm, maxR)) moved = true;
      if (!moved) return;
    }
  }
  // mask: 1=右手 2=左手（投掷时右手另有任务，换弹时两只手都被换弹接管）
  function updateRemoteHold(r, mask) {
    var model = r.weaponCache[r.shownWeapon];
    if (!r.alive || !model || !model.visible) return;
    r.group.updateMatrixWorld(true);
    if (mask & 2) {
      var sp = remoteSupportPoint(r);
      solveArm(r.leftArm, sp.x, sp.y, sp.z, -ARM_POLE[0], ARM_POLE[1], ARM_POLE[2], true);
    }
    if (mask & 1) {
      var gp = remoteChestPoint(r, r.weaponGroup, r.gripWG.x, r.gripWG.y, r.gripWG.z);
      solveArm(r.rightArm, gp.x, gp.y, gp.z, ARM_POLE[0], ARM_POLE[1], ARM_POLE[2], true);
    }
  }

  function stopRemoteReload(r) {
    if (r.reloadModel) resetReloadParts(r.reloadModel);
    r.reloadDur = 0; r.reloadAnim = 0; r.reloadModel = null; r.reloadId = '';
    // 回**当前武器**的挂点和预备姿势：换弹只发生在枪上，但这个函数也被
    // 「换成近战 → 掐掉换弹」那条路径调用，写死 WEAPON_MOUNT 会把刀摆回肩窝。
    var mo = r.mount || WEAPON_MOUNT, rest = r.holdRest || ZERO3;
    r.weaponGroup.position.set(mo[0], mo[1], mo[2]);
    r.weaponGroup.rotation.set(rest[0], rest[1], rest[2]);
    // 手臂回基线。必须连 y/z 一起写回：行走摆动每帧只改 rotation.x，
    // 动画期间 solveArm 塞进去的 y/z 没人清，不写回就会一直歪着。
    [r.rightArm, r.leftArm].forEach(function (arm) {
      if (arm.baseX === undefined) return;
      arm.rotation.set(arm.baseX, arm.baseY, arm.baseZ);
      arm.foreJoint.rotation.x = arm.baseE;
    });
  }
  function updateRemoteReload(r, dt) {
    var model = r.reloadModel;
    // 死了、换成近战、或者中途换了枪：立刻收工，零件归位
    if (!r.alive || !model || !model.visible || r.current === 'melee') { stopRemoteReload(r); return; }
    r.reloadAnim += dt;
    var u = clamp(r.reloadAnim / r.reloadDur, 0, 1);
    var pose = poseReloadParts(model, r.reloadId, u, false);
    var k = Math.sin(u * Math.PI);

    // 枪身侧倾。位移用 WEAPON_TP_SCALE 折算：pose 里的量是模型本地尺寸，
    // 而 weaponGroup 是身体尺度，直接用会大出 1/0.68 倍。
    // 幅度打七折——第三人称手臂受肩宽和臂长约束，第一人称那么夸张的翻转在这儿会脱手。
    var s = WEAPON_TP_SCALE, a = 0.7;
    r.weaponGroup.position.set(
      WEAPON_MOUNT[0] + pose.px * s * a,
      WEAPON_MOUNT[1] + pose.py * s * a,
      WEAPON_MOUNT[2] + pose.pz * s * a
    );
    r.weaponGroup.rotation.set(pose.rx * a, pose.ry * a, pose.rz * a);

    // 手的目标点要按**新的**枪姿反算，所以先把这一枝的世界矩阵刷新到本帧。
    // 只有正在换弹的玩家会走到这里，一年也刷不到几次，开销可以忽略。
    r.group.updateMatrixWorld(true);

    // 右手跟住握把（keepBase=true：不要把动画姿势写成基线，否则动完回不去）
    var gp = remoteChestPoint(r, r.weaponGroup, r.gripWG.x, r.gripWG.y, r.gripWG.z);
    solveArm(r.rightArm, gp.x, gp.y, gp.z, ARM_POLE[0], ARM_POLE[1], ARM_POLE[2], true);

    // 左手：分段找目标。护木点和弹匣井点都随枪走，掏匣点固定在胸挂上。
    var hp = remoteChestPoint(r, r.weaponGroup, r.suppWG.x, r.suppWG.y, r.suppWG.z);
    var hx = hp.x, hy = hp.y, hz = hp.z;                   // 护木（本位）
    var POUCH = [-0.0945, 1.235, -0.240];                  // 最左那个胸挂弹匣包的开口
    var d = model.userData || {};
    var wellV = d.magWell ? remoteChestPoint(r, model, d.magWell.position.x, d.magWell.position.y, d.magWell.position.z) : null;
    var wx = wellV ? wellV.x : hx, wy = wellV ? wellV.y - 0.10 : hy, wz = wellV ? wellV.z : hz;
    var tx, ty, tz;
    if (RELOAD_STYLE[r.reloadId] === 'pump') {
      // 泵动枪：手在胸挂和弹口之间往返压弹，最后回到泵上。
      // 每段的端点都共用同一个值（胸挂点），循环之间和进出循环时才不会瞬移。
      var INS_A = 0.12, INS_B = 0.62, PUMP_A = 0.78;
      if (u < INS_A) {
        var pin = rlEase(u / INS_A);
        tx = rlMix(hx, POUCH[0], pin); ty = rlMix(hy, POUCH[1], pin); tz = rlMix(hz, POUCH[2], pin);
      } else if (u < INS_B) {
        var span = (INS_B - INS_A) / 3;
        var ph = ((u - INS_A) % span) / span;
        var e2 = ph < 0.62 ? rlEase(ph / 0.62) : (1 - rlEase((ph - 0.62) / 0.38));
        tx = rlMix(POUCH[0], wx, e2); ty = rlMix(POUCH[1], wy, e2); tz = rlMix(POUCH[2], wz, e2);
      } else {
        var pout = rlEase(rlSeg(u, INS_B, PUMP_A));
        tx = rlMix(POUCH[0], hx, pout); ty = rlMix(POUCH[1], hy, pout); tz = rlMix(POUCH[2], hz, pout);
      }
    } else {
      var IN_A = 0.30, TAP = 0.70;
      if (u < IN_A) {                                       // 去胸挂掏匣
        var g1 = rlEase(rlSeg(u, 0, IN_A));
        tx = rlMix(hx, POUCH[0], g1); ty = rlMix(hy, POUCH[1], g1); tz = rlMix(hz, POUCH[2], g1);
      } else if (u < TAP) {                                 // 托着匣顶上去
        var g2 = rlEase(rlSeg(u, IN_A, TAP));
        tx = rlMix(POUCH[0], wx, g2); ty = rlMix(POUCH[1], wy, g2); tz = rlMix(POUCH[2], wz, g2);
      } else if (RELOAD_STYLE[r.reloadId] === 'bolt') {     // 栓动枪的枪机归右手，左手只管回护木
        var gb = rlEase(rlSeg(u, TAP, 1));
        tx = rlMix(wx, hx, gb); ty = rlMix(wy, hy, gb); tz = rlMix(wz, hz, gb);
      } else {                                              // 拉机柄 → 回护木
        var cc = reloadChargeCenter(model);
        var cz = d.charge ? d.charge.position.z : 0;
        var chp = remoteChestPoint(r, model, cc.x, cc.y + 0.02, cc.z + cz);
        var g3 = rlEase(rlSeg(u, TAP, 0.86)), g4 = rlEase(rlSeg(u, 0.86, 1));
        tx = rlMix(rlMix(wx, chp.x, g3), hx, g4);
        ty = rlMix(rlMix(wy, chp.y, g3), hy, g4);
        tz = rlMix(rlMix(wz, chp.z, g3), hz, g4);
      }
    }
    solveArm(r.leftArm, tx, ty, tz, -ARM_POLE[0], ARM_POLE[1], ARM_POLE[2], true);

    // 上半身跟着低一点头，动作才不像只有两条胳膊在忙
    if (r.headGroup) r.headGroup.rotation.x = r.renderPitch * 0.7 + 0.18 * k;

    if (u >= 1) stopRemoteReload(r);
  }

  function sendState() {
    if (!gameStarted || !local.initialized) return;
    // 发的是**含后坐力**的朝向：服务端全自动武器是在 tick 里用 p.yaw/p.pitch 开火的，
    // 这里发裸 local.yaw 的话连发时枪口在画面里往上跳、弹着点却纹丝不动。
    send({
      t: 'state',
      pos: { x: local.pos.x, y: local.pos.y, z: local.pos.z },
      vel: { x: local.vel.x, y: local.vel.y, z: local.vel.z },
      yaw: aimYaw(),
      pitch: aimPitch(),
      ads: !!(ads && local.current !== 'melee'),
      crouch: keys.crouch
    });
  }

  // ----------------------------------------------------------
  // 主循环
  // ----------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);

    updateLocal(dt);
    updateRemotePlayers(dt);
    updateDummies(dt);
    updateEffects(dt);
    updateThrowables(dt);
      updateRespawnCountdown();
      updateSky(dt);

    sendStateTimer += dt;
    if (sendStateTimer >= 1 / 30) {
      sendStateTimer -= 1 / 30;
      sendState();
    }

    renderer.render(scene, camera);
  }

  // ----------------------------------------------------------
  // 菜单
  // ----------------------------------------------------------
  // 昵称必须玩家自己填。以前 bindMenu 里塞了个「战士随机数」当默认值，等于所有人
  // 都叫「战士xxx」，头顶名字和战绩表根本分不清谁是谁。现在不给默认值：填了才能进。
  // 这三个函数放在 bindMenu 外面，是因为服务端打回 joinDenied 时也要用同一套提示。
  var NAME_HINT = '1–16 个字符，不能全是空格';
  function cleanName() {
    // 全角空格也算空白，光 trim() 半角空格拦不住「　　」这种名字
    return nameInput.value.replace(/[\s　]+/g, ' ').trim();
  }
  function refreshStart() {
    var ok = cleanName().length > 0;
    startBtn.disabled = !ok;
    if (ok) {
      nameInput.classList.remove('invalid');
      nameHint.classList.remove('err');
      nameHint.textContent = NAME_HINT;
    }
    return ok;
  }
  function warnName(text) {
    nameInput.classList.add('invalid');
    nameHint.classList.add('err');
    nameHint.textContent = text;
    nameInput.focus();
  }

  function bindMenu() {
    nameInput.value = '';
    nameInput.focus();
    nameInput.addEventListener('input', refreshStart);
    // 输入法上屏（中文）不触发 input 的旧浏览器，靠这个兜一下
    nameInput.addEventListener('change', refreshStart);
    nameInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (refreshStart()) startBtn.click();
      else warnName('请先输入昵称');
    });
    refreshStart();

    document.querySelectorAll('#meleeGrid .weapon-card').forEach(function (card) {
      card.addEventListener('click', function () {
        document.querySelectorAll('#meleeGrid .weapon-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedMelee = card.getAttribute('data-id');
      });
    });

    document.querySelectorAll('#rangedGrid .weapon-card').forEach(function (card) {
      card.addEventListener('click', function () {
        if (card.classList.contains('disabled')) return;
        document.querySelectorAll('#rangedGrid .weapon-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedPrimary = card.getAttribute('data-id');
      });
    });

    startBtn.addEventListener('click', function () {
      // 没昵称就不放进去，也不再偷偷编一个「玩家xxx」顶上
      var name = cleanName();
      if (!name) { warnName('请先输入昵称'); return; }
      local.name = name;
      local.melee = selectedMelee;
      local.primary = selectedPrimary;
      local.secondary = 'pistol';
      local.ranged = local.primary;
      local.current = 'primary';
      local.ammoPrimary = WEAPONS[selectedPrimary].mag;
      local.ammoSecondary = WEAPONS.pistol.mag;
      local.ammo = local.ammoPrimary;
      // 备弹也要按选的枪初始化。joined 一到就会被服务端的值覆盖，但在那之前
      // HUD 已经画了一帧，不设的话选狙击时会先闪一下步枪的 120 发。
      local.reservePrimary = WEAPONS[selectedPrimary].reserve;
      local.reserveSecondary = WEAPONS.pistol.reserve;
      local.reserve = local.reservePrimary;
      local.hp = local.maxHp;
      local.alive = true;
      lastHp = local.hp;
      gameStarted = true;
      ensureAudio();
      menu.style.display = 'none';
      hud.style.display = 'block';
      updateHUD();
      applyWeaponVisibility();
      connect();
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    });
  }

  // ----------------------------------------------------------
  // 启动
  // ----------------------------------------------------------
  initThree();
  buildArena();
  buildViewmodels();
  bindInput();
  bindMenu();
  updateHUD();
  animate();

})();
