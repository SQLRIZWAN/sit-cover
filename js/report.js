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
      btn.textContent = 'Submitted ✓';
      el('rpMessage').value = '';
      shot = null;
      paintPreview();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Submit Report';
      App.toast('Could not submit report: ' + e.message, 'err');
    });
  });
})();
