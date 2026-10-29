'use strict';
const crypto = require('crypto');

const now = () => Math.floor(Date.now() / 1000);
const err = (status, message) => Object.assign(new Error(message), { status });

function toEnDigits(s) {
  return String(s ?? '')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// تبدیل شماره موبایل به قالب 09xxxxxxxxx؛ در صورت نامعتبر بودن null
function normPhone(s) {
  let p = toEnDigits(s).replace(/[\s\-()]/g, '');
  if (p.startsWith('+98')) p = '0' + p.slice(3);
  else if (p.startsWith('0098')) p = '0' + p.slice(4);
  else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
  else if (/^9\d{9}$/.test(p)) p = '0' + p;
  return /^09\d{9}$/.test(p) ? p : null;
}

const str = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const intOrNull = (v) => { if (v === '' || v == null) return null; const n = Number(toEnDigits(v)); return Number.isFinite(n) ? Math.trunc(n) : NaN; };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// کد رهگیری: بدون حروف/اعداد مشابه (0,O,1,I)
function orderCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(7)) s += A[b % A.length];
  return 'KA-' + s;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

module.exports = { now, err, toEnDigits, normPhone, str, intOrNull, sha256, orderCode, esc };
