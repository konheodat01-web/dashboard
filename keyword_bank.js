(function () {
  const API = '/api/sw-kw/';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = n => (n == null || n === '') ? '—' : (Number(n) || 0).toLocaleString('vi-VN');
  const btn = extra => `background:var(--t-muted);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;${extra || ''}`;
  const inp = 'background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit';
  const S = { view: 'unprocessed', q: '', sort: 'avg', items: [], total: 0, counts: {}, topics: [], sel: new Set(), anchor: null, report: {}, open: new Set(), limit: 200, busy: '', siteId: '', topicId: '' };
  let root = null, drag = null, loadSeq = 0;
  const PAGE = 1000;

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
  const allMains = () => S.topics.flatMap(t => t.mains.map(m => ({ id: m.id, topic: t.name, text: m.kw.text, avg: m.kw.avg, subs: m.subs })));

  async function load() {
    const seq = ++loadSeq;
    try {
      if (S.view === 'unprocessed' || S.view === 'excluded') {
        let items = [], d = null;
        for (let off = 0; off < S.limit; off += PAGE) {
          const n = Math.min(PAGE, S.limit - off);
          d = await api('list', { view: S.view, q: S.q, sort: S.sort, offset: off, limit: n });
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
    const tot = { added: 0, existing: 0, excluded: 0, invalid: 0 };
    for (let i = 0; i < data.length; i += 4000) {
      S.busy = `Đang nhập ${Math.min(i + 4000, data.length)}/${data.length}…`; draw();
      const r = await api('import', { rows: data.slice(i, i + 4000) });
      Object.keys(tot).forEach(k => { tot[k] += r[k] || 0; });
    }
    S.busy = '';
    say(`✓ Nhập ${data.length} dòng: thêm mới ${tot.added} · đã có ${tot.existing} · đã loại (vô nghĩa/bỏ) ${tot.excluded}${tot.invalid ? ' · lỗi ' + tot.invalid : ''}`);
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
        <button data-a="meaningless" style="${btn('color:var(--t-warn)')}">🚫 Vô nghĩa</button>
        <button data-a="dropped" style="${btn('color:var(--t-danger)')}">✕ Bỏ</button>
        <button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}">Bỏ chọn</button>`;
    } else if (S.view === 'excluded') {
      el.innerHTML = `<b style="font-size:12.5px">${n} từ khóa đã chọn</b><button data-a="restore" style="${btn()}">↩ Khôi phục về chưa xử lý</button><button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}">Bỏ chọn</button>`;
    } else if (S.view === 'processed') {
      const so = sites().map(x => `<option value="${esc(x.id)}" ${String(S.siteId) === String(x.id) ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
      el.innerHTML = `<b style="font-size:12.5px">${n} từ khóa chính đã chọn</b>
        <select class="kb-site" style="${inp};max-width:320px"><option value="">Chọn website…</option>${so}</select>
        <button data-a="toplan" style="${btn('background:#1f6feb;border-color:#1f6feb;color:#fff')}">➕ Thêm vào kế hoạch của website</button>
        <button data-a="unmain" style="${btn()}">↩ Bỏ về Chưa xử lý</button>
        <button data-a="selnone" style="${btn('margin-left:auto;padding:3px 9px')}">Bỏ chọn</button>`;
    }
  }

  function chip(label, n, view, col) {
    return `<span role="button" tabindex="0" data-a="view" data-v="${view}" style="display:inline-flex;gap:6px;align-items:center;padding:5px 12px;border-radius:16px;border:1px solid ${S.view === view ? 'var(--t-accent)' : 'var(--t-border)'};background:${S.view === view ? 'color-mix(in srgb,var(--t-accent) 14%,var(--t-canvas))' : 'var(--t-canvas)'};cursor:pointer;font-size:12.5px;color:${col}">${label} <b>${num(n)}</b></span>`;
  }

  function kwTable(items, withLabel) {
    const head = `<th class="sk0"><input type="checkbox" class="kb-all"></th><th>Từ khóa</th><th>Lượt tìm/tháng</th><th>Cạnh tranh</th><th>Giá thầu (thấp–cao)</th><th>3 tháng</th><th>Cùng kỳ</th>${withLabel ? '<th>Nhãn</th>' : ''}`;
    const body = items.map(k => `<tr data-sel="${esc(k.id)}" class="${S.sel.has(k.id) ? 'sel' : ''}"><td class="sk0"><input type="checkbox" class="kb-chk" ${S.sel.has(k.id) ? 'checked' : ''}></td>
      <td style="font-weight:600;color:var(--t-fg2)">${esc(k.text)}</td><td style="text-align:right">${num(k.avg)}</td><td>${esc(k.comp)}</td>
      <td>${k.bid_lo == null && k.bid_hi == null ? '—' : esc((k.bid_lo ?? '') + ' – ' + (k.bid_hi ?? ''))}</td><td>${esc(k.chg3)}</td><td>${esc(k.chgy)}</td>
      ${withLabel ? `<td>${k.label === 'dropped' ? '✕ Bỏ' : '🚫 Vô nghĩa'}</td>` : ''}</tr>`).join('');
    return `<div class="kb-scroll" style="overflow:auto;max-height:calc(100vh - 300px);min-height:200px;border:1px solid var(--t-border);border-radius:8px"><table class="kb-tbl"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="9" style="padding:16px;color:var(--t-fg-muted)">Không có từ khóa nào</td></tr>`}</tbody></table></div>
      ${S.items.length < S.total ? `<div style="margin-top:8px;display:flex;gap:6px"><button data-a="more" style="${btn()}">Hiện thêm (${S.items.length}/${num(S.total)})</button><button data-a="all" style="${btn()}">Hiện tất cả (${num(S.total)})</button></div>` : ''}`;
  }

  function topicsView() {
    const tb = S.topics.map(t => `<div style="border:1px solid var(--t-border);border-radius:10px;padding:10px 12px;background:var(--t-canvas)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="font-size:14px;color:var(--t-fg2)">📁 ${esc(t.name)}</b><span style="font-size:12px;color:var(--t-fg-muted)">${t.mains.length} từ khóa chính</span>
        <span style="margin-left:auto;display:flex;gap:6px"><button data-a="addmain" data-t="${esc(t.id)}" style="${btn()}">＋ Từ khóa chính</button><button data-a="rentopic" data-t="${esc(t.id)}" style="${btn()}">✏️</button><button data-a="deltopic" data-t="${esc(t.id)}" style="${btn('color:var(--t-danger)')}">🗑</button></span></div>
      ${t.mains.map(m => `<div style="border-top:1px solid var(--t-muted);padding:8px 0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="color:var(--t-warn)">★</span><b style="color:var(--t-fg2)">${esc(m.kw.text)}</b><span style="font-size:12px;color:var(--t-fg-muted)">${num(m.kw.avg)}/tháng</span>
          <span style="margin-left:auto;display:flex;gap:6px"><button data-a="addsub" data-m="${esc(m.id)}" style="${btn()}">＋ Từ khóa phụ</button><button data-a="mvmain" data-m="${esc(m.id)}" style="${btn()}">⇄ Chuyển chủ đề</button><button data-a="rmmain" data-m="${esc(m.id)}" style="${btn()}">↩ Gỡ</button></span></div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${m.subs.map(s => `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--t-subtle3);border:1px solid var(--t-border);border-radius:12px;padding:2px 4px 2px 10px;font-size:12px">${esc(s.text)} <span style="color:var(--t-fg-muted)">${num(s.avg)}</span>
          <a data-a="swap" data-m="${esc(m.id)}" data-k="${esc(s.id)}" title="Thay thế từ khóa chính (từ khóa chính hiện tại thành từ khóa phụ)" style="cursor:pointer;color:var(--t-accent);padding:0 3px">⇄</a>
          <a data-a="rmsub" data-m="${esc(m.id)}" data-k="${esc(s.id)}" title="Gỡ khỏi từ khóa chính" style="cursor:pointer;color:var(--t-fg-muted);padding:0 4px">✕</a></span>`).join('') || '<span style="font-size:12px;color:var(--t-fg-subtle)">Chưa có từ khóa phụ</span>'}</div></div>`).join('') || '<div style="font-size:12px;color:var(--t-fg-subtle)">Chưa có từ khóa chính — vào "Chưa xử lý" chọn từ khóa rồi bấm ★, hoặc bấm ＋ Từ khóa chính để gõ tay.</div>'}</div>`).join('');
    return `<div style="display:flex;flex-direction:column;gap:12px">${tb || '<div style="color:var(--t-fg-muted)">Chưa có chủ đề nào — bấm "＋ Chủ đề" để tạo.</div>'}</div>`;
  }

  function processedView() {
    const q = S.q.trim().toLowerCase();
    const mains = allMains().filter(m => !q || (m.text + ' ' + m.topic).toLowerCase().includes(q));
    const rows = mains.map(m => {
      const r = S.report[m.id] || { total: 0, mine: [] };
      const open = S.open.has(m.id);
      return `<tr data-sel="${esc(m.id)}" class="${S.sel.has(m.id) ? 'sel' : ''}"><td class="sk0"><input type="checkbox" class="kb-chk" ${S.sel.has(m.id) ? 'checked' : ''}></td>
        <td>${esc(m.topic)}</td><td style="font-weight:600;color:var(--t-fg2)">${esc(m.text)}</td><td style="text-align:right">${num(m.avg)}</td><td style="text-align:center">${m.subs.length}</td>
        <td style="text-align:center"><span style="padding:1px 10px;border-radius:10px;background:${r.total ? 'color-mix(in srgb,var(--t-warn) 18%,transparent)' : 'color-mix(in srgb,var(--t-success) 16%,transparent)'};color:${r.total ? 'var(--t-warn)' : 'var(--t-success)'}">${r.total} website</span></td>
        <td><a data-a="detail" data-m="${esc(m.id)}" style="cursor:pointer;color:var(--t-accent)">${r.mine.length ? (open ? '▾' : '▸') + ' ' + r.mine.length + ' của bạn' : '—'}</a></td></tr>
        ${open && r.mine.length ? `<tr class="kb-detail"><td></td><td colspan="6" style="padding:6px 10px 10px">${r.mine.map(d => `<div style="font-size:12px;color:var(--t-fg-muted)">• <b style="color:var(--t-fg)">${esc(d.domain || d.cid)}</b> · ${esc(d.via)} · ${esc(d.status)} — ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--t-accent)">${esc(d.title)}</a>` : esc(d.title)}</div>`).join('')}</td></tr>` : ''}`;
    }).join('');
    return `<div class="kb-scroll" style="overflow:auto;max-height:calc(100vh - 300px);min-height:200px;border:1px solid var(--t-border);border-radius:8px"><table class="kb-tbl"><thead><tr><th class="sk0"><input type="checkbox" class="kb-all"></th><th>Chủ đề</th><th>Từ khóa chính</th><th>Lượt tìm/tháng</th><th>Phụ</th><th title="Tổng số website của cả 2 tài khoản đã có bài/kế hoạch khớp từ khóa chính">Đã viết (cả 2 tài khoản)</th><th>Website của tài khoản này</th></tr></thead><tbody>${rows || `<tr><td colspan="7" style="padding:16px;color:var(--t-fg-muted)">Chưa có từ khóa chính nào được xử lý</td></tr>`}</tbody></table></div>`;
  }

  function draw() {
    if (!root) return;
    const same = root.dataset.v === S.view;
    const old = root.querySelector('.kb-scroll');
    const keep = same && old ? [old.scrollTop, old.scrollLeft] : null;
    const anc = [];
    for (let p = root.parentElement; p; p = p.parentElement) if (p.scrollTop) anc.push([p, p.scrollTop]);
    const wy = window.scrollY;
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
      ${showSearch ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="kb-q" value="${esc(S.q)}" placeholder="🔍 Tìm từ khóa…" style="${inp};width:260px">${S.view === 'unprocessed' || S.view === 'excluded' ? `<select class="kb-sort" style="${inp}"><option value="avg" ${S.sort === 'avg' ? 'selected' : ''}>Lượt tìm giảm dần</option><option value="text" ${S.sort === 'text' ? 'selected' : ''}>A → Z</option></select><span style="font-size:12px;color:var(--t-fg-muted)">${num(S.total)} từ khóa · bấm giữ và kéo để chọn nhanh</span>` : '<span style="font-size:12px;color:var(--t-fg-muted)">Bấm giữ và kéo để chọn nhanh nhiều từ khóa chính</span>'}</div>` : ''}
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
  }

  function applyRow(tr, on) {
    const id = tr.dataset.sel;
    if (!id) return;
    if (on) S.sel.add(id); else S.sel.delete(id);
    tr.classList.toggle('sel', on);
    const cb = tr.querySelector('.kb-chk');
    if (cb) cb.checked = on;
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
      if (e.target.classList.contains('kb-q')) {
        S.q = e.target.value;
        clearTimeout(mount.t);
        mount.t = setTimeout(() => { const pos = e.target.selectionStart; load().then(() => { const q = root.querySelector('.kb-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }); }, 300);
      }
    });
    root.addEventListener('change', async e => {
      const t = e.target;
      if (t.classList.contains('kb-sort')) { S.sort = t.value; return load(); }
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
    root.addEventListener('click', async e => {
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
          case 'toplan': return addToPlan();
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
