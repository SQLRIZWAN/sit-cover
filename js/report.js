(function () {
  'use strict';
  var btn = document.getElementById('rpSubmit');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var msg = document.getElementById('rpMessage').value.trim();
    if (!msg) { App.toast('Please describe the issue', 'err'); return; }
    if (!App.DB) { App.toast('Please wait for the shop connection', 'err'); return; }
    btn.disabled = true; btn.textContent = 'Submitting…';
    App.DB.ref('reports').push({
      name: document.getElementById('rpName').value.trim(),
      phone: document.getElementById('rpPhone').value.trim(),
      type: document.getElementById('rpType').value,
      message: msg,
      status: 'new',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      document.getElementById('rpStatus').textContent = 'Thank you. Your report was submitted successfully.';
      btn.textContent = 'Submitted ✓'; document.getElementById('rpMessage').value = '';
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Submit Report'; App.toast('Could not submit report: ' + e.message, 'err');
    });
  });
})();
