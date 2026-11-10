const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('garea_token') || '';
let refreshTimer;
const authHeaders = () => ({ Authorization: `Bearer ${token}` });
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), ...authHeaders() } });
  if (response.status === 401) { disconnect(false); throw new Error('Session expired. Pair again.'); }
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : response;
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}
function message(text) { $('notice').textContent = text || ''; }
function disconnect(showMessage = true) {
  token = ''; sessionStorage.removeItem('garea_token'); clearInterval(refreshTimer);
  $('pairPanel').hidden = false; $('dashboard').hidden = true; $('connection').textContent = 'Disconnected';
  if (showMessage) message('Disconnected from this browser.');
}
async function loadStatus() {
  const s = await api('/status');
  $('cpu').textContent = `${Math.round(s.cpu_percent)}%`;
  $('memory').textContent = `${Math.round(s.memory_percent)}%`;
  $('disk').textContent = `${Math.round(s.disk_percent)}%`;
  $('controlState').textContent = s.control_enabled ? 'Desktop control enabled' : 'Control disabled in agent settings';
  $('connection').textContent = 'Connected';
}
async function loadScreen() {
  const response = await fetch(`/screen.jpg?t=${Date.now()}`, { headers: authHeaders() });
  if (!response.ok) throw new Error('Could not load PC screen');
  const blob = await response.blob();
  $('screen').src = URL.createObjectURL(blob);
}
async function loadFactory() {
  const f = await api('/factory/status');
  $('factoryStatus').textContent = f.configured ? `Project folder found: ${f.project_dir_name}` : 'Project folder not found. Update GAREA_PROJECT_DIR in desktop-agent/.env.';
}
async function openDashboard() {
  $('pairPanel').hidden = true; $('dashboard').hidden = false;
  await Promise.all([loadStatus(), loadScreen(), loadFactory()]);
  clearInterval(refreshTimer); refreshTimer = setInterval(() => loadStatus().catch(e => message(e.message)), 5000);
}
$('pairForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('pairMessage').textContent = 'Connecting…';
  try {
    const response = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('pin').value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Pairing failed');
    token = data.token; sessionStorage.setItem('garea_token', token); $('pin').value = '';
    $('pairMessage').textContent = ''; await openDashboard(); message('Connected.');
  } catch (e) { $('pairMessage').textContent = e.message; }
});
$('refreshScreen').addEventListener('click', () => loadScreen().then(() => message('Screen refreshed.')).catch(e => message(e.message)));
$('screen').addEventListener('click', async (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  try { await api('/desktop/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x, y }) }); message('Click sent.'); setTimeout(() => loadScreen().catch(() => {}), 400); }
  catch (e) { message(e.message); }
});
$('sendText').addEventListener('click', async () => {
  const text = $('typeText').value;
  if (!text.trim()) return message('Enter text first.');
  try { await api('/desktop/type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); $('typeText').value = ''; message('Text sent to PC.'); }
  catch (e) { message(e.message); }
});
$('disconnect').addEventListener('click', () => disconnect());
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
if (token) openDashboard().catch(e => { disconnect(false); message(e.message); });
