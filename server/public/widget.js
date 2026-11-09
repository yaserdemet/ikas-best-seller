/*!
 * most-seller widget — kategori sayfalarında "Öne Çıkan Ürünler" bölümü.
 *
 * Kurulum (ikas → Ayarlar → Özel Kod / <head>):
 *   <script src="https://SUNUCU/widget.js" data-store="ms_XXXX" async></script>
 *
 * Bölüm, mağaza panelinde girilen CSS seçicinin yanına eklenir. Seçici boşsa
 * sayfada <div id="ms-bestsellers"></div> varsa onun içine, yoksa <main> başına eklenir.
 * Hata ayıklama: sayfa adresine ?ms-debug=1 ekleyin.
 */
(function () {
  'use strict';
  if (window.__msBestsellers) return;
  window.__msBestsellers = true;

  var script =
    document.currentScript ||
    document.querySelector('script[src*="/widget.js"][data-store]');
  var meta = document.querySelector('meta[name="ms-store-id"]');
  var STORE_KEY = (script && script.getAttribute('data-store')) || (meta && meta.getAttribute('content')) || '';
  var API_BASE = (script && script.src ? new URL(script.src).origin : '') + '/api/public/' + encodeURIComponent(STORE_KEY);
  var DEBUG = /[?&]ms-debug=1/.test(location.search);
  var HOST_ID = 'ms-bestsellers-host';

  function log() {
    if (DEBUG) console.log.apply(console, ['[most-seller]'].concat([].slice.call(arguments)));
  }
  if (!STORE_KEY) {
    console.warn('[most-seller] data-store bulunamadı');
    return;
  }

  // ---------- veri ----------
  var bootstrapPromise = null;
  var categoryCache = {};

  function getJSON(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function bootstrap() {
    if (bootstrapPromise) return bootstrapPromise;
    var ck = 'ms-bs:' + STORE_KEY;
    try {
      var cached = JSON.parse(sessionStorage.getItem(ck) || 'null');
      if (cached && cached.t > Date.now() - 60 * 1000) {
        bootstrapPromise = Promise.resolve(cached.d);
        return bootstrapPromise;
      }
    } catch (e) {}
    bootstrapPromise = getJSON(API_BASE + '/bootstrap').then(function (d) {
      try {
        sessionStorage.setItem(ck, JSON.stringify({ t: Date.now(), d: d }));
      } catch (e) {}
      return d;
    });
    return bootstrapPromise;
  }

  function loadCategory(slug) {
    if (!categoryCache[slug]) {
      categoryCache[slug] = getJSON(API_BASE + '/category/' + encodeURIComponent(slug)).catch(function (e) {
        delete categoryCache[slug];
        throw e;
      });
    }
    return categoryCache[slug];
  }

  function currentSlug() {
    var parts = location.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    try {
      return decodeURIComponent(parts[parts.length - 1]).toLowerCase();
    } catch (e) {
      return parts[parts.length - 1].toLowerCase();
    }
  }

  // ---------- görünüm ----------
  function fmtPrice(value, symbol) {
    var n;
    try {
      n = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch (e) {
      n = Number(value).toFixed(2);
    }
    return (symbol || '₺') + n;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function safeUrl(u) {
    u = String(u || '');
    return /^(https?:)?\/\//i.test(u) || u.charAt(0) === '/' ? u : '#';
  }

  function css(s) {
    var ratio = String(s.imageRatio || '3/4');
    return (
      ':host{all:initial;display:block;font-family:inherit;color:inherit;margin:24px 0;' +
      '--ms-accent:' + (s.accentColor || '#111') + ';--ms-radius:' + Number(s.cardRadius || 0) + 'px;--ms-ratio:' + ratio + '}' +
      '*{box-sizing:border-box}' +
      '.wrap{position:relative;font-family:inherit}' +
      '.head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}' +
      '.title{margin:0;font-size:20px;font-weight:600;line-height:1.3;color:inherit;font-family:inherit}' +
      '.nav{display:flex;gap:8px}' +
      '.btn{width:36px;height:36px;border-radius:50%;border:1px solid #ddd;background:#fff;color:#111;cursor:pointer;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;transition:opacity .2s}' +
      '.btn:disabled{opacity:.35;cursor:default}' +
      '.track{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 3*16px)/4);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
      '.track::-webkit-scrollbar{display:none}' +
      '.card{scroll-snap-align:start;text-decoration:none;color:inherit;display:block;min-width:0}' +
      '.media{position:relative;aspect-ratio:var(--ms-ratio);border-radius:var(--ms-radius);overflow:hidden;background:#f3f3f3}' +
      '.media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .3s}' +
      '.media img.hover{opacity:0}' +
      '.card:hover .media img.hover{opacity:1}' +
      '.badge{position:absolute;top:8px;left:8px;background:var(--ms-accent);color:#fff;font-size:11px;font-weight:600;padding:4px 8px;border-radius:999px;letter-spacing:.02em}' +
      '.name{margin:10px 0 4px;font-size:14px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.price{font-size:14px;font-weight:600;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}' +
      '.old{font-weight:400;color:#888;text-decoration:line-through;font-size:13px}' +
      '.disc{color:#c0392b}' +
      '@media (max-width:1024px){.track{grid-auto-columns:calc((100% - 2*12px)/3);gap:12px}}' +
      '@media (max-width:768px){.track{grid-auto-columns:42%;gap:10px}.nav{display:none}.title{font-size:17px}}' +
      (s.customCss || '')
    );
  }

  function buildSection(data, settings) {
    var host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-slug', currentSlug());
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var style = document.createElement('style');
    style.textContent = css(settings);
    root.appendChild(style);

    var wrap = el('section', 'wrap');
    wrap.setAttribute('aria-label', data.title || settings.title);
    var head = el('div', 'head');
    head.appendChild(el('h2', 'title', data.title || settings.title || 'Öne Çıkan Ürünler'));
    var nav = el('div', 'nav');
    var prev = el('button', 'btn', '‹');
    var next = el('button', 'btn', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Önceki');
    next.setAttribute('aria-label', 'Sonraki');
    nav.appendChild(prev);
    nav.appendChild(next);
    head.appendChild(nav);
    wrap.appendChild(head);

    var track = el('div', 'track');
    data.items.forEach(function (p, i) {
      var a = el('a', 'card');
      a.href = safeUrl(p.url);
      a.setAttribute('data-product-id', p.id);
      var media = el('div', 'media');
      if (p.image) {
        var img = el('img');
        img.src = p.image;
        img.alt = p.name;
        img.loading = i < 4 ? 'eager' : 'lazy';
        media.appendChild(img);
      }
      if (p.hoverImage) {
        var img2 = el('img', 'hover');
        img2.src = p.hoverImage;
        img2.alt = '';
        img2.loading = 'lazy';
        media.appendChild(img2);
      }
      if (settings.showBadge && i < 3) media.appendChild(el('span', 'badge', 'Çok Satan'));
      a.appendChild(media);
      a.appendChild(el('div', 'name', p.name));
      var price = el('div', 'price');
      price.appendChild(el('span', p.compareAtPrice ? 'disc' : '', fmtPrice(p.price, p.currencySymbol)));
      if (p.compareAtPrice) price.appendChild(el('span', 'old', fmtPrice(p.compareAtPrice, p.currencySymbol)));
      a.appendChild(price);
      track.appendChild(a);
    });
    wrap.appendChild(track);
    root.appendChild(wrap);

    function updateNav() {
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    }
    prev.addEventListener('click', function () {
      track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
    });
    track.addEventListener('scroll', updateNav, { passive: true });
    setTimeout(updateNav, 50);

    return host;
  }

  // ---------- yerleşim ----------
  function pickTarget(s) {
    var mobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    var sel = (mobile && s.selectorMobile) || s.selectorDesktop;
    if (sel) {
      try {
        // Temalar aynı sınıfı gizli (mobil/masaüstü) kopyalarda da kullanabiliyor: görünür ilk eşleşmeyi al
        var all = document.querySelectorAll(sel);
        for (var i = 0; i < all.length; i++) {
          if (all[i].getClientRects().length) return { node: all[i], position: s.position || 'beforebegin' };
        }
      } catch (e) {
        log('geçersiz seçici', sel);
      }
      return null; // seçici var ama henüz yok → beklenecek
    }
    var ph = document.getElementById('ms-bestsellers');
    if (ph) return { node: ph, position: 'afterbegin' };
    var main = document.querySelector('main');
    if (main) return { node: main, position: 'afterbegin' };
    return null;
  }

  function waitForTarget(s, timeoutMs) {
    return new Promise(function (resolve) {
      var t = pickTarget(s);
      if (t) return resolve(t);
      var done = false;
      var obs = new MutationObserver(function () {
        var t2 = pickTarget(s);
        if (t2 && !done) {
          done = true;
          obs.disconnect();
          resolve(t2);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () {
        if (!done) {
          done = true;
          obs.disconnect();
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  // ---------- akış ----------
  var renderToken = 0;
  var activeHost = null;
  var keepAlive = null;

  function removeExisting() {
    if (keepAlive) {
      keepAlive.disconnect();
      keepAlive = null;
    }
    var old = document.getElementById(HOST_ID);
    if (old) old.remove();
    activeHost = null;
  }

  function run() {
    var token = ++renderToken;
    var slug = currentSlug();
    removeExisting();
    if (!slug) return;

    bootstrap()
      .then(function (b) {
        if (!b || !b.enabled) return log('widget kapalı');
        if (b.slugs.indexOf(slug) === -1) return log('bu sayfa için veri yok:', slug);
        return loadCategory(slug).then(function (data) {
          if (token !== renderToken) return;
          if (!data.items || !data.items.length) return log('boş liste', slug);
          return waitForTarget(b.settings, 10000).then(function (target) {
            if (token !== renderToken) return;
            if (!target) return console.warn('[most-seller] yerleştirilecek alan bulunamadı. Panelden CSS seçiciyi kontrol edin.');
            removeExisting();
            var host = buildSection(data, b.settings);
            target.node.insertAdjacentElement(target.position, host);
            activeHost = host;
            log('eklendi:', slug, data.items.length + ' ürün');
            watchRemoval(b.settings, data, slug, token);
          });
        });
      })
      .catch(function (e) {
        log('hata', e);
      });
  }

  // Tema (React) yeniden çizip bölümü silerse geri ekle
  function watchRemoval(settings, data, slug, token) {
    var retries = 0;
    keepAlive = new MutationObserver(function () {
      if (token !== renderToken || currentSlug() !== slug) return;
      if (activeHost && !document.contains(activeHost) && retries < 5) {
        var t = pickTarget(settings);
        if (!t) return;
        retries++;
        t.node.insertAdjacentElement(t.position, activeHost);
        log('yeniden eklendi');
      }
    });
    keepAlive.observe(document.body, { childList: true, subtree: true });
  }

  // ikas vitrini SPA (Next.js): sayfa geçişlerini yakala
  var lastPath = location.pathname;
  function onRouteChange() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    setTimeout(run, 50);
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      onRouteChange();
      return r;
    };
  });
  window.addEventListener('popstate', onRouteChange);
  setInterval(onRouteChange, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
