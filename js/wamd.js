(function () {
  'use strict';
  // WAMD is the last step of checkout — only a signed-in account can reach it.
  if (!(window.AppAuth && AppAuth.profile && AppAuth.profile())) {
    location.replace('order.html');
    return;
  }
  var shot = null, paid = false, file = document.getElementById('wmShot'), btn = document.getElementById('wmPaid'), upload = document.getElementById('wmUpload'), status = document.getElementById('wmStatus');
  function draft() { try { return JSON.parse(localStorage.getItem(App.scopedKey('sc_order_draft')) || '{}'); } catch (e) { return {}; } }
  // Amount = selected items + the SAME distance-based fee shown on the order
  // page. Using deliveryFee(null) here used to force the top (5 KD) tier, so
  // the WAMD screen demanded more than the checkout total.
  function amount() {
    var d = draft();
    var items = App.Cart.list().filter(function (x) { return d.sel && d.sel[String(x.id)]; });
    var sub = items.reduce(function (s, x) { return s + Number(x.price || 0) * Number(x.qty || 1); }, 0);
    var km = (d.distance == null || !isFinite(d.distance)) ? null : d.distance;
    return sub + App.deliveryFee(km);
  }
  function fill(c) { document.getElementById('wmAmount').textContent = App.fmtKD(amount()); document.getElementById('wmName').textContent = c.wamdName || c.shopName || 'Shop account'; document.getElementById('wmNumber').textContent = c.wamdNumber || c.ownerPhone || '—'; document.getElementById('wmMessage').textContent = 'WAMD payment for your order to ' + (c.shopName || 'the shop') + '. Please pay ' + App.fmtKD(amount()) + '.'; }
  file.addEventListener('change', function () { var f = file.files[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) { App.toast('Screenshot is too large', 'err'); return; } if (!App.DB) { App.toast('Please wait for connection', 'err'); return; } btn.disabled = true; status.textContent = 'Uploading screenshot…'; App.cloudUpload(f, function () {}).then(function (m) { shot = m; btn.disabled = false; btn.textContent = '✅ Continue to order'; status.textContent = 'Screenshot attached ✓'; }).catch(function (e) { btn.disabled = false; App.toast(e.message, 'err'); }); });
  btn.addEventListener('click', function () { if (!paid) { paid = true; upload.hidden = false; btn.textContent = '✅ Attach screenshot and continue'; status.textContent = 'Attach your payment screenshot, then continue.'; upload.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; } if (!shot) { App.toast('Attach your payment screenshot first', 'err'); return; } localStorage.setItem('sc_wamd_shot', JSON.stringify(shot)); location.href = 'order.html?payment=wamd&paid=1'; });
  fill(App.cfg());
  App.on('config', function (c) { if (c) fill(c); });
})();
