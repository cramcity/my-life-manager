// Formulaires de création / modification partagés entre les écrans.
import * as S from './store.js';
import { shareTask } from './share.js';
import { formModal, toast, todayStr, addDaysStr, hm2min, min2hm, choiceBox, confirmBox, nowHM, promptBox, esc } from './utils.js';
import { PRIORITIES, STATUSES, catOptions, projectOptions } from './components.js';
import { REPEATS, REMIND_CHOICES, remindersOf } from './recur.js';
import { SOUNDS, previewSound } from './alarm-engine.js';
import { exportICS, shortcutAlarmURL, shortcutReminderURL } from './ics.js';
import { CATEGORY_COLORS } from './store.js';

/* ---------- Tâches ---------- */
export async function editTask(task = {}, defaults = {}) {
  const t = { priority: 'normal', status: 'todo', category: '', projectId: '', reminders: [], ...defaults, ...task };
  const isNew = !t.id;
  const fields = [
    { name: 'title', label: 'Titre', value: t.title, required: true, full: true, autofocus: true, placeholder: 'Que faut-il faire ?' },
    { name: 'description', label: 'Description', type: 'textarea', value: t.description, full: true, rows: 3 },
    { name: 'dueDate', label: 'Date limite', type: 'date', value: t.dueDate },
    { name: 'dueTime', label: 'Heure (facultative)', type: 'time', value: t.dueTime },
    { name: 'priority', label: 'Priorité', type: 'select', options: PRIORITIES, value: t.priority },
    { name: 'status', label: 'Statut', type: 'select', options: STATUSES, value: t.status },
    { name: 'category', label: 'Catégorie', type: 'select', options: catOptions(), value: t.category },
    { name: 'projectId', label: 'Projet', type: 'select', options: projectOptions(), value: t.projectId || '' },
    { name: 'reminders', label: 'Me prévenir avant (plusieurs choix possibles)', type: 'chips', options: REMIND_CHOICES, value: remindersOf(t), full: true, hint: "Nécessite une heure. Notification sur l'iPhone, et sonnerie si l'app est ouverte." },
  ];
  const extra = [];
  if (!isNew) extra.push({ label: 'Supprimer', action: 'delete', danger: true, icon: 'trash' });
  extra.push({ label: 'Partager', action: 'share', icon: 'share' });
  extra.push({ label: 'iPhone', action: 'iphone', icon: 'phone' });
  const r = await formModal({ title: isNew ? 'Nouvelle tâche' : 'Modifier la tâche', fields, extraButtons: extra });
  if (!r) return null;
  if (r.action === 'delete') {
    if (!await confirmBox(`Supprimer la tâche « ${t.title} » ?`, { ok: 'Supprimer', danger: true })) return null;
    await S.remove('tasks', t.id); S.log('Tâche supprimée', t.title, { type: 'task', projectId: t.projectId });
    toast('Tâche supprimée'); return null;
  }
  const v = r.values;
  if (!v.title) { toast('Le titre est obligatoire', { type: 'warn' }); return null; }
  const rec = { ...t, ...v, reminder: null, projectId: v.projectId || null };
  if (rec.status === 'done' && !t.completedAt) rec.completedAt = Date.now();
  if (rec.status !== 'done') rec.completedAt = null;
  const saved = await S.put('tasks', rec);
  S.log(isNew ? 'Tâche créée' : 'Tâche modifiée', saved.title, { type: 'task', projectId: saved.projectId });
  if (r.action === 'iphone') await sendTaskToIphone(saved);
  else if (r.action === 'share') { toast(isNew ? 'Tâche ajoutée' : 'Tâche enregistrée'); await shareTask(saved); }
  else toast(isNew ? 'Tâche ajoutée' : 'Tâche enregistrée');
  return saved;
}
export async function sendTaskToIphone(t) {
  if (!t.dueDate) { toast('Ajoutez une date limite pour créer un rappel iPhone.', { type: 'warn' }); return; }
  const c = await choiceBox('Créer un rappel natif sur l\'iPhone (fonctionne même téléphone verrouillé) :', [
    { label: 'Calendrier (.ics)', value: 'ics', primary: true },
    { label: 'App Rappels (Raccourci)', value: 'sc' },
    { label: 'Annuler', value: null }], 'Rappel iPhone');
  if (c === 'ics') exportICS('task', t);
  if (c === 'sc') location.href = shortcutReminderURL(t.title, t.dueDate, t.dueTime, t.description || '');
}
export async function toggleTask(id) {
  const t = S.get('tasks', id); if (!t) return;
  const done = t.status !== 'done';
  await S.patch('tasks', id, { status: done ? 'done' : 'todo', completedAt: done ? Date.now() : null });
  S.log(done ? 'Tâche terminée' : 'Tâche rouverte', t.title, { type: 'task', projectId: t.projectId });
  if (done) toast('Bravo, tâche terminée !', { action: { label: 'Annuler', fn: () => toggleTask(id) } });
}
export async function postponeTask(id) {
  const t = S.get('tasks', id); if (!t) return;
  const d = await promptBox('Reporter la tâche', { type: 'date', label: 'Nouvelle date', value: addDaysStr(t.dueDate && t.dueDate > todayStr() ? t.dueDate : todayStr(), 1), ok: 'Reporter' });
  if (!d) return;
  await S.patch('tasks', id, { status: 'postponed', dueDate: d });
  S.log('Tâche reportée', `${t.title} → ${d}`, { type: 'task', projectId: t.projectId });
}

