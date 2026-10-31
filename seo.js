'use strict';
// سئو: متا و داده ساختاریافته سمت سرور، robots.txt، sitemap.xml، llms.txt و ۴۰۴ واقعی.
// اپلیکیشن کلاینت همچنان صفحه را کامل رندر می‌کند؛ این ماژول برای خزنده‌ها و پیش‌نمایش لینک (تلگرام، روبیکا، گوگل) است.
const fs = require('fs');
const path = require('path');
const D = require('./db');

const INDEX = path.join(__dirname, 'views', 'index.html');
let tplCache = null;
const tpl = () => (process.env.NODE_ENV === 'production' && tplCache) || (tplCache = fs.readFileSync(INDEX, 'utf8'));

const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
const eh = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trunc = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const siteBase = (req) => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const fa = (n) => Number(n).toLocaleString('fa-IR');
const jsonld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const imgUrl = (B, p) => { const i = JSON.parse(p.images || '[]')[0]; return B + (i ? '/uploads/' + i : '/img/logo.jpg'); };

const PRIVATE = /^\/(cart|checkout|account|login|register|order|done|track|admin)(\/|$)/;
const STATIC_OK = new Set(['/', '/products', '/contact']);

function storeLd(B, s) {
  const sameAs = [];
  const ig = (s.instagram || '').replace(/^@/, '');
  if (ig) sameAs.push('https://instagram.com/' + ig);
  if (s.telegram_link) sameAs.push(s.telegram_link.split('?')[0]);
  const o = {
    '@context': 'https://schema.org', '@type': 'Store', '@id': B + '/#store', name: s.shop_name, description: s.tagline, url: B + '/',
    image: B + '/img/logo.jpg', logo: B + '/img/logo.jpg', telephone: s.owner_phone, areaServed: 'IR', currenciesAccepted: 'IRR', sameAs,
  };
  if (s.business_address || s.business_city) o.address = { '@type': 'PostalAddress', addressCountry: 'IR', addressLocality: s.business_city || undefined, streetAddress: s.business_address || undefined };
  return o;
}
const websiteLd = (B, s) => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': B + '/#website', url: B + '/', name: s.shop_name, inLanguage: 'fa-IR',
  potentialAction: { '@type': 'SearchAction', target: B + '/products?q={search_term_string}', 'query-input': 'required name=search_term_string' },
});
const crumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })) });

const productList = (rows) => `<ul>${rows.map((p) => `<li><a href="/p/${p.id}">${eh(p.name)}</a> — ${fa(p.price)} تومان${p.stock > 0 ? '' : ' (ناموجود)'}</li>`).join('')}</ul>`;

