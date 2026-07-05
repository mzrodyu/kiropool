const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.KIROPOOL_PORT || 47831);
const HOST = process.env.KIROPOOL_HOST || '127.0.0.1';
const ADMIN_TOKEN = process.env.KIROPOOL_ADMIN_TOKEN || '';
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const KIRO_REFRESH_URL = 'https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken';

const WEB_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KiroPool</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="app">
    <section class="hero">
      <div>
        <p class="eyebrow">KiroPool</p>
        <h1>Kiro 拼车凭证中心</h1>
        <p class="lead">车头上传完整凭证，用户拿密钥在客户端自动领取临时登录凭证。</p>
      </div>
      <div class="server-pill" id="serverPill">服务端</div>
    </section>

    <section class="setup card hidden" id="setupPanel">
      <h2>首次初始化</h2>
      <p class="hint">先设置一个管理员密钥。以后车头管理、创建用户、上传凭证都用它。</p>
      <label>
        <span>管理员密钥</span>
        <input id="setupAdminToken" type="password" spellcheck="false" placeholder="至少 8 位，自己记好" />
      </label>
      <label>
        <span>确认管理员密钥</span>
        <input id="setupAdminTokenConfirm" type="password" spellcheck="false" placeholder="再输一遍" />
      </label>
      <div class="actions">
        <button id="initializeServer" class="primary">完成初始化</button>
      </div>
      <div class="notice" id="setupStatus">初始化只需要做一次。</div>
    </section>

    <nav class="tabs hidden" id="tabs" aria-label="页面切换">
      <button class="tab active" data-tab="user">用户下载</button>
      <button class="tab" data-tab="owner">车头管理</button>
    </nav>

    <section class="grid active hidden" id="userPanel">
      <div class="card">
        <h2>用户密钥</h2>
        <label>
          <span>用户密钥</span>
          <input id="userKey" type="password" spellcheck="false" placeholder="kp_xxx" />
        </label>
        <div class="actions">
          <button id="checkQuota">检查额度</button>
          <button id="downloadCredential" class="primary">备用下载 JSON</button>
        </div>
        <div class="notice" id="userStatus">等待操作</div>
      </div>

      <div class="card">
        <h2>当前额度</h2>
        <div class="metrics">
          <div><span>总额度</span><strong id="quota">-</strong></div>
          <div><span>已使用</span><strong id="used">-</strong></div>
          <div><span>剩余额度</span><strong id="remaining">-</strong></div>
          <div><span>当前租用</span><strong id="lease">-</strong></div>
        </div>
        <div class="actions">
          <button id="heartbeat">同步用量</button>
          <button id="stopLease" class="danger">停止会话</button>
        </div>
        <p class="hint">正常给用户发密钥就行。客户端会自动从云端领取临时凭证；这里下载 JSON 只是备用导入方案。</p>
      </div>
    </section>

    <section class="grid hidden" id="ownerPanel">
      <div class="card">
        <h2>上传车头凭证</h2>
        <label>
          <span>管理员密钥</span>
          <input id="adminToken" type="password" spellcheck="false" placeholder="KIROPOOL_ADMIN_TOKEN" />
        </label>
        <label>
          <span>Kiro 账号名称</span>
          <input id="accountName" spellcheck="false" placeholder="例如：车头 1" />
        </label>
        <label>
          <span>完整 Kiro JSON 凭证</span>
          <textarea id="credentialJson" spellcheck="false" placeholder="粘贴包含刷新令牌 / 访问令牌的完整 JSON"></textarea>
        </label>
        <input class="file-input" id="credentialFile" type="file" accept=".json,application/json" />
        <div class="actions">
          <button id="chooseCredentialFile">选择 JSON 文件</button>
          <button id="uploadCredential" class="primary">上传车头凭证</button>
        </div>
        <div class="notice" id="ownerStatus">完整刷新令牌只保存在服务端。</div>
      </div>

      <div class="card">
        <h2>创建用户</h2>
        <label>
          <span>用户名称</span>
          <input id="newUserName" spellcheck="false" placeholder="例如：用户 A" />
        </label>
        <label>
          <span>用户密钥</span>
          <input id="newUserKey" spellcheck="false" placeholder="留空自动生成" />
        </label>
        <label>
          <span>额度</span>
          <input id="newUserQuota" type="number" min="1" step="1" value="2500" />
        </label>
        <div class="actions">
          <button id="createUser">创建用户</button>
        </div>
        <div class="notice" id="createUserStatus">创建后把用户密钥发给乘客。</div>
      </div>

      <div class="card wide">
        <div class="section-head">
          <h2>车头凭证</h2>
          <div class="row-actions">
            <button id="syncUsage">同步额度</button>
            <button id="refreshAccounts">刷新</button>
          </div>
        </div>
        <div class="list" id="accountList">
          <div class="empty">暂无车头凭证</div>
        </div>
        <p class="hint">这里只显示账号状态，不显示完整刷新令牌。</p>
      </div>

      <div class="card wide">
        <div class="section-head">
          <h2>用户管理</h2>
          <button id="refreshUsers">刷新</button>
        </div>
        <div class="list" id="userList">
          <div class="empty">暂无用户</div>
        </div>
      </div>
    </section>
  </main>
  <script src="/app.js"></script>
