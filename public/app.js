'use strict';
/* فروشگاه کیان اکسسور — فرانت‌اند (بدون وابستگی خارجی؛ کاملاً قابل اجرا روی شبکه داخلی) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const toman = (n) => `${fa(n)} <small>تومان</small>`;
const dateFa = (t) => new Date(t * 1000).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const ICON = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8a3 3 0 016 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

const S = { user: null, cfg: null, cart: [], cats: null };
try { S.cart = JSON.parse(localStorage.getItem('cart') || '[]').filter((i) => i && Number.isInteger(i.id) && i.qty > 0); } catch (e) { S.cart = []; }
const saveCart = () => { try { localStorage.setItem('cart', JSON.stringify(S.cart)); } catch (e) { /* ignore */ } };
const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);

async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (form) opt.body = form;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch('api' + path, opt); } catch (e) { throw new Error('ارتباط با سرور برقرار نشد. اینترنت/شبکه را بررسی کنید.'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : null;
  if (!r.ok) { const e = new Error((data && data.error) || 'خطا در انجام درخواست'); e.status = r.status; throw e; }
  return data;
}
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const HASH_MODE = !!window.__PREVIEW__; // نسخه Preview روی GitHub Pages (بدون سرور) با هش کار می‌کند
function curRoute() {
  if (HASH_MODE) return (location.hash.slice(1) || '/').split('?');
  if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1)); // لینک‌های قدیمی
  return [location.pathname.replace(/\/+$/, '') || '/', location.search.slice(1)];
}
const curPath = () => curRoute()[0];
const go = (h) => {
  if (HASH_MODE) { location.hash = h; return; }
  const u = h.startsWith('#') ? h.slice(1) : h;
  if (u !== location.pathname + location.search) history.pushState(null, '', u);
  render();
};
const fixLinks = (html) => (HASH_MODE ? html : html.replace(/href="#\//g, 'href="/'));
const isStaff = () => S.user && ['admin', 'owner'].includes(S.user.role);
const img0 = (p) => (p.images && p.images[0] ? `uploads/${p.images[0]}` : null);

/* ---------- قاب اصلی ---------- */
function shell0(inner, active) {
  const c = S.cfg || {};
  const n = cartCount();
  const nav = [['#/', 'خانه', 'home'], ['#/products', 'محصولات', 'grid'], ['#/cart', 'سبد خرید', 'bag'], [S.user ? '#/account' : '#/login', S.user ? 'حساب من' : 'ورود', 'user']];
  return `
  ${c.announcement ? `<div class="announce">${esc(c.announcement)}</div>` : ''}
  <header class="top"><div class="wrap">
    <a class="brand" href="#/"><img src="img/logo.jpg" alt="" width="40" height="40"><span class="metal">${esc(c.shop_name || 'کیان اکسسور')}</span></a>
    <nav class="topnav">${nav.slice(0, 2).map((x) => `<a href="${x[0]}" class="${active === x[2] ? 'on' : ''}">${x[1]}</a>`).join('')}<a href="#/track" class="${active === 'track' ? 'on' : ''}">پیگیری سفارش</a><a href="#/contact" class="${active === 'contact' ? 'on' : ''}">تماس با ما</a></nav>
    <form class="searchbox" data-form="search"><input type="search" name="q" placeholder="جست‌وجوی محصول…" aria-label="جست‌وجو"></form>
    <span class="grow"></span>
    ${isStaff() ? '<a class="btn sm" href="#/admin">مدیریت</a>' : ''}
    <a class="iconbtn" href="#/cart" aria-label="سبد خرید" id="cartbtn">${svg('bag')}${n ? `<span class="badge">${fa(n)}</span>` : ''}</a>
    <a class="iconbtn" href="${S.user ? '#/account' : '#/login'}" aria-label="حساب">${svg('user')}</a>
  </div></header>
  <main>${inner}</main>
  <footer class="foot"><div class="wrap">
    <div><b class="metal">${esc(c.shop_name || '')}</b><div>${esc(c.tagline || '')}</div><div class="small">پشتیبانی و ثبت سفارش از طریق پیام‌رسان یا تماس مستقیم.</div></div>
    <div>${contactLinks(c)}<div style="margin-top:8px"><a href="#/products">محصولات</a> · <a href="#/track">پیگیری سفارش</a> · <a href="#/contact">تماس با ما</a></div></div>
  </div></footer>
  <nav class="tabbar">${nav.map((x) => `<a href="${x[0]}" class="${active === x[2] ? 'on' : ''}">${svg(x[2])}<span>${x[1]}</span>${x[2] === 'bag' && n ? `<span class="badge">${fa(n)}</span>` : ''}</a>`).join('')}</nav>`;
}
function contactLinks(c) {
  const tel = (c.owner_phone || '').replace(/\s/g, '');
  const ig = (c.instagram || '').replace(/^@/, '');
  return [
    c.business_address ? `<div>📍 ${esc([c.business_city, c.business_address].filter(Boolean).join('، '))}</div>` : '',
    tel ? `<div>📞 مالک: <a class="ltr" href="tel:${esc(tel)}" dir="ltr">${esc(tel)}</a></div>` : '',
    c.admin_telegram ? `<div>👨‍💼 ادمین: <a href="https://t.me/${esc(c.admin_telegram.replace('@', ''))}" target="_blank" rel="noopener">${esc(c.admin_telegram)}</a></div>` : '',
    c.telegram_link ? `<div>💬 <a href="${esc(c.telegram_link)}" target="_blank" rel="noopener">دایرکت و ثبت سفارش در تلگرام</a></div>` : '',
    ig ? `<div>📷 اینستاگرام: <a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener" dir="ltr">@${esc(ig)}</a></div>` : '',
  ].join('');
}
const shell = (i, a) => fixLinks(shell0(i, a));
const crumbs = (items) => `<nav class="crumbs" aria-label="مسیر صفحه"><ol>${items.map(([l, h]) => `<li>${h ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`}</li>`).join('')}</ol></nav>`;
let PM = null; // متای اختصاصی صفحه فعلی (عنوان، توضیح)
const PRIVATE = /^\/(cart|checkout|account|login|register|order|done|track|admin)(\/|$)/;
function defaultMeta(path) {
  const n = S.cfg.shop_name || 'کیان اکسسور';
  const T = { '/': [`${n} | ${S.cfg.tagline}`, `${n}؛ ${S.cfg.tagline}. خرید آنلاین، ثبت سفارش چندمحصولی و پیگیری با کد رهگیری.`], '/products': ['محصولات', `همه محصولات ${n}: کمربند، استیکر و اکسسوری.`], '/cart': ['سبد خرید'], '/checkout': ['ثبت سفارش'], '/track': ['پیگیری سفارش', 'پیگیری وضعیت سفارش با کد رهگیری و شماره موبایل.'], '/contact': ['تماس با ما و ثبت سفارش', `راه‌های ارتباط با ${n}: تلفن مالک، تلگرام و اینستاگرام.`], '/login': ['ورود'], '/register': ['ثبت‌نام'], '/account': ['حساب من'] };
  let t = T[path];
  if (!t) t = path.startsWith('/order/') ? ['سفارش ' + path.split('/')[2]] : path.startsWith('/done/') ? ['سفارش شما ثبت شد'] : path.startsWith('/admin') ? ['مدیریت فروشگاه'] : ['صفحه پیدا نشد'];
  return { title: t[0] === T['/'][0] ? t[0] : `${t[0]} | ${n}`, desc: t[1] || '' };
}
function setMeta(path, m, noindex) {
  document.title = m.title;
  const up = (sel, tag, attrs) => { let el = $(sel); if (!el) { el = document.createElement(tag); document.head.appendChild(el); } for (const k in attrs) el.setAttribute(k, attrs[k]); };
  up('meta[name="description"]', 'meta', { name: 'description', content: m.desc || '' });
  up('meta[name="robots"]', 'meta', { name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow' });
  if (!HASH_MODE) up('link[rel="canonical"]', 'link', { rel: 'canonical', href: location.origin + (m.canonical || path) });
}
const notFound = () => `<div class="wrap page"><div class="empty"><h1 class="metal" style="font-size:3rem;margin:0">۴۰۴</h1><b>صفحه‌ای که دنبالش بودید پیدا نشد</b>ممکن است آدرس اشتباه باشد یا محصول حذف شده باشد.<div class="row" style="margin-top:18px;justify-content:center;max-width:360px;margin-inline:auto"><a class="btn primary" href="#/">صفحه اصلی</a><a class="btn" href="#/products">محصولات</a></div></div></div>`;
const loading = () => '<div class="wrap page"><div class="spin"></div></div>';
const fail = (e) => `<div class="wrap page"><div class="empty"><b>مشکلی پیش آمد</b>${esc(e.message || e)}<div style="margin-top:14px"><a class="btn" href="#/">بازگشت به خانه</a></div></div></div>`;

function pcard(p) {
  const im = img0(p);
  return `<a class="pcard" href="#/p/${p.id}"><div class="pimg">${im ? `<img src="${im}" alt="${esc(p.name)}" loading="lazy">` : `<div class="ph">${svg('img')}</div>`}
    ${p.stock <= 0 ? '<span class="tag off">ناموجود</span>' : (p.old_price && p.old_price > p.price ? `<span class="tag">${fa(Math.round((1 - p.price / p.old_price) * 100))}٪ تخفیف</span>` : '')}</div>
    <div class="pinfo"><div class="pname">${esc(p.name)}</div><div class="price">${toman(p.price)}${p.old_price > p.price ? `<span class="old">${fa(p.old_price)}</span>` : ''}</div></div></a>`;
}

/* ---------- صفحات ---------- */
const R = []; // [regex, handler, activeTab]
const route = (re, fn, tab) => R.push([re, fn, tab]);

route(/^\/?$/, async () => {
  const [prods, cats] = await Promise.all([api('/products?limit=8'), api('/categories')]);
  const c = S.cfg;
  return ['home', `
  <section class="hero"><div class="wrap">
    <div><h1 class="metal">${esc(c.shop_name)}</h1><p>${esc(c.tagline)}. سفارش بدهید، با کد رهگیری وضعیتش را ببینید و مستقیم با ما در ارتباط باشید.</p>
      <div class="row" style="max-width:340px"><a class="btn primary" href="#/products">مشاهده محصولات</a><a class="btn" href="#/track">پیگیری سفارش</a></div></div>
    <div class="logo3d"><i class="ring"></i><img class="logo" src="img/logo.jpg" alt="لوگوی ${esc(c.shop_name)}" width="300" height="300"></div>
  </div></section>
  <div class="marq" aria-hidden="true"><div class="tr">${'<span>BELTS</span><span>✦</span><span>STICKERS</span><span>✦</span><span>ACCESSORIES</span><span>✦</span>'.repeat(8)}</div></div>
  <div class="wrap page">
    <div class="chips">${cats.map((x) => `<a class="chip" href="#/products?category=${x.id}">${esc(x.name)}<small>${fa(x.count)}</small></a>`).join('')}</div>
    <div class="perks"><div><b>ثبت سفارش چندمحصولی</b><span>همه‌چیز را در یک سبد بخرید</span></div><div><b>پیگیری با کد رهگیری</b><span>هر مرحله از سفارش قابل مشاهده است</span></div><div><b>ارتباط مستقیم با مالک</b><span>تلفن و تلگرام در دسترس است</span></div></div>
    <div class="pagehead" style="margin-top:26px"><h2>جدیدترین‌ها</h2><a class="muted" href="#/products">همه محصولات</a></div>
    ${prods.items.length ? `<div class="grid">${prods.items.map(pcard).join('')}</div>` : '<div class="empty"><b>هنوز محصولی ثبت نشده</b>به‌زودی محصولات جدید اضافه می‌شوند.</div>'}
  </div>`];
}, 'home');

route(/^\/products$/, async (m, qs) => {
  const q = qs.get('q') || '', cat = qs.get('category') || '', sort = qs.get('sort') || 'new', page = Math.max(1, parseInt(qs.get('page'), 10) || 1);
  const [data, cats] = await Promise.all([api(`/products?q=${encodeURIComponent(q)}&category=${cat}&sort=${sort}&page=${page}&limit=24`), api('/categories')]);
  const link = (o) => { const p = new URLSearchParams({ q, category: cat, sort, page, ...o }); for (const [k, v] of [...p]) if (!v || (k === 'page' && v === '1') || (k === 'sort' && v === 'new')) p.delete(k); return '#/products' + (p.toString() ? '?' + p : ''); };
  const pages = Math.ceil(data.total / data.limit);
  const cn = (cats.find((x) => String(x.id) === cat) || {}).name;
  PM = { title: `${cn ? cn + ' — ' : ''}${q ? 'جست‌وجوی «' + q + '»' : 'محصولات'} | ${S.cfg.shop_name}`, desc: cn ? `خرید ${cn} از ${S.cfg.shop_name}؛ مشاهده قیمت و موجودی.` : `همه محصولات ${S.cfg.shop_name}: کمربند، استیکر و اکسسوری.`, canonical: '/products' + (cat ? '?category=' + cat : '') };
  return ['grid', `<div class="wrap page">${crumbs([['خانه', '#/'], ['محصولات', cn ? '#/products' : null], ...(cn ? [[cn, null]] : [])])}
    <div class="pagehead"><h1>${esc(cn || 'محصولات')}</h1>
      <select data-act="sort" aria-label="مرتب‌سازی" style="width:auto"><option value="new" ${sort === 'new' ? 'selected' : ''}>جدیدترین</option><option value="cheap" ${sort === 'cheap' ? 'selected' : ''}>ارزان‌ترین</option><option value="exp" ${sort === 'exp' ? 'selected' : ''}>گران‌ترین</option></select></div>
    <form data-form="search" class="field"><input type="search" name="q" value="${esc(q)}" placeholder="جست‌وجوی نام یا توضیحات محصول…"></form>
    <div class="chips" style="margin-bottom:16px"><a class="chip ${cat ? '' : 'on'}" href="${link({ category: '', page: 1 })}">همه</a>${cats.map((x) => `<a class="chip ${String(x.id) === cat ? 'on' : ''}" href="${link({ category: x.id, page: 1 })}">${esc(x.name)}<small>${fa(x.count)}</small></a>`).join('')}</div>
    ${data.items.length ? `<div class="grid">${data.items.map(pcard).join('')}</div>` : `<div class="empty"><b>محصولی پیدا نشد</b>${q || cat ? 'جست‌وجو یا دسته‌بندی را تغییر دهید.' : 'هنوز محصولی ثبت نشده است.'}</div>`}
    ${pages > 1 ? `<div class="chips" style="justify-content:center;margin-top:20px">${Array.from({ length: pages }, (_, i) => `<a class="chip ${i + 1 === page ? 'on' : ''}" href="${link({ page: i + 1 })}">${fa(i + 1)}</a>`).join('')}</div>` : ''}
  </div>`];
}, 'grid');

route(/^\/p\/(\d+)$/, async (m) => {
  const p = await api('/products/' + m[1]);
  const rel = p.category_id ? (await api(`/products?category=${p.category_id}&limit=5`)).items.filter((x) => x.id !== p.id).slice(0, 4) : [];
  PM = { title: `${p.name} | ${S.cfg.shop_name}`, desc: (p.description || `خرید ${p.name} از ${S.cfg.shop_name}`).replace(/\s+/g, ' ').slice(0, 155), canonical: '/p/' + p.id };
  const inCart = (S.cart.find((i) => i.id === p.id) || {}).qty || 0;
  const imgs = p.images.map((i) => `uploads/${i}`);
  S.pdQty = 1;
  return ['grid', `<div class="wrap page">${crumbs([['خانه', '#/'], ['محصولات', '#/products'], ...(p.category ? [[p.category, '#/products?category=' + p.category_id]] : []), [p.name, null]])}<div class="two rev">
    <div class="gallery">
      <div class="main">${imgs[0] ? `<img id="pmain" src="${imgs[0]}" alt="${esc(p.name)}">` : `<div class="pimg"><div class="ph">${svg('img')}</div></div>`}</div>
      ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((s, i) => `<img src="${s}" data-act="thumb" class="${i ? '' : 'on'}" alt="${esc(p.name)} - تصویر ${i + 1}">`).join('')}</div>` : ''}
    </div>
    <div class="stack">
      <div class="muted small"><a href="#/products${p.category_id ? '?category=' + p.category_id : ''}">${esc(p.category || 'محصولات')}</a></div>
      <h1>${esc(p.name)}</h1>
      <div class="price" style="font-size:1.4rem">${toman(p.price)}${p.old_price > p.price ? `<span class="old">${fa(p.old_price)} تومان</span>` : ''}</div>
      <div>${p.stock > 0 ? (p.stock <= 3 ? `<span class="st pending">فقط ${fa(p.stock)} عدد موجود است</span>` : '<span class="st delivered">موجود</span>') : '<span class="st rejected">ناموجود</span>'}</div>
      ${p.stock > 0 ? `<div class="row" style="align-items:center"><div class="qty" style="flex:0 0 auto"><button data-act="pq" data-d="-1" aria-label="کم">−</button><span id="pq">۱</span><button data-act="pq" data-d="1" data-max="${p.stock}" aria-label="زیاد">+</button></div>
        <button class="btn primary" data-act="add" data-id="${p.id}" data-max="${p.stock}">افزودن به سبد خرید</button></div>${inCart ? `<div class="small muted">${fa(inCart)} عدد از این محصول در سبد شماست.</div>` : ''}` : ''}
      ${p.description ? `<div class="card"><h3>توضیحات</h3><div class="desc">${esc(p.description)}</div></div>` : ''}
    </div></div>${rel.length ? `<h2 style="margin-top:34px">محصولات مشابه</h2><div class="grid">${rel.map(pcard).join('')}</div>` : ''}</div>`];
}, 'grid');

