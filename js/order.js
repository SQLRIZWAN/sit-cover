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
    done: false,
    buyerLoaded: false
  };

  var maps = { loaded: false, ok: false, map: null, marker: null };

  function el(id) { return document.getElementById(id); }

  function feeNow() { return App.deliveryFee(S.distance); }

  // ---- Login gate ---------------------------------------------------------
  // An order can only be placed by a signed-in account: it is what ties the
  // basket, the order and the delivery tracker together.
  function signedIn() {
    return !!(window.AppAuth && AppAuth.profile && AppAuth.profile());
  }

  function applyGate() {
    var gate = el('loginGate'), flow = el('orderFlow'), done = el('doneView');
    if (!gate) return;
    var yes = signedIn();
    gate.hidden = yes;
    gate.style.display = yes ? 'none' : 'block';
    if (flow) flow.style.display = yes ? '' : 'none';
    if (done) done.style.display = (yes && S.done) ? 'block' : 'none';
  }

  function fillFromProfile() {
    var p = (window.AppAuth && AppAuth.profile && AppAuth.profile()) || null;
    if (!p) return;
    if (el('fName') && !el('fName').value.trim() && p.name) el('fName').value = p.name;
    if (el('fPhone') && !el('fPhone').value.trim() && p.phone) el('fPhone').value = p.phone;
    if (!S.customer.name && p.name) S.customer.name = p.name;
    if (!S.customer.phone && p.phone) S.customer.phone = p.phone;
    saveBuyer();
  }

  function selectedItems() {
    return App.Cart.list().filter(function (x) { return S.sel[String(x.id)]; });
  }

  // The basket is re-keyed when the signed-in copy is merged, when an old id-less
  // line is repaired, or when another tab writes to it. Selection is therefore
  // re-based on the LIVE basket on every render: unknown keys are dropped and
  // newly appeared lines are selected. Without this a stale draft shows
  // "1 of 1 selected" while the real selection is empty and Continue refuses
  // to move on.
  function syncSel(items) {
    var next = {};
    items.forEach(function (x) {
      var k = String(x.id);
      var prev = S.sel[k];
      var ok = stockOf(x).ok;
      // A line that cannot be ordered right now is always unticked, so the
      // tick, the "n of m selected" counter and the subtotal never disagree.
      next[k] = ok ? (prev === undefined ? true : prev) : false;
    });
    S.sel = next;
    S.selInit = true;
  }

  // Stock lives on the product, not in the basket, so it is read live here.
  // out  — the shop flipped the product to "out of stock"
  // max  — a stock quantity is published (null = unlimited)
  function stockOf(item) {
    var qty = Math.max(1, Number(item.qty || 1));
    var p = App.getProduct ? App.getProduct(item.id) : null;
    if (!p) return { ok: true, out: false, max: null, qty: qty, name: item.name };
    var out = p.inStock === false;
    var max = null;
    if (p.stockQty !== undefined && p.stockQty !== null && p.stockQty !== '') {
      var n = Number(p.stockQty);
      if (isFinite(n) && n >= 0) {
        max = Math.floor(n);
        if (max <= 0) out = true;
      }
    }
    if (max !== null && qty > max) qty = max;
    return {
      ok: !out && (max === null || qty <= max),
      out: out,
      max: max,
      qty: qty,
      name: p.name || item.name
    };
  }

  function stockProblems(sel) {
    return sel.filter(function (x) { return !stockOf(x).ok; }).map(function (x) {
      var s = stockOf(x);
      return s.out ? (s.name + ' is out of stock') : (s.name + ' — only ' + s.max + ' left');
    });
  }

  function subtotal() {
    return selectedItems().reduce(function (s, x) { return s + (Number(x.price) || 0) * (x.qty || 1); }, 0);
  }

  function saveDraft() {
    try { localStorage.setItem(App.scopedKey('sc_order_draft'), JSON.stringify({ sel: S.sel, customer: S.customer, distance: S.distance })); } catch (e) {}
  }

  function restoreDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(App.scopedKey('sc_order_draft')) || 'null');
      if (!d) return;
      S.sel = d.sel || {};
      S.selInit = true;
      S.customer = d.customer || S.customer;
      S.distance = d.distance == null ? null : d.distance;
      if (el('fName')) el('fName').value = S.customer.name || '';
      if (el('fPhone')) el('fPhone').value = S.customer.phone || '';
      var parts = String(S.customer.address || '').split(', ');
      if (el('fArea')) el('fArea').value = parts.shift() || '';
      parts.forEach(function (p) {
        if (/^Block /.test(p) && el('fBlock')) el('fBlock').value = p.replace(/^Block /, '');
        else if (/^Street /.test(p) && el('fStreet')) el('fStreet').value = p.replace(/^Street /, '');
        else if (/^Notes: /.test(p) && el('fNotes')) el('fNotes').value = p.replace(/^Notes: /, '');
        else if (el('fBuilding') && !el('fBuilding').value) el('fBuilding').value = p;
      });
      var shot = localStorage.getItem('sc_wamd_shot');
      if (shot) { S.ss = JSON.parse(shot); localStorage.removeItem('sc_wamd_shot'); }
    } catch (e) {}
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

    syncSel(items);

    if (!items.length) {
      if (panel) panel.style.display = 'none';
      if (emptyBox) emptyBox.style.display = 'block';
      return;
    }
    if (panel) panel.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    list.innerHTML = items.map(function (x) {
      var on = !!S.sel[String(x.id)];
      var st = stockOf(x);
      if (!st.ok) on = false;
      var maxed = st.max !== null && (x.qty || 1) >= st.max;
      return '<div class="cart-row' + (on ? '' : ' off') + (st.ok ? '' : ' bad') + '" data-id="' + App.esc(x.id) + '">' +
        '<button type="button" class="ck' + (on ? ' on' : '') + '" data-act="tick"' + (st.ok ? '' : ' disabled') + ' aria-label="select"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg></button>' +
        '<div class="cart-img">' + (x.image ? '<img src="' + App.esc(x.image) + '" alt="" loading="lazy">' : '<div style="display:flex;height:100%;align-items:center;justify-content:center">🛍️</div>') + '</div>' +
        '<div class="cart-nm"><b>' + App.esc(x.name) + '</b><span>' + App.fmtKD(x.price) + ' each</span>' +
          (st.ok ? '' : '<span class="cart-oos">' + (st.out ? 'Out of stock' : 'Only ' + st.max + ' left') + '</span>') +
          '<div class="qty" role="group" aria-label="Quantity for ' + App.esc(x.name) + '">' +
            '<button type="button" class="q-b" data-act="minus" aria-label="Decrease quantity of ' + App.esc(x.name) + '">−</button>' +
            '<span class="q-n" aria-live="polite">' + (x.qty || 1) + '</span>' +
            '<button type="button" class="q-b" data-act="plus"' + (maxed ? ' disabled' : '') + ' aria-label="Increase quantity of ' + App.esc(x.name) + '">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="cart-rt"><b>' + App.fmtKD((Number(x.price) || 0) * (x.qty || 1)) + '</b>' +
          '<button type="button" class="cart-del" data-act="del">Remove</button></div>' +
      '</div>';
    }).join('');

    var sel = selectedItems();
    el('cSelCount').textContent = sel.length + ' of ' + items.length + ' selected';
    el('cSubtotal').textContent = App.fmtKD(subtotal());
    el('s1Next').disabled = sel.length === 0;

    var warn = el('cStockWarn');
    var bad = stockProblems(App.Cart.list());
    if (warn) {
      warn.hidden = bad.length === 0;
      warn.textContent = bad.length ? bad.join(' • ') : '';
    }

    Array.prototype.forEach.call(list.querySelectorAll('[data-act]'), function (button) {
      button.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleCartAction(button);
      });
    });
  }

  function handleCartAction(btn) {
    var row = btn;
    while (row && !(row.classList && row.classList.contains('cart-row'))) row = row.parentNode;
    if (!row) return;
    var id = row.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    var items = App.Cart.list();
    var item = null;
    items.forEach(function (x) { if (!item && String(x.id) === String(id)) item = x; });

    // Older carts were saved without an id (a previous bug) — fall back to the
    // visible product name so the +/- controls still work.
    if (!item) {
      var nameEl = row.querySelector('.cart-nm b');
      var nm = nameEl ? nameEl.textContent : '';
      items.forEach(function (x) { if (!item && x.name === nm) item = x; });
      if (item) id = item.id;
    }
    if (!item) return;

    if (act === 'tick') S.sel[String(id)] = !S.sel[String(id)];
    if (act === 'plus') {
      var st = stockOf(item);
      var want = Number(item.qty || 1) + 1;
      if (st.max !== null && want > st.max) {
        App.toast('Only ' + st.max + ' of these in stock', 'err');
        want = st.max;
      }
      App.Cart.setQty(id, want);
    }
    if (act === 'minus') App.Cart.setQty(id, Number(item.qty || 1) - 1);
    if (act === 'del') {
      App.Cart.remove(id);
      delete S.sel[String(id)];
      App.toast('Removed from basket');
    }
    renderCart();
  }

  function loadBuyer() {
    if (S.buyerLoaded) return;
    S.buyerLoaded = true;
    try {
      var b = JSON.parse(localStorage.getItem(App.scopedKey('sc_buyer')) || '{}');
      if (b.name) { S.customer.name = b.name; el('fName').value = b.name; }
      if (b.phone) { S.customer.phone = b.phone; el('fPhone').value = b.phone; }
    } catch (e) {}
  }

  function saveBuyer() {
    try {
      localStorage.setItem(App.scopedKey('sc_buyer'), JSON.stringify({ name: S.customer.name, phone: S.customer.phone }));
    } catch (e) {}
  }

  function renderDetails() {
    loadBuyer();
    fillFromProfile();
    updateLocInfo();
    initMap();
  }

  function addressFromForm() {
    return [
      el('fArea') && el('fArea').value.trim(),
      el('fBlock') && el('fBlock').value.trim() ? 'Block ' + el('fBlock').value.trim() : '',
      el('fStreet') && el('fStreet').value.trim() ? 'Street ' + el('fStreet').value.trim() : '',
      el('fBuilding') && el('fBuilding').value.trim(),
      el('fNotes') && el('fNotes').value.trim() ? 'Notes: ' + el('fNotes').value.trim() : ''
    ].filter(Boolean).join(', ');
  }

  function updateLocInfo() {
    var box = el('locInfo');
    if (!box) return;
    if (S.customer.lat == null) {
      box.innerHTML = '<b>No location selected yet.</b> Tap “Use my location”, or drop a pin on the map, so we can calculate the distance and the exact delivery fee automatically.';
      return;
    }
    var d = S.distance != null ? S.distance.toFixed(1) + ' km' : '—';
    var extra = '';
    if (S.geoName) extra += '<br>🧭 ' + App.esc(String(S.geoName).split(',').slice(0, 3).join(','));
    if (S.geoApprox) extra += '<br>⚠️ Approximate (city level from your network) — drag the pin to your building for the right fee.';
    box.innerHTML = '📍 <b>' + d + '</b> from the shop • Estimated delivery: <b>' + App.fmtKD(feeNow()) + '</b>' + extra +
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
    // Precise sources (map pin, drag, GPS, typed coordinates) clear the
    // "city-level" warning; netLocate sets it again after calling us.
    S.geoApprox = false;
    if (doGeocode) S.geoName = '';

    if (maps.map && window.L) {
      if (maps.marker) {
        maps.marker.setLatLng([S.customer.lat, S.customer.lng]);
      } else {
        maps.marker = L.marker([S.customer.lat, S.customer.lng], {
          draggable: true,
          icon: L.divIcon({ className: 'sc-pin', html: '<i></i>', iconSize: [26, 34], iconAnchor: [13, 32] })
        }).addTo(maps.map);
        maps.marker.on('dragend', function () {
          var p = maps.marker.getLatLng();
          setLoc(p.lat, p.lng, null, true);
        });
      }
      try {
        var z = Math.max(maps.map.getZoom(), 12);
        maps.map.setView([S.customer.lat, S.customer.lng], z);
      } catch (e) {}
    }

    updateLocInfo();

    if (doGeocode) reverseGeo(S.customer.lat, S.customer.lng);
  }

  // Free reverse geocode (OSM Nominatim — no key, CORS open). Used only to
  // tell the customer which area the pin landed on; the typed address in the
  // form stays what we ship with.
  var geoBusy = false, geoLast = 0;
  function reverseGeo(lat, lng) {
    if (geoBusy || Date.now() - geoLast < 1200) return;
    geoBusy = true;
    geoLast = Date.now();
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=' +
      encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);
    fetch(url, { headers: { 'Accept': 'application/json' }, mode: 'cors' })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        geoBusy = false;
        if (!j || !j.display_name) return;
        S.geoName = String(j.display_name);
        updateLocInfo();
      })
      .catch(function () { geoBusy = false; });
  }

  function ensureMapCss() {
    if (document.getElementById('leafletCss')) return;
    var l = document.createElement('link');
    l.id = 'leafletCss';
    l.rel = 'stylesheet';
    l.href = 'css/leaflet.css';
    document.head.appendChild(l);
  }

  function buildMap() {
    if (maps.map || !window.L) return;
    var box = el('mapBox');
    var c = App.cfg();
    var center = [Number(c.shopLat) || 29.2844, Number(c.shopLng) || 47.9656];
    if (!box) return;
    var fb = box.querySelector('.map-fallback');
    if (fb) fb.remove();
    try {
      maps.map = L.map(box, { scrollWheelZoom: false, attributionControl: true }).setView(center, 11);
      maps.ok = true;
      var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      });
      var errs = 0;
      tiles.on('tileerror', function () {
        if (++errs >= 3 && maps.ok) {
          maps.ok = false;
          mapFallback('Map tiles are blocked on this network. GPS, coordinates and “Find my area” still work.');
        }
      });
      tiles.addTo(maps.map);
      L.circleMarker(center, {
        radius: 7, color: '#0f172a', weight: 2, fillColor: '#22c55e', fillOpacity: 1
      }).addTo(maps.map).bindPopup('<b>Fix and Fit store</b><br>Jleeb Al-Shuyoukh, Kuwait');
      maps.map.on('click', function (e) {
        setLoc(e.latlng.lat, e.latlng.lng, null, true);
      });
    } catch (e) {
      mapFallback('Map could not start: ' + (e && e.message ? e.message : 'error'));
      return;
    }
    if (S.customer.lat != null && S.customer.lng != null) {
      setLoc(S.customer.lat, S.customer.lng, null, false);
    }
    setTimeout(function () { try { maps.map.invalidateSize(); } catch (e) {} }, 150);
  }

  // Called when step 2 opens (the pane is display:none until then, so
  // Leaflet measures a 0×0 box unless we invalidateSize on re-entry).
  function initMap() {
    ensureMapCss();
    if (window.L) {
      if (maps.map) {
        if (S.customer.lat != null && S.customer.lng != null) {
          setLoc(S.customer.lat, S.customer.lng, null, false);
        }
        setTimeout(function () { try { maps.map.invalidateSize(); } catch (e) {} }, 60);
      } else {
        buildMap();
      }
      return;
    }
    App.loadScript('js/leaflet.js', function (err) {
      if (err) {
        mapFallback('Map library could not load on this connection. GPS, coordinates and “Find my area” still work.');
        return;
      }
      buildMap();
    });
  }

  // Network-based location: reads the public IP and returns a city-level
  // point. Much coarser than GPS, but it works with no permissions and no
  // API key — the customer can drag the pin to their building afterwards.
  function netLocate() {
    var btn = el('locNet');
    var box = el('locInfo');
    if (box) box.classList.remove('warn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Finding your city…'; }
    fetch('https://ipwho.is/', { mode: 'cors' })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (btn) { btn.disabled = false; btn.textContent = '🌐 My network location'; }
        if (!j || j.success === false || !isFinite(Number(j.latitude)) || !isFinite(Number(j.longitude))) {
          locNote('your network location could not be read. Use “Use my location” (GPS) instead.');
          return;
        }
        setLoc(Number(j.latitude), Number(j.longitude), null, false);
        S.geoApprox = true;
        S.geoName = [j.city, j.region, j.country].filter(Boolean).join(', ');
        updateLocInfo();
        App.toast('Approximate location set ✓ — drag the pin to your building', 'ok');
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = '🌐 My network location'; }
        locNote('your network location could not be read. Use “Use my location” (GPS) instead.');
      });
  }

  function openManual() {
    var d = el('locManual');
    if (d) { try { d.open = true; } catch (e) { d.setAttribute('open', ''); } }
  }

  // A calm, non-alarming notice inside the delivery-point box. The red toast
  // used to be the only feedback and it looked like the order itself failed.
  function locNote(msg) {
    var box = el('locInfo');
    if (!box) return;
    box.classList.add('warn');
    box.innerHTML = '<b>📍 Location unavailable.</b> ' + App.esc(msg) +
      '<br>You can still continue — the delivery fee will be the normal area rate.';
  }

  function useMyLoc() {
    var btn = el('locBtn');
    var box = el('locInfo');
    if (box) box.classList.remove('warn');

    if (!navigator.geolocation) {
      locNote('This device does not support GPS.');
      openManual();
      return;
    }

    // Chrome and Firefox refuse geolocation on plain http. Say so in plain
    // words instead of leaking the browser's own error string.
    var insecure = !window.isSecureContext;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Locating…'; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (btn) { btn.disabled = false; btn.textContent = '📍 Use my location'; }
      setLoc(pos.coords.latitude, pos.coords.longitude, null, true);
      App.toast('Location found ✓', 'ok');
    }, function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '📍 Use my location'; }
      var code = err && err.code;
      var msg;
      if (insecure) {
        msg = 'this page is open on a non-secure (http) link, and phones only give GPS on https. ' +
          'Once the shop is opened as https://fixandfit.store the button will work.';
      } else if (code === 1) {
        msg = 'you blocked location for this site. Tap the padlock in the address bar, allow Location, then try again.';
      } else if (code === 2) {
        msg = 'the phone could not get a GPS fix. Move near a window and try again.';
      } else if (code === 3) {
        msg = 'it took too long to get a fix. Try again, or enter the coordinates below.';
      } else {
        msg = 'the phone did not return a location.';
      }
      locNote(msg);
      openManual();
      App.toast('Location unavailable — see the box above');
      // GPS failed — fall back to AI so the customer is not stuck: try to
      // place the address they already typed and lock the delivery point.
      aiLocate(true);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  // Turn the typed address (area / block / street / building) into a delivery
  // point when GPS is unavailable. Used as the fallback so "Continue" can still
  // lock a location and calculate the distance-based delivery fee.
  function aiLocate(auto) {
    var addr = addressFromForm();
    if (!addr || !App.aiGeocode) {
      if (!auto) App.toast('Type your area first, then we can find it', 'err');
      return Promise.resolve(false);
    }
    var btn = el('locBtn');
    var aiBtn = el('locAi');
    if (btn) { btn.disabled = true; }
    if (aiBtn) { aiBtn.disabled = true; aiBtn.textContent = '⏳ Finding your area…'; }
    if (auto) locNote('GPS is off, so we are using your typed address to find the delivery point…');
    return App.aiGeocode(addr).then(function (g) {
      setLoc(g.lat, g.lng, null, false);
      locNote('We found your area from the address you typed ✓ — you can Continue now.');
      App.toast('Delivery point locked ✓', 'ok');
      return true;
    }).catch(function () {
      if (auto) locNote('We could not place that address automatically. Tap “Use my location”, or open the box below and paste the map coordinates.');
      else App.toast('Could not find that area — try GPS or enter coordinates', 'err');
      return false;
    }).then(function (ok) {
      if (btn) { btn.disabled = false; }
      if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '✨ Find my area automatically'; }
      return ok;
    });
  }

  function validateStep2() {
    var n = (el('fName').value || '').trim();
    var p = (el('fPhone').value || '').trim();
    if (!n) { App.toast('Please enter your name', 'err'); el('fName').focus(); return false; }
    if (p.replace(/\D/g, '').length < 8) { App.toast('Please enter a valid phone number', 'err'); el('fPhone').focus(); return false; }
    S.customer.name = n;
    S.customer.phone = p;
    if (!(el('fArea').value || '').trim()) { App.toast('Please enter your area', 'err'); el('fArea').focus(); return false; }
    S.customer.address = addressFromForm();

    // Keep (or recompute) the shop→customer distance so the tiered delivery
    // fee in step 3 is based on real kilometres, not a flat rate.
    if (S.customer.lat != null && S.customer.lng != null) {
      var cc = App.cfg();
      S.distance = App.haversine(Number(cc.shopLat), Number(cc.shopLng), S.customer.lat, S.customer.lng);
      S.distance = Math.round(S.distance * 10) / 10;
    } else {
      S.distance = null;
    }

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
    el('wamdName').textContent = cfg.wamdName || cfg.shopName || 'Shop account';
    el('wamdNumber').textContent = cfg.wamdNumber || cfg.ownerPhone || '—';
    el('wamdAmount').textContent = App.fmtKD(total);

    setPay(S.payment, true);
    if (S.ss && S.ss.url) {
      el('ssPrev').classList.add('on');
      el('ssPrevImg').src = S.ss.url;
    }
  }

  function setPay(method, silent) {
    S.payment = method;
    Array.prototype.forEach.call(document.querySelectorAll('.pay-opt'), function (o) {
      o.classList.toggle('on', o.getAttribute('data-pay') === method);
    });
    var w = el('wamdBox');
    if (w) w.style.display = method === 'wamd' ? 'block' : 'none';

    if (method === 'wamd' && !silent) {
      App.toast('Pay to the WAMD details shown below, then attach the screenshot');
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
      if (btn.dataset.old === undefined) btn.dataset.old = btn.textContent;
      btn.textContent = text || 'Please wait…';
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.textContent = btn.dataset.old || 'Submit Order';
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.classList.remove('is-loading');
      btn.style.removeProperty('--submit-progress');
    }
  }

  // Stage-by-stage progress so the customer always knows what is happening
  // and roughly how long it has been running.
  function startSubmitProgress(btn) {
    var started = Date.now();
    var STAGES = [
      { at: 0, label: 'Saving order to the shop…' },
      { at: 900, label: 'Confirming with the shop system…' },
      { at: 2400, label: 'Still working — check your connection…' }
    ];
    function stageFor(ms) {
      var s = STAGES[0];
      for (var i = 0; i < STAGES.length; i++) if (ms >= STAGES[i].at) s = STAGES[i];
      return s;
    }
    function tick() {
      var ms = Date.now() - started;
      var seconds = Math.floor(ms / 1000);
      var progress = Math.min(94, 10 + Math.round(ms / 90));
      btn.classList.add('is-loading');
      btn.style.setProperty('--submit-progress', progress + '%');
      btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' +
        App.esc(stageFor(ms).label) +
        ' <b class="sec">' + seconds + 's</b>';
      var live = el('submitLive');
      if (live) live.textContent = stageFor(ms).label + ' ' + seconds + ' seconds elapsed.';
    }
    tick();
    var timer = setInterval(tick, 400);
    return function (finalLabel) {
      clearInterval(timer);
      btn.classList.remove('is-loading');
      btn.style.removeProperty('--submit-progress');
      if (finalLabel) {
        btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + App.esc(finalLabel);
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }
    };
  }

  function customerKey(phone) {
    var k = String(phone).replace(/\D/g, '');
    return k || ('p' + Date.now().toString(36));
  }

  function doSubmit() {
    var btn = el('btnSubmit');
    if (!signedIn()) {
      applyGate();
      App.toast('Please sign in with Google to place your order', 'err');
      return;
    }
    if (!window.App || !App.DB) {
      App.toast('Still connecting to the shop — please wait a second and try again', 'err');
      return;
    }
    if (App.connected === false) {
      App.toast('Shop connection is offline. Check internet and tap Submit again.', 'err');
      return;
    }
    var sel = selectedItems();
    if (!sel.length) { App.toast('No products selected', 'err'); goStep(1); return; }
    var stockErr = stockProblems(sel);
    if (stockErr.length) { App.toast(stockErr[0], 'err'); goStep(1); return; }
    if (!S.customer.name || !S.customer.phone) { App.toast('Missing details — go back a step', 'err'); goStep(2); return; }

    setBtnLoading(btn, true, 'Submitting order…');
    var stopProgress = startSubmitProgress(btn);

    var cfg = App.cfg();
    var sub = subtotal();
    var fee = feeNow();
    var total = sub + fee;
    var me = (window.AppAuth && AppAuth.profile && AppAuth.profile()) || {};

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
      // The account this order belongs to — what "My Orders" matches on.
      uid: me.uid || '',
      email: me.email || '',
      uname: me.name || S.customer.name || '',
      paymentScreenshot: S.ss ? { inline: 1 } : null,
      status: 'new',
      whatsappSent: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    var ref = App.DB.ref('orders').push();
    var id = ref.key;
    order.id = id;

    var savePromise = ref.set(order);
    var saveTimeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('The connection is taking too long. Please check internet and try again.')); }, 15000);
    });

    Promise.race([savePromise, saveTimeout]).then(function () {
      stopProgress('Order saved ✓');
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

      // Auto-save the phone the customer typed during checkout into their
      // profile, so next time they never have to fill it in again.
      try {
        var prof = window.AppAuth && AppAuth.profile && AppAuth.profile();
        if (S.customer.phone && prof && !String(prof.phone || '').trim() && AppAuth.save) {
          AppAuth.save({ phone: S.customer.phone });
        }
      } catch (e) {}

      saveBuyer();
      App.Cart.removeIds(sel.map(function (x) { return x.id; }));
      showDone(id, total, order, cfg);
    }).catch(function (e) {
      stopProgress();
      setBtnLoading(btn, false);
      App.toast('Could not save order: ' + (e.message || 'please try again'), 'err');
    });
  }

  function doneSummaryHTML(order) {
    var c = order.customer || {};
    var rows = (order.items || []).map(function (it) {
      return '<div class="summary-line"><span>' + App.esc(it.name) +
        ' <i class="x">×' + Number(it.qty || 1) + '</i></span>' +
        '<b>' + App.fmtKD(Number(it.price) * Number(it.qty)) + '</b></div>';
    }).join('');

    return '<div class="done-sum">' +
      '<div class="ds-sec">' +
        '<h4>📦 Items ordered</h4>' + rows +
        '<div class="tot-row"><span>Subtotal</span><b>' + App.fmtKD(order.subtotal) + '</b></div>' +
        '<div class="tot-row"><span>Delivery</span><b>' + App.fmtKD(order.deliveryFee) + '</b></div>' +
        '<div class="tot-row big"><span>Total paid</span><span>' + App.fmtKD(order.total) + '</span></div>' +
      '</div>' +
      '<div class="ds-sec">' +
        '<h4>👤 Your details</h4>' +
        '<div class="summary-line"><span>Name</span><b>' + App.esc(c.name || '—') + '</b></div>' +
        '<div class="summary-line"><span>Phone</span><b>' + App.esc(c.phone || '—') + '</b></div>' +
        '<div class="summary-line"><span>Address</span><b>' + App.esc(c.address || '—') + '</b></div>' +
        '<div class="summary-line"><span>Payment</span><b>' +
          (order.paymentMethod === 'wamd' ? '📲 WAMD' : '💵 Cash on Delivery') + '</b></div>' +
        '<div class="summary-line"><span>Screenshot</span><b>' +
          (order.paymentScreenshot ? '<span class="ok-t">📸 uploaded ✓</span>' : '<span class="muted-t">not needed</span>') +
        '</b></div>' +
      '</div>' +
    '</div>';
  }

  var waTimer = null;

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      App.toast('Order details copied ✓', 'ok');
    } catch (e) {
      App.toast('Could not copy — select the text manually', 'err');
    }
    document.body.removeChild(ta);
  }

  function showDone(id, total, order, cfg) {
    var done = el('doneView');
    var flow = el('orderFlow');
    S.done = true;
    if (flow) flow.style.display = 'none';
    if (done) done.style.display = 'block';

    el('doneId').textContent = '#' + String(id).slice(-8).toUpperCase();
    el('doneTotal').textContent = App.fmtKD(total);

    var sum = el('doneSummary');
    if (sum) sum.innerHTML = doneSummaryHTML(order);

    var waWrap = el('doneWa');
    var link = null;
    if (cfg.whatsappSubmitEnabled !== false) {
      link = App.waLink(cfg.whatsappNumber || cfg.ownerPhone, App.buildWaMessage(order, cfg));
    }

    var msgText = link ? App.buildWaMessage(order, cfg) : '';
    var copyBtn = el('doneCopy');
    if (copyBtn) {
      copyBtn.onclick = function () {
        var txt = msgText || App.buildWaMessage(order, cfg);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () {
            App.toast('Order details copied ✓', 'ok');
          }).catch(function () { fallbackCopy(txt); });
        } else {
          fallbackCopy(txt);
        }
      };
    }

    var shareWrap = el('doneShare');
    if (shareWrap) {
      if (order.paymentScreenshot && S.ss && S.ss.url) shareWrap.style.display = 'flex';
      else shareWrap.style.display = 'none';
    }

    if (link && waWrap) {
      waWrap.style.display = 'flex';
      var btn = el('doneWaBtn');
      btn.href = link;
      btn.onclick = function () {
        App.DB.ref('orders/' + id).update({ whatsappSent: true }).catch(function () {});
        cancelAutoWa();
      };
      // No auto-redirect: the customer used to be thrown into WhatsApp while
      // still reading the confirmation. The button above does the same thing
      // the moment they are ready.
    } else if (waWrap) {
      waWrap.style.display = 'none';
      var note = el('doneNote');
      if (note) note.textContent = 'Your order is saved in the shop system. The shop will contact you on your phone number.';
    }

    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    App.toast('Order placed successfully ✓', 'ok');
  }

  function cancelAutoWa() {
    if (waTimer) { clearInterval(waTimer); waTimer = null; }
    var box = el('waCountdown');
    if (box) box.innerHTML = '';
    var stay = el('waStay');
    if (stay) stay.hidden = true;
  }

  // WhatsApp text links cannot carry a file — hand the screenshot to the
  // phone's share sheet instead, which opens WhatsApp with the image attached.
  function shareScreenshot() {
    if (!S.ss || !S.ss.url) return;
    if (!/^data:/.test(S.ss.url)) { window.open(S.ss.url, '_blank', 'noopener'); return; }
    var b64 = S.ss.url.split(',')[1] || '';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var mime = S.ss.url.indexOf('webp') > -1 ? 'image/webp' : 'image/jpeg';
    var file = new File([bytes], 'payment-screenshot.' + (mime === 'image/webp' ? 'webp' : 'jpg'), { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: 'Payment screenshot for my order' }).catch(function () {});
    } else {
      var a = document.createElement('a');
      a.href = S.ss.url;
      a.download = 'payment-screenshot.jpg';
      a.click();
      App.toast('Screenshot downloaded — attach it in the WhatsApp chat', 'ok');
    }
  }

  function boot() {
    var list = el('cartList');

    var s1n = el('s1Next');
    if (s1n) s1n.addEventListener('click', function () {
      // Re-base on the live basket right before moving on: another tab, the
      // cloud copy or a repair may have re-keyed the lines since the last paint.
      syncSel(App.Cart.list());
      var sel = selectedItems();
      if (!sel.length) { App.toast('Select at least one product', 'err'); renderCart(); return; }
      var bad = stockProblems(sel);
      if (bad.length) { App.toast(bad[0], 'err'); renderCart(); return; }
      goStep(2);
    });
    var s1b = el('s1Back');
    if (s1b) s1b.addEventListener('click', function () { location.href = 'index.html'; });

    var locBtn = el('locBtn');
    if (locBtn) locBtn.addEventListener('click', useMyLoc);
    var locAi = el('locAi');
    if (locAi) locAi.addEventListener('click', function () { aiLocate(false); });
    var locNet = el('locNet');
    if (locNet) locNet.addEventListener('click', netLocate);
    var locApply = el('locApply');
    if (locApply) locApply.addEventListener('click', function () {
      var la = parseFloat(String(el('locLat') && el('locLat').value || '').replace(/[^\d.\-]/g, ''));
      var ln = parseFloat(String(el('locLng') && el('locLng').value || '').replace(/[^\d.\-]/g, ''));
      if (!isFinite(la) || !isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
        App.toast('Enter valid coordinates, e.g. 29.2844 and 47.9656', 'err');
        return;
      }
      var box = el('locInfo');
      if (box) box.classList.remove('warn');
      setLoc(la, ln, null, true);
      App.toast('Delivery point saved ✓', 'ok');
    });
    // On plain http the browser will refuse GPS every time — say so up front
    // instead of making the customer tap a button that can only fail.
    if (!window.isSecureContext && navigator.geolocation) {
      var box0 = el('locInfo');
      if (box0) {
        box0.classList.add('warn');
        box0.innerHTML = '<b>📍 GPS is off on this link.</b> Phones only give location on https, so open the shop as ' +
          '<b>https://fixandfit.store</b> and this button will work. Until then tap “Can\'t use GPS?” below — ' +
          'entering the map coordinates works fine and gives the exact delivery fee.';
      }
    }

    var s2n = el('s2Next');
    if (s2n) s2n.addEventListener('click', function () {
      if (!validateStep2()) return;
      // Continue stays locked until a delivery point (lat/lng) is set. If the
      // customer has not used GPS, try to lock it from the typed address via
      // AI first; only move on once the location is actually fixed.
      if (S.customer.lat != null && S.customer.lng != null) { goStep(3); return; }
      s2n.disabled = true;
      var was = s2n.textContent;
      s2n.textContent = '⏳ Finding your area…';
      aiLocate(false).then(function (ok) {
        s2n.disabled = false;
        s2n.textContent = was;
        if (ok && S.customer.lat != null && S.customer.lng != null) goStep(3);
        else App.toast('Set your delivery point to continue (GPS or coordinates)', 'err');
      });
    });
    var s2b = el('s2Back');
    if (s2b) s2b.addEventListener('click', function () { goStep(1); });

    Array.prototype.forEach.call(document.querySelectorAll('.pay-opt'), function (o) {
      o.addEventListener('click', function () {
        // WAMD stays on this page: step 3 already carries the account details
        // and the screenshot upload. Navigating to wamd.html used to bounce the
        // customer back to the payment step, losing their scroll position.
        var m = o.getAttribute('data-pay');
        setPay(m);
        if (m === 'wamd') {
          var w = el('wamdBox');
          if (w && w.scrollIntoView) {
            setTimeout(function () {
              try { w.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
              catch (e) { try { w.scrollIntoView(); } catch (e2) {} }
            }, 60);
          }
        }
      });
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

    var shareBtn = el('doneShareBtn');
    if (shareBtn) shareBtn.addEventListener('click', shareScreenshot);

    var backHome = el('doneHome');
    if (backHome) backHome.addEventListener('click', cancelAutoWa);

    // WAMD account name / number live in the database — re-render the payment
    // step whenever the admin changes them.
    App.on('config', function () {
      if (S.step === 3) renderPayment();
    });

    var gBtn = el('lgGoogle');
    if (gBtn) gBtn.addEventListener('click', function () {
      if (window.AppAuth) AppAuth.signIn(location.pathname + location.search);
    });
    var why = el('lgWhy'), whyText = el('lgWhyText');
    if (why && whyText) why.addEventListener('click', function () { whyText.hidden = !whyText.hidden; });

    if (window.AppAuth) App.on('auth', function () { applyGate(); fillFromProfile(); });

    // The basket is written from four places (this page, the header cart, the
    // AI product cards and the signed-in cloud copy) and the stock flag can
    // change underneath it — repaint or at least re-base the selection.
    function rebake() {
      if (S.step === 1 && !S.done) renderCart();
      else syncSel(App.Cart.list());
    }
    App.on('cart', rebake);
    App.on('products', rebake);

    restoreDraft();
    applyGate();
    fillFromProfile();

    var qp = new URLSearchParams(location.search);
    if (qp.get('payment') === 'wamd' || qp.get('paid') === '1') {
      S.payment = 'wamd';
      goStep(3);
    } else {
      goStep(1);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
