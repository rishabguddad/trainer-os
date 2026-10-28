'use strict';
/* TrainerOS — clients, session packages and payments. Local-first: all data lives in localStorage. */

const KEY = 'traineros.v5';
const LEGACY_KEY = 'trainer_os_v3';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first
const WORKOUTS = ['Strength', 'Hypertrophy', 'Fat loss', 'Cardio', 'HIIT', 'Mobility', 'Functional', 'Full body',
  'Upper body', 'Lower body', 'Push', 'Pull', 'Legs', 'Core', 'Chest + Triceps', 'Back + Biceps', 'Shoulders', 'Stretching'];
const METHODS = ['UPI', 'Cash', 'Bank', 'Card', 'Other'];
const STATUS = {
  scheduled: { label: 'Scheduled', icon: 'clock' },
  done: { label: 'Done', icon: 'check' },
  noshow: { label: 'No-show', icon: 'slash' },
  cancelled: { label: 'Cancelled', icon: 'x' },
};

/* ---------- Small utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const num = (v, d = 0) => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : d; };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const first = name => String(name || '').trim().split(/\s+/)[0];
const sum = (arr, f) => arr.reduce((a, x) => a + (+f(x) || 0), 0);

// Dates are local "YYYY-MM-DD" strings — never toISOString(), which shifts days in IST.
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtDate = (s, o = { day: 'numeric', month: 'short' }) => s ? parse(s).toLocaleDateString('en-IN', o) : '';
const fmtDay = s => fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' });
const monthAdd = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = (key, o = { month: 'long', year: 'numeric' }) => parse(key + '-01').toLocaleDateString('en-IN', o);
function hm(t) { if (!t) return { hm: '', ap: '' }; const [h, m] = t.split(':').map(Number); return { hm: `${(h % 12) || 12}:${pad(m)}`, ap: h >= 12 ? 'PM' : 'AM' }; }
const fmtTime = t => { const x = hm(t); return x.hm ? `${x.hm} ${x.ap}` : ''; };
function relDay(s) {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  return fmtDay(s);
}
function daysAgo(isoTs) { if (!isoTs) return null; return Math.floor((Date.now() - new Date(isoTs).getTime()) / 864e5); }

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const money = n => inr.format(Math.round(+n || 0));
function compact(n) {
  n = Math.round(n);
  if (n >= 1e5) return '₹' + +(n / 1e5).toFixed(1) + 'L';
  if (n >= 1e3) return '₹' + +(n / 1e3).toFixed(1) + 'k';
  return '₹' + n;
}

function daysText(days) {
  const s = ORDER.filter(d => days.includes(d));
  if (s.length === 7) return 'Every day';
  if (!s.length) return 'No days';
  const idx = s.map(d => ORDER.indexOf(d));
  const run = idx.every((v, i) => !i || v === idx[i - 1] + 1);
  return run && s.length >= 3 ? `${DOW[s[0]]}–${DOW[s[s.length - 1]]}` : s.map(d => DOW[d]).join(', ');
}
/** The next `count` dates on/after `from` that fall on one of `days`. */
function nextDates(from, count, days) {
  const out = [];
  if (!days.length) return out;
  let d = from;
  for (let guard = 0; out.length < count && guard < 4000; guard++) {
    if (days.includes(parse(d).getDay())) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
/** "Push, Pull, Legs" rotates across sessions; a single name repeats. */
function rotation(w) {
  const list = String(w || '').split(',').map(x => x.trim()).filter(Boolean);
  return i => list.length ? list[i % list.length] : '';
}

/* ---------- Icons ---------- */
const ICONS = {
  today: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  more: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  slash: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- State ---------- */
function blank() {
  return {
    v: 5,
    settings: { trainer: '', rate: 1000, days: [1, 2, 3, 4, 5, 6], time: '18:00', duration: 60, noShowBillable: false, theme: 'auto', lastBackup: null },
    clients: [], packages: [], sessions: [], payments: [],
  };
}
function normalize(s) {
  const b = blank();
  const out = { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
  for (const k of ['clients', 'packages', 'sessions', 'payments']) out[k] = Array.isArray(s[k]) ? s[k] : [];
  return out;
}
/** Import data from the old single-file version (trainer_os_v3). */
function migrateV3(o) {
  const st = blank(), id = x => String(x);
  st.clients = (o.clients || []).map(c => ({ id: id(c.id), name: c.name, phone: c.phone || '', rate: 1000, goal: '', archived: false, createdAt: new Date().toISOString() }));
  st.packages = (o.plans || []).map(p => ({ id: id(p.id), clientId: id(p.clientId), title: `${p.count}-session package`, start: p.start, count: p.count, days: [1, 2, 3, 4, 5, 6], time: p.time, duration: p.duration || 60, workout: '', rate: 1000 }));
  st.sessions = (o.sessions || []).map(s => ({ id: id(s.id), clientId: id(s.clientId), packageId: s.planId ? id(s.planId) : null, date: s.date, time: s.time, duration: s.duration || 60, workout: s.workout || '', rate: 1000, status: s.status === 'Completed' ? 'done' : 'scheduled', note: '' }));
  st.payments = (o.payments || []).map(p => ({ id: id(p.id), clientId: id(p.clientId), amount: +p.amount, date: p.date, method: p.method || 'UPI', note: p.note || '' }));
  return st;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { console.error(e); }
  try { const old = localStorage.getItem(LEGACY_KEY); if (old) return migrateV3(JSON.parse(old)); } catch (e) { console.error(e); }
  return blank();
}
let S = load();
function persistLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save — storage is full or blocked'); }
}
function save() { S.updatedAt = Date.now(); persistLocal(); schedulePush(); }
/** Run a change, persist, re-render, and return an undo function. */
function mutate(fn) {
  const snap = JSON.stringify(S);
  fn();
  save(); render();
  return () => { S = normalize(JSON.parse(snap)); save(); render(); toast('Undone'); };
}
const undoAction = undo => ({ label: 'Undo', fn: undo });

/* ---------- Cloud sync (via /api/data on Vercel, protected by APP_PASSCODE) ---------- */
const SYNC_KEY = 'traineros.sync'; // kept apart from the data so backups never contain the passcode
let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } })();
let syncState = { status: sync.passcode ? 'idle' : 'off', error: '' };
const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* ignore */ } };
function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function setSync(status, error = '') {
  syncState = { status, error };
  const box = document.getElementById('syncBox');
  if (box) box.outerHTML = syncBox();
}
async function api(method, body, passcode = sync.passcode) {
  const r = await fetch('api/data', {
    method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Passcode': passcode || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* non-JSON response */ }
  if (!r.ok) { const e = new Error(j.error || `Server error ${r.status}`); e.status = r.status; e.body = j; throw e; }
  return j;
}
function syncErrorText(e) {
  if (e.status === 401) return 'Wrong passcode';
  if (e.status === 404) return 'Sync server not found — this only works on the Vercel deployment';
  if (e.status) return e.message;
  return null; // network failure → treat as offline
}
let pushTimer = null;
function schedulePush() {
  if (!sync.passcode) return;
  sync.pending = true; saveSync();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
}
async function push(force = false) {
  if (!sync.passcode || !sync.pending) return;
  if (!navigator.onLine) return setSync('offline');
  setSync('syncing');
  try {
    await api('PUT', { data: S, updatedAt: S.updatedAt || 0, force });
    sync.pending = false; sync.lastSync = Date.now(); saveSync();
    setSync('ok');
  } catch (e) {
    if (e.status === 409) return resolveConflict(e.body);
    const msg = syncErrorText(e);
    setSync(msg ? 'error' : 'offline', msg || '');
  }
}
function resolveConflict(remote) {
  const useCloud = confirm(`The cloud has newer changes (saved ${new Date(remote.updatedAt).toLocaleString('en-IN')}).\n\nOK = load the cloud data on this phone\nCancel = keep this phone's data and overwrite the cloud`);
  if (useCloud) { applyRemote(remote); sync.pending = false; sync.lastSync = Date.now(); saveSync(); setSync('ok'); }
  else { sync.pending = true; S.updatedAt = Date.now(); persistLocal(); push(true); }
}
function applyRemote(r) { S = normalize(r.data); S.updatedAt = r.updatedAt; persistLocal(); render(); }
async function pull() {
  if (!sync.passcode) return;
  if (!navigator.onLine) return setSync('offline');
  setSync('syncing');
  try {
    const r = await api('GET');
    const local = S.updatedAt || 0;
    if (r.data && r.updatedAt > local && !sync.pending) applyRemote(r);
    else if (sync.pending || local > r.updatedAt) { sync.pending = true; return push(); }
    sync.lastSync = Date.now(); saveSync();
    setSync('ok');
  } catch (e) {
    const msg = syncErrorText(e);
    setSync(msg ? 'error' : 'offline', msg || '');
  }
}
async function connectSync(passcode) {
  if (!passcode) return;
  setSync('syncing');
  try {
    const r = await api('GET', null, passcode);
    sync = { passcode, pending: false, lastSync: null };
    const remoteHas = r.data?.clients?.length, localHas = S.clients.length;
    if (remoteHas && (!localHas || confirm(`The cloud already has ${r.data.clients.length} clients and ${r.data.sessions.length} sessions.\n\nOK = use the cloud data on this phone\nCancel = replace the cloud with this phone's data`))) {
      applyRemote(r);
    } else {
      sync.pending = true;
      if (!S.updatedAt || S.updatedAt <= r.updatedAt) S.updatedAt = Date.now();
      persistLocal();
    }
    saveSync();
    if (sync.pending) await push(true);
    else { sync.lastSync = Date.now(); saveSync(); setSync('ok'); }
    render();
    if (syncState.status === 'ok') toast('Cloud sync is on');
  } catch (e) {
    setSync('off', syncErrorText(e) || 'No connection — try again when online');
  }
}

const ui = { tab: 'today', day: today(), clientId: null, ctab: 'upcoming', cfilter: 'all', q: '', month: today().slice(0, 7), showAll: false };

/* ---------- Selectors & billing ---------- */
const clientOf = id => S.clients.find(c => c.id === id);
const sessOf = id => S.sessions.find(s => s.id === id);
const pkgOf = id => S.packages.find(p => p.id === id);
const payOf = id => S.payments.find(p => p.id === id);
const bySchedule = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
const sessionsOf = cid => S.sessions.filter(s => s.clientId === cid);
const billable = s => s.status === 'done' || (s.status === 'noshow' && S.settings.noShowBillable);
const consumes = s => s.status === 'scheduled' || billable(s); // counts toward a package
const earnedOf = cid => sum(sessionsOf(cid).filter(billable), s => s.rate);
const paidOf = cid => sum(S.payments.filter(p => p.clientId === cid), p => p.amount);
const balanceOf = cid => earnedOf(cid) - paidOf(cid); // > 0 due, < 0 advance
const pkgSessions = pid => S.sessions.filter(s => s.packageId === pid).sort(bySchedule);
function pkgStats(p) {
  const all = pkgSessions(p.id), c = all.filter(consumes), used = c.filter(billable).length;
  return { all, total: c.length, used, left: c.length - used, first: all[0]?.date, last: all[all.length - 1]?.date, value: sum(c, s => s.rate) };
}
function sessionNo(s) {
  if (!s.packageId || !consumes(s)) return null;
  const c = pkgSessions(s.packageId).filter(consumes), i = c.findIndex(x => x.id === s.id);
  return i < 0 ? null : { n: i + 1, of: c.length };
}
const nextSession = cid => { const t = today(); return sessionsOf(cid).filter(s => s.status === 'scheduled' && s.date >= t).sort(bySchedule)[0]; };
function packagesOf(cid) { return S.packages.filter(p => p.clientId === cid).sort((a, b) => (b.start || '').localeCompare(a.start || '')); }
function activePackage(cid) { const ps = packagesOf(cid); return ps.find(p => pkgStats(p).left > 0) || ps[0]; }
const canMakeup = s => !!(s.packageId && pkgOf(s.packageId) && (s.status === 'cancelled' || (s.status === 'noshow' && !billable(s))));
const overdue = () => { const t = today(); return S.sessions.filter(s => s.status === 'scheduled' && s.date < t).sort(bySchedule); };
function makeSession(o) {
  return { id: uid(), clientId: o.clientId, packageId: o.packageId || null, date: o.date, time: o.time || S.settings.time, duration: +o.duration || 60, workout: o.workout || '', rate: +o.rate || 0, status: 'scheduled', note: '' };
}
function usedWorkouts() { return [...new Set([...WORKOUTS, ...S.sessions.map(s => s.workout).filter(Boolean)])]; }

/* ---------- Shared bits ---------- */
function hue(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const avatar = (c, cls = '') => `<span class="avatar ${cls}" style="--h:${hue(c?.name)}" aria-hidden="true">${esc(initials(c?.name))}</span>`;
function balPill(b) {
  if (b > 0) return `<span class="pill bad">${money(b)} due</span>`;
  if (b < 0) return `<span class="pill ok">${money(-b)} credit</span>`;
  return '';
}
function statusPill(s) {
  if (s.status === 'done') return '<span class="pill ok">Done</span>';
  if (s.status === 'noshow') return '<span class="pill warn">No-show</span>';
  if (s.status === 'cancelled') return '<span class="pill neutral">Cancelled</span>';
  if (s.date < today()) return '<span class="pill warn">Not marked</span>';
  if (s.date === today()) return '<span class="pill info">Today</span>';
  return '';
}
const waNum = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '0') d = d.slice(1); if (d.length === 10) d = '91' + d; return d; };
const waLink = (p, text) => `https://wa.me/${waNum(p)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const sign = () => S.settings.trainer ? `\n\n– ${S.settings.trainer}` : '';
const daysPicker = sel => `<div class="days">${ORDER.map(d => `<label class="chip"><input type="checkbox" name="days" value="${d}" ${sel.includes(d) ? 'checked' : ''}><span>${DOW[d]}</span></label>`).join('')}</div>`;
const clientOptions = sel => S.clients.filter(c => !c.archived || c.id === sel).sort((a, b) => a.name.localeCompare(b.name))
  .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const greeting = () => { const h = new Date().getHours(); return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (S.settings.trainer ? `, ${first(S.settings.trainer)}` : ''); };
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/* ======================================================================
   VIEWS
   ====================================================================== */
function viewToday() {
  const t = today(), d = ui.day, isT = d === t;
  const list = S.sessions.filter(s => s.date === d).sort(bySchedule);
  const live = list.filter(s => s.status !== 'cancelled');
  const done = list.filter(s => s.status === 'done').length;
  const earned = sum(list.filter(billable), s => s.rate);
  const od = isT ? overdue() : [];
  return `
  <header class="head">
    <div><p class="eyebrow">${esc(greeting())}</p><h1>${isT ? 'Today' : esc(fmtDate(d, { weekday: 'long' }))}</h1></div>
    ${S.clients.length ? `<button class="icon-btn primary" data-act="newSession" data-date="${d}" aria-label="Add session">${ic('plus')}</button>` : ''}
  </header>
  ${weekStrip()}
  ${S.clients.length ? '' : onboarding()}
  <div class="tiles">
    <div class="tile"><small>Sessions</small><b>${live.length}</b></div>
    <div class="tile"><small>Done</small><b>${done}<span class="of">/${live.length}</span></b></div>
    <div class="tile"><small>Earned</small><b>${money(earned)}</b></div>
  </div>
  ${isT ? backupNudge() : ''}
  ${od.length ? overdueBlock(od) : ''}
  <div class="sec"><h2>${isT ? 'Schedule' : esc(fmtDate(d, { day: 'numeric', month: 'long' }))}</h2>${isT ? '' : `<button data-act="gotoDay" data-d="${t}">Back to today</button>`}</div>
  ${list.length ? `<div class="list">${list.map(sessionCard).join('')}</div>` : S.clients.length ? `
    <div class="card empty">${ic('calendar')}<h3>No sessions${isT ? ' today' : ''}</h3>
      <p>Tap + to add a one-off session, or create a package from a client's page.</p>
      <button class="btn soft" data-act="newSession" data-date="${d}">${ic('plus')} Add session</button></div>` : ''}`;
}

function weekStrip() {
  const d = ui.day, t = today();
  const mon = addDays(d, -((parse(d).getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const counts = {};
  S.sessions.forEach(s => { if (s.status !== 'cancelled' && s.date >= days[0] && s.date <= days[6]) counts[s.date] = (counts[s.date] || 0) + 1; });
  return `
  <div class="week-bar"><b>${esc(monthLabel(d.slice(0, 7)))}</b>
    <div>
      ${d !== t ? `<button class="btn sm soft" data-act="gotoDay" data-d="${t}">Today</button>` : ''}
      <button class="icon-btn sm" data-act="shiftWeek" data-n="-7" aria-label="Previous week">${ic('left')}</button>
      <button class="icon-btn sm" data-act="shiftWeek" data-n="7" aria-label="Next week">${ic('right')}</button>
    </div>
  </div>
  <div class="week" id="week">${days.map(x => `
    <button class="day${x === d ? ' sel' : ''}${x === t ? ' today' : ''}" data-act="gotoDay" data-d="${x}" aria-label="${esc(fmtDate(x, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${counts[x] || 0} sessions">
      <small>${DOW[parse(x).getDay()]}</small><b>${parse(x).getDate()}</b><i class="${counts[x] ? '' : 'none'}"></i>
    </button>`).join('')}
  </div>`;
}

function onboarding() {
  return `
  <div class="card empty" style="margin-bottom:16px">
    <h3>Welcome to TrainerOS</h3>
    <ol class="steps">
      <li><b>1</b>Add a client with their per-session rate</li>
      <li><b>2</b>Create a 10 or 15-session package — dates fill in automatically</li>
      <li><b>3</b>Tick sessions off; payments and dues track themselves</li>
    </ol>
    <button class="btn primary" data-act="newClient">${ic('plus')} Add first client</button>
    <button class="btn" data-act="loadSample">Try with sample data</button>
    ${sync.passcode ? '' : `<p class="small" style="margin:14px 0 0">New phone? <a class="link" href="#/more">Restore with cloud sync</a></p>`}
  </div>`;
}

function syncBanner() {
  if (!sync.passcode || syncState.status !== 'error') return '';
  return `<a class="banner bad" href="#/more">${ic('alert')}<span class="grow"><b>Cloud sync stopped</b><small>${esc(syncState.error)} · your data is safe on this phone</small></span>${ic('right')}</a>`;
}

function backupNudge() {
  if (sync.passcode && sync.lastSync && Date.now() - sync.lastSync < 3 * 864e5) return syncBanner();
  const doneCount = S.sessions.filter(s => s.status === 'done').length;
  const ago = daysAgo(S.settings.lastBackup);
  if (sync.passcode) return syncBanner();
  if (doneCount < 3 || (ago !== null && ago < 7)) return '';
  return `<a class="banner" href="#/more">${ic('alert')}<span class="grow"><b>Protect your data</b><small>Turn on cloud sync or back up — right now it only lives on this phone</small></span>${ic('right')}</a>`;
}

function syncBox() {
  if (!sync.passcode) return `
  <div class="group" id="syncBox"><h3>Cloud sync</h3>
    <p>Keeps a live copy on your Vercel server, so nothing is lost if this phone is reset, lost, or the app is deleted. On a new phone, enter the same passcode and everything comes back.</p>
    <form data-form="sync" class="stack" autocomplete="off">
      <label class="field" style="margin:0"><span>Passcode (APP_PASSCODE in Vercel)</span><input class="input" name="passcode" type="password" autocomplete="current-password" required></label>
      <button class="btn primary block" type="submit" ${syncState.status === 'syncing' ? 'disabled' : ''}>${syncState.status === 'syncing' ? 'Connecting…' : 'Turn on cloud sync'}</button>
    </form>
    ${syncState.error ? `<p class="small" style="color:var(--red);margin-top:10px">${esc(syncState.error)}</p>` : ''}
  </div>`;
  const st = syncState.status;
  const label = { syncing: 'Syncing…', ok: 'Synced', offline: 'Offline — will sync when back online', error: syncState.error || 'Sync error', idle: 'Connecting…' }[st] || 'Synced';
  return `
  <div class="group" id="syncBox"><h3>Cloud sync</h3>
    <div class="sync-status ${st}"><i></i><span><b>${esc(label)}</b><small>${sync.lastSync ? 'Last synced ' + timeAgo(sync.lastSync) : 'Not synced yet'}${sync.pending ? ' · changes waiting to upload' : ''}</small></span></div>
    <div class="stack" style="margin-top:12px">
      <button class="btn block" data-act="syncNow">Sync now</button>
      <button class="btn block ghost" data-act="syncOff">Turn off on this phone</button>
    </div>
  </div>`;
}

function overdueBlock(list) {
  const shown = list.slice(0, 6);
  return `
  <div class="sec"><h2>Not marked yet <span class="muted small">${list.length}</span></h2><button data-act="markAllOverdue">Mark all done</button></div>
  <div class="rows">${shown.map(s => {
    const c = clientOf(s.clientId);
    return `<div class="row">
      <button class="grow" style="text-align:left" data-act="openSession" data-id="${s.id}"><strong>${esc(c?.name || 'Unknown')}</strong><span>${esc(relDay(s.date))} · ${fmtTime(s.time)}${s.workout ? ' · ' + esc(s.workout) : ''}</span></button>
      <div class="row-actions">
        <button class="btn sm ok" data-act="setStatus" data-id="${s.id}" data-s="done" aria-label="Mark done">${ic('check')}</button>
        <button class="btn sm" data-act="setStatus" data-id="${s.id}" data-s="noshow">No-show</button>
      </div></div>`;
  }).join('')}
  ${list.length > shown.length ? `<div class="row muted small" style="min-height:44px">+${list.length - shown.length} more — open each client to review</div>` : ''}
  </div>`;
}

function sessionCard(s) {
  const c = clientOf(s.clientId), no = sessionNo(s), t = hm(s.time);
  const meta = [s.workout, `${s.duration} min`, no ? `${no.n}/${no.of}` : 'One-off', s.status === 'noshow' ? 'No-show' : s.status === 'cancelled' ? 'Cancelled' : ''].filter(Boolean).join(' · ');
  const isDone = s.status === 'done';
  return `
  <article class="session ${s.status}">
    <button class="s-body" data-act="openSession" data-id="${s.id}">
      <span class="t">${t.hm}<small>${t.ap}</small></span>
      <span class="m"><strong>${esc(c?.name || 'Unknown')}</strong><span>${esc(meta)}</span></span>
    </button>
    <button class="check" data-act="toggleDone" data-id="${s.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Undo done' : 'Mark done'}: ${esc(c?.name || '')}">${ic('check')}</button>
  </article>`;
}

/* ---------- Clients ---------- */
function viewClients() {
  const active = S.clients.filter(c => !c.archived);
  const hasArchived = S.clients.some(c => c.archived);
  const filters = [['all', 'All'], ['active', 'Training'], ['due', 'Dues']].concat(hasArchived ? [['archived', 'Archived']] : []);
  if (!hasArchived && ui.cfilter === 'archived') ui.cfilter = 'all';
  return `
  <header class="head">
    <div><p class="eyebrow">${active.length} client${active.length === 1 ? '' : 's'}</p><h1>Clients</h1></div>
    <button class="icon-btn primary" data-act="newClient" aria-label="Add client">${ic('plus')}</button>
  </header>
  ${S.clients.length ? `
  <label class="search">${ic('search')}<span class="vh">Search clients</span><input class="input" type="search" id="q" placeholder="Search name or phone" value="${esc(ui.q)}" autocomplete="off" enterkeyhint="search"></label>
  <div class="seg">${filters.map(([k, l]) => `<button class="${ui.cfilter === k ? 'on' : ''}" data-act="cfilter" data-k="${k}" aria-pressed="${ui.cfilter === k}">${l}</button>`).join('')}</div>` : ''}
  <div id="clientList">${clientList()}</div>`;
}

function clientList() {
  if (!S.clients.length) return `<div class="card empty">${ic('users')}<h3>No clients yet</h3><p>Add your first client to start scheduling sessions.</p><button class="btn primary" data-act="newClient">${ic('plus')} Add client</button></div>`;
  const q = ui.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  let cs = S.clients.filter(c => ui.cfilter === 'archived' ? c.archived : !c.archived);
  if (q) cs = cs.filter(c => c.name.toLowerCase().includes(q) || (qd && String(c.phone || '').replace(/\D/g, '').includes(qd)));
  if (ui.cfilter === 'active') cs = cs.filter(c => nextSession(c.id));
  if (ui.cfilter === 'due') cs = cs.filter(c => balanceOf(c.id) > 0).sort((a, b) => balanceOf(b.id) - balanceOf(a.id));
  else cs.sort((a, b) => a.name.localeCompare(b.name));
  if (!cs.length) return `<div class="card empty"><p>${q ? 'No clients match your search.' : ui.cfilter === 'due' ? 'Nobody owes you anything right now.' : 'Nothing here.'}</p></div>`;
  return `<div class="rows">${cs.map(clientRow).join('')}</div>`;
}

function clientRow(c) {
  const p = activePackage(c.id), st = p && pkgStats(p), nx = nextSession(c.id);
  const line = [st ? `${st.used}/${st.total} done` : 'No package', nx ? `Next ${relDay(nx.date)} ${fmtTime(nx.time)}` : ''].filter(Boolean).join(' · ');
  return `<a class="row" href="#/client/${c.id}">${avatar(c)}<div class="grow"><strong>${esc(c.name)}</strong><span>${esc(line)}</span></div>${balPill(balanceOf(c.id))}${ic('right', 'chev')}</a>`;
}

function viewClient() {
  const c = clientOf(ui.clientId), t = today();
  const ss = sessionsOf(c.id).sort(bySchedule);
  const upcoming = ss.filter(s => s.status === 'scheduled' && s.date >= t);
  const history = ss.filter(s => !(s.status === 'scheduled' && s.date >= t)).reverse();
  const pays = S.payments.filter(p => p.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const done = ss.filter(s => s.status === 'done').length;
  const bal = balanceOf(c.id), pk = packagesOf(c.id);
  const tabs = [['upcoming', 'Upcoming', upcoming.length], ['history', 'History', history.length], ['payments', 'Payments', pays.length]];
  const cap = ui.showAll ? Infinity : 20;
  let body;
  if (ui.ctab === 'payments') {
    body = pays.length ? `<div class="rows">${pays.map(paymentRow).join('')}</div>` : `<div class="card empty"><p>No payments recorded.</p><button class="btn soft" data-act="newPayment" data-cid="${c.id}">${ic('plus')} Record payment</button></div>`;
  } else {
    const rows = ui.ctab === 'history' ? history : upcoming;
    body = rows.length ? `<div class="rows">${rows.slice(0, cap).map(sessionRow).join('')}${rows.length > cap ? `<button class="more-row" data-act="showAll">Show all ${rows.length}</button>` : ''}</div>`
      : `<div class="card empty"><p>${ui.ctab === 'history' ? 'No past sessions yet.' : 'Nothing scheduled.'}</p></div>`;
  }
  return `
  <div class="topbar"><a class="back" href="#/clients">${ic('left')}Clients</a><button class="icon-btn plain" data-act="editClient" data-id="${c.id}" aria-label="Edit client">${ic('edit')}</button></div>
  <section class="profile">${avatar(c, 'lg')}<div><h1>${esc(c.name)}</h1><p>${money(c.rate)} / session${c.archived ? ' · Archived' : ''}</p></div></section>
  ${c.goal ? `<p class="note">${esc(c.goal)}</p>` : ''}
  ${c.phone ? `<div class="contact"><a class="btn" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${ic('phone')}Call</a><a class="btn" href="${waLink(c.phone)}" target="_blank" rel="noopener">${ic('msg')}WhatsApp</a></div>` : ''}
  <div class="tiles two">
    <div class="tile"><small>Sessions done</small><b>${done}</b></div>
    <div class="tile"><small>Upcoming</small><b>${upcoming.length}</b></div>
    <div class="tile ${bal > 0 ? 'bad' : bal < 0 ? 'ok' : ''}"><small>${bal > 0 ? 'Amount due' : bal < 0 ? 'Advance credit' : 'Balance'}</small><b>${money(Math.abs(bal))}</b></div>
    <div class="tile"><small>Total paid</small><b>${money(paidOf(c.id))}</b></div>
  </div>
  ${bal > 0 ? `<button class="banner bad" data-act="remind" data-cid="${c.id}">${ic('msg')}<span class="grow"><b>Send payment reminder</b><small>Opens WhatsApp with a polite message for ${money(bal)}</small></span>${ic('right')}</button>` : ''}
  <div class="actions">
    <button class="action" data-act="newPackage" data-cid="${c.id}">${ic('layers')}<span>New package</span></button>
    <button class="action" data-act="newSession" data-cid="${c.id}">${ic('calendar')}<span>Add session</span></button>
    <button class="action" data-act="newPayment" data-cid="${c.id}">${ic('rupee')}<span>Payment</span></button>
  </div>
  <div class="sec"><h2>Packages</h2></div>
  ${pk.length ? pk.map(pkgCard).join('') : `<div class="card empty"><p>No packages yet. Create a 10 or 15-session package and every date is scheduled for you.</p><button class="btn primary" data-act="newPackage" data-cid="${c.id}">${ic('layers')} Create package</button></div>`}
  <div class="seg mt">${tabs.map(([k, l, n]) => `<button class="${ui.ctab === k ? 'on' : ''}" data-act="ctab" data-k="${k}" aria-pressed="${ui.ctab === k}">${l} <span class="count">${n}</span></button>`).join('')}</div>
  ${body}
  <div class="danger-zone">
    <button class="btn" data-act="archiveClient" data-id="${c.id}">${c.archived ? 'Unarchive' : 'Archive'}</button>
    <button class="btn danger" data-act="deleteClient" data-id="${c.id}">${ic('trash')}Delete</button>
  </div>`;
}

function pkgCard(p) {
  const st = pkgStats(p), pct = st.total ? Math.round(st.used / st.total * 100) : 0;
  return `
  <div class="card pkg">
    <div class="pkg-top">
      <div><strong>${esc(p.title || `${st.total} sessions`)}</strong><span>${st.first ? `${esc(fmtDate(st.first))} → ${esc(fmtDate(st.last))} · ` : ''}${esc(daysText(p.days))} · ${fmtTime(p.time)}</span></div>
      ${st.left ? `<span class="pill info">${st.left} left</span>` : '<span class="pill ok">Completed</span>'}
    </div>
    <div class="bar" role="progressbar" aria-valuenow="${st.used}" aria-valuemin="0" aria-valuemax="${st.total}" aria-label="Sessions used"><i style="width:${pct}%"></i></div>
    <div class="pkg-foot"><span>${st.used} of ${st.total} done · ${money(st.value)}</span>
      <div>${st.left ? `<button class="btn sm" data-act="sharePkg" data-id="${p.id}" aria-label="Share schedule on WhatsApp">${ic('share')}</button>` : ''}<button class="btn sm" data-act="editPackage" data-id="${p.id}">Manage</button></div>
    </div>
  </div>`;
}

function sessionRow(s) {
  const d = parse(s.date), no = sessionNo(s), isT = s.date === today();
  return `<button class="row" data-act="openSession" data-id="${s.id}">
    <span class="date-badge${isT ? ' today' : ''}"><small>${d.toLocaleDateString('en-IN', { month: 'short' })}</small><b>${d.getDate()}</b></span>
    <span class="grow"><strong>${DOW[d.getDay()]} · ${fmtTime(s.time)}</strong><span>${esc([s.workout, no ? `Session ${no.n}/${no.of}` : s.packageId ? '' : 'One-off', s.note].filter(Boolean).join(' · '))}</span></span>
    ${statusPill(s)}</button>`;
}

function paymentRow(p, withClient = false) {
  const c = clientOf(p.clientId);
  return `<button class="row" data-act="editPayment" data-id="${p.id}">
    ${withClient ? avatar(c) : `<span class="date-badge"><small>${parse(p.date).toLocaleDateString('en-IN', { month: 'short' })}</small><b>${parse(p.date).getDate()}</b></span>`}
    <span class="grow"><strong>${withClient ? esc(c?.name || 'Unknown') : esc(p.method)}</strong><span>${esc([withClient ? fmtDay(p.date) : '', withClient ? p.method : '', p.note].filter(Boolean).join(' · ') || 'Payment')}</span></span>
    <span class="amt ok">+${money(p.amount)}</span></button>`;
}

/* ---------- Money ---------- */
function viewMoney() {
  const m = ui.month, thisMonth = today().slice(0, 7);
  const ms = S.sessions.filter(s => s.date.startsWith(m));
  const earned = sum(ms.filter(billable), s => s.rate);
  const pays = S.payments.filter(p => p.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
  const collected = sum(pays, p => p.amount);
  const doneN = ms.filter(s => s.status === 'done').length, noN = ms.filter(s => s.status === 'noshow').length;
  const att = doneN + noN ? Math.round(doneN / (doneN + noN) * 100) + '%' : '—';
  const bals = S.clients.map(c => ({ c, b: balanceOf(c.id) }));
  const dues = bals.filter(x => x.b > 0).sort((a, b) => b.b - a.b);
  const dueTotal = sum(dues, x => x.b), credit = sum(bals.filter(x => x.b < 0), x => -x.b);
  // Six-month window that always contains the selected month.
  const end = m >= monthAdd(thisMonth, -5) ? thisMonth : monthAdd(m, 2);
  const months = Array.from({ length: 6 }, (_, i) => monthAdd(end, i - 5)).map(k => ({
    key: k, label: monthLabel(k, { month: 'short' }), long: monthLabel(k),
    earned: sum(S.sessions.filter(s => s.date.startsWith(k) && billable(s)), s => s.rate),
    collected: sum(S.payments.filter(p => p.date.startsWith(k)), p => p.amount),
  }));
  const short = monthLabel(m, { month: 'short' });
  return `
  <header class="head">
    <div><p class="eyebrow">Earnings & payments</p><h1>Money</h1></div>
    ${S.clients.length ? `<button class="icon-btn primary" data-act="newPayment" aria-label="Record payment">${ic('plus')}</button>` : ''}
  </header>
  <div class="month-bar">
    <button class="icon-btn sm" data-act="shiftMonth" data-n="-1" aria-label="Previous month">${ic('left')}</button>
    <b>${esc(monthLabel(m))}</b>
    <button class="icon-btn sm" data-act="shiftMonth" data-n="1" aria-label="Next month" ${m >= thisMonth ? 'disabled' : ''}>${ic('right')}</button>
  </div>
  <div class="card hero">
    <small>Earned in ${esc(short)} · completed sessions</small>
    <b class="big">${money(earned)}</b>
    <div class="hero-row">
      <div><small>Collected</small><b>${money(collected)}</b></div>
      <div><small>Sessions</small><b>${doneN}</b></div>
      <div><small>Attendance</small><b>${att}</b></div>
    </div>
  </div>
  <div class="tiles two">
    <div class="tile ${dueTotal ? 'bad' : ''}"><small>Outstanding</small><b>${money(dueTotal)}</b><span>${dues.length} client${dues.length === 1 ? '' : 's'} · all time</span></div>
    <div class="tile ${credit ? 'ok' : ''}"><small>Advance held</small><b>${money(credit)}</b><span>Prepaid, not yet trained</span></div>
  </div>
  <div class="card chart-card">
    <div class="chart-head"><h2>Last 6 months</h2><div class="legend"><span><i class="sw s1"></i>Earned</span><span><i class="sw s2"></i>Collected</span></div></div>
    ${chartSVG(months, m)}
    <details class="tbl"><summary>Show as table</summary>
      <table><thead><tr><th>Month</th><th>Earned</th><th>Collected</th></tr></thead>
      <tbody>${months.map(x => `<tr><td>${esc(x.long)}</td><td>${money(x.earned)}</td><td>${money(x.collected)}</td></tr>`).join('')}</tbody></table>
    </details>
  </div>
  <div class="sec"><h2>Pending payments</h2></div>
  ${dues.length ? `<div class="rows">${dues.map(({ c, b }) => {
    const last = S.payments.filter(p => p.clientId === c.id).sort((x, y) => y.date.localeCompare(x.date))[0];
    return `<div class="row">${avatar(c)}
      <a class="grow" href="#/client/${c.id}"><strong>${esc(c.name)}</strong><span>${last ? `Last paid ${esc(fmtDate(last.date))}` : 'No payments yet'}</span></a>
      <span class="amt bad">${money(b)}</span>
      <div class="row-actions">
        <button class="btn sm" data-act="remind" data-cid="${c.id}" aria-label="WhatsApp reminder to ${esc(c.name)}">${ic('msg')}</button>
        <button class="btn sm ok" data-act="newPayment" data-cid="${c.id}" aria-label="Record payment from ${esc(c.name)}">${ic('plus')}</button>
      </div></div>`;
  }).join('')}</div>` : `<div class="card empty"><p>All settled — nobody owes you money.</p></div>`}
  <div class="sec"><h2>Payments in ${esc(short)}</h2>${pays.length ? `<span class="muted small">${money(collected)}</span>` : ''}</div>
  ${pays.length ? `<div class="rows">${pays.map(p => paymentRow(p, true)).join('')}</div>` : `<div class="card empty"><p>No payments recorded in ${esc(monthLabel(m))}.</p></div>`}`;
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
function barPath(x, y, w, h) {
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function chartSVG(months, sel) {
  const W = 340, H = 176, L = 40, R = 4, T = 8, B = 24, ih = H - T - B, iw = W - L - R;
  const max = niceMax(Math.max(0, ...months.flatMap(m => [m.earned, m.collected])));
  const y = v => T + ih - (v / max) * ih;
  const gw = iw / months.length, bw = Math.min(16, (gw - 14) / 2);
  let g = '';
  for (const f of [0.5, 1]) { const yy = y(max * f); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="ax" x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${compact(max * f)}</text>`; }
  g += `<text class="ax" x="${L - 6}" y="${T + ih + 3.5}" text-anchor="end">₹0</text>`;
  months.forEach((m, i) => {
    const gx = L + gw * i, cx = gx + gw / 2, on = m.key === sel;
    g += `<g class="grp${on ? ' on' : ''}">
      ${on ? `<rect class="selbg" x="${gx + 2}" y="${T - 4}" width="${gw - 4}" height="${ih + B + 2}" rx="8"/>` : ''}
      <path class="b1" d="${barPath(cx - bw - 1, y(m.earned), bw, T + ih - y(m.earned))}"/>
      <path class="b2" d="${barPath(cx + 1, y(m.collected), bw, T + ih - y(m.collected))}"/>
      <text class="mx" x="${cx}" y="${H - 7}" text-anchor="middle">${m.label}</text>
      <rect class="hit" x="${gx}" y="0" width="${gw}" height="${H}" data-act="pickMonth" data-m="${m.key}"><title>${esc(m.long)}: earned ${money(m.earned)}, collected ${money(m.collected)}</title></rect>
    </g>`;
  });
  g += `<line class="base" x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Earned and collected per month. Tap a month to see its details.">${g}</svg>`;
}