/* سبد خرید */
async function cartData() {
  if (!S.cart.length) return { lines: [], subtotal: 0, shipping: 0, total: 0, issues: false };
  const items = await api('/cart/check', { method: 'POST', body: { ids: S.cart.map((i) => i.id) } });
  const map = new Map(items.map((p) => [p.id, p]));
  const before = JSON.stringify(S.cart);
  S.cart = S.cart.filter((i) => map.has(i.id)).map((i) => ({ id: i.id, qty: Math.min(i.qty, Math.max(map.get(i.id).stock, 0)) })).filter((i) => i.qty > 0);
  const changed = before !== JSON.stringify(S.cart);
  saveCart();
  const lines = S.cart.map((i) => ({ ...map.get(i.id), qty: i.qty }));
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const c = S.cfg, ship = parseInt(c.shipping_cost, 10) || 0, free = parseInt(c.free_shipping_over, 10) || 0;
  const shipping = lines.length && !(free && subtotal >= free) ? ship : 0;
  return { lines, subtotal, shipping, total: subtotal + shipping, changed, free };
}
function summary(d) {
  return `<div class="sum"><div><span>جمع کالاها</span><span>${toman(d.subtotal)}</span></div>
    <div><span>هزینه ارسال</span><span>${d.shipping ? toman(d.shipping) : 'رایگان'}</span></div>
    ${d.free && d.shipping && d.subtotal < d.free ? `<div class="small muted"><span>با ${fa(d.free - d.subtotal)} تومان خرید بیشتر، ارسال رایگان می‌شود.</span></div>` : ''}
    <div class="tot"><span>مبلغ قابل پرداخت</span><span class="metal">${toman(d.total)}</span></div></div>`;
}

