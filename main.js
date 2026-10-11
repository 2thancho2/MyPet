const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  petSize: 150,
  moveSpeed: 5,
  activityRate: 100,
  decaySeconds: 30,
  footprints: true,
  chaseMouse: true,
  interactions: true,
  launchAtLogin: false,
  pets: [{ id: 'default', name: '콩이', kind: 'sheet', personality: 60, hue: 0 }],
};

let settings = { ...DEFAULTS };
let settingsPath;
let overlay = null;
let settingsWin = null;
let tray = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => openSettings());

// ───────────── 설정 저장/불러오기 ─────────────
function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
  } catch (err) {
    console.error('설정 저장 실패', err);
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
  saveSettings();
  broadcast();                 // 먼저 화면에 반영
  applySystemSettings();       // 실패해도 위 동작에 영향 없음
  return settings;
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
  const firstRun = !fs.existsSync(settingsPath);
  loadSettings();
  applySystemSettings();
  if (process.platform === 'darwin' && app.dock) app.dock.hide(); // Dock 아이콘 숨김
  createOverlay();
  createTray();
  screen.on('display-metrics-changed', fitOverlay);
  screen.on('display-removed', fitOverlay);
  if (firstRun) openSettings();   // 처음 실행하면 설정 창을 바로 보여줌
});

// 창이 모두 닫혀도 트레이로 계속 실행
app.on('window-all-closed', () => {});
