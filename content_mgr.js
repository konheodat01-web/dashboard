/* ══ QUẢN LÝ NỘI DUNG THEO SITE — tab "✍️ Nội dung" trong Dashboard từng site (nút 📊) ══
 * Kho nội dung = bài CÓ SẴN trên web (trình duyệt cào WordPress REST).
 * Lưu ở SEO Writer: content_inventory/ws<id>.json (qua proxy /api/sw-content/*) — lần sau chỉ quét bài mới / vừa sửa.
 * Cần globals của script_v5.js: websites, wstCurrentUrl, wstCurrent301Site, wstFetchWp, wstCheckIndexSerper, wtApiKey,
 * wstRecomputeSiteStats, getWstSite, wstOpenWriterModal.
 */
(function () {
  const API = '/api/sw-content/';
  const ST = {                                        // trạng thái bài — mỗi trạng thái 1 màu riêng, không trùng
    plan: ['Kế hoạch', 'var(--t-fg-muted)'], writing: ['Đang viết', 'var(--t-warn)'], awaiting_images: ['Chờ ảnh', 'var(--t-done)'],
    published: ['Đã đăng', 'var(--t-accent)'], optimize: ['Cần tối ưu', 'var(--t-severe)'], dropped: ['Bỏ', 'var(--t-fg-subtle)']
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = n => (Number(n) || 0).toLocaleString('vi-VN');
  const btn = (extra) => `background:var(--t-muted);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;${extra || ''}`;
  const inp = 'background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:4px 7px;font-size:12px;font-family:inherit';
  const card = (label, val, sub, col) => `<div style="flex:1;min-width:120px;background:var(--t-canvas);border:1px solid var(--t-border);border-radius:10px;padding:10px 12px">
    <div style="font-size:11px;color:var(--t-fg-muted);margin-bottom:4px">${label}</div><div style="font-size:20px;font-weight:700;color:${col}">${val}</div>
    <div style="font-size:11px;color:var(--t-fg-muted);margin-top:2px">${sub || '&nbsp;'}</div></div>`;
  const COLS = {
    kw: ['Từ khóa chính', it => it.keyword || ''],
    title: ['Tiêu đề', it => it.title || ''],
    url: ['URL', it => it.url || ''],
    wpcat: ['Danh mục WP', it => (it.wp_cats || []).join(', ')],
    silo: ['Danh mục', it => it.silo || ''],
    role: ['Vai trò', it => it.role || (it.wp_type === 'page' ? 'Trang' : '')],
    label: ['Danh mục con', it => it.label || ''],
    month: ['Tháng', it => it.month ? 'T' + it.month : ''],
    st: ['Trạng thái', it => (ST[it.status] || ST.plan)[0]],
    idx: ['Index', it => !isLive(it) || !it.index ? '' : it.index.indexed ? 'Đã index' : 'Chưa index'],
    date: ['Ngày đăng', it => String(it.date || '').slice(0, 10)],
  };
  const CP = [['url', 'Copy URL'], ['title', 'Copy tiêu đề'], ['kw', 'Copy từ khóa chính'], ['wpcat', 'Copy danh mục WP'], ['silo', 'Copy danh mục'], ['label', 'Copy danh mục con'],
    ['role', 'Copy vai trò'], ['month', 'Copy tháng'], ['st', 'Copy trạng thái'], ['idx', 'Copy index'], ['date', 'Copy ngày đăng'],
    ['title,url', 'Copy tiêu đề + URL'], ['kw,url', 'Copy từ khóa + URL'], ['kw,title,url', 'Copy từ khóa + tiêu đề + URL'],
    ['kw,title,url,wpcat,silo,role,label,month,st,idx,date', 'Copy cả dòng']];
  function copyText(text, el, msg, cb) {
    const done = () => {
      if (cb) cb(true);
      if (el) { el.classList.add('cm-copied'); setTimeout(() => el.classList.remove('cm-copied'), 700); }
      if (typeof toast === 'function') toast('📋 ' + (msg || 'Đã copy: ' + text.slice(0, 60)), '#238636', 2000);
    };
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (er) {}
    ta.remove();
    window.getSelection().removeAllRanges();
    if (ok) done();
    else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => cb && cb(false));
    else if (cb) cb(false);
  }
  const box = (title, inner) => `<div style="background:var(--t-canvas);border:1px solid var(--t-border);border-radius:10px;padding:10px 12px;min-width:0">
    <div style="font-size:12px;font-weight:700;color:var(--t-fg);margin-bottom:8px">${title}</div>${inner}</div>`;

  async function api(path, opts) {
    const r = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.detail || ('Lỗi ' + r.status));
    return d;
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

  // ── trạng thái hiển thị: "Đã index" = đã đăng/cần tối ưu + index.indexed ──
  const isLive = it => !!it.wp_id && !it.deleted;
  const isIndexed = it => isLive(it) && it.index && it.index.indexed;
  function monthDue(start, m) {           // hạn của tháng thứ m trong kế hoạch = cuối tháng đó tính từ ngày bắt đầu
    if (!start || !m) return null;
    const d = new Date(start + 'T00:00:00');
    if (isNaN(d)) return null;
    return new Date(d.getFullYear(), d.getMonth() + Number(m), 0);
  }

  window.cmMount = function (panel, wsId) {
    const cid = 'ws' + (window.NT_CID || '') + wsId;
    const w = (typeof websites !== 'undefined' ? websites : []).find(x => x.id === wsId);
    if (!panel || !w) return;
    const s = { cp: 'url', v: null, view: 'dash', f: { q: '', wpcat: '', silo: '', st: '', label: '', month: '', src: '' }, sel: new Set(), limit: 100, busy: '' };
    const domain = () => (typeof wstCurrentUrl === 'function' ? wstCurrentUrl(w) : (w.url || '')).replace(/^https?:\/\//, '').replace(/\/$/, '');

    panel.innerHTML = `<div class="cm-root" style="display:flex;flex-direction:column;gap:12px"><div style="color:var(--t-fg-muted)">Đang tải kho nội dung…</div></div>`;
    const root = panel.querySelector('.cm-root');

    async function load() {
      try { s.v = await api('content/' + cid); }
      catch (e) { root.innerHTML = `<div style="color:var(--t-danger)">⚠️ Không tải được kho nội dung: ${esc(e.message)}</div>`; return; }
      draw();
    }
    function setBusy(msg) { s.busy = msg || ''; const b = root.querySelector('.cm-busy'); if (b) b.textContent = s.busy; }

    // ══ QUÉT WEB ══
    async function fetchAll(host, path, max = 100) {
      const out = [];
      for (let page = 1; page <= max; page++) {
        const r = await wstFetchWp(host, path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
        if (!r.ok) { if (page === 1) throw new Error(r.error || 'Không đọc được ' + host); break; }
        out.push(...r.items);
        setBusy(`Đang quét ${host}: ${out.length} mục…`);
        if (r.items.length < 100) break;
      }
      return out;
    }
    async function scan(full) {
      const host = domain();
      if (!host) { alert('Site chưa có URL'); return; }
      setBusy('Đang quét ' + host + '…');
      try {
        // bài mới / vừa sửa: lấy theo "modified" lớn nhất đã lưu, lùi 1 ngày cho chắc (giờ WP là giờ của site)
        let after = '';
        if (!full) {
          const mx = (s.v.items || []).filter(it => it.wp_id && it.modified).map(it => it.modified).sort().pop();
          if (mx) { const d = new Date(mx.replace(' ', 'T')); d.setDate(d.getDate() - 1); after = d.toISOString().slice(0, 19); }
        }
        const F = '&_fields=id,title,link,slug,date,modified,status,categories' + (after ? '&modified_after=' + encodeURIComponent(after) : '');
        const cats = {};
        (await fetchAll(host, '/wp-json/wp/v2/categories?_fields=id,name', 20)).forEach(c => { cats[c.id] = String(c.name || '').replace(/&amp;/g, '&'); });
        const posts = await fetchAll(host, '/wp-json/wp/v2/posts?orderby=modified&order=desc' + F);
        const pages = await fetchAll(host, '/wp-json/wp/v2/pages?orderby=modified&order=desc' + F, 20);
        const idsPost = full ? posts.map(p => p.id) : (await fetchAll(host, '/wp-json/wp/v2/posts?_fields=id')).map(p => p.id);
        const idsPage = full ? pages.map(p => p.id) : (await fetchAll(host, '/wp-json/wp/v2/pages?_fields=id', 20)).map(p => p.id);
        const pack = (arr, type) => arr.map(p => ({ id: p.id, type, title: (p.title && p.title.rendered || '').replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/&#8217;/g, '’'),
          link: p.link, slug: p.slug, date: p.date, modified: p.modified, status: p.status, cats: (p.categories || []).map(id => cats[id] || ('#' + id)) }));
        setBusy('Đang lưu kho nội dung…');
        s.v = await post('contentscan/' + cid, { domain: host, full, posts: pack(posts, 'post').concat(pack(pages, 'page')), all_ids: { post: idsPost, page: idsPage } });
        syncStats();
        const r = s.v.scan.last_result || {};
        setBusy(`✓ Quét xong: ${r.new || 0} bài mới · ${r.updated || 0} cập nhật · ${r.deleted || 0} bài đã xoá trên web`);
        draw(true);
      } catch (e) { setBusy('⚠️ ' + e.message); }
    }
    // đồng bộ số liệu cũ (thẻ Tổng quan / bảng Theo dõi web) từ kho
    function syncStats() {
      try {
        const live = (s.v.items || []).filter(isLive).map(it => ({ link: it.url, modified: it.modified }));
        if (typeof wstRecomputeSiteStats === 'function') wstRecomputeSiteStats(w, live);
      } catch (e) {}
    }

    // ══ DASHBOARD ══
    function filtered() {
      const f = s.f, q = f.q.trim().toLowerCase();
      return (s.v.items || []).filter(it => {
        if (f.silo && (it.silo || '') !== f.silo) return false;
        if (f.wpcat && !(f.wpcat === '(trống)' ? !(it.wp_cats || []).length : (it.wp_cats || []).includes(f.wpcat))) return false;
        if (f.label && (it.label || '') !== f.label) return false;
        if (f.month && String(it.month || '') !== f.month) return false;
        if (f.src === 'site' && !it.wp_id) return false;
        if (f.src === 'deleted' && !it.deleted) return false;
        if (f.src !== 'deleted' && it.deleted) return false;
        if (f.st === 'indexed' ? !isIndexed(it) : f.st === 'notindexed' ? !(isLive(it) && it.index && !it.index.indexed)
          : f.st === 'unchecked' ? !(isLive(it) && !it.index)
          : f.st === 'overdue' ? !(!it.wp_id && ['plan', 'writing'].includes(it.status) && monthDue((s.v.settings || {}).start_date, it.month) && monthDue((s.v.settings || {}).start_date, it.month) < new Date())
          : (f.st && it.status !== f.st)) return false;
        if (q && ![it.keyword, it.title, it.url, it.label, ...(it.wp_cats || []), ...(it.child || [])].some(v => String(v || '').toLowerCase().includes(q))) return false;
        return true;
      }).sort((a, b) => {
        if (s.sort) {
          const g = s.sort.k === 'date' ? (x => String(x.date || '')) : s.sort.k === 'month' ? (x => x.month || 0) : (x => String(COLS[s.sort.k][1](x)).toLowerCase());
          const A = g(a), B = g(b);
          if (A !== B) return A === '' ? 1 : B === '' ? -1 : (typeof A === 'number' ? A - B : A.localeCompare(B, 'vi')) * s.sort.d;
        }
        return (a.plan_row && !a.wp_id ? 0 : 1) - (b.plan_row && !b.wp_id ? 0 : 1) || (a.month || 99) - (b.month || 99)
          || String(b.date || '').localeCompare(String(a.date || ''));
      });
    }

    const TCOLS = [['title', 'Tiêu đề'], ['url', 'URL'], ['kw', 'Từ khóa chính'], ['wpcat', 'Danh mục WP'], ['silo', 'Danh mục'],
      ['role', 'Vai trò'], ['label', 'Danh mục con'], ['month', 'Tháng'], ['st', 'Trạng thái'], ['idx', 'Index'], ['date', 'Ngày đăng']];
    const FNAME = { wpcat: 'Danh mục WP', silo: 'Danh mục', st: 'Trạng thái', label: 'Danh mục con', month: 'Tháng', src: 'Nguồn', q: 'Tìm' };
    const STX = { indexed: 'Đã index', notindexed: 'Chưa index', unchecked: 'Chưa check index', overdue: 'Trễ hạn' };
    const SRCX = { site: 'Có trên web', deleted: 'Đã xoá trên web' };
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    s.colPref = lsGet('cm-cols', {});
    s.detail = lsGet('cm-detail', false);
    const blankF = () => ({ q: '', wpcat: '', silo: '', st: '', label: '', month: '', src: '' });
    const shortDate = d => { const m = String(d || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''; };
    const urlPath = u => String(u || '').replace(/^https?:\/\/[^/]+/, '') || '/';
    const tag = (txt, col, extra) => `<span class="cm-tag" style="color:${col};background:color-mix(in srgb,${col} 14%,transparent);${extra || ''}">${txt}</span>`;

    function colHasData(k, items, silos) {
      if (k === 'title' || k === 'url' || k === 'st' || k === 'idx' || k === 'date') return true;
      if (k === 'silo') return silos.length > 0;
      return items.some(it => COLS[k][1](it));
    }

    function draw(keepView) {
      const v = s.v, items = (v.items || []).filter(it => !it.deleted), set = v.settings || {};
      const live = items.filter(isLive), planOnly = items.filter(it => !it.wp_id);
      const idx = live.filter(isIndexed).length;
      const notIdx = live.filter(it => it.index && !it.index.indexed).length, unchecked = live.filter(it => !it.index).length;
      const today = new Date();
      const overdue = planOnly.filter(it => ['plan', 'writing'].includes(it.status) && monthDue(set.start_date, it.month) && monthDue(set.start_date, it.month) < today);
      const byStatus = st => items.filter(it => it.status === st).length;
      const silos = [...new Set(items.map(it => it.silo).filter(Boolean))];
      const labels = [...new Set(items.map(it => it.label).filter(Boolean))].sort();
      const months = [...new Set(items.map(it => it.month).filter(Boolean))].sort((a, b) => a - b);
      const wpcats = [...new Set(items.flatMap(it => it.wp_cats || []))].sort();
      const opt = (l, cur, first) => `<option value="">${first}</option>` + l.map(x => `<option ${String(x) === String(cur) ? 'selected' : ''} value="${esc(x)}">${esc(x)}</option>`).join('');
      const scanInfo = v.scan.last_at ? `quét ${esc(v.scan.last_at)}` : 'chưa quét web';
      const hasPlan = months.length > 0 || silos.length > 0;

      const planned = items.filter(it => it.plan_row && it.month);
      const pm = months.map(m => {
        const rs = planned.filter(it => it.month === m), done = rs.filter(isLive).length;
        const due = monthDue(set.start_date, m);
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0">
          <span style="width:92px;color:var(--t-fg-muted)">T${m}${due ? ' · ' + (due.getMonth() + 1) + '/' + due.getFullYear() : ''}</span>
          <div style="flex:1;background:var(--t-muted);border-radius:4px;height:8px;overflow:hidden"><div style="width:${rs.length ? Math.round(done / rs.length * 100) : 0}%;background:var(--t-success);height:100%"></div></div>
          <span style="width:70px;text-align:right;color:var(--t-fg)">${done}/${rs.length}</span></div>`;
      }).join('') || '<div style="font-size:12px;color:var(--t-fg-muted)">Chưa import bài kế hoạch nào</div>';
      const bs = silos.map(sl => {
        const rs = items.filter(it => (it.silo || '') === sl);
        return `<tr><td style="padding:3px 6px">${esc(sl)}</td><td style="padding:3px 6px;text-align:right">${rs.length}</td><td style="padding:3px 6px;text-align:right">${rs.filter(isLive).length}</td><td style="padding:3px 6px;text-align:right">${rs.filter(isIndexed).length}</td><td style="padding:3px 6px;text-align:right">${rs.filter(it => !it.wp_id).length}</td></tr>`;
      }).join('');

      const f = s.f, active = Object.keys(f).filter(k => f[k]);
      const chipOn = (k, val) => active.length === 1 && f[k] === val;
      const chip = (label, n, k, val, col, tip) => `<span role="button" tabindex="0" data-a="chip" data-k="${k}" data-val="${esc(val)}" class="cm-chip${(k ? chipOn(k, val) : !active.length) ? ' on' : ''}" title="${esc(tip || 'Bấm để lọc')}">${label} <b style="color:${col}">${num(n)}</b></span>`;
      const chips = [
        chip('Tổng', items.length, '', '', 'var(--t-fg2)', 'Bỏ mọi bộ lọc'),
        chip('Có trên web', live.length, 'src', 'site', 'var(--t-accent)'),
        chip('Đã index', idx, 'st', 'indexed', 'var(--t-success)'),
        notIdx ? chip('Chưa index', notIdx, 'st', 'notindexed', 'var(--t-danger)') : '',
        unchecked ? chip('Chưa check index', unchecked, 'st', 'unchecked', 'var(--t-fg-muted)') : '',
        byStatus('awaiting_images') ? chip('Chờ ảnh', byStatus('awaiting_images'), 'st', 'awaiting_images', 'var(--t-done)') : '',
        byStatus('optimize') ? chip('Cần tối ưu', byStatus('optimize'), 'st', 'optimize', 'var(--t-severe)') : '',
        byStatus('plan') ? chip('Kế hoạch', byStatus('plan'), 'st', 'plan', 'var(--t-fg-muted)') : '',
        byStatus('writing') ? chip('Đang viết', byStatus('writing'), 'st', 'writing', 'var(--t-warn)') : '',
        overdue.length ? chip('Trễ hạn', overdue.length, 'st', 'overdue', 'var(--t-danger)') : ''
      ].join('');

      const vis = TCOLS.filter(([k]) => s.colPref[k] != null ? s.colPref[k] : colHasData(k, items, silos));
      const list = filtered(), shown = list.slice(0, s.limit);
      const showAct = shown.some(it => !it.wp_id);
      const nImg = (s.v.items || []).filter(x => s.sel.has(x.id) && needsImg(x)).length, nWrite = writable().length;
      const fval = (k, val) => k === 'st' ? (STX[val] || (ST[val] || [val])[0]) : k === 'src' ? (SRCX[val] || val) : k === 'month' ? 'T' + val : val;
      const sortIc = k => s.sort && s.sort.k === k ? (s.sort.d > 0 ? ' ▲' : ' ▼') : '';
      const allShownSel = shown.length && shown.every(it => s.sel.has(it.id));

      root.innerHTML = `
        <style>
          #wst-tab-content .cm-chip{display:inline-flex;align-items:center;gap:5px;background:var(--t-canvas);border:1px solid var(--t-border);border-radius:14px;padding:3px 10px;font-size:12px;color:var(--t-fg-muted);cursor:pointer;font-family:inherit;white-space:nowrap}
          #wst-tab-content .cm-chip b{font-weight:600}#wst-tab-content .cm-chip:hover{border-color:var(--t-fg-muted)}#wst-tab-content .cm-chip.on{border-color:var(--t-accent);background:color-mix(in srgb,var(--t-accent) 10%,var(--t-canvas));color:var(--t-fg2)}
          #wst-tab-content .cm-tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11.5px;white-space:nowrap;line-height:18px}
          #wst-tab-content .cm-fchip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 9px;border-radius:12px;font-size:11.5px;background:color-mix(in srgb,var(--t-accent) 12%,transparent);color:var(--t-accent)}
          #wst-tab-content .cm-fchip a{color:inherit;text-decoration:none;padding:0 4px;cursor:pointer;font-size:13px}
          #wst-tab-content .cm-bulk{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;border-radius:8px;border:1px solid color-mix(in srgb,var(--t-warn) 45%,transparent);background:color-mix(in srgb,var(--t-warn) 10%,var(--t-canvas))}
          #wst-tab-content .cm-tbl{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;user-select:text}
          #wst-tab-content .cm-tbl th,#wst-tab-content .cm-tbl td{white-space:nowrap;padding:6px 10px;border-bottom:1px solid var(--t-muted);text-align:left;background:var(--t-canvas)}
          #wst-tab-content .cm-tbl thead th{position:sticky;top:0;z-index:2;background:var(--t-subtle);color:var(--t-fg-muted);font-weight:600;font-size:11.5px;border-bottom:1px solid var(--t-border)}
          #wst-tab-content .cm-tbl thead th[data-a]{cursor:pointer;user-select:none}#wst-tab-content .cm-tbl thead th[data-a]:hover{color:var(--t-fg2)}
          #wst-tab-content .cm-tbl .sk0{position:sticky;left:0;z-index:1;width:20px}#wst-tab-content .cm-tbl .sk1{position:sticky;left:41px;z-index:1;max-width:420px;overflow:hidden;text-overflow:ellipsis;box-shadow:inset -1px 0 0 var(--t-border)}
          #wst-tab-content .cm-tbl thead .sk0,#wst-tab-content .cm-tbl thead .sk1{z-index:3}
          #wst-tab-content .cm-tbl tbody tr:hover td{background:var(--t-subtle)}
          #wst-tab-content .cm-tbl tbody tr.sel td{background:color-mix(in srgb,var(--t-accent) 9%,var(--t-canvas))}
          #wst-tab-content .cm-tbl td.ed{cursor:pointer}#wst-tab-content .cm-tbl td.ed:hover .cm-tag{outline:1px solid var(--t-border)}
          #wst-tab-content .cm-copied{outline:1px solid var(--t-success);outline-offset:-1px}
          #wst-tab-content .cm-cols{display:flex;flex-wrap:wrap;gap:4px 14px;padding:8px 12px;border:1px solid var(--t-border);border-radius:8px;background:var(--t-subtle);font-size:12px;color:var(--t-fg)}
          #wst-tab-content .cm-cols label{display:inline-flex;align-items:center;gap:5px;cursor:pointer}
        </style>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:14px;color:var(--t-fg2)">✍️ Nội dung</b><span style="font-size:12px;color:var(--t-fg-muted)">${esc(domain())} · ${scanInfo}</span>
          <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            <button data-a="scan" style="${btn()}" title="Lấy bài mới / vừa sửa kể từ lần quét trước + phát hiện bài đã xoá">🔄 Quét bài mới</button>
            <button data-a="scanfull" style="${btn()}" title="Cào lại toàn bộ bài viết + trang">⟳ Quét toàn bộ</button>
          </span>
        </div>
        ${s.busy ? `<div class="cm-busy" style="font-size:12px;color:var(--t-warn)">${esc(s.busy)}</div>` : '<div class="cm-busy" style="display:none"></div>'}
        ${!v.scan.last_full_at ? '<div style="font-size:12px;color:var(--t-warn)">● Chưa quét toàn bộ web — bấm ⟳ Quét toàn bộ trước (bắt buộc trước khi import để lọc trùng).</div>' : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${chips}
          ${hasPlan ? `<span role="button" tabindex="0" data-a="detail" class="cm-chip${s.detail ? ' on' : ''}" title="Tiến độ theo tháng + theo danh mục kế hoạch">📊 Chi tiết kế hoạch ${s.detail ? '▴' : '▾'}</span>` : ''}</div>
        ${hasPlan && s.detail ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">
          ${box('📅 Tiến độ theo tháng kế hoạch (đã đăng / kế hoạch)', pm)}
          ${box('📁 Theo danh mục kế hoạch', `<table style="width:100%;font-size:12px"><tr style="color:var(--t-fg-muted)"><td style="padding:3px 6px">Danh mục</td><td style="padding:3px 6px;text-align:right">Tổng</td><td style="padding:3px 6px;text-align:right">Đã đăng</td><td style="padding:3px 6px;text-align:right">Index</td><td style="padding:3px 6px;text-align:right">Chưa đăng</td></tr>${bs}</table>`)}
        </div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input class="cm-q" value="${esc(s.f.q)}" placeholder="🔍 Tìm từ khóa, tiêu đề, URL, danh mục…" style="${inp};width:240px">
          ${wpcats.length ? `<select class="cm-f" data-k="wpcat" style="${inp}" title="Danh mục thật trên WordPress">${opt(wpcats.concat('(trống)'), f.wpcat, 'Danh mục WP')}</select>` : ''}
          <select class="cm-f" data-k="st" style="${inp}"><option value="">Trạng thái</option>${Object.entries(ST).map(([k, x]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${x[0]}</option>`).join('')}${Object.entries(STX).map(([k, x]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${x}</option>`).join('')}</select>
          ${silos.length ? `<select class="cm-f" data-k="silo" style="${inp}" title="Danh mục theo kế hoạch SEO">${opt(silos, f.silo, 'Danh mục')}</select>` : ''}
          ${labels.length ? `<select class="cm-f" data-k="label" style="${inp}">${opt(labels, f.label, 'Danh mục con')}</select>` : ''}
          ${months.length ? `<select class="cm-f" data-k="month" style="${inp}">${opt(months, f.month, 'Tháng')}</select>` : ''}
          <select class="cm-f" data-k="src" style="${inp}"><option value="">Nguồn</option>${Object.entries(SRCX).map(([k, x]) => `<option value="${k}" ${f.src === k ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <span style="font-size:12px;color:var(--t-fg-muted)">${num(list.length)} bài</span>
          <span style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <button data-a="cols" style="${btn(s.colsOpen ? 'border-color:var(--t-accent)' : '')}" title="Chọn cột hiển thị">☰ Cột</button>
            <button data-a="write1" style="${btn('background:#1f6feb;border-color:#1f6feb;color:#fff')}" title="Mở SEO Writer cho site này để viết bài ngoài kế hoạch">✍️ Viết bài</button>
          </span>
        </div>
        ${s.colsOpen ? `<div class="cm-cols">${TCOLS.map(([k, l]) => `<label><input type="checkbox" class="cm-colchk" data-k="${k}" ${vis.some(c => c[0] === k) ? 'checked' : ''} ${k === 'title' ? 'disabled' : ''}>${l}${colHasData(k, items, silos) ? '' : ' <span style="color:var(--t-fg-subtle)">(trống)</span>'}</label>`).join('')}<a href="#" data-a="colsreset" style="color:var(--t-accent);margin-left:auto">Mặc định</a></div>` : ''}
        ${active.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${active.map(k => `<span class="cm-fchip">${FNAME[k]}: ${esc(fval(k, f[k]))}<a data-a="unf" data-k="${k}" title="Bỏ lọc này">×</a></span>`).join('')}<a href="#" data-a="clearf" style="font-size:12px;color:var(--t-fg-muted)">Xoá lọc</a></div>` : ''}
        ${s.sel.size ? `<div class="cm-bulk">
          <b style="font-size:12.5px;color:var(--t-fg2)">${s.sel.size} bài đã chọn</b>
          ${list.length > s.sel.size ? `<a href="#" data-a="selall" style="font-size:12px;color:var(--t-accent)">Chọn cả ${num(list.length)} bài đang lọc</a>` : ''}
          <span style="width:1px;height:18px;background:var(--t-border);margin:0 4px"></span>
          <select class="cm-cpsel" style="${inp}" title="Thành phần cần copy">${CP.map(([k, l]) => `<option value="${k}" ${s.cp === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button data-a="cpdo" style="${btn()}" title="Copy thành phần đã chọn của các bài đã chọn — mỗi bài 1 dòng, nhiều thành phần cách nhau bằng Tab (dán vào Sheets ra đúng cột)">📋 Thực hiện Copy</button>
          ${nWrite ? `<button data-a="bulkwrite" style="${btn()}" title="Mở SEO Writer, điền sẵn các bài chưa đăng đã chọn">✍️ Viết hàng loạt (${nWrite})</button>` : ''}
          ${nImg ? `<button data-a="bulkimg" style="${btn()}" title="Mở Ảnh hàng loạt của SEO Writer cho các bài đang Chờ ảnh">🖼️ Làm ảnh (${nImg})</button>` : ''}
          <select class="cm-bulkst" style="${inp}"><option value="">Đổi trạng thái…</option>${Object.entries(ST).map(([k, x]) => `<option value="${k}">${x[0]}</option>`).join('')}</select>
          <button data-a="checkidx" style="${btn()}" title="Check index các bài đã chọn bằng Serper">✅ Check index</button>
          <button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}" title="Bỏ chọn">✕</button>
        </div>` : ''}
        <div class="cm-scroll" style="overflow:auto;max-height:calc(100vh - 330px);min-height:240px;border:1px solid var(--t-border);border-radius:8px">
          <table class="cm-tbl">
            <thead><tr>
              <th class="sk0"><input type="checkbox" class="cm-all" ${allShownSel ? 'checked' : ''} title="Chọn các bài đang hiện"></th>
              ${vis.map(([k, l]) => `<th data-a="sort" data-k="${k}" class="${k === 'title' ? 'sk1' : ''}" title="Bấm để sắp xếp">${l}${sortIc(k)}</th>`).join('')}
              ${showAct ? '<th></th>' : ''}</tr></thead>
            <tbody>${shown.map(it => rowHtml(it, silos, vis, showAct)).join('') || `<tr><td colspan="${vis.length + 2}" style="padding:16px;color:var(--t-fg-muted);text-align:center">Không có bài nào${active.length ? ' — <a href="#" data-a="clearf" style="color:var(--t-accent)">xoá lọc</a>' : ''}</td></tr>`}</tbody>
          </table>
        </div>
        ${list.length > shown.length ? `<div><button data-a="more" style="${btn()}">Hiện thêm (${shown.length}/${list.length})</button></div>` : ''}`;
      const s0 = root.querySelector('.cm-tbl thead .sk0');
      if (s0) root.querySelectorAll('.cm-tbl .sk1').forEach(e => { e.style.left = s0.offsetWidth + 'px'; });
      if (s.edit) { const el = root.querySelector('.cm-edsel'); if (el) el.focus(); }
    }

    // bài đã chọn viết được = có từ khóa + chưa có trên web (giống điều kiện nút ✍️ Viết từng dòng)
    function writable() { return (s.v.items || []).filter(x => s.sel.has(x.id) && x.keyword && !x.wp_id && !x.deleted); }
    // (1/10) "Chờ ảnh": trạng thái RIÊNG (khong phai badge phu canh "Da dang") - da dang WP
    // nhung SEO Writer Tool chua bao co anh; chi chuyen sang "Da dang" THAT SU khi anh xong.
    function needsImg(it) { return it.status === 'awaiting_images' && !!it.sw_article_id; }
    const catPathOf = it => (it.silo || '') + (it.silo && it.label && !/^Hãng khác/i.test(it.label) ? ' > ' + it.label : '');
    // URL SEO Writer: site/brand (+ extra query) qua query; creds của bản ghi 301 + rows qua FRAGMENT (không lên server)
    // "Dạng bài" kế hoạch (tự do theo từng site, vd "Review chuyên sâu", "Tổng hợp / Xếp hạng")
    // -> Loại bài cố định của SEO Writer (7 loại). Không khớp -> trả '' để người dùng tự
    // chọn tay ở cột "Loại bài" riêng của bảng từ khóa (không bắt chọn 1 ô chung cho cả mẻ).
    function mapArticleType(t) {
      const s = (t || '').toLowerCase();
      if (/trang chủ|giới thiệu thương hiệu/.test(s)) return 'trang-chu';
      if (/vận hành|đăng nhập|đăng ký|nạp tiền|rút tiền|điều khoản|bảo mật/.test(s)) return 'trang-van-hanh';
      if (/review|đánh giá/.test(s)) return 'review';
      if (/tin tức|cập nhật|khuyến mãi/.test(s)) return 'tin-tuc';
      if (/thuật ngữ|là gì/.test(s)) return 'thuat-ngu';
      if (/nhận định|dự đoán|soi kèo/.test(s)) return 'nhan-dinh';
      if (/hướng dẫn|kiến thức|mẹo|tổng hợp|xếp hạng/.test(s)) return 'huong-dan';
      return '';
    }

    function writerUrl(extraQs, extraFrag) {
      const s301 = typeof wstCurrent301Site === 'function' ? wstCurrent301Site(w) : w;
      const st = typeof getWstSite === 'function' ? getWstSite(wsId) : null;
      const brand = (st && st.mainKeyword) || w.brand;
      const qs = ['site=' + encodeURIComponent(domain()), 'brand=' + encodeURIComponent(brand)].concat(extraQs || []);
      const frag = [];
      if (s301 && s301.account) frag.push('wpu=' + encodeURIComponent(s301.account));
      if (s301 && s301.appwppass) frag.push('wpp=' + encodeURIComponent(s301.appwppass));
      return 'https://seo-writer-tool.nthieucloud.shop/?' + qs.join('&') + '#' + frag.concat(extraFrag || []).join('&');
    }

    function rowHtml(it, silos, vis, showAct) {
      const st = ST[it.status] || ST.plan;
      const ed = k => s.edit && s.edit.id === it.id && s.edit.k === k;
      const cell = {
        title: () => `<td class="sk1" data-k="title" title="${esc(it.title || it.keyword || '')}">${it.title ? `<span style="color:var(--t-fg2)">${esc(it.title)}</span>` : `<span style="color:var(--t-fg2)">${esc(it.keyword || '—')}</span> <span style="color:var(--t-fg-subtle);font-size:11px">· chưa đăng</span>`}${it.match ? ` <span style="color:var(--t-fg-subtle);font-size:11px" title="${esc(it.match)}">ⓘ</span>` : ''}</td>`,
        url: () => `<td data-k="url" title="${esc(it.url || '')}">${it.url ? `<span style="color:var(--t-accent)">${esc(urlPath(it.url))}</span> <a href="${esc(it.url)}" target="_blank" rel="noopener" title="Mở bài trong tab mới" style="color:var(--t-fg-muted);text-decoration:none;margin-left:2px">↗</a>` : '<span style="color:var(--t-fg-subtle)">—</span>'}</td>`,
        kw: () => `<td data-k="kw">${it.keyword ? `<span style="color:var(--t-fg2);font-weight:600">${esc(it.keyword)}</span>${(it.child || []).length ? ` <span style="color:var(--t-fg-subtle);font-size:11px" title="${esc(it.child.join(', '))}">+${it.child.length}</span>` : ''}` : '<span style="color:var(--t-fg-subtle)">—</span>'}</td>`,
        wpcat: () => `<td data-k="wpcat">${(it.wp_cats || []).length ? esc(it.wp_cats.join(', ')) : '<span style="color:var(--t-fg-subtle)">—</span>'}</td>`,
        silo: () => ed('silo')
          ? `<td data-k="silo"><select class="cm-silo cm-edsel" style="${inp};padding:2px 4px"><option value="">—</option>${silos.map(x => `<option ${x === it.silo ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>`
          : `<td data-k="silo" class="ed" data-a="edit" title="Bấm để đổi danh mục">${it.silo ? tag(esc(it.silo), 'var(--t-fg)') : '<span style="color:var(--t-fg-subtle)">—</span>'}</td>`,
        role: () => `<td data-k="role">${esc(COLS.role[1](it))}</td>`,
        label: () => `<td data-k="label">${esc(it.label || '')}</td>`,
        month: () => `<td data-k="month">${it.month ? 'T' + it.month : ''}</td>`,
        st: () => ed('st')
          ? `<td data-k="st"><select class="cm-st cm-edsel" style="${inp};padding:2px 4px">${Object.entries(ST).map(([k, x]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${x[0]}</option>`).join('')}</select></td>`
          : `<td data-k="st" class="ed" data-a="edit" title="Bấm để đổi trạng thái">${tag(st[0], st[1])}</td>`,
        idx: () => `<td data-k="idx">${!isLive(it) ? '<span style="color:var(--t-fg-subtle)">—</span>' : !it.index ? '<span style="color:var(--t-fg-subtle)" title="Chưa check index">chưa check</span>' : it.index.indexed ? tag('Có', 'var(--t-success)', '" title="' + esc(it.index.at)) : tag('Chưa', 'var(--t-danger)', '" title="' + esc(it.index.at))}</td>`,
        date: () => { const d = String(it.date || '').slice(0, 10), m = String(it.modified || '').slice(0, 10); return `<td data-k="date" style="color:var(--t-fg-muted)" title="${d ? 'Đăng ' + esc(d) : ''}${m && m !== d ? ' · sửa ' + esc(m) : ''}">${shortDate(d) || (it.month ? 'T' + it.month : '')}${m && m !== d ? ' <span style="color:var(--t-fg-subtle)">✎</span>' : ''}</td>`; }
      };
      return `<tr data-id="${esc(it.id)}" class="${s.sel.has(it.id) ? 'sel' : ''}" style="${it.deleted ? 'opacity:.5;text-decoration:line-through' : ''}">
        <td class="sk0"><input type="checkbox" class="cm-sel" ${s.sel.has(it.id) ? 'checked' : ''}></td>
        ${vis.map(([k]) => cell[k]()).join('')}
        ${showAct ? `<td>${it.keyword && !it.wp_id ? `<button data-a="write" style="${btn('padding:2px 8px')}" title="Mở SEO Writer điền sẵn từ khóa chính + phụ">✍️ Viết</button>` : ''}${!it.wp_id ? `<button data-a="del" style="${btn('padding:2px 6px;margin-left:3px;color:var(--t-danger)')}" title="Xoá khỏi kho (chỉ bài kế hoạch chưa đăng)">🗑</button>` : ''}</td>` : ''}
      </tr>`;
    }

    // ══ SỰ KIỆN ══
    root.addEventListener('input', e => {
      if (e.target.classList.contains('cm-q')) { s.f.q = e.target.value; s.limit = 100; const pos = e.target.selectionStart; draw(true); const q = root.querySelector('.cm-q'); q.focus(); q.setSelectionRange(pos, pos); }
    });
    root.addEventListener('change', async e => {
      const t = e.target, tr = t.closest('tr[data-id]'), id = tr && tr.dataset.id;
      if (t.classList.contains('cm-f')) { s.f[t.dataset.k] = t.value; s.limit = 100; return draw(true); }
      if (t.classList.contains('cm-cpsel')) { s.cp = t.value; return; }
      if (t.classList.contains('cm-colchk')) { s.colPref[t.dataset.k] = t.checked; lsSet('cm-cols', s.colPref); return draw(true); }
      if (t.classList.contains('cm-sel')) { t.checked ? s.sel.add(id) : s.sel.delete(id); return draw(true); }
      if (t.classList.contains('cm-all')) { filtered().slice(0, s.limit).forEach(it => t.checked ? s.sel.add(it.id) : s.sel.delete(it.id)); return draw(true); }
      try {
        if (t.classList.contains('cm-st') || t.classList.contains('cm-silo')) s.edit = null;
        if (t.classList.contains('cm-st')) { s.v = await post('contentop/' + cid, { op: 'status', id, value: t.value }); return draw(true); }
        if (t.classList.contains('cm-silo')) { s.v = await post('contentop/' + cid, { op: 'set', id, field: 'silo', value: t.value }); return draw(true); }
        if (t.classList.contains('cm-bulkst') && t.value) {
          if (!s.sel.size) { alert('Chọn bài trước'); t.value = ''; return; }
          s.v = await post('contentop/' + cid, { op: 'status', ids: [...s.sel], value: t.value });
          s.sel.clear(); return draw(true);
        }
      } catch (err) { setBusy('⚠️ ' + err.message); }
    });
    root.addEventListener('focusout', e => {
      if (!e.target.classList.contains('cm-edsel')) return;
      setTimeout(() => { if (s.edit) { s.edit = null; draw(true); } }, 200);
    });
    root.addEventListener('dblclick', e => {
      const td = e.target.closest('.cm-tbl tbody td[data-k]');
      if (!td || e.target.closest('input,button,a,select')) return;
      const tr = td.closest('tr[data-id]'), it = tr && (s.v.items || []).find(x => x.id === tr.dataset.id);
      const text = it && COLS[td.dataset.k] ? COLS[td.dataset.k][1](it) : '';
      if (text) copyText(text, td);
    });
    root.addEventListener('click', async e => {
      const el = e.target.closest('[data-a]');
      if (!el) return;
      e.preventDefault();
      const a = el.dataset.a, tr = el.closest('tr[data-id]'), id = tr && tr.dataset.id;
      const it = id && (s.v.items || []).find(x => x.id === id);
      try {
        switch (a) {
          case 'scan': return scan(false);
          case 'scanfull': return scan(true);
          case 'more': s.limit += 100; return draw(true);
          case 'chip': {
            const k = el.dataset.k, val = el.dataset.val, on = k && Object.keys(s.f).filter(x => s.f[x]).length === 1 && s.f[k] === val;
            s.f = Object.assign(blankF(), k && !on ? { [k]: val } : {}); s.limit = 100; return draw(true);
          }
          case 'clearf': s.f = blankF(); s.limit = 100; return draw(true);
          case 'unf': s.f[el.dataset.k] = ''; s.limit = 100; return draw(true);
          case 'detail': s.detail = !s.detail; lsSet('cm-detail', s.detail); return draw(true);
          case 'cols': s.colsOpen = !s.colsOpen; return draw(true);
          case 'colsreset': s.colPref = {}; lsSet('cm-cols', {}); return draw(true);
          case 'selall': filtered().forEach(x => s.sel.add(x.id)); return draw(true);
          case 'selnone': s.sel.clear(); return draw(true);
          case 'sort': {
            const k = el.dataset.k;
            s.sort = !s.sort || s.sort.k !== k ? { k, d: 1 } : s.sort.d > 0 ? { k, d: -1 } : null;
            return draw(true);
          }
          case 'edit': s.edit = { id, k: el.dataset.k }; return draw(true);
          case 'cpdo': {
            const keys = s.cp.split(','), rows = filtered().filter(x => !s.sel.size || s.sel.has(x.id));
            if (!rows.length) return typeof toast === 'function' && toast('Không có dòng nào để copy', '#e74c3c');
            const text = rows.map(x => keys.map(k => COLS[k][1](x).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
            const old = el.innerHTML, oldCss = el.style.cssText;
            const flash = ok => {
              el.innerHTML = ok ? `✓ Đã copy ${rows.length} dòng` : '✗ Không copy được';
              el.style.cssText = oldCss + (ok ? ';background:#238636;border-color:#238636;color:#fff' : ';background:#da3633;border-color:#da3633;color:#fff');
              clearTimeout(el._t); el._t = setTimeout(() => { el.innerHTML = old; el.style.cssText = oldCss; }, 2000);
            };
            return copyText(text, null, `Đã copy ${rows.length} dòng — ${keys.map(k => COLS[k][0]).join(' + ')}`, flash);
          }
          case 'del':
            if (!confirm(`Xoá "${it.keyword}" khỏi kho nội dung? (bài trên web không bị ảnh hưởng)`)) return;
            s.v = await post('contentop/' + cid, { op: 'delete', id }); s.sel.delete(id); return draw(true);
          case 'write': {
            const qs = ['kw=' + encodeURIComponent(it.keyword), 'sec=' + encodeURIComponent((it.child || []).join(', '))];
            const catPath = catPathOf(it);
            if (catPath) qs.push('cat=' + encodeURIComponent(catPath));   // SEO Writer gán cả danh mục cha và con
            const url = writerUrl(qs);
            if (typeof wstOpenWriterModal === 'function') wstOpenWriterModal(url, it.keyword + ' — ' + domain()); else window.open(url, '_blank');
            if (it.status === 'plan') { s.v = await post('contentop/' + cid, { op: 'status', id, value: 'writing' }); draw(true); }
            return;
          }
          case 'write1': {   // viết bài ngoài kế hoạch: mở SEO Writer trống cho site này
            const url = writerUrl([]);
            if (typeof wstOpenWriterModal === 'function') wstOpenWriterModal(url, 'Viết bài — ' + domain()); else window.open(url, '_blank');
            return;
          }
          case 'bulkwrite': {
            // Điền sẵn bảng Bước 1 SEO Writer (từ khóa chính | phụ | "Danh mục > Danh mục con" theo từng dòng);
            // người dùng chỉ kiểm tra rồi bấm chạy. Bài đã đăng / không có từ khóa tự bị bỏ qua.
            const list = writable();
            if (!list.length) { alert('Chọn các bài CHƯA ĐĂNG (có từ khóa chính) để viết hàng loạt'); return; }
            const skipped = s.sel.size - list.length;
            const s301 = typeof wstCurrent301Site === 'function' ? wstCurrent301Site(w) : w;
            if (!(s301 && s301.appwppass) && !confirm('Site này chưa có WP Application Password — SEO Writer sẽ viết nhưng không đăng được lên web. Vẫn mở?')) return;
            const rows = list.map(x => ({ main: x.keyword, sec: (x.child || []).join(', '), cat: catPathOf(x), atype: mapArticleType(x.type), plan_id: x.id }));
            // cid gui kem -> SEO Writer tu bao lai "Da dang" o day sau khi viet xong, khoi phai tu bam "Quet" lai
            const url = writerUrl(['batch=1'], ['rows=' + encodeURIComponent(JSON.stringify(rows)), 'cid=' + encodeURIComponent(cid)]);
            if (typeof wstOpenWriterModal === 'function') wstOpenWriterModal(url, `Viết hàng loạt ${rows.length} bài — ${domain()}`); else window.open(url, '_blank');
            const toWriting = list.filter(x => x.status === 'plan').map(x => x.id);
            if (toWriting.length) s.v = await post('contentop/' + cid, { op: 'status', ids: toWriting, value: 'writing' });
            s.sel.clear();
            s.busy = `✓ Đã chuyển ${rows.length} bài sang SEO Writer${skipped ? ` (bỏ qua ${skipped} bài đã đăng / thiếu từ khóa)` : ''} — kiểm tra Bước 1 rồi bấm chạy`;
            return draw(true);
          }
          case 'bulkimg': {
            // Mở thẳng "Ảnh hàng loạt" bên SEO Writer cho ĐÚNG các bài đã chọn (qua sw_article_id đã
            // ghi nhớ lúc viết hàng loạt) — chỉ áp dụng bài đang 🖼️ Chờ ảnh.
            const imgList = (s.v.items || []).filter(x => s.sel.has(x.id) && needsImg(x));
            if (!imgList.length) { alert('Chọn các bài đang "🖼️ Chờ ảnh" (đã đăng nhưng SEO Writer chưa báo có ảnh)'); return; }
            const artIds = imgList.map(x => x.sw_article_id);
            const imgUrl = writerUrl([], ['artids=' + encodeURIComponent(artIds.join(','))]);
            if (typeof wstOpenWriterModal === 'function') wstOpenWriterModal(imgUrl, `Làm ảnh hàng loạt ${artIds.length} bài — ${domain()}`); else window.open(imgUrl, '_blank');
            s.sel.clear();
            return draw(true);
          }
          case 'checkidx': {
            if (!wtApiKey) { alert('Chưa có Serper API Key'); return; }
            const targets = (s.v.items || []).filter(x => s.sel.has(x.id) && isLive(x) && x.url);
            if (!targets.length) { alert('Chọn các bài ĐÃ CÓ trên web (có URL) để check index'); return; }
            if (!confirm(`Check index ${targets.length} bài bằng Serper (~${targets.length} credit)?`)) return;
            const results = [];
            let i = 0;
            const worker = async () => { while (i < targets.length) { const x = targets[i++]; const r = await wstCheckIndexSerper(x.url); if (r && !r.error) results.push({ url: x.url, indexed: r.indexed }); setBusy(`Check index ${results.length}/${targets.length}…`); } };
            await Promise.all([worker(), worker(), worker()]);
            s.v = await post('contentop/' + cid, { op: 'index', results });
            syncStats(); s.sel.clear();
            s.busy = `✓ Check xong ${results.length} bài · ${results.filter(r => r.indexed).length} đã index`;
            return draw(true);
          }
        }
      } catch (err) { setBusy('⚠️ ' + err.message); }
    });

    load();
  };
})();
