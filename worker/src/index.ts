export interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
  ALLOWED_ORIGIN?: string;
}

const json = (body: unknown, status = 200, origin = '*') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Cache-Control': 'no-store' } });

function authorized(request: Request, env: Env) {
  const header = request.headers.get('Authorization') ?? '';
  return Boolean(env.SYNC_TOKEN && header === `Bearer ${env.SYNC_TOKEN}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS' } });
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'trinity-os-sync' }, 200, origin);
    if (url.pathname !== '/api/sync' || !['GET', 'PUT'].includes(request.method)) return json({ error: 'Not found' }, 404, origin);
    if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT payload, updated_at FROM learning_state WHERE id = 1').first<{ payload: string; updated_at: string }>();
      if (!row) return json({ data: null, updatedAt: null }, 200, origin);
      return json({ data: JSON.parse(row.payload), updatedAt: row.updated_at }, 200, origin);
    }
    const body = await request.json<{ data?: unknown }>();
    if (!body?.data) return json({ error: 'data is required' }, 400, origin);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare('INSERT INTO learning_state (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at').bind(JSON.stringify(body.data), updatedAt).run();
    return json({ ok: true, updatedAt }, 200, origin);
  },
};
