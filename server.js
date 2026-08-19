/**
 * 局域网 3D 射击游戏服务器
 * 零依赖：使用 Node.js 内置 http / crypto 模块，手写 WebSocket (RFC 6455) 实现。
 *
 * 运行：node server.js
 * 默认端口 3000，可用环境变量 PORT 覆盖。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TICK_RATE = 1000 / 30; // 30Hz
const ARENA_HALF = 46;        // 场地半宽（x/z 范围 -46..46）
const PLAYER_RADIUS = 0.65;   // 玩家「占地」半径：近战测距、手雷测距用，不再是子弹判定
const PLAYER_EYE = 1.55;      // 视线高度（枪口/眼睛）
const PLAYER_CENTER_Y = 1.1;  // 玩家体心高度（手雷、AI 参考点）
const RESPAWN_TIME = 3000;

// ---------------------------------------------------------------
// 命中部位模型
// ---------------------------------------------------------------
// 原来子弹判定是一个 r=0.65、中心 y=1.1 的整体球：横向是个 1.3m 宽的判定泡，
// 竖直只覆盖 0.45~1.75 —— 打腿完全不判定，而打头和打肚子一模一样。
// 要做部位倍率，先得有部位，所以换成一组按躯体摆位的竖直圆柱 + 一个头球。
//
// 尺寸不是拍的，是从客户端模型量出来的（把 createRemotePlayer 返回的
// headGroup / chest / leftArm / rightArm / leftLeg / rightLeg 各自遍历一遍，
// 取世界空间 bbox 的并集）：
//     头（含头盔）  y 1.540 ~ 1.873   半宽 0.160
//     躯干 + 背心   y 0.900 ~ 1.570
//     手臂          y 1.079 ~ 1.536
//     腿（靴底落在 y=0）y 0 ~ 0.921
//
// 代价必须说清楚：横向判定从 ±0.65 收到 ±0.42，比以前难打。这不是副作用，
// 而是做部位判定的**前提**——不收窄的话「手臂」区会一直伸到体侧 65cm，
// 打偏半米也算命中手臂，倍率就成了笑话。作为交换，竖直方向从 0.45~1.75
// 扩到 0~1.90：腿和头第一次真的能单独打中。
//
// kind: 'sphere' 只用 y/r；'cyl' 是**有限**竖直圆柱（带上下平端盖）。
// 这里必须用有限圆柱而不是胶囊：胶囊的端盖会往两端各鼓出一个 r，
// 躯干和头/腿一定互相嵌套，而下面取的是**最近**命中，外层永远先中，分区就废了。
// ox 是沿受击者体侧方向的偏移（随其 yaw 一起转），左右对称所以只有正负之分。
const HIT_ZONES = [
  { zone: 'head',  mult: 2.35, kind: 'sphere', y: 1.70, r: 0.20 },
  { zone: 'torso', mult: 1.00, kind: 'cyl', y0: 0.98, y1: 1.56, r: 0.34, ox: 0 },
  // 手臂外缘 0.26+0.16=0.42，比躯干的 0.34 更靠外，所以侧面来的弹先中手臂；
  // 而正对胸口的弹（体侧向偏移 <0.10）根本碰不到这两根，胸口不会被误判成手臂。
  { zone: 'arm',   mult: 0.78, kind: 'cyl', y0: 1.02, y1: 1.52, r: 0.16, ox: 0.26 },
  { zone: 'arm',   mult: 0.78, kind: 'cyl', y0: 1.02, y1: 1.52, r: 0.16, ox: -0.26 },
  { zone: 'leg',   mult: 0.80, kind: 'cyl', y0: 0.02, y1: 0.98, r: 0.20, ox: 0.13 },
  { zone: 'leg',   mult: 0.80, kind: 'cyl', y0: 0.02, y1: 0.98, r: 0.20, ox: -0.13 },
];
// 广相包围球：把上面 6 个体积全部外切包住，先排除再细分，
// 免得每发子弹对每个玩家都做 6 次求交。
// 校核最远的几个点（相对中心 y=0.95）：头顶 (0,1.90) → 0.95；
// 脚外缘 (0.33,0.02) → 0.99；手臂上外角 (0.42,1.52) → 0.71。r=1.02 够，留到 1.06。
const HIT_BROAD_Y = 0.95;
const HIT_BROAD_R = 1.06;
// 部位中文名，只用于击杀提示
const ZONE_LABEL = { head: '头部', torso: '躯干', arm: '手臂', leg: '腿部' };


// ---------------------------------------------------------------
// 投掷物弹道参数
// 这一组常量 + stepThrown() 必须与 public/js/game_v2.js 里的同名副本逐字一致：
// 服务端只广播「出手点 + 出手速度」，两端各自用同一个定步长积分器算轨迹，
// 客户端画出来的手雷才会正好落在服务端判定爆炸的位置。
// ---------------------------------------------------------------
const THROW_GRAVITY = 20;      // 与玩家重力一致
const THROW_SPEED = 21;        // 出手速度（m/s）
const THROW_UP = 0.16;         // 出手方向的额外上抬（弧度补偿，让平视也能抛出弧线）
const THROW_RADIUS = 0.085;    // 弹体半径
const THROW_RESTITUTION = 0.40;// 反弹系数
const THROW_FRICTION = 0.72;   // 触地后的水平衰减
const THROW_STEP = 1 / 120;    // 积分步长，两端必须相同
const GRENADE_FUSE = 1500;     // 手雷引信（ms）
const SMOKE_FUSE = 1100;       // 烟雾弹起效延时（ms）

// ---------------------------------------------------------------
// 武器配置（与客户端 public/js/game.js 中保持一致）
// ---------------------------------------------------------------
const WEAPONS = {
  knife: {
    id: 'knife', name: '战术匕首', type: 'melee',
    damage: 30, range: 2.4, cooldown: 380, arcDot: 0.45,
    color: 0xc0c0c0,
  },
  axe: {
    id: 'axe', name: '消防斧', type: 'melee',
    damage: 60, range: 3.0, cooldown: 950, arcDot: 0.55,
    color: 0xcc3333,
  },
  katana: {
    id: 'katana', name: '武士刀', type: 'melee',
    damage: 40, range: 3.2, cooldown: 560, arcDot: 0.5,
    color: 0x8a8a8a,
  },
    kukri: {
      id: 'kukri', name: '尼泊尔军刀', type: 'melee',
      damage: 45, range: 2.6, cooldown: 450, arcDot: 0.5,
      color: 0x9aa0a0,
    },
    chainsaw: {
      id: 'chainsaw', name: '电锯', type: 'melee',
      damage: 30, range: 2.7, cooldown: 250, arcDot: 0.6,
      color: 0xff6600,
    },
  // 散射/后坐力字段说明（必须与 public/js/game_v2.js 的 WEAPONS 表保持一致）：
  //   spread      第一发的锥形散射半角（弧度）
  //   bloom       每开一枪累加的散射量；bloomMax 上限；bloomDecay 每秒回落量
  //   moveSpread  跑动时额外叠加的散射（按水平速度线性插值）
  //   airSpread   离地时额外叠加的散射
  //   adsSpread   开镜时对「基础+累积」部分的缩放
  //   hipSpread   不开镜（腰射）时额外叠加的固定锥角
  //   recoil      每发的抬枪量（弧度，纵向）；recoilH 横向抖动幅度
  //   recoilRamp  连发时后坐力的增长量：实际抬枪 = recoil × (1 + ramp × bloom/bloomMax)
  //
  // hipSpread 为什么是**加法**而不是乘在 spread 上：
  // 乘法会把「本来精度高的枪腰射也准」这个不合理特性原样放大——
  // 狙击枪 spread 只有 0.0004，乘 10 倍还是 0.004（0.23°），站着不开镜一枪爆头照旧。
  // 真实腰射之所以散，是因为枪没有稳定的参考点（不贴腮、不抵肩），
  // 这个误差跟枪本身的精度无关，所以它就该是一个各枪量级相近的常数项。
  // 取值按「10m 处的落点半径」定：步枪 0.034rad → 34cm（一个躯干宽），
  // 也就是腰射在十米内还能压住人，二十米开外就得开镜。枪越长越没谱，
  // 所以狙 / 连狙 / 机枪的惩罚最大。
  //
  // bloom 的硬约束（六把枪原来全违反了，属于实打实的 bug 而不是手感偏好）：
  //     bloom > bloomDecay × cooldown/1000
  // tryFire 每次都先 decayBloom(p, now) 按「距上次开火的时间」回落，再累加本发。
  // 步枪两发间隔 105ms、bloomDecay 0.055/s → 每次先掉 0.00577，而每发只加 0.0035，
  // 净增长是负的，于是 p.bloom 在 0 和 0.0035 之间原地弹跳，永远碰不到 bloomMax。
  // 连带把 recoilRamp 也废了 —— 它拿 bloom/bloomMax 当「连了多久」的进度，恒为 0。
  // 现在按「连打 N 发到上限」反解：bloom = bloomDecay×cooldown/1000 + bloomMax/N。
  // N：手枪 6、霰弹 4、步枪 12、狙 5、连狙 5、机枪 25。
  // 慢射速的两把（霰弹 900ms / 狙 1400ms）光调 bloom 不够：回落量本身就超过 bloomMax，
  // 无论 bloom 多大都攒不起来，所以同时放慢它们的 bloomDecay（狙还抬了 bloomMax）。
  pistol: {
    id: 'pistol', name: '手枪', type: 'ranged',
    damage: 26, mag: 12, cooldown: 240, range: 90,
    pellets: 1, spread: 0.006, reloadTime: 1.3, auto: false,
    bloom: 0.0170, bloomMax: 0.030, bloomDecay: 0.050,
    moveSpread: 0.012, airSpread: 0.020, adsSpread: 0.55,
    hipSpread: 0.020, recoil: 0.0130, recoilH: 0.0045, recoilRamp: 0.85,
    color: 0x444444,
  },
  shotgun: {
    id: 'shotgun', name: '霰弹枪', type: 'ranged',
    damage: 13, mag: 6, cooldown: 900, range: 45,
    pellets: 8, spread: 0.050, reloadTime: 2.3, auto: false,
    bloom: 0.0440, bloomMax: 0.075, bloomDecay: 0.028,
    moveSpread: 0.020, airSpread: 0.030, adsSpread: 0.80,
    // 霰弹枪的腰射惩罚故意给得最小：它本来就是靠 0.05 的弹丸散布吃近距离的，
    // 再叠一个大锥角只会把它从「近战王」变成「什么距离都不行」。
    hipSpread: 0.016, recoil: 0.0330, recoilH: 0.0080, recoilRamp: 0.55,
    color: 0x553311,
  },
  rifle: {
    id: 'rifle', name: '突击步枪', type: 'ranged',
    damage: 19, mag: 30, cooldown: 105, range: 110,
    pellets: 1, spread: 0.005, reloadTime: 1.9, auto: true,
    bloom: 0.0093, bloomMax: 0.042, bloomDecay: 0.055,
    moveSpread: 0.016, airSpread: 0.028, adsSpread: 0.45,
    hipSpread: 0.034, recoil: 0.0090, recoilH: 0.0038, recoilRamp: 1.30,
    color: 0x222222,
  },
    awp: {
      id: 'awp', name: '狙击步枪', type: 'ranged',
      // 150 → 120。这一改是部位倍率的**直接后果**，不是顺手调平衡：
      // 满血 100，150 打四肢也是 150×0.78=117 > 100，倍率对这把枪等于不存在，
      // 一枪爆脚背和一枪爆头没有任何区别。120 之后躯干仍是一枪一个（120），
      // 手臂 94 / 腿 96 都刚好留一口气，爆头 282 —— 参照 CS 的 AWP
      // （胸 115、腿不致死）也是这个思路：狙的强度体现在「命中就赢」，
      // 而不是「打到哪都赢」。
      damage: 120, mag: 5, cooldown: 1400, range: 160,
      pellets: 1, spread: 0.0004, reloadTime: 2.6, auto: false,
      bloom: 0.0200, bloomMax: 0.030, bloomDecay: 0.010,
      moveSpread: 0.030, airSpread: 0.045, adsSpread: 0.15,
      hipSpread: 0.070, recoil: 0.0460, recoilH: 0.0060, recoilRamp: 0.45,
      color: 0x1a3a1a,
    },
    dmr: {
      id: 'dmr', name: '连狙', type: 'ranged',
      damage: 55, mag: 10, cooldown: 300, range: 120,
      pellets: 1, spread: 0.002, reloadTime: 2.1, auto: false,
      bloom: 0.0150, bloomMax: 0.022, bloomDecay: 0.035,
      moveSpread: 0.020, airSpread: 0.032, adsSpread: 0.30,
      hipSpread: 0.046, recoil: 0.0230, recoilH: 0.0050, recoilRamp: 1.00,
      color: 0x2a4a2a,
    },
    lmg: {
      id: 'lmg', name: '重机枪', type: 'ranged',
      damage: 16, mag: 125, cooldown: 95, range: 100,
      pellets: 1, spread: 0.009, reloadTime: 3.8, auto: true,
      bloom: 0.0070, bloomMax: 0.055, bloomDecay: 0.050,
      moveSpread: 0.024, airSpread: 0.036, adsSpread: 0.60,
      // ramp 最高：125 发的弹链打到后半段必须完全压不住，
      // 否则「一直按着不放」永远优于点射，机枪就没有节奏可言了。
      hipSpread: 0.042, recoil: 0.0062, recoilH: 0.0042, recoilRamp: 1.70,
      color: 0x3a3a3a,
    },
};

// 近战连段。窗口内连续挥砍会接上下一段，超时归零。
// dmg/cd 是倍率，乘在 WEAPONS 的基础值上；arcK 乘在 arcDot 上（arcDot 是命中所需的
// 最小 dot，所以 >1 = 扇区更窄），rngK 乘在 range 上。
// 客户端 game_v2.js 里有**同一张表**，两边必须逐字一致：客户端靠它预测段号来播动作，
// 对不上就会出现「看到的是收尾重砍，挨的是第一段伤害」。
const MELEE_COMBO_WINDOW = 900;
const MELEE_COMBO = {
  knife: [{ dmg: 1.00, cd: 0.58 },
          { dmg: 1.00, cd: 0.58 },
          { dmg: 1.45, cd: 1.30, arcK: 1.35, rngK: 1.15 }],
  kukri: [{ dmg: 1.00, cd: 0.62 },
          { dmg: 1.15, cd: 1.25 }],
  katana: [{ dmg: 1.00, cd: 0.60 },
           { dmg: 1.00, cd: 0.60 },
           { dmg: 1.55, cd: 1.35, arcK: 0.85 }],
  axe:   [{ dmg: 1.00, cd: 1.00 },
          { dmg: 1.10, cd: 1.15, arcK: 0.85 }],
  chainsaw: [{ dmg: 1.00, cd: 1.00 },
             { dmg: 1.00, cd: 1.00 }],
};
function meleeStep(id, stage) {
  const c = MELEE_COMBO[id] || MELEE_COMBO.knife;
  return c[((stage % c.length) + c.length) % c.length];
}

// 地图掩体（与客户端保持一致）
const BOXES = [
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

const SPAWNS = [
  { x: 0, z: -40 }, { x: 0, z: 40 }, { x: -40, z: 0 }, { x: 40, z: 0 },
  { x: -40, z: -40 }, { x: 40, z: 40 }, { x: -40, z: 40 }, { x: 40, z: -40 },
  { x: 0, z: -30 }, { x: 0, z: 30 }, { x: -30, z: 0 }, { x: 30, z: 0 },
];

// ---------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }
function dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

function forwardFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// 在以 dir 为轴的圆锥内取一个随机方向。
// 不能直接给 dir 的 x/y/z 各加一个随机数：那是在世界轴上加立方体扰动，
// 实际角度会随朝向变化（朝 -Z 看时扰动 z 几乎不改变方向，扰动 x/y 却全额生效），
// 于是同一把枪朝不同方向打的精度不一样。必须在垂直于 dir 的平面里取偏移。
function spreadDir(dir, halfAngle) {
  if (halfAngle <= 0) return dir;
  // 任取一个与 dir 不平行的向量来构造正交基
  const up = Math.abs(dir.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const right = normalize({
    x: up.y * dir.z - up.z * dir.y,
    y: up.z * dir.x - up.x * dir.z,
    z: up.x * dir.y - up.y * dir.x,
  });
  const realUp = {
    x: dir.y * right.z - dir.z * right.y,
    y: dir.z * right.x - dir.x * right.z,
    z: dir.x * right.y - dir.y * right.x,
  };
  // sqrt 让样本在圆盘上均匀分布（不开方会在中心堆积）
  const r = Math.tan(halfAngle) * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  return normalize({
    x: dir.x + right.x * ox + realUp.x * oy,
    y: dir.y + right.y * ox + realUp.y * oy,
    z: dir.z + right.z * ox + realUp.z * oy,
  });
}

// 当前这一发的实际散射半角：基础 + 连发累积（开镜缩放），再叠加腰射/移动/离地惩罚。
// 三个惩罚项都**不**受开镜缩放影响：
//   腰射惩罚本身就是「没开镜」的代价，乘上 adsSpread 是逻辑打转；
//   移动惩罚是因为身体在动，边跑边开镜也不该有站定的精度。
function effectiveSpread(p, wpn) {
  const base = (wpn.spread + (p.bloom || 0)) * (p.ads ? (wpn.adsSpread || 1) : 1);
  const hip = p.ads ? 0 : (wpn.hipSpread || 0);
  const vx = p.vel ? p.vel.x : 0, vz = p.vel ? p.vel.z : 0;
  const speed = Math.sqrt(vx * vx + vz * vz);
  const moveFrac = clamp(speed / 8, 0, 1);
  const air = (p.pos.y > 0.35 ? (wpn.airSpread || 0) : 0);
  return base + hip + moveFrac * (wpn.moveSpread || 0) + air;
}

// 射线 vs AABB（slab 方法），返回最近交点距离 t（正数），未命中返回 null
function rayAABB(o, d, min, max) {
  let tmin = 0;
  let tmax = Infinity;

  // X 轴
  if (Math.abs(d.x) < 1e-8) {
    if (o.x < min.x || o.x > max.x) return null;
  } else {
    let t1 = (min.x - o.x) / d.x;
    let t2 = (max.x - o.x) / d.x;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  // Y 轴
  if (Math.abs(d.y) < 1e-8) {
    if (o.y < min.y || o.y > max.y) return null;
  } else {
    let t1 = (min.y - o.y) / d.y;
    let t2 = (max.y - o.y) / d.y;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  // Z 轴
  if (Math.abs(d.z) < 1e-8) {
    if (o.z < min.z || o.z > max.z) return null;
  } else {
    let t1 = (min.z - o.z) / d.z;
    let t2 = (max.z - o.z) / d.z;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

// 射线 vs 球体，返回最近正距离 t 或 null
function raySphere(o, d, cx, cy, cz, r) {
  const ocx = o.x - cx;
  const ocy = o.y - cy;
  const ocz = o.z - cz;
  const b = ocx * d.x + ocy * d.y + ocz * d.z;
  const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0) return null;
  return t;
}

// 射线 vs 竖直有限圆柱（侧面 + 上下两个平端盖），返回最近正向 t 或 null。
// 侧面那一段把问题投影到 xz 平面就退化成「射线 vs 圆」，所以只解一个二次方程；
// 端盖单独求一次平面交点再判是否落在圆内。
// d.y ≈ 0（平射）时端盖分支整个跳过，靠侧面解；
// d.x/d.z ≈ 0（垂直上下打）时侧面分支跳过，靠端盖解。两种退化都不会漏。
function rayCylinderY(o, d, cx, cz, r, y0, y1) {
  let best = null;
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-12) {
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      // 近根先试；近根被 y 区间挡掉或在身后时才看远根（贴身开枪时起点就在柱内）
      const roots = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
      for (let i = 0; i < 2; i++) {
        const t = roots[i];
        if (t <= 1e-6) continue;
        const y = o.y + d.y * t;
        if (y < y0 || y > y1) continue;
        best = t;
        break;
      }
    }
  }
  if (Math.abs(d.y) > 1e-12) {
    for (let i = 0; i < 2; i++) {
      const t = ((i === 0 ? y0 : y1) - o.y) / d.y;
      if (t <= 1e-6) continue;
      const px = o.x + d.x * t - cx, pz = o.z + d.z * t - cz;
      if (px * px + pz * pz > r * r) continue;
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

// 对一个玩家做分部位求交。返回 { t, zone, mult } 或 null。
// 取**最近**命中而不是按部位优先级：手臂挡在胸口前面时就该判成手臂，
// 这也是上面刻意让手臂柱比躯干柱更靠外的原因。
function raycastPlayerZones(o, d, q, maxT) {
  // 广相。raySphere 在「起点已在球内」时返回的是远交点（>0），也算命中，
  // 所以这里不用额外补贴身判定；返回 null 才是真的没交集。
  const bt = raySphere(o, d, q.pos.x, q.pos.y + HIT_BROAD_Y, q.pos.z, HIT_BROAD_R);
  if (bt === null || bt >= maxT) return null;

  // 体侧方向 = 朝向在水平面内左转 90°。左右对称，所以正负无所谓，只要垂直于朝向。
  const fwd = forwardFromYawPitch(q.yaw || 0, 0);
  const fh = Math.hypot(fwd.x, fwd.z) || 1;
  const sx = -fwd.z / fh, sz = fwd.x / fh;

  let best = null;
  for (let i = 0; i < HIT_ZONES.length; i++) {
    const z = HIT_ZONES[i];
    let t;
    if (z.kind === 'sphere') {
      t = raySphere(o, d, q.pos.x, q.pos.y + z.y, q.pos.z, z.r);
    } else {
      const cx = q.pos.x + sx * (z.ox || 0);
      const cz = q.pos.z + sz * (z.ox || 0);
      t = rayCylinderY(o, d, cx, cz, z.r, q.pos.y + z.y0, q.pos.y + z.y1);
    }
    if (t === null || t >= maxT) continue;
    if (best === null || t < best.t) best = { t, zone: z.zone, mult: z.mult };
  }
  return best;
}

// 投掷物一个定步长：重力 → 位移 → 与地面/围墙/掩体求交并反弹。
// 全程无随机数，两端跑出来的轨迹必须完全一样。
// pos / vel 原地修改。
function stepThrown(pos, vel, dt) {
  vel.y -= THROW_GRAVITY * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;

  const R = THROW_RADIUS;

  // 地面
  if (pos.y < R) {
    pos.y = R;
    if (vel.y < 0) vel.y = -vel.y * THROW_RESTITUTION;
    vel.x *= THROW_FRICTION;
    vel.z *= THROW_FRICTION;
    if (Math.abs(vel.y) < 0.5) vel.y = 0;
  }

  // 围墙
  const lim = ARENA_HALF - R;
  if (pos.x > lim) { pos.x = lim; vel.x = -vel.x * THROW_RESTITUTION; }
  else if (pos.x < -lim) { pos.x = -lim; vel.x = -vel.x * THROW_RESTITUTION; }
  if (pos.z > lim) { pos.z = lim; vel.z = -vel.z * THROW_RESTITUTION; }
  else if (pos.z < -lim) { pos.z = -lim; vel.z = -vel.z * THROW_RESTITUTION; }

  // 掩体：把 AABB 按半径外扩，若球心落在里面就沿「最浅的那一个轴」推出并反弹。
  // 选最浅轴是关键——按贯穿深度最小的面推出，才不会把贴着侧面滑落的手雷弹到箱顶。
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    const minX = b.x - b.w / 2 - R, maxX = b.x + b.w / 2 + R;
    const minZ = b.z - b.d / 2 - R, maxZ = b.z + b.d / 2 + R;
    const maxY = b.h + R;
    if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ || pos.y > maxY || pos.y < -R) continue;

    const dxl = pos.x - minX, dxr = maxX - pos.x;
    const dzl = pos.z - minZ, dzr = maxZ - pos.z;
    const dyt = maxY - pos.y;
    let best = dxl, axis = 0;
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

// 从出手状态积分 fuse 毫秒，返回落点。步长固定为 THROW_STEP，
// 余下不足一步的时间单独走一小步——不然 fuse 改成非整数倍时两端会差半步。
function simulateThrown(origin, vel, fuseMs) {
  const pos = { x: origin.x, y: origin.y, z: origin.z };
  const v = { x: vel.x, y: vel.y, z: vel.z };
  let t = fuseMs / 1000;
  while (t > 1e-6) {
    const dt = t > THROW_STEP ? THROW_STEP : t;
    stepThrown(pos, v, dt);
    t -= dt;
  }
  return pos;
}

// ---------------------------------------------------------------
// WebSocket 实现（仅服务端，帧不掩码）
// ---------------------------------------------------------------
class WS {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', (data) => this._onData(data));
    socket.on('close', () => { if (this.onclose) this.onclose(); });
    socket.on('error', () => { try { socket.destroy(); } catch (e) {} });
  }

  _onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    this._parse();
  }

  _parse() {
    while (true) {
      if (this.buffer.length < 2) return;
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;

      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > 1024 * 1024) { this.close(); return; }
        len = Number(big);
        off = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (this.buffer.length < off + maskLen + len) return;

      let payload = Buffer.from(this.buffer.slice(off + maskLen, off + maskLen + len));
      if (masked) {
        const mask = this.buffer.slice(off, off + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }

      this.buffer = this.buffer.slice(off + maskLen + len);

      if (opcode === 8) { this.close(); return; }        // close
      if (opcode === 9) { this.sendFrame(payload, 10); continue; } // ping -> pong
      if (opcode === 10) { continue; }                    // pong
      if (fin && (opcode === 1 || opcode === 2)) {
        const text = payload.toString('utf8');
        if (this.onmessage) this.onmessage(text);
      }
    }
  }

  sendJson(obj) {
    try {
      const json = JSON.stringify(obj);
      this.sendFrame(Buffer.from(json, 'utf8'), 1);
    } catch (e) { /* socket closed */ }
  }

  sendFrame(payload, opcode) {
    try {
      let header;
      if (payload.length < 126) {
        header = Buffer.from([0x80 | opcode, payload.length]);
      } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) { /* socket closed */ }
  }

  close() {
    try { this.socket.end(); } catch (e) {}
  }
}