/* ---------- More / settings ---------- */
function viewMore() {
  const s = S.settings, ago = daysAgo(s.lastBackup);
  return `
  <header class="head"><div><p class="eyebrow">Settings & data</p><h1>More</h1></div></header>
  ${isStandalone() ? '' : `<div class="group"><h3>Install on iPhone</h3><p>Open this page in <b>Safari</b>, tap <b>Share</b> → <b>Add to Home Screen</b>. It then opens full-screen like an app and works offline.</p><p class="small muted" style="margin:0">The Home Screen app keeps its own data, separate from Safari — so install first and use the app from the icon. Cloud sync below moves everything across automatically.</p></div>`}
  ${syncBox()}
  <form data-form="settings" autocomplete="off">
    <div class="group"><h3>You</h3>
      <label class="field" style="margin:0"><span>Your name</span><input class="input" name="trainer" value="${esc(s.trainer)}" placeholder="Shown on WhatsApp messages"></label>
    </div>
    <div class="group"><h3>Defaults</h3>
      <div class="grid2">
        <label class="field"><span>Rate / session (₹)</span><input class="input" name="rate" inputmode="numeric" pattern="[0-9]*" value="${s.rate}"></label>
        <label class="field"><span>Duration (min)</span><input class="input" name="duration" inputmode="numeric" pattern="[0-9]*" value="${s.duration}"></label>
      </div>
      <label class="field"><span>Usual session time</span><input class="input" type="time" name="time" value="${s.time}"></label>
      <div class="field" style="margin:0"><span>Training days</span>${daysPicker(s.days)}</div>
    </div>
    <div class="group"><h3>Billing</h3>
      <label class="switch"><span><b>Charge for no-shows</b><small>A no-show counts as earned and uses up a package session</small></span><input type="checkbox" name="noShowBillable" ${s.noShowBillable ? 'checked' : ''}></label>
    </div>
    <div class="group"><h3>Appearance</h3>
      <div class="seg" style="margin:0">${['auto', 'light', 'dark'].map(t => `<label><input type="radio" name="theme" value="${t}" ${s.theme === t ? 'checked' : ''}>${t[0].toUpperCase() + t.slice(1)}</label>`).join('')}</div>
    </div>
  </form>
  <div class="group"><h3>Backup file</h3>
    <p>${sync.passcode ? 'Optional extra safety: a file copy you can keep in iCloud Drive.' : 'Without cloud sync, data lives only on this phone. Back up weekly — save the file to iCloud Drive or send it to yourself on WhatsApp.'}</p>
    <p class="small muted">Last backup: <b>${ago === null ? 'never' : ago === 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`}</b></p>
    <div class="stack">
      <button class="btn primary block" data-act="exportData">${ic('download')}Back up now</button>
      <label class="btn block">${ic('upload')}Restore from backup<input class="vh" type="file" id="importFile" accept="application/json,.json"></label>
      ${S.clients.length ? '' : `<button class="btn block soft" data-act="loadSample">Load sample data</button>`}
      <button class="btn block danger" data-act="eraseAll">${ic('trash')}Erase all data</button>
    </div>
  </div>
  <p class="foot">TrainerOS · ${S.clients.length} clients · ${S.sessions.length} sessions · ${S.payments.length} payments</p>`;
}

/* ======================================================================
   SHEETS (bottom-sheet forms)
   ====================================================================== */
const sheetHead = (title, sub = '') => `<div class="sheet-head"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button type="button" class="icon-btn sm" data-act="closeSheet" aria-label="Close">${ic('x')}</button></div>`;
const cancelBtn = '<button type="button" class="btn" data-act="closeSheet">Cancel</button>';

function openSheet(html, focusSel) {
  const root = $('#sheet');
  root.innerHTML = `<div class="sheet-backdrop" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  root.hidden = false;
  $('#toast').classList.remove('show'); // never let a toast cover the sheet's buttons
  document.body.classList.add('locked');
  root.offsetHeight; // force layout so the slide-in transition runs
  root.classList.add('open');
  const f = focusSel && root.querySelector(focusSel);
  if (f) f.focus({ preventScroll: true });
  const form = root.querySelector('form');
  if (form && INPUT[form.dataset.form]) INPUT[form.dataset.form](form, null);
}
function closeSheet() {
  const root = $('#sheet');
  if (root.hidden) return;
  root.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!root.classList.contains('open')) { root.hidden = true; root.innerHTML = ''; } }, 300);
}

