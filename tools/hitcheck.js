// 靶子命中逻辑端到端自检。
//
// 为什么不 require('../server.js')：那个文件在末尾直接 listen()，引进来会起一个真服务器。
// 所以这里把需要的常量和函数从**源码文本里抽出来**再 eval——测的是线上那一份代码，
// 不是复制品。上一次"重击不掉血"的 bug 正是因为两份判定各自演化，所以这里刻意不抄。
//
// 跑法：node tools/hitcheck.js
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// 从源码里切出一段：从 marker 那一行开始，按括号配平找到结尾。
// 数组用 []、函数用 {}，所以括号类型要按 marker 自己判断——一开始只认大括号，
// 结果 const X = [ 在第一个对象的 } 处就截断了。
function grab(marker) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('源码里找不到: ' + marker);
  const arr = marker.trim().endsWith('[');
  const open = arr ? '[' : '{', close = arr ? ']' : '}';
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === open) { depth++; started = true; }
    else if (c === close) {
      depth--;
      // 数组要连上结尾的分号，否则 eval 时两条声明会粘在一起
      if (started && depth === 0) return src.slice(i, j + 1) + (arr ? ';' : '');
    }
  }
  throw new Error('括号没配平: ' + marker);
}

const parts = [
  grab('const HIT_ZONES = ['),
  grab('const DUMMY_ZONES = ['),
  grab('function raySphere('),
  grab('function rayCylinderY('),
  grab('function forwardFromYawPitch('),
  grab('function raycastPlayerZones('),
];
// 这几个是标量常量，正则取值即可
function scalar(name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([-\\d.]+)'));
  if (!m) throw new Error('找不到常量: ' + name);
  return Number(m[1]);
}
const HIT_BROAD_Y = scalar('HIT_BROAD_Y'), HIT_BROAD_R = scalar('HIT_BROAD_R');
const DUMMY_BROAD_Y = scalar('DUMMY_BROAD_Y'), DUMMY_BROAD_R = scalar('DUMMY_BROAD_R');
const CROUCH_DROP = scalar('CROUCH_DROP');

const ctx = {};
new Function('ctx', 'HIT_BROAD_Y', 'HIT_BROAD_R', 'DUMMY_BROAD_Y', 'DUMMY_BROAD_R', 'CROUCH_DROP',
  parts.join('\n') +
  '\nctx.raycastPlayerZones = raycastPlayerZones;' +
  '\nctx.HIT_ZONES = HIT_ZONES; ctx.DUMMY_ZONES = DUMMY_ZONES;'
)(ctx, HIT_BROAD_Y, HIT_BROAD_R, DUMMY_BROAD_Y, DUMMY_BROAD_R, CROUCH_DROP);

const cast = ctx.raycastPlayerZones;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + msg + (extra ? '   ' + extra : ''));
}

// 平行平射：从 (x, y, -6) 沿 +z 打。
//
// ⚠ 刻意用平行射线，不用"瞄准原点"的收敛射线。第一版就是收敛的，结果腿和脚
// 全部判成未命中——因为这个模型两腿之间有约 0.34m 的空洞，收敛射线正好从
// 空洞里穿过去；手臂也因为收敛而先撞上躯干。那不是判定的问题，是测试的问题。
// 平行射线才能真正"按 x 偏移逐条探"。
function shoot(q, y, x) {
  return cast({ x: x, y: y, z: -6 }, { x: 0, y: 0, z: 1 }, q, 100);
}

// yaw=0 时 forwardFromYawPitch 给 (0,0,-1)，即**正面朝 -z**——正对着 z=-6 的射手。
// 此时 sx = -fwd.z = 1，于是 zone.ox 和世界 x 是 1:1 的（换成别的 yaw 会有符号翻转，
// 探针就得跟着换算，很容易把自己绕进去）。
const dummy = { isDummy: true, pos: { x: 0, y: 0, z: 0 }, yaw: 0, crouch: false };
const player = { isDummy: false, pos: { x: 0, y: 0, z: 0 }, yaw: 0, crouch: false };

