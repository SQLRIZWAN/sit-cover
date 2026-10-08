(function () {
  'use strict';

  var currentCat = 'home';

  function paramCat() {
    try {
      var v = new URLSearchParams(location.search).get('cat');
      return v || 'home';
    } catch (e) { return 'home'; }
  }

  function syncUrl() {
    try {
      var url = location.pathname + (currentCat === 'home' ? '' : '?cat=' + encodeURIComponent(currentCat));
      history.replaceState(null, '', url);
    } catch (e) {}
  }

  function renderTabs() {
    var bar = document.getElementById('tabsBar');
    if (!bar) return;
    var cats = App.catList();
    var items = [{ id: 'home', name: 'Home', icon: '🏠' }];
    cats.forEach(function (c) { items.push({ id: c.id, name: c.name, icon: c.icon || '🛍️' }); });

    var found = false;
    items.forEach(function (i) { if (i.id === currentCat) found = true; });
    if (!found) currentCat = 'home';

    bar.innerHTML = '<div class="wrap"><div class="tabs-in">' + items.map(function (i) {
      return '<button class="tab' + (i.id === currentCat ? ' on' : '') + '" data-cat="' + App.esc(i.id) + '">' +
        App.esc(i.icon) + ' ' + App.esc(i.name) + '</button>';
    }).join('') + '</div></div>';

    Array.prototype.forEach.call(bar.querySelectorAll('.tab'), function (btn) {
      btn.addEventListener('click', function () {
        currentCat = btn.getAttribute('data-cat');
        renderTabs();
        renderGrid();
        syncUrl();
      });
    });
  }

  function catName(id) {
    var c = (App.state.categories || {})[id];
    return c ? c.name : '';
  }

  function cardHTML(p) {
    var m = App.firstMedia(p);
    var thumb = m ? App.mediaThumb(m, 400) : '';
    var isVideo = (m && m.type === 'video') || p.videoFirst === true;
    var out = p.inStock === false;

    var media;
    if (thumb) {
      media = '<img src="' + App.esc(thumb) + '" alt="' + App.esc(p.name) + '" loading="lazy" decoding="async">' +
        (isVideo ? '<span class="p-play"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></span>' : '');
    } else {
      media = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:34px;">🛍️</div>';
    }

    return '<a class="p-card" href="product.html?id=' + encodeURIComponent(p.id) + '">' +
      (out ? '<span class="badge">Out of Stock</span>' : '') +
      '<div class="p-media">' + media + '</div>' +
      '<div class="p-body">' +
        '<div class="p-cat">' + App.esc(catName(p.categoryId) || 'Product') + '</div>' +
        '<div class="p-name">' + App.esc(p.name) + '</div>' +
        '<div class="p-price">' + App.fmtKD(p.price) + '</div>' +
      '</div>' +
    '</a>';
  }

  function renderGrid() {
    var grid = document.getElementById('productGrid');
    if (!grid) return;

    if (!App.loaded.products) {
      grid.innerHTML = skeletonHTML();
      return;
    }

    var all = App.prodList();
    var list = currentCat === 'home' ? all : all.filter(function (p) { return p.categoryId === currentCat; });

    if (!list.length) {
      if (!all.length) {
        grid.innerHTML = '<div class="empty"><div class="big">🛍️</div><b>No products yet</b>' +
          'New items will appear here as soon as they are added from the admin panel.</div>';
      } else {
        grid.innerHTML = '<div class="empty"><div class="big">📦</div><b>Nothing in this category yet</b>' +
          'Check the Home tab to see all products, or pick another category.</div>';
      }
      return;
    }

    grid.innerHTML = list.map(cardHTML).join('');
  }

  function skeletonHTML() {
    var one = '<div class="p-card" style="pointer-events:none">' +
      '<div class="p-media" style="background:linear-gradient(90deg,#eef2f7 25%,#e2e8f0 50%,#eef2f7 75%);background-size:200% 100%;animation:fadeUp 1s infinite alternate"></div>' +
      '<div class="p-body"><div class="p-cat">…</div><div class="p-name">Loading products…</div><div class="p-price">—</div></div></div>';
    return one + one + one + one;
  }

  currentCat = paramCat();

  App.on('categories', function () { renderTabs(); });
  App.on('products', function () { renderTabs(); renderGrid(); });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.p-card');
    if (a) a.style.transform = 'scale(.98)';
    setTimeout(function () { if (a) a.style.transform = ''; }, 150);
  });
})();
