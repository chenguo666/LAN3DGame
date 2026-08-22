'use strict';
// 按 dummy.mesh 的**实际几何**拟合靶子专用命中盒，输出可直接粘进 server.js 的表。
//
// 为什么不能沿用玩家的 HIT_ZONES：12.glb 是张开四肢的姿态，实测肩宽 0.755m、
// 两腿间距约 0.5m（中间 0.34m 宽完全是空的），而玩家命中盒是按收拢直立姿
// 设计的（躯干 r=0.34、腿 ox=±0.13）。硬套的结果是「看得见的腿在判定盒外，
// 判定盒里的空气却能中弹」。
//
// 拟合策略：先按高度切层确定各部位的竖直区间，再在每层内沿 X 做聚类
// 找出左右肢的实际轴心，最后取该轴心的半径分位数（不是最大值——
// 最大值会被个别离群顶点拉大，让盒子虚胖）。
const fs = require('fs');
const path = require('path');

const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'models', 'dummy.mesh'));
if (buf.toString('ascii', 0, 4) !== 'DMSH') throw new Error('不是 DMSH 文件');
const vcount = buf.readUInt32LE(8), icount = buf.readUInt32LE(12);
const pos = new Float32Array(vcount * 3);
for (let i = 0; i < vcount * 3; i++) pos[i] = buf.readFloatLE(16 + i * 4);
const ib = 16 + vcount * 12 * 2;

// 顶点分布不均（减面后腿部顶点比躯干稀），直接用顶点统计会偏向密集区。
// 按三角形面积撒点，让统计权重正比于表面积。
const S = [];
for (let t = 0; t < icount; t += 3) {
  const a = buf.readUInt32LE(ib + t * 4) * 3;
  const b = buf.readUInt32LE(ib + (t + 1) * 4) * 3;
  const c = buf.readUInt32LE(ib + (t + 2) * 4) * 3;
  const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
  const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  const n = Math.max(1, Math.round(area / 0.00015));
  for (let s = 0; s < n; s++) {
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    S.push(pos[a] * w + pos[b] * u + pos[c] * v,
           pos[a + 1] * w + pos[b + 1] * u + pos[c + 1] * v,
           pos[a + 2] * w + pos[b + 2] * u + pos[c + 2] * v);
  }
}
console.log('表面采样点 ' + (S.length / 3) + ' 个（按面积加权）');

function inY(y0, y1) {
  const out = [];
  for (let i = 0; i < S.length; i += 3) {
    if (S[i + 1] >= y0 && S[i + 1] <= y1) out.push(S[i], S[i + 1], S[i + 2]);
  }
  return out;
}
function pct(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort(function (x, y) { return x - y; });
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}

// ---- 1. 高度剖面：找出腿/躯干/头的分界 ----
// 判据：沿 X 的"占据宽度"。腿段窄、躯干+手臂段最宽、头段又窄。
console.log('');
console.log('高度剖面（每 0.05m，X 占据宽度 / Z 厚度 / 采样密度）:');
const prof = [];
for (let b = 0; b < 38; b++) {
  const y0 = b * 0.05, y1 = y0 + 0.05;
  const P = inY(y0, y1);
  if (P.length < 30) { prof.push(null); continue; }
  const xs = [], zs = [];
  for (let i = 0; i < P.length; i += 3) { xs.push(P[i]); zs.push(P[i + 2]); }
  const xw = pct(xs, 0.99) - pct(xs, 0.01);
  const zw = pct(zs, 0.99) - pct(zs, 0.01);
  prof.push({ y0: y0, y1: y1, xw: xw, zw: zw, n: P.length / 3 });
}
for (let b = 0; b < prof.length; b++) {
  const p = prof[b];
  if (!p) continue;
  const bar = '#'.repeat(Math.round(p.xw * 40));
  console.log('  y ' + p.y0.toFixed(2) + ' | X宽 ' + p.xw.toFixed(3) +
    ' Z厚 ' + p.zw.toFixed(3) + ' | ' + String(p.n).padStart(5) + ' |' + bar);
}

