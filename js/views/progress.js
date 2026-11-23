import * as S from '../store.js';
import { esc, todayStr, addDaysStr, ymd, startOfWeek, parseYMD, fmtDate, relDay, fmtDuration, timeAgo, toast, capital } from '../utils.js';
import { icon } from '../icons.js';
import { empty, pageHead, progressBar, goalState, projChip } from '../components.js';
import { editGoal, editLearning } from '../editors.js';

const st = { tab: 'jour', day: todayStr(), week: ymd(startOfWeek(new Date())), hType: '' };
const doneOn = d => S.all('tasks').filter(t => t.status === 'done' && t.completedAt && ymd(new Date(t.completedAt)) === d);
const minutesOn = (from, to) => S.all('timelogs').filter(l => l.date >= from && l.date <= to);

function streak() {
  let n = 0, d = todayStr();
  if (!doneOn(d).length && !S.all('reviews').some(r => r.type === 'day' && r.date === d)) d = addDaysStr(d, -1);
  while (doneOn(d).length || S.all('reviews').some(r => r.type === 'day' && r.date === d)) { n++; d = addDaysStr(d, -1); if (n > 999) break; }
  return n;
}

function overview() {
  const t = todayStr(), wk = ymd(startOfWeek(new Date()));
  const doneToday = doneOn(t).length;
  const doneWeek = S.all('tasks').filter(x => x.status === 'done' && x.completedAt && ymd(new Date(x.completedAt)) >= wk).length;
  const goals = S.all('goals');
  const achieved = goals.filter(g => goalState(g) === 'achieved').length, missed = goals.filter(g => goalState(g) === 'missed').length, active = goals.filter(g => goalState(g) === 'active').length;
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(wk, i));
  const per = days.map(d => doneOn(d).length);
  const max = Math.max(3, ...per);
  const logs = minutesOn(wk, addDaysStr(wk, 6));
  const byProj = {};
  logs.forEach(l => byProj[l.projectId] = (byProj[l.projectId] || 0) + l.minutes);
  const projRows = Object.entries(byProj).sort((a, b) => b[1] - a[1]);
  const maxP = Math.max(1, ...projRows.map(r => r[1]));
  return `
    <div class="kpis">
      <div class="kpi"><b>${doneToday}</b><span>tâches réalisées aujourd'hui</span></div>
      <div class="kpi"><b>${doneWeek}</b><span>cette semaine</span></div>
      <div class="kpi kpi-ok"><b>${achieved}</b><span>objectifs atteints</span></div>
      <div class="kpi kpi-bad"><b>${missed}</b><span>objectifs non atteints</span></div>
      <div class="kpi"><b>${active}</b><span>objectifs en cours</span></div>
      <div class="kpi"><b>🔥 ${streak()}</b><span>jour(s) d'affilée actif(s)</span></div>
    </div>
    <div class="two-col">
      <section class="card"><div class="card-head"><h2>${icon('chart')} Tâches réalisées cette semaine</h2></div>
        <div class="bars bars-lg">${days.map((d, i) => `<div class="bar-col ${d === t ? 'today' : ''}" title="${per[i]} tâche(s)"><em>${per[i] || ''}</em><span style="height:${per[i] / max * 100}%"></span><small>${fmtDate(d, { weekday: 'short' }).slice(0, 3)}</small></div>`).join('')}</div>
      </section>
      <section class="card"><div class="card-head"><h2>${icon('clock')} Temps par projet (semaine)</h2></div>
        ${projRows.length ? projRows.map(([pid, m]) => { const p = S.get('projects', pid); return `<div class="hbar"><span class="hb-label">${esc(p?.name || 'Projet supprimé')}</span><div class="hb-track"><span style="width:${m / maxP * 100}%;background:${p?.color || 'var(--accent)'}"></span></div><b>${fmtDuration(m)}</b></div>`; }).join('') : empty('clock', 'Aucun temps enregistré cette semaine. Lancez le chrono depuis un projet.')}
      </section>
    </div>`;
}