route(/^\/cart$/, async () => {
  const d = await cartData();
  if (!d.lines.length) return ['bag', `<div class="wrap page"><div class="empty"><b>سبد خرید خالی است</b>محصولات را ببینید و به سبد اضافه کنید.<div style="margin-top:14px"><a class="btn primary" href="#/products">مشاهده محصولات</a></div></div></div>`];
  return ['bag', `<div class="wrap page"><h1>سبد خرید</h1>
    ${d.changed ? '<div class="notice bad" style="margin-bottom:12px">موجودی یا وضعیت بعضی کالاها تغییر کرده و سبد به‌روزرسانی شد.</div>' : ''}
    <div class="two"><div class="card">${d.lines.map((l) => `<div class="line"><a class="t" href="#/p/${l.id}">${img0(l) ? `<img src="${img0(l)}" alt="">` : ''}</a>
      <div><a href="#/p/${l.id}"><b>${esc(l.name)}</b></a><div class="price">${toman(l.price)}</div>
      <div class="row" style="align-items:center;margin-top:6px"><div class="qty" style="flex:0 0 auto"><button data-act="cq" data-id="${l.id}" data-d="-1">−</button><span>${fa(l.qty)}</span><button data-act="cq" data-id="${l.id}" data-d="1" data-max="${l.stock}">+</button></div>
      <button class="btn sm danger" style="flex:0 0 auto;min-width:0" data-act="rm" data-id="${l.id}">حذف</button></div></div></div>`).join('')}</div>
    <div class="card" style="align-self:start">${summary(d)}<a class="btn primary block" style="margin-top:14px" href="#/checkout">ادامه و ثبت سفارش</a></div></div></div>`];
}, 'bag');