// ---- 2. 沿 X 聚类，分出左右肢 ----
// 在给定高度段里，把采样点按 X 分成两簇（1D k-means，k=2，初值取两端）。
// 只有当两簇中心间距明显大于簇内散布时才认定"左右分离"，否则当成单体（躯干）。
function splitLR(P) {
  const xs = [];
  for (let i = 0; i < P.length; i += 3) xs.push(P[i]);
  if (xs.length < 20) return null;
  let cA = pct(xs, 0.05), cB = pct(xs, 0.95);
  for (let it = 0; it < 40; it++) {
    let sA = 0, nA = 0, sB = 0, nB = 0;
    for (const x of xs) {
      if (Math.abs(x - cA) <= Math.abs(x - cB)) { sA += x; nA++; } else { sB += x; nB++; }
    }
    const nAc = nA ? sA / nA : cA, nBc = nB ? sB / nB : cB;
    if (Math.abs(nAc - cA) < 1e-6 && Math.abs(nBc - cB) < 1e-6) { cA = nAc; cB = nBc; break; }
    cA = nAc; cB = nBc;
  }
  let dA = 0, nA = 0, dB = 0, nB = 0;
  for (const x of xs) {
    if (Math.abs(x - cA) <= Math.abs(x - cB)) { dA += (x - cA) * (x - cA); nA++; }
    else { dB += (x - cB) * (x - cB); nB++; }
  }
  const sd = (Math.sqrt(dA / Math.max(1, nA)) + Math.sqrt(dB / Math.max(1, nB))) / 2;
  return { cA: cA, cB: cB, gap: Math.abs(cB - cA), sd: sd, sep: Math.abs(cB - cA) / (sd || 1e-9) };
}

// 给定轴心 (ox, oz) 和高度段，求包住 q 分位表面点所需的半径
function fitR(P, ox, oz, q) {
  const rs = [];
  for (let i = 0; i < P.length; i += 3) rs.push(Math.hypot(P[i] - ox, P[i + 2] - oz));
  return { r: pct(rs, q), rmax: pct(rs, 1), n: rs.length };
}

console.log('');
console.log('部位聚类:');
const segs = [
  ['腿', 0.02, 0.86],
  ['髋/骨盆', 0.86, 1.02],
  ['躯干', 1.02, 1.45],
  ['肩/臂', 1.30, 1.58],
  ['头', 1.58, 1.90],
];
const info = {};
for (const s of segs) {
  const P = inY(s[1], s[2]);
  const lr = splitLR(P);
  const zs = [];
  for (let i = 0; i < P.length; i += 3) zs.push(P[i + 2]);
  const zc = (pct(zs, 0.02) + pct(zs, 0.98)) / 2;
  info[s[0]] = { P: P, lr: lr, zc: zc, y0: s[1], y1: s[2] };
  console.log('  ' + s[0] + ' (y ' + s[1] + '..' + s[2] + '): ' + (P.length / 3) + ' 点, Z 中心 ' + zc.toFixed(3));
  if (lr) {
    console.log('     X 双簇中心 ' + lr.cA.toFixed(3) + ' / ' + lr.cB.toFixed(3) +
      '  间距 ' + lr.gap.toFixed(3) + '  簇内散布 ' + lr.sd.toFixed(3) +
      '  分离度 ' + lr.sep.toFixed(2) + (lr.sep > 2.2 ? '  → 左右分离' : '  → 视为单体'));
  }
}

// ---- 3. 生成命中盒 ----
console.log('');
console.log('=========== 拟合结果 ===========');
const zones = [];

// 头：球。轴心取头段的水平中位，半径取 90 分位（避免被下巴/发梢拉大）。
{
  const P = info['头'].P;
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < P.length; i += 3) { xs.push(P[i]); ys.push(P[i + 1]); zs.push(P[i + 2]); }
  const hx = (pct(xs, 0.02) + pct(xs, 0.98)) / 2;
  const hz = (pct(zs, 0.02) + pct(zs, 0.98)) / 2;
  const yTop = pct(ys, 1), yBot = pct(ys, 0);
  // 球心放在头段竖直中点，半径取能包住 92% 表面点的值
  const cy = (yTop + yBot) / 2;
  const rs = [];
  for (let i = 0; i < P.length; i += 3) rs.push(Math.hypot(P[i] - hx, P[i + 1] - cy, P[i + 2] - hz));
  const r = pct(rs, 0.92);
  console.log('头: 球心 y=' + cy.toFixed(3) + ' oz=' + hz.toFixed(3) + ' r=' + r.toFixed(3) +
    '  (头段 y ' + yBot.toFixed(3) + '..' + yTop.toFixed(3) + ', X 中心 ' + hx.toFixed(3) + ')');
  zones.push({ zone: 'head', mult: 2.35, kind: 'sphere', y: +cy.toFixed(2), oz: +hz.toFixed(2), r: +r.toFixed(2) });
}

