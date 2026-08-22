// 把 12.glb（Blender 导出的 GLB）转成运行时能直接吃的紧凑二进制 DMSH。
//
// 为什么不在浏览器里直接加载 GLB：
//   1. GLTFLoader 不在 three.min.js 核心库里（属于 examples/jsm），引它就得再挂一个
//      CDN 脚本，而这个项目的底线是「断网也能玩」（index.html 有本地 vendor 回退）。
//   2. 原始 GLB 是 17MB、60.9 万顶点 / 20.3 万面。靶子要 10 个，
//      20.3 万面 × 10 = 203 万面，集显上直接掉到个位帧率。
//   3. 顶点数被法线拆散了：同一个位置因为法线不同被复制成多份
//      （10.1 万几何顶点 → 60.9 万带法线顶点）。减面前必须先焊回去。
//
// 所以离线做四件事：解容器 → 焊接+减面 → 重算平滑法线 → 归一化到命中盒尺寸，
// 输出一个自描述的二进制。运行时只要 fetch + new Float32Array，
// 没有解析成本，也不需要任何附加库。
//
// 关于这个 GLB 的两个坑（实测，不是猜的）：
//   A. 节点带 scale [4.6788, 1, 4.6788]。照它执行的话世界尺寸是
//      243 宽 × 608 高 × 36 厚，宽厚比 6.74 —— 一个纸片人。而服务端命中盒是
//      绕轴对称的圆柱（躯干 r=0.34），纸片模型会「侧面打空气也中弹」。
//      原始几何宽厚比 51.99/36.09 = 1.44 才是正常人体比例，
//      所以这个 scale 判定为 Blender 导出残留，**只取旋转、丢掉缩放**。
//   B. 几何自身是 Z 轴朝上（bbox 52 × 36 × 130，最长轴是 Z），
//      靠节点的 +90°X 旋转扶正成 Y-up。旋转必须应用，否则模型是躺着的。
//
// 减面用的是**格网聚类**（vertex clustering）而不是边收缩：
// 边收缩（QEM 那一类）在 10 万顶点规模下，光是维护边的优先队列就要几分钟
// （这个项目里试过，90 秒没跑完）；聚类是 O(n) 单遍——把空间切成格子，
// 每格里的顶点合成一个代表点，三角形的三个顶点落进同一格就退化丢掉。
// 对这种密度均匀的雕刻模型，视觉差异在 2m 开外基本看不出来，
// 而且格子边长直接控制输出规模，二分一下就能命中目标面数。
//
// 用法：node tools/glb2mesh.js 12.glb public/models/dummy.mesh
'use strict';
const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2] || '12.glb';
const outPath = process.argv[3] || 'public/models/dummy.mesh';
const TARGET_TRIS = 14000;
// 服务端命中盒是固定的，视觉模型缩放到 1.90m 去对齐它
const TARGET_H = 1.90;

function log() { console.log.apply(console, arguments); }

// ------------------------------------------------------------ 解 GLB 容器
// GLB = 12 字节头（magic/version/length）+ 若干 chunk（4 字节长度 + 4 字节类型 + 数据）。
// chunk 长度本身已经是 4 字节对齐的，所以不用额外补齐。
function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB 文件（magic 不对）');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const clen = buf.readUInt32LE(off), ctype = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + clen);
    if (ctype === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (ctype === 0x004e4942) bin = body;
    off += 8 + clen;
  }
  if (!json) throw new Error('GLB 里没有 JSON chunk');
  return { json: json, bin: bin };
}

const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
// 读 accessor。这个文件没有 byteStride（都是紧密排列的独立 bufferView），
// 所以按连续内存读就行；真遇到交错的会在这里抛出来，不会静默读错。
function readAccessor(g, i) {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  if (bv.byteStride) {
    const need = COMPS[a.type] * (a.componentType === 5123 ? 2 : 4);
    if (bv.byteStride !== need) throw new Error('accessor ' + i + ' 是交错布局，暂不支持');
  }
  const n = a.count * COMPS[a.type];
  const wide = a.componentType === 5126 || a.componentType === 5125;
  const bytes = new Uint8Array(n * (wide ? 4 : 2));
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  g.bin.copy(bytes, 0, base, base + bytes.length);
  if (a.componentType === 5126) return new Float32Array(bytes.buffer);
  if (a.componentType === 5125) return new Uint32Array(bytes.buffer);
  if (a.componentType === 5123) return new Uint16Array(bytes.buffer);
  throw new Error('不支持的 componentType ' + a.componentType);
}

