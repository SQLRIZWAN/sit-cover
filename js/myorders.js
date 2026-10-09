(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(s) { return (window.App && App.esc) ? App.esc(s) : String(s == null ? '' : s); }

  function profile() {
    return (window.AppAuth && AppAuth.profile && AppAuth.profile()) || null;
  }

  var STEPS = [
    { key: 'placed', label: 'Order placed' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'shipped', label: 'Out for delivery' },
    { key: 'delivered', label: 'Delivered' }
  ];

  var STATUS = {
    new: { label: '⏳ Order placed', cls: 'new', step: 0 },
    confirmed: { label: '✅ Confirmed', cls: 'confirmed', step: 1 },
    shipped: { label: '🚚 Out for delivery', cls: 'shipped', step: 2 },
    delivered: { label: '📦 Delivered', cls: 'delivered', step: 3 },
    cancelled: { label: '❌ Cancelled', cls: 'cancelled', step: 0 }
  };

  function statusOf(o) {
    var s = (o && o.status) ? String(o.status) : '';
    if (!s || s === 'pending' || s === 'awaiting') s = 'new';
    return STATUS[s] ? s : 'new';
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function fmtClock(d) {
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (!h) h = 12;
    return h + ':' + two(m) + ' ' + ap;
  }

  function fmtDay(d) {
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtStamp(ts) {
    if (!ts) return '';
    var d = new Date(Number(ts));
    return fmtDay(d) + ' · ' + fmtClock(d);
  }

  // The promised moment. The shop sets a date/time in the admin panel; when it
  // has not, we promise the default of 24 hours from the order.
  function target(o) {
    if (o.deliveryDate) {
      var t = /^([0-2]\d):([0-5]\d)$/.test(o.deliveryTime || '') ? o.deliveryTime : '18:00';
      var d = new Date(o.deliveryDate + 'T' + t + ':00');
      if (!isNaN(d.getTime())) return { at: d.getTime(), set: true };
    }
    return { at: Number(o.createdAt || 0) + 24 * 3600 * 1000, set: false };
  }

  function relative(ts) {
    var diff = Number(ts) - Date.now();
    if (!isFinite(ts) || ts <= 0) return '';
    if (diff <= 0) return 'due now';
    var mins = Math.round(diff / 60000);
    if (mins < 60) return 'in about ' + mins + ' min';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'in about ' + hrs + ' h ' + (mins % 60 ? (mins % 60) + ' m' : '');
    var days = Math.floor(hrs / 24);
    return 'in about ' + days + (days === 1 ? ' day' : ' days');
  }

  function etaHTML(o, st) {
    var t = target(o);
    var head = t.set
      ? '🗓️ Expected ' + fmtDay(new Date(t.at)) + ' · ' + fmtClock(new Date(t.at))
      : '📦 Usually delivered within 24 hours of your order';
    var sub = '';
    if (st !== 'delivered' && st !== 'cancelled') {
      var rel = relative(t.at);
      sub = '<span class="mo-eta-rel ' + (t.at < Date.now() ? 'late' : '') + '">' +
        (t.at < Date.now() ? '⚠️ ' + (t.set ? 'delivery time has passed' : 'taking longer than usual') + ' — the shop will call you' : '⏱️ ' + rel) +
        '</span>';
    } else if (st === 'delivered') {
      sub = '<span class="mo-eta-rel ok">✓ ' + (o.deliveredAt ? 'Delivered ' + fmtStamp(o.deliveredAt) : 'Completed') + '</span>';
    }
    var note = o.deliveryNote ? '<div class="mo-note">💬 ' + esc(o.deliveryNote) + '</div>' : '';
    return '<div class="mo-eta"><div class="mo-eta-main">' + esc(head) + '</div>' + sub + note + '</div>';
  }

  function trackerHTML(o, st) {
    if (st === 'cancelled') {
      return '<div class="mo-track cancelled"><div class="mo-track-bar"><i class="fill" style="width:0%"></i></div>' +
        '<div class="mo-steps">' + STEPS.map(function (s) {
          return '<div class="mo-step off"><span class="dot">✕</span><small>' + esc(s.label) + '</small></div>';
        }).join('') + '</div>' +
        '<div class="mo-cancel-note">❌ This order was cancelled. Contact the shop if you need help.</div></div>';
    }
    var cur = STATUS[st].step;
    var pct = (cur / (STEPS.length - 1)) * 100;
    return '<div class="mo-track"><div class="mo-track-bar"><i class="fill" style="width:' + pct + '%"></i></div>' +
      '<div class="mo-steps">' + STEPS.map(function (s, i) {
        var cls = i < cur ? 'done' : (i === cur ? 'on' : 'off');
        return '<div class="mo-step ' + cls + '"><span class="dot">' + (i < cur ? '✓' : (i + 1)) + '</span><small>' + esc(s.label) + '</small></div>';
      }).join('') + '</div></div>';
  }

  function itemsHTML(o) {
    var items = o.items || [];
    return '<div class="mo-items">' + items.map(function (it) {
      return '<div class="mo-item">' +
        '<span class="mi-n">' + esc(it.name) + ' <i>×' + Number(it.qty || 1) + '</i></span>' +
        '<b>' + App.fmtKD(Number(it.price) * Number(it.qty)) + '</b></div>';
    }).join('') + '</div>';
  }

  function orderHTML(o) {
    var st = statusOf(o);
    var meta = STATUS[st];
    var c = o.customer || {};
    var id = '#' + String(o.id || '').slice(-8).toUpperCase();
    return '<article class="mo-card ' + meta.cls + '" data-id="' + esc(o.id) + '">' +
      '<header class="mo-card-h">' +
        '<div><b class="mo-id-code">' + esc(id) + '</b>' +
          '<span class="mo-date">' + esc(fmtStamp(o.createdAt)) + '</span></div>' +
        '<span class="mo-badge ' + meta.cls + '">' + esc(meta.label) + '</span>' +
      '</header>' +
      etaHTML(o, st) +
      trackerHTML(o, st) +
      '<div class="mo-meta">' +
        '<span>👤 ' + esc(c.name || '—') + '</span>' +
        '<span>📍 ' + esc(c.address || 'address on file') + '</span>' +
        '<span>💳 ' + (o.paymentMethod === 'wamd' ? '📲 WAMD' : '💵 Cash on delivery') + '</span>' +
      '</div>' +
      '<button type="button" class="mo-toggle" data-act="toggle">View ' + (o.items || []).length +
        ' item' + ((o.items || []).length === 1 ? '' : 's') + ' &amp; total ▾</button>' +
      '<div class="mo-details" hidden>' +
        itemsHTML(o) +
        '<div class="mo-sum"><span>Total paid</span><b>' + App.fmtKD(o.total) + '</b></div>' +
        '<div class="mo-sum"><span>Delivery fee</span><b>' + App.fmtKD(o.deliveryFee) + '</b></div>' +
      '</div>' +
      '<div class="mo-actions">' +
        '<a class="btn btn-ghost btn-sm" href="index.html">Shop again</a>' +
        '<a class="btn btn-ghost btn-sm" id="moWa" href="' + esc(waHref()) + '" target="_blank" rel="noopener">💬 Ask the shop</a>' +
      '</div>' +
    '</article>';
  }

  function waHref() {
    var cfg = App.cfg();
    var num = String(cfg.whatsappNumber || cfg.ownerPhone || '').replace(/[^0-9]/g, '');
    if (!num) return '#';
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hi, I am checking on my order.');
  }

  function render() {
    var p = profile();
    var out = el('moOut'), inn = el('moIn');
    if (!out || !inn) return;

    if (!p) {
      out.hidden = false;
      inn.hidden = true;
      return;
    }
    out.hidden = true;
    inn.hidden = false;

    var initial = (p.name || p.email || '?').trim().charAt(0).toUpperCase() || '?';
    var av = el('moAv');
    if (av) {
      av.innerHTML = p.photo
        ? '<img src="' + esc(p.photo) + '" alt="" data-fb="' + esc(initial) + '">'
        : '<span>' + esc(initial) + '</span>';
    }
    if (el('moName')) el('moName').textContent = p.name || 'Your account';
    if (el('moEmail')) el('moEmail').textContent = p.email || '';

    var mine = App.state.myOrders || [];
    mine.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    if (el('moTotal')) el('moTotal').textContent = mine.length;
    if (el('moActive')) el('moActive').textContent = mine.filter(function (o) {
      var s = statusOf(o); return s === 'new' || s === 'confirmed' || s === 'shipped';
    }).length;
    if (el('moDone')) el('moDone').textContent = mine.filter(function (o) { return statusOf(o) === 'delivered'; }).length;

    var list = el('moList');
    if (!list) return;

    var err = el('moErr');
    if (err) {
      if (!App.loaded.products && App.fbAuthError) {
        err.hidden = false;
        err.innerHTML = '<b>Could not load your orders.</b><br>' +
          'The shop database refused the connection (' + esc(App.fbAuthError) + '). ' +
          'Please try again in a moment.';
      } else {
        err.hidden = true;
      }
    }

    if (!mine.length) {
      if (!App.state.allOrders) {
        list.innerHTML = '<div class="empty-box mo-empty"><div class="big">⏳</div>' +
          '<b>Loading your orders…</b>Fetching the latest status from the shop.</div>';
        return;
      }
      list.innerHTML = '<div class="empty-box mo-empty"><div class="big">🧾</div>' +
        '<b>No orders yet</b>' +
        'Everything you order from the shop will show up here with live delivery status.' +
        '<div style="margin-top:16px"><a class="btn btn-pri" href="index.html">Start shopping</a></div></div>';
      return;
    }

    list.innerHTML = mine.map(orderHTML).join('');

    Array.prototype.forEach.call(list.querySelectorAll('.mo-toggle'), function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.mo-card');
        var d = card && card.querySelector('.mo-details');
        if (!d) return;
        d.hidden = !d.hidden;
        b.innerHTML = d.hidden
          ? 'View ' + card.querySelectorAll('.mo-item').length + ' items &amp; total ▾'
          : 'Hide details ▴';
      });
    });
  }

  // The countdown text has to keep itself honest between data updates.
  function refreshCountdowns() {
    var list = el('moList');
    var wrap = el('moIn');
    if (!list || !wrap || wrap.hidden) return;
    var mine = App.state.myOrders || [];
    Array.prototype.forEach.call(list.querySelectorAll('.mo-card'), function (card) {
      var id = card.getAttribute('data-id');
      var o = null;
      for (var i = 0; i < mine.length; i++) if (String(mine[i].id) === id) { o = mine[i]; break; }
      if (!o) return;
      var st = statusOf(o);
      var box = card.querySelector('.mo-eta');
      if (box) box.outerHTML = etaHTML(o, st);
    });
  }

  function boot() {
    var btn = el('moSignIn');
    if (btn) btn.addEventListener('click', function () {
      if (window.AppAuth) AppAuth.signIn(location.pathname + location.search);
    });

    render();
    App.on('auth', render);
    App.on('myOrders', render);

    setInterval(refreshCountdowns, 30000);

    // Nothing arrived within a few seconds — most likely anonymous sign-in is
    // switched off in the Firebase console.
    setTimeout(function () {
      if (!App.state.allOrders) {
        var err = el('moErr');
        if (err && profile()) {
          err.hidden = false;
          err.innerHTML = '<b>Still connecting to the shop…</b><br>' +
            'If this message does not go away, check your internet. ' +
            'Order tracking needs the shop database to allow visitors to sign in (Authentication → Sign-in method → Anonymous).';
        }
      }
    }, 7000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
