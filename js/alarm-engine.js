// Moteur d'alarmes et de rappels (fonctionne tant que l'application est ouverte),
// sons synthétisés (Web Audio), notifications système et maintien de l'écran allumé.
import * as S from './store.js';
import { nextAlarm, upcomingReminders } from './recur.js';
import { esc, pad, toast } from './utils.js';
import { icon } from './icons.js';

export const SOUNDS = [
  { value: 'classique', label: 'Classique (bip-bip)' },
  { value: 'douce', label: 'Douce (arpège)' },
  { value: 'carillon', label: 'Carillon' },
  { value: 'digitale', label: 'Digitale' },
  { value: 'montee', label: 'Montée progressive' },
  { value: 'marimba', label: 'Marimba' },
];

let ctx = null;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// iOS exige un geste utilisateur pour activer l'audio : on le débloque au premier toucher.
export function unlockAudio() {
  const h = () => {
    try {
      const c = audio();
      const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    } catch { }
    window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', h, true);
  };
  window.addEventListener('pointerdown', h, true); window.addEventListener('keydown', h, true);
}
function tone(c, t, freq, dur, { type = 'sine', vol = 0.3, attack = 0.01, harmonics = [] } = {}) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(c.destination);
  [[freq, 1], ...harmonics].forEach(([f, v]) => {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const gg = c.createGain(); gg.gain.value = v; o.connect(gg); gg.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  });
}
// Joue un motif du son choisi ; renvoie sa durée (s)
function pattern(name, intensity = 1) {
  const c = audio(); const t = c.currentTime + 0.02; const v = 0.25 * intensity;
  switch (name) {
    case 'douce': [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.22, f, 0.6, { vol: v * 0.8, attack: 0.03 })); return 1.8;
    case 'carillon': [1319, 1047, 1175, 784].forEach((f, i) => tone(c, t + i * 0.45, f, 1.4, { vol: v, harmonics: [[f * 2.01, 0.3], [f * 3.02, 0.12]] })); return 2.6;
    case 'digitale': for (let i = 0; i < 4; i++) tone(c, t + i * 0.12, 2000, 0.07, { type: 'square', vol: v * 0.35 }); return 1.0;
    case 'montee': { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(1200, t + 1.2); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 1.4); return 1.8; }
    case 'marimba': [784, 988, 1175, 988, 784, 659].forEach((f, i) => tone(c, t + i * 0.16, f, 0.35, { vol: v, harmonics: [[f * 4, 0.08]] })); return 1.6;
    default: tone(c, t, 880, 0.15, { type: 'square', vol: v * 0.3 }); tone(c, t + 0.25, 880, 0.15, { type: 'square', vol: v * 0.3 }); return 1.0;
  }
}
let loop = null;
// Vibration : motif répété tant que l'alarme ou le rappel sonne (téléphones qui le permettent).
export const VIBRATE_PATTERN = [600, 250, 600, 250, 900];
let vibTimer = null;
export const vibrateSupported = () => 'vibrate' in navigator;
export function startVibration() {
  if (!vibrateSupported() || S.getSettings().vibrate === false) return;
  stopVibration();
  const go = () => { try { navigator.vibrate(VIBRATE_PATTERN); } catch { } };
  go(); vibTimer = setInterval(go, 3500);
}
export function stopVibration() { clearInterval(vibTimer); vibTimer = null; try { navigator.vibrate?.(0); } catch { } }
export function startSound(name) {
  stopSound();
  let n = 0;
  const play = () => { const d = pattern(name, Math.min(1, 0.5 + n * 0.1)); n++; loop = setTimeout(play, (d + 0.6) * 1000); };
  try { play(); } catch { }
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
}
export function stopSound() { clearTimeout(loop); loop = null; }
export function previewSound(name) { try { pattern(name); } catch { } }

/* ---------- Notifications ---------- */
export const notifSupported = () => 'Notification' in window;
export const notifPermission = () => notifSupported() ? Notification.permission : 'unsupported';
export async function requestNotif() {
  if (!notifSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}
export async function notify(title, body, tag) {
  if (notifPermission() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: true, renotify: true, silent: false, vibrate: S.getSettings().vibrate === false ? [] : VIBRATE_PATTERN }); return true; }
    new Notification(title, { body, tag }); return true;
  } catch { return false; }
}

/* ---------- Maintien de l'écran (mode réveil de nuit) ---------- */
let wakeLock = null;
export const wakeSupported = () => 'wakeLock' in navigator;
export const wakeActive = () => !!wakeLock;
export async function toggleWake(on) {
  if (on) {
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { if (!document.hidden) wakeLock = null; }); return true; }
    catch { wakeLock = null; return false; }
  } else { await wakeLock?.release(); wakeLock = null; return false; }
}
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && wakeLock && wakeLock.released) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch { } }
});

/* ---------- Moteur ---------- */
const LS_TICK = 'mlm:lastTick', LS_FIRED = 'mlm:fired';
const MISSED_WINDOW = 15 * 60000; // au-delà de 15 min on signale « manquée » sans sonner
let firing = null;
const queue = [];

