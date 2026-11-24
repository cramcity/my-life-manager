// Réception d'une tâche partagée : aperçu puis ajout dans « mes tâches ».
import * as S from '../store.js';
import { esc, toast, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { pageHead, prioBadge, projectOptions } from '../components.js';
import { remindLabel } from '../recur.js';
import { readShare } from '../share.js';

function render(el, params, ctx) {
  const code = params.get('t');
  const sh = code ? readShare(code) : null;
  if (!sh) {
    el.innerHTML = `${pageHead('Recevoir une tâche')}
      <section class="card receive-card">
        ${code ? `<p class="lock-err">${icon('alert')} Ce lien de tâche est incomplet ou abîmé. Demandez à la personne de vous le renvoyer.</p>` : ''}
        <p class="small">Collez ici le lien de tâche que l'on vous a envoyé :</p>
        <form class="row mt" data-paste><input class="input" name="link" placeholder="https://…#/recevoir?t=…" autocomplete="off"><button class="btn btn-primary" type="submit">Ouvrir</button></form>
      </section>`;
    el.querySelector('[data-paste]').addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.link.value; const s = readShare(v);
      if (!s) { toast("Ce n'est pas un lien de tâche valide.", { type: 'warn' }); return; }
      const m = v.match(/[?&]t=([A-Za-z0-9_-]+)/);
      ctx.go('#/recevoir?t=' + (m ? m[1] : v.trim()));
    });
    return;
  }
  const already = sh.id && S.all('tasks').find(t => t.sharedId === sh.id);
  el.innerHTML = `${pageHead('Tâche partagée', '', sh.from ? `${esc(sh.from)} vous partage une tâche` : 'On vous partage une tâche')}
    <section class="card receive-card">
      <div class="rc-head">${icon('tasks')}<div><h2>${esc(sh.title)}</h2>
        <div class="rc-meta">${sh.dueDate ? `<span>${icon('calendar')} ${esc(fmtDate(sh.dueDate))}${sh.dueTime ? ' à ' + esc(sh.dueTime) : ''}</span>` : '<span class="muted">Sans date</span>'}${sh.priority !== 'normal' ? prioBadge(sh.priority) : ''}</div></div></div>
      ${sh.description ? `<p class="rc-desc">${esc(sh.description).replace(/\n/g, '<br>')}</p>` : ''}
      ${sh.reminders.length && sh.dueTime ? `<p class="small muted">${icon('bell')} Rappels : ${sh.reminders.map(remindLabel).join(', ')}</p>` : ''}
      ${already ? `<p class="banner banner-accent mt">${icon('check')} Cette tâche est déjà dans vos tâches.</p>
        <div class="row wrap mt"><a class="btn btn-primary" href="#/taches">Voir mes tâches</a></div>` : `
      <label class="field mt"><span>Ranger dans un projet (facultatif)</span><select class="input" data-proj>${projectOptions().map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label>
      <div class="row wrap mt"><button class="btn btn-primary btn-lg" data-add>${icon('plus')} Ajouter à mes tâches</button><a class="btn btn-ghost" href="#/">Ignorer</a></div>`}
    </section>`;
  el.querySelector('[data-add]')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    const t = await S.put('tasks', {
      title: sh.title, description: sh.description, dueDate: sh.dueDate, dueTime: sh.dueTime, priority: sh.priority,
      status: 'todo', category: '', projectId: el.querySelector('[data-proj]').value || null, reminders: sh.reminders,
      sharedId: sh.id || null, sharedFrom: sh.from || null,
    });
    S.log('Tâche reçue', sh.from ? `${t.title} (de ${sh.from})` : t.title, { type: 'task', projectId: t.projectId });
    toast('Tâche ajoutée à vos tâches ✅');
    ctx.go('#/taches');
  });
}
export default { render };