function sheetClient(c) {
  openSheet(`<form data-form="client" data-id="${c?.id || ''}">
    ${sheetHead(c ? 'Edit client' : 'New client')}
    <label class="field"><span>Name</span><input class="input" name="name" required value="${esc(c?.name)}" placeholder="e.g. Rahul Sharma" autocomplete="off" autocapitalize="words" enterkeyhint="next"></label>
    <label class="field"><span>Phone (for Call & WhatsApp)</span><input class="input" name="phone" type="tel" inputmode="tel" value="${esc(c?.phone)}" placeholder="98765 43210" autocomplete="off"></label>
    <label class="field"><span>Rate per session (₹)</span><input class="input" name="rate" inputmode="numeric" pattern="[0-9]*" value="${c ? c.rate : S.settings.rate}">${c ? '<small>Changing this also updates their upcoming sessions. Completed ones keep their old rate.</small>' : ''}</label>
    <label class="field"><span>Goals & notes</span><textarea class="input" name="goal" rows="2" placeholder="e.g. Fat loss · knee injury, avoid jumps">${esc(c?.goal)}</textarea></label>
    <div class="sheet-foot">${cancelBtn}<button class="btn primary" type="submit">${c ? 'Save' : 'Add client'}</button></div>
  </form>`, c ? null : '[name=name]');
}

