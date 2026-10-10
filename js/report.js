(function () {
  'use strict';

  var btn = document.getElementById('rpSubmit');
  if (!btn) return;

  var MAX_SHOT = 8 * 1024 * 1024;
  var shot = null; // { data, name }

  function el(id) { return document.getElementById(id); }

  function readDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('Cannot read that file')); };
      fr.readAsDataURL(file);
    });
  }

  // Screenshots are downscaled and flattened onto white so a transparent PNG
  // never turns into a black rectangle once it is saved as JPEG.
  function prepShot(file) {
    return readDataURL(file).then(function (src) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || 1;
            var h = img.naturalHeight || 1;
            var scale = Math.min(1, 1400 / Math.max(w, h));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(w * scale));
            c.height = Math.max(1, Math.round(h * scale));
            var g = c.getContext('2d');
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, c.width, c.height);
            g.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.72));
          } catch (e) { resolve(src); }
        };
        img.onerror = function () { resolve(src); };
        img.src = src;
      });
    });
  }

  function paintPreview() {
    var box = el('rpPreview');
    if (!box) return;
    if (!shot) { box.hidden = true; return; }
    box.hidden = false;
    el('rpPreviewImg').src = shot.data;
    el('rpPreviewName').textContent = shot.name;
  }

  function pick(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { App.toast('Please choose an image file', 'err'); return; }
    if (file.size > MAX_SHOT) { App.toast('Screenshot is too large — max 8 MB', 'err'); return; }
    App.toast('Preparing screenshot…', 'ok');
    prepShot(file).then(function (data) {
      shot = { data: data, name: file.name || 'screenshot.jpg' };
      paintPreview();
      App.toast('Screenshot attached ✓', 'ok');
    }).catch(function (e) {
      App.toast((e && e.message) || 'Could not read that screenshot', 'err');
    });
  }

  var shotBtn = el('rpShot'), fileIn = el('rpFile');
  if (shotBtn && fileIn) {
    shotBtn.addEventListener('click', function () { fileIn.value = ''; fileIn.click(); });
    fileIn.addEventListener('change', function () { pick(fileIn.files && fileIn.files[0]); });
  }
  var rm = el('rpRemove');
  if (rm) rm.addEventListener('click', function () { shot = null; paintPreview(); });

  // Live character counter so a long message never hits the 2000 limit by surprise
  var msgBox = el('rpMessage'), count = el('rpCount');
  if (msgBox && count) {
    var paintCount = function () {
      var n = (msgBox.value || '').length;
      count.textContent = n + ' / 2000';
      count.classList.toggle('near', n > 1800);
    };
    msgBox.addEventListener('input', paintCount);
    paintCount();
  }

  function reportText() {
    return [
      'Report — ' + (el('rpType').value || 'Other'),
      'Name: ' + (el('rpName').value.trim() || '—'),
      'Phone: ' + (el('rpPhone').value.trim() || '—'),
      '',
      el('rpMessage').value.trim()
    ].join('\n');
  }

  function shopPhone() {
    var c = App.cfg();
    return String(c.ownerPhone || c.whatsappNumber || '').replace(/[^0-9]/g, '');
  }

  // If the shop database refuses the write, the customer still has a way to
  // reach us: the same report goes out on WhatsApp instead of a dead end.
  function showWaFallback() {
    var box = el('rpWa');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'rp-wa-lead';
    p.textContent = 'You can still send it to us on WhatsApp — it takes one tap.';
    var a = document.createElement('button');
    a.type = 'button';
    a.className = 'btn btn-pri rp-wa-btn';
    a.textContent = '💬 Send this report on WhatsApp';
    a.addEventListener('click', function () {
      var link = App.waLink(shopPhone(), reportText());
      if (!link) { App.toast('WhatsApp number is not set yet', 'err'); return; }
      if (shot && shot.data && navigator.canShare) {
        var name = /\.png$/i.test(shot.name) ? 'report.png' : 'report.jpg';
        var file = new File([dataURItoBlob(shot.data)], name, { type: shot.data.split(';')[0].replace('data:', '') });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: reportText() }).catch(function () { location.href = link; });
          return;
        }
      }
      location.href = link;
    });
    box.appendChild(p);
    box.appendChild(a);
  }

  function dataURItoBlob(data) {
    var parts = String(data).split(',');
    var bin = atob(parts[1] || '');
    var mime = (parts[0].match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  btn.addEventListener('click', function () {
    var msg = el('rpMessage').value.trim();
    if (!msg) { App.toast('Please describe the issue', 'err'); return; }
    if (!App.DB) { App.toast('Please wait for the shop connection', 'err'); return; }
    btn.disabled = true; btn.textContent = 'Submitting…';
    var rec = {
      name: el('rpName').value.trim(),
      phone: el('rpPhone').value.trim(),
      type: el('rpType').value,
      message: msg,
      status: 'new',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (shot && shot.data) { rec.image = shot.data; rec.imageName = shot.name; }
    App.DB.ref('reports').push(rec).then(function () {
      el('rpStatus').textContent = 'Thank you. Your report was submitted successfully.';
      el('rpMessage').value = '';
      if (count) { count.textContent = '0 / 2000'; count.classList.remove('near'); }
      shot = null;
      paintPreview();
      if (el('rpWa')) el('rpWa').hidden = true;
      // Ready for another one — the button must not stay locked after success
      btn.disabled = false;
      btn.textContent = 'Submit Report';
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Submit Report';
      var code = (e && e.code) || '';
      if (/PERMISSION_DENIED/i.test(code + ' ' + (e && e.message))) {
        el('rpStatus').textContent = 'It could not be saved from this device. Send it on WhatsApp below instead.';
        showWaFallback();
        App.toast('Could not save it here — send it on WhatsApp instead', 'err');
        return;
      }
      App.toast('Could not submit report: ' + ((e && e.message) || 'unknown error'), 'err');
    });
  });
})();
