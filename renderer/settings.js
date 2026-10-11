'use strict';

const bridge = window.api;
let S = null;
let skipRender = 0;

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const b = $('errBox');
  b.hidden = false;
  b.textContent = '오류: ' + msg;
}
window.addEventListener('error', (e) => showError(e.message));
window.addEventListener('unhandledrejection', (e) => showError((e.reason && e.reason.message) || String(e.reason)));

const SLIDERS = [
  ['petSize', '펫 크기', 80, 260, 10, 'px'],
  ['moveSpeed', '이동 속도', 1, 12, 1, ''],
  ['activityRate', '활동량', 20, 200, 10, '%'],
  ['decaySeconds', '배고픔·갈증 감소 주기', 5, 300, 5, '초'],
];
const TOGGLES = [
  ['footprints', '발자국 남기기'],
  ['chaseMouse', '마우스 따라가기'],
  ['interactions', '펫끼리 상호작용'],
  ['launchAtLogin', '로그인할 때 자동 실행'],
];
const SLOTS = [
  ['idle', '기본 모습 (필수)'],
  ['walk', '걷기'],
  ['run', '뛰기'],
  ['excited', '신난 모습'],
  ['sleep', '자는 모습'],
];
const MOTIONS = [['bounce', '통통 튀기'], ['wobble', '좌우로 흔들흔들'], ['float', '둥실둥실'], ['still', '가만히']];
const FACES = [['right', '오른쪽'], ['left', '왼쪽'], ['front', '정면']];
const MAX_FRAMES = 8;

function makeSelect(options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    s.appendChild(o);
  }
  s.value = value;
  if (onChange) s.addEventListener('change', () => onChange(s.value));
  return s;
}

function savePets(rerender) {
  if (!rerender) skipRender++;
  bridge.setSettings({ pets: S.pets });
  if (rerender) renderPets();
}

function thumbSrc(pet) {
  return (pet.anims && pet.anims.idle && pet.anims.idle[0]) || (pet.images && pet.images.idle) || null;
}

function renderPets() {
  const list = $('petList');
  list.innerHTML = '';
  S.pets.forEach((pet, idx) => {
    const row = document.createElement('div');
    row.className = 'pet-row';

    let thumb;
    const src = pet.kind === 'photo' ? thumbSrc(pet) : null;
    if (src) { thumb = document.createElement('img'); thumb.src = src; }
    else { thumb = document.createElement('div'); thumb.textContent = '🐶'; }
    thumb.className = 'thumb';

    const name = document.createElement('input');
    name.type = 'text'; name.value = pet.name; name.maxLength = 12;
    name.addEventListener('input', () => { pet.name = name.value || '펫'; savePets(false); });

    const labeled = (label, el) => {
      const w = document.createElement('label');
      w.className = 'sl';
      w.textContent = label;
      w.appendChild(el);
      return w;
    };
    const range = (key, min, max, def) => {
      const r = document.createElement('input');
      r.type = 'range'; r.min = min; r.max = max; r.value = pet[key] ?? def;
      r.addEventListener('input', () => { pet[key] = Number(r.value); savePets(false); });
      return r;
    };

    const grow = document.createElement('div');
    grow.className = 'grow';

    const del = document.createElement('button');
    del.className = 'danger'; del.textContent = '삭제';
    del.addEventListener('click', () => { S.pets.splice(idx, 1); savePets(true); });

    row.append(thumb, name, labeled('성격', range('personality', 0, 100, 50)));
    if (pet.kind === 'sheet') {
      row.append(labeled('색 변경', range('hue', 0, 360, 0)));
    } else {
      row.append(
        labeled('움직임', makeSelect(MOTIONS, pet.motion || 'bounce', (v) => { pet.motion = v; savePets(false); })),
        labeled('방향', makeSelect(FACES, pet.faces || 'right', (v) => { pet.faces = v; savePets(false); })),
      );
    }
    row.append(grow, del);
    list.appendChild(row);
  });
  if (!S.pets.length) list.innerHTML = '<p class="hint">펫이 없어요!</p>';
  renderNoteTargets();
}

function renderNoteTargets() {
  const sel = $('noteTarget');
  sel.innerHTML = '';
  for (const p of S.pets) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    sel.appendChild(o);
  }
}

