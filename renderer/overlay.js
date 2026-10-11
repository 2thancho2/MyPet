'use strict';

const bridge = window.api;   // 'api'라는 이름으로 다시 선언하면 충돌해서 실행이 멈춤
const TICK_MS = 40;

const stage = document.getElementById('stage');
const fpCanvas = document.getElementById('footprints');
const fpCtx = fpCanvas.getContext('2d');
const menuEl = document.getElementById('menu');
const catcher = document.getElementById('catcher');

let S = null;                 // 현재 설정
let tick = 0;
const pets = new Map();       // id -> Pet
let footprints = [];
let fpDirty = false;
let menuPet = null;
let lastMouse = { x: 300, y: 300 };

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

// ───────────── 기본 펫 스프라이트 ─────────────
const BOXES = {
  idle: [[26, 85, 142, 149], [176, 87, 146, 149], [328, 90, 147, 146], [483, 88, 150, 149], [640, 86, 153, 151],
         [845, 90, 137, 150], [1000, 90, 155, 151], [1184, 95, 157, 145], [1376, 93, 142, 147]],
  move: [[25, 334, 136, 138], [173, 336, 131, 142], [322, 336, 140, 143], [481, 336, 134, 143], [641, 342, 143, 138],
         [809, 344, 124, 135], [960, 344, 128, 135], [1098, 353, 133, 126], [1255, 330, 114, 136], [1388, 314, 131, 139]],
  pose: [[20, 567, 146, 144], [173, 576, 140, 143], [329, 586, 124, 134], [461, 577, 131, 135], [611, 592, 135, 133],
         [769, 578, 125, 143], [917, 576, 127, 147], [1065, 587, 137, 133], [1218, 595, 151, 130], [1387, 589, 134, 135]],
  action: [[27, 818, 129, 136], [178, 831, 120, 131], [319, 830, 131, 130], [497, 847, 120, 110], [639, 844, 105, 112],
           [787, 842, 120, 116], [930, 878, 125, 81], [1089, 840, 121, 117], [1231, 818, 144, 125], [1403, 843, 122, 115]],
};
const pickFrames = (g, idx) => idx.map((i) => BOXES[g][i]);
const SHEET_ANIMS = {
  idle: pickFrames('idle', [0, 1, 2]),
  walk: pickFrames('move', [0, 1, 2, 3]),
  run: pickFrames('move', [4, 5, 6, 7]),
  jump: pickFrames('move', [8, 9]),
  excited: pickFrames('pose', [0, 1, 2, 3]),
  cute: pickFrames('pose', [4, 5, 6, 7]),
  sleep: pickFrames('pose', [8, 9]),
  lick: pickFrames('action', [3]),
  surprise: pickFrames('action', [0]),
};
const ANIM_SPEED = { idle: 15, walk: 5, run: 3, jump: 5, excited: 6, cute: 10, sleep: 18, lick: 7, surprise: 7 };
const FLIP_ANIMS = new Set(['walk', 'run', 'jump']);
// 사진 펫의 프레임 전환 속도 (틱 단위, 클수록 느림). 걷기 2장이 발걸음처럼 보이도록
const PHOTO_SPEED = { idle: 20, walk: 8, run: 5, excited: 7, sleep: 24 };

// 사진 펫: 동작별 사진 묶음과, 해당 사진이 없을 때 대신 쓸 순서
const PHOTO_STATES = ['idle', 'walk', 'run', 'excited', 'sleep'];
const PHOTO_FALLBACK = {
  idle: ['idle'], walk: ['walk', 'idle'], run: ['run', 'walk', 'idle'],
  excited: ['excited', 'idle'], jump: ['excited', 'idle'], surprise: ['excited', 'idle'],
  cute: ['excited', 'idle'], lick: ['excited', 'idle'], sleep: ['sleep', 'idle'],
};

const sheetImg = new Image();
let sheetState = 'loading';
sheetImg.onload = () => { sheetState = 'ok'; };
sheetImg.onerror = () => { sheetState = 'missing'; };   // 이미지가 없으면 이모지로 대체
sheetImg.src = '../assets/desktop_pet_sprites.png';

const ICONS = { food: '🥣', water: '🥛', comb: '🧹' };
const NAMES = { food: '먹이 그릇', water: '물그릇', comb: '빗' };

