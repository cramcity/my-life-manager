// Stockage persistant : IndexedDB + cache mémoire + chiffrement AES-GCM optionnel.
import { uid, todayStr } from './utils.js';

const DB_NAME = 'my-life-manager';
export const COLS = ['notes', 'notebooks', 'tasks', 'events', 'alarms', 'projects', 'goals', 'timelogs', 'learnings', 'reviews', 'history'];
// Les alarmes restent lisibles même verrouillé pour pouvoir sonner sur l'écran de verrouillage de l'app.
const PLAIN = new Set(['alarms']);

export const CATEGORY_COLORS = ['#6366f1', '#0ea5e9', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#ec4899', '#64748b', '#14b8a6', '#a855f7'];
export const DEFAULT_SETTINGS = {
  name: '',
  theme: 'auto',
  accent: 'bleu',
  autoLock: 5,
  snooze: 10,
  defaultSound: 'classique',
  lastBackup: null,
  backupReminderDays: 7,
  shortcutAlarm: 'MLM Alarme',
  shortcutReminder: 'MLM Rappel',
  timer: null, // {projectId, start}
  categories: [
    { id: 'perso', name: 'Personnel', color: '#6366f1' },
    { id: 'travail', name: 'Travail', color: '#0ea5e9' },
    { id: 'formation', name: 'Formation', color: '#8b5cf6' },
    { id: 'sport', name: 'Sport', color: '#10b981' },
    { id: 'sante', name: 'Santé', color: '#ef4444' },
    { id: 'rdv', name: 'Rendez-vous', color: '#f59e0b' },
    { id: 'creation', name: 'Création', color: '#ec4899' },
    { id: 'autre', name: 'Autre', color: '#64748b' },
  ],
  noteCategories: ['À ne pas oublier', 'Idées', 'Personnel', 'Travail', 'Formation', 'Journal'],
  updatedAt: 0,
};

let db = null;
let key = null;
const data = {};
COLS.forEach(c => data[c] = new Map());
let settings = { ...DEFAULT_SETTINGS };
const listeners = new Set();
let writeHook = null;

/* ---------- Crypto ---------- */
const te = new TextEncoder(), td = new TextDecoder();
export const b64 = u8 => { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
export const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(k, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
export async function decrypt(k, e) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(e.iv) }, k, ub64(e.ct));
  return JSON.parse(td.decode(pt));
}
// Chiffrement autonome par mot de passe (sauvegardes, synchro)
export async function encryptWithPassword(pass, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await deriveKey(pass, salt);
  return { v: 1, salt: b64(salt), ...(await encrypt(k, obj)) };
}
export async function decryptWithPassword(pass, blob) {
  const k = await deriveKey(pass, ub64(blob.salt));
  return decrypt(k, blob);
}

/* ---------- IndexedDB ---------- */
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);

export async function openDB() {
  if (db) return db;
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    const d = r.result;
    for (const c of COLS) if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' });
    if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
  };
  db = await req(r);
  return db;
}
export async function metaGet(k) { if (!db) return undefined; const r = await req(tx('meta').get(k)); return r ? r.v : undefined; }
export async function metaSet(k, v) { await req(tx('meta', 'readwrite').put({ k, v })); }
export async function metaDel(k) { await req(tx('meta', 'readwrite').delete(k)); }
// Données sensibles (identifiants de synchro) : chiffrées si le verrouillage est actif
export async function secureGet(k) {
  const v = await metaGet('s:' + k);
  if (v && v.__enc) { if (!key) return undefined; try { return await decrypt(key, v.__enc); } catch { return undefined; } }
  return v;
}
export async function secureSet(k, v) { await metaSet('s:' + k, key ? { __enc: await encrypt(key, v) } : v); }

async function persist(col, rec) {
  const v = (key && !PLAIN.has(col)) ? { id: rec.id, enc: await encrypt(key, rec) } : rec;
  await req(tx(col, 'readwrite').put(v));
}

