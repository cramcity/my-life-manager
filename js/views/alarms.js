import * as S from '../store.js';
import { esc, pad, relDay, ymd, DAYS_SHORT, isStandalone, isIOS, toast } from '../utils.js';
import { icon } from '../icons.js';
import { empty, pageHead } from '../components.js';
import { nextAlarm, upcomingReminders } from '../recur.js';
import { editAlarm } from '../editors.js';
import { SOUNDS, notifPermission, requestNotif, wakeSupported, wakeActive, toggleWake, testRing, notify } from '../alarm-engine.js';
import { shortcutAlarmURL, exportICS } from '../ics.js';

const daysLabel = d => {
  if (!d?.length) return 'Une seule fois';
  const s = [...d].sort().join();
  if (s === '0,1,2,3,4,5,6') return 'Tous les jours';
  if (s === '1,2,3,4,5') return 'Du lundi au vendredi';
  if (s === '0,6') return 'Le week-end';
  return [1, 2, 3, 4, 5, 6, 0].filter(x => d.includes(x)).map(x => ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][x]).join(' ');
};
const inDelay = at => { const m = Math.round((at - Date.now()) / 60000); if (m < 60) return `dans ${m} min`; const h = Math.floor(m / 60); return h < 24 ? `dans ${h} h ${pad(m % 60)}` : `dans ${Math.floor(h / 24)} j ${h % 24} h`; };

