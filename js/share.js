// Partage de tâches par lien. Le contenu de la tâche est placé après le « # » du lien :
// cette partie n'est jamais envoyée à un serveur (ni GitHub, ni Supabase, ni l'aperçu des messageries).
import * as S from './store.js';
import { uid, esc, toast, openModal } from './utils.js';
import { remindersOf } from './recur.js';

const b64u = {
  enc: str => { const bytes = new TextEncoder().encode(str); let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: code => { const s = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4)); return new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0))); },
};

export function shareLink(t) {
  const p = {
    v: 1, i: uid(), t: t.title, d: (t.description || '').slice(0, 1500) || undefined,
    due: t.dueDate || undefined, tm: t.dueTime || undefined, p: t.priority && t.priority !== 'normal' ? t.priority : undefined,
    r: remindersOf(t).length ? remindersOf(t) : undefined, f: (S.getSettings().name || '').slice(0, 40) || undefined,
  };
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  return base + '#/recevoir?t=' + b64u.enc(JSON.stringify(p));
}

/** Lit un lien (ou seulement son code) de tâche partagée. Renvoie null s'il est invalide. */
export function readShare(input) {
  try {
    let code = String(input || '').trim();
    const m = code.match(/[?&]t=([A-Za-z0-9_-]+)/); if (m) code = m[1];
    if (!/^[A-Za-z0-9_-]{8,}$/.test(code)) return null;
    const p = JSON.parse(b64u.dec(code));
    if (p?.v !== 1 || typeof p.t !== 'string' || !p.t.trim()) return null;
    const ymd = /^\d{4}-\d{2}-\d{2}$/, hm = /^\d{2}:\d{2}$/;
    return {
      id: String(p.i || '').slice(0, 64), title: p.t.slice(0, 300), description: typeof p.d === 'string' ? p.d.slice(0, 1500) : '',
      dueDate: ymd.test(p.due || '') ? p.due : '', dueTime: hm.test(p.tm || '') ? p.tm : '',
      priority: ['low', 'normal', 'high', 'urgent'].includes(p.p) ? p.p : 'normal',
      reminders: Array.isArray(p.r) ? p.r.map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 10080).slice(0, 9) : [],
      from: typeof p.f === 'string' ? p.f.slice(0, 40) : '',
    };
  } catch { return null; }
}

export async function shareTask(t) {
  const url = shareLink(t);
  const who = S.getSettings().name;
  const text = `📌 ${who ? who + ' vous partage' : 'Je vous partage'} une tâche : « ${t.title} »${t.dueDate ? ` (pour le ${t.dueDate.split('-').reverse().join('/')}${t.dueTime ? ' à ' + t.dueTime : ''})` : ''}. Touchez le lien pour l'ajouter à vos tâches dans My Life Manager :`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Tâche partagée', text, url }); S.log('Tâche partagée', t.title, { type: 'task', projectId: t.projectId }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  const msg = encodeURIComponent(text + ' ' + url);
  const m = openModal({
    title: 'Partager la tâche',
    body: `<p class="small">Envoyez ce lien à la personne : en l'ouvrant, elle pourra ajouter « <b>${esc(t.title)}</b> » à ses tâches.</p>
      <input class="input mt" readonly value="${esc(url)}" data-link>
      <div class="row wrap mt">
        <button class="btn btn-primary" data-copy>Copier le lien</button>
        <a class="btn" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn" href="sms:&body=${msg}">SMS</a>
        <a class="btn" href="mailto:?subject=${encodeURIComponent('Tâche partagée : ' + t.title)}&body=${msg}">E-mail</a>
      </div>`,
  });
  const root = m?.el || document.querySelector('.modal-overlay:last-of-type') || document;
  root.querySelector('[data-copy]')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('Lien copié ✅'); }
    catch { const i = root.querySelector('[data-link]'); i.select(); document.execCommand?.('copy'); toast('Lien sélectionné : copiez-le'); }
  });
  S.log('Tâche partagée', t.title, { type: 'task', projectId: t.projectId });
}
