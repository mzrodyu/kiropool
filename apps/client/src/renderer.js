const api = window.kiropool;

let heartbeatTimer = null;
const DEFAULT_SERVER_URL = 'https://kirotool.mzrodyu.icu';

const $ = id => document.getElementById(id);

function setStatus(text) {
  $('status').textContent = text;
}

function setMetrics(data) {
  if (!data) return;
  const user = data.user || data.data && data.data.user || data;
  if (user.quota != null) $('quota').textContent = String(user.quota);
  if (user.used != null) $('used').textContent = String(user.used);
  if (user.remaining != null) $('remaining').textContent = String(user.remaining);
  if (data.lease) $('lease').textContent = data.lease.status === 'active' ? data.lease.accountName : data.lease.status;
}

function friendlyError(message) {
  if (message === '暂无空闲 Kiro 账号') {
    return '车头没有空闲 Kiro 账号。请在网页「车头管理」上传并启用车头凭证，或停止正在租用的会话。';
  }
  if (message === '额度已用完') return '用户额度已用完，请让车头给这个用户加额度。';
  if (message === '用户 key 无效') return '用户密钥无效，请检查是否复制错了。';
  return message;
}

function formPayload() {
  return {
    serverUrl: $('serverUrl').value.trim(),
    userKey: $('userKey').value.trim()
  };
}

async function loadState() {
  const res = await api.getState();
  if (res.ok && res.data) {
    $('serverUrl').value = res.data.serverUrl || DEFAULT_SERVER_URL;
    $('userKey').value = res.data.userKey || '';
    if (res.data.lease) $('lease').textContent = res.data.lease.status || '-';
    if (res.data.kiroExePath) setStatus('Kiro 路径已设置：' + res.data.kiroExePath);
  }
}

async function login() {
  const payload = formPayload();
  if (!payload.serverUrl || !payload.userKey) {
    setStatus('请填写服务器地址和用户密钥');
    return;
  }
  setStatus('正在检查额度...');
  const res = await api.login(payload);
  if (!res.ok) {
    setStatus('检查失败：' + friendlyError(res.error));
    return;
  }
  setMetrics(res.data);
  setStatus('额度检查成功');
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    const res = await api.heartbeat();
    if (!res.ok) {
      setStatus('心跳失败：' + friendlyError(res.error));
      return;
    }
    setMetrics(res.data);
    if (res.data.lease && res.data.lease.status !== 'active') {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      setStatus('额度已到或会话已结束，本机 Kiro 登录已清理');
    }
  }, 60 * 1000);
}

async function startLease() {
  const payload = formPayload();
  if (!payload.serverUrl || !payload.userKey) {
    setStatus('请填写服务器地址和用户密钥');
    return;
  }
  setStatus('正在领取临时凭证并启动 Kiro...');
  const res = await api.startLease(payload);
  if (!res.ok) {
    setStatus('启动失败：' + friendlyError(res.error));
    return;
  }
  setMetrics(res.data);
  const exeText = res.data.exe ? `，已启动 ${res.data.exe}` : '，凭证已写入但未找到 Kiro.exe';
  setStatus('会话已开始' + exeText);
  startHeartbeat();
}

async function stopLease() {
  setStatus('正在停止会话...');
  const res = await api.stopLease();
  if (!res.ok) {
    setStatus('停止失败：' + friendlyError(res.error));
    return;
  }
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  $('lease').textContent = '-';
  setStatus('已停止并清理本机 Kiro 登录');
}

async function importCredential() {
  setStatus('请选择备用 JSON 凭证...');
  const res = await api.importCredential({});
  if (res.canceled) {
    setStatus('已取消导入');
    return;
  }
  if (!res.ok) {
    setStatus('导入失败：' + res.error);
    return;
  }
  const exeText = res.data.exe ? `，已启动 ${res.data.exe}` : '，凭证已写入但未找到 Kiro.exe';
  setStatus('备用凭证已导入' + exeText);
}

async function pickKiroExe() {
  const res = await api.pickKiroExe();
  if (res.canceled) {
    setStatus('已取消选择 Kiro 路径');
    return;
  }
  if (!res.ok) {
    setStatus('选择失败：' + res.error);
    return;
  }
  setStatus('Kiro 路径已设置：' + res.exe);
}

function openAbout() {
  $('aboutModal').classList.remove('hidden');
}

function closeAbout() {
  $('aboutModal').classList.add('hidden');
}

$('btnLogin').addEventListener('click', login);
$('btnStart').addEventListener('click', startLease);
$('btnStop').addEventListener('click', stopLease);
$('btnImportCredential').addEventListener('click', importCredential);
$('btnPickKiro').addEventListener('click', pickKiroExe);
$('winClose').addEventListener('click', () => api.closeWindow());
$('winMinimize').addEventListener('click', () => api.minimizeWindow());
$('winMaximize').addEventListener('click', () => api.maximizeWindow());
$('btnAbout').addEventListener('click', openAbout);
$('aboutClose').addEventListener('click', closeAbout);
$('aboutOk').addEventListener('click', closeAbout);
$('aboutBackdrop').addEventListener('click', closeAbout);
$('aboutRepo').addEventListener('click', () => api.openRepo());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAbout();
});
api.onShowAbout(openAbout);

loadState();
