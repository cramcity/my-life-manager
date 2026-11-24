import { icon } from '../icons.js';
import { pageHead } from '../components.js';
import { isIOS, isStandalone, esc, toast } from '../utils.js';
import * as S from '../store.js';

export default {
  title: 'Guide iPhone',
  render(el) {
    const s = S.getSettings();
    el.innerHTML = `
    ${pageHead('Guide iPhone', '', 'Installation gratuite, alarmes fiables, synchronisation. Tout est gratuit, sans App Store ni abonnement.')}
    <nav class="toc">
      <a href="#/guide#installer">1. Installer l'app</a><a href="#/guide#limites">2. Ce qui est possible</a><a href="#/guide#raccourcis">3. Alarmes natives</a><a href="#/guide#calendrier">4. Rappels Calendrier</a><a href="#/guide#sync">5. Synchronisation</a>
    </nav>
    <div class="guide prose">
      <section class="card" id="installer">
        <h2>${icon('phone')} 1. Installer My Life Manager sur l'iPhone</h2>
        ${isIOS() && isStandalone() ? '<p class="ok-box">✅ C\'est fait : vous utilisez l\'application installée.</p>' : ''}
        <ol>
          <li>Ouvrez l'adresse de l'application dans <b>Safari</b> (pas Chrome).</li>
          <li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li>
          <li>Faites défiler et choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</li>
          <li>Lancez l'app depuis sa nouvelle icône : elle s'ouvre en plein écran, fonctionne hors connexion et vos données sont conservées durablement.</li>
          <li>Dans l'app : <b>Alarmes › Autoriser les notifications</b> (iOS 16.4 ou plus récent).</li>
        </ol>
      </section>

      <section class="card" id="limites">
        <h2>${icon('shield')} 2. Ce qu'une application web peut — et ne peut pas — faire</h2>
        <ul>
          <li>✅ Sonner et afficher l'écran d'alarme <b>quand l'app est ouverte</b> (au premier plan). Le « mode réveil de nuit » garde l'écran allumé : laissez l'iPhone branché sur la table de nuit.</li>
          <li>✅ <b>Notifications même app fermée et iPhone verrouillé</b> : écran <a class="link" href="#/alarmes">Alarmes</a> › <b>Activer les notifications</b> (app installée sur l'écran d'accueil, iOS 16.4+, profil connecté). Vous recevez une bannière avec le son de notification pour chaque alarme, rappel de tâche ou d'activité, et un résumé des tâches chaque matin (heure réglable dans Réglages). Elles sont préparées pour les 7 prochains jours à chaque ouverture de l'app, et envoyées à la minute près.</li>
          <li>📳 <b>Vibration</b> : sur iPhone, chaque notification fait vibrer le téléphone selon vos réglages iOS (Réglages › Sons et vibrations › activer « Vibrations » / « Haptique en mode silencieux »). Sur Android, l'app demande en plus une vibration longue, répétée tant que l'alarme sonne quand l'app est ouverte. Réglable dans Réglages › Alarmes.</li>
          <li>⚠️ Une notification n'est pas une sonnerie de réveil : elle sonne une seule fois, comme un message, et ne passe pas outre le mode silencieux ou « Ne pas déranger ». <b>Pour vous réveiller, utilisez l'Horloge iPhone</b> (section 3).</li>
          <li>ℹ️ Si vous n'ouvrez pas l'app pendant plus de 7 jours, les notifications au-delà ne sont plus programmées : ouvrez l'app de temps en temps.</li>
          <li>✅ <b>Solution fiable et gratuite</b> : l'app crée de vraies alarmes dans l'app <b>Horloge</b> via <b>Raccourcis</b> (section 3) et de vrais rappels dans <b>Calendrier</b> ou <b>Rappels</b> (section 4). Ceux-ci sonnent toujours, même verrouillé, en mode avion, app fermée.</li>
        </ul>
      </section>

      <section class="card" id="raccourcis">
        <h2>${icon('alarm')} 3. Alarmes natives avec l'app Raccourcis (à faire une seule fois)</h2>
        <p>L'app Raccourcis est gratuite et préinstallée. Vous créez deux petits raccourcis ; ensuite, le bouton <b>« Horloge iPhone »</b> d'une alarme crée l'alarme dans l'app Horloge en un geste.</p>
        <h3>Raccourci A — « ${esc(s.shortcutAlarm)} » (alarme dans Horloge)</h3>
        <ol>
          <li>Ouvrez <b>Raccourcis</b> › <b>+</b> (nouveau raccourci). Renommez-le exactement <b>${esc(s.shortcutAlarm)}</b> (touchez le nom en haut).</li>
          <li>Ajoutez l'action <b>« Diviser le texte »</b>. Texte : <b>Entrée du raccourci</b>. Séparateur : <b>Personnalisé</b> → tapez <code>|</code>.</li>
          <li>Ajoutez <b>« Obtenir l'élément de la liste »</b> → <b>Premier élément</b> de <i>Texte divisé</i>.</li>
          <li>Ajoutez <b>« Obtenir les dates à partir de l'entrée »</b> appliqué à <i>Élément de la liste</i>.</li>
          <li>Ajoutez de nouveau <b>« Obtenir l'élément de la liste »</b> → <b>Dernier élément</b> de <i>Texte divisé</i>.</li>
          <li>Ajoutez <b>« Créer une alarme »</b> (app Horloge). Heure : <i>Dates</i>. Libellé : le dernier <i>Élément de la liste</i>.</li>
          <li>Touchez <b>OK</b>. Au premier lancement, iOS demande l'autorisation d'accéder à Horloge : acceptez.</li>
        </ol>
        <p class="muted">L'app envoie le texte <code>07:30|Réveil</code>. Les jours de répétition se règlent ensuite dans l'app Horloge (touchez l'alarme › Répéter) si votre version d'iOS ne les propose pas dans l'action.</p>
        <h3>Raccourci B — « ${esc(s.shortcutReminder)} » (rappel dans l'app Rappels)</h3>
        <ol>
          <li>Nouveau raccourci nommé exactement <b>${esc(s.shortcutReminder)}</b>.</li>
          <li><b>« Diviser le texte »</b> : Entrée du raccourci, séparateur personnalisé <code>|</code>.</li>
          <li><b>« Obtenir l'élément de la liste »</b> → <b>Élément à l'index</b> 2, puis <b>« Obtenir les dates à partir de l'entrée »</b>.</li>
          <li><b>« Obtenir l'élément de la liste »</b> → <b>Premier élément</b> de <i>Texte divisé</i> (le titre).</li>
          <li><b>« Ajouter un nouveau rappel »</b> : texte = ce premier élément ; développez l'action, activez <b>Alerte</b> / « Me le rappeler » <b>à une date</b> = <i>Dates</i>.</li>
        </ol>
        <p class="muted">L'app envoie <code>Titre|2026-11-24 14:30|notes</code>. Utilisez-le depuis une tâche (bouton « iPhone » › App Rappels).</p>
        <p>Les noms des raccourcis peuvent être modifiés dans <a class="link" href="#/reglages#alarmes">Réglages</a>. Les libellés exacts des actions peuvent légèrement varier selon la version d'iOS : utilisez la recherche d'actions.</p>
      </section>

      <section class="card" id="calendrier">
        <h2>${icon('calendar')} 4. Rappels fiables via Calendrier (sans configuration)</h2>
        <ol>
          <li>Sur une activité, une tâche ou une alarme, touchez <b>« Calendrier iPhone »</b>, ou exportez tout depuis <a class="link" href="#/reglages#iphone">Réglages › iPhone</a>.</li>
          <li>Dans la feuille de partage, choisissez <b>Calendrier</b> (ou ouvrez le fichier .ics), puis <b>« Ajouter tout »</b>.</li>
          <li>Chaque élément contient une alerte : l'iPhone vous notifie à l'heure prévue, même verrouillé. Les répétitions sont conservées.</li>
        </ol>
        <p class="muted">Astuce : créez un calendrier « My Life Manager » dans l'app Calendrier pour regrouper ces éléments. Si vous modifiez un élément dans l'app, exportez-le de nouveau.</p>
      </section>

      <section class="card" id="sync">
        <h2>${icon('sync')} 5. Mon profil : retrouver mes données partout</h2>
        <ol>
          <li>Au premier lancement, touchez <b>Créer mon profil</b> : prénom, e-mail et mot de passe (8 caractères minimum).</li>
          <li>Sur un autre appareil (ordinateur, autre iPhone), ouvrez l'app et touchez <b>Se connecter</b> avec le même e-mail et mot de passe : toutes vos données reviennent.</li>
          <li>Chaque modification est envoyée automatiquement. Sans réseau, l'app continue de fonctionner et envoie tout au retour de la connexion.</li>
          <li>Chaque personne a son propre profil : personne ne voit les données d'un autre.</li>
          <li>Pour prêter l'appareil ou changer de profil : Réglages › Mon profil › <b>Se déconnecter</b> (les données sont d'abord envoyées dans le compte, puis effacées de l'appareil).</li>
        </ol>
        <p class="muted">Sécurité : vos données sont chiffrées sur l'appareil avec une clé tirée de votre mot de passe (AES-256) avant l'envoi. Le serveur ne stocke qu'un bloc illisible. Conséquence : <b>un mot de passe oublié ne peut pas être réinitialisé</b> sans perdre les données en ligne ; notez-le en lieu sûr et faites de temps en temps une sauvegarde fichier.</p>
      </section>
    </div>`;
    const anchor = location.hash.split('#')[2];
    if (anchor) requestAnimationFrame(() => el.querySelector('#' + anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
};