/* ---------- Activités du calendrier ---------- */
export async function editEvent(ev = {}, { occ, defaults = {} } = {}) {
  const now = new Date();
  const startDef = min2hm(Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30, 23 * 60));
  const e = { date: todayStr(), start: startDef, end: min2hm(Math.min(hm2min(startDef) + 60, 1439)), category: '', repeat: 'none', reminders: [60, 10], ...defaults, ...ev };
  const isNew = !e.id;
  const recurring = e.repeat && e.repeat !== 'none';
  const fields = [
    { name: 'title', label: 'Titre', value: e.title, required: true, full: true, autofocus: true, placeholder: 'Rendez-vous, séance, réunion…' },
    { name: 'date', label: recurring ? 'Date de début de la série' : 'Date', type: 'date', value: e.date, required: true },
    { name: 'category', label: 'Catégorie', type: 'select', options: catOptions(), value: e.category },
    { name: 'start', label: 'Heure de début', type: 'time', value: e.start, required: true },
    { name: 'end', label: 'Heure de fin', type: 'time', value: e.end },
    { name: 'repeat', label: 'Répétition', type: 'select', options: REPEATS, value: e.repeat },
    { name: 'repeatUntil', label: "Répéter jusqu'au (facultatif)", type: 'date', value: e.repeatUntil },
    { name: 'reminders', label: 'Me prévenir avant (plusieurs choix possibles)', type: 'chips', options: REMIND_CHOICES, value: remindersOf(e), full: true },
    { name: 'projectId', label: 'Projet', type: 'select', options: projectOptions(), value: e.projectId || '' },
    { name: 'description', label: 'Description', type: 'textarea', value: e.description, full: true },
  ];
  const extra = [];
  if (!isNew) extra.push({ label: 'Supprimer', action: 'delete', danger: true, icon: 'trash' }, { label: 'Dupliquer', action: 'dup', icon: 'copy' });
  extra.push({ label: 'Calendrier iPhone', action: 'ics', icon: 'phone' });
  const r = await formModal({
    title: isNew ? 'Nouvelle activité' : "Modifier l'activité", fields, extraButtons: extra,
    validate: v => v.end && v.end <= v.start ? "L'heure de fin doit être après l'heure de début." : null,
  });
  if (!r) return null;
  if (r.action === 'delete') {
    if (recurring && occ) {
      const c = await choiceBox('Cette activité se répète.', [{ label: 'Annuler', value: null }, { label: 'Cette occurrence', value: 'one' }, { label: 'Toute la série', value: 'all', danger: true }], 'Supprimer');
      if (!c) return null;
      if (c === 'one') { await S.patch('events', e.id, { exceptions: [...(e.exceptions || []), occ] }); toast('Occurrence supprimée'); return null; }
    } else if (!await confirmBox(`Supprimer « ${e.title} » ?`, { ok: 'Supprimer', danger: true })) return null;
    await S.remove('events', e.id); S.log('Activité supprimée', e.title, { type: 'event', projectId: e.projectId });
    toast('Activité supprimée'); return null;
  }
  const v = r.values;
  const rec = { ...e, ...v, reminder: null, projectId: v.projectId || null };
  if (r.action === 'dup') { delete rec.id; delete rec.exceptions; }
  const saved = await S.put('events', rec);
  S.log(isNew || r.action === 'dup' ? 'Activité créée' : 'Activité modifiée', `${saved.title} (${saved.date} ${saved.start})`, { type: 'event', projectId: saved.projectId });
  if (r.action === 'ics') exportICS('event', saved); else toast('Activité enregistrée');
  return saved;
}
// Déplacement (glisser-déposer) d'une occurrence
export async function moveEvent(id, occ, newDate, newStart, newEnd) {
  const e = S.get('events', id); if (!e) return;
  if (e.repeat && e.repeat !== 'none') {
    const c = await choiceBox('Cette activité se répète. Que voulez-vous déplacer ?', [{ label: 'Annuler', value: null }, { label: 'Cette occurrence', value: 'one', primary: true }, { label: 'Toute la série', value: 'all' }], 'Déplacer');
    if (!c) return;
    if (c === 'one') {
      await S.patch('events', id, { exceptions: [...(e.exceptions || []), occ] });
      const { id: _, exceptions, ...copy } = e;
      await S.put('events', { ...copy, repeat: 'none', repeatUntil: '', date: newDate, start: newStart, end: newEnd, seriesId: id });
      return;
    }
    const delta = Math.round((new Date(newDate) - new Date(occ)) / 864e5);
    await S.patch('events', id, { date: addDaysStr(e.date, delta), start: newStart, end: newEnd });
    return;
  }
  await S.patch('events', id, { date: newDate, start: newStart, end: newEnd });
  S.log('Activité déplacée', `${e.title} → ${newDate} ${newStart}`, { type: 'event', projectId: e.projectId });
}