/* ---------- Verrouillage ---------- */
export async function lockInfo() { return metaGet('lock'); }
export const isUnlocked = () => !!key;
export async function unlock(pass) {
  const lock = await metaGet('lock');
  if (!lock) return true;
  try {
    const k = await deriveKey(pass, ub64(lock.salt));
    if ((await decrypt(k, lock.check)) !== 'ok') return false;
    key = k; return true;
  } catch { return false; }
}
async function rewriteAll() {
  for (const c of COLS) for (const rec of data[c].values()) await persist(c, rec);
  await metaSet('settings', settings);
}
export async function enableLock(pass) {
  const sync = await secureGet('sync');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  key = await deriveKey(pass, salt);
  await metaSet('lock', { salt: b64(salt), check: await encrypt(key, 'ok') });
  await rewriteAll();
  if (sync) await secureSet('sync', sync);
}
export async function disableLock() {
  const sync = await secureGet('sync');
  key = null;
  await metaDel('lock');
  await rewriteAll();
  if (sync) await secureSet('sync', sync);
}

/* ---------- Chargement ---------- */
async function loadCol(c) {
  const recs = await req(tx(c).getAll());
  data[c].clear();
  for (const r of recs) {
    let o = r;
    if (r.enc) { if (!key) continue; try { o = await decrypt(key, r.enc); } catch { continue; } }
    data[c].set(o.id, o);
  }
}
export async function loadPlain() {
  for (const c of PLAIN) await loadCol(c);
  settings = { ...DEFAULT_SETTINGS, ...(await metaGet('settings') || {}) };
}
export async function loadAll() {
  for (const c of COLS) await loadCol(c);
  settings = { ...DEFAULT_SETTINGS, ...(await metaGet('settings') || {}) };
  // Purge des suppressions de plus de 90 jours et de l'historique trop ancien
  const limit = Date.now() - 90 * 864e5;
  for (const c of COLS) for (const [id, r] of data[c]) if (r.deleted && r.updatedAt < limit) { data[c].delete(id); req(tx(c, 'readwrite').delete(id)); }
  const hist = [...data.history.values()].sort((a, b) => b.ts - a.ts);
  for (const h of hist.slice(3000)) { data.history.delete(h.id); req(tx('history', 'readwrite').delete(h.id)); }
}

/* ---------- API de données ---------- */
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (col, source = 'local') => listeners.forEach(f => f(col, source));
export const setWriteHook = fn => writeHook = fn;

export const all = col => [...data[col].values()].filter(x => !x.deleted);
export const get = (col, id) => { const x = data[col].get(id); return x && !x.deleted ? x : null; };
export const raw = col => [...data[col].values()];

export async function put(col, obj, { silent = false, ts } = {}) {
  const now = ts || Date.now();
  const prev = obj.id ? data[col].get(obj.id) : null;
  const rec = { ...(prev || {}), ...obj, id: obj.id || uid(), createdAt: prev?.createdAt || obj.createdAt || now, updatedAt: now };
  delete rec.deleted;
  data[col].set(rec.id, rec);
  if (!silent) emit(col);
  await persist(col, rec);
  if (col !== 'history' && !ts) writeHook?.(); // les éléments de départ (ts fourni) existent déjà dans le compte : rien à envoyer
  return rec;
}
export const patch = (col, id, changes, opts) => put(col, { ...get(col, id), ...changes, id }, opts);
export async function remove(col, id) {
  const rec = { id, deleted: true, updatedAt: Date.now() };
  data[col].set(id, rec);
  emit(col);
  await persist(col, rec);
  writeHook?.();
}
export function log(action, label, { type = '', projectId = null } = {}) {
  return put('history', { id: uid(), ts: Date.now(), day: todayStr(), action, label, type, projectId });
}

export const getSettings = () => settings;
export async function setSettings(changes, { silent = false } = {}) {
  settings = { ...settings, ...changes, updatedAt: Date.now() };
  await metaSet('settings', settings);
  if (!silent) emit('settings');
  writeHook?.();
  return settings;
}

