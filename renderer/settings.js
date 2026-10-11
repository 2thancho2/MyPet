'use strict';

const api = window.api;
let S = null;
let skipRender = 0;

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

const $ = (id) => document.getElementById(id);

// ── 펫 목록 ──
function savePets(rerender) {
  if (!rerender) skipRender++;
  api.setSettings({ pets: S.pets });
  if (rerender) renderPets();
}

function renderPets() {
  const list = $('petList');
  list.innerHTML = '';
  S.pets.forEach((pet, idx) => {
    const row = document.createElement('div');
    row.className = 'pet-row';

    let thumb;
    if (pet.kind === 'photo' && pet.images && pet.images.idle) {
      thumb = document.createElement('img');
      thumb.src = pet.images.idle;
    } else {
      thumb = document.createElement('div');
      thumb.textContent = '🐶';
    }
    thumb.className = 'thumb';

    const name = document.createElement('input');
    name.type = 'text'; name.value = pet.name; name.maxLength = 12;
    name.addEventListener('input', () => { pet.name = name.value || '펫'; savePets(false); });

    const sl = (label, key, min, max) => {
      const w = document.createElement('label');
      w.className = 'sl';
      w.textContent = label;
      const r = document.createElement('input');
      r.type = 'range'; r.min = min; r.max = max; r.value = pet[key] ?? (key === 'hue' ? 0 : 50);
      r.addEventListener('input', () => { pet[key] = Number(r.value); savePets(false); });
      w.appendChild(r);
      return w;
    };

    const grow = document.createElement('div');
    grow.className = 'grow';

    const del = document.createElement('button');
    del.className = 'danger'; del.textContent = '삭제';
    del.addEventListener('click', () => { S.pets.splice(idx, 1); savePets(true); });

    row.append(thumb, name, sl('성격 (느긋 ↔ 활발)', 'personality', 0, 100));
    if (pet.kind === 'sheet') row.append(sl('색 변경', 'hue', 0, 360));
    row.append(grow, del);
    list.appendChild(row);
  });
  if (!S.pets.length) list.innerHTML = '<p class="hint">펫이 없어요. 아래 버튼으로 추가해 보세요!</p>';
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
  S.pets.push({
    id: 'p' + Date.now(), name: '친구' + (S.pets.length + 1),
    kind: 'sheet', personality: 50, hue: Math.floor(Math.random() * 360),
  });
  savePets(true);
});

// ── 동작 설정 ──
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
      skipRender++;
      api.setSettings({ [key]: Number(input.value) });
    });
    box.appendChild(row);
  }
  for (const [key, label] of TOGGLES) {
    const l = document.createElement('label');
    l.className = 'tg';
    l.innerHTML = `<input type="checkbox"> ${label}`;
    const cb = l.querySelector('input');
    cb.checked = !!S[key];
    cb.addEventListener('change', () => { skipRender++; api.setSettings({ [key]: cb.checked }); });
    box.appendChild(l);
  }
}

// ── 사진으로 펫 만들기 ──
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
  return c.toDataURL('image/png');
}

$('makePhotoPet').addEventListener('click', async () => {
  const msg = $('photoMsg');
  msg.style.color = '#c62828';
  const idle = $('photoIdle').files[0];
  if (!idle) { msg.textContent = '기본 모습 사진을 선택해 주세요.'; return; }
  try {
    const circle = $('photoCircle').checked;
    const images = { idle: await processPhoto(idle, circle) };
    const ex = $('photoExcited').files[0], sl = $('photoSleep').files[0];
    if (ex) images.excited = await processPhoto(ex, circle);
    if (sl) images.sleep = await processPhoto(sl, circle);
    S.pets.push({
      id: 'p' + Date.now(), name: $('photoName').value.trim() || '내 펫',
      kind: 'photo', personality: 50, images,
    });
    savePets(true);
    msg.style.color = '#2e7d32';
    msg.textContent = '펫이 만들어졌어요! 🎉';
    for (const id of ['photoIdle', 'photoExcited', 'photoSleep']) $(id).value = '';
    $('photoName').value = '';
  } catch (err) {
    msg.textContent = '사진을 불러오지 못했어요.';
    console.error(err);
  }
});

// ── 쪽지 ──
$('sendNote').addEventListener('click', () => {
  const text = $('noteText').value.trim();
  if (!text || !$('noteTarget').value) return;
  api.sendNote($('noteTarget').value, text);
  $('noteText').value = '';
});
$('noteText').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sendNote').click(); });

// ── 시작 ──
(async () => {
  S = await api.getSettings();
  buildControls();
  renderPets();
  api.onSettings((s) => {
    // 내가 보낸 변경의 에코는 무시 (입력 중인 객체 참조가 끊기지 않도록)
    if (skipRender > 0) { skipRender--; return; }
    S = s;
    renderPets();
  });
})();
