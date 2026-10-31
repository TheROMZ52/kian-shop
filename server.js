'use strict';
require('dotenv').config({ quiet: true });
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const D = require('./db');
const O = require('./orders');
const seo = require('./seo');
const store = require('./store');
const { now, err, normPhone, str, intOrNull, sha256, toEnDigits } = require('./util');

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const SESSION_DAYS = 30;
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://accounts.google.com'],
      'frame-src': ["'self'", 'https://accounts.google.com'],
      'connect-src': ["'self'", 'https://accounts.google.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(compression());
app.use(express.json({ limit: '200kb' }));

// ---------- ابزارهای عمومی ----------
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

// دفاع در برابر CSRF: همه درخواست‌های تغییردهنده باید هدر سفارشی داشته باشند (مرورگر آن را بدون CORS نمی‌فرستد)
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'fetch') return res.status(403).json({ error: 'درخواست نامعتبر' });
  next();
});

function publicUser(u) {
  if (!u) return null;
  const { id, name, phone, email, role, province, city, address, postal_code } = u;
  return { id, name, phone, email, role, province, city, address, postal_code, hasPassword: !!u.password_hash, google: !!u.google_id };
}

async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await D.run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', sha256(token), userId, now() + SESSION_DAYS * 86400);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 86400 * 1000, path: '/' });
}

// قبل از هر چیز: مطمئن شو دیتابیس آماده است
app.use(wrap(async (req, res, next) => { await ready(); next(); }));
app.use(wrap(async (req, res, next) => {
  const t = cookies(req).sid;
  req.user = null;
  if (t) {
    const row = await D.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', sha256(t), now());
    if (row && !row.blocked) req.user = row;
  }
  next();
}));

const needAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'ابتدا وارد حساب کاربری شوید' }));
const needAdmin = (req, res, next) => (req.user && ['admin', 'owner'].includes(req.user.role) ? next() : res.status(403).json({ error: 'دسترسی ندارید' }));
const needOwner = (req, res, next) => (req.user && req.user.role === 'owner' ? next() : res.status(403).json({ error: 'فقط مالک فروشگاه به این بخش دسترسی دارد' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'تلاش‌های زیاد؛ چند دقیقه بعد دوباره امتحان کنید' } });
const trackLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'درخواست‌های زیاد؛ کمی صبر کنید' } });
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'تعداد ثبت سفارش زیاد است؛ کمی صبر کنید' } });

// ---------- پیکربندی عمومی ----------
const PUBLIC_KEYS = ['shop_name', 'tagline', 'owner_phone', 'admin_telegram', 'telegram_link', 'instagram', 'shipping_cost', 'free_shipping_over', 'payment_info', 'announcement', 'business_city', 'business_address'];
app.get('/api/config', wrap(async (req, res) => {
  const s = await D.settings();
  const cfg = Object.fromEntries(PUBLIC_KEYS.map((k) => [k, s[k]]));
  res.json({ ...cfg, googleClientId: GOOGLE_CLIENT_ID || null, statuses: O.LABELS });
}));

// ---------- احراز هویت ----------
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const name = str(req.body.name, 80), phone = normPhone(req.body.phone), password = String(req.body.password || '');
  if (name.length < 2) throw err(400, 'نام را وارد کنید');
  if (!phone) throw err(400, 'شماره موبایل معتبر نیست (مثال: 09123456789)');
  if (password.length < 8 || password.length > 100) throw err(400, 'رمز عبور باید حداقل ۸ کاراکتر باشد');
  if (await D.get('SELECT 1 FROM users WHERE phone=?', phone)) throw err(409, 'این شماره قبلاً ثبت‌نام کرده است؛ وارد شوید');
  const id = (await D.run('INSERT INTO users(name,phone,password_hash,role,created_at) VALUES(?,?,?,\'customer\',?)', name, phone, bcrypt.hashSync(password, 10), now())).lastInsertRowid;
  await startSession(req, res, id);
  res.json({ user: publicUser(await D.get('SELECT * FROM users WHERE id=?', id)) });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const idf = str(req.body.id, 120), password = String(req.body.password || '');
  const phone = normPhone(idf);
  const u = phone ? await D.get('SELECT * FROM users WHERE phone=?', phone) : await D.get('SELECT * FROM users WHERE email=?', idf.toLowerCase());
  const ok = u && u.password_hash && bcrypt.compareSync(password, u.password_hash);
  if (!ok) throw err(401, 'شماره/ایمیل یا رمز عبور اشتباه است');
  if (u.blocked) throw err(403, 'حساب شما مسدود شده است');
  await startSession(req, res, u.id);
  res.json({ user: publicUser(u) });
}));

