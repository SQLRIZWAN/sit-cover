(function () {
  'use strict';

  if (!window.App || !window.AppAuth) return;

  function el(id) { return document.getElementById(id); }

  var pendingPic = null;   // data URL chosen but not saved yet
  var busy = false;

  function readDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('Cannot read that file')); };
      fr.readAsDataURL(file);
    });
  }

  function avatarHTML(photo, initial) {
    if (photo) {
      return '<img src="' + App.esc(photo) + '" alt="" data-fb="' + App.esc(initial || '?') + '">';
    }
    return '<span class="pf-av-ph">' + App.esc(initial || '👤') + '</span>';
  }

  function render() {
    var p = AppAuth.profile();
    var out = el('profOut'), inn = el('profIn');
    if (!out || !inn) return;

    if (!p) {
      out.hidden = false;
      inn.hidden = true;
      return;
    }

    out.hidden = true;
    inn.hidden = false;

    var shown = pendingPic != null ? pendingPic : p.photo;
    var initial = (p.name || p.email || '?').trim().charAt(0).toUpperCase() || '?';
    var av = el('pfAv');
    if (av) av.innerHTML = avatarHTML(shown, initial);

    if (el('pfNameOut')) el('pfNameOut').textContent = p.name || 'Your name';
    if (el('pfEmailOut')) el('pfEmailOut').textContent = p.email || '';
    if (el('pfName') && document.activeElement !== el('pfName')) el('pfName').value = p.name || '';
    if (el('pfPhone') && document.activeElement !== el('pfPhone')) el('pfPhone').value = p.phone || '';
    if (el('pfInfo') && document.activeElement !== el('pfInfo')) el('pfInfo').value = p.info || '';

    // Stats strip — orders come from the live feed core.js already listens to.
    var mine = App.state.myOrders || [];
    var items = 0;
    mine.forEach(function (o) {
      (o.items || []).forEach(function (it) { items += Number(it.qty || 1); });
    });
    if (el('pfStatOrders')) el('pfStatOrders').textContent = String(mine.length);
    if (el('pfStatItems')) el('pfStatItems').textContent = String(items);
    if (el('pfStatPhone')) el('pfStatPhone').textContent = p.phone || '—';
    if (el('pfSince') && p.signedInAt) {
      try {
        el('pfSince').textContent = 'Since ' +
          new Date(Number(p.signedInAt)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      } catch (e) {}
    }

    var reset = el('pfPicReset');
    if (reset) {
      var custom = !!pendingPic || (!!p.photo && p.photo !== p.googlePhoto);
      reset.classList.toggle('hide', !custom);
    }
  }

  function viewPhoto() {
    var p = AppAuth.profile();
    if (!p) return;
    var src = pendingPic != null ? pendingPic : p.photo;
    if (!src) { App.toast('No photo yet — tap “Change photo” to add one', 'err'); return; }
    App.viewImage(src, (p.name || 'Profile') + ' photo');
  }

  function openPicker() {
    var f = el('pfFile');
    if (f) f.click();
  }

  function pickPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { App.toast('Please choose an image file', 'err'); return; }
    if (file.size > 6 * 1024 * 1024) { App.toast('Photo is too large — pick one under 6 MB', 'err'); return; }
    readDataURL(file).then(function (dataUrl) {
      return App.makeVariant(dataUrl, 240, 0.85);
    }).then(function (small) {
      if (!small) { App.toast('Could not process that photo', 'err'); return; }
      pendingPic = small;
      render();
      App.toast('Photo ready — tap “Save changes”', 'ok');
    }).catch(function (e) {
      App.toast(e && e.message ? e.message : 'Could not read that photo', 'err');
    });
  }

  function setBusy(on, label) {
    busy = !!on;
    var b = el('pfSave');
    if (!b) return;
    b.disabled = busy;
    b.setAttribute('aria-busy', busy ? 'true' : 'false');
    b.textContent = label || (busy ? 'Saving…' : 'Save changes');
  }

  function save() {
    if (busy) return;
    var p = AppAuth.profile();
    if (!p) return;

    var patch = {
      name: (el('pfName') ? el('pfName').value.trim() : p.name),
      phone: (el('pfPhone') ? el('pfPhone').value.trim() : p.phone),
      info: (el('pfInfo') ? el('pfInfo').value.trim() : p.info)
    };
    if (pendingPic != null) patch.photo = pendingPic;
    if (!patch.name) { App.toast('Please enter your name', 'err'); if (el('pfName')) el('pfName').focus(); return; }

    setBusy(true);
    AppAuth.save(patch).then(function () {
      pendingPic = null;
      setBusy(false, 'Saved ✓');
      render();
      App.toast('Profile saved ✓', 'ok');
      setTimeout(function () { setBusy(false); }, 2200);
    }).catch(function (e) {
      setBusy(false);
      var offline = !App.DB;
      App.toast(
        offline
          ? 'Saved on this device — the shop server is not connected yet. Tap Save again in a moment.'
          : 'Could not save: ' + ((e && e.message) || 'please try again'),
        'err'
      );
      render();
    });
  }

  function init() {
    var g = el('gSignIn');
    if (g) g.addEventListener('click', function () {
      g.disabled = true;
      g.setAttribute('aria-busy', 'true');
      AppAuth.signIn(location.pathname + location.search);
      // If the browser blocks the redirect the user can simply tap again.
      setTimeout(function () {
        g.disabled = false;
        g.setAttribute('aria-busy', 'false');
      }, 4000);
    });

    var pic = el('pfPicBtn'), pic2 = el('pfPicBtn2'), file = el('pfFile'), view = el('pfViewDp');
    // Tapping the avatar opens the photo full screen — changing it is a
    // separate, explicit action so nobody overwrites their DP by accident.
    if (pic) pic.addEventListener('click', viewPhoto);
    if (view) view.addEventListener('click', viewPhoto);
    if (pic2) pic2.addEventListener('click', openPicker);
    if (file) file.addEventListener('change', function () {
      pickPhoto(file.files && file.files[0]);
      file.value = '';
    });

    var reset = el('pfPicReset');
    if (reset) reset.addEventListener('click', function () {
      var p = AppAuth.profile();
      if (!p) return;
      pendingPic = null;
      reset.disabled = true;
      AppAuth.save({ photo: p.googlePhoto || '' }).then(function () {
        reset.disabled = false;
        render();
        App.toast('Google photo restored ✓', 'ok');
      }).catch(function () {
        reset.disabled = false;
        render();
        App.toast('Could not update the photo', 'err');
      });
    });

    var saveBtn = el('pfSave');
    if (saveBtn) saveBtn.addEventListener('click', save);

    var outBtn = el('pfOut');
    if (outBtn) outBtn.addEventListener('click', function () {
      if (busy) return;
      outBtn.disabled = true;
      AppAuth.signOut();
      outBtn.disabled = false;
      pendingPic = null;
      render();
    });

    App.on('auth', render);
    App.on('myOrders', function () { if (!el('profIn').hidden) render(); });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