/* ---------- Alarmes ---------- */
export async function editAlarm(al = {}) {
  const a = { time: nowHM(), days: [], sound: S.getSettings().defaultSound, enabled: true, ...al };
  const isNew = !a.id;
  const fields = [
    { name: 'time', label: 'Heure', type: 'time', value: a.time, required: true },
    { name: 'title', label: 'Titre', value: a.title, placeholder: 'Réveil, médicament, appel…', autofocus: true },
    { name: 'days', label: 'Répétition', type: 'days', value: a.days, full: true },
    { name: '_presets', type: 'html', full: true, html: `<div class="preset-row"><button type="button" class="btn btn-sm" data-preset="all">Tous les jours</button><button type="button" class="btn btn-sm" data-preset="week">Lun–Ven</button><button type="button" class="btn btn-sm" data-preset="we">Week-end</button><button type="button" class="btn btn-sm" data-preset="none">Une seule fois</button></div><small class="hint">Aucun jour sélectionné = alarme unique (prochaine occurrence de l'heure choisie).</small>` },
    { name: 'sound', label: 'Son', type: 'select', options: SOUNDS, value: a.sound },
    { name: '_test', type: 'html', html: `<label class="field"><span>&nbsp;</span><button type="button" class="btn" data-preview>▶︎ Écouter</button></label>` },
    { name: 'description', label: 'Description', type: 'textarea', value: a.description, full: true, rows: 2 },
    { name: 'enabled', label: 'Alarme activée', type: 'checkbox', value: a.enabled, full: true },
  ];
  const extra = [];
  if (!isNew) extra.push({ label: 'Supprimer', action: 'delete', danger: true, icon: 'trash' });
  extra.push({ label: 'Horloge iPhone', action: 'clock', icon: 'phone' });
  const r = await formModal({
    title: isNew ? 'Nouvelle alarme' : "Modifier l'alarme", fields, extraButtons: extra,
    onMount(el, form) {
      const sets = { all: [0, 1, 2, 3, 4, 5, 6], week: [1, 2, 3, 4, 5], we: [0, 6], none: [] };
      el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => el.querySelectorAll('.day-chip').forEach(c => c.classList.toggle('on', sets[b.dataset.preset].includes(+c.dataset.d))));
      el.querySelector('[data-preview]').onclick = () => previewSound(form.querySelector('[name=sound]').value);
    }
  });
  if (!r) return null;
  if (r.action === 'delete') {
    if (!await confirmBox(`Supprimer l'alarme de ${a.time} ?`, { ok: 'Supprimer', danger: true })) return null;
    await S.remove('alarms', a.id); toast('Alarme supprimée'); return null;
  }
  const saved = await S.put('alarms', { ...a, ...r.values, title: r.values.title || 'Alarme', snoozeUntil: null });
  S.log(isNew ? 'Alarme créée' : 'Alarme modifiée', `${saved.time} — ${saved.title}`, { type: 'alarm' });
  if (r.action === 'clock') location.href = shortcutAlarmURL(saved);
  else toast('Alarme enregistrée');
  return saved;
}