// ───────────── 펫 ─────────────
class Pet {
  constructor(cfg) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.hunger = 80; this.thirst = 80; this.clean = 80;
    this.affection = 10; this.level = 1;

    this.mode = 'idle';
    this.anim = 'idle'; this.animIndex = 0; this.animClock = 0;
    this.facing = 1;
    this.actionUntil = 0; this.wakeAt = 0;
    this.nextAction = tick + rnd(40, 120);
    this.target = { x: 0, y: 0 };
    this.chasing = null;

    this.dragging = false; this.moved = false; this.wasSleeping = false;
    this.press = { x: 0, y: 0 }; this.grab = { x: 0, y: 0 };
    this.showStatus = false; this.statusEnd = 0;
    this.bubbleEnd = 0;
    this.note = null;
    this.photos = {};

    this.buildDom();
    this.updateCfg(cfg);
    this.x = rnd(40, Math.max(60, innerWidth - this.size - 40));
    this.y = innerHeight - this.size - 60;
  }

  get size() { return S.petSize; }
  get name() { return this.cfg.name || '펫'; }

  buildDom() {
    this.el = div('pet');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.bubble = div('bubble');
    this.statusEl = div('status');
    this.el.append(this.canvas, this.bubble, this.statusEl);
    stage.appendChild(this.el);
    this.bindPointer();
  }

  updateCfg(cfg) {
    this.cfg = cfg;
    this.photos = {};
    if (cfg.kind === 'photo') {
      // anims: { idle:[사진...], walk:[...], ... } (구버전 images 형식도 지원)
      const src = cfg.anims || {};
      for (const key of PHOTO_STATES) {
        let list = src[key];
        if (!list && cfg.images && cfg.images[key]) list = [cfg.images[key]];
        this.photos[key] = (list || []).map((url) => { const im = new Image(); im.src = url; return im; });
      }
    }
    this.applySize();
  }

  // 현재 동작에 쓸 사진 목록 (없으면 비슷한 동작의 사진으로 대체)
  photoList() {
    for (const key of (PHOTO_FALLBACK[this.anim] || ['idle'])) {
      if (this.photos[key] && this.photos[key].length) return this.photos[key];
    }
    return [];
  }

  // 현재 동작 전용으로 올린 사진 수 (2장 이상이면 프레임 애니메이션)
  ownFrameCount() {
    const key = (PHOTO_FALLBACK[this.anim] || ['idle'])[0];
    return (this.photos[key] || []).length;
  }

  applySize() {
    const s = this.size, dpr = window.devicePixelRatio || 1;
    this.canvas.width = s * dpr; this.canvas.height = s * dpr;
    this.canvas.style.width = s + 'px'; this.canvas.style.height = s + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.el.style.width = s + 'px'; this.el.style.height = s + 'px';
    this.canvas.style.filter = (this.cfg.kind === 'sheet' && this.cfg.hue) ? `hue-rotate(${this.cfg.hue}deg)` : '';
  }

  destroy() {
    this.el.remove();
    if (this.note) this.note.remove();
  }

  // ── 애니메이션 ──
  setAnim(name, force = false) {
    if (!(name in SHEET_ANIMS)) name = 'idle';
    if (this.anim !== name || force) { this.anim = name; this.animIndex = 0; this.animClock = 0; }
  }

  advanceAnim() {
    this.animClock++;
    const limit = (this.cfg.kind === 'photo' && PHOTO_SPEED[this.anim]) || ANIM_SPEED[this.anim] || 8;
    if (this.animClock >= limit) {
      this.animClock = 0;
      if (this.cfg.kind === 'photo') {
        this.animIndex = (this.animIndex + 1) % Math.max(1, this.photoList().length);
      } else {
        const n = SHEET_ANIMS[this.anim].length;
        this.animIndex = this.anim === 'idle'
          ? (Math.random() < .72 ? 0 : rnd(1, n - 1))
          : (this.animIndex + 1) % n;
      }
    }
  }

  draw() {
    const s = this.size, ctx = this.ctx;
    ctx.clearRect(0, 0, s, s);
    let img, sx, sy, sw, sh;
    if (this.cfg.kind === 'photo') {
      const list = this.photoList();
      img = list[this.animIndex % Math.max(1, list.length)];
      if (!img || !img.complete || !img.naturalWidth) return;
      sx = 0; sy = 0; sw = img.naturalWidth; sh = img.naturalHeight;
    } else if (sheetState === 'ok') {
      const seq = SHEET_ANIMS[this.anim];
      [sx, sy, sw, sh] = seq[this.animIndex % seq.length];
      img = sheetImg;
    } else {
      ctx.font = `${Math.round(s * 0.7)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.cfg.emoji || '🐶', s / 2, s * 0.85);
      return;
    }
    const box = s * 0.92, k = Math.min(box / sw, box / sh), w = sw * k, h = sh * k;
    ctx.drawImage(img, sx, sy, sw, sh, (s - w) / 2, s - h - s * 0.03, w, h);
  }

  applyTransform() {
    let bob = 0, rot = 0, sx = 1, sy = 1;
    const t = tick, a = this.anim;
    if (this.cfg.kind === 'photo') {
      // 이 동작 전용 사진이 2장 이상이면 프레임이 움직임을 대신하고, 아니면 선택한 스타일로 움직임
      if (this.ownFrameCount() < 2) {
        const motion = this.cfg.motion || 'bounce';
        const f = a === 'run' ? 2 : 3;
        if (a === 'sleep') { rot = 12; sy = 0.95 + Math.sin(t / 20) * 0.03; }
        else if (a === 'walk' || a === 'run') {
          if (motion === 'bounce') { bob = -Math.abs(Math.sin(t / f)) * (a === 'run' ? 14 : 8); rot = Math.sin(t / f) * (a === 'run' ? 8 : 4); }
          else if (motion === 'wobble') { rot = Math.sin(t / f) * (a === 'run' ? 16 : 10); }
          else if (motion === 'float') { bob = Math.sin(t / 8) * 8 - 6; }
        }
        else if (a === 'excited' || a === 'jump') { bob = -Math.abs(Math.sin(t / 3)) * 20; rot = Math.sin(t / 3) * 10; }
        else if (a === 'cute') { rot = Math.sin(t / 5) * 10; }
        else if (a === 'lick') { sx = 1 + Math.sin(t / 2) * 0.05; }
        else if (a === 'surprise') { bob = -Math.abs(Math.sin(t / 3)) * 10; }
        else { sy = 1 + Math.sin(t / 10) * 0.02; }
      } else if (a === 'walk' || a === 'run') {
        bob = -Math.abs(Math.sin(t / 4)) * (a === 'run' ? 6 : 3);   // 프레임 사진에 살짝 통통 튀는 느낌만 더함
      }
    } else {
      if (a === 'walk' || a === 'run') bob = [0, -3, 1, -2][this.animIndex % 4];
      else if (a === 'jump') bob = this.animIndex % 2 === 0 ? -5 : 0;
      else if (a === 'sleep') bob = 2;
    }

    let flip = 1;
    if (this.cfg.kind === 'photo') {
      const faces = this.cfg.faces || 'right';           // 사진 속 펫이 바라보는 방향
      if (faces === 'right') flip = this.facing < 0 ? -1 : 1;
      else if (faces === 'left') flip = this.facing > 0 ? -1 : 1;
    } else {
      flip = (FLIP_ANIMS.has(a) && this.facing > 0) ? -1 : 1;
    }
    this.canvas.style.transform = `translateY(${bob}px) rotate(${rot}deg) scale(${sx * flip}, ${sy})`;
  }

  // ── 말풍선/상태 ──
  say(text, secs = 3) {
    this.bubble.textContent = text;
    this.bubbleEnd = tick + Math.round(secs * 1000 / TICK_MS);
  }

  renderStatusHtml() {
    const bar = (icon, label, v) =>
      `<div class="row"><span>${icon} ${label} ${v}</span><div class="bar"><i style="width:${v}%"></i></div></div>`;
    return `<div class="title">${esc(this.name)} · Lv.${this.level} (친밀 ${this.affection})</div>`
      + bar('🥣', '배부름', this.hunger)
      + bar('🥛', '수분', this.thirst)
      + bar('✨', '청결', this.clean);
  }

  render() {
    this.el.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(this.y)}px)`;

    const showB = this.bubbleEnd > tick;
    this.bubble.style.display = showB ? 'block' : 'none';
    if (showB) {                                   // 화면 밖으로 안 나가게 보정
      this.bubble.style.marginLeft = '0px';
      const r = this.bubble.getBoundingClientRect();
      let shift = 0;
      if (r.left < 4) shift = 4 - r.left;
      else if (r.right > innerWidth - 4) shift = innerWidth - 4 - r.right;
      if (shift) this.bubble.style.marginLeft = shift + 'px';
    }

    if (this.showStatus) {
      if (tick % 5 === 0 || this.statusEl.style.display !== 'block') this.statusEl.innerHTML = this.renderStatusHtml();
      this.statusEl.style.display = 'block';
      this.statusEl.classList.toggle('left', this.x + this.size + 150 > innerWidth);
    } else {
      this.statusEl.style.display = 'none';
    }

    this.draw();
    this.applyTransform();
  }

  // ── 행동 ──
  later(a, b) { return tick + Math.max(20, Math.round(rnd(a, b) * 100 / Math.max(20, S.activityRate))); }

  randomTarget() {
    return { x: rnd(0, Math.max(0, innerWidth - this.size)), y: rnd(60, Math.max(60, innerHeight - this.size)) };
  }

  walkNow() { this.actionUntil = 0; this.wakeAt = 0; this.target = this.randomTarget(); this.mode = 'walk'; this.setAnim('walk'); }
  runNow() {
    this.actionUntil = 0; this.wakeAt = 0; this.target = this.randomTarget();
    this.mode = 'run'; this.setAnim('run'); this.say('신난다 총총총!', 2);
  }
  sleepNow() {
    this.mode = 'idle'; this.setAnim('sleep');
    this.actionUntil = tick + 999999; this.wakeAt = 0;
    this.say('zzZ… 꿈나라로 🌙', 3);
  }
  napFor(ticks) {
    this.mode = 'idle'; this.setAnim('sleep');
    this.actionUntil = this.wakeAt = tick + ticks;
  }
  wake() {
    this.actionUntil = 0; this.wakeAt = 0; this.mode = 'idle';
    this.setAnim('idle'); this.nextAction = tick + 35;
  }
  excitedFor(n, anim = 'excited') {
    this.mode = 'idle'; this.setAnim(anim); this.actionUntil = tick + n; this.nextAction = this.later(100, 180);
  }

  throwPaper(text) {
    if (this.note) this.note.remove();
    const pool = ['나랑 놀자! 🐾', '간식 주세요 🥣', '물 마시고 싶어 🥛', '빗으로 털 빗겨줘! 🧹', '오늘도 화이팅! ✨', '여기 내 자리야!'];
    const el = div('paper');
    el.textContent = text || pool[rnd(0, pool.length - 1)];
    el.style.left = (this.x + this.size / 2) + 'px';
    el.style.top = (this.y + this.size / 2) + 'px';
    makeDraggable(el);
    el.addEventListener('dblclick', () => el.remove());   // 더블클릭하면 치우기
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    stage.appendChild(el);
    this.note = el;
    setTimeout(() => el.remove(), 60000);
    this.excitedFor(35);
    this.say('쪽지 배달 완료!', 2);
  }

  useItem(kind) {
    this.affection += 5;
    if (this.affection >= this.level * 25) { this.level++; this.say(`레벨 업! Lv.${this.level}이 되었어요! 🎉`, 4); }
    if (kind === 'food') { this.hunger = Math.min(100, this.hunger + 35); this.setAnim('lick'); this.say('냠냠! 맛있는 간식이다 🥣'); }
    else if (kind === 'water') { this.thirst = Math.min(100, this.thirst + 40); this.setAnim('cute'); this.say('시원한 물 꿀꺽! 🥛'); }
    else { this.clean = Math.min(100, this.clean + 40); this.setAnim('excited'); this.say('보들보들 기분 좋은 빗질이야! ✨'); }
    this.mode = 'idle';
    this.actionUntil = tick + 40;
  }

  decideIdle() {
    const lively = (this.cfg.personality ?? 50) / 100;
    const r = Math.random();
    if (r < .16) {
      this.excitedFor(45);
    } else if (r < .30) {
      this.excitedFor(35, 'cute');
    } else if (r < .42 && S.chaseMouse) {
      this.target = { x: lastMouse.x - this.size / 2, y: lastMouse.y - this.size - 10 };
      this.mode = 'walk'; this.setAnim('walk'); this.say('마우스 발견! 👀', 2);
    } else if (r < .56 && S.interactions && pets.size > 1) {
      const others = [...pets.values()].filter((p) => p !== this);
      const o = others[rnd(0, others.length - 1)];
      this.target = { x: o.x + rnd(-1, 1) * this.size * 0.6, y: o.y };
      this.mode = 'walk'; this.setAnim('walk'); this.say(`${o.name}한테 가볼까? 🐾`, 2);
    } else if (r < .78) {
      if (lively > .7 && Math.random() < .4) this.runNow(); else this.walkNow();
    } else if (r > .94 && lively < .4) {
      this.napFor(rnd(150, 300)); this.say('졸려… 🌙', 2);
    } else {
      this.nextAction = this.later(90, 180);
    }
  }

  update() {
    this.advanceAnim();
    if (this.anim === 'sleep' && this.wakeAt && tick >= this.wakeAt) { this.wake(); this.say('으아암~ 잘 잤다 😪', 2); }
    if (this.showStatus && tick >= this.statusEnd) this.showStatus = false;
    if (this.dragging || menuPet === this) return;      // 상태창이 열려 있어도 계속 움직임

    const W = innerWidth, H = innerHeight, size = this.size;

    if (this.mode === 'walk' || this.mode === 'run') {
      if (this.chasing) {
        if (tick < this.chasing.until && pets.has(this.chasing.pet.id)) {
          this.target = { x: this.chasing.pet.x, y: this.chasing.pet.y };
        } else {
          this.chasing = null;
        }
      }
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        this.mode = 'idle'; this.chasing = null; this.setAnim('idle');
        this.nextAction = this.later(55, 150);
      } else {
        if (dx) this.facing = dx > 0 ? 1 : -1;
        const sp = Math.max(2, Math.round(S.moveSpeed * (this.mode === 'run' ? 1.8 : 1)));
        this.x += clamp(dx, -sp, sp);
        this.y += clamp(dy, -sp, sp);
        this.setAnim(this.mode);
        if (S.footprints && tick % 6 === 0) {
          footprints.push({ x: this.x + size / 2 + rnd(-5, 5), y: this.y + size - 15 + rnd(-3, 3), a: 180 });
        }
      }
    } else if (tick >= this.actionUntil) {
      if (!['idle', 'sleep'].includes(this.anim)) { this.mode = 'idle'; this.setAnim('idle'); }
      if (tick >= this.nextAction && this.anim !== 'sleep') this.decideIdle();
    }

    this.x = clamp(this.x, 0, Math.max(0, W - size));
    this.y = clamp(this.y, 50, Math.max(50, H - size));   // 위쪽 50px은 말풍선 공간
  }

  // ── 마우스 ──
  bindPointer() {
    const el = this.el;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.dragging = true; this.moved = false;
        this.press = { x: e.clientX, y: e.clientY };
        this.grab = { x: e.clientX - this.x, y: e.clientY - this.y };
        this.wasSleeping = this.anim === 'sleep';
        this.wake();                      // 잠들어 있으면 깨우고, action 상태 초기화
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
      } else if (e.button === 2) {
        openMenu(this, e.clientX, e.clientY);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      if (!this.moved && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 4) this.moved = true;
      if (this.moved) {
        this.x = clamp(e.clientX - this.grab.x, 0, innerWidth - this.size);
        this.y = clamp(e.clientY - this.grab.y, 50, innerHeight - this.size);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      el.style.cursor = 'grab';
      this.nextAction = tick + 35;
      if (!this.moved) {                  // 드래그가 아닌 '클릭'일 때만
        if (this.wasSleeping) this.say('으응… 깼어! 😪', 2);
        else { this.showStatus = !this.showStatus; this.statusEnd = tick + 200; }
      }
    });
  }
}

