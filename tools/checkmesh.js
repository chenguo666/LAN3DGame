// 校验 dummy.mesh 与服务端 HIT_ZONES 的对齐情况。
// 只读、不写文件，跑完打印报告。
'use strict';
const fs = require('fs');

const buf = fs.readFileSync(process.argv[2] || 'public/models/dummy.mesh');
if (buf.toString('ascii', 0, 4) !== 'DMSH') throw new Error('magic 不对');
const ver = buf.readUInt32LE(4);
const vcount = buf.readUInt32LE(8);
const icount = buf.readUInt32LE(12);
console.log('ver=' + ver + '  顶点=' + vcount + '  索引=' + icount + '  面=' + (icount / 3));

const pos = new Float32Array(vcount * 3);
for (let i = 0; i < vcount * 3; i++) pos[i] = buf.readFloatLE(16 + i * 4);
const nrmOff = 16 + vcount * 12;
const nrm = new Float32Array(vcount * 3);
for (let i = 0; i < vcount * 3; i++) nrm[i] = buf.readFloatLE(nrmOff + i * 4);
const idxOff = nrmOff + vcount * 12;
const idx = new Uint32Array(icount);
for (let i = 0; i < icount; i++) idx[i] = buf.readUInt32LE(idxOff + i * 4);

// 1) 索引范围
let bad = 0;
for (let i = 0; i < icount; i++) if (idx[i] >= vcount) bad++;
console.log('索引越界: ' + bad + (bad ? '  ← 有问题' : '  OK'));

// 2) 法线是否都是单位向量
let nBad = 0;
for (let i = 0; i < vcount; i++) {
  const L = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
  if (Math.abs(L - 1) > 1e-3) nBad++;
}
console.log('非单位法线: ' + nBad + (nBad ? '  ← 有问题' : '  OK'));

// 3) 逐层横截面（每 10cm 一层），看人形轮廓是否合理
console.log('\n高度剖面（每 10cm）:');
console.log('  y范围        Xmin   Xmax   Zmin   Zmax   顶点');
for (let y = 0; y < 1.9; y += 0.1) {
  let xn = 1e9, xx = -1e9, zn = 1e9, zx = -1e9, c = 0;
  for (let i = 0; i < vcount; i++) {
    const py = pos[i * 3 + 1];
    if (py < y || py >= y + 0.1) continue;
    const px = pos[i * 3], pz = pos[i * 3 + 2];
    if (px < xn) xn = px; if (px > xx) xx = px;
    if (pz < zn) zn = pz; if (pz > zx) zx = pz;
    c++;
  }
  if (!c) { console.log('  ' + y.toFixed(2) + '~' + (y + 0.1).toFixed(2) + '   (空)'); continue; }
  console.log('  ' + y.toFixed(2) + '~' + (y + 0.1).toFixed(2) +
    '  ' + xn.toFixed(3).padStart(6) + ' ' + xx.toFixed(3).padStart(6) +
    ' ' + zn.toFixed(3).padStart(6) + ' ' + zx.toFixed(3).padStart(6) +
    '   ' + c);
}

// 4) 头部球（服务端 y=1.70 r=0.20）覆盖率：
//    模型头顶那一段的顶点，有多少落在这颗球里
console.log('\n头部判定球 (y=1.70, r=0.20) 覆盖检查:');
let inSphere = 0, headBand = 0;
for (let i = 0; i < vcount; i++) {
  const py = pos[i * 3 + 1];
  if (py < 1.62) continue;               // 只看脖子以上
  headBand++;
  const d = Math.hypot(pos[i * 3], py - 1.70, pos[i * 3 + 2]);
  if (d <= 0.20) inSphere++;
}
console.log('  y>=1.62 的顶点 ' + headBand + '，其中 ' + inSphere +
  ' 落在球内 (' + (headBand ? (inSphere / headBand * 100).toFixed(1) : 0) + '%)');

// 5) 躯干柱（y 0.98~1.56, r=0.34）：这一段的水平半径分布
console.log('\n躯干柱 (y 0.98~1.56, r=0.34) 半径分布:');
const rs = [];
for (let i = 0; i < vcount; i++) {
  const py = pos[i * 3 + 1];
  if (py < 0.98 || py > 1.56) continue;
  rs.push(Math.hypot(pos[i * 3], pos[i * 3 + 2]));
}
rs.sort(function (a, b) { return a - b; });
if (rs.length) {
  const q = function (p) { return rs[Math.min(rs.length - 1, Math.floor(rs.length * p))]; };
  console.log('  中位 ' + q(0.5).toFixed(3) + '  p90 ' + q(0.9).toFixed(3) +
    '  p99 ' + q(0.99).toFixed(3) + '  max ' + rs[rs.length - 1].toFixed(3));
  let over = 0;
  for (const r of rs) if (r > 0.34) over++;
  console.log('  超出 r=0.34 的: ' + over + ' / ' + rs.length +
    ' (' + (over / rs.length * 100).toFixed(1) + '%) ← 这些是手臂，服务端有独立的 arm 柱');
}

// 6) 双腿是否分开（服务端腿柱 ox=±0.13, r=0.20）
console.log('\n腿部 (y 0.02~0.98) 左右分布:');
let lc = 0, rc = 0, lmax = 0, rmax = 0;
for (let i = 0; i < vcount; i++) {
  const py = pos[i * 3 + 1];
  if (py < 0.02 || py > 0.98) continue;
  const px = pos[i * 3], pz = pos[i * 3 + 2];
  if (px < 0) { lc++; const d = Math.hypot(px + 0.13, pz); if (d > lmax) lmax = d; }
  else { rc++; const d = Math.hypot(px - 0.13, pz); if (d > rmax) rmax = d; }
}
console.log('  左侧 ' + lc + ' 顶点，距左腿柱轴(x=-0.13) 最远 ' + lmax.toFixed(3));
console.log('  右侧 ' + rc + ' 顶点，距右腿柱轴(x=+0.13) 最远 ' + rmax.toFixed(3));
console.log('  (腿柱 r=0.20；超出的是脚掌外缘和裤腿，属正常)');
