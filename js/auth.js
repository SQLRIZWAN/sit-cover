(function () {
  'use strict';

  var App = window.App;
  if (!App) return;

  var SKEY = 'sc_session';
  var PKEY = 'sc_profile';
  var CKEY = 'sc_auth_seen';
  var EKEY = 'sc_auth_error';
  var SESSION_DAYS = 30;

  // Google OAuth is fronted by the project's Supabase Auth endpoint. The project
  // ref and client id are public by design — never put the client secret here.
  var SUPA = (function () {
    var c = (window.APP_CONFIG && window.APP_CONFIG.supabase) || {};
    return {
      url: String(c.url || 'https://pclvcxkgvzxxbppfnzgh.supabase.co').replace(/\/+$/, ''),
      clientId: c.clientId || '605955318342-d6q2c8c0n3jocqur876n1craea739jq0.apps.googleusercontent.com'
    };
  })();

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  function safeDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function parseJSON(v) {
    if (!v) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }

  function safeKey(v) {
    return String(v == null ? '' : v).replace(/[.#$[\]/]/g, '_');
  }

  function b64urlDecode(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    if (typeof TextDecoder !== 'undefined') {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
    var out = '';
    for (var j = 0; j < bin.length; j++) out += '%' + ('00' + bin.charCodeAt(j).toString(16)).slice(-2);
    try { return decodeURIComponent(out); } catch (e) { return bin; }
  }

  function decodeJwt(token) {
    try {
      var parts = String(token).split('.');
      if (parts.length < 2) return null;
      return JSON.parse(b64urlDecode(parts[1]));
    } catch (e) { return null; }
  }

  function readSession() {
    var s = parseJSON(safeGet(SKEY));
    if (!s || !s.uid) return null;
    if (s.exp && Date.now() > s.exp) { safeDel(SKEY); return null; }
    return s;
  }

  function readProfile() {
    return parseJSON(safeGet(PKEY));
  }

  function writeSession(s) { safeSet(SKEY, JSON.stringify(s)); }

  function userFromClaims(claims) {
    var md = (claims && claims.user_metadata) || {};
    // Google can hand the avatar over in several places depending on how the
    // OAuth consent screen is set up — check all of them before giving up.
    var pic = String(md.picture || md.avatar_url || md.photo_url ||
      claims.picture || claims.avatar_url || (claims.identity_data && (claims.identity_data.picture || claims.identity_data.avatar_url)) || '').trim();
    return {
      uid: String(claims.sub || md.sub || md.provider_id || '').trim(),
      email: String(claims.email || md.email || '').trim(),
      name: String(md.full_name || md.name || claims.name || claims.email || '').trim(),
      photo: pic,
      provider: String(((claims.app_metadata && claims.app_metadata.provider) || 'google'))
    };
  }

  // ---- Sign in / out -------------------------------------------------------

  // Supabase only accepts absolute URLs in redirect_to.
  function absoluteUrl(u) {
    if (!u) return location.origin + location.pathname + location.search;
    try {
      return new URL(u, location.origin).href;
    } catch (e) {
      return location.origin + location.pathname + location.search;
    }
  }

  function authorizeUrl(returnTo) {
    var to = absoluteUrl(returnTo);
    return SUPA.url + '/auth/v1/authorize?provider=google' +
      '&redirect_to=' + encodeURIComponent(to) +
      '&client_id=' + encodeURIComponent(SUPA.clientId);
  }

  function signIn(returnTo) {
    location.href = authorizeUrl(returnTo);
  }

  function signOut() {
    safeDel(SKEY);
    App.state.auth = null;
    App.fire('auth');
    AppAuth.notify('You are signed out.');
  }

  // Absorb the tokens Supabase drops on our redirect. Runs as early as this
  // file loads so the address bar is cleaned before anything renders.
  function consumeCallback() {
    var raw = '';
    if (location.hash && location.hash.length > 1) raw += location.hash.slice(1) + '&';
    if (location.search && location.search.length > 1) raw += location.search.slice(1);
    if (!raw || raw.indexOf('=') < 0) return;

    var params = {};
    raw.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      var v = i < 0 ? '' : pair.slice(i + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
      if (!(k in params)) params[k] = v;
    });

    var hadTokens = !!params.access_token;
    var err = params.error ? {
      code: params.error,
      desc: params.error_description || params.error_code || ''
    } : null;

    if (hadTokens) {
      var claims = decodeJwt(params.access_token);
      if (claims && claims.sub) {
        var u = userFromClaims(claims);
        if (u.uid) {
          var prev = readProfile();
          var prof = (prev && prev.uid === u.uid) ? prev : null;
          var seen = parseJSON(safeGet(CKEY)) || {};
          var first = !seen[u.uid];
          writeSession({
            uid: u.uid,
            email: u.email,
            name: (prof && prof.name) || u.name,
            photo: (prof && prof.photo) || u.photo,
            gphoto: u.photo,
            provider: u.provider,
            at: Date.now(),
            exp: Date.now() + SESSION_DAYS * 864e5
          });
          if (!prof) {
            safeSet(PKEY, JSON.stringify({
              uid: u.uid, name: u.name, photo: u.photo, phone: '', info: ''
            }));
          } else if (!prof.photo && u.photo) {
            // An older sign-in saved the account without the Google avatar —
            // fill it in now so the profile and the admin panel show a DP.
            prof.photo = u.photo;
            safeSet(PKEY, JSON.stringify(prof));
          }
          App.state.auth = readSession();
          if (App.DB) publish(App.state.auth, first);
          else pendingPublish = { user: App.state.auth, first: first };
        }
      } else {
        err = { code: 'bad_token', desc: 'Could not read the Google sign-in response.' };
      }
    }

    if (err) safeSet(EKEY, JSON.stringify(err));

    // Strip the tokens off the address bar without losing any real query string.
    var TOKEN_RE = /^(access_token|refresh_token|expires_in|expires_at|token_type|type|error|error_description|error_code|provider_token|provider_refresh_token)$/;
    function clean(str) {
      if (!str) return '';
      return str.replace(/^[?#]/, '').split('&').filter(function (pair) {
        if (!pair) return false;
        var i = pair.indexOf('=');
        var k = i < 0 ? pair : pair.slice(0, i);
        return !TOKEN_RE.test(k);
      }).map(function (pair) { return pair; }).join('&');
    }
    var hadAuthBits = hadTokens || !!err;
    if (hadAuthBits || location.hash) {
      var qs = clean(location.search);
      var hs = clean(location.hash);
      var url = location.pathname + (qs ? '?' + qs : '') + (hs ? '#' + hs : '');
      if (url !== location.pathname + location.search + location.hash) {
        try { history.replaceState(null, '', url); } catch (e) { location.hash = ''; }
      }
    }
  }

  function friendlyError(e) {
    var code = (e && e.code) || '';
    if (code === 'access_denied' || code === 'user_cancelled') return 'Google sign-in was cancelled.';
    if (code === 'bad_token') return 'Google sign-in failed — please try again.';
    if (e && e.message) return e.message;
    if (e && e.description) return String(e.description).replace(/\+/g, ' ');
    return 'Google sign-in failed. Please try again.';
  }

  function consumeStoredError() {
    var e = parseJSON(safeGet(EKEY));
    if (!e) return null;
    safeDel(EKEY);
    return friendlyError(e);
  }

  // ---- Profile storage -----------------------------------------------------

  // stats/users is world-writable and admin-readable with the shop's current
  // Firebase rules, so no rules change is needed. The website never reads it
  // back (rules only allow the admin panel to), which is why the visitor's own
  // copy also lives in localStorage.
  var pendingPublish = null;

  function recordFor(u, first) {
    var prof = readProfile();
    if (prof && prof.uid !== u.uid) prof = null;
    var rec = {
      uid: u.uid,
      fid: (window.App && App.fbUid) || '',
      email: u.email || (prof && prof.email) || '',
      name: (prof && prof.name) || u.name || '',
      photo: (prof && prof.photo) || u.photo || '',
      phone: (prof && prof.phone) || '',
      info: (prof && prof.info) || '',
      provider: u.provider || 'google',
      lastLoginAt: Date.now()
    };
    if (first) rec.createdAt = Date.now();
    return rec;
  }

  function publish(u, first) {
    if (!u || !u.uid || !App.DB) return null;
    var rec = recordFor(u, first);
    var ref = App.DB.ref('stats/users/' + safeKey(u.uid));
    var p = ref.update(rec).then(function () {
      var seen = parseJSON(safeGet(CKEY)) || {};
      seen[u.uid] = 1;
      safeSet(CKEY, JSON.stringify(seen));
      return true;
    });
    p.catch(function (err) {
      console.warn('profile sync failed', err);
    });
    return p;
  }

  function flushPending() {
    if (!pendingPublish || !App.DB) return;
    var p = pendingPublish;
    pendingPublish = null;
    publish(p.user, p.first);
  }

  function mergedProfile() {
    var s = readSession();
    if (!s) return null;
    var p = readProfile();
    if (!p || p.uid !== s.uid) p = { uid: s.uid, name: '', photo: '', phone: '', info: '' };
    // Never lose the Google avatar just because the stored copy is empty.
    var photo = p.photo || s.photo || s.gphoto || '';
    return {
      uid: s.uid,
      email: s.email || '',
      name: p.name || s.name || '',
      photo: photo,
      googlePhoto: s.gphoto || '',
      phone: p.phone || '',
      info: p.info || '',
      provider: s.provider || 'google',
      signedInAt: s.at || 0
    };
  }

  function save(patch) {
    var s = readSession();
    if (!s) return Promise.reject(new Error('Not signed in'));
    var p = readProfile();
    if (!p || p.uid !== s.uid) p = { uid: s.uid, name: '', photo: '', phone: '', info: '' };
    ['name', 'photo', 'phone', 'info'].forEach(function (k) {
      if (patch && patch[k] !== undefined) p[k] = patch[k];
    });
    safeSet(PKEY, JSON.stringify(p));

    s.name = p.name;
    s.photo = p.photo;
    writeSession(s);
    App.state.auth = s;
    App.fire('auth');

    var seen = parseJSON(safeGet(CKEY)) || {};
    var rec = {
      uid: s.uid,
      fid: (window.App && App.fbUid) || '',
      email: s.email,
      name: p.name,
      photo: p.photo,
      phone: p.phone,
      info: p.info,
      provider: s.provider,
      lastLoginAt: Date.now()
    };
    if (!seen[s.uid]) rec.createdAt = Date.now();

    if (!App.DB) return Promise.reject(new Error('offline'));
    return App.DB.ref('stats/users/' + safeKey(s.uid)).update(rec).then(function () {
      seen[s.uid] = 1;
      safeSet(CKEY, JSON.stringify(seen));
      return true;
    });
  }

  // ---- Wiring --------------------------------------------------------------

  var AppAuth = {
    signIn: signIn,
    signOut: signOut,
    authorizeUrl: authorizeUrl,
    isSignedIn: function () { return !!readSession(); },
    user: function () { return readSession(); },
    profile: mergedProfile,
    save: save,
    publish: function () {
      var s = readSession();
      if (!s) return;
      var seen = parseJSON(safeGet(CKEY)) || {};
      publish(s, !seen[s.uid]);
    },
    consumeStoredError: consumeStoredError
  };

  AppAuth.notify = function (msg, kind) { App.toast(msg, kind || 'ok'); };

  consumeCallback();

  App.state.auth = readSession();
  window.AppAuth = AppAuth;

  App.on('fbReady', flushPending);
  App.on('config', flushPending);

  var shown = consumeStoredError();
  if (shown) {
    // Wait a tick so the toast host exists on every page.
    setTimeout(function () { App.toast(shown, 'err'); }, 400);
  }
})();
