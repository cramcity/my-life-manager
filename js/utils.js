// Utilitaires partagés : dates, échappement, modales, toasts.
import { icon } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export const addDaysStr = (s, n) => ymd(addDays(parseYMD(s), n));
export function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const hm2min = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const min2hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;

export function fmtDate(d, opt = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('fr-FR', opt).format(typeof d === 'string' ? parseYMD(d) : d);
}
export function relDay(s) {
  if (!s) return '';
  const t = todayStr();
  if (s === t) return "Aujourd'hui";
  if (s === addDaysStr(t, 1)) return 'Demain';
  if (s === addDaysStr(t, -1)) return 'Hier';
  const sameYear = s.slice(0, 4) === t.slice(0, 4);
  return fmtDate(s, sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDuration(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}
export function timeAgo(ts) {
  if (!ts || ts < 1e11) return 'au départ'; // éléments de départ (date volontairement très ancienne pour la synchronisation)
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
}
export function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}
export const DAYS_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const DAYS_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/* ---------- Toasts ---------- */
export function toast(msg, { action, timeout = 3500, type } = {}) {
  let wrap = $('#toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.append(wrap); }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); };
    el.append(b);
  }
  wrap.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (timeout) setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, timeout);
  return el;
}

/* ---------- Modales ---------- */
const modalStack = [];
export function openModal({ title = '', body = '', footer = '', wide = false, onMount, onClose, sheet = true } = {}) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''} ${sheet ? 'modal-sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  document.body.append(ov);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => ov.classList.add('show'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 200);
    modalStack.splice(modalStack.indexOf(api), 1);
    if (!modalStack.length) document.body.classList.remove('has-modal');
    onClose?.();
  };
  const api = { el: ov.querySelector('.modal'), close };
  modalStack.push(api);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.querySelector('[data-close]').onclick = close;
  onMount?.(api.el, close);
  const first = ov.querySelector('[autofocus]');
  if (first && matchMedia('(hover:hover)').matches) setTimeout(() => first.focus(), 50);
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close(); });

export function confirmBox(message, { ok = 'Confirmer', danger = false, title = 'Confirmation' } = {}) {
  return choiceBox(message, [{ label: 'Annuler', value: null }, { label: ok, value: true, danger, primary: !danger }], title);
}
export function choiceBox(message, choices, title = 'Choisir') {
  return new Promise(res => {
    let val = null;
    openModal({
      title, sheet: false,
      body: `<p class="muted">${esc(message)}</p>`,
      footer: choices.map((c, i) => `<button class="btn ${c.danger ? 'btn-danger' : c.primary ? 'btn-primary' : ''}" data-i="${i}">${esc(c.label)}</button>`).join(''),
      onMount(el, close) { el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { val = choices[+b.dataset.i].value; close(); }); },
      onClose: () => res(val)
    });
  });
}
export function promptBox(title, { value = '', label = '', placeholder = '', ok = 'Valider', type = 'text' } = {}) {
  return new Promise(res => {
    let val = null;
    openModal({
      title, sheet: false,
      body: `<label class="field"><span>${esc(label)}</span><input class="input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus></label>`,
      footer: `<button class="btn" data-c>Annuler</button><button class="btn btn-primary" data-ok>${esc(ok)}</button>`,
      onMount(el, close) {
        const inp = el.querySelector('input');
        const done = () => { val = inp.value.trim(); close(); };
        el.querySelector('[data-ok]').onclick = done;
        el.querySelector('[data-c]').onclick = close;
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
        setTimeout(() => inp.focus(), 60);
      },
      onClose: () => res(val)
    });
  });
}

