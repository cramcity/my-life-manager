// Notifications « push » : l'iPhone est prévenu même quand l'app est fermée ou le téléphone verrouillé.
// Fonctionnement : l'app prépare à l'avance les notifications des 7 prochains jours (alarmes, rappels, résumé
// des tâches du jour), les CHIFFRE pour chacun de vos appareils (norme Web Push, RFC 8291) et les dépose sur le
// serveur. Une fonction Supabase les envoie à l'heure prévue. Le serveur ne peut pas lire leur contenu.
import * as S from './store.js';
import * as Sync from './sync.js';
import { CLOUD } from './config.js';
import { nextAlarm, upcomingReminders } from './recur.js';
import { debounce, ymd, todayStr, addDays } from './utils.js';

const FN = CLOUD.url + '/functions/v1/push';
const DAYS = 7, MAX = 300;
const LS_ON = 'mlm:pushEndpoint';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushOnHere = () => { try { return !!localStorage.getItem(LS_ON); } catch { return false; } };

/* ---------- base64url ---------- */
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
const te = new TextEncoder();

/* ---------- Chiffrement Web Push (RFC 8291, aes128gcm) ---------- */
async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}
export async function encryptPush(sub, obj) {
  const uaPub = b64u.dec(sub.p256dh), auth = b64u.dec(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(te.encode(JSON.stringify(obj)), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return b64(cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct));
}

/* ---------- Abonnement de cet appareil ---------- */
async function publicKey() {
  const r = await fetch(FN, { headers: { apikey: CLOUD.key } });
  if (!r.ok) throw new Error('Service de notifications indisponible (' + r.status + ').');
  return (await r.json()).publicKey;
}
export async function enablePush() {
  if (!pushSupported()) throw new Error("Notifications non prises en charge ici. Sur iPhone : installez l'app sur l'écran d'accueil (iOS 16.4 ou plus récent) et ouvrez-la depuis son icône.");
  if (!Sync.isLoggedIn()) throw new Error('Connectez-vous à votre profil pour activer les notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? "Notifications refusées. Réactivez-les dans Réglages de l'iPhone › Notifications › My Life." : 'Autorisation non accordée.');
  const reg = await navigator.serviceWorker.ready;
  const pk = await publicKey();
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const cur = sub.options?.applicationServerKey;
    if (cur && b64u.enc(cur) !== pk) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u.dec(pk) });
  const j = sub.toJSON();
  await Sync.cloud('/rest/v1/push_subs?on_conflict=endpoint', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { user_id: Sync.getConfig().userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName() },
  });
  try { localStorage.setItem(LS_ON, j.endpoint); } catch { }
  await reschedule();
  return true;
}
export async function disablePush() {
  const ep = (() => { try { return localStorage.getItem(LS_ON); } catch { return null; } })();
  try { localStorage.removeItem(LS_ON); } catch { }
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { }
  if (ep && Sync.isLoggedIn()) await Sync.cloud(`/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(ep)}`, { method: 'DELETE' }).catch(() => { });
}
function deviceName() {
  const u = navigator.userAgent;
  return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'PC Windows' : 'Appareil';
}