function reviewForm(type, key) {
  const r = S.all('reviews').find(x => x.type === type && x.date === key) || {};
  const fields = type === 'day'
    ? [['wins', "Ce que j'ai accompli"], ['learned', "Ce que j'ai appris"], ['blocks', "Ce qui m'a freiné"], ['tomorrow', 'Mes 3 priorités pour demain']]
    : [['wins', 'Mes victoires de la semaine'], ['improve', 'Ce que je dois améliorer'], ['learned', 'Ce que j\'ai appris'], ['next', 'Mes objectifs pour la semaine prochaine']];
  return `<form class="review" data-review="${type}" data-key="${key}">
    ${fields.map(([k, l]) => `<label class="field full"><span>${l}</span><textarea class="input" rows="3" name="${k}">${esc(r[k] || '')}</textarea></label>`).join('')}
    <div class="field full"><span>Discipline ${type === 'day' ? 'du jour' : 'de la semaine'}</span><div class="score">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${r.score >= n ? 'on' : ''}" data-score="${n}" aria-label="${n} sur 5">★</button>`).join('')}</div><input type="hidden" name="score" value="${r.score || ''}"></div>
    <div class="row-end"><span class="muted small">${r.updatedAt ? 'Enregistré ' + timeAgo(r.updatedAt) : ''}</span><button class="btn btn-primary" type="submit">${icon('check')} Enregistrer le bilan</button></div>
  </form>`;
}

function dayTab() {
  const d = st.day;
  const done = doneOn(d);
  const late = S.all('tasks').filter(t => t.status !== 'done' && t.dueDate && t.dueDate <= d);
  const planned = S.all('tasks').filter(t => t.dueDate === d);
  const mins = minutesOn(d, d).reduce((a, l) => a + l.minutes, 0);
  const learned = S.all('learnings').filter(l => l.date === d);
  return `
    <div class="date-nav"><button class="icon-btn" data-day="-1">${icon('left')}</button><b>${capital(relDay(d))} — ${fmtDate(d, { day: 'numeric', month: 'long' })}</b><button class="icon-btn" data-day="1" ${d >= todayStr() ? 'disabled' : ''}>${icon('right')}</button></div>
    <div class="kpis"><div class="kpi"><b>${done.length}</b><span>tâches réalisées</span></div><div class="kpi"><b>${planned.length ? Math.round(planned.filter(t => t.status === 'done').length / planned.length * 100) : 0} %</b><span>des tâches prévues</span></div><div class="kpi"><b>${fmtDuration(mins)}</b><span>temps de travail</span></div><div class="kpi ${late.length ? 'kpi-bad' : ''}"><b>${late.length}</b><span>en attente / en retard</span></div></div>
    <div class="two-col">
      <section class="card"><div class="card-head"><h2>${icon('check')} Réalisé</h2></div>${done.length ? `<ul class="done-list">${done.map(t => `<li>${icon('check')}<span>${esc(t.title)}</span>${projChip(t.projectId)}</li>`).join('')}</ul>` : empty('check', 'Aucune tâche terminée ce jour-là.')}
        ${learned.length ? `<div class="card-head mt"><h2>${icon('bulb')} Appris</h2></div>${learned.map(l => `<p class="small"><b>${esc(S.get('projects', l.projectId)?.name || '')}</b> — ${esc(l.content.slice(0, 160))}</p>`).join('')}` : ''}
      </section>
      <section class="card"><div class="card-head"><h2>${icon('edit')} Bilan quotidien</h2></div>${reviewForm('day', d)}</section>
    </div>`;
}
function weekTab() {
  const a = st.week, b = addDaysStr(a, 6);
  const done = S.all('tasks').filter(t => t.status === 'done' && t.completedAt && ymd(new Date(t.completedAt)) >= a && ymd(new Date(t.completedAt)) <= b);
  const mins = minutesOn(a, b).reduce((s, l) => s + l.minutes, 0);
  const gAch = S.all('goals').filter(g => g.achievedAt && ymd(new Date(g.achievedAt)) >= a && ymd(new Date(g.achievedAt)) <= b);
  const reviews = S.all('reviews').filter(r => r.type === 'day' && r.date >= a && r.date <= b);
  const avg = reviews.filter(r => r.score).length ? (reviews.reduce((s, r) => s + (r.score || 0), 0) / reviews.filter(r => r.score).length).toFixed(1) : '–';
  return `
    <div class="date-nav"><button class="icon-btn" data-week="-1">${icon('left')}</button><b>Semaine du ${fmtDate(a, { day: 'numeric', month: 'short' })} au ${fmtDate(b, { day: 'numeric', month: 'short' })}</b><button class="icon-btn" data-week="1" ${b >= todayStr() ? 'disabled' : ''}>${icon('right')}</button></div>
    <div class="kpis"><div class="kpi"><b>${done.length}</b><span>tâches réalisées</span></div><div class="kpi kpi-ok"><b>${gAch.length}</b><span>objectifs atteints</span></div><div class="kpi"><b>${fmtDuration(mins)}</b><span>temps consacré</span></div><div class="kpi"><b>${reviews.length}/7</b><span>bilans quotidiens</span></div><div class="kpi"><b>${avg}</b><span>discipline moyenne</span></div></div>
    <div class="two-col">
      <section class="card"><div class="card-head"><h2>${icon('check')} Réalisations</h2></div>${done.length ? `<ul class="done-list">${done.slice(0, 30).map(t => `<li>${icon('check')}<span>${esc(t.title)}</span>${projChip(t.projectId)}</li>`).join('')}</ul>` : empty('check', 'Aucune tâche terminée cette semaine.')}</section>
      <section class="card"><div class="card-head"><h2>${icon('edit')} Bilan hebdomadaire</h2></div>${reviewForm('week', a)}</section>
    </div>`;
}
function goalsTab() {
  const gs = S.all('goals');
  const g = k => gs.filter(x => goalState(x) === k);
  const block = (k, l) => `<h3 class="mt">${l} (${g(k).length})</h3><div class="card">${g(k).map(x => `<div class="goal-row" data-goal="${x.id}"><div class="row"><b>${esc(x.title)}</b>${projChip(x.projectId)}</div>${progressBar(x.progress || 0, S.get('projects', x.projectId)?.color)}<small class="muted">${x.progress || 0} % · ${x.targetDate ? 'échéance ' + relDay(x.targetDate) : 'sans échéance'}</small></div>`).join('') || '<p class="muted small">Aucun.</p>'}</div>`;
  return `<div class="row-head"><h3>Tous mes objectifs</h3><button class="btn btn-primary btn-sm" data-goal-new>${icon('plus')} Objectif</button></div>${block('active', 'En cours')}${block('achieved', 'Atteints')}${block('missed', 'Non atteints')}`;
}
const TYPES = [['', 'Tout'], ['task', 'Tâches'], ['note', 'Notes'], ['event', 'Agenda'], ['alarm', 'Alarmes'], ['goal', 'Objectifs'], ['time', 'Temps'], ['learning', 'Apprentissages'], ['project', 'Projets']];
function historyTab() {
  const h = S.all('history').filter(x => !st.hType || x.type === st.hType).sort((a, b) => b.ts - a.ts).slice(0, 400);
  const byDay = {};
  h.forEach(x => (byDay[x.day || ymd(new Date(x.ts))] ||= []).push(x));
  return `<div class="tabs-scroll">${TYPES.map(([k, l]) => `<button class="pill ${st.hType === k ? 'on' : ''}" data-htype="${k}">${l}</button>`).join('')}</div>
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, items]) => `<h3 class="mt">${capital(relDay(d))}</h3><div class="card card-flush">${items.map(x => `<div class="hist-row"><span class="muted">${new Date(x.ts).toTimeString().slice(0, 5)}</span><b>${esc(x.action)}</b><span>${esc(x.label)}</span>${projChip(x.projectId)}</div>`).join('')}</div>`).join('') : empty('history', "L'historique se remplit au fil de vos actions.")}`;
}
function learnTab() {
  const ls = S.all('learnings').sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="row-head"><h3>Tout ce que j'ai appris (${ls.length})</h3><button class="btn btn-primary btn-sm" data-learn-new>${icon('plus')} Ajouter</button></div>
    <div class="timeline">${ls.map(l => `<article class="tl-item" data-learn="${l.id}"><div class="tl-date">${fmtDate(l.date, { day: 'numeric', month: 'short' })}</div><div class="card"><div class="row"><b>${esc(l.title || 'Séance')}</b>${projChip(l.projectId)}</div><p class="pre">${esc(l.content)}</p></div></article>`).join('') || empty('bulb', 'Rien pour le moment.')}</div>`;
}