/* ---------- Projets ---------- */
export async function editProject(pr = {}) {
  const p = { kind: 'projet', color: CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)], ...pr };
  const isNew = !p.id;
  const r = await formModal({
    title: isNew ? 'Nouveau projet' : 'Modifier le projet',
    fields: [
      { name: 'name', label: 'Nom', value: p.name, required: true, full: true, autofocus: true },
      { name: 'kind', label: 'Type', type: 'select', value: p.kind, options: [{ value: 'projet', label: 'Projet' }, { value: 'formation', label: 'Formation' }] },
      { name: 'color', label: 'Couleur', type: 'colors', value: p.color, options: CATEGORY_COLORS },
      { name: 'description', label: 'Description', type: 'textarea', value: p.description, full: true },
      ...(isNew ? [] : [{ name: 'archived', label: 'Archiver ce projet', type: 'checkbox', value: p.archived, full: true }]),
    ],
    extraButtons: isNew ? [] : [{ label: 'Supprimer', action: 'delete', danger: true, icon: 'trash' }],
  });
  if (!r) return null;
  if (r.action === 'delete') {
    if (!await confirmBox(`Supprimer le projet « ${p.name} » ? Les tâches et notes liées sont conservées mais détachées.`, { ok: 'Supprimer', danger: true })) return null;
    await S.remove('projects', p.id); S.log('Projet supprimé', p.name, { type: 'project' });
    location.hash = '#/projets'; return null;
  }
  const saved = await S.put('projects', { ...p, ...r.values, order: p.order ?? S.all('projects').length });
  S.log(isNew ? 'Projet créé' : 'Projet modifié', saved.name, { type: 'project', projectId: saved.id });
  return saved;
}

/* ---------- Objectifs ---------- */
export async function editGoal(g0 = {}, defaults = {}) {
  const g = { status: 'active', progress: 0, ...defaults, ...g0 };
  const isNew = !g.id;
  const r = await formModal({
    title: isNew ? 'Nouvel objectif' : "Modifier l'objectif",
    fields: [
      { name: 'title', label: 'Objectif', value: g.title, required: true, full: true, autofocus: true, placeholder: 'Ex. : Publier 4 vidéos ce mois-ci' },
      { name: 'targetDate', label: 'Échéance', type: 'date', value: g.targetDate },
      { name: 'projectId', label: 'Projet', type: 'select', options: projectOptions(), value: g.projectId || '' },
      { name: 'progress', label: 'Progression', type: 'range', value: g.progress, min: 0, max: 100, step: 5, suffix: ' %', full: true },
      { name: 'status', label: 'État', type: 'select', value: g.status, options: [{ value: 'active', label: 'En cours' }, { value: 'achieved', label: 'Atteint' }, { value: 'missed', label: 'Non atteint' }] },
      { name: 'description', label: 'Détails', type: 'textarea', value: g.description, full: true, rows: 2 },
    ],
    extraButtons: isNew ? [] : [{ label: 'Supprimer', action: 'delete', danger: true, icon: 'trash' }],
  });
  if (!r) return null;
  if (r.action === 'delete') { await S.remove('goals', g.id); toast('Objectif supprimé'); return null; }
  const v = r.values;
  if (v.progress >= 100 && v.status === 'active') v.status = 'achieved';
  const rec = { ...g, ...v, projectId: v.projectId || null };
  if (rec.status === 'achieved' && !g.achievedAt) rec.achievedAt = Date.now();
  const saved = await S.put('goals', rec);
  if (saved.status === 'achieved' && g.status !== 'achieved') { S.log('Objectif atteint', saved.title, { type: 'goal', projectId: saved.projectId }); toast('🎯 Objectif atteint, bravo !'); }
  else S.log(isNew ? 'Objectif créé' : 'Objectif modifié', saved.title, { type: 'goal', projectId: saved.projectId });
  return saved;
}

