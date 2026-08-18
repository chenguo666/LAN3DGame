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
    pistol: { id: 'pistol', name: '手枪', type: 'ranged', damage: 26, mag: 12, cooldown: 240, range: 90, pellets: 1, spread: 0.008, reloadTime: 1.3, auto: false, color: 0x444444 },
    shotgun: { id: 'shotgun', name: '霰弹枪', type: 'ranged', damage: 13, mag: 6, cooldown: 900, range: 45, pellets: 8, spread: 0.055, reloadTime: 2.3, auto: false, color: 0x553311 },
    rifle: { id: 'rifle', name: '突击步枪', type: 'ranged', damage: 19, mag: 30, cooldown: 105, range: 110, pellets: 1, spread: 0.012, reloadTime: 1.9, auto: true, color: 0x222222 },
    awp: { id: 'awp', name: '狙击步枪', type: 'ranged', damage: 150, mag: 5, cooldown: 1400, range: 160, pellets: 1, spread: 0.0005, reloadTime: 2.6, auto: false, color: 0x1a3a1a },
      dmr: { id: 'dmr', name: '连狙', type: 'ranged', damage: 55, mag: 10, cooldown: 300, range: 120, pellets: 1, spread: 0.003, reloadTime: 2.1, auto: false, color: 0x2a4a2a },
      lmg: { id: 'lmg', name: '重机枪', type: 'ranged', damage: 16, mag: 125, cooldown: 95, range: 100, pellets: 1, spread: 0.018, reloadTime: 3.8, auto: true, color: 0x3a3a3a }
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
var statText = document.getElementById('statText');
var respawnCountdownEl = document.getElementById('respawnCountdown');
var localNameTag = document.getElementById('localNameTag');
  var weaponName = document.getElementById('weaponName');
  var ammoText = document.getElementById('ammoText');
  var reloadTip = document.getElementById('reloadTip');
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

  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb8d8);
    scene.fog = new THREE.Fog(0x8fb8d8, 35, 140);

      // 渐变天空球
      var skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x3a6a9a) },
          bottomColor: { value: new THREE.Color(0x9fc4d8) }
        },
        vertexShader: 'varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0); }'
      });
      skyMesh = new THREE.Mesh(new THREE.SphereGeometry(240, 16, 12), skyMat);
      skyMesh.position.copy(camera.position);
      scene.add(skyMesh);
        skyMesh.frustumCulled = false;
          skyMesh.renderOrder = -1;

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 300);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, EYE, 0);
    scene.add(camera);

    var hemi = new THREE.HemisphereLight(0xddeeff, 0x4a5a5f, 1.1);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
    sun.position.set(45, 70, 25);
    scene.add(sun);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -70;
      sun.shadow.camera.right = 70;
      sun.shadow.camera.top = 70;
      sun.shadow.camera.bottom = -70;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 200;
      sun.shadow.bias = -0.0004;
        sun.shadow.camera.updateProjectionMatrix();
    var fill = new THREE.DirectionalLight(0xaaccff, 0.5);
    fill.position.set(-30, 20, -40);
    scene.add(fill);

    muzzleLight = new THREE.PointLight(0xffcc66, 0, 5);
    scene.add(muzzleLight);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ----------------------------------------------------------
  // 场景
  // ----------------------------------------------------------
  function createGroundTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#4a555f';
    ctx.fillRect(0, 0, 512, 512);
      // 出生区色块
      ctx.fillStyle = 'rgba(60,140,220,0.22)';
      ctx.fillRect(176, 16, 160, 60);
      ctx.fillRect(176, 436, 160, 60);
      ctx.fillStyle = 'rgba(220,120,60,0.22)';
      ctx.fillRect(16, 176, 60, 160);
      ctx.fillRect(436, 176, 60, 160);
      // 中央直升机坪
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.arc(256, 256, 86, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(256, 256, 86, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(256, 256, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,90,60,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(256, 170); ctx.lineTo(256, 342); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(170, 256); ctx.lineTo(342, 256); ctx.stroke();
      // 道路标线
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 8; i++) {
      var p = i * 64;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
    }
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 504);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, 488, 488);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function buildArena() {
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 130),
      new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 0.9, metalness: 0.0 })
    );
    ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
    scene.add(ground);

    var wallMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.7 });
    var walls = [
      { x: 0, z: -47.5, w: 97, d: 1.5 },
      { x: 0, z: 47.5, w: 97, d: 1.5 },
      { x: -47.5, z: 0, w: 1.5, d: 97 },
      { x: 47.5, z: 0, w: 1.5, d: 97 }
    ];
    walls.forEach(function (w) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, 2.6, w.d), wallMat);
      mesh.position.set(w.x, 1.3, w.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        var stripe = new THREE.Mesh(
          new THREE.BoxGeometry(w.w > 10 ? w.w : 1.2, 0.18, w.w > 10 ? 0.5 : w.d),
          new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.5 })
        );
        stripe.position.set(w.x, 2.5, w.z);
        scene.add(stripe);
      scene.add(mesh);
    });

    BOXES.forEach(function (b, i) {
      var mat;
        if (b.w >= 7) {
          mat = new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x8a3b2f : (i % 3 === 1 ? 0x2f4a6a : 0x3a5a3a), roughness: 0.6, metalness: 0.25 });
        } else if (b.h <= 1.4) {
          mat = new THREE.MeshStandardMaterial({ color: 0x5a5f55, roughness: 0.9 });
        } else if (b.h >= 3.5) {
          mat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.8 });
        } else {
          mat = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8a6d4b : 0x7a5f40, roughness: 0.85 });
        }
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x, b.h / 2, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      scene.add(mesh);
      var edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x2a211a })
      );
      edges.position.copy(mesh.position);
      scene.add(edges);

        // 细节装饰：集装箱肋骨 / 矮掩体条纹 / 高塔顶盖
        if (b.w >= 7) {
          var ribMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
          var ribCount = Math.max(3, Math.floor(b.w / 1.5));
          for (var r = 0; r < ribCount; r++) {
            var ribX = b.x - b.w / 2 + 0.4 + r * ((b.w - 0.8) / (ribCount - 1 || 1));
            var rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, b.h - 0.3, b.d - 0.15), ribMat);
            rib.position.set(ribX, b.h / 2, b.z);
            rib.castShadow = true;
            scene.add(rib);
          }
        } else if (b.h <= 1.4) {
          var stripeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6 });
          var stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.05, 0.1, b.d + 0.05), stripeMat);
          stripe.position.set(b.x, b.h + 0.03, b.z);
          stripe.receiveShadow = true;
          scene.add(stripe);
        } else if (b.h >= 3.5) {
          var capMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5, metalness: 0.3 });
          var cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.25, 0.18, b.d + 0.25), capMat);
          cap.position.set(b.x, b.h + 0.07, b.z);
          cap.castShadow = true;
          scene.add(cap);
        }
    });

    // 几个装饰油桶
    var barrelMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.5, metalness: 0.3 });
    [[-5, 12], [5, -15], [-18, -5], [15, 5], [-30, 12], [30, -12], [-12, 30], [12, -30]].forEach(function (p) {
      var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), barrelMat);
      barrel.position.set(p[0], 0.55, p[1]);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
      scene.add(barrel);
    });

      // 围墙外瞭望塔（纯装饰）
      var towerMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.6, metalness: 0.2 });
      var towerDarkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
      [[-50, -50], [50, -50], [-50, 50], [50, 50], [0, -52], [0, 52], [-52, 0], [52, 0]].forEach(function (p) {
        var leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.5, 8), towerDarkMat);
        leg1.position.set(p[0] - 1.2, 3.25, p[1] - 1.2);
        var leg2 = leg1.clone(); leg2.position.set(p[0] + 1.2, 3.25, p[1] - 1.2);
        var leg3 = leg1.clone(); leg3.position.set(p[0] - 1.2, 3.25, p[1] + 1.2);
        var leg4 = leg1.clone(); leg4.position.set(p[0] + 1.2, 3.25, p[1] + 1.2);
        scene.add(leg1, leg2, leg3, leg4);
        var platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 4), towerMat);
        platform.position.set(p[0], 6.6, p[1]);
        platform.castShadow = true;
        scene.add(platform);
        var roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), towerDarkMat);
        roof.position.set(p[0], 7.9, p[1]);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        scene.add(roof);
      });

      // 围墙外的低多边形树木（纯装饰，不阻挡子弹）
      var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
      var leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8 });
      [[-54, -54], [54, -54], [-54, 54], [54, 54], [0, -54], [0, 54], [-54, 0], [54, 0]].forEach(function (p) {
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.2, 8), trunkMat);
        trunk.position.set(p[0], 1.6, p[1]);
        trunk.castShadow = true;
        scene.add(trunk);
        var leaves1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 8), leafMat);
        leaves1.position.set(p[0], 4.2, p[1]);
        leaves1.castShadow = true;
        scene.add(leaves1);
        var leaves2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 8), leafMat);
        leaves2.position.set(p[0], 5.8, p[1]);
        leaves2.castShadow = true;
        scene.add(leaves2);
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

  // ----------------------------------------------------------
  // 第一人称枪械模型（细化）
  // ----------------------------------------------------------
  function createGunModels() {
    vmGunGroup = new THREE.Group();

    // ---- 手枪 ----
    var pistol = new THREE.Group();
    var pSlide = boxMesh(0.09, 0.085, 0.34, 0x1c1c1c, { metalness: 0.7, roughness: 0.3 });
    pSlide.position.set(0, 0.045, -0.05);
    var pFrame = boxMesh(0.08, 0.07, 0.24, 0x333333);
    pFrame.position.set(0, -0.02, 0.02);
    var pGrip = boxMesh(0.08, 0.15, 0.1, 0x111111);
    pGrip.position.set(0, -0.11, 0.08);
    pGrip.rotation.x = 0.35;
    var pGuard = boxMesh(0.06, 0.025, 0.09, 0x111111);
    pGuard.position.set(0, -0.08, 0.0);
    var pFront = boxMesh(0.02, 0.035, 0.02, 0x111111);
    pFront.position.set(0, 0.1, -0.18);
    var pRear = boxMesh(0.02, 0.035, 0.02, 0x111111);
    pRear.position.set(0, 0.1, 0.05);
    pistol.add(pSlide, pFrame, pGrip, pGuard, pFront, pRear);
    var pMuzzle = new THREE.Object3D();
    pMuzzle.position.set(0, 0.07, -0.24);
    pistol.add(pMuzzle);
    muzzleAnchors.pistol = pMuzzle;
    vmGunGroup.add(pistol);
    gunModels.pistol = pistol;

    // ---- 霰弹枪 ----
    var shotgun = new THREE.Group();
    var sReceiver = boxMesh(0.09, 0.13, 0.28, 0x3a2a18, { roughness: 0.5 });
    sReceiver.position.set(0, 0.0, 0.02);
    var sStock = boxMesh(0.08, 0.13, 0.3, 0x4a2f18, { roughness: 0.6 });
    sStock.position.set(0, 0.0, 0.35);
    var sBarrel = cylinderZ(0.028, 0.028, 0.62, 0x111111, { metalness: 0.8, roughness: 0.25 });
    sBarrel.position.set(0, 0.06, -0.36);
    var sTube = cylinderZ(0.025, 0.025, 0.44, 0x222222, { metalness: 0.6, roughness: 0.3 });
    sTube.position.set(0, -0.035, -0.3);
    var sPump = boxMesh(0.08, 0.09, 0.22, 0x4a3a20, { roughness: 0.5 });
    sPump.position.set(0, -0.05, -0.28);
    var sFront = boxMesh(0.02, 0.035, 0.02, 0x111111);
    sFront.position.set(0, 0.11, -0.63);
    shotgun.add(sReceiver, sStock, sBarrel, sTube, sPump, sFront);
    var sMuzzle = new THREE.Object3D();
    sMuzzle.position.set(0, 0.06, -0.68);
    shotgun.add(sMuzzle);
    muzzleAnchors.shotgun = sMuzzle;
    vmGunGroup.add(shotgun);
    gunModels.shotgun = shotgun;

    // ---- 突击步枪 ----
    var rifle = new THREE.Group();
    var rStock = boxMesh(0.07, 0.12, 0.26, 0x1a1a1a, { roughness: 0.5 });
    rStock.position.set(0, 0.0, 0.36);
    var rReceiver = boxMesh(0.09, 0.13, 0.34, 0x222222, { metalness: 0.4, roughness: 0.4 });
    rReceiver.position.set(0, 0.01, 0.0);
    var rHandguard = boxMesh(0.08, 0.1, 0.3, 0x2a2a2a);
    rHandguard.position.set(0, -0.01, -0.3);
    var rBarrel = cylinderZ(0.025, 0.025, 0.5, 0x111111, { metalness: 0.8, roughness: 0.25 });
    rBarrel.position.set(0, 0.05, -0.58);
    var rMag = boxMesh(0.06, 0.2, 0.1, 0x333333);
    rMag.position.set(0, -0.14, -0.02);
    rMag.rotation.x = -0.18;
    var rGrip = boxMesh(0.07, 0.12, 0.08, 0x1a1a1a);
    rGrip.position.set(0, -0.1, 0.16);
    rGrip.rotation.x = 0.3;
    var rFront = boxMesh(0.02, 0.04, 0.02, 0x111111);
    rFront.position.set(0, 0.1, -0.82);
    var rRear = boxMesh(0.02, 0.04, 0.02, 0x111111);
    rRear.position.set(0, 0.1, 0.08);
      var rDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200 }));
      rDot.position.set(0, 0.1, 0.08);
      rifle.add(rDot);
    rifle.add(rStock, rReceiver, rHandguard, rBarrel, rMag, rGrip, rFront, rRear);
    var rMuzzle = new THREE.Object3D();
    rMuzzle.position.set(0, 0.05, -0.85);
    rifle.add(rMuzzle);
    muzzleAnchors.rifle = rMuzzle;
    vmGunGroup.add(rifle);
    gunModels.rifle = rifle;

    // ---- 狙击步枪 AWP ----
    var awp = new THREE.Group();
    var aStock = boxMesh(0.08, 0.12, 0.34, 0x1a2a1a, { roughness: 0.55 });
    aStock.position.set(0, 0.0, 0.42);
    var aReceiver = boxMesh(0.09, 0.12, 0.56, 0x1a3a1a, { roughness: 0.45, metalness: 0.2 });
    aReceiver.position.set(0, 0.01, 0.0);
    var aBarrel = cylinderZ(0.026, 0.026, 0.7, 0x111111, { metalness: 0.85, roughness: 0.2 });
    aBarrel.position.set(0, 0.04, -0.62);
    var aScope = cylinderZ(0.028, 0.034, 0.24, 0x0c0c0c, { metalness: 0.5, roughness: 0.3 });
    aScope.position.set(0, 0.14, 0.0);
    var aScopeCap1 = cylinderZ(0.04, 0.04, 0.04, 0x0c0c0c);
    aScopeCap1.position.set(0, 0.14, 0.13);
    var aScopeCap2 = cylinderZ(0.04, 0.04, 0.04, 0x0c0c0c);
    aScopeCap2.position.set(0, 0.14, -0.13);
      var aLens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x116688 }));
      aLens.rotation.x = -Math.PI / 2;
      aLens.position.set(0, 0.14, 0.155);
      awp.add(aLens);
    var aBolt = cylinderZ(0.02, 0.02, 0.14, 0x333333);
    aBolt.position.set(0.05, 0.03, 0.14);
    var aMag = boxMesh(0.06, 0.14, 0.08, 0x222222);
    aMag.position.set(0, -0.1, 0.0);
    var aGrip = boxMesh(0.07, 0.11, 0.08, 0x1a1a1a);
    aGrip.position.set(0, -0.09, 0.18);
    aGrip.rotation.x = 0.3;
    var aBipod1 = cylinderZ(0.015, 0.015, 0.18, 0x222222);
    aBipod1.position.set(-0.04, -0.08, -0.55);
    aBipod1.rotation.z = 0.4;
    var aBipod2 = cylinderZ(0.015, 0.015, 0.18, 0x222222);
    aBipod2.position.set(0.04, -0.08, -0.55);
    aBipod2.rotation.z = -0.4;
    awp.add(aStock, aReceiver, aBarrel, aScope, aScopeCap1, aScopeCap2, aBolt, aMag, aGrip, aBipod1, aBipod2);
    var aMuzzle = new THREE.Object3D();
    aMuzzle.position.set(0, 0.04, -0.97);
    awp.add(aMuzzle);
    muzzleAnchors.awp = aMuzzle;
    vmGunGroup.add(awp);
    gunModels.awp = awp;

      // ---- 连狙 DMR ----
      var dmr = new THREE.Group();
      var dStock = boxMesh(0.08, 0.12, 0.3, 0x1a2a1a, { roughness: 0.55 });
      dStock.position.set(0, 0.0, 0.38);
      var dReceiver = boxMesh(0.09, 0.12, 0.5, 0x2a4a2a, { roughness: 0.45, metalness: 0.25 });
      dReceiver.position.set(0, 0.01, 0.0);
      var dHandguard = boxMesh(0.08, 0.1, 0.28, 0x2a3a2a);
      dHandguard.position.set(0, -0.01, -0.28);
      var dBarrel = cylinderZ(0.024, 0.024, 0.55, 0x111111, { metalness: 0.85, roughness: 0.2 });
      dBarrel.position.set(0, 0.05, -0.55);
      var dScope = cylinderZ(0.024, 0.03, 0.2, 0x0c0c0c, { metalness: 0.5, roughness: 0.3 });
      dScope.position.set(0, 0.13, 0.02);
        var dLens = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x116688 }));
        dLens.rotation.x = -Math.PI / 2;
        dLens.position.set(0, 0.13, 0.13);
        dmr.add(dLens);
      var dMag = boxMesh(0.06, 0.16, 0.1, 0x333333);
      dMag.position.set(0, -0.13, 0.0);
      dMag.rotation.x = -0.15;
      var dGrip = boxMesh(0.07, 0.11, 0.08, 0x1a1a1a);
      dGrip.position.set(0, -0.1, 0.18);
      dGrip.rotation.x = 0.3;
      var dFront = boxMesh(0.02, 0.04, 0.02, 0x111111);
      dFront.position.set(0, 0.1, -0.8);
      var dRear = boxMesh(0.02, 0.04, 0.02, 0x111111);
      dRear.position.set(0, 0.1, 0.1);
      dmr.add(dStock, dReceiver, dHandguard, dBarrel, dScope, dMag, dGrip, dFront, dRear);
      var dMuzzle = new THREE.Object3D();
      dMuzzle.position.set(0, 0.05, -0.83);
      dmr.add(dMuzzle);
      muzzleAnchors.dmr = dMuzzle;
      vmGunGroup.add(dmr);
      gunModels.dmr = dmr;

      // ---- 重机枪 LMG ----
      var lmg = new THREE.Group();
      var lmgBody = boxMesh(0.11, 0.15, 0.7, 0x2a2a2a, { metalness: 0.4, roughness: 0.45 });
      lmgBody.position.set(0, 0.02, -0.05);
      var lmgBarrel = cylinderZ(0.035, 0.035, 0.7, 0x111111, { metalness: 0.85, roughness: 0.2 });
      lmgBarrel.position.set(0, 0.06, -0.65);
      var lmgHandguard = boxMesh(0.1, 0.12, 0.34, 0x3a3a3a);
      lmgHandguard.position.set(0, -0.01, -0.45);
      var lmgMag = boxMesh(0.08, 0.22, 0.14, 0x333333);
      lmgMag.position.set(0, -0.16, 0.02);
      lmgMag.rotation.x = -0.2;
      var lmgStock = boxMesh(0.08, 0.13, 0.24, 0x1a1a1a);
      lmgStock.position.set(0, 0.0, 0.38);
      var lmgGrip = boxMesh(0.08, 0.13, 0.09, 0x1a1a1a);
      lmgGrip.position.set(0, -0.11, 0.2);
      lmgGrip.rotation.x = 0.32;
      var lmgSight = boxMesh(0.03, 0.05, 0.03, 0x111111);
      lmgSight.position.set(0, 0.12, -0.1);
        var lmgDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200 }));
        lmgDot.position.set(0, 0.12, -0.1);
        lmg.add(lmgDot);
      var lmgBipod1 = cylinderZ(0.015, 0.015, 0.22, 0x222222);
      lmgBipod1.position.set(-0.05, -0.09, -0.7);
      lmgBipod1.rotation.z = 0.4;
      var lmgBipod2 = cylinderZ(0.015, 0.015, 0.22, 0x222222);
      lmgBipod2.position.set(0.05, -0.09, -0.7);
      lmgBipod2.rotation.z = -0.4;
      lmg.add(lmgBody, lmgBarrel, lmgHandguard, lmgMag, lmgStock, lmgGrip, lmgSight, lmgBipod1, lmgBipod2);
      var lmgMuzzle = new THREE.Object3D();
      lmgMuzzle.position.set(0, 0.06, -1.0);
      lmg.add(lmgMuzzle);
      muzzleAnchors.lmg = lmgMuzzle;
      vmGunGroup.add(lmg);
      gunModels.lmg = lmg;

    vmGroup.add(vmGunGroup);
  }

  // ----------------------------------------------------------
  // 第一人称近战模型（细化）
  // ----------------------------------------------------------
  function createMeleeModels() {
    vmMeleeGroup = new THREE.Group();

    // ---- 匕首 ----
    var knife = new THREE.Group();
    var kHandle = cylinderZ(0.02, 0.022, 0.15, 0x4a3020, { roughness: 0.6 }, 10);
    kHandle.position.set(0, 0.0, 0.06);
    var kGuard = boxMesh(0.07, 0.025, 0.025, 0x333333, { metalness: 0.6, roughness: 0.3 });
    kGuard.position.set(0, -0.01, -0.02);
    var kBlade = cylinderZ(0.005, 0.03, 0.26, 0xd0d0d0, { metalness: 0.95, roughness: 0.2 }, 4);
    kBlade.position.set(0, 0.04, -0.18);
    knife.add(kHandle, kGuard, kBlade);
    vmMeleeGroup.add(knife);
    meleeModels.knife = knife;

    // ---- 消防斧 ----
    var axe = new THREE.Group();
    var aHandle = cylinderZ(0.025, 0.025, 0.6, 0x6b4a2a, { roughness: 0.65 }, 10);
    aHandle.position.set(0, -0.02, -0.02);
    var aHead = boxMesh(0.06, 0.2, 0.24, 0x999999, { metalness: 0.75, roughness: 0.3 });
    aHead.position.set(0, 0.1, -0.2);
    var aEdge = boxMesh(0.024, 0.18, 0.12, 0xcc3333, { metalness: 0.5, roughness: 0.4 });
    aEdge.position.set(0, 0.1, -0.34);
    axe.add(aHandle, aHead, aEdge);
    vmMeleeGroup.add(axe);
    meleeModels.axe = axe;

    // ---- 武士刀 ----
    var katana = new THREE.Group();
    var tHandle = cylinderZ(0.018, 0.018, 0.28, 0x1a1a1a, { roughness: 0.5 }, 10);
    tHandle.position.set(0, 0.0, 0.14);
    var tWrap1 = cylinderZ(0.024, 0.024, 0.04, 0x333333, { roughness: 0.6 }, 10);
    tWrap1.position.set(0, 0.0, 0.06);
    var tWrap2 = cylinderZ(0.024, 0.024, 0.04, 0x333333, { roughness: 0.6 }, 10);
    tWrap2.position.set(0, 0.0, 0.14);
    var tGuard = cylinderZ(0.065, 0.065, 0.02, 0xbb9922, { metalness: 0.8, roughness: 0.25 }, 16);
    tGuard.position.set(0, 0.0, -0.01);
    var tBlade = cylinderZ(0.006, 0.028, 0.6, 0xcfcfcf, { metalness: 0.95, roughness: 0.18 }, 4);
    tBlade.position.set(0, 0.045, -0.36);
    katana.add(tHandle, tWrap1, tWrap2, tGuard, tBlade);
    vmMeleeGroup.add(katana);
    meleeModels.katana = katana;

      // ---- 尼泊尔军刀 ----
      var kukri = new THREE.Group();
      var kuHandle = cylinderZ(0.02, 0.024, 0.16, 0x3a2a18, { roughness: 0.6 }, 10);
      kuHandle.position.set(0, 0.0, 0.07);
      var kuGuard = boxMesh(0.07, 0.025, 0.025, 0x555555, { metalness: 0.7, roughness: 0.3 });
      kuGuard.position.set(0, -0.01, -0.02);
      var kuBlade = cylinderZ(0.006, 0.038, 0.3, 0xb0b0b0, { metalness: 0.95, roughness: 0.18 }, 4);
      kuBlade.position.set(0, 0.04, -0.2);
      var kuTip = boxMesh(0.025, 0.08, 0.1, 0xb0b0b0, { metalness: 0.95, roughness: 0.18 });
      kuTip.position.set(0, 0.05, -0.36);
      kuTip.rotation.z = 0.25;
      kukri.add(kuHandle, kuGuard, kuBlade, kuTip);
      vmMeleeGroup.add(kukri);
      meleeModels.kukri = kukri;

      // ---- 电锯 ----
      var chainsaw = new THREE.Group();
      var cBody = boxMesh(0.13, 0.14, 0.34, 0xff6600, { roughness: 0.45 });
      cBody.position.set(0, 0.0, -0.05);
      var cTopHandle = boxMesh(0.05, 0.06, 0.22, 0x222222);
      cTopHandle.position.set(0, 0.12, -0.08);
      var cRearHandle = boxMesh(0.05, 0.08, 0.12, 0x222222);
      cRearHandle.position.set(0, -0.06, 0.18);
      var cBar = boxMesh(0.025, 0.16, 0.52, 0xcccccc, { metalness: 0.85, roughness: 0.25 });
      cBar.position.set(0, 0.02, -0.4);
      var cTeeth1 = boxMesh(0.04, 0.04, 0.04, 0x222222);
      cTeeth1.position.set(0, 0.1, -0.5);
      var cTeeth2 = boxMesh(0.04, 0.04, 0.04, 0x222222);
      cTeeth2.position.set(0, -0.06, -0.52);
      var cTeeth3 = boxMesh(0.04, 0.04, 0.04, 0x222222);
      cTeeth3.position.set(0, 0.1, -0.34);
      var cTeeth4 = boxMesh(0.04, 0.04, 0.04, 0x222222);
      cTeeth4.position.set(0, -0.06, -0.36);
      chainsaw.add(cBody, cTopHandle, cRearHandle, cBar, cTeeth1, cTeeth2, cTeeth3, cTeeth4);
      vmMeleeGroup.add(chainsaw);
      meleeModels.chainsaw = chainsaw;

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
      gunModels[id].visible = !isMelee && id === currentRangedId();
    });
    Object.keys(meleeModels).forEach(function (id) {
      meleeModels[id].visible = isMelee && id === local.melee;
    });
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

  function createRemotePlayer(id, name) {
    var group = new THREE.Group();
    var bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    var hue = (id * 0.61803398875) % 1;
    var suitColor = new THREE.Color().setHSL(hue, 0.65, 0.52);
    var suitMat = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.6, metalness: 0.15, transparent: true, opacity: 1 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.7, transparent: true, opacity: 1 });
    var skinMat = new THREE.MeshStandardMaterial({ color: 0xe8c39e, roughness: 0.8, transparent: true, opacity: 1 });
    var visorMat = new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x226688, roughness: 0.2 });
    var helmetMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 1 });
    var bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, transparent: true, opacity: 1 });

    var bodyMats = [suitMat, darkMat, skinMat, helmetMat, bootMat];

      var armorMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 1 });
      bodyMats.push(armorMat);

    // 躯干
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.38), suitMat);
    torso.position.y = 1.3;
    var chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), darkMat);
    chest.position.set(0, 1.46, 0.14);
    var pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.34), darkMat);
    pelvis.position.y = 0.85;

    // 头
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skinMat);
    head.position.y = 1.98;
    var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat);
    helmet.position.y = 2.02;
    var visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.08), visorMat);
    visor.position.set(0, 1.98, 0.23);

    // 手臂
    function createArm(side) {
      var arm = new THREE.Group();
      arm.position.set(side * 0.38, 1.52, 0);
      var upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), suitMat);
      upper.position.y = -0.24;
      var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), suitMat);
      elbow.position.y = -0.5;
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skinMat);
      hand.position.y = -0.58;
      arm.add(upper); arm.add(elbow); arm.add(hand);
      return arm;
    }
    var leftArm = createArm(-1);
    var rightArm = createArm(1);

    // 腿
    function createLeg(side) {
      var leg = new THREE.Group();
      leg.position.set(side * 0.17, 0.88, 0);
      var thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), darkMat);
      thigh.position.y = -0.3;
      var boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.34), bootMat);
      boot.position.set(0, -0.66, -0.05);
      leg.add(thigh); leg.add(boot);
      return leg;
    }
    var leftLeg = createLeg(-1);
    var rightLeg = createLeg(1);

      // 手臂/腿部胶囊化，更圆润
      var armCapGeo = new THREE.CapsuleGeometry(0.1, 0.45, 4, 8);
      var legCapGeo = new THREE.CapsuleGeometry(0.13, 0.5, 4, 8);
      var leftArmCap = new THREE.Mesh(armCapGeo, suitMat); leftArmCap.position.y = -0.3; leftArm.add(leftArmCap);
      var rightArmCap = new THREE.Mesh(armCapGeo, suitMat); rightArmCap.position.y = -0.3; rightArm.add(rightArmCap);
      var leftLegCap = new THREE.Mesh(legCapGeo, darkMat); leftLegCap.position.y = -0.33; leftLeg.add(leftLegCap);
      var rightLegCap = new THREE.Mesh(legCapGeo, darkMat); rightLegCap.position.y = -0.33; rightLeg.add(rightLegCap);

    // 手持武器
    var weaponGroup = new THREE.Group();
    weaponGroup.position.set(0.4, 1.2, -0.2);
    var gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })
    );
    gunMesh.position.set(0, 0.03, -0.18);
    var meleeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 })
    );
    meleeMesh.position.set(0, 0.04, -0.15);

      var gunGroup = new THREE.Group();
      gunGroup.add(gunMesh);
      var gunBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.3 })
      );
      gunBarrel.rotation.x = -Math.PI / 2;
      gunBarrel.position.set(0, 0.06, -0.38);
      gunGroup.add(gunBarrel);
      var gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.08), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 }));
      gunMag.position.set(0, -0.11, 0.0);
      gunMag.rotation.x = -0.2;
      gunGroup.add(gunMag);
      var gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.16), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
      gunStock.position.set(0, 0.0, 0.2);
      gunGroup.add(gunStock);

      var meleeGroup = new THREE.Group();
      meleeGroup.add(meleeMesh);
      var meleeHandle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.6 })
      );
      meleeHandle.rotation.x = -Math.PI / 2;
      meleeHandle.position.set(0, 0.0, 0.06);
      meleeGroup.add(meleeHandle);
    weaponGroup.add(gunGroup);
    weaponGroup.add(meleeGroup);

    bodyGroup.add(torso, chest, pelvis, head, helmet, visor, leftArm, rightArm, leftLeg, rightLeg, weaponGroup);

      // 躯干胶囊化 + 护甲/背包/肩甲/膝甲/头盔细节
      var torsoCap = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 4, 10), suitMat);
      torsoCap.position.y = 1.28;
      torsoCap.scale.set(1, 1, 0.95);
      bodyGroup.add(torsoCap);

      var chestArmor = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.34), armorMat);
      chestArmor.position.set(0, 1.44, 0.1);
      bodyGroup.add(chestArmor);
      var chestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x33ddff, emissive: 0x116688 }));
      chestGlow.position.set(0, 1.4, 0.28);
      bodyGroup.add(chestGlow);

      var backpack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), darkMat);
      backpack.position.set(0, 1.35, -0.33);
      bodyGroup.add(backpack);

      var shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), armorMat);
      shoulderL.position.set(-0.38, 1.55, 0);
      var shoulderR = shoulderL.clone(); shoulderR.position.x = 0.38;
      bodyGroup.add(shoulderL); bodyGroup.add(shoulderR);

      var kneeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), armorMat);
      kneeL.position.set(-0.17, 0.55, 0.08);
      var kneeR = kneeL.clone(); kneeR.position.x = 0.17;
      bodyGroup.add(kneeL); bodyGroup.add(kneeR);

      var helmetCrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.3), armorMat);
      helmetCrest.position.set(0, 2.32, -0.05);
      bodyGroup.add(helmetCrest);

    // 血条
    var hb = createHealthBar();
    hb.group.position.y = 2.55;
    bodyGroup.add(hb.group);

    // 名字
    var nameSprite = makeNameSprite(name);
    nameSprite.position.y = 2.85;
    bodyGroup.add(nameSprite);

    scene.add(group);

    var r = {
      id: id,
      name: name,
      group: group,
      bodyGroup: bodyGroup,
      bodyMats: bodyMats,
      nameSprite: nameSprite,
      healthFill: hb.fill,
      gunMesh: gunMesh,
      meleeMesh: meleeMesh,
        gunGroup: gunGroup,
        meleeGroup: meleeGroup,
      weaponGroup: weaponGroup,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      targetPos: new THREE.Vector3(0, 0, 0),
      renderPos: new THREE.Vector3(0, 0, 0),
      targetYaw: 0,
      renderYaw: 0,
      targetPitch: 0,
      renderPitch: 0,
      vel: new THREE.Vector3(0, 0, 0),
      walkPhase: Math.random() * Math.PI * 2,
      deadT: 0,
      hp: 100,
      alive: true,
      current: 'primary',
      melee: 'knife',
      primary: 'rifle',
      secondary: 'pistol',
      kills: 0,
      deaths: 0,
      fireAnim: 0,
      swingAnim: 0,
      firstUpdate: true
    };
    remotePlayers.set(id, r);
    return r;
  }

  function updateRemoteWeaponVisual(r) {
    var isMelee = r.current === 'melee';
    r.gunMesh.visible = !isMelee;
      if (r.gunGroup) r.gunGroup.visible = !isMelee;
    r.meleeMesh.visible = isMelee;
      if (r.meleeGroup) r.meleeGroup.visible = isMelee;
    var rangedId = r.current === 'secondary' ? r.secondary : r.primary;
      var wpn = isMelee ? WEAPONS[r.melee] : WEAPONS[rangedId];
    if (wpn) {
      r.gunMesh.material.color.set(wpn.color);
      r.meleeMesh.material.color.set(wpn.color);
    }
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
    reloadTip.style.display = (!isMelee && local.reloading) ? 'block' : 'none';
  }

  function updateCrosshair() {
    var speedFrac = clamp(Math.sqrt(local.vel.x * local.vel.x + local.vel.z * local.vel.z) / 13, 0, 1);
    var gap = 7 + speedFrac * 8 + Math.abs(recoilPitch) * 110 + (triggerDown ? 2 : 0);
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
        case 'grenade':
            if (msg.pos) addFlash(new THREE.Vector3(msg.pos.x, msg.pos.y, msg.pos.z), 0xff3333, 0.25, 1.2, false);
            break;
        case 'explosion':
            if (msg.pos) createExplosionEffect(new THREE.Vector3(msg.pos.x, msg.pos.y, msg.pos.z));
            break;
        case 'kill':
        addKillFeed(msg);
        if (msg.victimId === local.id) { respawnCountdownEnd = Date.now() + 3000; playDeathSound(); }
        break;
      case 'reload':
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
        send({ t: 'attack', down: true, yaw: local.yaw, pitch: local.pitch });
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
      var dir = aimDir();
      var pos = {
        x: clamp(local.pos.x + dir.x * 5, -ARENA_HALF, ARENA_HALF),
        y: 1.2,
        z: clamp(local.pos.z + dir.z * 5, -ARENA_HALF, ARENA_HALF)
      };
      send({ t: 'smoke', pos: pos });
    }

    function throwGrenade() {
      if (!gameStarted || !local.alive) return;
      var now = performance.now();
      if (now - lastGrenadeTime < 3000) return;
      lastGrenadeTime = now;
      var dir = aimDir();
      var pos = {
        x: clamp(local.pos.x + dir.x * 6, -ARENA_HALF, ARENA_HALF),
        y: 1.0,
        z: clamp(local.pos.z + dir.z * 6, -ARENA_HALF, ARENA_HALF)
      };
      send({ t: 'grenade', pos: pos });
    }
  function switchWeapon(slot) {
    if (!gameStarted) return;
    if (slot === 'melee') { local.current = 'melee'; }
    else if (slot === 'secondary') { local.current = 'secondary'; local.ranged = local.secondary; local.ammo = local.ammoSecondary; }
      else if (slot === 'primary') { local.current = 'primary'; local.ranged = local.primary; local.ammo = local.ammoPrimary; }
    else return;
    if (triggerDown) { triggerDown = false; send({ t: 'attack', down: false }); }
    ads = false;
    applyWeaponVisibility();
    updateHUD();
    send({ t: 'switch', slot: local.current });
  }

  function startReload() {
    if (!gameStarted || !local.alive || local.current === 'melee') return;
    var wpn = WEAPONS[local.ranged];
    if (local.reloading || local.ammo >= wpn.mag) return;
    local.reloading = true;
    send({ t: 'reload' });
    playReloadSound();
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

    // 后坐力
    var kick = wpn.id === 'awp' ? 0.055 : (wpn.id === 'dmr' ? 0.03 : (wpn.id === 'shotgun' ? 0.035 : (wpn.id === 'lmg' ? 0.016 : (wpn.id === 'rifle' ? 0.012 : 0.018))));
    recoilPitch += kick * (0.7 + Math.random() * 0.6);
    recoilYaw += (Math.random() - 0.5) * kick * 0.6;
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

    // 弹道
    if (wpn.pellets > 1) {
      for (var i = 0; i < wpn.pellets; i++) {
        var d = ray.dir.clone();
        d.x += rand(-wpn.spread, wpn.spread);
        d.y += rand(-wpn.spread, wpn.spread);
        d.z += rand(-wpn.spread, wpn.spread);
        d.normalize();
        var end = ray.origin.clone().addScaledVector(d, wpn.range);
        addTracer(ray.origin, end, 0.16);
      }
    } else {
      addTracer(ray.origin, ray.end, wpn.id === 'awp' ? 0.28 : 0.12);
    }
    addImpact(ray.end, 0xffe08a, 4, false);
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

    // 开镜时隐藏/移动武器
    if (adsActive && local.ranged === 'awp') {
      vmGroup.visible = false;
    } else {
      vmGroup.visible = true;
    }

    // 后坐力恢复
    var rec = 1 - Math.exp(-dt * 12);
    recoilPitch -= recoilPitch * rec;
    recoilYaw -= recoilYaw * rec;
    recoilZ -= recoilZ * rec;

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
        var sw = Math.sin(r.walkPhase) * 0.55 * speedFrac;
        r.leftArm.rotation.x = sw;
        r.rightArm.rotation.x = -sw;
        r.leftLeg.rotation.x = -sw;
        r.rightLeg.rotation.x = sw;
        r.bodyMats.forEach(function (m) { m.opacity = 1; });
        r.nameSprite.material.opacity = 1;
      } else {
        r.deadT = Math.min(1.4, r.deadT + dt * 3);
        r.bodyMats.forEach(function (m) { m.opacity = 0.45; });
        r.nameSprite.material.opacity = 0.5;
      }
      r.bodyGroup.rotation.x = r.alive ? 0 : Math.min(1.35, r.deadT);
      r.bodyGroup.position.y = r.alive ? 0 : Math.min(0.3, r.deadT * 0.22);

      // 开火/挥砍动画
      if (r.fireAnim > 0) {
        r.fireAnim -= dt;
        r.weaponGroup.position.z = -0.2 + Math.sin((0.15 - Math.max(r.fireAnim, 0)) / 0.15 * Math.PI) * 0.14;
        if (r.fireAnim <= 0) r.weaponGroup.position.z = -0.2;
      }
      if (r.swingAnim > 0) {
        r.swingAnim -= dt;
        r.weaponGroup.rotation.x = -1.5 * Math.sin((0.18 - Math.max(r.swingAnim, 0)) / 0.18 * Math.PI);
        if (r.swingAnim <= 0) r.weaponGroup.rotation.x = 0;
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
      updateRespawnCountdown();
      if (skyMesh) skyMesh.position.copy(camera.position);

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
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') startBtn.click();
      });

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
      var name = nameInput.value.trim() || ('玩家' + Math.floor(Math.random() * 1000));
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
})();