route(/^\/checkout$/, async () => {
  if (!S.user) { sessionStorage.setItem('next', '#/checkout'); return go('#/login'), ['bag', loading()]; }
  const d = await cartData();
  if (!d.lines.length) return go('#/cart'), ['bag', loading()];
  const u = S.user;
  return ['bag', `<div class="wrap page"><h1>ثبت سفارش</h1><div class="two rev">
    <form class="card" data-form="order"><h3>مشخصات تحویل‌گیرنده</h3>
      <label class="field"><span>نام و نام خانوادگی</span><input type="text" name="name" required value="${esc(u.name)}" autocomplete="name"></label>
      <label class="field"><span>شماره موبایل</span><input type="tel" name="phone" required value="${esc(u.phone || '')}" class="ltr" inputmode="tel" autocomplete="tel" placeholder="09123456789"></label>
      <div class="row"><label class="field"><span>استان</span><input type="text" name="province" required value="${esc(u.province)}"></label><label class="field"><span>شهر</span><input type="text" name="city" required value="${esc(u.city)}"></label></div>
      <label class="field"><span>آدرس کامل</span><textarea name="address" required>${esc(u.address)}</textarea></label>
      <label class="field"><span>کد پستی (اختیاری)</span><input type="text" name="postal_code" value="${esc(u.postal_code)}" class="ltr" inputmode="numeric" maxlength="10"></label>
      <label class="field"><span>توضیحات سفارش (اختیاری)</span><textarea name="note" style="min-height:60px"></textarea></label>
      <div class="err" id="ferr"></div><button class="btn primary block" type="submit">ثبت نهایی سفارش</button></form>
    <div class="card" style="align-self:start"><h3>خلاصه سفارش</h3>${d.lines.map((l) => `<div class="sum"><div><span>${esc(l.name)} × ${fa(l.qty)}</span><span>${fa(l.price * l.qty)}</span></div></div>`).join('')}<hr style="border-color:var(--line)">${summary(d)}
      <p class="small muted">${esc(S.cfg.payment_info)}</p></div></div></div>`];
}, 'bag');

