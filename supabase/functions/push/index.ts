// Fonction « push » (Supabase Edge Function, Deno) — My Life Manager
// GET  : renvoie la clé publique VAPID (créée automatiquement au premier appel ; la clé privée reste dans la base).
// POST : envoie les notifications arrivées à échéance (appelée chaque minute par pg_cron).
// Les messages sont déjà chiffrés par l'app pour chaque appareil : cette fonction ne peut pas les lire.
const SB = Deno.env.get('SUPABASE_URL')!;
// Clé serveur : ancienne clé « service_role » (JWT) ou nouvelle clé secrète « sb_secret_… ».
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); return k.default || Object.values(k)[0]; } catch { return ''; } })() as string;
const AUTH: Record<string, string> = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const SUBJECT = 'https://cramcity.github.io/my-life-manager/';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

const db = (p: string, init: RequestInit = {}) => fetch(`${SB}/rest/v1/${p}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

type Keys = { public_key: string; private_jwk: JsonWebKey };
let cached: Keys | null = null;
async function getKeys(): Promise<Keys> {
  if (cached) return cached;
  let r = await (await db('push_config?id=eq.1&select=public_key,private_jwk')).json();
  if (!Array.isArray(r)) throw new Error('push_config: ' + JSON.stringify(r));
  if (!r.length) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    await db('push_config', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: 1, public_key: pub, private_jwk: jwk }) });
    r = await (await db('push_config?id=eq.1&select=public_key,private_jwk')).json();
  }
  return cached = r[0];
}
const jwtCache = new Map<string, { v: string; exp: number }>();
async function vapid(endpoint: string, k: Keys) {
  const aud = new URL(endpoint).origin;
  const hit = jwtCache.get(aud);
  if (hit && hit.exp > Date.now() + 600000) return hit.v;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp, sub: SUBJECT })}`;
  const key = await crypto.subtle.importKey('jwk', { ...k.private_jwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  const v = `vapid t=${unsigned}.${b64u(sig)}, k=${k.public_key}`;
  jwtCache.set(aud, { v, exp: exp * 1000 });
  return v;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const k = await getKeys();
    if (req.method === 'GET') return Response.json({ publicKey: k.public_key }, { headers: cors });
    const now = new Date().toISOString();
    const due = await (await db(`push_queue?select=id,payload,sub_id,fire_at,push_subs(endpoint)&sent=eq.false&fire_at=lte.${now}&order=fire_at&limit=300`)).json();
    if (!Array.isArray(due)) throw new Error('push_queue: ' + JSON.stringify(due));
    let sent = 0, skipped = 0;
    const gone = new Set<string>(), errors: string[] = [];
    for (const q of due) {
      const ep = q.push_subs?.endpoint;
      if (!ep || Date.now() - Date.parse(q.fire_at) > 30 * 60000) { skipped++; continue; } // trop ancien : on n'envoie pas
      const r = await fetch(ep, { method: 'POST', headers: { Authorization: await vapid(ep, k), TTL: '3600', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' }, body: fromB64(q.payload) });
      if (r.status === 404 || r.status === 410) gone.add(q.sub_id);
      else if (r.ok) sent++;
      else errors.push(`${r.status} ${(await r.text()).slice(0, 160)}`);
    }
    if (due.length) await db(`push_queue?id=in.(${due.map((q: { id: number }) => q.id).join(',')})`, { method: 'DELETE' });
    if (gone.size) await db(`push_subs?id=in.(${[...gone].join(',')})`, { method: 'DELETE' });
    return Response.json({ due: due.length, sent, skipped, expired: gone.size, errors }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