function renewStart(cid) {
  const last = sessionsOf(cid).filter(consumes).sort(bySchedule).pop();
  const t = today();
  return last && last.date >= t ? addDays(last.date, 1) : t;
}
function sheetPackage(cid) {
  const c = clientOf(cid) || S.clients.find(x => !x.archived);
  if (!c) return sheetClient();
  const prev = activePackage(c.id), s = S.settings;
  const days = prev?.days || s.days, time = prev?.time || s.time, dur = prev?.duration || s.duration;
  openSheet(`<form data-form="package">
    ${sheetHead('New package', 'All dates are scheduled automatically')}
    <label class="field"><span>Client</span><select class="input" name="clientId">${clientOptions(c.id)}</select></label>
    <div class="field"><span>Number of sessions</span>
      <div class="count-row">${[8, 10, 12, 15].map(n => `<label class="chip"><input type="radio" name="pick" value="${n}" ${n === 15 ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        <input class="input" name="custom" inputmode="numeric" pattern="[0-9]*" placeholder="Other" aria-label="Other number of sessions"></div>
    </div>
    <label class="field"><span>Start date</span><input class="input" type="date" name="start" value="${renewStart(c.id)}" required></label>
    <div class="field"><span>Training days</span>${daysPicker(days)}</div>
    <div class="grid2">
      <label class="field"><span>Time</span><input class="input" type="time" name="time" value="${time}" required></label>
      <label class="field"><span>Duration (min)</span><input class="input" name="duration" inputmode="numeric" pattern="[0-9]*" value="${dur}"></label>
    </div>
    <label class="field"><span>Workout</span><input class="input" name="workout" list="workouts" value="${esc(prev?.workout || '')}" placeholder="e.g. Push, Pull, Legs"><small>Separate with commas to rotate across sessions. You can edit each day later.</small></label>
    <label class="field"><span>Rate per session (₹)</span><input class="input" name="rate" inputmode="numeric" pattern="[0-9]*" value="${c.rate}"></label>
    <div class="preview" id="pkgPreview"></div>
    <label class="switch"><span><b>Payment received now</b><small>Records it as an advance for this client</small></span><input type="checkbox" name="paidNow"></label>
    <div class="reveal" id="paidFields" hidden>
      <div class="grid2" style="margin-top:10px">
        <label class="field"><span>Amount (₹)</span><input class="input" name="amount" inputmode="numeric" pattern="[0-9]*"></label>
        <label class="field"><span>Method</span><select class="input" name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="sheet-foot">${cancelBtn}<button class="btn primary" type="submit" id="pkgSubmit">Create package</button></div>
  </form>`);
}

function sheetPackageEdit(p) {
  const st = pkgStats(p), c = clientOf(p.clientId);
  const up = st.all.filter(s => s.status === 'scheduled');
  openSheet(`
  ${sheetHead(p.title || 'Package', `${c?.name || ''} · ${st.used} of ${st.total} done · ${st.left} left`)}
  <form data-form="pkgEdit" data-id="${p.id}">
    <label class="field"><span>Name</span><input class="input" name="title" value="${esc(p.title)}"></label>
    ${up.length ? `
    <label class="field"><span>Upcoming sessions start from</span><input class="input" type="date" name="from" value="${up[0].date}"><small>Change this to pause the package (e.g. client travelling) — all ${up.length} upcoming sessions shift.</small></label>
    <div class="field"><span>Training days</span>${daysPicker(p.days)}</div>
    <div class="grid2">
      <label class="field"><span>Time</span><input class="input" type="time" name="time" value="${p.time}"></label>
      <label class="field"><span>Duration (min)</span><input class="input" name="duration" inputmode="numeric" pattern="[0-9]*" value="${p.duration}"></label>
    </div>
    <label class="field"><span>Workout</span><input class="input" name="workout" list="workouts" value="${esc(p.workout)}" placeholder="e.g. Push, Pull, Legs"></label>
    <label class="field"><span>Rate per session (₹)</span><input class="input" name="rate" inputmode="numeric" pattern="[0-9]*" value="${p.rate}"></label>
    <p class="small muted">Only fields you change are applied, and only to the ${up.length} upcoming sessions. Completed sessions never change.</p>` : '<p class="small muted">This package is finished. Add more sessions below to extend it.</p>'}
    <div class="sheet-foot"><button class="btn primary" type="submit">Save changes</button></div>
  </form>
  <div class="divider"></div>
  <form data-form="pkgAdd" data-id="${p.id}">
    <div class="field"><span>Extend package</span>
      <div style="display:flex;gap:8px"><input class="input" name="n" inputmode="numeric" pattern="[0-9]*" value="5" aria-label="Number of sessions to add" style="flex:1"><button class="btn soft" type="submit">${ic('plus')}Add sessions</button></div>
      <small>New sessions continue after the last one, on the same days.</small>
    </div>
  </form>
  <button class="btn danger block" data-act="deletePackage" data-id="${p.id}">${ic('trash')}Delete package</button>`);
}

function sheetSession(s) {
  const c = clientOf(s.clientId), no = sessionNo(s), p = s.packageId && pkgOf(s.packageId);
  openSheet(`
  ${sheetHead(c?.name || 'Session', `${fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtTime(s.time)}`)}
  ${p ? `<p class="small muted" style="margin:-8px 0 14px">${no ? `Session ${no.n} of ${no.of} · ` : ''}${esc(p.title || 'Package')}</p>` : ''}
  <div class="status-grid">${Object.entries(STATUS).map(([k, v]) => `<button type="button" class="st ${k}${s.status === k ? ' on' : ''}" data-act="setStatus" data-id="${s.id}" data-s="${k}" aria-pressed="${s.status === k}">${ic(v.icon)}<span>${v.label}</span></button>`).join('')}</div>
  ${canMakeup(s) ? `<button class="btn soft block" style="margin-bottom:14px" data-act="makeup" data-id="${s.id}">${ic('repeat')}Add make-up session at end</button>` : ''}
  <form data-form="session" data-id="${s.id}">
    <div class="grid2">
      <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${s.date}" required></label>
      <label class="field"><span>Time</span><input class="input" type="time" name="time" value="${s.time}" required></label>
    </div>
    <label class="field"><span>Workout</span><input class="input" name="workout" list="workouts" value="${esc(s.workout)}" placeholder="e.g. Upper body"></label>
    <div class="grid2">
      <label class="field"><span>Duration (min)</span><input class="input" name="duration" inputmode="numeric" pattern="[0-9]*" value="${s.duration}"></label>
      <label class="field"><span>Rate (₹)</span><input class="input" name="rate" inputmode="numeric" pattern="[0-9]*" value="${s.rate}"></label>
    </div>
    <label class="field"><span>Session notes</span><textarea class="input" name="note" rows="2" placeholder="Weights used, PRs, how they felt…">${esc(s.note)}</textarea></label>
    <div class="sheet-foot">
      <button type="button" class="btn danger icon-only" data-act="deleteSession" data-id="${s.id}" aria-label="Delete session">${ic('trash')}</button>
      <button type="button" class="btn" data-act="openClient" data-id="${s.clientId}">${ic('user')}Client</button>
      <button class="btn primary" type="submit">Save</button>
    </div>
  </form>`);
}

function pkgOptions(cid, sel) {
  const ps = packagesOf(cid).filter(p => pkgStats(p).left > 0 || p.id === sel);
  return `<option value="">One-off (not in a package)</option>` + ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.title || 'Package')} · ${pkgStats(p).left} left</option>`).join('');
}
function sheetNewSession({ clientId, date } = {}) {
  const c = clientOf(clientId) || clientOf(ui.clientId) || S.clients.filter(x => !x.archived).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!c) return sheetClient();
  const p = activePackage(c.id);
  openSheet(`<form data-form="newSession">
    ${sheetHead('Add session', 'A one-off or extra session')}
    <label class="field"><span>Client</span><select class="input" name="clientId">${clientOptions(c.id)}</select></label>
    <div class="grid2">
      <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${date || (ui.tab === 'today' ? ui.day : today())}" required></label>
      <label class="field"><span>Time</span><input class="input" type="time" name="time" value="${p?.time || S.settings.time}" required></label>
    </div>
    <label class="field"><span>Workout</span><input class="input" name="workout" list="workouts" placeholder="e.g. Full body"></label>
    <div class="grid2">
      <label class="field"><span>Duration (min)</span><input class="input" name="duration" inputmode="numeric" pattern="[0-9]*" value="${p?.duration || S.settings.duration}"></label>
      <label class="field"><span>Rate (₹)</span><input class="input" name="rate" inputmode="numeric" pattern="[0-9]*" value="${c.rate}"></label>
    </div>
    <label class="field"><span>Package</span><select class="input" name="packageId">${pkgOptions(c.id, '')}</select><small>Adding it to a package makes the package one session longer.</small></label>
    <div class="sheet-foot">${cancelBtn}<button class="btn primary" type="submit">Add session</button></div>
  </form>`);
}

