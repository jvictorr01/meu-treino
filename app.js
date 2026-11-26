'use strict';
(() => {
/* =========================================================
   Meu Treino — app (vanilla JS + Supabase)
   - Offline-first: tudo é salvo localmente e enviado ao Supabase
     por uma fila de sincronização (IDs gerados no cliente → upserts idempotentes).
   ========================================================= */

const K = {
  active: 'mt-active', queue: 'mt-queue', cache: 'mt-cache', settings: 'mt-settings',
  theme: 'mt-theme', legacy: 'treino-v1', loginAt: 'mt-login-at'
};
const DEF = { repMin: 8, repMax: 12, inc: 2.5, incSmall: 1, smallLimit: 10, autoRest: true };
const OPEN_MAX_H = 12; // treino aberto há mais que isso é encerrado automaticamente
const LOGIN_DAYS = 30;  // login fica salvo no aparelho por 30 dias
const SRC = { import: 'importado', baseline: 'ponto de partida', manual: 'ajuste manual' };

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const int = v => { if (v === '' || v == null) return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const round2 = n => Math.round(n * 100) / 100;
const fmtKg = n => n == null ? '—' : round2(n).toLocaleString('pt-BR');
const pad = n => String(n).padStart(2, '0');
const hms = s => { s = Math.max(0, Math.floor(s)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
const mmss = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? hms(s) : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const dur = s => { if (s == null) return '—'; const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}h ${pad(m)}min` : `${m}min`; };
const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtDateLong = iso => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
const vol = sets => sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
const maxW = sets => sets.reduce((a, s) => Math.max(a, s.weight || 0), 0);
const setsTxt = sets => sets.map(s => `${fmtKg(s.weight)}×${s.reps ?? '—'}`).join(' · ');

const P = {
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
  chart: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  gear: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
const ic = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

/* ---------------- estado ---------------- */
if (!window.supabase || !window.MT_CONFIG) {
  $('#boot').innerHTML = '<div class="card" style="padding:20px;max-width:400px">Não foi possível carregar o app. Verifique sua conexão e recarregue a página.</div>';
  return;
}
const sb = window.supabase.createClient(MT_CONFIG.url, MT_CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let user = null;
let settings = { ...DEF, ...ls.get(K.settings, {}) };
let data = { uid: null, sessions: [], sets: [] };
let queue = ls.get(K.queue, []);
let active = ls.get(K.active, null);
let view = 'treino';
let day = (() => { const d = new Date().getDay(); return d >= 5 || d === 0 ? 2 : d >= 3 ? 1 : 0; })();
let evoDay = day;
let sync = { s: 'ok', msg: '' };
let wakeLock = null;
let idxCache = null;
let authMode = 'login';

/* ---------------- dados locais ---------------- */
function dirty() { idxCache = null; }
function persist() { ls.set(K.cache, data); dirty(); }
function saveActive() { active ? ls.set(K.active, active) : ls.del(K.active); }
function upsertLocal(t, row) {
  if (t === 'user_settings') return;
  const arr = t === 'workout_sessions' ? data.sessions : data.sets;
  const i = arr.findIndex(x => x.id === row.id);
  if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push({ ...row });
}
function deleteLocal(t, id) {
  if (t === 'workout_sessions') {
    data.sessions = data.sessions.filter(x => x.id !== id);
    data.sets = data.sets.filter(x => x.session_id !== id);
  } else if (t === 'set_logs') data.sets = data.sets.filter(x => x.id !== id);
}
function index() {
  if (idxCache) return idxCache;
  const sessions = data.sessions.slice().sort((a, b) => a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0);
  const bySess = {};
  for (const s of data.sets) (bySess[s.session_id] ||= []).push(s);
  for (const k in bySess) bySess[k].sort((a, b) => a.set_number - b.set_number);
  return (idxCache = { sessions, bySess });
}
/** histórico [{s: sessão, sets}] cronológico para um exercício de um dia do plano */
function historyFor(d, exId, exclude) {
  const { sessions, bySess } = index();
  const out = [];
  for (const s of sessions) {
    if (s.day_index !== d || s.id === exclude) continue;
    const sets = (bySess[s.id] || []).filter(x => x.exercise_id === exId);
    if (sets.length) out.push({ s, sets });
  }
  return out;
}
function lastSessionOfDay(d) {
  const ss = index().sessions.filter(s => s.day_index === d && s.source === 'app' && s.ended_at && s.id !== active?.id);
  return ss[ss.length - 1] || null;
}

/* ---------------- fila de sincronização ---------------- */
const qKey = r => r.id ?? r.user_id;
function enqueue(op) {
  if (op.op === 'upsert') {
    const i = queue.findIndex(q => q.op === 'upsert' && q.t === op.t && qKey(q.row) === qKey(op.row));
    if (i >= 0) queue[i] = op; else queue.push(op);
  } else {
    queue = queue.filter(q => !(q.op === 'upsert' && (
      (q.t === op.t && q.row.id === op.id) ||
      (op.t === 'workout_sessions' && q.t === 'set_logs' && q.row.session_id === op.id))));
    queue.push(op);
  }
  ls.set(K.queue, queue);
}
function commit(t, row) { upsertLocal(t, row); enqueue({ t, op: 'upsert', row }); persist(); flush(); }
function removeRow(t, id) { deleteLocal(t, id); enqueue({ t, op: 'delete', id }); persist(); flush(); }

let flushing = null;
function flush() {
  if (flushing) return flushing;
  if (!user) return Promise.resolve(false);
  flushing = (async () => {
    if (queue.length) setSync('sync');
    try {
      while (queue.length) {
        const q = queue[0];
        const r = q.op === 'upsert'
          ? await sb.from(q.t).upsert({ ...q.row, user_id: user.id })
          : await sb.from(q.t).delete().eq('id', q.id);
        if (r.error) throw r.error;
        queue.shift();
        ls.set(K.queue, queue);
      }
      setSync('ok');
      return true;
    } catch (e) {
      setSync('err', errMsg(e));
      return false;
    } finally { flushing = null; }
  })();
  return flushing;
}
function errMsg(e) {
  const m = e?.message || String(e);
  if (e?.code === 'PGRST205' || /schema cache|does not exist/i.test(m)) return 'Tabelas não encontradas no Supabase — rode supabase/schema.sql no SQL Editor.';
  if (/fetch|network|Failed to fetch|Load failed/i.test(m)) return 'Sem conexão — os dados ficam salvos no aparelho e serão enviados depois.';
  if (/JWT|token/i.test(m)) return 'Sessão expirada — saia e entre novamente.';
  return m;
}
function setSync(s, msg = '') {
  sync = { s, msg };
  document.querySelectorAll('[data-sync]').forEach(el => { el.className = 'dot ' + (s === 'ok' ? '' : s); el.title = msg || (s === 'ok' ? 'Sincronizado' : 'Sincronizando…'); });
  const t = $('#syncTxt'); if (t) t.textContent = syncLabel();
}
const syncLabel = () => sync.s === 'ok' ? (queue.length ? `${queue.length} pendente(s)` : 'Sincronizado') : sync.s === 'sync' ? 'Sincronizando…' : `Erro: ${sync.msg}`;

async function fetchAll(t, order) {
  let out = [], from = 0; const N = 1000;
  for (;;) {
    const { data: d, error } = await sb.from(t).select('*').order(order).range(from, from + N - 1);
    if (error) throw error;
    out = out.concat(d);
    if (d.length < N) break;
    from += N;
  }
  return out;
}
async function pull() {
  if (!user) return;
  const [sessions, sets] = await Promise.all([fetchAll('workout_sessions', 'started_at'), fetchAll('set_logs', 'completed_at')]);
  data = {
    uid: user.id, sessions,
    sets: sets.map(s => ({ ...s, weight: s.weight == null ? null : Number(s.weight) }))
  };
  for (const q of queue) q.op === 'upsert' ? upsertLocal(q.t, q.row) : deleteLocal(q.t, q.id);
  persist();
  try {
    const { data: st, error } = await sb.from('user_settings').select('settings').maybeSingle();
    if (!error && st?.settings && !queue.some(q => q.t === 'user_settings')) {
      settings = { ...DEF, ...st.settings }; ls.set(K.settings, settings);
    }
  } catch (e) { }
}
async function refresh() {
  await flush();
  try { await pull(); if (sync.s !== 'err') setSync('ok'); }
  catch (e) { setSync('err', errMsg(e)); }
  closeStaleSessions();
  maybeResume();
  render();
  if (needsWeights() && !autoWeightsShown && !active && $('#modal').hidden) { autoWeightsShown = true; openWeights(true); }
}
let autoWeightsShown = false;
const needsWeights = () => !settings.onboarded && !data.sessions.some(s => s.source === 'baseline');

/* ---------------- tema ---------------- */
function themePref() { return ls.get(K.theme, 'auto'); }
function isDark() {
  const p = themePref();
  return p === 'dark' || (p === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme() {
  const p = themePref();
  if (p === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = p;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').setAttribute('content', bg || '#0e1014');
  const b = $('#themeBtn'); if (b) b.innerHTML = ic(isDark() ? 'sun' : 'moon');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); });

/* ---------------- treino: lógica ---------------- */
function prefill(d, i, exclude) {
  const e = PLANO[d].ex[i];
  const h = historyFor(d, e.id, exclude ?? active?.id);
  if (h.length) return h[h.length - 1].sets.map(x => ({ kg: x.weight ?? '', pr: x.reps ?? '' }));
  return e.w.map(v => ({ kg: v, pr: '' }));
}
function progression(d, exId) {
  const h = historyFor(d, exId, active?.id).filter(x => x.s.source === 'app' || x.sets.some(s => s.reps != null));
  if (!h.length) return null;
  const last = h[h.length - 1].sets;
  const reps = last.map(x => x.reps).filter(r => r != null);
  if (!reps.length) return { type: 'none', last };
  const top = last.filter(x => x.reps != null && x.reps >= settings.repMax).length;
  const inc = maxW(last) < settings.smallLimit ? settings.incSmall : settings.inc;
  if (top === last.length) return { type: 'up', inc, last };
  if (reps.some(r => r < settings.repMin)) return { type: 'down', last };
  return { type: 'keep', top, n: last.length, last };
}
function sessionRow() { return data.sessions.find(s => s.id === active?.id); }
function setRow(i, j) {
  const r = active.ex[i][j];
  return {
    id: r.id, session_id: active.id, day_index: active.day, exercise_id: PLANO[active.day].ex[i].id,
    set_number: j + 1, weight: num(r.kg), reps: int(r.r), rest_sec: r.rest ?? null, completed_at: r.at
  };
}
function newRow(p) { return { id: uid(), kg: p.kg ?? '', r: '', pr: p.pr ?? '', done: false, at: null, rest: null }; }

function startSession() {
  if (active) return;
  const id = uid(), now = new Date().toISOString();
  const ex = PLANO[day].ex.map((_, i) => prefill(day, i, id).map(newRow));
  active = { id, day, startedAt: now, ex, rest: null, applied: [] };
  commit('workout_sessions', { id, day_index: day, day_name: PLANO[day].dia, started_at: now, ended_at: null, duration_sec: null, source: 'app' });
  saveActive(); wake(); render(); scrollTo({ top: 0, behavior: 'smooth' });
  toast('Treino iniciado — bom treino! 💪');
}
function buildActive(sess) {
  const d = sess.day_index;
  const logged = index().bySess[sess.id] || [];
  const ex = PLANO[d].ex.map((e, i) => {
    const mine = logged.filter(s => s.exercise_id === e.id).sort((a, b) => a.set_number - b.set_number);
    const pf = prefill(d, i, sess.id);
    const rows = mine.map(s => ({ id: s.id, kg: s.weight ?? '', r: s.reps ?? '', pr: '', done: true, at: s.completed_at, rest: s.rest_sec }));
    for (let k = rows.length; k < pf.length; k++) rows.push(newRow(pf[k]));
    return rows;
  });
  active = { id: sess.id, day: d, startedAt: sess.started_at, ex, rest: null, applied: [] };
  day = d; saveActive(); wake();
}
function toggleSet(i, j) {
  if (!active) { toast('Toque em "Iniciar treino" primeiro'); return; }
  const r = active.ex[i]?.[j]; if (!r) return;
  if (r.done) {
    if (active.rest?.setId === r.id) active.rest = null;
    r.done = false; r.at = null; r.rest = null;
    removeRow('set_logs', r.id);
  } else {
    if (r.r === '' || r.r == null) {
      if (r.pr !== '' && r.pr != null) r.r = String(r.pr);
      else { toast('Informe as repetições'); document.querySelector(`[data-f="r"][data-i="${i}"][data-j="${j}"]`)?.focus(); return; }
    }
    if (int(r.r) == null || int(r.r) < 0) { toast('Repetições inválidas'); return; }
    endRest(true);
    r.done = true; r.at = new Date().toISOString();
    commit('set_logs', setRow(i, j));
    navigator.vibrate?.(15);
    if (settings.autoRest) startRest(i, j);
  }
  saveActive(); render();
}
function lastDoneRef() {
  let best = null;
  active?.ex.forEach((rows, i) => rows.forEach((r, j) => { if (r.done && (!best || r.at > best.at)) best = { i, j, at: r.at }; }));
  return best;
}
function startRest(i, j) {
  if (!active) return;
  endRest(true);
  if (i == null) { const l = lastDoneRef(); if (l) { i = l.i; j = l.j; } }
  const r = i != null ? active.ex[i][j] : null;
  active.rest = {
    startedAt: Date.now(), setId: r?.id ?? null, i: i ?? null, j: j ?? null,
    label: r ? `após ${EX[PLANO[active.day].ex[i].id]} · ${j + 1}ª série` : 'Descanso livre'
  };
  saveActive(); renderDock();
}
function endRest(silent) {
  if (!active?.rest) return;
  const { startedAt, setId, i, j } = active.rest;
  const sec = Math.round((Date.now() - startedAt) / 1000);
  active.rest = null;
  if (i != null) {
    const r = active.ex[i]?.[j];
    if (r && r.done && r.id === setId) { r.rest = sec; commit('set_logs', setRow(i, j)); }
  }
  saveActive();
  if (!silent) { toast(`Descanso registrado: ${mmss(sec)}`); render(); }
}
function updField(i, j, f, v) {
  if (!active) return;
  const r = active.ex[i]?.[j]; if (!r) return;
  r[f] = v.trim();
  if (r.done) {
    if (f === 'r' && int(r.r) == null) { toast('Repetições inválidas'); return; }
    commit('set_logs', setRow(i, j));
  }
  saveActive();
}
function addSet(i) {
  if (!active) { toast('Toque em "Iniciar treino" primeiro'); return; }
  const rows = active.ex[i]; const last = rows[rows.length - 1];
  rows.push(newRow({ kg: last ? last.kg : '', pr: last ? (last.r || last.pr) : '' }));
  saveActive(); render();
}
function rmSet(i) {
  if (!active) { toast('Toque em "Iniciar treino" primeiro'); return; }
  const rows = active.ex[i]; if (rows.length <= 1) return;
  const r = rows.pop();
  if (r.done) { if (active.rest?.setId === r.id) active.rest = null; removeRow('set_logs', r.id); }
  saveActive(); render();
}
function applyProg(i) {
  if (!active) return;
  const e = PLANO[active.day].ex[i]; const pg = progression(active.day, e.id);
  if (pg?.type !== 'up') return;
  active.ex[i].forEach(r => { if (!r.done && num(r.kg) != null) r.kg = String(round2(num(r.kg) + pg.inc)); });
  active.applied[i] = true;
  saveActive(); render(); toast(`+${fmtKg(pg.inc)} kg aplicado em ${EX[e.id]}`);
}
function doneCount() { return active ? active.ex.flat().filter(r => r.done).length : 0; }
function finishSession() {
  if (!active) return;
  const n = doneCount();
  if (!n) {
    modal({
      title: 'Nenhuma série concluída', body: 'Você ainda não marcou nenhuma série. Deseja descartar este treino?',
      actions: [{ label: 'Continuar', fn: closeModal }, { label: 'Descartar', cls: 'danger', fn: () => { closeModal(); discardSession(true); } }]
    });
    return;
  }
  const sec = Math.round((Date.now() - new Date(active.startedAt)) / 1000);
  modal({
    title: 'Finalizar treino?',
    body: `Tempo: <b>${hms(sec)}</b> · ${n} série(s) concluída(s).`,
    actions: [{ label: 'Voltar', fn: closeModal }, { label: 'Finalizar', cls: 'primary', fn: () => { closeModal(); doFinish(); } }]
  });
}
function doFinish() {
  endRest(true);
  const end = new Date(); const sec = Math.round((end - new Date(active.startedAt)) / 1000);
  const base = sessionRow() || { id: active.id, day_index: active.day, day_name: PLANO[active.day].dia, started_at: active.startedAt, source: 'app' };
  commit('workout_sessions', { ...base, ended_at: end.toISOString(), duration_sec: sec });
  const d = active.day, sid = active.id;
  active = null; saveActive(); unwake();
  const sets = index().bySess[sid] || [];
  const rests = sets.map(s => s.rest_sec).filter(x => x != null);
  const ups = PLANO[d].ex.filter(e => progression(d, e.id)?.type === 'up').map(e => EX[e.id]);
  render();
  modal({
    title: 'Treino finalizado 🎉',
    body: `<div class="sum-grid">
      <div><small>Duração</small><b>${hms(sec)}</b></div>
      <div><small>Séries</small><b>${sets.length}</b></div>
      <div><small>Volume</small><b>${fmtKg(vol(sets))} kg</b></div>
      <div><small>Descanso médio</small><b>${rests.length ? mmss(rests.reduce((a, b) => a + b, 0) / rests.length) : '—'}</b></div>
    </div>
    ${ups.length ? `<p style="margin-top:14px"><b style="color:var(--ok)">Prontos para subir carga no próximo treino:</b><br>${ups.map(esc).join(', ')}</p>` : ''}`,
    actions: [{ label: 'Ver evolução', fn: () => { closeModal(); evoDay = d; go('evolucao'); } }, { label: 'OK', cls: 'primary', fn: closeModal }]
  });
}
function discardSession(skipConfirm) {
  if (!active) return;
  const run = () => {
    removeRow('workout_sessions', active.id);
    active = null; saveActive(); unwake(); render(); toast('Treino descartado');
  };
  if (skipConfirm) return run();
  modal({
    title: 'Descartar treino?', body: 'Todas as séries registradas neste treino serão apagadas.',
    actions: [{ label: 'Voltar', fn: closeModal }, { label: 'Descartar', cls: 'danger', fn: () => { closeModal(); run(); } }]
  });
}
function closeStaleSessions() {
  const now = Date.now();
  for (const s of data.sessions) {
    if (s.ended_at || s.source !== 'app' || s.id === active?.id) continue;
    if (now - new Date(s.started_at) < OPEN_MAX_H * 3600e3) continue;
    closeAtLastSet(s);
  }
}
function closeAtLastSet(s) {
  const sets = index().bySess[s.id] || [];
  const lastAt = sets.map(x => x.completed_at).filter(Boolean).sort().pop() || s.started_at;
  commit('workout_sessions', { ...s, ended_at: lastAt, duration_sec: Math.round((new Date(lastAt) - new Date(s.started_at)) / 1000) });
}
function maybeResume() {
  if (active) {
    // sessão foi apagada em outro aparelho?
    if (!data.sessions.some(s => s.id === active.id) && !queue.some(q => q.row?.id === active.id)) { active = null; saveActive(); unwake(); }
    return;
  }
  const open = index().sessions.filter(s => !s.ended_at && s.source === 'app').pop();
  if (!open) return;
  modal({
    title: 'Treino em andamento',
    body: `Você tem um treino de <b>${esc(PLANO[open.day_index]?.dia || '')}</b> iniciado às ${fmtTime(open.started_at)}. Deseja retomar?`,
    actions: [
      { label: 'Encerrar', fn: () => { closeModal(); closeAtLastSet(open); render(); toast('Treino encerrado no horário da última série'); } },
      { label: 'Retomar', cls: 'primary', fn: () => { closeModal(); buildActive(open); go('treino'); } }
    ]
  });
}

/* ---------------- Meus pesos (início + hoje), via modal ---------------- */
/** pesos salvos pela versão anterior do app (localStorage) → usados só como sugestão */
function legacyData() {
  const o = ls.get(K.legacy, null); if (!o || typeof o !== 'object') return {};
  const out = {};
  for (const k in o) {
    const [d, i] = k.split('_').map(Number);
    if (!PLANO[d]?.ex[i] || !Array.isArray(o[k]?.s)) continue;
    const sets = o[k].s.filter(x => num(x.kg) != null);
    if (sets.length) out[k] = sets.map(x => ({ kg: String(x.kg), r: x.r == null ? '' : String(x.r) }));
  }
  return out;
}
const toRows = sets => sets.map(x => ({ kg: x.weight == null ? '' : String(x.weight), r: x.reps == null ? '' : String(x.reps) }));
const rowsKey = rows => JSON.stringify(rows.map(r => [String(r.kg).trim().replace(',', '.'), String(r.r).trim()]).filter(r => r[0] || r[1]));
let W = null; // estado do modal

function openWeights(first) {
  const L = legacyData();
  const baseSess = d => data.sessions.find(s => s.source === 'baseline' && s.day_index === d);
  const days = PLANO.map((p, d) => p.ex.map((e, i) => {
    const hi = historyFor(d, e.id, active?.id);
    const bs = baseSess(d);
    const bSets = bs ? (index().bySess[bs.id] || []).filter(x => x.exercise_id === e.id) : [];
    const b = bSets.length ? toRows(bSets) : hi.length ? toRows(hi[0].sets) : e.w.map(v => ({ kg: v === '' ? '' : String(v), r: '' }));
    let c, orig;
    if (hi.length && !(hi.length === 1 && bSets.length)) { c = toRows(hi[hi.length - 1].sets); orig = rowsKey(c); }
    else if (L[`${d}_${i}`]) { c = L[`${d}_${i}`]; orig = null; }
    else { c = b.map(r => ({ ...r })); orig = rowsKey(c); }
    const n = Math.max(3, e.w.length, b.length, c.length);
    while (b.length < n) b.push({ kg: '', r: '' });
    while (c.length < n) c.push({ kg: '', r: '' });
    return { b, c, orig };
  }));
  const anyBase = data.sessions.filter(s => s.source === 'baseline').sort((a, b) => a.started_at < b.started_at ? -1 : 1)[0];
  W = { day: active ? active.day : day, first: !!first, start: anyBase ? ymd(new Date(anyBase.started_at)) : ymd(new Date()), days };
  const m = $('#modal');
  m.className = 'modal full';
  m.innerHTML = `<div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="wTitle">
    <div class="sheet-h"><h2 id="wTitle">${ic('scale', 22)}Meus pesos</h2><button class="iconbtn" data-a="wClose" aria-label="Fechar">${ic('x')}</button></div>
    <div class="sheet-b">
      <p class="mut" style="margin:0 0 12px;font-size:14px">${first ? 'Bem-vindo! ' : ''}Informe os pesos com que você <b>começou</b> e os que está usando <b>hoje</b> em cada exercício. Não precisa ser dia de treino — dá para ajustar sempre que quiser.</p>
      <label class="wdate">Comecei a treinar em<input type="date" class="in" id="wStart" value="${W.start}" max="${ymd(new Date())}"></label>
      <div class="chips" id="wChips"></div>
      <div id="wList"></div>
    </div>
    <div class="sheet-f">
      <button class="btn" data-a="wClose">${first ? 'Pular' : 'Cancelar'}</button>
      <button class="btn primary" data-a="wSave">${ic('check', 18)}Salvar</button>
    </div>
  </div>`;
  m.hidden = false; document.body.classList.add('lock');
  renderWeightsDay();
}
function renderWeightsDay() {
  $('#wChips').innerHTML = PLANO.map((p, d) => `<button class="chip ${d === W.day ? 'on' : ''}" data-a="wDay" data-d="${d}">${esc(p.dia)}</button>`).join('');
  const PL = PLANO[W.day];
  let lg = null;
  $('#wList').innerHTML = PL.ex.map((e, i) => {
    const x = W.days[W.day][i], n = x.b.length;
    const head = e.g !== lg && e.g ? `<div class="grp">${esc(e.g)}</div>` : ''; lg = e.g;
    const cells = (k, f) => x[k].map((r, j) => `<input class="in" inputmode="${f === 'kg' ? 'decimal' : 'numeric'}" data-w="${k}" data-wf="${f}" data-i="${i}" data-j="${j}" value="${esc(r[f])}" placeholder="${f === 'kg' ? 'kg' : 'reps'}" aria-label="${k === 'b' ? 'Início' : 'Hoje'} ${f === 'kg' ? 'peso' : 'repetições'} ${j + 1}ª série">`).join('');
    return `${head}<div class="wex">
      <div class="wex-h"><h4>${esc(EX[e.id])}</h4><button class="btn sm ghost" data-a="wCopy" data-i="${i}" title="Copiar início para hoje">Hoje = início</button></div>
      <div class="wgrid" style="--n:${n}">
        <span></span>${x.b.map((_, j) => `<span class="wh">${j + 1}ª</span>`).join('')}
        <span class="wl b">Início<small>kg</small></span>${cells('b', 'kg')}
        <span class="wl b"><small>reps</small></span>${cells('b', 'r')}
        <span class="wl c">Hoje<small>kg</small></span>${cells('c', 'kg')}
        <span class="wl c"><small>reps</small></span>${cells('c', 'r')}
      </div></div>`;
  }).join('');
}
function closeWeights(skip) {
  if (skip && W?.first) saveSettings({ onboarded: true });
  W = null; const m = $('#modal'); m.className = 'modal'; closeModal();
}
function saveWeights() {
  const today = ymd(new Date());
  let start = $('#wStart').value || today;
  if (start > today) start = today;
  const startIso = new Date(start + 'T00:00:00').toISOString();
  const nowIso = new Date().toISOString();
  const valid = rows => rows.map((r, j) => ({ j, kg: num(r.kg), r: int(r.r), raw: r })).filter(r => String(r.raw.kg).trim() !== '' || String(r.raw.r).trim() !== '');
  let bad = false;
  W.days.forEach(ex => ex.forEach(x => [...x.b, ...x.c].forEach(r => {
    if ((String(r.kg).trim() && num(r.kg) == null) || (String(r.r).trim() && int(r.r) == null)) bad = true;
  })));
  if (bad) { toast('Há valores inválidos — use só números'); return; }

  /** grava os sets de um exercício numa sessão, reaproveitando ids e apagando os que sobraram */
  const writeSets = (sid, d, e, rows, at) => {
    const existing = (index().bySess[sid] || []).filter(x => x.exercise_id === e.id);
    const keep = new Set();
    valid(rows).forEach((r, k) => {
      const old = existing.find(x => x.set_number === k + 1);
      const id = old?.id || uid(); keep.add(id);
      commit('set_logs', { id, session_id: sid, day_index: d, exercise_id: e.id, set_number: k + 1, weight: r.kg, reps: r.r, rest_sec: null, completed_at: at });
    });
    existing.filter(x => !keep.has(x.id)).forEach(x => removeRow('set_logs', x.id));
  };

  PLANO.forEach((p, d) => {
    const ex = W.days[d];
    // ponto de partida (uma sessão "baseline" por dia)
    const bs = data.sessions.find(s => s.source === 'baseline' && s.day_index === d);
    if (bs || ex.some(x => valid(x.b).length)) {
      const sid = bs?.id || uid();
      commit('workout_sessions', { id: sid, day_index: d, day_name: p.dia, started_at: startIso, ended_at: startIso, duration_sec: null, source: 'baseline' });
      p.ex.forEach((e, i) => writeSets(sid, d, e, ex[i].b, startIso));
    }
    // pesos de hoje: só os exercícios que mudaram viram um "ajuste manual" datado de hoje
    const changed = p.ex.map((e, i) => i).filter(i => valid(ex[i].c).length && rowsKey(ex[i].c) !== ex[i].orig);
    if (changed.length) {
      const ms = data.sessions.find(s => s.source === 'manual' && s.day_index === d && ymd(new Date(s.started_at)) === today);
      const sid = ms?.id || uid(), at = ms?.started_at || nowIso;
      commit('workout_sessions', { id: sid, day_index: d, day_name: p.dia, started_at: at, ended_at: at, duration_sec: null, source: 'manual' });
      changed.forEach(i => writeSets(sid, d, p.ex[i], ex[i].c, at));
    }
  });
  saveSettings({ onboarded: true });
  closeWeights(false);
  render();
  toast('Pesos salvos ✓');
}
function saveSettings(patch) {
  Object.assign(settings, patch);
  ls.set(K.settings, settings);
  if (user) commit('user_settings', { user_id: user.id, settings, updated_at: new Date().toISOString() });
}
function weightsBanner() {
  return `<div class="banner"><p>Configure os <b>pesos com que você começou</b> e os <b>de hoje</b> para acompanhar sua evolução desde o início.</p>
    <div class="acts"><button class="btn sm primary" data-a="weights">Configurar</button></div></div>`;
}

/* ---------------- render ---------------- */
const TITLES = { treino: 'Treino', evolucao: 'Evolução', historico: 'Histórico', config: 'Configurações' };
function go(v) { view = v; closeMenu(); render(); scrollTo(0, 0); }
function render() {
  if (!user) return;
  $('#title').textContent = view === 'treino' ? (active ? `Treino · ${PLANO[active.day].dia}` : 'Treino') : TITLES[view];
  $('#main').innerHTML = view === 'evolucao' ? renderEvo() : view === 'historico' ? renderHist() : view === 'config' ? renderCfg() : renderTreino();
  renderSide(); renderDock(); applyTheme(); tick();
}
function renderSide() {
  const nav = [['treino', 'dumbbell', 'Treino'], ['evolucao', 'chart', 'Evolução'], ['historico', 'history', 'Histórico'], ['pesos', 'scale', 'Meus pesos'], ['config', 'gear', 'Configurações']];
  $('#side').innerHTML = `
    <div class="brand"><span class="logo">${ic('dumbbell', 20)}</span>Meu Treino</div>
    <nav class="nav">
      ${nav.map(([v, i, l]) => `<button class="${view === v ? 'on' : ''}" ${v === 'pesos' ? 'data-a="weights"' : `data-a="nav" data-v="${v}"`}>${ic(i)}${l}</button>
        ${v === 'treino' ? PLANO.map((p, d) => `<button class="sub ${view === 'treino' && day === d ? 'on' : ''}" data-a="day" data-d="${d}" ${active && active.day !== d ? 'disabled' : ''}>${esc(p.dia)}</button>`).join('') : ''}`).join('')}
    </nav>
    ${active ? `<button class="side-live" data-a="nav" data-v="treino">${ic('timer', 18)}Em andamento<b id="sideT">00:00:00</b></button>` : ''}
    <div class="side-foot">
      <div style="display:flex;align-items:center;gap:8px"><span data-sync class="dot ${sync.s === 'ok' ? '' : sync.s}"></span><span id="syncTxt">${esc(syncLabel())}</span></div>
      <div class="who">${esc(user.email)}</div>
      <button class="btn sm ghost" data-a="logout">${ic('logout', 16)}Sair</button>
    </div>`;
  $('#menuBtn').innerHTML = ic('menu');
  $('#liveChip').hidden = !active;
}
function renderTreino() {
  if (active) day = active.day;
  const PL = PLANO[day];
  let h = `<div class="chips">${PLANO.map((p, i) => `<button class="chip ${i === day ? 'on' : ''}" data-a="day" data-d="${i}" ${active && i !== day ? 'disabled' : ''}>${active && i !== day ? ic('lock', 14) : ''}${esc(p.dia)}</button>`).join('')}</div>`;
  const last = lastSessionOfDay(day);
  h += `<section class="hero"><h2>${esc(PL.titulo)}</h2><p class="mut">${PL.ex.length} exercícios${last ? ` · último em ${fmtDate(last.started_at)} · ${dur(last.duration_sec)}` : ''}</p>`;
  if (active) {
    const tot = active.ex.flat().length, dn = doneCount();
    h += `<div class="prog"><i style="width:${tot ? dn / tot * 100 : 0}%"></i></div><div class="prog-l"><span>${dn} de ${tot} séries</span><span>início ${fmtTime(active.startedAt)}</span></div>`;
  }
  h += `</section>`;
  if (needsWeights()) h += weightsBanner();
  let lg = null;
  PL.ex.forEach((e, i) => {
    if (e.g !== lg) { if (e.g) h += `<div class="grp">${esc(e.g)}</div>`; lg = e.g; }
    h += cardEx(e, i);
  });
  if (active) h += `<button class="link-danger" data-a="cancel">Descartar este treino</button>`;
  return h;
}
function cardEx(e, i) {
  const rows = active ? active.ex[i] : prefill(day, i).map(newRow);
  const pg = progression(day, e.id);
  const dn = rows.filter(r => r.done).length;
  const dis = active ? '' : 'disabled';
  let badge = '';
  if (pg?.type === 'up') badge = `<div class="pg up">${ic('up', 16)}<span>Bateu ${settings.repMax} reps em todas as séries — suba <b>+${fmtKg(pg.inc)} kg</b></span>${active && !active.applied[i] ? `<button data-a="apply" data-i="${i}">Aplicar</button>` : ''}</div>`;
  else if (pg?.type === 'keep') badge = `<div class="pg keep">${ic('right', 16)}<span>Mantenha a carga · ${pg.top}/${pg.n} séries com ${settings.repMax}+ reps</span></div>`;
  else if (pg?.type === 'down') badge = `<div class="pg down">${ic('down', 16)}<span>Alguma série abaixo de ${settings.repMin} reps — mantenha ou reduza a carga</span></div>`;
  return `<article class="card ex ${dn === rows.length && dn ? 'complete' : ''}">
    <div class="ex-head">
      <button class="thumbs" data-a="img" data-id="${esc(e.id)}" aria-label="Ver imagens"><img src="/img/${esc(e.id)}_0.jpg" loading="lazy" alt=""><img src="/img/${esc(e.id)}_1.jpg" loading="lazy" alt=""></button>
      <div class="ex-info"><h3>${esc(EX[e.id])}</h3><p>${pg?.last ? `Último: ${esc(setsTxt(pg.last))}` : 'Primeira vez — registre seu início'}</p></div>
      <span class="count">${dn}/${rows.length}</span>
    </div>
    ${badge}
    <div class="sets">
      <div class="set-h"><span>Série</span><span>Peso (kg)</span><span>Reps</span><span></span></div>
      ${rows.map((r, j) => `<div class="set ${r.done ? 'done' : ''} ${active?.rest?.setId === r.id && r.id ? 'resting' : ''}">
        <div class="sn">${j + 1}ª${r.rest != null ? `<small>${ic('timer', 11)}${mmss(r.rest)}</small>` : ''}</div>
        <input class="in" inputmode="decimal" enterkeyhint="next" data-f="kg" data-i="${i}" data-j="${j}" value="${esc(r.kg)}" placeholder="kg" aria-label="Peso série ${j + 1}" ${dis}>
        <input class="in" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" data-f="r" data-i="${i}" data-j="${j}" value="${esc(r.r)}" placeholder="${esc(r.pr === '' ? 'reps' : r.pr)}" aria-label="Repetições série ${j + 1}" ${dis}>
        <button class="ck" data-a="set" data-i="${i}" data-j="${j}" aria-label="Concluir série ${j + 1}">${ic('check', 22)}</button>
      </div>`).join('')}
    </div>
    <div class="row-acts"><button data-a="add" data-i="${i}">${ic('plus', 16)}série</button><button data-a="rm" data-i="${i}">${ic('minus', 16)}série</button></div>
  </article>`;
}
function renderDock() {
  const d = $('#dock');
  if (!user || (!active && view !== 'treino')) { d.hidden = true; setDockH(); return; }
  d.hidden = false;
  if (!active) {
    d.innerHTML = `<div class="dock-in"><button class="btn primary big" data-a="start">${ic('play')}Iniciar treino · ${esc(PLANO[day].dia)}</button></div>`;
  } else {
    d.innerHTML = `<div class="dock-in">
      ${active.rest ? `<div class="rest"><div><span class="lbl">${ic('timer', 16)}Descanso</span><small>${esc(active.rest.label)}</small></div>
        <div class="rest-t" id="restT">00:00:00</div></div>
        <button class="btn ok big" data-a="restEnd">${ic('check')}Fim do descanso</button>` : ''}
      <div class="dock-row">
        <div class="sess"><small>Tempo de treino</small><b id="sessT">00:00:00</b></div>
        ${active.rest ? '' : `<button class="btn ghost" data-a="rest">${ic('timer', 18)}Descanso</button>`}
        <button class="btn danger" data-a="finish">${ic('stop', 18)}Finalizar</button>
      </div></div>`;
  }
  tick(); setDockH();
}
function setDockH() { const d = $('#dock'); document.documentElement.style.setProperty('--dock-h', d.hidden ? '0px' : d.offsetHeight + 'px'); }

function spark(vals, labels) {
  if (vals.length < 2) return `<div class="spark-empty">Registre mais treinos para ver o gráfico de evolução.</div>`;
  const W = 320, H = 96, px = 14, pt = 16, pb = 18;
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn;
  const X = i => px + i * (W - 2 * px) / (vals.length - 1);
  const Y = v => rg ? pt + (1 - (v - mn) / rg) * (H - pt - pb) : (H - pb + pt) / 2;
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Carga máxima por treino">
    <path d="M${pts[0]} L${pts.join(' L')} L${X(vals.length - 1)},${H - pb} L${X(0)},${H - pb}Z" fill="currentColor" opacity=".12"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${vals.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${i === vals.length - 1 ? 4 : 2.5}" fill="currentColor"/>`).join('')}
    <text x="${X(0)}" y="${Y(vals[0]) - 6}" text-anchor="start">${fmtKg(vals[0])}kg</text>
    <text x="${X(vals.length - 1)}" y="${Y(vals[vals.length - 1]) - 7}" text-anchor="end">${fmtKg(vals[vals.length - 1])}kg</text>
    <text x="${X(0)}" y="${H - 3}" text-anchor="start">${esc(labels[0])}</text>
    <text x="${X(vals.length - 1)}" y="${H - 3}" text-anchor="end">${esc(labels[labels.length - 1])}</text>
  </svg>`;
}
function renderEvo() {
  const ss = index().sessions;
  const app = ss.filter(s => s.source === 'app' && s.ended_at);
  let h = `<div class="chips">${PLANO.map((p, i) => `<button class="chip ${i === evoDay ? 'on' : ''}" data-a="evoDay" data-d="${i}">${esc(p.dia)}</button>`).join('')}</div>`;
  h += `<section class="hero"><h2>${esc(PLANO[evoDay].titulo)}</h2><p class="mut">${ss.length ? `Seu início: ${fmtDate(ss[0].started_at)} · ${app.length} treino(s) registrados` : 'Configure seus pesos ou comece um treino para registrar seu ponto de partida.'}</p>
    <button class="btn sm ghost" style="margin-top:10px" data-a="weights">${ic('scale', 16)}Editar pesos (início e hoje)</button></section>`;
  if (needsWeights()) h += weightsBanner();
  for (const e of PLANO[evoDay].ex) {
    const hi = historyFor(evoDay, e.id);
    const name = esc(EX[e.id]);
    if (!hi.length) {
      const w = e.w.filter(v => v !== '');
      h += `<article class="card evo"><h3>${name}<span class="delta">sem registros</span></h3>
        <div class="cmp"><div class="start"><small>Início (plano)</small><p>${w.length ? w.map(v => fmtKg(v) + 'kg').join(' · ') : '—'}</p></div>
        <div class="now"><small>Atual</small><p class="mut">—</p></div></div></article>`;
      continue;
    }
    const f = hi[0], l = hi[hi.length - 1];
    const f0 = maxW(f.sets), l0 = maxW(l.sets), dk = round2(l0 - f0), pct = f0 ? Math.round(dk / f0 * 100) : 0;
    const pg = progression(evoDay, e.id);
    h += `<article class="card evo">
      <h3>${name}<span class="delta ${dk > 0 ? 'pos' : dk < 0 ? 'neg' : ''}">${dk > 0 ? '+' : ''}${fmtKg(dk)} kg${f0 ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}</span></h3>
      <div class="cmp">
        <div class="start"><small>Início</small><span class="d">${fmtDate(f.s.started_at)}${SRC[f.s.source] ? ' · ' + SRC[f.s.source] : ''}</span><p>${esc(setsTxt(f.sets))}</p></div>
        <div class="now"><small>Atual</small><span class="d">${fmtDate(l.s.started_at)}${l !== f && SRC[l.s.source] ? ' · ' + SRC[l.s.source] : ''}</span><p>${esc(setsTxt(l.sets))}</p></div>
      </div>
      ${spark(hi.map(x => maxW(x.sets)), hi.map(x => fmtDate(x.s.started_at).slice(0, 5)))}
      ${pg?.type === 'up' ? `<div class="pg up" style="margin:10px 0 0">${ic('up', 16)}<span>Próximo treino: <b>+${fmtKg(pg.inc)} kg</b></span></div>` : ''}
      <details><summary>Histórico (${hi.length})</summary>
        <table class="hist">${hi.slice().reverse().map(x => `<tr><td>${fmtDate(x.s.started_at)}</td><td>${esc(setsTxt(x.sets))}<br><span class="mut">vol. ${fmtKg(vol(x.sets))} kg</span></td></tr>`).join('')}</table>
      </details>
    </article>`;
  }
  return h;
}
function renderHist() {
  const all = index().sessions;
  const app = all.filter(s => s.source === 'app');
  const ended = app.filter(s => s.ended_at && s.duration_sec != null);
  const { bySess } = index();
  const totSec = ended.reduce((a, s) => a + s.duration_sec, 0);
  const totVol = app.reduce((a, s) => a + vol(bySess[s.id] || []), 0);
  const totSets = app.reduce((a, s) => a + (bySess[s.id] || []).length, 0);
  let h = `<div class="stats">
    <div class="card stat"><small>Treinos</small><b>${app.length}</b></div>
    <div class="card stat"><small>Tempo total</small><b>${dur(totSec)}</b></div>
    <div class="card stat"><small>Duração média</small><b>${ended.length ? dur(totSec / ended.length) : '—'}</b></div>
    <div class="card stat"><small>Volume total</small><b>${totVol >= 1000 ? fmtKg(round2(totVol / 1000)) + ' t' : fmtKg(totVol) + ' kg'}</b></div>
  </div>`;
  const recent = ended.slice(-12);
  if (recent.length >= 2) {
    const mx = Math.max(...recent.map(s => s.duration_sec)) || 1;
    h += `<div class="card"><div style="padding:14px 14px 0;font-weight:700">Duração dos últimos treinos</div>
      <div class="bars">${recent.map(s => `<div style="height:${Math.max(3, s.duration_sec / mx * 100)}%" title="${fmtDate(s.started_at)} · ${dur(s.duration_sec)}"></div>`).join('')}</div>
      <div class="bars-l">${recent.map(s => `<span>${fmtDate(s.started_at).slice(0, 5)}</span>`).join('')}</div></div>`;
  }
  if (!all.length) return h + `<div class="empty">${ic('history', 40)}<p>Nenhum treino ainda.<br>Inicie seu primeiro treino na aba Treino.</p></div>`;
  h += `<p class="mut" style="font-size:13px;margin:16px 4px 8px">${totSets} séries registradas</p>`;
  for (const s of all.slice().reverse()) {
    const sets = bySess[s.id] || [];
    const isLive = s.id === active?.id;
    const byEx = {};
    for (const x of sets) (byEx[x.exercise_id] ||= []).push(x);
    h += `<details class="card sess-card"><summary><div class="sess-sum">
        <b>${fmtDateLong(s.started_at)} · ${esc(s.day_name || PLANO[s.day_index]?.dia || '')}${SRC[s.source] ? `<span class="tag">${SRC[s.source]}</span>` : ''}${isLive ? '<span class="tag on">em andamento</span>' : ''}</b>
        <span>${s.source !== 'app' ? 'registro manual' : `${fmtTime(s.started_at)} · ${s.ended_at ? dur(s.duration_sec) : 'não finalizado'}`} · ${sets.length} séries · ${fmtKg(vol(sets))} kg</span>
      </div></summary>
      ${Object.keys(byEx).map(id => `<div class="sess-ex"><b>${esc(EX[id] || id)}</b>${byEx[id].map(x => `<span>${fmtKg(x.weight)}kg × ${x.reps ?? '—'}${x.rest_sec != null ? ` <em>⏱${mmss(x.rest_sec)}</em>` : ''}</span>`).join('')}</div>`).join('') || '<p class="mut" style="font-size:14px">Sem séries registradas.</p>'}
      ${isLive ? '' : `<div style="padding:8px 0 14px"><button class="btn sm ghost" data-a="delSess" data-id="${esc(s.id)}" style="color:var(--bad)">${ic('trash', 16)}Excluir treino</button></div>`}
    </details>`;
  }
  return h;
}
function renderCfg() {
  const t = themePref();
  return `<div class="card cfg">
      <h3>Aparência</h3>
      <div class="cfg-row"><label>Tema</label><div class="seg">${[['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<button class="${t === v ? 'on' : ''}" data-a="theme" data-t="${v}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="card cfg">
      <h3>Progressão de carga</h3>
      <div class="cfg-row"><label for="sMax">Reps para subir carga<small>Sugere aumento quando todas as séries atingem esse número</small></label><input id="sMax" class="in" inputmode="numeric" data-s="repMax" value="${settings.repMax}"></div>
      <div class="cfg-row"><label for="sMin">Reps mínimas<small>Abaixo disso, sugere manter ou reduzir</small></label><input id="sMin" class="in" inputmode="numeric" data-s="repMin" value="${settings.repMin}"></div>
      <div class="cfg-row"><label for="sInc">Incremento (kg)<small>Para cargas a partir de ${fmtKg(settings.smallLimit)} kg</small></label><input id="sInc" class="in" inputmode="decimal" data-s="inc" value="${fmtKg(settings.inc)}"></div>
      <div class="cfg-row"><label for="sIncS">Incremento cargas leves (kg)<small>Halteres / cargas abaixo de ${fmtKg(settings.smallLimit)} kg</small></label><input id="sIncS" class="in" inputmode="decimal" data-s="incSmall" value="${fmtKg(settings.incSmall)}"></div>
    </div>
    <div class="card cfg">
      <h3>Descanso</h3>
      <div class="cfg-row"><label for="sAuto">Iniciar descanso ao concluir série<small>O cronômetro começa em 00:00:00 automaticamente</small></label><label class="sw"><input id="sAuto" type="checkbox" data-s="autoRest" ${settings.autoRest ? 'checked' : ''}><span></span></label></div>
    </div>
    <div class="card cfg">
      <h3>Dados</h3>
      <div class="cfg-row"><label>Sincronização<small id="syncTxt">${esc(syncLabel())}</small></label><button class="btn sm ghost" data-a="sync">${ic('refresh', 16)}Sincronizar</button></div>
      <div class="cfg-row"><label>Meus pesos<small>Pesos iniciais e atuais de cada exercício</small></label><button class="btn sm ghost" data-a="weights">${ic('scale', 16)}Editar</button></div>
      <div class="cfg-row"><label>Conta<small>${esc(user.email)} · login salvo até ${loginUntil()}</small></label><button class="btn sm ghost" data-a="logout">${ic('logout', 16)}Sair</button></div>
    </div>`;
}

/* ---------------- timers ---------------- */
function tick() {
  if (!active) return;
  const s = hms((Date.now() - new Date(active.startedAt)) / 1000);
  for (const id of ['sessT', 'chipT', 'sideT']) { const el = document.getElementById(id); if (el) el.textContent = s; }
  const r = document.getElementById('restT');
  if (r && active.rest) r.textContent = hms((Date.now() - active.rest.startedAt) / 1000);
}
setInterval(tick, 500);

async function wake() {
  try {
    if (active && 'wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { }
}
function unwake() { try { wakeLock?.release(); } catch (e) { } wakeLock = null; }

/* ---------------- UI: modal, toast, menu ---------------- */
let modalActs = [];
function modal({ title, body, actions }) {
  modalActs = actions || [{ label: 'OK', cls: 'primary', fn: closeModal }];
  const m = $('#modal');
  m.innerHTML = `<div class="card" role="dialog" aria-modal="true">${title ? `<h2>${title}</h2>` : ''}<div class="body">${body || ''}</div>
    <div class="acts">${modalActs.map((a, i) => `<button class="btn ${a.cls || ''}" data-a="modalAct" data-k="${i}">${a.label}</button>`).join('')}</div></div>`;
  m.hidden = false; document.body.classList.add('lock');
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; if (!$('#side').classList.contains('open')) document.body.classList.remove('lock'); }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
const isDesktop = () => matchMedia('(min-width: 960px)').matches;
function openMenu() { if (isDesktop()) return; $('#side').classList.add('open'); $('#scrim').classList.add('open'); document.body.classList.add('lock'); }
function closeMenu() { $('#side').classList.remove('open'); $('#scrim').classList.remove('open'); if ($('#modal').hidden) document.body.classList.remove('lock'); }

// gesto: arrastar da borda esquerda abre o menu; arrastar para a esquerda fecha
let tx0 = null, ty0 = null;
document.addEventListener('touchstart', e => { const t = e.touches[0]; tx0 = t.clientX; ty0 = t.clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  if (tx0 == null || !user || isDesktop()) return;
  const t = e.changedTouches[0], dx = t.clientX - tx0, dy = Math.abs(t.clientY - ty0);
  const open = $('#side').classList.contains('open');
  if (!open && tx0 < 24 && dx > 60 && dy < 50) openMenu();
  else if (open && dx < -60 && dy < 50) closeMenu();
  tx0 = null;
}, { passive: true });

/* ---------------- eventos ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, i = +el.dataset.i, j = +el.dataset.j;
  switch (a) {
    case 'menu': openMenu(); break;
    case 'closeMenu': closeMenu(); break;
    case 'nav': go(el.dataset.v); break;
    case 'day': day = +el.dataset.d; evoDay = day; go('treino'); break;
    case 'evoDay': evoDay = +el.dataset.d; render(); break;
    case 'start': startSession(); break;
    case 'set': toggleSet(i, j); break;
    case 'add': addSet(i); break;
    case 'rm': rmSet(i); break;
    case 'apply': applyProg(i); break;
    case 'rest': startRest(); break;
    case 'restEnd': endRest(false); break;
    case 'finish': finishSession(); break;
    case 'cancel': discardSession(false); break;
    case 'theme': ls.set(K.theme, el.dataset.t); applyTheme(); render(); break;
    case 'themeToggle': ls.set(K.theme, isDark() ? 'light' : 'dark'); applyTheme(); if (view === 'config') render(); break;
    case 'sync': toast('Sincronizando…'); refresh(); break;
    case 'weights': closeMenu(); openWeights(false); break;
    case 'wDay': W.day = +el.dataset.d; renderWeightsDay(); $('.sheet-b').scrollTo({ top: 0 }); break;
    case 'wCopy': { const x = W.days[W.day][i]; x.c = x.b.map(r => ({ ...r })); renderWeightsDay(); break; }
    case 'wClose': closeWeights(true); break;
    case 'wSave': saveWeights(); break;
    case 'delSess': {
      const id = el.dataset.id;
      modal({
        title: 'Excluir treino?', body: 'Este treino e todas as suas séries serão apagados permanentemente.',
        actions: [{ label: 'Cancelar', fn: closeModal }, { label: 'Excluir', cls: 'danger', fn: () => { closeModal(); removeRow('workout_sessions', id); render(); toast('Treino excluído'); } }]
      });
      break;
    }
    case 'img': {
      const id = el.dataset.id;
      modal({ title: esc(EX[id]), body: `<div style="display:grid;gap:8px"><img src="/img/${esc(id)}_0.jpg" alt=""><img src="/img/${esc(id)}_1.jpg" alt=""></div>`, actions: [{ label: 'Fechar', cls: 'primary', fn: closeModal }] });
      break;
    }
    case 'modalAct': modalActs[+el.dataset.k]?.fn(); break;
    case 'logout': logout(); break;
  }
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !W) closeModal(); });
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset.w || !W) return;
  W.days[W.day][+el.dataset.i][el.dataset.w][+el.dataset.j][el.dataset.wf] = el.value;
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { W ? closeWeights(true) : closeModal(); closeMenu(); }
  if (e.key === 'Enter' && e.target.matches('.in[data-f]')) e.target.blur();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.f) updField(+el.dataset.i, +el.dataset.j, el.dataset.f, el.value);
  else if (el.dataset.s) {
    const k = el.dataset.s;
    let v = el.type === 'checkbox' ? el.checked : (k === 'repMax' || k === 'repMin' ? int(el.value) : num(el.value));
    if (v == null || (typeof v === 'number' && v <= 0)) { toast('Valor inválido'); render(); return; }
    settings[k] = v;
    if (settings.repMin > settings.repMax) settings.repMin = settings.repMax;
    saveSettings({});
    toast('Configuração salva');
  }
});
document.addEventListener('focusin', e => { if (e.target.matches('.in[data-f]')) setTimeout(() => e.target.select?.(), 0); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (user && loginExpired()) return expireLogin(); wake(); tick(); flush(); } });
addEventListener('online', () => { toast('Conexão restabelecida'); flush(); });
addEventListener('resize', setDockH);
setInterval(() => { if (queue.length && sync.s !== 'sync') flush(); }, 30000);

/* ---------------- auth ---------------- */
function renderAuth(msg, kind) {
  const login = authMode === 'login';
  $('#auth').innerHTML = `<div class="auth"><div class="card">
    <div class="brand"><span class="logo">${ic('dumbbell', 20)}</span>Meu Treino</div>
    <h2>${login ? 'Entrar' : 'Criar conta'}</h2>
    <p class="mut" style="margin:0;font-size:14px">Seus treinos ficam salvos na nuvem e sincronizados entre aparelhos.</p>
    <form id="authForm">
      ${msg ? `<p class="msg ${kind || 'err'}">${esc(msg)}</p>` : ''}
      <input name="email" type="email" autocomplete="email" placeholder="E-mail" required>
      <input name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="Senha (mín. 6 caracteres)" minlength="6" required>
      <button class="btn primary big" type="submit">${login ? 'Entrar' : 'Criar conta'}</button>
    </form>
    <button class="swap" id="authSwap">${login ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}</button>
  </div></div>`;
  $('#authSwap').onclick = () => { authMode = login ? 'signup' : 'login'; renderAuth(); };
  $('#authForm').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), email = f.get('email').trim(), password = f.get('password');
    const btn = ev.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Aguarde…';
    try {
      if (login) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        ls.set(K.loginAt, Date.now());
      } else {
        const { data: d, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (d.session) ls.set(K.loginAt, Date.now());
        if (!d.session) { authMode = 'login'; renderAuth('Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.', 'ok'); }
      }
    } catch (err) {
      const m = err.message || '';
      renderAuth(/Invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : /not confirmed/i.test(m) ? 'Confirme seu e-mail pelo link enviado e tente novamente.'
        : /already registered/i.test(m) ? 'Este e-mail já tem conta. Entre com sua senha.' : /fetch/i.test(m) ? 'Sem conexão com o servidor.' : m);
    }
  };
}
function logout() {
  const pend = queue.length;
  modal({
    title: 'Sair da conta?',
    body: pend ? `<b style="color:var(--bad)">Atenção:</b> há ${pend} alteração(ões) ainda não sincronizada(s) que serão perdidas.` : (active ? 'Há um treino em andamento neste aparelho.' : 'Você precisará entrar novamente.'),
    actions: [{ label: 'Cancelar', fn: closeModal }, {
      label: 'Sair', cls: 'danger', fn: async () => {
        closeModal(); await flush();
        queue = []; ls.del(K.queue); ls.del(K.cache); ls.del(K.loginAt); active = null; saveActive(); unwake();
        await sb.auth.signOut();
      }
    }]
  });
}
function loginExpired() { const t = ls.get(K.loginAt, null); return t != null && Date.now() - t > LOGIN_DAYS * 864e5; }
function loginUntil() { const t = ls.get(K.loginAt, Date.now()); return new Date(t + LOGIN_DAYS * 864e5).toLocaleDateString('pt-BR'); }
let authMsg = null;
async function expireLogin() {
  // mantém fila/cache: quando o mesmo usuário entrar de novo, as pendências são enviadas
  authMsg = `Por segurança, entre novamente (o login fica salvo por ${LOGIN_DAYS} dias).`;
  ls.del(K.loginAt);
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { }
  setUser(null);
}
function setUser(u) {
  user = u;
  $('#boot').hidden = true;
  if (!u) {
    $('#app').hidden = true; $('#auth').hidden = false; closeMenu();
    if (W) closeWeights(false);
    renderAuth(authMsg, 'ok'); authMsg = null; return;
  }
  if (ls.get(K.loginAt, null) == null) ls.set(K.loginAt, Date.now());
  if (loginExpired()) { expireLogin(); return; }
  $('#auth').hidden = true; $('#app').hidden = false;
  const c = ls.get(K.cache, null);
  data = c && c.uid === u.id ? c : { uid: u.id, sessions: [], sets: [] };
  if (!(c && c.uid === u.id) && c) { queue = []; ls.set(K.queue, queue); if (active) { active = null; saveActive(); } }
  if (!(c && c.uid === u.id)) autoWeightsShown = false;
  dirty();
  if (active) wake();
  render();
  refresh();
}

/* ---------------- boot ---------------- */
applyTheme();
sb.auth.getSession().then(({ data: d }) => {
  setUser(d.session?.user || null);
  sb.auth.onAuthStateChange((_ev, s) => { const u = s?.user || null; if ((u?.id || null) !== (user?.id || null)) setUser(u); });
}).catch(() => setUser(null));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
})();
