const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// 이미지 파일을 Base64 Data URL로 변환하는 헬퍼 함수
// assets 폴더의 5장 사진을 안전하게 읽어 Base64로 반환하는 헬퍼 함수
function getAssetDataUrl(filename) {
  try {
    const filePath = path.join(__dirname, 'assets', filename);
    if (!fs.existsSync(filePath)) return null;
    const bitmap = fs.readFileSync(filePath);
    return `data:image/png;base64,${bitmap.toString('base64')}`;
  } catch (err) {
    console.error(`Asset 로드 실패: ${filename}`, err);
    return null;
  }
}

// 5장의 사진을 읽어 사진 펫 설정 객체 생성
function createDefaultPhotoPet() {
  const idle = getAssetDataUrl('pet_idle.png');
  const walk1 = getAssetDataUrl('pet_walk1.png');
  const walk2 = getAssetDataUrl('pet_walk2.png');
  const excited = getAssetDataUrl('pet_excited.png');
  const sleep = getAssetDataUrl('pet_sleep.png');

  return {
    id: 'default_cat',
    name: '야옹이',
    kind: 'photo',
    personality: 70,
    anims: {
      idle: idle ? [idle] : [],
      walk: [walk1, walk2].filter(Boolean),
      excited: excited ? [excited] : [],
      sleep: sleep ? [sleep] : [],
    },
    motion: 'bounce',
    faces: 'right',
    hunger: 80,
    thirst: 80,
    clean: 80,
    affection: 10,
    level: 1
  };
}

const DEFAULTS = {
  petSize: 150,
  moveSpeed: 5,
  activityRate: 100,
  decaySeconds: 30,
  footprints: true,
  chaseMouse: true,
  interactions: true,
  launchAtLogin: false,
  pets: [createDefaultPhotoPet()], // 👈 야옹이 기본 캐릭터 1마리 탑재!
};

// 5장의 사진을 읽어 사진 펫 설정 객체 생성
function createDefaultPhotoPet() {
  const idle = getAssetDataUrl('pet_idle.png');
  const walk1 = getAssetDataUrl('pet_walk1.png');
  const walk2 = getAssetDataUrl('pet_walk2.png');
  const excited = getAssetDataUrl('pet_excited.png');
  const sleep = getAssetDataUrl('pet_sleep.png');

  // 사진이 없으면 기본 스몰 세팅 적용
  const anims = {};
  if (idle) anims.idle = [idle];
  if (walk1 || walk2) anims.walk = [walk1, walk2].filter(Boolean);
  if (excited) anims.excited = [excited];
  if (sleep) anims.sleep = [sleep];

  return {
    id: 'default_cat',
    name: '야옹이',
    kind: 'photo',
    personality: 70,
    anims: anims,
    motion: 'bounce',
    faces: 'right',
    hunger: 80,
    thirst: 80,
    clean: 80,
    affection: 10,
    level: 1
  };
}

const DEFAULTS = {
  petSize: 150,
  moveSpeed: 5,
  activityRate: 100,
  decaySeconds: 30,
  footprints: true,
  chaseMouse: true,
  interactions: true,
  launchAtLogin: false,
  pets: [createDefaultPhotoPet()], // 👈 assets의 사진 5장을 이용한 기본 캐릭터 1마리로 시작!
};
const clone = (o) => JSON.parse(JSON.stringify(o));
let settings = clone(DEFAULTS);
let lastBackup = 0;
let settingsPath;
let overlay = null;
let settingsWin = null;
let tray = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => openSettings());

// ───────────── 설정 저장/불러오기 ─────────────
function loadSettings() {
  // 본 파일이 깨졌으면 백업 파일에서 복구
  for (const file of [settingsPath, settingsPath + '.bak']) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      settings = { ...clone(DEFAULTS), ...saved };
      if (!Array.isArray(settings.pets)) settings.pets = clone(DEFAULTS).pets;
      return;
    } catch { /* 다음 후보 */ }
  }
  settings = clone(DEFAULTS);
}