function sheetPayment(p) {
  const editing = !!p?.id;
  const cid = p?.clientId || ui.clientId || S.clients.filter(x => !x.archived).sort((a, b) => a.name.localeCompare(b.name))[0]?.id;
  if (!cid) return sheetClient();
  openSheet(`<form data-form="payment" data-id="${editing ? p.id : ''}">
    ${sheetHead(editing ? 'Edit payment' : 'Record payment')}
    <label class="field"><span>Client</span><select class="input" name="clientId">${clientOptions(cid)}</select></label>
    <label class="field"><span>Amount (₹)</span><input class="input big" name="amount" inputmode="numeric" pattern="[0-9]*" value="${editing ? p.amount : ''}" placeholder="0" required></label>
    <div class="chips" id="quickAmounts" style="margin:-4px 0 14px"></div>
    <div class="grid2">
      <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${editing ? p.date : today()}" required></label>
      <label class="field"><span>Note</span><input class="input" name="note" value="${esc(p?.note)}" placeholder="Optional"></label>
    </div>
    <div class="field"><span>Method</span><div class="chips">${METHODS.map(m => `<label class="chip"><input type="radio" name="method" value="${m}" ${(p?.method || 'UPI') === m ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></div>
    <div class="preview" id="payPreview"></div>
    <div class="sheet-foot">${editing ? `<button type="button" class="btn danger icon-only" data-act="deletePayment" data-id="${p.id}" aria-label="Delete payment">${ic('trash')}</button>` : cancelBtn}<button class="btn primary" type="submit">${editing ? 'Save' : 'Record payment'}</button></div>
  </form>`, editing ? null : '[name=amount]');
}

const pkgCount = (custom, pick) => clamp(Math.round(num(custom) || num(pick) || 15), 1, 100);

/* ---------- Live form previews ---------- */
const INPUT = {
  package(f, target) {
    const el = f.elements;
    if (target?.name === 'pick') el.custom.value = '';
    if (target?.name === 'custom') f.querySelectorAll('[name=pick]').forEach(r => { r.checked = !target.value && r.value === '15'; });
    if (target?.name === 'clientId') { const c = clientOf(target.value); if (c) { el.rate.value = c.rate; el.start.value = renewStart(c.id); } }
    $('#paidFields').hidden = !el.paidNow.checked;
    const n = pkgCount(el.custom.value, f.querySelector('[name=pick]:checked')?.value);
    const days = [...f.querySelectorAll('[name=days]:checked')].map(x => +x.value);
    const value = n * num(el.rate.value);
    el.amount.placeholder = String(value);
    const box = $('#pkgPreview'), btn = $('#pkgSubmit');
    if (!days.length || !el.start.value) { box.className = 'preview bad'; box.innerHTML = 'Pick a start date and at least one training day.'; btn.disabled = true; return; }
    const dates = nextDates(el.start.value, n, days);
    box.className = 'preview';
    box.innerHTML = `<b>${n} sessions</b> · ${esc(fmtDay(dates[0]))} → ${esc(fmtDay(dates[dates.length - 1]))}
      <small>${esc(daysText(days))} at ${fmtTime(el.time.value)} · package value ${money(value)}</small>`;
    btn.disabled = false;
    btn.textContent = `Create ${n} sessions`;
  },
  newSession(f, target) {
    if (target?.name !== 'clientId') return;
    const c = clientOf(target.value); if (!c) return;
    const p = activePackage(c.id);
    f.elements.rate.value = c.rate;
    if (p) { f.elements.time.value = p.time; f.elements.duration.value = p.duration; }
    f.elements.packageId.innerHTML = pkgOptions(c.id, '');
  },
  payment(f) {
    const cid = f.elements.clientId.value, amt = num(f.elements.amount.value);
    const editingId = f.dataset.id, c = clientOf(cid);
    if (!c) return;
    const existing = editingId ? payOf(editingId) : null;
    const base = balanceOf(cid) + (existing && existing.clientId === cid ? existing.amount : 0);
    const after = base - amt;
    const box = $('#payPreview');
    box.className = 'preview' + (after > 0 ? ' bad' : after < 0 ? ' ok' : '');
    box.innerHTML = `<b>${after > 0 ? `${money(after)} still due` : after < 0 ? `${money(-after)} advance credit` : 'Fully settled'}</b><small>${esc(first(c.name))} currently ${base > 0 ? `owes ${money(base)}` : base < 0 ? `has ${money(-base)} credit` : 'is settled'}</small>`;
    const p = activePackage(cid), st = p && pkgStats(p);
    const quick = [];
    if (base > 0) quick.push(['Full due', base]);
    if (st && st.left) quick.push([`Rest of package`, Math.max(0, st.value - paidOf(cid) + (existing ? existing.amount : 0))]);
    quick.push(['1 session', c.rate], ['10 sessions', c.rate * 10], ['15 sessions', c.rate * 15]);
    const seen = new Set();
    $('#quickAmounts').innerHTML = quick.filter(([, v]) => v > 0 && !seen.has(v) && seen.add(v)).slice(0, 4)
      .map(([l, v]) => `<button type="button" class="chip${v === amt ? ' on' : ''}" data-act="setAmount" data-v="${v}">${l} · ${compact(v)}</button>`).join('');
  },
};

/* ---------- Form submissions ---------- */
const FORMS = {
  client(fd, f) {
    const name = String(fd.get('name') || '').trim();
    if (!name) return toast('Enter a name');
    const phone = String(fd.get('phone') || '').trim(), rate = num(fd.get('rate'), S.settings.rate), goal = String(fd.get('goal') || '').trim();
    const id = f.dataset.id;
    if (id) {
      const c = clientOf(id), oldRate = c.rate;
      const undo = mutate(() => {
        Object.assign(c, { name, phone, rate, goal });
        if (rate !== oldRate) S.sessions.forEach(s => { if (s.clientId === id && s.status === 'scheduled') s.rate = rate; });
      });
      closeSheet(); toast('Client saved', undoAction(undo));
    } else {
      const c = { id: uid(), name, phone, rate, goal, archived: false, createdAt: new Date().toISOString() };
      mutate(() => S.clients.push(c));
      closeSheet();
      location.hash = '#/client/' + c.id;
      setTimeout(() => sheetPackage(c.id), 320); // natural next step
    }
  },
  package(fd) {
    const cid = fd.get('clientId'), c = clientOf(cid);
    if (!c) return toast('Pick a client');
    const n = pkgCount(fd.get('custom'), fd.get('pick'));
    const days = fd.getAll('days').map(Number).sort((a, b) => a - b);
    const start = fd.get('start'), time = fd.get('time') || S.settings.time;
    const duration = num(fd.get('duration'), 60) || 60, workout = String(fd.get('workout') || '').trim(), rate = num(fd.get('rate'), c.rate);
    if (!days.length || !start) return toast('Pick a start date and training days');
    const dates = nextDates(start, n, days), w = rotation(workout);
    const p = { id: uid(), clientId: cid, title: `${n}-session package`, start, count: n, days, time, duration, workout, rate, createdAt: new Date().toISOString() };
    const undo = mutate(() => {
      S.packages.push(p);
      dates.forEach((d, i) => S.sessions.push(makeSession({ clientId: cid, packageId: p.id, date: d, time, duration, workout: w(i), rate })));
      if (fd.get('paidNow')) {
        const amount = num(fd.get('amount')) || n * rate;
        S.payments.push({ id: uid(), clientId: cid, amount, date: today(), method: fd.get('method') || 'UPI', note: p.title });
      }
    });
    closeSheet();
    if (ui.clientId !== cid) location.hash = '#/client/' + cid;
    toast(`${n} sessions scheduled until ${fmtDay(dates[dates.length - 1])}`, undoAction(undo));
  },
  pkgEdit(fd, f) {
    const p = pkgOf(f.dataset.id); if (!p) return;
    const title = String(fd.get('title') || '').trim() || p.title;
    const up = pkgSessions(p.id).filter(s => s.status === 'scheduled');
    if (!up.length) { mutate(() => { p.title = title; }); closeSheet(); return toast('Package saved'); }
    const days = fd.getAll('days').map(Number).sort((a, b) => a - b);
    if (!days.length) return toast('Pick at least one training day');
    const from = fd.get('from') || up[0].date, time = fd.get('time') || p.time;
    const duration = num(fd.get('duration'), p.duration) || p.duration, workout = String(fd.get('workout') || '').trim(), rate = num(fd.get('rate'), p.rate);
    const undo = mutate(() => {
      if (days.join() !== [...p.days].sort((a, b) => a - b).join() || from !== up[0].date) {
        const ds = nextDates(from, up.length, days); up.forEach((s, i) => { s.date = ds[i]; });
      }
      if (time !== p.time) up.forEach(s => { s.time = time; });
      if (duration !== p.duration) up.forEach(s => { s.duration = duration; });
      if (workout !== p.workout) { const w = rotation(workout); up.forEach((s, i) => { s.workout = w(i); }); }
      if (rate !== p.rate) up.forEach(s => { s.rate = rate; });
      Object.assign(p, { title, days, time, duration, workout, rate });
    });
    closeSheet(); toast('Package updated', undoAction(undo));
  },
  pkgAdd(fd, f) {
    const p = pkgOf(f.dataset.id); if (!p) return;
    const n = clamp(Math.round(num(fd.get('n'))), 1, 60);
    const all = pkgSessions(p.id), last = all.length ? all[all.length - 1].date : addDays(today(), -1);
    const from = addDays(last >= today() ? last : addDays(today(), -1), 1);
    const dates = nextDates(from, n, p.days), w = rotation(p.workout), offset = all.length;
    const undo = mutate(() => dates.forEach((d, i) => S.sessions.push(makeSession({ clientId: p.clientId, packageId: p.id, date: d, time: p.time, duration: p.duration, workout: w(offset + i), rate: p.rate }))));
    closeSheet(); toast(`${n} sessions added`, undoAction(undo));
  },
  session(fd, f) {
    const s = sessOf(f.dataset.id); if (!s) return;
    const undo = mutate(() => Object.assign(s, {
      date: fd.get('date') || s.date, time: fd.get('time') || s.time, workout: String(fd.get('workout') || '').trim(),
      duration: num(fd.get('duration'), s.duration) || s.duration, rate: num(fd.get('rate'), s.rate), note: String(fd.get('note') || '').trim(),
    }));
    closeSheet(); toast('Session saved', undoAction(undo));
  },
  newSession(fd) {
    const cid = fd.get('clientId'); if (!clientOf(cid)) return toast('Pick a client');
    const s = makeSession({ clientId: cid, packageId: fd.get('packageId') || null, date: fd.get('date'), time: fd.get('time'), duration: num(fd.get('duration'), 60), workout: String(fd.get('workout') || '').trim(), rate: num(fd.get('rate')) });
    const undo = mutate(() => S.sessions.push(s));
    closeSheet(); toast(`Session added · ${relDay(s.date)} ${fmtTime(s.time)}`, undoAction(undo));
  },
  payment(fd, f) {
    const cid = fd.get('clientId'), amount = num(fd.get('amount'));
    if (!clientOf(cid)) return toast('Pick a client');
    if (!(amount > 0)) return toast('Enter an amount');
    const data = { clientId: cid, amount, date: fd.get('date') || today(), method: fd.get('method') || 'UPI', note: String(fd.get('note') || '').trim() };
    const id = f.dataset.id;
    const undo = mutate(() => { if (id) Object.assign(payOf(id), data); else S.payments.push({ id: uid(), ...data }); });
    closeSheet(); toast(`${money(amount)} from ${first(clientOf(cid).name)} ${id ? 'updated' : 'recorded'}`, undoAction(undo));
  },
  settings(fd, f) { saveSettings(f); },
  sync(fd) { connectSync(String(fd.get('passcode') || '').trim()); },
};

function saveSettings(f) {
  const fd = new FormData(f), s = S.settings;
  const days = fd.getAll('days').map(Number).sort((a, b) => a - b);
  if (!days.length) { toast('Keep at least one training day'); f.querySelector('[name=days]').checked = true; return; }
  Object.assign(s, {
    trainer: String(fd.get('trainer') || '').trim(), rate: num(fd.get('rate'), s.rate), duration: num(fd.get('duration'), s.duration) || 60,
    time: fd.get('time') || s.time, days, noShowBillable: !!fd.get('noShowBillable'), theme: fd.get('theme') || 'auto',
  });
  save(); applyTheme();
}

/* ======================================================================
   ACTIONS
   ====================================================================== */
function setStatus(s, status) {
  const c = clientOf(s.clientId);
  const undo = mutate(() => { s.status = status; if (status === 'done') s.doneAt = new Date().toISOString(); else delete s.doneAt; });
  if (canMakeup(s)) return toast(`${STATUS[status].label} · ${first(c?.name)}`, { label: 'Add make-up', fn: () => ACTIONS.makeup({ id: s.id }) });
  const msg = status === 'done' ? `${first(c?.name)} · done${billable(s) ? ' · ' + money(s.rate) : ''}` : `${first(c?.name)} · ${STATUS[status].label.toLowerCase()}`;
  toast(msg, undoAction(undo));
}

async function exportData() {
  const name = `traineros-backup-${today()}.json`;
  const data = JSON.stringify({ app: 'TrainerOS', exportedAt: new Date().toISOString(), ...S });
  const file = new File([data], name, { type: 'application/json' });
  const markDone = () => { S.settings.lastBackup = new Date().toISOString(); save(); render(); toast('Backup saved'); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'TrainerOS backup' }); return markDone(); }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  markDone();
}

async function importFile(input) {
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || !Array.isArray(raw.clients)) throw new Error('Not a TrainerOS backup');
    const next = raw.plans && !raw.packages ? migrateV3(raw) : normalize(raw);
    if (!confirm(`Restore this backup?\n\n${next.clients.length} clients · ${next.sessions.length} sessions · ${next.payments.length} payments\n\nThis replaces what is on this phone now.`)) return;
    const undo = mutate(() => { S = next; });
    toast('Backup restored', undoAction(undo));
  } catch (e) { alert('That file could not be restored: ' + e.message); }
}

function sampleData() {
  const st = blank(), t = today();
  st.settings = { ...S.settings };
  const add = (name, phone, rate, startOff, count, days, time, workout, paid, goal) => {
    const c = { id: uid(), name, phone, rate, goal, archived: false, createdAt: new Date().toISOString() };
    const start = addDays(t, startOff), p = { id: uid(), clientId: c.id, title: `${count}-session package`, start, count, days, time, duration: 60, workout, rate };
    const w = rotation(workout);
    st.clients.push(c); st.packages.push(p);
    nextDates(start, count, days).forEach((d, i) => {
      const s = makeSession({ clientId: c.id, packageId: p.id, date: d, time, duration: 60, workout: w(i), rate });
      if (d < addDays(t, -1)) s.status = i === 3 ? 'noshow' : 'done';
      st.sessions.push(s);
    });
    if (paid) st.payments.push({ id: uid(), clientId: c.id, amount: paid, date: start, method: 'UPI', note: p.title });
    return c;
  };
  add('Aarav Sharma', '98765 43210', 1000, -16, 15, [1, 2, 3, 4, 5, 6], '18:00', 'Upper body, Lower body, Full body', 8000, 'Fat loss · target 8 kg by March');
  add('Nisha Rao', '99887 66554', 1200, -12, 12, [1, 3, 5], '07:00', 'Strength', 0, 'Strength base, first time lifting');
  add('Vikram Joshi', '91234 56780', 1000, -40, 10, [2, 4, 6], '06:30', 'Push, Pull, Legs', 12000, '');
  add('Meera Iyer', '90000 11122', 1500, 1, 15, [1, 2, 3, 4, 5, 6], '08:00', 'Mobility, Core, Full body', 22500, 'Post-pregnancy · go easy on core first 2 weeks');
  // A couple of earlier payments so the chart has history.
  st.payments.push({ id: uid(), clientId: st.clients[2].id, amount: 10000, date: addDays(t, -70), method: 'Cash', note: '' });
  st.payments.push({ id: uid(), clientId: st.clients[0].id, amount: 15000, date: addDays(t, -45), method: 'UPI', note: '' });
  return st;
}

function openWhatsApp(url) { const w = window.open(url, '_blank'); if (!w) location.href = url; }

const ACTIONS = {
  closeSheet,
  gotoDay: d => { ui.day = d.d; render(); },
  shiftWeek: d => { ui.day = addDays(ui.day, +d.n); render(); },
  toggleDone: d => { const s = sessOf(d.id); if (s) setStatus(s, s.status === 'done' ? 'scheduled' : 'done'); },
  setStatus: d => { const s = sessOf(d.id); if (!s) return; closeSheet(); if (s.status !== d.s) setStatus(s, d.s); },
  openSession: d => { const s = sessOf(d.id); if (s) sheetSession(s); },
  openClient: d => { closeSheet(); location.hash = '#/client/' + d.id; },
  newSession: d => sheetNewSession({ clientId: d.cid, date: d.date }),
  newClient: () => sheetClient(),
  editClient: d => sheetClient(clientOf(d.id)),
  newPackage: d => sheetPackage(d.cid || ui.clientId),
  editPackage: d => sheetPackageEdit(pkgOf(d.id)),
  newPayment: d => sheetPayment({ clientId: d.cid }),
  editPayment: d => sheetPayment(payOf(d.id)),
  setAmount: (d, el) => { const f = el.closest('form'); f.elements.amount.value = d.v; INPUT.payment(f); },
  cfilter: d => { ui.cfilter = d.k; render(); },
  ctab: d => { ui.ctab = d.k; ui.showAll = false; render(); },
  showAll: () => { ui.showAll = true; render(); },
  shiftMonth: d => { const m = monthAdd(ui.month, +d.n); if (m <= today().slice(0, 7)) { ui.month = m; render(); } },
  pickMonth: d => { ui.month = d.m; render(); },
  exportData, loadSample: () => { const undo = mutate(() => { S = sampleData(); }); toast('Sample data loaded', undoAction(undo)); },
  makeup: d => {
    const s = sessOf(d.id), p = s && pkgOf(s.packageId); if (!p) return;
    const all = pkgSessions(p.id), date = nextDates(addDays(all[all.length - 1].date, 1), 1, p.days)[0];
    const ns = makeSession({ clientId: p.clientId, packageId: p.id, date, time: p.time, duration: p.duration, workout: s.workout, rate: s.rate });
    const undo = mutate(() => S.sessions.push(ns));
    closeSheet(); toast(`Make-up added · ${fmtDay(date)}`, undoAction(undo));
  },
  deleteSession: d => {
    const undo = mutate(() => { S.sessions = S.sessions.filter(s => s.id !== d.id); });
    closeSheet(); toast('Session deleted', undoAction(undo));
  },
  deletePackage: d => {
    const p = pkgOf(d.id); if (!p) return;
    const st = pkgStats(p);
    if (!confirm(`Delete "${p.title}"?\n\n${st.left} upcoming session(s) will be removed. Completed sessions stay in history and billing.`)) return;
    const undo = mutate(() => {
      S.packages = S.packages.filter(x => x.id !== p.id);
      S.sessions = S.sessions.filter(s => s.packageId !== p.id || billable(s)).map(s => s.packageId === p.id ? { ...s, packageId: null } : s);
    });
    closeSheet(); toast('Package deleted', undoAction(undo));
  },
  deletePayment: d => {
    const undo = mutate(() => { S.payments = S.payments.filter(p => p.id !== d.id); });
    closeSheet(); toast('Payment deleted', undoAction(undo));
  },
  archiveClient: d => {
    const c = clientOf(d.id);
    const undo = mutate(() => { c.archived = !c.archived; });
    toast(c.archived ? 'Archived — hidden from lists' : 'Client restored', undoAction(undo));
  },
  deleteClient: d => {
    const c = clientOf(d.id); if (!c) return;
    if (!confirm(`Delete ${c.name}?\n\nThis removes their ${sessionsOf(c.id).length} sessions and ${S.payments.filter(p => p.clientId === c.id).length} payments. Tip: Archive keeps history instead.`)) return;
    const undo = mutate(() => {
      S.clients = S.clients.filter(x => x.id !== c.id);
      S.packages = S.packages.filter(x => x.clientId !== c.id);
      S.sessions = S.sessions.filter(x => x.clientId !== c.id);
      S.payments = S.payments.filter(x => x.clientId !== c.id);
    });
    location.hash = '#/clients';
    toast(`${c.name} deleted`, undoAction(undo));
  },
  markAllOverdue: () => {
    const list = overdue();
    const undo = mutate(() => list.forEach(s => { s.status = 'done'; s.doneAt = new Date().toISOString(); }));
    toast(`${list.length} sessions marked done`, undoAction(undo));
  },
  remind: d => {
    const c = clientOf(d.cid), b = balanceOf(c.id);
    const done = sessionsOf(c.id).filter(billable).length;
    openWhatsApp(waLink(c.phone, `Hi ${first(c.name)}, hope training is going well! 💪\n\nA gentle reminder that ${money(b)} is pending for your sessions (${done} completed so far). You can pay by UPI or cash at our next session.\n\nThank you!${sign()}`));
  },
  sharePkg: d => {
    const p = pkgOf(d.id), c = clientOf(p.clientId);
    const up = pkgSessions(p.id).filter(s => s.status === 'scheduled' && s.date >= today());
    const lines = up.map(s => `• ${fmtDay(s.date)}, ${fmtTime(s.time)}${s.workout ? ' – ' + s.workout : ''}`).join('\n');
    openWhatsApp(waLink(c.phone, `Hi ${first(c.name)}, here is your training schedule (${up.length} sessions):\n\n${lines}\n\nSee you there!${sign()}`));
  },
  syncNow: () => { sync.pending = sync.pending || !sync.lastSync; pull(); },
  syncOff: () => {
    if (!confirm('Turn off cloud sync on this phone?\n\nYour data stays on this phone and in the cloud; changes just stop uploading.')) return;
    sync = {}; saveSync(); setSync('off'); render();
  },
  eraseAll: () => {
    if (!confirm(`Erase ALL clients, sessions and payments${sync.passcode ? ' on this phone AND in the cloud' : ' on this phone'}?\n\nBack up first if you might need them.`)) return;
    const undo = mutate(() => { S = { ...blank(), settings: S.settings }; });
    toast('All data erased', undoAction(undo));
  },
};

/* ======================================================================
   RENDER, ROUTING, EVENTS
   ====================================================================== */
function applyTheme() {
  const t = S.settings.theme, root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
}

function renderTabs() {
  const dueCount = overdue().length;
  const tabs = [['today', 'Today', 'today'], ['clients', 'Clients', 'users'], ['money', 'Money', 'wallet'], ['more', 'More', 'more']];
  $('#tabbar').innerHTML = tabs.map(([k, l, i]) => `<a class="tab${ui.tab === k ? ' on' : ''}" href="#/${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ic(i)}${l}${k === 'today' && dueCount ? `<span class="badge" aria-label="${dueCount} unmarked">${dueCount > 99 ? '99+' : dueCount}</span>` : ''}</a>`).join('');
}

function render() {
  applyTheme();
  const views = { today: viewToday, clients: viewClients, money: viewMoney, more: viewMore };
  $('#view').innerHTML = ui.tab === 'clients' && ui.clientId && clientOf(ui.clientId) ? viewClient() : views[ui.tab]();
  renderTabs();
  $('#workouts').innerHTML = usedWorkouts().map(w => `<option value="${esc(w)}">`).join('');
}

let lastRoute = '';
function route() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'client' && b && clientOf(b)) {
    if (ui.clientId !== b) { ui.ctab = 'upcoming'; ui.showAll = false; }
    ui.tab = 'clients'; ui.clientId = b;
  } else {
    ui.tab = ['today', 'clients', 'money', 'more'].includes(a) ? a : 'today';
    ui.clientId = null;
  }
  closeSheet();
  render();
  if (location.hash !== lastRoute) window.scrollTo(0, 0);
  lastRoute = location.hash;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});