// ---------------------------------------------------------------
// 游戏逻辑
// ---------------------------------------------------------------
class Game {
  constructor() {
    this.players = new Map(); // id -> player
      this.explosions = [];
      this.smokes = [];
    this.nextId = 1;
    this.timer = setInterval(() => this.tick(), TICK_RATE);
  }

  addClient(ws) {
    ws.onmessage = (text) => this.onMessage(ws, text);
    ws.onclose = () => this.removeClient(ws);
    const p = {
      id: this.nextId++,
      ws,
      name: '',          // 昵称必须客户端 join 时自己带上来，服务端不发默认名
      joined: false,
      alive: false,
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      melee: 'knife',
      primary: 'rifle',
        secondary: 'pistol',
        ranged: 'rifle',
      current: 'primary',
      kills: 0,
      deaths: 0,
      ammo: WEAPONS.rifle.mag,
        ammoPrimary: WEAPONS.rifle.mag,
        ammoSecondary: WEAPONS.pistol.mag,
      lastFire: 0,
      lastMelee: 0,
      comboStage: 0,     // 近战连段：这一刀播到第几段（见 meleeAttack）
        lastSmoke: 0,
        lastGrenade: 0,
        lastDamageTime: 0,
      triggerDown: false,
      bloom: 0,
      ads: false,
      reloading: false,
      reloadEnd: 0,
      respawnAt: 0,
    };
    this.players.set(p.id, p);
    this.send(p, { t: 'welcome', id: p.id });
  }