/* ---------- Temps et apprentissages ---------- */
export async function startTimer(projectId) {
  const cur = S.getSettings().timer;
  if (cur) await stopTimer();
  await S.setSettings({ timer: { projectId, start: Date.now() } });
  S.log('Chrono démarré', S.get('projects', projectId)?.name || '', { type: 'time', projectId });
}
export async function stopTimer() {
  const cur = S.getSettings().timer; if (!cur) return;
  const minutes = Math.round((Date.now() - cur.start) / 60000);
  await S.setSettings({ timer: null });
  if (minutes >= 1) {
    await S.put('timelogs', { projectId: cur.projectId, date: todayStr(), minutes, start: cur.start, end: Date.now(), note: '' });
    S.log('Temps enregistré', `${minutes} min — ${S.get('projects', cur.projectId)?.name || ''}`, { type: 'time', projectId: cur.projectId });
    toast(`${minutes} min enregistrées`);
  } else toast('Moins d\'une minute : non enregistré');
}
export async function addTimeLog(projectId) {
  const r = await formModal({
    title: 'Ajouter du temps', wide: false,
    fields: [
      { name: 'projectId', label: 'Projet', type: 'select', options: projectOptions().slice(1), value: projectId || '' , required: true},
      { name: 'date', label: 'Date', type: 'date', value: todayStr(), required: true },
      { name: 'minutes', label: 'Durée (minutes)', type: 'number', value: 60, min: 1, required: true },
      { name: 'note', label: 'Note', value: '', full: true },
    ]
  });
  if (!r || !r.values.minutes) return;
  await S.put('timelogs', r.values);
  S.log('Temps ajouté', `${r.values.minutes} min`, { type: 'time', projectId: r.values.projectId });
}
export async function editLearning(l0 = {}, projectId) {
  const l = { date: todayStr(), projectId, ...l0 };
  const isNew = !l.id;
  const r = await formModal({
    title: isNew ? "Ce que j'ai appris" : 'Modifier',
    fields: [
      { name: 'projectId', label: 'Formation / projet', type: 'select', options: projectOptions(), value: l.projectId || '' },
      { name: 'date', label: 'Date', type: 'date', value: l.date, required: true },
      { name: 'title', label: 'Sujet de la séance', value: l.title, full: true, autofocus: true },
      { name: 'content', label: "Ce que j'ai appris", type: 'textarea', value: l.content, full: true, rows: 6, required: true },
      { name: 'next', label: 'À revoir / prochaine étape', type: 'textarea', value: l.next, full: true, rows: 2 },
    ],
    extraButtons: isNew ? [] : [{ label: 'Supprimer', action: 'delete', danger: true, icon: 'trash' }],
  });
  if (!r) return;
  if (r.action === 'delete') { await S.remove('learnings', l.id); return; }
  const saved = await S.put('learnings', { ...l, ...r.values, projectId: r.values.projectId || null });
  S.log(isNew ? 'Apprentissage noté' : 'Apprentissage modifié', saved.title || saved.content.slice(0, 60), { type: 'learning', projectId: saved.projectId });
}

/* ---------- Notes ---------- */
export async function newNote(defaults = {}) {
  const nb = S.all('notebooks')[0];
  const n = await S.put('notes', { title: '', content: '', notebookId: nb?.id || null, category: '', pinned: false, ...defaults });
  location.hash = `#/notes/${n.id}`;
  return n;
}
export { esc };