/** Envoie tout de suite une notification de test à tous vos appareils abonnés. */
export async function testPush() {
  const subs = await Sync.cloud('/rest/v1/push_subs?select=id,p256dh,auth');
  if (!subs?.length) throw new Error("Aucun appareil abonné. Activez d'abord les notifications sur l'iPhone.");
  const at = new Date(Date.now() - 1000).toISOString();
  const rows = [];
  for (const s of subs) rows.push({ user_id: Sync.getConfig().userId, sub_id: s.id, fire_at: at, payload: await encryptPush(s, { title: 'My Life Manager', body: 'Les notifications fonctionnent ✅ (même app fermée)', tag: 'test-' + Date.now(), url: './#/alarmes' }) });
  await Sync.cloud('/rest/v1/push_queue', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: rows });
  const r = await fetch(FN, { method: 'POST', headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' }, body: '{}' });
  const j = await r.json().catch(() => ({}));
  return { devices: subs.length, sent: j.sent ?? 0 };
}

/* ---------- Programme des 7 prochains jours ---------- */
function plan() {
  const now = Date.now(), end = now + DAYS * 864e5, items = [];
  for (const a of S.all('alarms')) {
    if (!a.enabled) continue;
    const item = at => ({ at, title: `⏰ ${a.title || 'Alarme'} — ${a.time}`, body: a.description || 'Alarme', tag: a.id, url: './#/alarmes' });
    const snoozed = a.snoozeUntil && a.snoozeUntil > now;
    if (snoozed) items.push(item(a.snoozeUntil));
    if (!a.days?.length && snoozed) continue; // alarme unique déjà reportée
    const base = { ...a, snoozeUntil: null };
    let from = new Date(now);
    for (let n = 0; n < 16; n++) {
      const at = nextAlarm(base, from);
      if (!at || at.getTime() > end) break;
      items.push(item(at.getTime()));
      if (!a.days?.length) break; // alarme unique : une seule fois
      from = new Date(at.getTime() + 60000);
    }
  }
  for (const r of upcomingReminders(now, end)) {
    items.push({ at: r.at, title: `${r.kind === 'task' ? '📌' : '📅'} ${r.title}`, body: r.body, tag: r.key, url: r.kind === 'task' ? './#/taches' : './#/agenda' });
  }
  // Résumé du matin : tâches prévues ce jour-là (et en retard)
  const st = S.getSettings();
  if (st.pushDigest !== false) {
    const [h, m] = (st.digestTime || '08:00').split(':').map(Number);
    for (let i = 0; i <= DAYS; i++) {
      const d = addDays(new Date(new Date().setHours(0, 0, 0, 0)), i); d.setHours(h, m, 0, 0);
      if (d.getTime() <= now || d.getTime() > end) continue;
      const day = ymd(d);
      const due = S.all('tasks').filter(t => t.status !== 'done' && t.dueDate === day);
      const late = i === 0 ? S.all('tasks').filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr()).length : 0;
      if (!due.length && !late) continue;
      const names = due.slice(0, 4).map(t => t.title).join(', ') + (due.length > 4 ? '…' : '');
      items.push({ at: d.getTime(), title: `📋 ${due.length} tâche${due.length > 1 ? 's' : ''} aujourd'hui${late ? ` · ${late} en retard` : ''}`, body: names || 'Pensez à vos tâches en retard.', tag: 'digest-' + day, url: './#/taches' });
    }
  }
  return items.sort((a, b) => a.at - b.at).slice(0, MAX);
}

let running = false, pending = false;
export async function reschedule() {
  if (!Sync.isLoggedIn()) return;
  if (running) { pending = true; return; }
  running = true;
  try {
    const subs = await Sync.cloud('/rest/v1/push_subs?select=id,p256dh,auth');
    await Sync.cloud('/rest/v1/push_queue?sent=eq.false', { method: 'DELETE' });
    if (!subs?.length) return;
    const uid = Sync.getConfig().userId, rows = [];
    for (const it of plan()) for (const s of subs) {
      rows.push({ user_id: uid, sub_id: s.id, fire_at: new Date(it.at).toISOString(), payload: await encryptPush(s, { title: it.title, body: it.body, tag: it.tag, url: it.url }) });
    }
    for (let i = 0; i < rows.length; i += 100) await Sync.cloud('/rest/v1/push_queue', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: rows.slice(i, i + 100) });
  } catch (e) { console.warn('Programmation des notifications :', e.message); }
  finally { running = false; if (pending) { pending = false; setTimeout(reschedule, 1000); } }
}
const later = debounce(() => reschedule(), 6000);
export function initPush() {
  S.onChange(col => { if (col !== 'history') later(); });
  if (Sync.isLoggedIn()) later();
}
