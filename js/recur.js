// Récurrences des activités et calcul des prochaines alarmes / rappels.
import { parseYMD, ymd, addDays, addDaysStr, hm2min, todayStr } from './utils.js';
import * as S from './store.js';

export const REPEATS = [
  { value: 'none', label: 'Ne se répète pas' },
  { value: 'daily', label: 'Tous les jours' },
  { value: 'weekdays', label: 'Du lundi au vendredi' },
  { value: 'weekly', label: 'Toutes les semaines' },
  { value: 'biweekly', label: 'Toutes les 2 semaines' },
  { value: 'monthly', label: 'Tous les mois' },
  { value: 'yearly', label: 'Tous les ans' },
];
export const REMINDERS = [
  { value: '', label: 'Aucun rappel' },
  { value: '0', label: "À l'heure de début" },
  { value: '5', label: '5 minutes avant' },
  { value: '10', label: '10 minutes avant' },
  { value: '15', label: '15 minutes avant' },
  { value: '30', label: '30 minutes avant' },
  { value: '60', label: '1 heure avant' },
  { value: '120', label: '2 heures avant' },
  { value: '1440', label: '1 jour avant' },
];

// Choix proposés (minutes avant le début). Plusieurs rappels possibles par tâche ou activité.
export const REMIND_CHOICES = [
  { value: 1440, label: '1 jour avant' }, { value: 120, label: '2 h avant' }, { value: 60, label: '1 h avant' },
  { value: 30, label: '30 min avant' }, { value: 20, label: '20 min avant' }, { value: 15, label: '15 min avant' },
  { value: 10, label: '10 min avant' }, { value: 5, label: '5 min avant' }, { value: 0, label: "À l'heure" },
];
/** Rappels (minutes avant le début) d'une tâche ou activité — compatible avec l'ancien champ unique « reminder ». */
export function remindersOf(x) {
  if (Array.isArray(x?.reminders)) return [...new Set(x.reminders.map(Number).filter(n => n >= 0))];
  if (x?.reminder === '' || x?.reminder == null) return [];
  return [Number(x.reminder)];
}
export const remindLabel = m => m === 0 ? "à l'heure" : m >= 1440 ? `${m / 1440} j avant` : m >= 60 ? `${m / 60} h avant` : `${m} min avant`;
const inLabel = m => m === 0 ? "C'est l'heure" : m >= 1440 ? `Dans ${m / 1440} jour${m >= 2880 ? 's' : ''}` : m >= 60 ? `Dans ${m / 60} h` : `Dans ${m} min`;

export function occursOn(ev, ds) {
  if (!ev || ev.deleted || !ev.date || ds < ev.date) return false;
  if (ev.repeatUntil && ds > ev.repeatUntil) return false;
  if ((ev.exceptions || []).includes(ds)) return false;
  const r = ev.repeat || 'none';
  if (r === 'none') return ds === ev.date;
  const a = parseYMD(ev.date), b = parseYMD(ds);
  const diff = Math.round((b - a) / 864e5);
  switch (r) {
    case 'daily': return true;
    case 'weekdays': { const w = b.getDay(); return w > 0 && w < 6; }
    case 'weekly': return diff % 7 === 0;
    case 'biweekly': return diff % 14 === 0;
    case 'monthly': return a.getDate() === b.getDate();
    case 'yearly': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  }
  return false;
}
export function eventsOn(ds, events = S.all('events')) {
  return events.filter(e => occursOn(e, ds)).map(e => ({ ...e, occ: ds }))
    .sort((x, y) => (x.start || '').localeCompare(y.start || ''));
}
export function eventsBetween(from, to, events = S.all('events')) {
  const out = [];
  for (let d = from; d <= to; d = addDaysStr(d, 1)) out.push(...eventsOn(d, events));
  return out;
}
export const occStart = o => { const d = parseYMD(o.occ || o.date); const m = hm2min(o.start) ?? 0; d.setMinutes(m); return d; };

/* ---------- Alarmes ---------- */
// Prochaine occurrence d'une alarme à partir de `from` (Date)
export function nextAlarm(a, from = new Date()) {
  if (!a.enabled) return null;
  if (a.snoozeUntil && a.snoozeUntil > from.getTime()) return new Date(a.snoozeUntil);
  const m = hm2min(a.time);
  for (let i = 0; i < 8; i++) {
    const d = addDays(new Date(from.getFullYear(), from.getMonth(), from.getDate()), i);
    d.setMinutes(m);
    if (d <= from) continue;
    if (!a.days?.length || a.days.includes(d.getDay())) {
      if (!a.days?.length && a.date && ymd(d) < a.date) continue;
      return d;
    }
  }
  return null;
}
// Liste des rappels (tâches et activités) dans une fenêtre de temps
export function upcomingReminders(fromMs, toMs) {
  const out = [];
  for (const t of S.all('tasks')) {
    if (t.status === 'done' || !t.dueDate || !t.dueTime) continue;
    const start = parseYMD(t.dueDate); start.setMinutes(hm2min(t.dueTime));
    for (const m of remindersOf(t)) {
      const at = start.getTime() - m * 60000;
      if (at >= fromMs && at <= toMs) out.push({ kind: 'task', key: `t:${t.id}:${t.dueDate}:${t.dueTime}:${m}`, at, before: m, title: t.title, body: `${inLabel(m)} · tâche prévue à ${t.dueTime}${t.description ? ' — ' + t.description.slice(0, 80) : ''}`, ref: t.id });
    }
  }
  const fromD = ymd(new Date(fromMs - 864e5 * 2)), toD = ymd(new Date(toMs + 864e5 * 2));
  for (const o of eventsBetween(fromD, toD)) {
    if (!o.start) continue;
    const start = occStart(o).getTime();
    for (const m of remindersOf(o)) {
      const at = start - m * 60000;
      if (at >= fromMs && at <= toMs) out.push({ kind: 'event', key: `e:${o.id}:${o.occ}:${o.start}:${m}`, at, before: m, title: o.title, body: `${inLabel(m)} · prévu à ${o.start}${o.end ? '–' + o.end : ''}${o.description ? ' — ' + o.description.slice(0, 80) : ''}`, ref: o.id, occ: o.occ });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
export const isOverdue = t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr();