app.post('/api/auth/google', authLimiter, wrap(async (req, res) => {
  if (!GOOGLE_CLIENT_ID) throw err(404, 'ورود با گوگل فعال نیست');
  const cred = String(req.body.credential || '');
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), { signal: AbortSignal.timeout(10000) });
    info = await r.json();
    if (!r.ok) throw new Error('bad');
  } catch (e) { throw err(502, 'ارتباط با گوگل برقرار نشد. با شماره موبایل و رمز عبور وارد شوید.'); }
  if (info.aud !== GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss) || info.email_verified !== 'true' || Number(info.exp) < now()) throw err(401, 'توکن گوگل معتبر نیست');
  const email = String(info.email).toLowerCase();
  let u = await D.get('SELECT * FROM users WHERE google_id=?', info.sub) || await D.get('SELECT * FROM users WHERE email=?', email);
  if (u) {
    if (u.blocked) throw err(403, 'حساب شما مسدود شده است');
    if (!u.google_id) await D.run('UPDATE users SET google_id=? WHERE id=?', info.sub, u.id);
  } else {
    const id = (await D.run('INSERT INTO users(name,email,google_id,role,created_at) VALUES(?,?,?,\'customer\',?)', str(info.name || '', 80), email, info.sub, now())).lastInsertRowid;
    u = await D.get('SELECT * FROM users WHERE id=?', id);
  }
  await startSession(req, res, u.id);
  res.json({ user: publicUser(await D.get('SELECT * FROM users WHERE id=?', u.id)) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const t = cookies(req).sid;
  if (t) await D.run('DELETE FROM sessions WHERE token_hash=?', sha256(t));
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));

app.put('/api/me', needAuth, wrap(async (req, res) => {
  const b = req.body;
  const name = str(b.name, 80);
  if (name.length < 2) throw err(400, 'نام را وارد کنید');
  let phone = req.user.phone;
  if (b.phone !== undefined && String(b.phone).trim() !== '') {
    phone = normPhone(b.phone);
    if (!phone) throw err(400, 'شماره موبایل معتبر نیست');
    if (await D.get('SELECT 1 FROM users WHERE phone=? AND id<>?', phone, req.user.id)) throw err(409, 'این شماره برای حساب دیگری ثبت شده است');
  }
  const postal = str(b.postal_code, 10).replace(/\D/g, '');
  await D.run('UPDATE users SET name=?,phone=?,province=?,city=?,address=?,postal_code=? WHERE id=?', name, phone, str(b.province, 60), str(b.city, 60), str(b.address, 400), postal, req.user.id);
  if (b.new_password) {
    const np = String(b.new_password);
    if (np.length < 8) throw err(400, 'رمز جدید باید حداقل ۸ کاراکتر باشد');
    if (req.user.password_hash && !bcrypt.compareSync(String(b.old_password || ''), req.user.password_hash)) throw err(400, 'رمز فعلی اشتباه است');
    await D.run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(np, 10), req.user.id);
  }
  res.json({ user: publicUser(await D.get('SELECT * FROM users WHERE id=?', req.user.id)) });
}));

// ---------- کاتالوگ ----------
const prodOut = (p) => ({ ...p, images: JSON.parse(p.images || '[]'), active: !!p.active });