// 四元数 → 3x3 旋转矩阵（行主序展平）
function quatToM3(q) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
  ];
}

// 从 GLB 取出所有三角网格，套上节点的**旋转**（见文件头坑 A：缩放故意不套）。
// 平移也不套：后面要重新居中，平移是白算的。
function collectGlb(g) {
  const verts = [], tris = [];
  const nodes = g.json.nodes || [];
  const scene = g.json.scenes[g.json.scene || 0];
  let dropped = 0;

  function walk(ni, rot) {
    const nd = nodes[ni];
    let r = rot;
    if (nd.matrix) throw new Error('节点 ' + ni + ' 用的是 matrix，本转换器只处理 TRS');
    if (nd.rotation) {
      const m = quatToM3(nd.rotation);
      if (!r) r = m;
      else {                                    // r = r * m
        const o = new Array(9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
        }
        r = o;
      }
    }
    if (nd.scale) {
      const s = nd.scale;
      const iso = Math.abs(s[0] - s[1]) < 1e-6 && Math.abs(s[1] - s[2]) < 1e-6;
      log('  节点 "' + (nd.name || ni) + '" scale [' + s.map(v => v.toFixed(4)).join(', ') + ']' +
          (iso ? ' → 等比，反正后面要归一化，忽略' : ' → **非等比，判定为导出残留，丢弃**'));
    }
    if (nd.mesh !== undefined) {
      const mesh = g.json.meshes[nd.mesh];
      for (const prim of mesh.primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) { log('  跳过非三角 primitive (mode ' + prim.mode + ')'); continue; }
        const pos = readAccessor(g, prim.attributes.POSITION);
        const base = verts.length / 3;
        for (let i = 0; i < pos.length; i += 3) {
          let x = pos[i], y = pos[i + 1], z = pos[i + 2];
          if (r) {
            const nx = r[0] * x + r[1] * y + r[2] * z;
            const ny = r[3] * x + r[4] * y + r[5] * z;
            const nz = r[6] * x + r[7] * y + r[8] * z;
            x = nx; y = ny; z = nz;
          }
          verts.push(x, y, z);
        }
        if (prim.indices !== undefined) {
          const idx = readAccessor(g, prim.indices);
          // GLB 的 index 数量必须是 3 的倍数；这个文件是 608799 = 202933×3，
          // 但仍然按下取整处理，免得别的导出器给出半个三角形时静默越界。
          const n3 = Math.floor(idx.length / 3) * 3;
          if (n3 !== idx.length) dropped += (idx.length - n3);
          for (let i = 0; i < n3; i++) tris.push(base + idx[i]);
        } else {
          for (let i = 0; i < pos.length / 3; i++) tris.push(base + i);
        }
      }
    }
    if (nd.children) for (const c of nd.children) walk(c, r);
  }
  for (const ni of scene.nodes) walk(ni, null);
  if (dropped) log('  丢弃了 ' + dropped + ' 个凑不满三角形的索引');
  return { verts: verts, tris: tris };
}

// ---------------------------------------------------------------- 读 OBJ
// 留着 OBJ 分支不是为了兼容，是为了**对照**：11.obj 和 12.glb 是同一个模型，
// 同一套管线跑两遍应该给出几乎一样的结果，对不上就说明 GLB 解析有问题。
function readObj(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const verts = [], tris = [];
  let nv = 0;
  const lines = txt.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    const c0 = l.charCodeAt(0);
    if (c0 === 118 && l.charCodeAt(1) === 32) {            // 'v '
      const p = l.split(/\s+/);
      verts.push(+p[1], +p[2], +p[3]); nv++;
    } else if (c0 === 102 && l.charCodeAt(1) === 32) {     // 'f '
      const p = l.split(/\s+/);
      const idx = [];
      for (let k = 1; k < p.length; k++) {
        if (!p[k]) continue;
        const s = p[k].indexOf('/');
        const n = parseInt(s < 0 ? p[k] : p[k].slice(0, s), 10);
        if (!isNaN(n)) idx.push(n > 0 ? n - 1 : nv + n);
      }
      for (let k = 2; k < idx.length; k++) tris.push(idx[0], idx[k - 1], idx[k]);
    }
  }
  return { verts: verts, tris: tris };
}