</body>
</html>`;

const WEB_CSS = `:root {
  color-scheme: light;
  --bg: #f5f5f7;
  --card: rgba(255, 255, 255, 0.92);
  --line: #d8dbe2;
  --text: #111827;
  --muted: #6b7280;
  --blue: #007aff;
  --blue-press: #0066d6;
  --red: #ff3b30;
  --green: #34c759;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
}

.app {
  width: min(1080px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-end;
  padding: 8px 2px 22px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--blue);
  font-size: 14px;
  font-weight: 700;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 38px;
  line-height: 1.12;
  letter-spacing: 0;
}

h2 {
  font-size: 20px;
  margin-bottom: 18px;
}

.lead,
.hint {
  color: var(--muted);
  line-height: 1.7;
}

.lead {
  margin-top: 10px;
  font-size: 16px;
}

.server-pill {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  color: var(--muted);
  padding: 9px 14px;
  white-space: nowrap;
}

.tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #eceef2;
  margin-bottom: 18px;
}

.hidden {
  display: none !important;
}

.file-input {
  display: none;
}

.setup {
  margin-bottom: 18px;
}

.tab {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  padding: 9px 18px;
  font-size: 15px;
}

.tab.active {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 3px rgba(17, 24, 39, 0.12);
}

.grid {
  display: none;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.82fr);
  gap: 18px;
}

.grid.active {
  display: grid;
}

.card {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card);
  padding: 22px;
  box-shadow: 0 14px 34px rgba(17, 24, 39, 0.08);
}

.wide {
  grid-column: 1 / -1;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h2 {
  margin-bottom: 0;
}

.list {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.list-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  padding: 14px;
}

.list-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.list-meta {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.empty {
  border: 1px dashed var(--line);
  border-radius: 14px;
  color: var(--muted);
  padding: 18px;
  background: #fff;
}

label {
  display: block;
  margin: 14px 0;
}

label span {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 7px;
}

input,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--text);
  font: inherit;
  outline: none;
}

input {
  height: 46px;
  padding: 0 13px;
}

textarea {
  min-height: 170px;
  padding: 13px;
  resize: vertical;
  line-height: 1.5;
}

input:focus,
textarea:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.12);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

button {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--text);
  min-height: 42px;
  padding: 0 16px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button.primary {
  border-color: var(--blue);
  background: var(--blue);
  color: #fff;
}

button.primary:active {
  background: var(--blue-press);
}

button.danger {
  border-color: rgba(255, 59, 48, 0.24);
  color: var(--red);
}

.notice {
  min-height: 44px;
  margin-top: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  color: var(--muted);
  background: #fff;
}

.notice.ok {
  border-color: rgba(52, 199, 89, 0.35);
  color: #1f7a3a;
}

.notice.err {
  border-color: rgba(255, 59, 48, 0.35);
  color: var(--red);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.metrics div {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 15px;
  background: #fff;
}

.metrics span {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 8px;
}

.metrics strong {
  font-size: 24px;
}

@media (max-width: 820px) {
  .app {
    width: min(100% - 24px, 1080px);
    padding: 20px 0;
  }

  .hero,
  .grid {
    display: block;
  }

  .grid {
    display: none;
  }

  .grid.active {
    display: block;
  }

  .card + .card {
    margin-top: 14px;
  }

  h1 {
    font-size: 30px;
  }

  .server-pill {
    display: inline-block;
    margin-top: 16px;
  }
}`;

const WEB_JS = `const $ = id => document.getElementById(id);
const state = {
  leaseId: localStorage.getItem('kiropoolLeaseId') || '',
  userKey: localStorage.getItem('kiropoolUserKey') || ''
};

$('serverPill').textContent = location.origin;
$('userKey').value = state.userKey;

function showMainApp() {
  $('setupPanel').classList.add('hidden');
  $('tabs').classList.remove('hidden');
  $('userPanel').classList.remove('hidden');
  $('ownerPanel').classList.add('hidden');
}

function showSetup() {
  $('setupPanel').classList.remove('hidden');
  $('tabs').classList.add('hidden');
  $('userPanel').classList.add('hidden');
  $('ownerPanel').classList.add('hidden');
}

function setNotice(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = 'notice' + (kind ? ' ' + kind : '');
}

function setMetrics(data) {
  const user = data.user || data.data && data.data.user || data;
  if (user.quota != null) $('quota').textContent = String(user.quota);
  if (user.used != null) $('used').textContent = String(user.used);
  if (user.remaining != null) $('remaining').textContent = String(user.remaining);
  if (data.lease) $('lease').textContent = data.lease.status === 'active' ? data.lease.accountName : data.lease.status;
}

async function postJson(pathname, body, headers) {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json', accept: 'application/json' }, headers || {}),
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data && data.error ? data.error : '请求失败');
  }
  return data;
}

async function getJson(pathname, headers) {
  const res = await fetch(pathname, { headers: Object.assign({ accept: 'application/json' }, headers || {}) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data && data.error ? data.error : '请求失败');
  }
  return data;
}

function userKey() {
  return $('userKey').value.trim();
}