// 躯干：竖直圆柱。轴心取躯干段（排除手臂高度）的水平中心。
// 关键——量半径时要避开肩/臂高度，否则半径会被张开的手臂撑到 0.4+；
// 但柱子本身要**下延到 0.86** 接住骨盆：剖面显示 y 0.86~0.98 是髋部，
// 若躯干从 0.98 才起，而腿柱轴心在 ±0.22 外侧，中间那块骨盆就没有任何盒子覆盖，
// 会出现「瞄着胯打却不掉血」。
{
  const P = inY(1.02, 1.30);
  const xs = [], zs = [];
  for (let i = 0; i < P.length; i += 3) { xs.push(P[i]); zs.push(P[i + 2]); }
  const ox = (pct(xs, 0.02) + pct(xs, 0.98)) / 2;
  const oz = (pct(zs, 0.02) + pct(zs, 0.98)) / 2;
  // 半径要同时包住髋部：髋比胸更靠后（Z 中心 0.033 vs -0.023），单独校核一次
  const f = fitR(P, ox, oz, 0.93);
  const fh = fitR(inY(0.86, 1.02), ox, oz, 0.90);
  const r = Math.max(f.r, fh.r);
  console.log('躯干: y 0.86..1.45  轴心 ox=' + ox.toFixed(3) + ' oz=' + oz.toFixed(3) +
    '  r=' + r.toFixed(3) + ' (胸段 ' + f.r.toFixed(3) + ' / 髋段 ' + fh.r.toFixed(3) +
    ', 胸段最大 ' + f.rmax.toFixed(3) + ')');
  zones.push({ zone: 'torso', mult: 1.00, kind: 'cyl', y0: 0.86, y1: 1.45, r: +r.toFixed(2), ox: +ox.toFixed(2), oz: +oz.toFixed(2) });
}

// 手臂：张开的双臂。用肩/臂段的左右簇心当轴，半径取 85 分位。
{
  const seg = info['肩/臂'];
  const lr = seg.lr;
  if (lr && lr.sep > 2.2) {
    for (const c of [lr.cA, lr.cB]) {
      // 只统计靠近该簇的点，免得把另一侧算进半径
      const sub = [];
      for (let i = 0; i < seg.P.length; i += 3) {
        if (Math.abs(seg.P[i] - c) < lr.gap / 2) sub.push(seg.P[i], seg.P[i + 1], seg.P[i + 2]);
      }
      const f = fitR(sub, c, seg.zc, 0.85);
      console.log('手臂: y 1.30..1.58  ox=' + c.toFixed(3) + ' oz=' + seg.zc.toFixed(3) +
        '  r=' + f.r.toFixed(3) + ' (' + f.n + ' 点)');
      zones.push({ zone: 'arm', mult: 0.78, kind: 'cyl', y0: 1.30, y1: 1.58, r: +f.r.toFixed(2), ox: +c.toFixed(2), oz: +seg.zc.toFixed(2) });
    }
  } else {
    console.log('手臂: 未检出左右分离，跳过（并入躯干）');
  }
}