// ───────────── 드래그 도우미 ─────────────
function makeDraggable(el, onDrop) {
  let g = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    g = { x: e.clientX - r.left, y: e.clientY - r.top };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!g) return;
    el.style.left = (e.clientX - g.x) + 'px';
    el.style.top = (e.clientY - g.y) + 'px';
  });
  el.addEventListener('pointerup', () => {
    if (!g) return;
    g = null;
    if (onDrop) onDrop();
  });
}

function spawnItem(kind, pet) {
  const el = div('item');
  el.textContent = ICONS[kind];
  el.title = NAMES[kind];
  el.style.left = Math.min(innerWidth - 70, pet.x + pet.size + 25) + 'px';
  el.style.top = Math.min(innerHeight - 70, pet.y + 35) + 'px';
  makeDraggable(el, () => {
    const r = el.getBoundingClientRect();
    for (const p of pets.values()) {
      const q = p.el.getBoundingClientRect();
      if (r.right > q.left - 90 && r.left < q.right + 90 && r.bottom > q.top - 90 && r.top < q.bottom + 90) {
        p.useItem(kind);
        el.remove();
        return;
      }
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.appendChild(el);
  pet.say({ food: '먹이 그릇 소환! 🥣', water: '물그릇 소환! 🥛', comb: '빗 소환! 🧹' }[kind], 2);
}

// ───────────── 펫끼리 상호작용 ─────────────
const cooldown = new Map();

function interact(a, b) {
  const la = a.cfg.personality ?? 50, lb = b.cfg.personality ?? 50;
  const avg = (la + lb) / 2, r = Math.random();
  a.mode = 'idle'; b.mode = 'idle';

  if (avg < 35 && r < .6) {                                  // 같이 낮잠
    const t = rnd(200, 400);
    a.napFor(t); b.napFor(t);
    a.say('같이 잘까…? 💤', 3); b.say('zzZ…', 3);
  } else if (r < .4) {                                       // 인사
    a.excitedFor(45); b.excitedFor(45);
    a.say(`안녕, ${b.name}! 👋`, 3); b.say(`어! 반가워 ${a.name}~ ✨`, 3);
  } else if (r < .75) {                                      // 술래잡기
    const chaser = la >= lb ? a : b, runner = chaser === a ? b : a;
    runner.target = runner.randomTarget(); runner.mode = 'run'; runner.setAnim('run');
    chaser.chasing = { pet: runner, until: tick + 125 }; chaser.mode = 'run'; chaser.setAnim('run');
    chaser.say('거기 서~! 😆', 2); runner.say('잡아봐라~ 🏃', 2);
  } else {                                                   // 같이 놀기
    a.excitedFor(60, 'cute'); b.excitedFor(60, 'cute');
    a.say('같이 놀자! 🎵', 3); b.say('좋아~ 🐾', 3);
  }
  a.affection += 2; b.affection += 2;
}

function checkInteractions() {
  if (!S.interactions || pets.size < 2) return;
  const arr = [...pets.values()].filter((p) => !p.dragging && menuPet !== p);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) > Math.min(a.size, b.size) * 0.9) continue;
      const key = [a.id, b.id].sort().join('|');
      if ((cooldown.get(key) || 0) > tick) continue;
      cooldown.set(key, tick + rnd(250, 500));
      interact(a, b);
    }
  }
}