function saveBlob(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseCredentials(raw) {
  if (!raw.trim()) throw new Error('请粘贴 Kiro JSON 凭证');
  const parsed = JSON.parse(raw);
  return parsed.credentials && typeof parsed.credentials === 'object' ? parsed.credentials : parsed;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function adminToken() {
  return $('adminToken').value.trim();
}

function accountStatusText(account) {
  if (account.activeLeaseId) return '租用中';
  if (account.enabled === false) return '已停用';
  return account.status || 'ready';
}

function usageCurrent(usage) {
  if (!usage || typeof usage !== 'object') return null;
  if (usage.current != null) return Number(usage.current) || 0;
  const list = usage.usageBreakdownList || usage.usageBreakdowns || [];
  if (Array.isArray(list) && list.length) {
    return list.reduce((sum, item) => sum + (Number(item.currentUsage || item.current || 0) || 0), 0);
  }
  return null;
}

function usageLimit(usage) {
  if (!usage || typeof usage !== 'object') return null;
  if (usage.limit != null) return Number(usage.limit) || 0;
  if (usage.max != null) return Number(usage.max) || 0;
  const list = usage.usageBreakdownList || usage.usageBreakdowns || [];
  if (Array.isArray(list) && list.length) {
    return list.reduce((sum, item) => sum + (Number(item.limit || item.max || item.maximum || 0) || 0), 0);
  }
  return null;
}

function usageText(usage) {
  const current = usageCurrent(usage);
  const limit = usageLimit(usage);
  if (current == null && limit == null) return '额度：未同步';
  if (limit == null) return '已用：' + current;
  return '额度：' + limit + ' · 已用：' + (current == null ? '-' : current) + ' · 剩余：' + Math.max(0, limit - (current || 0));
}

function renderAccounts(accounts) {
  if (!accounts || !accounts.length) {
    $('accountList').innerHTML = '<div class="empty">暂无车头凭证</div>';
    return;
  }
  $('accountList').innerHTML = accounts.map(account => {
    const status = accountStatusText(account);
    const updated = account.updatedAt ? new Date(account.updatedAt).toLocaleString() : '-';
    const toggleText = account.enabled === false ? '启用' : '停用';
    return '<div class="list-row">' +
      '<div>' +
        '<div class="list-title">' + escapeHtml(account.name || account.id) + '</div>' +
        '<div class="list-meta">状态：' + escapeHtml(status) + ' · ' + escapeHtml(usageText(account.usage)) + ' · 更新时间：' + escapeHtml(updated) + '</div>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button data-action="toggle-account" data-id="' + escapeHtml(account.id) + '">' + toggleText + '</button>' +
        '<button class="danger" data-action="delete-account" data-id="' + escapeHtml(account.id) + '">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderUsers(users) {
  if (!users || !users.length) {
    $('userList').innerHTML = '<div class="empty">暂无用户</div>';
    return;
  }
  $('userList').innerHTML = users.map(user => {
    const remaining = Math.max(0, Number(user.quota || 0) - Number(user.used || 0));
    const status = user.enabled === false ? '已停用' : '可用';
    const toggleText = user.enabled === false ? '启用' : '停用';
    return '<div class="list-row">' +
      '<div>' +
        '<div class="list-title">' + escapeHtml(user.name || user.id) + '</div>' +
        '<div class="list-meta">密钥：' + escapeHtml(user.key) + ' · 状态：' + status + ' · 额度：' + user.quota + ' · 已用：' + (user.used || 0) + ' · 剩余：' + remaining + '</div>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button data-action="reset-user-key" data-id="' + escapeHtml(user.id) + '">重置密钥</button>' +
        '<button data-action="toggle-user" data-id="' + escapeHtml(user.id) + '">' + toggleText + '</button>' +
        '<button class="danger" data-action="delete-user" data-id="' + escapeHtml(user.id) + '">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function loadAdminState(options = {}) {
  const token = adminToken();
  if (!token) {
    if (!options.silent) setNotice('ownerStatus', '请先填写管理员密钥', 'err');
    return;
  }
  try {
    const data = await getJson('/admin/state', { 'x-admin-token': token });
    localStorage.setItem('kiropoolAdminToken', token);
    renderAccounts(data.data.accounts || []);
    renderUsers(data.data.users || []);
    if (!options.silent) setNotice('ownerStatus', '数据已刷新', 'ok');
  } catch (err) {
    if (!options.silent) setNotice('ownerStatus', '刷新失败：' + err.message, 'err');
  }
}

function activeTab() {
  const active = document.querySelector('.tab.active');
  return active ? active.dataset.tab : 'user';
}

async function refreshUserState(options = {}) {
  const key = userKey();
  if (!key) return;
  try {
    let data = null;
    if (state.leaseId) {
      data = await postJson('/api/lease/heartbeat', { userKey: key, leaseId: state.leaseId });
      if (data.lease && data.lease.status !== 'active') {
        localStorage.removeItem('kiropoolLeaseId');
        state.leaseId = '';
      }
    } else {
      data = await postJson('/api/login', { userKey: key });
    }
    localStorage.setItem('kiropoolUserKey', key);
    setMetrics(data);
    if (!options.silent) setNotice('userStatus', '数据已刷新', 'ok');
  } catch (err) {
    if (!options.silent) setNotice('userStatus', '刷新失败：' + err.message, 'err');
  }
}

async function syncUsage(options = {}) {
  const token = adminToken();
  if (!token) {
    if (!options.silent) setNotice('ownerStatus', '请先填写管理员密钥', 'err');
    return;
  }
  try {
    if (!options.silent) setNotice('ownerStatus', '正在同步车头额度...');
    const data = await postJson('/admin/sync-usage', {}, { 'x-admin-token': token });
    if (!options.silent) setNotice('ownerStatus', '同步完成：成功 ' + data.synced + '，失败 ' + data.failed, 'ok');
    await loadAdminState({ silent: true });
  } catch (err) {
    if (!options.silent) setNotice('ownerStatus', '同步失败：' + err.message, 'err');
  }
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.grid').forEach(item => {
      item.classList.remove('active');
      item.classList.add('hidden');
    });
    button.classList.add('active');
    const panel = $(button.dataset.tab + 'Panel');
    panel.classList.remove('hidden');
    panel.classList.add('active');
    if (button.dataset.tab === 'owner') {
      loadAdminState({ silent: true });
    } else {
      refreshUserState({ silent: true });
    }
  });
});

$('initializeServer').addEventListener('click', async () => {
  const adminToken = $('setupAdminToken').value.trim();
  const confirm = $('setupAdminTokenConfirm').value.trim();
  if (adminToken.length < 8) return setNotice('setupStatus', '管理员密钥至少 8 位', 'err');
  if (adminToken !== confirm) return setNotice('setupStatus', '两次输入不一致', 'err');
  try {
    setNotice('setupStatus', '正在初始化...');
    await postJson('/api/setup', { adminToken });
    $('adminToken').value = adminToken;
    localStorage.setItem('kiropoolAdminToken', adminToken);
    setNotice('ownerStatus', '初始化完成，可以上传车头凭证了。', 'ok');
    showMainApp();
    document.querySelector('[data-tab="owner"]').click();
  } catch (err) {
    setNotice('setupStatus', '初始化失败：' + err.message, 'err');
  }
});

$('chooseCredentialFile').addEventListener('click', () => {
  $('credentialFile').click();
});

$('credentialFile').addEventListener('change', async () => {
  const file = $('credentialFile').files && $('credentialFile').files[0];
  if (!file) return;
  try {
    const text = await file.text();
    JSON.parse(text);
    $('credentialJson').value = text;
    if (!$('accountName').value.trim()) {
      $('accountName').value = file.name.replace(/\\.json$/i, '');
    }
    setNotice('ownerStatus', '已读取文件：' + file.name, 'ok');
  } catch (err) {
    $('credentialFile').value = '';
    setNotice('ownerStatus', '文件不是合法 JSON：' + err.message, 'err');
  }
});

$('refreshAccounts').addEventListener('click', () => loadAdminState());
$('refreshUsers').addEventListener('click', () => loadAdminState());
$('syncUsage').addEventListener('click', () => syncUsage());

$('accountList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const token = adminToken();
  if (!token) return setNotice('ownerStatus', '请先填写管理员密钥', 'err');
  const id = button.dataset.id;
  const action = button.dataset.action;
  try {
    if (action === 'toggle-account') {
      const enable = button.textContent.trim() === '启用';
      await postJson('/admin/accounts/update', { id, enabled: enable }, { 'x-admin-token': token });
      setNotice('ownerStatus', enable ? '车头凭证已启用' : '车头凭证已停用', 'ok');
    }
    if (action === 'delete-account') {
      if (!confirm('确定删除这个车头凭证吗？')) return;
      await postJson('/admin/accounts/delete', { id }, { 'x-admin-token': token });
      setNotice('ownerStatus', '车头凭证已删除', 'ok');
    }
    await loadAdminState();
  } catch (err) {
    setNotice('ownerStatus', '操作失败：' + err.message, 'err');
  }
});