  removeClient(ws) {
    let removed = null;
    for (const p of this.players.values()) {
      if (p.ws === ws) { removed = p; break; }
    }
    if (!removed) return;
    this.players.delete(removed.id);
    this.broadcast({ t: 'leave', id: removed.id });
  }

  findPlayer(ws) {
    for (const p of this.players.values()) {
      if (p.ws === ws) return p;
    }
    return null;
  }

  send(p, obj) {
    if (p && p.ws) p.ws.sendJson(obj);
  }

  broadcast(obj) {
    for (const p of this.players.values()) {
      if (p.joined) this.send(p, obj);
    }
  }

  onMessage(ws, text) {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const p = this.findPlayer(ws);
    if (!p) return;

    switch (msg.t) {
      case 'join':
        this.handleJoin(p, msg);
        break;
      case 'state':
        this.handleState(p, msg);
        break;
      case 'attack':
        this.handleAttack(p, msg);
        break;
      case 'switch':
        this.handleSwitch(p, msg);
        break;
      case 'reload':
        this.handleReload(p);
        break;
        case 'smoke':
          this.handleSmoke(p, msg);
          break;
        case 'grenade':
          this.handleGrenade(p, msg);
          break;
      default:
        break;
    }
  }

  handleJoin(p, msg) {
    // 昵称必填。原来这里是 `|| ('玩家' + p.id)`，客户端不填服务端就替他编一个，
    // 于是「必须手动输入昵称」在服务端这一层是假的。现在直接打回去，
    // p.joined 保持 false，这个连接不会进入对局广播。
    const name = String(msg.name == null ? '' : msg.name).replace(/[\s　]+/g, ' ').trim().slice(0, 16);
    if (!name) {
      this.send(p, { t: 'joinDenied', reason: '请先输入昵称' });
      return;
    }
    p.name = name;
    p.melee = (WEAPONS[msg.melee] && WEAPONS[msg.melee].type === 'melee') ? msg.melee : 'knife';
    p.primary = (WEAPONS[msg.primary] && WEAPONS[msg.primary].type === 'ranged' && msg.primary !== 'pistol') ? msg.primary : 'rifle';
      p.secondary = 'pistol';
    p.current = 'primary';
      p.ranged = p.primary;
    p.joined = true;
    p.kills = 0;
    p.deaths = 0;
    p.hp = p.maxHp;
    p.alive = true;
    p.ammo = WEAPONS[p.ranged].mag;
      p.ammoPrimary = WEAPONS[p.primary].mag;
      p.ammoSecondary = WEAPONS.pistol.mag;
    p.reloading = false;
    p.triggerDown = false;
    this.spawn(p);
    this.send(p, {
        t: 'joined',
        id: p.id,
        pos: p.pos,
        yaw: p.yaw,
        hp: p.hp,
        ammo: p.ammo,
        melee: p.melee,
          primary: p.primary,
          secondary: p.secondary,
          ammoPrimary: p.ammoPrimary,
          ammoSecondary: p.ammoSecondary,
        ranged: p.ranged,
      });
    this.broadcast({ t: 'join', id: p.id, name: p.name });
  }

