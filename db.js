'use strict';
/* لایه دیتابیس با دو درایور و یک رابط async یکسان:
   • SQLite (پیش‌فرض، برای پافرلند/لوکال): فایل در DATA_DIR
   • Gateway (برای ورسل): Postgres سوپابیس از طریق Edge Function با کلید مخفی (DB_GATEWAY_URL + DB_GATEWAY_KEY)
   همه کدهای برنامه فقط از get/all/run/batch استفاده می‌کنند. batch = چند دستور در یک تراکنش اتمیک. */
const fs = require('fs');
const path = require('path');
const { err } = require('./util');

const GATEWAY_URL = (process.env.DB_GATEWAY_URL || '').trim();
const GATEWAY_KEY = (process.env.DB_GATEWAY_KEY || '').trim();
const MODE = GATEWAY_URL ? 'gateway' : 'sqlite';

const DEFAULT_SETTINGS = {
  shop_name: 'کیان اکسسور',
  tagline: 'کمربند، کیف و اکسسوری',
  owner_phone: '+989039665868',
  admin_telegram: '@TheROMZ52',
  telegram_link: 'https://t.me/Kianacs?direct',
  instagram: '2026.kian_accessory',
  shipping_cost: '50000',
  free_shipping_over: '2000000',
  payment_info: 'پس از ثبت سفارش و تأیید موجودی، نحوه پرداخت (کارت‌به‌کارت یا روش هماهنگ‌شده) از طریق پیام‌رسان یا تماس به شما اعلام می‌شود.',
  announcement: '',
  business_city: '',
  business_address: '',
};
const DEFAULT_CATEGORIES = ['کمربند', 'کیف', 'اکسسوری'];
const ID_TABLES = new Set(['users', 'categories', 'products', 'orders', 'order_items', 'order_events']);

/* ---------------- SQLite ---------------- */
function sqliteDriver() {
  const Database = require('better-sqlite3'); // lazy: روی ورسل لود نمی‌شود
  const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
  const DB_FILE = path.join(DATA_DIR, 'shop.sqlite');
  const SCHEMA = fs.readFileSync(path.join(__dirname, 'db', 'sqlite.sql'), 'utf8');
  let cur;
  const open = () => {
    const d = new Database(DB_FILE);
    try { d.pragma('journal_mode = ' + (process.env.SQLITE_JOURNAL || 'WAL')); } catch (e) { /* برخی فایل‌سیستم‌ها WAL ندارند */ }
    d.pragma('foreign_keys = ON'); d.pragma('busy_timeout = 5000'); d.exec(SCHEMA);
    return d;
  };
  cur = open();
  const one = (op) => {
    const st = cur.prepare(op.sql);
    if (st.reader) { const rows = st.all(...(op.params || [])); return { rows, changes: rows.length, lastInsertRowid: undefined }; }
    const r = st.run(...(op.params || []));
    return { rows: [], changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
  };
  return {
    dir: DATA_DIR, file: DB_FILE,
    async batch(ops) {
      cur.exec('BEGIN IMMEDIATE');
      try {
        const out = ops.map((op, i) => { const r = one(op); if (op.min && r.changes < op.min) throw Object.assign(new Error('min'), { minIndex: i }); return r; });
        cur.exec('COMMIT');
        return out;
      } catch (e) { try { cur.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
    },
    async one(op) { return one(op); },
    backupTo: (dest) => cur.backup(dest),
    replaceWith(src) {
      try { cur.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* ignore */ }
      cur.close();
      try { fs.copyFileSync(src, DB_FILE); for (const ext of ['-wal', '-shm']) fs.rmSync(DB_FILE + ext, { force: true }); } finally { cur = open(); }
    },
    close() { cur.close(); },
  };
}

/* ---------------- Gateway (Supabase Edge Function) ---------------- */
function toPg(sql) {
  let i = 0;
  let s = sql.replace(/\?/g, () => '$' + (++i)).replace(/\bLIKE\b/g, 'ILIKE');
  s = s.replace(/^\s*INSERT OR IGNORE INTO([\s\S]*)$/i, (m, r) => 'INSERT INTO' + r + ' ON CONFLICT DO NOTHING');
  const m = /^\s*INSERT INTO (\w+)/i.exec(s);
  if (m && ID_TABLES.has(m[1]) && !/RETURNING/i.test(s)) s += ' RETURNING id';
  return s;
}
function gatewayDriver() {
  const call = async (ops) => {
    let r;
    try {
      r = await fetch(GATEWAY_URL, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-kian-key': GATEWAY_KEY },
        body: JSON.stringify({ ops: ops.map((o) => ({ sql: toPg(o.sql), params: o.params || [], min: o.min || 0 })) }), signal: AbortSignal.timeout(25000),
      });
    } catch (e) { throw err(503, 'ارتباط با دیتابیس برقرار نشد'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.error === 'min') throw Object.assign(new Error('min'), { minIndex: j.index });
    if (!r.ok) { console.error('[gateway]', r.status, j.error); throw err(500, 'خطای دیتابیس'); }
    return j.results.map((x, i) => ({ rows: x.rows, changes: x.count, lastInsertRowid: x.rows[0] && x.rows[0].id !== undefined && /^\s*INSERT/i.test(ops[i].sql) ? x.rows[0].id : undefined }));
  };
  return { batch: call, one: async (op) => (await call([op]))[0], dir: null, file: null };
}

const drv = MODE === 'gateway' ? gatewayDriver() : sqliteDriver();

const wrapMin = (ops, e) => {
  if (e && e.minIndex !== undefined) throw err(409, ops[e.minIndex].msg || 'تغییر هم‌زمان؛ دوباره تلاش کنید');
  throw e;
};

const D = {
  mode: MODE, dir: drv.dir, file: drv.file,
  async get(sql, ...p) { return (await drv.one({ sql, params: p })).rows[0]; },
  async all(sql, ...p) { return (await drv.one({ sql, params: p })).rows; },
  async run(sql, ...p) { const r = await drv.one({ sql, params: p }); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }; },
  // ops: [{sql, params, min?, msg?}] — همه در یک تراکنش؛ اگر شرط min برقرار نباشد کل تراکنش برمی‌گردد و خطای ۴۰۹ می‌دهد
  async batch(ops) { try { return await drv.batch(ops); } catch (e) { return wrapMin(ops, e); } },
  async settings() { const o = {}; for (const r of await D.all('SELECT key,value FROM settings')) o[r.key] = r.value; return o; },
  setSetting: (k, v) => D.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v)),
  backupTo: (d) => drv.backupTo(d), replaceWith: (s) => drv.replaceWith(s), close: () => drv.close && drv.close(),
  DEFAULT_SETTINGS,
  // مقداردهی اولیه: تنظیمات پیش‌فرض و دسته‌های اولیه (یک رفت‌وبرگشت برای خواندن)
  async init() {
    const [s, c] = await drv.batch([{ sql: 'SELECT key FROM settings' }, { sql: 'SELECT COUNT(*) n FROM categories' }]);
    const have = new Set(s.rows.map((r) => r.key));
    const ops = Object.entries(DEFAULT_SETTINGS).filter(([k]) => !have.has(k)).map(([k, v]) => ({ sql: 'INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', params: [k, v] }));
    if (!Number(c.rows[0].n)) DEFAULT_CATEGORIES.forEach((n, i) => ops.push({ sql: 'INSERT OR IGNORE INTO categories(name,sort) VALUES(?,?)', params: [n, i] }));
    if (ops.length) await drv.batch(ops);
  },
};
module.exports = D;