// -------------------------------------------------------------- 顶点焊接
// GLB 为了存法线把同一个位置拆成了多份（60.9 万 vs 10.1 万）。
// 不焊就直接聚类的话结果一样（聚类本身就按位置合并），但中间数组白大 6 倍，
// 而且拿不到「真实几何顶点数」这个能和 OBJ 对照的数字。
// 量化到 1e-5 相对精度：GLB 的 f32 位置在往返变换后末位会有抖动，
// 完全按位比较会漏焊。
function weld(verts, tris) {
  const map = new Map();
  const remap = new Int32Array(verts.length / 3);
  const outV = [];
  let span = 0;
  for (let i = 0; i < verts.length; i++) { const a = Math.abs(verts[i]); if (a > span) span = a; }
  const q = (span || 1) * 1e-5;
  for (let i = 0, vi = 0; i < verts.length; i += 3, vi++) {
    const key = Math.round(verts[i] / q) + '|' + Math.round(verts[i + 1] / q) + '|' + Math.round(verts[i + 2] / q);
    let id = map.get(key);
    if (id === undefined) {
      id = outV.length / 3;
      map.set(key, id);
      outV.push(verts[i], verts[i + 1], verts[i + 2]);
    }
    remap[vi] = id;
  }
  const outT = new Array(tris.length);
  for (let i = 0; i < tris.length; i++) outT[i] = remap[tris[i]];
  return { verts: outV, tris: outT };
}

// ------------------------------------------------------- 格网聚类减面
// gridN 是最长轴上的格子数。每格取落入顶点的**平均位置**当代表点：
// 取平均而不是取第一个，表面才不会因为「代表点恰好是个凸起」而长满疙瘩。
function cluster(verts, tris, gridN, mn, mx) {
  const sx = mx[0] - mn[0], sy = mx[1] - mn[1], sz = mx[2] - mn[2];
  const span = Math.max(sx, sy, sz);
  const cell = span / gridN;
  const nx = Math.max(1, Math.ceil(sx / cell));
  const ny = Math.max(1, Math.ceil(sy / cell));
  const nz = Math.max(1, Math.ceil(sz / cell));

  const map = new Map();          // 格子键 → 代表点序号
  const remap = new Int32Array(verts.length / 3);
  const accum = [];               // [sumX, sumY, sumZ, count] 展平

  for (let i = 0, vi = 0; i < verts.length; i += 3, vi++) {
    let gx = Math.floor((verts[i] - mn[0]) / cell);
    let gy = Math.floor((verts[i + 1] - mn[1]) / cell);
    let gz = Math.floor((verts[i + 2] - mn[2]) / cell);
    if (gx >= nx) gx = nx - 1; if (gy >= ny) gy = ny - 1; if (gz >= nz) gz = nz - 1;
    if (gx < 0) gx = 0; if (gy < 0) gy = 0; if (gz < 0) gz = 0;
    const key = (gz * ny + gy) * nx + gx;
    let id = map.get(key);
    if (id === undefined) {
      id = accum.length / 4;
      map.set(key, id);
      accum.push(0, 0, 0, 0);
    }
    const b = id * 4;
    accum[b] += verts[i]; accum[b + 1] += verts[i + 1]; accum[b + 2] += verts[i + 2];
    accum[b + 3]++;
    remap[vi] = id;
  }

  const outV = new Float64Array((accum.length / 4) * 3);
  for (let id = 0; id < accum.length / 4; id++) {
    const b = id * 4, c = accum[b + 3] || 1;
    outV[id * 3] = accum[b] / c;
    outV[id * 3 + 1] = accum[b + 1] / c;
    outV[id * 3 + 2] = accum[b + 2] / c;
  }

  // 三角形重映射：三点里有任意两点落进同一格就退化，丢掉。
  // 再用 Set 去掉完全重复的面（聚类之后大量薄片会塌成同一个三角）。
  const seen = new Set();
  const outT = [];
  const nvOut = outV.length / 3;
  for (let i = 0; i < tris.length; i += 3) {
    const a = remap[tris[i]], b = remap[tris[i + 1]], c = remap[tris[i + 2]];
    if (a === b || b === c || a === c) continue;
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
    const mid = a + b + c - lo - hi;
    const key = lo + '_' + mid + '_' + hi;
    if (seen.has(key)) continue;
    seen.add(key);
    outT.push(a, b, c);
  }
  return { verts: outV, tris: outT, cells: nvOut };
}

