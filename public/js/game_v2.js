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
  var WEAPONS = {
    knife: { id: 'knife', name: '战术匕首', type: 'melee', damage: 30, range: 2.4, cooldown: 380, arcDot: 0.45, color: 0xc0c0c0 },
    axe: { id: 'axe', name: '消防斧', type: 'melee', damage: 60, range: 3.0, cooldown: 950, arcDot: 0.55, color: 0xcc3333 },
    katana: { id: 'katana', name: '武士刀', type: 'melee', damage: 40, range: 3.2, cooldown: 560, arcDot: 0.5, color: 0x8a8a8a },
      kukri: { id: 'kukri', name: '尼泊尔军刀', type: 'melee', damage: 45, range: 2.6, cooldown: 450, arcDot: 0.5, color: 0x9aa0a0 },
      chainsaw: { id: 'chainsaw', name: '电锯', type: 'melee', damage: 30, range: 2.7, cooldown: 250, arcDot: 0.6, color: 0xff6600 },
    // 散射/后坐力字段（必须与 server.js 的 WEAPONS 表逐字一致，否则准星画的
    // 散射圈和服务端真正判定的散射不是一回事）：
    //   spread 首发锥形散射半角(rad) / bloom 每发累加 / bloomMax 上限 / bloomDecay 每秒回落
    //   moveSpread 跑动附加 / airSpread 离地附加 / adsSpread 开镜对「基础+累积」的缩放
    //   recoil 每发抬枪量(rad) / recoilH 横向抖动
    pistol: { id: 'pistol', name: '手枪', type: 'ranged', damage: 26, mag: 12, cooldown: 240, range: 90, pellets: 1, spread: 0.006, reloadTime: 1.3, auto: false, bloom: 0.0040, bloomMax: 0.030, bloomDecay: 0.050, moveSpread: 0.012, airSpread: 0.020, adsSpread: 0.55, recoil: 0.0130, recoilH: 0.0045, color: 0x444444 },
    shotgun: { id: 'shotgun', name: '霰弹枪', type: 'ranged', damage: 13, mag: 6, cooldown: 900, range: 45, pellets: 8, spread: 0.050, reloadTime: 2.3, auto: false, bloom: 0.0100, bloomMax: 0.075, bloomDecay: 0.060, moveSpread: 0.020, airSpread: 0.030, adsSpread: 0.80, recoil: 0.0330, recoilH: 0.0080, color: 0x553311 },
    rifle: { id: 'rifle', name: '突击步枪', type: 'ranged', damage: 19, mag: 30, cooldown: 105, range: 110, pellets: 1, spread: 0.005, reloadTime: 1.9, auto: true, bloom: 0.0035, bloomMax: 0.042, bloomDecay: 0.055, moveSpread: 0.016, airSpread: 0.028, adsSpread: 0.45, recoil: 0.0090, recoilH: 0.0038, color: 0x222222 },
    awp: { id: 'awp', name: '狙击步枪', type: 'ranged', damage: 150, mag: 5, cooldown: 1400, range: 160, pellets: 1, spread: 0.0004, reloadTime: 2.6, auto: false, bloom: 0.0020, bloomMax: 0.010, bloomDecay: 0.015, moveSpread: 0.030, airSpread: 0.045, adsSpread: 0.15, recoil: 0.0460, recoilH: 0.0060, color: 0x1a3a1a },
      dmr: { id: 'dmr', name: '连狙', type: 'ranged', damage: 55, mag: 10, cooldown: 300, range: 120, pellets: 1, spread: 0.002, reloadTime: 2.1, auto: false, bloom: 0.0030, bloomMax: 0.022, bloomDecay: 0.035, moveSpread: 0.020, airSpread: 0.032, adsSpread: 0.30, recoil: 0.0230, recoilH: 0.0050, color: 0x2a4a2a },
      lmg: { id: 'lmg', name: '重机枪', type: 'ranged', damage: 16, mag: 125, cooldown: 95, range: 100, pellets: 1, spread: 0.009, reloadTime: 3.8, auto: true, bloom: 0.0030, bloomMax: 0.055, bloomDecay: 0.050, moveSpread: 0.024, airSpread: 0.036, adsSpread: 0.60, recoil: 0.0062, recoilH: 0.0042, color: 0x3a3a3a }
  };

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
  // 枪托末端在 weaponGroup 里应该落到的深度。各枪长短差得很多——托底在自身局部
  // 从手枪的 0.068 一直到 AWP 的 0.447，而挂点只有一个，照一个数摆必然一头顾不上：
  // 实测 AWP 静止就把托扎进护肩 38.8mm，霰弹枪 26.4mm。所以按**托底**对齐，
  // 让每把枪的托都停在同一个肩窝深度上（见 ensureRemoteWeapon）。
  var TP_POCKET_Z = 0.300;
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
  var reloadTip = document.getElementById('reloadTip');
  var reloadFill = document.querySelector('#reloadBar > i');
  var reloadBar = document.getElementById('reloadBar');
  var crosshair = document.getElementById('crosshair');
  var scopeOverlay = document.getElementById('scopeOverlay');
  var hitmarker = document.getElementById('hitmarker');
  var damageOverlay = document.getElementById('damageOverlay');
  var deathOverlay = document.getElementById('deathOverlay');
  var killfeed = document.getElementById('killfeed');
  var scoreboard = document.getElementById('scoreboard');
  var scoreBody = document.getElementById('scoreBody');
