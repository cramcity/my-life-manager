// Écran « Mon profil » : créer un profil ou se connecter pour retrouver ses données sur tous ses appareils.
import * as S from './store.js';
import * as Sync from './sync.js';
import { icon } from './icons.js';
import { esc, toast } from './utils.js';

/**
 * Affiche l'écran de profil. Résout avec 'signup' | 'login' | 'local' (utilisation sans compte).
 * @param {{allowSkip?: boolean, allowClose?: boolean, mode?: 'signup'|'login'}} opts
 */
export function authScreen({ allowSkip = true, allowClose = false, mode = 'signup' } = {}) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'lock-screen auth-screen';
    document.body.append(ov);
    const draw = () => {
      const up = mode === 'signup';
      ov.innerHTML = `
        <form class="lock-card auth-card" novalidate>
          ${allowClose ? `<button type="button" class="icon-btn auth-close" data-close aria-label="Fermer">${icon('x')}</button>` : ''}
          <img src="icons/icon-192.png" width="72" height="72" alt="">
          <h1>My Life Manager</h1>
          <div class="seg auth-tabs" role="tablist">
            <button type="button" class="${up ? 'on' : ''}" data-mode="signup">Créer mon profil</button>
            <button type="button" class="${up ? '' : 'on'}" data-mode="login">Se connecter</button>
          </div>
          <p class="muted small">${up ? 'Votre profil garde vos données en sécurité et vous permet de les retrouver sur tous vos appareils.' : 'Connectez-vous pour retrouver toutes vos données sur cet appareil.'}</p>
          ${up ? '<input class="input" name="name" autocomplete="given-name" placeholder="Prénom" required>' : ''}
          <input class="input" name="email" type="email" autocomplete="${up ? 'email' : 'username'}" inputmode="email" autocapitalize="off" placeholder="E-mail" required>
          <input class="input" name="password" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="Mot de passe${up ? ' (8 caractères min.)' : ''}" required minlength="8">
          ${up ? `<input class="input" name="password2" type="password" autocomplete="new-password" placeholder="Confirmer le mot de passe" required>
          <label class="check-field auth-check"><input type="checkbox" name="presets"> <span>Ajouter les espaces projets prédéfinis (Formation producteur exécutif, Perform English, Sport, CRAMCITY, YouTube, Recherche d'emploi)</span></label>
          <p class="auth-warn">${icon('alert')} Notez bien votre mot de passe : vos données sont chiffrées avec lui. S'il est oublié, elles ne peuvent pas être récupérées.</p>` : ''}
          <p class="lock-err" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${up ? icon('check') + ' Créer mon profil' : icon('cloud') + ' Se connecter'}</button>
          ${allowSkip ? '<button type="button" class="btn btn-ghost btn-sm" data-skip>Continuer sans profil (données sur cet appareil uniquement)</button>' : ''}
        </form>`;
      setTimeout(() => ov.querySelector('input')?.focus(), 60);
    };
    draw();
    const err = msg => { const p = ov.querySelector('.lock-err'); p.textContent = msg; p.hidden = !msg; if (msg) { const c = ov.querySelector('.lock-card'); c.classList.add('shake'); setTimeout(() => c.classList.remove('shake'), 400); } };
    const close = v => { ov.remove(); resolve(v); };

    ov.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode && b.dataset.mode !== mode) { mode = b.dataset.mode; draw(); }
      else if (b.hasAttribute('data-skip')) { try { localStorage.setItem('mlm:noAccount', '1'); } catch { } close('local'); }
      else if (b.hasAttribute('data-close')) close(null);
    });
    ov.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, v = Object.fromEntries(new FormData(f).entries());
      const up = mode === 'signup';
      if (up && !v.name?.trim()) return err('Indiquez votre prénom.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email || '')) return err('Adresse e-mail invalide.');
      if ((v.password || '').length < 8) return err('Mot de passe : 8 caractères minimum.');
      if (up && v.password !== v.password2) return err('Les deux mots de passe ne sont pas identiques.');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = up ? 'Création du profil…' : 'Connexion…';
      err('');
      try {
        const { existing } = await Sync.connect({ email: v.email, password: v.password, signup: up });
        const fresh = up && !existing; // vrai nouveau profil (sinon : profil existant, on récupère ses données)
        if (fresh) {
          await S.seedIfNeeded();
          if (v.presets) await S.seedPresetProjects();
          await S.setSettings({ name: v.name.trim(), syncOn: true }, { silent: true });
        } else {
          await Sync.syncNow();            // récupère les données du compte et les fusionne
          await S.seedIfNeeded();
          await S.setSettings({ syncOn: true }, { silent: true });
        }
        try { localStorage.removeItem('mlm:noAccount'); } catch { }
        await Sync.syncNow().catch(() => { });
        close(fresh ? 'signup' : 'login');
        toast(fresh ? `Profil créé. Bienvenue ${v.name.trim()} !` : 'Connecté : vos données sont à jour ✅');
      } catch (ex) {
        err(ex.message || 'Échec de la connexion.');
        btn.disabled = false; btn.innerHTML = up ? icon('check') + ' Créer mon profil' : icon('cloud') + ' Se connecter';
      }
    });
  });
}

/** Déconnexion : envoie les dernières modifications, puis efface les données de cet appareil. */
export async function logout() {
  try { await Sync.syncNow(); }
  catch (e) { throw new Error("Impossible d'envoyer vos dernières modifications (" + e.message + '). Reconnectez-vous à Internet puis réessayez.'); }
  await Sync.disconnect();
  await S.wipeAll();
  try { localStorage.clear(); } catch { }
  location.hash = '#/';
  location.reload();
}
