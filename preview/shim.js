'use strict';
/* نسخه نمایشی (Preview): جایگزین سرور؛ همه‌چیز در مرورگر ذخیره می‌شود و به هیچ سروری وصل نیست.
   فقط برای دیدن ظاهر و تجربه کاربری است؛ داده‌های فروشگاه واقعی نیست. */
(function () {
  window.__PREVIEW__ = true;
  const KEY = 'kian-preview-v1';
  const LABELS = { pending: 'در انتظار بررسی', confirmed: 'تأیید شده', preparing: 'در حال آماده‌سازی', shipped: 'ارسال شد', delivered: 'تحویل داده شد', rejected: 'رد شده', cancelled: 'لغو شده' };
  const FLOW = { pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['preparing', 'shipped', 'rejected', 'cancelled'], preparing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], rejected: [], cancelled: [] };
  const now = () => Math.floor(Date.now() / 1000);
  const enD = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const normPhone = (s) => { let p = enD(s).replace(/[\s\-()]/g, ''); if (p.startsWith('+98')) p = '0' + p.slice(3); else if (/^9\d{9}$/.test(p)) p = '0' + p; return /^09\d{9}$/.test(p) ? p : null; };

  function seed() {
    const t = now();
    const P = (id, cat, name, price, old, stock, img, d) => ({ id, category_id: cat, name, description: d, price, old_price: old, stock, images: [img], active: 1, created_at: t - id * 3600, updated_at: t });
    return {
      seq: { user: 3, product: 9, category: 4, order: 1 },
      settings: { shop_name: 'کیان اکسسور', tagline: 'کمربند، کیف و اکسسوری', owner_phone: '+989039665868', admin_telegram: '@TheROMZ52', telegram_link: 'https://t.me/Kianacs?direct', instagram: '2026.kian_accessory', shipping_cost: '50000', free_shipping_over: '2000000', payment_info: 'پس از ثبت سفارش و تأیید موجودی، نحوه پرداخت از طریق پیام‌رسان یا تماس به شما اعلام می‌شود.', announcement: 'نسخه نمایشی — محصولات و سفارش‌ها نمونه‌اند', business_city: '', business_address: '' },
      users: [
        { id: 1, name: 'مالک نمایشی', phone: '09039665868', email: null, password: 'demo1234', role: 'owner', province: '', city: '', address: '', postal_code: '', blocked: 0, created_at: t - 99999 },
        { id: 2, name: 'مشتری نمایشی', phone: '09121234567', email: null, password: 'demo1234', role: 'customer', province: 'تهران', city: 'تهران', address: 'خیابان ولیعصر، پلاک ۱۲', postal_code: '', blocked: 0, created_at: t - 88888 },
      ],
      categories: [{ id: 1, name: 'کمربند', sort: 0 }, { id: 2, name: 'کیف', sort: 1 }, { id: 3, name: 'اکسسوری', sort: 2 }],
      products: [
        P(1, 1, 'کمربند چرم طبیعی کلاسیک', 1250000, 1490000, 8, 'demo-belt-1.svg', 'چرم طبیعی با سگک نقره‌ای مات.\nمناسب استفاده روزانه و رسمی.'),
        P(2, 1, 'کمربند مشکی سگک قفلی', 980000, null, 5, 'demo-belt-2.svg', 'کمربند مشکی با سگک قفلی مقاوم.'),
        P(3, 1, 'کمربند دورو (مشکی/قهوه‌ای)', 1480000, null, 2, 'demo-belt-1.svg', 'دو رنگ در یک کمربند؛ سگک چرخشی.'),
        P(4, 2, 'کیف دوشی چرمی', 3200000, 3600000, 4, 'demo-bag-1.svg', 'کیف دوشی با دو جیب داخلی و زیپ ضدسرقت.'),
        P(5, 2, 'کیف دستی اداری', 4100000, null, 3, 'demo-bag-2.svg', 'جای لپ‌تاپ ۱۵ اینچ، چرم مصنوعی درجه یک.'),
        P(6, 2, 'کیف پول مردانه', 690000, null, 12, 'demo-bag-1.svg', 'کیف پول جاکارتی با ۸ جا کارت.'),
        P(7, 3, 'دستبند استیل نقره‌ای', 420000, 520000, 15, 'demo-ring-1.svg', 'استیل ضدزنگ، قفل مغناطیسی.'),
        P(8, 3, 'ست سگک و حلقه', 350000, null, 0, 'demo-ring-1.svg', 'این محصول نمونه ناموجود است.'),
      ],
      orders: [], order_items: [], order_events: [], sessionUser: null,
    };
  }
  let mem = null;
  const load = () => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) { /* ignore */ } return mem || seed(); };
  let DB = load();
  const save = () => { mem = DB; try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* ignore */ } };
  const E = (status, message) => Object.assign(new Error(message), { status });
  const pub = (u) => u && ({ id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, province: u.province, city: u.city, address: u.address, postal_code: u.postal_code, hasPassword: true, google: false });
  const me = () => DB.users.find((u) => u.id === DB.sessionUser && !u.blocked) || null;
  const needAuth = () => { if (!me()) throw E(401, 'ابتدا وارد حساب کاربری شوید'); return me(); };
  const needAdmin = () => { const u = me(); if (!u || !['admin', 'owner'].includes(u.role)) throw E(403, 'دسترسی ندارید'); return u; };
  const orderFull = (o) => ({ ...o, items: DB.order_items.filter((i) => i.order_id === o.id), events: DB.order_events.filter((e) => e.order_id === o.id) });
  const catName = (id) => (DB.categories.find((c) => c.id === id) || {}).name || null;
  const prodOut = (p) => ({ ...p, active: !!p.active, category: catName(p.category_id) });

  function setStatus(o, status, actor, note) {
    if (!FLOW[o.status].includes(status)) throw E(409, `تغییر از «${LABELS[o.status]}» به «${LABELS[status]}» مجاز نیست`);
    if (status === 'rejected' || status === 'cancelled') for (const it of DB.order_items.filter((i) => i.order_id === o.id)) { const p = DB.products.find((x) => x.id === it.product_id); if (p) p.stock += it.qty; }
    o.status = status; o.updated_at = now();
    DB.order_events.push({ order_id: o.id, status, note: note || '', actor, created_at: now() });
  }

  function createOrder(b) {
    const u = needAuth();
    const want = new Map();
    for (const it of (b.items || [])) { const q = Number(it.qty), id = Number(it.id); if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1) throw E(400, 'اطلاعات سبد خرید نامعتبر است'); want.set(id, (want.get(id) || 0) + q); }
    if (!want.size) throw E(400, 'سبد خرید خالی است');
    const phone = normPhone(b.phone);
    if (String(b.name || '').trim().length < 2) throw E(400, 'نام و نام خانوادگی را وارد کنید');
    if (!phone) throw E(400, 'شماره موبایل معتبر نیست (مثال: 09123456789)');
    if (!b.province || !b.city) throw E(400, 'استان و شهر را وارد کنید');
    if (String(b.address || '').trim().length < 10) throw E(400, 'آدرس کامل‌تر وارد کنید');
    let subtotal = 0;
    for (const [id, q] of want) { const p = DB.products.find((x) => x.id === id); if (!p || !p.active) throw E(409, 'یکی از محصولات سبد دیگر موجود نیست'); if (p.stock < q) throw E(409, `موجودی «${p.name}» کافی نیست (موجود: ${p.stock})`); }
    const lines = [...want].map(([id, q]) => { const p = DB.products.find((x) => x.id === id); p.stock -= q; subtotal += p.price * q; return { p, q }; });
    const s = DB.settings, ship = parseInt(s.shipping_cost, 10) || 0, free = parseInt(s.free_shipping_over, 10) || 0;
    const shipping = free && subtotal >= free ? 0 : ship;
    const id = DB.seq.order++, A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'KA-'; for (let i = 0; i < 7; i++) code += A[Math.floor(Math.random() * A.length)];
    const o = { id, code, user_id: u.id, name: String(b.name).trim(), phone, province: b.province, city: b.city, address: b.address, postal_code: b.postal_code || '', note: b.note || '', subtotal, shipping, total: subtotal + shipping, status: 'pending', created_at: now(), updated_at: now() };
    DB.orders.push(o);
    for (const { p, q } of lines) DB.order_items.push({ order_id: id, product_id: p.id, name: p.name, price: p.price, qty: q });
    DB.order_events.push({ order_id: id, status: 'pending', note: 'سفارش ثبت شد', actor: 'customer', created_at: now() });
    Object.assign(u, { province: o.province, city: o.city, address: o.address, postal_code: o.postal_code, name: u.name || o.name });
    return orderFull(o);
  }

  function handle(method, full, body) {
    const [path, qstr] = full.split('?'); const q = new URLSearchParams(qstr || ''); const p = path.split('/').filter(Boolean);
    const is = (m, pat) => { if (m !== method) return null; const r = pat.split('/').filter(Boolean); if (r.length !== p.length) return null; const out = []; for (let i = 0; i < r.length; i++) { if (r[i] === ':x') out.push(p[i]); else if (r[i] !== p[i]) return null; } return out; };
    let m;
    if (is('GET', 'config')) return { ...DB.settings, googleClientId: null, statuses: LABELS };
    if (is('GET', 'me')) return { user: pub(me()) };
    if (is('POST', 'auth/logout')) { DB.sessionUser = null; return { ok: true }; }
    if (is('POST', 'auth/login')) { const ph = normPhone(body.id); const u = DB.users.find((x) => (ph ? x.phone === ph : x.email === String(body.id).toLowerCase())); if (!u || u.password !== body.password) throw E(401, 'شماره/ایمیل یا رمز عبور اشتباه است'); if (u.blocked) throw E(403, 'حساب شما مسدود شده است'); DB.sessionUser = u.id; return { user: pub(u) }; }
    if (is('POST', 'auth/register')) { const ph = normPhone(body.phone); if (String(body.name || '').trim().length < 2) throw E(400, 'نام را وارد کنید'); if (!ph) throw E(400, 'شماره موبایل معتبر نیست'); if (String(body.password || '').length < 8) throw E(400, 'رمز عبور باید حداقل ۸ کاراکتر باشد'); if (DB.users.some((x) => x.phone === ph)) throw E(409, 'این شماره قبلاً ثبت‌نام کرده است؛ وارد شوید'); const u = { id: DB.seq.user++, name: body.name.trim(), phone: ph, email: null, password: body.password, role: 'customer', province: '', city: '', address: '', postal_code: '', blocked: 0, created_at: now() }; DB.users.push(u); DB.sessionUser = u.id; return { user: pub(u) }; }
    if (is('PUT', 'me')) { const u = needAuth(); if (String(body.name || '').trim().length < 2) throw E(400, 'نام را وارد کنید'); Object.assign(u, { name: body.name.trim(), province: body.province || '', city: body.city || '', address: body.address || '', postal_code: body.postal_code || '' }); if (body.phone) { const ph = normPhone(body.phone); if (!ph) throw E(400, 'شماره موبایل معتبر نیست'); u.phone = ph; } if (body.new_password) { if (body.new_password.length < 8) throw E(400, 'رمز جدید باید حداقل ۸ کاراکتر باشد'); if (u.password !== (body.old_password || '')) throw E(400, 'رمز فعلی اشتباه است'); u.password = body.new_password; } return { user: pub(u) }; }
    if (is('GET', 'categories')) return DB.categories.map((c) => ({ id: c.id, name: c.name, count: DB.products.filter((x) => x.category_id === c.id && x.active).length }));
    if (is('GET', 'products')) {
      let rows = DB.products.filter((x) => x.active); const s = (q.get('q') || '').trim(), cat = parseInt(q.get('category'), 10);
      if (s) rows = rows.filter((x) => x.name.includes(s) || x.description.includes(s)); if (cat) rows = rows.filter((x) => x.category_id === cat);
      const sort = q.get('sort'); rows.sort((a, b) => ((b.stock > 0) - (a.stock > 0)) || (sort === 'cheap' ? a.price - b.price : sort === 'exp' ? b.price - a.price : b.id - a.id));
      const limit = Math.min(60, parseInt(q.get('limit'), 10) || 24), page = Math.max(1, parseInt(q.get('page'), 10) || 1);
      return { total: rows.length, page, limit, items: rows.slice((page - 1) * limit, page * limit).map(prodOut) };
    }
    if ((m = is('GET', 'products/:x'))) { const x = DB.products.find((v) => v.id === Number(m[0]) && v.active); if (!x) throw E(404, 'محصول پیدا نشد'); return prodOut(x); }
    if (is('POST', 'cart/check')) return DB.products.filter((x) => x.active && (body.ids || []).includes(x.id)).map(prodOut);
    if (is('POST', 'orders')) return createOrder(body);
    if (is('GET', 'orders')) { const u = needAuth(); return DB.orders.filter((o) => o.user_id === u.id).sort((a, b) => b.id - a.id).map(orderFull); }
    if ((m = is('GET', 'orders/:x'))) { const u = needAuth(); const o = DB.orders.find((v) => v.code === m[0].toUpperCase() && v.user_id === u.id); if (!o) throw E(404, 'سفارش پیدا نشد'); return orderFull(o); }
    if ((m = is('POST', 'orders/:x/cancel')) || (p[0] === 'orders' && p[2] === 'cancel' && method === 'POST')) { const u = needAuth(); const o = DB.orders.find((v) => v.code === p[1].toUpperCase() && v.user_id === u.id); if (!o) throw E(404, 'سفارش پیدا نشد'); if (o.status !== 'pending') throw E(409, 'فقط سفارش‌های در انتظار بررسی را می‌توانید لغو کنید'); setStatus(o, 'cancelled', 'customer', 'لغو توسط مشتری'); return orderFull(o); }
    if (is('POST', 'track')) { const ph = normPhone(body.phone); const o = ph && DB.orders.find((v) => v.code === String(body.code).toUpperCase() && v.phone === ph); if (!o) throw E(404, 'سفارشی با این کد و شماره پیدا نشد'); const f = orderFull(o); return { code: o.code, status: o.status, total: o.total, created_at: o.created_at, items: f.items.map(({ name, qty }) => ({ name, qty })), events: f.events }; }

    // --- مدیریت ---
    if (p[0] === 'admin') {
      const u = needAdmin(); const a = p.slice(1).join('/');
      if (is('GET', 'admin/stats')) { const by = {}; DB.orders.forEach((o) => { by[o.status] = (by[o.status] || 0) + 1; }); return { byStatus: by, pending: by.pending || 0, last24h: DB.orders.filter((o) => o.created_at > now() - 86400).length, revenue: DB.orders.filter((o) => !['rejected', 'cancelled'].includes(o.status)).reduce((s, o) => s + o.total, 0), products: DB.products.length, customers: DB.users.filter((x) => x.role === 'customer').length, lowStock: DB.products.filter((x) => x.active && x.stock <= 3).slice(0, 20).map(({ id, name, stock }) => ({ id, name, stock })) }; }
      if (is('GET', 'admin/orders')) { let rows = [...DB.orders].sort((x, y) => y.id - x.id); const st = q.get('status'), s = (q.get('q') || '').trim(); if (st) rows = rows.filter((o) => o.status === st); if (s) rows = rows.filter((o) => o.code.includes(s.toUpperCase()) || o.name.includes(s) || o.phone.includes(enD(s))); const limit = 50, page = Math.max(1, parseInt(q.get('page'), 10) || 1); return { total: rows.length, page, limit, items: rows.slice((page - 1) * limit, page * limit).map(({ id, code, name, phone, city, total, status, created_at }) => ({ id, code, name, phone, city, total, status, created_at })) }; }
      if ((m = is('GET', 'admin/orders/:x'))) { const o = DB.orders.find((v) => v.id === Number(m[0])); if (!o) throw E(404, 'سفارش پیدا نشد'); return { ...orderFull(o), allowed: FLOW[o.status] }; }
      if ((m = is('POST', 'admin/orders/:x/status')) || (p[1] === 'orders' && p[3] === 'status' && method === 'POST')) { const o = DB.orders.find((v) => v.id === Number(p[2])); if (!o) throw E(404, 'سفارش پیدا نشد'); if (!LABELS[body.status]) throw E(400, 'وضعیت نامعتبر است'); if (o.status !== body.status) setStatus(o, body.status, `${u.role}:${u.name}`, body.note); return { ...orderFull(o), allowed: FLOW[o.status] }; }
      if (is('GET', 'admin/categories')) return DB.categories.map((c) => ({ ...c, count: DB.products.filter((x) => x.category_id === c.id).length }));
      if (is('POST', 'admin/categories')) { const n = String(body.name || '').trim(); if (!n) throw E(400, 'نام دسته را وارد کنید'); if (DB.categories.some((c) => c.name === n)) throw E(409, 'این دسته قبلاً وجود دارد'); const id = DB.seq.category++; DB.categories.push({ id, name: n, sort: id }); return { id }; }
      if ((m = is('PUT', 'admin/categories/:x'))) { const c = DB.categories.find((v) => v.id === Number(m[0])); if (c && body.name) c.name = body.name.trim(); return { ok: true }; }
      if ((m = is('DELETE', 'admin/categories/:x'))) { DB.categories = DB.categories.filter((c) => c.id !== Number(m[0])); DB.products.forEach((x) => { if (x.category_id === Number(m[0])) x.category_id = null; }); return { ok: true }; }
      if (is('GET', 'admin/products')) { const s = (q.get('q') || '').trim(); return DB.products.filter((x) => !s || x.name.includes(s)).sort((x, y) => y.id - x.id).map(prodOut); }
      if ((m = is('GET', 'admin/products/:x'))) { const x = DB.products.find((v) => v.id === Number(m[0])); if (!x) throw E(404, 'محصول پیدا نشد'); return prodOut(x); }
      if (is('POST', 'admin/products') || ((m = is('PUT', 'admin/products/:x')))) {
        const f = Object.fromEntries(body.entries ? body.entries() : []); const price = parseInt(enD(f.price), 10), stock = parseInt(enD(f.stock), 10);
        if (!String(f.name || '').trim()) throw E(400, 'نام محصول را وارد کنید'); if (!(price >= 0)) throw E(400, 'قیمت (تومان) را درست وارد کنید'); if (!(stock >= 0)) throw E(400, 'موجودی را درست وارد کنید');
        const ex = m ? DB.products.find((v) => v.id === Number(m[0])) : null; if (m && !ex) throw E(404, 'محصول پیدا نشد');
        let keep = ex ? ex.images : []; try { const k = JSON.parse(f.keep || '[]'); if (f.keep !== undefined) keep = keep.filter((x) => k.includes(x)); } catch (e) { /* ignore */ }
        const catId = parseInt(f.category_id, 10) || null; const images = keep.length ? keep : [catId === 2 ? 'demo-bag-1.svg' : catId === 3 ? 'demo-ring-1.svg' : 'demo-belt-1.svg'];
        const rec = { category_id: catId, name: f.name.trim(), description: f.description || '', price, old_price: f.old_price ? parseInt(enD(f.old_price), 10) : null, stock, images, active: f.active === '0' ? 0 : 1, updated_at: now() };
        if (ex) { Object.assign(ex, rec); return prodOut(ex); }
        const np = { id: DB.seq.product++, created_at: now(), ...rec }; DB.products.push(np); return prodOut(np);
      }
      if ((m = is('DELETE', 'admin/products/:x'))) { DB.products = DB.products.filter((x) => x.id !== Number(m[0])); return { ok: true }; }
      if (is('GET', 'admin/users')) return DB.users.map((x) => ({ id: x.id, name: x.name, phone: x.phone, email: x.email, role: x.role, blocked: x.blocked, created_at: x.created_at, orders: DB.orders.filter((o) => o.user_id === x.id).length }));
      if ((m = is('POST', 'admin/users/:x'))) { const t = DB.users.find((v) => v.id === Number(m[0])); if (!t || t.role === 'owner' || t.id === u.id) throw E(400, 'این کاربر قابل تغییر نیست'); if (body.role) t.role = body.role; if (body.blocked !== undefined) t.blocked = body.blocked ? 1 : 0; return { ok: true }; }
      if (is('GET', 'admin/settings')) return { ...DB.settings, canEditAdminIds: false };
      if (is('PUT', 'admin/settings')) { for (const k of Object.keys(DB.settings)) if (body[k] !== undefined) DB.settings[k] = String(body[k]); return { ok: true }; }
      if (is('GET', 'admin/backups')) return [];
      throw E(400, 'این بخش در نسخه نمایشی فعال نیست');
    }
    throw E(404, 'پیدا نشد');
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opt = {}) {
    if (typeof url !== 'string' || !url.startsWith('api/')) return realFetch(url, opt);
    const method = (opt.method || 'GET').toUpperCase();
    let body = opt.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    await new Promise((r) => setTimeout(r, 60));
    try { const data = handle(method, url.slice(4), body || {}); save(); return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } }); }
    catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: e.status || 500, headers: { 'content-type': 'application/json' } }); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText = 'background:#1a1a1d;border-bottom:1px solid #3a3b41;color:#d6d9de;text-align:center;font:13px/1.9 Vazirmatn,Tahoma,sans-serif;padding:6px 10px';
    bar.innerHTML = '🔎 <b>نسخه نمایشی (Preview)</b> — داده‌ها فقط در مرورگر شما ذخیره می‌شود. ورود مدیر: <span dir="ltr">09039665868</span> / <span dir="ltr">demo1234</span> — مشتری: <span dir="ltr">09121234567</span> / <span dir="ltr">demo1234</span> <a href="#" id="prv-reset" style="color:#fff;text-decoration:underline;margin-inline-start:8px">بازنشانی</a>';
    document.body.prepend(bar);
    document.getElementById('prv-reset').onclick = (e) => { e.preventDefault(); try { localStorage.removeItem(KEY); } catch (x) { /* ignore */ } location.hash = '#/'; location.reload(); };
  });
})();
