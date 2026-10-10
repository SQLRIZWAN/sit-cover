(function () {
  'use strict';

  var App = window.App = {
    state: { config: null, categories: {}, products: {} },
    hubs: { config: [], categories: [], products: [] },
    loaded: { config: false, categories: false, products: false },
    connected: false,
    fbTried: false
  };

  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  App.esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  App.fmtKD = function (n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return v.toFixed(3) + ' KD';
  };

  // The shop marks a product down by filling in its ORIGINAL price in the
  // panel. Only that one number is stored, so the percentage can never drift
  // away from the two prices the customer actually sees.
  App.discountOf = function (p) {
    if (!p) return null;
    var now = Number(p.price);
    var was = Number(p.wasPrice);
    if (!isFinite(now) || !isFinite(was) || now <= 0 || was <= now) return null;
    var pct = Math.round((1 - now / was) * 100);
    if (pct < 1) return null;
    return { was: was, now: now, pct: pct };
  };

  // Sale price with the old one struck through and the saving spelled out —
  // the shape every big shop uses:  ~~100.000 KD~~ 60.000 KD  40% OFF
  App.priceHTML = function (p) {
    var now = App.fmtKD(p && p.price);
    var d = App.discountOf(p);
    if (!d) return now;
    return '<s class="p-was">' + App.fmtKD(d.was) + '</s>' + now +
      ' <span class="p-off">' + d.pct + '% OFF</span>';
  };

  App.pad = function (n) { return n < 10 ? '0' + n : '' + n; };

  App.todayKey = function () {
    try {
      var d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }));
      return d.getFullYear() + '-' + App.pad(d.getMonth() + 1) + '-' + App.pad(d.getDate());
    } catch (e) {
      var x = new Date();
      return x.getFullYear() + '-' + App.pad(x.getMonth() + 1) + '-' + App.pad(x.getDate());
    }
  };

  App.fmtDate = function (ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-GB', {
        timeZone: 'Asia/Kuwait',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return new Date(ts).toLocaleString(); }
  };

  var toastTimer;
  App.toast = function (msg, kind) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast on' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  };

  App.loadScript = function (src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    if (cb) {
      s.onload = function () { cb(null); };
      s.onerror = function () { cb(new Error('load failed: ' + src)); };
    }
    document.head.appendChild(s);
    return s;
  };

  App.defaults = {
    shopName: 'Fahad Asi Manea Al-Zaferi Co',
    shopNameAr: 'شركة فهد عسي مانع الزعفري',
    phone: '24312328',
    ownerPhone: '+965 99529389',
    whatsappNumber: '96599529389',
    wamdNumber: '',
    wamdName: '',
    wamdLink: '',
    address: 'Jleeb Al-Shuyoukh, Kuwait',
    addressAr: 'جليب الشيوخ، الكويت',
    shopLat: 29.2844,
    shopLng: 47.9656,
    whatsappSubmitEnabled: true,
    visitorCountingEnabled: false,
    email: '',
    instagram: '',
    currency: 'KD',
    deliveryTiers: [
      { maxKm: 5, fee: 1 },
      { maxKm: 10, fee: 1.5 },
      { maxKm: 20, fee: 2 },
      { maxKm: 30, fee: 3 },
      { maxKm: null, fee: 5 }
    ],
    seo: {
      baseUrl: 'https://fixandfit.store',
      titleSuffix: '',
      description: '',
      keywords: '',
      ogImage: ''
    }
  };

  App.cfg = function () {
    var saved = App.state.config || {};
    var out = {};
    var k;
    for (k in App.defaults) out[k] = App.defaults[k];
    for (k in saved) if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
    return out;
  };

  /* ---------- SEO: live meta / canonical / OG / JSON-LD ---------- */
  App.seoCfg = function () {
    var saved = (App.state.config && App.state.config.seo) || {};
    var out = {};
    var k;
    for (k in App.defaults.seo) out[k] = App.defaults.seo[k];
    for (k in saved) if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
    return out;
  };

  function metaSet(kind, key, val) {
    if (val == null || val === '') return;
    var el = document.head.querySelector('meta[' + kind + '="' + key + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(kind, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', String(val));
  }

  function linkSet(rel, href) {
    if (!href) return;
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  function sitePath() {
    var p = location.pathname || '/';
    p = p.replace(/^\/+/, '');
    p = p.replace(/^sit-cover\//, '');
    if (!p || p === 'index.html') return '';
    return p;
  }

  function pageUrl(seo, path) {
    var base = String(seo.baseUrl || 'https://fixandfit.store').replace(/\/+$/, '');
    var p = (path != null ? path : sitePath()).replace(/^\/+/, '');
    return p ? base + '/' + p : base + '/';
  }

  function titleWithSuffix(title, suffix) {
    if (!suffix) return title;
    if (title.indexOf(suffix) !== -1) return title;
    return title + ' ' + suffix;
  }

  function firstLine(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > 160 ? t.slice(0, 157) + '…' : t;
  }

  App.applySEO = function (opts) {
    opts = opts || {};
    var cfg = App.cfg();
    var seo = App.seoCfg();
    var url = pageUrl(seo, opts.path);
    var title = opts.title || document.title || cfg.shopName || 'Shop';
    title = titleWithSuffix(title, seo.titleSuffix || '');
    var desc = opts.description || seo.description ||
      (document.head.querySelector('meta[name="description"]') || {}).content || '';
    var keywords = seo.keywords || (document.head.querySelector('meta[name="keywords"]') || {}).content || '';
    var img = seo.ogImage || url.replace(/\/[^/]*$/, '') + '/assets/shop-banner.webp';
    if (img.indexOf('http') !== 0) img = pageUrl(seo, 'assets/' + img.replace(/^\/+/, ''));
    if (!seo.ogImage) img = pageUrl(seo, 'assets/shop-banner.webp');

    document.title = title;
    metaSet('name', 'description', firstLine(desc));
    metaSet('name', 'keywords', keywords);
    linkSet('canonical', url);
    metaSet('property', 'og:type', 'website');
    metaSet('property', 'og:site_name', seo.titleSuffix ? cfg.shopName : 'Fix and Fit Store');
    metaSet('property', 'og:title', title);
    metaSet('property', 'og:description', firstLine(desc));
    metaSet('property', 'og:url', url);
    metaSet('property', 'og:image', img);
    metaSet('name', 'twitter:card', 'summary_large_image');
    metaSet('name', 'twitter:title', title);
    metaSet('name', 'twitter:description', firstLine(desc));
    metaSet('name', 'twitter:image', img);
    metaSet('name', 'geo.position', cfg.shopLat + ';' + cfg.shopLng);
    metaSet('name', 'ICBM', cfg.shopLat + ', ' + cfg.shopLng);
    applyJsonLd(cfg, seo, url);
    return { url: url, title: title, description: desc };
  };

  function applyJsonLd(cfg, seo, url) {
    var el = document.querySelector('script[type="application/ld+json"]');
    if (!el) return;
    var d;
    try { d = JSON.parse(el.textContent); } catch (e) { return; }
    if (!d || d['@type'] !== 'Store') return;
    if (cfg.shopName) d.name = cfg.shopName;
    d.url = url;
    if (cfg.phone) d.telephone = '+965' + String(cfg.phone).replace(/\D/g, '');
    if (cfg.address) {
      d.address = d.address || { '@type': 'PostalAddress', 'addressCountry': 'KW' };
      d.address.streetAddress = cfg.address;
    }
    if (cfg.shopLat != null && cfg.shopLng != null) {
      d.geo = { '@type': 'GeoCoordinates', latitude: Number(cfg.shopLat), longitude: Number(cfg.shopLng) };
    }
    var logo = pageUrl(seo, 'assets/shop-logo.webp');
    d.logo = logo;
    if (!d.image || !d.image.length) d.image = [logo];
    var wa = String(cfg.whatsappNumber || '').replace(/\D/g, '');
    if (wa) d.sameAs = ['https://wa.me/' + (wa.indexOf('965') === 0 ? wa : '965' + wa)];
    try { el.textContent = JSON.stringify(d); } catch (e) {}
  }

  App.applySEOProduct = function (p) {
    if (!p) return;
    var cfg = App.cfg();
    var seo = App.seoCfg();
    var bits = [];
    if (p.description) bits.push(String(p.description).replace(/\s+/g, ' ').trim());
    if (cfg.address) bits.push('Fix and Fit store — ' + cfg.address + '. Cash on delivery, 24-hour delivery.');
    var q = p.id != null ? 'product.html?id=' + encodeURIComponent(p.id) : 'product.html';
    App.applySEO({
      title: (p.name || 'Product') + ' — ' + cfg.shopName,
      description: firstLine(bits.join(' ')),
      path: q
    });
    metaSet('property', 'og:type', 'product');
  };

  App.on = function (key, fn) {
    if (!App.hubs[key]) App.hubs[key] = [];
    App.hubs[key].push(fn);
    fn(App.state[key]);
  };

  function fire(key) {
    var list = App.hubs[key] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](App.state[key]); } catch (e) { console.error(e); }
    }
  }
  App.fire = fire;

  App.catList = function (includeInactive) {
    var c = App.state.categories || {};
    var arr = [];
    for (var id in c) {
      var o = c[id] || {};
      o.id = id;
      if (!includeInactive && o.active === false) continue;
      arr.push(o);
    }
    arr.sort(function (a, b) {
      var ao = typeof a.order === 'number' ? a.order : 9999;
      var bo = typeof b.order === 'number' ? b.order : 9999;
      return ao - bo;
    });
    return arr;
  };

  // The admin toggle "Stock visible on site" flips inStock off. A shopper must
  // never meet one of those rows in the catalogue, the search or the assistant,
  // so every listing on the website goes through this filter.
  App.isHidden = function (p) {
    return !!p && p.inStock === false;
  };

  App.prodList = function () {
    var p = App.state.products || {};
    var arr = [];
    for (var id in p) {
      var o = p[id] || {};
      if (App.isHidden(o)) continue;
      o.id = id;
      arr.push(o);
    }
    arr.sort(function (a, b) {
      var ao = typeof a.order === 'number' ? a.order : 0;
      var bo = typeof b.order === 'number' ? b.order : 0;
      if (ao !== bo) return ao - bo;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return arr;
  };

  // Always returns a copy that carries its own id — reading straight from
  // App.state.products loses the key and breaks cart / order bookkeeping.
  App.getProduct = function (id) {
    if (id == null || id === '') return null;
    var src = (App.state.products || {})[id];
    if (!src) return null;
    var o = {};
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k];
    o.id = id;
    return o;
  };

  // Live stock state for one product. `have` is how many are already in the
  // basket — used to allow adding up to the published quantity but no further.
  App.stockCheck = function (p, have) {
    have = Number(have) || 0;
    if (!p) return { ok: false, out: true, max: 0, left: 0, msg: 'Product not found' };
    if (p.inStock === false) {
      return { ok: false, out: true, max: null, left: 0, msg: (p.name || 'This item') + ' is out of stock' };
    }
    var max = null;
    if (p.stockQty !== undefined && p.stockQty !== null && p.stockQty !== '') {
      var n = Number(p.stockQty);
      if (isFinite(n) && n >= 0) {
        max = Math.floor(n);
        if (max <= 0) return { ok: false, out: true, max: max, left: 0, msg: (p.name || 'This item') + ' is out of stock' };
      }
    }
    if (max !== null && have >= max) {
      return { ok: false, out: false, max: max, left: 0, msg: 'Only ' + max + ' of these in stock' };
    }
    return { ok: true, out: false, max: max, left: max === null ? null : (max - have), msg: '' };
  };

  function fitImg(url, w) {
    if (!url || url.indexOf('/upload/') === -1) return url || '';
    return url.replace('/upload/', '/upload/w_' + w + ',q_auto,f_auto/');
  }
  App.fitImg = fitImg;

  App.mediaThumb = function (m, w) {
    if (!m) return '';
    if (m.type === 'video') {
      if (m.thumb) return fitImg(m.thumb, w || 400);
      if (m.url && m.url.indexOf('/upload/') > -1) {
        return m.url.replace('/upload/', '/upload/so_0,f_jpg,q_auto,w_' + (w || 400) + '/');
      }
      return '';
    }
    return fitImg(m.url, w || 400);
  };

  App.firstMedia = function (p) {
    if (p && p.media && p.media.length) return p.media[0];
    if (p && p.thumb) return { type: 'image', url: p.thumb, thumb: p.thumb };
    return null;
  };

  // There is no Firebase Storage bucket, so videos live in the database —
  // where a single string tops out at 10 MB. Anything bigger is split into
  // chunks and written one at a time.
  App.VIDEO_MAX_BYTES = 20 * 1024 * 1024;
  App.VIDEO_CHUNK_LEN = 4000000;

  App.videoHead = function (format, data) {
    var i = data ? data.indexOf(',') : -1;
    if (i > -1) return data.slice(0, i + 1);
    return 'data:video/' + String(format || 'mp4').toLowerCase().replace(/[^a-z0-9]+/g, '') + ';base64,';
  };

  App.splitB64 = function (data) {
    var i = data.indexOf(',');
    var body = i > -1 ? data.slice(i + 1) : data;
    var parts = [];
    for (var p = 0; p < body.length; p += App.VIDEO_CHUNK_LEN) parts.push(body.slice(p, p + App.VIDEO_CHUNK_LEN));
    return parts;
  };

  // Turns the `media/{id}` node (keys m0…m5, chunked videos carry `ch`)
  // back into an ordered array the pages can render.
  App.hydrateMedia = function (raw) {
    if (!raw) return [];
    var keys = [];
    if (Array.isArray(raw)) {
      for (var a = 0; a < raw.length; a++) keys.push(String(a));
    } else {
      keys = Object.keys(raw);
    }
    keys.sort(function (x, y) {
      var nx = parseInt(String(x).replace(/\D/g, ''), 10) || 0;
      var ny = parseInt(String(y).replace(/\D/g, ''), 10) || 0;
      return nx - ny;
    });
    var out = [];
    keys.forEach(function (k) {
      var m = raw[k];
      if (!m || typeof m !== 'object') return;
      if (m.chunked && m.ch && typeof m.ch === 'object') {
        var cn = Object.keys(m.ch).sort(function (x, y) { return (Number(x) || 0) - (Number(y) || 0); });
        if (!cn.length) return;
        var copy = {};
        for (var kk in m) if (kk !== 'ch' && kk !== '_b64') copy[kk] = m[kk];
        var body = '';
        for (var n = 0; n < cn.length; n++) body += m.ch[cn[n]];
        copy.url = (m.head || m.mime || App.videoHead(m.format, '')) + body;
        copy.hydrated = true;
        out.push(copy);
        return;
      }
      if (m.url || m.thumb) out.push(m);
    });
    return out;
  };

  // Icon support: emoji text, "prefix:name" (Iconify CDN) or a full https data/URL.
  var ICON_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/i;

  App.iconKind = function (icon) {
    var v = String(icon == null ? '' : icon).trim();
    if (!v) return 'none';
    if (/^(https?:|data:image\/)/i.test(v)) return 'url';
    if (ICON_RE.test(v)) return 'iconify';
    return 'emoji';
  };

  App.iconSrc = function (icon) {
    var v = String(icon == null ? '' : icon).trim();
    if (!v) return '';
    if (App.iconKind(v) === 'iconify') {
      var parts = v.split(':');
      return 'https://api.iconify.design/' + parts[0] + '/' + parts[1] + '.svg?color=%23111827';
    }
    return v;
  };

  // Renders an icon so every surface (tabs, drawer, cards, admin nav) looks the same.
  App.iconHTML = function (icon, cls) {
    var kind = App.iconKind(icon);
    var c = cls ? ' ' + App.esc(cls) : '';
    if (kind === 'none') return '<span class="ico ico-emoji' + c + '" aria-hidden="true">🛍️</span>';
    if (kind === 'emoji') return '<span class="ico ico-emoji' + c + '" aria-hidden="true">' + App.esc(icon) + '</span>';
    return '<img class="ico ico-img' + c + '" src="' + App.esc(App.iconSrc(icon)) + '" alt="" aria-hidden="true" loading="lazy" decoding="async">';
  };

  // ---- Branding (logo / banner / loading screen) managed from the admin panel ----
  var BRAND_DEFAULTS = {
    logo: 'assets/shop-logo.webp',
    banner: 'assets/shop-banner.webp',
    loading: 'assets/shop-logo.webp',
    favicon: 'assets/shop-logo.webp'
  };

  App.branding = function () {
    var b = (App.state.config && App.state.config.branding) || {};
    var out = {};
    for (var k in BRAND_DEFAULTS) out[k] = (typeof b[k] === 'string' && b[k]) ? b[k] : BRAND_DEFAULTS[k];
    return out;
  };

  App.applyBranding = function () {
    var b = App.branding();

    $$('[data-brand="logo"]').forEach(function (img) {
      if (img.getAttribute('src') !== b.logo) img.setAttribute('src', b.logo);
    });
    $$('[data-brand="loading"]').forEach(function (img) {
      if (img.getAttribute('src') !== b.loading) img.setAttribute('src', b.loading);
    });

    var hero = $('.shop-hero img');
    if (hero && hero.getAttribute('src') !== b.banner) hero.setAttribute('src', b.banner);

    var icon = $('link[rel="icon"]');
    if (icon && icon.getAttribute('href') !== b.favicon) icon.setAttribute('href', b.favicon);
  };

  App.haversine = function (lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  App.deliveryFee = function (km) {
    var tiers = App.cfg().deliveryTiers || App.defaults.deliveryTiers;
    if (km == null || !isFinite(km)) km = 999;
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      var max = t.maxKm;
      if (max == null || km <= max) return Number(t.fee) || 0;
    }
    return 5;
  };

  App.cartKey = 'sc_cart';

  // The basket follows the signed-in account: one key per Google uid, plus a
  // copy in the database so the same basket shows up on every device.
  App.cartKeyFor = function (uid) { return uid ? 'sc_cart_' + uid : 'sc_cart'; };
  App.currentUid = function () {
    try {
      var p = window.AppAuth && AppAuth.profile && AppAuth.profile();
      return (p && p.uid) || null;
    } catch (e) { return null; }
  };
  App.cartKeyNow = function () { return App.cartKeyFor(App.currentUid()); };
  // Same idea for every other checkout scrap we keep on the device.
  App.scopedKey = function (base) {
    var uid = App.currentUid();
    return uid ? base + '_' + uid : base;
  };

  function readCartKey(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  // `stamp` records WHEN this basket last changed on this device, so a stale
  // cloud copy can never be mistaken for the newer one. Pass false when the
  // value came FROM the cloud (it must not look like a fresh local edit).
  function writeCartKey(key, arr, stamp) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    if (stamp === false) return;
    try { localStorage.setItem(key + '__at', String(Date.now())); } catch (e) {}
  }
  function readCartAt(key) {
    try { return Number(localStorage.getItem(key + '__at') || 0) || 0; } catch (e) { return 0; }
  }

  var cartPushTimer = null;
  var cartDirty = false;

  // "Buy Now" navigates a few hundred milliseconds later, which used to kill
  // the debounced upload: the next page then pulled an OLD cloud basket and
  // wiped the item that had just been added. Flush the current basket now.
  function flushCartToCloud() {
    if (cartPushTimer) { clearTimeout(cartPushTimer); cartPushTimer = null; }
    var uid = App.currentUid();
    if (!uid || !App.DB || typeof firebase === 'undefined') { cartDirty = false; return; }
    var items = App.Cart.list();
    cartDirty = false;
    App.DB.ref('stats/carts/' + uid).set({
      fid: App.fbUid || '',
      items: items,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      cartDirty = false;
    }).catch(function () {
      cartDirty = true;
    });
  }
  function scheduleCartFlush() {
    cartDirty = true;
    clearTimeout(cartPushTimer);
    cartPushTimer = setTimeout(flushCartToCloud, 250);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', function () { if (cartDirty || cartPushTimer) flushCartToCloud(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && (cartDirty || cartPushTimer)) flushCartToCloud();
    });
  }

  App.Cart = {
    list: function () {
      return readCartKey(App.cartKeyNow());
    },
    save: function (arr) {
      writeCartKey(App.cartKeyNow(), arr);
      App.updateCartBadge();
      App.Cart.pushToCloud();
      App.fire('cart');
    },
    flushCloud: flushCartToCloud,
    add: function (p, qty) {
      var arr = App.Cart.list();
      var found = null;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === p.id) found = arr[i];
      var chk = App.stockCheck(p, found ? (found.qty || 1) : 0);
      if (!chk.ok) { App.toast(chk.msg, 'err'); return null; }
      var m = App.firstMedia(p);
      var image = p.mini || p.thumb || (m ? App.mediaThumb(m, 300) : '');
      var want = (found ? (found.qty || 1) : 0) + (qty || 1);
      if (chk.max !== null && want > chk.max) want = chk.max;
      if (found) {
        found.qty = want;
        found.price = p.price;
        found.name = p.name;
        if (image) found.image = image;
      } else {
        arr.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: want, image: image });
      }
      App.Cart.save(arr);
      return arr;
    },
    reset: function (p, qty) {
      var chk = App.stockCheck(p, 0);
      if (!chk.ok) { App.toast(chk.msg, 'err'); return null; }
      var m = App.firstMedia(p);
      var n = Math.max(1, Number(qty) || 1);
      if (chk.max !== null && n > chk.max) n = chk.max;
      App.Cart.save([{
        id: p.id, name: p.name, price: Number(p.price) || 0,
        qty: n, image: p.mini || p.thumb || (m ? App.mediaThumb(m, 300) : '')
      }]);
      return App.Cart.list();
    },
    setQty: function (id, qty) {
      var arr = App.Cart.list();
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          var want = Math.max(1, Math.min(99, qty));
          var p = App.getProduct(id);
          var chk = p ? App.stockCheck(p, 0) : { ok: true, max: null };
          if (chk.max !== null && want > chk.max) {
            want = Math.max(1, chk.max);
            App.toast('Only ' + chk.max + ' of these in stock', 'err');
          }
          arr[i].qty = want;
        }
      }
      App.Cart.save(arr);
    },
    remove: function (id) {
      App.Cart.save(App.Cart.list().filter(function (x) { return x.id !== id; }));
    },
    removeIds: function (ids) {
      App.Cart.save(App.Cart.list().filter(function (x) { return ids.indexOf(x.id) === -1; }));
    },
    clear: function () { App.Cart.save([]); },
    count: function () {
      return App.Cart.list().reduce(function (s, x) { return s + (x.qty || 1); }, 0);
    },
    // Re-attach product ids to baskets saved by older builds (they stored no id,
    // which made the quantity stepper and selection checkboxes dead).
    repair: function () {
      var arr = App.Cart.list();
      if (!arr.length) return;
      var byName = {};
      App.prodList().forEach(function (p) { if (p.name && !byName[p.name]) byName[p.name] = p; });
      var changed = false;
      arr.forEach(function (it) {
        var bad = it.id === undefined || it.id === null || it.id === '' || it.id === 'undefined';
        if (!bad) return;
        var p = byName[it.name];
        it.id = p ? p.id : ('x' + String(it.name || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40));
        if (!(it.qty > 0)) it.qty = 1;
        changed = true;
      });
      if (changed) App.Cart.save(arr);
    },
    // A basket line keeps the price it was added at, which silently goes stale
    // whenever the shop edits a product. Re-base every line on the live
    // catalogue so the basket, the subtotal and the saved order all agree.
    syncPrices: function () {
      var arr = App.Cart.list();
      if (!arr.length) return false;
      var changed = false;
      arr.forEach(function (it) {
        var p = App.getProduct(it.id);
        if (!p) return;
        var np = Number(p.price);
        if (isFinite(np) && Number(it.price) !== np) { it.price = np; changed = true; }
        if (p.name && it.name !== p.name) { it.name = p.name; changed = true; }
        var m = App.firstMedia(p);
        var img = p.mini || p.thumb || (m ? App.mediaThumb(m, 300) : '');
        if (img && it.image !== img) { it.image = img; changed = true; }
      });
      if (changed) App.Cart.save(arr);
      return changed;
    }
  };

  // Always resolve a basket line against the LIVE catalogue first, then fall
  // back to the price stored on the line itself.
  App.linePrice = function (item) {
    var p = item ? App.getProduct(item.id) : null;
    if (p && p.price !== undefined && p.price !== null && p.price !== '') {
      var v = Number(p.price);
      if (isFinite(v)) return v;
    }
    return Number(item && item.price) || 0;
  };

  App.Cart.pushToCloud = function () {
    var uid = App.currentUid();
    if (!uid || !App.DB || typeof firebase === 'undefined') return;
    scheduleCartFlush();
  };

  App.Cart.pullFromCloud = function () {
    var uid = App.currentUid();
    if (!uid || !App.DB) return Promise.resolve();
    // A local edit is still on its way up — never let a stale download win.
    if (cartDirty) { flushCartToCloud(); return Promise.resolve(); }
    var key = App.cartKeyFor(uid);
    return App.DB.ref('stats/carts/' + uid).once('value').then(function (s) {
      if (App.currentUid() !== uid) return;
      var v = s.val();
      var raw = v && v.items;
      var items = null;
      if (Array.isArray(raw)) items = raw;
      else if (raw && typeof raw === 'object') {
        items = Object.keys(raw).sort().map(function (k) { return raw[k]; });
      }
      var local = readCartKey(key);

      // Nothing (or an emptied basket) in the cloud: the local basket is the
      // source of truth. Wiping it here is what made "Buy Now" vanish.
      if (!v || !items || !items.length) {
        if (local.length) flushCartToCloud();
        App.updateCartBadge();
        App.fire('cart');
        return;
      }
      if (!local.length) { writeCartKey(key, items, false); }
      else if ((Number(v.updatedAt) || 0) >= readCartAt(key)) writeCartKey(key, items, false);
      else { flushCartToCloud(); return; }

      App.Cart.repair();
      App.updateCartBadge();
      App.fire('cart');
    }).catch(function () {});
  };

  // Move the basket between the guest key and the signed-in account key so a
  // customer never loses what they picked up before signing in.
  var lastCartUid = null;
  function rekeyCart() {
    var uid = App.currentUid();
    if (uid === lastCartUid) return;
    lastCartUid = uid;
    if (uid) {
      var mine = readCartKey(App.cartKeyFor(uid));
      var guest = readCartKey('sc_cart');
      if (guest.length && !mine.length) writeCartKey(App.cartKeyFor(uid), guest);
      ['sc_buyer', 'sc_order_draft'].forEach(function (base) {
        var mineV = null;
        try { mineV = localStorage.getItem(base + '_' + uid); } catch (e) {}
        if (mineV) return;
        var guestV = null;
        try { guestV = localStorage.getItem(base); } catch (e) {}
        if (guestV) { try { localStorage.setItem(base + '_' + uid, guestV); } catch (e) {} }
      });
      if (uid && App.DB) App.Cart.pullFromCloud();
    }
    App.Cart.repair();
    App.updateCartBadge();
    App.fire('cart');
  }

  App.orderStatus = function (o) {
    var s = (o && o.status) ? String(o.status) : '';
    if (!s || s === 'pending' || s === 'awaiting') return 'new';
    if (s === 'shipped') return 'shipped';
    return s;
  };

  App.updateCartBadge = function () {
    var el = $('#cartN');
    if (!el) return;
    var n = App.Cart.count();
    el.textContent = n > 99 ? '99+' : n;
    el.className = 'cart-n' + (n ? '' : ' hide');
  };

  function readDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('Cannot read file')); };
      fr.readAsDataURL(file);
    });
  }

  function compressImage(file, maxEdge, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 1;
          var h = img.naturalHeight || 1;
          var scale = Math.min(1, maxEdge / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          var t = 'image/jpeg';
          try {
            if (c.toDataURL('image/webp').indexOf('data:image/webp') === 0) t = 'image/webp';
          } catch (e1) {}
          resolve(c.toDataURL(t, quality));
        } catch (e) { reject(new Error('Cannot process image')); }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Cannot read image file'));
      };
      img.src = url;
    });
  }

  function videoPoster(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      var done = false;
      var out = '';
      function finish() {
        if (done) return;
        done = true;
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(out);
      }
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.onloadeddata = function () { try { v.currentTime = 0.1; } catch (e) { finish(); } };
      v.onseeked = function () {
        try {
          var w = v.videoWidth || 480;
          var h = v.videoHeight || 480;
          var scale = Math.min(1, 480 / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          out = c.toDataURL('image/webp', 0.72) || '';
        } catch (e) {}
        finish();
      };
      v.onerror = function () { finish(); };
      setTimeout(finish, 7000);
      v.src = url;
    });
  }

  App.makeVariant = function (dataUrl, maxEdge, quality) {
    return new Promise(function (resolve, reject) {
      if (!dataUrl) { resolve(''); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 1;
          var h = img.naturalHeight || 1;
          var scale = Math.min(1, maxEdge / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var t = 'image/jpeg';
          try {
            if (c.toDataURL('image/webp').indexOf('data:image/webp') === 0) t = 'image/webp';
          } catch (e1) {}
          resolve(c.toDataURL(t, quality));
        } catch (e) { resolve(''); }
      };
      img.onerror = function () { resolve(''); };
      img.src = dataUrl;
    });
  };

  App.cloudUpload = function (file, onProgress) {
    return new Promise(function (resolve, reject) {
      try {
        if (!file || !file.size) { reject(new Error('No file selected')); return; }
        var isVideo = /^video\//.test(file.type || '');
        if (!isVideo && !/^image\//.test(file.type || '')) {
          reject(new Error('Only images (JPG/PNG/WEBP) and videos (MP4/WEBM) are allowed'));
          return;
        }
        if (onProgress) onProgress(15);
        if (isVideo) {
          if (file.size > App.VIDEO_MAX_BYTES) {
            reject(new Error('Video too large (max 20 MB) — trim it or send a photo instead'));
            return;
          }
          videoPoster(file).then(function (poster) {
            if (onProgress) onProgress(60);
            return readDataURL(file).then(function (data) {
              if (onProgress) onProgress(100);
              var out = {
                type: 'video',
                url: data,
                thumb: poster,
                publicId: '',
                cloud: 'inline',
                format: String(file.name || '').split('.').pop() || 'mp4',
                bytes: file.size
              };
              if (data.length > App.VIDEO_CHUNK_LEN) {
                out.chunked = true;
                out._b64 = data;
                out.head = App.videoHead(out.format, data);
              }
              resolve(out);
            });
          }).catch(function (e) { reject(e); });
        } else {
          compressImage(file, 1400, 0.82).then(function (data) {
            if (onProgress) onProgress(100);
            resolve({
              type: 'image',
              url: data,
              publicId: '',
              cloud: 'inline',
              format: data.indexOf('data:image/webp') === 0 ? 'webp' : 'jpeg',
              bytes: Math.round(data.length * 0.75)
            });
          }).catch(function (e) { reject(e); });
        }
      } catch (e) { reject(e); }
    });
  };

  // Formatted WhatsApp order card — reads like a receipt, not a wall of text.
  App.buildWaMessage = function (o, cfg, withPhotos) {
    var L = [];
    var rule = '━━━━━━━━━━━━━━━━';
    var items = o.items || [];
    var pay = o.paymentMethod === 'wamd' ? '📲 WAMD (prepaid)' : '💵 Cash on Delivery';
    var dist = o.distanceKm != null ? Number(o.distanceKm).toFixed(1) + ' km' : 'flat rate';

    L.push('*NEW ORDER*');
    L.push('*' + cfg.shopName + '*');
    L.push('Order ID: `' + String(o.id || '').slice(-8).toUpperCase() + '`');
    var when = Number(o.createdAt) || Date.now();
    try { L.push('Time: ' + new Date(when).toLocaleString()); } catch (e) {}
    L.push(rule);

    L.push('*1. ITEMS*');
    items.forEach(function (it, i) {
      var lineTotal = Number(it.price) * Number(it.qty);
      L.push((i + 1) + '. ' + it.name);
      L.push('   ' + Number(it.qty || 1) + ' x ' + App.fmtKD(it.price) + ' = *' + App.fmtKD(lineTotal) + '*');
    });

    L.push(rule);
    L.push('*2. BILL*');
    L.push('Subtotal: ' + App.fmtKD(o.subtotal));
    L.push('Delivery (' + dist + '): ' + App.fmtKD(o.deliveryFee));
    L.push('*TOTAL: ' + App.fmtKD(o.total) + '*');
    L.push('Payment: ' + pay);

    L.push(rule);
    L.push('*3. CUSTOMER*');
    L.push('Name: *' + (o.customer && o.customer.name ? o.customer.name : '—') + '*');
    L.push('Phone: ' + (o.customer && o.customer.phone ? o.customer.phone : '—'));
    L.push('Address: ' + (o.customer && o.customer.address ? o.customer.address : 'not specified'));
    if (o.customer && o.customer.lat != null) {
      L.push('📍 https://maps.google.com/?q=' + o.customer.lat + ',' + o.customer.lng);
    }

    if (o.paymentScreenshot) {
      L.push(rule);
      L.push(withPhotos
        ? '📸 The payment screenshot travels with this message.'
        : '📸 Payment screenshot saved with this order — open it in the admin panel.');
    }
    if (withPhotos) {
      L.push('📷 The product photo travels with this message.');
    }
    L.push('');
    L.push('_Sent automatically from the shop website._');
    return L.join('\n');
  };

  App.waLink = function (num, text) {
    var n = String(num || '').replace(/[^0-9]/g, '');
    if (!n) return null;
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
  };

  function headerHTML() {
    return '' +
      '<div class="offline-bar" id="offlineBar">Live connection is slow or offline — showing saved info. Check your internet.</div>' +
      '<header class="topbar"><div class="wrap top-in">' +
        '<button class="ic-btn" id="menuBtn" aria-label="Open menu"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>' +
        '<a class="brand" href="index.html"><img data-brand="logo" src="assets/shop-logo.webp" alt="logo"><span id="tbName"></span></a>' +
        '<div class="top-r">' +
          '<div id="google_translate_element"></div>' +
          '<div class="tr-wrap">' +
            '<button class="ic-btn" id="trBtn" aria-label="Translate" title="Translate"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg><span class="tr-cur" id="trCur">EN</span></button>' +
            '<div class="tr-menu" id="trMenu" hidden>' +
              '<div class="tr-t">Choose language</div>' +
              '<button data-lang="en"><span>🇬🇧 English</span><b>EN</b></button>' +
              '<button data-lang="ar"><span>🇸🇦 العربية</span><b>AR</b></button>' +
              '<button data-lang="ur"><span>🇵🇰 اردو</span><b>UR</b></button>' +
              '<button data-lang="hi"><span>🇮🇳 हिन्दी</span><b>HI</b></button>' +
              '<button data-lang="fa"><span>🇮🇷 فارسی</span><b>FA</b></button>' +
              '<button data-lang="tr"><span>🇹🇷 Türkçe</span><b>TR</b></button>' +
            '</div>' +
          '</div>' +
          '<a class="ic-btn acct-btn" id="acctBtn" href="profile.html" aria-label="My account"><span class="acct-av" id="acctAv"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.4" r="3.7"/><path d="M4.9 20.2a7.3 7.3 0 0 1 14.2 0"/></svg></span></a>' +
          '<a class="ic-btn cart-btn" href="order.html" aria-label="Cart"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.6 12.2c.1.5.6.8 1 .8h8.9c.5 0 .9-.3 1-.8L21 8H7"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg><span class="cart-n hide" id="cartN">0</span></a>' +
        '</div>' +
      '</div></header>' +
      '<div class="drawer-mask" id="drawerMask"></div>' +
      '<aside class="drawer" id="drawer">' +
        '<div class="dr-head">' +
          '<img data-brand="logo" src="assets/shop-logo.webp" alt="">' +
          '<div><b id="drName"></b><small id="drSub"></small></div>' +
          '<button class="dr-close" id="drClose" aria-label="Close">&#10005;</button>' +
        '</div>' +
        '<div class="dr-body">' +
        '<nav>' +
          '<div class="d-label">Account</div>' +
          '<a href="profile.html" id="drAcct"><span class="d-ico" id="drAcctI">&#128100;</span> <span id="drAcctT">Sign in</span><span class="d-go" aria-hidden="true">&#8250;</span></a>' +
          '<a href="myorders.html" id="drOrders"><span class="d-ico">&#128230;</span> <span>My Orders</span><span class="dr-badge hide" id="drOrdersN">0</span><span class="d-go" aria-hidden="true">&#8250;</span></a>' +
          '<div class="d-label">Shop</div>' +
          '<a href="index.html"><span class="d-ico">&#127968;</span> <span>Home</span></a>' +
          '<a href="about.html"><span class="d-ico">&#8505;&#65039;</span> <span>About Us</span></a>' +
          '<a href="privacy.html"><span class="d-ico">&#128274;</span> <span>Privacy Policy</span></a>' +
          '<a href="report.html"><span class="d-ico">&#128203;</span> <span>Report an issue</span></a>' +
          '<a href="#" id="drTranslate"><span class="d-ico">&#127760;</span> <span>Translate</span></a>' +
          '<div class="d-label">Categories</div><div id="drCats"></div>' +
          '<div class="d-label">Contact</div>' +
          '<a id="drPhone" href="#"><span class="d-ico">&#128222;</span> <span></span></a>' +
          '<a id="drWa" href="#" target="_blank" rel="noopener"><span class="d-ico">&#128172;</span> <span>WhatsApp</span></a>' +
          '<a id="drMail" href="#" class="hide"><span class="d-ico">&#9993;&#65039;</span> <span></span></a>' +
        '</nav>' +
        '<div class="dr-foot">' +
          '<button type="button" class="dr-install" id="drInstall" hidden>' +
            '<span class="di-ic" aria-hidden="true">&#11015;&#65039;</span>' +
            '<span class="di-tx"><b id="drInstallT">Install app</b><small id="drInstallS">Add to your home screen</small></span>' +
          '</button>' +
          '<div class="dr-copy">&copy; by Rizwan</div>' +
        '</div>' +
        '</div>' +
      '</aside>';
  }

  function footerHTML() {
    return '' +
      '<footer class="site-foot">' +
        '<div class="wrap foot-grid">' +
          '<div class="f-col">' +
            '<img class="f-logo" data-brand="logo" src="assets/shop-logo.webp" alt="">' +
            '<b class="f-t" id="ftName"></b>' +
            '<p id="ftAddr" dir="auto"></p>' +
          '</div>' +
          '<div class="f-col">' +
            '<h4>Contact</h4>' +
            '<a id="ftPhone" href="#"><span>&#128222;</span> <span></span></a>' +
            '<a id="ftOwner" href="#"><span>&#128100;</span> <span></span></a>' +
            '<a id="ftMail" href="#" class="hide"><span>&#9993;&#65039;</span> <span></span></a>' +
            '<a id="ftWa" href="#" target="_blank" rel="noopener"><span>&#128172;</span> <span>WhatsApp</span></a>' +
          '</div>' +
          '<div class="f-col">' +
            '<h4>Quick Links</h4>' +
            '<a href="about.html"><span>&#8505;&#65039;</span> About Us</a>' +
            '<a href="privacy.html"><span>&#128274;</span> Privacy Policy</a>' +
            '<a href="#" id="ftTranslate"><span>&#127760;</span> Translate</a>' +
          '</div>' +
        '</div>' +
        '<div class="foot-bot">' +
          '<span>&copy; by Rizwan 2026</span>' +
        '</div>' +
      '</footer>';
  }

  function applyConfigUI() {
    var c = App.cfg();
    var setText = function (sel, v) { var el = $(sel); if (el) el.textContent = v || ''; };
    // Drawer/footer markup differs per page, so a span index may be missing.
    var setSpanText = function (el, idx, v) {
      if (!el) return;
      var sp = el.querySelectorAll('span');
      var t = sp[idx] || sp[sp.length - 1];
      if (t) t.textContent = v;
    };

    setText('#bnName', c.shopName);
    setText('#bnNameAr', c.shopNameAr);
    setText('#tbName', c.shopName);
    setText('#drName', c.shopName);
    setText('#drSub', c.address);
    setText('#ftName', c.shopName);

    var bnPhone = $('#bnPhone');
    if (bnPhone) {
      bnPhone.href = 'tel:' + String(c.phone).replace(/\s/g, '');
      $('span', bnPhone).textContent = c.phone;
    }
    var bnAddr = $('#bnAddr');
    if (bnAddr) {
      $('span', bnAddr).textContent = c.address + (c.addressAr ? ' • ' + c.addressAr : '');
    }

    var drPhone = $('#drPhone');
    if (drPhone) {
      drPhone.href = 'tel:' + String(c.phone).replace(/\s/g, '');
      var sp = drPhone.querySelectorAll('span');
      sp[sp.length - 1].textContent = 'Shop: ' + c.phone;
    }
    var drWa = $('#drWa');
    if (drWa) drWa.href = 'https://wa.me/' + String(c.ownerPhone || c.whatsappNumber).replace(/[^0-9]/g, '');
    var drMail = $('#drMail');
    if (drMail) {
      if (c.email) {
        drMail.href = 'mailto:' + c.email;
        drMail.className = '';
        setSpanText(drMail, 1, c.email);
      } else drMail.className = 'hide';
    }

    var ftPhone = $('#ftPhone');
    if (ftPhone) {
      ftPhone.href = 'tel:' + String(c.phone).replace(/\s/g, '');
      setSpanText(ftPhone, 1, 'Shop: ' + c.phone);
    }
    var ftOwner = $('#ftOwner');
    if (ftOwner) {
      ftOwner.href = 'tel:' + String(c.ownerPhone).replace(/[^\d+]/g, '');
      setSpanText(ftOwner, 1, 'Owner: ' + c.ownerPhone);
    }
    var ftMail = $('#ftMail');
    if (ftMail) {
      if (c.email) {
        ftMail.href = 'mailto:' + c.email;
        ftMail.className = '';
        setSpanText(ftMail, 1, c.email);
      } else ftMail.className = 'hide';
    }
    var ftWa = $('#ftWa');
    if (ftWa) ftWa.href = 'https://wa.me/' + String(c.ownerPhone || c.whatsappNumber).replace(/[^0-9]/g, '');
    setText('#ftAddr', c.address + (c.addressAr ? ' • ' + c.addressAr : ''));

    renderDrawerCats();
    App.applyBranding();
  }

  function renderDrawerCats() {
    var box = $('#drCats');
    if (!box) return;
    var cats = App.catList();
    if (!cats.length) { box.innerHTML = ''; return; }
    box.innerHTML = cats.map(function (c) {
      return '<a class="d-cat" href="index.html?cat=' + encodeURIComponent(c.id) + '">' +
        App.iconHTML(c.icon) + '<span>' + App.esc(c.name) + '</span></a>';
    }).join('');
  }

  // Google profile pictures can disappear or be blocked — fall back to a
  // letter tile instead of a broken-image icon.
  var imgFallbackBound = false;
  App.bindImgFallback = function () {
    if (imgFallbackBound) return;
    imgFallbackBound = true;
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-fb')) return;
      if (!img.parentNode) return;
      var span = document.createElement('span');
      span.className = (img.className || '') + ' img-fb';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = img.getAttribute('data-fb') || '?';
      img.parentNode.replaceChild(span, img);
    }, true);
  };

  function paintAuth(u) {
    var av = $('#acctAv');
    if (av) {
      av.innerHTML = (u && u.photo)
        ? '<img class="acct-img" src="' + App.esc(u.photo) + '" alt="" referrerpolicy="no-referrer" data-fb="' + App.esc((u.name || u.email || '?').charAt(0).toUpperCase()) + '">'
        : '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.4" r="3.7"/><path d="M4.9 20.2a7.3 7.3 0 0 1 14.2 0"/></svg>';
    }
    var btn = $('#acctBtn');
    if (btn) {
      btn.setAttribute('aria-label', u ? ('My account — ' + (u.name || u.email || '')) : 'Sign in to your account');
    }
    var di = $('#drAcctI'), dt = $('#drAcctT');
    if (di) {
      di.innerHTML = (u && u.photo)
        ? '<img class="d-img" src="' + App.esc(u.photo) + '" alt="" data-fb="' + App.esc((u.name || u.email || '?').charAt(0).toUpperCase()) + '">'
        : '&#128100;';
    }
    if (dt) {
      dt.textContent = u ? (u.name || u.email || 'My profile') : 'Sign in';
      dt.title = u ? (u.email || '') : 'Sign in with Google (optional)';
    }
  }

  function initDrawer() {
    var drawer = $('#drawer'), mask = $('#drawerMask');
    function open() { drawer.classList.add('on'); mask.classList.add('on'); }
    function close() { drawer.classList.remove('on'); mask.classList.remove('on'); }
    var mb = $('#menuBtn');
    if (mb) mb.addEventListener('click', open);
    var dc = $('#drClose');
    if (dc) dc.addEventListener('click', close);
    if (mask) mask.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  var TR_LANGS = ['en', 'ar', 'ur', 'hi', 'fa', 'tr'];

  function trDomains() {
    var host = location.hostname;
    var doms = [''];
    if (host.indexOf('.') > 0) doms.push('.' + host.split('.').slice(-2).join('.'));
    return doms;
  }

  function readTrLang() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
    if (!m) return 'en';
    var seg = decodeURIComponent(m[1]).split('/');
    return seg.length > 2 && seg[2] ? seg[2] : 'en';
  }

  function writeTrCookie(val, clear) {
    var ext = clear
      ? '; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      : '; expires=' + new Date(Date.now() + 365 * 864e5).toUTCString();
    trDomains().forEach(function (d) {
      document.cookie = 'googtrans=' + encodeURIComponent(val) + ext + '; path=/' + (d ? '; domain=' + d : '');
    });
  }

  function setTrLang(lang) {
    if (TR_LANGS.indexOf(lang) < 0 || lang === 'en') writeTrCookie('', true);
    else writeTrCookie('/en/' + lang, false);
    location.reload();
  }

  function syncTrUI() {
    var lang = readTrLang();
    var cur = $('#trCur');
    if (cur) cur.textContent = lang.toUpperCase();
    var menu = $('#trMenu');
    if (menu) {
      Array.prototype.forEach.call(menu.querySelectorAll('button[data-lang]'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-lang') === lang);
      });
    }
  }

  function openTrMenu() {
    var menu = $('#trMenu');
    if (!menu) return;
    menu.hidden = false;
    syncTrUI();
  }

  function closeTrMenu() {
    var menu = $('#trMenu');
    if (menu) menu.hidden = true;
  }

  function initTranslate() {
    var host = $('#google_translate_element');
    if (host && typeof window.googleTranslateElementInit !== 'function') {
      window.googleTranslateElementInit = function () {
        try {
          if (window.google && google.translate) {
            new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
          }
        } catch (e) { console.warn('translate init', e); }
      };
    }
    App.loadScript('https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit');

    syncTrUI();
    var tb = $('#trBtn');
    if (tb) tb.addEventListener('click', function (e) {
      e.stopPropagation();
      var m = $('#trMenu');
      if (!m) return;
      if (m.hidden) openTrMenu(); else closeTrMenu();
    });
    var menu = $('#trMenu');
    if (menu) menu.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-lang]');
      if (b) setTrLang(b.getAttribute('data-lang'));
    });
    document.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('.tr-wrap'))) closeTrMenu();
    });
    ['#drTranslate', '#ftTranslate'].forEach(function (sel) {
      var elx = $(sel);
      if (elx) elx.addEventListener('click', function (e) { e.preventDefault(); openTrMenu(); });
    });
  }

  App.hidePreloader = function () {
    var el = $('#preloader');
    if (el) el.classList.add('off');
  };

  function initPreloader() {
    var t0 = Date.now();
    function hide() {
      var wait = Math.max(0, 650 - (Date.now() - t0));
      setTimeout(App.hidePreloader, wait);
    }
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide);
    setTimeout(App.hidePreloader, 2600);
  }

  function showOffline(msg, retry) {
    var bar = $('#offlineBar');
    if (!bar) return;
    bar.innerHTML = '<span>' + (msg || 'Live connection is slow or offline — showing saved info. Check your internet.') + '</span>' +
      (retry ? ' <button type="button" class="off-retry" id="offRetry">Retry</button>' : '');
    bar.classList.add('on');
    if (retry) {
      var b = $('#offRetry');
      if (b) b.addEventListener('click', function () { location.reload(); });
    }
  }
  App.showOffline = showOffline;

  var FB_BASES = [
    'https://www.gstatic.com/firebasejs/10.12.5',
    'https://cdn.jsdelivr.net/npm/firebase@10.12.5',
    'https://unpkg.com/firebase@10.12.5',
    'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.12.5'
  ];

  function loadFbFile(file, cb) {
    var i = 0;
    (function next() {
      if (i >= FB_BASES.length) { cb(new Error('all CDNs failed: ' + file)); return; }
      App.loadScript(FB_BASES[i++] + '/' + file, function (err) {
        if (err) next(); else cb(null);
      });
    })();
  }

  function connectDB() {
    var DB = firebase.database();
    App.DB = DB;

    DB.ref('.info/connected').on('value', function (s) {
      App.connected = s.val() === true;
      if (App.connected) {
        var bar = $('#offlineBar');
        if (bar) bar.classList.remove('on');
      }
    });
    setTimeout(function () {
      if (!App.connected) showOffline('Live connection is slow — data may not have loaded.', true);
    }, 7000);

    DB.ref('config').on('value', function (s) {
      App.state.config = s.val() || null;
      App.loaded.config = true;
      // Subscribers (WAMD page, checkout payment step, …) must run even if a
      // piece of chrome on this page is missing — never let paint kill them.
      fire('config');
    try { applyConfigUI(); } catch (e) { console.error('configUI', e); }
    try { App.applySEO(); } catch (e) { console.error('seo', e); }
    }, function (e) { console.warn('config', e); showOffline('Cannot read live data: ' + (e.message || ''), true); });

    DB.ref('categories').on('value', function (s) {
      App.state.categories = s.val() || {};
      App.loaded.categories = true;
      renderDrawerCats();
      fire('categories');
    });

    DB.ref('products').on('value', function (s) {
      App.state.products = s.val() || {};
      App.loaded.products = true;
      fire('products');
    });

    // Live feed of the customer's OWN orders — powers the "My Orders" badge,
    // the tracker page and the assistant. The rules deny the whole orders
    // collection to shoppers, so we keep a tiny id list per account
    // (stats/myorders/{fid}) and attach one listener per order id.
    watchMyOrderIds(DB);

    trackVisitor(DB);
  }

  var myWatch = { idsRef: null, idsCb: null, rows: [], seen: {}, vals: {}, fid: '' };

  function detachMyOrderIds() {
    if (myWatch.idsRef && myWatch.idsCb) myWatch.idsRef.off('value', myWatch.idsCb);
    myWatch.idsRef = null;
    myWatch.idsCb = null;
    myWatch.rows.forEach(function (r) { r.ref.off('value', r.cb); });
    myWatch.rows = [];
    myWatch.seen = {};
    myWatch.vals = {};
    myWatch.fid = '';
  }

  function publishMyOrders() {
    var all = [];
    for (var k in myWatch.vals) if (myWatch.vals[k]) all.push(myWatch.vals[k]);
    all.sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
    App.state.allOrders = all;
    App.state.myOrders = myOrdersFrom(all);
    paintMyOrdersBadge();
    fire('myOrders');
  }

  function attachMyOrder(id) {
    if (!id || myWatch.seen[id]) return;
    myWatch.seen[id] = 1;
    var ref = App.DB.ref('orders/' + id);
    var cb = function (s) {
      var v = s.val();
      if (!v) delete myWatch.vals[id];
      else { if (!v.id) v.id = id; myWatch.vals[id] = v; }
      publishMyOrders();
    };
    myWatch.rows.push({ ref: ref, cb: cb });
    ref.on('value', cb, function (e) { console.warn('order', id, e); });
  }

  function syncMyOrders() {
    if (!App.DB || App.fbUid === myWatch.fid) return;
    watchMyOrderIds(App.DB);
  }

  function watchMyOrderIds(DB) {
    detachMyOrderIds();
    App.state.allOrders = [];
    App.state.myOrders = [];
    var fid = App.fbUid || '';
    if (!fid) { paintMyOrdersBadge(); fire('myOrders'); return; }
    var cb = function (s) {
      var ids = [];
      s.forEach(function (ch) { if (ch.key) ids.push(ch.key); });
      ids.slice(-60).forEach(attachMyOrder);
      publishMyOrders();
    };
    myWatch.fid = fid;
    myWatch.idsRef = DB.ref('stats/myorders/' + fid);
    myWatch.idsCb = cb;
    myWatch.idsRef.on('value', cb, function (e) { console.warn('myorders', e); });
  }

  function myOrdersFrom(all) {
    var uid = App.currentUid();
    var fid = App.fbUid || '';
    if (!uid && !fid) return [];
    return (all || []).filter(function (o) {
      return (!!uid && o.uid === uid) || (!!fid && o.fid === fid);
    });
  }

  // The nav badge is a NOTIFICATION, not a running total: it counts orders the
  // customer has not opened yet, or whose status changed since they last
  // looked. Opening "My Orders" marks everything seen, so the red dot clears.
  function ordersSeenKey() { return 'sc_orders_seen_' + (App.currentUid() || 'anon'); }
  function readOrdersSeen() {
    try { return JSON.parse(localStorage.getItem(ordersSeenKey()) || '{}') || {}; } catch (e) { return {}; }
  }
  function unseenOrderCount() {
    var seen = readOrdersSeen();
    return (App.state.myOrders || []).reduce(function (n, o) {
      var id = String(o.id || '');
      var st = String(o.status || 'new');
      return n + (seen[id] !== st ? 1 : 0);
    }, 0);
  }
  function paintMyOrdersBadge() {
    var el = $('#drOrdersN');
    if (!el) return;
    var n = unseenOrderCount();
    el.textContent = n > 99 ? '99+' : n;
    el.className = 'dr-badge' + (n ? '' : ' hide');
  }
  App.markOrdersSeen = function () {
    var seen = readOrdersSeen();
    (App.state.myOrders || []).forEach(function (o) {
      seen[String(o.id || '')] = String(o.status || 'new');
    });
    try { localStorage.setItem(ordersSeenKey(), JSON.stringify(seen)); } catch (e) {}
    paintMyOrdersBadge();
  };

  function trackVisitor(DB) {
    if (App.cfg().visitorCountingEnabled !== true) return;
    var vid;
    try {
      vid = localStorage.getItem('sc_vid');
      if (!vid) {
        vid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
          'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('sc_vid', vid);
      }
    } catch (e) { vid = 'v' + Date.now().toString(36); }

    var last = 0;
    function beat(increment) {
      var now = Date.now();
      if (!increment && now - last < 30000) return;
      last = now;
      DB.ref('stats/visitors/' + vid.replace(/[.#$[\]]/g, '_')).transaction(function (cur) {
        if (!cur) return { firstSeen: now, lastSeen: now, views: 1 };
        return {
          firstSeen: cur.firstSeen || now,
          lastSeen: now,
          views: (cur.views || 0) + (increment ? 1 : 0)
        };
      });
    }
    beat(true);
    window.addEventListener('focus', function () { beat(false); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(false); });
  }

  function loadFirebase() {
    if (App.fbTried) return;
    App.fbTried = true;

    var cfg = (window.APP_CONFIG && APP_CONFIG.firebase) || {};
    if (!cfg.apiKey || !cfg.databaseURL) {
      showOffline('App config missing — live data disabled.');
      return;
    }

    loadFbFile('firebase-app-compat.js', function (e1) {
      if (e1) { showOffline('Cannot load Firebase — check your internet or ad-blocker.', true); return; }
      loadFbFile('firebase-auth-compat.js', function () {
        loadFbFile('firebase-database-compat.js', function (e2) {
          if (e2) { showOffline('Cannot load Firebase database module.', true); return; }
          try {
            firebase.initializeApp(cfg);
            // Anonymous sign-in is what unlocks read access to this customer's
            // own orders (the database rules require auth != null).
            startAnonAuth(function () { connectDB(); fire('fbReady'); });
          } catch (e) {
            console.error(e);
            showOffline('Firebase init error: ' + e.message, true);
          }
        });
      });
    });
  }

  function setFbUid(u) {
    var uid = (u && u.uid) || '';
    var anon = !!(u && u.isAnonymous);
    if (App.fbUid === uid && App.fbAnon === anon) return;
    App.fbUid = uid;
    App.fbAnon = anon;
    fire('fbauth');
  }

  function startAnonAuth(done) {
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      done();
    }
    try {
      if (!firebase.auth) { finish(); return; }
      var a = firebase.auth();
      if (!a.signInAnonymously) { finish(); return; }
      a.onAuthStateChanged(function (u) {
        if (u) { setFbUid(u); finish(); }
      }, function () { finish(); });
      a.signInAnonymously().then(function (cred) {
        if (cred && cred.user) setFbUid(cred.user);
        finish();
      }).catch(function (e) {
        App.fbAuthError = (e && (e.message || e.code)) || 'sign-in failed';
        console.warn('anonymous sign-in', App.fbAuthError);
        setTimeout(finish, 300);
      });
      setTimeout(finish, 4000);
    } catch (e) {
      App.fbAuthError = e && e.message;
      finish();
    }
  }

  // --- PWA: manifest + service worker + install entry points --------
  var deferredInstall = null;
  var pwaBar = null;

  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  }

  function hideBar(persist) {
    if (pwaBar && pwaBar.parentNode) pwaBar.parentNode.removeChild(pwaBar);
    pwaBar = null;
    if (persist) { try { localStorage.setItem('sc_pwa_dismissed', '1'); } catch (e) {} }
  }

  // The drawer always carries an Install entry — it must not depend on the
  // floating banner being undismissed.
  function paintInstallBtn() {
    var b = $('#drInstall');
    if (!b) return;
    b.hidden = false;
    var t = $('#drInstallT'), s = $('#drInstallS');
    var installed = isStandalone();
    b.classList.toggle('done', installed);
    if (installed) {
      if (t) t.textContent = 'App installed ✓';
      if (s) s.textContent = 'Open it from your home screen';
    } else if (!window.isSecureContext) {
      // Phones only allow a real install on https. Say so instead of sending
      // the customer to a browser menu that only makes a bookmark.
      if (t) t.textContent = 'Install needs the https link';
      if (s) s.textContent = 'Open https://fixandfit.store, then install';
      b.classList.add('blocked');
    } else {
      if (t) t.textContent = 'Install app';
      if (s) s.textContent = deferredInstall
        ? 'One tap — add to your home screen'
        : 'Browser menu → Add to Home screen';
      b.classList.remove('blocked');
    }
  }

  App.pwaInstallSupported = function () { return !!deferredInstall; };
  App.pwaInstalled = isStandalone;

  App.installPWA = function () {
    try {
      if (isStandalone()) { App.toast('The shop app is already installed ✓', 'ok'); return; }
      if (deferredInstall) {
        var ev = deferredInstall;
        deferredInstall = null;
        try { ev.prompt(); } catch (e) {}
        if (ev.userChoice && ev.userChoice.then) {
          ev.userChoice.then(function (res) {
            if (res && res.outcome === 'accepted') App.toast('Installing… it will appear on your home screen ✓', 'ok');
            hideBar(true); paintInstallBtn();
          });
        } else { hideBar(true); paintInstallBtn(); }
        return;
      }
      if (!window.isSecureContext) {
        App.toast('This page is on http — phones only install apps from https. Open https://fixandfit.store', 'err');
        return;
      }
      App.toast(isIOS()
        ? 'Tap Share ⬆ then “Add to Home Screen”'
        : 'Open your browser menu → “Add to Home screen”', 'ok');
    } catch (e) { console.warn('pwa install', e); }
  };

  function initPWA() {
    try {
      var head = document.head || document.getElementsByTagName('head')[0];

      if (head && !document.querySelector('link[rel="manifest"]')) {
        var lk = document.createElement('link');
        lk.rel = 'manifest';
        lk.href = 'manifest.webmanifest';
        head.appendChild(lk);
      }
      if (head && !document.querySelector('link[rel="apple-touch-icon"]')) {
        var at = document.createElement('link');
        at.rel = 'apple-touch-icon';
        at.href = 'assets/icon-192.png';
        head.appendChild(at);
      }
      ['apple-mobile-web-app-capable|yes', 'mobile-web-app-capable|yes',
       'apple-mobile-web-app-status-bar-style|black-translucent',
       'application-name|Sit Cover Shop'].forEach(function (pair) {
        var bits = pair.split('|');
        if (head && !document.querySelector('meta[name="' + bits[0] + '"]')) {
          var mt = document.createElement('meta');
          mt.name = bits[0];
          mt.content = bits[1];
          head.appendChild(mt);
        }
      });

      if (!window.__DISABLE_SW && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        window.addEventListener('load', function () {
          try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
        });
      }

      var standalone = isStandalone();

      function dismissed() {
        try { return localStorage.getItem('sc_pwa_dismissed') === '1'; } catch (e) { return false; }
      }
      function showBar() {
        if (pwaBar || dismissed() || standalone) return;
        if (!window.isSecureContext) return;   // no real install on http
        var manual = isIOS() && !deferredInstall;
        if (!deferredInstall && !manual) return;
        pwaBar = document.createElement('div');
        pwaBar.className = 'pwa-bar';
        pwaBar.setAttribute('role', 'status');
        pwaBar.innerHTML =
          '<span class="pwa-ic" aria-hidden="true">📲</span>' +
          '<span class="pwa-tx"><b>Install the shop app</b><small>Add it to your home screen</small></span>' +
          '<button type="button" class="pwa-go">' + (manual ? 'How?' : 'Install') + '</button>' +
          '<button type="button" class="pwa-x" aria-label="Dismiss install banner">✕</button>';
        document.body.appendChild(pwaBar);
        pwaBar.querySelector('.pwa-x').addEventListener('click', function () { hideBar(true); });
        pwaBar.querySelector('.pwa-go').addEventListener('click', function () { App.installPWA(); });
      }

      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstall = e;
        paintInstallBtn();
        showBar();
      });
      window.addEventListener('appinstalled', function () {
        hideBar(true);
        deferredInstall = null;
        paintInstallBtn();
        try { App.toast('Shop app installed ✓ Look for it on your home screen', 'ok'); } catch (e) {}
      });
      if (isIOS() && !standalone) setTimeout(showBar, 2500);
      paintInstallBtn();

      var db = $('#drInstall');
      if (db) db.addEventListener('click', function () { App.installPWA(); });
    } catch (e) { console.warn('pwa', e); }
  }

  // Full-screen image viewer — the profile photo and any thumbnail can be
  // opened at full size with one tap.
  var imgView = null;
  App.viewImage = function (src, alt) {
    if (!src) { App.toast('No photo to show yet', 'err'); return; }
    if (!imgView) {
      imgView = document.createElement('div');
      imgView.className = 'img-view';
      imgView.setAttribute('role', 'dialog');
      imgView.setAttribute('aria-label', 'Photo viewer');
      imgView.innerHTML = '<img alt="" referrerpolicy="no-referrer"><button type="button" class="img-view-x" aria-label="Close photo">&#10005;</button>';
      imgView.addEventListener('click', function () { imgView.classList.remove('on'); });
      document.body.appendChild(imgView);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && imgView.classList.contains('on')) imgView.classList.remove('on');
      });
    }
    var img = imgView.querySelector('img');
    img.src = src;
    img.alt = alt || 'Photo';
    imgView.classList.add('on');
  };

  App.boot = function () {
    var h = $('#siteHeader');
    if (h) {
      h.innerHTML = headerHTML();
      var tb = h.querySelector('.topbar');
      if (tb && h.parentNode) h.parentNode.insertBefore(tb, h.nextSibling);
    }
    var f = $('#siteFooter');
    if (f) f.innerHTML = footerHTML();

    try { applyConfigUI(); } catch (e) { console.error('configUI', e); }
    try { App.applySEO(); } catch (e) { console.error('seo', e); }
    initDrawer();
    initTranslate();
    initPreloader();
    App.bindImgFallback();
    App.Cart.repair();
    App.updateCartBadge();
    paintAuth(App.state.auth);
    App.on('auth', paintAuth);
    App.on('auth', function () {
      rekeyCart();
      syncMyOrders();
      if (App.state.allOrders) {
        App.state.myOrders = myOrdersFrom(App.state.allOrders);
        paintMyOrdersBadge();
        fire('myOrders');
      }
    });
    loadFirebase();

    App.on('products', function () { App.Cart.repair(); App.Cart.syncPrices(); App.updateCartBadge(); });
    App.on('config', function () { App.applyBranding(); });
    App.on('fbReady', function () { syncMyOrders(); if (App.currentUid()) App.Cart.pullFromCloud(); });
    App.on('fbauth', syncMyOrders);
    initPWA();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.boot);
  } else {
    App.boot();
  }
})();
