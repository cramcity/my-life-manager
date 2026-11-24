import { remindersOf } from './recur.js';
// Éléments d'interface réutilisables.
import * as S from './store.js';
import { esc, relDay, todayStr } from './utils.js';
import { icon } from './icons.js';

export const PRIORITIES = [
  { value: 'low', label: 'Basse' }, { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Haute' }, { value: 'urgent', label: 'Urgente' },
];
export const PRIO_LABEL = Object.fromEntries(PRIORITIES.map(p => [p.value, p.label]));
export const PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
export const STATUSES = [
  { value: 'todo', label: 'À faire' }, { value: 'doing', label: 'En cours' },
  { value: 'done', label: 'Terminé' }, { value: 'postponed', label: 'Reporté' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.value, s.label]));

export const category = id => S.getSettings().categories.find(c => c.id === id);
export const catColor = id => category(id)?.color || '#64748b';
export const catOptions = (empty = true) => [...(empty ? [{ value: '', label: 'Sans catégorie' }] : []), ...S.getSettings().categories.map(c => ({ value: c.id, label: c.name }))];
export const projectOptions = () => [{ value: '', label: 'Aucun projet' }, ...S.all('projects').filter(p => !p.archived).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map(p => ({ value: p.id, label: p.name }))];

export function chip(label, color) {
  return `<span class="chip" style="--c:${color}"><i></i>${esc(label)}</span>`;
}
export function catChip(id) { const c = category(id); return c ? chip(c.name, c.color) : ''; }
export function projChip(id) { const p = id && S.get('projects', id); return p ? `<a class="chip chip-link" href="#/projets/${p.id}" style="--c:${p.color}"><i></i>${esc(p.name)}</a>` : ''; }
export function prioBadge(p) { return p && p !== 'normal' ? `<span class="prio prio-${p}">${PRIO_LABEL[p]}</span>` : ''; }

export function taskRow(t, { showProject = true, actions = '' } = {}) {
  const t0 = todayStr();
  const overdue = t.status !== 'done' && t.dueDate && t.dueDate < t0;
  const due = t.dueDate ? `<span class="due ${overdue ? 'late' : t.dueDate === t0 ? 'today' : ''}">${icon('calendar')}${relDay(t.dueDate)}${t.dueTime ? ' · ' + t.dueTime : ''}</span>` : '';
  return `
  <div class="task-row ${t.status === 'done' ? 'is-done' : ''}" data-id="${t.id}">
    <button class="task-check" data-act="toggle-task" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Marquer non terminée' : 'Marquer terminée'}">${t.status === 'done' ? icon('check') : ''}</button>
    <div class="task-main" data-act="edit-task" data-id="${t.id}">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        ${due}
        ${t.status === 'doing' ? '<span class="status st-doing">En cours</span>' : ''}
        ${t.status === 'postponed' ? '<span class="status st-postponed">Reporté</span>' : ''}
        ${prioBadge(t.priority)}
        ${catChip(t.category)}
        ${showProject ? projChip(t.projectId) : ''}
        ${remindersOf(t).length && t.dueTime ? `<span class="muted-ic" title="Rappel">${icon('bell')}</span>` : ''}
        ${t.sharedFrom ? `<span class="task-shared">${icon('share')} de ${esc(t.sharedFrom)}</span>` : ''}
      </div>
    </div>${actions ? `<div class="row-actions">${actions}</div>` : ''}
  </div>`;
}
export function empty(ic, text, action = '') {
  return `<div class="empty">${icon(ic)}<p>${esc(text)}</p>${action}</div>`;
}
export function progressBar(pct, color) {
  return `<div class="bar"><span style="width:${Math.max(0, Math.min(100, pct))}%;${color ? `background:${color}` : ''}"></span></div>`;
}
export function pageHead(title, actions = '', sub = '') {
  return `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="head-actions">${actions}</div></header>`;
}
export function sortTasks(list) {
  return list.sort((a, b) =>
    (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
    (a.dueTime || '99').localeCompare(b.dueTime || '99') ||
    (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2) ||
    (a.createdAt - b.createdAt));
}
export function goalState(g) {
  if (g.status === 'achieved') return 'achieved';
  if (g.status === 'missed') return 'missed';
  if (g.targetDate && g.targetDate < todayStr()) return 'missed';
  return 'active';
}
