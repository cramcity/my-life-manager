import * as S from './store.js';
const ACC = {
  indigo: ['#4f46e5', '#818cf8'], bleu: ['#0284c7', '#38bdf8'], vert: ['#059669', '#34d399'],
  ambre: ['#d97706', '#fbbf24'], rose: ['#db2777', '#f472b6'], ardoise: ['#475569', '#94a3b8'],
};
export function applyTheme() {
  const s = S.getSettings();
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') root.dataset.theme = s.theme; else delete root.dataset.theme;
  const [l, d] = ACC[s.accent] || ACC.indigo;
  root.style.setProperty('--accent-l', l);
  root.style.setProperty('--accent-d', d);
  const dark = s.theme === 'dark' || (s.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.remove());
  const m = document.createElement('meta'); m.name = 'theme-color'; m.content = dark ? '#0d1117' : '#f6f7f9';
  document.head.append(m);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
