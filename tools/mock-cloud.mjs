// Serveur de test (développement uniquement) : sert l'app ET imite l'API Supabase en mémoire, sous /mock.
// Lancement : node tools/mock-cloud.mjs  → http://127.0.0.1:5181 (l'app utilise alors ce faux serveur).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const stats = { down: 0, calls: {} };
const users = new Map(), tokens = new Map(), refresh = new Map(), vaults = new Map();
const session = u => { const t = randomUUID(), r = randomUUID(); tokens.set(t, u.id); refresh.set(r, u); return { access_token: t, refresh_token: r, expires_in: 3600, user: { id: u.id, email: u.email } }; };
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/mock/')) {
    const p = url.pathname.slice(5);
    if (p === '/auth/v1/signup') {
      const { email, password } = await body(req);
      if (users.has(email)) return json(res, 422, { code: 'user_already_exists', msg: 'User already registered' });
      if ((password || '').length < 6) return json(res, 422, { code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      const u = { id: randomUUID(), email, password }; users.set(email, u); return json(res, 200, session(u));
    }
    if (p === '/auth/v1/token') {
      const b = await body(req);
      if (url.searchParams.get('grant_type') === 'password') { const u = users.get(b.email); if (!u || u.password !== b.password) return json(res, 400, { code: 'invalid_credentials', msg: 'Invalid login credentials' }); return json(res, 200, session(u)); }
      const u = refresh.get(b.refresh_token); if (!u) return json(res, 400, { code: 'refresh_token_not_found' }); return json(res, 200, session(u));
    }
    if (p === '/debug') return json(res, 200, { stats, users: [...users.keys()], vaults: [...vaults.entries()].map(([k, v]) => ({ k, len: v.data.length, plaintextLeak: /Courses|Bienvenue|Projet/.test(v.data) })) });
    const uid = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
    if (!uid) return json(res, 401, { message: 'JWT expired' });
    if (p === '/rest/v1/vaults') {
      stats.calls[req.method] = (stats.calls[req.method] || 0) + 1;
      const want = (url.searchParams.get('user_id') || '').replace('eq.', '');
      const pick = row => { const sel = (url.searchParams.get('select') || 'data,updated_at').split(','); return Object.fromEntries(sel.map(k => [k, row[k]])); };
      if (req.method === 'GET') { const rows = want === uid && vaults.has(uid) ? [pick(vaults.get(uid))] : []; stats.down += JSON.stringify(rows).length; return json(res, 200, rows); }
      if (req.method === 'POST') { const b = await body(req); if (b.user_id !== uid) return json(res, 403, { message: 'RLS' }); if (vaults.has(uid)) return json(res, 409, { code: '23505', message: 'duplicate key' }); vaults.set(uid, { data: b.data, updated_at: b.updated_at }); return json(res, 201, [pick(vaults.get(uid))]); }
      if (req.method === 'PATCH') { const b = await body(req); const cond = url.searchParams.get('updated_at')?.replace('eq.', ''); const cur = vaults.get(uid); if (want !== uid || !cur || (cond && cur.updated_at !== cond)) return json(res, 200, []); vaults.set(uid, { data: b.data, updated_at: b.updated_at }); return json(res, 200, [pick(vaults.get(uid))]); }
    }
    return json(res, 404, {});
  }
  try {
    let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  } catch { res.writeHead(404).end('404'); }
}).listen(5181, '127.0.0.1', () => console.log('Test : http://127.0.0.1:5181'));