function render(el, params, ctx) {
  const alarms = S.all('alarms').sort((a, b) => a.time.localeCompare(b.time));
  const perm = notifPermission();
  const reminders = upcomingReminders(Date.now(), Date.now() + 7 * 864e5).slice(0, 12);
  const ios = isIOS(), pwa = isStandalone();
  el.innerHTML = `
    ${pageHead('Alarmes et rappels', `<button class="btn btn-primary" data-new>${icon('plus')}<span>Alarme</span></button>`)}

    <div class="reliability card">
      <div class="rel-head">${icon('shield')}<div><b>Fiabilité des alarmes</b><p class="muted small">Une application web ne peut pas faire sonner l'iPhone lorsqu'il est verrouillé ou que l'app est fermée. Voici les options :</p></div></div>
      <div class="rel-grid">
        <div class="rel-item ok"><b>${icon('phone')} Horloge iPhone (recommandé)</b><span>Bouton « Horloge iPhone » sur chaque alarme : crée une vraie alarme native via l'app Raccourcis. 100 % fiable, même verrouillé.</span><a class="link" href="#/guide#raccourcis">Configurer (une seule fois)</a></div>
        <div class="rel-item ok"><b>${icon('calendar')} Calendrier iPhone</b><span>Exportez alarmes, tâches et rendez-vous en .ics : Apple Calendrier envoie des notifications fiables.</span><a class="link" href="#/reglages#iphone">Exporter tout</a></div>
        <div class="rel-item ${pwa ? 'ok' : 'warn'}"><b>${icon('volume')} Dans l'application</b><span>Sonnerie et écran d'alarme quand l'app est ouverte au premier plan${wakeSupported() ? ' (gardez l\'écran allumé avec le mode réveil de nuit)' : ''}.</span>
          ${wakeSupported() ? `<button class="btn btn-sm ${wakeActive() ? 'btn-primary' : ''}" data-wake>${icon('moon')} ${wakeActive() ? 'Mode réveil de nuit : actif' : 'Activer le mode réveil de nuit'}</button>` : ''}</div>
        <div class="rel-item ${perm === 'granted' ? 'ok' : 'warn'}"><b>${icon('bell')} Notifications</b><span>${perm === 'granted' ? 'Autorisées.' : perm === 'denied' ? 'Refusées : réactivez-les dans Réglages iOS › Notifications.' : perm === 'unsupported' ? (ios && !pwa ? "Sur iPhone, installez d'abord l'app sur l'écran d'accueil (iOS 16.4+)." : 'Non prises en charge par ce navigateur.') : 'Pas encore autorisées.'}</span>
          ${perm === 'default' ? '<button class="btn btn-sm" data-notif>Autoriser les notifications</button>' : perm === 'granted' ? '<button class="btn btn-sm" data-notif-test>Tester une notification</button>' : ''}</div>
      </div>
    </div>

    <div class="alarm-list">
    ${alarms.length ? alarms.map(a => {
      const at = nextAlarm(a);
      return `<div class="alarm-card ${a.enabled ? '' : 'off'}" data-id="${a.id}">
        <div class="al-main" data-edit="${a.id}">
          <div class="al-time">${a.time}</div>
          <div class="al-info"><b>${esc(a.title || 'Alarme')}</b><small>${daysLabel(a.days)} · ${esc(SOUNDS.find(s => s.value === a.sound)?.label.split(' (')[0] || 'Classique')}</small>
            ${at ? `<small class="accent">${a.snoozeUntil && a.snoozeUntil > Date.now() ? 'Reportée · ' : ''}${relDay(ymd(at))} à ${pad(at.getHours())}:${pad(at.getMinutes())} — ${inDelay(at)}</small>` : ''}
            ${a.description ? `<small class="muted">${esc(a.description)}</small>` : ''}</div>
        </div>
        <div class="al-days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<span class="${a.days?.includes(d) ? 'on' : ''}">${DAYS_SHORT[d]}</span>`).join('')}</div>
        <div class="al-actions">
          <button class="btn btn-sm" data-clock="${a.id}" title="Créer l'alarme dans l'app Horloge de l'iPhone">${icon('phone')}<span>Horloge iPhone</span></button>
          <button class="icon-btn sm" data-ics="${a.id}" title="Exporter vers Calendrier">${icon('calendar')}</button>
          <button class="icon-btn sm" data-test="${a.id}" title="Tester la sonnerie">${icon('volume')}</button>
          <label class="switch" title="Activer / désactiver"><input type="checkbox" data-toggle="${a.id}" ${a.enabled ? 'checked' : ''}><span></span></label>
        </div>
      </div>`;
    }).join('') : empty('alarm', 'Aucune alarme.', '<button class="btn btn-primary" data-new>Créer une alarme</button>')}
    </div>

    <section class="card">
      <div class="card-head"><h2>${icon('bell')} Rappels des 7 prochains jours</h2></div>
      <p class="muted small">Ajoutez un rappel à une tâche (avec heure) ou à une activité de l'agenda pour le voir ici.</p>
      ${reminders.length ? `<ul class="rem-list">${reminders.map(r => { const d = new Date(r.at); return `<li><span class="rem-at">${relDay(ymd(d))} · ${pad(d.getHours())}:${pad(d.getMinutes())}</span><span class="rem-kind">${r.kind === 'task' ? icon('tasks') : icon('calendar')}</span><b>${esc(r.title)}</b></li>`; }).join('')}</ul>` : empty('bell', 'Aucun rappel programmé.')}
    </section>`;

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-new],[data-edit],[data-clock],[data-test],[data-wake],[data-notif],[data-notif-test],[data-ics]');
    if (!b) return;
    if (b.hasAttribute('data-new')) editAlarm();
    else if (b.dataset.edit) editAlarm(S.get('alarms', b.dataset.edit));
    else if (b.dataset.clock) { location.href = shortcutAlarmURL(S.get('alarms', b.dataset.clock)); if (!ios) toast("Ce bouton ouvre l'app Raccourcis : à utiliser sur iPhone.", { type: 'warn' }); }
    else if (b.dataset.ics) exportICS('alarm', S.get('alarms', b.dataset.ics));
    else if (b.dataset.test) testRing(S.get('alarms', b.dataset.test).sound);
    else if (b.hasAttribute('data-wake')) { const on = await toggleWake(!wakeActive()); toast(on ? "Écran maintenu allumé : laissez l'app ouverte et le téléphone branché." : 'Mode réveil de nuit désactivé'); ctx.rerender(); }
    else if (b.hasAttribute('data-notif')) { await requestNotif(); ctx.rerender(); }
    else if (b.hasAttribute('data-notif-test')) { const ok = await notify('My Life Manager', 'Les notifications fonctionnent ✅', 'test'); if (!ok) toast("Impossible d'afficher la notification", { type: 'warn' }); }
  });
  el.addEventListener('change', async e => {
    const id = e.target.dataset.toggle; if (!id) return;
    const a = S.get('alarms', id);
    await S.patch('alarms', id, { enabled: e.target.checked, snoozeUntil: null });
    S.log(e.target.checked ? 'Alarme activée' : 'Alarme désactivée', `${a.time} — ${a.title}`, { type: 'alarm' });
  });
}
export default { title: 'Alarmes', render };
