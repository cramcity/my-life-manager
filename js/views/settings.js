import * as S from '../store.js';
import { esc, toast, confirmBox, promptBox, shareOrDownload, pickFile, choiceBox, timeAgo, todayStr, openModal, isIOS, isStandalone } from '../utils.js';
import { icon } from '../icons.js';
import { pageHead } from '../components.js';
import { SOUNDS, notifPermission, requestNotif, previewSound } from '../alarm-engine.js';
import { exportAllICS } from '../ics.js';
import * as Sync from '../sync.js';
import { authScreen, logout } from '../auth.js';
import { applyTheme } from '../theme.js';

const ACCENTS = [['indigo', '#4f46e5'], ['bleu', '#0284c7'], ['vert', '#059669'], ['ambre', '#d97706'], ['rose', '#db2777'], ['ardoise', '#475569']];

function section(id, ic, title, body, desc = '') {
  return `<section class="card set-sec" id="${id}"><div class="card-head"><h2>${icon(ic)} ${title}</h2></div>${desc ? `<p class="muted small">${desc}</p>` : ''}${body}</section>`;
}

async function render(el, params, ctx) {
  const s = S.getSettings();
  const lock = await S.lockInfo();
  const cfg = Sync.getConfig();
  const sync = Sync.getStatus();
  let est = null, persisted = null;
  try { est = await navigator.storage?.estimate?.(); persisted = await navigator.storage?.persisted?.(); } catch { }
  el.innerHTML = `
    ${pageHead('Réglages')}
    <div class="settings">
    ${section('profil', 'home', 'Profil et apparence', `
      <div class="form-grid">
        <label class="field"><span>Votre prénom</span><input class="input" data-set="name" value="${esc(s.name)}" placeholder="Pour le message de bienvenue"></label>
        <label class="field"><span>Thème</span><select class="input" data-set="theme">${[['auto', 'Automatique (selon l\'appareil)'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="field full"><span>Couleur d'accent</span><div class="color-pick">${ACCENTS.map(([k, c]) => `<button class="color-dot ${s.accent === k ? 'on' : ''}" style="--c:${c}" data-accent="${k}" aria-label="${k}"></button>`).join('')}</div></div>
      </div>`)}

    ${section('alarmes', 'alarm', 'Alarmes et notifications', `
      <div class="form-grid">
        <label class="field"><span>Durée du report (snooze)</span><select class="input" data-set="snooze" data-num>${[5, 10, 15, 20, 30].map(m => `<option value="${m}" ${s.snooze === m ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></label>
        <label class="field"><span>Son par défaut</span><div class="row"><select class="input" data-set="defaultSound">${SOUNDS.map(o => `<option value="${o.value}" ${s.defaultSound === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select><button class="btn" data-preview>▶︎</button></div></label>
        <label class="field"><span>Nom du raccourci « alarme »</span><input class="input" data-set="shortcutAlarm" value="${esc(s.shortcutAlarm)}"></label>
        <label class="field"><span>Nom du raccourci « rappel »</span><input class="input" data-set="shortcutReminder" value="${esc(s.shortcutReminder)}"></label>
        <label class="field"><span>Résumé des tâches du jour (notification)</span><select class="input" data-set="digestTime"><option value="off" ${s.pushDigest === false ? 'selected' : ''}>Désactivé</option>${['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '10:00'].map(t => `<option value="${t}" ${s.pushDigest !== false && (s.digestTime || '08:00') === t ? 'selected' : ''}>Chaque matin à ${t}</option>`).join('')}</select></label>
      </div>
      <div class="row wrap mt">
        <span class="muted small">Notifications : <b>${{ granted: 'autorisées', denied: 'refusées', default: 'non demandées', unsupported: 'non disponibles ici' }[notifPermission()]}</b></span>
        <a class="btn btn-sm" href="#/alarmes">${icon('bell')} Notifications sur l'iPhone</a>
        <a class="btn btn-sm" href="#/guide#raccourcis">${icon('phone')} Configurer les raccourcis iPhone</a>
      </div>`)}

    ${section('iphone', 'phone', 'iPhone : rappels natifs', `
      <p class="small">Exportez toutes vos alarmes actives, tâches datées et activités à venir dans un fichier Calendrier (.ics). Sur iPhone, ouvrez-le puis choisissez « Ajouter tout » : vous recevrez des notifications fiables, même téléphone verrouillé.</p>
      <div class="row wrap"><button class="btn btn-primary" data-ics-all>${icon('calendar')} Exporter vers Calendrier (.ics)</button><a class="btn" href="#/guide">${icon('book')} Guide iPhone complet</a></div>
      <p class="muted small mt">${isIOS() ? (isStandalone() ? '✅ Application installée sur l\'écran d\'accueil.' : '⚠️ Application ouverte dans Safari : installez-la (Partager › Sur l\'écran d\'accueil) pour le plein écran, les notifications et la conservation durable des données.') : 'Sur iPhone : Safari › Partager › « Sur l\'écran d\'accueil ».'}</p>`)}

    ${section('securite', 'lock', 'Sécurité', `
      <p class="small">${lock ? '🔒 Le code de verrouillage est <b>actif</b> : vos notes, tâches, projets et bilans sont chiffrés (AES-256) sur cet appareil.' : 'Protégez vos informations par un code. Les données seront chiffrées sur l\'appareil et demandées à chaque ouverture.'}</p>
      <div class="row wrap">
        ${lock ? `<button class="btn" data-lock-change>Changer le code</button><button class="btn btn-ghost-danger" data-lock-off>Désactiver</button><button class="btn" data-lock-now>${icon('lock')} Verrouiller maintenant</button>` : `<button class="btn btn-primary" data-lock-on>${icon('lock')} Activer le code de verrouillage</button>`}
        <label class="field inline"><span>Verrouillage auto</span><select class="input input-sm" data-set="autoLock" data-num>${[[1, '1 min'], [5, '5 min'], [15, '15 min'], [60, '1 h'], [0, 'Jamais']].map(([v, l]) => `<option value="${v}" ${s.autoLock === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="muted small">Attention : sans le code, les données chiffrées sont irrécupérables. Gardez une sauvegarde.</p>`)}

    ${section('sauvegarde', 'download', 'Sauvegarde et restauration', `
      <p class="small">Dernière sauvegarde : <b>${s.lastBackup ? timeAgo(s.lastBackup) : 'jamais'}</b>. Enregistrez le fichier dans iCloud Drive, OneDrive ou par e-mail.</p>
      <div class="row wrap">
        <button class="btn btn-primary" data-export>${icon('download')} Sauvegarder (fichier)</button>
        <button class="btn" data-export-enc>${icon('lock')} Sauvegarde chiffrée</button>
        <button class="btn" data-import>${icon('upload')} Restaurer / importer</button>
      </div>
      <p class="muted small">L'import <b>fusionne</b> intelligemment (la modification la plus récente gagne) : vous pouvez aussi l'utiliser pour transférer vos données entre l'ordinateur et l'iPhone sans compte en ligne.</p>`)}

    ${section('sync', 'cloud', 'Mon profil', cfg ? `
      <div class="sync-state st-${sync.state}">${icon(sync.state === 'error' ? 'alert' : sync.state === 'ok' ? 'check' : 'sync')}<div><b>${esc(cfg.email)}</b><small>${esc(sync.msg)} · dernière synchro ${cfg.lastSync ? timeAgo(cfg.lastSync) : 'jamais'}</small></div></div>
      <div class="row wrap"><button class="btn btn-primary" data-sync-now>${icon('sync')} Synchroniser maintenant</button><button class="btn btn-ghost-danger" data-logout>${icon('logout')} Se déconnecter</button></div>
      <p class="muted small">Vos données sont enregistrées dans votre profil automatiquement à chaque modification. Connectez-vous avec le même e-mail et mot de passe sur un autre appareil pour tout retrouver. Elles sont chiffrées avec votre mot de passe avant l'envoi : personne d'autre ne peut les lire.</p>
      <p class="muted small">Se déconnecter envoie vos dernières modifications puis efface les données de cet appareil (pratique pour changer de profil).</p>` : `
      <p class="small">Vous utilisez l'app <b>sans profil</b> : vos données restent uniquement sur cet appareil. Créez un profil (gratuit) ou connectez-vous pour les retrouver sur tous vos appareils ; vos données actuelles y seront ajoutées.</p>
      <div class="row wrap"><button class="btn btn-primary" data-auth="signup">${icon('check')} Créer mon profil</button><button class="btn" data-auth="login">${icon('cloud')} Se connecter</button></div>`)}

    ${section('categories', 'grid', 'Catégories (tâches et agenda)', `
      <div class="cat-edit">${s.categories.map((c, i) => `<div class="cat-line"><input type="color" value="${c.color}" data-cat-color="${i}"><input class="input input-sm" value="${esc(c.name)}" data-cat-name="${i}"><button class="icon-btn sm" data-cat-del="${i}" title="Supprimer">${icon('trash')}</button></div>`).join('')}</div>
      <button class="btn btn-sm mt" data-cat-add>${icon('plus')} Ajouter une catégorie</button>`)}

    ${section('donnees', 'shield', 'Stockage sur cet appareil', `
      <p class="small">Données enregistrées dans la base IndexedDB de l'appareil (conservée après fermeture). Stockage durable : <b>${persisted ? 'accordé ✅' : 'non garanti'}</b>${est ? ` · utilisé : ${(est.usage / 1048576).toFixed(1)} Mo` : ''}.</p>
      <p class="muted small">Sur iPhone, installez l'app sur l'écran d'accueil : Safari peut sinon effacer les données d'un site non visité pendant 7 jours. Faites des sauvegardes régulières ou activez la synchronisation.</p>
      <div class="row wrap">${!persisted && navigator.storage?.persist ? '<button class="btn btn-sm" data-persist>Demander le stockage durable</button>' : ''}<button class="btn btn-sm btn-ghost-danger" data-wipe>${icon('trash')} Effacer toutes les données de cet appareil</button></div>
      <p class="muted small mt">My Life Manager · version 1.3 · fonctionne hors connexion</p>`)}
    </div>`;

  /* ---------- Gestion des événements ---------- */
  el.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.set === 'digestTime') {
      await S.setSettings(t.value === 'off' ? { pushDigest: false } : { pushDigest: true, digestTime: t.value });
      toast('Réglage enregistré'); return;
    }
    if (t.dataset.set) {
      const v = t.hasAttribute('data-num') ? Number(t.value) : t.value;
      await S.setSettings({ [t.dataset.set]: v }, { silent: true });
      if (t.dataset.set === 'theme') applyTheme();
      toast('Réglage enregistré');
    }
    if (t.dataset.catColor != null || t.dataset.catName != null) {
      const cats = S.getSettings().categories.map(c => ({ ...c }));
      const i = +(t.dataset.catColor ?? t.dataset.catName);
      if (t.dataset.catColor != null) cats[i].color = t.value; else cats[i].name = t.value.trim() || cats[i].name;
      await S.setSettings({ categories: cats }, { silent: true }); toast('Catégorie enregistrée');
    }
  });
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.accent) { await S.setSettings({ accent: b.dataset.accent }, { silent: true }); applyTheme(); el.querySelectorAll('[data-accent]').forEach(x => x.classList.toggle('on', x === b)); }
    else if (b.hasAttribute('data-preview')) previewSound(el.querySelector('[data-set=defaultSound]').value);
    else if (b.hasAttribute('data-notif')) { await requestNotif(); ctx.rerender(); }
    else if (b.hasAttribute('data-ics-all')) exportAllICS();
    else if (b.hasAttribute('data-export')) { await shareOrDownload(`my-life-manager-${todayStr()}.json`, JSON.stringify(S.exportData(), null, 1), 'application/json'); await S.setSettings({ lastBackup: Date.now() }); }
    else if (b.hasAttribute('data-export-enc')) {
      const p = await promptBox('Sauvegarde chiffrée', { type: 'password', label: 'Mot de passe de la sauvegarde (à retenir !)', ok: 'Chiffrer et sauvegarder' });
      if (!p) return; if (p.length < 6) { toast('6 caractères minimum', { type: 'warn' }); return; }
      const blob = await S.encryptWithPassword(p, S.exportData());
      await shareOrDownload(`my-life-manager-${todayStr()}-chiffre.json`, JSON.stringify({ app: 'my-life-manager', encrypted: true, ...blob }), 'application/json');
      await S.setSettings({ lastBackup: Date.now() });
    }
    else if (b.hasAttribute('data-import')) await doImport(ctx);
    else if (b.hasAttribute('data-lock-on')) await setCode(false, ctx);
    else if (b.hasAttribute('data-lock-change')) await setCode(true, ctx);
    else if (b.hasAttribute('data-lock-off')) { if (await confirmBox('Désactiver le code ? Les données ne seront plus chiffrées sur cet appareil.', { ok: 'Désactiver', danger: true })) { await S.disableLock(); toast('Code désactivé'); ctx.rerender(); } }
    else if (b.hasAttribute('data-lock-now')) location.reload();
    else if (b.hasAttribute('data-sync-now')) { try { await Sync.syncNow(); toast('Synchronisé ✅'); } catch (err) { toast(err.message, { type: 'warn', timeout: 7000 }); } ctx.rerender(); }
    else if (b.hasAttribute('data-logout')) {
      if (!await confirmBox('Se déconnecter ? Vos données seront envoyées dans votre profil puis effacées de cet appareil. Vous les retrouverez en vous reconnectant.', { ok: 'Se déconnecter' })) return;
      b.disabled = true; b.textContent = 'Envoi des données…';
      try { await logout(); } catch (err) { toast(err.message, { type: 'warn', timeout: 9000 }); b.disabled = false; ctx.rerender(); }
    }
    else if (b.dataset.auth) { const r = await authScreen({ allowSkip: false, allowClose: true, mode: b.dataset.auth }); if (r) ctx.rerender(); }
    else if (b.hasAttribute('data-cat-add')) { const name = await promptBox('Nouvelle catégorie', { label: 'Nom' }); if (name) { await S.setSettings({ categories: [...S.getSettings().categories, { id: 'c' + Date.now().toString(36), name, color: S.CATEGORY_COLORS[S.getSettings().categories.length % 10] }] }); } }
    else if (b.dataset.catDel != null && b.hasAttribute('data-cat-del')) { const cats = [...S.getSettings().categories]; const [c] = cats.splice(+b.dataset.catDel, 1); if (await confirmBox(`Supprimer la catégorie « ${c.name} » ?`, { ok: 'Supprimer', danger: true })) await S.setSettings({ categories: cats }); }
    else if (b.hasAttribute('data-persist')) { const ok = await navigator.storage.persist(); toast(ok ? 'Stockage durable accordé' : 'Refusé par le navigateur (installez l\'app sur l\'écran d\'accueil)'); ctx.rerender(); }
    else if (b.hasAttribute('data-wipe')) {
      if (!await confirmBox('Effacer définitivement TOUTES les données de cet appareil ? Cette action est irréversible. Faites une sauvegarde avant.', { ok: 'Tout effacer', danger: true })) return;
      const w = await promptBox('Confirmation', { label: 'Tapez EFFACER pour confirmer' });
      if (w !== 'EFFACER') return;
      await S.wipeAll(); localStorage.clear(); location.hash = '#/'; location.reload();
    }
  });
}

async function setCode(change, ctx) {
  if (change) {
    const old = await promptBox('Code actuel', { type: 'password', label: 'Code actuel' });
    if (old == null) return;
    if (!await S.unlock(old)) { toast('Code incorrect', { type: 'warn' }); return; }
  }
  const p1 = await promptBox(change ? 'Nouveau code' : 'Créer un code', { type: 'password', label: 'Code (4 caractères minimum, chiffres ou mot de passe)' });
  if (!p1) return; if (p1.length < 4) { toast('4 caractères minimum', { type: 'warn' }); return; }
  const p2 = await promptBox('Confirmer le code', { type: 'password', label: 'Retapez le code' });
  if (p1 !== p2) { toast('Les codes ne correspondent pas', { type: 'warn' }); return; }
  toast('Chiffrement des données…', { timeout: 1500 });
  await S.enableLock(p1);
  toast('Code activé 🔒 Vos données sont chiffrées.');
  ctx.rerender();
}

async function doImport(ctx) {
  const f = await pickFile('application/json,.json');
  if (!f) return;
  let payload;
  try { payload = JSON.parse(await f.text()); } catch { toast('Fichier illisible', { type: 'warn' }); return; }
  if (payload.encrypted) {
    const p = await promptBox('Sauvegarde chiffrée', { type: 'password', label: 'Mot de passe de la sauvegarde' });
    if (!p) return;
    try { payload = await S.decryptWithPassword(p, payload); } catch { toast('Mot de passe incorrect', { type: 'warn' }); return; }
  }
  if (payload.app !== 'my-life-manager') { toast("Ce fichier n'est pas une sauvegarde My Life Manager", { type: 'warn' }); return; }
  const mode = await choiceBox(`Sauvegarde du ${new Date(payload.exportedAt).toLocaleString('fr-FR')}. Comment l'importer ?`, [
    { label: 'Annuler', value: null }, { label: 'Tout remplacer', value: 'replace', danger: true }, { label: 'Fusionner (recommandé)', value: 'merge', primary: true }], 'Restaurer');
  if (!mode) return;
  if (mode === 'replace' && !await confirmBox('Remplacer toutes les données actuelles par celles du fichier ?', { ok: 'Remplacer', danger: true })) return;
  const n = await S.mergeData(payload, { replace: mode === 'replace' });
  S.log('Restauration', `${n} élément(s) importé(s)`, { type: 'backup' });
  toast(`Import terminé : ${n} élément(s) mis à jour`);
  ctx.rerender();
}

export default { title: 'Réglages', render, keepWhileEditing: true };
