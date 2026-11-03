// Minimal local stand-in for the Supabase API gateway, for browser checks only:
//   /rest/v1/*     → PostgREST (same JWT secret, so RLS applies exactly as in production)
//   /auth/v1/user  → the user of a valid HS256 access token (what auth.getUser() asks)
// Everything else → 404. Never expose this beyond localhost.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3999';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

function verify(token) {
  const [h, p, s] = (token ?? '').split('.');
  if (!h || !p || !s) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (expected !== s) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/auth/v1/user') {
      const claims = verify(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!claims?.sub) return json(res, 401, { message: 'invalid JWT' });
      return json(res, 200, {
        id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email ?? null,
        app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(),
      });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      const upstream = await fetch(`${POSTGREST}${url.pathname.slice('/rest/v1'.length)}${url.search}`, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const out = {};
      upstream.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) out[k] = v;
      });
      res.writeHead(upstream.status, out);
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    json(res, 404, { message: 'not available in the local gateway' });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`gateway on :${PORT}`));