  spawn(p) {
    let best = null;
    for (const s of SPAWNS) {
      let ok = true;
      for (const q of this.players.values()) {
        if (q === p || !q.joined || !q.alive) continue;
        if (dist2D(s.x, s.z, q.pos.x, q.pos.z) < 8) { ok = false; break; }
      }
      if (ok) { best = s; break; }
    }
    if (!best) best = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    p.pos = { x: best.x, y: 0, z: best.z };
    p.vel = { x: 0, y: 0, z: 0 };
    p.yaw = Math.atan2(best.x, best.z); // 面向场地中心
    p.pitch = 0;
    p.hp = p.maxHp;
    p.alive = true;
      p.lastDamageTime = 0;
      p.current = 'primary';
      p.ranged = p.primary;
      p.ammoPrimary = WEAPONS[p.primary].mag;
      p.ammoSecondary = WEAPONS.pistol.mag;
    p.ammo = WEAPONS[p.ranged].mag;
    p.reloading = false;
    p.triggerDown = false;
    p.bloom = 0;
    p.comboStage = 0;          // 重生后连段归零，不要接着上一条命的段号
    p.lastMelee = 0;
  }

  handleState(p, msg) {
    if (!p.joined || !p.alive) return;
    if (msg.pos && typeof msg.pos.x === 'number' && typeof msg.pos.y === 'number' && typeof msg.pos.z === 'number') {
      p.pos.x = clamp(msg.pos.x, -ARENA_HALF, ARENA_HALF);
      p.pos.y = clamp(msg.pos.y, 0, 20);
      p.pos.z = clamp(msg.pos.z, -ARENA_HALF, ARENA_HALF);
    }
    if (msg.vel && typeof msg.vel.x === 'number' && typeof msg.vel.y === 'number' && typeof msg.vel.z === 'number') {
      p.vel = msg.vel;
    }
    if (typeof msg.yaw === 'number') p.yaw = msg.yaw;
    if (typeof msg.pitch === 'number') p.pitch = clamp(msg.pitch, -1.55, 1.55);
    if (typeof msg.ads === 'boolean') p.ads = msg.ads;
  }

