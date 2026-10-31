'use strict';
// ذخیره تصاویر: روی دیسک (SQLite/پافرلند) یا Supabase Storage (ورسل، از طریق همان Edge Function)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('./db');
const { err } = require('./util');

const remote = D.mode === 'gateway';
const GW = (process.env.DB_GATEWAY_URL || '').replace(/\/$/, '');
const KEY = (process.env.DB_GATEWAY_KEY || '').trim();
const PUBLIC = (process.env.STORAGE_PUBLIC_URL || '').replace(/\/$/, '');
const UP = remote ? null : path.join(D.dir, 'uploads');
const NAME_RE = /^[a-f0-9]{24}\.(jpg|png|webp)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

async function gw(pathname, body) {
  let r;
  try { r = await fetch(GW + pathname, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kian-key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); }
  catch (e) { throw err(503, 'ارتباط با ذخیره‌ساز تصاویر برقرار نشد'); }
  if (!r.ok) { console.error('[storage]', r.status, await r.text().catch(() => '')); throw err(500, 'ذخیره تصویر ناموفق بود'); }
}

async function save(buf, ext) {
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  if (remote) await gw('/upload', { name, contentType: MIME[ext], data: buf.toString('base64') });
  else fs.writeFileSync(path.join(UP, name), buf);
  return name;
}
async function remove(names) {
  const ok = names.filter((n) => NAME_RE.test(n));
  if (!ok.length) return;
  if (remote) { try { await gw('/delete', { names: ok }); } catch (e) { /* غیرحیاتی */ } }
  else for (const n of ok) fs.rmSync(path.join(UP, n), { force: true });
}
const publicUrl = (name) => (PUBLIC && NAME_RE.test(name) ? `${PUBLIC}/${name}` : null);

module.exports = { remote, save, remove, publicUrl, dir: UP, NAME_RE };