// 丢掉没被任何三角引用的孤立顶点
function compact(verts, tris) {
  const used = new Int32Array(verts.length / 3).fill(-1);
  for (let i = 0; i < tris.length; i++) used[tris[i]] = 0;
  const outV = [];
  for (let i = 0; i < used.length; i++) {
    if (used[i] !== 0) continue;
    used[i] = outV.length / 3;
    outV.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
  }
  const outT = new Array(tris.length);
  for (let i = 0; i < tris.length; i++) outT[i] = used[tris[i]];
  return { verts: outV, tris: outT };
}

// ------------------------------------------------------------ 平滑法线
// 重算而不是沿用 GLB 里的：减面之后拓扑全变了，原法线对不上新的面。
function computeNormals(verts, tris) {
  const n = new Float64Array(verts.length);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 3, b = tris[i + 1] * 3, c = tris[i + 2] * 3;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    // 不归一化：叉积长度正比于面积，大面自然权重更高
    const px = uy * vz - uz * vy, py = uz * vx - ux * vz, pz = ux * vy - uy * vx;
    n[a] += px; n[a + 1] += py; n[a + 2] += pz;
    n[b] += px; n[b + 1] += py; n[b + 2] += pz;
    n[c] += px; n[c + 1] += py; n[c + 2] += pz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const L = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= L; n[i + 1] /= L; n[i + 2] /= L;
  }
  return n;
}

function bbox(verts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < verts.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (verts[i + k] < mn[k]) mn[k] = verts[i + k];
      if (verts[i + k] > mx[k]) mx[k] = verts[i + k];
    }
  }
  return { mn: mn, mx: mx };
}

// ---------------------------------------------------- 朝向判定（脚尖朝哪）
// 靶子必须正面朝 -Z（和玩家、和服务端 DUMMY_YAW=PI 的约定一致）。
//
// 判据用**脚部质量的偏心**：脚掌是一块前后不对称的板，脚跟宽厚、脚趾细长，
// 所以脚部顶点的深度**均值**会偏向脚跟那一侧，而包围盒中心到均值的偏移方向
// 反过来就指向脚尖。
//
// 为什么不用极值：第一版拿「中位数到 min/max 的距离」判，对单个离群顶点极敏感，
// 在 12.glb 上只给出 41% 置信度，等于没判。也不要用「按包围盒中点二分半侧数顶点」：
// 脚部 Z 区间本身极不对称（实测 -0.261..+0.061），中点二分会把大量脚掌顶点
// 误算到另一侧，实测给出**相反**的结论。躯干法线面积差也不行——正背面
// 面积只差 2%，噪声级别。
//
// 12.glb 的朝向已用三视图剪影人工确认过（tools/_silhouette.js，用完即删）：
// 两只脚都是「宽端在 +Z、渐尖端伸向 -Z」，头部 -Z 侧有鼻口的凸块，
// 与本函数的结论一致。
function faceSign(verts) {
  const bb = bbox(verts);
  const yLo = bb.mn[1], yHi = bb.mn[1] + (bb.mx[1] - bb.mn[1]) * 0.12;
  let sum = 0, cnt = 0;
  for (let i = 0; i < verts.length; i += 3) {
    const y = verts[i + 1];
    if (y >= yLo && y <= yHi) { sum += verts[i + 2]; cnt++; }
  }
  if (cnt < 16) return { sign: -1, conf: 0, note: '脚部顶点太少，无法判定' };
  const mean = sum / cnt;
  const mid = (bb.mn[2] + bb.mx[2]) / 2;
  // 均值偏向脚跟；脚跟在 +Z 就说明脚尖朝 -Z
  const off = mean - mid;
  const half = (bb.mx[2] - bb.mn[2]) / 2 || 1e-9;
  return {
    sign: off > 0 ? -1 : 1,
    conf: Math.min(1, Math.abs(off) / half * 3),
    note: '脚部深度均值 ' + mean.toFixed(3) + '，包围盒中点 ' + mid.toFixed(3) +
          '，偏移 ' + off.toFixed(3) + '（正=脚跟偏 +Z=脚尖朝 -Z）'
  };
}