// 腿：左右各**上下两段**。这个模型的腿是外张的斜腿——剖面显示
// y 0.20~0.50 处 X 占据宽度 0.58，到 y 0.65~0.85 收窄到 0.437，
// 即大腿根靠内、脚踝靠外。用单根竖直圆柱套斜腿，要么半径大到糊成一片、
// 要么（按分位数）被压到 0.10 这种套不住小腿的值。
// 拆成大腿段/小腿段，各自独立取轴心，就能贴着斜腿走。
{
  const legSegs = [
    ['小腿', 0.02, 0.52],
    ['大腿', 0.52, 0.90],
  ];
  for (const ls of legSegs) {
    const P = inY(ls[1], ls[2]);
    const lr = splitLR(P);
    const zs = [];
    for (let i = 0; i < P.length; i += 3) zs.push(P[i + 2]);
    const zc = (pct(zs, 0.02) + pct(zs, 0.98)) / 2;
    if (!lr || lr.sep <= 2.2) {
      console.log(ls[0] + ': 未检出左右分离！分离度 ' + (lr ? lr.sep.toFixed(2) : 'n/a'));
      continue;
    }
    for (const c of [lr.cA, lr.cB]) {
      const sub = [];
      for (let i = 0; i < P.length; i += 3) {
        if (Math.abs(P[i] - c) < lr.gap / 2) sub.push(P[i], P[i + 1], P[i + 2]);
      }
      const f = fitR(sub, c, zc, 0.92);
      console.log(ls[0] + ': y ' + ls[1].toFixed(2) + '..' + ls[2].toFixed(2) +
        '  ox=' + c.toFixed(3) + ' oz=' + zc.toFixed(3) +
        '  r=' + f.r.toFixed(3) + ' (' + f.n + ' 点, 最大 ' + f.rmax.toFixed(3) + ')');
      zones.push({ zone: 'leg', mult: 0.80, kind: 'cyl', y0: ls[1], y1: ls[2], r: +f.r.toFixed(2), ox: +c.toFixed(2), oz: +zc.toFixed(2) });
    }
  }
}

// 脚：单独一对。剖面显示 y 0~0.10 的 Z 厚度达 0.29（脚掌前后铺开），
// 而小腿柱半径只有 0.11~0.12，套不住脚掌 —— 实测这一段漏了 43% 表面，
// 是全身最大的死区。脚掌按自己的轴心和半径单独拟合，
// 轴心的 Z 要用脚掌自身的中心（比踝更靠前）。
{
  const P = inY(0.00, 0.16);
  const lr = splitLR(P);
  if (lr && lr.sep > 2.0) {
    for (const c of [lr.cA, lr.cB]) {
      const sub = [], zs = [];
      for (let i = 0; i < P.length; i += 3) {
        if (Math.abs(P[i] - c) < lr.gap / 2) { sub.push(P[i], P[i + 1], P[i + 2]); zs.push(P[i + 2]); }
      }
      const zc = (pct(zs, 0.02) + pct(zs, 0.98)) / 2;
      const f = fitR(sub, c, zc, 0.90);
      console.log('脚: y 0.00..0.16  ox=' + c.toFixed(3) + ' oz=' + zc.toFixed(3) +
        '  r=' + f.r.toFixed(3) + ' (' + f.n + ' 点, 最大 ' + f.rmax.toFixed(3) + ')');
      zones.push({ zone: 'leg', mult: 0.80, kind: 'cyl', y0: 0.00, y1: 0.16, r: +f.r.toFixed(2), ox: +c.toFixed(2), oz: +zc.toFixed(2) });
    }
  } else {
    console.log('脚: 未检出左右分离，分离度 ' + (lr ? lr.sep.toFixed(2) : 'n/a'));
  }
}

// ---- 4. 广相球 ----
{
  let ymn = Infinity, ymx = -Infinity, rmx = 0;
  for (let i = 0; i < S.length; i += 3) {
    if (S[i + 1] < ymn) ymn = S[i + 1];
    if (S[i + 1] > ymx) ymx = S[i + 1];
  }
  const cy = (ymn + ymx) / 2;
  for (let i = 0; i < S.length; i += 3) {
    const r = Math.hypot(S[i], S[i + 1] - cy, S[i + 2]);
    if (r > rmx) rmx = r;
  }
  // 还要包住上面所有盒子的外切范围
  let boxR = 0;
  for (const z of zones) {
    const ox = z.ox || 0, oz = z.oz || 0;
    if (z.kind === 'sphere') {
      boxR = Math.max(boxR, Math.hypot(ox, z.y - cy, oz) + z.r);
    } else {
      boxR = Math.max(boxR,
        Math.hypot(Math.hypot(ox, oz) + z.r, z.y0 - cy),
        Math.hypot(Math.hypot(ox, oz) + z.r, z.y1 - cy));
    }
  }
  const R = Math.max(rmx, boxR) * 1.02;
  console.log('广相球: y=' + cy.toFixed(3) + ' r=' + R.toFixed(3) +
    ' (网格外切 ' + rmx.toFixed(3) + ', 盒子外切 ' + boxR.toFixed(3) + ')');
  console.log('');
  console.log('const DUMMY_BROAD_Y = ' + cy.toFixed(2) + ';');
  console.log('const DUMMY_BROAD_R = ' + (Math.ceil(R * 100) / 100).toFixed(2) + ';');
}

