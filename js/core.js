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
    wamdNumber: '96599529389',
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
    ]
  };

  App.cfg = function () {
    var saved = App.state.config || {};
    var out = {};
    var k;
    for (k in App.defaults) out[k] = App.defaults[k];
    for (k in saved) if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
    return out;
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

  App.prodList = function () {
    var p = App.state.products || {};
    var arr = [];
    for (var id in p) {
      var o = p[id] || {};
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

  App.Cart = {
    list: function () {
      try {
        var v = JSON.parse(localStorage.getItem(App.cartKey) || '[]');
        return Array.isArray(v) ? v : [];
      } catch (e) { return []; }
    },
    save: function (arr) {
      localStorage.setItem(App.cartKey, JSON.stringify(arr));
      App.updateCartBadge();
    },
    add: function (p, qty) {
      var arr = App.Cart.list();
      var m = App.firstMedia(p);
      var image = p.mini || p.thumb || (m ? App.mediaThumb(m, 300) : '');
      var found = null;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === p.id) found = arr[i];
      if (found) {
        found.qty = (found.qty || 1) + (qty || 1);
        found.price = p.price;
        found.name = p.name;
        if (image) found.image = image;
      } else {
        arr.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: qty || 1, image: image });
      }
      App.Cart.save(arr);
      return arr;
    },
    reset: function (p, qty) {
      var m = App.firstMedia(p);
      App.Cart.save([{
        id: p.id, name: p.name, price: Number(p.price) || 0,
        qty: qty || 1, image: p.mini || p.thumb || (m ? App.mediaThumb(m, 300) : '')
      }]);
    },
    setQty: function (id, qty) {
      var arr = App.Cart.list();
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) {
          arr[i].qty = Math.max(1, Math.min(99, qty));
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
    }
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
          if (file.size > 2.5 * 1024 * 1024) {
            reject(new Error('Video too large (max 2.5 MB) — trim it or send a photo instead'));
            return;
          }
          videoPoster(file).then(function (poster) {
            if (onProgress) onProgress(60);
            return readDataURL(file).then(function (data) {
              if (onProgress) onProgress(100);
              resolve({
                type: 'video',
                url: data,
                thumb: poster,
                publicId: '',
                cloud: 'inline',
                format: String(file.name || '').split('.').pop() || 'mp4',
                bytes: file.size
              });
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

  App.buildWaMessage = function (o, cfg) {
    var lines = [];
    lines.push('*New Order* — ' + cfg.shopName);
    lines.push('Order: #' + String(o.id || '').slice(-8).toUpperCase());
    lines.push('');
    lines.push('*Items:*');
    (o.items || []).forEach(function (it, i) {
      lines.push((i + 1) + '. ' + it.name + ' x' + it.qty + ' — ' + App.fmtKD(Number(it.price) * Number(it.qty)));
    });
    lines.push('');
    lines.push('Subtotal: ' + App.fmtKD(o.subtotal));
    lines.push('Delivery (' + (o.distanceKm != null ? Number(o.distanceKm).toFixed(1) + ' km' : 'flat') + '): ' + App.fmtKD(o.deliveryFee));
    lines.push('*Total: ' + App.fmtKD(o.total) + '*');
    lines.push('Payment: ' + (o.paymentMethod === 'wamd' ? 'WAMD (prepaid)' : 'Cash on Delivery'));
    lines.push('');
    lines.push('*Customer:* ' + o.customer.name);
    lines.push('Phone: ' + o.customer.phone);
    lines.push('Location: ' + (o.customer.address || 'not specified'));
    if (o.customer.lat != null) {
      lines.push('Map: https://maps.google.com/?q=' + o.customer.lat + ',' + o.customer.lng);
    }
    if (o.paymentScreenshot) {
      lines.push('Payment screenshot uploaded — see it in the admin panel.');
    }
    return lines.join('\n');
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
        '<a class="brand" href="index.html"><img src="assets/shop-logo.webp" alt="logo"><span id="tbName"></span></a>' +
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
          '<a class="ic-btn cart-btn" href="order.html" aria-label="Cart"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.6 12.2c.1.5.6.8 1 .8h8.9c.5 0 .9-.3 1-.8L21 8H7"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg><span class="cart-n hide" id="cartN">0</span></a>' +
        '</div>' +
      '</div></header>' +
      '<div class="drawer-mask" id="drawerMask"></div>' +
      '<aside class="drawer" id="drawer">' +
        '<div class="dr-head">' +
          '<img src="assets/shop-logo.webp" alt="">' +
          '<div><b id="drName"></b><small id="drSub"></small></div>' +
          '<button class="dr-close" id="drClose" aria-label="Close">&#10005;</button>' +
        '</div>' +
        '<nav>' +
          '<a href="index.html">&#127968; Home</a>' +
          '<a href="about.html">&#8505;&#65039; About Us</a>' +
          '<a href="privacy.html">&#128274; Privacy Policy</a>' +
          '<a href="report.html">&#128203; Report an issue</a>' +
          '<a href="#" id="drTranslate">&#127760; Translate</a>' +
          '<hr><div class="d-label">Categories</div><div id="drCats"></div>' +
          '<hr>' +
          '<a id="drPhone" href="#">&#128222; <span></span></a>' +
          '<a id="drWa" href="#" target="_blank" rel="noopener">&#128172; WhatsApp</a>' +
          '<a id="drMail" href="#" class="hide">&#9993;&#65039; Email</a>' +
          '<a id="drIg" href="#" target="_blank" rel="noopener" class="hide">&#128248; Instagram</a>' +
        '</nav>' +
      '</aside>';
  }

  function footerHTML() {
    return '' +
      '<footer class="site-foot">' +
        '<div class="wrap foot-grid">' +
          '<div class="f-col">' +
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
            '<a href="#" id="ftIg" class="hide"><span>&#128248;</span> Instagram</a>' +
          '</div>' +
        '</div>' +
        '<div class="foot-bot">' +
          '<span>&copy;sql.ssl 2026</span>' +
          '<a class="ig-chip" id="ftIg2" href="#" target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 12 18.6 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 12 7.7a4.3 4.3 0 0 1 0 8.6zm6.8-11.2a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>' +
            'Instagram</a>' +
        '</div>' +
      '</footer>';
  }

  function applyConfigUI() {
    var c = App.cfg();
    var setText = function (sel, v) { var el = $(sel); if (el) el.textContent = v || ''; };

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
        drMail.querySelectorAll('span')[1].textContent = c.email;
      } else drMail.className = 'hide';
    }
    var drIg = $('#drIg');
    if (drIg) {
      if (c.instagram) { drIg.href = c.instagram; drIg.className = ''; }
      else drIg.className = 'hide';
    }

    var ftPhone = $('#ftPhone');
    if (ftPhone) {
      ftPhone.href = 'tel:' + String(c.phone).replace(/\s/g, '');
      ftPhone.querySelectorAll('span')[1].textContent = 'Shop: ' + c.phone;
    }
    var ftOwner = $('#ftOwner');
    if (ftOwner) {
      ftOwner.href = 'tel:' + String(c.ownerPhone).replace(/[^\d+]/g, '');
      ftOwner.querySelectorAll('span')[1].textContent = 'Owner: ' + c.ownerPhone;
    }
    var ftMail = $('#ftMail');
    if (ftMail) {
      if (c.email) {
        ftMail.href = 'mailto:' + c.email;
        ftMail.className = '';
        ftMail.querySelectorAll('span')[1].textContent = c.email;
      } else ftMail.className = 'hide';
    }
    var ftWa = $('#ftWa');
    if (ftWa) ftWa.href = 'https://wa.me/' + String(c.ownerPhone || c.whatsappNumber).replace(/[^0-9]/g, '');
    setText('#ftAddr', c.address + (c.addressAr ? ' • ' + c.addressAr : ''));

    var ftIg = $('#ftIg'), ftIg2 = $('#ftIg2');
    [ftIg, ftIg2].forEach(function (el) {
      if (!el) return;
      if (c.instagram) { el.href = c.instagram; el.className = el.id === 'ftIg2' ? 'ig-chip' : ''; }
      else el.className = 'hide';
    });

    renderDrawerCats();
  }

  function renderDrawerCats() {
    var box = $('#drCats');
    if (!box) return;
    var cats = App.catList();
    if (!cats.length) { box.innerHTML = ''; return; }
    box.innerHTML = cats.map(function (c) {
      return '<a class="d-cat" href="index.html?cat=' + encodeURIComponent(c.id) + '">' +
        App.esc(c.icon || '📁') + ' ' + App.esc(c.name) + '</a>';
    }).join('');
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
      applyConfigUI();
      fire('config');
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

    trackVisitor(DB);
  }

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
      loadFbFile('firebase-database-compat.js', function (e2) {
        if (e2) { showOffline('Cannot load Firebase database module.', true); return; }
        try {
          firebase.initializeApp(cfg);
          connectDB();
          fire('fbReady');
        } catch (e) {
          console.error(e);
          showOffline('Firebase init error: ' + e.message, true);
        }
      });
    });
  }

  App.boot = function () {
    var h = $('#siteHeader');
    if (h) {
      h.innerHTML = headerHTML();
      var tb = h.querySelector('.topbar');
      if (tb && h.parentNode) h.parentNode.insertBefore(tb, h.nextSibling);
    }
    var f = $('#siteFooter');
    if (f) f.innerHTML = footerHTML();

    applyConfigUI();
    initDrawer();
    initTranslate();
    initPreloader();
    App.updateCartBadge();
    loadFirebase();

    App.on('fbReady', function () {});
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.boot);
  } else {
    App.boot();
  }
})();