  handleAttack(p, msg) {
    if (!p.joined || !p.alive) return;
    const down = !!msg.down;
    const yaw = (typeof msg.yaw === 'number') ? msg.yaw : p.yaw;
    const pitch = (typeof msg.pitch === 'number') ? clamp(msg.pitch, -1.55, 1.55) : p.pitch;
    // 开镜状态随攻击包一起来，免得 30Hz 的 state 包晚到一帧、单发开镜射击被当成腰射
    if (typeof msg.ads === 'boolean') p.ads = msg.ads;

    if (p.current === 'melee') {
      if (down) this.meleeAttack(p, yaw, pitch);
      return;
    }

    // 远程武器
    const wpn = WEAPONS[p.ranged];
    p.triggerDown = down;
    if (down && !wpn.auto) this.tryFire(p, yaw, pitch);
  }

  handleSwitch(p, msg) {
    if (!p.joined) return;
    if (msg.slot === 'melee') { p.current = 'melee'; }
    else if (msg.slot === 'secondary') { p.current = 'secondary'; p.ranged = 'pistol'; p.ammo = p.ammoSecondary; }
      else if (msg.slot === 'primary') { p.current = 'primary'; p.ranged = p.primary; p.ammo = p.ammoPrimary; }
    p.triggerDown = false;
      p.reloading = false;
      p.bloom = 0;             // 换枪清零累积散射（每把枪的 bloomMax 不同，不能沿用）
      p.comboStage = 0;        // 收刀就断连段，回来重新从第一段起手
      p.lastMelee = 0;
  }

