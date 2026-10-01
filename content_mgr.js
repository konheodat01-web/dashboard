/* ══ QUẢN LÝ NỘI DUNG THEO SITE — tab "✍️ Nội dung" trong Dashboard từng site (nút 📊) ══
 * Kho nội dung = bài CÓ SẴN trên web (trình duyệt cào WordPress REST) + bài KẾ HOẠCH import từ "📐 Lập kế hoạch".
 * Lưu ở SEO Writer: content_inventory/ws<id>.json (qua proxy /api/sw-expert/content*) — lần sau chỉ quét bài mới / vừa sửa.
 * Chủ site chốt 27/9/2026: lọc trùng theo từ khóa (không Serper), quét khi bấm, không có người phụ trách / hạn chót,
 * ghép danh mục WP tự động + ghép tay 1 lần, kế hoạch đổi thì báo + nút cập nhật, cấu hình riêng từng site.
 * Cần globals của script_v5.js: websites, wstCurrentUrl, wstCurrent301Site, wstFetchWp, wstCheckIndexSerper, wtApiKey,
 * wstRecomputeSiteStats, getWstSite, wstOpenWriterModal.
 */
(function () {
  const API = '/api/sw-expert/';
  const ST = {                                        // trạng thái bài — mỗi trạng thái 1 màu riêng, không trùng
    plan: ['Kế hoạch', '#8b949e'], writing: ['Đang viết', '#d29922'], awaiting_images: ['Chờ ảnh', '#bc8cff'],
    published: ['Đã đăng', '#58a6ff'], optimize: ['Cần tối ưu', '#db6d28'], dropped: ['Bỏ', '#6e7681']
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = n => (Number(n) || 0).toLocaleString('vi-VN');
  const btn = (extra) => `background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;${extra || ''}`;
  const inp = 'background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:4px 7px;font-size:12px;font-family:inherit';
  const card = (label, val, sub, col) => `<div style="flex:1;min-width:120px;background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:10px 12px">
    <div style="font-size:11px;color:#8b949e;margin-bottom:4px">${label}</div><div style="font-size:20px;font-weight:700;color:${col}">${val}</div>
    <div style="font-size:11px;color:#8b949e;margin-top:2px">${sub || '&nbsp;'}</div></div>`;
  const box = (title, inner) => `<div style="background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:10px 12px;min-width:0">
    <div style="font-size:12px;font-weight:700;color:#c9d1d9;margin-bottom:8px">${title}</div>${inner}</div>`;

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

  // Gọi từ bảng kế hoạch (🧠 Chuyên gia SEO → 📐 Lập kế hoạch): chuyển sang tab ✍️ Nội dung và vào thẳng bước kiểm tra trùng
  window.cmOpenImport = function (wsId, rowIds) {
    window._cmPendingImport = { wsId, ids: rowIds };
    if (typeof wstSwitchTab === 'function') wstSwitchTab(null, 'content');
  };

  window.cmMount = function (panel, wsId) {
    const cid = 'ws' + wsId;
    const w = (typeof websites !== 'undefined' ? websites : []).find(x => x.id === wsId);
    if (!panel || !w) return;
    const s = { v: null, view: 'dash', f: { q: '', silo: '', st: '', label: '', month: '', src: '' }, sel: new Set(), limit: 100, busy: '' };
    const domain = () => (typeof wstCurrentUrl === 'function' ? wstCurrentUrl(w) : (w.url || '')).replace(/^https?:\/\//, '').replace(/\/$/, '');

    panel.innerHTML = `<div class="cm-root" style="display:flex;flex-direction:column;gap:12px"><div style="color:#8b949e">Đang tải kho nội dung…</div></div>`;
    const root = panel.querySelector('.cm-root');

    async function load() {
      try { s.v = await api('content/' + cid); }
      catch (e) { root.innerHTML = `<div style="color:#f85149">⚠️ Không tải được kho nội dung: ${esc(e.message)}</div>`; return; }
      const pend = window._cmPendingImport;
      if (pend && pend.wsId === wsId) {             // đến từ nút 📥 ở bảng kế hoạch
        window._cmPendingImport = null;
        s.imp = { q: '', silo: '', label: '', month: '', sel: new Set(pend.ids) };
        s.view = 'import';
        return drawPreview();
      }
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
        setBusy(`✓ Quét xong: ${r.new || 0} bài mới · ${r.updated || 0} cập nhật · ${r.linked || 0} bài kế hoạch tự nhận là đã đăng · ${r.deleted || 0} bài đã xoá trên web`);
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
        if (f.label && (it.label || '') !== f.label) return false;
        if (f.month && String(it.month || '') !== f.month) return false;
        if (f.src === 'site' && !it.wp_id) return false;
        if (f.src === 'plan' && !it.plan_row) return false;
        if (f.src === 'deleted' && !it.deleted) return false;
        if (f.src !== 'deleted' && it.deleted) return false;
        if (f.st === 'indexed' ? !isIndexed(it) : f.st === 'notindexed' ? !(isLive(it) && it.index && !it.index.indexed) : (f.st && it.status !== f.st)) return false;
        if (q && ![it.keyword, it.title, it.url, it.label, ...(it.child || [])].some(v => String(v || '').toLowerCase().includes(q))) return false;
        return true;
      }).sort((a, b) => (a.plan_row && !a.wp_id ? 0 : 1) - (b.plan_row && !b.wp_id ? 0 : 1) || (a.month || 99) - (b.month || 99)
        || String(b.date || '').localeCompare(String(a.date || '')));
    }

    function draw(keepView) {
      if (!keepView && s.view !== 'dash') return drawView();
      const v = s.v, items = (v.items || []).filter(it => !it.deleted), set = v.settings || {};
      const live = items.filter(isLive), planOnly = items.filter(it => !it.wp_id);
      const idx = live.filter(isIndexed).length, checked = live.filter(it => it.index).length;
      const today = new Date();
      const overdue = planOnly.filter(it => ['plan', 'writing'].includes(it.status) && monthDue(set.start_date, it.month) && monthDue(set.start_date, it.month) < today);
      const byStatus = st => items.filter(it => it.status === st).length;
      const silos = [...new Set([...(v.plan.silos || []), ...items.map(it => it.silo).filter(Boolean)])];
      const labels = [...new Set(items.map(it => it.label).filter(Boolean))].sort();
      const months = [...new Set(items.map(it => it.month).filter(Boolean))].sort((a, b) => a - b);
      const opt = (l, cur, first) => `<option value="">${first}</option>` + l.map(x => `<option ${String(x) === String(cur) ? 'selected' : ''} value="${esc(x)}">${esc(x)}</option>`).join('');
      const scanInfo = v.scan.last_at ? `quét lần cuối ${esc(v.scan.last_at)}${v.scan.last_full_at ? ' · toàn bộ ' + esc(v.scan.last_full_at) : ''}` : 'CHƯA quét web';

      // tiến độ theo tháng (bài có tháng kế hoạch)
      const planned = items.filter(it => it.plan_row && it.month);
      const pm = months.map(m => {
        const rs = planned.filter(it => it.month === m), done = rs.filter(isLive).length;
        const due = monthDue(set.start_date, m);
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0">
          <span style="width:92px;color:#8b949e">T${m}${due ? ' · ' + (due.getMonth() + 1) + '/' + due.getFullYear() : ''}</span>
          <div style="flex:1;background:#21262d;border-radius:4px;height:10px;overflow:hidden"><div style="width:${rs.length ? Math.round(done / rs.length * 100) : 0}%;background:#3fb950;height:100%"></div></div>
          <span style="width:80px;text-align:right;color:#c9d1d9">${done}/${rs.length}</span></div>`;
      }).join('') || '<div style="font-size:12px;color:#8b949e">Chưa import bài kế hoạch nào</div>';
      const bs = silos.map(sl => {
        const rs = items.filter(it => (it.silo || '') === sl);
        return `<tr><td style="padding:3px 6px">${esc(sl)}</td><td style="padding:3px 6px;text-align:right">${rs.length}</td><td style="padding:3px 6px;text-align:right">${rs.filter(isLive).length}</td><td style="padding:3px 6px;text-align:right">${rs.filter(isIndexed).length}</td><td style="padding:3px 6px;text-align:right">${rs.filter(it => !it.wp_id).length}</td></tr>`;
      }).join('');
      const noCat = items.filter(it => !it.silo).length;

      const list = filtered(), shown = list.slice(0, s.limit);
      root.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:14px;color:#e6edf3">✍️ Quản lý nội dung</b><span style="font-size:12px;color:#8b949e">${esc(domain())} · ${scanInfo}</span>
          <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            <button data-a="scan" style="${btn()}" title="Chỉ lấy bài mới / vừa sửa kể từ lần quét trước + phát hiện bài đã xoá">🔄 Quét bài mới</button>
            <button data-a="scanfull" style="${btn()}" title="Cào lại toàn bộ bài viết + trang">⟳ Quét toàn bộ</button>
            <button data-a="import" style="${btn('background:#1f6feb;border-color:#1f6feb;color:#fff')}">📥 Import từ kế hoạch</button>
            <button data-a="config" style="${btn()}">⚙️ Cấu hình site</button>
          </span>
        </div>
        <div class="cm-busy" style="font-size:12px;color:#d29922;min-height:14px">${esc(s.busy)}</div>
        ${!v.scan.last_full_at ? '<div style="font-size:12px;color:#d29922">● Chưa quét toàn bộ web — bấm ⟳ Quét toàn bộ trước (bắt buộc trước khi import để lọc trùng).</div>' : ''}
        ${(v.plan_changed.length || v.plan_removed.length) ? `<div style="font-size:12px;color:#d29922;border-left:3px solid #d29922;padding:4px 8px">
          ⚠ ${v.plan_changed.length} bài kế hoạch đã đổi so với lúc import${v.plan_removed.length ? ` · ${v.plan_removed.length} bài đã bị bỏ khỏi kế hoạch` : ''}
          ${v.plan_changed.length ? `<button data-a="sync" style="${btn('margin-left:8px')}">Cập nhật ${v.plan_changed.length} bài theo kế hoạch mới</button>` : ''}</div>` : ''}
        ${noCat ? `<div style="font-size:12px;color:#8b949e">${noCat} bài chưa có danh mục (danh mục WP chưa ghép) — <a href="#" data-a="config" style="color:#58a6ff">ghép ở ⚙️ Cấu hình</a></div>` : ''}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${card('Tổng bài', num(items.length), `${num(live.length)} có trên web · ${num(planOnly.length)} chưa đăng`, '#58a6ff')}
          ${card('Kế hoạch', num(byStatus('plan')), 'chưa viết', '#8b949e')}
          ${card('Đang viết', num(byStatus('writing')), '', '#d29922')}
          ${card('Đã đăng', num(live.length), `${num(byStatus('optimize'))} cần tối ưu`, '#58a6ff')}
          ${card('Đã index', num(idx), live.length ? `${Math.round(idx / live.length * 100)}% · đã check ${checked}/${live.length}` : '', idx ? '#3fb950' : '#8b949e')}
          ${card('Trễ hạn', num(overdue.length), set.start_date ? 'so với tháng kế hoạch' : 'chưa đặt ngày bắt đầu', overdue.length ? '#f85149' : '#8b949e')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">
          ${box('📅 Tiến độ theo tháng kế hoạch (đã đăng / kế hoạch)', pm)}
          ${box('📁 Theo danh mục', `<table style="width:100%;font-size:12px"><tr style="color:#8b949e"><td style="padding:3px 6px">Danh mục</td><td style="padding:3px 6px;text-align:right">Tổng</td><td style="padding:3px 6px;text-align:right">Đã đăng</td><td style="padding:3px 6px;text-align:right">Index</td><td style="padding:3px 6px;text-align:right">Chưa đăng</td></tr>${bs}</table>`)}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input class="cm-q" value="${esc(s.f.q)}" placeholder="🔍 Từ khóa / tiêu đề / URL / danh mục con…" style="${inp};width:220px">
          <select class="cm-f" data-k="silo" style="${inp}">${opt(silos, s.f.silo, 'Tất cả danh mục')}</select>
          <select class="cm-f" data-k="st" style="${inp}"><option value="">Tất cả trạng thái</option>${Object.entries(ST).map(([k, x]) => `<option value="${k}" ${s.f.st === k ? 'selected' : ''}>${x[0]}</option>`).join('')}<option value="indexed" ${s.f.st === 'indexed' ? 'selected' : ''}>✅ Đã index</option><option value="notindexed" ${s.f.st === 'notindexed' ? 'selected' : ''}>🚫 Chưa index</option></select>
          <select class="cm-f" data-k="label" style="${inp}">${opt(labels, s.f.label, 'Tất cả danh mục con')}</select>
          <select class="cm-f" data-k="month" style="${inp}">${opt(months, s.f.month, 'Tất cả tháng')}</select>
          <select class="cm-f" data-k="src" style="${inp}"><option value="">Mọi nguồn</option><option value="site" ${s.f.src === 'site' ? 'selected' : ''}>Có trên web</option><option value="plan" ${s.f.src === 'plan' ? 'selected' : ''}>Từ kế hoạch</option><option value="deleted" ${s.f.src === 'deleted' ? 'selected' : ''}>Đã xoá trên web</option></select>
          <span style="font-size:12px;color:#8b949e">${num(list.length)} bài</span>
          <span style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <span style="font-size:12px;color:#8b949e">Đã chọn ${s.sel.size}</span>
            <button data-a="bulkwrite" style="${btn('background:#7c5cff;border-color:#7c5cff;color:#fff')}" title="Mở SEO Writer, điền sẵn các bài đã chọn (chưa đăng) vào bảng Bước 1 — bạn kiểm tra rồi bấm chạy">✍️ Viết hàng loạt${writable().length ? ' (' + writable().length + ')' : ''}</button>
            <button data-a="bulkimg" style="${btn('background:#d29922;border-color:#d29922;color:#fff')}" title="Mở SEO Writer, nạp sẵn các bài đã chọn vào 'Ảnh hàng loạt' — chỉ áp dụng bài đang 🖼️ Chờ ảnh">🖼️ Làm ảnh hàng loạt${(s.v.items || []).filter(x => s.sel.has(x.id) && needsImg(x)).length ? ' (' + (s.v.items || []).filter(x => s.sel.has(x.id) && needsImg(x)).length + ')' : ''}</button>
            <select class="cm-bulkst" style="${inp}"><option value="">Đổi trạng thái…</option>${Object.entries(ST).map(([k, x]) => `<option value="${k}">${x[0]}</option>`).join('')}</select>
            <button data-a="checkidx" style="${btn('background:#238636;border-color:#238636;color:#fff')}" title="Check index các bài đã chọn bằng Serper (site: URL)">✅ Check index</button>
          </span>
        </div>
        <div style="overflow:auto;border:1px solid #30363d;border-radius:8px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="position:sticky;top:0;background:#161b22"><tr style="color:#8b949e;text-align:left">
              <th style="padding:6px"><input type="checkbox" class="cm-all"></th><th style="padding:6px">Từ khóa chính</th><th style="padding:6px">Tiêu đề / URL</th>
              <th style="padding:6px">Danh mục</th><th style="padding:6px">Vai trò</th><th style="padding:6px">Danh mục con</th><th style="padding:6px">Tháng</th>
              <th style="padding:6px">Trạng thái</th><th style="padding:6px">Index</th><th style="padding:6px">Đăng / sửa</th><th style="padding:6px"></th></tr></thead>
            <tbody>${shown.map(it => rowHtml(it, silos)).join('') || '<tr><td colspan="11" style="padding:14px;color:#8b949e;text-align:center">Không có bài nào</td></tr>'}</tbody>
          </table>
        </div>
        ${list.length > shown.length ? `<div><button data-a="more" style="${btn()}">Hiện thêm (${shown.length}/${list.length})</button></div>` : ''}`;
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

    function rowHtml(it, silos) {
      const ix = !isLive(it) ? '—' : !it.index ? '<span style="color:#8b949e" title="Chưa check">—</span>' : it.index.indexed ? '<span title="' + esc(it.index.at) + '">✅</span>' : '<span title="' + esc(it.index.at) + '">🚫</span>';
      const st = ST[it.status] || ST.plan;
      const silo = `<select class="cm-silo" style="${inp};max-width:150px;padding:2px 4px"><option value="">—</option>${silos.map(x => `<option ${x === it.silo ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
      return `<tr data-id="${esc(it.id)}" style="border-top:1px solid #21262d;${it.deleted ? 'opacity:.5;text-decoration:line-through' : ''}">
        <td style="padding:5px 6px"><input type="checkbox" class="cm-sel" ${s.sel.has(it.id) ? 'checked' : ''}></td>
        <td style="padding:5px 6px;font-weight:600;color:#e6edf3">${esc(it.keyword || '—')}${(it.child || []).length ? `<div style="font-size:10.5px;color:#8b949e;font-weight:400">+${it.child.length} từ phụ</div>` : ''}</td>
        <td style="padding:5px 6px;max-width:340px">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener" style="color:#58a6ff;text-decoration:none">${esc(it.title || it.url)}</a>` : '<span style="color:#8b949e">(chưa đăng)</span>'}${it.match ? `<div style="font-size:10.5px;color:#8b949e">${esc(it.match)}</div>` : ''}</td>
        <td style="padding:5px 6px">${silo}</td>
        <td style="padding:5px 6px">${esc(it.role || (it.wp_type === 'page' ? 'Trang' : ''))}</td>
        <td style="padding:5px 6px">${esc(it.label || '')}</td>
        <td style="padding:5px 6px">${it.month ? 'T' + it.month : ''}</td>
        <td style="padding:5px 6px"><select class="cm-st" style="${inp};padding:2px 4px;color:${st[1]}">${Object.entries(ST).map(([k, x]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${x[0]}</option>`).join('')}</select></td>
        <td style="padding:5px 6px;text-align:center">${ix}</td>
        <td style="padding:5px 6px;white-space:nowrap;color:#8b949e">${esc(String(it.date || '').slice(0, 10))}${it.modified && it.modified.slice(0, 10) !== String(it.date || '').slice(0, 10) ? '<br>sửa ' + esc(it.modified.slice(0, 10)) : ''}</td>
        <td style="padding:5px 6px;white-space:nowrap">${it.keyword && !it.wp_id ? `<button data-a="write" style="${btn('padding:3px 8px;background:#7c5cff;border-color:#7c5cff;color:#fff')}" title="Mở SEO Writer điền sẵn từ khóa chính + phụ">✍️ Viết</button>` : ''}${!it.wp_id ? `<button data-a="del" style="${btn('padding:3px 6px;margin-left:3px;color:#f85149')}" title="Xoá khỏi kho (chỉ bài kế hoạch chưa đăng)">🗑</button>` : ''}</td>
      </tr>`;
    }

    // ══ IMPORT TỪ KẾ HOẠCH ══
    async function drawImport() {
      root.innerHTML = '<div style="color:#8b949e">Đang tải kế hoạch…</div>';
      let p;
      try { p = await api('planfull/' + cid); } catch (e) { root.innerHTML = `<div style="color:#f85149">⚠️ ${esc(e.message)}</div>`; return; }
      if (p.status !== 'done') { root.innerHTML = `<div style="color:#d29922">Site này chưa có kế hoạch — lập ở 🧠 Chuyên gia SEO → 📐 Lập kế hoạch.</div><div><button data-a="back" style="${btn()}">↩ Quay lại</button></div>`; return; }
      const done = new Set(s.v.imported_rows || []);
      const rows = (p.rows || []).filter(r => !done.has(r.id));
      const F = s.imp = s.imp || { q: '', silo: '', label: '', month: '', sel: new Set() };
      const silos = [...new Set(rows.map(r => r.silo))], labels = [...new Set(rows.map(r => r.label).filter(Boolean))].sort(), months = [...new Set(rows.map(r => r.month))].sort((a, b) => a - b);
      const opt = (l, cur, first) => `<option value="">${first}</option>` + l.map(x => `<option ${String(x) === String(cur) ? 'selected' : ''} value="${esc(x)}">${esc(x)}</option>`).join('');
      const vis = () => rows.filter(r => (!F.silo || r.silo === F.silo) && (!F.label || (r.label || '') === F.label) && (!F.month || String(r.month) === F.month)
        && (!F.q || [r.main, ...(r.child || [])].some(x => String(x).toLowerCase().includes(F.q.toLowerCase()))));
      const paint = () => {
        const vs = vis();
        root.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:14px;color:#e6edf3">📥 Import bài từ kế hoạch</b>
            <span style="font-size:12px;color:#8b949e">${rows.length} bài chưa import · ${done.size} đã import</span>
            ${p.confirmed && !p.pending ? '<span style="font-size:12px;color:#3fb950">✅ kế hoạch đã xác nhận</span>' : `<span style="font-size:12px;color:#d29922">● kế hoạch ${p.confirmed ? 'có thay đổi chưa xác nhận' : 'CHƯA xác nhận'}${s.v.settings.require_confirm ? ' — site này cấu hình BẮT BUỘC xác nhận trước khi import' : ''}</span>`}
            <button data-a="back" style="${btn('margin-left:auto')}">↩ Quay lại</button></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <input class="im-q" value="${esc(F.q)}" placeholder="🔍 Từ khóa…" style="${inp};width:200px">
            <select class="im-f" data-k="silo" style="${inp}">${opt(silos, F.silo, 'Tất cả danh mục')}</select>
            <select class="im-f" data-k="label" style="${inp}">${opt(labels, F.label, 'Tất cả danh mục con')}</select>
            <select class="im-f" data-k="month" style="${inp}">${opt(months, F.month, 'Tất cả tháng')}</select>
            <button data-a="imall" style="${btn()}">☑ Chọn tất cả theo lọc (${vs.length})</button><button data-a="imnone" style="${btn()}">Bỏ chọn</button>
            <span style="font-size:12px;color:#8b949e">Đã chọn ${F.sel.size}</span>
            <button data-a="imcheck" style="${btn('margin-left:auto;background:#1f6feb;border-color:#1f6feb;color:#fff')}" ${F.sel.size ? '' : 'disabled'}>Kiểm tra trùng & import →</button>
          </div>
          <div style="overflow:auto;border:1px solid #30363d;border-radius:8px;max-height:60vh">
            <table style="width:100%;border-collapse:collapse;font-size:12px"><thead style="position:sticky;top:0;background:#161b22"><tr style="color:#8b949e;text-align:left">
              <th style="padding:6px"></th><th style="padding:6px">STT</th><th style="padding:6px">Tháng</th><th style="padding:6px">Danh mục</th><th style="padding:6px">Vai trò</th><th style="padding:6px">Danh mục con</th><th style="padding:6px">Từ khóa chính</th><th style="padding:6px">Từ phụ</th><th style="padding:6px">TK cụm</th></tr></thead>
              <tbody>${vs.slice(0, 500).map(r => `<tr data-row="${esc(r.id)}" style="border-top:1px solid #21262d"><td style="padding:4px 6px"><input type="checkbox" class="im-sel" ${F.sel.has(r.id) ? 'checked' : ''}></td>
                <td style="padding:4px 6px;color:#8b949e">${r.stt}</td><td style="padding:4px 6px">T${r.month}</td><td style="padding:4px 6px">${esc(r.silo)}</td><td style="padding:4px 6px">${esc(r.role)}</td><td style="padding:4px 6px">${esc(r.label || '')}</td>
                <td style="padding:4px 6px;font-weight:600">${esc(r.main)}</td><td style="padding:4px 6px;color:#8b949e">${(r.child || []).length}</td><td style="padding:4px 6px">${num(r.vol)}</td></tr>`).join('')}</tbody></table>
            ${vs.length > 500 ? `<div style="padding:6px;font-size:12px;color:#8b949e">Hiện 500/${vs.length} dòng — "Chọn tất cả theo lọc" vẫn chọn đủ ${vs.length} bài.</div>` : ''}
          </div>`;
      };
      s.impPaint = paint;
      s.impVis = vis;
      paint();
    }

    async function drawPreview() {
      const ids = [...s.imp.sel];
      root.innerHTML = '<div style="color:#8b949e">Đang kiểm tra trùng với bài có sẵn…</div>';
      if (!s.v.scan.last_full_at) {
        root.innerHTML = '<div style="color:#d29922">Chưa quét toàn bộ web — đang quét trước để lọc trùng…</div><div class="cm-busy" style="font-size:12px;color:#d29922"></div>';
        await scan(true);
        if (!s.v.scan.last_full_at) return;
      }
      let pv;
      try { pv = await post('contentpreview/' + cid, { rows: ids }); } catch (e) { root.innerHTML = `<div style="color:#f85149">⚠️ ${esc(e.message)}</div><button data-a="import" style="${btn()}">↩ Quay lại</button>`; return; }
      s.pv = pv;
      const dec = s.dec = {};
      pv.dup.forEach(d => { dec[d.row] = d.post ? 'link' : 'new'; });
      const blocked = pv.require_confirm && !pv.plan_confirmed;
      root.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:14px;color:#e6edf3">📥 Kiểm tra trùng trước khi import</b>
          <button data-a="import" style="${btn('margin-left:auto')}">↩ Chọn lại</button></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${card('Bài mới', num(pv.new.length), 'sẽ thêm vào kho (Kế hoạch)', '#3fb950')}
          ${card('Trùng bài có sẵn', num(pv.dup.length), 'từ khóa có trong tiêu đề / slug', '#d29922')}
          ${card('Đã import rồi', num(pv.imported.length), 'bỏ qua', '#8b949e')}
        </div>
        ${pv.dup.length ? box('⚠ Trùng bài có sẵn trên web — chọn cách xử lý từng bài', `<table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr style="color:#8b949e"><td style="padding:4px">Bài kế hoạch</td><td style="padding:4px">Bài có sẵn</td><td style="padding:4px">Khớp theo</td><td style="padding:4px">Xử lý</td></tr>
          ${pv.dup.map(d => `<tr data-row="${esc(d.row)}" style="border-top:1px solid #21262d"><td style="padding:4px"><b>${esc(d.main)}</b><div style="color:#8b949e">#${d.stt} · ${esc(d.silo)} · T${d.month}</div></td>
            <td style="padding:4px"><a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(d.title)}</a>${d.shared_with ? `<div style="color:#d29922">đã gắn cho bài kế hoạch #${d.shared_with} trong lần này</div>` : ''}</td>
            <td style="padding:4px;color:#8b949e">"${esc(d.by)}"</td>
            <td style="padding:4px"><select class="pv-dec" style="${inp}">${d.post ? `<option value="link" selected>Gắn vào bài có sẵn (Cần tối ưu)</option>` : ''}<option value="new" ${d.post ? '' : 'selected'}>Vẫn tạo bài mới</option><option value="skip">Bỏ qua</option></select></td></tr>`).join('')}</table>`) : ''}
        ${pv.imported.length ? `<div style="font-size:12px;color:#8b949e">Đã import từ trước: ${pv.imported.slice(0, 20).map(d => esc(d.main)).join(', ')}${pv.imported.length > 20 ? '…' : ''}</div>` : ''}
        ${blocked ? '<div style="color:#f85149;font-size:12px">Site này cấu hình chỉ import kế hoạch ĐÃ xác nhận — xác nhận kế hoạch ở 🧠 Chuyên gia SEO trước.</div>' : ''}
        <div><button data-a="imgo" style="${btn('background:#238636;border-color:#238636;color:#fff')}" ${blocked || !(pv.new.length + pv.dup.length) ? 'disabled' : ''}>📥 Import ${pv.new.length + pv.dup.length} bài</button></div>`;
    }

    // ══ CẤU HÌNH SITE ══
    function drawConfig() {
      const set = s.v.settings || {}, silos = s.v.plan.silos || [];
      const cats = Object.keys(set.catmap || {}).sort();
      const count = c => (s.v.items || []).filter(it => (it.wp_cats || []).includes(c) && !it.deleted).length;
      root.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px"><b style="font-size:14px;color:#e6edf3">⚙️ Cấu hình quản lý nội dung — ${esc(domain())}</b><button data-a="back" style="${btn('margin-left:auto')}">↩ Quay lại</button></div>
        ${box('Kế hoạch', `<div style="display:flex;flex-direction:column;gap:8px;font-size:12px;color:#c9d1d9">
          <label>Ngày bắt đầu kế hoạch (tính hạn "Tháng 1, 2, …"): <input type="date" class="cf-start" value="${esc(set.start_date || '')}" style="${inp}"></label>
          <label><input type="checkbox" class="cf-req" ${set.require_confirm ? 'checked' : ''}> Chỉ cho import khi kế hoạch ĐÃ xác nhận</label></div>`)}
        ${box('Ghép danh mục WordPress → danh mục kế hoạch', cats.length ? `<table style="font-size:12px;border-collapse:collapse">
          ${cats.map(c => `<tr style="border-top:1px solid #21262d"><td style="padding:4px 8px">${esc(c)} <span style="color:#8b949e">(${count(c)} bài)</span></td><td style="padding:4px 8px">→</td>
            <td style="padding:4px 8px"><select class="cf-cat" data-cat="${esc(c)}" style="${inp}"><option value="">(không ghép)</option>${silos.map(x => `<option ${set.catmap[c] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td></tr>`).join('')}</table>` : '<div style="font-size:12px;color:#8b949e">Chưa có danh mục WP — quét web trước.</div>')}
        <div><button data-a="cfsave" style="${btn('background:#238636;border-color:#238636;color:#fff')}">💾 Lưu cấu hình</button> <span class="cm-busy" style="font-size:12px;color:#d29922"></span></div>`;
    }

    function drawView() { if (s.view === 'import') drawImport(); else if (s.view === 'config') drawConfig(); else draw(true); }

    // ══ SỰ KIỆN ══
    root.addEventListener('input', e => {
      if (e.target.classList.contains('cm-q')) { s.f.q = e.target.value; s.limit = 100; const pos = e.target.selectionStart; draw(true); const q = root.querySelector('.cm-q'); q.focus(); q.setSelectionRange(pos, pos); }
      if (e.target.classList.contains('im-q')) { s.imp.q = e.target.value; const pos = e.target.selectionStart; s.impPaint(); const q = root.querySelector('.im-q'); q.focus(); q.setSelectionRange(pos, pos); }
    });
    root.addEventListener('change', async e => {
      const t = e.target, tr = t.closest('tr[data-id]'), id = tr && tr.dataset.id;
      if (t.classList.contains('cm-f')) { s.f[t.dataset.k] = t.value; s.limit = 100; return draw(true); }
      if (t.classList.contains('im-f')) { s.imp[t.dataset.k] = t.value; return s.impPaint(); }
      if (t.classList.contains('im-sel')) { const r = t.closest('tr').dataset.row; t.checked ? s.imp.sel.add(r) : s.imp.sel.delete(r); return s.impPaint(); }
      if (t.classList.contains('pv-dec')) { s.dec[t.closest('tr').dataset.row] = t.value; return; }
      if (t.classList.contains('cm-sel')) { t.checked ? s.sel.add(id) : s.sel.delete(id); return draw(true); }
      if (t.classList.contains('cm-all')) { filtered().slice(0, s.limit).forEach(it => t.checked ? s.sel.add(it.id) : s.sel.delete(it.id)); return draw(true); }
      try {
        if (t.classList.contains('cm-st')) { s.v = await post('contentop/' + cid, { op: 'status', id, value: t.value }); return draw(true); }
        if (t.classList.contains('cm-silo')) { s.v = await post('contentop/' + cid, { op: 'set', id, field: 'silo', value: t.value }); return draw(true); }
        if (t.classList.contains('cm-bulkst') && t.value) {
          if (!s.sel.size) { alert('Chọn bài trước'); t.value = ''; return; }
          s.v = await post('contentop/' + cid, { op: 'status', ids: [...s.sel], value: t.value });
          s.sel.clear(); return draw(true);
        }
      } catch (err) { setBusy('⚠️ ' + err.message); }
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
          case 'back': s.view = 'dash'; return draw(true);
          case 'import': s.view = 'import'; return drawImport();
          case 'config': s.view = 'config'; return drawConfig();
          case 'imall': s.impVis().forEach(r => s.imp.sel.add(r.id)); return s.impPaint();
          case 'imnone': s.imp.sel.clear(); return s.impPaint();
          case 'imcheck': return drawPreview();
          case 'imgo': {
            const ids = s.pv.new.map(d => d.row).concat(s.pv.dup.map(d => d.row));
            el.disabled = true; el.textContent = 'Đang import…';
            const r = await post('contentimport/' + cid, { rows: ids, decisions: s.dec });
            s.v = r; s.imp.sel.clear(); s.view = 'dash';
            s.busy = `✓ Đã import ${r.new} bài mới · ${r.linked} bài gắn vào bài có sẵn (Cần tối ưu)`;
            return draw(true);
          }
          case 'sync':
            if (!confirm(`Cập nhật ${s.v.plan_changed.length} bài theo kế hoạch mới (từ khóa, từ phụ, danh mục, danh mục con, tháng)?`)) return;
            s.v = await post('contentsync/' + cid, { ids: s.v.plan_changed });
            s.busy = '✓ Đã cập nhật theo kế hoạch'; return draw(true);
          case 'cfsave': {
            const catmap = {};
            root.querySelectorAll('.cf-cat').forEach(x => { catmap[x.dataset.cat] = x.value; });
            s.v = await post('contentop/' + cid, { op: 'settings', value: { start_date: root.querySelector('.cf-start').value, require_confirm: root.querySelector('.cf-req').checked, catmap } });
            s.view = 'dash'; s.busy = '✓ Đã lưu cấu hình'; return draw(true);
          }
          case 'del':
            if (!confirm(`Xoá "${it.keyword}" khỏi kho nội dung? (bài vẫn còn trong kế hoạch, import lại được)`)) return;
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
