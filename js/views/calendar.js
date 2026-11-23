import * as S from '../store.js';
import { esc, todayStr, addDaysStr, parseYMD, ymd, startOfWeek, fmtDate, capital, hm2min, min2hm, pad } from '../utils.js';
import { icon } from '../icons.js';
import { eventsOn, eventsBetween } from '../recur.js';
import { catColor, pageHead } from '../components.js';
import { editEvent, moveEvent, editTask } from '../editors.js';

const HOUR = 48;
const st = {
  view: sessionStorage.getItem('cal:view') || (matchMedia('(max-width: 760px)').matches ? 'day' : 'week'),
  cursor: todayStr(),
  scroll: null,
};
const save = () => sessionStorage.setItem('cal:view', st.view);

function layout(list) {
  // Disposition en colonnes des activités qui se chevauchent
  const items = list.map(o => ({ o, s: hm2min(o.start) ?? 0, e: Math.max((hm2min(o.end) ?? (hm2min(o.start) + 30)), (hm2min(o.start) ?? 0) + 15) }))
    .sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map(i => i.col)) + 1; cluster.forEach(i => i.n = n); cluster = []; };
  for (const it of items) {
    if (it.s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter(c => c.e > it.s).map(c => c.col));
    let c = 0; while (used.has(c)) c++;
    it.col = c; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return items;
}

function headerTitle() {
  const d = parseYMD(st.cursor);
  if (st.view === 'month') return capital(fmtDate(d, { month: 'long', year: 'numeric' }));
  if (st.view === 'day') return capital(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const a = startOfWeek(d), b = parseYMD(addDaysStr(ymd(a), 6));
  return `Semaine du ${fmtDate(a, { day: 'numeric', month: a.getMonth() === b.getMonth() ? undefined : 'short' })} au ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
function shift(n) {
  const d = parseYMD(st.cursor);
  if (st.view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + n); }
  else d.setDate(d.getDate() + n * (st.view === 'week' ? 7 : 1));
  st.cursor = ymd(d);
}

function timeGrid(days) {
  const t = todayStr(), now = new Date();
  const tasks = S.all('tasks').filter(x => x.dueDate && x.status !== 'done');
  const evs = S.all('events');
  const heads = days.map(d => {
    const dt = parseYMD(d);
    return `<button class="cal-dh ${d === t ? 'today' : ''}" data-goday="${d}"><small>${fmtDate(dt, { weekday: 'short' })}</small><b>${dt.getDate()}</b></button>`;
  }).join('');
  const allday = days.map(d => `<div class="cal-ad" data-date="${d}">${tasks.filter(x => x.dueDate === d).map(x => `<button class="cal-task" data-task="${x.id}" title="${esc(x.title)}">${icon('tasks')}${x.dueTime ? x.dueTime + ' ' : ''}${esc(x.title)}</button>`).join('')}</div>`).join('');
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="cal-h"><span>${h ? pad(h) + ':00' : ''}</span></div>`).join('');
  const cols = days.map(d => {
    const items = layout(eventsOn(d, evs).filter(o => o.start));
    const evHtml = items.map(({ o, s, e, col, n }) => {
      const h = Math.max(20, (e - s) / 60 * HOUR - 2);
      return `<div class="cal-ev ${h < 36 ? 'short' : ''}" data-ev="${o.id}" data-occ="${d}" data-s="${s}" data-e="${e}"
        style="top:${s / 60 * HOUR}px;height:${h}px;left:calc(${col / n * 100}% + 2px);width:calc(${100 / n}% - 4px);--c:${catColor(o.category)}">
        <b>${esc(o.title)}</b><small>${o.start}${o.end ? '–' + o.end : ''}${o.repeat && o.repeat !== 'none' ? ' ↻' : ''}</small>
        <span class="cal-rs" data-resize></span></div>`;
    }).join('');
    const nowLine = d === t ? `<div class="cal-now" style="top:${(now.getHours() * 60 + now.getMinutes()) / 60 * HOUR}px"></div>` : '';
    return `<div class="cal-col ${d === t ? 'today' : ''}" data-date="${d}">${evHtml}${nowLine}</div>`;
  }).join('');
  return `
  <div class="cal cal-${st.view}" style="--hour:${HOUR}px;--n:${days.length}">
    <div class="cal-row cal-heads"><div class="cal-gut"></div>${heads}</div>
    <div class="cal-row cal-alldays"><div class="cal-gut"><small>Tâches</small></div>${allday}</div>
    <div class="cal-scroll"><div class="cal-body"><div class="cal-gut">${hours}</div>${cols}</div></div>
  </div>`;
}