document.addEventListener('submit', e => {
  const f = e.target, fn = FORMS[f.dataset.form];
  if (fn) { e.preventDefault(); fn(new FormData(f), f); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; $('#clientList').innerHTML = clientList(); return; }
  const f = e.target.form;
  if (f && INPUT[f.dataset.form]) INPUT[f.dataset.form](f, e.target);
});
document.addEventListener('change', e => {
  if (e.target.id === 'importFile') return importFile(e.target);
  const f = e.target.form;
  if (f?.dataset.form === 'settings') saveSettings(f);
  else if (f && INPUT[f.dataset.form] && e.target.type === 'checkbox') INPUT[f.dataset.form](f, e.target);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// Touch: swipe the week strip to change weeks; drag a sheet down to dismiss it.
let swipe = null, drag = null;
document.addEventListener('touchstart', e => {
  const p = e.touches[0];
  if (e.target.closest('#week')) swipe = { x: p.clientX, y: p.clientY };
  const sh = e.target.closest('.sheet');
  if (sh && sh.scrollTop <= 0 && !e.target.closest('input,select,textarea')) drag = { sh, y: p.clientY, dy: 0 };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!drag) return;
  drag.dy = e.touches[0].clientY - drag.y;
  if (drag.dy > 0) { drag.sh.style.transition = 'none'; drag.sh.style.transform = `translateY(${drag.dy}px)`; }
}, { passive: true });
document.addEventListener('touchend', e => {
  const p = e.changedTouches[0];
  if (swipe) {
    const dx = p.clientX - swipe.x, dy = p.clientY - swipe.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { ui.day = addDays(ui.day, dx < 0 ? 7 : -7); render(); }
    swipe = null;
  }
  if (drag) {
    const { sh, dy } = drag; drag = null;
    sh.style.transition = '';
    if (dy > 110) { sh.style.transform = 'translateY(100%)'; closeSheet(); setTimeout(() => { sh.style.transform = ''; }, 320); }
    else sh.style.transform = '';
  }
});

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2500);
}

// When the app is reopened on a new day, jump the Today view to the new date.
let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = today();
  if (t !== lastToday) { if (ui.day === lastToday) ui.day = t; lastToday = t; render(); }
  pull(); // pick up changes made on another device, retry anything pending
});
window.addEventListener('online', () => pull());

window.addEventListener('hashchange', route);
route();
pull();
if (S.clients.length && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
