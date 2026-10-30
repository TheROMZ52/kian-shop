'use strict';
/* پنل مدیریت — فقط برای نقش‌های مالک و مدیر بارگذاری می‌شود */
(function () {
  const { api, esc, fa, toman, dateFa, toast, go, render, stBadge, toEn, $, $$ } = window;
  const owner = () => window.S.user.role === 'owner';
  const ST = () => window.S.cfg.statuses;
  const tabs = (cur) => `<div class="tabs">${[
    ['', 'داشبورد'], ['orders', 'سفارش‌ها'], ['products', 'محصولات'], ['categories', 'دسته‌بندی‌ها'], ['users', 'کاربران'], ['settings', 'تنظیمات'], ...(owner() ? [['backup', 'پشتیبان‌گیری']] : []),
  ].map(([k, l]) => `<a href="#/admin${k ? '/' + k : ''}" class="${cur === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  const wrapPage = (cur, inner) => ['admin', `<div class="wrap page"><div class="pagehead"><h1>مدیریت فروشگاه</h1></div>${tabs(cur)}${inner}</div>`];

  // ---------- فشرده‌سازی تصویر در مرورگر (کم‌کردن حجم آپلود روی شبکه ضعیف) ----------
  async function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 250 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      return blob && blob.size < file.size ? new File([blob], 'p.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }

  window.renderAdmin = async function (path, qs) {
    const p = path.replace(/^\/admin\/?/, '').split('/');
    const sec = p[0] || '';
    if (sec === '') {
      const s = await api('/admin/stats');
      window.__lastPending = s.pending;
      return wrapPage('', `<div class="stats">
        <div class="card stat"><b>${fa(s.pending)}</b><span>سفارش در انتظار بررسی</span></div>
        <div class="card stat"><b>${fa(s.last24h)}</b><span>سفارش ۲۴ ساعت اخیر</span></div>
        <div class="card stat"><b>${fa(s.revenue)}</b><span>جمع فروش (تومان، بدون لغو/رد)</span></div>
        <div class="card stat"><b>${fa(s.customers)}</b><span>مشتری</span></div></div>
        <div class="two" style="margin-top:16px">
        <div class="card"><h3>وضعیت سفارش‌ها</h3>${Object.keys(ST()).map((k) => `<div class="sum"><div><a href="#/admin/orders?status=${k}">${stBadge(k)}</a><b>${fa(s.byStatus[k] || 0)}</b></div></div>`).join('')}</div>
        <div class="stack"><div class="card"><h3>اعلان سفارش جدید</h3><div class="notice ok">تا وقتی این پنل باز است، با ثبت هر سفارش جدید پیام و صدا دریافت می‌کنید (بررسی هر ۲۵ ثانیه).</div></div>
        <div class="card"><h3>موجودی کم</h3>${s.lowStock.length ? s.lowStock.map((x) => `<div class="sum"><div><a href="#/admin/products/${x.id}">${esc(x.name)}</a><span class="${x.stock ? '' : 'st rejected'}">${x.stock ? fa(x.stock) + ' عدد' : 'ناموجود'}</span></div></div>`).join('') : '<div class="muted">همه محصولات موجودی کافی دارند.</div>'}</div></div></div>`);
    }
    if (sec === 'orders' && p[1]) {
      const o = await api('/admin/orders/' + p[1]);
      return wrapPage('orders', `<div class="pagehead"><h2 dir="ltr">${esc(o.code)}</h2>${stBadge(o.status)}</div><div class="two">
        <div class="stack"><div class="card"><h3>کالاها</h3>${o.items.map((i) => `<div class="sum"><div><span>${esc(i.name)} × ${fa(i.qty)}</span><span>${fa(i.price * i.qty)}</span></div></div>`).join('')}
          <div class="sum"><div><span>ارسال</span><span>${o.shipping ? fa(o.shipping) : 'رایگان'}</span></div><div class="tot"><span>مبلغ کل</span><span>${toman(o.total)}</span></div></div></div>
          <div class="card"><h3>مشتری</h3><div>${esc(o.name)}</div><div dir="ltr" style="text-align:right"><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div><div class="muted">${esc(o.province)}، ${esc(o.city)}</div><div>${esc(o.address)}</div>${o.postal_code ? `<div class="small muted">کد پستی: ${esc(o.postal_code)}</div>` : ''}${o.note ? `<div class="notice" style="margin-top:10px">${esc(o.note)}</div>` : ''}</div></div>
        <div class="stack"><div class="card"><h3>تغییر وضعیت</h3>${o.allowed.length ? `<label class="field"><span>یادداشت برای مشتری (اختیاری)</span><input type="text" id="snote" maxlength="200"></label>
          <div class="row">${o.allowed.map((s) => `<button class="btn ${['rejected', 'cancelled'].includes(s) ? 'danger' : 'primary'}" data-act="a-status" data-id="${o.id}" data-s="${s}">${ST()[s]}</button>`).join('')}</div>` : '<div class="muted">این سفارش به وضعیت نهایی رسیده است.</div>'}</div>
          <div class="card"><h3>تاریخچه</h3><ul class="tl">${o.events.map((e) => `<li><b>${esc(ST()[e.status])}</b> <span class="muted small">${dateFa(e.created_at)}</span><div class="small muted">${esc(e.actor || '')}${e.note ? ' — ' + esc(e.note) : ''}</div></li>`).join('')}</ul></div></div></div>`);
    }
    if (sec === 'orders') {
      const st = qs.get('status') || '', q = qs.get('q') || '', page = Math.max(1, parseInt(qs.get('page'), 10) || 1);
      const d = await api(`/admin/orders?status=${st}&q=${encodeURIComponent(q)}&page=${page}`);
      const pages = Math.ceil(d.total / d.limit);
      const lk = (o) => { const u = new URLSearchParams({ status: st, q, page, ...o }); for (const [k, v] of [...u]) if (!v || (k === 'page' && v === '1')) u.delete(k); return '#/admin/orders' + (u.toString() ? '?' + u : ''); };
      return wrapPage('orders', `<form data-form="a-ordsearch" class="field"><input type="search" name="q" value="${esc(q)}" placeholder="کد رهگیری، نام یا موبایل…"></form>
        <div class="chips" style="margin-bottom:14px"><a class="chip ${st ? '' : 'on'}" href="${lk({ status: '', page: 1 })}">همه</a>${Object.entries(ST()).map(([k, l]) => `<a class="chip ${st === k ? 'on' : ''}" href="${lk({ status: k, page: 1 })}">${l}</a>`).join('')}</div>
        ${d.items.length ? `<div class="tablew"><table><thead><tr><th>کد</th><th>مشتری</th><th>شهر</th><th>مبلغ</th><th>زمان</th><th>وضعیت</th></tr></thead><tbody>${d.items.map((o) => `<tr class="link" data-href="#/admin/orders/${o.id}"><td dir="ltr"><b>${esc(o.code)}</b></td><td>${esc(o.name)}<div class="small muted" dir="ltr" style="text-align:right">${esc(o.phone)}</div></td><td>${esc(o.city)}</td><td>${fa(o.total)}</td><td class="small">${dateFa(o.created_at)}</td><td>${stBadge(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>سفارشی پیدا نشد</b></div>'}
        ${pages > 1 ? `<div class="chips" style="justify-content:center;margin-top:16px">${Array.from({ length: pages }, (_, i) => `<a class="chip ${i + 1 === page ? 'on' : ''}" href="${lk({ page: i + 1 })}">${fa(i + 1)}</a>`).join('')}</div>` : ''}`);
    }
    if (sec === 'products' && p[1]) {
      const cats = await api('/admin/categories');
      const pr = p[1] === 'new' ? { id: '', name: '', description: '', price: '', old_price: '', stock: 1, category_id: cats[0] ? cats[0].id : '', active: true, images: [] } : await api('/admin/products/' + p[1]);
      window.__pimgs = [...pr.images];
      return wrapPage('products', `<form class="card" data-form="a-product" data-id="${pr.id}"><h3>${pr.id ? 'ویرایش محصول' : 'محصول جدید'}</h3>
        <label class="field"><span>نام محصول</span><input type="text" name="name" required maxlength="150" value="${esc(pr.name)}"></label>
        <div class="row"><label class="field"><span>قیمت (تومان)</span><input type="text" name="price" required inputmode="numeric" value="${pr.price}" class="ltr"></label>
        <label class="field"><span>قیمت قبل از تخفیف (اختیاری)</span><input type="text" name="old_price" inputmode="numeric" value="${pr.old_price || ''}" class="ltr"></label></div>
        <div class="row"><label class="field"><span>موجودی</span><input type="text" name="stock" required inputmode="numeric" value="${pr.stock}" class="ltr"></label>
        <label class="field"><span>دسته‌بندی</span><select name="category_id"><option value="">بدون دسته</option>${cats.map((c) => `<option value="${c.id}" ${c.id === pr.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
        <label class="field"><span>توضیحات</span><textarea name="description" maxlength="4000">${esc(pr.description)}</textarea></label>
        <div class="field"><span>تصاویر (حداکثر ۸، تصویر اول اصلی است)</span><div class="imgs" id="pimgs"></div><input type="file" id="pfiles" accept="image/jpeg,image/png,image/webp" multiple style="margin-top:8px"></div>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" name="active" ${pr.active ? 'checked' : ''}> نمایش در فروشگاه</label>
        <div class="err" id="ferr"></div>
        <div class="row"><button class="btn primary" type="submit">ذخیره محصول</button><a class="btn" href="#/admin/products">بازگشت</a>${pr.id ? `<button type="button" class="btn danger" data-act="a-delprod" data-id="${pr.id}">حذف</button>` : ''}</div></form>`);
    }
    if (sec === 'products') {
      const q = qs.get('q') || '';
      const rows = await api('/admin/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
      return wrapPage('products', `<div class="pagehead"><form data-form="a-prodsearch" style="flex:1;min-width:200px"><input type="search" name="q" value="${esc(q)}" placeholder="جست‌وجوی محصول…"></form><a class="btn primary" href="#/admin/products/new">+ محصول جدید</a></div>
        ${rows.length ? `<div class="tablew"><table><thead><tr><th></th><th>نام</th><th>دسته</th><th>قیمت</th><th>موجودی</th><th>وضعیت</th></tr></thead><tbody>${rows.map((x) => `<tr class="link" data-href="#/admin/products/${x.id}"><td style="width:56px">${x.images[0] ? `<img src="uploads/${x.images[0]}" style="width:44px;height:44px;object-fit:cover;border-radius:8px" alt="">` : ''}</td><td>${esc(x.name)}</td><td>${esc(x.category || '—')}</td><td>${fa(x.price)}</td><td>${x.stock ? fa(x.stock) : '<span class="st rejected">۰</span>'}</td><td>${x.active ? '<span class="st delivered">فعال</span>' : '<span class="pill">مخفی</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>محصولی ثبت نشده</b>اولین محصول را اضافه کنید.</div>'}`);
    }
    if (sec === 'categories') {
      const cats = await api('/admin/categories');
      return wrapPage('categories', `<div class="two"><div class="card"><h3>دسته‌ها</h3>${cats.map((c) => `<div class="sum"><div><span><b>${esc(c.name)}</b> <span class="muted small">(${fa(c.count)} محصول)</span></span><span><button class="btn sm" data-act="a-rencat" data-id="${c.id}" data-name="${esc(c.name)}">ویرایش</button> <button class="btn sm danger" data-act="a-delcat" data-id="${c.id}">حذف</button></span></div></div>`).join('') || '<div class="muted">دسته‌ای وجود ندارد.</div>'}</div>
        <form class="card" data-form="a-cat" style="align-self:start"><h3>دسته جدید</h3><label class="field"><input type="text" name="name" required maxlength="50" placeholder="مثلاً: کیف دوشی"></label><div class="err" id="ferr"></div><button class="btn primary">افزودن</button></form></div>`);
    }
    if (sec === 'users') {
      const q = qs.get('q') || '';
      const rows = await api('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
      const RL = { owner: 'مالک', admin: 'مدیر', customer: 'مشتری' };
      return wrapPage('users', `<form data-form="a-usersearch" class="field"><input type="search" name="q" value="${esc(q)}" placeholder="نام، موبایل یا ایمیل…"></form>
        <div class="tablew"><table><thead><tr><th>نام</th><th>موبایل / ایمیل</th><th>نقش</th><th>سفارش</th><th>عضویت</th>${owner() ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((u) => `<tr><td>${esc(u.name || '—')}${u.blocked ? ' <span class="st rejected">مسدود</span>' : ''}</td><td dir="ltr" style="text-align:right">${esc(u.phone || u.email || '')}</td><td><span class="pill">${RL[u.role]}</span></td><td>${fa(u.orders)}</td><td class="small">${dateFa(u.created_at)}</td>
        ${owner() ? `<td>${u.role === 'owner' || u.id === window.S.user.id ? '' : `<button class="btn sm" data-act="a-role" data-id="${u.id}" data-r="${u.role === 'admin' ? 'customer' : 'admin'}">${u.role === 'admin' ? 'حذف از مدیران' : 'ارتقا به مدیر'}</button> <button class="btn sm ${u.blocked ? '' : 'danger'}" data-act="a-block" data-id="${u.id}" data-b="${u.blocked ? 0 : 1}">${u.blocked ? 'رفع مسدودی' : 'مسدود'}</button>`}</td>` : ''}</tr>`).join('')}</tbody></table></div>`);
    }
    if (sec === 'settings') {
      const s = await api('/admin/settings');
      const f = (k, l, ltr, ta) => `<label class="field"><span>${l}</span>${ta ? `<textarea name="${k}">${esc(s[k])}</textarea>` : `<input type="text" name="${k}" value="${esc(s[k])}" ${ltr ? 'class="ltr"' : ''}>`}</label>`;
      return wrapPage('settings', `<form class="card" data-form="a-settings"><h3>اطلاعات فروشگاه</h3>
        <div class="row">${f('shop_name', 'نام فروشگاه')}${f('tagline', 'شعار')}</div>
        <div class="row">${f('owner_phone', 'شماره مالک', 1)}${f('admin_telegram', 'آیدی تلگرام ادمین', 1)}</div>
        <div class="row">${f('telegram_link', 'لینک دایرکت تلگرام', 1)}${f('instagram', 'آیدی اینستاگرام', 1)}</div>
        <div class="row">${f('business_city', 'شهر فروشگاه (برای نقشه/سئوی محلی، اختیاری)')}${f('business_address', 'آدرس فروشگاه (اختیاری)')}</div>
        <div class="row">${f('shipping_cost', 'هزینه ارسال (تومان)', 1)}${f('free_shipping_over', 'ارسال رایگان بالای (تومان؛ ۰ = غیرفعال)', 1)}</div>
        ${f('payment_info', 'متن راهنمای پرداخت (پس از ثبت سفارش نمایش داده می‌شود)', 0, 1)}${f('announcement', 'اعلان بالای سایت (خالی = نمایش داده نشود)')}
        <div class="err" id="ferr"></div><button class="btn primary" style="margin-top:14px">ذخیره تنظیمات</button></form>`);
    }
    if (sec === 'backup' && owner()) {
      const list = await api('/admin/backups');
      return wrapPage('backup', `<div class="two"><div class="card stack"><h3>نسخه پشتیبان</h3><p class="muted small">پشتیبان‌گیری خودکار هر ۲۴ ساعت انجام می‌شود (۷ نسخه آخر). تصاویر محصولات در پوشه <span dir="ltr">uploads</span> کنار دیتابیس نگه‌داری می‌شوند و باید جداگانه کپی شوند.</p>
        <a class="btn primary" href="api/admin/backup-now">دانلود نسخه پشتیبان همین حالا</a><button class="btn" data-act="a-bkmake">ساخت نسخه روی سرور</button>
        ${list.length ? `<div class="olist">${list.slice(0, 15).map((b) => `<a href="api/admin/backups/download/${esc(b.name)}"><span dir="ltr" class="small">${esc(b.name)}</span><span class="muted small">${fa(Math.round(b.size / 1024))} KB</span></a>`).join('')}</div>` : ''}</div>
        <div class="card stack" style="align-self:start"><h3>بازیابی</h3><div class="notice bad">با بازیابی، همه اطلاعات فعلی (سفارش‌ها، کاربران، محصولات) با فایل انتخابی جایگزین می‌شود. قبل از آن خودکار یک نسخه از وضعیت فعلی ساخته می‌شود.</div>
        <input type="file" id="rfile" accept=".sqlite,.db"><button class="btn danger" data-act="a-restore">بازیابی از فایل</button></div></div>`);
    }
    throw new Error('صفحه پیدا نشد');
  };

  window.adminAfter = function (path) {
    if (path.startsWith('/admin/products/')) drawImgs();
    const f = $('#pfiles'); if (f) f.onchange = () => { drawImgs(); };
    if (!window.__poll) {
      window.__poll = setInterval(async () => {
        if (!window.S.user || !['admin', 'owner'].includes(window.S.user.role)) return;
        try {
          const s = await api('/admin/stats');
          if (window.__lastPending != null && s.pending > window.__lastPending) {
            toast('سفارش جدید ثبت شد 🛍');
            try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.15); } catch (e) { /* ignore */ }
            if (window.curPath().startsWith('/admin') && !/products\/|orders\//.test(window.curPath())) render(true);
          }
          window.__lastPending = s.pending;
        } catch (e) { /* ignore */ }
      }, 25000);
    }
  };

  function drawImgs() {
    const box = $('#pimgs'); if (!box) return;
    const files = [...($('#pfiles').files || [])];
    box.innerHTML = window.__pimgs.map((n, i) => `<div class="im"><img src="uploads/${esc(n)}" alt=""><button type="button" data-act="a-rmimg" data-i="${i}" aria-label="حذف">×</button></div>`).join('')
      + files.map((f) => `<div class="im"><img src="${URL.createObjectURL(f)}" alt=""></div>`).join('');
  }

  window.adminClick = async function (t, act) {
    const id = t.dataset.id;
    try {
      if (act === 'a-rmimg') { window.__pimgs.splice(Number(t.dataset.i), 1); drawImgs(); }
      else if (act === 'a-status') {
        const s = t.dataset.s;
        if (['rejected', 'cancelled'].includes(s) && !confirm('این سفارش «' + ST()[s] + '» شود؟ موجودی کالاها برمی‌گردد.')) return;
        await api(`/admin/orders/${id}/status`, { method: 'POST', body: { status: s, note: ($('#snote') || {}).value || '' } });
        toast('وضعیت تغییر کرد'); render(true);
      } else if (act === 'a-delprod') { if (!confirm('محصول حذف شود؟ سفارش‌های قبلی حفظ می‌شوند.')) return; await api('/admin/products/' + id, { method: 'DELETE' }); toast('حذف شد'); go('#/admin/products'); }
      else if (act === 'a-delcat') { if (!confirm('دسته حذف شود؟ محصولات آن بدون دسته می‌مانند.')) return; await api('/admin/categories/' + id, { method: 'DELETE' }); render(true); }
      else if (act === 'a-rencat') { const n = prompt('نام جدید دسته:', t.dataset.name); if (n && n.trim()) { await api('/admin/categories/' + id, { method: 'PUT', body: { name: n } }); render(true); } }
      else if (act === 'a-role') { await api('/admin/users/' + id, { method: 'POST', body: { role: t.dataset.r } }); render(true); }
      else if (act === 'a-block') { await api('/admin/users/' + id, { method: 'POST', body: { blocked: t.dataset.b === '1' } }); render(true); }
      else if (act === 'a-bkmake') { await api('/admin/backups', { method: 'POST' }); toast('نسخه پشتیبان ساخته شد'); render(true); }
      else if (act === 'a-restore') {
        const f = $('#rfile').files[0]; if (!f) return toast('فایل را انتخاب کنید', true);
        if (!confirm('همه اطلاعات فعلی با این فایل جایگزین می‌شود. مطمئنید؟')) return;
        const fd = new FormData(); fd.append('file', f);
        await api('/admin/restore', { method: 'POST', form: fd }); toast('بازیابی انجام شد'); setTimeout(() => location.reload(), 800);
      }
    } catch (e) { toast(e.message, true); }
  };

  window.adminSubmit = async function (f, kind, fd) {
    const err = $('#ferr', f), btn = $('button[type=submit],button:not([type])', f);
    const setErr = (m) => { if (err) err.textContent = m || ''; };
    setErr('');
    try {
      if (kind === 'a-ordsearch') return go('#/admin/orders?q=' + encodeURIComponent(fd.q || ''));
      if (kind === 'a-prodsearch') return go('#/admin/products?q=' + encodeURIComponent(fd.q || ''));
      if (kind === 'a-usersearch') return go('#/admin/users?q=' + encodeURIComponent(fd.q || ''));
      if (btn) btn.disabled = true;
      if (kind === 'a-cat') { await api('/admin/categories', { method: 'POST', body: fd }); toast('دسته اضافه شد'); render(true); }
      else if (kind === 'a-settings') { await api('/admin/settings', { method: 'PUT', body: fd }); const c = await api('/config'); window.S.cfg = c; toast('ذخیره شد'); render(true); }
      else if (kind === 'a-product') {
        const id = f.dataset.id;
        const form = new FormData();
        for (const k of ['name', 'price', 'old_price', 'stock', 'category_id', 'description']) form.set(k, toEn(fd[k] ?? ''));
        form.set('name', fd.name); form.set('description', fd.description || '');
        form.set('active', fd.active ? '1' : '0');
        form.set('keep', JSON.stringify(window.__pimgs));
        const files = [...$('#pfiles').files];
        if (window.__pimgs.length + files.length > 8) throw new Error('حداکثر ۸ تصویر مجاز است');
        for (const file of files) form.append('images', await compress(file));
        await api(id ? '/admin/products/' + id : '/admin/products', { method: id ? 'PUT' : 'POST', form });
        toast('محصول ذخیره شد'); go('#/admin/products');
      }
    } catch (e) { setErr(e.message); toast(e.message, true); } finally { if (btn) btn.disabled = false; }
  };
})();