// ---- 5. 输出可粘贴的表 ----
console.log('');
console.log('const DUMMY_ZONES = [');
for (const z of zones) {
  if (z.kind === 'sphere') {
    console.log("  { zone: '" + z.zone + "', mult: " + z.mult.toFixed(2) +
      ", kind: 'sphere', y: " + z.y.toFixed(2) + ', oz: ' + z.oz.toFixed(2) + ', r: ' + z.r.toFixed(2) + ' },');
  } else {
    console.log("  { zone: '" + z.zone + "', mult: " + z.mult.toFixed(2) +
      ", kind: 'cyl', y0: " + z.y0.toFixed(2) + ', y1: ' + z.y1.toFixed(2) +
      ', r: ' + z.r.toFixed(2) + ', ox: ' + z.ox.toFixed(2) + ', oz: ' + z.oz.toFixed(2) + ' },');
  }
}
console.log('];');

// ---- 6. 覆盖率自检：多少表面点落在某个盒子里 ----
console.log('');
let inAny = 0;
const perZone = {};
for (let i = 0; i < S.length; i += 3) {
  const x = S[i], y = S[i + 1], z = S[i + 2];
  let hit = null;
  for (const zn of zones) {
    const ox = zn.ox || 0, oz = zn.oz || 0;
    if (zn.kind === 'sphere') {
      if (Math.hypot(x - ox, y - zn.y, z - oz) <= zn.r) { hit = zn.zone; break; }
    } else {
      if (y >= zn.y0 && y <= zn.y1 && Math.hypot(x - ox, z - oz) <= zn.r) { hit = zn.zone; break; }
    }
  }
  if (hit) { inAny++; perZone[hit] = (perZone[hit] || 0) + 1; }
}
const tot = S.length / 3;
console.log('覆盖率: ' + (inAny / tot * 100).toFixed(1) + '% 的表面积在命中盒内');
for (const k in perZone) console.log('  ' + k + ': ' + (perZone[k] / tot * 100).toFixed(1) + '%');
console.log('  未覆盖: ' + ((tot - inAny) / tot * 100).toFixed(1) + '%');

// 只报总覆盖率不够用：85% 里如果那 15% 全集中在某一段高度上，
// 那一段就是实打实的「打得见打不中」死区。按高度列出漏在哪。
console.log('');
console.log('未覆盖表面按高度分布（找连续死区）:');
{
  const B = 19, miss = new Array(B).fill(0), all = new Array(B).fill(0);
  for (let i = 0; i < S.length; i += 3) {
    const x = S[i], y = S[i + 1], z = S[i + 2];
    let g = Math.floor(y / 0.1);
    if (g < 0) g = 0; if (g >= B) g = B - 1;
    all[g]++;
    let hit = false;
    for (const zn of zones) {
      const ox = zn.ox || 0, oz = zn.oz || 0;
      if (zn.kind === 'sphere') {
        if (Math.hypot(x - ox, y - zn.y, z - oz) <= zn.r) { hit = true; break; }
      } else {
        if (y >= zn.y0 && y <= zn.y1 && Math.hypot(x - ox, z - oz) <= zn.r) { hit = true; break; }
      }
    }
    if (!hit) miss[g]++;
  }
  for (let g = 0; g < B; g++) {
    if (!all[g]) continue;
    const pctMiss = miss[g] / all[g] * 100;
    const flag = pctMiss > 40 ? '  <== 死区' : (pctMiss > 22 ? '  <- 偏高' : '');
    console.log('  y ' + (g * 0.1).toFixed(1) + '~' + ((g + 1) * 0.1).toFixed(1) +
      ': 漏 ' + pctMiss.toFixed(0).padStart(3) + '%  ' +
      '#'.repeat(Math.round(pctMiss / 2.5)) + flag);
  }
}
