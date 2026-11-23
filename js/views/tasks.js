import * as S from '../store.js';
import { esc, todayStr, addDaysStr, parseYMD, startOfWeek, ymd } from '../utils.js';
import { icon } from '../icons.js';
import { taskRow, empty, pageHead, sortTasks, PRIORITIES, STATUSES, catOptions, projectOptions, STATUS_LABEL, prioBadge, catChip, projChip } from '../components.js';
import { editTask, toggleTask, postponeTask } from '../editors.js';

const st = { f: 'open', q: '', prio: '', cat: '', proj: '', mode: sessionStorage.getItem('tasks:mode') || 'list' };
const FILTERS = [['open', 'Non terminées'], ['today', "Aujourd'hui"], ['late', 'En retard'], ['week', 'Cette semaine'], ['done', 'Terminées'], ['all', 'Toutes']];

function filtered() {
  const t = todayStr(), wEnd = addDaysStr(ymd(startOfWeek(new Date())), 6);
  let list = S.all('tasks');
  if (st.f === 'open') list = list.filter(x => x.status !== 'done');
  if (st.f === 'today') list = list.filter(x => x.status !== 'done' && x.dueDate === t);
  if (st.f === 'late') list = list.filter(x => x.status !== 'done' && x.dueDate && x.dueDate < t);
  if (st.f === 'week') list = list.filter(x => x.status !== 'done' && x.dueDate && x.dueDate <= wEnd);
  if (st.f === 'done') list = list.filter(x => x.status === 'done');
  if (st.prio) list = list.filter(x => x.priority === st.prio);
  if (st.cat) list = list.filter(x => x.category === st.cat);
  if (st.proj) list = list.filter(x => x.projectId === st.proj);
  if (st.q) { const q = st.q.toLowerCase(); list = list.filter(x => (x.title + ' ' + (x.description || '')).toLowerCase().includes(q)); }
  return list;
}
function groups(list) {
  const t = todayStr(), tm = addDaysStr(t, 1), w = addDaysStr(t, 7);
  if (st.f === 'done') {
    const sorted = list.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const g = {};
    for (const x of sorted) { const d = x.completedAt ? ymd(new Date(x.completedAt)) : 'Inconnue'; (g[d] ||= []).push(x); }
    return Object.entries(g).map(([d, items]) => [d === 'Inconnue' ? d : 'Terminées le ' + new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseYMD(d)), items]);
  }
  const G = [['En retard', []], ["Aujourd'hui", []], ['Demain', []], ['7 prochains jours', []], ['Plus tard', []], ['Sans date', []], ['Terminées', []]];
  for (const x of sortTasks(list)) {
    if (x.status === 'done') G[6][1].push(x);
    else if (!x.dueDate) G[5][1].push(x);
    else if (x.dueDate < t) G[0][1].push(x);
    else if (x.dueDate === t) G[1][1].push(x);
    else if (x.dueDate === tm) G[2][1].push(x);
    else if (x.dueDate <= w) G[3][1].push(x);
    else G[4][1].push(x);
  }
  return G.filter(g => g[1].length);
}
function kanban(list) {
  return `<div class="kanban">${STATUSES.map(s => {
    const items = sortTasks(list.filter(x => (x.status || 'todo') === s.value));
    return `<div class="kb-col" data-status="${s.value}"><div class="kb-head"><b>${s.label}</b><span class="count">${items.length}</span></div>
      <div class="kb-list">${items.map(x => `<div class="kb-card" data-act="edit-task" data-id="${x.id}" draggable="true"><b>${esc(x.title)}</b>
        <div class="task-meta">${x.dueDate ? `<span class="due ${x.status !== 'done' && x.dueDate < todayStr() ? 'late' : ''}">${icon('calendar')}${x.dueDate.split('-').reverse().slice(0, 2).join('/')}</span>` : ''}${prioBadge(x.priority)}${catChip(x.category)}${projChip(x.projectId)}</div>
        <div class="kb-move">${STATUSES.filter(o => o.value !== s.value).map(o => `<button class="btn btn-xs" data-move="${o.value}" data-id="${x.id}">→ ${o.label}</button>`).join('')}</div></div>`).join('') || '<p class="muted small center">Aucune tâche</p>'}</div></div>`;
  }).join('')}</div>`;
}

