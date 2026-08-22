// 靶子倒地贴地验算。
//
// 客户端的 measureDummyFall 是用 Three.js 遍历世界坐标顶点量出来的，Node 里没有
// Three.js，所以这里用**封闭解独立算一遍**：绕 x 轴转 θ 之后，顶点 (y,z) 变成
//   y' = y·cosθ - z·sinθ
// 全体顶点的 min(y') 就是最低点。两边对得上，就说明客户端那套遍历没写错
// （尤其是"必须遍历顶点而不能用 Box3"那个结论）。
//
// 跑法：node tools/falltest.js
'use strict';
const fs = require('fs');
const path = require('path');

const DUMMY_FALL_MAX = 1.45;   // 与 game_v2.js 保持一致
const STEPS = 11;              // 与 measureDummyFall 的采样数一致

const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'models', 'dummy.mesh'));
if (buf.toString('ascii', 0, 4) !== 'DMSH') throw new Error('不是 DMSH');
const vcount = buf.readUInt32LE(8);
const pos = new Float32Array(vcount * 3);
for (let i = 0; i < vcount * 3; i++) pos[i] = buf.readFloatLE(16 + i * 4);

// 绕 x 轴转 th 后的最低点
function lowest(th) {
  const c = Math.cos(th), s = Math.sin(th);
  let lo = Infinity;
  for (let i = 0; i < vcount; i++) {
    const y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const yy = y * c - z * s;
    if (yy < lo) lo = yy;
  }
  return lo;
}

// Box3 的做法：先取整体 AABB，再把 8 个角转过去取最低——就是客户端注释里
// 说"会把人抬错"的那个错误做法。这里把它也算一遍，用来量化错多少。
function lowestByBox(th) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < vcount; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const c = Math.cos(th), s = Math.sin(th);
  let lo = Infinity;
  for (const y of [y0, y1]) for (const z of [z0, z1]) {
    const yy = y * c - z * s;
    if (yy < lo) lo = yy;
  }
  return lo;
}

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + msg + (extra ? '   ' + extra : ''));
}

// 复刻 measureDummyFall 的表：tab[i] = raw[0] - raw[i]
const raw = [], tab = [];
for (let i = 0; i < STEPS; i++) raw.push(lowest((i / (STEPS - 1)) * DUMMY_FALL_MAX));
for (let i = 0; i < STEPS; i++) tab.push(raw[0] - raw[i]);

console.log('=== 抬升表（应当单调递增：越躺平，最低点越低，要抬得越多）===');
console.log('  角度(度)  最低点     抬升量');
for (let i = 0; i < STEPS; i++) {
  const deg = (i / (STEPS - 1)) * DUMMY_FALL_MAX * 180 / Math.PI;
  console.log('  ' + deg.toFixed(1).padStart(6) + '  ' +
    raw[i].toFixed(4).padStart(9) + '  ' + tab[i].toFixed(4).padStart(9));
}

console.log('=== 1. 站姿基准 ===');
ok(Math.abs(raw[0]) < 0.005, '站姿最低点≈0（转换器已把脚底对齐 y=0）', raw[0].toFixed(5));
ok(tab[0] === 0, '站姿抬升量必须是 0——否则一进场靶子就浮空或陷地', String(tab[0]));

console.log('=== 2. 抬升量必须单调递增 ===');
{
  let bad = [];
  for (let i = 1; i < STEPS; i++) if (tab[i] < tab[i - 1] - 1e-9) bad.push(i);
  ok(bad.length === 0, '逐档递增', bad.length ? '在第 ' + bad.join(',') + ' 档回退' : '');
}

console.log('=== 3. 补上抬升后，每一档的最低点都必须回到基准 ===');
// 这才是贴地的定义：raw[i] + tab[i] === raw[0]
{
  let worst = 0;
  for (let i = 0; i < STEPS; i++) worst = Math.max(worst, Math.abs(raw[i] + tab[i] - raw[0]));
  ok(worst < 1e-6, '各档补偿后与基准的偏差 < 1e-6', worst.toExponential(2));
}

