// Serveur de test (développement uniquement) : sert l'app ET imite l'API Supabase en mémoire, sous /mock.
// Lancement : node tools/mock-cloud.mjs  → http://127.0.0.1:5181 (l'app utilise alors ce faux serveur).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
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
    const uid = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
    if (!uid) return json(res, 401, { message: 'JWT expired' });
    if (p === '/rest/v1/vaults' && req.method === 'GET') { const want = (url.searchParams.get('user_id') || '').replace('eq.', ''); return json(res, 200, want === uid && vaults.has(uid) ? [vaults.get(uid)] : []); }
    if (p === '/rest/v1/vaults' && req.method === 'POST') { const b = await body(req); if (b.user_id !== uid) return json(res, 403, { message: 'RLS' }); vaults.set(uid, { data: b.data, updated_at: b.updated_at }); return json(res, 201); }
    if (p === '/debug') return json(res, 200, { users: [...users.keys()], vaults: [...vaults.entries()].map(([k, v]) => ({ k, len: v.data.length, plaintextLeak: /Courses|Bienvenue|CRAMCITY/.test(v.data) })) });
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