  handleReload(p) {
    if (!p.joined || !p.alive) return;
    if (p.current === 'melee') return;
    const wpn = WEAPONS[p.ranged];
    if (p.reloading || p.ammo >= wpn.mag) return;
    p.reloading = true;
    p.bloom = 0;               // 换弹期间枪口稳定下来
    p.reloadEnd = Date.now() + wpn.reloadTime * 1000;
    this.broadcast({ t: 'reload', id: p.id });
  }

    // 计算投掷物的出手点与出手速度。客户端只报朝向，弹道由两端各自积分，
    // 所以这里必须完全按 msg.yaw/msg.pitch 算，不能掺入服务端独有的量。
    throwState(p, msg) {
      const yaw = (typeof msg.yaw === 'number') ? msg.yaw : p.yaw;
      const pitch = clamp((typeof msg.pitch === 'number') ? msg.pitch : p.pitch, -1.55, 1.55);
      const dir = normalize(forwardFromYawPitch(yaw, pitch + THROW_UP));
      const flat = normalize(forwardFromYawPitch(yaw, 0));
      const origin = {
        x: p.pos.x + flat.x * 0.42,
        y: clamp(p.pos.y + PLAYER_EYE - 0.12, 0.3, 20),
        z: p.pos.z + flat.z * 0.42,
      };
      // 继承一半的水平移动速度：跑动中前抛才会比站着扔得远
      const vel = {
        x: dir.x * THROW_SPEED + (p.vel ? p.vel.x : 0) * 0.5,
        y: dir.y * THROW_SPEED,
        z: dir.z * THROW_SPEED + (p.vel ? p.vel.z : 0) * 0.5,
      };
      return { origin, vel };
    }

    handleSmoke(p, msg) {
      if (!p.joined || !p.alive) return;
      const now = Date.now();
      if (now - p.lastSmoke < 3000) return;
      p.lastSmoke = now;
      const st = this.throwState(p, msg);
      const land = simulateThrown(st.origin, st.vel, SMOKE_FUSE);
      this.smokes.push({ at: now + SMOKE_FUSE, pos: land, owner: p.id });
      this.broadcast({ t: 'throw', kind: 'smoke', id: p.id, origin: st.origin, vel: st.vel, fuse: SMOKE_FUSE });
    }

    handleGrenade(p, msg) {
      if (!p.joined || !p.alive) return;
      const now = Date.now();
      if (now - p.lastGrenade < 3000) return;
      p.lastGrenade = now;
      const st = this.throwState(p, msg);
      const land = simulateThrown(st.origin, st.vel, GRENADE_FUSE);
      this.explosions.push({ at: now + GRENADE_FUSE, pos: land, owner: p.id });
      this.broadcast({ t: 'throw', kind: 'grenade', id: p.id, origin: st.origin, vel: st.vel, fuse: GRENADE_FUSE });
    }

