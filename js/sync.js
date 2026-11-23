// Synchronisation ordinateur ⇄ iPhone via Supabase (offre gratuite).
// Les données sont chiffrées de bout en bout AVANT l'envoi : le serveur ne voit qu'un bloc illisible.
import * as S from './store.js';
import { debounce } from './utils.js';

let cfg = null;      // {url, anonKey, email, accessToken, refreshToken, expiresAt, userId, passphrase, lastSync}
let busy = false;
let status = { state: 'off', msg: 'Non configurée' };
const statusListeners = new Set();
export const onSyncStatus = f => { statusListeners.add(f); return () => statusListeners.delete(f); };
const setStatus = (state, msg) => { status = { state, msg, at: Date.now() }; statusListeners.forEach(f => f(status)); };
export const getStatus = () => status;
export const getConfig = () => cfg;

export async function initSync() {
  cfg = (await S.secureGet('sync')) || null;
  if (cfg?.accessToken) {
    setStatus('idle', 'Prête');
    S.setWriteHook(autoPush);
    syncNow().catch(() => { });
    setInterval(() => { if (!document.hidden) syncNow().catch(() => { }); }, 5 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow().catch(() => { }); });
    window.addEventListener('online', () => syncNow().catch(() => { }));
  }
}
const autoPush = debounce(() => syncNow().catch(() => { }), 4000);
async function save() { await S.secureSet('sync', cfg); }

const base = u => u.replace(/\/+$/, '');
async function api(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const h = { apikey: cfg.anonKey, 'Content-Type': 'application/json', ...headers };
  if (auth) h.Authorization = `Bearer ${cfg.accessToken}`;
  const r = await fetch(base(cfg.url) + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { }
  if (!r.ok) { const e = new Error(j?.msg || j?.error_description || j?.message || j?.error || `Erreur ${r.status}`); e.status = r.status; throw e; }
  return j;
}
function applySession(j) {
  cfg.accessToken = j.access_token; cfg.refreshToken = j.refresh_token;
  cfg.expiresAt = Date.now() + (j.expires_in || 3600) * 1000 - 60000;
  cfg.userId = j.user?.id || cfg.userId;
}
async function ensureToken() {
  if (cfg.expiresAt > Date.now()) return;
  const j = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: cfg.refreshToken } });
  applySession(j); await save();
}

export async function connect({ url, anonKey, email, password, passphrase, signup }) {
  cfg = { url: url.trim(), anonKey: anonKey.trim(), email: email.trim(), passphrase, lastSync: 0 };
  if (signup) {
    const j = await api('/auth/v1/signup', { method: 'POST', auth: false, body: { email: cfg.email, password } });
    if (!j?.access_token) { cfg = null; throw new Error("Compte créé. Confirmez l'e-mail reçu (ou désactivez « Confirm email » dans Supabase), puis connectez-vous."); }
    applySession(j);
  } else {
    applySession(await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: cfg.email, password } }));
  }
  await save();
  S.setWriteHook(autoPush);
  await syncNow();
}
export async function disconnect() {
  cfg = null; S.setWriteHook(null);
  await S.secureSet('sync', null);
  setStatus('off', 'Non configurée');
}

export async function syncNow() {
  if (!cfg?.accessToken || busy) return;
  if (!navigator.onLine) { setStatus('offline', 'Hors connexion — synchronisation au retour du réseau'); return; }
  busy = true; setStatus('syncing', 'Synchronisation…');
  try {
    await ensureToken();
    const rows = await api(`/rest/v1/vaults?select=data,updated_at&user_id=eq.${cfg.userId}`);
    if (rows?.length) {
      let remote;
      try { remote = await S.decryptWithPassword(cfg.passphrase, JSON.parse(rows[0].data)); }
      catch { throw new Error('Phrase secrète de synchronisation incorrecte pour les données en ligne.'); }
      await S.mergeData(remote);
    }
    const blob = await S.encryptWithPassword(cfg.passphrase, S.exportData());
    await api('/rest/v1/vaults?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: cfg.userId, data: JSON.stringify(blob), updated_at: new Date().toISOString() } });
    cfg.lastSync = Date.now(); await save();
    setStatus('ok', 'Synchronisé');
  } catch (e) {
    setStatus('error', e.message || 'Échec de la synchronisation');
    throw e;
  } finally { busy = false; }
}

export const SETUP_SQL = `create table if not exists public.vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
create policy "Chacun son coffre" on public.vaults
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;