/* ---------- Formulaires génériques ---------- */
// fields: [{name,label,type,value,options:[{value,label}],required,full,placeholder,rows,min,max,step,hint}]
export function fieldHTML(f) {
  const v = f.value ?? '';
  const common = `name="${f.name}" ${f.required ? 'required' : ''} ${f.autofocus ? 'autofocus' : ''} placeholder="${esc(f.placeholder || '')}"`;
  let input;
  switch (f.type) {
    case 'textarea': input = `<textarea class="input" rows="${f.rows || 3}" ${common}>${esc(v)}</textarea>`; break;
    case 'select': input = `<select class="input" ${common}>${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`; break;
    case 'checkbox': return `<label class="check-field ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'range': input = `<div class="range-wrap"><input type="range" ${common} min="${f.min ?? 0}" max="${f.max ?? 100}" step="${f.step ?? 1}" value="${esc(v)}" oninput="this.nextElementSibling.textContent=this.value+'${f.suffix || ''}'"><output>${esc(v)}${f.suffix || ''}</output></div>`; break;
    case 'days': input = `<div class="days-pick" data-days="${f.name}">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="day-chip ${(v || []).includes(d) ? 'on' : ''}" data-d="${d}" title="${DAYS_NAMES[d]}">${DAYS_SHORT[d]}</button>`).join('')}</div>`; break;
    case 'chips': input = `<div class="chips-pick" data-chips="${f.name}">${f.options.map(o => `<button type="button" class="rem-chip ${(v || []).map(Number).includes(Number(o.value)) ? 'on' : ''}" data-v="${o.value}">${esc(o.label)}</button>`).join('')}</div>`; break;
    case 'colors': input = `<div class="color-pick" data-colors="${f.name}">${f.options.map(c => `<button type="button" class="color-dot ${c === v ? 'on' : ''}" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>`; break;
    case 'html': return `<div class="${f.full ? 'full' : ''}">${f.html}</div>`;
    default: input = `<input class="input" type="${f.type || 'text'}" value="${esc(v)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step != null ? `step="${f.step}"` : ''} ${common}>`;
  }
  return `<label class="field ${f.full ? 'full' : ''}"><span>${esc(f.label || '')}</span>${input}${f.hint ? `<small class="hint">${f.hint}</small>` : ''}</label>`;
}
export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (!f.name || f.type === 'html') continue;
    if (f.type === 'checkbox') out[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
    else if (f.type === 'days') out[f.name] = [...form.querySelectorAll(`[data-days="${f.name}"] .on`)].map(b => +b.dataset.d);
    else if (f.type === 'chips') out[f.name] = [...form.querySelectorAll(`[data-chips="${f.name}"] .on`)].map(b => Number(b.dataset.v)).sort((a, b) => b - a);
    else if (f.type === 'colors') out[f.name] = form.querySelector(`[data-colors="${f.name}"] .on`)?.dataset.c || f.value;
    else if (f.type === 'number' || f.type === 'range') out[f.name] = form.querySelector(`[name="${f.name}"]`).value === '' ? null : Number(form.querySelector(`[name="${f.name}"]`).value);
    else out[f.name] = form.querySelector(`[name="${f.name}"]`).value.trim();
  }
  return out;
}
// Retourne Promise<{action:'save'|string, values}|null>
export function formModal({ title, fields, submitLabel = 'Enregistrer', extraButtons = [], onMount, wide = true, validate }) {
  return new Promise(res => {
    let result = null;
    openModal({
      title, wide,
      body: `<form class="form-grid" novalidate>${fields.map(fieldHTML).join('')}<button type="submit" hidden></button></form>`,
      footer: `${extraButtons.map((b, i) => `<button class="btn ${b.danger ? 'btn-ghost-danger' : 'btn-ghost'}" data-x="${i}" type="button">${b.icon ? icon(b.icon) : ''}<span>${esc(b.label)}</span></button>`).join('')}
               <span class="spacer"></span><button class="btn" data-c type="button">Annuler</button><button class="btn btn-primary" data-s type="button">${esc(submitLabel)}</button>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        el.querySelectorAll('.days-pick .day-chip, .chips-pick .rem-chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
        el.querySelectorAll('.color-pick .color-dot').forEach(b => b.onclick = () => { b.parentNode.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
        const submit = () => {
          const values = readForm(form, fields);
          for (const f of fields) if (f.required && !values[f.name]) { form.querySelector(`[name="${f.name}"]`)?.focus(); toast(`« ${f.label} » est obligatoire`, { type: 'warn' }); return; }
          const err = validate?.(values);
          if (err) { toast(err, { type: 'warn' }); return; }
          result = { action: 'save', values }; close();
        };
        el.querySelector('[data-s]').onclick = submit;
        form.addEventListener('submit', e => { e.preventDefault(); submit(); });
        el.querySelector('[data-c]').onclick = close;
        el.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
          const eb = extraButtons[+b.dataset.x];
          if (eb.keepOpen) { eb.onClick?.(readForm(form, fields), el); return; }
          result = { action: eb.action, values: readForm(form, fields) }; close();
        });
        onMount?.(el, form, close);
      },
      onClose: () => res(result)
    });
  });
}

/* ---------- Téléchargement / partage de fichiers ---------- */
export async function shareOrDownload(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
    } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
export function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null);
    i.click();
  });
}
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