// ============================================================ 主流程
log('读取 ' + srcPath + ' ...');
let src;
if (/\.glb$/i.test(srcPath)) {
  const g = readGlb(srcPath);
  log('  glTF ' + g.json.asset.version + '，生成器: ' + (g.json.asset.generator || '未知'));
  const j = g.json;
  log('  内容: ' + (j.meshes || []).length + ' mesh / ' +
      (j.materials || []).length + ' 材质 / ' + (j.images || []).length + ' 贴图 / ' +
      (j.skins || []).length + ' 骨架 / ' + (j.animations || []).length + ' 动画');
  const attrs = Object.keys(j.meshes[0].primitives[0].attributes).join(', ');
  log('  顶点属性: ' + attrs);
  if (attrs.indexOf('TEXCOORD') < 0) log('  → 没有 UV，只能用纯色/顶点色着色');
  if (!(j.skins || []).length) log('  → 没有骨架，倒地只能整体旋转');
  src = collectGlb(g);
} else {
  src = readObj(srcPath);
}
log('  原始: ' + (src.verts.length / 3) + ' 顶点 / ' + (src.tris.length / 3) + ' 面');

// 焊接：把法线拆出来的重复位置合回去
const welded = weld(src.verts, src.tris);
log('  焊接后: ' + (welded.verts.length / 3) + ' 顶点（几何顶点数）');
src = welded;

let bb = bbox(src.verts);
log('  包围盒: ' + bb.mn.map(function (v) { return v.toFixed(2); }).join(', ') +
    ' → ' + bb.mx.map(function (v) { return v.toFixed(2); }).join(', '));
log('  尺寸: 宽 ' + (bb.mx[0] - bb.mn[0]).toFixed(2) + ' / 高 ' + (bb.mx[1] - bb.mn[1]).toFixed(2) +
    ' / 厚 ' + (bb.mx[2] - bb.mn[2]).toFixed(2) +
    '  宽厚比 ' + ((bb.mx[0] - bb.mn[0]) / (bb.mx[2] - bb.mn[2])).toFixed(2));

// 二分格子密度，逼近目标面数。聚类的面数随 gridN 单调增，所以二分是稳的。
log('减面到 ~' + TARGET_TRIS + ' 面（格网聚类，二分格子密度）...');
let loN = 8, hiN = 320, best = null;
for (let it = 0; it < 12; it++) {
  const midN = Math.round((loN + hiN) / 2);
  const r = cluster(src.verts, src.tris, midN, bb.mn, bb.mx);
  const nt = r.tris.length / 3;
  log('  grid=' + midN + ' → ' + nt + ' 面 / ' + (r.verts.length / 3) + ' 顶点');
  if (!best || Math.abs(nt - TARGET_TRIS) < Math.abs(best.nt - TARGET_TRIS)) {
    best = { r: r, nt: nt, gridN: midN };
  }
  if (nt > TARGET_TRIS) hiN = midN - 1; else loN = midN + 1;
  if (loN > hiN) break;
}
log('  选定 grid=' + best.gridN + '，' + best.nt + ' 面');

let m = compact(best.r.verts, best.r.tris);
log('  清理孤立顶点后: ' + (m.verts.length / 3) + ' 顶点 / ' + (m.tris.length / 3) + ' 面');