route(/^\/done\/([A-Z0-9-]+)$/, async (m) => {
  const o = await api('/orders/' + m[1]);
  return ['bag', `<div class="wrap page" style="max-width:640px"><div class="card center stack"><h1 class="metal">سفارش شما ثبت شد</h1>
    <div>کد رهگیری:</div><div style="font-size:1.8rem;font-weight:800;letter-spacing:2px" dir="ltr">${esc(o.code)}</div>
    <div>مبلغ کل: <b>${toman(o.total)}</b></div>
    <div class="notice" style="text-align:start">${esc(S.cfg.payment_info)}</div>
    <div class="small muted">مالک فروشگاه سفارش را بررسی می‌کند و وضعیت آن را در همین سایت می‌توانید ببینید.</div>
    <div class="row"><a class="btn primary" href="#/order/${esc(o.code)}">پیگیری سفارش</a><a class="btn" href="#/products">ادامه خرید</a></div></div></div>`];
}, 'bag');

function timeline(events) {
  return `<ul class="tl">${events.map((e) => `<li><b>${esc(S.cfg.statuses[e.status] || e.status)}</b> <span class="muted small">${dateFa(e.created_at)}</span>${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}</li>`).join('')}</ul>`;
}
const stBadge = (s) => `<span class="st ${s}">${esc(S.cfg.statuses[s] || s)}</span>`;

