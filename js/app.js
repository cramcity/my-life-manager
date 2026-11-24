// Point d'entrée : démarrage, verrouillage, navigation, interface générale.
import * as S from './store.js';
import { $, esc, pad, toast, openModal, debounce, isIOS, isStandalone, todayStr } from './utils.js';
import { icon } from './icons.js';
import { applyTheme } from './theme.js';
import { startEngine, unlockAudio } from './alarm-engine.js';
import { initSync, onSyncStatus, isLoggedIn } from './sync.js';
import { authScreen } from './auth.js';
import { initPush } from './push.js';
import { editTask, editEvent, editAlarm, newNote, stopTimer } from './editors.js';
import dashboard from './views/dashboard.js';
import calendar from './views/calendar.js';
import tasks from './views/tasks.js';
import notes from './views/notes.js';
import alarms from './views/alarms.js';
import projects from './views/projects.js';
import progress from './views/progress.js';
import settings from './views/settings.js';
import guide from './views/guide.js';
import receive from './views/receive.js';

const ROUTES = { '': dashboard, agenda: calendar, taches: tasks, notes, alarmes: alarms, projets: projects, suivi: progress, reglages: settings, guide, recevoir: receive };
const NAV = [
  ['', 'Accueil', 'home'], ['agenda', 'Agenda', 'calendar'], ['taches', 'Tâches', 'tasks'], ['notes', 'Notes', 'notes'],
  ['alarmes', 'Alarmes', 'alarm'], ['projets', 'Projets', 'folder'], ['suivi', 'Suivi', 'chart'], ['reglages', 'Réglages', 'settings'], ['guide', 'Guide iPhone', 'phone'],
];
const TABBAR = ['', 'agenda', 'taches', 'notes'];

let current = null, currentKey = '', pendingRerender = false;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [pathAndQuery, anchor] = h.split('#');
  const [path, query] = pathAndQuery.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, key: parts[0] || '', params: new URLSearchParams(query || ''), anchor };
}

async function route({ keepScroll = false } = {}) {
  const { parts, key, params, anchor } = parseHash();
  const view = ROUTES[key] || dashboard;
  const main = $('#view');
  const scroller = document.scrollingElement;
  const y = scroller.scrollTop;
  const sameView = view === current && location.hash === currentKey;
  if (current?.destroy) current.destroy();
  current = view; currentKey = location.hash;
  const el = document.createElement('div');
  el.className = 'view view-' + (key || 'accueil');
  const ctx = { parts, params, go: h => { if (location.hash !== h) location.hash = h; }, rerender: () => route({ keepScroll: true }) };
  try { await view.render(el, params, ctx); }
  catch (e) { console.error(e); el.innerHTML = `<div class="empty">${icon('alert')}<p>Une erreur est survenue : ${esc(e.message)}</p></div>`; }
  main.replaceChildren(el);
  document.title = `${view.title} · My Life Manager`;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === key));
  $('#more-btn')?.classList.toggle('on', !TABBAR.includes(key));
  if (keepScroll || sameView) scroller.scrollTop = y;
  else if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  else scroller.scrollTop = 0;
  const chip = $('#timer-chip'); if (chip) chip.innerHTML = '';
  updateClocks();
}

// Reconstruit l'écran après une modification, sauf pendant une saisie (on attend la fin)
const scheduleRerender = debounce(() => {
  if (document.querySelector('.modal-overlay')) { pendingRerender = true; return; }
  const a = document.activeElement;
  if (current?.keepWhileEditing && a && $('#view').contains(a) && a.matches('input:not([type=checkbox]),textarea,select')) { pendingRerender = true; return; }
  pendingRerender = false;
  route({ keepScroll: true });
}, 40);
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRerender) scheduleRerender(); }, 150));
const modalObserver = new MutationObserver(() => { if (pendingRerender && !document.querySelector('.modal-overlay')) scheduleRerender(); });

function shell() {
  $('#app').innerHTML = `
    <aside class="sidebar">
      <div class="brand"><img src="icons/icon-192.png" alt="" width="32" height="32"><div><b>My Life Manager</b><small id="sync-dot"></small></div></div>
      <button class="btn btn-primary side-add" id="side-add">${icon('plus')}<span>Nouveau</span></button>
      <nav>${NAV.map(([k, l, ic]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span></a>`).join('')}</nav>
      <div class="side-foot">
        <div id="timer-chip"></div>
        <button class="icon-btn" id="theme-toggle" title="Changer de thème">${icon('moon')}</button>
      </div>
    </aside>
    <main class="main"><div id="view"></div></main>
    <nav class="tabbar">
      ${TABBAR.map(k => { const n = NAV.find(x => x[0] === k); return `<a href="#/${k}" data-nav="${k}">${icon(n[2])}<span>${n[1]}</span></a>`; }).join('')}
      <button id="more-btn">${icon('grid')}<span>Plus</span></button>
    </nav>
    <button class="fab" id="fab" aria-label="Ajouter">${icon('plus')}</button>`;
  $('#more-btn').onclick = () => openModal({
    title: 'Menu',
    body: `<div class="more-grid">${NAV.filter(n => !TABBAR.includes(n[0])).map(([k, l, ic]) => `<a href="#/${k}" class="more-item">${icon(ic)}<span>${l}</span></a>`).join('')}</div>`,
    onMount: (el, close) => el.querySelectorAll('a').forEach(a => a.addEventListener('click', close)),
  });
  const addMenu = () => openModal({
    title: 'Ajouter',
    body: `<div class="more-grid">${[['note', 'Note', 'notes'], ['task', 'Tâche', 'tasks'], ['event', 'Activité', 'calendar'], ['alarm', 'Alarme', 'alarm']].map(([k, l, ic]) => `<button class="more-item" data-add="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>`,
    onMount: (el, close) => el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { close(); quickAdd(b.dataset.add); }),
  });
  $('#fab').onclick = addMenu;
  $('#side-add').onclick = addMenu;
  $('#theme-toggle').onclick = async () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    await S.setSettings({ theme: dark ? 'light' : 'dark' }, { silent: true }); applyTheme(); themeIcon();
  };
  themeIcon();
}
function themeIcon() {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const b = $('#theme-toggle'); if (b) b.innerHTML = icon(dark ? 'sun' : 'moon');
}
export function quickAdd(k) {
  if (k === 'note') newNote();
  if (k === 'task') editTask({}, { dueDate: todayStr() });
  if (k === 'event') editEvent();
  if (k === 'alarm') editAlarm();
}

