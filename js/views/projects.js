import * as S from '../store.js';
import { esc, todayStr, addDaysStr, relDay, fmtDuration, timeAgo, fmtDate, pad } from '../utils.js';
import { icon } from '../icons.js';
import { taskRow, empty, progressBar, pageHead, sortTasks, goalState } from '../components.js';
import { editProject, editTask, toggleTask, editGoal, editLearning, startTimer, stopTimer, addTimeLog, newNote, editEvent } from '../editors.js';
import { eventsBetween } from '../recur.js';
import { renderNote } from './notes.js';

const tabs = [['apercu', 'Aperçu', 'home'], ['taches', 'Tâches', 'tasks'], ['notes', 'Notes', 'notes'], ['objectifs', 'Objectifs', 'target'], ['apprentissages', 'Apprentissages', 'bulb'], ['temps', 'Temps', 'clock'], ['historique', 'Historique', 'history']];

function stats(p) {
  const tasks = S.all('tasks').filter(t => t.projectId === p.id);
  const done = tasks.filter(t => t.status === 'done').length;
  const wk = addDaysStr(todayStr(), -6);
  const min = S.all('timelogs').filter(l => l.projectId === p.id && l.date >= wk).reduce((s, l) => s + (l.minutes || 0), 0);
  return { open: tasks.length - done, done, pct: tasks.length ? Math.round(done / tasks.length * 100) : 0, min, notes: S.all('notes').filter(n => n.projectId === p.id).length, goals: S.all('goals').filter(g => g.projectId === p.id && goalState(g) === 'active').length };
}

function suggestions(projects) {
  const have = new Set(S.all('projects').map(p => p.name.toLowerCase()));
  const list = S.PROJECT_SUGGESTIONS.map((x, i) => ({ ...x, i })).filter(x => !have.has(x.name.toLowerCase()));
  if (!list.length || projects.length >= 6) return '';
  return `<div class="card suggest-card"><div class="card-head"><h2>${icon('sparkle')} ${projects.length ? 'Ajouter un espace' : 'Créez vos espaces'}</h2></div>
    <p class="muted small">Touchez une idée pour la créer (vous pourrez changer le nom), ou « Projet » pour en créer un à votre façon.</p>
    <div class="chips-pick">${list.map(x => `<button class="rem-chip" data-suggest="${x.i}">${x.emoji} ${esc(x.name)}</button>`).join('')}</div></div>`;
}

function list(el, ctx) {
  const showArch = ctx.params.get('archives') === '1';
  const projects = S.all('projects').filter(p => !!p.archived === showArch).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const timer = S.getSettings().timer;
  el.innerHTML = `
    ${pageHead('Projets et formations', `<a class="btn btn-ghost" href="#/projets${showArch ? '' : '?archives=1'}">${showArch ? 'Projets actifs' : 'Archives'}</a><button class="btn btn-primary" data-new>${icon('plus')}<span>Projet</span></button>`, 'Chaque espace regroupe ses notes, tâches, objectifs, échéances et son historique.')}
    ${showArch ? '' : suggestions(projects)}
    <div class="proj-grid">
      ${projects.map(p => {
        const s = stats(p);
        return `<a class="proj-card" href="#/projets/${p.id}" style="--c:${p.color}">
          <div class="pc-top"><span class="pc-badge">${p.kind === 'formation' ? icon('book') : icon('folder')}</span><span class="pc-kind">${p.kind === 'formation' ? 'Formation' : 'Projet'}</span>${timer?.projectId === p.id ? '<span class="live-dot" title="Chrono en cours"></span>' : ''}</div>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || '')}</p>
          ${progressBar(s.pct, p.color)}
          <div class="pc-stats"><span>${icon('tasks')} ${s.open} à faire</span><span>${icon('target')} ${s.goals}</span><span>${icon('notes')} ${s.notes}</span><span>${icon('clock')} ${fmtDuration(s.min)}/7 j</span></div>
        </a>`;
      }).join('') || empty('folder', showArch ? 'Aucun projet archivé.' : 'Aucun projet.')}
    </div>`;
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) editProject().then(p => p && ctx.go('#/projets/' + p.id));
    const sg = e.target.closest('[data-suggest]');
    if (sg) { const { emoji, ...pr } = S.PROJECT_SUGGESTIONS[+sg.dataset.suggest]; editProject(pr).then(p => p && ctx.go('#/projets/' + p.id)); }
  });
}