// ───────────── 원형 메뉴 ─────────────
function menuItems(pet) {
  return [
    ['🚶', '산책하기', () => pet.walkNow()],
    ['🏃', '신나게 뛰기', () => pet.runNow()],
    ['💤', '잠깐 재우기', () => pet.sleepNow()],
    ['📄', '쪽지 던지기', () => pet.throwPaper()],
    ['🥣', '먹이 주기', () => spawnItem('food', pet)],
    ['🥛', '물 주기', () => spawnItem('water', pet)],
    ['🧹', '털 빗기', () => spawnItem('comb', pet)],
    [S.footprints ? '🐾' : '💤', S.footprints ? '발자국 ON' : '발자국 OFF', () => bridge.setSettings({ footprints: !S.footprints })],
    ['⚙️', '설정', () => bridge.openSettings()],
    ['👋', '프로그램 종료', () => bridge.quit()],
  ];
}

let ignoring = true;
function setIgnore(v) {
  if (ignoring !== v) { ignoring = v; bridge.ignoreMouse(v); }
}

function openMenu(pet, x, y) {
  menuPet = pet;
  pet.showStatus = false;
  const items = menuItems(pet);
  menuEl.innerHTML = '';
  const label = div('label');
  menuEl.appendChild(label);
  items.forEach(([icon, name, action], i) => {
    const angle = (2 * Math.PI / items.length) * i - Math.PI / 2;
    const b = document.createElement('button');
    b.className = 'mbtn';
    b.textContent = icon;
    b.style.left = (150 + 100 * Math.cos(angle) - 23) + 'px';
    b.style.top = (150 + 100 * Math.sin(angle) - 23) + 'px';
    b.addEventListener('mouseenter', () => { label.textContent = name; label.classList.add('on'); });
    b.addEventListener('mouseleave', () => label.classList.remove('on'));
    b.addEventListener('click', () => { closeMenu(); action(); });
    menuEl.appendChild(b);
  });
  menuEl.style.left = clamp(x - 150, 0, innerWidth - 300) + 'px';
  menuEl.style.top = clamp(y - 150, 0, innerHeight - 300) + 'px';
  menuEl.hidden = false;
  catcher.hidden = false;
  setIgnore(false);
}