route(/^\/order\/([A-Z0-9-]+)$/, async (m) => {
  if (!S.user) { sessionStorage.setItem('next', '#' + curPath()); return go('#/login'), ['bag', loading()]; }
  const o = await api('/orders/' + m[1]);
  return ['user', `<div class="wrap page" style="max-width:760px"><div class="pagehead"><h1 dir="ltr">${esc(o.code)}</h1>${stBadge(o.status)}</div>
    <div class="card stack"><div class="muted small">ثبت: ${dateFa(o.created_at)}</div>
      <div>${o.items.map((i) => `<div class="sum"><div><span>${esc(i.name)} × ${fa(i.qty)}</span><span>${fa(i.price * i.qty)} تومان</span></div></div>`).join('')}</div>
      <div class="sum"><div><span>جمع کالاها</span><span>${fa(o.subtotal)}</span></div><div><span>ارسال</span><span>${o.shipping ? fa(o.shipping) : 'رایگان'}</span></div><div class="tot"><span>مبلغ کل</span><span>${toman(o.total)}</span></div></div></div>
    <div class="card" style="margin-top:14px"><h3>تحویل‌گیرنده</h3><div>${esc(o.name)} — <span dir="ltr">${esc(o.phone)}</span></div><div class="muted">${esc(o.province)}، ${esc(o.city)}، ${esc(o.address)}</div></div>
    <div class="card" style="margin-top:14px"><h3>روند سفارش</h3>${timeline(o.events)}</div>
    ${o.status === 'pending' ? `<button class="btn danger" style="margin-top:14px" data-act="cancel" data-code="${esc(o.code)}">لغو سفارش</button>` : ''}</div>`];
}, 'user');

route(/^\/track$/, async () => ['track', `<div class="wrap page" style="max-width:520px"><h1>پیگیری سفارش</h1><p class="muted">کد رهگیری و شماره موبایلی که با آن سفارش داده‌اید را وارد کنید. نیازی به ورود نیست.</p>
  <form class="card" data-form="track"><label class="field"><span>کد رهگیری</span><input type="text" name="code" class="ltr" placeholder="KA-XXXXXXX" required></label>
  <label class="field"><span>شماره موبایل</span><input type="tel" name="phone" class="ltr" required></label><div class="err" id="ferr"></div>
  <button class="btn primary block">پیگیری</button></form><div id="tres" style="margin-top:14px"></div></div>`], 'track');

route(/^\/contact$/, async () => ['contact', `<div class="wrap page" style="max-width:640px"><h1>تماس با ما و ثبت سفارش</h1>
  <div class="card stack">${contactLinks(S.cfg)}<div class="muted small">تجربه‌ای مطمئن از خرید؛ همراه با پاسخ‌گویی و پشتیبانی. مشتاقانه منتظر سفارش شما هستیم.</div></div></div>`], 'contact');

/* حساب کاربری */
route(/^\/login$/, async () => {
  if (S.user) return go('#/account'), ['user', loading()];
  const gid = S.cfg.googleClientId;
  setTimeout(() => { if (gid) loadGoogle(gid); }, 0);
  return ['user', `<div class="wrap page" style="max-width:460px"><div class="card stack"><h1 class="sr">ورود به حساب کاربری</h1>
    <div class="tabs" style="margin:0"><a href="#/login" class="on">ورود</a><a href="#/register">ثبت‌نام</a></div>
    <form data-form="login"><label class="field"><span>شماره موبایل یا ایمیل</span><input type="text" name="id" class="ltr" required autocomplete="username"></label>
    <label class="field"><span>رمز عبور</span><input type="password" name="password" class="ltr" required autocomplete="current-password"></label>
    <div class="err" id="ferr"></div><button class="btn primary block">ورود</button></form>
    ${gid ? '<div class="center muted small">یا</div><div id="gbtn" class="center" style="min-height:44px"></div>' : ''}
  </div></div>`];
}, 'user');

route(/^\/register$/, async () => {
  if (S.user) return go('#/account'), ['user', loading()];
  const gid = S.cfg.googleClientId;
  setTimeout(() => { if (gid) loadGoogle(gid); }, 0);
  return ['user', `<div class="wrap page" style="max-width:460px"><div class="card stack"><h1 class="sr">ساخت حساب کاربری</h1>
    <div class="tabs" style="margin:0"><a href="#/login">ورود</a><a href="#/register" class="on">ثبت‌نام</a></div>
    <form data-form="register"><label class="field"><span>نام و نام خانوادگی</span><input type="text" name="name" required autocomplete="name"></label>
    <label class="field"><span>شماره موبایل</span><input type="tel" name="phone" class="ltr" required autocomplete="tel" placeholder="09123456789"></label>
    <label class="field"><span>رمز عبور (حداقل ۸ کاراکتر)</span><input type="password" name="password" class="ltr" minlength="8" required autocomplete="new-password"></label>
    <div class="err" id="ferr"></div><button class="btn primary block">ساخت حساب</button></form>
    ${gid ? '<div class="center muted small">یا</div><div id="gbtn" class="center" style="min-height:44px"></div>' : ''}
  </div></div>`];
}, 'user');