function monthGrid() {
  const c = parseYMD(st.cursor);
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const start = startOfWeek(first);
  const t = todayStr();
  const from = ymd(start), to = addDaysStr(from, 41);
  const occ = eventsBetween(from, to);
  const tasks = S.all('tasks').filter(x => x.dueDate && x.dueDate >= from && x.dueDate <= to && x.status !== 'done');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDaysStr(from, i), dt = parseYMD(d);
    const items = [
      ...occ.filter(o => o.occ === d).map(o => `<div class="m-ev" data-ev="${o.id}" data-occ="${d}" style="--c:${catColor(o.category)}"><i></i>${o.start ? `<em>${o.start}</em>` : ''}${esc(o.title)}</div>`),
      ...tasks.filter(x => x.dueDate === d).map(x => `<div class="m-ev m-task" data-task="${x.id}">${icon('tasks')}${esc(x.title)}</div>`),
    ];
    cells += `<div class="m-cell ${dt.getMonth() !== c.getMonth() ? 'out' : ''} ${d === t ? 'today' : ''}" data-date="${d}">
      <button class="m-num" data-goday="${d}">${dt.getDate()}</button>
      <div class="m-items">${items.slice(0, 4).join('')}${items.length > 4 ? `<button class="m-more" data-goday="${d}">+${items.length - 4}</button>` : ''}</div></div>`;
  }
  const wd = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(x => `<div>${x}</div>`).join('');
  return `<div class="month"><div class="m-head">${wd}</div><div class="m-grid">${cells}</div></div>`;
}

/* ---------- Glisser-déposer (souris immédiat, tactile après appui long) ---------- */
let dragging = false;
document.addEventListener('touchmove', e => { if (dragging) e.preventDefault(); }, { passive: false });

