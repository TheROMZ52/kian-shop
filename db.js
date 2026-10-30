'use strict';
// لایه دیتابیس SQLite. همه داده‌ها داخل DATA_DIR نگه داشته می‌شوند (باید روی ذخیره‌ساز دائمی باشد).
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'shop.sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT UNIQUE, email TEXT UNIQUE,
  password_hash TEXT, google_id TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'customer',
  province TEXT DEFAULT '', city TEXT DEFAULT '', address TEXT DEFAULT '', postal_code TEXT DEFAULT '',
  blocked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL, old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0, images TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, province TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, name TEXT NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS order_events(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
`;

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

let cur;
function open() {
  const d = new Database(DB_FILE);
  try { d.pragma('journal_mode = ' + (process.env.SQLITE_JOURNAL || 'WAL')); } catch (e) { /* برخی فایل‌سیستم‌ها WAL را پشتیبانی نمی‌کنند */ }
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  d.exec(SCHEMA);
  const ins = d.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  const nc = d.prepare('SELECT COUNT(*) n FROM categories').get().n;
  if (!nc) {
    const c = d.prepare('INSERT INTO categories(name,sort) VALUES(?,?)');
    ['کمربند', 'کیف', 'اکسسوری'].forEach((n, i) => c.run(n, i));
  }
  return d;
}
cur = open();

const D = {
  dir: DATA_DIR,
  file: DB_FILE,
  prepare: (s) => cur.prepare(s),
  exec: (s) => cur.exec(s),
  get: (s, ...p) => cur.prepare(s).get(...p),
  all: (s, ...p) => cur.prepare(s).all(...p),
  run: (s, ...p) => cur.prepare(s).run(...p),
  tx: (fn) => cur.transaction(fn)(),
  settings() {
    const o = {};
    for (const r of cur.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value;
    return o;
  },
  setSetting(k, v) { cur.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v)); },
  backupTo: (dest) => cur.backup(dest),
  // جایگزینی فایل دیتابیس با نسخه پشتیبان (بعد از اعتبارسنجی توسط صدازننده)
  replaceWith(srcFile) {
    try { cur.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* ignore */ }
    cur.close();
    try {
      fs.copyFileSync(srcFile, DB_FILE);
      for (const ext of ['-wal', '-shm']) fs.rmSync(DB_FILE + ext, { force: true });
    } finally { cur = open(); }
  },
  close() { cur.close(); },
};
module.exports = D;