function loadGoogle(cid) {
  // اگر گوگل در دسترس نباشد (مثلاً اینترنت بین‌الملل قطع باشد) دکمه نمایش داده نمی‌شود و ورود با موبایل/رمز کار می‌کند.
  const done = () => { const el = $('#gbtn'); if (!el || !window.google) return; google.accounts.id.initialize({ client_id: cid, callback: async (r) => { try { const d = await api('/auth/google', { method: 'POST', body: { credential: r.credential } }); S.user = d.user; afterLogin(); } catch (e) { toast(e.message, true); } } }); google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'continue_with', locale: 'fa' }); };
  if (window.google) return done();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = done;
  s.onerror = () => { const el = $('#gbtn'); if (el) el.innerHTML = '<span class="small muted">ورود با گوگل در این شبکه در دسترس نیست؛ با موبایل و رمز عبور وارد شوید.</span>'; };
  document.head.appendChild(s);
}
function afterLogin() {
  const n = sessionStorage.getItem('next'); sessionStorage.removeItem('next');
  go(n || '#/account'); render();
}

route(/^\/account$/, async () => {
  if (!S.user) return go('#/login'), ['user', loading()];
  const [orders] = await Promise.all([api('/orders')]);
  const u = S.user;
  return ['user', `<div class="wrap page"><div class="pagehead"><h1>حساب من</h1><button class="btn sm" data-act="logout">خروج</button></div><div class="two">
    <div class="card"><h3>سفارش‌های من</h3>${orders.length ? `<div class="olist">${orders.map((o) => `<a href="#/order/${esc(o.code)}"><span dir="ltr"><b>${esc(o.code)}</b></span><span class="muted small">${dateFa(o.created_at)}</span><span>${fa(o.total)} تومان</span>${stBadge(o.status)}</a>`).join('')}</div>` : '<div class="empty">هنوز سفارشی ثبت نکرده‌اید.</div>'}</div>
    <form class="card" data-form="profile"><h3>اطلاعات حساب</h3>
      <label class="field"><span>نام</span><input type="text" name="name" required value="${esc(u.name)}"></label>
      <label class="field"><span>موبایل</span><input type="tel" name="phone" class="ltr" value="${esc(u.phone || '')}"></label>
      ${u.email ? `<div class="small muted" style="margin-bottom:12px">ایمیل: <span dir="ltr">${esc(u.email)}</span></div>` : ''}
      <div class="row"><label class="field"><span>استان</span><input type="text" name="province" value="${esc(u.province)}"></label><label class="field"><span>شهر</span><input type="text" name="city" value="${esc(u.city)}"></label></div>
      <label class="field"><span>آدرس</span><textarea name="address" style="min-height:60px">${esc(u.address)}</textarea></label>
      <label class="field"><span>کد پستی</span><input type="text" name="postal_code" class="ltr" value="${esc(u.postal_code)}" maxlength="10"></label>
      <details style="margin-bottom:14px"><summary class="muted">تغییر رمز عبور</summary><div style="margin-top:10px">
        ${u.hasPassword ? '<label class="field"><span>رمز فعلی</span><input type="password" name="old_password" class="ltr"></label>' : ''}
        <label class="field"><span>رمز جدید</span><input type="password" name="new_password" class="ltr" minlength="8"></label></div></details>
      <div class="err" id="ferr"></div><button class="btn primary block">ذخیره</button></form></div></div>`];
}, 'user');

/* ---------- رویدادها ---------- */
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href]');
  if (a && !HASH_MODE && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !a.target && !a.hasAttribute('download')) {
    const h = a.getAttribute('href');
    if (h.startsWith('/') && !h.startsWith('//') && !/^\/(api|uploads|img|fonts|vendor)\//.test(h)) { e.preventDefault(); return go(h); }
  }
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a,button,input,select')) return go(row.dataset.href);
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = Number(t.dataset.id);
  if (act === 'thumb') { $('#pmain').src = t.src; $$('.thumbs img').forEach((i) => i.classList.toggle('on', i === t)); }
  else if (act === 'pq') { const el = $('#pq'); const max = Number(t.dataset.max) || 99; S.pdQty = Math.min(max, Math.max(1, S.pdQty + Number(t.dataset.d))); el.textContent = fa(S.pdQty); }
  else if (act === 'add') {
    const max = Number(t.dataset.max); const ex = S.cart.find((i) => i.id === id);
    const q = (ex ? ex.qty : 0) + S.pdQty;
    if (q > max) return toast(`حداکثر ${fa(max)} عدد موجود است`, true);
    if (ex) ex.qty = q; else S.cart.push({ id, qty: S.pdQty });
    saveCart(); toast('به سبد خرید اضافه شد'); render(true);
  } else if (act === 'cq') {
    const it = S.cart.find((i) => i.id === id); if (!it) return;
    const q = it.qty + Number(t.dataset.d), max = Number(t.dataset.max);
    if (q < 1) return; if (q > max) return toast(`حداکثر ${fa(max)} عدد موجود است`, true);
    it.qty = q; saveCart(); render(true);
  } else if (act === 'rm') { S.cart = S.cart.filter((i) => i.id !== id); saveCart(); render(true); }
  else if (act === 'logout') { await api('/auth/logout', { method: 'POST' }); S.user = null; go('#/'); render(); }
  else if (act === 'cancel') { if (!confirm('سفارش لغو شود؟')) return; try { await api(`/orders/${t.dataset.code}/cancel`, { method: 'POST' }); toast('سفارش لغو شد'); render(true); } catch (er) { toast(er.message, true); } }
  else if (window.adminClick) window.adminClick(t, act, e);
});
document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-act="sort"]');
  if (t) { const p = new URLSearchParams(curRoute()[1]); p.set('sort', t.value); p.delete('page'); go('#/products?' + p); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const kind = f.dataset.form, fd = Object.fromEntries(new FormData(f));
  const errEl = $('#ferr', f), btn = $('button[type=submit],button:not([type])', f);
  const setErr = (m) => { if (errEl) errEl.textContent = m || ''; };
  if (kind === 'search') { return go('#/products?q=' + encodeURIComponent(fd.q || '')); }
  if (window.adminSubmit && kind.startsWith('a-')) return window.adminSubmit(f, kind, fd, e);
  setErr(''); if (btn) btn.disabled = true;
  try {
    if (kind === 'login') { S.user = (await api('/auth/login', { method: 'POST', body: fd })).user; afterLogin(); }
    else if (kind === 'register') { S.user = (await api('/auth/register', { method: 'POST', body: fd })).user; afterLogin(); }
    else if (kind === 'profile') { S.user = (await api('/me', { method: 'PUT', body: fd })).user; toast('ذخیره شد'); render(true); }
    else if (kind === 'order') {
      const o = await api('/orders', { method: 'POST', body: { ...fd, items: S.cart } });
      S.cart = []; saveCart(); go('#/done/' + o.code);
    } else if (kind === 'track') {
      const d = await api('/track', { method: 'POST', body: fd });
      $('#tres').innerHTML = `<div class="card"><div class="pagehead"><b dir="ltr">${esc(d.code)}</b>${stBadge(d.status)}</div><div class="small muted">${d.items.map((i) => `${esc(i.name)} × ${fa(i.qty)}`).join('، ')}</div><div style="margin:8px 0">مبلغ: ${toman(d.total)}</div>${timeline(d.events)}</div>`;
    }
  } catch (er) {
    setErr(er.message);
    if (kind === 'order' && er.status === 409) { toast(er.message, true); render(true); }
  } finally { if (btn) btn.disabled = false; }
});