console.log('=== 1. 表分流：靶子和玩家必须走不同的表 ===');
ok(ctx.DUMMY_ZONES !== ctx.HIT_ZONES, '两张表是不同对象');
ok(ctx.DUMMY_ZONES.length === 10, '靶子表 10 个部位', '实际 ' + ctx.DUMMY_ZONES.length);
{
  // 同一条射线打在同一高度，两者判定应当不同——否则说明分流没生效
  const a = shoot(dummy, 1.74, 0);
  const b = shoot(player, 1.74, 0);
  ok(a && b, 'y=1.74 两者都命中');
  ok(a && b && Math.abs(a.t - b.t) > 1e-6, '同一射线两者 t 不同（证明用了不同的表）',
    a && b ? 't=' + a.t.toFixed(4) + ' vs ' + b.t.toFixed(4) : '');
}

console.log('=== 2. 靶子各部位都能被打到（沿高度扫一遍）===');
// 每一档：高度、x 偏移、期望部位
const probes = [
  [1.74, 0.00, 'head'],
  [1.80, 0.00, 'head'],
  [1.40, 0.00, 'torso'],
  [1.10, 0.00, 'torso'],
  [0.92, 0.00, 'torso'],   // 髋：靠躯干柱下探到 0.86 兜住
  // 手臂：y 要取在躯干柱顶(1.45)之上，或 x 取在躯干柱半径(0.30)之外。
  // 否则最近命中是躯干——手臂柱大部分被躯干柱遮住了（见文末说明）。
  [1.52, -0.15, 'arm'],
  [1.52, 0.15, 'arm'],
  [1.40, -0.33, 'arm'],
  [1.40, 0.33, 'arm'],
  [0.70, -0.20, 'leg'],    // 大腿
  [0.70, 0.11, 'leg'],
  [0.30, -0.23, 'leg'],    // 小腿
  [0.30, 0.26, 'leg'],
  [0.08, -0.21, 'leg'],    // 脚
  [0.08, 0.29, 'leg'],
];
for (const [y, x, want] of probes) {
  const r = shoot(dummy, y, x);
  ok(r && r.zone === want, 'y=' + y.toFixed(2) + ' x=' + x.toFixed(2) + ' → ' + want,
    r ? '实际 ' + r.zone : '未命中');
}

console.log('=== 3. 广相不能把有效命中挡掉 ===');
{
  // 最外侧的部位：右脚 ox=0.29 r=0.11 → 离轴 0.40；广相 r=1.07 应当包住
  ok(!!shoot(dummy, 0.08, 0.29), '最外侧的脚仍在广相球内');
  ok(!!shoot(dummy, 1.40, 0.33), '最外侧的手臂仍在广相球内');
  // 全高度扫描：广相通过但细相全空 = 该高度是死区
  let holes = [];
  for (let y = 0.02; y <= 1.88; y += 0.04) {
    let hit = false;
    for (let x = -0.45; x <= 0.45; x += 0.01) {
      if (shoot(dummy, y, x)) { hit = true; break; }
    }
    if (!hit) holes.push(y.toFixed(2));
  }
  ok(holes.length === 0, '0.02~1.88 每一档高度都至少有一条射线能命中',
    holes.length ? '空档: ' + holes.join(',') : '');
}

console.log('=== 4. 头部倍率必须是最高的 ===');
{
  const mults = ctx.DUMMY_ZONES.map(z => z.mult);
  const head = ctx.DUMMY_ZONES.find(z => z.zone === 'head');
  ok(head.mult === Math.max(...mults), '头部倍率最高', 'head=' + head.mult);
  ok(head.mult === 2.35, '头部倍率与玩家一致(2.35)', String(head.mult));
}