/* ---------- Export / import / fusion ---------- */
export function exportData() {
  const out = {};
  COLS.forEach(c => out[c] = raw(c));
  return { app: 'my-life-manager', version: 1, exportedAt: new Date().toISOString(), settings, data: out };
}
// Fusion « dernière modification gagnante » par élément (gère les suppressions).
export async function mergeData(payload, { replace = false } = {}) {
  if (!payload || payload.app !== 'my-life-manager' || !payload.data) throw new Error('Fichier non reconnu');
  let changed = 0;
  if (replace) {
    for (const c of COLS) { await req(tx(c, 'readwrite').clear()); data[c].clear(); }
  }
  for (const c of COLS) {
    for (const rec of payload.data[c] || []) {
      if (!rec || !rec.id) continue;
      const local = data[c].get(rec.id);
      if (!local || (rec.updatedAt || 0) > (local.updatedAt || 0)) {
        data[c].set(rec.id, rec); await persist(c, rec); changed++;
      }
    }
  }
  if (payload.settings && (replace || (payload.settings.updatedAt || 0) > (settings.updatedAt || 0))) {
    settings = { ...DEFAULT_SETTINGS, ...payload.settings };
    await metaSet('settings', settings);
    changed++;
  }
  if (changed) emit('*', 'remote');
  return changed;
}
export async function wipeAll() {
  for (const c of COLS) { await req(tx(c, 'readwrite').clear()); data[c].clear(); }
  await req(tx('meta', 'readwrite').clear());
  key = null;
}

/* ---------- Données initiales ---------- */
// Identifiants fixes et date très ancienne (ts: 1) : sur un nouvel appareil, la version enregistrée dans le compte
// gagne toujours lors de la fusion, et les éléments de départ ne sont jamais dupliqués.
export async function seedIfNeeded() {
  if (await metaGet('seeded')) return;
  const o = { silent: true, ts: 1 };
  const nb = [['seed-nb-general', 'Général', '#2563eb'], ['seed-nb-journal', 'Journal', '#10b981'], ['seed-nb-idees', 'Idées', '#f59e0b']];
  for (const [id, name, color] of nb) if (!data.notebooks.has(id)) await put('notebooks', { id, name, color }, o);
  if (!data.notes.has('seed-note-welcome')) await put('notes', {
    id: 'seed-note-welcome',
    title: 'Bienvenue dans My Life Manager',
    content: "Cette note est dans la catégorie « À ne pas oublier ».\n\n## Pour bien démarrer\n- [ ] Installer l'application sur l'iPhone (menu Guide iPhone)\n- [ ] Configurer les raccourcis iPhone pour des alarmes fiables\n- [ ] Créer mes projets\n- [ ] Activer le code de verrouillage (facultatif)\n\nAstuce : utilisez « - [ ] » pour créer une case à cocher et « - » pour une liste.",
    notebookId: 'seed-nb-general', category: 'À ne pas oublier', pinned: true,
  }, o);
  if (!data.alarms.has('seed-alarm-reveil')) await put('alarms', { id: 'seed-alarm-reveil', time: '07:00', days: [1, 2, 3, 4, 5], title: 'Réveil', description: 'Bonne journée !', sound: 'classique', enabled: false }, o);
  await metaSet('seeded', true);
}
// Idées de projets proposées à chacun (génériques) : chaque personne crée ensuite ses propres espaces.
export const PROJECT_SUGGESTIONS = [
  { name: 'Travail', kind: 'projet', color: '#0ea5e9', emoji: '💼', description: 'Missions, réunions et dossiers en cours.' },
  { name: 'Études / formation', kind: 'formation', color: '#8b5cf6', emoji: '🎓', description: 'Cours, devoirs, révisions et ce que j\'apprends.' },
  { name: 'Sport', kind: 'projet', color: '#10b981', emoji: '💪', description: 'Séances, programme et objectifs physiques.' },
  { name: 'Santé', kind: 'projet', color: '#ef4444', emoji: '❤️', description: 'Rendez-vous, traitements et bien-être.' },
  { name: 'Finances', kind: 'projet', color: '#f59e0b', emoji: '💰', description: 'Budget, factures et épargne.' },
  { name: 'Maison', kind: 'projet', color: '#64748b', emoji: '🏠', description: 'Courses, ménage, travaux et démarches.' },
  { name: 'Projet personnel', kind: 'projet', color: '#ec4899', emoji: '✨', description: 'Un projet qui me tient à cœur.' },
  { name: 'Recherche d\'emploi', kind: 'projet', color: '#14b8a6', emoji: '🔎', description: 'Candidatures, relances et entretiens.' },
  { name: 'Voyage', kind: 'projet', color: '#a855f7', emoji: '✈️', description: 'Préparatifs, réservations et idées.' },
];
export const hasRealData = () => COLS.some(c => c !== 'history' && raw(c).some(r => !String(r.id).startsWith('seed-')));
