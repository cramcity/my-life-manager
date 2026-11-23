import * as S from '../store.js';
import { esc, todayStr, addDaysStr, fmtDate, relDay, capital, pad, fmtDuration } from '../utils.js';
import { icon } from '../icons.js';
import { taskRow, empty, progressBar, sortTasks, goalState, catColor, projChip } from '../components.js';
import { nextAlarm, eventsBetween, occStart, isOverdue } from '../recur.js';
import { editTask, editEvent, editAlarm, editGoal, newNote, toggleTask } from '../editors.js';

export default {
  title: 'Accueil',
  render(el) {
    const st = S.getSettings();
    const now = new Date(), t = todayStr(), h = now.getHours();
    const hello = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    const tasks = S.all('tasks');
    const todayTasks = sortTasks(tasks.filter(x => x.status !== 'done' && x.dueDate === t));
    const overdue = sortTasks(tasks.filter(isOverdue));
    const doneToday = tasks.filter(x => x.status === 'done' && x.completedAt && new Date(x.completedAt).toDateString() === now.toDateString());
    const alarms = S.all('alarms').map(a => ({ a, at: nextAlarm(a, now) })).filter(x => x.at).sort((x, y) => x.at - y.at).slice(0, 4);
    const events = eventsBetween(t, addDaysStr(t, 14)).filter(o => occStart(o) >= new Date(now.getTime() - 30 * 60000)).slice(0, 6);
    const goals = S.all('goals').filter(g => goalState(g) === 'active').sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999')).slice(0, 5);
    const memo = S.all('notes').filter(n => n.category === 'À ne pas oublier').sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt).slice(0, 4);
    const timer = st.timer;
    const weekMin = S.all('timelogs').filter(l => l.date >= addDaysStr(t, -6)).reduce((s, l) => s + (l.minutes || 0), 0);
    const backupLate = !st.lastBackup || Date.now() - st.lastBackup > st.backupReminderDays * 864e5;

    el.innerHTML = `
    <section class="hero">
      <div>
        <p class="hero-date">${capital(fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        <h1>${hello}${st.name ? ', ' + esc(st.name) : ''} 👋</h1>
        <p class="sub">${todayTasks.length ? `${todayTasks.length} tâche${todayTasks.length > 1 ? 's' : ''} prévue${todayTasks.length > 1 ? 's' : ''} aujourd'hui` : "Aucune tâche prévue aujourd'hui"}${overdue.length ? ` · <b class="late">${overdue.length} en retard</b>` : ''} · ${doneToday.length} terminée${doneToday.length > 1 ? 's' : ''}</p>
      </div>
      <div class="hero-clock" data-clock="hm">${pad(h)}:${pad(now.getMinutes())}</div>
    </section>

    <div class="quick-row">
      <button class="quick" data-q="note">${icon('notes')}<span>Note</span></button>
      <button class="quick" data-q="task">${icon('tasks')}<span>Tâche</span></button>
      <button class="quick" data-q="event">${icon('calendar')}<span>Activité</span></button>
      <button class="quick" data-q="alarm">${icon('alarm')}<span>Alarme</span></button>
    </div>

    ${backupLate && S.all('notes').length + tasks.length > 3 && !st.syncOn ? `<div class="banner">${icon('shield')}<div><b>Pensez à sauvegarder</b><span>Dernière sauvegarde : ${st.lastBackup ? relDay(new Date(st.lastBackup).toISOString().slice(0, 10)) : 'jamais'}.</span></div><a class="btn btn-sm" href="#/reglages">Sauvegarder</a></div>` : ''}
    ${timer ? `<div class="banner banner-accent">${icon('clock')}<div><b>Chrono en cours</b><span>${esc(S.get('projects', timer.projectId)?.name || '')} · <span data-clock="timer">…</span></span></div><a class="btn btn-sm" href="#/projets/${timer.projectId}">Voir</a></div>` : ''}

    <div class="dash-grid">
      <section class="card">
        <div class="card-head"><h2>${icon('tasks')} Tâches du jour</h2><a href="#/taches" class="link">Tout voir</a></div>
        ${todayTasks.length ? todayTasks.map(x => taskRow(x)).join('') : empty('check', "Rien de prévu aujourd'hui.")}
      </section>

      <section class="card ${overdue.length ? 'card-alert' : ''}">
        <div class="card-head"><h2>${icon('alert')} En retard</h2><span class="count">${overdue.length}</span></div>
        ${overdue.length ? overdue.slice(0, 6).map(x => taskRow(x)).join('') + (overdue.length > 6 ? `<a class="link more" href="#/taches?f=late">+ ${overdue.length - 6} autres</a>` : '') : empty('sparkle', 'Aucune tâche en retard. Excellent !')}
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('calendar')} Prochains rendez-vous</h2><a href="#/agenda" class="link">Agenda</a></div>
        ${events.length ? `<ul class="agenda-list">${events.map(o => `
          <li data-ev="${o.id}" data-occ="${o.occ}"><span class="ag-bar" style="background:${catColor(o.category)}"></span>
            <div><b>${esc(o.title)}</b><small>${relDay(o.occ)} · ${o.start}${o.end ? '–' + o.end : ''}</small></div></li>`).join('')}</ul>` : empty('calendar', 'Aucun rendez-vous dans les 14 prochains jours.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('alarm')} Prochaines alarmes</h2><a href="#/alarmes" class="link">Gérer</a></div>
        ${alarms.length ? `<ul class="alarm-mini">${alarms.map(({ a, at }) => `<li><span class="big-time">${pad(at.getHours())}:${pad(at.getMinutes())}</span><div><b>${esc(a.title)}</b><small>${relDay(at.toISOString ? `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` : '')}${a.snoozeUntil ? ' · reportée' : ''}</small></div></li>`).join('')}</ul>` : empty('alarm', 'Aucune alarme active.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('target')} Objectifs en cours</h2><a href="#/suivi" class="link">Suivi</a></div>
        ${goals.length ? goals.map(g => `<div class="goal-mini" data-goal="${g.id}"><div class="row"><b>${esc(g.title)}</b><span class="muted">${g.progress || 0} %</span></div>${progressBar(g.progress || 0, S.get('projects', g.projectId)?.color)}<small class="muted">${g.targetDate ? 'Échéance : ' + relDay(g.targetDate) : 'Sans échéance'} ${projChip(g.projectId)}</small></div>`).join('') : empty('target', 'Aucun objectif en cours.', '<button class="btn btn-sm" data-q="goal">Créer un objectif</button>')}
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('star')} À ne pas oublier</h2><a href="#/notes?c=${encodeURIComponent('À ne pas oublier')}" class="link">Notes</a></div>
        ${memo.length ? memo.map(n => `<a class="memo" href="#/notes/${n.id}"><b>${esc(n.title || 'Sans titre')}</b><small>${esc((n.content || '').replace(/[#\-\[\]x]/g, '').slice(0, 110))}</small></a>`).join('') : empty('star', 'Rien pour le moment.')}
        <div class="stat-line">${icon('clock')} ${fmtDuration(weekMin)} consacrées à vos projets ces 7 derniers jours</div>
      </section>
    </div>`;

    el.addEventListener('click', e => {
      const q = e.target.closest('[data-q]')?.dataset.q;
      if (q === 'note') newNote();
      if (q === 'task') editTask({}, { dueDate: t });
      if (q === 'event') editEvent();
      if (q === 'alarm') editAlarm();
      if (q === 'goal') editGoal();
      const act = e.target.closest('[data-act]');
      if (act?.dataset.act === 'toggle-task') toggleTask(act.dataset.id);
      if (act?.dataset.act === 'edit-task') { if (!e.target.closest('a')) editTask(S.get('tasks', act.dataset.id)); }
      const ev = e.target.closest('[data-ev]');
      if (ev) editEvent(S.get('events', ev.dataset.ev), { occ: ev.dataset.occ });
      const g = e.target.closest('[data-goal]');
      if (g && !e.target.closest('a')) editGoal(S.get('goals', g.dataset.goal));
    });
  }
};
