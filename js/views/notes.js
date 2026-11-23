import * as S from '../store.js';
import { esc, debounce, timeAgo, promptBox, confirmBox, toast, choiceBox } from '../utils.js';
import { icon } from '../icons.js';
import { empty, projectOptions } from '../components.js';
import { newNote } from '../editors.js';

const st = { nb: 'all', cat: '', q: '' };
let saveFn = null;
const lastLog = {};

/* ---------- Rendu du texte (titres, listes, cases à cocher) ---------- */
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
export function renderNote(text) {
  const lines = (text || '').split('\n');
  let html = '', list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  lines.forEach((l, i) => {
    let m;
    if ((m = l.match(/^\s*[-*] \[( |x|X)\] ?(.*)$/))) {
      if (list !== 'ul class="checks"') { close(); html += '<ul class="checks">'; list = 'ul class="checks"'; }
      const on = m[1].toLowerCase() === 'x';
      html += `<li class="${on ? 'on' : ''}"><button class="nchk" data-line="${i}" aria-label="Cocher">${on ? icon('check') : ''}</button><span>${inline(m[2])}</span></li>`;
    } else if ((m = l.match(/^\s*[-*•] (.*)$/))) {
      if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = l.match(/^\s*\d+[.)] (.*)$/))) {
      if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = l.match(/^(#{1,3}) (.*)$/))) {
      close(); html += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`;
    } else if (!l.trim()) { close(); html += '<div class="gap"></div>'; }
    else { close(); html += `<p>${inline(l)}</p>`; }
  });
  close();
  return list === null ? html : html;
}
const snippet = n => (n.content || '').replace(/^#+ /gm, '').replace(/- \[[ xX]\] /g, '☐ ').replace(/\n+/g, ' · ').slice(0, 120);
const checkStats = n => { const all = (n.content || '').match(/^\s*[-*] \[( |x|X)\]/gm) || []; const done = all.filter(x => /x/i.test(x)).length; return all.length ? `${done}/${all.length}` : ''; };

function filtered() {
  let list = S.all('notes');
  if (st.nb === 'pinned') list = list.filter(n => n.pinned);
  else if (st.nb !== 'all') list = list.filter(n => n.notebookId === st.nb);
  if (st.cat) list = list.filter(n => n.category === st.cat);
  if (st.q) { const q = st.q.toLowerCase(); list = list.filter(n => ((n.title || '') + ' ' + (n.content || '') + ' ' + (n.category || '')).toLowerCase().includes(q)); }
  return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
}

function sideHTML() {
  const notes = S.all('notes');
  const nbs = S.all('notebooks').sort((a, b) => a.createdAt - b.createdAt);
  const cats = S.getSettings().noteCategories;
  return `
  <div class="nb-section">
    <button class="nb-item ${st.nb === 'all' ? 'on' : ''}" data-nb="all">${icon('notes')}<span>Toutes les notes</span><em>${notes.length}</em></button>
    <button class="nb-item ${st.nb === 'pinned' ? 'on' : ''}" data-nb="pinned">${icon('pin')}<span>Épinglées</span><em>${notes.filter(n => n.pinned).length}</em></button>
  </div>
  <div class="nb-title"><span>Carnets</span><button class="icon-btn sm" data-add-nb title="Nouveau carnet">${icon('plus')}</button></div>
  <div class="nb-section">${nbs.map(b => `<div class="nb-row"><button class="nb-item ${st.nb === b.id ? 'on' : ''}" data-nb="${b.id}"><i class="dot" style="background:${b.color || '#6366f1'}"></i><span>${esc(b.name)}</span><em>${notes.filter(n => n.notebookId === b.id).length}</em></button><button class="icon-btn sm nb-edit" data-edit-nb="${b.id}" title="Renommer / supprimer">${icon('more')}</button></div>`).join('')}</div>
  <div class="nb-title"><span>Catégories</span><button class="icon-btn sm" data-add-cat title="Nouvelle catégorie">${icon('plus')}</button></div>
  <div class="cat-pills">${cats.map(c => `<button class="pill ${st.cat === c ? 'on' : ''} ${c === 'À ne pas oublier' ? 'pill-star' : ''}" data-cat="${esc(c)}">${c === 'À ne pas oublier' ? icon('star') : ''}${esc(c)} <em>${notes.filter(n => n.category === c).length}</em></button>`).join('')}</div>`;
}
function listHTML(activeId) {
  const list = filtered();
  return `
  <div class="note-list-head">
    <label class="search">${icon('search')}<input type="search" placeholder="Rechercher dans toutes les notes" value="${esc(st.q)}" data-q></label>
    <button class="btn btn-primary btn-icon-only" data-new title="Nouvelle note">${icon('plus')}</button>
  </div>
  <div class="note-items">
  ${list.length ? list.map(n => `
    <a class="note-item ${n.id === activeId ? 'on' : ''}" href="#/notes/${n.id}" data-note="${n.id}">
      <div class="ni-top"><b data-title-of="${n.id}">${esc(n.title || 'Sans titre')}</b>${n.pinned ? icon('pin', 'pinned') : ''}</div>
      <p>${esc(snippet(n)) || '<span class="muted">Note vide</span>'}</p>
      <div class="ni-meta"><span>${timeAgo(n.updatedAt)}</span>${n.category ? `<span class="tag ${n.category === 'À ne pas oublier' ? 'tag-star' : ''}">${esc(n.category)}</span>` : ''}${checkStats(n) ? `<span class="tag">${icon('checklist')} ${checkStats(n)}</span>` : ''}</div>
    </a>`).join('') : empty('notes', st.q ? 'Aucune note ne correspond à la recherche.' : 'Aucune note ici.', '<button class="btn btn-primary" data-new>Nouvelle note</button>')}
  </div>`;
}
function editorHTML(n) {
  const nbs = S.all('notebooks');
  const cats = S.getSettings().noteCategories;
  const mode = n._mode || ((n.content || '').trim() ? 'view' : 'edit');
  return `
  <div class="editor" data-editor="${n.id}">
    <div class="ed-top">
      <a class="icon-btn back-btn" href="#/notes" aria-label="Retour">${icon('left')}</a>
      <span class="save-state" data-save>Enregistré</span>
      <span class="spacer"></span>
      <button class="icon-btn ${n.pinned ? 'on' : ''}" data-pin title="${n.pinned ? 'Désépingler' : 'Épingler'}">${icon('pin')}</button>
      <button class="icon-btn" data-del title="Supprimer">${icon('trash')}</button>
    </div>
    <input class="ed-title" placeholder="Titre" value="${esc(n.title)}" data-title>
    <div class="ed-meta">
      <select class="input input-sm" data-field="notebookId">${nbs.map(b => `<option value="${b.id}" ${b.id === n.notebookId ? 'selected' : ''}>📒 ${esc(b.name)}</option>`).join('')}</select>
      <select class="input input-sm" data-field="category"><option value="">Sans catégorie</option>${cats.map(c => `<option ${c === n.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select class="input input-sm" data-field="projectId">${projectOptions().map(o => `<option value="${o.value}" ${o.value === (n.projectId || '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
    </div>
    <div class="ed-toolbar">
      <button data-fmt="h" title="Titre">${icon('heading')}<span>Titre</span></button>
      <button data-fmt="ul" title="Liste">${icon('list')}<span>Liste</span></button>
      <button data-fmt="check" title="Case à cocher">${icon('checklist')}<span>Case</span></button>
      <span class="spacer"></span>
      <button data-mode class="${mode === 'view' ? 'on' : ''}" title="Basculer lecture / écriture">${icon(mode === 'view' ? 'edit' : 'eye')}<span>${mode === 'view' ? 'Écrire' : 'Lecture'}</span></button>
    </div>
    <textarea class="ed-text" data-text placeholder="Écrivez librement…\n\n- [ ] une case à cocher\n- un élément de liste\n## un titre" ${mode === 'view' ? 'hidden' : ''}>${esc(n.content)}</textarea>
    <div class="ed-view prose" data-view ${mode === 'view' ? '' : 'hidden'}>${renderNote(n.content) || '<p class="muted">Note vide — touchez « Écrire » pour commencer.</p>'}</div>
    <p class="ed-foot muted">Créée ${timeAgo(n.createdAt)} · modifiée ${timeAgo(n.updatedAt)}</p>
  </div>`;
}

function bindEditor(el, n, ctx) {
  const ed = el.querySelector('[data-editor]'); if (!ed) return;
  const ta = ed.querySelector('[data-text]'), ti = ed.querySelector('[data-title]'), view = ed.querySelector('[data-view]'), saveEl = ed.querySelector('[data-save]');
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.max(260, ta.scrollHeight + 4) + 'px'; };
  const doSave = async () => {
    const cur = S.get('notes', n.id); if (!cur) return;
    const changes = { title: ti.value, content: ta.value };
    if (cur.title === changes.title && cur.content === changes.content) { saveEl.textContent = 'Enregistré'; return; }
    await S.put('notes', { ...cur, ...changes }, { silent: true });
    saveEl.textContent = 'Enregistré'; saveEl.classList.remove('pending');
    const tEl = el.querySelector(`[data-title-of="${n.id}"]`); if (tEl) tEl.textContent = changes.title || 'Sans titre';
    if (!lastLog[n.id] || Date.now() - lastLog[n.id] > 10 * 60000) { lastLog[n.id] = Date.now(); S.log(cur.content || cur.title ? 'Note modifiée' : 'Note créée', changes.title || 'Sans titre', { type: 'note', projectId: cur.projectId }); }
  };
  const save = debounce(doSave, 500);
  saveFn = () => save.flush();
  const dirty = () => { saveEl.textContent = 'Enregistrement…'; saveEl.classList.add('pending'); save(); };
  ta.addEventListener('input', () => { autosize(); dirty(); });
  ti.addEventListener('input', dirty);
  ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (ta.hidden) ed.querySelector('[data-mode]').click(); ta.focus(); } });
  requestAnimationFrame(autosize);
  if (!n.title && !n.content) setTimeout(() => ti.focus(), 60);

  // Continuer automatiquement les listes avec Entrée
  ta.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const v = ta.value, pos = ta.selectionStart;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    const line = v.slice(ls, pos);
    const m = line.match(/^(\s*)([-*] \[[ xX]\] |[-*•] |(\d+)([.)]) )/);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[2].trim()) { ta.setRangeText('', ls, pos, 'end'); }
    else {
      let next = m[2].startsWith('- [') || m[2].startsWith('* [') ? '- [ ] ' : m[3] ? `${+m[3] + 1}${m[4]} ` : m[2];
      ta.setRangeText('\n' + m[1] + next, pos, ta.selectionEnd, 'end');
    }
    autosize(); dirty();
  });
  ed.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => {
    if (ta.hidden) ed.querySelector('[data-mode]').click();
    const pre = { h: '## ', ul: '- ', check: '- [ ] ' }[b.dataset.fmt];
    const v = ta.value, pos = ta.selectionStart;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    const line = v.slice(ls).split('\n')[0];
    const stripped = line.replace(/^(#{1,3} |[-*] \[[ xX]\] |[-*•] )/, '');
    const nl = line.startsWith(pre) ? stripped : pre + stripped;
    ta.setRangeText(nl, ls, ls + line.length, 'end');
    ta.focus(); autosize(); dirty();
  });
  ed.querySelector('[data-mode]').onclick = () => {
    const toView = !ta.hidden;
    save.flush();
    n._mode = toView ? 'view' : 'edit';
    ta.hidden = toView; view.hidden = !toView;
    if (toView) view.innerHTML = renderNote(ta.value) || '<p class="muted">Note vide.</p>';
    else { autosize(); ta.focus(); }
    const b = ed.querySelector('[data-mode]');
    b.classList.toggle('on', toView);
    b.innerHTML = `${icon(toView ? 'edit' : 'eye')}<span>${toView ? 'Écrire' : 'Lecture'}</span>`;
    sessionStorage.setItem('note:mode:' + n.id, n._mode);
  };
  view.addEventListener('click', e => {
    const c = e.target.closest('.nchk'); if (!c) return;
    const lines = ta.value.split('\n'); const i = +c.dataset.line;
    lines[i] = /\[[xX]\]/.test(lines[i]) ? lines[i].replace(/\[[xX]\]/, '[ ]') : lines[i].replace('[ ]', '[x]');
    ta.value = lines.join('\n');
    view.innerHTML = renderNote(ta.value);
    save.flush();
  });
  ed.querySelectorAll('[data-field]').forEach(s => s.onchange = async () => {
    save.flush();
    await S.patch('notes', n.id, { [s.dataset.field]: s.value || null });
  });
  ed.querySelector('[data-pin]').onclick = async () => { save.flush(); await S.patch('notes', n.id, { pinned: !S.get('notes', n.id).pinned }); };
  ed.querySelector('[data-del]').onclick = async () => {
    if (!await confirmBox(`Supprimer la note « ${ti.value || 'Sans titre'} » ?`, { ok: 'Supprimer', danger: true })) return;
    saveFn = null;
    await S.remove('notes', n.id); S.log('Note supprimée', ti.value || 'Sans titre', { type: 'note' });
    location.hash = '#/notes'; toast('Note supprimée');
  };
}

function render(el, params, ctx) {
  if (params.get('c') != null) { st.cat = params.get('c'); st.nb = 'all'; }
  const id = ctx.parts[1];
  let note = id ? S.get('notes', id) : null;
  if (note) note._mode = sessionStorage.getItem('note:mode:' + note.id) || undefined;
  el.innerHTML = `
    <div class="notes-layout ${note ? 'has-note' : ''}">
      <aside class="notes-side">${sideHTML()}</aside>
      <section class="notes-list">${listHTML(note?.id)}</section>
      <section class="notes-editor">${note ? editorHTML(note) : `<div class="editor-empty">${empty('notes', id ? 'Cette note n\'existe plus.' : 'Sélectionnez une note ou créez-en une nouvelle.', '<button class="btn btn-primary" data-new>Nouvelle note</button>')}</div>`}</section>
    </div>`;
  if (note) bindEditor(el, note, ctx);

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-nb],[data-cat],[data-new],[data-add-nb],[data-add-cat],[data-edit-nb]');
    if (!b) return;
    if (b.dataset.nb) { st.nb = b.dataset.nb; st.cat = ''; ctx.go('#/notes'); ctx.rerender(); }
    else if (b.dataset.cat != null && b.hasAttribute('data-cat')) { st.cat = st.cat === b.dataset.cat ? '' : b.dataset.cat; if (location.hash.includes('?')) ctx.go('#/notes'); ctx.rerender(); }
    else if (b.hasAttribute('data-new')) newNote({ notebookId: !['all', 'pinned'].includes(st.nb) ? st.nb : S.all('notebooks')[0]?.id, category: st.cat || '', pinned: st.nb === 'pinned' });
    else if (b.hasAttribute('data-add-nb')) { const name = await promptBox('Nouveau carnet', { label: 'Nom du carnet', placeholder: 'Ex. : Recettes' }); if (name) { const colors = S.CATEGORY_COLORS; const nb = await S.put('notebooks', { name, color: colors[S.all('notebooks').length % colors.length] }); st.nb = nb.id; ctx.rerender(); } }
    else if (b.hasAttribute('data-add-cat')) { const name = await promptBox('Nouvelle catégorie de notes', { label: 'Nom' }); if (name && !S.getSettings().noteCategories.includes(name)) await S.setSettings({ noteCategories: [...S.getSettings().noteCategories, name] }); }
    else if (b.dataset.editNb) {
      const nb = S.get('notebooks', b.dataset.editNb);
      const c = await choiceBox(`Carnet « ${nb.name} »`, [{ label: 'Annuler', value: null }, { label: 'Supprimer', value: 'del', danger: true }, { label: 'Renommer', value: 'ren', primary: true }], 'Carnet');
      if (c === 'ren') { const name = await promptBox('Renommer le carnet', { value: nb.name }); if (name) await S.patch('notebooks', nb.id, { name }); }
      if (c === 'del') {
        const others = S.all('notebooks').filter(x => x.id !== nb.id);
        if (!others.length) { toast('Il faut garder au moins un carnet.', { type: 'warn' }); return; }
        if (!await confirmBox(`Supprimer « ${nb.name} » ? Ses notes seront déplacées dans « ${others[0].name} ».`, { ok: 'Supprimer', danger: true })) return;
        for (const n of S.all('notes').filter(x => x.notebookId === nb.id)) await S.patch('notes', n.id, { notebookId: others[0].id });
        await S.remove('notebooks', nb.id); st.nb = 'all';
      }
    }
  });
  let qt;
  el.addEventListener('input', e => {
    if (!e.target.matches('[data-q]')) return;
    st.q = e.target.value;
    clearTimeout(qt);
    qt = setTimeout(() => {
      el.querySelector('.notes-list').innerHTML = listHTML(note?.id);
      const nq = el.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length);
    }, 200);
  });
}
export default {
  title: 'Notes',
  render,
  // Ne pas reconstruire l'écran pendant la saisie ; sauvegarder avant de quitter
  destroy() { saveFn?.(); saveFn = null; },
  keepWhileEditing: true,
};