/* ---------- مسیریابی ---------- */
let renderSeq = 0;
async function render(keepScroll) {
  const seq = ++renderSeq;
  const [path, query] = curRoute();
  const qs = new URLSearchParams(query || '');
  if (path.startsWith('/admin')) {
    if (!isStaff()) { $('#app').innerHTML = shell('<div class="wrap page"><div class="empty"><b>دسترسی ندارید</b><a class="btn" href="#/login">ورود مدیر</a></div></div>', ''); return; }
    if (!window.renderAdmin) { await new Promise((r) => { const s = document.createElement('script'); s.src = 'admin.js?v=2'; s.onload = r; s.onerror = r; document.head.appendChild(s); }); }
    if (seq !== renderSeq) return;
    try { const [tab, html] = await window.renderAdmin(path, qs); if (seq === renderSeq) { $('#app').innerHTML = shell(html, tab); window.adminAfter && window.adminAfter(path); window.fx && fx.enter(keepScroll); } } catch (e) { $('#app').innerHTML = shell(fail(e), ''); }
    return;
  }
  let hit = null;
  for (const [re, fn] of R) { const m = re.exec(path); if (m) { hit = [m, fn]; break; } }
  const y = window.scrollY;
  if (!keepScroll) $('#app').innerHTML = shell(loading(), '');
  try {
    if (!hit) throw Object.assign(new Error('صفحه پیدا نشد'), { status: 404 });
    const out = await hit[1](hit[0], qs);
    if (seq !== renderSeq) return;
    const [tab, html] = out;
    $('#app').innerHTML = shell(html, tab);
    setMeta(path, { ...defaultMeta(path), ...(PM || {}) }, PRIVATE.test(path)); PM = null;
    window.scrollTo(0, keepScroll ? y : 0);
    window.fx && fx.enter(keepScroll);
  } catch (e) { PM = null; if (seq === renderSeq) { const nf = e.status === 404; $('#app').innerHTML = shell(nf ? notFound() : fail(e), ''); setMeta(path, nf ? { title: 'صفحه پیدا نشد | ' + S.cfg.shop_name, desc: '' } : defaultMeta(path), true); } }
}
window.addEventListener('hashchange', () => { if (HASH_MODE || location.hash.startsWith('#/')) render(); });
window.addEventListener('popstate', () => { if (!HASH_MODE) render(); });

(async function init() {
  try {
    const [cfg, me] = await Promise.all([api('/config'), api('/me')]);
    S.cfg = cfg; S.user = me.user;
  } catch (e) {
    $('#app').innerHTML = `<div class="wrap page"><div class="empty"><b>اتصال به سرور برقرار نیست</b>${esc(e.message)}<div style="margin-top:14px"><a class="btn" href="/">تلاش دوباره</a></div></div></div>`;
    return;
  }
  await Promise.race([window.fxReady || 0, new Promise((r) => setTimeout(r, 1200))]);
  render();
  if ('serviceWorker' in navigator && !window.__PREVIEW__) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
Object.assign(window, { curPath, S, api, esc, fa, toman, dateFa, toast, go, render, svg, stBadge, toEn, $, $$ });
