(function () {
  const API = '/api/sw-kw/';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = n => (n == null || n === '') ? '—' : (Number(n) || 0).toLocaleString('vi-VN');
  const btn = extra => `background:var(--t-muted);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;${extra || ''}`;
  const inp = 'background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit';
  const S = { view: 'unprocessed', q: '', ptype: '', sort: 't', dir: '', dup: false, cf: {}, pcf: {}, psort: '', pdir: '', items: [], total: 0, counts: {}, topics: [], sel: new Set(), anchor: null, report: {}, open: new Set(), limit: 200, busy: '', siteId: '', topicId: '', f: { topic: '', min: '', max: '', subs: '', written: '', mine: '' } };
  let root = null, drag = null, loadSeq = 0;
  const PAGE = 1000;
  const fold = s => String(s == null ? '' : s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const fmtT = t => t && t.length >= 16 ? `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}` : (t || '—');
  const LCOL = { text: { l: 'Từ khóa' }, avg: { l: 'Lượt tìm/tháng', num: 1 }, comp: { l: 'Cạnh tranh' }, bid_lo: { l: 'Giá thầu (thấp–cao)', num: 1, nl: 'Giá thầu thấp' }, chg3: { l: '3 tháng' }, chgy: { l: 'Cùng kỳ' }, ptype: { l: 'Loại bài' }, label: { l: 'Nhãn' }, t: { l: 'Nhập lúc', time: 1 }, src: { l: 'Nguồn' } };
  const rep = m => S.report[m.id] || { total: 0, mine: [] };
  const PCOL = { topic: { l: 'Chủ đề', get: m => m.topic }, text: { l: 'Từ khóa chính', get: m => m.text }, avg: { l: 'Lượt tìm/tháng', num: 1, get: m => m.avg }, subs: { l: 'Phụ', num: 1, get: m => m.subs.length }, ptype: { l: 'Loại bài', get: m => m.ptype }, written: { l: 'Đã viết (cả 2 tài khoản)', num: 1, get: m => rep(m).total }, mine: { l: 'Website của tài khoản này', num: 1, get: m => rep(m).mine.length } };
  const vlabel = (col, v) => v === '' || v == null ? '(Trống)' : col === 'ptype' ? (PT[v] || v) : col === 'label' ? (v === 'dropped' ? '✕ Bỏ' : v === 'meaningless' ? '🚫 Vô nghĩa' : v) : String(v);
  const cfNow = () => S.view === 'processed' ? S.pcf : (S.cf[S.view] = S.cf[S.view] || {});
  const FN = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-1px"><path d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5z"/></svg>';
  const th = (col, label, title) => { const on = !!cfNow()[col], so = S.view === 'processed' ? S.psort === col : S.sort === col; return `<th${title ? ` title="${esc(title)}"` : ''}><span style="display:inline-flex;align-items:center;gap:4px">${label}<span class="kb-fn" data-fcol="${col}" title="Lọc / sắp xếp cột này" style="cursor:pointer;padding:1px 3px;border-radius:4px;border:1px solid ${on ? 'var(--t-accent)' : 'var(--t-border)'};color:${on ? '#fff' : 'var(--t-fg-muted)'};background:${on ? 'var(--t-accent)' : 'transparent'};line-height:1">${FN}${so ? ((S.view === 'processed' ? S.pdir : (S.dir || (LCOL[col] && (LCOL[col].num || LCOL[col].time) ? 'desc' : 'asc'))) === 'desc' ? '↓' : '↑') : ''}</span></span></th>`; };

  async function api(path, body) {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.detail || d.error || ('Lỗi ' + r.status));
    return d;
  }
  const say = (msg, col) => { if (typeof toast === 'function') toast(msg, col || '#238636', 3500); else S.busy = msg; };
  const fail = e => say('⚠️ ' + (e && e.message || e), '#e74c3c');

  function sites() {
    return (typeof websites !== 'undefined' ? websites : []).map(w => {
      const url = String(typeof wstCurrentUrl === 'function' ? wstCurrentUrl(w) : (w.url || '')).replace(/^https?:\/\//, '').replace(/\/$/, '');
      return { id: w.id, cid: 'ws' + (window.NT_CID || '') + w.id, domain: url, label: (w.brand ? w.brand + ' — ' : '') + url };
    }).filter(x => x.domain);
  }
  const PT = { post: 'Post', page: 'Page', category: 'Mô tả danh mục' };
  const ptOpts = '<option value="">Đặt loại bài…</option><option value="post">Post</option><option value="page">Page</option><option value="category">Mô tả danh mục</option><option value="__clear">Xóa loại bài</option>';
  const ptCell = k => `${k.ptype ? `<span style="padding:1px 8px;border-radius:10px;background:color-mix(in srgb,var(--t-accent) 16%,transparent);color:var(--t-accent)">${PT[k.ptype]}</span>` : '<span style="color:var(--t-fg-subtle)">—</span>'}${k.nsrc ? ` <span style="color:var(--t-fg-muted);font-size:11px">${k.nsrc} đối thủ</span>` : ''}`;
  const allMains = () => S.topics.flatMap(t => t.mains.map(m => ({ id: m.id, kw: m.kw.id, topic: t.name, topicId: t.id, text: m.kw.text, avg: m.kw.avg, subs: m.subs, ptype: m.kw.ptype || '', nsrc: m.kw.nsrc || 0 })));

  async function load() {
    const seq = ++loadSeq;
    try {
      if (S.view === 'unprocessed' || S.view === 'excluded') {
        let items = [], d = null;
        for (let off = 0; off < S.limit; off += PAGE) {
          const n = Math.min(PAGE, S.limit - off);
          d = await api('list', { view: S.view, q: S.q, ptype: S.ptype, sort: S.sort, dir: S.dir, dup: S.view === 'unprocessed' && S.dup, filters: cfNow(), offset: off, limit: n });
          if (seq !== loadSeq) return;
          items = items.concat(d.items);
          if (d.items.length < n || items.length >= d.total) break;
        }
        S.items = items; S.total = d.total; S.counts = d.counts;
        const st = await api('state');
        S.topics = st.topics;
      } else {
        const st = await api('state');
        if (seq !== loadSeq) return;
        S.topics = st.topics; S.counts = st.counts;
        if (S.view === 'processed') { S.report = await api('report'); if (seq !== loadSeq) return; }
      }
    } catch (e) { fail(e); }
    draw();
  }

  function parseDelimited(text, delim) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }

  async function importFile(file) {
    const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf);
    let text;
    if (u8[0] === 0xFF && u8[1] === 0xFE) text = new TextDecoder('utf-16le').decode(buf);
    else if (u8[0] === 0xFE && u8[1] === 0xFF) text = new TextDecoder('utf-16be').decode(buf);
    else text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
    const probe = text.split('\n').slice(0, 6).join('\n');
    const delim = (probe.match(/\t/g) || []).length >= (probe.match(/;/g) || []).length && (probe.match(/\t/g) || []).length >= (probe.match(/,/g) || []).length ? '\t' : ((probe.match(/;/g) || []).length > (probe.match(/,/g) || []).length ? ';' : ',');
    const rows = parseDelimited(text, delim);
    const hi = rows.findIndex(r => r.some(c => /^(keyword|từ khóa)$/i.test(c.trim())));
    if (hi < 0) throw new Error('Không thấy dòng tiêu đề có cột "Keyword" trong file');
    const H = rows[hi].map(c => c.trim().toLowerCase());
    const col = re => H.findIndex(h => re.test(h));
    const c = { kw: col(/^(keyword|từ khóa)$/), avg: col(/^avg\.? monthly|trung bình/), comp: col(/^competition$|^mức độ cạnh tranh$/), bl: col(/bid.*low|giá thầu.*thấp/), bh: col(/bid.*high|giá thầu.*cao/), c3: col(/ba tháng|three month|3.?month/), cy: col(/cùng kỳ|year over year|yoy/) };
    const mcols = H.map((h, i) => /^(searches|lượt tìm)[^:]*:/.test(h) ? i : -1).filter(i => i >= 0);
    const g = (r, i) => i >= 0 && i < r.length ? r[i].trim() : '';
    const data = rows.slice(hi + 1).filter(r => g(r, c.kw)).map(r => ({ keyword: g(r, c.kw), avg: g(r, c.avg), comp: g(r, c.comp), bid_lo: g(r, c.bl), bid_hi: g(r, c.bh), chg3: g(r, c.c3), chgy: g(r, c.cy), months: mcols.map(i => g(r, i)) }));
    if (!data.length) throw new Error('File không có dòng từ khóa nào');
    const tot = { added: 0, existing: 0, excluded: 0, invalid: 0, updated: 0, deleted: 0 };
    for (let i = 0; i < data.length; i += 4000) {
      S.busy = `Đang nhập ${Math.min(i + 4000, data.length)}/${data.length}…`; draw();
      const r = await api('import', { rows: data.slice(i, i + 4000) });
      Object.keys(tot).forEach(k => { tot[k] += r[k] || 0; });
    }
    S.busy = '';
    say(`✓ Nhập ${data.length} dòng: thêm mới ${tot.added} · đã có ${tot.existing} · đã loại (vô nghĩa/bỏ) ${tot.excluded}${tot.deleted ? ' · bỏ qua ' + tot.deleted + ' từ đã xóa vĩnh viễn' : ''}${tot.updated ? ' · điền lượt tìm ' + tot.updated : ''}${tot.invalid ? ' · lỗi ' + tot.invalid : ''}`);
    S.view = 'unprocessed'; S.sel.clear();
    await load();
  }

  function modal(inner, onMount) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `<div style="background:var(--t-subtle);border:1px solid var(--t-border);border-radius:12px;padding:16px;max-width:720px;width:100%;max-height:82vh;overflow:auto;color:var(--t-fg)">${inner}</div>`;
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    if (onMount) onMount(ov);
    return ov;
  }

  function mergeMains() {
    const ids = [...S.sel];
    const ms = S.topics.flatMap(t => t.mains.filter(m => ids.includes(m.id)).map(m => ({ id: m.id, topic: t.name, kw: m.kw, subs: m.subs })));
    if (ms.length < 2) { say('Chọn ít nhất 2 từ khóa chính để gộp', '#e67e22'); return; }
    const seen = new Set();
    const uniq = list => list.filter(k => k && !seen.has(k.id) && seen.add(k.id));
    const groups = ms.map(m => ({ m, words: uniq([m.kw].concat(m.subs)) }));
    const total = seen.size;
    const best = ms.slice().sort((a, b) => (Number(b.kw.avg) || 0) - (Number(a.kw.avg) || 0))[0].kw.id;
    const row = (k, isMain) => `<label style="display:flex;gap:8px;align-items:center;padding:5px 10px ${isMain ? '5px 10px' : '5px 30px'};border-bottom:1px solid var(--t-muted);cursor:pointer"><input type="radio" name="mg-keep" value="${esc(k.id)}" ${k.id === best ? 'checked' : ''}><span style="flex:1;${isMain ? 'font-weight:700;color:var(--t-fg2)' : ''}">${isMain ? '★ ' : ''}${esc(k.text)}</span><span style="color:var(--t-fg-muted);font-size:11px">${num(k.avg)}/tháng</span></label>`;
    const ov = modal(`<div style="font-weight:700;margin-bottom:4px">⤵ Gộp ${ms.length} từ khóa chính (${total} từ khóa)</div>
      <div style="font-size:12px;color:var(--t-fg-muted);margin-bottom:8px">Chọn 1 từ làm từ khóa chính — tất cả từ còn lại (các từ khóa chính khác và mọi từ khóa phụ của chúng) thành từ khóa phụ của nó.</div>
      <div class="mg-list" style="max-height:52vh;overflow:auto;border:1px solid var(--t-border);border-radius:8px">${groups.map(g => `<div style="font-size:11px;color:var(--t-fg-muted);padding:6px 10px 2px;background:var(--t-canvas)">📁 ${esc(g.m.topic)}</div>` + g.words.map(k => row(k, k.id === g.m.kw.id)).join('')).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end"><button class="mg-cancel" style="${btn()}">Hủy</button><button class="mg-ok" style="${btn('background:#238636;border-color:#238636;color:#fff')}">Gộp</button></div>`);
    ov.querySelector('.mg-cancel').onclick = () => ov.remove();
    ov.querySelector('.mg-ok').onclick = async () => {
      const r = ov.querySelector('input[name=mg-keep]:checked');
      if (!r) return;
      const keep = r.value, name = (r.closest('label').querySelector('span') || {}).textContent || '';
      ov.remove();
      try {
        await api('assign', { action: 'merge', main_ids: ms.map(m => m.id), kw_ids: [keep] });
        S.sel.clear();
        say(`✓ Đã gộp ${total} từ khóa vào "${name.replace(/^★\s*/, '')}"`);
        await load();
      } catch (e) { fail(e); }
    };
  }

  function pickMains(onOk) {
    const mains = allMains();
    if (!mains.length) { say('Chưa có từ khóa chính nào — tạo chủ đề và đặt từ khóa chính trước', '#e67e22'); return; }
    const ov = modal(`<div style="font-weight:700;margin-bottom:8px">Chọn từ khóa chính (có thể chọn nhiều)</div>
      <input class="pm-q" placeholder="🔍 Tìm…" style="${inp};width:100%;margin-bottom:8px">
      <div class="pm-list" style="max-height:48vh;overflow:auto;border:1px solid var(--t-border);border-radius:8px"></div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end"><button class="pm-cancel" style="${btn()}">Hủy</button><button class="pm-ok" style="${btn('background:#238636;border-color:#238636;color:#fff')}">Gắn làm từ khóa phụ</button></div>`);
    const chosen = new Set();
    const list = ov.querySelector('.pm-list');
    const paint = () => {
      const q = ov.querySelector('.pm-q').value.trim().toLowerCase();
      list.innerHTML = mains.filter(m => !q || (m.text + ' ' + m.topic).toLowerCase().includes(q)).map(m =>
        `<label style="display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--t-muted);cursor:pointer"><input type="checkbox" data-id="${esc(m.id)}" ${chosen.has(m.id) ? 'checked' : ''}><span style="flex:1">${esc(m.text)}</span><span style="color:var(--t-fg-muted);font-size:11px">${esc(m.topic)} · ${num(m.avg)}</span></label>`).join('') || '<div style="padding:12px;color:var(--t-fg-muted)">Không có</div>';
    };
    paint();
    ov.querySelector('.pm-q').addEventListener('input', paint);
    list.addEventListener('change', e => { const id = e.target.dataset.id; if (!id) return; e.target.checked ? chosen.add(id) : chosen.delete(id); });
    ov.querySelector('.pm-cancel').onclick = () => ov.remove();
    ov.querySelector('.pm-ok').onclick = () => { if (!chosen.size) return; ov.remove(); onOk([...chosen]); };
  }

  function pickSubs(mainId) {
    const ov = modal(`<div style="font-weight:700;margin-bottom:8px">Thêm từ khóa phụ từ danh sách chưa xử lý</div>
      <input class="ps-q" placeholder="🔍 Tìm từ khóa…" style="${inp};width:100%;margin-bottom:8px">
      <div class="ps-list" style="max-height:48vh;overflow:auto;border:1px solid var(--t-border);border-radius:8px"></div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end"><button class="ps-cancel" style="${btn()}">Hủy</button><button class="ps-ok" style="${btn('background:#238636;border-color:#238636;color:#fff')}">Thêm</button></div>`);
    const chosen = new Set();
    const list = ov.querySelector('.ps-list');
    let seq = 0;
    const paint = async () => {
      const my = ++seq;
      let d;
      try { d = await api('list', { view: 'unprocessed', q: ov.querySelector('.ps-q').value, sort: 'avg', offset: 0, limit: 100 }); } catch (e) { return fail(e); }
      if (my !== seq) return;
      list.innerHTML = d.items.map(k => `<label style="display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--t-muted);cursor:pointer"><input type="checkbox" data-id="${esc(k.id)}" ${chosen.has(k.id) ? 'checked' : ''}><span style="flex:1">${esc(k.text)}</span><span style="color:var(--t-fg-muted);font-size:11px">${num(k.avg)}</span></label>`).join('') || '<div style="padding:12px;color:var(--t-fg-muted)">Không có từ khóa chưa xử lý khớp</div>';
    };
    paint();
    let t = null;
    ov.querySelector('.ps-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(paint, 250); });
    list.addEventListener('change', e => { const id = e.target.dataset.id; if (!id) return; e.target.checked ? chosen.add(id) : chosen.delete(id); });
    ov.querySelector('.ps-cancel').onclick = () => ov.remove();
    ov.querySelector('.ps-ok').onclick = async () => {
      if (!chosen.size) return;
      ov.remove();
      try { await api('assign', { action: 'sub', kw_ids: [...chosen], main_ids: [mainId] }); await load(); } catch (e) { fail(e); }
    };
  }

  async function assign(action, extra) {
    const ids = [...S.sel];
    try {
      await api('assign', Object.assign({ action, kw_ids: ids }, extra || {}));
      S.sel.clear();
      await load();
    } catch (e) { fail(e); }
  }

  async function newTopic() {
    const name = prompt('Tên chủ đề mới:');
    if (!name || !name.trim()) return null;
    try {
      const st = await api('topic', { op: 'add', name });
      S.topics = st.topics;
      const t = st.topics.find(x => x.name.toLowerCase() === name.trim().replace(/\s+/g, ' ').toLowerCase());
      return t ? t.id : null;
    } catch (e) { fail(e); return null; }
  }

  async function addToPlan() {
    const ids = [...S.sel];
    const site = sites().find(x => String(x.id) === String(S.siteId));
    if (!ids.length) return;
    if (!site) { say('Chọn website trước', '#e67e22'); return; }
    let chk;
    try { chk = await api('plan-check', { cid: site.cid, main_ids: ids }); } catch (e) { return fail(e); }
    const go = async () => {
      try {
        const r = await api('plan-add', { cid: site.cid, main_ids: chk.ok, domain: site.domain });
        say(`✓ Đã thêm ${r.added} từ khóa vào kế hoạch của ${site.domain} (tab ✍️ Nội dung)`);
        S.sel.clear(); load();
      } catch (e) { fail(e); }
    };
    if (!chk.conflicts.length) {
      if (confirm(`Thêm ${chk.ok.length} từ khóa vào kế hoạch của ${site.domain}?`)) go();
      return;
    }
    const rows = chk.conflicts.map(c => `<div style="border-top:1px solid var(--t-muted);padding:8px 0"><b>${esc(c.text)}</b>${c.items.map(i => `<div style="font-size:12px;color:var(--t-fg-muted);margin-top:2px">• ${esc(i.via)} · ${esc(i.status)} — ${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener" style="color:var(--t-accent)">${esc(i.title)}</a>` : esc(i.title)}</div>`).join('')}</div>`).join('');
    const ov = modal(`<div style="font-weight:700;color:var(--t-warn);margin-bottom:6px">⚠ ${chk.conflicts.length} từ khóa đã có trên ${esc(site.domain)}</div>
      <div style="font-size:12px;color:var(--t-fg-muted);margin-bottom:8px">Từ khóa dưới đây đã có bài trên web hoặc đã nằm trong kế hoạch của site này, nên sẽ bị loại khỏi lần thêm.</div>${rows}
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end"><button class="cf-cancel" style="${btn()}">Hủy, không thêm gì</button>${chk.ok.length ? `<button class="cf-go" style="${btn('background:#238636;border-color:#238636;color:#fff')}">Loại ${chk.conflicts.length} từ khóa trùng, thêm ${chk.ok.length} còn lại</button>` : ''}</div>`);
    ov.querySelector('.cf-cancel').onclick = () => ov.remove();
    const g = ov.querySelector('.cf-go');
    if (g) g.onclick = () => { ov.remove(); go(); };
  }

  const WT = { post: 'posts', page: 'pages', category: 'categories' };
  const capFirst = s => { s = String(s || '').replace(/[>,|]/g, ' ').replace(/\s+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };

  function writeDialog() {
    const ms = allMains().filter(m => S.sel.has(m.id));
    if (!ms.length) return;
    const all = sites();
    const st = ms.map(m => ({ m, pt: m.ptype || '', set: !m.ptype, cat: m.ptype === 'category' ? capFirst(m.text) : '' }));
    const ov = modal(`<div style="font-weight:700;margin-bottom:8px">✍️ Viết bài — ${ms.length} từ khóa chính</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><select class="wd-site" style="${inp};flex:1;min-width:240px"><option value="">Chọn website…</option>${all.map(x => `<option value="${esc(x.id)}" ${String(S.siteId) === String(x.id) ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
      <div class="wd-cathint" style="font-size:11.5px;color:var(--t-fg-muted);margin-bottom:8px">Chọn website để nạp danh mục có sẵn trên web</div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;font-size:12px;color:var(--t-fg-muted)">Danh mục cho mọi Post: <input class="wd-allcat" list="kbCatList" placeholder="chọn hoặc gõ tên mới" style="${inp};flex:1"><button class="wd-allcat-go" style="${btn()}">Áp</button></div>
      <datalist id="kbCatList"></datalist>
      <div style="max-height:46vh;overflow:auto;border:1px solid var(--t-border);border-radius:8px"><table class="kb-tbl" style="width:100%"><thead><tr><th>Từ khóa chính</th><th>Phụ</th><th>Loại bài</th><th>Danh mục</th></tr></thead><tbody class="wd-body"></tbody></table></div>
      <div class="wd-sum" style="font-size:12px;margin-top:8px"></div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end"><button class="wd-cancel" style="${btn()}">Hủy</button><button class="wd-go" style="${btn('background:#1f6feb;border-color:#1f6feb;color:#fff')}">✍️ Viết (mở tool viết bài)</button></div>`);
    ov.firstElementChild.style.maxWidth = '860px';
    const body = ov.querySelector('.wd-body');
    const cells = (x) => `<td style="font-weight:600;color:var(--t-fg2);white-space:normal">${esc(x.m.text)}</td><td style="text-align:center">${x.m.subs.length}</td>
        <td><select class="wd-pt" style="${inp}${x.set ? ';border-color:var(--t-warn)' : ''}">${x.pt ? '' : '<option value="" selected>— chọn loại —</option>'}${Object.keys(PT).map(k => `<option value="${k}" ${x.pt === k ? 'selected' : ''}>${PT[k]}</option>`).join('')}</select>${x.set ? '<div style="font-size:10.5px;color:var(--t-warn)">chưa có loại — chọn xong sẽ lưu vào kho</div>' : ''}</td>
        <td>${x.pt === 'page' ? '<span style="color:var(--t-fg-subtle)">Page không có danh mục</span>' : `<input class="wd-cat" list="kbCatList" value="${esc(x.cat)}" placeholder="${x.pt === 'category' ? 'tên danh mục (bắt buộc)' : 'danh mục (tuỳ chọn)'}" style="${inp};width:100%;min-width:200px${x.pt === 'category' && !x.cat ? ';border-color:var(--t-warn)' : ''}">`}</td>`;
    const sum = () => {
      const g = {}; st.forEach(x => { if (x.pt) g[x.pt] = (g[x.pt] || 0) + 1; });
      const miss = st.filter(x => !x.pt).length, keys = Object.keys(g);
      ov.querySelector('.wd-sum').innerHTML = (keys.length ? `Sẽ tách thành <b>${keys.length} mẻ</b>: ${keys.map(k => `${PT[k]} <b>${g[k]}</b>`).join(' · ')}` : '') + (miss ? ` <span style="color:var(--t-warn)">· còn ${miss} từ chưa chọn loại</span>` : '');
    };
    const paint = () => { body.innerHTML = st.map((x, i) => `<tr data-i="${i}">${cells(x)}</tr>`).join(''); sum(); };
    const paintRow = (tr, focus) => {
      tr.innerHTML = cells(st[+tr.dataset.i]);
      sum();
      if (focus) { const f = tr.querySelector('.' + focus); if (f) f.focus(); }
    };
    paint();
    body.addEventListener('change', e => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const x = st[+tr.dataset.i];
      if (e.target.classList.contains('wd-pt')) {
        x.pt = e.target.value;
        if (x.pt === 'category' && !x.cat) x.cat = capFirst(x.m.text);
        if (x.pt === 'page') x.cat = '';
        paintRow(tr, 'wd-pt');
      }
    });
    body.addEventListener('input', e => {
      if (!e.target.classList.contains('wd-cat')) return;
      st[+e.target.closest('tr[data-i]').dataset.i].cat = e.target.value;
    });
    ov.querySelector('.wd-allcat-go').onclick = () => { const v = ov.querySelector('.wd-allcat').value.trim(); st.forEach(x => { if (x.pt === 'post') x.cat = v; }); paint(); };
    body.addEventListener('focusout', e => { if (e.target.classList.contains('wd-cat')) { const tr = e.target.closest('tr[data-i]'), x = st[+tr.dataset.i]; e.target.style.borderColor = x.pt === 'category' && !x.cat.trim() ? 'var(--t-warn)' : ''; } });
    let cseq = 0, siteCats = [];
    const fillDl = () => {
      const seen = new Set(), typed = [];
      st.forEach(x => { const v = x.cat.trim(); if (x.pt !== 'page' && v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); typed.push(v); } });
      const allc = ov.querySelector('.wd-allcat').value.trim();
      if (allc && !seen.has(allc.toLowerCase())) { seen.add(allc.toLowerCase()); typed.push(allc); }
      ov.querySelector('#kbCatList').innerHTML = typed.map(v => `<option value="${esc(v)}">đã điền ở trên</option>`).join('')
        + siteCats.filter(c => !seen.has(c.path.toLowerCase())).map(c => `<option value="${esc(c.path)}">${c.count} bài</option>`).join('');
    };
    ov.addEventListener('focusin', e => { if (e.target.matches('.wd-cat,.wd-allcat')) fillDl(); });
    const loadCats = async () => {
      const site = all.find(x => String(x.id) === ov.querySelector('.wd-site').value), hint = ov.querySelector('.wd-cathint');
      siteCats = []; fillDl();
      if (!site) { hint.textContent = 'Chọn website để nạp danh mục có sẵn trên web'; return; }
      const my = ++cseq;
      hint.textContent = '⏳ Đang nạp danh mục của ' + site.domain + '…';
      try {
        const d = await api('site-cats', { site_url: site.domain });
        if (my !== cseq) return;
        siteCats = d.cats || []; fillDl();
        hint.textContent = (d.cats || []).length ? `${d.cats.length} danh mục có sẵn trên ${site.domain} — bấm vào ô Danh mục để chọn, gõ tên mới thì tool tạo mới (con: Cha > Con)` : ('Không nạp được danh mục' + (d.error ? ': ' + d.error : '') + ' — vẫn gõ tay được');
      } catch (e) { if (my === cseq) hint.textContent = 'Không nạp được danh mục: ' + e.message + ' — vẫn gõ tay được'; }
    };
    ov.querySelector('.wd-site').addEventListener('change', e => { S.siteId = e.target.value; loadCats(); });
    loadCats();
    ov.querySelector('.wd-cancel').onclick = () => ov.remove();
    ov.querySelector('.wd-go').onclick = async () => {
      const site = all.find(x => String(x.id) === ov.querySelector('.wd-site').value);
      if (!site) { say('Chọn website trước', '#e67e22'); return; }
      const miss = st.filter(x => !x.pt);
      if (miss.length) { say(`Còn ${miss.length} từ khóa chưa chọn Loại bài`, '#e67e22'); return; }
      const noCat = st.filter(x => x.pt === 'category' && !x.cat.trim());
      if (noCat.length) { say(`Mô tả danh mục phải có tên danh mục: ${noCat.map(x => x.m.text).join(', ')}`, '#e67e22'); return; }
      const w = (typeof websites !== 'undefined' ? websites : []).find(x => String(x.id) === String(site.id)) || {};
      const s301 = typeof wstCurrent301Site === 'function' ? wstCurrent301Site(w) : w;
      if (!(s301 && s301.appwppass) && !confirm('Site này chưa có WP Application Password — tool sẽ viết nhưng không đăng được lên web. Vẫn mở?')) return;
      const save = {};
      st.forEach(x => { if (x.pt !== (x.m.ptype || '')) (save[x.pt] = save[x.pt] || []).push(x.m.kw); });
      try { for (const k of Object.keys(save)) await api('assign', { action: 'set_ptype', kw_ids: save[k], ptype: k }); } catch (e) { return fail(e); }
      const rows = st.map(x => ({ main: x.m.text, sec: x.m.subs.map(s => s.text).join(', '), cat: x.pt === 'page' ? '' : x.cat.trim(), atype: x.pt === 'page' ? 'trang-van-hanh' : '', wtype: WT[x.pt] }));
      const wst = typeof getWstSite === 'function' ? getWstSite(w.id) : null;
      const brand = (wst && wst.mainKeyword) || w.brand || '';
      const frag = [];
      if (s301 && s301.account) frag.push('wpu=' + encodeURIComponent(s301.account));
      if (s301 && s301.appwppass) frag.push('wpp=' + encodeURIComponent(s301.appwppass));
      frag.push('rows=' + encodeURIComponent(JSON.stringify(rows)));
      const url = 'https://seo-writer-tool.nthieucloud.shop/?site=' + encodeURIComponent(site.domain) + '&brand=' + encodeURIComponent(brand) + '&batch=1#' + frag.join('&');
      ov.remove();
      const g = {}; st.forEach(x => { g[x.pt] = (g[x.pt] || 0) + 1; });
      if (typeof wstOpenWriterModal === 'function') wstOpenWriterModal(url, `Viết ${rows.length} bài — ${site.domain}`); else window.open(url, '_blank');
      say(`✓ Đã chuyển ${rows.length} từ khóa sang tool viết bài (${Object.keys(g).map(k => PT[k] + ' ' + g[k]).join(' · ')}) — kiểm tra Bước 1 rồi bấm chạy, tool tự tách mẻ`);
      S.sel.clear();
      if (Object.keys(save).length) load(); else draw();
    };
  }

  function bar() {
    const el = root && root.querySelector('#kbBar');
    if (!el) return;
    const n = S.sel.size;
    if (!n) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'flex';
    const topicOpts = S.topics.map(t => `<option value="${esc(t.id)}" ${S.topicId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    if (S.view === 'unprocessed') {
      el.innerHTML = `<b style="font-size:12.5px">${n} từ khóa đã chọn</b>
        <select class="kb-topic" style="${inp}"><option value="">Chủ đề…</option>${topicOpts}<option value="__new">＋ Chủ đề mới…</option></select>
        <button data-a="tomain" style="${btn()}">★ Làm từ khóa chính</button>
        <button data-a="tosub" style="${btn()}">↳ Làm từ khóa phụ của…</button>
        <select class="kb-setpt" style="${inp}">${ptOpts}</select>
        <button data-a="meaningless" style="${btn('color:var(--t-warn)')}">🚫 Vô nghĩa</button>
        <button data-a="dropped" style="${btn('color:var(--t-danger)')}">✕ Bỏ</button>
        <button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}">Bỏ chọn</button>`;
    } else if (S.view === 'excluded') {
      el.innerHTML = `<b style="font-size:12.5px">${n} từ khóa đã chọn</b><button data-a="restore" style="${btn()}">↩ Khôi phục về chưa xử lý</button><button data-a="purge" style="${btn('color:#fff;background:var(--t-danger);border-color:var(--t-danger)')}">🗑 Xóa vĩnh viễn</button><button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}">Bỏ chọn</button>`;
    } else if (S.view === 'processed') {
      const so = sites().map(x => `<option value="${esc(x.id)}" ${String(S.siteId) === String(x.id) ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
      el.innerHTML = `<b style="font-size:12.5px">${n} từ khóa chính đã chọn</b>
        <button data-a="write" style="${btn('background:#238636;border-color:#238636;color:#fff')}">✍️ Viết bài</button>
        <select class="kb-setpt" style="${inp}">${ptOpts}</select>
        <select class="kb-site" style="${inp};max-width:320px"><option value="">Chọn website…</option>${so}</select>
        <button data-a="toplan" style="${btn('background:#1f6feb;border-color:#1f6feb;color:#fff')}">➕ Thêm vào kế hoạch của website</button>
        ${n >= 2 ? `<button data-a="merge" style="${btn()}">⤵ Gộp</button>` : ''}
        <button data-a="unmain" style="${btn()}">↩ Bỏ về Chưa xử lý</button>
        <button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}">Bỏ chọn</button>`;
    }
  }

  function chip(label, n, view, col) {
    return `<span role="button" tabindex="0" data-a="view" data-v="${view}" style="display:inline-flex;gap:6px;align-items:center;padding:5px 12px;border-radius:16px;border:1px solid ${S.view === view ? 'var(--t-accent)' : 'var(--t-border)'};background:${S.view === view ? 'color-mix(in srgb,var(--t-accent) 14%,var(--t-canvas))' : 'var(--t-canvas)'};cursor:pointer;font-size:12.5px;color:${col}">${label} <b>${num(n)}</b></span>`;
  }

  function kwTable(items, withLabel) {
    const dup = S.view === 'unprocessed' && S.dup;
    const head = `<th class="sk0"><input type="checkbox" class="kb-all"></th>${th('text', 'Từ khóa')}${th('avg', 'Lượt tìm/tháng')}${th('comp', 'Cạnh tranh')}${th('bid_lo', 'Giá thầu (thấp–cao)')}${th('chg3', '3 tháng')}${th('chgy', 'Cùng kỳ')}${th('ptype', 'Loại bài')}${withLabel ? th('label', 'Nhãn') : ''}${th('t', 'Nhập lúc')}${dup ? th('src', 'Nguồn') : ''}`;
    const body = items.map(k => `<tr data-sel="${esc(k.id)}" class="${S.sel.has(k.id) ? 'sel' : ''}"><td class="sk0"><input type="checkbox" class="kb-chk" ${S.sel.has(k.id) ? 'checked' : ''}></td>
      <td style="font-weight:600;color:var(--t-fg2)"><span class="kb-ed" data-edit="${esc(k.id)}" title="Click đúp để sửa">${esc(k.text)}</span>${!dup && k.nimp > 1 ? ` <span title="Đã nhập ${k.nimp} lần" style="font-size:10.5px;font-weight:400;color:var(--t-fg-muted)">×${k.nimp}</span>` : ''}</td><td style="text-align:right">${num(k.avg)}</td><td>${esc(k.comp)}</td>
      <td>${k.bid_lo == null && k.bid_hi == null ? '—' : esc((k.bid_lo ?? '') + ' – ' + (k.bid_hi ?? ''))}</td><td>${esc(k.chg3)}</td><td>${esc(k.chgy)}</td><td>${ptCell(k)}</td>
      ${withLabel ? `<td>${k.label === 'dropped' ? '✕ Bỏ' : '🚫 Vô nghĩa'}</td>` : ''}<td style="color:var(--t-fg-muted)">${esc(fmtT(k.t))}</td>${dup ? `<td style="color:var(--t-fg-muted)">${esc(k.src || 'CSV')}</td>` : ''}</tr>`).join('');
    return `<div class="kb-scroll" style="overflow:auto;max-height:calc(100vh - 300px);min-height:200px;border:1px solid var(--t-border);border-radius:8px"><table class="kb-tbl"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="12" style="padding:16px;color:var(--t-fg-muted)">${Object.keys(cfNow()).length ? 'Không có từ khóa nào khớp bộ lọc cột' : 'Không có từ khóa nào'}</td></tr>`}</tbody></table></div>
      ${S.items.length < S.total ? `<div style="margin-top:8px;display:flex;gap:6px"><button data-a="more" style="${btn()}">Hiện thêm (${S.items.length}/${num(S.total)})</button><button data-a="all" style="${btn()}">Hiện tất cả (${num(S.total)})</button></div>` : ''}`;
  }

  function topicsView() {
    const tb = S.topics.map(t => `<div style="border:1px solid var(--t-border);border-radius:10px;padding:10px 12px;background:var(--t-canvas)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="font-size:14px;color:var(--t-fg2)">📁 ${esc(t.name)}</b><span style="font-size:12px;color:var(--t-fg-muted)">${t.mains.length} từ khóa chính</span>
        <span style="margin-left:auto;display:flex;gap:6px"><button data-a="addmain" data-t="${esc(t.id)}" style="${btn()}">＋ Từ khóa chính</button><button data-a="rentopic" data-t="${esc(t.id)}" style="${btn()}">✏️</button><button data-a="deltopic" data-t="${esc(t.id)}" style="${btn('color:var(--t-danger)')}">🗑</button></span></div>
      ${t.mains.map(m => `<div style="border-top:1px solid var(--t-muted);padding:8px 0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="color:var(--t-warn)">★</span><b class="kb-ed" data-edit="${esc(m.kw.id)}" title="Click đúp để sửa" style="color:var(--t-fg2)">${esc(m.kw.text)}</b><span style="font-size:12px;color:var(--t-fg-muted)">${num(m.kw.avg)}/tháng</span>
          <span style="margin-left:auto;display:flex;gap:6px"><button data-a="addsub" data-m="${esc(m.id)}" style="${btn()}">＋ Từ khóa phụ</button><button data-a="mvmain" data-m="${esc(m.id)}" style="${btn()}">⇄ Chuyển chủ đề</button><button data-a="rmmain" data-m="${esc(m.id)}" style="${btn()}">↩ Gỡ</button></span></div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${m.subs.map(s => `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--t-subtle3);border:1px solid var(--t-border);border-radius:12px;padding:2px 4px 2px 10px;font-size:12px"><span class="kb-ed" data-edit="${esc(s.id)}" title="Click đúp để sửa">${esc(s.text)}</span> <span style="color:var(--t-fg-muted)">${num(s.avg)}</span>
          <a data-a="swap" data-m="${esc(m.id)}" data-k="${esc(s.id)}" title="Thay thế từ khóa chính (từ khóa chính hiện tại thành từ khóa phụ)" style="cursor:pointer;color:var(--t-accent);padding:0 3px">⇄</a>
          <a data-a="rmsub" data-m="${esc(m.id)}" data-k="${esc(s.id)}" title="Gỡ khỏi từ khóa chính" style="cursor:pointer;color:var(--t-fg-muted);padding:0 4px">✕</a></span>`).join('') || '<span style="font-size:12px;color:var(--t-fg-subtle)">Chưa có từ khóa phụ</span>'}</div></div>`).join('') || '<div style="font-size:12px;color:var(--t-fg-subtle)">Chưa có từ khóa chính — vào "Chưa xử lý" chọn từ khóa rồi bấm ★, hoặc bấm ＋ Từ khóa chính để gõ tay.</div>'}</div>`).join('');
    return `<div style="display:flex;flex-direction:column;gap:12px">${tb || '<div style="color:var(--t-fg-muted)">Chưa có chủ đề nào — bấm "＋ Chủ đề" để tạo.</div>'}</div>`;
  }

  function procFilters(shown, all) {
    const F = S.f;
    const sel = (key, opts) => `<select class="kb-f" data-f="${key}" style="${inp}${F[key] ? ';border-color:var(--t-accent)' : ''}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${F[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const numIn = (key, ph) => `<input class="kb-f" data-f="${key}" type="number" min="0" inputmode="numeric" value="${esc(F[key])}" placeholder="${ph}" style="${inp};width:110px${F[key] ? ';border-color:var(--t-accent)' : ''}">`;
    const on = Object.values(F).some(Boolean);
    return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--t-fg-muted)">Lọc:
      ${sel('topic', [['', 'Chủ đề: tất cả']].concat(S.topics.map(t => [t.id, t.name])))}
      <span>Lượt tìm</span>${numIn('min', 'từ')}<span>–</span>${numIn('max', 'đến')}
      ${sel('subs', [['', 'Phụ: tất cả'], ['has', 'Có từ khóa phụ'], ['none', 'Không có phụ']])}
      ${sel('written', [['', 'Đã viết: tất cả'], ['0', 'Chưa website nào'], ['1', 'Đã có ≥ 1 website']])}
      ${sel('mine', [['', 'Website của tôi: tất cả'], ['has', 'Đã có ở web của tôi'], ['none', 'Chưa có ở web của tôi']])}
      ${on ? `<button data-a="fclear" style="${btn('padding:3px 9px')}">✕ Xóa lọc</button>` : ''}
      <span style="margin-left:4px">${num(shown)}/${num(all)} từ khóa chính</span></div>`;
  }

  function procMatch(m) {
    const F = S.f, r = S.report[m.id] || { total: 0, mine: [] }, avg = Number(m.avg) || 0;
    if (F.topic && m.topicId !== F.topic) return false;
    if (F.min !== '' && avg < Number(F.min)) return false;
    if (F.max !== '' && avg > Number(F.max)) return false;
    if (F.subs && (F.subs === 'has') !== (m.subs.length > 0)) return false;
    if (F.written && (F.written === '1') !== (r.total > 0)) return false;
    if (F.mine && (F.mine === 'has') !== (r.mine.length > 0)) return false;
    return true;
  }

  function processedView() {
    const q = S.q.trim().toLowerCase();
    const base = allMains().filter(m => (!q || (m.text + ' ' + m.topic).toLowerCase().includes(q)) && (!S.ptype || (S.ptype === 'none' ? !m.ptype : m.ptype === S.ptype)));
    const mains = base.filter(procMatch).filter(m => colMatch(m, S.pcf, PCOL));
    if (S.psort && PCOL[S.psort]) {
      const g = PCOL[S.psort].get, d = S.pdir === 'desc' ? -1 : 1;
      mains.sort((a, b) => { const x = g(a), y = g(b); if (PCOL[S.psort].num) { if (x == null || y == null) return (x == null) - (y == null); return (x - y) * d; } return String(x || '').localeCompare(String(y || ''), 'vi') * d; });
    }
    const rows = mains.map(m => {
      const r = S.report[m.id] || { total: 0, mine: [] };
      const open = S.open.has(m.id);
      return `<tr data-sel="${esc(m.id)}" class="${S.sel.has(m.id) ? 'sel' : ''}"><td class="sk0"><input type="checkbox" class="kb-chk" ${S.sel.has(m.id) ? 'checked' : ''}></td>
        <td>${esc(m.topic)}</td><td style="font-weight:600;color:var(--t-fg2)"><span class="kb-ed" data-edit="${esc(m.kw)}" title="Click đúp để sửa">${esc(m.text)}</span></td><td style="text-align:right">${num(m.avg)}</td><td style="text-align:center">${m.subs.length}</td><td>${ptCell(m)}</td>
        <td style="text-align:center"><span style="padding:1px 10px;border-radius:10px;background:${r.total ? 'color-mix(in srgb,var(--t-warn) 18%,transparent)' : 'color-mix(in srgb,var(--t-success) 16%,transparent)'};color:${r.total ? 'var(--t-warn)' : 'var(--t-success)'}">${r.total} website</span></td>
        <td><a data-a="detail" data-m="${esc(m.id)}" style="cursor:pointer;color:var(--t-accent)">${r.mine.length ? (open ? '▾' : '▸') + ' ' + r.mine.length + ' của bạn' : '—'}</a></td></tr>
        ${open && r.mine.length ? `<tr class="kb-detail"><td></td><td colspan="7" style="padding:6px 10px 10px">${r.mine.map(d => `<div style="font-size:12px;color:var(--t-fg-muted)">• <b style="color:var(--t-fg)">${esc(d.domain || d.cid)}</b> · ${esc(d.via)} · ${esc(d.status)} — ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--t-accent)">${esc(d.title)}</a>` : esc(d.title)}</div>`).join('')}</td></tr>` : ''}`;
    }).join('');
    return `${procFilters(mains.length, allMains().length)}<div class="kb-scroll" style="overflow:auto;max-height:calc(100vh - 340px);min-height:200px;border:1px solid var(--t-border);border-radius:8px"><table class="kb-tbl"><thead><tr><th class="sk0"><input type="checkbox" class="kb-all"></th>${th('topic', 'Chủ đề')}${th('text', 'Từ khóa chính')}${th('avg', 'Lượt tìm/tháng')}${th('subs', 'Phụ')}${th('ptype', 'Loại bài')}${th('written', 'Đã viết (cả 2 tài khoản)', 'Tổng số website của cả 2 tài khoản đã có bài/kế hoạch khớp từ khóa chính')}${th('mine', 'Website của tài khoản này')}</tr></thead><tbody>${rows || `<tr><td colspan="8" style="padding:16px;color:var(--t-fg-muted)">${allMains().length ? 'Không có từ khóa chính nào khớp bộ lọc' : 'Chưa có từ khóa chính nào được xử lý'}</td></tr>`}</tbody></table></div>`;
  }

  function colMatch(m, cf, defs) {
    for (const col in cf) {
      const sp = cf[col], d = defs[col];
      if (!d) continue;
      const v = d.get(m);
      if (d.num && (sp.min !== undefined || sp.max !== undefined)) {
        if (v == null) return false;
        if (sp.min !== undefined && v < sp.min) return false;
        if (sp.max !== undefined && v > sp.max) return false;
      }
      const fv = v == null ? '' : String(v);
      if (sp.q && !fold(fv).includes(fold(sp.q))) return false;
      if (sp.vals && !sp.vals.includes(fv)) return false;
      if (sp.not && sp.not.includes(fv)) return false;
    }
    return true;
  }

  function localFacets(col, search) {
    const cf = Object.assign({}, S.pcf); delete cf[col];
    const q = S.q.trim().toLowerCase(), fs = fold(search), cnt = new Map(), nums = [];
    allMains().filter(m => (!q || (m.text + ' ' + m.topic).toLowerCase().includes(q)) && (!S.ptype || (S.ptype === 'none' ? !m.ptype : m.ptype === S.ptype)) && procMatch(m) && colMatch(m, cf, PCOL)).forEach(m => {
      const v = PCOL[col].get(m);
      if (PCOL[col].num && v != null) nums.push(v);
      const fv = v == null ? '' : String(v);
      if (fs && !fold(fv).includes(fs)) return;
      cnt.set(fv, (cnt.get(fv) || 0) + 1);
    });
    const vals = [...cnt].map(([v, n]) => ({ v, n }));
    vals.sort(PCOL[col].num ? (a, b) => (a.v === '') - (b.v === '') || Number(b.v) - Number(a.v) : (a, b) => (a.v === '') - (b.v === '') || b.n - a.n || a.v.localeCompare(b.v, 'vi'));
    return { values: vals.slice(0, 500), more: Math.max(0, vals.length - 500), min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null };
  }

  function closeFunnel() { const o = document.getElementById('kbFunnel'); if (o) o.remove(); }

  async function openFunnel(col, anchor) {
    closeFunnel();
    const proc = S.view === 'processed', defs = proc ? PCOL : LCOL, def = defs[col];
    if (!def) return;
    const cf = cfNow(), cur = cf[col] || {};
    const isNum = !!def.num, isTime = !!def.time;
    const box = document.createElement('div');
    box.id = 'kbFunnel';
    const r = anchor.getBoundingClientRect();
    box.style.cssText = `position:fixed;z-index:10060;top:${Math.min(r.bottom + 4, window.innerHeight - 440)}px;left:${Math.max(8, Math.min(r.left - 8, window.innerWidth - 300))}px;width:280px;background:var(--t-subtle);border:1px solid var(--t-border);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45);padding:10px;color:var(--t-fg);font-size:12.5px`;
    const so = isNum ? ['Nhỏ → Lớn', 'Lớn → Nhỏ'] : isTime ? ['Cũ → Mới', 'Mới → Cũ'] : ['A → Z', 'Z → A'];
    box.innerHTML = `<div style="font-weight:700;margin-bottom:8px">${esc(def.nl || def.l)}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px"><button data-fs="asc" style="${btn('flex:1')}">↑ ${so[0]}</button><button data-fs="desc" style="${btn('flex:1')}">↓ ${so[1]}</button></div>
      ${isNum ? `<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input class="fn-min" type="number" placeholder="từ" value="${cur.min ?? ''}" style="${inp};width:100%"><span>–</span><input class="fn-max" type="number" placeholder="đến" value="${cur.max ?? ''}" style="${inp};width:100%"></div><div class="fn-range" style="font-size:11px;color:var(--t-fg-muted);margin:-4px 0 8px"></div>` : ''}
      <input class="fn-q" placeholder="🔍 Tìm giá trị…" value="${esc(cur.q || '')}" style="${inp};width:100%;margin-bottom:6px">
      <div class="fn-list" style="max-height:220px;overflow:auto;border:1px solid var(--t-border);border-radius:6px;background:var(--t-canvas)"><div style="padding:8px;color:var(--t-fg-muted)">Đang tải…</div></div>
      <div class="fn-note" style="font-size:11px;color:var(--t-fg-muted);margin-top:4px"></div>
      <div style="display:flex;gap:6px;margin-top:8px"><button class="fn-clear" style="${btn()}">Xóa lọc</button><span style="flex:1"></span><button class="fn-cancel" style="${btn()}">Hủy</button><button class="fn-ok" style="${btn('background:#238636;border-color:#238636;color:#fff')}">Áp dụng</button></div>`;
    document.body.appendChild(box);
    const list = box.querySelector('.fn-list'), qEl = box.querySelector('.fn-q');
    let data = { values: [], more: 0 }, checked = new Map(), seq = 0;
    const isOn = v => cur.vals ? cur.vals.includes(v) : cur.not ? !cur.not.includes(v) : true;
    const paint = () => {
      const all = data.values.length && data.values.every(x => checked.get(x.v));
      list.innerHTML = data.values.length ? `<label style="display:flex;gap:6px;padding:4px 8px;border-bottom:1px solid var(--t-muted);cursor:pointer"><input type="checkbox" class="fn-all" ${all ? 'checked' : ''}><b>(Chọn tất cả${qEl.value.trim() ? ' kết quả tìm' : ''})</b></label>` + data.values.map((x, i) => `<label style="display:flex;gap:6px;align-items:center;padding:3px 8px;cursor:pointer"><input type="checkbox" data-i="${i}" ${checked.get(x.v) ? 'checked' : ''}><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(isNum && x.v !== '' ? num(x.v) : vlabel(col, x.v))}</span><span style="color:var(--t-fg-muted);font-size:11px">${num(x.n)}</span></label>`).join('') : '<div style="padding:8px;color:var(--t-fg-muted)">Không có giá trị</div>';
      box.querySelector('.fn-note').textContent = data.more ? `Hiện 500/${num(data.values.length + data.more)} giá trị — gõ ô tìm để thu hẹp` : '';
      const rg = box.querySelector('.fn-range');
      if (rg) rg.textContent = data.min != null ? `Khoảng hiện có: ${num(data.min)} – ${num(data.max)}` : '';
    };
    const fetchVals = async () => {
      const my = ++seq, search = qEl.value.trim();
      let d;
      try {
        d = proc ? localFacets(col, search) : await api('facets', { view: S.view, col, q: S.q, ptype: S.ptype, dup: S.view === 'unprocessed' && S.dup, filters: cf, search });
      } catch (e) { list.innerHTML = `<div style="padding:8px;color:var(--t-danger)">${esc(e.message)}</div>`; return; }
      if (my !== seq) return;
      data = d;
      checked = new Map(d.values.map(x => [x.v, search ? true : isOn(x.v)]));
      paint();
    };
    let tq = null;
    qEl.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(fetchVals, 250); });
    list.addEventListener('change', e => {
      if (e.target.classList.contains('fn-all')) { data.values.forEach(x => checked.set(x.v, e.target.checked)); return paint(); }
      const i = e.target.dataset.i;
      if (i !== undefined) { checked.set(data.values[i].v, e.target.checked); paint(); }
    });
    const commit = spec => {
      if (spec && Object.keys(spec).length) cf[col] = spec; else delete cf[col];
      closeFunnel(); S.sel.clear();
      return proc ? draw() : load();
    };
    box.querySelector('.fn-cancel').onclick = closeFunnel;
    box.querySelector('.fn-clear').onclick = () => commit(null);
    box.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => {
      if (proc) { S.psort = col; S.pdir = b.dataset.fs; } else { S.sort = col; S.dir = b.dataset.fs; }
      closeFunnel(); return proc ? draw() : load();
    });
    box.querySelector('.fn-ok').onclick = () => {
      const spec = {};
      if (isNum) {
        const a = box.querySelector('.fn-min').value, b = box.querySelector('.fn-max').value;
        if (a !== '') spec.min = Number(a);
        if (b !== '') spec.max = Number(b);
      }
      const search = qEl.value.trim(), on = data.values.filter(x => checked.get(x.v)).map(x => x.v), off = data.values.filter(x => !checked.get(x.v)).map(x => x.v);
      if (search) {
        if (!on.length) { say('Chưa tick giá trị nào', '#e67e22'); return; }
        if (!off.length && !data.more) spec.q = search; else spec.vals = on;
      } else if (off.length) {
        if (!on.length) { say('Chưa tick giá trị nào', '#e67e22'); return; }
        if (data.more || off.length < on.length) spec.not = off; else spec.vals = on;
      }
      return commit(spec);
    };
    setTimeout(() => document.addEventListener('mousedown', function h(e) { if (!document.getElementById('kbFunnel')) return document.removeEventListener('mousedown', h, true); if (!box.contains(e.target)) { closeFunnel(); document.removeEventListener('mousedown', h, true); } }, true), 0);
    fetchVals();
    qEl.focus();
  }

  function editKw(el) {
    if (el.querySelector('input')) return;
    const id = el.dataset.edit, old = el.textContent;
    const w = Math.max(160, el.getBoundingClientRect().width + 40);
    el.innerHTML = `<input class="kb-edin" value="${esc(old)}" style="${inp};width:${w}px;font-weight:600">`;
    const ip = el.querySelector('input');
    ip.focus(); ip.select();
    let done = false;
    const finish = async save => {
      if (done) return; done = true;
      const v = ip.value.replace(/\s+/g, ' ').trim();
      if (!save || !v || v === old) { el.textContent = old; return; }
      el.textContent = v;
      try { await api('assign', { action: 'rename', kw_ids: [id], text: v }); say(`✓ Đã sửa "${old}" → "${v}"`); await load(); }
      catch (e) { el.textContent = old; fail(e); }
    };
    ip.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    ip.addEventListener('blur', () => finish(true));
    ip.addEventListener('mousedown', e => e.stopPropagation());
    ip.addEventListener('dblclick', e => e.stopPropagation());
  }

  function draw() {
    if (!root) return;
    const same = root.dataset.v === S.view;
    const old = root.querySelector('.kb-scroll');
    const keep = same && old ? [old.scrollTop, old.scrollLeft] : null;
    const anc = [];
    for (let p = root.parentElement; p; p = p.parentElement) if (p.scrollTop) anc.push([p, p.scrollTop]);
    const wy = window.scrollY;
    const ae = document.activeElement;
    const af = ae && root.contains(ae) && ae.classList.contains('kb-f') ? ae.dataset.f : '';
    const c = S.counts || {};
    const body = S.view === 'topics' ? topicsView() : S.view === 'processed' ? processedView() : kwTable(S.items, S.view === 'excluded');
    const showSearch = S.view !== 'topics';
    root.innerHTML = `<style>
      .kb-tbl{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;user-select:none}
      .kb-tbl th,.kb-tbl td{white-space:nowrap;padding:6px 10px;border-bottom:1px solid var(--t-muted);text-align:left;background:var(--t-canvas)}
      .kb-tbl thead th{position:sticky;top:0;z-index:2;background:var(--t-subtle);color:var(--t-fg-muted);font-weight:600;font-size:11.5px}
      .kb-tbl .sk0{width:20px}
      .kb-tbl tbody tr[data-sel]{cursor:pointer}.kb-tbl tbody tr[data-sel]:hover td{background:var(--t-subtle)}
      .kb-tbl tbody tr.sel td{background:color-mix(in srgb,var(--t-accent) 14%,var(--t-canvas))}
    </style>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:16px;color:var(--t-fg2)">🔑 Kho từ khóa</b>
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button data-a="newtopic" style="${btn()}">＋ Chủ đề</button><button data-a="import" style="${btn('background:#1f6feb;border-color:#1f6feb;color:#fff')}">📥 Nhập CSV Keyword Planner</button><input type="file" id="kbFile" accept=".csv,.tsv,.txt" style="display:none"></span></div>
      ${S.busy ? `<div style="font-size:12px;color:var(--t-warn)">${esc(S.busy)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${chip('Chưa xử lý', c.unprocessed, 'unprocessed', 'var(--t-fg)')}${chip('Chủ đề', c.topics, 'topics', 'var(--t-fg)')}${chip('Đã xử lý', c.mains, 'processed', 'var(--t-success)')}${chip('Đã loại', c.excluded, 'excluded', 'var(--t-fg-muted)')}</div>
      ${showSearch ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="kb-q" value="${esc(S.q)}" placeholder="🔍 Tìm từ khóa…" style="${inp};width:260px"><select class="kb-ptype" style="${inp}"><option value="">Loại bài: tất cả</option><option value="post" ${S.ptype === 'post' ? 'selected' : ''}>Post</option><option value="page" ${S.ptype === 'page' ? 'selected' : ''}>Page</option><option value="category" ${S.ptype === 'category' ? 'selected' : ''}>Mô tả danh mục</option><option value="none" ${S.ptype === 'none' ? 'selected' : ''}>Chưa có loại</option></select>${S.view === 'unprocessed' || S.view === 'excluded' ? `<select class="kb-sort" style="${inp}"><option value="t" ${S.sort === 't' && S.dir !== 'asc' ? 'selected' : ''}>Mới nhập lên đầu</option><option value="avg" ${S.sort === 'avg' && S.dir !== 'asc' ? 'selected' : ''}>Lượt tìm giảm dần</option><option value="text" ${S.sort === 'text' && S.dir !== 'desc' ? 'selected' : ''}>A → Z</option>${(S.sort === 't' && S.dir === 'asc') || (S.sort === 'avg' && S.dir === 'asc') || (S.sort === 'text' && S.dir === 'desc') || !['t', 'avg', 'text'].includes(S.sort) ? `<option value="" selected>Theo cột: ${esc((LCOL[S.sort] || {}).l || S.sort)} ${S.dir === 'desc' ? '↓' : '↑'}</option>` : ''}</select>${S.view === 'unprocessed' ? `<button data-a="dup" title="Lọc trùng: mỗi từ khóa 1 dòng. Không lọc trùng: mỗi lần nhập 1 dòng (kèm nguồn)" style="${btn(S.dup ? 'border-color:var(--t-warn);color:var(--t-warn)' : '')}">${S.dup ? '🔁 Lọc trùng: Tắt' : '🔂 Lọc trùng: Bật'}</button>` : ''}<span style="font-size:12px;color:var(--t-fg-muted)">${num(S.total)} ${S.dup && S.view === 'unprocessed' ? 'dòng' : 'từ khóa'} · bấm giữ và kéo để chọn nhanh · click đúp để sửa từ khóa</span>${Object.keys(cfNow()).length ? `<button data-a="cfclear" style="${btn('padding:3px 9px;color:var(--t-accent);border-color:var(--t-accent)')}">✕ Bỏ lọc cột (${Object.keys(cfNow()).length})</button>` : ''}` : '<span style="font-size:12px;color:var(--t-fg-muted)">Bấm giữ và kéo để chọn nhanh nhiều từ khóa chính · click đúp để sửa từ khóa</span>'}${Object.keys(cfNow()).length ? `<button data-a="cfclear" style="${btn('padding:3px 9px;color:var(--t-accent);border-color:var(--t-accent)')}">✕ Bỏ lọc cột (${Object.keys(cfNow()).length})</button>` : ''}</div>` : ''}
      ${body}
      <div id="kbBar" style="display:none;position:sticky;bottom:8px;z-index:6;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px;border-radius:8px;border:1px solid color-mix(in srgb,var(--t-warn) 40%,var(--t-border));background:var(--t-subtle);box-shadow:0 4px 16px rgba(0,0,0,.4)"></div></div>`;
    root.dataset.v = S.view;
    bar();
    if (same) {
      const sc = root.querySelector('.kb-scroll');
      if (sc && keep) { sc.scrollTop = keep[0]; sc.scrollLeft = keep[1]; }
      anc.forEach(([p, t]) => { p.scrollTop = t; });
      if (window.scrollY !== wy) window.scrollTo(window.scrollX, wy);
    }
    if (af) { const fe = root.querySelector(`.kb-f[data-f="${af}"]`); if (fe) fe.focus({ preventScroll: true }); }
  }

  function applyRow(tr, on) {
    const id = tr.dataset.sel;
    if (!id) return;
    if (on) S.sel.add(id); else S.sel.delete(id);
    root.querySelectorAll(`tr[data-sel="${CSS.escape(id)}"]`).forEach(x => { x.classList.toggle('sel', on); const cb = x.querySelector('.kb-chk'); if (cb) cb.checked = on; });
  }

  function mount() {
    root.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const tr = e.target.closest('tr[data-sel]');
      if (!tr || e.target.closest('a,button,select,input:not(.kb-chk),textarea')) return;
      e.preventDefault();
      const id = tr.dataset.sel;
      if (e.shiftKey && S.anchor) {
        const trs = [...root.querySelectorAll('tr[data-sel]')];
        const a = trs.findIndex(x => x.dataset.sel === S.anchor), b = trs.findIndex(x => x === tr);
        if (a >= 0 && b >= 0) trs.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => applyRow(x, true));
        bar();
        return;
      }
      drag = { on: !S.sel.has(id), last: tr };
      S.anchor = id;
      applyRow(tr, drag.on);
      bar();
    });
    root.addEventListener('mouseover', e => {
      if (!drag) return;
      const tr = e.target.closest('tr[data-sel]');
      if (!tr || tr === drag.last) return;
      const trs = [...root.querySelectorAll('tr[data-sel]')];
      const a = trs.indexOf(drag.last), b = trs.indexOf(tr);
      if (a >= 0 && b >= 0) trs.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => applyRow(x, drag.on));
      else applyRow(tr, drag.on);
      drag.last = tr;
      bar();
    });
    document.addEventListener('mouseup', () => { drag = null; });
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.classList.contains('kb-f') && t.type === 'number') {
        S.f[t.dataset.f] = t.value === '' ? '' : String(Math.max(0, Math.round(Number(t.value) || 0)));
        S.sel.clear();
        clearTimeout(mount.tf);
        mount.tf = setTimeout(draw, 350);
        return;
      }
      if (e.target.classList.contains('kb-q')) {
        S.q = e.target.value;
        clearTimeout(mount.t);
        mount.t = setTimeout(() => { const pos = e.target.selectionStart; load().then(() => { const q = root.querySelector('.kb-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }); }, 300);
      }
    });
    root.addEventListener('change', async e => {
      const t = e.target;
      if (t.classList.contains('kb-sort')) { if (!t.value) return; S.sort = t.value; S.dir = ''; return load(); }
      if (t.classList.contains('kb-ptype')) { S.ptype = t.value; return load(); }
      if (t.classList.contains('kb-setpt')) {
        const v = t.value;
        if (!v) return;
        const ids = S.view === 'processed' ? [...S.sel].map(id => (allMains().find(m => m.id === id) || {}).kw).filter(Boolean) : [...S.sel];
        try { await api('assign', { action: 'set_ptype', kw_ids: ids, ptype: v === '__clear' ? '' : v }); S.sel.clear(); await load(); } catch (e) { fail(e); }
        return;
      }
      if (t.classList.contains('kb-f')) {
        if (t.type === 'number') return;
        S.f[t.dataset.f] = t.value; S.sel.clear(); draw();
        return;
      }
      if (t.classList.contains('kb-site')) { S.siteId = t.value; return; }
      if (t.classList.contains('kb-topic')) {
        if (t.value === '__new') { const id = await newTopic(); S.topicId = id || ''; draw(); return; }
        S.topicId = t.value; return;
      }
      if (t.classList.contains('kb-all')) {
        root.querySelectorAll('tr[data-sel]').forEach(tr => applyRow(tr, t.checked));
        bar();
      }
      if (t.id === 'kbFile' && t.files && t.files[0]) {
        const f = t.files[0]; t.value = '';
        try { await importFile(f); } catch (err) { S.busy = ''; fail(err); draw(); }
      }
    });
    root.addEventListener('dblclick', e => {
      const ed = e.target.closest('.kb-ed');
      if (ed && root.contains(ed)) { e.preventDefault(); editKw(ed); }
    });
    root.addEventListener('click', async e => {
      const fc = e.target.closest('[data-fcol]');
      if (fc) { e.stopPropagation(); return openFunnel(fc.dataset.fcol, fc); }
      const el = e.target.closest('[data-a]');
      if (!el) return;
      const a = el.dataset.a;
      try {
        switch (a) {
          case 'view': S.view = el.dataset.v; S.sel.clear(); S.limit = 200; S.q = ''; return load();
          case 'import': return root.querySelector('#kbFile').click();
          case 'more': S.limit += 200; return load();
          case 'all': S.limit = Math.max(S.limit, S.total); return load();
          case 'selnone': S.sel.clear(); return draw();
          case 'dup': S.dup = !S.dup; S.sel.clear(); return load();
          case 'cfclear': if (S.view === 'processed') { S.pcf = {}; S.psort = ''; return draw(); } S.cf[S.view] = {}; S.sel.clear(); return load();
          case 'fclear': S.f = { topic: '', min: '', max: '', subs: '', written: '', mine: '' }; S.sel.clear(); return draw();
          case 'newtopic': { const id = await newTopic(); if (id) { say('✓ Đã tạo chủ đề'); S.view = 'topics'; await load(); } return; }
          case 'tomain': {
            let tid = S.topicId;
            if (!tid) { say('Chọn chủ đề trước', '#e67e22'); return; }
            return assign('main', { topic_id: tid });
          }
          case 'tosub': return pickMains(ids => assign('sub', { main_ids: ids }));
          case 'meaningless': return assign('label', { label: 'meaningless' });
          case 'dropped': return assign('label', { label: 'dropped' });
          case 'restore': return assign('restore');
          case 'purge': {
            const n = S.sel.size;
            if (!n || !confirm(`Xóa vĩnh viễn ${n} từ khóa khỏi kho?\n\nKhông khôi phục được. Lần nhập CSV sau, các từ này sẽ tự bị bỏ qua (chỉ thêm lại được bằng cách gõ tay làm từ khóa chính).`)) return;
            await api('assign', { action: 'delete', kw_ids: [...S.sel] });
            S.sel.clear();
            say(`✓ Đã xóa vĩnh viễn ${n} từ khóa`);
            return load();
          }
          case 'toplan': return addToPlan();
          case 'write': return writeDialog();
          case 'merge': return mergeMains();
          case 'unmain': {
            const ids = [...S.sel];
            if (!ids.length || !confirm(`Bỏ ${ids.length} từ khóa chính về Chưa xử lý? Từ khóa phụ của chúng cũng về Chưa xử lý (nếu không thuộc từ khóa chính khác).`)) return;
            await api('assign', { action: 'remove_main', main_ids: ids });
            S.sel.clear();
            say(`✓ Đã bỏ ${ids.length} từ khóa chính về Chưa xử lý`);
            return load();
          }
          case 'detail': { const m = el.dataset.m; S.open.has(m) ? S.open.delete(m) : S.open.add(m); return draw(); }
          case 'addmain': {
            const text = prompt('Từ khóa chính mới (gõ tay):');
            if (!text || !text.trim()) return;
            await api('assign', { action: 'add_text', text, topic_id: el.dataset.t });
            return load();
          }
          case 'addsub': return pickSubs(el.dataset.m);
          case 'rmmain': if (!confirm('Gỡ từ khóa chính này khỏi chủ đề? (các từ khóa phụ của nó sẽ về Chưa xử lý nếu không thuộc từ khóa chính khác)')) return; await api('assign', { action: 'remove_main', main_ids: [el.dataset.m] }); return load();
          case 'swap': if (!confirm('Thay thế từ khóa chính bằng từ khóa phụ này? Từ khóa chính hiện tại sẽ thành từ khóa phụ.')) return; await api('assign', { action: 'swap', main_id: el.dataset.m, kw_ids: [el.dataset.k] }); return load();
          case 'rmsub': await api('assign', { action: 'remove_sub', main_id: el.dataset.m, kw_ids: [el.dataset.k] }); return load();
          case 'mvmain': {
            const opts = S.topics.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
            const pick = prompt('Chuyển sang chủ đề số mấy?\n' + opts);
            const t = S.topics[(parseInt(pick, 10) || 0) - 1];
            if (!t) return;
            await api('assign', { action: 'move_main', main_id: el.dataset.m, topic_id: t.id });
            return load();
          }
          case 'rentopic': {
            const cur = S.topics.find(t => t.id === el.dataset.t);
            const name = prompt('Tên chủ đề:', cur ? cur.name : '');
            if (!name || !name.trim()) return;
            await api('topic', { op: 'rename', id: el.dataset.t, name });
            return load();
          }
          case 'deltopic': if (!confirm('Xoá chủ đề này? (chỉ xoá được khi chủ đề không còn từ khóa chính)')) return; await api('topic', { op: 'delete', id: el.dataset.t }); return load();
        }
      } catch (err) { fail(err); }
    });
  }

  window.kbInit = function () {
    const page = document.getElementById('page-kwbank');
    if (!page) return;
    if (!root) {
      page.innerHTML = '<div id="kbRoot" style="padding:20px"></div>';
      root = page.querySelector('#kbRoot');
      mount();
    }
    load();
  };
})();
