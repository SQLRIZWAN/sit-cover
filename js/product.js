(function () {
  'use strict';

  var pid = null;
  try { pid = new URLSearchParams(location.search).get('id'); } catch (e) {}
  var mediaIdx = 0;
  var mediaCache = {};
  var mediaAsked = {};
  var root = document.getElementById('pdRoot');

  function ensureMedia(p, cb) {
    if (p && p.media && p.media.length) { mediaCache[p.id] = p.media; cb(); return; }
    if (mediaCache[p.id] || mediaAsked[p.id]) { cb(); return; }
    mediaAsked[p.id] = true;
    if (!App.DB) { cb(); return; }
    App.DB.ref('media/' + p.id).once('value').then(function (s) {
      var v = s.val() || {};
      var arr = [];
      Object.keys(v).sort().forEach(function (k) {
        if (v[k] && v[k].url) arr.push(v[k]);
      });
      mediaCache[p.id] = arr;
      cb();
    }).catch(function () { mediaAsked[p.id] = false; cb(); });
  }

  function catName(id) {
    var c = (App.state.categories || {})[id];
    return c ? c.name : '';
  }

  function stageHTML(m) {
    if (!m) {
      return '<div style="min-height:240px;display:flex;align-items:center;justify-content:center;background:#eef2f7;color:#94a3b8;font-size:15px;">No photo available</div>';
    }
    if (m.type === 'video') {
      var poster = m.thumb || App.mediaThumb(m, 700);
      return '<video controls playsinline preload="metadata"' +
        (poster ? ' poster="' + App.esc(poster) + '"' : '') +
        ' src="' + App.esc(m.url) + '"></video>';
    }
    return '<img src="' + App.esc(m.url) + '" alt="product photo" decoding="async">';
  }

  function thumbsHTML(media) {
    if (!media || media.length < 2) return '';
    return '<div class="pd-thumbs">' + media.map(function (m, i) {
      var t = App.mediaThumb(m, 200);
      return '<button class="pd-thumb' + (i === mediaIdx ? ' on' : '') + '" data-i="' + i + '" aria-label="media ' + (i + 1) + '">' +
        (t ? '<img src="' + App.esc(t) + '" alt="" loading="lazy">' : '<span style="font-size:22px">🖼️</span>') +
        (m.type === 'video' ? '<span class="tv"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' : '') +
      '</button>';
    }).join('') + '</div>';
  }

  function render() {
    if (!root) return;

    if (!App.loaded.products) {
      root.innerHTML = '<div class="panel"><p style="color:#6b7280">Loading product…</p></div>';
      return;
    }

    var p = (App.state.products || {})[pid];
    if (!p) {
      root.innerHTML = '<div class="empty" style="margin-top:10px"><div class="big">🔍</div>' +
        '<b>Product not found</b>It may have been removed. Browse all products from Home.' +
        '<div style="margin-top:16px"><a class="btn btn-pri" href="index.html">← Back to Home</a></div></div>';
      return;
    }

    var media = p.media || mediaCache[p.id] || [];
    if (!media.length && p.mediaCount) ensureMedia(p, render);
    if (mediaIdx >= media.length) mediaIdx = 0;
    var m = media[mediaIdx] || null;
    var out = p.inStock === false;
    var cn = catName(p.categoryId);

    document.title = p.name + ' — ' + App.cfg().shopName;

    root.innerHTML =
      '<div class="crumb"><a href="index.html">Home</a> <span>›</span>' +
        (cn ? '<a href="index.html?cat=' + encodeURIComponent(p.categoryId) + '">' + App.esc(cn) + '</a> <span>›</span>' : '') +
        '<span>' + App.esc(p.name) + '</span></div>' +
      '<div class="pd">' +
        '<div class="pd-left">' +
          '<div class="pd-stage" id="pdStage">' + stageHTML(m) + '</div>' +
          thumbsHTML(media) +
        '</div>' +
        '<div class="pd-info">' +
          '<h1>' + App.esc(p.name) + '</h1>' +
          '<div class="pd-meta">' +
            (cn ? '<span class="chip">' + App.esc(cn) + '</span>' : '') +
            '<span class="chip ' + (out ? 'bad' : 'ok') + '">' + (out ? 'Out of Stock' : 'In Stock') + '</span>' +
            (media.length ? '<span class="chip">' + media.length + ' photo' + (media.length > 1 ? 's/videos' : '') + '</span>' : '') +
          '</div>' +
          '<div class="pd-price">' + App.fmtKD(p.price) + '</div>' +
          '<div class="pd-desc"><h3>Details</h3>' + App.esc(p.description || 'Contact the shop for more details about this product.') + '</div>' +
          '<div class="pd-actions">' +
            '<button class="btn btn-pri" id="btnOrder"' + (out ? ' disabled' : '') + '>⚡ Buy Now</button>' +
            '<button class="btn btn-ghost" id="btnAdd"' + (out ? ' disabled' : '') + '>🛒 Add to Cart</button>' +
            '<a class="btn btn-ghost" href="index.html">🏠 Home</a>' +
          '</div>' +
          (out ? '<p style="margin-top:10px;font-size:13px;color:#dc2626;font-weight:700">This item is currently out of stock — ask our AI assistant for similar products.</p>' : '') +
        '</div>' +
      '</div>';

    Array.prototype.forEach.call(root.querySelectorAll('.pd-thumb'), function (b) {
      b.addEventListener('click', function () {
        mediaIdx = Number(b.getAttribute('data-i')) || 0;
        render();
      });
    });

    var bo = document.getElementById('btnOrder');
    if (bo) bo.addEventListener('click', function () {
      App.Cart.add(p, 1);
      App.toast('Added to your basket ✓', 'ok');
      setTimeout(function () { location.href = 'order.html'; }, 350);
    });

    var ba = document.getElementById('btnAdd');
    if (ba) ba.addEventListener('click', function () {
      App.Cart.add(p, 1);
      App.toast('Added to your basket ✓', 'ok');
    });

  }

  App.on('products', render);
  App.on('categories', render);
  App.on('config', render);
})();
