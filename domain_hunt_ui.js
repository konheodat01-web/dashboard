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
  const F0 = { d: '', pmin: '', pmax: '', prem: '', smin: '', smax: '', why: '', age: '' };
  const S = { view: 'pass', q: '', items: [], counts: {}, worker: {}, opt: {}, sel: new Set(), last: null, timer: null, seq: 0, busy: false, f: { ...F0 }, fv: 0, sort: { k: 'chk', dir: -1 }, headKey: '', skew: 0 };
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
  const numOr = v => v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
  const filtering = () => S.view === 'fail' && Object.keys(F0).some(k => S.f[k] !== '');

  function shown() {
    const q = S.q.trim().toLowerCase();
    let list = q ? S.items.filter(it => it.d.includes(q)) : S.items;
    if (S.view !== 'fail') return list;
    const f = S.f, now = Date.now() + S.skew, ttl = S.opt.failTtl || 86400000;
    const pmin = numOr(f.pmin), pmax = numOr(f.pmax), smin = numOr(f.smin), smax = numOr(f.smax);
    const dq = f.d.trim().toLowerCase(), wq = f.why.trim().toLowerCase();
    list = list.filter(it => {
      if (dq && !it.d.includes(dq)) return false;
      const p = priceNum(it);
      if ((pmin != null || pmax != null) && p == null) return false;
      if (pmin != null && p < pmin) return false;
      if (pmax != null && p > pmax) return false;
      if (f.prem === 'y' && !it.premium) return false;
      if (f.prem === 'n' && it.premium) return false;
      const n = (it.subs || []).length;
      if (smin != null && n < smin) return false;
      if (smax != null && n > smax) return false;
      if (wq && !((it.reason || '') + ' ' + (it.subs || []).map(x => x.s).join(' ')).toLowerCase().includes(wq)) return false;
      const age = now - (it.chk || 0);
      if (f.age === '1h' && age > 3600000) return false;
      if (f.age === '6h' && age > 6 * 3600000) return false;
      if (f.age === 'soon' && ttl - age > 3600000) return false;
      return true;
    });
    const k = S.sort.k, dir = S.sort.dir;
    const val = it => k === 'd' ? it.d : k === 'price' ? priceNum(it) : k === 'sub' ? (it.subs || []).length : (it.chk || 0);
    return list.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
  }

  function left(it) {
    const ms = (S.opt.failTtl || 86400000) - (Date.now() + S.skew - (it.chk || 0));
    if (ms <= 0) return '<span style="color:var(--t-danger)">sắp xoá</span>';
    const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return `<span style="color:${ms < 3600000 ? 'var(--t-danger)' : 'var(--t-fg-muted)'}">${h ? h + ' giờ ' : ''}${m} phút</span>`;
  }

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
    if (S.view === 'fail' && filtering()) b.push(`<button data-a="clearf" style="${btn()}">✕ Xoá lọc</button>`);
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
    $('dhHint').textContent = `Tải CSV xuất từ Namecheap (Beast Mode → Export). VPS tự kiểm subdomain trên Wayback 24/7: có ${S.opt.min || 3}–${S.opt.max || 5} subdomain, mỗi subdomain từ ${S.opt.pages || 2} trang trở lên thì vào Kho chờ.`;
    put($('dhWork'), workerLine());
    put($('dhTabs'), VIEWS.map(([k, label, tip]) => `<button data-v="${k}" title="${esc(tip)}" style="${btn(S.view === k ? pri : '')}">${label} <b>${S.counts[k] || 0}</b></button>`).join(''));
    put($('dhBar'), actions() + `<span style="color:var(--t-fg-muted);font-size:12px">${S.sel.size ? `Đã chọn ${S.sel.size} · ` : ''}${list.length} domain${list.length > cap ? ` (hiện ${cap} dòng đầu)` : ''}</span>`);
    $('dhErr').textContent = S.err ? '⚠️ ' + S.err : '';
    const key = S.view + '|' + S.sort.k + '|' + S.sort.dir + '|' + S.fv;
    if (S.headKey !== key) { S.headKey = key; $('dhHead').innerHTML = headHtml(); }
    const all = $('dhAll');
    if (all) all.checked = !!allOn;
    const cols = S.view === 'fail' ? 7 : 6;
    put($('dhBody'), list.slice(0, cap).map(rowHtml).join('') || `<tr><td colspan="${cols}" style="padding:24px;text-align:center;color:var(--t-fg-muted)">${filtering() ? 'Không có domain nào khớp bộ lọc' : 'Chưa có domain nào'}</td></tr>`);
  }

  function headHtml() {
    const th = 'padding:6px 8px;text-align:left;white-space:nowrap';
    const fail = S.view === 'fail';
    const sortTh = (k, label, extra) => {
      if (!fail) return `<th style="${th};${extra || ''}">${label}</th>`;
      const on = S.sort.k === k;
      return `<th data-sort="${k}" title="Bấm để sắp xếp" style="${th};cursor:pointer;user-select:none;${extra || ''}">${label} <span style="color:${on ? 'var(--t-accent)' : 'var(--t-fg-subtle)'}">${on ? (S.sort.dir > 0 ? '▲' : '▼') : '↕'}</span></th>`;
    };
    const infoLabel = S.view === 'queue' ? 'Trạng thái' : S.view === 'err' ? 'Lỗi' : fail ? 'Lý do · subdomain có nội dung' : 'Subdomain có nội dung (số trang)';
    const timeLabel = S.view === 'mine' ? 'Nhận lúc' : S.view === 'queue' ? 'Thêm lúc' : 'Kiểm lúc';
    let h = `<tr>
      <th style="${th};width:28px"><input type="checkbox" id="dhAll"></th>
      ${sortTh('d', 'Domain')}
      ${sortTh('price', 'Giá')}
      ${sortTh('sub', 'Sub', 'text-align:center')}
      <th style="${th}">${infoLabel}</th>
      ${sortTh('chk', timeLabel)}
      ${fail ? `<th style="${th}">Tự xoá sau</th>` : ''}
    </tr>`;
    if (fail) {
      const fi = (k, ph, w, type) => `<input data-f="${k}" ${type ? `type="${type}"` : ''} placeholder="${ph}" value="${esc(S.f[k])}" style="background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:5px;padding:3px 5px;font-size:11px;width:${w};box-sizing:border-box">`;
      const fs = (k, opts) => `<select data-f="${k}" style="background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:5px;padding:3px 4px;font-size:11px">${opts.map(([v, l]) => `<option value="${v}" ${S.f[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      const td = 'padding:4px 8px;font-weight:400';
      h += `<tr style="background:var(--t-subtle)">
        <th style="${td}"></th>
        <th style="${td}">${fi('d', 'lọc domain…', '130px')}</th>
        <th style="${td};white-space:nowrap">${fi('pmin', 'từ $', '56px', 'number')} ${fi('pmax', 'đến $', '56px', 'number')} ${fs('prem', [['', 'mọi loại'], ['y', 'premium'], ['n', 'thường']])}</th>
        <th style="${td};white-space:nowrap">${fi('smin', 'từ', '42px', 'number')} ${fi('smax', 'đến', '42px', 'number')}</th>
        <th style="${td}">${fi('why', 'lọc lý do / tên subdomain…', '180px')}</th>
        <th style="${td}" colspan="2">${fs('age', [['', 'mọi lúc'], ['1h', 'kiểm trong 1 giờ qua'], ['6h', 'kiểm trong 6 giờ qua'], ['soon', 'còn < 1 giờ là bị xoá']])}</th>
      </tr>`;
    }
    return h;
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
    if (a === 'clearf') { S.f = { ...F0 }; S.fv++; S.sel.clear(); S.last = null; draw(); return; }
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
      if (v) { if (S.view !== v.dataset.v) { S.view = v.dataset.v; S.sel.clear(); S.last = null; S.items = []; draw(); load(); } return; }
      const so = e.target.closest('[data-sort]');
      if (so) { const k = so.dataset.sort; S.sort = S.sort.k === k ? { k, dir: -S.sort.dir } : { k, dir: k === 'd' ? 1 : -1 }; S.last = null; draw(); return; }
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
      if (e.target.dataset && e.target.dataset.f && e.target.tagName === 'INPUT') { S.f[e.target.dataset.f] = e.target.value; S.sel.clear(); S.last = null; draw(); }
    });
    root.addEventListener('change', e => {
      if (e.target.id === 'dhFile' && e.target.files.length) { importFiles([...e.target.files]); e.target.value = ''; }
      if (e.target.dataset && e.target.dataset.f && e.target.tagName === 'SELECT') { S.f[e.target.dataset.f] = e.target.value; S.sel.clear(); S.last = null; draw(); }
    });
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
