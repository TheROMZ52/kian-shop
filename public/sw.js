'use strict';
// سرویس‌ورکر ساده: مرور فروشگاه (صفحه‌ها، محصولات، دسته‌ها) در قطعی/ضعف شبکه هم کار کند.
// داده‌های خصوصی (حساب، سفارش‌ها، مدیریت) هرگز کش نمی‌شوند.
const CACHE = 'kian-v1';
const PUBLIC_API = ['/api/products', '/api/categories', '/api/config'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/style.css?v=1', '/app.js?v=1', '/img/logo.jpg', '/fonts/vazirmatn.woff2']).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') && !PUBLIC_API.some((p) => u.pathname === p || u.pathname.startsWith(p + '/'))) return;
  if (u.pathname.startsWith('/api/admin')) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