// ---- 归一化：脚在 y=0、身高 1.90、水平居中 ----
bb = bbox(m.verts);
const scale = TARGET_H / (bb.mx[1] - bb.mn[1]);
const cx = (bb.mn[0] + bb.mx[0]) / 2, cz = (bb.mn[2] + bb.mx[2]) / 2;
for (let i = 0; i < m.verts.length; i += 3) {
  m.verts[i] = (m.verts[i] - cx) * scale;
  m.verts[i + 1] = (m.verts[i + 1] - bb.mn[1]) * scale;
  m.verts[i + 2] = (m.verts[i + 2] - cz) * scale;
}
log('  归一化: 缩放 ' + scale.toFixed(6) + '，身高 ' + TARGET_H + 'm，脚底贴 y=0');

// ---- 朝向：必须正面朝 -Z ----
const fs2 = faceSign(m.verts);
log('  朝向判定: ' + fs2.note + '（置信度 ' + (fs2.conf * 100).toFixed(0) + '%）');
if (fs2.sign > 0) {
  // 绕 Y 转 180°：(x,z) → (-x,-z)。面的绕序不用翻——180° 旋转是行列式为 +1 的
  // 正交变换，不改变三角形的手性。
  for (let i = 0; i < m.verts.length; i += 3) {
    m.verts[i] = -m.verts[i];
    m.verts[i + 2] = -m.verts[i + 2];
  }
  log('  → 绕 Y 旋转 180°，转成正面朝 -Z');
} else {
  log('  → 已经正面朝 -Z，不用转');
}

const nrm = computeNormals(m.verts, m.tris);

bb = bbox(m.verts);
log('  最终包围盒: X ' + bb.mn[0].toFixed(3) + '..' + bb.mx[0].toFixed(3) +
    '  Y ' + bb.mn[1].toFixed(3) + '..' + bb.mx[1].toFixed(3) +
    '  Z ' + bb.mn[2].toFixed(3) + '..' + bb.mx[2].toFixed(3));

// 按高度分层量一遍横向半径，和服务端命中盒对一对
log('  分层横向半径（对照 HIT_ZONES）:');
const bands = [
  ['腿 0.02~0.98', 0.02, 0.98, 0.20],
  ['躯干 0.98~1.56', 0.98, 1.56, 0.34],
  ['头 1.50~1.90', 1.50, 1.90, 0.20],
];
for (const b of bands) {
  let rmax = 0, cnt = 0;
  for (let i = 0; i < m.verts.length; i += 3) {
    const y = m.verts[i + 1];
    if (y < b[1] || y > b[2]) continue;
    const r = Math.hypot(m.verts[i], m.verts[i + 2]);
    if (r > rmax) rmax = r;
    cnt++;
  }
  log('    ' + b[0] + ': 实测最大半径 ' + rmax.toFixed(3) +
      ' / 命中盒 ' + b[3] + '  (' + cnt + ' 顶点)');
}

// ---- 写二进制 ----
// 布局：magic 'DMSH' | ver u32 | vcount u32 | icount u32 |
//       pos f32*3v | nrm f32*3v | idx u32*i
const vcount = m.verts.length / 3, icount = m.tris.length;
const buf = Buffer.alloc(16 + vcount * 12 * 2 + icount * 4);
let o = 0;
buf.write('DMSH', o, 'ascii'); o += 4;
buf.writeUInt32LE(1, o); o += 4;
buf.writeUInt32LE(vcount, o); o += 4;
buf.writeUInt32LE(icount, o); o += 4;
for (let i = 0; i < m.verts.length; i++) { buf.writeFloatLE(m.verts[i], o); o += 4; }
for (let i = 0; i < nrm.length; i++) { buf.writeFloatLE(nrm[i], o); o += 4; }
for (let i = 0; i < m.tris.length; i++) { buf.writeUInt32LE(m.tris[i], o); o += 4; }

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
log('写出 ' + outPath + '  (' + (buf.length / 1024).toFixed(0) + ' KB, ' +
    vcount + ' 顶点 / ' + (icount / 3) + ' 面)');