$('addPet').addEventListener('click', () => {
  if (!S) return;
  S.pets.push({
    id: 'p' + Date.now(), name: '친구' + (S.pets.length + 1),
    kind: 'sheet', personality: 50, hue: Math.floor(Math.random() * 360),
    hunger: 80, thirst: 80, clean: 80, affection: 10, level: 1
  });
  savePets(true);
});

function buildControls() {
  const box = $('controls');
  for (const [key, label, min, max, step, unit] of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'ctl';
    row.innerHTML = `<span class="name">${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="val"></span>`;
    const input = row.querySelector('input'), val = row.querySelector('.val');
    input.value = S[key]; val.textContent = S[key] + unit;
    input.addEventListener('input', () => {
      val.textContent = input.value + unit;
      bridge.setSettings({ [key]: Number(input.value) });
      skipRender++;
    });
    box.appendChild(row);
  }
  for (const [key, label] of TOGGLES) {
    const l = document.createElement('label');
    l.className = 'tg';
    l.innerHTML = `<input type="checkbox"> ${label}`;
    const cb = l.querySelector('input');
    cb.checked = !!S[key];
    cb.addEventListener('change', () => { bridge.setSettings({ [key]: cb.checked }); skipRender++; });
    box.appendChild(l);
  }
}

const slotInputs = {};
function buildPhotoForm() {
  const box = $('photoSlots');
  for (const [key, label] of SLOTS) {
    const l = document.createElement('label');
    l.className = 'field';
    const span = document.createElement('span');
    span.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    slotInputs[key] = inp;
    l.append(span, inp);
    box.appendChild(l);
  }
  const m = $('photoMotion');
  if (m) for (const [v, label] of MOTIONS) m.add(new Option(label, v));
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function processPhoto(file, circle) {
  const img = await loadImage(await readFile(file));
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  if (circle) {
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
    x.save();
    x.beginPath(); x.arc(N / 2, N / 2, N / 2 - 6, 0, Math.PI * 2); x.closePath(); x.clip();
    x.drawImage(img, sx, sy, side, side, 6, 6, N - 12, N - 12);
    x.restore();
    x.lineWidth = 6; x.strokeStyle = '#fff';
    x.beginPath(); x.arc(N / 2, N / 2, N / 2 - 6, 0, Math.PI * 2); x.stroke();
  } else {
    const k = Math.min(N / img.width, N / img.height);
    const w = img.width * k, h = img.height * k;
    x.drawImage(img, (N - w) / 2, N - h, w, h);
  }
  return c.toDataURL('image/webp', 0.92);
}

async function collectFrames(files, circle) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, MAX_FRAMES);
  const out = [];
  for (const f of sorted) out.push(await processPhoto(f, circle));
  return out;
}

$('makePhotoPet').addEventListener('click', async () => {
  const msg = $('photoMsg');
  if (!S) return;
  if (!slotInputs.idle.files.length) { msg.textContent = '✕ 기본 모습 사진을 선택해 주세요.'; return; }
  msg.textContent = '만드는 중…';
  try {
    const circle = $('photoCircle').checked;
    const anims = {};
    for (const [key] of SLOTS) {
      const files = slotInputs[key].files;
      if (files.length) anims[key] = await collectFrames(files, circle);
    }
    S.pets.push({
      id: 'p' + Date.now(),
      name: $('photoName').value.trim() || '내 펫',
      kind: 'photo',
      personality: 50,
      anims,
      motion: $('photoMotion').value,
      faces: $('photoFaces').value,
      hunger: 80, thirst: 80, clean: 80, affection: 10, level: 1
    });
    savePets(true);
    msg.textContent = '✓ 펫이 만들어졌어요!';
  } catch (err) {
    msg.textContent = '✕ 실패';
  }
});

$('sendNote').addEventListener('click', () => {
  const text = $('noteText').value.trim();
  if (!text || !$('noteTarget').value) return;
  bridge.sendNote($('noteTarget').value, text);$('noteText').value = '';
});

(async () => {
  S = await bridge.getSettings();
  buildControls();
  buildPhotoForm();
  renderPets();
  bridge.onSettings((s) => {
    if (skipRender > 0) { skipRender--; return; }
    S = s;
    renderPets();
  });
})();
