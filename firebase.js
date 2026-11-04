(function () {
  const SPACES = {
    main: {
      label: '',
      config: {
        apiKey: "AIzaSyCmSa2SCBqEZ2-1itjClGzr3dyMalKDdg0",
        authDomain: "haihieu-tracker.firebaseapp.com",
        databaseURL: "https://haihieu-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "haihieu-tracker",
        storageBucket: "haihieu-tracker.firebasestorage.app",
        messagingSenderId: "369472069929",
        appId: "1:369472069929:web:4fff450161c9ef018b5738"
      }
    },
    s01: {
      label: 'konheodat2001@gmail.com',
      emails: ['konheodat2001@gmail.com'],
      config: null
    }
  };
  const KEEP = ['dash-theme', 'nt_space', 'nt_space_data', 'sx_collapsed', 'tk_done_open', 'recur_done_open', 'it_done_open', 'wst_mode'];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };

  function wipeLocal(note, space) {
    try { Object.keys(localStorage).forEach((k) => { if (!KEEP.includes(k)) localStorage.removeItem(k); }); } catch (e) {}
    if (space !== 'main') ['wt_websites', 'wt_tasks', 'wt_links'].forEach((k) => lsSet(k, '[]'));
    try { sessionStorage.clear(); if (note) sessionStorage.setItem('nt_switch_email', note); } catch (e) {}
    try { indexedDB.deleteDatabase('WTBackupDB'); indexedDB.deleteDatabase('DashboardBackupDB'); } catch (e) {}
  }

  let sp = lsGet('nt_space') || 'main';
  if (!SPACES[sp] || !SPACES[sp].config) sp = 'main';
  if ((lsGet('nt_space_data') || 'main') !== sp) {
    wipeLocal('', sp);
    lsSet('nt_space_data', sp);
  }

  window.NT_SPACE = sp;
  window.NT_SPACE_LABEL = SPACES[sp].label || '';
  window.NT_CID = sp === 'main' ? '' : '000' + sp.slice(1);
  window.ntSpaceOfEmail = function (email) {
    const e = String(email || '').trim().toLowerCase();
    for (const k of Object.keys(SPACES)) {
      if (k !== 'main' && (SPACES[k].emails || []).some((x) => x.toLowerCase() === e)) return k;
    }
    return 'main';
  };
  window.ntSpaceReady = (k) => !!(SPACES[k] && SPACES[k].config);
  window.ntSwitchSpace = function (k, email) {
    wipeLocal(email || '-', k);
    lsSet('nt_space', k === 'main' ? null : k);
    lsSet('nt_space_data', k);
    window.location.reload();
  };

  if (sp !== 'main' && window.fetch) {
    const of = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const u = new URL(typeof input === 'string' ? input : (input && input.url) || '', location.href);
        if (u.origin === location.origin && u.pathname.startsWith('/api/')) {
          init = Object.assign({}, init);
          const h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
          h.set('X-NT-Space', sp);
          init.headers = h;
        }
      } catch (e) {}
      return of(input, init);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const anchor = document.getElementById('loginStatusText');
    if (!anchor) return;
    let sw = '';
    try { sw = sessionStorage.getItem('nt_switch_email') || ''; } catch (e) {}
    if (sp === 'main' && !sw) return;
    const el = document.createElement('div');
    el.id = 'ntSpaceNote';
    el.style.cssText = 'font-size:12px;line-height:1.5;margin-top:10px;padding:8px 10px;border-radius:10px;background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.35);color:#cfe3ff;text-align:center';
    el.textContent = sp === 'main'
      ? 'Đã chuyển về không gian chính — bấm "Đăng nhập bằng Google" một lần nữa để vào.'
      : (sw ? 'Đã chuyển sang không gian riêng của ' + SPACES[sp].label + ' — bấm "Đăng nhập bằng Google" một lần nữa để vào.'
            : 'Không gian riêng: ' + SPACES[sp].label);
    anchor.parentNode.insertBefore(el, anchor);
  });

  try {
    firebase.initializeApp(SPACES[sp].config);
    window._fbDb = firebase.database();
    if (sp === 'main') {
      window._fbReady = true;
    } else {
      window._fbReady = false;
      const off = firebase.auth().onAuthStateChanged(() => { window._fbReady = true; off(); });
    }
    console.log('Firebase v8 ready', sp);
  } catch (e) {
    console.warn('Firebase init failed:', e);
    window._fbReady = false;
  }
})();