$('userList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const token = adminToken();
  if (!token) return setNotice('createUserStatus', '请先填写管理员密钥', 'err');
  const id = button.dataset.id;
  const action = button.dataset.action;
  try {
    if (action === 'reset-user-key') {
      if (!confirm('确定重置这个用户的密钥吗？旧密钥会立刻失效。')) return;
      const data = await postJson('/admin/users/reset-key', { id }, { 'x-admin-token': token });
      setNotice('createUserStatus', '新密钥：' + data.user.key, 'ok');
    }
    if (action === 'toggle-user') {
      const enable = button.textContent.trim() === '启用';
      await postJson('/admin/users/update', { id, enabled: enable }, { 'x-admin-token': token });
      setNotice('createUserStatus', enable ? '用户已启用' : '用户已停用', 'ok');
    }
    if (action === 'delete-user') {
      if (!confirm('确定删除这个用户吗？')) return;
      await postJson('/admin/users/delete', { id }, { 'x-admin-token': token });
      setNotice('createUserStatus', '用户已删除', 'ok');
    }
    await loadAdminState();
  } catch (err) {
    setNotice('createUserStatus', '操作失败：' + err.message, 'err');
  }
});

async function loadSetupState() {
  try {
    const data = await getJson('/api/setup');
    if (data.initialized) {
      showMainApp();
      const savedAdminToken = localStorage.getItem('kiropoolAdminToken') || '';
      if (savedAdminToken) $('adminToken').value = savedAdminToken;
      return;
    }
    showSetup();
  } catch (err) {
    showSetup();
    setNotice('setupStatus', '读取初始化状态失败：' + err.message, 'err');
  }
}

$('checkQuota').addEventListener('click', () => refreshUserState());

