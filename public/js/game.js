/* ============================================================
 * LAN 3D 射击对战 - 客户端
 * 依赖：Three.js（由 index.html 负责加载）
 * ============================================================ */
(function () {
  'use strict';

  if (!window.THREE) return;

  // ----------------------------------------------------------
  // 常量 / 配置（武器与服务器保持一致）
  // ----------------------------------------------------------
  var WEAPONS = {
    knife: { id: 'knife', name: '战术匕首', type: 'melee', damage: 55, range: 2.4, cooldown: 380, arcDot: 0.45, color: 0xc0c0c0 },
    axe: { id: 'axe', name: '消防斧', type: 'melee', damage: 100, range: 3.0, cooldown: 950, arcDot: 0.55, color: 0xcc3333 },
    katana: { id: 'katana', name: '武士刀', type: 'melee', damage: 68, range: 3.2, cooldown: 560, arcDot: 0.5, color: 0x8a8a8a },
    pistol: { id: 'pistol', name: '手枪', type: 'ranged', damage: 26, mag: 12, cooldown: 240, range: 90, pellets: 1, spread: 0.008, reloadTime: 1.3, auto: false, color: 0x444444 },
    shotgun: { id: 'shotgun', name: '霰弹枪', type: 'ranged', damage: 13, mag: 6, cooldown: 900, range: 45, pellets: 8, spread: 0.055, reloadTime: 2.3, auto: false, color: 0x553311 },
    rifle: { id: 'rifle', name: '突击步枪', type: 'ranged', damage: 19, mag: 30, cooldown: 105, range: 110, pellets: 1, spread: 0.012, reloadTime: 1.9, auto: true, color: 0x222222 }
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
    { x: 25, z: -5, w: 3, h: 2, d: 3 }
  ];

  var ARENA_HALF = 46;
  var EYE = 1.55;
  var PLAYER_RADIUS = 0.5;

  // ----------------------------------------------------------
  // DOM
  // ----------------------------------------------------------
  var canvas = document.getElementById('gameCanvas');
  var menu = document.getElementById('menu');
  var hud = document.getElementById('hud');
  var nameInput = document.getElementById('nameInput');
  var startBtn = document.getElementById('startBtn');
  var healthFill = document.getElementById('healthFill');
  var healthText = document.getElementById('healthText');
  var weaponName = document.getElementById('weaponName');
  var ammoText = document.getElementById('ammoText');
  var reloadTip = document.getElementById('reloadTip');
  var crosshair = document.getElementById('crosshair');
  var hitmarker = document.getElementById('hitmarker');
  var damageOverlay = document.getElementById('damageOverlay');
  var deathOverlay = document.getElementById('deathOverlay');
  var killfeed = document.getElementById('killfeed');
  var scoreboard = document.getElementById('scoreboard');
  var scoreBody = document.getElementById('scoreBody');

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
    current: 'ranged',
    melee: 'knife',
    ranged: 'pistol',
    kills: 0,
    deaths: 0,
    ammo: WEAPONS.pistol.mag,
    reloading: false
  };

  var remotePlayers = new Map(); // id -> remote data
  var socket = null;
  var gameStarted = false;
  var pointerLocked = false;
  var triggerDown = false;
  var selectedMelee = 'knife';
  var selectedRanged = 'pistol';
  var showScore = false;
  var lastHp = 100;

  var keys = { f: false, b: false, l: false, r: false, jump: false, run: false };

  // 本地开火/近战计时
  var lastLocalFire = 0;
  var lastLocalMelee = 0;
  var recoilPitch = 0;
  var recoilYaw = 0;
  var recoilZ = 0;
  var swingTime = 0;       // 近战挥砍动画时间
  var bobPhase = 0;
  var sendStateTimer = 0;

  // 特效数组
  var tracerLines = [];
  var impacts = [];
  var slashEffects = [];

  // ----------------------------------------------------------
  // Three.js 初始化
  // ----------------------------------------------------------
  var renderer, scene, camera;
  var vmGroup, vmGunGroup, vmMeleeGroup;
  var gunModels = {};
  var meleeModels = {};
  var clock = new THREE.Clock();

  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc0d8);
    scene.fog = new THREE.Fog(0x9fc0d8, 30, 130);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, EYE, 0);
    scene.add(camera);

    var hemi = new THREE.HemisphereLight(0xddeeff, 0x4a5a5f, 1.0);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
    sun.position.set(45, 70, 25);
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xaaccff, 0.5);
    fill.position.set(-30, 20, -40);
    scene.add(fill);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ----------------------------------------------------------
  // 场景搭建
  // ----------------------------------------------------------
  function createGroundTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#3c4a42';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#4c5d52';
    ctx.lineWidth = 2;
    for (var i = 0; i <= 8; i++) {
      var p = i * 64;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
    }
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 504);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function buildArena() {
    // 地面
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 0.9, metalness: 0.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // 边界墙
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.7 });
    var walls = [
      { x: 0, z: -47.5, w: 96, d: 1.5 },
      { x: 0, z: 47.5, w: 96, d: 1.5 },
      { x: -47.5, z: 0, w: 1.5, d: 96 },
      { x: 47.5, z: 0, w: 1.5, d: 96 }
    ];
    walls.forEach(function (w) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, 2.4, w.d), wallMat);
      mesh.position.set(w.x, 1.2, w.z);
      scene.add(mesh);
    });

    // 掩体
    BOXES.forEach(function (b, i) {
      var mat = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8a6d4b : 0x7a5f40, roughness: 0.85 });
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      scene.add(mesh);
      var edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x2a211a })
      );
      edges.position.copy(mesh.position);
      scene.add(edges);
    });
  }

  // ----------------------------------------------------------
  // 第一人称武器模型（简易盒体搭建）
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

  function createGunModels() {
    vmGunGroup = new THREE.Group();
    vmGunGroup.position.set(0, 0, 0);

    // 手枪
    var pistol = new THREE.Group();
    var pBody = boxMesh(0.085, 0.115, 0.3, 0x2a2a2a); pBody.position.set(0, 0.01, -0.03);
    var pBarrel = boxMesh(0.04, 0.05, 0.14, 0x111111); pBarrel.position.set(0, 0.06, -0.22);
    var pGrip = boxMesh(0.075, 0.14, 0.09, 0x1a1a1a); pGrip.position.set(0, -0.1, 0.06); pGrip.rotation.x = 0.32;
    pistol.add(pBody); pistol.add(pBarrel); pistol.add(pGrip);
    pistol.position.set(0, 0, 0);
    vmGunGroup.add(pistol); gunModels.pistol = pistol;

    // 霰弹枪
    var shotgun = new THREE.Group();
    var sBody = boxMesh(0.1, 0.13, 0.65, 0x5a3a20); sBody.position.set(0, 0.01, -0.05);
    var sBarrel = boxMesh(0.05, 0.055, 0.55, 0x222222); sBarrel.position.set(0, 0.055, -0.5);
    var sPump = boxMesh(0.08, 0.09, 0.2, 0x3a2a18); sPump.position.set(0, -0.04, -0.32);
    var sStock = boxMesh(0.08, 0.12, 0.22, 0x4a2f18); sStock.position.set(0, 0.0, 0.32);
    shotgun.add(sBody); shotgun.add(sBarrel); shotgun.add(sPump); shotgun.add(sStock);
    shotgun.position.set(0, 0, 0);
    vmGunGroup.add(shotgun); gunModels.shotgun = shotgun;

    // 突击步枪
    var rifle = new THREE.Group();
    var rBody = boxMesh(0.09, 0.13, 0.58, 0x222222); rBody.position.set(0, 0.01, -0.05);
    var rBarrel = boxMesh(0.04, 0.045, 0.48, 0x111111); rBarrel.position.set(0, 0.06, -0.48);
    var rMag = boxMesh(0.06, 0.2, 0.1, 0x333333); rMag.position.set(0, -0.13, 0.02); rMag.rotation.x = -0.22;
    var rStock = boxMesh(0.07, 0.12, 0.22, 0x1a1a1a); rStock.position.set(0, 0.0, 0.34);
    var rGrip = boxMesh(0.07, 0.12, 0.08, 0x1a1a1a); rGrip.position.set(0, -0.1, 0.16); rGrip.rotation.x = 0.3;
    rifle.add(rBody); rifle.add(rBarrel); rifle.add(rMag); rifle.add(rStock); rifle.add(rGrip);
    rifle.position.set(0, 0, 0);
    vmGunGroup.add(rifle); gunModels.rifle = rifle;

    vmGroup.add(vmGunGroup);
  }

  function createMeleeModels() {
    vmMeleeGroup = new THREE.Group();
    vmMeleeGroup.position.set(0, 0, 0);

    // 匕首
    var knife = new THREE.Group();
    var kHandle = boxMesh(0.03, 0.035, 0.15, 0x4a3020); kHandle.position.set(0, 0, 0.05);
    var kBlade = boxMesh(0.022, 0.07, 0.2, 0xc0c0c0, { metalness: 0.8, roughness: 0.25 }); kBlade.position.set(0, 0.045, -0.13);
    var kGuard = boxMesh(0.07, 0.025, 0.025, 0x333333); kGuard.position.set(0, -0.01, -0.02);
    knife.add(kHandle); knife.add(kBlade); knife.add(kGuard);
    knife.position.set(0, -0.02, 0);
    vmMeleeGroup.add(knife); meleeModels.knife = knife;

    // 消防斧
    var axe = new THREE.Group();
    var aHandle = boxMesh(0.035, 0.035, 0.55, 0x6b4a2a); aHandle.position.set(0, 0, 0);
    var aHead = boxMesh(0.06, 0.2, 0.24, 0x999999, { metalness: 0.7, roughness: 0.3 }); aHead.position.set(0, 0.08, -0.18);
    var aEdge = boxMesh(0.025, 0.16, 0.1, 0xcc3333); aEdge.position.set(0, 0.08, -0.3);
    axe.add(aHandle); axe.add(aHead); axe.add(aEdge);
    axe.position.set(0, -0.05, 0);
    vmMeleeGroup.add(axe); meleeModels.axe = axe;

    // 武士刀
    var katana = new THREE.Group();
    var tHandle = boxMesh(0.03, 0.03, 0.28, 0x1a1a1a); tHandle.position.set(0, 0, 0.12);
    var tGuard = boxMesh(0.08, 0.02, 0.04, 0x333333); tGuard.position.set(0, 0, -0.02);
    var tBlade = boxMesh(0.025, 0.1, 0.55, 0xcfcfcf, { metalness: 0.9, roughness: 0.2 }); tBlade.position.set(0, 0.05, -0.3);
    katana.add(tHandle); katana.add(tGuard); katana.add(tBlade);
    katana.position.set(0, -0.02, 0);
    vmMeleeGroup.add(katana); meleeModels.katana = katana;

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

    Object.keys(gunModels).forEach(function (id) {
      gunModels[id].visible = !isMelee && id === local.ranged;
    });
    Object.keys(meleeModels).forEach(function (id) {
      meleeModels[id].visible = isMelee && id === local.melee;
    });
  }

  // ----------------------------------------------------------
  // 远端玩家模型
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
    sprite.scale.set(2.4, 0.6, 1);
    return sprite;
  }

  function createRemotePlayer(id, name) {
    var group = new THREE.Group();
    var hue = (id * 0.61803398875) % 1;
    var bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.65, 0.52),
      roughness: 0.6,
      transparent: true,
      opacity: 1
    });
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 4, 10), bodyMat);
    body.position.y = 1.0;
    body.name = 'body';
    group.add(body);

    var nameSprite = makeNameSprite(name);
    nameSprite.position.y = 2.2;
    group.add(nameSprite);

    // 手持武器示意（近战/枪械切换）
    var hand = new THREE.Group();
    hand.position.set(0.42, 1.05, 0.3);
    var gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })
    );
    gunMesh.position.set(0, 0.03, -0.15);
    var meleeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 })
    );
    meleeMesh.position.set(0, 0.04, -0.15);
    hand.add(gunMesh); hand.add(meleeMesh);
    group.add(hand);

    scene.add(group);

    var r = {
      id: id,
      name: name,
      group: group,
      body: body,
      bodyMat: bodyMat,
      nameSprite: nameSprite,
      gunMesh: gunMesh,
      meleeMesh: meleeMesh,
      targetPos: new THREE.Vector3(0, 0, 0),
      renderPos: new THREE.Vector3(0, 0, 0),
      targetYaw: 0,
      renderYaw: 0,
      targetPitch: 0,
      renderPitch: 0,
      hp: 100,
      alive: true,
      current: 'ranged',
      melee: 'knife',
      ranged: 'pistol',
      kills: 0,
      deaths: 0,
      firstUpdate: true
    };
    remotePlayers.set(id, r);
    return r;
  }

  function updateRemoteWeaponVisual(r) {
    var isMelee = r.current === 'melee';
    r.gunMesh.visible = !isMelee;
    r.meleeMesh.visible = isMelee;
    var wpn = isMelee ? WEAPONS[r.melee] : WEAPONS[r.ranged];
    if (wpn) {
      r.gunMesh.material.color.set(wpn.color);
      r.meleeMesh.material.color.set(wpn.color);
    }
  }

  // ----------------------------------------------------------
  // 工具函数
  // ----------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function lerpAngle(a, b, t) {
    var diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  function aimDir() {
    var cp = Math.cos(local.pitch);
    return new THREE.Vector3(
      -Math.sin(local.yaw) * cp,
      Math.sin(local.pitch),
      -Math.cos(local.yaw) * cp
    ).normalize();
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

  // ----------------------------------------------------------
  // 音效（WebAudio 合成，无需音频文件）
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
    var v = far ? 0.25 : 0.7;
    if (weaponId === 'shotgun') { playNoise(0.24, 850, v * 0.9, 'bandpass'); playTone(110, 0.16, v * 0.5, 'sawtooth'); }
    else if (weaponId === 'rifle') { playNoise(0.09, 2300, v * 0.45, 'bandpass'); playTone(180, 0.06, v * 0.3, 'square'); }
    else { playNoise(0.12, 1700, v * 0.6, 'bandpass'); playTone(240, 0.08, v * 0.35, 'square'); }
  }

  function playMeleeSound(far) {
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

  function playDeathSound() {
    ensureAudio();
    playTone(220, 0.3, 0.4, 'sawtooth');
    playTone(110, 0.4, 0.35, 'sawtooth');
  }

  // ----------------------------------------------------------
  // 特效
  // ----------------------------------------------------------
  function addTracer(from, to, life) {
    life = life || 0.08;
    var geom = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    var mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 });
    var line = new THREE.Line(geom, mat);
    scene.add(line);
    tracerLines.push({ line: line, mat: mat, life: life, maxLife: life });
  }

  function addImpact(pos, color) {
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: color || 0xffd27a, transparent: true })
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    impacts.push({ mesh: mesh, life: 0.1, maxLife: 0.1 });
  }

  function addSlashEffect(pos, yaw) {
    var pts = [];
    var segments = 12;
    for (var i = 0; i <= segments; i++) {
      var a = yaw - 1.0 + (2.0 * i) / segments;
      pts.push(new THREE.Vector3(
        pos.x - Math.sin(a) * 2.0,
        1.25,
        pos.z - Math.cos(a) * 2.0
      ));
    }
    var geom = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    var line = new THREE.Line(geom, mat);
    scene.add(line);
    slashEffects.push({ line: line, mat: mat, life: 0.13, maxLife: 0.13 });
  }

  function updateEffects(dt) {
    var i;
    for (i = tracerLines.length - 1; i >= 0; i--) {
      var t = tracerLines[i];
      t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.mat.dispose();
        tracerLines.splice(i, 1);
      } else {
        t.mat.opacity = 0.95 * (t.life / t.maxLife);
      }
    }
    for (i = impacts.length - 1; i >= 0; i--) {
      var im = impacts[i];
      im.life -= dt;
      if (im.life <= 0) {
        scene.remove(im.mesh);
        im.mesh.geometry.dispose();
        im.mesh.material.dispose();
        impacts.splice(i, 1);
      } else {
        im.mesh.material.opacity = im.life / im.maxLife;
        im.mesh.scale.setScalar(1 + (1 - im.life / im.maxLife) * 2);
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
        s.mat.opacity = 0.9 * (s.life / s.maxLife);
      }
    }
  }

  // ----------------------------------------------------------
  // HUD
  // ----------------------------------------------------------
  function updateHUD() {
    healthFill.style.width = Math.max(0, (local.hp / local.maxHp) * 100) + '%';
    healthText.textContent = Math.max(0, Math.round(local.hp)) + ' / ' + local.maxHp;
    healthFill.style.background = local.hp > 60 ? 'linear-gradient(90deg,#3fb950,#7ee787)' :
      (local.hp > 30 ? 'linear-gradient(90deg,#d29922,#e3b341)' : 'linear-gradient(90deg,#f85149,#ff7b72)');

    var isMelee = local.current === 'melee';
    weaponName.textContent = isMelee ? WEAPONS[local.melee].name : WEAPONS[local.ranged].name;
    ammoText.textContent = isMelee ? '∞' : (local.ammo + ' / ∞');
    if (!isMelee) {
      ammoText.classList.toggle('low', local.ammo <= WEAPONS[local.ranged].mag * 0.25);
    } else {
      ammoText.classList.remove('low');
    }
    reloadTip.style.display = (!isMelee && local.reloading) ? 'block' : 'none';
  }

  function showHitmarker() {
    hitmarker.classList.remove('show');
    void hitmarker.offsetWidth; // 重新触发动画
    hitmarker.classList.add('show');
  }

  function showDamageFlash() {
    damageOverlay.classList.remove('show');
    void damageOverlay.offsetWidth;
    damageOverlay.classList.add('show');
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
        ranged: selectedRanged
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
      case 'joined':
        local.id = msg.id;
        local.alive = true;
        local.initialized = true;
        if (msg.pos) {
          local.pos.set(msg.pos.x, msg.pos.y !== undefined ? msg.pos.y : 0, msg.pos.z);
          local.yaw = msg.yaw || 0;
          local.pitch = 0;
        }
        local.hp = local.maxHp;
        local.ammo = WEAPONS[local.ranged].mag;
        local.melee = selectedMelee;
        local.ranged = selectedRanged;
        local.current = 'ranged';
        local.kills = 0;
        local.deaths = 0;
        lastHp = local.hp;
        deathOverlay.style.display = 'none';
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
      case 'kill':
        addKillFeed(msg);
        if (msg.victimId === local.id) playDeathSound();
        break;
      case 'reload':
        // 快照中会同步 reloading 状态
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
        local.alive = pd.alive;
        if (!local.alive) triggerDown = false;
        local.kills = pd.kills;
        local.deaths = pd.deaths;
        local.ammo = pd.ammo;
        local.reloading = pd.reloading;
        local.current = pd.current;
        local.melee = pd.melee;
        local.ranged = pd.ranged;
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
        r.hp = pd.hp;
        r.alive = pd.alive;
        r.current = pd.current;
        r.melee = pd.melee;
        r.ranged = pd.ranged;
        r.kills = pd.kills;
        r.deaths = pd.deaths;
        if (r.firstUpdate) {
          r.firstUpdate = false;
          r.renderPos.copy(r.targetPos);
          r.renderYaw = r.targetYaw;
          r.renderPitch = r.targetPitch;
        }
        updateRemoteWeaponVisual(r);
      }
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
    if (msg.tracers) {
      msg.tracers.forEach(function (tr) {
        addTracer(
          new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z),
          new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z),
          0.06
        );
        if (tr.hitPlayer) {
          addImpact(new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z), 0xff8866);
        } else {
          addImpact(new THREE.Vector3(tr.end.x, tr.end.y, tr.end.z), 0xffd27a);
        }
      });
    }
    // 显示远端玩家开火动作
    var r = remotePlayers.get(msg.id);
    if (r) {
      r.fireAnim = 0.15;
    }
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
      r.swingAnim = 0.15;
      playMeleeSound(true);
    }
  }

  function handleRespawn(msg) {
    if (msg.id === local.id) {
      local.alive = true;
      local.hp = local.maxHp;
      local.ammo = WEAPONS[local.ranged].mag;
      local.reloading = false;
      local.vel.set(0, 0, 0);
      if (msg.pos) {
        local.pos.set(msg.pos.x, 0, msg.pos.z);
        local.yaw = msg.yaw || 0;
      }
      deathOverlay.style.display = 'none';
      updateHUD();
    } else {
      var r = remotePlayers.get(msg.id);
      if (r && msg.pos) {
        r.targetPos.set(msg.pos.x, msg.pos.y !== undefined ? msg.pos.y : 0, msg.pos.z);
        r.alive = true;
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
          switchWeapon('melee');
          break;
        case 'Digit2':
          switchWeapon('ranged');
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
      var sens = 0.0022;
      local.yaw -= e.movementX * sens;
      local.pitch = clamp(local.pitch - e.movementY * sens, -1.55, 1.55);
    });

    canvas.addEventListener('mousedown', function (e) {
      if (!gameStarted || !pointerLocked || !local.alive) return;
      if (e.button !== 0) return;
      e.preventDefault();
      triggerDown = true;
      send({ t: 'attack', down: true, yaw: local.yaw, pitch: local.pitch });
      if (local.current === 'melee') {
        localMelee();
      } else {
        var wpn = WEAPONS[local.ranged];
        if (!wpn.auto) {
          localFire();
        }
      }
    });

    document.addEventListener('mouseup', function (e) {
      if (e.button !== 0) return;
      if (triggerDown) {
        triggerDown = false;
        send({ t: 'attack', down: false });
      }
    });

    document.addEventListener('pointerlockchange', function () {
      pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked && gameStarted) {
        keys.f = keys.b = keys.l = keys.r = keys.jump = keys.run = false;
        triggerDown = false;
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
  function switchWeapon(slot) {
    if (!gameStarted) return;
    if (slot === 'melee') local.current = 'melee';
    else if (slot === 'ranged') local.current = 'ranged';
    else return;
      if (triggerDown) { triggerDown = false; send({ t: 'attack', down: false }); }
    applyWeaponVisibility();
    updateHUD();
    send({ t: 'switch', slot: local.current });
  }

  function startReload() {
    if (!gameStarted || !local.alive || local.current !== 'ranged') return;
    var wpn = WEAPONS[local.ranged];
    if (local.reloading || local.ammo >= wpn.mag) return;
    local.reloading = true;
    send({ t: 'reload' });
    playReloadSound();
    updateHUD();
    setTimeout(function () {
      local.reloading = false;
      local.ammo = WEAPONS[local.ranged].mag;
      updateHUD();
    }, wpn.reloadTime * 1000);
  }

  function localFire() {
    var now = performance.now();
    var wpn = WEAPONS[local.ranged];
    if (local.reloading) return;
    if (now - lastLocalFire < wpn.cooldown) return;
    if (local.ammo <= 0) {
      startReload();
      return;
    }
    lastLocalFire = now;
    local.ammo--;
    updateHUD();

    // 后坐力
    var kick = wpn.id === 'shotgun' ? 0.035 : (wpn.id === 'rifle' ? 0.012 : 0.018);
    recoilPitch += kick * (0.7 + Math.random() * 0.6);
    recoilYaw += (Math.random() - 0.5) * kick * 0.6;
    recoilZ += wpn.id === 'shotgun' ? 0.1 : 0.05;

    // 枪口闪光（小冲击球）
    var ray = castLocalRay(wpn.range);
    addTracer(ray.origin, ray.end, wpn.id === 'shotgun' ? 0.1 : 0.06);
    addImpact(ray.end, 0xffe08a);
    playShotSound(wpn.id, false);

    if (local.ammo <= 0) startReload();
  }

  function localMelee() {
    var now = performance.now();
    var wpn = WEAPONS[local.melee];
    if (now - lastLocalMelee < wpn.cooldown) return;
    lastLocalMelee = now;
    swingTime = 0.22;
    playMeleeSound(false);
  }

  // ----------------------------------------------------------
  // 本地移动 / 更新
  // ----------------------------------------------------------
  function updateLocal(dt) {
    if (!gameStarted || !local.alive || !local.initialized) return;

    var speed = keys.run ? 13 : 8;
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
      local.vel.y = 6.5;
      local.onGround = false;
    }

    local.vel.y -= 20 * dt;
    local.pos.x += local.vel.x * dt;
    local.pos.y += local.vel.y * dt;
    local.pos.z += local.vel.z * dt;

    if (local.pos.y <= 0) {
      local.pos.y = 0;
      local.vel.y = 0;
      local.onGround = true;
    }

    collideBoxes(local.pos);
    local.pos.x = clamp(local.pos.x, -ARENA_HALF, ARENA_HALF);
    local.pos.z = clamp(local.pos.z, -ARENA_HALF, ARENA_HALF);

    // 自动武器本地连发
    if (triggerDown && local.current === 'ranged') {
      var wpn = WEAPONS[local.ranged];
      if (wpn.auto) localFire();
    }

    // 相机与武器模型
    var moving = (Math.abs(local.vel.x) > 0.5 || Math.abs(local.vel.z) > 0.5) && local.onGround;
    if (moving) bobPhase += dt * (keys.run ? 12 : 9);
    var bobX = moving ? Math.sin(bobPhase) * 0.014 : 0;
    var bobY = moving ? Math.abs(Math.sin(bobPhase)) * 0.012 : 0;

    camera.position.set(local.pos.x, local.pos.y + EYE + bobY * 0.4, local.pos.z);
    camera.rotation.y = local.yaw + recoilYaw;
    camera.rotation.x = local.pitch + recoilPitch;
    camera.rotation.z = 0;

    vmGroup.position.set(0.32 + bobX, -0.3 + bobY, -0.55 + recoilZ);

    // 后坐力恢复
    var rec = 1 - Math.exp(-dt * 12);
    recoilPitch -= recoilPitch * rec;
    recoilYaw -= recoilYaw * rec;
    recoilZ -= recoilZ * rec;

    // 近战挥砍动画
    if (swingTime > 0) {
      swingTime -= dt;
      var t = 1 - Math.max(swingTime, 0) / 0.22;
      vmMeleeGroup.rotation.x = -1.3 * Math.sin(t * Math.PI);
      vmMeleeGroup.position.y = -0.3 + Math.sin(t * Math.PI) * 0.1;
      if (swingTime <= 0) {
        vmMeleeGroup.rotation.x = 0;
        vmMeleeGroup.position.y = 0;
      }
    }
  }

  function updateRemotePlayers(dt) {
    var k = 1 - Math.exp(-dt * 18);
    remotePlayers.forEach(function (r) {
      r.renderPos.lerp(r.targetPos, k);
      r.renderYaw = lerpAngle(r.renderYaw, r.targetYaw, k);
      r.renderPitch = lerpAngle(r.renderPitch, r.targetPitch, k);
      r.group.position.copy(r.renderPos);
      r.group.rotation.y = r.renderYaw;

      // 身体透明度：存活 / 阵亡
      r.bodyMat.opacity = r.alive ? 1 : 0.25;
      r.bodyMat.color.setHSL(r.alive ? ((r.id * 0.61803398875) % 1) : 0, r.alive ? 0.65 : 0, r.alive ? 0.52 : 0.55);
      r.nameSprite.material.opacity = r.alive ? 1 : 0.5;

      // 开火 / 挥砍小动画
      if (r.fireAnim > 0) {
        r.fireAnim -= dt;
        r.gunMesh.position.z = -0.15 + Math.sin((0.15 - Math.max(r.fireAnim, 0)) / 0.15 * Math.PI) * 0.12;
        if (r.fireAnim <= 0) r.gunMesh.position.z = -0.15;
      }
      if (r.swingAnim > 0) {
        r.swingAnim -= dt;
        r.meleeMesh.rotation.x = -1.4 * Math.sin((0.15 - Math.max(r.swingAnim, 0)) / 0.15 * Math.PI);
        if (r.swingAnim <= 0) r.meleeMesh.rotation.x = 0;
      }
    });
  }

  function sendState() {
    if (!gameStarted || !local.initialized) return;
    send({
      t: 'state',
      pos: { x: local.pos.x, y: local.pos.y, z: local.pos.z },
      vel: { x: local.vel.x, y: local.vel.y, z: local.vel.z },
      yaw: local.yaw,
      pitch: local.pitch
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
  function bindMenu() {
    nameInput.value = '战士' + Math.floor(Math.random() * 1000);

    document.querySelectorAll('#meleeGrid .weapon-card').forEach(function (card) {
      card.addEventListener('click', function () {
        document.querySelectorAll('#meleeGrid .weapon-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedMelee = card.getAttribute('data-id');
      });
    });

    document.querySelectorAll('#rangedGrid .weapon-card').forEach(function (card) {
      card.addEventListener('click', function () {
        document.querySelectorAll('#rangedGrid .weapon-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedRanged = card.getAttribute('data-id');
      });
    });

    startBtn.addEventListener('click', function () {
      var name = nameInput.value.trim() || ('玩家' + Math.floor(Math.random() * 1000));
      local.name = name;
      local.melee = selectedMelee;
      local.ranged = selectedRanged;
      local.current = 'ranged';
      local.ammo = WEAPONS[selectedRanged].mag;
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
