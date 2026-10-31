'use strict';
const EventEmitter = require('events');
const D = require('./db');
const { now, err, normPhone, str, orderCode } = require('./util');

const events = new EventEmitter();
events.on('error', () => {});

const FLOW = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['preparing', 'shipped', 'rejected', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [], rejected: [], cancelled: [],
};
const LABELS = {
  pending: 'در انتظار بررسی', confirmed: 'تأیید شده', preparing: 'در حال آماده‌سازی',
  shipped: 'ارسال شد', delivered: 'تحویل داده شد', rejected: 'رد شده', cancelled: 'لغو شده',
};

async function getOrder(id) {
  const o = await D.get('SELECT * FROM orders WHERE id=?', id);
  if (!o) return null;
  [o.items, o.events] = await Promise.all([
    D.all('SELECT product_id,name,price,qty FROM order_items WHERE order_id=? ORDER BY id', id),
    D.all('SELECT status,note,actor,created_at FROM order_events WHERE order_id=? ORDER BY id', id),
  ]);
  return o;
}

async function createOrder(user, body) {
  const raw = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const want = new Map();
  for (const it of raw) {
    const id = Number(it && it.id), qty = Number(it && it.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) throw err(400, 'اطلاعات سبد خرید نامعتبر است');
    want.set(id, (want.get(id) || 0) + qty);
  }
  if (!want.size) throw err(400, 'سبد خرید خالی است');

  const name = str(body.name, 80), phone = normPhone(body.phone), province = str(body.province, 60),
    city = str(body.city, 60), address = str(body.address, 400), postal = str(body.postal_code, 10).replace(/\D/g, ''),
    note = str(body.note, 500);
  if (name.length < 2) throw err(400, 'نام و نام خانوادگی را وارد کنید');
  if (!phone) throw err(400, 'شماره موبایل معتبر نیست (مثال: 09123456789)');
  if (!province || !city) throw err(400, 'استان و شهر را وارد کنید');
  if (address.length < 10) throw err(400, 'آدرس کامل‌تر وارد کنید');
  if (postal && postal.length !== 10) throw err(400, 'کد پستی باید ۱۰ رقم باشد');

  const ids = [...want.keys()];
  const [s, prods] = await Promise.all([
    D.settings(),
    D.all(`SELECT id,name,price,stock,active FROM products WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids),
  ]);
  const shipCost = Math.max(0, parseInt(s.shipping_cost, 10) || 0);
  const freeOver = Math.max(0, parseInt(s.free_shipping_over, 10) || 0);

  let subtotal = 0;
  const lines = [];
  for (const [pid, qty] of want) {
    const p = prods.find((x) => x.id === pid);
    if (!p || !p.active) throw err(409, 'یکی از محصولات سبد دیگر موجود نیست');
    if (p.stock < qty) throw err(409, `موجودی «${p.name}» کافی نیست (موجود: ${p.stock})`);
    subtotal += p.price * qty;
    lines.push({ p, qty });
  }
  const shipping = freeOver && subtotal >= freeOver ? 0 : shipCost;
  const total = subtotal + shipping;
  const code = orderCode();
  const t = now();

  // همه در یک تراکنش اتمیک: کم‌کردن موجودی (با شرط کافی‌بودن و ثابت‌ماندن قیمت) + ثبت سفارش، اقلام و تاریخچه
  const ops = [
    ...lines.map(({ p, qty }) => ({ sql: 'UPDATE products SET stock=stock-? WHERE id=? AND stock>=? AND price=? AND active=1', params: [qty, p.id, qty, p.price], min: 1, msg: `موجودی یا قیمت «${p.name}» هم‌اکنون تغییر کرد؛ سبد را دوباره بررسی کنید` })),
    { sql: `INSERT INTO orders(code,user_id,name,phone,province,city,address,postal_code,note,subtotal,shipping,total,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`, params: [code, user.id, name, phone, province, city, address, postal, note, subtotal, shipping, total, t, t] },
    ...lines.map(({ p, qty }) => ({ sql: 'INSERT INTO order_items(order_id,product_id,name,price,qty) VALUES((SELECT id FROM orders WHERE code=?),?,?,?,?)', params: [code, p.id, p.name, p.price, qty] })),
    { sql: 'INSERT INTO order_events(order_id,status,note,actor,created_at) VALUES((SELECT id FROM orders WHERE code=?),?,?,?,?)', params: [code, 'pending', 'سفارش ثبت شد', 'customer', t] },
  ];
  await D.batch(ops);

  // ذخیره آدرس برای دفعه بعد (غیرحیاتی)
  try {
    const taken = !user.phone && (await D.get('SELECT 1 x FROM users WHERE phone=? AND id<>?', phone, user.id));
    await D.run('UPDATE users SET name=?,phone=?,province=?,city=?,address=?,postal_code=? WHERE id=?', user.name || name, user.phone || (taken ? null : phone), province, city, address, postal, user.id);
  } catch (e) { /* ignore */ }

  const row = await D.get('SELECT id FROM orders WHERE code=?', code);
  const full = await getOrder(row.id);
  events.emit('created', full);
  return full;
}

async function setStatus(id, status, { note = '', actor = 'system' } = {}) {
  if (!FLOW[status]) throw err(400, 'وضعیت نامعتبر است');
  const o = await D.get('SELECT * FROM orders WHERE id=?', id);
  if (!o) throw err(404, 'سفارش پیدا نشد');
  if (o.status === status) return getOrder(id);
  if (!FLOW[o.status].includes(status)) throw err(409, `تغییر از «${LABELS[o.status]}» به «${LABELS[status]}» مجاز نیست`);
  const t = now();
  const ops = [{ sql: 'UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=?', params: [status, t, id, o.status], min: 1, msg: 'وضعیت سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید' }];
  if (status === 'rejected' || status === 'cancelled') {
    for (const it of await D.all('SELECT product_id,qty FROM order_items WHERE order_id=?', id)) {
      if (it.product_id) ops.push({ sql: 'UPDATE products SET stock=stock+? WHERE id=?', params: [it.qty, it.product_id] });
    }
  }
  ops.push({ sql: 'INSERT INTO order_events(order_id,status,note,actor,created_at) VALUES(?,?,?,?,?)', params: [id, status, str(note, 300), str(actor, 60), t] });
  await D.batch(ops);
  const full = await getOrder(id);
  events.emit('status', { order: full, actor, note });
  return full;
}

module.exports = { events, FLOW, LABELS, getOrder, createOrder, setStatus };