var leaderboardList = document.getElementById('leaderboardList');

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
    ammo: WEAPONS.rifle.mag,
      ammoPrimary: WEAPONS.rifle.mag,
      ammoSecondary: WEAPONS.pistol.mag,
    reloading: false
  };

  var remotePlayers = new Map();
  var socket = null;
  var gameStarted = false;
  var pointerLocked = false;
  var triggerDown = false;
  var ads = false;            // 右键开镜
  var selectedMelee = 'knife';
  var selectedPrimary = 'rifle';
var selectedRanged = 'rifle'; // 兼容旧变量，始终与 selectedPrimary 同步
  var showScore = false;
  var lastHp = 100;

  var keys = { f: false, b: false, l: false, r: false, jump: false, run: false };

  var lastLocalFire = 0;
  var lastLocalMelee = 0;
var lastDrySound = 0;
  var recoilPitch = 0;
  var recoilYaw = 0;
  var recoilZ = 0;
  var bloom = 0;              // 连发累积散射（与服务端各自维护，参数相同所以结果一致）
  var swingTime = 0;
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
  var cloudLayer = null;
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
    var hemi = new THREE.HemisphereLight(0xcfe2ff, 0x55503f, 0.8);
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
  function buildSky() {
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2f6ba6) },
        midColor: { value: new THREE.Color(0x8fb8d8) },
        bottomColor: { value: new THREE.Color(0xd8e4ea) },
        sunColor: { value: new THREE.Color(0xfff4d8) },
        sunDir: { value: SUN_DIR.clone() }
      },
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
        'varying vec3 vWorldPosition;',
        'void main(){',
        '  vec3 dir = normalize(vWorldPosition - cameraPosition);',
        '  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(bottomColor, midColor, smoothstep(0.42, 0.53, h));',
        '  col = mix(col, topColor, smoothstep(0.55, 0.96, h));',
        '  float sd = max(dot(dir, normalize(sunDir)), 0.0);',
        '  col += sunColor * pow(sd, 320.0) * 1.8;',   // 日盘
        '  col += sunColor * pow(sd, 8.0) * 0.20;',    // 日晕
        '  col += sunColor * pow(sd, 2.0) * 0.05;',    // 大范围散射
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -2;
    scene.add(skyMesh);

    cloudLayer = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshBasicMaterial({
        map: getCloudTexture(),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      })
    );
    cloudLayer.rotation.x = Math.PI / 2;
    cloudLayer.position.y = 210;
    cloudLayer.frustumCulled = false;
    cloudLayer.renderOrder = -1;
    scene.add(cloudLayer);
  }

  function updateSky(dt) {
    if (skyMesh) skyMesh.position.copy(camera.position);
    if (cloudLayer) {
      cloudLayer.position.x = camera.position.x;
      cloudLayer.position.z = camera.position.z;
      cloudDrift += dt * 0.0035;
      if (cloudLayer.material.map) {
        cloudLayer.material.map.offset.set(cloudDrift, cloudDrift * 0.45);
      }
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
  function getAsphaltTexture() {
    return makeTex('asphalt', 512, function (ctx, w, h) {
      ctx.fillStyle = '#3b4149'; ctx.fillRect(0, 0, w, h);
      // 大块色差
      for (var i = 0; i < 26; i++) {
        var g = 40 + Math.floor(Math.random() * 34);
        ctx.fillStyle = 'rgba(' + g + ',' + (g + 6) + ',' + (g + 12) + ',0.5)';
        var bw = 40 + Math.random() * 120, bh = 40 + Math.random() * 120;
        ctx.fillRect(Math.random() * w, Math.random() * h, bw, bh);
      }
      // 骨料颗粒
      speckle(ctx, w, h, 2600, 0.04, 0.22, 1.6, function (a) { return 'rgba(210,215,225,' + a + ')'; });
      speckle(ctx, w, h, 1800, 0.05, 0.3, 1.4, function (a) { return 'rgba(12,14,18,' + a + ')'; });
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
    }, { repeat: [12, 12] });
  }

  // 地面标线覆盖层（透明底，1:1 铺在竞技场上）
  function getMarkingTexture() {
    return makeTex('markings', 1024, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var C = w / 2;
      // 中央直升机坪
      ctx.strokeStyle = 'rgba(240,244,250,0.55)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(C, C, 168, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(C, C, 150, 0, Math.PI * 2); ctx.stroke();
      // "H"
      ctx.strokeStyle = 'rgba(255,236,140,0.85)';
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
      zone(C, 120, 'rgba(90,170,255,0.7)');
      zone(C, h - 120, 'rgba(90,170,255,0.7)');
      zone(120, C, 'rgba(255,150,70,0.7)');
      zone(w - 120, C, 'rgba(255,150,70,0.7)');
      // 跑道虚线
      ctx.strokeStyle = 'rgba(240,220,120,0.4)';
      ctx.lineWidth = 5; ctx.setLineDash([40, 40]);
      ctx.beginPath(); ctx.moveTo(0, C); ctx.lineTo(w, C); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(C, 0); ctx.lineTo(C, h); ctx.stroke();
      ctx.setLineDash([]);
      // 边界危险条
      ctx.strokeStyle = 'rgba(255,90,60,0.75)';
      ctx.lineWidth = 12; ctx.strokeRect(26, 26, w - 52, h - 52);
      // 磨损脏污
      speckle(ctx, w, h, 260, 0.02, 0.09, 26, function (a) { return 'rgba(20,18,14,' + a + ')'; });
    });
  }

  // 波纹钢集装箱贴图（按颜色缓存）
  function getContainerTexture(hex) {
    var key = 'cont_' + hex;
    return makeTex(key, 512, function (ctx, w, h) {
      var base = new THREE.Color(hex);
      var r = Math.floor(base.r * 255), g = Math.floor(base.g * 255), b = Math.floor(base.b * 255);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
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
  function getSandbagTexture() {
    return makeTex('sandbag', 256, function (ctx, w, h) {
      ctx.fillStyle = '#8a7a4e'; ctx.fillRect(0, 0, w, h);
      var rows = 4, cols = 5;
      var bw = w / cols, bh = h / rows;
      for (var ry = 0; ry < rows; ry++) {
        for (var cx = 0; cx < cols; cx++) {
          var ox = (ry % 2) * bw * 0.5;
          var x = cx * bw + ox, y = ry * bh;
          var g = ctx.createRadialGradient(x + bw * 0.5, y + bh * 0.4, 4, x + bw * 0.5, y + bh * 0.5, bw * 0.7);
          var tint = 120 + Math.floor(Math.random() * 30);
          g.addColorStop(0, 'rgb(' + (tint + 20) + ',' + (tint + 6) + ',' + (tint - 40) + ')');
          g.addColorStop(1, 'rgb(' + (tint - 40) + ',' + (tint - 50) + ',' + (tint - 80) + ')');
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
  function getCloudTexture() {
    return makeTex('cloud', 512, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < 40; i++) {
        var x = Math.random() * w, y = Math.random() * h;
        var rad = 30 + Math.random() * 90;
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        var a = 0.12 + Math.random() * 0.28;
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }, { repeat: [3, 3] });
  }

  // 兼容旧调用
  function createGroundTexture() { return getAsphaltTexture(); }

  function buildArena() {
    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    // ---- 地面：平铺沥青 + 标线覆盖层 ----
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ map: getAsphaltTexture(), roughness: 0.97, metalness: 0.0, color: 0xcfd4da })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    var markTex = getMarkingTexture();
    var markings = new THREE.Mesh(
      new THREE.PlaneGeometry(94, 94),
      new THREE.MeshStandardMaterial({ map: markTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    markings.rotation.x = -Math.PI / 2;
    markings.position.y = 0.012;
    markings.receiveShadow = true;
    scene.add(markings);

    // 直升机坪金属圆盘
    var helipad = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 9.5, 0.12, 48),
      new THREE.MeshStandardMaterial({ map: getMetalTexture(), color: 0x555a60, roughness: 0.6, metalness: 0.5 })
    );
    helipad.position.set(0, 0.06, 0);
    helipad.receiveShadow = true;
    scene.add(helipad);

    // 积水反光块（低洼处）
    var puddleMat = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55 });
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
    var capMat = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.68, metalness: 0.45 });
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
        buildConcreteBlock(b, concreteTex, i);
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
    var mat = new THREE.MeshStandardMaterial({ map: tex, color: color, roughness: 0.62, metalness: 0.35 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // 角件（8个黑色铸钢角块）
    var cornerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.4 });
    var hw = b.w / 2, hh = b.h / 2, hd = b.d / 2, cs = 0.28;
    for (var sx = -1; sx <= 1; sx += 2)
      for (var sy = -1; sy <= 1; sy += 2)
        for (var sz = -1; sz <= 1; sz += 2) {
          var corner = new THREE.Mesh(new THREE.BoxGeometry(cs, cs, cs), cornerMat);
          corner.position.set(b.x + sx * (hw - cs / 2), b.h / 2 + sy * (hh - cs / 2), b.z + sz * (hd - cs / 2));
          scene.add(corner);
        }
    // 顶盖略深，避免顶面过亮
    var top = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.02, 0.06, b.d + 0.02), new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.3 }));
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
    var capMat = new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.5, metalness: 0.5 });
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

  // 混凝土块 / 金属货箱
  function buildConcreteBlock(b, concreteTex, i) {
    var t = concreteTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(b.w / 2)), Math.max(1, Math.round(b.h / 2)));
    t.needsUpdate = true;
    var mat = new THREE.MeshStandardMaterial({ map: t, color: i % 2 ? 0x9a9488 : 0x8f9490, roughness: 0.9, metalness: 0.05 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // 顶部危险条
    var stripe = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.03, 0.06, b.d + 0.03),
      new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.6 })
    );
    stripe.position.set(b.x, b.h + 0.03, b.z); scene.add(stripe);
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

  // 场景道具：油桶、轮胎堆、木托盘、弹药箱、混凝土残块
  function buildProps(metalTex) {
    // 油桶（红/蓝/黄，带箍与顶盖）
    var drumColors = [0xb63a2f, 0x2f6f9a, 0xc7a53a, 0x3a7a4a];
    [[-5, 12, 0], [5, -15, 1], [-18, -5, 2], [15, 5, 0], [-30, 12, 1], [30, -12, 3], [-12, 30, 0], [12, -30, 2], [-3, 12, 3], [22, 3, 1]].forEach(function (p) {
      var col = drumColors[p[2]];
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.15, 16),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.55 }));
      body.position.set(p[0], 0.58, p[1]);
      body.castShadow = true; body.receiveShadow = true; scene.add(body);
      var ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.5 });
      [-0.32, 0, 0.32].forEach(function (yy) {
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 6, 20), ringMat);
        ring.rotation.x = Math.PI / 2; ring.position.set(p[0], 0.58 + yy, p[1]); scene.add(ring);
      });
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 16), ringMat);
      lid.position.set(p[0], 1.16, p[1]); scene.add(lid);
    });

    // 轮胎堆
    var tireMat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9, metalness: 0.05 });
    [[-9, 9], [10, 10], [-20, 18], [24, -3]].forEach(function (p) {
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
    [[-16, 22, 0.3], [17, 19, -0.6], [-24, -22, 1.2]].forEach(function (p) {
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
    [[-2, -18], [3, 22], [-26, 2], [26, 14], [14, -24]].forEach(function (p) {
      var chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.3), rubbleMat);
      chunk.position.set(p[0], 0.35, p[1]);
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
      chunk.castShadow = true; chunk.receiveShadow = true;
      scene.add(chunk);
    });
  }

  // 瞭望塔：桁架腿 + 平台 + 栏杆 + 斜顶 + 探照灯
  function buildWatchtowers() {
    var legMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.7, metalness: 0.4 });
    var platMat = new THREE.MeshStandardMaterial({ map: getMetalTexture(), color: 0x555a5f, roughness: 0.6, metalness: 0.4 });
    var roofMat = new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.55, metalness: 0.35 });
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
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }));
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
    // 树木（双层锥形 + 颜色抖动）
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 0.95 });
    var treeSpots = [];
    for (var a = 0; a < 40; a++) {
      var ang = (a / 40) * Math.PI * 2;
      var rad = 60 + (a % 3) * 5 + Math.random() * 6;
      treeSpots.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    treeSpots.forEach(function (p) {
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 3.0, 6), trunkMat);
      trunk.position.set(p[0], 1.5, p[1]); trunk.castShadow = true; scene.add(trunk);
      var lh = 0.32 + Math.random() * 0.12;
      var leafMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(lh, 0.45, 0.32), roughness: 0.85 });
      var l1 = new THREE.Mesh(new THREE.ConeGeometry(1.5 + Math.random() * 0.4, 3.2, 7), leafMat);
      l1.position.set(p[0], 4.0, p[1]); l1.castShadow = true; scene.add(l1);
      var l2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 7), leafMat);
      l2.position.set(p[0], 5.6, p[1]); l2.castShadow = true; scene.add(l2);
    });

    // 远山（雾中低多边形，纯背景）
    var hillMat = new THREE.MeshStandardMaterial({ color: 0x6f8298, roughness: 1, metalness: 0, fog: true });
    for (var i = 0; i < 22; i++) {
      var ang2 = (i / 22) * Math.PI * 2 + 0.3;
      var d = 200 + Math.random() * 70;
      var hgt = 20 + Math.random() * 40;
      var hill = new THREE.Mesh(new THREE.ConeGeometry(40 + Math.random() * 40, hgt, 5), hillMat);
      hill.position.set(Math.cos(ang2) * d, hgt / 2 - 6, Math.sin(ang2) * d);
      hill.rotation.y = Math.random() * Math.PI;
      scene.add(hill);
    }

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
  function makeNameSprite(name) {
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
    ctx.fillStyle = '#ffffff';
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
    }, { repeat: [2, 2] });
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
    var gogMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.25, metalness: 0.5, transparent: true, opacity: 1 });
    var lensMat = new THREE.MeshStandardMaterial({ color: 0x88e0ff, emissive: 0x2a6688, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.4, transparent: true, opacity: 1 });
    var helmetMat = new THREE.MeshStandardMaterial({ color: 0x3c4142, roughness: 0.55, metalness: 0.25, transparent: true, opacity: 1 });
    var bootMat = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.6, transparent: true, opacity: 1 });
    var accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent.clone().multiplyScalar(0.25), roughness: 0.5, transparent: true, opacity: 1 });
    // 护具（护膝/护肘/护板/扣具）。金属度别开高：0.35 + 粗糙度 0.5 会把整片蓝天
    // 镜面反射进来，正面看护膝就是两块发亮的浅蓝塑料片，一眼假。
    // 真实护具是橡胶/尼龙包边的哑光件，压到 0.16 / 0.62 才像。
    // 明度仍然排在 gearMat 和 vestMat 中间（偏冷），三档层次不能塌成一块。
    var armorMat = new THREE.MeshStandardMaterial({ color: 0x34383c, roughness: 0.62, metalness: 0.16, transparent: true, opacity: 1 });
    var bodyMats = [suitMat, gearMat, vestMat, pouchMat, skinMat, maskMat, helmetMat, bootMat, accentMat, armorMat, gogMat];

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
      var thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.091, 0.34, 4, 8), suitMat);
      thigh.position.y = -0.24; thigh.castShadow = true; leg.add(thigh);
      var shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.079, 0.34, 4, 8), suitMat);
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
    var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 5, 10), suitMat);
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
    shoulderL.scale.set(1.0, 0.64, 1.10); shoulderL.position.set(-0.228, 1.468, -0.01);
    shoulderL.castShadow = true;
    var shoulderR = shoulderL.clone(); shoulderR.position.x = 0.228;
    chest.add(shoulderL, shoulderR);
    chest.add(P(0.09, 0.07, 0.15, gearMat, -0.205, 1.455, 0));
    chest.add(P(0.09, 0.07, 0.15, gearMat, 0.205, 1.455, 0));

    // ---- 头部（含头盔/护目镜/面罩/耳机）----
    var headGroup = new THREE.Group();
    headGroup.position.set(0, 1.56, 0);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skinMat);
    neck.position.y = 0.02; headGroup.add(neck);
    var head = P(0.17, 0.20, 0.18, skinMat, 0, 0.14, 0);
    headGroup.add(head);
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
    headGroup.add(PF(0.17, 0.038, 0.02, lensMat, 0, 0.152, -0.114));
    var gogStrap = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.009, 6, 20), gogMat);
    gogStrap.rotation.x = Math.PI / 2; gogStrap.position.set(0, 0.168, 0.005);
    gogStrap.scale.set(1, 1.06, 1); headGroup.add(gogStrap);
    // 面罩（下半脸）+ 滤盒
    headGroup.add(P(0.16, 0.095, 0.165, maskMat, 0, 0.058, -0.015));
    headGroup.add(P(0.10, 0.062, 0.05, maskMat, 0, 0.052, -0.105));
    headGroup.add(P(0.045, 0.035, 0.03, gearMat, 0, 0.040, -0.128));
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
      var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.235, 4, 8), suitMat);
      upper.position.set(0, -0.157, -0.015); upper.castShadow = true; arm.add(upper);

      var fore = new THREE.Group();            // 肘关节
      fore.position.set(0, -ARM_L1, -0.012);
      arm.add(fore);
      // 护肘比小臂略宽，凸出轮廓
      fore.add(P(0.126, 0.098, 0.125, armorMat, 0, 0, 0));
      var foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.19, 4, 8), suitMat);
      foreMesh.position.set(0, -0.135, 0); foreMesh.castShadow = true; fore.add(foreMesh);
      // 袖口束带（绕整圈）收住小臂末端
      var cuff = new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.010, 6, 14), gearMat);
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
      primary: 'rifle', secondary: 'pistol', kills: 0, deaths: 0,
      fireAnim: 0, swingAnim: 0, throwAnim: 0, firstUpdate: true,
      // 换弹动画：已播时长 / 总时长 / 播的是哪把枪的模型
      reloadAnim: 0, reloadDur: 0, reloadModel: null, reloadId: '',
      // 两只手在 weaponGroup 局部的落点（换弹时枪会侧倾，手要跟着枪重解）
      gripWG: gripWG, suppWG: suppWG, suppFullWG: suppFullWG, suppFrac: suppFrac
    };
    remotePlayers.set(id, r);
    return r;
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
      // 按托底对齐（见 TP_POCKET_Z）。这里量的是**模型局部**盒：model 还没进
      // 场景树，setFromObject 只会拿它自己的 matrixWorld（=缩放矩阵）去算。
      // 只许往前错（min(0,…)）——手枪托底本来就在手边，往后挪会插进胸口。
      // 枪往前错，握把和护木跟着一起错，两只手由持枪 IK 自动跟上（updateRemoteHold）。
      if (!isMelee) {
        var tpBB = new THREE.Box3().setFromObject(model);
        model.userData.tpZ = Math.min(0, TP_POCKET_Z - tpBB.max.z);
        model.position.z = model.userData.tpZ;
      }
      r.weaponGroup.add(model);
      r.weaponCache[key] = model;
    }
    Object.keys(r.weaponCache).forEach(function (k) {
      r.weaponCache[k].visible = (k === key);
    });
    r.shownWeapon = key;
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

  // 当前这一发的散射半角。与服务端 effectiveSpread 保持一致：
  // 移动惩罚不受开镜缩放影响——边跑边开镜不该有站定的精度。
  function currentSpread(wpn) {
    var base = (wpn.spread + bloom) * ((ads && local.current !== 'melee') ? (wpn.adsSpread || 1) : 1);
    var speed = Math.sqrt(local.vel.x * local.vel.x + local.vel.z * local.vel.z);
    var moveFrac = clamp(speed / 8, 0, 1);
    var air = (local.pos.y > 0.35 ? (wpn.airSpread || 0) : 0);
    return base + moveFrac * (wpn.moveSpread || 0) + air;
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

  function playHitSound() {
    ensureAudio();
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
    ammoText.textContent = isMelee ? '∞' : (local.ammo + ' / ' + WEAPONS[currentRangedId()].mag);
    if (!isMelee) {
      ammoText.classList.toggle('low', local.ammo <= WEAPONS[currentRangedId()].mag * 0.25);
    } else {
      ammoText.classList.remove('low');
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
      var speedFrac = clamp(Math.sqrt(local.vel.x * local.vel.x + local.vel.z * local.vel.z) / 13, 0, 1);
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

  function showHitmarker() {
    hitmarker.classList.remove('show');
    void hitmarker.offsetWidth;
    hitmarker.classList.add('show');
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
    killfeed.appendChild(div);
    while (killfeed.children.length > 5) killfeed.removeChild(killfeed.firstChild);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 5000);
  }

  function updateScoreboard() {
    var rows = [];
    remotePlayers.forEach(function (r) {
      rows.push({ name: r.name, kills: r.kills, deaths: r.deaths, alive: r.alive, me: false });
    });
    rows.push({ name: local.name || '你', kills: local.kills, deaths: local.deaths, alive: local.alive, me: true });
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
      var tdKD = document.createElement('td');
      tdKD.textContent = row.deaths > 0 ? (row.kills / row.deaths).toFixed(2) : row.kills;
      tr.appendChild(tdName); tr.appendChild(tdAlive); tr.appendChild(tdKills); tr.appendChild(tdDeaths); tr.appendChild(tdKD);
      scoreBody.appendChild(tr);
    });
  }

    function updateLeaderboard() {
      if (!leaderboardList) return;
      var rows = [];
      remotePlayers.forEach(function (r) {
        rows.push({ name: r.name, kills: r.kills, deaths: r.deaths, me: false });
      });
      rows.push({ name: local.name || '你', kills: local.kills, deaths: local.deaths, me: true });
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
          local.ranged = local.primary;
          local.ammoPrimary = WEAPONS[local.primary].mag;
          local.ammoSecondary = WEAPONS.pistol.mag;
        local.hp = local.maxHp;
        local.ammo = WEAPONS[local.ranged].mag;
        local.melee = selectedMelee;
        local.ranged = selectedRanged;
        local.current = 'ranged';
          local.current = 'primary';
        local.kills = 0;
        local.deaths = 0;
        lastHp = local.hp;
        deathOverlay.style.display = 'none';
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
        if (msg.victimId === local.id) { respawnCountdownEnd = Date.now() + 3000; playDeathSound(); }
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
        local.ammo = pd.ammo;
        local.reloading = pd.reloading;
        local.current = pd.current;
        local.melee = pd.melee;
        local.ranged = pd.ranged;
          if (pd.primary) local.primary = pd.primary;
          if (pd.secondary) local.secondary = pd.secondary;
          if (typeof pd.ammoPrimary === 'number') local.ammoPrimary = pd.ammoPrimary;
          if (typeof pd.ammoSecondary === 'number') local.ammoSecondary = pd.ammoSecondary;
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
      if (msg.hitPlayers && msg.hitPlayers.length > 0) {
        showHitmarker();
        playHitSound();
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
        if (tr.hitPlayer) {
          addImpact(new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z), 0xff6655, 10, false);
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
      if (msg.hitPlayers && msg.hitPlayers.length > 0) {
        showHitmarker();
        playHitSound();
      }
      return;
    }
    var r = remotePlayers.get(msg.id);
    if (r) {
      addSlashEffect(r.renderPos.clone(), r.renderYaw);
      r.swingAnim = 0.18;
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
        local.current = 'primary';
        local.ranged = local.primary;
        local.ammo = local.ammoPrimary;
      local.reloading = false;
      cancelReloadAnim();     // 重生手上是满弹，上一条命没播完的换弹动画作废
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
        ads = true;
        e.preventDefault();
      }
    });

    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) {
        if (triggerDown) {
          triggerDown = false;
          send({ t: 'attack', down: false });
        }
      } else if (e.button === 2) {
        ads = false;
      }
    });

    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', function () {
      pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked && gameStarted) {
        keys.f = keys.b = keys.l = keys.r = keys.jump = keys.run = false;
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
      var now = performance.now();
      if (now - lastSmokeTime < 3000) return;
      lastSmokeTime = now;
      // 只报朝向，弹道由两端各自积分（见 stepThrown）
      send({ t: 'smoke', yaw: aimYaw(), pitch: aimPitch() });
      throwAnim = 0.32;
    }

    function throwGrenade() {
      if (!gameStarted || !local.alive) return;
      var now = performance.now();
      if (now - lastGrenadeTime < 3000) return;
      lastGrenadeTime = now;
      send({ t: 'grenade', yaw: aimYaw(), pitch: aimPitch() });
      throwAnim = 0.32;
    }
  function switchWeapon(slot) {
    if (!gameStarted) return;
    if (slot === 'melee') { local.current = 'melee'; }
    else if (slot === 'secondary') { local.current = 'secondary'; local.ranged = local.secondary; local.ammo = local.ammoSecondary; }
      else if (slot === 'primary') { local.current = 'primary'; local.ranged = local.primary; local.ammo = local.ammoPrimary; }
    else return;
    if (triggerDown) { triggerDown = false; send({ t: 'attack', down: false }); }
    ads = false;
    bloom = 0;                 // 换枪清零累积散射（每把枪的 bloomMax 不同，不能沿用）
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

  function startReload() {
    if (!gameStarted || !local.alive || local.current === 'melee') return;
    var wpn = WEAPONS[local.ranged];
    if (local.reloading || local.ammo >= wpn.mag) return;
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
    setTimeout(function () {
      local.reloading = false;
      local.ammo = WEAPONS[local.ranged].mag;
        if (local.current === 'secondary') { local.ammoSecondary = local.ammo; } else { local.ammoPrimary = local.ammo; }
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
          startReload();
        }
        return;
      startReload();
      return;
    }
    lastLocalFire = now;
    local.ammo--;
      if (local.current === 'secondary') { local.ammoSecondary = local.ammo; } else { local.ammoPrimary = local.ammo; }
    updateHUD();

    // 这一发的散射要在累加本发 bloom **之前**算，否则第一发就自带累积量
    var spread = currentSpread(wpn);
    bloom = Math.min(bloom + (wpn.bloom || 0), wpn.bloomMax || 0);

    // 后坐力：抬枪 + 横向抖动。开镜时减轻 35%（贴腮更稳）。
    // recoilPitch/recoilYaw 同时进入画面和 aimDir()，所以它真的会打偏。
    var adsK = (ads && local.current !== 'melee') ? 0.65 : 1;
    var kick = (wpn.recoil || 0.015) * adsK;
    recoilPitch += kick * (0.78 + Math.random() * 0.44);
    recoilYaw += (Math.random() - 0.5) * 2 * (wpn.recoilH || 0.004) * adsK;
    recoilZ += wpn.id === 'awp' ? 0.16 : (wpn.id === 'shotgun' ? 0.1 : 0.05);

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

    if (local.ammo <= 0) startReload();
  }

  function localMelee() {
    var now = performance.now();
    var wpn = WEAPONS[local.melee];
    if (now - lastLocalMelee < wpn.cooldown) return;
    lastLocalMelee = now;
    swingTime = 0.24;
    playMeleeSound(local.melee, false);
  }

  // ----------------------------------------------------------
  // 本地更新
  // ----------------------------------------------------------
  function updateLocal(dt) {
    if (!gameStarted || !local.alive || !local.initialized) return;

    var adsActive = ads && local.current !== 'melee';
      var heavyFactor = (local.current !== 'melee' && local.ranged === 'lmg') ? 0.6 : 1;
    var speed = (keys.run ? 13 : 8) * heavyFactor * (adsActive ? 0.55 : 1);
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

    if (keys.jump && local.onGround) {
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

    camera.position.set(local.pos.x + shakeX, local.pos.y + EYE + bobY * 0.4 + shakeY, local.pos.z);
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

    // 后坐力恢复。开镜时恢复更快（更贴稳），让点射节奏有区别。
    var rec = 1 - Math.exp(-dt * (adsActive ? 15 : 11));
    recoilPitch -= recoilPitch * rec;
    recoilYaw -= recoilYaw * rec;
    recoilZ -= recoilZ * (1 - Math.exp(-dt * 12));

    // 累积散射回落（与服务端 decayBloom 用同一组 bloomDecay）
    if (bloom > 0 && local.current !== 'melee') {
      var rw = WEAPONS[local.ranged];
      bloom = Math.max(0, bloom - dt * ((rw && rw.bloomDecay) || 0.05));
    }

    // 近战挥砍动画
    if (swingTime > 0) {
      swingTime -= dt;
      var t = 1 - Math.max(swingTime, 0) / 0.24;
      vmMeleeGroup.rotation.x = -1.35 * Math.sin(t * Math.PI);
      vmMeleeGroup.position.y = Math.sin(t * Math.PI) * 0.1;
      if (swingTime <= 0) {
        vmMeleeGroup.rotation.x = 0;
        vmMeleeGroup.position.y = 0;
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
      r.group.position.copy(r.renderPos);
      r.group.rotation.y = r.renderYaw;

      var speed = Math.sqrt(r.vel.x * r.vel.x + r.vel.z * r.vel.z);
      var speedFrac = clamp(speed / 8, 0, 1);

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
        r.aimGroup.rotation.x = r.renderPitch + sw * 0.055;
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
        // 后坐是把枪往后（+z）推，基准取 WEAPON_MOUNT[2]
        r.weaponGroup.position.z = WEAPON_MOUNT[2] + Math.sin(fp * Math.PI) * 0.1;
        if (r.fireAnim <= 0) r.weaponGroup.position.z = WEAPON_MOUNT[2];
      }
      if (r.swingAnim > 0) {
        r.swingAnim -= dt;
        var spg = 1 - Math.max(r.swingAnim, 0) / 0.18;
        r.weaponGroup.rotation.x = -1.6 * Math.sin(spg * Math.PI);
        if (r.swingAnim <= 0) r.weaponGroup.rotation.x = 0;
      }

      // 双手跟住枪。必须放在后坐/挥砍**之后**（枪已经挪好位置）、投掷/换弹
      // **之前**（那两个动作要抢手）。近战暂时排除：刀沿用的是步枪握把点，
      // 得先给刀配自己的挂点。
      if (r.alive && r.current !== 'melee') {
        var holdMask = r.reloadDur > 0 ? 0 : (r.throwAnim > 0 ? 2 : 3);
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
  // 各枪为了对齐托底在 weaponGroup 里前后错开过（ensureRemoteWeapon），
  // 手的落点得错同样的量，否则短枪的手会往后飘、长枪的手抓在护木前面。
  function anchorZ(r) {
    var m = r.weaponCache[r.shownWeapon];
    return (m && m.userData.tpZ) || 0;
  }
  function remoteSupportPoint(r) {
    // 握把、护木都换到 chest 坐标，再沿这条线二分找臂展够得到的最远点。
    // 和建模时同一套逻辑，只是这回每帧算：枪一转，可达范围就跟着变。
    var az = anchorZ(r);
    HOLD_A.copy(remoteChestPoint(r, r.weaponGroup, r.gripWG.x, r.gripWG.y, r.gripWG.z + az));
    HOLD_B.copy(remoteChestPoint(r, r.weaponGroup, r.suppFullWG.x, r.suppFullWG.y, r.suppFullWG.z + az));
    var sh = r.leftArm.position, maxR = (ARM_L1 + ARM_L2) * 0.97;
    function reach(t) {
      var dx = HOLD_A.x + (HOLD_B.x - HOLD_A.x) * t - sh.x;
      var dy = HOLD_A.y + (HOLD_B.y - HOLD_A.y) * t - sh.y;
      var dz = HOLD_A.z + (HOLD_B.z - HOLD_A.z) * t - sh.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    var lo = 0, hi = 1;
    if (reach(1) > maxR) {
      for (var it = 0; it < 20; it++) {
        var mid = (lo + hi) * 0.5;
        if (reach(mid) > maxR) hi = mid; else lo = mid;
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
      var az = anchorZ(r);
      var gp = remoteChestPoint(r, r.weaponGroup, r.gripWG.x, r.gripWG.y, r.gripWG.z + az);
      solveArm(r.rightArm, gp.x, gp.y, gp.z, ARM_POLE[0], ARM_POLE[1], ARM_POLE[2], true);
    }
  }
  function stopRemoteReload(r) {
    if (r.reloadModel) resetReloadParts(r.reloadModel);
    r.reloadDur = 0; r.reloadAnim = 0; r.reloadModel = null; r.reloadId = '';
    r.weaponGroup.position.set(WEAPON_MOUNT[0], WEAPON_MOUNT[1], WEAPON_MOUNT[2]);
    r.weaponGroup.rotation.set(0, 0, 0);
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
    var az = anchorZ(r);
    var gp = remoteChestPoint(r, r.weaponGroup, r.gripWG.x, r.gripWG.y, r.gripWG.z + az);
    solveArm(r.rightArm, gp.x, gp.y, gp.z, ARM_POLE[0], ARM_POLE[1], ARM_POLE[2], true);

    // 左手：分段找目标。护木点和弹匣井点都随枪走，掏匣点固定在胸挂上。
    var hp = remoteChestPoint(r, r.weaponGroup, r.suppWG.x, r.suppWG.y, r.suppWG.z + az);
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
      ads: !!(ads && local.current !== 'melee')
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
          selectedRanged = selectedPrimary;
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
        local.ranged = selectedPrimary;
      local.ranged = selectedRanged;
      local.current = 'ranged';
        local.current = 'primary';
      local.ammoPrimary = WEAPONS[selectedPrimary].mag;
        local.ammoSecondary = WEAPONS.pistol.mag;
        local.ammo = local.ammoPrimary;
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

  // 临时穿模检测钩子（验完删除）
  window.__CL = {
    THREE: THREE, createRemotePlayer: createRemotePlayer, remotePlayers: remotePlayers,
    ensureRemoteWeapon: ensureRemoteWeapon, updateRemoteWeaponVisual: updateRemoteWeaponVisual,
    startRemoteReload: startRemoteReload, updateRemoteReload: updateRemoteReload,
    updateRemotePlayers: updateRemotePlayers, updateRemoteHold: updateRemoteHold,
    WEAPON_MOUNT: WEAPON_MOUNT, ARM_L1: ARM_L1, ARM_L2: ARM_L2,
    WEAPONS: WEAPONS, scene: scene, gunModels: gunModels, meleeModels: meleeModels
  };

})();