function detail(el, ctx, p) {
  const tab = ctx.params.get('t') || 'apercu';
  const s = stats(p);
  const timer = S.getSettings().timer;
  const running = timer?.projectId === p.id;
  const tasks = S.all('tasks').filter(t => t.projectId === p.id);
  const goals = S.all('goals').filter(g => g.projectId === p.id);
  const t0 = todayStr();
  let body = '';
  if (tab === 'apercu') {
    const deadlines = [
      ...tasks.filter(t => t.status !== 'done' && t.dueDate).map(t => ({ d: t.dueDate, h: t.dueTime, label: t.title, kind: 'Tâche', ic: 'tasks', late: t.dueDate < t0 })),
      ...goals.filter(g => goalState(g) === 'active' && g.targetDate).map(g => ({ d: g.targetDate, label: g.title, kind: 'Objectif', ic: 'target' })),
      ...eventsBetween(t0, addDaysStr(t0, 30)).filter(o => o.projectId === p.id).map(o => ({ d: o.occ, h: o.start, label: o.title, kind: 'Activité', ic: 'calendar' })),
    ].sort((a, b) => (a.d + (a.h || '')).localeCompare(b.d + (b.h || ''))).slice(0, 10);
    const last = S.all('learnings').filter(l => l.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    body = `
      <div class="kpis">
        <div class="kpi"><b>${s.open}</b><span>tâches à faire</span></div>
        <div class="kpi"><b>${s.done}</b><span>tâches terminées</span></div>
        <div class="kpi"><b>${s.pct} %</b><span>avancement</span></div>
        <div class="kpi"><b>${fmtDuration(s.min)}</b><span>sur 7 jours</span></div>
      </div>
      <div class="two-col">
        <section class="card"><div class="card-head"><h2>${icon('flag')} Échéances</h2></div>
          ${deadlines.length ? `<ul class="deadlines">${deadlines.map(d => `<li class="${d.late ? 'late' : ''}">${icon(d.ic)}<div><b>${esc(d.label)}</b><small>${d.kind} · ${relDay(d.d)}${d.h ? ' · ' + d.h : ''}</small></div></li>`).join('')}</ul>` : empty('flag', 'Aucune échéance à venir.')}
        </section>
        <section class="card"><div class="card-head"><h2>${icon('target')} Objectifs</h2><button class="btn btn-sm" data-goal-new>${icon('plus')}</button></div>
          ${goals.filter(g => goalState(g) === 'active').map(g => `<div class="goal-mini" data-goal="${g.id}"><div class="row"><b>${esc(g.title)}</b><span class="muted">${g.progress || 0} %</span></div>${progressBar(g.progress || 0, p.color)}</div>`).join('') || empty('target', 'Aucun objectif en cours.')}
          ${p.kind === 'formation' ? `<div class="card-head mt"><h2>${icon('bulb')} Dernier apprentissage</h2><button class="btn btn-sm" data-learn-new>${icon('plus')}</button></div>${last ? `<div class="learn"><small class="muted">${relDay(last.date)}${last.title ? ' · ' + esc(last.title) : ''}</small><p>${esc(last.content.slice(0, 220))}</p></div>` : '<p class="muted small">Notez ce que vous apprenez après chaque séance.</p>'}` : ''}
        </section>
      </div>
      <section class="card"><div class="card-head"><h2>${icon('tasks')} Prochaines tâches</h2><button class="btn btn-sm" data-task-new>${icon('plus')} Tâche</button></div>
        ${sortTasks(tasks.filter(t => t.status !== 'done')).slice(0, 6).map(t => taskRow(t, { showProject: false })).join('') || empty('tasks', 'Aucune tâche en cours.')}
      </section>`;
  }
  if (tab === 'taches') {
    const open = sortTasks(tasks.filter(t => t.status !== 'done')), done = tasks.filter(t => t.status === 'done').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    body = `<div class="row-head"><h3>Non terminées (${open.length})</h3><button class="btn btn-primary btn-sm" data-task-new>${icon('plus')} Tâche</button></div>
      <div class="card card-flush">${open.map(t => taskRow(t, { showProject: false })).join('') || empty('tasks', 'Rien à faire ici.')}</div>
      <h3 class="mt">Terminées (${done.length})</h3><div class="card card-flush">${done.slice(0, 50).map(t => taskRow(t, { showProject: false })).join('') || empty('check', 'Aucune tâche terminée.')}</div>`;
  }
  if (tab === 'notes') {
    const notes = S.all('notes').filter(n => n.projectId === p.id).sort((a, b) => b.updatedAt - a.updatedAt);
    body = `<div class="row-head"><h3>Notes du projet (${notes.length})</h3><button class="btn btn-primary btn-sm" data-note-new>${icon('plus')} Note</button></div>
      <div class="note-cards">${notes.map(n => `<a class="note-card" href="#/notes/${n.id}"><b>${esc(n.title || 'Sans titre')}</b><div class="prose small">${renderNote((n.content || '').slice(0, 400))}</div><small class="muted">${timeAgo(n.updatedAt)}</small></a>`).join('') || empty('notes', 'Aucune note liée à ce projet.')}</div>`;
  }
  if (tab === 'objectifs') {
    const groups = [['active', 'En cours'], ['achieved', 'Atteints'], ['missed', 'Non atteints']];
    body = `<div class="row-head"><h3>Objectifs</h3><button class="btn btn-primary btn-sm" data-goal-new>${icon('plus')} Objectif</button></div>
      ${groups.map(([k, l]) => { const gs = goals.filter(g => goalState(g) === k); return gs.length ? `<h3 class="mt">${l} (${gs.length})</h3><div class="card">${gs.map(g => `<div class="goal-row" data-goal="${g.id}"><div class="row"><b>${esc(g.title)}</b><span class="goal-st st-${k}">${l.replace(/s$/, '')}</span></div>${progressBar(g.progress || 0, p.color)}<small class="muted">${g.progress || 0} % · ${g.targetDate ? 'échéance ' + relDay(g.targetDate) : 'sans échéance'}</small></div>`).join('')}</div>` : ''; }).join('') || empty('target', 'Aucun objectif. Fixez-vous un premier objectif !')}`;
  }
  if (tab === 'apprentissages') {
    const ls = S.all('learnings').filter(l => l.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    body = `<div class="row-head"><h3>Journal d'apprentissage (${ls.length})</h3><button class="btn btn-primary btn-sm" data-learn-new>${icon('plus')} Ce que j'ai appris</button></div>
      <div class="timeline">${ls.map(l => `<article class="tl-item" data-learn="${l.id}"><div class="tl-date">${fmtDate(l.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div><div class="card"><b>${esc(l.title || 'Séance')}</b><p class="pre">${esc(l.content)}</p>${l.next ? `<p class="muted small">À revoir : ${esc(l.next)}</p>` : ''}</div></article>`).join('') || empty('bulb', 'Notez ici ce que vous apprenez à chaque séance.')}</div>`;
  }
  if (tab === 'temps') {
    const logs = S.all('timelogs').filter(l => l.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date) || (b.end || 0) - (a.end || 0));
    const total = logs.reduce((a, l) => a + (l.minutes || 0), 0);
    const days = Array.from({ length: 14 }, (_, i) => addDaysStr(t0, i - 13));
    const per = days.map(d => logs.filter(l => l.date === d).reduce((a, l) => a + l.minutes, 0));
    const max = Math.max(60, ...per);
    body = `<div class="kpis"><div class="kpi"><b>${fmtDuration(s.min)}</b><span>7 derniers jours</span></div><div class="kpi"><b>${fmtDuration(total)}</b><span>au total</span></div><div class="kpi"><b>${logs.length}</b><span>sessions</span></div></div>
      <section class="card"><div class="card-head"><h2>14 derniers jours</h2><button class="btn btn-sm" data-time-add>${icon('plus')} Ajouter manuellement</button></div>
        <div class="bars">${days.map((d, i) => `<div class="bar-col" title="${relDay(d)} : ${fmtDuration(per[i])}"><span style="height:${per[i] / max * 100}%;background:${p.color}"></span><small>${+d.slice(8)}</small></div>`).join('')}</div></section>
      <section class="card card-flush">${logs.slice(0, 40).map(l => `<div class="log-row"><span>${relDay(l.date)}</span><b>${fmtDuration(l.minutes)}</b><span class="muted">${esc(l.note || '')}</span><button class="icon-btn sm" data-log-del="${l.id}" title="Supprimer">${icon('trash')}</button></div>`).join('') || empty('clock', 'Aucun temps enregistré. Lancez le chrono !')}</section>`;
  }
  if (tab === 'historique') {
    const h = S.all('history').filter(x => x.projectId === p.id).sort((a, b) => b.ts - a.ts).slice(0, 200);
    body = h.length ? `<div class="card card-flush">${h.map(x => `<div class="hist-row"><span class="muted">${timeAgo(x.ts)}</span><b>${esc(x.action)}</b><span>${esc(x.label)}</span></div>`).join('')}</div>` : empty('history', 'Aucune activité enregistrée pour ce projet.');
  }

  el.innerHTML = `
    <header class="proj-head" style="--c:${p.color}">
      <a href="#/projets" class="icon-btn" aria-label="Retour">${icon('left')}</a>
      <div class="ph-text"><span class="pc-kind">${p.kind === 'formation' ? 'Formation' : 'Projet'}${p.archived ? ' · archivé' : ''}</span><h1>${esc(p.name)}</h1>${p.description ? `<p class="sub">${esc(p.description)}</p>` : ''}</div>
      <div class="head-actions">
        <button class="btn ${running ? 'btn-danger' : 'btn-primary'}" data-timer>${icon(running ? 'stop' : 'play')}<span>${running ? '<span data-clock="timer">…</span>' : 'Chrono'}</span></button>
        <button class="icon-btn" data-edit title="Modifier">${icon('edit')}</button>
      </div>
    </header>
    <nav class="tabs-scroll proj-tabs">${tabs.filter(t => t[0] !== 'apprentissages' || p.kind === 'formation' || S.all('learnings').some(l => l.projectId === p.id)).map(([k, l, ic]) => `<a class="pill ${tab === k ? 'on' : ''}" href="#/projets/${p.id}?t=${k}">${icon(ic)}${l}</a>`).join('')}</nav>
    <div class="proj-body">${body}</div>`;

  el.addEventListener('click', async e => {
    const b = e.target.closest('button,[data-goal],[data-act],[data-learn]'); if (!b) return;
    if (b.hasAttribute('data-timer')) running ? stopTimer() : startTimer(p.id);
    else if (b.hasAttribute('data-edit')) editProject(p);
    else if (b.hasAttribute('data-task-new')) editTask({}, { projectId: p.id, category: p.kind === 'formation' ? 'formation' : '' });
    else if (b.hasAttribute('data-goal-new')) editGoal({}, { projectId: p.id });
    else if (b.hasAttribute('data-learn-new')) editLearning({}, p.id);
    else if (b.hasAttribute('data-note-new')) newNote({ projectId: p.id });
    else if (b.hasAttribute('data-time-add')) addTimeLog(p.id);
    else if (b.dataset.logDel) S.remove('timelogs', b.dataset.logDel);
    else if (b.dataset.goal) editGoal(S.get('goals', b.dataset.goal));
    else if (b.dataset.learn) editLearning(S.get('learnings', b.dataset.learn));
    else if (b.dataset.act === 'toggle-task') toggleTask(b.dataset.id);
    else if (b.dataset.act === 'edit-task' && !e.target.closest('a')) editTask(S.get('tasks', b.dataset.id));
  });
}

export default {
  title: 'Projets',
  render(el, params, ctx) {
    const id = ctx.parts[1];
    if (!id) return list(el, ctx);
    const p = S.get('projects', id);
    if (!p) { el.innerHTML = empty('folder', 'Projet introuvable.', '<a class="btn" href="#/projets">Retour</a>'); return; }
    detail(el, ctx, p);
  }
};