app.get('/api/categories', wrap(async (req, res) => res.json(await D.all('SELECT c.id,c.name,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS count FROM categories c ORDER BY sort,id'))));

app.get('/api/products', wrap(async (req, res) => {
  const where = ['p.active=1'], args = [];
  const q = str(req.query.q, 80);
  if (q) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const cat = parseInt(req.query.category, 10);
  if (cat) { where.push('p.category_id=?'); args.push(cat); }
  const order = { new: 'p.id DESC', cheap: 'p.price ASC', exp: 'p.price DESC' }[req.query.sort] || 'p.id DESC';
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const w = where.join(' AND ');
  const total = (await D.get(`SELECT COUNT(*) n FROM products p WHERE ${w}`, ...args)).n;
  const rows = await D.all(`SELECT p.*,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${w} ORDER BY (p.stock>0) DESC, ${order} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  res.json({ total, page, limit, items: rows.map(prodOut) });
}));

app.get('/api/products/:id', wrap(async (req, res) => {
  const p = await D.get('SELECT p.*,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1', req.params.id);
  if (!p) throw err(404, 'محصول پیدا نشد');
  res.json(prodOut(p));
}));

// بررسی سبد خرید با قیمت و موجودی فعلی (کلاینت فقط شناسه و تعداد را نگه می‌دارد)
app.post('/api/cart/check', wrap(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger).slice(0, 60);
  if (!ids.length) return res.json([]);
  const rows = await D.all(`SELECT id,name,price,stock,images FROM products WHERE active=1 AND id IN (${ids.map(() => '?').join(',')})`, ...ids);
  res.json(rows.map(prodOut));
}));

// ---------- سفارش‌ها (مشتری) ----------
const orderPublic = (o) => ({ id: o.id, code: o.code, status: o.status, name: o.name, phone: o.phone, province: o.province, city: o.city, address: o.address, postal_code: o.postal_code, note: o.note, subtotal: o.subtotal, shipping: o.shipping, total: o.total, created_at: o.created_at, updated_at: o.updated_at, items: o.items, events: o.events.map((e) => ({ status: e.status, note: e.actor === 'customer' || e.actor === 'system' ? e.note : e.note, created_at: e.created_at })) });

app.post('/api/orders', needAuth, orderLimiter, wrap(async (req, res) => {
  const o = await O.createOrder(req.user, req.body);
  res.status(201).json(orderPublic(o));
}));

app.get('/api/orders', needAuth, wrap(async (req, res) => {
  const rows = await D.all('SELECT id FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100', req.user.id);
  res.json((await Promise.all(rows.map((r) => O.getOrder(r.id)))).map(orderPublic));
}));

app.get('/api/orders/:code', needAuth, wrap(async (req, res) => {
  const r = await D.get('SELECT id FROM orders WHERE code=? AND user_id=?', String(req.params.code).toUpperCase(), req.user.id);
  if (!r) throw err(404, 'سفارش پیدا نشد');
  res.json(orderPublic(await O.getOrder(r.id)));
}));

app.post('/api/orders/:code/cancel', needAuth, wrap(async (req, res) => {
  const r = await D.get('SELECT id,status FROM orders WHERE code=? AND user_id=?', String(req.params.code).toUpperCase(), req.user.id);
  if (!r) throw err(404, 'سفارش پیدا نشد');
  if (r.status !== 'pending') throw err(409, 'فقط سفارش‌های در انتظار بررسی را می‌توانید لغو کنید؛ با فروشگاه تماس بگیرید');
  res.json(orderPublic(await O.setStatus(r.id, 'cancelled', { actor: 'customer', note: 'لغو توسط مشتری' })));
}));

// پیگیری عمومی با کد رهگیری + شماره موبایل (بدون نیاز به ورود)
app.post('/api/track', trackLimiter, wrap(async (req, res) => {
  const code = str(req.body.code, 20).toUpperCase(), phone = normPhone(req.body.phone);
  const r = phone && await D.get('SELECT id FROM orders WHERE code=? AND phone=?', code, phone);
  if (!r) throw err(404, 'سفارشی با این کد و شماره پیدا نشد');
  const o = await O.getOrder(r.id);
  res.json({ code: o.code, status: o.status, total: o.total, created_at: o.created_at, items: o.items.map(({ name, qty }) => ({ name, qty })), events: o.events.map(({ status, note, created_at }) => ({ status, note, created_at })) });
}));

// ---------- مدیریت ----------
const admin = express.Router();
admin.use(needAdmin);

admin.get('/stats', wrap(async (req, res) => {
  const byStatus = Object.fromEntries((await D.all('SELECT status,COUNT(*) n FROM orders GROUP BY status')).map((r) => [r.status, r.n]));
  const day = now() - 86400;
  res.json({
    byStatus,
    pending: byStatus.pending || 0,
    last24h: (await D.get('SELECT COUNT(*) n FROM orders WHERE created_at>?', day)).n,
    revenue: (await D.get("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status NOT IN ('rejected','cancelled')")).n,
    revenueDelivered: (await D.get("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status='delivered'")).n,
    products: (await D.get('SELECT COUNT(*) n FROM products')).n,
    customers: (await D.get("SELECT COUNT(*) n FROM users WHERE role='customer'")).n,
    lowStock: await D.all('SELECT id,name,stock FROM products WHERE active=1 AND stock<=3 ORDER BY stock,id LIMIT 20'),
  });
}));

admin.get('/orders', wrap(async (req, res) => {
  const where = [], args = [];
  if (req.query.status && O.LABELS[req.query.status]) { where.push('status=?'); args.push(req.query.status); }
  const q = str(req.query.q, 60);
  if (q) { where.push('(code LIKE ? OR name LIKE ? OR phone LIKE ?)'); const p = toEnDigits(q); args.push(`%${q.toUpperCase()}%`, `%${q}%`, `%${p}%`); }
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50), page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await D.get(`SELECT COUNT(*) n FROM orders ${w}`, ...args)).n;
  const items = await D.all(`SELECT id,code,name,phone,city,total,status,created_at FROM orders ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  res.json({ total, page, limit, items });
}));

admin.get('/orders/:id', wrap(async (req, res) => {
  const o = await O.getOrder(Number(req.params.id));
  if (!o) throw err(404, 'سفارش پیدا نشد');
  res.json({ ...o, allowed: O.FLOW[o.status] });
}));

admin.post('/orders/:id/status', wrap(async (req, res) => {
  const o = await O.setStatus(Number(req.params.id), String(req.body.status), { note: req.body.note, actor: `${req.user.role}:${req.user.name || req.user.phone || req.user.id}` });
  res.json({ ...o, allowed: O.FLOW[o.status] });
}));

admin.get('/categories', wrap(async (req, res) => res.json(await D.all('SELECT c.id,c.name,c.sort,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS count FROM categories c ORDER BY sort,id'))));
admin.post('/categories', wrap(async (req, res) => {
  const name = str(req.body.name, 50);
  if (!name) throw err(400, 'نام دسته را وارد کنید');
  if (await D.get('SELECT 1 FROM categories WHERE name=?', name)) throw err(409, 'این دسته قبلاً وجود دارد');
  const sort = ((await D.get('SELECT COALESCE(MAX(sort),0)+1 n FROM categories')).n);
  res.status(201).json({ id: (await D.run('INSERT INTO categories(name,sort) VALUES(?,?)', name, sort)).lastInsertRowid });
}));
admin.put('/categories/:id', wrap(async (req, res) => {
  const name = str(req.body.name, 50);
  if (!name) throw err(400, 'نام دسته را وارد کنید');
  if (await D.get('SELECT 1 FROM categories WHERE name=? AND id<>?', name, req.params.id)) throw err(409, 'این نام قبلاً استفاده شده است');
  await D.run('UPDATE categories SET name=? WHERE id=?', name, req.params.id);
  res.json({ ok: true });
}));
admin.delete('/categories/:id', wrap(async (req, res) => { await D.run('DELETE FROM categories WHERE id=?', req.params.id); res.json({ ok: true }); }));

// آپلود تصویر: فقط JPEG/PNG/WebP با بررسی امضای فایل
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 8 } });
function imageExt(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length > 12 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
async function saveImages(files) {
  const list = (files || []).map((f) => ({ f, ext: imageExt(f.buffer) }));
  if (list.some((x) => !x.ext)) throw err(400, 'فقط تصاویر JPG، PNG یا WebP مجاز است');
  const names = [];
  for (const { f, ext } of list) names.push(await store.save(f.buffer, ext));
  return names;
}

async function readProduct(req, existing) {
  const b = req.body;
  const name = str(b.name, 150);
  const price = intOrNull(b.price), oldPrice = intOrNull(b.old_price), stock = intOrNull(b.stock);
  if (!name) throw err(400, 'نام محصول را وارد کنید');
  if (price == null || Number.isNaN(price) || price < 0) throw err(400, 'قیمت (تومان) را درست وارد کنید');
  if (Number.isNaN(oldPrice) || (oldPrice != null && oldPrice < 0)) throw err(400, 'قیمت قبل از تخفیف نامعتبر است');
  if (stock == null || Number.isNaN(stock) || stock < 0) throw err(400, 'موجودی را درست وارد کنید');
  const cat = parseInt(b.category_id, 10) || null;
  if (cat && !await D.get('SELECT 1 FROM categories WHERE id=?', cat)) throw err(400, 'دسته‌بندی نامعتبر است');
  let keep = existing ? JSON.parse(existing.images) : [];
  if (b.keep !== undefined) { try { const k = JSON.parse(b.keep); keep = keep.filter((x) => k.includes(x)); } catch (e) { throw err(400, 'داده تصاویر نامعتبر است'); } }
  return { name, price, oldPrice, stock, cat, desc: str(b.description, 4000), active: b.active === '0' || b.active === 'false' || b.active === false ? 0 : 1, keep };
}

admin.get('/products', wrap(async (req, res) => {
  const q = str(req.query.q, 80);
  const rows = q ? await D.all('SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.name LIKE ? ORDER BY p.id DESC LIMIT 200', `%${q}%`)
    : await D.all('SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.id DESC LIMIT 500');
  res.json(rows.map(prodOut));
}));
admin.get('/products/:id', wrap(async (req, res) => {
  const p = await D.get('SELECT * FROM products WHERE id=?', req.params.id);
  if (!p) throw err(404, 'محصول پیدا نشد');
  res.json(prodOut(p));
}));
admin.post('/products', upload.array('images', 8), wrap(async (req, res) => {
  const v = await readProduct(req, null);
  const imgs = await saveImages(req.files);
  const t = now();
  const id = (await D.run('INSERT INTO products(category_id,name,description,price,old_price,stock,images,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    v.cat, v.name, v.desc, v.price, v.oldPrice, v.stock, JSON.stringify(imgs), v.active, t, t)).lastInsertRowid;
  res.status(201).json(prodOut(await D.get('SELECT * FROM products WHERE id=?', id)));
}));
admin.put('/products/:id', upload.array('images', 8), wrap(async (req, res) => {
  const p = await D.get('SELECT * FROM products WHERE id=?', req.params.id);
  if (!p) throw err(404, 'محصول پیدا نشد');
  const v = await readProduct(req, p);
  const added = await saveImages(req.files);
  const images = [...v.keep, ...added].slice(0, 8);
  await store.remove(JSON.parse(p.images).filter((old) => !images.includes(old)));
  await D.run('UPDATE products SET category_id=?,name=?,description=?,price=?,old_price=?,stock=?,images=?,active=?,updated_at=? WHERE id=?',
    v.cat, v.name, v.desc, v.price, v.oldPrice, v.stock, JSON.stringify(images), v.active, now(), p.id);
  res.json(prodOut(await D.get('SELECT * FROM products WHERE id=?', p.id)));
}));
admin.delete('/products/:id', wrap(async (req, res) => {
  const p = await D.get('SELECT * FROM products WHERE id=?', req.params.id);
  if (!p) throw err(404, 'محصول پیدا نشد');
  // سفارش‌های قبلی نام و قیمت خود را نگه می‌دارند (product_id خالی می‌شود)
  await D.run('DELETE FROM products WHERE id=?', p.id);
  await store.remove(JSON.parse(p.images));
  res.json({ ok: true });
}));

admin.get('/users', wrap(async (req, res) => {
  const q = str(req.query.q, 60);
  const rows = q ? await D.all('SELECT id,name,phone,email,role,blocked,created_at,(SELECT COUNT(*) FROM orders o WHERE o.user_id=users.id) orders FROM users WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 200', `%${q}%`, `%${toEnDigits(q)}%`, `%${q}%`)
    : await D.all('SELECT id,name,phone,email,role,blocked,created_at,(SELECT COUNT(*) FROM orders o WHERE o.user_id=users.id) orders FROM users ORDER BY id DESC LIMIT 300');
  res.json(rows);
}));
admin.post('/users/:id', needOwner, wrap(async (req, res) => {
  const u = await D.get('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw err(404, 'کاربر پیدا نشد');
  if (u.id === req.user.id) throw err(400, 'نمی‌توانید حساب خودتان را تغییر دهید');
  if (u.role === 'owner') throw err(403, 'حساب مالک قابل تغییر نیست');
  if (req.body.role !== undefined) {
    if (!['customer', 'admin'].includes(req.body.role)) throw err(400, 'نقش نامعتبر است');
    await D.run('UPDATE users SET role=? WHERE id=?', req.body.role, u.id);
  }
  if (req.body.blocked !== undefined) {
    await D.run('UPDATE users SET blocked=? WHERE id=?', req.body.blocked ? 1 : 0, u.id);
    if (req.body.blocked) await D.run('DELETE FROM sessions WHERE user_id=?', u.id);
  }
  res.json({ ok: true });
}));

admin.get('/settings', wrap(async (req, res) => {
  const s = await D.settings();
  res.json({ ...s, dbMode: D.mode });
}));
admin.put('/settings', wrap(async (req, res) => {
  const keys = PUBLIC_KEYS;
  for (const k of keys) {
    if (req.body[k] === undefined) continue;
    let v = str(req.body[k], k === 'payment_info' || k === 'announcement' ? 1000 : 200);
    if (['shipping_cost', 'free_shipping_over'].includes(k)) { const n = intOrNull(v); if (n == null || Number.isNaN(n) || n < 0) throw err(400, 'مبلغ ارسال نامعتبر است'); v = String(n); }
    await D.setSetting(k, v);
  }
  res.json({ ok: true });
}));

// پشتیبان‌گیری و بازیابی (فقط مالک)
let BK = null;
let makeBackup = null;
if (D.mode === 'sqlite') {
BK = path.join(D.dir, 'backups');
makeBackup = async function (prefix = 'auto') {
  const d = new Date();
  const name = `shop-${prefix}-${d.toISOString().replace(/[:.]/g, '-')}.sqlite`;
  await D.backupTo(path.join(BK, name));
  const files = fs.readdirSync(BK).filter((f) => f.startsWith('shop-auto-')).sort();
  while (files.length > (parseInt(process.env.BACKUP_KEEP, 10) || 7)) fs.rmSync(path.join(BK, files.shift()), { force: true });
  return name;
};
admin.get('/backups', needOwner, (req, res) => {
  res.json(fs.readdirSync(BK).filter((f) => f.endsWith('.sqlite')).sort().reverse().map((f) => ({ name: f, size: fs.statSync(path.join(BK, f)).size })));
});
admin.post('/backups', needOwner, wrap(async (req, res) => res.json({ name: await makeBackup('manual') })));
admin.get('/backups/download/:name', needOwner, wrap((req, res) => {
  const n = path.basename(req.params.name);
  if (!/^shop-[\w-]+\.sqlite$/.test(n) || !fs.existsSync(path.join(BK, n))) throw err(404, 'فایل پیدا نشد');
  res.download(path.join(BK, n), n);
}));
admin.get('/backup-now', needOwner, wrap(async (req, res) => {
  const tmp = path.join(BK, `download-${Date.now()}.tmp`);
  await D.backupTo(tmp);
  res.download(tmp, `kian-shop-${new Date().toISOString().slice(0, 10)}.sqlite`, () => fs.rmSync(tmp, { force: true }));
}));
const restoreUpload = multer({ storage: multer.diskStorage({ destination: BK, filename: (r, f, cb) => cb(null, `restore-${Date.now()}.tmp`) }), limits: { fileSize: 300 * 1024 * 1024, files: 1 } });
admin.post('/restore', needOwner, restoreUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw err(400, 'فایل انتخاب نشده است');
  const tmp = req.file.path;
  try {
    let chk;
    try {
      const Database = require('better-sqlite3');
      chk = new Database(tmp, { readonly: true, fileMustExist: true });
      const tables = chk.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
      for (const t of ['users', 'products', 'orders', 'order_items', 'settings']) if (!tables.includes(t)) throw new Error('missing ' + t);
      if (chk.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('integrity');
    } catch (e) { throw err(400, 'فایل پشتیبان معتبر نیست'); } finally { if (chk) chk.close(); }
    await makeBackup('before-restore');
    D.replaceWith(tmp);
    res.json({ ok: true });
  } finally { fs.rmSync(tmp, { force: true }); }
}));

} else {
  admin.get('/backups', needOwner, (req, res) => res.json([]));
  admin.all(['/backups', '/backups/download/:name', '/backup-now', '/restore'], needOwner, (req, res) => res.status(400).json({ error: 'در حالت Supabase، پشتیبان‌گیری و بازیابی از داشبورد سوپابیس (Database → Backups) انجام می‌شود' }));
}

app.use('/api/admin', admin);

// ---------- فایل‌های ایستا ----------
if (store.remote) {
  // ورسل: تصاویر در Supabase Storage هستند؛ آدرس /uploads/<name> به آدرس عمومی هدایت می‌شود
  app.get('/uploads/:name', (req, res) => { const u = store.publicUrl(req.params.name); if (!u) return res.status(404).end(); res.set('Cache-Control', 'public, max-age=86400').redirect(302, u); });
} else app.use('/uploads', express.static(store.dir, { maxAge: '30d', immutable: true, index: false, setHeaders: (r) => r.setHeader('X-Content-Type-Options', 'nosniff') }));
seo.mount(app); // robots.txt, sitemap.xml, llms.txt
const PUB = path.join(__dirname, 'public');
app.get('/index.html', (req, res) => res.redirect(301, '/'));
const longCache = { maxAge: '30d', immutable: true, index: false };
app.use('/vendor', express.static(path.join(PUB, 'vendor'), longCache));
app.use('/fonts', express.static(path.join(PUB, 'fonts'), longCache));
app.use('/img', express.static(path.join(PUB, 'img'), { maxAge: '7d', index: false }));
app.use(express.static(PUB, { maxAge: '1h', etag: true, index: false }));
app.use('/api', (req, res) => res.status(404).json({ error: 'پیدا نشد' }));
app.get('*', wrap(seo.render)); // صفحات اپلیکیشن با متای سمت سرور؛ مسیر ناشناخته ← ۴۰۴ واقعی

// ---------- خطاها ----------
app.use((e, req, res, next) => { // eslint-disable-line no-unused-vars
  if (e.code === 'LIMIT_FILE_SIZE') e = err(413, 'حجم فایل بیش از حد مجاز است');
  else if (e.type === 'entity.parse.failed') e = err(400, 'داده نامعتبر است');
  else if (e.name === 'MulterError') e = err(400, 'آپلود نامعتبر است');
  const status = e.status || 500;
  if (status >= 500) console.error('[error]', e);
  res.status(status).json({ error: status >= 500 ? 'خطای داخلی سرور' : e.message });
});

// ---------- مالک اولیه و بازیابی امن رمز مالک ----------
async function seedOwner() {
  const configuredPass = String(process.env.OWNER_PASSWORD || '');
  const owner = await D.get("SELECT id FROM users WHERE role='owner'");
  if (owner) {
    if (configuredPass.length >= 8) {
      const applied = await D.get("SELECT value FROM settings WHERE key='owner_password_reset_hash'");
      if (!applied || !bcrypt.compareSync(configuredPass, applied.value)) {
        const passwordHash = bcrypt.hashSync(configuredPass, 10);
        await D.batch([
          { sql: 'UPDATE users SET password_hash=? WHERE id=?', params: [passwordHash, owner.id], min: 1 },
          { sql: 'DELETE FROM sessions WHERE user_id=?', params: [owner.id] },
          { sql: 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', params: ['owner_password_reset_hash', passwordHash] },
        ]);
        console.log('رمز مالک با تنظیم امن محیطی به‌روزرسانی شد و نشست‌های قبلی بسته شدند.');
      }
    }
    return;
  }
  const phone = normPhone(process.env.OWNER_PHONE || '09039665868');
  let pass = configuredPass, generated = false;
  if (!pass || pass.length < 8) { pass = crypto.randomBytes(9).toString('base64url'); generated = true; }
  const ex = await D.get('SELECT id FROM users WHERE phone=?', phone);
  if (ex) await D.run("UPDATE users SET role='owner',password_hash=? WHERE id=?", bcrypt.hashSync(pass, 10), ex.id);
  else await D.run("INSERT INTO users(name,phone,password_hash,role,created_at) VALUES('مالک فروشگاه',?,?,'owner',?)", phone, bcrypt.hashSync(pass, 10), now());
  console.log('==================================================');
  console.log(' حساب مالک ساخته شد. شماره موبایل: ' + phone);
  if (generated) console.log(' رمز عبور موقت (فقط همین یک‌بار نمایش داده می‌شود): ' + pass);
  console.log(' بعد از اولین ورود، رمز را از «حساب من» تغییر دهید.');
  console.log('==================================================');
}

async function purgeSessions() { await D.run('DELETE FROM sessions WHERE expires_at<?', now()); }

// مقداردهی اولیه (یک‌بار برای هر نمونه سرور): تنظیمات پیش‌فرض، دسته‌ها، حساب مالک
let readyP = null;
const ready = () => readyP || (readyP = (async () => { await D.init(); await seedOwner(); purgeSessions().catch(() => {}); })().catch((e) => { readyP = null; throw e; }));

function start(port) {
  ready().catch((e) => console.error('[init]', e));
  if (D.mode === 'sqlite') {
    setInterval(() => purgeSessions().catch(() => {}), 6 * 3600 * 1000).unref();
    // پشتیبان خودکار روزانه
    const dayMs = 24 * 3600 * 1000;
    const auto = () => makeBackup('auto').catch((e) => console.error('[backup]', e.message));
    const last = fs.readdirSync(BK).filter((f) => f.startsWith('shop-auto-')).sort().pop();
    if (!last || Date.now() - fs.statSync(path.join(BK, last)).mtimeMs > dayMs) auto();
    setInterval(auto, dayMs).unref();
  }
  return app.listen(port, () => console.log(`[server] http://localhost:${port}`));
}

if (require.main === module) start(parseInt(process.env.PORT, 10) || 3000);
module.exports = { app, start, ready };