$('downloadCredential').addEventListener('click', async () => {
  const key = userKey();
  if (!key) return setNotice('userStatus', '请填写用户密钥', 'err');
  try {
    setNotice('userStatus', '正在生成备用 JSON...');
    const data = await postJson('/api/lease/start', { userKey: key });
    state.leaseId = data.lease.id;
    state.userKey = key;
    localStorage.setItem('kiropoolLeaseId', state.leaseId);
    localStorage.setItem('kiropoolUserKey', key);
    setMetrics(data);
    saveBlob('kiro-auth-token.json', data.credentials);
    setNotice('userStatus', '备用 JSON 已下载。当前会话：' + data.lease.accountName, 'ok');
  } catch (err) {
    setNotice('userStatus', '备用下载失败：' + err.message, 'err');
  }
});

$('heartbeat').addEventListener('click', () => refreshUserState());

$('stopLease').addEventListener('click', async () => {
  const key = userKey();
  if (!key || !state.leaseId) return setNotice('userStatus', '没有可停止的会话', 'err');
  try {
    const data = await postJson('/api/lease/stop', { userKey: key, leaseId: state.leaseId });
    localStorage.removeItem('kiropoolLeaseId');
    state.leaseId = '';
    $('lease').textContent = '-';
    setNotice('userStatus', '会话已停止，本次用量：' + (data.lease.used || 0), 'ok');
  } catch (err) {
    setNotice('userStatus', '停止失败：' + err.message, 'err');
  }
});

$('uploadCredential').addEventListener('click', async () => {
  const adminToken = $('adminToken').value.trim();
  if (!adminToken) return setNotice('ownerStatus', '请填写管理员密钥', 'err');
  try {
    const credentials = parseCredentials($('credentialJson').value);
    if (!credentials.refreshToken && !credentials.refresh_token && !credentials.accessToken && !credentials.access_token) {
      return setNotice('ownerStatus', '凭证缺少刷新令牌 / 访问令牌', 'err');
    }
    setNotice('ownerStatus', '正在上传车头凭证...');
    const data = await postJson('/admin/accounts', {
      name: $('accountName').value.trim() || 'kiro-account',
      credentials
    }, { 'x-admin-token': adminToken });
    localStorage.setItem('kiropoolAdminToken', adminToken);
    $('credentialJson').value = '';
    setNotice('ownerStatus', '车头凭证已上传：' + data.account.name, 'ok');
    await loadAdminState();
  } catch (err) {
    setNotice('ownerStatus', '上传失败：' + err.message, 'err');
  }
});

$('createUser').addEventListener('click', async () => {
  const adminToken = $('adminToken').value.trim();
  if (!adminToken) return setNotice('createUserStatus', '请先填写左侧管理员密钥', 'err');
  try {
    const body = {
      name: $('newUserName').value.trim() || 'user',
      key: $('newUserKey').value.trim(),
      quota: Number($('newUserQuota').value || 2500)
    };
    setNotice('createUserStatus', '正在创建用户...');
    const data = await postJson('/admin/users', body, { 'x-admin-token': adminToken });
    localStorage.setItem('kiropoolAdminToken', adminToken);
    setNotice('createUserStatus', '用户已创建，密钥：' + data.user.key, 'ok');
    await loadAdminState();
  } catch (err) {
    setNotice('createUserStatus', '创建失败：' + err.message, 'err');
  }
});

function startAutoRefresh() {
  if (activeTab() === 'owner') {
    loadAdminState({ silent: true });
  } else {
    refreshUserState({ silent: true });
  }

  setInterval(() => {
    if (document.hidden || $('setupPanel').classList.contains('hidden') === false) return;
    if (activeTab() === 'owner') {
      loadAdminState({ silent: true });
    } else {
      refreshUserState({ silent: true });
    }
  }, 10000);

  setInterval(() => {
    if (document.hidden || $('setupPanel').classList.contains('hidden') === false) return;
    if (activeTab() === 'owner') syncUsage({ silent: true });
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (activeTab() === 'owner') {
      loadAdminState({ silent: true });
    } else {
      refreshUserState({ silent: true });
    }
  });
}

