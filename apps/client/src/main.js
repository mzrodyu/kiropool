const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

const APP_NAME = 'KiroPool';
const REPO_URL = 'https://github.com/mzrodyu/kiropool';
const DEFAULT_SERVER_URL = 'https://kirotool.mzrodyu.icu';
const ICON_FILE = path.join(__dirname, 'icon.png');
const KIRO_CACHE_DIR = path.join(app.getPath('home'), '.aws', 'sso', 'cache');
const KIRO_AUTH_FILE = path.join(KIRO_CACHE_DIR, 'kiro-auth-token.json');
const CLIENT_STATE_FILE = path.join(app.getPath('userData'), 'client-state.json');

let mainWindow = null;

function readState() {
  try {
    if (fs.existsSync(CLIENT_STATE_FILE)) return JSON.parse(fs.readFileSync(CLIENT_STATE_FILE, 'utf8'));
  } catch (err) {}
  return { serverUrl: DEFAULT_SERVER_URL, userKey: '', lease: null };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(CLIENT_STATE_FILE), { recursive: true });
  fs.writeFileSync(CLIENT_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeKiroAuth(credentials) {
  ensureDir(KIRO_CACHE_DIR);
  const normalized = {
    accessToken: credentials.accessToken || credentials.access_token || '',
    refreshToken: credentials.refreshToken || credentials.refresh_token || '',
    expiresAt: credentials.expiresAt || credentials.expires_at || '',
    authMethod: credentials.authMethod || 'social',
    provider: credentials.provider || '',
    profileArn: credentials.profileArn || '',
    region: credentials.region || 'us-east-1',
    clientId: credentials.clientId || '',
    clientSecret: credentials.clientSecret || '',
    csrfToken: credentials.csrfToken || ''
  };
  fs.writeFileSync(KIRO_AUTH_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function readCredentialFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const credentials = parsed.credentials && typeof parsed.credentials === 'object' ? parsed.credentials : parsed;
  if (!credentials || typeof credentials !== 'object') throw new Error('凭证文件不是合法 JSON');
  if (!credentials.accessToken && !credentials.access_token) throw new Error('凭证缺少访问令牌');
  return credentials;
}

function clearKiroAuth() {
  try {
    if (fs.existsSync(KIRO_AUTH_FILE)) fs.unlinkSync(KIRO_AUTH_FILE);
  } catch (err) {}
}

function resolveKiroExecutable(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Kiro.app',
      path.join(app.getPath('home'), 'Applications', 'Kiro.app')
    ];
    return candidates.find(item => fs.existsSync(item)) || '';
  }
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "(Get-Process Kiro -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)"
    ], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch (err) {}
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kiro', 'Kiro.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'kiro', 'Kiro.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Kiro', 'Kiro.exe')
  ];
  const direct = candidates.find(item => item && fs.existsSync(item));
  if (direct) return direct;
  for (const root of [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kiro'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'kiro')
  ]) {
    try {
      const found = fs.readdirSync(root, { withFileTypes: true })
        .filter(item => item.isDirectory())
        .map(item => path.join(root, item.name, 'Kiro.exe'))
        .find(item => fs.existsSync(item));
      if (found) return found;
    } catch (err) {}
  }
  return '';
}

function launchKiro(exePath) {
  const exe = resolveKiroExecutable(exePath);
  if (!exe) {
    const err = new Error(process.platform === 'darwin' ? '未找到 Kiro.app' : '未找到 Kiro.exe');
    err.code = 'NO_KIRO_EXE';
    throw err;
  }
  if (process.platform === 'darwin') {
    const child = spawn('open', [exe], { detached: true, stdio: 'ignore' });
    child.unref();
    return exe;
  }
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return exe;
}

async function postJson(serverUrl, pathname, body, headers = {}) {
  const url = new URL(pathname, serverUrl).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(25000)
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (err) {}
  if (!response.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || `HTTP ${response.status}: ${text.slice(0, 120)}`);
  }
  return data;
}

function createChineseMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 KiroPool',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '关于 KiroPool',
            message: 'KiroPool',
            detail: `作者：Catie / mzrodyu\n仓库：${REPO_URL}\n\nKiro IDE 拼车额度管理客户端`,
            buttons: ['打开仓库', '关闭'],
            defaultId: 0,
            cancelId: 1
          }).then(result => {
            if (result.response === 0) shell.openExternal(REPO_URL);
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 940,
    height: 620,
    minWidth: 780,
    minHeight: 560,
    title: APP_NAME,
    icon: ICON_FILE,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 17 },
    backgroundColor: '#f5f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') createChineseMenu();
  else Menu.setApplicationMenu(null);
  createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('state:get', () => ({ ok: true, data: readState() }));
