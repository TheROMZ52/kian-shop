'use strict';
// ساخت نسخه نمایشی ایستا (برای GitHub Pages): node preview/build.js  →  پوشه dist/
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
fs.rmSync(path.join(dist, 'sw.js'), { force: true });
fs.copyFileSync(path.join(__dirname, 'shim.js'), path.join(dist, 'preview-shim.js'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

const idx = path.join(dist, 'index.html');
let html = fs.readFileSync(path.join(root, 'views', 'index.html'), 'utf8');
if (!html.includes('<script defer src="fx.js')) throw new Error('index.html: تگ fx.js پیدا نشد');
html = html.replace('<script defer src="fx.js', '<script src="preview-shim.js"></script>\n<script defer src="fx.js');
html = html.replace('content="index,follow"', 'content="noindex,nofollow"'); // نسخه نمایشی نباید ایندکس شود
html = html.replace('<title>', '<title>[Preview] ');
fs.writeFileSync(idx, html);

// تصاویر نمونه (SVG ساده، بدون وابستگی)
const bg = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2b30"/><stop offset="1" stop-color="#0b0b0d"/></linearGradient><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f5f7"/><stop offset=".45" stop-color="#9ea3ac"/><stop offset=".7" stop-color="#e6e8ec"/><stop offset="1" stop-color="#6f737b"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/>';
const wrap = (b) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">${bg}${b}</svg>`;
const art = {
  'demo-belt-1.svg': wrap('<path d="M60 300c0-24 14-40 40-40h400c26 0 40 16 40 40s-14 40-40 40H100c-26 0-40-16-40-40z" fill="#3a2a1d" stroke="#6b5036" stroke-width="4"/><g stroke="#8a6a48" stroke-dasharray="10 8" stroke-width="3" fill="none"><path d="M80 282h440M80 318h440"/></g><rect x="235" y="238" width="130" height="124" rx="14" fill="none" stroke="url(#m)" stroke-width="16"/><rect x="292" y="268" width="16" height="64" rx="6" fill="url(#m)"/>'),
  'demo-belt-2.svg': wrap('<path d="M60 300c0-24 14-40 40-40h400c26 0 40 16 40 40s-14 40-40 40H100c-26 0-40-16-40-40z" fill="#111" stroke="#444" stroke-width="4"/><rect x="230" y="236" width="140" height="128" rx="10" fill="url(#m)"/><rect x="258" y="262" width="84" height="76" rx="6" fill="#0d0d0f"/>'),
  'demo-bag-1.svg': wrap('<path d="M200 230c0-70 40-110 100-110s100 40 100 110" fill="none" stroke="url(#m)" stroke-width="14" stroke-linecap="round"/><path d="M130 230h340l24 250c1 12-8 22-20 22H126c-12 0-21-10-20-22z" fill="#17171a" stroke="#555" stroke-width="4"/><path d="M130 300h340" stroke="#444" stroke-width="3"/><circle cx="300" cy="300" r="16" fill="url(#m)"/>'),
  'demo-bag-2.svg': wrap('<path d="M240 190v-30c0-14 10-24 24-24h72c14 0 24 10 24 24v30" fill="none" stroke="url(#m)" stroke-width="12"/><rect x="100" y="190" width="400" height="290" rx="26" fill="#17171a" stroke="#555" stroke-width="4"/><path d="M100 290h400" stroke="#444" stroke-width="3"/><rect x="270" y="270" width="60" height="44" rx="8" fill="url(#m)"/>'),
  'demo-ring-1.svg': wrap('<circle cx="300" cy="300" r="150" fill="none" stroke="url(#m)" stroke-width="30"/><circle cx="300" cy="300" r="112" fill="none" stroke="#0b0b0d" stroke-width="3" opacity=".6"/><path d="M420 160l30-40 30 40-30 20z" fill="url(#m)"/>'),
};
fs.mkdirSync(path.join(dist, 'uploads'), { recursive: true });
for (const [n, s] of Object.entries(art)) fs.writeFileSync(path.join(dist, 'uploads', n), s);
console.log('preview ساخته شد →', dist);