  tick() {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (!p.joined) continue;

      // 自动武器持续开火
      if (p.alive && p.current !== 'melee' && p.triggerDown) {
        const wpn = WEAPONS[p.ranged];
        if (wpn.auto) this.tryFire(p, p.yaw, p.pitch);
      }

      // 换弹完成
      if (p.reloading && now >= p.reloadEnd) {
        p.reloading = false;
        p.ammo = WEAPONS[p.ranged].mag;
          if (p.current === 'secondary') { p.ammoSecondary = p.ammo; } else { p.ammoPrimary = p.ammo; }
      }

        // 脱离战斗 5 秒后每秒回血 10 点
        if (p.alive && p.hp < p.maxHp && now - p.lastDamageTime >= 5000) {
          p.hp = Math.min(p.maxHp, p.hp + 10 * TICK_RATE / 1000);
        }

      // 死亡复活
      if (!p.alive && now >= p.respawnAt) {
        this.spawn(p);
        // 复活信息统一通过 broadcast 发送（包含 yaw）
        this.broadcast({ t: 'respawn', id: p.id, pos: p.pos, yaw: p.yaw });
      }
    }

      // 烟雾弹落地起效
      for (let i = this.smokes.length - 1; i >= 0; i--) {
        const sm = this.smokes[i];
        if (now < sm.at) continue;
        this.smokes.splice(i, 1);
        this.broadcast({ t: 'smoke', id: sm.owner, pos: sm.pos });
      }

