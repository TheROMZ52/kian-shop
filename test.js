'use strict';
// تست یکپارچه: node test.js  (روی دیتابیس موقت اجرا می‌شود و به دیتای واقعی دست نمی‌زند)
const fs = require('fs'); const os = require('os'); const path = require('path'); const assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kian-test-'));
process.env.OWNER_PHONE = '09039665868';
process.env.OWNER_PASSWORD = 'OwnerPass123';
delete process.env.TELEGRAM_BOT_TOKEN;
let D, server;
let cookie = '';
const base = () => `http://127.0.0.1:${server.address().port}`;
async function call(method, url, body, { form, ck } = {}) {
  const headers = { 'x-requested-with': 'fetch' };
  const c = ck !== undefined ? ck : cookie;
  if (c) headers.cookie = c;
  if (body && !form) headers['content-type'] = 'application/json';
  const r = await fetch(base() + url, { method, headers, body: form || (body ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc && ck === undefined) cookie = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
let n = 0;
const ok = (name) => console.log(`  ✓ ${++n}. ${name}`);

(async () => {
  const PG = process.env.TEST_DB === 'pglite'; // اجرا روی Postgres (PGlite) با همان پروتکل Edge Function سوپابیس
  console.log(PG ? 'اجرای تست‌ها روی Postgres (حالت Supabase gateway)...' : 'اجرای تست‌ها روی SQLite...');
  let gw;
  if (PG) { gw = await require('./test/pg-gateway').start(); process.env.DB_GATEWAY_URL = gw.url; process.env.DB_GATEWAY_KEY = gw.key; process.env.STORAGE_PUBLIC_URL = gw.publicUrl; }
  const { start } = require('./server'); D = require('./db'); server = start(0);
  // احراز هویت و CSRF
  let r = await fetch(base() + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403); ok('درخواست POST بدون هدر CSRF رد می‌شود');
  r = await call('POST', '/api/auth/login', { id: '09039665868', password: 'bad' }); assert.equal(r.status, 401); ok('رمز اشتباه رد می‌شود');
  r = await call('POST', '/api/auth/login', { id: '۰۹۰۳۹۶۶۵۸۶۸', password: 'OwnerPass123' }); assert.equal(r.status, 200); assert.equal(r.data.user.role, 'owner'); ok('ورود مالک (با ارقام فارسی)');
  const ownerCk = cookie;

  // دسته و محصول
  r = await call('GET', '/api/admin/categories'); assert.equal(r.status, 200); const cat = r.data[0].id; ok('دسته‌های پیش‌فرض');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const mk = (name, price, stock, extra = {}) => { const f = new FormData(); f.set('name', name); f.set('price', price); f.set('stock', stock); f.set('category_id', cat); for (const [k, v] of Object.entries(extra)) f.set(k, v); f.append('images', new Blob([png], { type: 'image/png' }), 'a.png'); return f; };
  r = await call('POST', '/api/admin/products', null, { form: mk('کمربند چرم تست', '1200000', '5') }); assert.equal(r.status, 201); const p1 = r.data; assert.equal(p1.images.length, 1); ok('ساخت محصول با تصویر');
  r = await call('POST', '/api/admin/products', null, { form: mk('کیف تست', '500000', '2') }); const p2 = r.data;
  const bad = new FormData(); bad.set('name', 'x'); bad.set('price', '1'); bad.set('stock', '1'); bad.append('images', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'a.png');
  r = await call('POST', '/api/admin/products', null, { form: bad }); assert.equal(r.status, 400); ok('آپلود فایل غیرتصویری رد می‌شود');
  r = await fetch(base() + '/uploads/' + p1.images[0]); assert.equal(r.status, 200); ok('تصویر آپلودشده قابل نمایش است');

  // مشتری
  cookie = '';
  r = await call('POST', '/api/auth/register', { name: 'علی تست', phone: '09121234567', password: 'short' }); assert.equal(r.status, 400);
  r = await call('POST', '/api/auth/register', { name: 'علی تست', phone: '09121234567', password: 'password123' }); assert.equal(r.status, 200); ok('ثبت‌نام مشتری');
  const custCk = cookie;
  r = await call('GET', '/api/admin/stats'); assert.equal(r.status, 403); ok('مشتری به پنل مدیریت دسترسی ندارد');
  r = await call('GET', '/api/products'); assert.equal(r.data.items.length, 2); ok('لیست محصولات');
  r = await call('GET', '/api/products?q=' + encodeURIComponent('کیف')); assert.equal(r.data.items.length, 1); ok('جست‌وجو');

  const addr = { name: 'علی تست', phone: '09121234567', province: 'تهران', city: 'تهران', address: 'خیابان آزادی پلاک ۱۰ واحد ۲' };
  r = await call('POST', '/api/orders', { ...addr, items: [{ id: p1.id, qty: 99 }] }); assert.equal(r.status, 409); ok('سفارش بیش از موجودی رد می‌شود');
  r = await call('POST', '/api/orders', { ...addr, items: [{ id: p1.id, qty: 2 }, { id: p2.id, qty: 1 }, { id: p1.id, qty: 1 }], total: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.data.subtotal, 1200000 * 3 + 500000); assert.equal(r.data.shipping, 0); assert.equal(r.data.total, 4100000); ok('محاسبه مبلغ سمت سرور (ارسال رایگان بالای آستانه)');
  const o1 = r.data;
  assert.equal((await D.get('SELECT stock FROM products WHERE id=?', p1.id)).stock, 2); ok('موجودی کم شد');
  r = await call('POST', '/api/orders', { ...addr, items: [{ id: p2.id, qty: 1 }] }); assert.equal(r.status, 201); assert.equal(r.data.shipping, 50000); assert.equal(r.data.total, 550000); const o2 = r.data; ok('هزینه ارسال برای سفارش کوچک');
  r = await call('POST', '/api/orders', { ...addr, items: [{ id: p2.id, qty: 1 }] }); assert.equal(r.status, 409); ok('موجودی صفر → سفارش رد می‌شود');
  r = await call('POST', '/api/orders', { ...addr, phone: '123', items: [{ id: p1.id, qty: 1 }] }); assert.equal(r.status, 400); ok('اعتبارسنجی شماره موبایل');

  r = await call('GET', '/api/orders'); assert.equal(r.data.length, 2); ok('تاریخچه سفارش‌های مشتری');
  r = await call('POST', '/api/track', { code: o1.code, phone: '09121234567' }, { ck: '' }); assert.equal(r.status, 200); assert.ok(!r.data.address); ok('پیگیری عمومی بدون نشت آدرس');
  r = await call('POST', '/api/track', { code: o1.code, phone: '09120000000' }, { ck: '' }); assert.equal(r.status, 404); ok('پیگیری با شماره اشتباه رد می‌شود');

  r = await call('POST', `/api/orders/${o2.code}/cancel`); assert.equal(r.status, 200); assert.equal((await D.get('SELECT stock FROM products WHERE id=?', p2.id)).stock, 1); ok('لغو سفارش و بازگشت موجودی');

  // مدیر
  r = await call('GET', '/api/admin/orders', null, { ck: ownerCk }); assert.equal(r.data.total, 2);
  r = await call('POST', `/api/admin/orders/${o1.id}/status`, { status: 'delivered' }, { ck: ownerCk }); assert.equal(r.status, 409); ok('پرش غیرمجاز وضعیت رد می‌شود');
  for (const s of ['confirmed', 'preparing', 'shipped', 'delivered']) { r = await call('POST', `/api/admin/orders/${o1.id}/status`, { status: s }, { ck: ownerCk }); assert.equal(r.status, 200); }
  assert.equal(r.data.status, 'delivered'); assert.equal(r.data.events.length, 5); ok('چرخه کامل وضعیت سفارش');
  r = await call('GET', '/api/admin/stats', null, { ck: ownerCk }); assert.equal(r.data.revenue, 4100000); ok('آمار داشبورد');

  // رد سفارش توسط مدیر موجودی را برمی‌گرداند
  r = await call('POST', '/api/orders', { ...addr, items: [{ id: p1.id, qty: 1 }] }, { ck: custCk }); const o3 = r.data;
  assert.equal((await D.get('SELECT stock FROM products WHERE id=?', p1.id)).stock, 1);
  await call('POST', `/api/admin/orders/${o3.id}/status`, { status: 'rejected' }, { ck: ownerCk });
  assert.equal((await D.get('SELECT stock FROM products WHERE id=?', p1.id)).stock, 2); ok('رد سفارش توسط مدیر موجودی را برمی‌گرداند');

  // ویرایش و حذف محصول (سفارش‌های قبلی حفظ می‌شوند)
  const f = mk('کمربند ویرایش‌شده', '1300000', '9', { keep: '[]' });
  r = await call('PUT', `/api/admin/products/${p1.id}`, null, { form: f, ck: ownerCk }); assert.equal(r.status, 200); assert.equal(r.data.price, 1300000); ok('ویرایش محصول');
  r = await call('DELETE', `/api/admin/products/${p1.id}`, null, { ck: ownerCk }); assert.equal(r.status, 200);
  r = await call('GET', '/api/orders/' + o1.code, null, { ck: custCk }); assert.equal(r.data.items[0].name, 'کمربند چرم تست'); ok('حذف محصول، تاریخچه سفارش را خراب نمی‌کند');

  if (PG) {
    r = await call('GET', '/api/admin/backup-now', null, { ck: ownerCk }); assert.equal(r.status, 400); ok('در حالت Supabase، پشتیبان‌گیری برنامه غیرفعال و پیام راهنما می‌دهد');
  } else {
  // پشتیبان و بازیابی
  r = await call('GET', '/api/admin/backup-now', null, { ck: ownerCk }); assert.equal(r.status, 200); const bk = Buffer.from(r.data);
  assert.equal(bk.slice(0, 15).toString(), 'SQLite format 3'); ok('دانلود نسخه پشتیبان SQLite');
  r = await call('GET', '/api/admin/backup-now', null, { ck: custCk }); assert.equal(r.status, 403);
  await call('POST', '/api/admin/categories', { name: 'دسته بعد از پشتیبان' }, { ck: ownerCk });
  const rf = new FormData(); rf.append('file', new Blob([bk]), 'b.sqlite');
  r = await call('POST', '/api/admin/restore', null, { form: rf, ck: ownerCk }); assert.equal(r.status, 200);
  r = await call('GET', '/api/categories'); assert.ok(!r.data.some((c) => c.name === 'دسته بعد از پشتیبان')); ok('بازیابی پشتیبان');
  const bad2 = new FormData(); bad2.append('file', new Blob(['not a db']), 'x.sqlite');
  r = await call('POST', '/api/admin/restore', null, { form: bad2, ck: ownerCk }); assert.equal(r.status, 400); ok('فایل پشتیبان خراب رد می‌شود');
  r = await call('GET', '/api/me', null, { ck: ownerCk }); assert.equal(r.data.user.role, 'owner'); ok('نشست بعد از بازیابی معتبر است');
  }

  // کنترل نقش
  const rg = await call('POST', '/api/auth/register', { name: 'مدیر دوم', phone: '09351112233', password: 'password123' }, { ck: '' });
  const adminId = rg.data.user.id;
  r = await call('POST', `/api/admin/users/${adminId}`, { role: 'admin' }, { ck: ownerCk }); assert.equal(r.status, 200);
  r = await call('POST', '/api/auth/login', { id: '09351112233', password: 'password123' }, { ck: '' });
  const adminCk = r.headers.get('set-cookie').split(';')[0];
  r = await call('GET', '/api/admin/orders', null, { ck: adminCk }); assert.equal(r.status, 200);
  r = await call('GET', '/api/admin/backups', null, { ck: adminCk }); assert.equal(r.status, 403); ok('مدیر عادی به پشتیبان‌گیری دسترسی ندارد، مالک دارد');
  r = await call('POST', `/api/admin/users/${adminId}`, { blocked: true }, { ck: ownerCk });
  r = await call('GET', '/api/admin/orders', null, { ck: adminCk }); assert.equal(r.status, 403); ok('کاربر مسدودشده فوراً بیرون می‌رود');

  // ---- سئو ----
  const get = async (u) => { const x = await fetch(base() + u); return { status: x.status, text: await x.text(), type: x.headers.get('content-type') || '' }; };
  let g = await get('/'); assert.equal(g.status, 200); assert.ok(g.text.includes('<div id="app"')); assert.ok(g.text.indexOf('<base href="/">') > 0 && g.text.indexOf('<base href="/">') < g.text.indexOf('style.css')); assert.ok(g.text.includes('"@type":"Store"') && g.text.includes('"@type":"WebSite"')); assert.ok(/<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/.test(g.text)); ok('صفحه اصلی: متا، canonical و JSON-LD فروشگاه');
  g = await get('/p/' + p2.id); assert.equal(g.status, 200); assert.ok(g.text.includes('<title>کیف تست | ')); assert.ok(g.text.includes('"@type":"Product"') && g.text.includes('"priceCurrency":"IRR"') && g.text.includes('"price":5000000') && g.text.includes('BreadcrumbList')); assert.ok(g.text.includes('og:image')); ok('صفحه محصول: عنوان یکتا، Product + Breadcrumb JSON-LD');
  g = await get('/p/999999'); assert.equal(g.status, 404); assert.ok(g.text.includes('noindex')); ok('محصول ناموجود ← ۴۰۴ واقعی');
  g = await get('/no-such-page'); assert.equal(g.status, 404); ok('مسیر ناشناخته ← ۴۰۴ واقعی');
  g = await get('/cart'); assert.equal(g.status, 200); assert.ok(g.text.includes('noindex')); ok('سبد خرید noindex است');
  g = await get('/products?q=x'); assert.ok(g.text.includes('noindex,follow')); ok('نتیجه جست‌وجو noindex است');
  g = await get('/robots.txt'); assert.ok(g.text.includes('Disallow: /api/') && g.text.includes('Sitemap: http://')); ok('robots.txt');
  g = await get('/sitemap.xml'); assert.ok(g.type.includes('xml') && g.text.includes('/p/' + p2.id) && g.text.includes('<urlset')); ok('sitemap.xml شامل محصولات');
  g = await get('/llms.txt'); assert.ok(g.text.startsWith('# ') && g.text.includes('کیف تست')); ok('llms.txt');
  g = await get('/favicon.ico'); assert.equal(g.status, 200); ok('favicon.ico');
  r = await fetch(base() + '/app.js', { headers: { 'accept-encoding': 'gzip' } }); assert.equal(r.headers.get('content-encoding'), 'gzip'); ok('فشرده‌سازی gzip');

  console.log(`\nهمه ${n} تست موفق بود ✅`);
  server.close(); D.close(); if (gw) await gw.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(0);
})().catch((e) => { console.error('\n❌ تست ناموفق:', e); process.exit(1); });