ipcMain.handle('state:set', (event, patch) => {
  const state = { ...readState(), ...(patch || {}) };
  writeState(state);
  return { ok: true, data: state };
});

ipcMain.handle('kiro:pickExe', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: process.platform === 'darwin' ? '选择 Kiro.app' : '选择 Kiro.exe',
    properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'],
    filters: process.platform === 'darwin' ? [{ name: 'Kiro.app', extensions: ['app'] }] : [{ name: 'Kiro.exe', extensions: ['exe'] }]
  });
  if (res.canceled) return { ok: false, canceled: true };
  const state = readState();
  writeState({ ...state, kiroExePath: res.filePaths[0] });
  return { ok: true, exe: res.filePaths[0] };
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('app:about', () => dialog.showMessageBox(mainWindow, {
  type: 'info',
  title: '关于 KiroPool',
  message: 'KiroPool',
  detail: `作者：Catie / mzrodyu\n仓库：${REPO_URL}\n\nKiro IDE 拼车额度管理客户端`,
  buttons: ['打开仓库', '关闭'],
  defaultId: 0,
  cancelId: 1
}).then(result => {
  if (result.response === 0) shell.openExternal(REPO_URL);
}));

ipcMain.handle('credential:import', async (event, payload = {}) => {
  try {
    const state = readState();
    let filePath = payload.filePath || '';
    if (!filePath) {
      const res = await dialog.showOpenDialog(mainWindow, {
        title: '选择备用 JSON 凭证',
        properties: ['openFile'],
        filters: [{ name: 'JSON 凭证', extensions: ['json'] }]
      });
      if (res.canceled) return { ok: false, canceled: true };
      filePath = res.filePaths[0];
    }
    const credentials = readCredentialFile(filePath);
    const auth = writeKiroAuth(credentials);
    let exe = '';
    try {
      exe = launchKiro(payload.exePath || state.kiroExePath);
    } catch (err) {
      if (err.code !== 'NO_KIRO_EXE') throw err;
    }
    writeState({ ...state, kiroExePath: exe || state.kiroExePath || '' });
    return { ok: true, data: { writtenAuth: auth, authFile: KIRO_AUTH_FILE, exe } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lease:login', async (event, payload) => {
  try {
    const data = await postJson(payload.serverUrl, '/api/login', { userKey: payload.userKey });
    writeState({ ...readState(), serverUrl: payload.serverUrl, userKey: payload.userKey });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lease:start', async (event, payload) => {
  try {
    const state = readState();
    const serverUrl = payload.serverUrl || state.serverUrl;
    const userKey = payload.userKey || state.userKey;
    const data = await postJson(serverUrl, '/api/lease/start', { userKey });
    const auth = writeKiroAuth(data.credentials);
    let exe = '';
    try {
      exe = launchKiro(payload.exePath || state.kiroExePath);
    } catch (err) {
      if (err.code !== 'NO_KIRO_EXE') throw err;
    }
    writeState({ ...state, serverUrl, userKey, lease: data.lease, kiroExePath: exe || state.kiroExePath || '' });
    return { ok: true, data: { ...data, writtenAuth: auth, exe } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lease:heartbeat', async () => {
  try {
    const state = readState();
    if (!state.lease) return { ok: false, error: '当前没有租用会话' };
    const data = await postJson(state.serverUrl, '/api/lease/heartbeat', {
      userKey: state.userKey,
      leaseId: state.lease.id
    });
    if (data.lease && data.lease.status !== 'active') {
      clearKiroAuth();
      writeState({ ...state, lease: null });
    } else {
      writeState({ ...state, lease: data.lease || state.lease });
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lease:stop', async () => {
  const state = readState();
  try {
    if (state.lease) {
      await postJson(state.serverUrl, '/api/lease/stop', {
        userKey: state.userKey,
        leaseId: state.lease.id
      });
    }
  } catch (err) {
    // 本地退出优先，服务端失败时仍清理本机凭证。
  }
  clearKiroAuth();
  writeState({ ...state, lease: null });
  return { ok: true };
});