      // 处理手雷爆炸
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const ex = this.explosions[i];
        if (now < ex.at) continue;
        this.explosions.splice(i, 1);
        this.broadcast({ t: 'explosion', pos: ex.pos });
        const owner = this.players.get(ex.owner);
        for (const q of this.players.values()) {
          if (!q.joined || !q.alive) continue;
          // 手雷现在真的会落在地面/箱顶上，所以用三维距离；只算平面距离的话
          // 扔到二层箱顶的雷会把楼下的人一起炸掉。
          const dx = q.pos.x - ex.pos.x;
          const dy = (q.pos.y + PLAYER_CENTER_Y) - ex.pos.y;
          const dz = q.pos.z - ex.pos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 8) continue;
          // 伤害从中心 100 线性衰减到 8m 处的 12
          let dmg = 100 - (dist / 8) * 88;
          // 掩体遮挡减半（不完全免疫——破片会绕）
          const seg = Math.max(dist, 0.001);
          const d = { x: dx / seg, y: dy / seg, z: dz / seg };
          for (const box of BOXES) {
            const min = { x: box.x - box.w / 2, y: 0, z: box.z - box.d / 2 };
            const max = { x: box.x + box.w / 2, y: box.h, z: box.z + box.d / 2 };
            const t = rayAABB(ex.pos, d, min, max);
            if (t !== null && t < seg - 0.3) { dmg *= 0.45; break; }
          }
          dmg = Math.round(dmg);
          if (dmg > 0) this.damage(q, owner, { id: 'grenade', name: '手雷' }, dmg);
        }
      }

    this.broadcastSnapshot();
  }

  broadcastSnapshot() {
    const players = [];
    for (const p of this.players.values()) {
      if (!p.joined) continue;
      players.push({
        id: p.id,
        name: p.name,
        pos: p.pos,
        vel: p.vel,
        yaw: p.yaw,
        pitch: p.pitch,
        hp: Math.round(p.hp),
        alive: p.alive,
        current: p.current,
        melee: p.melee,
          primary: p.primary,
          secondary: p.secondary,
          ammoPrimary: p.ammoPrimary,
          ammoSecondary: p.ammoSecondary,
        ranged: p.ranged,
        kills: p.kills,
        deaths: p.deaths,
        ammo: p.ammo,
        reloading: p.reloading,
      });
    }
    this.broadcast({ t: 'snapshot', players });
  }

  // 累积散射按「距上一发的时间」线性回落。用时间差而不是每 tick 扣一点，
  // 是为了让不开火的玩家也能正确恢复——tick 里并不会为每个人调用这里。
  decayBloom(p, now) {
    if (!p.bloom) { p.bloom = 0; return; }
    const wpn = WEAPONS[p.ranged];
    const dt = Math.max(0, (now - (p.lastFire || 0)) / 1000);
    p.bloom = Math.max(0, p.bloom - dt * (wpn.bloomDecay || 0.05));
  }

  tryFire(p, yaw, pitch) {
    const now = Date.now();
    const wpn = WEAPONS[p.ranged];
    if (p.reloading) return;
    if (now - p.lastFire < wpn.cooldown) return;
    if (p.ammo <= 0) {
      // 自动触发换弹
      if (p.current !== 'melee' && !p.reloading) this.handleReload(p);
      return;
    }

    p.ammo--;
      if (p.current === 'secondary') { p.ammoSecondary = p.ammo; } else { p.ammoPrimary = p.ammo; }

    // 先按「上一发到现在」的间隔回落累积散射，再算这一发的散射，最后才累加本发的 bloom。
    // 顺序很重要：先累加会让第一发就带上 bloom。
    this.decayBloom(p, now);
    p.lastFire = now;
    const spread = effectiveSpread(p, wpn);
    p.bloom = Math.min((p.bloom || 0) + (wpn.bloom || 0), wpn.bloomMax || 0);

    const origin = { x: p.pos.x, y: p.pos.y + PLAYER_EYE, z: p.pos.z };
    const baseDir = normalize(forwardFromYawPitch(yaw, pitch));
    const tracers = [];
    const hitPlayers = [];

    for (let i = 0; i < wpn.pellets; i++) {
      const d = spreadDir(baseDir, spread);

      let bestT = wpn.range;
      let hitPlayer = null;
      let hitZone = null;
      let hitMult = 1;

      // 掩体
      for (const box of BOXES) {
        const min = { x: box.x - box.w / 2, y: 0, z: box.z - box.d / 2 };
        const max = { x: box.x + box.w / 2, y: box.h, z: box.z + box.d / 2 };
        const t = rayAABB(origin, d, min, max);
        if (t !== null && t < bestT) {
          bestT = t;
          hitPlayer = null;
          hitZone = null;
        }
      }

      // 玩家（分部位）
      for (const q of this.players.values()) {
        if (q === p || !q.joined || !q.alive) continue;
        const h = raycastPlayerZones(origin, d, q, bestT);
        if (h) {
          bestT = h.t;
          hitPlayer = q.id;
          hitZone = h.zone;
          hitMult = h.mult;
        }
      }

      tracers.push({
        end: {
          x: origin.x + d.x * bestT,
          y: origin.y + d.y * bestT,
          z: origin.z + d.z * bestT,
        },
        hitPlayer,
        hitZone,
      });

      if (hitPlayer !== null) {
        const victim = this.players.get(hitPlayer);
        if (victim) {
          if (!hitPlayers.includes(hitPlayer)) hitPlayers.push(hitPlayer);
          // 倍率四舍五入到整数伤害：霰弹枪 8 颗弹丸各算一次，
          // 留小数会让同一次开火的总伤害随命中分布出现看不懂的零点几差。
          this.damage(victim, p, wpn, Math.max(1, Math.round(wpn.damage * hitMult)), hitZone);
        }
      }
    }

    this.broadcast({
      t: 'fire',
      id: p.id,
      weaponId: wpn.id,
      origin,
      tracers,
      hitPlayers,
    });
  }

  meleeAttack(p, yaw, pitch) {
    const now = Date.now();
    const wpn = WEAPONS[p.melee];
    const combo = MELEE_COMBO[p.melee] || MELEE_COMBO.knife;

    // 这一刀是第几段：窗口内接续，超时从头。规则和客户端 localMelee 逐字一致。
    // 冷却按**上一段**的 cd 倍率算——收尾重砍之后要等更久才能再起手。
    let stage = 0;
    if (p.lastMelee && now - p.lastMelee <= MELEE_COMBO_WINDOW) {
      stage = (p.comboStage + 1) % combo.length;
    }
    const prev = combo[p.comboStage] || combo[0];
    if (now - p.lastMelee < wpn.cooldown * prev.cd) return;
    p.lastMelee = now;
    p.comboStage = stage;

    const step = combo[stage];
    const range = wpn.range * (step.rngK || 1);
    // arcDot 是命中所需的最小 dot：arcK > 1 收窄扇区，< 1 放宽。
    const arcDot = clamp(wpn.arcDot * (step.arcK || 1), -1, 1);
    const amount = wpn.damage * (step.dmg || 1);

    const dir = normalize(forwardFromYawPitch(yaw, pitch));
    // 近战扇区是**水平**的，所以要用 dir 的水平投影再归一化。
    // 原来直接拿 3D 的 dir 去点乘一个水平方向，等于把 dot 白乘了一个
    // cos(pitch)：pitch -1.2 时 cos=0.362，比最宽的匕首 arcDot(0.45) 还小，
    // 于是稍微低头就完全打不中人——贴着脸也不行。俯仰方向的容差由下面的
    // |dy| <= 2.5 负责，不该再混进扇区判定里。
    // 这也和客户端画出来的一致：MELEE_PITCH_K/MAX 把刀压在近水平（最多 18°），
    // 扇区跟着水平才不会「看着砍在身上、判定说没中」。
    const fh = Math.hypot(dir.x, dir.z);
    const fx = fh > 1e-6 ? dir.x / fh : 0;
    const fz = fh > 1e-6 ? dir.z / fh : 0;
    const hitPlayers = [];

    for (const q of this.players.values()) {
      if (q === p || !q.joined || !q.alive) continue;
      const dx = q.pos.x - p.pos.x;
      const dz = q.pos.z - p.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > range + PLAYER_RADIUS) continue;
      if (Math.abs(q.pos.y - p.pos.y) > 2.5) continue;

      // 目标必须在挥砍扇区内
      const dot = dist > 0.001 ? (dx / dist) * fx + (dz / dist) * fz : 1;
      if (dot < arcDot) continue;

      // 有掩体阻挡则近战无法命中。这条射线也必须是水平的：下面比的是
      // t < dist，而 dist 是**水平**距离，拿带俯仰的 3D 方向去比就是两套
      // 尺度混用（俯角一大，射线主要往下跑，t 早早就超过水平距离）。
      // rayAABB 对 d.y=0 有专门分支，退化成「眼睛高度是否落在箱子的竖直区间内」。
      const origin = { x: p.pos.x, y: p.pos.y + PLAYER_EYE, z: p.pos.z };
      const rayDir = { x: fx, y: 0, z: fz };
      let blocked = false;
      for (const box of BOXES) {
        const min = { x: box.x - box.w / 2, y: 0, z: box.z - box.d / 2 };
        const max = { x: box.x + box.w / 2, y: box.h, z: box.z + box.d / 2 };
        const t = rayAABB(origin, rayDir, min, max);
        if (t !== null && t < dist) { blocked = true; break; }
      }
      if (blocked) continue;

      hitPlayers.push(q.id);
      this.damage(q, p, wpn, amount);
    }

    this.broadcast({
      t: 'melee',
      id: p.id,
      weaponId: wpn.id,
      stage,
      hitPlayers,
    });
  }

  // zone 是命中部位（'head'/'torso'/'arm'/'leg'），只用于击杀提示；
  // 倍率已经在调用方乘进 amount 里了，这里不再乘第二遍。
  // 近战和手雷不传 zone：近战是水平扇区判定、手雷是球形范围衰减，
  // 两者都没有「命中点」这个概念，硬凑一个部位出来只会是假的。
  damage(victim, attacker, wpn, amount, zone) {
    if (!victim.alive) return;
      victim.lastDamageTime = Date.now();
    victim.hp -= amount;
    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.alive = false;
      victim.triggerDown = false;
      victim.deaths++;
      if (attacker && attacker.id !== victim.id) attacker.kills++;
      victim.respawnAt = Date.now() + RESPAWN_TIME;
      this.broadcast({
        t: 'kill',
        killerId: attacker ? attacker.id : null,
        killerName: attacker ? attacker.name : '',
        victimId: victim.id,
        victimName: victim.name,
        weaponId: wpn.id,
        zone: zone || null,
        zoneLabel: zone ? (ZONE_LABEL[zone] || null) : null,
      });
    }
  }
}

// 创建游戏实例（内部会启动 30Hz 游戏循环）
const game = new Game();

// ---------------------------------------------------------------
// HTTP 静态文件服务 + WebSocket 升级
// ---------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  socket.setNoDelay(true);
  const ws = new WS(socket);
  game.addClient(ws);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('===========================================');
  console.log('  3D 射击游戏服务器已启动');
  console.log('  本机访问: http://localhost:' + PORT);
  console.log('  局域网访问：');
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    for (const info of ifaces[name]) {
      if (info.family === 'IPv4' && !info.internal) {
        console.log('    http://' + info.address + ':' + PORT);
      }
    }
  });
  console.log('===========================================');
});
