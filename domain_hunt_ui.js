(function () {
  const API = '/api/domain-hunt/';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const btn = extra => `background:var(--t-muted);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;${extra || ''}`;
  const pri = 'background:var(--t-accent);color:#fff;border-color:var(--t-accent)';
  const VIEWS = [
    ['pass', '📥 Kho chờ', 'Đạt kiểm subdomain, chờ bạn nhận'],
    ['mine', '✅ Kho của tôi', 'Domain bạn đã nhận'],
    ['queue', '⏳ Hàng chờ kiểm', 'Đang chờ / đang kiểm Wayback'],
    ['fail', '✖ Không đạt', 'Không đủ 3–5 subdomain có nội dung · tự xoá sau 24 giờ nếu không phá lệ'],
    ['err', '⚠️ Lỗi', 'Wayback lỗi, tự kiểm lại sau 30 phút (tối đa 3 lần)'],
  ];
  const S = { view: 'pass', q: '', items: [], counts: {}, worker: {}, opt: {}, sel: new Set(), last: null, timer: null, seq: 0, busy: false, xf: {}, sort: { k: 'chk', dir: -1 }, headKey: '', skew: 0 };
  let root = null;

  async function api(p, body) {
    const r = await fetch(API + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.detail || d.error || ('Lỗi ' + r.status));
    return d;
  }
  const say = (msg, col) => { if (typeof toast === 'function') toast(msg, col || '#238636', 3500); };
  const fail = e => say('⚠️ ' + (e && e.message || e), '#e74c3c');

  function parseCsv(txt) {
    const rows = [];
    let row = [], cell = '', q = false;
    txt = String(txt || '').replace(/^﻿/, '');
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) {
        if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && txt[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(x => x.trim())) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(x => x.trim())) rows.push(row);
    return rows;
  }

  function fromNamecheap(txt) {
    const rows = parseCsv(txt);
    if (!rows.length) return { rows: [], taken: 0 };
    const h = rows[0].map(x => x.trim().toLowerCase());
    const col = n => h.indexOf(n);
    let iD = col('domain'), iA = col('available'), iP = col('premium'), iPr = col('price');
    let body = rows.slice(1);
    if (iD < 0) { iD = 0; body = rows; iA = iP = iPr = -1; }
    let taken = 0;
    const out = [];
    body.forEach(r => {
      const d = String(r[iD] || '').trim();
      if (!d) return;
      if (iA >= 0 && String(r[iA] || '').trim().toLowerCase() !== 'available') { taken++; return; }
      out.push({ d, premium: iP >= 0 && /premium/i.test(r[iP] || ''), price: iPr >= 0 ? String(r[iPr] || '').trim() : '' });
    });
    return { rows: out, taken };
  }

  async function importFiles(files) {
    let all = [], taken = 0, names = [];
    for (const f of files) {
      const r = fromNamecheap(await f.text());
      all = all.concat(r.rows);
      taken += r.taken;
      names.push(f.name);
    }
    if (!all.length) { say(`Không có domain còn trống nào trong file (bỏ ${taken} domain đã có chủ)`, '#d29922'); return; }
    try {
      const d = await api('import', { rows: all, src: names.join(', ') });
      say(`Thêm ${d.added} domain vào hàng chờ kiểm · bỏ ${taken} đã có chủ · ${d.dup} đã có sẵn${d.bad ? ' · ' + d.bad + ' sai định dạng' : ''}`);
      await load();
    } catch (e) { fail(e); }
  }

  const priceNum = it => { const m = String(it.price || '').replace(/,/g, '').match(/[\d.]+/); return m ? Number(m[0]) : null; };
  const pad = n => String(n).padStart(2, '0');
  const hourKey = t => { if (!t) return '(Trống)'; const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:00–${pad(d.getHours() + 1 > 23 ? 0 : d.getHours() + 1)}:00`; };
  const leftMs = it => (S.opt.failTtl || 86400000) - (Date.now() + S.skew - (it.chk || 0));
  const leftKey = it => { const h = Math.floor(leftMs(it) / 3600000); return h < 1 ? 'còn dưới 1 giờ' : `còn ${h} giờ`; };
  const COLS = {
    d: { label: 'Domain', kind: 'text', key: it => it.d, sort: it => it.d },
    price: { label: 'Giá', kind: 'num', key: it => it.price ? it.price + (it.premium ? ' · premium' : '') : (it.premium ? '(Trống) · premium' : '(Trống)'), sort: priceNum },
    sub: { label: 'Sub', kind: 'num', key: it => String((it.subs || []).length), sort: it => (it.subs || []).length },
    why: { label: 'Lý do · subdomain có nội dung', kind: 'text', key: it => it.reason || '(Trống)', sort: it => it.reason || '' },
    chk: { label: 'Kiểm lúc', kind: 'time', key: it => hourKey(it.chk), sort: it => it.chk || 0 },
    left: { label: 'Tự xoá sau', kind: 'left', key: leftKey, sort: it => it.chk || 0 },
  };
  const filtering = () => S.view === 'fail' && Object.keys(S.xf).length > 0;
  const passCol = (c, it) => { const f = S.xf[c]; if (!f) return true; const k = COLS[c].key(it); return f.mode === 'in' ? f.set.has(k) : !f.set.has(k); };
  const cmp = (fn, dir) => (a, b) => {
    const x = fn(a), y = fn(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  };

  function base() {
    const q = S.q.trim().toLowerCase();
    return q ? S.items.filter(it => it.d.includes(q)) : S.items;
  }

  function shown() {
    let list = base();
    if (S.view !== 'fail') return list;
    const cols = Object.keys(S.xf);
    if (cols.length) list = list.filter(it => cols.every(c => passCol(c, it)));
    return list.slice().sort(cmp(COLS[S.sort.k].sort, S.sort.dir));
  }

  function valuesFor(c) {
    const others = Object.keys(S.xf).filter(x => x !== c);
    const m = new Map();
    base().filter(it => others.every(o => passCol(o, it))).forEach(it => {
      const k = COLS[c].key(it);
      const v = m.get(k) || { k, n: 0, s: COLS[c].sort(it) };
      v.n++;
      m.set(k, v);
    });
    return [...m.values()].sort(cmp(v => v.s, c === 'left' ? -1 : 1));
  }

  function left(it) {
    const ms = leftMs(it);
    if (ms <= 0) return '<span style="color:var(--t-danger)">sắp xoá</span>';
    const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return `<span style="color:${ms < 3600000 ? 'var(--t-danger)' : 'var(--t-fg-muted)'}">${h ? h + ' giờ ' : ''}${m} phút</span>`;
  }

  const FUNNEL = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2h13l-5 6v5.5l-3-1.5V8z" fill="currentColor"/></svg>';
  let P = null, pop = null;

  function popClose() {
    if (pop) pop.remove();
    pop = null;
    P = null;
  }

  function popList() {
    const q = P.q.trim().toLowerCase();
    const vis = P.vals.filter(v => !q || v.k.toLowerCase().includes(q));
    P.vis = vis;
    const allOn = vis.length && vis.every(v => P.chk.has(v.k));
    const row = 'display:flex;align-items:center;gap:6px;padding:3px 4px;cursor:pointer;border-radius:4px';
    pop.querySelector('#dhPopList').innerHTML = (vis.length ? `<label style="${row};font-weight:600"><input type="checkbox" data-pall ${allOn ? 'checked' : ''}> (Chọn tất cả${q ? ' kết quả tìm' : ''})</label>` : '<div style="padding:8px;color:var(--t-fg-muted)">Không có giá trị nào</div>')
      + vis.map((v, i) => `<label style="${row}"><input type="checkbox" data-pv="${i}" ${P.chk.has(v.k) ? 'checked' : ''}><span style="flex:1;word-break:break-all">${esc(v.k)}</span><span style="color:var(--t-fg-muted)">${v.n}</span></label>`).join('');
  }

  function popOpen(c, anchor) {
    popClose();
    const vals = valuesFor(c);
    P = { c, vals, chk: new Set(vals.filter(v => { const f = S.xf[c]; return !f || (f.mode === 'in' ? f.set.has(v.k) : !f.set.has(v.k)); }).map(v => v.k)), q: '', vis: vals };
    const kind = COLS[c].kind;
    const [up, down] = kind === 'num' ? ['Nhỏ → lớn', 'Lớn → nhỏ'] : kind === 'time' ? ['Cũ → mới', 'Mới → cũ'] : kind === 'left' ? ['Sắp bị xoá trước', 'Còn lâu trước'] : ['A → Z', 'Z → A'];
    const item = 'display:block;width:100%;text-align:left;background:none;border:0;color:var(--t-fg);padding:5px 6px;border-radius:4px;cursor:pointer;font:inherit';
    pop = document.createElement('div');
    pop.id = 'dhPop';
    pop.style.cssText = 'position:fixed;z-index:10000;width:270px;background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:6px;font-size:12px;font-family:inherit';
    pop.innerHTML = `<style>#dhPop [data-p]:hover:not(:disabled),#dhPop label:hover{background:var(--t-muted)}#dhPop [data-p]:disabled{opacity:.45;cursor:not-allowed}</style>
      <button data-p="asc" style="${item}">↑ Sắp xếp ${up}</button>
      <button data-p="desc" style="${item}">↓ Sắp xếp ${down}</button>
      <div style="border-top:1px solid var(--t-border);margin:4px 0"></div>
      <button data-p="clear" style="${item}" ${S.xf[c] ? '' : 'disabled'}>✕ Xoá lọc "${esc(COLS[c].label)}"</button>
      <input id="dhPopQ" placeholder="Tìm…" style="width:100%;box-sizing:border-box;margin:4px 0;background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:5px;padding:5px 7px;font-size:12px">
      <div id="dhPopList" style="max-height:240px;overflow:auto;border:1px solid var(--t-border);border-radius:5px;padding:2px"></div>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
        <button data-p="ok" style="${btn(pri)}">OK</button>
        <button data-p="cancel" style="${btn()}">Hủy</button>
      </div>`;
    document.body.appendChild(pop);
    popList();
    const r = anchor.getBoundingClientRect();
    const w = 270, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 4 + h > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    pop.addEventListener('click', popClick);
    pop.addEventListener('change', e => {
      if (e.target.hasAttribute('data-pall')) { P.vis.forEach(v => e.target.checked ? P.chk.add(v.k) : P.chk.delete(v.k)); popList(); }
      else if (e.target.dataset.pv != null) { const v = P.vis[Number(e.target.dataset.pv)]; e.target.checked ? P.chk.add(v.k) : P.chk.delete(v.k); popList(); }
    });
    pop.addEventListener('input', e => { if (e.target.id === 'dhPopQ') { P.q = e.target.value; if (P.q.trim()) P.vals.forEach(v => P.chk.add(v.k)); popList(); } });
    pop.addEventListener('keydown', e => { if (e.key === 'Enter') popApply(); });
    pop.querySelector('#dhPopQ').focus();
  }

  function popApply() {
    const c = P.c;
    if (P.q.trim()) {
      const keep = P.vis.filter(v => P.chk.has(v.k)).map(v => v.k);
      S.xf[c] = { mode: 'in', set: new Set(keep) };
    } else {
      const off = P.vals.filter(v => !P.chk.has(v.k)).map(v => v.k);
      if (off.length) S.xf[c] = { mode: 'ex', set: new Set(off) }; else delete S.xf[c];
    }
    popClose();
    S.sel.clear(); S.last = null; draw();
  }

  function popClick(e) {
    const b = e.target.closest('[data-p]');
    if (!b || b.disabled) return;
    const a = b.dataset.p, c = P.c;
    if (a === 'asc' || a === 'desc') { S.sort = { k: c, dir: a === 'asc' ? 1 : -1 }; popClose(); S.last = null; draw(); }
    else if (a === 'clear') { delete S.xf[c]; popClose(); S.sel.clear(); S.last = null; draw(); }
    else if (a === 'ok') popApply();
    else if (a === 'cancel') popClose();
  }

  document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('[data-fn]')) popClose(); }, true);
  document.addEventListener('keydown', e => { if (pop && e.key === 'Escape') popClose(); });

  async function load() {
    const seq = ++S.seq;
    try {
      const d = await api('state?view=' + S.view);
      if (seq !== S.seq) return;
      S.items = d.items || [];
      S.counts = d.counts || {};
      S.worker = d.worker || {};
      S.opt = d.opt || {};
      S.err = '';
      S.skew = d.now ? d.now - Date.now() : 0;
      const have = new Set(S.items.map(x => x.d));
      [...S.sel].forEach(x => { if (!have.has(x)) S.sel.delete(x); });
      draw();
    } catch (e) { if (seq === S.seq) { S.err = e.message; draw(); } }
  }

  const when = t => t ? new Date(t).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const wb = (s, d) => `https://web.archive.org/web/*/${s ? s + '.' : ''}${d}/*`;

  function workerLine() {
    const w = S.worker || {};
    const parts = [];
    const qn = S.counts.queue || 0;
    if (w.pauseUntil && w.pauseUntil > Date.now()) parts.push(`⏸ Wayback đang chặn tốc độ, tự chạy lại lúc ${new Date(w.pauseUntil).toLocaleTimeString('vi-VN', { hour12: false })}`);
    else if ((w.cur || []).length) parts.push('🔄 Đang kiểm: ' + w.cur.map(esc).join(', '));
    else if (qn) parts.push('🔄 Đang chạy');
    else parts.push('💤 Hàng chờ trống, tải CSV lên để kiểm tiếp');
    parts.push(`Hàng chờ ${qn}`);
    if (w.last) parts.push(`vừa xong ${esc(w.last.d)} → ${{ pass: 'đạt', fail: 'không đạt', err: 'lỗi' }[w.last.st] || w.last.st} (${when(w.last.at)})`);
    return parts.join(' · ');
  }

  function rowHtml(it, i) {
    const on = S.sel.has(it.d);
    const subs = (it.subs || []).map(x => `<a href="${esc(wb(x.s, it.d))}" target="_blank" rel="noopener" style="color:var(--t-accent);text-decoration:none">${esc(x.s)}</a><span style="color:var(--t-fg-muted)"> ${x.n}</span>`).join(' · ');
    let info = '';
    if (S.view === 'pass' || S.view === 'mine') info = subs;
    else if (S.view === 'fail') info = `<span style="color:var(--t-fg-muted)">${esc(it.reason || '')}</span>${subs ? ' · ' + subs : ''}`;
    else if (S.view === 'err') info = `<span style="color:var(--t-danger)">${esc(it.reason || '')}</span>`;
    else info = it.st === 'run' ? '<span style="color:var(--t-accent)">🔄 đang kiểm</span>' : '<span style="color:var(--t-fg-muted)">chờ kiểm</span>';
    const t = S.view === 'mine' ? it.take : S.view === 'queue' ? it.add : it.chk;
    return `<tr data-i="${i}" style="border-top:1px solid var(--t-border);${on ? 'background:color-mix(in srgb,var(--t-accent) 10%,transparent)' : ''}">
      <td style="padding:6px 8px;width:28px"><input type="checkbox" class="dh-ck" data-i="${i}" ${on ? 'checked' : ''}></td>
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap"><a href="${esc(wb('', it.d))}" target="_blank" rel="noopener" style="color:var(--t-fg);text-decoration:none">${esc(it.d)}</a>${it.ex ? ' <span title="Phá lệ: không đạt nhưng bạn giữ lại" style="padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--t-warn) 20%,transparent);color:var(--t-warn);font-size:11px;font-weight:400">phá lệ</span>' : ''}</td>
      <td style="padding:6px 8px;white-space:nowrap">${esc(it.price || '')}${it.premium ? ' <span style="padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--t-done) 18%,transparent);color:var(--t-done);font-size:11px">premium</span>' : ''}</td>
      <td style="padding:6px 8px;text-align:center">${S.view === 'queue' ? '' : (it.subs || []).length}</td>
      <td style="padding:6px 8px">${info}</td>
      <td style="padding:6px 8px;white-space:nowrap;color:var(--t-fg-muted);font-size:11px">${when(t)}</td>${S.view === 'fail' ? `
      <td style="padding:6px 8px;white-space:nowrap;font-size:11px">${left(it)}</td>` : ''}
    </tr>`;
  }

  function actions() {
    const n = S.sel.size;
    const b = [];
    if (S.view === 'pass') b.push(`<button data-a="take" style="${btn(pri)}" ${n ? '' : 'disabled'}>✅ Nhận ${n || ''} domain → Kho của tôi</button>`);
    if (S.view === 'mine') b.push(`<button data-a="untake" style="${btn()}" ${n ? '' : 'disabled'}>↩ Trả về Kho chờ</button>`);
    if (S.view === 'fail') b.push(`<button data-a="except" style="${btn(pri)}" ${n ? '' : 'disabled'}>⭐ Phá lệ ${n || ''} domain → Kho chờ</button>`);
    if (S.view === 'fail' && filtering()) b.push(`<button data-a="clearf" style="${btn()}">✕ Xoá mọi bộ lọc</button>`);
    if (S.view === 'fail' || S.view === 'err') b.push(`<button data-a="recheck" style="${btn()}" ${n ? '' : 'disabled'}>🔁 Kiểm lại</button>`);
    b.push(`<button data-a="copy" style="${btn()}">📋 Copy ${n ? n + ' đã chọn' : 'tất cả'}</button>`);
    b.push(`<button data-a="csv" style="${btn()}">⬇ CSV</button>`);
    b.push(`<button data-a="del" style="${btn('color:var(--t-danger)')}" ${n ? '' : 'disabled'}>🗑 Xoá</button>`);
    return b.join('');
  }

  function shell() {
    root.innerHTML = `<style>#page-domainhunt button:disabled{opacity:.45;cursor:not-allowed}</style><div style="padding:16px;display:flex;flex-direction:column;gap:12px;height:calc(100vh - 90px);box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h2 style="margin:0;font-size:18px;color:var(--t-fg)">🎯 Săn domain</h2>
        <span style="color:var(--t-fg-muted);font-size:12px" id="dhHint"></span>
      </div>
      <label id="dhDrop" style="display:flex;align-items:center;gap:10px;padding:12px;border:1px dashed var(--t-border2);border-radius:8px;cursor:pointer;color:var(--t-fg-muted);font-size:13px">
        <input type="file" id="dhFile" accept=".csv,text/csv" multiple style="display:none">
        <span style="${btn(pri)}">📂 Chọn file CSV</span> hoặc kéo thả file vào đây · chỉ lấy dòng <b>available</b>, domain đã có sẵn thì bỏ qua
      </label>
      <div style="font-size:12px;color:var(--t-fg-muted)" id="dhWork"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="dhTabs"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <input id="dhQ" placeholder="Tìm domain…" style="background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:6px 8px;font-size:12px;width:200px">
        <span id="dhBar" style="display:contents"></span>
      </div>
      <div id="dhErr" style="color:var(--t-danger);font-size:12px"></div>
      <div class="dh-scroll" style="flex:1;overflow:auto;border:1px solid var(--t-border);border-radius:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:var(--t-fg)">
          <thead style="position:sticky;top:0;background:var(--t-subtle);z-index:1" id="dhHead"></thead>
          <tbody id="dhBody"></tbody>
        </table>
      </div>
    </div>`;
  }

  const put = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };

  function draw() {
    if (!root) return;
    if (!root.querySelector('#dhBody')) shell();
    const $ = id => root.querySelector('#' + id);
    const list = shown();
    const cap = 2000;
    const allOn = list.length && list.every(it => S.sel.has(it.d));
    $('dhHint').textContent = `Tải CSV xuất từ Namecheap (Beast Mode → Export). VPS tự kiểm subdomain trên Wayback 24/7: có ${S.opt.max ? (S.opt.min || 3) + '–' + S.opt.max : 'từ ' + (S.opt.min || 3)} subdomain thật (đã bỏ cổng đăng nhập/ứng dụng nội bộ), mỗi subdomain từ ${S.opt.pages || 2} trang trở lên thì vào Kho chờ.`;
    put($('dhWork'), workerLine());
    put($('dhTabs'), VIEWS.map(([k, label, tip]) => `<button data-v="${k}" title="${esc(tip)}" style="${btn(S.view === k ? pri : '')}">${label} <b>${S.counts[k] || 0}</b></button>`).join(''));
    put($('dhBar'), actions() + `<span style="color:var(--t-fg-muted);font-size:12px">${S.sel.size ? `Đã chọn ${S.sel.size} · ` : ''}${list.length} domain${list.length > cap ? ` (hiện ${cap} dòng đầu)` : ''}</span>`);
    $('dhErr').textContent = S.err ? '⚠️ ' + S.err : '';
    const key = S.view + '|' + S.sort.k + '|' + S.sort.dir + '|' + Object.keys(S.xf).sort().join(',');
    if (S.headKey !== key) { S.headKey = key; $('dhHead').innerHTML = headHtml(); }
    const all = $('dhAll');
    if (all) all.checked = !!allOn;
    const cols = S.view === 'fail' ? 7 : 6;
    put($('dhBody'), list.slice(0, cap).map(rowHtml).join('') || `<tr><td colspan="${cols}" style="padding:24px;text-align:center;color:var(--t-fg-muted)">${filtering() ? 'Không có domain nào khớp bộ lọc' : 'Chưa có domain nào'}</td></tr>`);
  }

  function headHtml() {
    const th = 'padding:6px 8px;text-align:left;white-space:nowrap';
    const fail = S.view === 'fail';
    const col = (c, label, extra) => {
      if (!fail) return `<th style="${th};${extra || ''}">${label}</th>`;
      const on = !!S.xf[c], so = S.sort.k === c;
      return `<th style="${th};${extra || ''}">${label}${so ? ` <span style="color:var(--t-accent)">${S.sort.dir > 0 ? '▲' : '▼'}</span>` : ''} <button type="button" data-fn="${c}" title="${on ? 'Đang lọc · bấm để sửa' : 'Lọc / sắp xếp'}" style="border:1px solid ${on ? 'var(--t-accent)' : 'transparent'};background:${on ? 'color-mix(in srgb,var(--t-accent) 18%,transparent)' : 'none'};color:${on ? 'var(--t-accent)' : 'var(--t-fg-subtle)'};border-radius:4px;padding:1px 3px;cursor:pointer;vertical-align:middle;line-height:0">${FUNNEL}</button></th>`;
    };
    const infoLabel = S.view === 'queue' ? 'Trạng thái' : S.view === 'err' ? 'Lỗi' : fail ? COLS.why.label : 'Subdomain có nội dung (số trang)';
    const timeLabel = S.view === 'mine' ? 'Nhận lúc' : S.view === 'queue' ? 'Thêm lúc' : 'Kiểm lúc';
    return `<tr>
      <th style="${th};width:28px"><input type="checkbox" id="dhAll"></th>
      ${col('d', 'Domain')}
      ${col('price', 'Giá')}
      ${col('sub', 'Sub', 'text-align:center')}
      ${fail ? col('why', infoLabel) : `<th style="${th}">${infoLabel}</th>`}
      ${col('chk', timeLabel)}
      ${fail ? col('left', 'Tự xoá sau') : ''}
    </tr>`;
  }

  function csvOut(list) {
    const cell = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['domain', 'gia', 'premium', 'so_sub', 'subdomain', 'ly_do', 'kiem_luc', 'nhan_luc'];
    const body = list.map(it => [it.d, it.price, it.premium ? 'premium' : '', (it.subs || []).length, (it.subs || []).map(x => `${x.s}.${it.d} (${x.n})`).join(' | '), it.reason || '', when(it.chk), when(it.take)]);
    const blob = new Blob(['﻿' + [head, ...body].map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `san-domain-${S.view}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function run(a) {
    const list = shown();
    const picked = list.filter(it => S.sel.has(it.d));
    const ds = picked.map(it => it.d);
    if (a === 'copy') {
      const src = picked.length ? picked : list;
      try { await navigator.clipboard.writeText(src.map(it => it.d).join('\n')); say(`Đã copy ${src.length} domain`); } catch (e) { fail('Không copy được: ' + e.message); }
      return;
    }
    if (a === 'csv') { csvOut(picked.length ? picked : list); return; }
    if (a === 'clearf') { S.xf = {}; popClose(); S.sel.clear(); S.last = null; draw(); return; }
    if (!ds.length || S.busy) return;
    if (a === 'del' && !confirm(`Xoá ${ds.length} domain? Domain đã xoá sẽ không được thêm lại khi tải CSV.`)) return;
    S.busy = true;
    try {
      const d = await api(a, { ds });
      const msg = { take: 'Đã nhận', untake: 'Đã trả về Kho chờ', recheck: 'Đã đưa vào hàng chờ kiểm lại', del: 'Đã xoá' }[a];
      say(a === 'except' ? `Đã phá lệ ${d.n} domain, chuyển vào Kho chờ` : `${msg} ${d.n} domain`);
      S.sel.clear();
      await load();
    } catch (e) { fail(e); } finally { S.busy = false; }
  }

  function bind() {
    root.addEventListener('click', e => {
      const v = e.target.closest('[data-v]');
      if (v) { if (S.view !== v.dataset.v) { popClose(); S.view = v.dataset.v; S.sel.clear(); S.last = null; S.items = []; draw(); load(); } return; }
      const fn = e.target.closest('[data-fn]');
      if (fn) { if (P && P.c === fn.dataset.fn) popClose(); else popOpen(fn.dataset.fn, fn); return; }
      const a = e.target.closest('[data-a]');
      if (a && !a.disabled) { run(a.dataset.a); return; }
      const ck = e.target.closest('.dh-ck');
      if (ck) {
        const list = shown();
        const i = Number(ck.dataset.i);
        const on = ck.checked;
        if (e.shiftKey && S.last != null) {
          const [x, y] = [Math.min(S.last, i), Math.max(S.last, i)];
          for (let k = x; k <= y; k++) if (list[k]) on ? S.sel.add(list[k].d) : S.sel.delete(list[k].d);
        } else on ? S.sel.add(list[i].d) : S.sel.delete(list[i].d);
        S.last = i;
        draw();
        return;
      }
      if (e.target.id === 'dhAll') {
        const list = shown();
        if (e.target.checked) list.forEach(it => S.sel.add(it.d)); else list.forEach(it => S.sel.delete(it.d));
        draw();
      }
    });
    root.addEventListener('input', e => {
      if (e.target.id === 'dhQ') { S.q = e.target.value; S.last = null; draw(); }
    });
    root.addEventListener('change', e => {
      if (e.target.id === 'dhFile' && e.target.files.length) { importFiles([...e.target.files]); e.target.value = ''; }
    });
    root.addEventListener('scroll', () => popClose(), true);
    root.addEventListener('dragover', e => { if (e.target.closest('#dhDrop')) { e.preventDefault(); e.target.closest('#dhDrop').style.borderColor = 'var(--t-accent)'; } });
    root.addEventListener('dragleave', e => { const z = e.target.closest('#dhDrop'); if (z) z.style.borderColor = ''; });
    root.addEventListener('drop', e => {
      const z = e.target.closest('#dhDrop');
      if (!z) return;
      e.preventDefault();
      z.style.borderColor = '';
      if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
    });
  }

  window.dhInit = function () {
    const page = document.getElementById('page-domainhunt');
    if (!page) return;
    if (!root) { root = page; bind(); }
    load();
    if (!S.timer) S.timer = setInterval(() => { if (!page.classList.contains('is-hidden') && !document.hidden && !S.busy) load(); }, 8000);
  };
  window.DHUI = { parseCsv, fromNamecheap };
})();