function render(el, params, ctx) {
  const T = [['jour', 'Bilan du jour'], ['semaine', 'Bilan de la semaine'], ['objectifs', 'Objectifs'], ['appris', 'Apprentissages'], ['historique', 'Historique']];
  if (params.get('t')) st.tab = params.get('t');
  el.innerHTML = `
    ${pageHead('Suivi et discipline', '', 'Mesurez vos progrès, faites le bilan, restez régulier.')}
    ${overview()}
    <nav class="tabs-scroll mt">${T.map(([k, l]) => `<button class="pill ${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>
    <div class="tab-body">${st.tab === 'jour' ? dayTab() : st.tab === 'semaine' ? weekTab() : st.tab === 'objectifs' ? goalsTab() : st.tab === 'appris' ? learnTab() : historyTab()}</div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('button,[data-goal],[data-learn]'); if (!b) return;
    if (b.dataset.tab) { st.tab = b.dataset.tab; ctx.rerender(); }
    else if (b.dataset.day) { st.day = addDaysStr(st.day, +b.dataset.day); ctx.rerender(); }
    else if (b.dataset.week) { st.week = addDaysStr(st.week, 7 * b.dataset.week); ctx.rerender(); }
    else if (b.dataset.htype != null && b.hasAttribute('data-htype')) { st.hType = b.dataset.htype; ctx.rerender(); }
    else if (b.dataset.score) { const f = b.closest('form'); f.querySelector('[name=score]').value = b.dataset.score; f.querySelectorAll('[data-score]').forEach(x => x.classList.toggle('on', +x.dataset.score <= +b.dataset.score)); }
    else if (b.hasAttribute('data-goal-new')) editGoal();
    else if (b.hasAttribute('data-learn-new')) editLearning({}, null);
    else if (b.dataset.goal) editGoal(S.get('goals', b.dataset.goal));
    else if (b.dataset.learn) editLearning(S.get('learnings', b.dataset.learn));
  });
  el.addEventListener('submit', async e => {
    const f = e.target.closest('[data-review]'); if (!f) return;
    e.preventDefault();
    const type = f.dataset.review, date = f.dataset.key;
    const vals = Object.fromEntries(new FormData(f).entries());
    vals.score = vals.score ? +vals.score : null;
    const ex = S.all('reviews').find(x => x.type === type && x.date === date);
    await S.put('reviews', { ...(ex || {}), type, date, ...vals });
    S.log(type === 'day' ? 'Bilan quotidien' : 'Bilan hebdomadaire', relDay(date), { type: 'review' });
    toast('Bilan enregistré 💪');
  });
}
export default { title: 'Suivi', render, keepWhileEditing: true };