function saveSettings() {
  const tmp = settingsPath + '.tmp';
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    // 1분에 한 번 백업 (저장 도중 문제가 생겨도 되돌릴 수 있게)
    if (fs.existsSync(settingsPath) && Date.now() - lastBackup > 60000) {
      fs.copyFileSync(settingsPath, settingsPath + '.bak');
      lastBackup = Date.now();
    }
    fs.writeFileSync(tmp, JSON.stringify(settings));   // 임시 파일에 먼저 쓰고
    fs.renameSync(tmp, settingsPath);                  // 한 번에 교체 (반쯤 쓰인 파일이 생기지 않음)
    return { ok: true };
  } catch (err) {
    console.error('설정 저장 실패', err);
    return { ok: false, error: err.message };
  }
}

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('settings:changed', settings);
  }
}

function applySystemSettings() {
  try {
    app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin });
  } catch (err) {
    console.error('자동 실행 설정 실패', err);
  }
}

// ───────────── 창 ─────────────
function createOverlay() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true }); // 기본은 클릭 통과
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
}

function fitOverlay() {
  if (!overlay) return;
  overlay.setBounds(screen.getPrimaryDisplay().workArea);
}

function openSettings() {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  settingsWin = new BrowserWindow({
    width: 680,
    height: Math.min(800, wa.height - 40),
    title: 'MyPet 설정',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    alwaysOnTop: true,            // 투명 오버레이 창보다 항상 위에 떠서 클릭이 막히지 않게
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setAlwaysOnTop(true, 'screen-saver');
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function addDefaultPet() {
  settings.pets.push({
    id: 'p' + Date.now(),
    name: '친구' + (settings.pets.length + 1),
    kind: 'sheet',
    personality: 50,
    hue: Math.floor(Math.random() * 360),
  });
  saveSettings();
  broadcast();
}

function createTray() {
  // mac: tray.png(18px) + tray@2x.png(36px) 자동 선택 / Windows: 32px
  const file = process.platform === 'win32' ? 'tray-win.png' : 'tray.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
  tray = new Tray(icon);
  tray.setToolTip('MyPet');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '설정 열기', click: openSettings },
    { label: '펫 추가', click: addDefaultPet },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
  tray.on('click', openSettings);
}

// ───────────── IPC ─────────────
ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:set', (_e, patch) => {
  settings = { ...settings, ...patch };
  const result = saveSettings();
  broadcast();                 // 먼저 화면에 반영
  applySystemSettings();       // 실패해도 위 동작에 영향 없음
  return result;               // { ok, error }
});

ipcMain.handle('info:get', () => ({ version: app.getVersion(), settingsPath }));

// 브라우저가 못 읽는 사진(예: Mac의 HEIC)을 OS 디코더로 PNG로 변환
ipcMain.handle('image:convert', (_e, buf, name) => {
  const tmp = path.join(app.getPath('temp'), 'mypet-' + Date.now() + path.extname(String(name || '')));
  try {
    fs.writeFileSync(tmp, Buffer.from(buf));
    const img = nativeImage.createFromPath(tmp);
    return img.isEmpty() ? null : img.toPNG();
  } catch (err) {
    console.error('이미지 변환 실패', err);
    return null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* 무시 */ }
  }
});

ipcMain.on('ignore-mouse', (_e, ignore) => {
  if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('note:send', (_e, petId, text) => {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('note', petId, text);
});

ipcMain.on('open-settings', () => openSettings());
ipcMain.on('quit', () => app.quit());

// ───────────── 앱 시작 ─────────────
app.whenReady().then(() => {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  loadSettings();
  applySystemSettings();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createOverlay();
  createTray();
  screen.on('display-metrics-changed', fitOverlay);
  screen.on('display-removed', fitOverlay);
  
  openSettings(); // 👈 앱을 켤 때 무조건 설정 창을 바로 띄움!
});

// 창이 모두 닫혀도 트레이로 계속 실행
app.on('window-all-closed', () => {});
