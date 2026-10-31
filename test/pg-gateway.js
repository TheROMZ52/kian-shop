'use strict';
// دروازه آزمایشی: همان پروتکل Edge Function سوپابیس را روی Postgres واقعی (PGlite، داخل حافظه) پیاده می‌کند
// تا بتوانیم کل برنامه را روی لهجه SQL پستگرس تست کنیم.
const fs = require('fs');
const http = require('http');
const path = require('path');

async function start(key = 'test-key') {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite({ parsers: { 20: (v) => Number(v), 1700: (v) => Number(v) } });
  await pg.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'postgres.sql'), 'utf8'));
  await pg.exec('set search_path = kian, public');
  const files = new Map();
  let base;
  const server = http.createServer(async (req, res) => {
    const send = (code, o, type) => { res.writeHead(code, { 'content-type': type || 'application/json' }); res.end(type ? o : JSON.stringify(o)); };
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    if (req.method === 'GET' && req.url.startsWith('/public/')) { const f = files.get(req.url.slice(8)); return f ? send(200, f.buf, f.type) : send(404, {}); }
    if (req.headers['x-kian-key'] !== key) return send(403, { error: 'forbidden' });
    const body = raw ? JSON.parse(raw) : {};
    if (req.url.endsWith('/upload')) { files.set(body.name, { buf: Buffer.from(body.data, 'base64'), type: body.contentType }); return send(200, { ok: true }); }
    if (req.url.endsWith('/delete')) { body.names.forEach((n) => files.delete(n)); return send(200, { ok: true }); }
    try {
      const results = await pg.transaction(async (tx) => {
        const out = [];
        for (const [i, op] of body.ops.entries()) {
          const r = await tx.query(op.sql, op.params || []);
          const count = /^\s*(select|with)/i.test(op.sql) ? r.rows.length : (r.affectedRows ?? r.rows.length);
          if (op.min && count < op.min) throw Object.assign(new Error('min'), { index: i });
          out.push({ rows: r.rows, count });
        }
        return out;
      });
      send(200, { results });
    } catch (e) {
      if (e.index !== undefined) return send(409, { error: 'min', index: e.index });
      console.error('[pg-gateway]', e.message);
      send(500, { error: e.message });
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return { url: base + '/fn', publicUrl: base + '/public', key, close: () => { server.close(); return pg.close(); } };
}
module.exports = { start };