async function resolve(req) {
  const [s, cats] = await Promise.all([D.settings(), D.all('SELECT c.id,c.name FROM categories c ORDER BY sort,id')]);
  const B = siteBase(req);
  const p = req.path.replace(/\/+$/, '') || '/';
  const name = s.shop_name;
  const r = { s, status: 200, robots: 'index,follow', og: 'website', ld: [], body: '', image: B + '/img/logo.jpg' };
  const catLinks = `<nav>${cats.map((c) => `<a href="/products?category=${c.id}">${eh(c.name)}</a>`).join(' · ')}</nav>`;

  if (p === '/') {
    r.title = `${name} | ${s.tagline}`;
    r.desc = `${name}؛ ${s.tagline}. خرید آنلاین، ثبت سفارش چندمحصولی، پیگیری با کد رهگیری و ارتباط مستقیم با مالک.`;
    r.canonical = B + '/';
    r.ld = [storeLd(B, s), websiteLd(B, s)];
    const latest = await D.all('SELECT id,name,price,stock FROM products WHERE active=1 ORDER BY id DESC LIMIT 12');
    r.body = `<h1>${eh(name)}</h1><p>${eh(s.tagline)}</p>${catLinks}${latest.length ? `<h2>جدیدترین محصولات</h2>${productList(latest)}` : ''}`;
    return r;
  }

  if (p === '/products') {
    const cid = parseInt(req.query.category, 10) || null;
    const cat = cid && cats.find((c) => c.id === cid);
    const filtered = req.query.q || req.query.sort || req.query.page;
    r.title = `${cat ? cat.name + ' — ' : ''}${req.query.q ? 'جست‌وجوی «' + trunc(req.query.q, 40) + '»' : 'محصولات'} | ${name}`;
    r.desc = cat ? `خرید ${cat.name} از ${name}؛ مشاهده قیمت و موجودی.` : `همه محصولات ${name}: کمربند، کیف و اکسسوری.`;
    r.canonical = B + '/products' + (cat ? `?category=${cat.id}` : '');
    if (filtered) r.robots = 'noindex,follow';
    const rows = cat ? await D.all('SELECT id,name,price,stock FROM products WHERE active=1 AND category_id=? ORDER BY id DESC LIMIT 60', cat.id) : await D.all('SELECT id,name,price,stock FROM products WHERE active=1 ORDER BY id DESC LIMIT 60');
    r.ld = [crumbLd([['خانه', B + '/'], ['محصولات', B + '/products'], ...(cat ? [[cat.name, r.canonical]] : [])])];
    r.body = `<h1>${eh(cat ? cat.name : 'محصولات')}</h1>${catLinks}${rows.length ? productList(rows) : '<p>هنوز محصولی ثبت نشده است.</p>'}`;
    return r;
  }

  const m = /^\/p\/(\d+)$/.exec(p);
  if (m) {
    const pr = await D.get('SELECT p.*,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1', m[1]);
    if (!pr) return { ...r, status: 404, robots: 'noindex,nofollow', title: `محصول پیدا نشد | ${name}`, desc: '', canonical: null, body: '<h1>محصول پیدا نشد</h1><p><a href="/products">مشاهده همه محصولات</a></p>' };
    const url = `${B}/p/${pr.id}`;
    const imgs = JSON.parse(pr.images || '[]').map((i) => `${B}/uploads/${i}`);
    r.title = `${pr.name} | ${name}`;
    r.desc = trunc(pr.description || `خرید ${pr.name} از ${name}`, 155);
    r.canonical = url; r.og = 'product'; r.image = imgUrl(B, pr);
    const offer = { '@type': 'Offer', url, priceCurrency: 'IRR', price: pr.price * 10, availability: pr.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name } };
    r.ld = [
      { '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product', name: pr.name, description: trunc(pr.description || pr.name, 500), sku: String(pr.id), category: pr.category || undefined, image: imgs.length ? imgs : [B + '/img/logo.jpg'], offers: offer },
      crumbLd([['خانه', B + '/'], ['محصولات', B + '/products'], ...(pr.category ? [[pr.category, `${B}/products?category=${pr.category_id}`]] : []), [pr.name, url]]),
    ];
    r.body = `<nav><a href="/">خانه</a> › <a href="/products">محصولات</a>${pr.category ? ` › <a href="/products?category=${pr.category_id}">${eh(pr.category)}</a>` : ''}</nav><h1>${eh(pr.name)}</h1><p>قیمت: ${fa(pr.price)} تومان — ${pr.stock > 0 ? 'موجود' : 'ناموجود'}</p>${pr.description ? `<p>${eh(pr.description)}</p>` : ''}${imgs[0] ? `<img src="${eh(imgs[0])}" alt="${eh(pr.name)}" width="600" height="600">` : ''}`;
    return r;
  }

  if (p === '/contact') {
    r.title = `تماس با ما و ثبت سفارش | ${name}`;
    r.desc = `راه‌های ارتباط با ${name}: تلفن مالک، تلگرام و اینستاگرام.`;
    r.canonical = B + '/contact';
    r.ld = [storeLd(B, s), crumbLd([['خانه', B + '/'], ['تماس با ما', r.canonical]])];
    r.body = `<h1>تماس با ما و ثبت سفارش</h1><ul><li>تلفن مالک: ${eh(s.owner_phone)}</li><li>تلگرام: ${eh(s.admin_telegram)}</li><li>اینستاگرام: ${eh(s.instagram)}</li></ul>`;
    return r;
  }

  if (PRIVATE.test(p)) return { ...r, robots: 'noindex,nofollow', title: `${name}`, desc: '', canonical: null, body: `<h1>${eh(name)}</h1>` };
  return { ...r, status: 404, robots: 'noindex,nofollow', title: `صفحه پیدا نشد | ${name}`, desc: '', canonical: null, body: '<h1>صفحه پیدا نشد (۴۰۴)</h1><p><a href="/">صفحه اصلی</a> · <a href="/products">محصولات</a></p>' };
}