loadSetupState().then(startAutoRefresh);`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function uid(prefix = '') {
  return prefix + crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function defaultDb() {
  return {
    version: 1,
    createdAt: nowIso(),
    settings: {
      adminTokenHash: '',
      adminTokenSalt: '',
      initializedAt: ''
    },
    accounts: [],
    users: [],
    leases: [],
    events: []
  };
}

function loadDb() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(DB_FILE)) {
    const db = defaultDb();
    saveDb(db);
    return db;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.settings = db.settings || { adminTokenHash: '', adminTokenSalt: '', initializedAt: '' };
  db.accounts = db.accounts || [];
  db.users = db.users || [];
  db.leases = db.leases || [];
  db.events = db.events || [];
  return db;
}

function saveDb(db) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function publicDb(db) {
  return {
    version: db.version,
    accounts: db.accounts.map(a => ({
      id: a.id,
      name: a.name,
      enabled: a.enabled,
      status: a.status,
      usage: a.usage || null,
      activeLeaseId: a.activeLeaseId || '',
      updatedAt: a.updatedAt || ''
    })),
    users: db.users.map(u => ({
      id: u.id,
      name: u.name,
      quota: u.quota,
      used: u.used || 0,
      enabled: u.enabled,
      key: u.key,
      updatedAt: u.updatedAt || ''
    })),
    leases: db.leases
  };
}

function hashAdminToken(token, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(token, salt, 64).toString('hex');
  return { salt, hash };
}

function safeEqualHex(a, b) {
  const left = Buffer.from(a || '', 'hex');
  const right = Buffer.from(b || '', 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hasAdminConfigured(db) {
  return Boolean(ADMIN_TOKEN || db.settings.adminTokenHash);
}

function verifyStoredAdminToken(db, token) {
  if (!db.settings.adminTokenHash || !db.settings.adminTokenSalt || !token) return false;
  const candidate = hashAdminToken(token, db.settings.adminTokenSalt);
  return safeEqualHex(candidate.hash, db.settings.adminTokenHash);
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-admin-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  });
  res.end(raw);
}

function sendText(res, status, contentType, body) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req, db) {
  const token = req.headers['x-admin-token'] || '';
  if (ADMIN_TOKEN) return token === ADMIN_TOKEN;
  return verifyStoredAdminToken(db, token);
}

function pickCredentials(input) {
  const source = input && input.credentials && typeof input.credentials === 'object'
    ? input.credentials
    : input;
  if (!source || typeof source !== 'object') throw new Error('缺少 Kiro credentials');
  const accessToken = source.accessToken || source.access_token || '';
  const refreshToken = source.refreshToken || source.refresh_token || '';
  if (!accessToken && !refreshToken) throw new Error('credentials 缺少 accessToken / refreshToken');
  return {
    accessToken,
    refreshToken,
    expiresAt: source.expiresAt || source.expires_at || '',
    authMethod: source.authMethod || source.auth_method || 'social',
    provider: source.provider || source.idp || '',
    profileArn: source.profileArn || source.profile_arn || '',
    region: source.region || 'us-east-1',
    clientId: source.clientId || '',
    clientSecret: source.clientSecret || '',
    csrfToken: source.csrfToken || ''
  };
}

function stripRefreshToken(credentials) {
  return {
    ...credentials,
    refreshToken: '',
    clientSecret: ''
  };
}

async function refreshKiroCredentials(account) {
  const credentials = account.credentials || {};
  if (!credentials.refreshToken) return credentials;
  const response = await fetch(KIRO_REFRESH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ refreshToken: credentials.refreshToken }),
    signal: AbortSignal.timeout(25000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Kiro token refresh failed HTTP ${response.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  const updated = {
    ...credentials,
    accessToken: data.accessToken || credentials.accessToken,
    refreshToken: data.refreshToken || credentials.refreshToken,
    profileArn: data.profileArn || credentials.profileArn
  };
  if (data.expiresIn) updated.expiresAt = new Date(Date.now() + Number(data.expiresIn) * 1000).toISOString();
  account.credentials = updated;
  account.updatedAt = nowIso();
  return updated;
}

function getUsedCreditsFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  if (usage.current != null) return Number(usage.current) || 0;
  const list = usage.usageBreakdownList || usage.usageBreakdowns || [];
  if (Array.isArray(list) && list.length) {
    return list.reduce((sum, item) => sum + (Number(item.currentUsage || item.current || 0) || 0), 0);
  }
  return 0;
}

async function fetchKiroUsage(account) {
  const c = account.credentials || {};
  if (!c.accessToken) throw new Error('账号缺少 accessToken');
  const region = c.region || ((/codewhisperer:([a-z0-9-]+):/.exec(c.profileArn || '') || [])[1]) || 'us-east-1';
  const url = `https://q.${region}.amazonaws.com/getUsageLimits?origin=AI_EDITOR&profileArn=${encodeURIComponent(c.profileArn || '')}&resourceType=AGENTIC_REQUEST`;
  const headers = {
    authorization: `Bearer ${c.accessToken}`,
    accept: 'application/json'
  };
  if (c.authMethod === 'iam' || c.provider === 'EXTERNAL_IDP') headers.TokenType = 'EXTERNAL_IDP';
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Kiro usage failed HTTP ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function findUserByKey(db, key) {
  return db.users.find(u => u.key === key && u.enabled !== false);
}

function finishLease(db, lease, reason, usageNow) {
  if (!lease || lease.status !== 'active') return lease;
  const user = db.users.find(u => u.id === lease.userId);
  const account = db.accounts.find(a => a.id === lease.accountId);
  const baseline = Number(lease.baselineUsed || 0);
  const current = Number(usageNow != null ? usageNow : lease.lastUsed || baseline);
  const delta = Math.max(0, current - baseline);
  lease.status = 'closed';
  lease.reason = reason || 'stopped';
  lease.endedAt = nowIso();
  lease.used = delta;
  if (user) {
    user.used = Math.max(0, Number(user.used || 0) + delta);
    user.updatedAt = nowIso();
  }
  if (account) {
    account.activeLeaseId = '';
    account.updatedAt = nowIso();
  }
  db.events.unshift({ id: uid('evt_'), type: 'lease.closed', leaseId: lease.id, used: delta, at: nowIso() });
  return lease;
}