function closeMenu() {
  menuPet = null;
  menuEl.hidden = true;
  catcher.hidden = true;
}
catcher.addEventListener('pointerdown', closeMenu);   // 메뉴 바깥을 누르면 닫힘
catcher.addEventListener('contextmenu', (e) => { e.preventDefault(); closeMenu(); });

// 마우스가 펫/메뉴 위일 때만 클릭을 받고, 나머지는 아래 앱으로 통과
window.addEventListener('mousemove', (e) => {
  lastMouse = { x: e.clientX, y: e.clientY };
  const t = e.target;
  const hit = !!(t && t.closest && t.closest('.pet, .item, .paper, #menu, #catcher'));
  setIgnore(!hit);
});

// ───────────── 설정 반영 / 메인 루프 ─────────────
function applySettings(next) {
  S = next;
  const ids = new Set(S.pets.map((p) => p.id));
  for (const [id, p] of pets) if (!ids.has(id)) { p.destroy(); pets.delete(id); if (menuPet === p) closeMenu(); }
  for (const cfg of S.pets) {
    const ex = pets.get(cfg.id);
    if (ex) ex.updateCfg(cfg); else pets.set(cfg.id, new Pet(cfg));
  }
  if (!S.footprints) footprints = [];
}

function resizeFootprintCanvas() {
  fpCanvas.width = innerWidth;
  fpCanvas.height = innerHeight;
  fpDirty = true;
}
window.addEventListener('resize', resizeFootprintCanvas);

