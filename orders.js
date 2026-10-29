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

function getOrder(id) {
  const o = D.get('SELECT * FROM orders WHERE id=?', id);
  if (!o) return null;
  o.items = D.all('SELECT product_id,name,price,qty FROM order_items WHERE order_id=?', id);
  o.events = D.all('SELECT status,note,actor,created_at FROM order_events WHERE order_id=? ORDER BY id', id);
  return o;
}

function createOrder(user, body) {
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

  const s = D.settings();
  const shipCost = Math.max(0, parseInt(s.shipping_cost, 10) || 0);
  const freeOver = Math.max(0, parseInt(s.free_shipping_over, 10) || 0);

  const order = D.tx(() => {
    let subtotal = 0;
    const lines = [];
    for (const [pid, qty] of want) {
      const p = D.get('SELECT id,name,price,stock,active FROM products WHERE id=?', pid);
      if (!p || !p.active) throw err(409, 'یکی از محصولات سبد دیگر موجود نیست');
      const r = D.run('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?', qty, pid, qty);
      if (!r.changes) throw err(409, `موجودی «${p.name}» کافی نیست (موجود: ${p.stock})`);
      subtotal += p.price * qty;
      lines.push({ p, qty });
    }
    const shipping = freeOver && subtotal >= freeOver ? 0 : shipCost;
    const total = subtotal + shipping;
    let code, tries = 0;
    do { code = orderCode(); } while (D.get('SELECT 1 FROM orders WHERE code=?', code) && ++tries < 10);
    const t = now();
    const id = D.run(
      `INSERT INTO orders(code,user_id,name,phone,province,city,address,postal_code,note,subtotal,shipping,total,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
      code, user.id, name, phone, province, city, address, postal, note, subtotal, shipping, total, t, t).lastInsertRowid;
    for (const { p, qty } of lines) D.run('INSERT INTO order_items(order_id,product_id,name,price,qty) VALUES(?,?,?,?,?)', id, p.id, p.name, p.price, qty);
    D.run('INSERT INTO order_events(order_id,status,note,actor,created_at) VALUES(?,?,?,?,?)', id, 'pending', 'سفارش ثبت شد', 'customer', t);
    // آدرس را برای دفعه بعد در پروفایل ذخیره کن
    D.run(`UPDATE users SET name=CASE WHEN name='' THEN ? ELSE name END, phone=COALESCE(phone,(SELECT ? WHERE NOT EXISTS(SELECT 1 FROM users WHERE phone=?))),
           province=?, city=?, address=?, postal_code=? WHERE id=?`, name, phone, phone, province, city, address, postal, user.id);
    return id;
  });
  const full = getOrder(order);
  events.emit('created', full);
  return full;
}

function setStatus(id, status, { note = '', actor = 'system' } = {}) {
  if (!FLOW[status]) throw err(400, 'وضعیت نامعتبر است');
  const changed = D.tx(() => {
    const o = D.get('SELECT * FROM orders WHERE id=?', id);
    if (!o) throw err(404, 'سفارش پیدا نشد');
    if (o.status === status) return false;
    if (!FLOW[o.status].includes(status)) throw err(409, `تغییر از «${LABELS[o.status]}» به «${LABELS[status]}» مجاز نیست`);
    if (status === 'rejected' || status === 'cancelled') {
      for (const it of D.all('SELECT product_id,qty FROM order_items WHERE order_id=?', id)) {
        if (it.product_id) D.run('UPDATE products SET stock=stock+? WHERE id=?', it.qty, it.product_id);
      }
    }
    const t = now();
    D.run('UPDATE orders SET status=?,updated_at=? WHERE id=?', status, t, id);
    D.run('INSERT INTO order_events(order_id,status,note,actor,created_at) VALUES(?,?,?,?,?)', id, status, str(note, 300), str(actor, 60), t);
    return true;
  });
  const full = getOrder(id);
  if (changed) events.emit('status', { order: full, actor, note });
  return full;
}

module.exports = { events, FLOW, LABELS, getOrder, createOrder, setStatus };