function cleanupLeases(db) {
  let changed = false;
  const now = Date.now();
  for (const lease of db.leases) {
    if (lease.status === 'active' && lease.expiresAt && Date.parse(lease.expiresAt) <= now) {
      finishLease(db, lease, 'expired', lease.lastUsed);
      changed = true;
    }
  }
  for (const account of db.accounts) {
    if (!account.activeLeaseId) continue;
    const lease = db.leases.find(item => item.id === account.activeLeaseId);
    if (!lease || lease.status !== 'active') {
      account.activeLeaseId = '';
      account.updatedAt = nowIso();
      changed = true;
    }
  }
  return changed;
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = loadDb();
  if (cleanupLeases(db)) saveDb(db);

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return sendText(res, 200, 'text/html; charset=utf-8', WEB_HTML);
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      return sendText(res, 200, 'text/css; charset=utf-8', WEB_CSS);
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      return sendText(res, 200, 'application/javascript; charset=utf-8', WEB_JS);
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, name: 'KiroPool', at: nowIso() });
    }

    if (req.method === 'GET' && url.pathname === '/api/setup') {
      return sendJson(res, 200, {
        ok: true,
        initialized: hasAdminConfigured(db),
        source: ADMIN_TOKEN ? 'env' : (db.settings.adminTokenHash ? 'database' : 'none')
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/setup') {
      if (hasAdminConfigured(db)) return sendJson(res, 409, { ok: false, error: '服务端已初始化' });
      const body = await readBody(req);
      const adminToken = String(body.adminToken || '').trim();
      if (adminToken.length < 8) return sendJson(res, 400, { ok: false, error: '管理员密钥至少 8 位' });
      const hashed = hashAdminToken(adminToken);
      db.settings.adminTokenSalt = hashed.salt;
      db.settings.adminTokenHash = hashed.hash;
      db.settings.initializedAt = nowIso();
      db.events.unshift({ id: uid('evt_'), type: 'setup.initialized', at: nowIso() });
      saveDb(db);
      return sendJson(res, 200, { ok: true, initialized: true });
    }

    if (url.pathname.startsWith('/admin/')) {
      if (!hasAdminConfigured(db)) return sendJson(res, 428, { ok: false, error: '服务端尚未初始化' });
      if (!requireAdmin(req, db)) return sendJson(res, 401, { ok: false, error: '管理员密钥无效' });
    }

    if (req.method === 'GET' && url.pathname === '/admin/state') {
      return sendJson(res, 200, { ok: true, data: publicDb(db) });
    }

    if (req.method === 'POST' && url.pathname === '/admin/accounts') {
      const body = await readBody(req);
      const credentials = pickCredentials(body);
      const account = {
        id: uid('acc_'),
        name: body.name || body.email || body.nickname || 'kiro-account',
        enabled: body.enabled !== false,
        status: 'ready',
        credentials,
        usage: null,
        activeLeaseId: '',
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.accounts.unshift(account);
      saveDb(db);
      return sendJson(res, 200, { ok: true, account: publicDb({ ...db, accounts: [account], users: [], leases: [] }).accounts[0] });
    }

    if (req.method === 'POST' && url.pathname === '/admin/accounts/update') {
      const body = await readBody(req);
      const account = db.accounts.find(a => a.id === body.id);
      if (!account) return sendJson(res, 404, { ok: false, error: '车头凭证不存在' });
      if (body.enabled != null) account.enabled = body.enabled !== false;
      if (body.name != null && String(body.name).trim()) account.name = String(body.name).trim();
      account.updatedAt = nowIso();
      saveDb(db);
      return sendJson(res, 200, {
        ok: true,
        account: publicDb({ ...db, accounts: [account], users: [], leases: [] }).accounts[0]
      });
    }

    if (req.method === 'POST' && url.pathname === '/admin/accounts/delete') {
      const body = await readBody(req);
      const index = db.accounts.findIndex(a => a.id === body.id);
      if (index < 0) return sendJson(res, 404, { ok: false, error: '车头凭证不存在' });
      const account = db.accounts[index];
      if (account.activeLeaseId) return sendJson(res, 409, { ok: false, error: '车头正在租用中，不能删除' });
      db.accounts.splice(index, 1);
      db.events.unshift({ id: uid('evt_'), type: 'account.deleted', accountId: account.id, at: nowIso() });
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/admin/users') {
      const body = await readBody(req);
      const user = {
        id: uid('usr_'),
        name: body.name || 'user',
        key: body.key || `kp_${crypto.randomBytes(18).toString('base64url')}`,
        quota: Number(body.quota || 2500),
        used: Number(body.used || 0),
        enabled: body.enabled !== false,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.users.unshift(user);
      saveDb(db);
      return sendJson(res, 200, { ok: true, user });
    }

    if (req.method === 'POST' && url.pathname === '/admin/users/update') {
      const body = await readBody(req);
      const user = db.users.find(u => u.id === body.id);
      if (!user) return sendJson(res, 404, { ok: false, error: '用户不存在' });
      if (body.name != null && String(body.name).trim()) user.name = String(body.name).trim();
      if (body.quota != null) user.quota = Number(body.quota || 0);
      if (body.enabled != null) user.enabled = body.enabled !== false;
      user.updatedAt = nowIso();
      saveDb(db);
      return sendJson(res, 200, { ok: true, user });
    }

    if (req.method === 'POST' && url.pathname === '/admin/users/reset-key') {
      const body = await readBody(req);
      const user = db.users.find(u => u.id === body.id);
      if (!user) return sendJson(res, 404, { ok: false, error: '用户不存在' });
      user.key = `kp_${crypto.randomBytes(18).toString('base64url')}`;
      user.updatedAt = nowIso();
      db.events.unshift({ id: uid('evt_'), type: 'user.key_reset', userId: user.id, at: nowIso() });
      saveDb(db);
      return sendJson(res, 200, { ok: true, user });
    }

    if (req.method === 'POST' && url.pathname === '/admin/users/delete') {
      const body = await readBody(req);
      const activeLease = db.leases.find(l => l.userId === body.id && l.status === 'active');
      if (activeLease) return sendJson(res, 409, { ok: false, error: '用户正在租用中，不能删除' });
      const index = db.users.findIndex(u => u.id === body.id);
      if (index < 0) return sendJson(res, 404, { ok: false, error: '用户不存在' });
      const user = db.users[index];
      db.users.splice(index, 1);
      db.events.unshift({ id: uid('evt_'), type: 'user.deleted', userId: user.id, at: nowIso() });
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/admin/sync-usage') {
      let ok = 0;
      let failed = 0;
      for (const account of db.accounts) {
        try {
          await refreshKiroCredentials(account);
          account.usage = await fetchKiroUsage(account);
          account.status = 'ready';
          account.updatedAt = nowIso();
          ok++;
        } catch (err) {
          account.status = 'usage_failed';
          account.lastError = err.message;
          failed++;
        }
      }
      saveDb(db);
      return sendJson(res, 200, { ok: true, synced: ok, failed });
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      const user = findUserByKey(db, body.userKey || '');
      if (!user) return sendJson(res, 401, { ok: false, error: '用户 key 无效' });
      return sendJson(res, 200, {
        ok: true,
        user: { id: user.id, name: user.name, quota: user.quota, used: user.used || 0, remaining: Math.max(0, user.quota - (user.used || 0)) }
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/lease/start') {
      const body = await readBody(req);
      const user = findUserByKey(db, body.userKey || '');
      if (!user) return sendJson(res, 401, { ok: false, error: '用户 key 无效' });
      if (Number(user.used || 0) >= Number(user.quota || 0)) return sendJson(res, 403, { ok: false, error: '额度已用完' });

      const existingLease = db.leases.find(l => l.userId === user.id && l.status === 'active');
      if (existingLease) {
        const account = db.accounts.find(a => a.id === existingLease.accountId);
        return sendJson(res, 200, { ok: true, lease: existingLease, credentials: stripRefreshToken(account.credentials) });
      }

      const account = db.accounts.find(a => a.enabled !== false && !a.activeLeaseId);
      if (!account) return sendJson(res, 409, { ok: false, error: '暂无空闲 Kiro 账号' });

      await refreshKiroCredentials(account);
      try { account.usage = await fetchKiroUsage(account); } catch (err) { account.lastError = err.message; }
      const baselineUsed = getUsedCreditsFromUsage(account.usage);
      const lease = {
        id: uid('les_'),
        userId: user.id,
        userName: user.name,
        accountId: account.id,
        accountName: account.name,
        status: 'active',
        baselineUsed,
        lastUsed: baselineUsed,
        startedAt: nowIso(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      };
      account.activeLeaseId = lease.id;
      account.updatedAt = nowIso();
      db.leases.unshift(lease);
      db.events.unshift({ id: uid('evt_'), type: 'lease.started', leaseId: lease.id, at: nowIso() });
      saveDb(db);
      return sendJson(res, 200, { ok: true, lease, credentials: stripRefreshToken(account.credentials) });
    }

    if (req.method === 'POST' && url.pathname === '/api/lease/heartbeat') {
      const body = await readBody(req);
      const user = findUserByKey(db, body.userKey || '');
      if (!user) return sendJson(res, 401, { ok: false, error: '用户 key 无效' });
      const lease = db.leases.find(l => l.id === body.leaseId && l.userId === user.id && l.status === 'active');
      if (!lease) return sendJson(res, 404, { ok: false, error: '租用不存在或已结束' });
      const account = db.accounts.find(a => a.id === lease.accountId);
      let current = lease.lastUsed;
      try {
        account.usage = await fetchKiroUsage(account);
        current = getUsedCreditsFromUsage(account.usage);
        lease.lastUsed = current;
      } catch (err) {
        account.lastError = err.message;
      }
      const pending = Math.max(0, Number(current || 0) - Number(lease.baselineUsed || 0));
      const total = Number(user.used || 0) + pending;
      if (total >= Number(user.quota || 0)) {
        finishLease(db, lease, 'quota_exceeded', current);
      }
      lease.lastHeartbeatAt = nowIso();
      saveDb(db);
      return sendJson(res, 200, {
        ok: true,
        lease,
        user: { quota: user.quota, used: user.used || 0, pending, remaining: Math.max(0, Number(user.quota || 0) - total) }
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/lease/stop') {
      const body = await readBody(req);
      const user = findUserByKey(db, body.userKey || '');
      if (!user) return sendJson(res, 401, { ok: false, error: '用户 key 无效' });
      const lease = db.leases.find(l => l.id === body.leaseId && l.userId === user.id && l.status === 'active');
      if (!lease) return sendJson(res, 404, { ok: false, error: '租用不存在或已结束' });
      const account = db.accounts.find(a => a.id === lease.accountId);
      let current = lease.lastUsed;
      try {
        account.usage = await fetchKiroUsage(account);
        current = getUsedCreditsFromUsage(account.usage);
      } catch (err) {
        account.lastError = err.message;
      }
      finishLease(db, lease, 'stopped', current);
      saveDb(db);
      return sendJson(res, 200, { ok: true, lease });
    }

    return sendJson(res, 404, { ok: false, error: '接口不存在' });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message });
  }
}

const server = http.createServer(route);
server.listen(PORT, HOST, () => {
  console.log(`KiroPool server listening on http://${HOST}:${PORT}`);
});