async function render(req, res) {
  const r = await resolve(req);
  const s = r.s;
  const B = siteBase(req);
  const head = [
    r.canonical ? `<link rel="canonical" href="${eh(r.canonical)}">` : '',
    `<meta property="og:type" content="${r.og}">`, `<meta property="og:site_name" content="${eh(s.shop_name)}">`, '<meta property="og:locale" content="fa_IR">',
    `<meta property="og:title" content="${eh(r.title)}">`, r.desc ? `<meta property="og:description" content="${eh(r.desc)}">` : '',
    r.canonical ? `<meta property="og:url" content="${eh(r.canonical)}">` : '', `<meta property="og:image" content="${eh(r.image || B + '/img/logo.jpg')}">`,
    '<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:title" content="${eh(r.title)}">`, r.desc ? `<meta name="twitter:description" content="${eh(r.desc)}">` : '',
    ...r.ld.map(jsonld),
  ].filter(Boolean).join('\n');

  let html = tpl()
    .replace(/<title>[^<]*<\/title>/, `<title>${eh(r.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${eh(r.desc)}">`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${r.robots}">`)
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">') // قبل از هر لینک نسبی
    .replace('</head>', head + '\n</head>')
    .replace(/<div id="app">([\s\S]*?)<\/div>(\s*<div id="toasts")/, (m0, inner, tail) => `<div id="app"><div class="wrap page ssr">${r.body}</div>${inner}</div>${tail}`);
  res.status(r.status).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-cache').send(html);
}

function mount(app) {
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send([
      'User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin', 'Disallow: /cart', 'Disallow: /checkout', 'Disallow: /account',
      'Disallow: /login', 'Disallow: /register', 'Disallow: /order/', 'Disallow: /done/', '', `Sitemap: ${siteBase(req)}/sitemap.xml`, '',
    ].join('\n'));
  });

  app.get('/sitemap.xml', wrap(async (req, res) => {
    const B = siteBase(req);
    const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
    const u = (loc, last, freq, pri) => `  <url><loc>${eh(loc)}</loc>${last ? `<lastmod>${last}</lastmod>` : ''}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
    const prods = await D.all('SELECT id,updated_at FROM products WHERE active=1 ORDER BY id');
    const cats = await D.all('SELECT id FROM categories ORDER BY sort,id');
    const newest = prods.reduce((a, p) => Math.max(a, p.updated_at), 0);
    const lines = [
      u(B + '/', newest && day(newest), 'daily', '1.0'), u(B + '/products', newest && day(newest), 'daily', '0.9'), u(B + '/contact', null, 'yearly', '0.5'),
      ...cats.map((c) => u(`${B}/products?category=${c.id}`, null, 'weekly', '0.7')),
      ...prods.map((p) => u(`${B}/p/${p.id}`, day(p.updated_at), 'weekly', '0.8')),
    ];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`);
  }));

  // llms.txt: خلاصه قابل‌خواندن برای مدل‌های زبانی
  app.get('/llms.txt', wrap(async (req, res) => {
    const B = siteBase(req); const s = await D.settings();
    const cats = await D.all('SELECT id,name FROM categories ORDER BY sort,id');
    const prods = await D.all('SELECT id,name,price,stock FROM products WHERE active=1 ORDER BY id DESC LIMIT 100');
    res.type('text/plain; charset=utf-8').send([
      `# ${s.shop_name}`, '', `> ${s.tagline}. فروشگاه اینترنتی فارسی؛ ثبت سفارش چندمحصولی، پیگیری با کد رهگیری. قیمت‌ها به تومان است.`, '',
      '## صفحات اصلی', `- [صفحه اصلی](${B}/)`, `- [همه محصولات](${B}/products)`, `- [تماس با ما](${B}/contact)`, `- [پیگیری سفارش](${B}/track)`, '',
      '## دسته‌بندی‌ها', ...cats.map((c) => `- [${c.name}](${B}/products?category=${c.id})`), '',
      '## محصولات', ...prods.map((p) => `- [${p.name}](${B}/p/${p.id}): ${p.price} تومان — ${p.stock > 0 ? 'موجود' : 'ناموجود'}`), '',
      '## ارتباط', `- تلفن مالک: ${s.owner_phone}`, `- تلگرام ادمین: ${s.admin_telegram}`, `- اینستاگرام: ${s.instagram}`, '',
      '## نکته', '- سفارش دادن نیازمند ورود/ثبت‌نام است؛ صفحات سبد، پرداخت و حساب برای ایندکس بسته‌اند.', '',
    ].join('\n'));
  }));
}

module.exports = { mount, render };
