'use strict';
/* انیمیشن‌ها: GSAP + ScrollTrigger + Lenis (خودمیزبان). اگر کاربر «کاهش حرکت» را فعال کرده باشد همه خاموش‌اند. */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !window.gsap || !window.ScrollTrigger) { window.fx = { enter() {} }; return; }
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const hover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

  /* اسکرول نرم */
  let lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* هدر: با اسکرول پررنگ‌تر می‌شود */
  const onScroll = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ذرات نقره‌ای شناور در هیرو */
  let dustRun = 0;
  function dust(hero) {
    const cv = document.createElement('canvas');
    cv.className = 'dust'; cv.setAttribute('aria-hidden', 'true');
    hero.prepend(cv);
    const ctx = cv.getContext('2d'); const id = ++dustRun;
    let w = 0, h = 0, vis = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { w = hero.clientWidth; h = hero.clientHeight; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    const N = w < 600 ? 26 : 48;
    const P = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .4, v: Math.random() * .25 + .06, a: Math.random() * .5 + .15, p: Math.random() * 6.28 }));
    new IntersectionObserver((e) => { vis = e[0].isIntersecting; }).observe(hero);
    (function loop() {
      if (id !== dustRun || !cv.isConnected) return;
      requestAnimationFrame(loop);
      if (!vis) return;
      ctx.clearRect(0, 0, w, h);
      for (const q of P) {
        q.y -= q.v; q.p += .01; q.x += Math.sin(q.p) * .18;
        if (q.y < -4) { q.y = h + 4; q.x = Math.random() * w; }
        ctx.globalAlpha = q.a * (.6 + .4 * Math.sin(q.p * 2));
        ctx.fillStyle = '#e6e9ee';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.28); ctx.fill();
      }
    })();
    window.addEventListener('resize', fit, { passive: true });
  }

  /* ظاهر شدن هنگام اسکرول (با پشتیبان: اگر چیزی ظاهر نشد، بعد از چند ثانیه نمایش داده می‌شود) */
  function reveal(sel, opts = {}) {
    const els = $$(sel).filter((e) => !e.closest('.hero'));
    if (!els.length) return [];
    const from = opts.from || { opacity: 0, y: 26 };
    gsap.set(els, from);
    ScrollTrigger.batch(els, {
      start: 'top 94%', once: true,
      onEnter: (b) => gsap.to(b, { opacity: 1, x: 0, y: 0, scale: 1, duration: opts.d || .65, stagger: opts.s || .07, ease: 'power3.out', overwrite: true, clearProps: 'transform,opacity' }),
    });
    return els;
  }

  function countUp() {
    $$('.stat b').forEach((el) => {
      const raw = toEn(el.textContent).replace(/[^\d]/g, '');
      const n = Number(raw); if (!raw || !Number.isFinite(n) || n === 0) return;
      const o = { v: 0 };
      gsap.to(o, { v: n, duration: 1.2, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('fa-IR'); }, onComplete: () => { el.textContent = n.toLocaleString('fa-IR'); } });
    });
  }

  let lastBadge = '';
  function enter(keep) {
    ScrollTrigger.getAll().forEach((t) => t.kill());
    dustRun++;
    $$('textarea, select').forEach((e) => e.setAttribute('data-lenis-prevent', ''));

    /* نشان سبد خرید: وقتی تعداد زیاد شد، بپر */
    const b = $('#cartbtn .badge'); const txt = b ? b.textContent : '';
    if (txt && txt !== lastBadge && lastBadge !== undefined) { gsap.fromTo('#cartbtn', { scale: 1 }, { scale: 1.25, duration: .18, yoyo: true, repeat: 1, ease: 'power2.out' }); gsap.fromTo('.badge', { scale: 1.8 }, { scale: 1, duration: .5, ease: 'back.out(3)' }); }
    lastBadge = txt;

    if (keep) return; // بازرسم بعد از تغییر سبد/ذخیره: بدون ورودی تکراری
    if (lenis) lenis.scrollTo(0, { immediate: true });
    const hero = $('.hero');
    const all = [];

    if (hero) {
      dust(hero);
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero h1', { opacity: 0, y: 34, filter: 'blur(14px)', duration: .9 })
        .from('.hero p', { opacity: 0, y: 20, duration: .6 }, '-=.5')
        .from('.hero .row > *', { opacity: 0, y: 18, stagger: .1, duration: .5 }, '-=.35')
        .from('.logo3d', { opacity: 0, scale: .55, rotate: -14, duration: 1.1, ease: 'expo.out' }, 0.1)
        .from('.logo3d .ring', { opacity: 0, duration: .8 }, .7)
        .from('.marq', { opacity: 0, y: 14, duration: .6 }, '-=.4');
      gsap.to('.hero .logo3d', { yPercent: -4, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to('.hero .logo3d', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.hero .wrap > div:first-child', { yPercent: -10, opacity: .35, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    } else {
      gsap.from('main', { opacity: 0, y: 16, duration: .5, ease: 'power3.out', clearProps: 'transform,opacity' });
    }

    all.push(...reveal('.pagehead, .chips, .tabs, .notice, .empty'));
    all.push(...reveal('.perks > div', { from: { opacity: 0, x: 30 }, s: .12 }));
    all.push(...reveal('.pcard', { from: { opacity: 0, y: 34, scale: .94 }, s: .06, d: .7 }));
    all.push(...reveal('.card, .line, .tablew, .gallery, .two > .stack > *'));
    all.push(...reveal('.stats .stat, .tl li', { s: .09 }));
    all.push(...reveal('tbody tr', { from: { opacity: 0, x: 22 }, s: .035, d: .45 }));
    all.push(...reveal('footer.foot .wrap > div', { from: { opacity: 0, y: 20 } }));
    countUp();
    setTimeout(() => { all.forEach((e) => { if (e.isConnected && getComputedStyle(e).opacity === '0') gsap.to(e, { opacity: 1, x: 0, y: 0, scale: 1, duration: .4, clearProps: 'transform,opacity' }); }); }, 3500);
    setTimeout(() => ScrollTrigger.refresh(), 700);
  }

  /* افکت‌های اشاره‌گر (فقط ماوس): نور روی کارت‌ها، دکمه‌های مغناطیسی، شیب لوگو */
  if (hover) {
    let mag = null;
    document.addEventListener('pointermove', (e) => {
      const c = e.target.closest && e.target.closest('.pcard, .card');
      if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); }
      const btn = e.target.closest && e.target.closest('.btn.primary');
      if (mag && mag !== btn) { gsap.to(mag, { x: 0, y: 0, duration: .5, ease: 'elastic.out(1,.5)' }); mag = null; }
      if (btn) { const r = btn.getBoundingClientRect(); mag = btn; gsap.to(btn, { x: (e.clientX - r.left - r.width / 2) * .18, y: (e.clientY - r.top - r.height / 2) * .3, duration: .3 }); }
      const logo = $('.logo3d');
      if (logo && $('.hero')) { const r = $('.hero').getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5; gsap.to(logo, { rotationY: nx * 18, rotationX: -ny * 14, transformPerspective: 800, duration: .6, ease: 'power2.out' }); }
    }, { passive: true });
  }

  window.fx = { enter };
})();