function drawFootprints() {
  if (!footprints.length) {
    if (fpDirty) { fpCtx.clearRect(0, 0, fpCanvas.width, fpCanvas.height); fpDirty = false; }
    return;
  }
  fpCtx.clearRect(0, 0, fpCanvas.width, fpCanvas.height);
  footprints = footprints.filter((f) => (f.a -= 3) > 0);
  for (const f of footprints) {
    fpCtx.fillStyle = `rgba(30,30,30,${f.a / 255})`;
    fpCtx.beginPath();
    fpCtx.arc(f.x, f.y, 3, 0, Math.PI * 2);
    fpCtx.fill();
  }
  fpDirty = true;
}

function decayStats() {
  for (const p of pets.values()) {
    p.hunger = Math.max(0, p.hunger - 3);
    p.thirst = Math.max(0, p.thirst - 4);
    p.clean = Math.max(0, p.clean - 2);
    if (p.hunger < 25) p.say('배고파요… 꼬르륵 🥣');
    else if (p.thirst < 25) p.say('목이 말라요 🥛');
    else if (p.clean < 25) p.say('몸이 꼬질꼬질해… 빗겨줘! 🧹');
  }
}

function tickAll() {
  if (!S) return;
  tick++;
  if (tick % Math.max(1, Math.round(S.decaySeconds * 1000 / TICK_MS)) === 0) decayStats();
  for (const p of pets.values()) p.update();
  if (tick % 5 === 0) checkInteractions();
  drawFootprints();
  for (const p of pets.values()) p.render();
}

(async () => {
  resizeFootprintCanvas();
  applySettings(await bridge.getSettings());
  bridge.onSettings(applySettings);
  bridge.onNote((id, text) => {
    const p = pets.get(id) || pets.values().next().value;
    if (p) p.throwPaper(text);
  });
  const first = pets.values().next().value;
  if (first) first.say('나를 한 번 클릭하면 상태가 나타나! 🐾', 5);
  setInterval(tickAll, TICK_MS);
})();
