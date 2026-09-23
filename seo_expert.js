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

  const SITE_SUGGEST = [
    'Site này đang có vấn đề gì cần ưu tiên xử lý?',
    'Phân tích xu hướng GSC của site so với kỳ trước',
    'Vì sao từ khóa chính chưa lên top?',
    'Nên làm gì với các bài chưa index?',
  ];

  window.sxSiteMount = function (panel, wsId) {
    if (!panel) return;
    if (panel.dataset.sxWs === String(wsId)) return;          // đã gắn cho site này
    panel.dataset.sxWs = String(wsId);
    panel.style.padding = '0';
    const cid = 'ws' + String(wsId).replace(/\D/g, '');
    const s = { busy: false };
    panel.innerHTML = `<div class="sx-site">
      <div class="sx-site-head">
        <div class="sx-site-t">🧠 Chuyên gia SEO phụ trách site này <span class="sx-sub sx-site-sub"></span></div>
        <div class="sx-head-actions"><button class="sx-btn sx-ctx">📋 Dữ liệu chuyên gia đọc</button><button class="sx-btn sx-reset" title="Xoá toàn bộ hội thoại của site này">🗑 Làm mới</button></div>
      </div>
      <pre class="sx-ctx-box" hidden></pre>
      <div class="sx-msgs"></div>
      <div class="sx-input"><textarea rows="1" placeholder="Hỏi về site này… (Enter gửi, Shift+Enter xuống dòng)"></textarea><button class="sx-btn sx-btn-primary sx-send">Gửi</button></div>
    </div>`;
    const q = sel => panel.querySelector(sel);
    const msgs = q('.sx-msgs'), ta = q('textarea'), btn = q('.sx-send'), ctxBox = q('.sx-ctx-box');
    const size = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden'; };
    const bottom = () => { msgs.scrollTop = msgs.scrollHeight; };
    function welcome() {
      msgs.innerHTML = `<div class="sx-welcome"><div class="sx-welcome-t">Chưa có hội thoại cho site này</div>
        Mỗi câu hỏi, chuyên gia tự đọc số liệu mới nhất của site (GSC, rank, index, nội dung, 301, dịch vụ, kế hoạch).
        <div class="sx-chips">${SITE_SUGGEST.map(t => `<button class="sx-chip">${esc(t)}</button>`).join('')}</div></div>`;
      msgs.querySelectorAll('.sx-chip').forEach(b => { b.onclick = () => { ta.value = b.textContent; ask(); }; });
    }
    async function load() {
      msgs.innerHTML = '<div class="sx-thinking">Đang tải…</div>';
      try {
        const c = await api('chats/' + cid);
        msgs.innerHTML = (c.messages || []).map(msgHtml).join(''); bottom();
      } catch (e) { welcome(); }
    }
    async function ask() {
      const text = ta.value.trim();
      if (!text || s.busy) return;
      s.busy = true; btn.disabled = true;
      if (msgs.querySelector('.sx-welcome')) msgs.innerHTML = '';
      ta.value = ''; size();
      msgs.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', content: text }));
      const pending = document.createElement('div');
      pending.className = 'sx-msg sx-msg-ai sx-thinking';
      pending.textContent = '📊 Đang đọc số liệu site + tài liệu Google…';
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
    q('.sx-ctx').onclick = async () => {
      if (!ctxBox.hidden) { ctxBox.hidden = true; return; }
      ctxBox.hidden = false; ctxBox.textContent = 'Đang gom dữ liệu…';
      ctxBox.textContent = (await sxSiteContext(wsId)).text || 'Không tìm thấy dữ liệu site.';
    };
    q('.sx-reset').onclick = async () => {
      if (s.busy || !confirm('Xoá toàn bộ hội thoại chuyên gia của site này?')) return;
      try { await api('chats/' + cid, { method: 'DELETE' }); } catch (e) {}
      welcome();
    };
    sxSiteContext(wsId).then(c => { const sub = q('.sx-site-sub'); if (sub && c.title) sub.textContent = '· ' + c.title.replace(/^🌐\s*/, ''); });
    size(); load();
  };

  // Phòng khi renderDashboard() chạy trước khi file này nạp xong
  function mountExisting() {
    const c = document.getElementById('page-dashboard-content');
    if (c && c.firstElementChild) window.sxMount(c);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountExisting); else mountExisting();
})();