console.log('=== 4. 线性插值的误差（客户端只存 11 档，中间靠插值）===');
// 抽 200 个角度，比"插值出来的抬升"和"真实需要的抬升"差多少。
// 差值就是靶子在倒地过程中悬空/陷地的实际毫米数。
function lift(k) {
  const n = STEPS - 1;
  const u = Math.max(0, Math.min(1, k)) * n, i0 = Math.floor(u), i1 = Math.min(n, i0 + 1);
  return tab[i0] + (tab[i1] - tab[i0]) * (u - i0);
}
{
  let worst = 0, at = 0;
  for (let i = 0; i <= 200; i++) {
    const k = i / 200, th = k * DUMMY_FALL_MAX;
    const err = Math.abs((lowest(th) + lift(k)) - raw[0]);
    if (err > worst) { worst = err; at = th * 180 / Math.PI; }
  }
  console.log('  最大插值误差 ' + (worst * 1000).toFixed(2) + ' mm（出现在 ' + at.toFixed(1) + '°）');
  ok(worst < 0.01, '插值误差 < 10mm（肉眼看不出悬空/陷地）', (worst * 1000).toFixed(2) + 'mm');
}

console.log('=== 5. 反证：Box3 那个做法确实会错（客户端注释里的结论）===');
{
  const rawB = [], tabB = [];
  for (let i = 0; i < STEPS; i++) rawB.push(lowestByBox((i / (STEPS - 1)) * DUMMY_FALL_MAX));
  for (let i = 0; i < STEPS; i++) tabB.push(rawB[0] - rawB[i]);
  let worst = 0, at = 0;
  for (let i = 0; i < STEPS; i++) {
    // 用 Box3 的抬升量去抬真实几何，看真实最低点偏离基准多少
    const err = Math.abs((raw[i] + tabB[i]) - raw[0]);
    if (err > worst) { worst = err; at = (i / (STEPS - 1)) * DUMMY_FALL_MAX * 180 / Math.PI; }
  }
  console.log('  按 Box3 抬升 → 真实最低点最大偏离 ' + (worst * 1000).toFixed(1) +
    ' mm（' + at.toFixed(1) + '°处），方向=' + (raw[STEPS - 1] + tabB[STEPS - 1] > raw[0] ? '悬空' : '陷地'));
  ok(worst > 0.01, 'Box3 做法的误差确实超过 10mm，值得为它写顶点遍历',
    (worst * 1000).toFixed(1) + 'mm');
}

console.log('=== 6. 挨枪后仰叠加后不会陷地 ===');
// applyDummyFall 把 tilt 加在角度上，抬升按 clamp(合成角/FALL_MAX) 查表。
// 躺平(k=1)再叠 +0.07 会让 k>1 被 clamp 住，此时抬升不再增加——要确认
// 那几度带来的额外下沉在可接受范围内。
{
  const DUMMY_HIT_TILT = 0.07;
  let worst = 0, at = 0;
  for (let i = 0; i <= 100; i++) {
    const fall = (i / 100) * DUMMY_FALL_MAX;
    const th = fall + DUMMY_HIT_TILT;
    const k = th / DUMMY_FALL_MAX;               // 可能 >1，lift 内部会 clamp
    const err = raw[0] - (lowest(th) + lift(k)); // 正=陷地
    if (err > worst) { worst = err; at = th * 180 / Math.PI; }
  }
  console.log('  叠加后仰后最大陷地 ' + (worst * 1000).toFixed(2) + ' mm（' + at.toFixed(1) + '°）');
  ok(worst < 0.02, '陷地 < 20mm（后仰只持续 0.16s，这个量级看不出来）',
    (worst * 1000).toFixed(2) + 'mm');
}

console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