function attachDrag(root) {
  root.addEventListener('pointerdown', e => {
    const evEl = e.target.closest('.cal-ev, .m-ev[data-ev]');
    if (!evEl || e.button > 0) return;
    const resize = !!e.target.closest('[data-resize]');
    const month = evEl.classList.contains('m-ev');
    const sx = e.clientX, sy = e.clientY;
    let active = false, timer = null, ghost = null, target = null;
    const s0 = +evEl.dataset.s, e0 = +evEl.dataset.e, dur = e0 - s0;
    const startDrag = () => {
      active = dragging = true;
      evEl.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(15);
      if (month) { ghost = evEl.cloneNode(true); ghost.className += ' m-ghost'; document.body.append(ghost); }
    };
    if (e.pointerType === 'mouse') { /* démarre après un petit mouvement */ }
    else timer = setTimeout(startDrag, 320);
    const onMove = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!active) {
        if (e.pointerType === 'mouse' && Math.hypot(dx, dy) > 5) startDrag();
        else if (e.pointerType !== 'mouse' && Math.hypot(dx, dy) > 8) { clearTimeout(timer); cleanup(); }
        if (!active) return;
      }
      ev.preventDefault();
      if (month) {
        ghost.style.left = ev.clientX - 40 + 'px'; ghost.style.top = ev.clientY - 12 + 'px';
        ghost.style.display = 'none';
        const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.m-cell');
        ghost.style.display = '';
        root.querySelectorAll('.m-cell.drop').forEach(c => c.classList.remove('drop'));
        if (cell) { cell.classList.add('drop'); target = { date: cell.dataset.date }; }
        return;
      }
      const deltaMin = Math.round(dy / HOUR * 60 / 15) * 15;
      if (resize) {
        const ne = Math.min(1440, Math.max(s0 + 15, e0 + deltaMin));
        evEl.style.height = (ne - s0) / 60 * HOUR - 2 + 'px';
        target = { date: evEl.dataset.occ, s: s0, e: ne };
        evEl.querySelector('small').textContent = `${min2hm(s0)}–${min2hm(ne)}`;
        return;
      }
      let ns = Math.max(0, Math.min(1440 - dur, s0 + deltaMin));
      evEl.style.pointerEvents = 'none';
      const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cal-col');
      evEl.style.pointerEvents = '';
      const date = col?.dataset.date || evEl.dataset.occ;
      const homeCol = evEl.parentElement;
      const offX = col && col !== homeCol ? col.getBoundingClientRect().left - homeCol.getBoundingClientRect().left : 0;
      evEl.style.transform = `translate(${offX}px, ${(ns - s0) / 60 * HOUR}px)`;
      evEl.querySelector('small').textContent = `${min2hm(ns)}–${min2hm(ns + dur)}`;
      target = { date, s: ns, e: ns + dur };
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onCancel = () => { clearTimeout(timer); cleanup(); if (active) { dragging = false; render._rerender?.(); } };
    const onUp = async () => {
      clearTimeout(timer); cleanup();
      if (!active) return;
      dragging = false;
      ghost?.remove();
      evEl.classList.remove('dragging');
      root.dataset.justDragged = '1'; setTimeout(() => delete root.dataset.justDragged, 50);
      const ev = S.get('events', evEl.dataset.ev);
      if (!target || !ev) { render._rerender?.(); return; }
      if (month) {
        if (target.date !== evEl.dataset.occ) await moveEvent(ev.id, evEl.dataset.occ, target.date, ev.start, ev.end);
      } else if (target.date !== evEl.dataset.occ || target.s !== s0 || target.e !== e0) {
        await moveEvent(ev.id, evEl.dataset.occ, target.date, min2hm(target.s), target.e >= 1440 ? '23:59' : min2hm(target.e));
      }
      render._rerender?.();
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}

function render(el, params, ctx) {
  render._rerender = ctx.rerender;
  if (params.get('d')) st.cursor = params.get('d');
  let days = [];
  if (st.view === 'day') days = [st.cursor];
  if (st.view === 'week') { const a = ymd(startOfWeek(parseYMD(st.cursor))); days = Array.from({ length: 7 }, (_, i) => addDaysStr(a, i)); }
  el.innerHTML = `
    ${pageHead('Agenda', `<button class="btn btn-primary" data-new>${icon('plus')}<span>Activité</span></button>`)}
    <div class="cal-toolbar">
      <div class="btn-group">
        <button class="icon-btn" data-nav="-1" aria-label="Précédent">${icon('left')}</button>
        <button class="btn btn-sm" data-today>Aujourd'hui</button>
        <button class="icon-btn" data-nav="1" aria-label="Suivant">${icon('right')}</button>
      </div>
      <h2 class="cal-title">${headerTitle()}</h2>
      <div class="seg">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([v, l]) => `<button class="${st.view === v ? 'on' : ''}" data-view="${v}">${l}</button>`).join('')}</div>
    </div>
    ${st.view === 'month' ? monthGrid() : timeGrid(days)}
    <p class="hint center">Astuce : cliquez sur un créneau pour créer une activité. Glissez une activité pour la déplacer${matchMedia('(pointer:coarse)').matches ? ' (appui long sur mobile)' : ''}, tirez son bord inférieur pour changer sa durée.</p>`;

  const sc = el.querySelector('.cal-scroll');
  if (sc) requestAnimationFrame(() => { sc.scrollTop = st.scroll ?? 7 * HOUR; sc.addEventListener('scroll', () => st.scroll = sc.scrollTop, { passive: true }); });

  attachDrag(el);
  el.addEventListener('click', e => {
    if (el.dataset.justDragged) return;
    const b = e.target.closest('button,[data-ev],[data-task]');
    if (b?.dataset.nav) { shift(+b.dataset.nav); ctx.rerender(); return; }
    if (b?.hasAttribute('data-today')) { st.cursor = todayStr(); ctx.rerender(); return; }
    if (b?.dataset.view) { st.view = b.dataset.view; save(); ctx.rerender(); return; }
    if (b?.dataset.goday) { st.cursor = b.dataset.goday; st.view = 'day'; save(); ctx.rerender(); return; }
    if (b?.hasAttribute('data-new')) { editEvent({}, { defaults: { date: st.view === 'month' ? todayStr() : st.cursor } }); return; }
    if (b?.dataset.ev) { editEvent(S.get('events', b.dataset.ev), { occ: b.dataset.occ }); return; }
    if (b?.dataset.task) { editTask(S.get('tasks', b.dataset.task)); return; }
    const col = e.target.closest('.cal-col');
    if (col) {
      const y = e.clientY - col.getBoundingClientRect().top;
      const m = Math.max(0, Math.min(23 * 60, Math.floor(y / HOUR * 2) * 30));
      editEvent({}, { defaults: { date: col.dataset.date, start: min2hm(m), end: min2hm(Math.min(m + 60, 1439)) } });
      return;
    }
    const cell = e.target.closest('.m-cell');
    if (cell && matchMedia('(max-width: 760px)').matches) { st.cursor = cell.dataset.date; st.view = 'day'; save(); ctx.rerender(); return; }
    if (cell) editEvent({}, { defaults: { date: cell.dataset.date } });
  });
}
export default { title: 'Agenda', render };
