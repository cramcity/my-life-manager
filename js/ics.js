// Export iCalendar (.ics) avec alertes VALARM : Apple Calendrier affiche ensuite
// des notifications fiables, même téléphone verrouillé et application fermée.
import { remindersOf } from './recur.js';
import * as S from './store.js';
import { pad, hm2min, min2hm, todayStr, shareOrDownload } from './utils.js';

const escTxt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (ds, hm) => `${ds.replace(/-/g, '')}T${(hm || '00:00').replace(':', '')}00`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const RRULE = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };

function valarm(minBefore, title) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escTxt(title)}`, `TRIGGER:-PT${Math.max(0, Number(minBefore) || 0)}M`, 'END:VALARM'];
}
function vevent({ uid, title, desc, date, start, end, allDay, rrule, until, exdates = [], alarmMin, alarms }) {
  const L = ['BEGIN:VEVENT', `UID:${uid}@mylifemanager`, `DTSTAMP:${stamp()}`, `SUMMARY:${escTxt(title)}`];
  if (desc) L.push(`DESCRIPTION:${escTxt(desc)}`);
  if (allDay) {
    const d2 = new Date(date + 'T12:00'); d2.setDate(d2.getDate() + 1);
    L.push(`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${d2.getFullYear()}${pad(d2.getMonth() + 1)}${pad(d2.getDate())}`);
  } else {
    L.push(`DTSTART:${dt(date, start)}`, `DTEND:${dt(date, end || min2hm(Math.min(hm2min(start) + 30, 1439)))}`);
  }
  if (rrule) L.push(`RRULE:${rrule}${until ? `;UNTIL=${until.replace(/-/g, '')}T235959` : ''}`);
  exdates.forEach(x => L.push(`EXDATE:${dt(x, start)}`));
  for (const m of alarms || (alarmMin !== null && alarmMin !== undefined && alarmMin !== '' ? [alarmMin] : [])) L.push(...valarm(m, title));
  L.push('END:VEVENT');
  return L;
}
export function eventToICS(e) {
  return vevent({ uid: 'ev-' + e.id, title: e.title, desc: e.description, date: e.date, start: e.start || '09:00', end: e.end, allDay: !e.start, rrule: RRULE[e.repeat], until: e.repeatUntil, exdates: e.exceptions || [], alarms: remindersOf(e) });
}
export function taskToICS(t) {
  return vevent({ uid: 'task-' + t.id, title: '✔︎ ' + t.title, desc: t.description, date: t.dueDate, start: t.dueTime, allDay: !t.dueTime, alarms: t.dueTime ? (remindersOf(t).length ? remindersOf(t) : [0]) : [] });
}
export function alarmToICS(a) {
  const days = a.days || [];
  const start = new Date(); let date = todayStr();
  if (days.length) { for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(d.getDate() + i); if (days.includes(d.getDay())) { date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; break; } } }
  else if (a.time <= `${pad(start.getHours())}:${pad(start.getMinutes())}`) { const d = new Date(); d.setDate(d.getDate() + 1); date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const rrule = days.length ? `FREQ=WEEKLY;BYDAY=${days.map(d => BYDAY[d]).join(',')}` : null;
  const end = min2hm(Math.min(hm2min(a.time) + 5, 1439));
  return vevent({ uid: 'alarm-' + a.id, title: '⏰ ' + (a.title || 'Alarme'), desc: a.description, date, start: a.time, end, rrule, alarmMin: 0 });
}
export function buildICS(lines) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//My Life Manager//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:My Life Manager', ...lines, 'END:VCALENDAR'].map(fold).join('\r\n');
}
export async function exportICS(kind, item) {
  const lines = kind === 'event' ? eventToICS(item) : kind === 'task' ? taskToICS(item) : alarmToICS(item);
  return shareOrDownload(`${(item.title || 'rappel').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'rappel'}.ics`, buildICS(lines), 'text/calendar');
}
export async function exportAllICS() {
  const t = todayStr();
  const lines = [];
  S.all('events').filter(e => e.repeat !== 'none' && e.repeat ? (!e.repeatUntil || e.repeatUntil >= t) : e.date >= t).forEach(e => lines.push(...eventToICS(e)));
  S.all('tasks').filter(x => x.status !== 'done' && x.dueDate && x.dueDate >= t).forEach(x => lines.push(...taskToICS(x)));
  S.all('alarms').filter(a => a.enabled).forEach(a => lines.push(...alarmToICS(a)));
  return shareOrDownload('my-life-manager.ics', buildICS(lines), 'text/calendar');
}

/* ---------- Raccourcis Apple (alarmes natives de l'app Horloge, Rappels) ---------- */
export function shortcutAlarmURL(a) {
  const name = S.getSettings().shortcutAlarm || 'MLM Alarme';
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(`${a.time}|${a.title || 'Alarme'}`)}`;
}
export function shortcutReminderURL(title, date, time, notes = '') {
  const name = S.getSettings().shortcutReminder || 'MLM Rappel';
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(`${title}|${date} ${time || '09:00'}|${notes}`)}`;
}