function render(el, params, ctx) {
  if (params.get('f')) st.f = params.get('f');
  const list = filtered();
  const counts = { done: S.all('tasks').filter(x => x.status === 'done').length, open: S.all('tasks').filter(x => x.status !== 'done').length };
  el.innerHTML = `
    ${pageHead('Tâches', `<div class="seg seg-ic"><button class="${st.mode === 'list' ? 'on' : ''}" data-mode="list" title="Liste">${icon('list')}</button><button class="${st.mode === 'kanban' ? 'on' : ''}" data-mode="kanban" title="Tableau">${icon('kanban')}</button></div><button class="btn btn-primary" data-new>${icon('plus')}<span>Tâche</span></button>`, `${counts.open} non terminée${counts.open > 1 ? 's' : ''} · ${counts.done} terminée${counts.done > 1 ? 's' : ''}`)}
    <div class="toolbar">
      <div class="tabs-scroll">${FILTERS.map(([v, l]) => `<button class="pill ${st.f === v ? 'on' : ''}" data-f="${v}">${l}</button>`).join('')}</div>
      <div class="filters">
        <label class="search">${icon('search')}<input type="search" placeholder="Rechercher une tâche" value="${esc(st.q)}" data-q></label>
        <select class="input input-sm" data-prio><option value="">Toutes priorités</option>${PRIORITIES.map(p => `<option value="${p.value}" ${st.prio === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
        <select class="input input-sm" data-cat><option value="">Toutes catégories</option>${catOptions(false).map(c => `<option value="${c.value}" ${st.cat === c.value ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
        <select class="input input-sm" data-proj><option value="">Tous projets</option>${projectOptions().slice(1).map(c => `<option value="${c.value}" ${st.proj === c.value ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      </div>
    </div>
    <form class="quick-add" data-quick>${icon('plus')}<input placeholder="Ajout rapide : tapez une tâche et appuyez sur Entrée" data-quick-input enterkeyhint="done"></form>
    ${st.mode === 'kanban' ? kanban(st.f === 'done' || st.f === 'open' ? S.all('tasks').filter(x => (!st.proj || x.projectId === st.proj) && (!st.q || x.title.toLowerCase().includes(st.q.toLowerCase()))) : list) :
      list.length ? groups(list).map(([g, items]) => `<section class="task-group"><h3>${esc(g)} <span class="count">${items.length}</span></h3><div class="card card-flush">${items.map(x => taskRow(x, { actions: `${x.status !== 'done' ? `<button class="icon-btn sm" title="Reporter" data-postpone="${x.id}">${icon('clock')}</button>` : ''}<select class="mini-select" data-status-of="${x.id}" aria-label="Statut">${STATUSES.map(s => `<option value="${s.value}" ${x.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select>` })).join('')}</div></section>`).join('')
        : empty('tasks', st.f === 'done' ? 'Aucune tâche terminée pour le moment.' : 'Aucune tâche ici.', '<button class="btn btn-primary" data-new>Créer une tâche</button>')}
  `;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-f],[data-new],[data-act],[data-mode],[data-postpone],[data-move]');
    if (!b) return;
    if (b.dataset.f) { st.f = b.dataset.f; if (location.hash.includes('?')) location.hash = '#/taches'; else ctx.rerender(); }
    else if (b.hasAttribute('data-new')) editTask({}, { projectId: st.proj || '' });
    else if (b.dataset.mode) { st.mode = b.dataset.mode; sessionStorage.setItem('tasks:mode', st.mode); ctx.rerender(); }
    else if (b.dataset.postpone) postponeTask(b.dataset.postpone);
    else if (b.dataset.move) { e.stopPropagation(); const t = S.get('tasks', b.dataset.id); S.patch('tasks', t.id, { status: b.dataset.move, completedAt: b.dataset.move === 'done' ? Date.now() : null }); S.log(`Tâche → ${STATUS_LABEL[b.dataset.move]}`, t.title, { type: 'task', projectId: t.projectId }); }
    else if (b.dataset.act === 'toggle-task') toggleTask(b.dataset.id);
    else if (b.dataset.act === 'edit-task' && !e.target.closest('a,select,button')) editTask(S.get('tasks', b.dataset.id));
  });
  el.addEventListener('change', e => {
    const s = e.target;
    if (s.dataset.statusOf) { const t = S.get('tasks', s.dataset.statusOf); S.patch('tasks', t.id, { status: s.value, completedAt: s.value === 'done' ? (t.completedAt || Date.now()) : null }); S.log(`Tâche → ${STATUS_LABEL[s.value]}`, t.title, { type: 'task', projectId: t.projectId }); }
    if (s.hasAttribute('data-prio')) { st.prio = s.value; ctx.rerender(); }
    if (s.hasAttribute('data-cat')) { st.cat = s.value; ctx.rerender(); }
    if (s.hasAttribute('data-proj')) { st.proj = s.value; ctx.rerender(); }
  });
  const q = el.querySelector('[data-q]');
  q.addEventListener('input', () => { st.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { ctx.rerender(); const n = document.querySelector('[data-q]'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 250); });
  el.querySelector('[data-quick]').addEventListener('submit', async e => {
    e.preventDefault();
    const inp = el.querySelector('[data-quick-input]'); const title = inp.value.trim(); if (!title) return;
    const t = await S.put('tasks', { title, status: 'todo', priority: 'normal', dueDate: st.f === 'today' ? todayStr() : '', projectId: st.proj || null, category: st.cat || '' });
    S.log('Tâche créée', t.title, { type: 'task', projectId: t.projectId });
    setTimeout(() => document.querySelector('[data-quick-input]')?.focus(), 30);
  });
  // Glisser-déposer entre colonnes du tableau (ordinateur)
  el.querySelectorAll('.kb-card').forEach(c => c.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', c.dataset.id)));
  el.querySelectorAll('.kb-col').forEach(col => {
    col.addEventListener('dragover', ev => { ev.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', ev => {
      ev.preventDefault(); col.classList.remove('drop');
      const id = ev.dataTransfer.getData('text/plain'); const t = S.get('tasks', id); if (!t || t.status === col.dataset.status) return;
      S.patch('tasks', id, { status: col.dataset.status, completedAt: col.dataset.status === 'done' ? Date.now() : null });
      S.log(`Tâche → ${STATUS_LABEL[col.dataset.status]}`, t.title, { type: 'task', projectId: t.projectId });
    });
  });
}
export default { title: 'Tâches', render };
