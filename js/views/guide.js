import { icon } from '../icons.js';
import { pageHead } from '../components.js';
import { isIOS, isStandalone, esc, toast } from '../utils.js';
import { SETUP_SQL } from '../sync.js';
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
          <li>✅ Afficher des notifications quand l'app vient de passer en arrière-plan (tant qu'iOS la garde active, souvent quelques secondes).</li>
          <li>❌ <b>Impossible de garantir une alarme quand l'iPhone est verrouillé ou l'app fermée</b> : iOS suspend les applications web et ne leur permet pas de programmer une alarme. Les notifications « push » nécessiteraient un serveur d'envoi permanent.</li>
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
        <h2>${icon('sync')} 5. Synchroniser l'ordinateur et l'iPhone (gratuit)</h2>
        <h3>Option simple : par fichier (sans compte)</h3>
        <p>Réglages › <b>Sauvegarder</b> sur un appareil, enregistrez dans iCloud Drive ou OneDrive, puis sur l'autre appareil Réglages › <b>Restaurer / importer</b> › <b>Fusionner</b>. La version la plus récente de chaque élément est conservée.</p>
        <h3>Option automatique : Supabase (offre gratuite)</h3>
        <ol>
          <li>Créez un compte gratuit sur <b>supabase.com</b> (aucune carte bancaire) puis <b>New project</b> (région Europe, mot de passe de base de données au choix).</li>
          <li>Menu <b>SQL Editor</b> › <b>New query</b> › collez le script ci-dessous › <b>Run</b>.</li>
          <li>Menu <b>Authentication › Sign In / Providers › Email</b> : désactivez <b>« Confirm email »</b> (ou confirmez l'e-mail reçu après création du compte).</li>
          <li><b>Project Settings › API</b> (ou « API Keys ») : copiez l'<b>URL du projet</b> et la clé publique <b>anon / publishable</b>.</li>
          <li>Dans l'app sur l'ordinateur : <a class="link" href="#/reglages#sync">Réglages › Synchronisation</a> › remplissez › <b>Créer le compte</b>.</li>
          <li>Sur l'iPhone : mêmes informations (même phrase secrète) › <b>Se connecter</b>.</li>
        </ol>
        <pre class="code" id="sql">${esc(SETUP_SQL)}</pre>
        <button class="btn btn-sm" data-copy-sql>${icon('copy')} Copier le script</button>
        <p class="muted">Sécurité : vos données sont chiffrées sur l'appareil avec la phrase secrète avant l'envoi (AES-256) ; Supabase ne stocke qu'un bloc illisible, protégé en plus par votre compte. Un projet gratuit inactif pendant 7 jours est mis en pause : réactivez-le depuis le tableau de bord Supabase (rien n'est perdu ; vos données restent aussi sur vos appareils).</p>
      </section>
    </div>`;
    el.querySelector('[data-copy-sql]').onclick = async () => { try { await navigator.clipboard.writeText(SETUP_SQL); toast('Script copié'); } catch { toast('Sélectionnez le texte pour le copier'); } };
    const anchor = location.hash.split('#')[2];
    if (anchor) requestAnimationFrame(() => el.querySelector('#' + anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
};
