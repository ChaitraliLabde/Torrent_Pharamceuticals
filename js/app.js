(function () {
  if (typeof window.APP_BASE === 'undefined') {
    var parts = ((typeof location !== 'undefined' && location.pathname) || '').split('/').filter(Boolean);
    window.APP_BASE = (parts.length >= 2) ? ('/' + parts[0]) : '';
  }
  var base = window.APP_BASE || '';
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded.');
    window.getCurrentUser = function () { return null; };
    window.getCurrentUserRole = function () { return 'sales_exec'; };
    window.requireAuth = function (cb) { if (cb) cb(null, null); };
    window.requireRole = function () { window.location.href = base + '/login.html'; return Promise.reject(new Error('No auth')); };
    window.signOut = function () { window.location.href = base + '/login.html'; };
    window.db = null;
    window.auth = null;
    window.appReady = Promise.resolve();
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db   = firebase.database();
  var cachedRole = null;

  window.getCurrentUser = function () { return auth.currentUser; };
  window.getCurrentUserRole = function () { return cachedRole || 'sales_exec'; };

  // Read user profile (role, email, name) from Realtime Database
  function loadUserProfile(uid) {
    if (!uid || !db) return Promise.resolve(null);
    return db.ref('users/' + uid).once('value').then(function (snap) {
      if (snap.exists() && snap.val()) {
        var d = snap.val();
        return { role: d.role || 'sales_exec', email: d.email || '', name: d.name || '' };
      }
      return null;
    }).catch(function () { return null; });
  }

  // Create a default user record (sales_exec) when none exists
  function createDefaultUserRecord(user) {
    if (!user || !db) return Promise.resolve();
    return db.ref('users/' + user.uid).set({
      email: user.email,
      role: 'sales_exec',
      name: user.email ? user.email.split('@')[0] : '',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // Load role from DB; retry a few times to allow register.html to finish writing
  function ensureUserRole(user, onDone) {
    function tryLoad(attempt) {
      loadUserProfile(user.uid).then(function (profile) {
        if (profile) {
          cachedRole = profile.role;
          if (onDone) onDone(user, cachedRole);
          return;
        }
        if (attempt < 3) {
          setTimeout(function () { tryLoad(attempt + 1); }, 400);
        } else {
          createDefaultUserRecord(user).then(function () {
            cachedRole = 'sales_exec';
            if (onDone) onDone(user, cachedRole);
          }).catch(function () {
            cachedRole = 'sales_exec';
            if (onDone) onDone(user, cachedRole);
          });
        }
      });
    }
    tryLoad(0);
  }

  window.requireAuth = function (onAuth) {
    auth.onAuthStateChanged(function (user) {
      if (user) {
        ensureUserRole(user, onAuth);
      } else {
        cachedRole = null;
        if (onAuth) onAuth(null, null);
      }
    });
  };

  window.requireRole = function (allowedRoles, noRedirect) {
    allowedRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return new Promise(function (resolve, reject) {
      window.requireAuth(function (user, role) {
        if (!user) {
          if (!noRedirect) window.location.href = (window.APP_BASE || '') + '/login.html';
          return reject(new Error('Not logged in'));
        }
        if (allowedRoles.length && allowedRoles.indexOf(role) === -1) {
          if (!noRedirect) window.location.href = (window.APP_BASE || '') + '/index.html';
          return reject(new Error('Insufficient role'));
        }
        resolve({ user: user, role: role });
      });
    });
  };

  window.signOut = function () {
    auth.signOut().then(function () {
      cachedRole = null;
      window.location.href = (window.APP_BASE || '') + '/login.html';
    });
  };

  window.db   = db;
  window.auth = auth;
  window.appReady = new Promise(function (resolve) {
    auth.onAuthStateChanged(function () { resolve(); });
  });
})();