function updateClocks() {
  const now = new Date();
  document.querySelectorAll('[data-clock=hm]').forEach(e => e.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const t = S.getSettings().timer;
  const chip = $('#timer-chip');
  if (t) {
    const sec = Math.floor((Date.now() - t.start) / 1000);
    const txt = `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
    document.querySelectorAll('[data-clock=timer]').forEach(e => e.textContent = txt);
    if (chip) {
      if (!chip.firstChild) chip.innerHTML = `<div class="timer-chip"><a href="#/projets/${t.projectId}"><i class="live-dot"></i><span data-clock="timer">${txt}</span><small>${esc(S.get('projects', t.projectId)?.name || '')}</small></a><button class="icon-btn sm" id="timer-stop" title="Arrêter">${icon('stop')}</button></div>`;
      $('#timer-stop')?.addEventListener('click', stopTimer, { once: true });
    }
  } else if (chip?.firstChild) chip.innerHTML = '';
}

/* ---------- Verrouillage ---------- */
function lockScreen() {
  return new Promise(res => {
    const ov = document.createElement('div');
    ov.className = 'lock-screen';
    ov.innerHTML = `
      <form class="lock-card">
        <img src="icons/icon-192.png" width="72" height="72" alt="">
        <h1>My Life Manager</h1>
        <p class="muted">Entrez votre code pour déverrouiller vos données.</p>
        <input class="input lock-input" type="password" autocomplete="current-password" inputmode="text" placeholder="Code" autofocus>
        <button class="btn btn-primary btn-lg" type="submit">${icon('lock')} Déverrouiller</button>
        <p class="lock-err" hidden>Code incorrect.</p>
        <p class="muted small">Les alarmes de l'application continuent de fonctionner sur cet écran.</p>
      </form>`;
    document.body.append(ov);
    const inp = ov.querySelector('input');
    setTimeout(() => inp.focus(), 100);
    ov.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const btn = ov.querySelector('button'); btn.disabled = true;
      if (await S.unlock(inp.value)) { ov.remove(); res(); }
      else { ov.querySelector('.lock-err').hidden = false; inp.value = ''; inp.focus(); btn.disabled = false; ov.querySelector('.lock-card').classList.add('shake'); setTimeout(() => ov.querySelector('.lock-card').classList.remove('shake'), 400); }
    };
  });
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const lock = await S.lockInfo();
  const mins = S.getSettings().autoLock;
  if (lock && mins && hiddenAt && Date.now() - hiddenAt > mins * 60000) location.reload();
});

/* ---------- Service worker (hors connexion + mises à jour) ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const ask = w => toast('Une mise à jour est disponible.', { timeout: 0, action: { label: 'Mettre à jour', fn: () => w.postMessage('skipWaiting') } });
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
    setInterval(() => reg.update().catch(() => { }), 60 * 60000);
  }).catch(() => { });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

function installHint() {
  if (!isIOS() || isStandalone() || sessionStorage.getItem('hint')) return;
  sessionStorage.setItem('hint', '1');
  toast("Astuce : Partager › « Sur l'écran d'accueil » pour installer l'app.", { timeout: 8000, action: { label: 'Guide', fn: () => location.hash = '#/guide' } });
}

/* ---------- Démarrage ---------- */
async function boot() {
  registerSW(); // dès le démarrage : hors connexion et mises à jour, même avant la connexion au profil
  try {
    await S.openDB();
    await S.loadPlain();
    applyTheme();
    unlockAudio();
    startEngine(); // les alarmes fonctionnent même sur l'écran de verrouillage
    if (await S.lockInfo()) await lockScreen();
    await S.loadAll();
    await initSync();
    document.getElementById('splash')?.remove();
    // Premier lancement sur cet appareil : créer son profil ou se connecter pour récupérer ses données
    let skip = false; try { skip = !!localStorage.getItem('mlm:noAccount'); } catch { }
    if (!isLoggedIn() && !skip && !S.hasRealData()) await authScreen();
    await S.seedIfNeeded();
    applyTheme();
    navigator.storage?.persist?.().catch(() => { });
    shell();
    onSyncStatus(st => { const d = $('#sync-dot'); if (d) d.innerHTML = `<i class="sd sd-${st.state}"></i>${esc(st.msg)}`; });
    S.onChange((col, source) => scheduleRerender());
    initPush();
    modalObserver.observe(document.body, { childList: true });
    window.addEventListener('hashchange', () => route());
    await route();
    setInterval(updateClocks, 1000);
    installHint();
    // Raccourcis clavier (ordinateur)
    document.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.modal-overlay')) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); quickAdd('note'); }
      if (k === 't') { e.preventDefault(); quickAdd('task'); }
      if (k === 'a') { e.preventDefault(); quickAdd('event'); }
    });
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<div class="fatal"><h1>Impossible de démarrer</h1><p>${esc(e.message)}</p><p>Vérifiez que la navigation privée est désactivée (le stockage y est bloqué).</p></div>`;
  } finally {
    document.getElementById('splash')?.remove();
  }
}
boot();