console.log('=== 4b. 手臂柱不能被躯干柱完全吞掉 ===');
// 这是拟合出来的表最容易出的问题：手臂 ox=±0.15 r=0.20 覆盖 |x|≤0.36，
// 躯干 r=0.30。两者在 |x|<0.30 完全重叠，取最近命中的话那一段永远判成躯干。
// 手臂真正生效只有两处：|x|>0.30 的外沿，和 y>1.45（躯干柱顶）之上。
// 如果哪天改动让这两处也没了，手臂倍率就成了死代码——所以在这里钉住。
{
  let armHits = 0, total = 0;
  const zoneCount = {};
  for (let y = 1.30; y <= 1.58; y += 0.02) {
    for (let x = -0.40; x <= 0.40; x += 0.01) {
      const r = shoot(dummy, y, x);
      if (!r) continue;
      total++;
      zoneCount[r.zone] = (zoneCount[r.zone] || 0) + 1;
      if (r.zone === 'arm') armHits++;
    }
  }
  const frac = total ? armHits / total : 0;
  ok(frac > 0.15, '肩臂高度带内 arm 判定占比 >15%',
    (frac * 100).toFixed(1) + '%  分布=' + JSON.stringify(zoneCount));
  ok(shoot(dummy, 1.40, 0.33) && shoot(dummy, 1.40, 0.33).zone === 'arm',
    '躯干柱外沿(x=0.33)判 arm');
  ok(shoot(dummy, 1.52, 0.00) && shoot(dummy, 1.52, 0.00).zone === 'arm',
    '躯干柱顶之上(y=1.52)判 arm');
}

console.log('=== 5. 靶子不受 crouch 影响（服务端不给靶子发 crouch，但要防御）===');
{
  const a = shoot(dummy, 1.74, 0);
  const b = shoot({ isDummy: true, pos: { x: 0, y: 0, z: 0 }, yaw: 0, crouch: true }, 1.74, 0);
  ok(a && b && Math.abs(a.t - b.t) < 1e-9, 'crouch=true 对靶子无效果');
  // 反过来玩家必须受影响
  const c = shoot(player, 1.70, 0);
  const e = shoot({ isDummy: false, pos: { x: 0, y: 0, z: 0 }, yaw: 0, crouch: true }, 1.70, 0);
  ok(c && c.zone === 'head', '玩家站姿 y=1.70 命中头', c ? c.zone : '未命中');
  ok(!e || e.zone !== 'head', '玩家蹲下后同一射线不再是头',
    e ? '蹲下判成 ' + e.zone : '蹲下未命中');
}

console.log('=== 6. ox/oz 偏移必须随目标朝向转，而不是固定在世界轴上 ===');
{
  // 目标转 90°（朝 -x）。此时体侧方向变成了世界 z，头部的 oz=0.03 落到世界 x 上。
  // 从 +x 方向打，如果偏移没跟着转，头就会偏出去打不中。
  const side = { isDummy: true, pos: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2, crouch: false };
  const r = cast({ x: 6, y: 1.74, z: 0 }, { x: -1, y: 0, z: 0 }, side, 100);
  ok(r && r.zone === 'head', '目标转 90° 后从侧面打头仍命中', r ? r.zone : '未命中');
  // 转 90° 后两条腿变成前后排列：沿世界 z 偏 0.23 应当仍打得到腿
  const lg = cast({ x: 6, y: 0.30, z: -0.23 }, { x: -1, y: 0, z: 0 }, side, 100);
  ok(lg && lg.zone === 'leg', '转 90° 后腿的偏移落在世界 z 上', lg ? lg.zone : '未命中');
  // 而同一个偏移在**未旋转**时是打不到腿的（那里是两腿之间的空洞）
  const gap = shoot(dummy, 0.30, 0);
  ok(!gap, '未旋转时正中线 y=0.30 是空洞（两腿之间）', gap ? '意外命中 ' + gap.zone : '');
}

console.log('=== 7. 完全打偏必须返回 null ===');
{
  ok(shoot(dummy, 2.60, 0) === null, '从头顶上方 2.60 掠过 → 空');
  ok(shoot(dummy, 1.40, 1.40) === null, '横向偏 1.40m → 空');
  ok(cast({ x: 0, y: 1.4, z: -6 }, { x: 0, y: 0, z: 1 }, dummy, 3) === null,
    'maxT=3 但目标在 6m 外 → 空');
}

console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
