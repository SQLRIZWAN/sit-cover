(function () {
  'use strict';

  var S = {
    step: 1,
    sel: {},
    selInit: false,
    customer: { name: '', phone: '', address: '', lat: null, lng: null },
    distance: null,
    payment: 'cod',
    ss: null,
    wamdAutoDone: false,
    buyerLoaded: false
  };

  var maps = { loaded: false, ok: false, map: null, marker: null, geo: null, ac: null, authFailed: false };

  function el(id) { return document.getElementById(id); }

  function feeNow() { return App.deliveryFee(S.distance); }

  function selectedItems() {
    return App.Cart.list().filter(function (x) { return S.sel[x.id]; });
  }

  function subtotal() {
    return selectedItems().reduce(function (s, x) { return s + (Number(x.price) || 0) * (x.qty || 1); }, 0);
  }

  function goStep(n) {
    S.step = n;
    Array.prototype.forEach.call(document.querySelectorAll('.ostep'), function (e) {
      e.classList.toggle('on', Number(e.getAttribute('data-step')) === n);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.stp'), function (e) {
      var i = Number(e.getAttribute('data-step'));
      e.classList.toggle('on', i === n);
      e.classList.toggle('done', i < n);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.stp-line'), function (e) {
      e.classList.toggle('on', Number(e.getAttribute('data-line')) < n);
    });
    if (n === 1) renderCart();
    if (n === 2) { renderDetails(); }
    if (n === 3) renderPayment();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }

  function renderCart() {
    var list = el('cartList');
    var emptyBox = el('cartEmpty');
    var panel = el('cartPanel');
    if (!list) return;

    var items = App.Cart.list();

    if (!S.selInit) {
      items.forEach(function (x) { if (S.sel[x.id] === undefined) S.sel[x.id] = true; });
      S.selInit = true;
    }

    if (!items.length) {
      if (panel) panel.style.display = 'none';
      if (emptyBox) emptyBox.style.display = 'block';
      return;
    }
    if (panel) panel.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    list.innerHTML = items.map(function (x) {
      var on = !!S.sel[x.id];
      return '<div class="cart-row' + (on ? '' : ' off') + '" data-id="' + App.esc(x.id) + '">' +
        '<button class="ck' + (on ? ' on' : '') + '" data-act="tick" aria-label="select"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg></button>' +
        '<div class="cart-img">' + (x.image ? '<img src="' + App.esc(x.image) + '" alt="" loading="lazy">' : '<div style="display:flex;height:100%;align-items:center;justify-content:center">🛍️</div>') + '</div>' +
        '<div class="cart-nm"><b>' + App.esc(x.name) + '</b><span>' + App.fmtKD(x.price) + ' each</span>' +
          '<div class="qty"><button data-act="minus">−</button><span>' + (x.qty || 1) + '</span><button data-act="plus">+</button></div>' +
        '</div>' +
        '<div class="cart-rt"><b>' + App.fmtKD((Number(x.price) || 0) * (x.qty || 1)) + '</b>' +
          '<button class="cart-del" data-act="del">Remove</button></div>' +
      '</div>';
    }).join('');

    var sel = selectedItems();
    el('cSelCount').textContent = sel.length + ' of ' + items.length + ' selected';
    el('cSubtotal').textContent = App.fmtKD(subtotal());
    el('s1Next').disabled = sel.length === 0;
  }

  function onCartClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var row = btn.closest('.cart-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    var items = App.Cart.list();
    var item = null;
    items.forEach(function (x) { if (x.id === id) item = x; });
    if (!item) return;

    if (act === 'tick') S.sel[id] = !S.sel[id];
    if (act === 'plus') App.Cart.setQty(id, (item.qty || 1) + 1);
    if (act === 'minus') App.Cart.setQty(id, (item.qty || 1) - 1);
    if (act === 'del') {
      App.Cart.remove(id);
      delete S.sel[id];
      App.toast('Removed from basket');
    }
    renderCart();
  }

  function loadBuyer() {
    if (S.buyerLoaded) return;
    S.buyerLoaded = true;
    try {
      var b = JSON.parse(localStorage.getItem('sc_buyer') || '{}');
      if (b.name) { S.customer.name = b.name; el('fName').value = b.name; }
      if (b.phone) { S.customer.phone = b.phone; el('fPhone').value = b.phone; }
    } catch (e) {}
  }

  function saveBuyer() {
    try {
      localStorage.setItem('sc_buyer', JSON.stringify({ name: S.customer.name, phone: S.customer.phone }));
    } catch (e) {}
  }

  function renderDetails() {
    loadBuyer();
    updateLocInfo();
  }

  function updateLocInfo() {
    var box = el('locInfo');
    if (!box) return;
    if (S.customer.lat == null) {
      box.innerHTML = '<b>No location selected yet.</b> Pick on the map or use “Use my location” so we can calculate delivery automatically.';
      return;
    }
    var d = S.distance != null ? S.distance.toFixed(1) + ' km' : '—';
    box.innerHTML = '📍 <b>' + d + '</b> from the shop • Estimated delivery: <b>' + App.fmtKD(feeNow()) + '</b>' +
      (S.distance != null && S.distance > 50 ? '<br>⚠️ This looks beyond 50 km — please call the shop to confirm.' : '');
  }

  function mapFallback(msg) {
    var box = el('mapBox');
    if (!box) return;
    if (box.querySelector('.map-fallback')) {
      box.querySelector('.map-fallback').innerHTML =
        '<div style="font-size:26px">🗺️</div><div>' + App.esc(msg) + '</div>' +
        '<div><b>Tip:</b> you can still use “Use my location” (GPS) for an accurate point.</div>';
      return;
    }
    var d = document.createElement('div');
    d.className = 'map-fallback';
    d.innerHTML = '<div style="font-size:26px">🗺️</div><div>' + App.esc(msg) + '</div>' +
      '<div><b>Tip:</b> you can still use “Use my location” (GPS) for an accurate point.</div>';
    box.appendChild(d);
  }

  function setLoc(lat, lng, address, doGeocode) {
    S.customer.lat = Number(lat);
    S.customer.lng = Number(lng);
    if (address) {
      S.customer.address = address;
      var ai = el('fAddr');
      if (ai) ai.value = address;
    }
    var c = App.cfg();
    S.distance = App.haversine(Number(c.shopLat), Number(c.shopLng), S.customer.lat, S.customer.lng);

    if (maps.marker) {
      maps.marker.setPosition({ lat: S.customer.lat, lng: S.customer.lng });
      maps.marker.setVisible(true);
    }
    if (maps.map) maps.map.panTo({ lat: S.customer.lat, lng: S.customer.lng });

    updateLocInfo();

    if (doGeocode && maps.ok && google.maps.Geocoder) {
      if (!maps.geo) maps.geo = new google.maps.Geocoder();
      maps.geo.geocode({ location: { lat: S.customer.lat, lng: S.customer.lng } }, function (res, st) {
        if (st === 'OK' && res && res[0]) {
          S.customer.address = res[0].formatted_address;
          var ai2 = el('fAddr');
          if (ai2) ai2.value = S.customer.address;
        }
      });
    }
  }

  function buildMap() {
    var c = App.cfg();
    var center = { lat: Number(c.shopLat) || 29.2844, lng: Number(c.shopLng) || 47.9656 };
    maps.map = new google.maps.Map(el('mapBox'), {
      center: center,
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: true
    });
    maps.marker = new google.maps.Marker({
      map: maps.map,
      position: center,
      draggable: true,
      animation: google.maps.Animation.DROP
    });
    maps.marker.setVisible(false);

    maps.map.addListener('click', function (e) {
      setLoc(e.latLng.lat(), e.latLng.lng(), null, true);
    });
    maps.marker.addListener('dragend', function (e) {
      setLoc(e.latLng.lat(), e.latLng.lng(), null, true);
    });

    var addrEl = el('fAddr');
    if (addrEl && google.maps.places) {
      maps.ac = new google.maps.places.Autocomplete(addrEl, {
        fields: ['formatted_address', 'geometry'],
        region: 'KW'
      });
      maps.ac.addListener('place_changed', function () {
        var pl = maps.ac.getPlace();
        if (pl && pl.geometry && pl.geometry.location) {
          setLoc(pl.geometry.location.lat(), pl.geometry.location.lng(), pl.formatted_address, false);
        }
      });
    }
  }

  function initMaps() {
    if (maps.loaded) return;
    maps.loaded = true;

    var key = '';
    try { key = (window.APP_CONFIG && APP_CONFIG.firebase && APP_CONFIG.firebase.apiKey) || ''; } catch (e) {}
    if (!key) { mapFallback('Map key not configured.'); return; }

    window.gm_authFailure = function () {
      maps.authFailed = true;
      maps.ok = false;
      mapFallback('Google Maps is not enabled for this API key yet (enable Maps JavaScript API in Google Cloud). GPS still works.');
    };
    window.__scMapReady = function () {
      if (maps.authFailed) return;
      try {
        buildMap();
        maps.ok = true;
        var fb = el('mapBox').querySelector('.map-fallback');
        if (fb) fb.remove();
      } catch (e) {
        mapFallback('Map could not start: ' + e.message);
      }
    };

    App.loadScript('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
      '&callback=__scMapReady&language=en&region=KW&libraries=places', function (err) {
      if (err) mapFallback('Google Maps failed to load. Check internet, or use GPS.');
      else setTimeout(function () {
        if (!maps.ok && !maps.authFailed && !maps.map) {
          mapFallback('Map is taking too long. Use “Use my location” instead.');
        }
      }, 8000);
    });
  }

  function useMyLoc() {
    var btn = el('locBtn');
    if (!navigator.geolocation) {
      App.toast('Location is not supported on this device', 'err');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Locating…'; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (btn) { btn.disabled = false; btn.textContent = '📍 Use my location'; }
      setLoc(pos.coords.latitude, pos.coords.longitude, null, true);
      App.toast('Location found ✓', 'ok');
    }, function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '📍 Use my location'; }
      App.toast('Could not get location (' + (err && err.message ? err.message : 'permission denied') + ')', 'err');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  function validateStep2() {
    var n = (el('fName').value || '').trim();
    var p = (el('fPhone').value || '').trim();
    if (!n) { App.toast('Please enter your name', 'err'); el('fName').focus(); return false; }
    if (p.replace(/\D/g, '').length < 8) { App.toast('Please enter a valid phone number', 'err'); el('fPhone').focus(); return false; }
    S.customer.name = n;
    S.customer.phone = p;
    S.customer.address = (el('fAddr').value || '').trim();

    S.distance = null;
    saveBuyer();
    return true;
  }

  function renderPayment() {
    var sel = selectedItems();
    var sub = subtotal();
    var fee = feeNow();
    var total = sub + fee;

    el('pItems').innerHTML = sel.map(function (x) {
      return '<div class="summary-line"><span>' + App.esc(x.name) + ' × ' + (x.qty || 1) + '</span>' +
        '<b>' + App.fmtKD((Number(x.price) || 0) * (x.qty || 1)) + '</b></div>';
    }).join('');
    el('pSub').textContent = App.fmtKD(sub);
    el('pDist').textContent = S.distance != null ? S.distance.toFixed(1) + ' km' : 'flat rate';
    el('pFee').textContent = App.fmtKD(fee);
    el('pTotal').textContent = App.fmtKD(total);

    el('rName').textContent = S.customer.name;
    el('rPhone').textContent = S.customer.phone;
    el('rAddr').textContent = S.customer.address || (S.customer.lat != null ? 'GPS: ' + S.customer.lat.toFixed(5) + ', ' + S.customer.lng.toFixed(5) : 'Not set');

    var cfg = App.cfg();
    el('wamdNumber').textContent = cfg.wamdNumber || cfg.ownerPhone || '—';
    el('wamdAmount').textContent = App.fmtKD(total);
    var wOpen = el('wamdOpen');
    if (wOpen) {
      if (cfg.wamdLink) {
        wOpen.href = cfg.wamdLink;
        wOpen.style.display = '';
      } else {
        wOpen.style.display = 'none';
      }
    }

    setPay(S.payment, true);
  }

  function setPay(method, silent) {
    S.payment = method;
    Array.prototype.forEach.call(document.querySelectorAll('.pay-opt'), function (o) {
      o.classList.toggle('on', o.getAttribute('data-pay') === method);
    });
    var w = el('wamdBox');
    if (w) w.style.display = method === 'wamd' ? 'block' : 'none';

    if (method === 'wamd' && !S.wamdAutoDone) {
      S.wamdAutoDone = true;
      var cfg = App.cfg();
      if (cfg.wamdLink) {
        setTimeout(function () {
          try { window.open(cfg.wamdLink, '_blank', 'noopener'); } catch (e) {}
        }, 500);
        if (!silent) App.toast('Opening WAMD payment app…', 'ok');
      } else if (!silent) {
        App.toast('Pay to the WAMD number shown below, then upload the screenshot');
      }
    }
  }

  function ssPick() {
    var inp = el('ssFile');
    if (!inp || !inp.files || !inp.files[0]) return;
    var f = inp.files[0];
    if (f.size > 10 * 1024 * 1024) { App.toast('Image too large (max 10 MB)', 'err'); inp.value = ''; return; }
    var prog = el('ssProg'), bar = el('ssBar');
    prog.classList.add('on');
    bar.style.width = '5%';
    App.cloudUpload(f, function (p) { bar.style.width = p + '%'; }).then(function (media) {
      S.ss = media;
      bar.style.width = '100%';
      el('ssPrev').classList.add('on');
      el('ssPrevImg').src = media.url;
      prog.classList.remove('on');
      App.toast('Screenshot uploaded ✓', 'ok');
      setTimeout(function () { prog.classList.remove('on'); }, 400);
    }).catch(function (e) {
      prog.classList.remove('on');
      inp.value = '';
      App.toast(e.message, 'err');
    });
  }

  function ssRemove() {
    S.ss = null;
    var inp = el('ssFile');
    if (inp) inp.value = '';
    var p = el('ssPrev');
    if (p) p.classList.remove('on');
  }

  function setBtnLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset.old = btn.textContent;
      btn.textContent = text || 'Please wait…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.old || 'Submit Order';
      btn.disabled = false;
    }
  }

  function customerKey(phone) {
    var k = String(phone).replace(/\D/g, '');
    return k || ('p' + Date.now().toString(36));
  }

  function doSubmit() {
    var btn = el('btnSubmit');
    if (!window.App || !App.DB) {
      App.toast('Still connecting to the shop — please wait a second and try again', 'err');
      return;
    }
    var sel = selectedItems();
    if (!sel.length) { App.toast('No products selected', 'err'); goStep(1); return; }
    if (!S.customer.name || !S.customer.phone) { App.toast('Missing details — go back a step', 'err'); goStep(2); return; }

    setBtnLoading(btn, true, 'Saving order…');

    var cfg = App.cfg();
    var sub = subtotal();
    var fee = feeNow();
    var total = sub + fee;

    var order = {
      items: sel.map(function (x) {
        return {
          productId: x.id,
          name: x.name,
          price: Number(x.price) || 0,
          qty: x.qty || 1,
          image: x.image || ''
        };
      }),
      subtotal: sub,
      deliveryFee: fee,
      total: total,
      distanceKm: S.distance != null ? Math.round(S.distance * 10) / 10 : null,
      paymentMethod: S.payment,
      customer: {
        name: S.customer.name,
        phone: S.customer.phone,
        address: S.customer.address || '',
        lat: S.customer.lat,
        lng: S.customer.lng
      },
      paymentScreenshot: S.ss ? { inline: 1 } : null,
      status: 'new',
      whatsappSent: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    var ref = App.DB.ref('orders').push();
    var id = ref.key;
    order.id = id;

    ref.set(order).then(function () {
      var ts = Date.now();
      var rev = total;

      App.DB.ref('stats/daily/' + App.todayKey()).transaction(function (cur) {
        return {
          orders: ((cur && cur.orders) || 0) + 1,
          revenue: Math.round((((cur && cur.revenue) || 0) + rev) * 1000) / 1000
        };
      });
      App.DB.ref('stats/allTime').transaction(function (cur) {
        return {
          orders: ((cur && cur.orders) || 0) + 1,
          revenue: Math.round((((cur && cur.revenue) || 0) + rev) * 1000) / 1000
        };
      });
      App.DB.ref('stats/customers/' + customerKey(S.customer.phone)).transaction(function (cur) {
        return {
          name: S.customer.name,
          phone: S.customer.phone,
          orders: ((cur && cur.orders) || 0) + 1,
          revenue: Math.round((((cur && cur.revenue) || 0) + rev) * 1000) / 1000,
          lastOrder: ts
        };
      });

      if (S.ss && S.ss.url) {
        App.DB.ref('order_shots/' + id).set(S.ss.url).catch(function () {});
      }

      saveBuyer();
      App.Cart.removeIds(sel.map(function (x) { return x.id; }));
      showDone(id, total, order, cfg);
    }).catch(function (e) {
      setBtnLoading(btn, false);
      App.toast('Could not save order: ' + (e.message || 'please try again'), 'err');
    });
  }

  function showDone(id, total, order, cfg) {
    var done = el('doneView');
    var flow = el('orderFlow');
    if (flow) flow.style.display = 'none';
    if (done) done.style.display = 'block';

    el('doneId').textContent = '#' + String(id).slice(-8).toUpperCase();
    el('doneTotal').textContent = App.fmtKD(total);

    var waWrap = el('doneWa');
    var link = null;
    if (cfg.whatsappSubmitEnabled !== false) {
      link = App.waLink(cfg.whatsappNumber || cfg.ownerPhone, App.buildWaMessage(order, cfg));
    }
    if (link && waWrap) {
      waWrap.style.display = 'flex';
      var btn = el('doneWaBtn');
      btn.href = link;
      btn.onclick = function () {
        try {
          var w = window.open(link, '_blank', 'noopener');
          if (w) {
            App.DB.ref('orders/' + id).update({ whatsappSent: true }).catch(function () {});
          }
        } catch (e) {}
      };
      setTimeout(function () {
        try {
          var w = window.open(link, '_blank', 'noopener');
          if (w) App.DB.ref('orders/' + id).update({ whatsappSent: true }).catch(function () {});
        } catch (e) {}
      }, 700);
    } else if (waWrap) {
      waWrap.style.display = 'none';
      var note = el('doneNote');
      if (note) note.textContent = 'Your order is saved in the shop system. The shop will contact you on your phone number.';
    }

    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    App.toast('Order placed successfully ✓', 'ok');
  }

  function boot() {
    var list = el('cartList');
    if (list) list.addEventListener('click', onCartClick);

    var s1n = el('s1Next');
    if (s1n) s1n.addEventListener('click', function () {
      if (!selectedItems().length) { App.toast('Select at least one product', 'err'); return; }
      goStep(2);
    });
    var s1b = el('s1Back');
    if (s1b) s1b.addEventListener('click', function () { location.href = 'index.html'; });

    var locBtn = el('locBtn');
    if (locBtn) locBtn.addEventListener('click', useMyLoc);

    var s2n = el('s2Next');
    if (s2n) s2n.addEventListener('click', function () { if (validateStep2()) goStep(3); });
    var s2b = el('s2Back');
    if (s2b) s2b.addEventListener('click', function () { goStep(1); });

    Array.prototype.forEach.call(document.querySelectorAll('.pay-opt'), function (o) {
      o.addEventListener('click', function () { setPay(o.getAttribute('data-pay')); });
    });

    var ssBox = el('ssBox'), ssFile = el('ssFile');
    if (ssBox && ssFile) {
      ssBox.addEventListener('click', function () { ssFile.click(); });
      ssFile.addEventListener('change', ssPick);
    }
    var ssX = el('ssRemove');
    if (ssX) ssX.addEventListener('click', ssRemove);

    var s3b = el('s3Back');
    if (s3b) s3b.addEventListener('click', function () { goStep(2); });

    var btnSubmit = el('btnSubmit');
    if (btnSubmit) btnSubmit.addEventListener('click', doSubmit);

    goStep(1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
