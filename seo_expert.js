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

  // Phòng khi renderDashboard() chạy trước khi file này nạp xong
  function mountExisting() {
    const c = document.getElementById('page-dashboard-content');
    if (c && c.firstElementChild) window.sxMount(c);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountExisting); else mountExisting();
})();
