// Văn phòng Chuyên gia SEO — khung chat ở tab Báo cáo.
// Backend: /api/sw-expert/* (server.js proxy) -> SEO Writer /api/expert/* (seo_expert.py).
// Độc lập với renderDashboard(): nằm trong #sx-office riêng nên dashboard re-render không xoá chat.
(function () {
  const API = '/api/sw-expert/';
  const SUGGEST = [
    'Trang bị "Crawled - currently not indexed" thì xử lý thế nào?',
    'Cách đặt canonical khi có nhiều site nội dung gần giống nhau?',
    'Schema FAQPage còn hiện rich result không?',
    'Google đánh giá nội dung viết bằng AI ra sao?',
    'Site reputation abuse là gì, làm sao để tránh?',
    'Redirect 301 khi đổi domain cần làm những bước nào?',
  ];
  const st = { chatId: '', busy: false, chats: [] };
  let el = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, opts) {
    const r = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.detail || ('Lỗi ' + r.status));
    return data;
  }

  function renderMd(text, sources) {
    const byN = {};
    (sources || []).forEach(s => { byN[s.n] = s; });
    // [n] -> link nguồn (chỉ những số có trong danh sách nguồn)
    const withCites = String(text || '').replace(/\[(\d{1,2})\]/g, (m, n) =>
      byN[n] ? `<sup class="sx-cite"><a href="${esc(byN[n].url)}" target="_blank" rel="noopener" title="${esc(byN[n].title)}">${n}</a></sup>` : m);
    if (window.marked && window.DOMPurify) {
      return DOMPurify.sanitize(marked.parse(withCites), { ADD_ATTR: ['target'] });
    }
    return '<p>' + esc(text).replace(/\n/g, '<br>') + '</p>';
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return '';
    return '<div class="sx-sources">📚 Nguồn Google Search Central:' + sources.map(s =>
      `<div>[${s.n}] <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>`).join('') + '</div>';
  }

  function msgHtml(m) {
    if (m.role === 'user') return `<div class="sx-msg sx-msg-user">${esc(m.content)}</div>`;
    return `<div class="sx-msg sx-msg-ai">${renderMd(m.content, m.sources)}${sourcesHtml(m.sources)}</div>`;
  }

  function scrollBottom() { el.msgs.scrollTop = el.msgs.scrollHeight; }

  function renderWelcome() {
    el.msgs.innerHTML = `<div class="sx-welcome">
      <div class="sx-welcome-t">Hỏi Chuyên gia SEO</div>
      Trả lời dựa trên tài liệu chính thức của Google Search Central, có dẫn nguồn từng ý.
      <div class="sx-chips">${SUGGEST.map(q => `<button class="sx-chip">${esc(q)}</button>`).join('')}</div></div>`;
    el.msgs.querySelectorAll('.sx-chip').forEach(b => { b.onclick = () => { el.ta.value = b.textContent; send(); }; });
  }

  function renderList() {
    if (!st.chats.length) { el.list.innerHTML = '<div class="sx-empty-list">Chưa có hội thoại nào.</div>'; return; }
    el.list.innerHTML = st.chats.map(c => `<div class="sx-item${c.id === st.chatId ? ' active' : ''}" data-id="${esc(c.id)}">
      <span class="sx-item-t" title="${esc(c.title)}">💬 ${esc(c.title)}</span>
      <button class="sx-item-del" data-del="${esc(c.id)}" title="Xoá hội thoại">✕</button></div>`).join('');
    el.list.querySelectorAll('.sx-item').forEach(it => {
      it.onclick = (e) => { if (e.target.dataset.del) return; openChat(it.dataset.id); };
    });
    el.list.querySelectorAll('.sx-item-del').forEach(b => { b.onclick = () => delChat(b.dataset.del); });
  }

  async function loadList() {
    try { st.chats = (await api('chats')).chats || []; } catch (e) { st.chats = []; }
    renderList();
  }

  async function loadStatus() {
    try {
      const s = await api('status');
      el.sub.textContent = s.pages
        ? `${s.pages} trang tài liệu Google · cập nhật ${s.fetched} · hôm nay ${s.used_today} câu hỏi`
        : 'Kho kiến thức chưa có dữ liệu';
    } catch (e) { el.sub.textContent = 'Không kết nối được SEO Writer: ' + e.message; }
  }

  async function openChat(id) {
    if (st.busy) return;
    st.chatId = id; renderList();
    el.msgs.innerHTML = '<div class="sx-thinking">Đang tải…</div>';
    try {
      const c = await api('chats/' + encodeURIComponent(id));
      el.msgs.innerHTML = (c.messages || []).map(msgHtml).join('');
      scrollBottom();
    } catch (e) { el.msgs.innerHTML = `<div class="sx-err">${esc(e.message)}</div>`; }
  }

  function newChat() {
    if (st.busy) return;
    st.chatId = ''; renderList(); renderWelcome(); el.ta.focus();
  }

  async function delChat(id) {
    if (!confirm('Xoá hội thoại này?')) return;
    try { await api('chats/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {}
    if (id === st.chatId) newChat();
    loadList();
  }

  async function send() {
    const q = el.ta.value.trim();
    if (!q || st.busy) return;
    st.busy = true; el.send.disabled = true;
    if (!st.chatId) el.msgs.innerHTML = '';
    el.ta.value = ''; autosize();
    el.msgs.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', content: q }));
    const pending = document.createElement('div');
    pending.className = 'sx-msg sx-msg-ai sx-thinking';
    pending.textContent = '🔎 Đang tra tài liệu Google và soạn câu trả lời…';
    el.msgs.appendChild(pending); scrollBottom();
    try {
      const r = await api('chat', { method: 'POST', body: JSON.stringify({ message: q, chat_id: st.chatId }) });
      pending.remove();
      el.msgs.insertAdjacentHTML('beforeend', msgHtml({ role: 'assistant', content: r.answer, sources: r.sources }));
      st.chatId = r.chat_id;
      loadList(); loadStatus();
    } catch (e) {
      pending.remove();
      el.msgs.insertAdjacentHTML('beforeend', `<div class="sx-err">⚠️ ${esc(e.message)}</div>`);
      el.ta.value = q; autosize();
    }
    st.busy = false; el.send.disabled = false; scrollBottom();
  }

  function autosize() {
    el.ta.style.height = 'auto';
    el.ta.style.height = Math.min(el.ta.scrollHeight, 140) + 'px';
    el.ta.style.overflowY = el.ta.scrollHeight > 140 ? 'auto' : 'hidden';
  }

  function setCollapsed(c) {
    el.root.classList.toggle('sx-collapsed', c);
    el.toggle.textContent = c ? 'Mở rộng' : 'Thu gọn';
    try { localStorage.setItem('sx_collapsed', c ? '1' : '0'); } catch (e) {}
  }

  // renderDashboard() ghi đè innerHTML của #page-dashboard-content mỗi lần render -> gọi sxMount()
  // để GẮN LẠI chính node văn phòng (không tạo mới) ngay dưới tiêu đề, giữ nguyên hội thoại đang mở.
  window.sxMount = function (container) {
    const root = init();
    if (!container || root.parentNode === container) return;
    const head = container.firstElementChild;
    if (head) head.after(root); else container.prepend(root);
  };

  function init() {
    if (el.root) return el.root;
    const root = document.createElement('div');
    root.id = 'sx-office';
    root.className = 'sx-office';
    root.style.marginBottom = '20px';
    root.innerHTML = `
      <div class="sx-head">
        <div><div class="sx-title">🧠 Văn phòng Chuyên gia SEO</div><div class="sx-sub">Đang kết nối…</div></div>
        <div class="sx-head-actions"><button class="sx-btn sx-toggle">Thu gọn</button></div>
      </div>
      <div class="sx-body">
        <div class="sx-side"><div class="sx-side-top"><button class="sx-btn sx-btn-primary sx-new">＋ Hội thoại mới</button></div><div class="sx-list"></div></div>
        <div class="sx-main">
          <div class="sx-msgs"></div>
          <div class="sx-input"><textarea rows="1" placeholder="Hỏi về index, canonical, schema, nội dung, spam policy… (Enter gửi, Shift+Enter xuống dòng)"></textarea>
          <button class="sx-btn sx-btn-primary sx-send">Gửi</button></div>
        </div>
      </div>`;
    el = {
      root, sub: root.querySelector('.sx-sub'), list: root.querySelector('.sx-list'), msgs: root.querySelector('.sx-msgs'),
      ta: root.querySelector('textarea'), send: root.querySelector('.sx-send'), toggle: root.querySelector('.sx-toggle'),
    };
    el.send.onclick = send;
    root.querySelector('.sx-new').onclick = newChat;
    el.toggle.onclick = () => setCollapsed(!root.classList.contains('sx-collapsed'));
    el.ta.addEventListener('input', autosize);
    el.ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    let collapsed = false;
    try { collapsed = localStorage.getItem('sx_collapsed') === '1'; } catch (e) {}
    setCollapsed(collapsed);
    autosize();
    renderWelcome(); loadStatus(); loadList();
    return root;
  }

  // ══ CHUYÊN GIA THEO WEBSITE — tab "🧠 Chuyên gia SEO" trong Dashboard từng site (nút 📊, Theo dõi web) ══
  // Mỗi website 1 hội thoại cố định id "ws<wsId>" (wsId = bản ghi dòng đang theo dõi, không đổi khi đổi 301).
  // Mỗi câu hỏi gửi kèm HỒ SƠ gom LIVE từ dữ liệu tab này — không bao giờ gửi mật khẩu / app password.

  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const num = v => (Number(v) || 0).toLocaleString('vi-VN');

  // Chuỗi 301 xuôi từ bản ghi gốc -> bản mới nhất (cùng thuật toán wstCurrent301Site / renderWsTrack)
  function sx301Chain(w) {
    const chain = [w], seen = new Set([w.id]);
    let cur = w;
    while (cur) {
      const kids = websites.filter(x => x.is301 && x.sourceUrl && wstNormalizeUrl(x.sourceUrl) === wstNormalizeUrl(cur.url));
      if (!kids.length) break;
      cur = kids[kids.length - 1];
      if (seen.has(cur.id)) break;
      seen.add(cur.id); chain.push(cur);
    }
    return chain;
  }

  async function sxSiteTopQueries(w) {
    // Giống wstLoadGscQueries: ưu tiên gscPropertyUrl, không có thì URL 301 mới nhất
    if (typeof wstFetchGscDataDirect !== 'function') return 'không lấy được (thiếu hàm GSC)';
    if (!sessionStorage.getItem('gsc_access_token')) return 'không lấy được: chưa đăng nhập Google / token GSC hết hạn';
    const cur = wstCurrent301Site(w);
    const prop = w.gscPropertyUrl || (cur && cur.url) || w.url;
    if (!prop) return 'không lấy được: chưa có GSC property';
    const end = new Date(), start = new Date(); start.setDate(start.getDate() - 28);
    const fmt = d => d.toISOString().split('T')[0];
    try {
      const d = await Promise.race([
        wstFetchGscDataDirect(prop, { startDate: fmt(start), endDate: fmt(end), dimensions: ['query'], rowLimit: 15 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('quá thời gian')), 8000)),
      ]);
      const rows = d.rows || [];
      if (!rows.length) return 'GSC không có từ khóa nào trong 28 ngày';
      return rows.map(r => `  - "${r.keys[0]}": ${r.clicks} clicks, ${r.impressions} imps, CTR ${(r.ctr * 100).toFixed(1)}%, vị trí ${r.position.toFixed(1)}`).join('\n');
    } catch (e) { return 'không lấy được: ' + e.message; }
  }

  async function sxSiteContext(wsId) {
    if (typeof websites === 'undefined' || typeof getWstSite !== 'function') return { title: '', text: '' };
    const w = websites.find(x => x.id === wsId);
    if (!w) return { title: '', text: '' };
    const site = getWstSite(wsId) || {};
    const chain = sx301Chain(w);
    const cur = chain[chain.length - 1];
    const L = [];
    L.push(`Thời điểm lấy dữ liệu: ${new Date().toLocaleString('vi-VN')}`);
    L.push('\n## WEBSITE ĐANG CHẠY (bản ghi 301 mới nhất — phân tích dựa trên site này)');
    L.push(`- ${cur.brand || '—'} · ${cur.url || '—'} · trạng thái: ${cur.status || '—'}`);
    L.push('\n## DỰ ÁN (bản ghi gốc — chỉ là tên dự án)');
    L.push(`- Brand: ${w.brand || '—'} · URL gốc: ${w.url || '—'} · Team: ${w.team === 'Team 02' ? 'M7' : 'Chaewon'} · Trạng thái: ${w.status || '—'} · Độ khó: ${w.difficulty || '—'} · Tag: ${(w.tags || []).join(', ') || '—'}`);
    L.push(`- Chuỗi domain (cũ → mới): ${chain.map(x => x.url).join(' → ')}`);
    const cmds = site.redirectCommands || [];
    L.push(`- Lệnh 301: ${cmds.length ? cmds.map(c => `${c.createdAt || c.dateText}: → ${c.destUrl} [${c.status}]`).join('; ') : 'chưa có'}`);
    L.push(`- Từ khóa SEO chính: ${site.mainKeyword || w.brand || '—'}`);

    L.push('\n## GOOGLE SEARCH CONSOLE (cùng số trên bảng Theo dõi web; kỳ trước = khoảng liền trước cùng độ dài)');
    const gscSt = site.gscConnectionStatus || 'not_connected';
    L.push(`- Kết nối GSC: ${gscSt === 'connected' ? 'đã kết nối' : gscSt === 'disconnected' ? 'MẤT kết nối' : 'chưa ghi nhận'} · đồng bộ lần cuối: ${((typeof _gscCache !== 'undefined' && _gscCache[wsId]) || {}).syncedAt || 'chưa rõ'}`);
    if (typeof wstGetGscPeriodData === 'function') {
      [['7d', '7 ngày'], ['28d', '28 ngày'], ['3m', '3 tháng']].forEach(([p, lb]) => {
        const g = wstGetGscPeriodData(wsId, p);
        if (!g.clicks && !g.imps) { L.push(`- ${lb}: không có dữ liệu`); return; }
        L.push(`- ${lb} (đến ${g.latestDate}): clicks ${num(g.clicks)} (kỳ trước ${num(g.clicksPrev)}), imps ${num(g.imps)} (kỳ trước ${num(g.impsPrev)}), CTR ${g.ctr.toFixed(1)}% (kỳ trước ${g.ctrPrev.toFixed(1)}%), vị trí TB ${g.pos ? g.pos.toFixed(1) : '—'} (kỳ trước ${g.posPrev ? g.posPrev.toFixed(1) : '—'})`);
      });
    }
    L.push('- Top từ khóa GSC 28 ngày:\n' + await sxSiteTopQueries(w));

    L.push('\n## LỊCH SỬ RANK TỪ KHÓA CHÍNH & INDEX TRANG CHỦ (mới nhất trước)');
    const entries = (site.entries || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
    L.push(entries.length ? entries.map(e => `- ${e.date}: rank ${clip(e.rank, 30) || '—'}, backlinks ${e.backlinks || '—'}, index: ${e.indexed || '—'}${e.note ? ', ghi chú: ' + clip(e.note, 150) : ''}`).join('\n') : '- chưa có');

    L.push('\n## NỘI DUNG TRÊN SITE (quét WordPress + check index bằng Serper)');
    const cs = (typeof _wstContentStats !== 'undefined' && _wstContentStats[wsId]) || null;
    if (cs && (cs.postCount === 0 || cs.postCount > 0)) {
      const idx = cs.indexed || 0, tot = cs.postCount;
      L.push(`- Tổng bài (post+page): ${tot} · đã index: ${idx} · chưa index: ${Math.max(0, tot - idx)} · tỷ lệ: ${tot ? Math.round(idx * 100 / tot) + '%' : '—'} · nội dung cập nhật: ${cs.lastContentUpdate || '—'} · quét lúc: ${cs.checkedAt || '—'}`);
    } else L.push('- chưa quét');

    const sv = (site.services || []).slice(-15);
    L.push('\n## DỊCH VỤ SEO ĐÃ MUA (nhập tay)');
    L.push(sv.length ? sv.map(s => `- ${s.date}: ${s.type} × ${s.amount || 0} — ${clip(s.desc, 120)}${s.note ? ' (' + clip(s.note, 100) + ')' : ''}`).join('\n') : '- chưa có');

    L.push('\n## KẾ HOẠCH (kanban) & CHIẾN LƯỢC');
    const kb = site.kanban || {};
    [['todo', 'Vấn đề'], ['doing', 'Đang làm'], ['done', 'Hoàn thành'], ['pending', 'Pending']].forEach(([k, lb]) => {
      const cards = (kb[k] || []).slice(-10);
      if (cards.length) L.push(`- ${lb}: ` + cards.map(c => `${clip(c.title, 80)}${c.desc ? ' (' + clip(c.desc, 100) + ')' : ''}`).join('; '));
    });
    L.push(`- Chiến lược: ${clip(site.strategyNote, 1500) || 'chưa ghi'}`);

    const logs = (site.changelog || []).slice(0, 15);
    L.push('\n## LỊCH SỬ THAY ĐỔI DỮ LIỆU (mới nhất trước)');
    L.push(logs.length ? logs.map(l => `- ${l.date}: [${l.type}] ${clip(l.detail, 150)}`).join('\n') : '- chưa có');

    return { title: `🌐 ${cur.brand || w.brand} — ${cur.url || w.url}`, text: L.join('\n') };
  }

  // ══ CHẨN ĐOÁN INDEX — đọc site TỪ BÊN NGOÀI (không đăng nhập WP) ══
  // Mẫu = bài "chưa index" theo check Serper (_wstIndexCache của chế độ Quản lý nội dung) + 2 bài đã index đối chứng.
  // VPS (/api/site-diagnose) đọc robots/sitemap/HTML/link nội bộ; trình duyệt gọi GSC URL Inspection (token ở browser).
  const shortUrl = u => { try { const x = new URL(u); return x.pathname.length > 1 ? decodeURIComponent(x.pathname) : x.host + '/'; } catch (e) { return u; } };
  const tcell = s => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\n/g, ' ');

  async function sxDiagnose(wsId, progress) {
    const w = websites.find(x => x.id === wsId);
    if (!w) throw new Error('Không tìm thấy website');
    const host = wstCurrentUrl(w);
    if (!host) throw new Error('Website chưa có URL');
    progress('Đang lấy danh sách bài qua WordPress REST…');
    const content = await wstFetchAllContent(host);
    const items = content.ok ? content.items : [];
    const ic = it => (typeof _wstIndexCache !== 'undefined' && _wstIndexCache[_wstUrlKey(it.link)]) || null;
    const notIdx = items.filter(it => { const c = ic(it); return c && !c.indexed; });
    const idx = items.filter(it => { const c = ic(it); return c && c.indexed; });
    const unchecked = items.filter(it => !ic(it));
    const spread = (arr, n) => arr.length <= n ? arr : arr.slice(0, Math.ceil(n / 2)).concat(arr.slice(-Math.floor(n / 2)));
    const title = it => clip(it.title && (it.title.rendered || it.title), 70);
    let sample = spread(notIdx, 8).map(it => ({ link: it.link, title: title(it), serper: 'chưa index' }));
    if (!sample.length) sample = unchecked.slice(0, 8).map(it => ({ link: it.link, title: title(it), serper: 'chưa check' }));
    sample = sample.concat(idx.slice(0, 2).map(it => ({ link: it.link, title: title(it), serper: 'đã index (đối chứng)' })));

    progress('VPS đang đọc robots.txt, sitemap, HTML từng bài, link nội bộ…');
    const r = await fetch('/api/site-diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: host, urls: sample.map(x => x.link), all_links: items.map(it => it.link) }) });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error || ('Lỗi chẩn đoán ' + r.status));

    // Google URL Inspection (quota ~2000/ngày/property — chỉ kiểm bài mẫu)
    const insp = {};
    let inspNote = '';
    const token = sessionStorage.getItem('gsc_access_token');
    if (!token) inspNote = 'KHÔNG chạy: chưa đăng nhập Google / token GSC hết hạn (đăng nhập lại qua badge GSC rồi chẩn đoán lại để có dữ liệu mạnh nhất).';
    else {
      let prop = '';
      try { prop = await wstGetExactGscPropertyUrl(w.gscPropertyUrl || host); } catch (e) { prop = 'sc-domain:' + host.replace(/^www\./, ''); }
      for (let i = 0; i < sample.length; i++) {
        progress(`Google URL Inspection ${i + 1}/${sample.length}…`);
        try {
          const rr = await fetch('/api/gsc-inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, siteUrl: prop, inspectionUrl: sample[i].link }) });
          const j = await rr.json().catch(() => ({}));
          if (rr.status === 401) { inspNote = 'dừng giữa chừng: token GSC hết hạn'; break; }
          if (rr.status === 403) { inspNote = `tài khoản Google đang đăng nhập không có quyền property ${prop}`; break; }
          insp[sample[i].link] = rr.ok ? ((j.inspectionResult || {}).indexStatusResult || {}) : { err: (j.error && j.error.message) || ('HTTP ' + rr.status) };
        } catch (e) { insp[sample[i].link] = { err: e.message }; }
      }
    }

    // ── Báo cáo (Markdown: vừa hiển thị, vừa gửi kèm cho chuyên gia) ──
    const L = [];
    L.push(`**Site theo dõi:** ${host}${d.base ? ` · đọc thực tế tại ${d.base}` : ''} · chạy lúc ${new Date().toLocaleString('vi-VN')}`);
    L.push(`**Bài viết (REST, tối đa 100 post + 100 page):** ${items.length}${content.ok ? '' : ' — KHÔNG lấy được danh sách bài: ' + (content.error || '')} · theo check Serper: ${idx.length} đã index, ${notIdx.length} chưa index, ${unchecked.length} chưa check`);
    if (d.crossDomain) L.push(`\n⚠️ **Trang chủ redirect sang domain khác:** ${(d.home.chain || []).map(c => `${c.status} ${c.url}`).join(' → ')}`);
    // ── Phát hiện nhanh: luật cứng rút từ số liệu (để người đọc & chuyên gia thấy ngay nguyên nhân khả dĩ) ──
    const S = (d.samples || []).filter(x => !x.error);
    const hasNoindex = x => /noindex/i.test([x.metaRobots, x.metaGooglebot, x.xRobots].join(' '));
    const F = [];
    if (d.crossDomain) F.push(`Cả domain đang redirect sang **${d.crossDomain}** — Google sẽ index domain đích, không index ${host}.`);
    if (d.robots && d.robots.blocksAll) F.push('**robots.txt đang chặn TOÀN BỘ site** (Disallow: /) — Google không thu thập được trang nào.');
    if (d.home && /noindex/i.test([d.home.metaRobots, d.home.xRobots].join(' '))) F.push('**Trang chủ đang noindex** — thường do bật "Ngăn chặn các công cụ tìm kiếm đánh chỉ mục" (Cài đặt → Đọc) của WordPress hoặc plugin SEO.');
    if (d.home && d.home.status === 200 && !(d.home.schemaTypes || []).length) F.push('Trang chủ **không có dữ liệu có cấu trúc** (JSON-LD/microdata).');
    const nBlock = S.filter(x => x.robotsTxt && x.robotsTxt.blocked).length;
    if (nBlock) F.push(`${nBlock}/${S.length} bài mẫu bị **robots.txt chặn**.`);
    const nNoidx = S.filter(hasNoindex).length;
    if (nNoidx) F.push(`${nNoidx}/${S.length} bài mẫu có **noindex** (meta robots / X-Robots-Tag).`);
    const nBadStatus = S.filter(x => x.status !== 200).length;
    if (nBadStatus) F.push(`${nBadStatus}/${S.length} bài mẫu không trả HTTP 200 (lỗi hoặc redirect).`);
    const canonOther = S.filter(x => x.canonical && !x.canonicalSelf);
    if (canonOther.length) {
      const dead = canonOther.filter(x => x.canonicalTarget && x.canonicalTarget.status && x.canonicalTarget.status !== 200);
      F.push(`${canonOther.length}/${S.length} bài mẫu khai báo **canonical sang URL khác** (vd ${shortUrl(canonOther[0].url)} → ${canonOther[0].canonical}) → Google chỉ index URL canonical; check index theo URL gốc sẽ báo "chưa index" dù bản canonical có thể đã index.` +
        (dead.length ? ` ⚠️ **${dead.length} URL canonical đích trả HTTP ${dead.map(x => x.canonicalTarget.status).join('/')}** — trỏ canonical vào trang lỗi thì Google không index được bản nào.` : ''));
    }
    const nNoSm = S.filter(x => x.inSitemap === false).length;
    if (nNoSm) F.push(`${nNoSm}/${S.length} bài mẫu **không có trong sitemap**.`);
    const nOrph = S.filter(x => x.inlinksContent === 0 && !x.fromHome).length;
    if (nOrph) F.push(`${nOrph}/${S.length} bài mẫu **không có link nội bộ** nào trỏ tới (cả trong nội dung bài lẫn trang chủ).`);
    const nThin = S.filter(x => x.status === 200 && x.words > 0 && x.words < 300).length;
    if (nThin) F.push(`${nThin}/${S.length} bài mẫu **mỏng** (dưới 300 từ).`);
    L.push('\n### Phát hiện nhanh');
    L.push(F.length ? F.map(f => '- ' + f).join('\n') : '- Không thấy lỗi kỹ thuật rõ ràng ở bài mẫu (robots, noindex, canonical, sitemap, link đều ổn) → nghiêng về vấn đề chất lượng/độ tin cậy nội dung; xem kết quả URL Inspection.');

    const h = d.home || {};
    L.push('\n### Trang chủ');
    L.push(`- HTTP ${h.status} · ${h.ms} ms · meta robots: ${h.metaRobots || '(không có)'}${h.xRobots ? ' · X-Robots-Tag: ' + h.xRobots : ''} · canonical: ${h.canonical || '(không có)'} · link nội bộ: ${h.internalLinks}`);
    const rb = d.robots || {};
    L.push('\n### robots.txt');
    L.push(`- HTTP ${rb.status}${rb.error ? ' (' + rb.error + ')' : ''} · Sitemap khai báo: ${(rb.sitemaps || []).join(', ') || 'không có'}`);
    const blocked = (d.samples || []).filter(x => x.robotsTxt && x.robotsTxt.blocked);
    L.push(`- Bài mẫu bị robots.txt chặn: ${blocked.length ? blocked.map(x => shortUrl(x.url) + ' (' + x.robotsTxt.rule + ')').join('; ') : 'không có'}`);
    if (rb.text) L.push('```\n' + rb.text.slice(0, 1200) + '\n```');
    const smp = d.sitemap || {};
    L.push('\n### Sitemap');
    L.push(`- Đọc ${(smp.used || []).length} file, ${smp.urlCount} URL.` + (smp.missingCount == null ? ' Không đọc được sitemap nào.' : ` Bài KHÔNG có trong sitemap: ${smp.missingCount}/${smp.checkedLinks}${smp.missingSample && smp.missingSample.length ? ' (vd: ' + smp.missingSample.slice(0, 5).map(shortUrl).join(', ') + ')' : ''}`));
    L.push('\n### Dữ liệu có cấu trúc (schema)');
    L.push(`- Trang chủ: ${(h.schemaTypes || []).join(', ') || 'không có'}`);
    const stc = {};
    (d.samples || []).forEach(x => (x.schemaTypes || []).forEach(t => { stc[t] = (stc[t] || 0) + 1; }));
    const nS = (d.samples || []).filter(x => !x.error).length;
    L.push(`- Bài mẫu (${nS} bài): ${Object.keys(stc).length ? Object.entries(stc).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${c}/${nS}`).join(', ') : 'không có schema'}`);
    const il = d.inlinks || {};
    L.push('\n### Link nội bộ trong nội dung bài');
    L.push(il.ok ? `- Quét ${il.scannedPosts} bài/trang: ${il.orphanCount}/${il.totalLinks} bài KHÔNG được bài nào khác link tới trong nội dung (chưa tính menu/sidebar/chuyên mục).` : '- Không quét được nội dung qua REST.');
    if (il.polluted) L.push('- ⚠️ REST API trả JSON bị chèn HTML/CSS phía trước (plugin/theme in ra output) — nên sửa.');
    L.push('\n### Bài mẫu (đọc như Googlebot từ bên ngoài)');
    L.push('| # | Bài | Serper | HTTP | robots.txt | meta robots / X-Robots | Canonical | Số từ | Bài khác link tới | Có ở trang chủ | Có trong sitemap |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|');
    (d.samples || []).forEach((x, i) => {
      const sm = sample.find(s => s.link === x.url) || {};
      const redir = (x.chain || []).length > 1 ? ' (redirect: ' + x.chain.join(' → ') + ')' : '';
      const ct = x.canonicalTarget;
      const canon = x.canonical ? (x.canonicalSelf ? 'tự trỏ' : '→ ' + x.canonical +
        (ct ? (ct.error ? ' (không kiểm được)' : ` (đích HTTP ${ct.status}${ct.status !== 200 ? ' ⚠️' : ''}${ct.selfCanonical === false ? ', đích lại canonical tiếp' : ''})`) : '')) : '(không có)';
      const yn = v => v == null ? '?' : v ? 'có' : 'KHÔNG';
      L.push(`| ${i + 1} | ${tcell(shortUrl(x.url))} | ${sm.serper || ''} | ${x.error ? 'lỗi: ' + tcell(x.error) : x.status + tcell(redir)} | ${x.robotsTxt ? (x.robotsTxt.blocked ? 'CHẶN ' + tcell(x.robotsTxt.rule) : 'cho phép') : '?'} | ${tcell([x.metaRobots, x.metaGooglebot && 'googlebot: ' + x.metaGooglebot, x.xRobots && 'X-Robots: ' + x.xRobots].filter(Boolean).join(' · ') || '(không có)')} | ${tcell(canon)} | ${x.words || 0} | ${x.inlinksContent == null ? '?' : x.inlinksContent} | ${yn(x.fromHome)} | ${yn(x.inSitemap)} |`);
    });
    L.push('\n### Google URL Inspection (GSC)');
    if (inspNote) L.push('- ' + inspNote);
    sample.forEach((s, i) => {
      const x = insp[s.link];
      if (!x) return;
      if (x.err) { L.push(`- ${i + 1}. ${shortUrl(s.link)}: lỗi ${x.err}`); return; }
      const canonDiff = x.googleCanonical && x.userCanonical && x.googleCanonical !== x.userCanonical ? ` · ⚠️ Google chọn canonical KHÁC: ${x.googleCanonical} (site khai báo ${x.userCanonical})` : '';
      L.push(`- ${i + 1}. ${shortUrl(s.link)}: **${x.coverageState || x.verdict || '?'}** · verdict ${x.verdict || '?'} · crawl lần cuối: ${x.lastCrawlTime || 'chưa từng'} · robots: ${x.robotsTxtState || '?'} · indexing: ${x.indexingState || '?'} · fetch: ${x.pageFetchState || '?'}${x.crawledAs ? ' · crawl bằng ' + x.crawledAs : ''}${canonDiff}${(x.referringUrls || []).length ? ' · được link từ ' + x.referringUrls.length + ' URL' : ''}`);
    });
    return L.join('\n');
  }

  const SITE_SUGGEST = [
    'Site này đang có vấn đề gì cần ưu tiên xử lý?',
    'Phân tích xu hướng GSC của site so với kỳ trước',
    'Vì sao từ khóa chính chưa lên top?',
    'Tuần này nên làm gì theo lộ trình đã thống nhất?',
  ];

  // ══ FORM TÍCH HỢP — hỏi từng câu. id câu hỏi phải khớp LABELS ở seo_expert_integrate.py ══
  const SITE_TYPES = [
    ['moi', '🌱 Website mới hoàn toàn', 'Domain mới, chưa có lịch sử, chưa hoặc mới có ít nội dung'],
    ['nhan301', '🔀 Domain mới nhận 301', 'Site cũ đã 301 sang domain này — thừa hưởng lịch sử site cũ'],
    ['dangchay', '🚀 Website đang chạy', 'Đã có nội dung, có dữ liệu Search Console'],
    ['muallai', '♻️ Domain mua lại', 'Domain từng được người khác sử dụng trước đây'],
  ];
  const ALL = ['moi', 'nhan301', 'dangchay', 'muallai'], OLD = ['nhan301', 'dangchay', 'muallai'];
  const QUESTIONS = [
    { id: 'a1', sec: 'Tổng quan', types: ALL, req: true, label: 'Mục tiêu kinh doanh của website là gì?', help: 'VD: kéo người chơi đăng ký nhà cái X qua link; xây thương hiệu; bán dịch vụ…' },
    { id: 'a2', sec: 'Tổng quan', types: ALL, req: true, label: 'Mục tiêu SEO cụ thể?', help: 'Muốn lên top từ khóa nào, đạt bao nhiêu traffic, trong bao lâu.' },
    { id: 'a3', sec: 'Tổng quan', types: ALL, req: true, label: 'Ngách / chủ đề chính, thị trường và ngôn ngữ?', help: 'VD: cá cược bóng đá — Việt Nam — tiếng Việt.' },
    { id: 'a4', sec: 'Tổng quan', types: ALL, req: true, label: 'Đối tượng người dùng mục tiêu là ai?', help: 'Độ tuổi, nhu cầu, mức hiểu biết, họ thường tìm gì trên Google.' },
    { id: 'a5', sec: 'Tổng quan', types: ALL, label: 'Hành động chuyển đổi chính trên site?', help: 'VD: bấm link đăng ký, nạp tiền, để lại số điện thoại, đọc bài…' },
    { id: 'b1', sec: 'Đối thủ & từ khóa', types: ALL, label: 'Đối thủ cạnh tranh chính?', help: 'Mỗi dòng 1 domain. Bấm "Gợi ý từ Google" để lấy các domain đang đứng top từ khóa mục tiêu (tốn 1 credit Serper).', suggest: true },
    { id: 'b2', sec: 'Đối thủ & từ khóa', types: ALL, req: true, label: 'Từ khóa mục tiêu?', help: 'Mỗi dòng 1 từ khóa, quan trọng nhất ở trên.' },
    { id: 'b3', sec: 'Đối thủ & từ khóa', types: OLD, label: 'Từ khóa đang có traffic / đang top?', help: 'Có thể để trống nếu đã kết nối GSC — chuyên gia tự đọc số liệu.' },
    { id: 'c1', sec: 'Lịch sử', types: ['nhan301'], req: true, label: 'Thông tin 301: từ domain nào, ngày nào, vì sao?', help: 'Đã điền sẵn chuỗi domain từ dashboard — bổ sung lý do (bị chặn nhà mạng, dính án phạt, đổi thương hiệu…).' },
    { id: 'c2', sec: 'Lịch sử', types: OLD, label: 'Những thay đổi lớn đã làm trên site?', help: 'Đổi theme, đổi cấu trúc URL, xoá hàng loạt bài, đổi plugin SEO, đổi domain… kèm thời điểm.' },
    { id: 'c3', sec: 'Lịch sử', types: OLD, label: 'Đã từng gặp án phạt / sự cố với Google chưa?', help: 'Manual action, tụt hạng mạnh sau core update, mất index hàng loạt… kèm thời điểm.' },
    { id: 'c4', sec: 'Lịch sử', types: ['muallai'], req: true, label: 'Lịch sử domain đã biết?', help: 'Trước đây domain dùng làm gì, có từng làm PBN / spam không, mua từ đâu, lúc nào.' },
    // Site đang chạy: d1/d3 là HIỆN TRẠNG để chuyên gia đánh giá. Site mới: chuyên gia tự lập chiến lược + kiến trúc
    // từ báo cáo và nghiên cứu Google -> chỉ hỏi NGUỒN LỰC (d6) để kế hoạch vừa sức.
    { id: 'd1', sec: 'Chiến lược', types: OLD, req: true, label: 'Chiến lược nội dung đang làm?', help: 'Số bài mỗi tuần, dạng bài, ai viết, có dùng AI / SEO Writer không. Chuyên gia sẽ đánh giá và đề xuất cải thiện.' },
    { id: 'd6', sec: 'Chiến lược', types: ['moi'], req: true, label: 'Nguồn lực làm nội dung?', help: 'Mỗi tuần làm được bao nhiêu bài, ai viết, có dùng SEO Writer không. Chuyên gia tự lập chiến lược nội dung và kiến trúc site — bạn chỉ cho biết nguồn lực để kế hoạch vừa sức.' },
    { id: 'd2', sec: 'Chiến lược', types: ALL, label: 'Chiến lược backlink / 301 / PBN đang dùng?', help: 'Để trống nếu chưa làm.' },
    { id: 'd3', sec: 'Chiến lược', types: OLD, label: 'Kiến trúc site / các danh mục hiện tại?', help: 'Danh mục chính, trang trụ cột, cách liên kết giữa các bài. Chuyên gia sẽ đánh giá.' },
    { id: 'd4', sec: 'Chiến lược', types: ALL, label: 'Ràng buộc: điều chuyên gia KHÔNG được đề xuất?', help: 'VD: không đổi domain, không xoá bài cũ, không nhắc tên thương hiệu khác…' },
    { id: 'd5', sec: 'Chiến lược', types: ALL, label: 'Ghi chú khác cho chuyên gia?', help: 'Bất cứ điều gì chuyên gia cần biết để hiểu site.' },
  ];
  const COPYABLE = ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  const FILE_KINDS = ['GSC · Lập chỉ mục trang', 'GSC · Crawl stats', 'GSC · Hiệu suất', 'GSC · Trải nghiệm / CWV', 'GA4', 'Khác'];

  function sxSteps(type) {
    const st = [{ k: 'type' }];
    if (!type) return st;
    QUESTIONS.filter(x => x.types.includes(type)).forEach(x => st.push({ k: 'q', q: x }));
    if (type !== 'moi') st.push({ k: 'files' });
    st.push({ k: 'auto' }, { k: 'gen' });
    return st;
  }

  // Gợi ý đối thủ: Serper top 10 cho từ khóa mục tiêu, loại các domain trong mạng site của mình
  async function sxSuggestCompetitors(kw) {
    if (typeof wtApiKey === 'undefined' || !wtApiKey) throw new Error('Chưa có Serper API Key (thiết lập ở Theo dõi web)');
    const r = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': wtApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: kw, gl: 'vn', hl: 'vi', num: 10 }) });
    const d = await r.json();
    if (d.message === 'Unauthorized.' || d.statusCode === 403) throw new Error('Serper API Key sai hoặc hết lượt');
    try { wtSerperCredits = Math.max(0, wtSerperCredits - (d.credits || 1)); localStorage.setItem('wt_serper_credits_left', wtSerperCredits); } catch (e) {}
    const own = new Set((typeof websites !== 'undefined' ? websites : []).map(w => wstNormalizeUrl(w.url || '').split('/')[0]).filter(Boolean));
    return (d.organic || []).map((o, i) => {
      let h = ''; try { h = new URL(o.link).hostname.replace(/^www\./, ''); } catch (e) {}
      return { host: h, pos: o.position || i + 1, own: own.has(h) };
    }).filter(x => x.host);
  }

  // Nghiên cứu Google cho SITE MỚI (chuyên gia tự lập chiến lược nội dung + kiến trúc): mỗi từ khóa mục tiêu
  // (tối đa 5, 1 credit Serper/từ) -> top 10 (đánh dấu site trong mạng), "Mọi người cũng hỏi", tìm kiếm liên quan.
  async function sxResearch(keywords, progress) {
    if (typeof wtApiKey === 'undefined' || !wtApiKey) throw new Error('Chưa có Serper API Key');
    const own = new Set((typeof websites !== 'undefined' ? websites : []).map(w => wstNormalizeUrl(w.url || '').split('/')[0]).filter(Boolean));
    const out = [];
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      if (progress) progress(`🔍 Nghiên cứu Google ${i + 1}/${keywords.length}: "${kw}"…`);
      const r = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': wtApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: kw, gl: 'vn', hl: 'vi', num: 10 }) });
      const d = await r.json();
      if (d.message === 'Unauthorized.' || d.statusCode === 403) throw new Error('Serper API Key sai hoặc hết lượt');
      try { wtSerperCredits = Math.max(0, wtSerperCredits - (d.credits || 1)); localStorage.setItem('wt_serper_credits_left', wtSerperCredits); } catch (e) {}
      const L = [`### Từ khóa "${kw}"`, 'Top kết quả:'];
      (d.organic || []).slice(0, 10).forEach((o, k) => {
        let h = ''; try { h = new URL(o.link).hostname.replace(/^www\./, ''); } catch (e) {}
        L.push(`${o.position || k + 1}. ${h}${own.has(h) ? ' (SITE TRONG MẠNG CỦA MÌNH)' : ''} — ${clip(o.title, 90)} — ${clip(o.snippet, 140)}`);
      });
      if ((d.peopleAlsoAsk || []).length) L.push('Mọi người cũng hỏi: ' + d.peopleAlsoAsk.map(x => clip(x.question, 100)).join(' | '));
      if ((d.relatedSearches || []).length) L.push('Tìm kiếm liên quan: ' + d.relatedSearches.map(x => x.query).join(', '));
      out.push(L.join('\n'));
    }
    return out.join('\n\n');
  }

  // Đọc file CSV xuất từ Google Keyword Planner: UTF-16 LE/BE (mặc định của Google) hoặc UTF-8; tab hoặc dấu phẩy;
  // tiêu đề cột tiếng Anh hoặc tiếng Việt; bỏ các dòng mô tả phía trên dòng tiêu đề.
  async function sxParseKeywordPlanner(file) {
    if (!file) throw new Error('Chưa chọn file');
    const buf = new Uint8Array(await file.arrayBuffer());
    const enc = buf[0] === 0xFF && buf[1] === 0xFE ? 'utf-16le' : buf[0] === 0xFE && buf[1] === 0xFF ? 'utf-16be' : 'utf-8';
    const text = new TextDecoder(enc).decode(buf).replace(/^﻿/, '');
    const lines = text.split(/\r?\n/);
    const hi = lines.findIndex(l => /^"?(keyword|từ khóa|từ khoá)"?[\t,]/i.test(l.trim()));
    if (hi < 0) throw new Error('Không thấy dòng tiêu đề có cột "Keyword" / "Từ khóa" — file có phải xuất từ Keyword Planner?');
    const delim = lines[hi].includes('\t') ? '\t' : ',';
    const split = l => {                                    // tách 1 dòng CSV có dấu ngoặc kép
      const out = []; let cur = '', qt = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (qt && l[i + 1] === '"') { cur += '"'; i++; } else qt = !qt; }
        else if (ch === delim && !qt) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur); return out.map(x => x.trim());
    };
    const H = split(lines[hi]).map(h => h.toLowerCase());
    const col = re => H.findIndex(h => re.test(h));
    const cK = col(/^(keyword|từ khóa|từ khoá)$/), cV = col(/avg\.? monthly searches|trung bình.*tìm kiếm|số lượt tìm kiếm/);
    const cC = col(/^(competition|mức độ cạnh tranh|cạnh tranh)$/), cI = col(/competition \(indexed value\)|chỉ số cạnh tranh/);
    if (cK < 0 || cV < 0) throw new Error('Thiếu cột từ khóa hoặc cột lượng tìm kiếm trung bình hàng tháng');
    const numOf = v => {                                    // "5000" | "5.000" | "1K – 10K" (lấy cận dưới) | ""
      const m = String(v || '').replace(/\s/g, '').match(/([\d.,]+)\s*([kKmM]?)/);
      if (!m) return 0;
      const n = parseFloat(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || 0;
      return Math.round(n * (/k/i.test(m[2]) ? 1000 : /m/i.test(m[2]) ? 1e6 : 1));
    };
    const out = [];
    for (let i = hi + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const c = split(lines[i]);
      const kw = (c[cK] || '').trim();
      if (!kw) continue;
      out.push({ kw, vol: numOf(c[cV]), comp: cC >= 0 ? c[cC] : '', comp_idx: cI >= 0 ? numOf(c[cI]) : 0 });
    }
    if (!out.length) throw new Error('File không có từ khóa nào');
    return out;
  }

  function sxReadFile(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => rej(new Error('Không đọc được file')); fr.readAsText(file, 'utf-8'); });
  }

  window.sxSiteMount = function (panel, wsId) {
    if (!panel) return;
    if (panel.dataset.sxWs === String(wsId)) return;          // đã gắn cho site này
    panel.dataset.sxWs = String(wsId);
    panel.style.padding = '0';
    const cid = 'ws' + String(wsId).replace(/\D/g, '');
    const s = { busy: false, diag: null, integ: {}, answers: {}, type: '', step: 0, mode: 'loading' };
    panel.innerHTML = `<div class="sx-site">
      <div class="sx-site-head">
        <div class="sx-site-t">🧠 Chuyên gia SEO phụ trách site này <span class="sx-sub sx-site-sub"></span></div>
        <div class="sx-head-actions">
          <button class="sx-btn sx-prof" hidden title="Xem / sửa hồ sơ và báo cáo tích hợp đã xác nhận">🧩 Hồ sơ tích hợp</button>
          <button class="sx-btn sx-btn-primary sx-planbtn" hidden title="Bước 2: lập kế hoạch nội dung từ file Keyword Planner, khung = hồ sơ tích hợp">📐 Lập kế hoạch</button>
          <button class="sx-btn sx-diag" title="Đọc robots.txt, sitemap, noindex, canonical, link nội bộ, Google URL Inspection của các bài chưa index">🔎 Chẩn đoán index</button>
          <button class="sx-btn sx-ctx">📋 Dữ liệu chuyên gia đọc</button>
          <button class="sx-btn sx-reset" hidden title="Xoá tin nhắn của site này (giữ hồ sơ tích hợp và báo cáo chẩn đoán)">🗑 Làm mới</button>
        </div>
      </div>
      <div class="sx-integ-bar" hidden></div>
      <div class="sx-diag-bar" hidden></div>
      <div class="sx-diag-box sx-msg-ai" hidden></div>
      <pre class="sx-ctx-box" hidden></pre>
      <div class="sx-msgs"></div>
      <div class="sx-input" hidden><textarea rows="1" placeholder="Hỏi về site này… (Enter gửi, Shift+Enter xuống dòng)"></textarea><button class="sx-btn sx-btn-primary sx-send">Gửi</button></div>
      <div class="sx-bar" hidden></div>
    </div>`;
    const q = sel => panel.querySelector(sel);
    const msgs = q('.sx-msgs'), ta = q('textarea'), btn = q('.sx-send'), ctxBox = q('.sx-ctx-box'), inputBar = q('.sx-input'), bar = q('.sx-bar');
    const diagBar = q('.sx-diag-bar'), diagBox = q('.sx-diag-box'), diagBtn = q('.sx-diag');
    const unlocked = () => !!(s.integ && s.integ.confirmed_report);
    let ctxTitle = '';
    const title = async () => ctxTitle || (ctxTitle = (await sxSiteContext(wsId)).title || cid);

    function showDiagBar(msg) {
      diagBar.hidden = false;
      if (msg) { diagBar.textContent = msg; return; }
      if (!s.diag) { diagBar.hidden = true; return; }
      diagBar.innerHTML = `🔎 Chẩn đoán index gần nhất: <b>${esc(s.diag.at)}</b> — chuyên gia tự đọc báo cáo này · <a href="#" class="sx-diag-view">${diagBox.hidden ? 'Xem báo cáo' : 'Ẩn báo cáo'}</a>`;
      diagBar.querySelector('.sx-diag-view').onclick = e => {
        e.preventDefault();
        diagBox.hidden = !diagBox.hidden;
        if (!diagBox.hidden) diagBox.innerHTML = renderMd(s.diag.text, []);
        showDiagBar();
      };
    }
    const size = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden'; };
    const bottom = () => { msgs.scrollTop = msgs.scrollHeight; };
    const setBar = html => { inputBar.hidden = true; bar.hidden = false; bar.innerHTML = html; };
    const integBar = q('.sx-integ-bar');
    // Dải trạng thái tích hợp: luôn hiện khi đã xác nhận, 1 bấm để xem hồ sơ / quay lại hội thoại
    function showIntegBar() {
      if (!unlocked()) { integBar.hidden = true; return; }
      integBar.hidden = false;
      const inReview = s.mode === 'review';
      integBar.innerHTML = `🧩 Chuyên gia đã tích hợp · hồ sơ xác nhận lúc <b>${esc(s.integ.confirmed_at || '?')}</b>
        ${s.integ.status && s.integ.status !== 'confirmed' ? ' · <span class="sx-warn">có thay đổi chưa xác nhận lại</span>' : ''}
        · <a href="#" class="sx-integ-link">${inReview ? '↩ Về hội thoại' : '📑 Xem hồ sơ tích hợp'}</a>`;
      integBar.querySelector('.sx-integ-link').onclick = e => { e.preventDefault(); if (s.busy) return; inReview ? enterChat() : renderReview(); };
    }
    const setHeadButtons = () => {
      q('.sx-prof').hidden = !unlocked(); q('.sx-planbtn').hidden = !unlocked();
      q('.sx-reset').hidden = !(unlocked() && s.mode === 'chat');
      if (s.mode !== 'plan' && s.planTimer) { clearInterval(s.planTimer); s.planTimer = null; }
      showIntegBar();
    };
    async function saveDraft() {
      s.integ = await api('integration/' + cid, { method: 'POST', body: JSON.stringify({ site_title: await title(), type: s.type, answers: s.answers }) });
    }

    // ── 1) CỔNG KHOÁ: chưa tích hợp -> nút thay chỗ ô chat ──
    function renderGate() {
      s.mode = 'gate'; setHeadButtons();
      const st = s.integ.status || '';
      const steps = sxSteps(s.type), done = QUESTIONS.filter(x => (s.answers[x.id] || '').trim()).length;
      msgs.innerHTML = `<div class="sx-welcome sx-gate">
        <div class="sx-welcome-t">🔒 Chuyên gia chưa được tích hợp với website này</div>
        Để chuyên gia hiểu site từ GỐC (mục tiêu, đối tượng, đối thủ, lịch sử, chiến lược) thay vì chỉ nhìn số liệu bề nổi,
        bạn trả lời vài câu hỏi, tải file Search Console (nếu có). Chuyên gia tự kiểm tra kỹ thuật rồi viết <b>báo cáo tích hợp</b> để bạn xác nhận.
        Xác nhận xong mới mở hỏi đáp.
        ${st === 'review' ? '<div class="sx-gate-note">📑 Báo cáo tích hợp đã tạo — đang chờ bạn xác nhận.</div>' :
          (s.type ? `<div class="sx-gate-note">✍️ Đã lưu nháp: ${done} câu trả lời${(s.integ.files || []).length ? ', ' + s.integ.files.length + ' file' : ''}.</div>` : '')}
      </div>`;
      const label = st === 'review' ? '📑 Xem & xác nhận báo cáo tích hợp' : s.type ? `🧩 Tiếp tục tích hợp chuyên gia AI` : '🧩 Tích hợp chuyên gia AI';
      setBar(`<button class="sx-btn sx-btn-primary sx-cta">${label}</button>`);
      bar.querySelector('.sx-cta').onclick = () => st === 'review' ? renderReview() : renderStep(s.type ? Math.min(s.step || 1, steps.length - 1) : 0);
    }

    // ── 2) FORM TỪNG CÂU ──
    function navHtml(i, n, nextLabel) {
      const known = n > 1;                       // chưa chọn loại site thì chưa biết tổng số bước
      return `<div class="sx-nav-l">${i > 0 ? '<button class="sx-btn sx-back">← Quay lại</button>' : '<button class="sx-btn sx-exit">✕ Để sau</button>'}</div>
        <div class="sx-progress"><div style="width:${known ? Math.round((i + 1) * 100 / n) : 3}%"></div></div>
        <div class="sx-nav-r"><span class="sx-sub">${known ? `Bước ${i + 1}/${n}` : 'Bắt đầu'}</span><button class="sx-btn sx-btn-primary sx-next">${nextLabel || 'Tiếp →'}</button></div>`;
    }
    function bindNav(i, onNext) {
      const b = bar.querySelector('.sx-back'), x = bar.querySelector('.sx-exit');
      if (b) b.onclick = () => renderStep(i - 1);
      if (x) x.onclick = () => (unlocked() ? enterChat() : renderGate());
      bar.querySelector('.sx-next').onclick = onNext;
    }
    async function renderStep(i) {
      s.mode = 'form'; setHeadButtons();
      const steps = sxSteps(s.type);
      i = Math.max(0, Math.min(i, steps.length - 1));
      s.step = i;
      const stp = steps[i], n = steps.length;
      if (stp.k === 'type') return renderTypeStep(i, n);
      if (stp.k === 'q') return renderQuestion(i, n, stp.q);
      if (stp.k === 'files') return renderFiles(i, n);
      if (stp.k === 'auto') return renderAuto(i, n);
      if (stp.k === 'gen') return renderGen(i, n);
    }

    function renderTypeStep(i, n) {
      msgs.innerHTML = `<div class="sx-form">
        <div class="sx-form-sec">Bắt đầu</div>
        <div class="sx-form-q">Website này thuộc loại nào?</div>
        <div class="sx-form-help">Câu trả lời quyết định bộ câu hỏi và loại báo cáo chuyên gia sẽ viết.</div>
        <div class="sx-types">${SITE_TYPES.map(([k, lb, d]) => `<label class="sx-type${s.type === k ? ' on' : ''}"><input type="radio" name="sxtype-${cid}" value="${k}" ${s.type === k ? 'checked' : ''}><b>${lb}</b><span>${d}</span></label>`).join('')}</div>
        <div class="sx-copy"><a href="#" class="sx-copy-link">📋 Sao chép câu trả lời từ hồ sơ site khác</a><div class="sx-copy-box" hidden></div></div>
      </div>`;
      msgs.querySelectorAll('.sx-type input').forEach(r => r.onchange = () => {
        s.type = r.value;
        msgs.querySelectorAll('.sx-type').forEach(l => l.classList.toggle('on', l.contains(r)));
      });
      msgs.querySelector('.sx-copy-link').onclick = async e => {
        e.preventDefault();
        const box = msgs.querySelector('.sx-copy-box');
        box.hidden = false; box.textContent = 'Đang tải danh sách…';
        try {
          const sites = ((await api('integlist')).sites || []).filter(x => x.id !== cid);
          if (!sites.length) { box.textContent = 'Chưa có site nào có hồ sơ tích hợp.'; return; }
          box.innerHTML = `<select class="sx-sel">${sites.map((x, k) => `<option value="${k}">${esc(x.title)}${x.status === 'confirmed' ? ' ✅' : ''}</option>`).join('')}</select>
            <button class="sx-btn sx-copy-go">Sao chép</button><div class="sx-sub">Chỉ chép phần Tổng quan, Đối thủ, Từ khóa mục tiêu, Chiến lược — KHÔNG chép Lịch sử và file.</div>`;
          box.querySelector('.sx-copy-go').onclick = async () => {
            const src = sites[Number(box.querySelector('.sx-sel').value)];
            COPYABLE.forEach(k => { if (src.answers[k]) s.answers[k] = src.answers[k]; });
            if (!s.type && src.type) s.type = src.type;
            await saveDraft();
            box.innerHTML = `✅ Đã chép từ <b>${esc(src.title)}</b> — kiểm tra và sửa lại ở các câu tiếp theo.`;
            renderStep(0);
          };
        } catch (err) { box.textContent = '⚠️ ' + err.message; }
      };
      setBar(navHtml(i, n));
      bindNav(i, async () => {
        if (!s.type) { alert('Chọn loại website trước.'); return; }
        await saveDraft();
        renderStep(1);
      });
    }

    function prefill(qid) {
      const w = websites.find(x => x.id === wsId);
      const site = (typeof getWstSite === 'function' && getWstSite(wsId)) || {};
      if (qid === 'b2') return site.mainKeyword || (w && w.brand) || '';
      if (qid === 'c1' && w) {
        const ch = sx301Chain(w);
        const cmds = (site.redirectCommands || []).map(c => `${c.createdAt || c.dateText}: → ${c.destUrl} [${c.status}]`).join('; ');
        return (ch.length > 1 ? 'Chuỗi domain (cũ → mới): ' + ch.map(x => x.url).join(' → ') : '') + (cmds ? '\nLệnh 301: ' + cmds : '') + '\nLý do: ';
      }
      return '';
    }

    function renderQuestion(i, n, qq) {
      if (!(s.answers[qq.id] || '').trim()) { const p = prefill(qq.id); if (p) s.answers[qq.id] = p; }
      msgs.innerHTML = `<div class="sx-form">
        <div class="sx-form-sec">${esc(qq.sec)}</div>
        <div class="sx-form-q">${esc(qq.label)} ${qq.req ? '<span class="sx-req">*</span>' : '<span class="sx-sub">(không bắt buộc)</span>'}</div>
        <div class="sx-form-help">${esc(qq.help)}</div>
        <textarea class="sx-form-ta" rows="6">${esc(s.answers[qq.id] || '')}</textarea>
        ${qq.suggest ? '<div><button class="sx-btn sx-sugg">🔍 Gợi ý từ Google</button> <span class="sx-sub sx-sugg-msg"></span></div>' : ''}
      </div>`;
      const fta = msgs.querySelector('.sx-form-ta');
      fta.focus();
      if (qq.suggest) msgs.querySelector('.sx-sugg').onclick = async () => {
        const kw = ((s.answers.b2 || prefill('b2')).split('\n')[0] || '').trim();
        const m = msgs.querySelector('.sx-sugg-msg');
        if (!kw) { m.textContent = 'Chưa có từ khóa mục tiêu.'; return; }
        m.textContent = `Đang tìm "${kw}"…`;
        try {
          const rows = await sxSuggestCompetitors(kw);
          const have = new Set(fta.value.split('\n').map(x => x.trim().split(/\s/)[0]).filter(Boolean));
          const add = rows.filter(x => !x.own && !have.has(x.host)).map(x => `${x.host}  (top ${x.pos} "${kw}")`);
          fta.value = (fta.value.trim() ? fta.value.trim() + '\n' : '') + add.join('\n');
          const own = rows.filter(x => x.own).map(x => x.host);
          m.textContent = `Đã thêm ${add.length} domain.` + (own.length ? ` Bỏ qua site của mình: ${own.join(', ')}` : '') + ' Xoá bớt những domain không phải đối thủ.';
        } catch (err) { m.textContent = '⚠️ ' + err.message; }
      };
      setBar(navHtml(i, n));
      bindNav(i, async () => {
        s.answers[qq.id] = fta.value.trim();
        if (qq.req && !s.answers[qq.id]) { fta.classList.add('sx-invalid'); fta.focus(); return; }
        await saveDraft();
        renderStep(i + 1);
      });
    }

    function renderFiles(i, n) {
      const files = s.integ.files || [];
      msgs.innerHTML = `<div class="sx-form">
        <div class="sx-form-sec">File dữ liệu</div>
        <div class="sx-form-q">Tải file Search Console / GA4 <span class="sx-sub">(không bắt buộc, nên có)</span></div>
        <div class="sx-form-help">Những báo cáo Google KHÔNG có API: <b>Lập chỉ mục trang</b>, <b>Crawl stats</b> (Cài đặt → Thống kê thu thập dữ liệu), <b>Hiệu suất</b>.
          Trong GSC bấm "Xuất" → "Tải xuống CSV" → giải nén file ZIP → tải lên các file .csv bên trong. Chuyên gia đọc và tóm tắt 1 lần.</div>
        <div class="sx-up"><select class="sx-sel sx-kind">${FILE_KINDS.map(k => `<option>${k}</option>`).join('')}</select>
          <input type="file" class="sx-file" multiple accept=".csv,.tsv,.txt,.json"><span class="sx-sub sx-up-msg"></span></div>
        <div class="sx-files">${files.length ? files.map(f => `<details class="sx-filei"><summary>📄 <b>${esc(f.name)}</b> · ${num(f.size)} ký tự · ${esc(f.at || '')} <a href="#" class="sx-frm" data-n="${esc(f.name)}">xoá</a></summary><div class="sx-fdig">${renderMd(f.digest || '', [])}</div></details>`).join('') : '<div class="sx-sub">Chưa có file nào.</div>'}</div>
      </div>`;
      msgs.querySelectorAll('.sx-frm').forEach(a => a.onclick = async e => {
        e.preventDefault();
        s.integ = await api('integfile/' + cid, { method: 'POST', body: JSON.stringify({ name: a.dataset.n, remove: true }) });
        renderFiles(i, n);
      });
      msgs.querySelector('.sx-file').onchange = async e => {
        const m = msgs.querySelector('.sx-up-msg'), kind = msgs.querySelector('.sx-kind').value;
        for (const f of Array.from(e.target.files || [])) {
          m.textContent = `Đang đọc & tóm tắt ${f.name}…`;
          try {
            let text = await sxReadFile(f);
            if (text.length > 400000) text = text.slice(0, 400000);
            s.integ = await api('integfile/' + cid, { method: 'POST', body: JSON.stringify({ site_title: await title(), name: `${kind} — ${f.name}`, text }) });
          } catch (err) { m.textContent = `⚠️ ${f.name}: ${err.message}`; return; }
        }
        renderFiles(i, n);
      };
      setBar(navHtml(i, n));
      bindNav(i, () => renderStep(i + 1));
    }

    function renderAuto(i, n) {
      const d = s.diag;
      const quick = d ? ((d.text.split('### Phát hiện nhanh')[1] || '').split('\n### ')[0] || '').trim() : '';
      msgs.innerHTML = `<div class="sx-form">
        <div class="sx-form-sec">Kiểm tra kỹ thuật tự động</div>
        <div class="sx-form-q">Chuyên gia tự đọc site từ bên ngoài (như Googlebot)</div>
        <div class="sx-form-help">robots.txt, sitemap, noindex, canonical, link nội bộ, dữ liệu có cấu trúc, trang chủ, bài mẫu, Google URL Inspection (nếu đang đăng nhập GSC). Không đăng nhập hay sửa gì trên WordPress.</div>
        ${d ? `<div class="sx-auto-ok">✅ Đã có kết quả kiểm tra lúc <b>${esc(d.at)}</b>${quick ? renderMd('**Phát hiện nhanh**\n' + quick, []) : ''}</div>` : '<div class="sx-sub">Chưa chạy kiểm tra. Nên chạy để báo cáo có phần kỹ thuật chính xác.</div>'}
        <button class="sx-btn sx-btn-primary sx-run">${d ? '↺ Chạy lại kiểm tra' : '▶ Chạy kiểm tra kỹ thuật'}</button> <span class="sx-sub sx-run-msg"></span>
      </div>`;
      msgs.querySelector('.sx-run').onclick = async () => {
        const m = msgs.querySelector('.sx-run-msg'), b = msgs.querySelector('.sx-run');
        b.disabled = true;
        try { await runDiagnosis(t => { m.textContent = t; }); renderAuto(i, n); }
        catch (err) { m.textContent = '⚠️ ' + err.message; b.disabled = false; }
      };
      setBar(navHtml(i, n));
      bindNav(i, () => { if (!s.diag && !confirm('Chưa chạy kiểm tra kỹ thuật — báo cáo sẽ thiếu phần kỹ thuật. Vẫn tiếp tục?')) return; renderStep(i + 1); });
    }

    // từ khóa để nghiên cứu Google (site mới): các dòng của câu "Từ khóa mục tiêu", tối đa 5
    const researchKws = () => (s.answers.b2 || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 5);

    function renderGen(i, n) {
      const tlabel = (SITE_TYPES.find(x => x[0] === s.type) || [, s.type])[1];
      const qs = QUESTIONS.filter(x => x.types.includes(s.type));
      msgs.innerHTML = `<div class="sx-form">
        <div class="sx-form-sec">Tổng hợp</div>
        <div class="sx-form-q">Kiểm tra lại rồi tạo báo cáo tích hợp</div>
        <div class="sx-sum"><div><b>Loại website:</b> ${esc(tlabel)}</div>
          ${qs.map(x => `<div><b>${esc(x.label)}</b> ${s.answers[x.id] ? esc(clip(s.answers[x.id], 220)) : '<span class="sx-sub">— bỏ trống —</span>'}</div>`).join('')}
          <div><b>File:</b> ${(s.integ.files || []).map(f => esc(f.name)).join(', ') || '<span class="sx-sub">không có</span>'}</div>
          <div><b>Kiểm tra kỹ thuật:</b> ${s.diag ? 'có (' + esc(s.diag.at) + ')' : '<span class="sx-sub">chưa chạy</span>'}</div></div>
        ${s.type === 'moi'
          ? `<div class="sx-form-help">Site mới: chuyên gia <b>tự lập chiến lược nội dung và kiến trúc site</b>. Trước khi viết, hệ thống nghiên cứu Google cho ${researchKws().length} từ khóa mục tiêu (${researchKws().length} credit Serper): ai đang top, dạng bài, câu hỏi người dùng hay tìm.<br>
             Báo cáo gồm: Tổng quan · Checklist kỹ thuật trước khi index · Nghiên cứu đối thủ & từ khóa · Chiến lược nội dung, cây danh mục, 30 bài đầu tiên, liên kết nội bộ, lịch 30/60/90 ngày · Vấn đề & lộ trình (khoảng 1–2 phút).</div>`
          : '<div class="sx-form-help">Chuyên gia sẽ viết báo cáo: Tổng quan · Phân tích kỹ thuật · Nội dung · Hiệu suất · Vấn đề & đề xuất & lộ trình · Thông tin còn thiếu (khoảng 30–90 giây).</div>'}
        <span class="sx-sub sx-gen-msg"></span>
      </div>`;
      setBar(navHtml(i, n, '✨ Tạo báo cáo tích hợp'));
      bindNav(i, async () => {
        const b = bar.querySelector('.sx-next'), m = msgs.querySelector('.sx-gen-msg');
        b.disabled = true;
        try {
          let research = '';
          if (s.type === 'moi' && researchKws().length) {
            try { research = await sxResearch(researchKws(), t => { m.textContent = t; }); }
            catch (err) { research = ''; m.textContent = '⚠️ Không nghiên cứu được Google (' + err.message + ') — vẫn tạo báo cáo.'; }
          }
          m.textContent = '⏳ Chuyên gia đang đọc toàn bộ dữ liệu và viết báo cáo…';
          const ctx = await sxSiteContext(wsId);
          s.integ = await api('integgen/' + cid, { method: 'POST', body: JSON.stringify({ site_title: ctx.title, site_context: ctx.text, research }) });
          renderReview();
        } catch (err) { m.textContent = '⚠️ ' + err.message; b.disabled = false; }
      });
    }

    // ── 3) XEM & XÁC NHẬN BÁO CÁO ──
    function renderReview(editing) {
      s.mode = 'review'; setHeadButtons();
      const it = s.integ || {}, rep = it.report || '';
      const isConfirmedView = it.status === 'confirmed' && rep.trim() === (it.confirmed_report || '').trim();
      msgs.innerHTML = `<div class="sx-report">
        <div class="sx-report-h">📑 Báo cáo tích hợp · tạo lúc ${esc(it.generated_at || '?')}${it.confirmed_at ? ' · xác nhận lúc ' + esc(it.confirmed_at) : ''}</div>
        ${editing ? `<textarea class="sx-report-ta">${esc(rep)}</textarea>` : `<div class="sx-msg-ai sx-report-body">${renderMd(rep, it.sources || [])}${sourcesHtml((it.sources || []).filter(x => new RegExp('\\[' + x.n + '\\]').test(rep)))}</div>`}
      </div>`;
      msgs.scrollTop = 0;
      if (editing) {
        setBar(`<div class="sx-nav-l"><button class="sx-btn sx-cancel">Huỷ</button></div><div class="sx-nav-r"><button class="sx-btn sx-btn-primary sx-save">💾 Lưu nội dung sửa</button></div>`);
        bar.querySelector('.sx-cancel').onclick = () => renderReview(false);
        bar.querySelector('.sx-save').onclick = () => { s.integ.report = msgs.querySelector('.sx-report-ta').value; renderReview(false); };
        return;
      }
      setBar(`<div class="sx-nav-l">
          ${unlocked() ? '<button class="sx-btn sx-tochat">↩ Về hội thoại</button>' : ''}
          <button class="sx-btn sx-editform">← Sửa câu trả lời form</button>
          <button class="sx-btn sx-editrep">✏️ Sửa báo cáo</button>
          <button class="sx-btn sx-regen">↺ Tạo lại</button></div>
        <div class="sx-nav-r"><span class="sx-sub sx-rv-msg"></span>${isConfirmedView ? '<span class="sx-ok">✅ Đang dùng làm gốc</span>' : '<button class="sx-btn sx-btn-primary sx-confirm">✅ Xác nhận — chuyên gia đã hiểu đúng</button>'}</div>`);
      const tc = bar.querySelector('.sx-tochat'); if (tc) tc.onclick = enterChat;
      bar.querySelector('.sx-editform').onclick = () => renderStep(1);
      bar.querySelector('.sx-editrep').onclick = () => renderReview(true);
      bar.querySelector('.sx-regen').onclick = async () => {
        if (!confirm('Tạo lại báo cáo từ dữ liệu hiện tại? (Nội dung đã sửa tay trong báo cáo sẽ mất.)')) return;
        const m = bar.querySelector('.sx-rv-msg'); m.textContent = '⏳ Đang viết lại báo cáo…';
        try { const ctx = await sxSiteContext(wsId); s.integ = await api('integgen/' + cid, { method: 'POST', body: JSON.stringify({ site_title: ctx.title, site_context: ctx.text }) }); renderReview(); }
        catch (err) { m.textContent = '⚠️ ' + err.message; }
      };
      const cf = bar.querySelector('.sx-confirm');
      if (cf) cf.onclick = async () => {
        const m = bar.querySelector('.sx-rv-msg'); cf.disabled = true; m.textContent = 'Đang lưu…';
        try { s.integ = await api('integconfirm/' + cid, { method: 'POST', body: JSON.stringify({ report: s.integ.report }) }); enterChat(true); }
        catch (err) { m.textContent = '⚠️ ' + err.message; cf.disabled = false; }
      };
    }

    // ── 4) HỎI ĐÁP (chỉ khi đã xác nhận) ──
    function welcome() {
      msgs.innerHTML = `<div class="sx-welcome"><div class="sx-welcome-t">✅ Chuyên gia đã tích hợp với site này</div>
        Mỗi câu trả lời dựa trên hồ sơ tích hợp đã xác nhận + số liệu mới nhất của site.
        <div class="sx-chips">${SITE_SUGGEST.map(t => `<button class="sx-chip">${esc(t)}</button>`).join('')}</div></div>`;
      msgs.querySelectorAll('.sx-chip').forEach(b => { b.onclick = () => { ta.value = b.textContent; ask(); }; });
    }
    async function enterChat(justConfirmed) {
      s.mode = 'chat'; setHeadButtons();
      bar.hidden = true; inputBar.hidden = false;
      msgs.innerHTML = '<div class="sx-thinking">Đang tải…</div>';
      try {
        const c = await api('chats/' + cid);
        if (!(c.messages || []).length) welcome();
        else { msgs.innerHTML = (c.messages || []).map(msgHtml).join(''); bottom(); }
      } catch (e) { welcome(); }
      if (justConfirmed) msgs.insertAdjacentHTML('afterbegin', '<div class="sx-gate-note">✅ Đã xác nhận hồ sơ tích hợp — chuyên gia dùng báo cáo này làm gốc cho mọi câu trả lời.</div>');
      size(); ta.focus();
    }
    async function ask() {
      const text = ta.value.trim();
      if (!text || s.busy || !unlocked()) return;
      s.busy = true; btn.disabled = true;
      if (msgs.querySelector('.sx-welcome')) msgs.innerHTML = '';
      ta.value = ''; size();
      msgs.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', content: text }));
      const pending = document.createElement('div');
      pending.className = 'sx-msg sx-msg-ai sx-thinking';
      pending.textContent = '📊 Đang đọc hồ sơ site + số liệu mới + tài liệu Google…';
      msgs.appendChild(pending); bottom();
      try {
        const ctx = await sxSiteContext(wsId);
        ctxBox.textContent = ctx.text;
        const r = await api('chat', { method: 'POST', body: JSON.stringify({ message: text, chat_id: cid, site_title: ctx.title, site_context: ctx.text }) });
        pending.remove();
        msgs.insertAdjacentHTML('beforeend', msgHtml({ role: 'assistant', content: r.answer, sources: r.sources }));
      } catch (e) {
        pending.remove();
        msgs.insertAdjacentHTML('beforeend', `<div class="sx-err">⚠️ ${esc(e.message)}</div>`);
        ta.value = text; size();
      }
      s.busy = false; btn.disabled = false; bottom();
    }
    btn.onclick = ask;
    ta.addEventListener('input', size);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); } });

    // ── Chẩn đoán index (dùng cả trong form tích hợp lẫn khi đã tích hợp) ──
    async function runDiagnosis(progress) {
      const text = await sxDiagnose(wsId, m => { showDiagBar('⏳ ' + m); if (progress) progress('⏳ ' + m); });
      s.diag = await api('diagnosis/' + cid, { method: 'POST', body: JSON.stringify({ text, site_title: await title() }) });
      diagBox.hidden = true; showDiagBar();
      return text;
    }
    diagBtn.onclick = async () => {
      if (s.busy) return;
      if (!confirm('Chạy chẩn đoán index cho site này?\n\nĐọc robots.txt, sitemap, HTML của tối đa 10 bài (ưu tiên bài chưa index theo check Serper), link nội bộ, và Google URL Inspection nếu token GSC còn hạn. Không đăng nhập hay sửa gì trên WordPress. Mất khoảng 10–60 giây.')) return;
      s.busy = true; btn.disabled = true; diagBtn.disabled = true;
      try {
        const text = await runDiagnosis();
        if (s.mode === 'chat') {
          if (msgs.querySelector('.sx-welcome')) msgs.innerHTML = '';
          msgs.insertAdjacentHTML('beforeend', `<div class="sx-msg sx-msg-ai sx-diag-card"><div class="sx-welcome-t">🔎 Báo cáo chẩn đoán index</div>${renderMd(text, [])}
            <div class="sx-chips"><button class="sx-chip">Dựa vào báo cáo chẩn đoán, nguyên nhân chính khiến bài chưa index là gì và nên sửa gì trước?</button></div></div>`);
          const chip = msgs.querySelector('.sx-diag-card:last-child .sx-chip');
          if (chip) chip.onclick = () => { ta.value = chip.textContent; ask(); };
          bottom();
        } else if (s.mode === 'form' && sxSteps(s.type)[s.step] && sxSteps(s.type)[s.step].k === 'auto') renderStep(s.step);
      } catch (e) { showDiagBar('⚠️ Chẩn đoán lỗi: ' + e.message); }
      s.busy = false; btn.disabled = false; diagBtn.disabled = false;
    };
    q('.sx-ctx').onclick = async () => {
      if (!ctxBox.hidden) { ctxBox.hidden = true; return; }
      ctxBox.hidden = false; ctxBox.textContent = 'Đang gom dữ liệu…';
      ctxBox.textContent = ((await sxSiteContext(wsId)).text || 'Không tìm thấy dữ liệu site.') +
        (unlocked() ? `\n\n(+ Hồ sơ tích hợp đã xác nhận lúc ${s.integ.confirmed_at} — xem bằng nút 🧩 Hồ sơ tích hợp)` : '\n\n(Chưa có hồ sơ tích hợp)') +
        (s.diag ? `\n(+ Báo cáo chẩn đoán index lúc ${s.diag.at} — xem ở thanh 🔎 phía trên)` : '');
    };
    q('.sx-prof').onclick = () => { if (!s.busy) renderReview(); };
    q('.sx-planbtn').onclick = () => { if (!s.busy) renderPlan(); };

    // ══ BƯỚC 2 · LẬP KẾ HOẠCH TỪ KHÓA (khung = hồ sơ tích hợp; server: seo_expert_plan.py) ══
    const PLAN_COLS = [['STT', 'stt', 6], ['Tháng', 'month', 7], ['Mốc lộ trình', 'milestone', 14], ['Nguồn', 'src', 22],
      ['Silo (danh mục)', 'silo', 20], ['Nhóm bài con', 'sub', 26], ['Vai trò', 'role', 9], ['Dạng bài', 'type', 20],
      ['Từ khóa chính', 'main', 32], ['Từ khóa phụ (→ H2/H3)', 'child', 60], ['Tổng lượng TK cụm/tháng', 'vol', 12],
      ['Lượng TK từ khóa chính', 'main_vol', 11], ['Số từ khóa', 'n', 8], ['Search intent', 'intent', 11], ['Link về trụ cột', 'pillar', 32],
      ['Đối thủ trong hồ sơ đang top', 'comp', 26], ['Ghi chú', 'note', 50], ['Mã cụm', 'cid', 9], ['Trạng thái', null, 12], ['URL sau khi đăng', null, 30]];

    async function planLoad() { try { return await api('plan/' + cid); } catch (e) { return {}; } }

    async function renderPlan() {
      s.mode = 'plan'; setHeadButtons();
      msgs.innerHTML = '<div class="sx-thinking">Đang tải…</div>';
      const p = await planLoad();
      if (s.mode !== 'plan') return;
      if (p.running || p.status === 'running') return renderPlanRunning(p);
      if (p.status === 'done') return renderPlanDone();
      renderPlanFrame(p);
    }

    function frameHtml(f) {
      if (!f) return '';
      const silos = (f.silos || []).map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.pillar || '')}</td><td>${esc((x.subgroups || []).join(' · '))}</td></tr>`).join('');
      const pace = (f.pace || []).map(x => `<li><b>${esc(x.label || '')}</b>: ${x.count || 0} bài${(x.silos || []).length ? ' · ưu tiên ' + esc(x.silos.join(', ')) : ''}${(x.subgroups || []).length ? ' › ' + esc(x.subgroups.join(', ')) : ''}${x.note ? ' — <i>' + esc(x.note) + '</i>' : ''}</li>`).join('');
      const first = (f.first_articles || []).map((a, i) => `${i + 1}. ${esc(a.kw)} <span class="sx-sub">(${esc(a.silo)} · ${esc(a.type)})</span>`).join('<br>');
      return `${!(f.silos || []).length ? `<div class="sx-err">⚠️ Hồ sơ chưa có cây danh mục nên chưa lập được kế hoạch${f.missing ? ': ' + esc(f.missing) : ''}. Bổ sung câu "Kiến trúc site" trong form tích hợp rồi tạo lại và xác nhận báo cáo.</div>`
        : (f.missing ? `<div class="sx-sub">📝 Ghi chú của chuyên gia về hồ sơ: ${esc(f.missing)}</div>` : '')}
        <table class="sx-ftable"><thead><tr><th>Silo</th><th>Trụ cột</th><th>Nhóm bài con</th></tr></thead><tbody>${silos || '<tr><td colspan="3">Không có silo nào</td></tr>'}</tbody></table>
        <div><b>Dạng bài:</b> ${esc((f.types || []).join(', '))}</div>
        <div><b>Lộ trình:</b><ul>${pace || '<li>Hồ sơ không nêu mốc — xếp theo lượng tìm kiếm</li>'}</ul>Sau các mốc: <b>${f.monthly_after || '?'}</b> bài/tháng${f.short_head_later ? ' · từ khóa lớn (brand/model, short-head) làm sau' : ''}</div>
        <details><summary><b>${(f.first_articles || []).length} bài đầu tiên theo hồ sơ</b> (đặt đầu kế hoạch, đúng thứ tự)</summary><div class="sx-fdig">${first || 'Hồ sơ không có danh sách bài đầu'}</div></details>
        ${(f.tech_tasks || []).length ? `<div><b>Việc kỹ thuật trước khi xuất bản:</b><ul>${f.tech_tasks.map(t => `<li>${esc(t.task)} <span class="sx-sub">(${esc(t.source || '')})</span></li>`).join('')}</ul></div>` : ''}
        ${(f.competitors || []).length ? `<div><b>Đối thủ trong hồ sơ:</b> ${esc(f.competitors.join(', '))}</div>` : ''}`;
    }

    function renderPlanFrame(p) {
      const f = p.frame;
      msgs.innerHTML = `<div class="sx-form">
        <div class="sx-form-sec">Bước 2 · Lập kế hoạch từ khóa</div>
        <div class="sx-form-q">${f ? 'Khung kế hoạch đọc từ hồ sơ tích hợp' : 'Đọc khung từ hồ sơ tích hợp'}</div>
        <div class="sx-form-help">KHUNG lấy từ báo cáo tích hợp đã xác nhận (silo, trụ cột, nhóm bài con, dạng bài, bài đầu tiên, lộ trình).
          Từ khóa trong file Keyword Planner chỉ được <b>xếp vào khung</b>: gom theo search intent + trùng SERP ≥ 3 URL (top 10 Google) + từ khóa chính/phụ. Cụm không vừa khung để riêng, không tạo danh mục mới.</div>
        ${p.status === 'error' ? `<div class="sx-err">⚠️ Lần chạy trước lỗi: ${esc(p.error || '')}</div>` : ''}
        ${f ? `<div class="sx-sum">${frameHtml(f)}<div class="sx-sub">Đọc lúc ${esc(p.frame_at || '')} từ hồ sơ xác nhận lúc ${esc(f.from_report_at || '')}.</div></div>` : ''}
        <div><button class="sx-btn ${f ? '' : 'sx-btn-primary'} sx-pframe">${f ? '↺ Đọc lại khung' : '📖 Đọc khung từ hồ sơ'}</button> <span class="sx-sub sx-pmsg"></span></div>
        ${f && (f.silos || []).length ? `<div class="sx-up"><b>File Keyword Planner:</b> <input type="file" class="sx-kpfile" accept=".csv,.tsv,.txt">
          <span class="sx-sub">Keyword Planner → Tải xuống ý tưởng từ khóa → .csv</span></div><div class="sx-kpinfo"></div>` : ''}
      </div>`;
      setBar(`<div class="sx-nav-l"><button class="sx-btn sx-tochat">↩ Về hội thoại</button></div><div class="sx-nav-r"><button class="sx-btn sx-btn-primary sx-pstart" disabled>▶ Chạy lập kế hoạch</button></div>`);
      bar.querySelector('.sx-tochat').onclick = enterChat;
      msgs.querySelector('.sx-pframe').onclick = async () => {
        const b = msgs.querySelector('.sx-pframe'), m = msgs.querySelector('.sx-pmsg');
        b.disabled = true; m.textContent = '⏳ Chuyên gia đang đọc hồ sơ tích hợp (khoảng 20–60 giây)…';
        try { renderPlanFrame(await api('planframe/' + cid, { method: 'POST', body: '{}' })); }
        catch (e) { m.textContent = '⚠️ ' + e.message; b.disabled = false; }
      };
      const fi = msgs.querySelector('.sx-kpfile');
      if (fi) fi.onchange = async () => {
        const info = msgs.querySelector('.sx-kpinfo'), go = bar.querySelector('.sx-pstart');
        go.disabled = true; info.textContent = 'Đang đọc file…';
        try {
          const kw = await sxParseKeywordPlanner(fi.files[0]);
          const est = await api('planest/' + cid, { method: 'POST', body: JSON.stringify({ keywords: kw }) });
          info.innerHTML = `✅ Đọc được <b>${num(kw.length)}</b> từ khóa (${num(est.keywords)} có lượng tìm kiếm).
            Cần tra Google <b>${num(est.serp_needed)}</b> từ khóa (= ${num(est.serp_needed)} credit Serper), ${num(est.serp_cached)} đã có sẵn trong bộ nhớ đệm.
            Chạy ngầm khoảng ${Math.ceil(est.serp_needed / 600) + 1}–${Math.ceil(est.serp_needed / 300) + 3} phút — đóng cửa sổ vẫn chạy tiếp.`;
          go.disabled = false;
          go.onclick = async () => {
            if (!confirm(`Chạy lập kế hoạch cho ${num(kw.length)} từ khóa?\n\nTốn khoảng ${num(est.serp_needed)} credit Serper + chi phí AI xếp cụm vào khung.`)) return;
            go.disabled = true;
            try { renderPlanRunning(await api('planstart/' + cid, { method: 'POST', body: JSON.stringify({ keywords: kw, file_name: fi.files[0].name }) })); }
            catch (e) { info.insertAdjacentHTML('beforeend', `<div class="sx-err">⚠️ ${esc(e.message)}</div>`); go.disabled = false; }
          };
        } catch (e) { info.innerHTML = `<div class="sx-err">⚠️ ${esc(e.message)}</div>`; }
      };
    }

    function renderPlanRunning(p) {
      const pr = p.progress || {};
      const pct = pr.total ? Math.round(100 * (pr.done || 0) / pr.total) : 0;
      const STAGES = { start: 'Bắt đầu', serp: '1/4 Tra Google', cluster: '2/4 Gom cụm', classify: '3/4 Xếp vào khung', order: '4/4 Sắp lộ trình' };
      msgs.innerHTML = `<div class="sx-form"><div class="sx-form-sec">Bước 2 · Đang lập kế hoạch (chạy ngầm trên server)</div>
        <div class="sx-form-q">${esc(STAGES[pr.stage] || pr.stage || '')}</div>
        <div class="sx-progress sx-progress-big"><div style="width:${pct}%"></div></div>
        <div class="sx-sub">${esc(pr.msg || '')}${pr.at ? ' · cập nhật ' + esc(pr.at) : ''}</div>
        <div class="sx-form-help">File: ${esc(p.file_name || '')} · bắt đầu ${esc(p.started_at || '')}. Có thể đóng cửa sổ, quay lại xem sau.</div></div>`;
      setBar(`<div class="sx-nav-l"><button class="sx-btn sx-tochat">↩ Về hội thoại</button></div>`);
      bar.querySelector('.sx-tochat').onclick = enterChat;
      if (!s.planTimer) s.planTimer = setInterval(async () => {
        if (!document.body.contains(panel) || s.mode !== 'plan') { clearInterval(s.planTimer); s.planTimer = null; return; }
        const np = await planLoad();
        if (np.status === 'done') { clearInterval(s.planTimer); s.planTimer = null; renderPlanDone(); }
        else if (np.status === 'error') { clearInterval(s.planTimer); s.planTimer = null; renderPlanFrame(np); }
        else if (s.mode === 'plan') renderPlanRunning(np);
      }, 3000);
    }

    async function renderPlanDone() {
      msgs.innerHTML = '<div class="sx-thinking">Đang tải kế hoạch…</div>';
      let p;
      try { p = await api('planfull/' + cid); } catch (e) { msgs.innerHTML = `<div class="sx-err">⚠️ ${esc(e.message)}</div>`; return; }
      if (s.mode !== 'plan') return;
      s.plan = p;
      const st = p.stats || {}, rows = p.rows || [];
      const bySilo = {};
      rows.forEach(r => { bySilo[r.silo] = (bySilo[r.silo] || 0) + 1; });
      const byMonth = {};
      rows.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + 1; });
      msgs.innerHTML = `<div class="sx-report">
        <div class="sx-report-h">📐 Kế hoạch nội dung · lập lúc ${esc(p.done_at || '')} từ file ${esc(p.file_name || '')}${p.confirmed ? ' · <span class="sx-ok">✅ đã xác nhận ' + esc(p.confirmed_at || '') + '</span>' : ''}</div>
        <div class="sx-sum">
          <div><b>${num(st.rows)}</b> bài · ${num(st.first)} bài theo hồ sơ (trụ cột + bài đầu) · ${num(st.rows - st.first)} bài từ bộ từ khóa xếp vào khung · tổng ${num(st.volume)} lượt tìm kiếm/tháng</div>
          <div>${num(st.keywords)} từ khóa → ${num(st.clusters)} cụm · ${num(st.excluded)} cụm/từ ngoài khung hoặc bị loại · tra Google ${num(st.serp_fetched)} từ (phần còn lại dùng bộ nhớ đệm) · ${num(st.seconds)} giây</div>
          <div><b>Theo silo:</b> ${Object.entries(bySilo).map(([k, v]) => esc(k) + ' ' + v).join(' · ')}</div>
          <div><b>Theo tháng:</b> ${Object.entries(byMonth).slice(0, 8).map(([k, v]) => 'T' + k + ': ' + v).join(' · ')}${Object.keys(byMonth).length > 8 ? ' · …' : ''} (tổng ${Object.keys(byMonth).length} tháng)</div>
        </div>
        <div class="sx-msg-ai sx-report-body"><table><thead><tr><th>STT</th><th>Tháng</th><th>Silo</th><th>Nhóm bài con</th><th>Dạng bài</th><th>Từ khóa chính</th><th>TK cụm</th><th>Ghi chú</th></tr></thead><tbody>
          ${rows.slice(0, 60).map(r => `<tr><td>${r.stt}</td><td>${r.month}</td><td>${esc(r.silo)}</td><td>${esc(r.sub)}</td><td>${esc(r.type)}</td><td><b>${esc(r.main)}</b></td><td>${r.vol ? num(r.vol) : '—'}</td><td>${esc(clip(r.note, 90))}</td></tr>`).join('')}
        </tbody></table><div class="sx-sub">Hiện 60/${num(rows.length)} bài đầu — tải Excel để xem đủ.</div></div>
      </div>`;
      msgs.scrollTop = 0;
      setBar(`<div class="sx-nav-l"><button class="sx-btn sx-tochat">↩ Về hội thoại</button><button class="sx-btn sx-prerun">↺ Lập lại (khung / file mới)</button></div>
        <div class="sx-nav-r"><span class="sx-sub sx-pdmsg"></span><button class="sx-btn sx-pxlsx">⬇ Tải Excel</button>
        ${p.confirmed ? '<span class="sx-ok">✅ Chuyên gia đang dùng kế hoạch này</span>' : '<button class="sx-btn sx-btn-primary sx-pconfirm">✅ Xác nhận kế hoạch</button>'}</div>`);
      bar.querySelector('.sx-tochat').onclick = enterChat;
      bar.querySelector('.sx-prerun').onclick = () => renderPlanFrame(p);
      bar.querySelector('.sx-pxlsx').onclick = () => sxPlanXlsx(p, bar.querySelector('.sx-pdmsg'));
      const cf = bar.querySelector('.sx-pconfirm');
      if (cf) cf.onclick = async () => {
        cf.disabled = true;
        try { await api('planconfirm/' + cid, { method: 'POST', body: '{}' }); renderPlanDone(); }
        catch (e) { bar.querySelector('.sx-pdmsg').textContent = '⚠️ ' + e.message; cf.disabled = false; }
      };
    }

    async function sxPlanXlsx(p, msgEl) {
      try {
        if (!window.XLSX) {
          msgEl.textContent = 'Đang tải thư viện Excel…';
          await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('Không tải được thư viện Excel')); document.head.appendChild(sc); });
        }
        const aoa = [PLAN_COLS.map(c => c[0])].concat((p.rows || []).map(r => PLAN_COLS.map(([h, k]) => {
          if (!k) return h === 'Trạng thái' ? 'Chưa viết' : '';
          const v = r[k];
          return Array.isArray(v) ? v.join('; ') : (v === 0 && (k === 'vol' || k === 'main_vol') ? '' : v);
        })));
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = PLAN_COLS.map(c => ({ wch: c[2] }));
        ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: PLAN_COLS.length - 1 } }) };
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kế hoạch nội dung');
        const site = ((ctxTitle || cid).replace(/^🌐\s*/, '').split('—').pop() || cid).trim().replace(/[^\w.-]+/g, '-');
        XLSX.writeFile(wb, `Ke-hoach-noi-dung-${site}.xlsx`);
        msgEl.textContent = '✅ Đã tải file';
      } catch (e) { msgEl.textContent = '⚠️ ' + e.message; }
    }
    q('.sx-reset').onclick = async () => {
      if (s.busy || !confirm('Xoá toàn bộ tin nhắn chuyên gia của site này? (Hồ sơ tích hợp và báo cáo chẩn đoán vẫn giữ.)')) return;
      try { await api('chats/' + cid, { method: 'DELETE' }); } catch (e) {}
      welcome();
    };

    // ── Khởi động: đọc trạng thái tích hợp ──
    async function boot() {
      msgs.innerHTML = '<div class="sx-thinking">Đang tải…</div>';
      try {
        const c = await api('chats/' + cid);
        if (c.diagnosis && c.diagnosis.text) { s.diag = c.diagnosis; showDiagBar(); }
        s.integ = c.integration || {};
      } catch (e) { s.integ = {}; }
      s.type = s.integ.type || '';
      s.answers = Object.assign({}, s.integ.answers || {});
      if (unlocked()) enterChat(); else renderGate();
    }
    sxSiteContext(wsId).then(c => { ctxTitle = c.title || ''; const sub = q('.sx-site-sub'); if (sub && c.title) sub.textContent = '· ' + c.title.replace(/^🌐\s*/, ''); });
    size(); boot();
  };

  // Phòng khi renderDashboard() chạy trước khi file này nạp xong
  function mountExisting() {
    const c = document.getElementById('page-dashboard-content');
    if (c && c.firstElementChild) window.sxMount(c);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountExisting); else mountExisting();
})();