function firedSet() { try { return new Set(JSON.parse(localStorage.getItem(LS_FIRED) || '[]')); } catch { return new Set(); } }
function markFired(k) { const s = [...firedSet(), k].slice(-400); localStorage.setItem(LS_FIRED, JSON.stringify(s)); }

export function tick() {
  const now = Date.now();
  let last = Number(localStorage.getItem(LS_TICK)) || now - 1000;
  if (now - last > 3 * 864e5) last = now - 1000;
  localStorage.setItem(LS_TICK, String(now));
  const fired = firedSet();
  const missed = [];
  // Alarmes
  for (const a of S.all('alarms')) {
    const at = nextAlarm(a, new Date(last));
    if (!at || at.getTime() > now) continue;
    const k = `a:${a.id}:${at.getTime()}`;
    if (fired.has(k)) continue;
    markFired(k);
    if (now - at.getTime() > MISSED_WINDOW) { missed.push(`${a.title || 'Alarme'} (${a.time})`); afterAlarm(a); continue; }
    queue.push({ kind: 'alarm', alarm: a, at: at.getTime(), title: a.title || 'Alarme', body: a.description || '', sound: a.sound || S.getSettings().defaultSound });
  }
  // Rappels de tâches / activités (uniquement si les données sont déverrouillées)
  if (S.isUnlocked() || !window.__mlmLocked) {
    for (const r of upcomingReminders(last + 1, now)) {
      if (fired.has(r.key)) continue;
      markFired(r.key);
      if (now - r.at > MISSED_WINDOW) { missed.push(r.title); continue; }
      queue.push({ ...r, sound: 'douce' });
    }
  }
  if (missed.length) toast(`Rappel(s) manqué(s) pendant que l'app était fermée : ${missed.slice(0, 3).join(', ')}${missed.length > 3 ? '…' : ''}`, { timeout: 9000, type: 'warn' });
  if (!firing && queue.length) ring(queue.shift());
}
async function afterAlarm(a) {
  const ch = { snoozeUntil: null };
  if (!a.days?.length) ch.enabled = false; // alarme unique
  await S.patch('alarms', a.id, ch);
}

function ring(item) {
  firing = item;
  const d = new Date(item.at);
  const ov = document.createElement('div');
  ov.className = 'ring-overlay';
  ov.innerHTML = `
    <div class="ring-card">
      <div class="ring-icon">${icon(item.kind === 'alarm' ? 'alarm' : 'bell')}</div>
      <div class="ring-time">${pad(d.getHours())}:${pad(d.getMinutes())}</div>
      <div class="ring-title">${esc(item.title)}</div>
      ${item.body ? `<div class="ring-body">${esc(item.body)}</div>` : ''}
      <div class="ring-actions">
        <button class="btn btn-lg" data-snooze>${icon('clock')} Reporter ${S.getSettings().snooze} min</button>
        <button class="btn btn-lg btn-primary" data-stop>${icon('check')} ${item.kind === 'alarm' ? 'Arrêter' : 'OK'}</button>
      </div>
    </div>`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  startSound(item.sound);
  startVibration();
  if (document.hidden) notify(item.title, item.body || (item.kind === 'alarm' ? 'Alarme' : 'Rappel'), item.key || item.alarm?.id);
  const finish = async snooze => {
    stopSound();
    stopVibration();
    ov.remove();
    const mins = S.getSettings().snooze || 10;
    firing = null;
    if (item.test) { if (snooze) toast(`En situation réelle, l'alarme resonnerait dans ${mins} min.`); }
    else if (item.kind === 'alarm') {
      if (snooze) await S.patch('alarms', item.alarm.id, { snoozeUntil: Date.now() + mins * 60000 });
      else await afterAlarm(item.alarm);
      S.log(snooze ? 'Alarme reportée' : 'Alarme arrêtée', item.title, { type: 'alarm' });
    } else if (snooze) {
      snoozedReminders.push({ ...item, at: Date.now() + mins * 60000 });
    }
    if (queue.length) setTimeout(() => ring(queue.shift()), 400);
  };
  ov.querySelector('[data-snooze]').onclick = () => finish(true);
  ov.querySelector('[data-stop]').onclick = () => finish(false);
}
const snoozedReminders = [];
function checkSnoozedReminders() {
  const now = Date.now();
  for (let i = snoozedReminders.length - 1; i >= 0; i--) {
    if (snoozedReminders[i].at <= now) { queue.push(snoozedReminders.splice(i, 1)[0]); }
  }
  if (!firing && queue.length) ring(queue.shift());
}
export function startEngine() {
  tick();
  setInterval(() => { tick(); checkSnoozedReminders(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'focus') window.focus(); });
}
export function testRing(sound) {
  ring({ kind: 'alarm', alarm: { id: '__test', days: [1] }, at: Date.now(), title: 'Test de sonnerie', body: 'Ceci est un essai.', sound, test: true });
}
