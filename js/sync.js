// Comptes personnels et synchronisation (Supabase, offre gratuite).
// Chaque personne a son profil (e-mail + mot de passe). Ses données sont chiffrées de bout en bout
// avec une clé tirée de son mot de passe AVANT l'envoi : le serveur ne voit qu'un bloc illisible.
import * as S from './store.js';
import { debounce } from './utils.js';
import { CLOUD } from './config.js';

let cfg = null;      // {email, accessToken, refreshToken, expiresAt, userId, passphrase, lastSync}
let busy = false, again = false, loops = false;
let status = { state: 'off', msg: 'Non connecté' };
const statusListeners = new Set();
export const onSyncStatus = f => { statusListeners.add(f); return () => statusListeners.delete(f); };
const setStatus = (state, msg) => { status = { state, msg, at: Date.now() }; statusListeners.forEach(f => f(status)); };
export const getStatus = () => status;
export const getConfig = () => cfg;
export const isLoggedIn = () => !!cfg?.accessToken;

export async function initSync() {
  cfg = (await S.secureGet('sync')) || null;
  if (cfg && !cfg.accessToken) cfg = null;
  if (cfg) { setStatus('idle', 'Prête'); startLoops(); syncNow().catch(() => { }); }
}
function startLoops() {
  S.setWriteHook(autoPush);
  if (loops) return; loops = true;
  setInterval(() => { if (!document.hidden) syncNow().catch(() => { }); }, 3 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow().catch(() => { }); });
  window.addEventListener('online', () => syncNow().catch(() => { }));
}
const autoPush = debounce(() => syncNow().catch(() => { }), 3000);
async function save() { await S.secureSet('sync', cfg); }

async function api(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const h = { apikey: CLOUD.key, 'Content-Type': 'application/json', ...headers };
  if (auth) h.Authorization = `Bearer ${cfg.accessToken}`;
  let r;
  try { r = await fetch(CLOUD.url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Pas de connexion Internet. Réessayez quand vous êtes connecté.'); }
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { }
  if (!r.ok) {
    const raw = j?.msg || j?.error_description || j?.message || j?.error || '';
    const e = new Error(frenchError(raw, j?.error_code || j?.code, r.status)); e.status = r.status; throw e;
  }
  return j;
}
// Message volontairement neutre : l'app ne révèle jamais si une adresse e-mail possède déjà un profil.
const GENERIC_SIGNUP = 'Impossible de créer un profil avec ces informations. Si vous avez déjà un profil, utilisez « Se connecter ».';
function frenchError(msg, code, status) {
  const m = (msg || '').toLowerCase();
  if (code === 'invalid_credentials' || m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (code === 'user_already_exists' || m.includes('already registered')) return GENERIC_SIGNUP;
  if (code === 'weak_password' || m.includes('password should')) return 'Mot de passe trop faible : 8 caractères minimum.';
  if (code === 'email_address_invalid' || m.includes('invalid format') || m.includes('email address')) return 'Adresse e-mail invalide.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) return 'Trop de tentatives. Patientez une minute puis réessayez.';
  if (status === 401 || code === 'refresh_token_not_found' || m.includes('refresh token')) return 'Session expirée : reconnectez-vous (Réglages › Mon profil).';
  if (status >= 500 || status === 503 || status === 540) return 'Le serveur est momentanément indisponible. Vos données restent sur l\'appareil ; réessayez plus tard.';
  return msg || `Erreur ${status}`;
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

// La clé de chiffrement est dérivée du mot de passe : le mot de passe lui-même n'est jamais enregistré.
async function derivePassphrase(email, password) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('my-life-manager:' + email.toLowerCase()), iterations: 150000 }, base, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

/** Crée un profil (signup) ou se connecte. Ne synchronise pas : l'appelant appelle syncNow(). */
export async function connect({ email, password, signup }) {
  let existing = !signup;
  email = email.trim().toLowerCase();
  const prev = cfg;
  cfg = { email, lastSync: 0 };
  try {
    if (signup) {
      let j = null; existing = false;
      try { j = await api('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } }); }
      catch (e) {
        if (e.message !== GENERIC_SIGNUP) throw e;
        // Profil existant : si le mot de passe est le bon, c'est son propriétaire → on le connecte simplement
        try { j = await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }); existing = true; }
        catch { throw new Error(GENERIC_SIGNUP); }
      }
      if (!j?.access_token) throw new Error(GENERIC_SIGNUP);
      applySession(j);
    } else {
      applySession(await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }));
    }
  } catch (e) { cfg = prev; throw e; }
  cfg.passphrase = await derivePassphrase(email, password);
  await save();
  startLoops();
  return { existing };
}
export async function disconnect() {
  cfg = null; S.setWriteHook(null);
  await S.secureSet('sync', null);
  setStatus('off', 'Non connecté');
}

export async function syncNow() {
  if (!cfg?.accessToken) return;
  if (busy) { again = true; return; }
  if (!navigator.onLine) { setStatus('offline', 'Hors connexion — envoi au retour du réseau'); return; }
  busy = true; setStatus('syncing', 'Synchronisation…');
  try {
    await ensureToken();
    const rows = await api(`/rest/v1/vaults?select=data,updated_at&user_id=eq.${cfg.userId}`);
    if (rows?.length) {
      let remote;
      try { remote = await S.decryptWithPassword(cfg.passphrase, JSON.parse(rows[0].data)); }
      catch { throw new Error('Impossible de déchiffrer les données du compte.'); }
      await S.mergeData(remote);
    }
    const blob = await S.encryptWithPassword(cfg.passphrase, S.exportData());
    await api('/rest/v1/vaults?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: cfg.userId, data: JSON.stringify(blob), updated_at: new Date().toISOString() } });
    cfg.lastSync = Date.now(); await save();
    setStatus('ok', 'Synchronisé');
  } catch (e) {
    if (e.status === 401 || e.status === 400 && /session/i.test(e.message)) setStatus('error', 'Session expirée — reconnectez-vous');
    else setStatus(navigator.onLine ? 'error' : 'offline', e.message || 'Échec de la synchronisation');
    throw e;
  } finally {
    busy = false;
    if (again) { again = false; setTimeout(() => syncNow().catch(() => { }), 500); }
  }
}
