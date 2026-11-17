(function () {
  const API = '/api/domain-hunt/';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const btn = extra => `background:var(--t-muted);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;${extra || ''}`;
  const pri = 'background:var(--t-accent);color:#fff;border-color:var(--t-accent)';
  const VIEWS = [
    ['pass', '📥 Kho chờ', 'Đạt kiểm subdomain, chờ bạn nhận'],
    ['mine', '✅ Kho của tôi', 'Domain bạn đã nhận'],
    ['man', '📝 Chờ xác nhận', 'Domain bạn nhập thủ công: tool kiểm subdomain, bạn xác nhận rồi chuyển vào Kho của tôi'],
    ['queue', '⏳ Hàng chờ kiểm', 'Đang chờ / đang kiểm Wayback'],
    ['fail', '✖ Không đạt', 'Không đủ 3–5 subdomain có nội dung · tự xoá khỏi danh sách sau 48 giờ nếu không phá lệ · tool vẫn nhớ, nhập CSV lần sau tự bỏ qua (Nhập thủ công thì vẫn kiểm)'],
    ['err', '⚠️ Lỗi', 'Wayback lỗi, tự kiểm lại sau 30 phút (tối đa 3 lần)'],
  ];
  const S = { view: 'pass', q: '', items: [], counts: {}, worker: {}, opt: {}, sel: new Set(), last: null, timer: null, seq: 0, busy: false, xfs: {}, sorts: { fail: { k: 'chk', dir: -1 } }, headKey: '', skew: 0, open: new Set(), ssel: new Set(), labels: { grp: [], stt: [] }, colors: { grp: {}, stt: {} }, mode: 'tree', lastH: null, wants: [], sys: { used: 'Đã sử dụng', past: 'Từng dùng' }, usage: [] };
  try { const m = localStorage.getItem('dhMode'); if (['tree', 'sub', 'all'].includes(m)) S.mode = m; } catch (e) {}
  const MODES = [['tree', '🌳 Theo domain'], ['sub', '🔗 Chỉ subdomain'], ['all', '📋 Tất cả (gốc + sub)']];
  const flatMode = () => S.view === 'mine' && S.mode !== 'tree';
  const fk = () => S.view + (S.view === 'mine' ? (flatMode() ? ':flat' : ':tree') : '');
  const xf = () => S.xfs[fk()] || (S.xfs[fk()] = {});
  const srt = () => S.sorts[fk()] || null;
  function hostsRaw() {
    const q = S.q.trim().toLowerCase();
    const out = [];
    S.items.forEach(it => {
      if (S.mode === 'all') out.push({ k: it.d + '|', h: it.d, it, x: null });
      (it.subs || []).forEach(x => out.push({ k: it.d + '|' + x.s, h: x.s + '.' + it.d, it, x }));
    });
    return q ? out.filter(o => o.h.includes(q)) : out;
  }
  function hosts() { return refine(hostsRaw()); }
  const useOf = (it, s) => (it.use || {})[s || ''];
  const sysKey = (it, s) => { const u = useOf(it, s); return u ? (u.cur || []).length ? 'used' : (u.past || []).length ? 'past' : '' : ''; };
  const sysName = (it, s) => { const k = sysKey(it, s); return k ? S.sys[k] : ''; };
  const dm = t => { if (!t) return ''; const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2); };
  const useLine = c => `${c.l} → ${c.b ? c.b + ' · ' : ''}${c.r}`;
  function sysBadge(it, s) {
    const k = sysKey(it, s);
    if (!k) return '';
    const u = useOf(it, s), cur = u.cur || [], past = (u.past || []).slice().reverse();
    const tip = [...cur.map(c => 'Đang dùng: ' + useLine(c) + ' (từ ' + dm(c.f) + ')'), ...past.map(c => 'Từng dùng: ' + useLine(c) + ' (' + dm(c.f) + ' – ' + dm(c.t) + ')')].join('\n');
    const col = k === 'used' ? 'var(--t-accent)' : 'var(--t-fg-muted)';
    const rows = k === 'used' ? cur.map(c => esc(useLine(c))) : past.slice(0, 2).map(c => esc(useLine(c)) + ` <span style="color:var(--t-fg-subtle)">(${dm(c.f)}–${dm(c.t)})</span>`).concat(past.length > 2 ? [`+${past.length - 2} lần khác`] : []);
    return `<div class="dh-sys" data-sys="${k}" title="${esc(tip)}" style="line-height:1.35"><span style="display:inline-block;padding:1px 8px;border-radius:10px;border:1px solid ${col};background:color-mix(in srgb,${col} 20%,transparent);color:var(--t-fg);font-size:12px;font-weight:600;white-space:nowrap">🔒 ${esc(S.sys[k])}</span>${rows.map(r => `<div style="font-size:11px;color:var(--t-fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px">${r}</div>`).join('')}</div>`;
  }
  const sttCell = (it, s) => sysBadge(it, s) || tagSel('stt', it);
  const hostOf = k => { const j = k.indexOf('|'); const s = k.slice(j + 1); return (s ? s + '.' : '') + k.slice(0, j); };
  const subPicked = () => [...S.ssel].filter(k => !k.endsWith('|'));
  const rootsPicked = () => [...new Set([...S.ssel].map(k => k.slice(0, k.indexOf('|'))))];
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
      say(`Thêm ${d.added} domain vào hàng chờ kiểm · bỏ ${taken} đã có chủ · ${d.dup} đã có sẵn${d.failed ? ' · ' + d.failed + ' đã kiểm không đạt trước đó' : ''}${d.bad ? ' · ' + d.bad + ' sai định dạng' : ''}`);
      await load();
    } catch (e) { fail(e); }
  }

  const priceNum = it => { const m = String(it.price || '').replace(/,/g, '').match(/[\d.]+/); return m ? Number(m[0]) : null; };
  const pad = n => String(n).padStart(2, '0');
  const hourKey = t => { if (!t) return '(Trống)'; const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:00–${pad(d.getHours() + 1 > 23 ? 0 : d.getHours() + 1)}:00`; };
  const leftMs = it => (S.opt.failTtl || 172800000) - (Date.now() + S.skew - (it.chk || 0));
  const leftKey = it => { const h = Math.floor(leftMs(it) / 3600000); return h < 1 ? 'còn dưới 1 giờ' : `còn ${h} giờ`; };
  const COLS = {
    d: { label: 'Domain', kind: 'text', key: it => it.d, sort: it => it.d },
    price: { label: 'Giá', kind: 'num', key: it => it.price ? it.price + (it.premium ? ' · premium' : '') : (it.premium ? '(Trống) · premium' : '(Trống)'), sort: priceNum },
    sub: { label: 'Sub', kind: 'num', key: it => String((it.subs || []).length), sort: it => (it.subs || []).length },
    why: { label: 'Lý do · subdomain có nội dung', kind: 'text', key: it => it.reason || '(Trống)', sort: it => it.reason || '' },
    chk: { label: 'Kiểm lúc', kind: 'time', key: it => hourKey(it.chk), sort: it => it.chk || 0 },
    left: { label: 'Tự xoá sau', kind: 'left', key: leftKey, sort: it => it.chk || 0 },
    subs: { label: 'Subdomain có nội dung', kind: 'text', multi: true, key: it => (it.subs || []).length ? it.subs.map(x => x.s) : ['(Trống)'], sort: it => (it.subs || []).map(x => x.s).join(' ') },
    err: { label: 'Lỗi', kind: 'text', key: it => it.reason || '(Trống)', sort: it => it.reason || '' },
    mres: { label: 'Kết quả kiểm', kind: 'text', key: it => manRes(it), sort: it => manRes(it) },
    qst: { label: 'Trạng thái', kind: 'text', key: it => it.st === 'run' ? 'đang kiểm' : 'chờ kiểm', sort: it => it.st === 'run' ? 0 : 1 },
    grp: { label: 'Nhóm', kind: 'text', key: it => it.grp || '(Trống)', sort: it => it.grp || '' },
    stt: { label: 'Trạng thái', kind: 'text', key: it => sysName(it, '') || it.stt || '(Trống)', sort: it => sysName(it, '') || it.stt || '' },
    take: { label: 'Nhận lúc', kind: 'time', key: it => hourKey(it.take), sort: it => it.take || 0 },
    add: { label: 'Thêm lúc', kind: 'time', key: it => hourKey(it.add), sort: it => it.add || 0 },
    mtime: { label: 'Kiểm lúc', kind: 'time', key: it => hourKey(it.chk || it.man), sort: it => it.chk || it.man || 0 },
    h: { label: 'Host', kind: 'text', key: o => o.h, sort: o => o.h },
    hprice: { label: 'Giá', kind: 'num', key: o => COLS.price.key(o.it), sort: o => priceNum(o.it) },
    hpages: { label: 'Số trang', kind: 'num', key: o => o.x ? (o.x.n ? o.x.n + ' trang' : '—') : 'domain gốc', sort: o => o.x ? o.x.n : -1 },
    hgrp: { label: 'Nhóm', kind: 'text', key: o => o.it.grp || '(Trống)', sort: o => o.it.grp || '' },
    hstt: { label: 'Trạng thái', kind: 'text', key: o => sysName(o.it, o.x ? o.x.s : '') || o.it.stt || '(Trống)', sort: o => sysName(o.it, o.x ? o.x.s : '') || o.it.stt || '' },
    htake: { label: 'Nhận lúc', kind: 'time', key: o => hourKey(o.it.take), sort: o => o.it.take || 0 },
  };
  function manRes(it) { return it.st === 'q' ? 'chờ kiểm' : it.st === 'run' ? 'đang kiểm' : it.st === 'err' ? 'lỗi' : it.st === 'pass' ? 'đủ tiêu chí' : 'chưa đủ tiêu chí'; }
  const INFO = { pass: 'subs', man: 'mres', queue: 'qst', fail: 'why', err: 'err' };
  function colSpec() {
    const flat = flatMode(), v = S.view;
    const out = [{ c: flat ? 'h' : 'd', label: flat ? 'Host' : 'Domain' }, { c: flat ? 'hprice' : 'price', label: 'Giá' },
      { c: flat ? 'hpages' : v === 'queue' ? null : 'sub', label: flat ? 'Số trang' : 'Sub', extra: 'text-align:center' }];
    if (v === 'mine') out.push({ c: flat ? 'hgrp' : 'grp', label: 'Nhóm' }, { c: flat ? 'hstt' : 'stt', label: 'Trạng thái' });
    else out.push({ c: INFO[v], label: v === 'man' ? 'Kết quả kiểm subdomain (số trang)' : v === 'queue' ? 'Trạng thái' : v === 'err' ? 'Lỗi' : v === 'fail' ? COLS.why.label : 'Subdomain có nội dung (số trang)' });
    out.push({ c: v === 'mine' ? (flat ? 'htake' : 'take') : v === 'queue' ? 'add' : v === 'man' ? 'mtime' : 'chk', label: v === 'mine' ? 'Nhận lúc' : v === 'queue' ? 'Thêm lúc' : 'Kiểm lúc' });
    if (v === 'fail') out.push({ c: 'left', label: 'Tự xoá sau' });
    return out;
  }
  const keysOf = (c, r) => { const k = COLS[c].key(r); return Array.isArray(k) ? k : [k]; };
  const filtering = () => Object.keys(xf()).length > 0;
  const passCol = (c, r) => { const f = xf()[c]; if (!f) return true; const ks = keysOf(c, r); return f.mode === 'in' ? ks.some(k => f.set.has(k)) : ks.some(k => !f.set.has(k)); };
  function refine(list) {
    const cols = Object.keys(xf()), so = srt();
    if (cols.length) list = list.filter(r => cols.every(c => passCol(c, r)));
    return so && COLS[so.k] ? list.slice().sort(cmp(COLS[so.k].sort, so.dir)) : list;
  }
  const cmp = (fn, dir) => (a, b) => {
    const x = fn(a), y = fn(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  };

  function itemsQ() {
    const q = S.q.trim().toLowerCase();
    return q ? S.items.filter(it => it.d.includes(q)) : S.items;
  }
  const base = () => flatMode() ? hostsRaw() : itemsQ();
  const shown = () => flatMode() ? itemsQ() : refine(itemsQ());

  function valuesFor(c) {
    const others = Object.keys(xf()).filter(x => x !== c);
    const m = new Map();
    base().filter(r => others.every(o => passCol(o, r))).forEach(r => {
      new Set(keysOf(c, r)).forEach(k => {
        const v = m.get(k) || { k, n: 0, s: COLS[c].multi ? k : COLS[c].sort(r) };
        v.n++;
        m.set(k, v);
      });
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
    P = { c, vals, chk: new Set(vals.filter(v => { const f = xf()[c]; return !f || (f.mode === 'in' ? f.set.has(v.k) : !f.set.has(v.k)); }).map(v => v.k)), q: '', vis: vals };
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
      <button data-p="clear" style="${item}" ${xf()[c] ? '' : 'disabled'}>✕ Xoá lọc "${esc(COLS[c].label)}"</button>
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
      xf()[c] = { mode: 'in', set: new Set(keep) };
    } else {
      const off = P.vals.filter(v => !P.chk.has(v.k)).map(v => v.k);
      if (off.length) xf()[c] = { mode: 'ex', set: new Set(off) }; else delete xf()[c];
    }
    popClose();
    S.sel.clear(); S.ssel.clear(); S.last = null; S.lastH = null; draw();
  }

  function popClick(e) {
    const b = e.target.closest('[data-p]');
    if (!b || b.disabled) return;
    const a = b.dataset.p, c = P.c;
    if (a === 'asc' || a === 'desc') { S.sorts[fk()] = { k: c, dir: a === 'asc' ? 1 : -1 }; popClose(); S.last = null; S.lastH = null; draw(); }
    else if (a === 'clear') { delete xf()[c]; popClose(); S.sel.clear(); S.ssel.clear(); S.last = null; S.lastH = null; draw(); }
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
      S.labels = d.labels || { grp: [], stt: [] };
      S.colors = d.colors || { grp: {}, stt: {} };
      S.wants = d.wants || [];
      if (d.sys) S.sys = d.sys;
      S.usage = d.usage || [];
      S.items.forEach(it => {
        const have = new Set((it.subs || []).map(x => x.s));
        const extra = Object.keys(it.use || {}).filter(s => s && !have.has(s));
        if (extra.length) it.subs = (it.subs || []).concat(extra.map(s => ({ s, n: 0 })));
      });
      S.err = '';
      S.skew = d.now ? d.now - Date.now() : 0;
      const have = new Set(S.items.map(x => x.d));
      [...S.sel].forEach(x => { if (!have.has(x)) S.sel.delete(x); });
      const subKeys = new Set();
      S.items.forEach(it => { subKeys.add(it.d + '|'); (it.subs || []).forEach(x => subKeys.add(it.d + '|' + x.s)); });
      [...S.ssel].forEach(k => { if (!subKeys.has(k)) S.ssel.delete(k); });
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
    if (S.view === 'mine') parts.push(S.usage.length ? '🔀 Đối chiếu 301: ' + S.usage.map(u => `${esc(u.l)} ${when(u.at)}`).join(', ') : '🔀 Chưa có tài khoản nào gửi danh sách 301 (mở Dashboard là tự gửi)');
    return parts.join(' · ');
  }

  function hostRow(o, i) {
    const on = S.ssel.has(o.k), it = o.it;
    return `<tr class="${on ? 'dh-on' : ''}" style="border-top:1px solid var(--t-border);${on ? 'background:color-mix(in srgb,var(--t-accent) 12%,transparent)' : ''}">
      <td style="padding:5px 8px;width:28px"><input type="checkbox" class="dh-sck" data-k="${esc(o.k)}" data-hi="${i}" ${on ? 'checked' : ''}></td>
      <td style="padding:5px 8px;white-space:nowrap"><a href="${esc(wb(o.x ? o.x.s : '', it.d))}" target="_blank" rel="noopener" style="text-decoration:none;${o.x ? 'color:var(--t-accent)' : 'color:var(--t-fg);font-weight:600'}">${o.x ? esc(o.x.s) + `<span style="color:var(--t-fg-muted)">.${esc(it.d)}</span>` : esc(it.d)}</a></td>
      <td style="padding:5px 8px;white-space:nowrap">${esc(it.price || '')}</td>
      <td style="padding:5px 8px;text-align:center;color:var(--t-fg-muted);font-size:12px;white-space:nowrap">${o.x ? (o.x.n ? o.x.n + ' trang' : '—') : 'domain gốc'}</td>
      <td style="padding:4px 8px">${tagSel('grp', it)}</td><td style="padding:4px 8px">${sttCell(it, o.x ? o.x.s : '')}</td>
      <td style="padding:5px 8px;white-space:nowrap;color:var(--t-fg-muted);font-size:11px">${when(it.take)}</td>
    </tr>`;
  }

  function rowHtml(it, i) {
    const on = S.sel.has(it.d);
    const kw = new Set(it.kw || []);
    const subs = (it.subs || []).map(x => `<a href="${esc(wb(x.s, it.d))}" target="_blank" rel="noopener" style="color:var(--t-accent);text-decoration:none${kw.has(x.s) ? ';font-weight:700' : ''}">${kw.has(x.s) ? '🎯 ' : ''}${esc(x.s)}</a><span style="color:var(--t-fg-muted)"> ${x.n}</span>`).join(' · ');
    let info = '';
    const nreal = (it.subs || []).length;
    if (S.view === 'pass') info = subs;
    else if (S.view === 'man') {
      if (it.st === 'q') info = '<span style="color:var(--t-fg-muted)">⏳ chờ kiểm</span>';
      else if (it.st === 'run') info = '<span style="color:var(--t-accent)">🔄 đang kiểm</span>';
      else if (it.st === 'err') info = `<span style="color:var(--t-danger)">⚠ ${esc(it.reason || 'lỗi')}</span> <span style="color:var(--t-fg-muted)">· bấm Kiểm lại</span>`;
      else if (it.st === 'pass') info = `<span style="color:var(--t-success)">✔ ${nreal} subdomain hợp lệ</span> · ${subs}`;
      else info = `<span style="color:var(--t-warn)">⚠ ${nreal} subdomain hợp lệ (chưa đủ tiêu chí)</span>${subs ? ' · ' + subs : ''}`;
    }
    else if (S.view === 'fail') info = `<span style="color:var(--t-fg-muted)">${esc(it.reason || '')}</span>${subs ? ' · ' + subs : ''}`;
    else if (S.view === 'err') info = `<span style="color:var(--t-danger)">${esc(it.reason || '')}</span>`;
    else info = it.st === 'run' ? '<span style="color:var(--t-accent)">🔄 đang kiểm</span>' : '<span style="color:var(--t-fg-muted)">chờ kiểm</span>';
    const t = S.view === 'mine' ? it.take : S.view === 'queue' ? it.add : S.view === 'man' ? (it.chk || it.man) : it.chk;
    const mine = S.view === 'mine';
    const opened = mine && S.open.has(it.d);
    const nsub = (it.subs || []).length;
    const tg = mine ? `<button type="button" data-tg="${esc(it.d)}" title="${opened ? 'Thu gọn' : 'Xem subdomain'}" ${nsub ? '' : 'disabled'} style="background:none;border:0;color:var(--t-fg-muted);cursor:pointer;padding:0 4px 0 0;font-size:11px;width:16px">${opened ? '▼' : '▶'}</button>` : '';
    const rk = it.d + '|', ron = S.ssel.has(rk);
    const rootRow = opened ? `<tr class="${ron ? 'dh-on' : ''}" style="background:${ron ? 'color-mix(in srgb,var(--t-accent) 12%,transparent)' : 'var(--t-subtle)'}">
      <td></td>
      <td style="padding:4px 8px 4px 30px;white-space:nowrap"><label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" class="dh-sck" data-k="${esc(rk)}" ${ron ? 'checked' : ''}><a href="${esc(wb('', it.d))}" target="_blank" rel="noopener" style="color:var(--t-fg);text-decoration:none;font-weight:600">${esc(it.d)}</a></label></td>
      <td></td>
      <td style="padding:4px 8px;text-align:center;color:var(--t-fg-muted);font-size:12px;white-space:nowrap">domain gốc</td>
      <td></td><td style="padding:4px 8px">${sysBadge(it, '')}</td><td></td>
    </tr>` : '';
    const kids = rootRow + (opened ? (it.subs || []).map(x => {
      const k = it.d + '|' + x.s, son = S.ssel.has(k);
      return `<tr class="${son ? 'dh-on' : ''}" style="background:${son ? 'color-mix(in srgb,var(--t-accent) 12%,transparent)' : 'var(--t-subtle)'}">
      <td></td>
      <td style="padding:4px 8px 4px 30px;white-space:nowrap"><label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" class="dh-sck" data-k="${esc(k)}" ${son ? 'checked' : ''}><a href="${esc(wb(x.s, it.d))}" target="_blank" rel="noopener" style="color:var(--t-accent);text-decoration:none">${esc(x.s)}<span style="color:var(--t-fg-muted)">.${esc(it.d)}</span></a></label></td>
      <td></td>
      <td style="padding:4px 8px;text-align:center;color:var(--t-fg-muted);font-size:12px;white-space:nowrap">${x.n ? x.n + ' trang' : '—'}</td>
      <td></td><td style="padding:4px 8px">${sysBadge(it, x.s)}</td><td></td>
    </tr>`;
    }).join('') : '');
    return `<tr data-i="${i}" class="${on ? 'dh-on' : ''}" style="border-top:1px solid var(--t-border);${on ? 'background:color-mix(in srgb,var(--t-accent) 10%,transparent)' : ''}">
      <td style="padding:6px 8px;width:28px"><input type="checkbox" class="dh-ck" data-i="${i}" ${on ? 'checked' : ''}></td>
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap">${tg}<a href="${esc(wb('', it.d))}" target="_blank" rel="noopener" style="color:var(--t-fg);text-decoration:none">${esc(it.d)}</a>${it.ex ? ' <span title="Phá lệ: không đạt nhưng bạn giữ lại" style="padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--t-warn) 20%,transparent);color:var(--t-warn);font-size:11px;font-weight:400">phá lệ</span>' : ''}${kw.size ? ` <span class="dh-kw" title="Đạt nhờ có sub mong muốn" style="padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--t-success) 18%,transparent);color:var(--t-success);font-size:11px;font-weight:400">🎯 ${esc([...kw].join(', '))}</span>` : ''}</td>
      <td style="padding:6px 8px;white-space:nowrap">${esc(it.price || '')}${it.premium ? ' <span style="padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--t-done) 18%,transparent);color:var(--t-done);font-size:11px">premium</span>' : ''}</td>
      <td style="padding:6px 8px;text-align:center">${S.view === 'queue' ? '' : (it.subs || []).length}</td>
      ${mine ? `<td style="padding:4px 8px">${tagSel('grp', it)}</td><td style="padding:4px 8px">${sttCell(it, '')}</td>` : `<td style="padding:6px 8px">${info}</td>`}
      <td style="padding:6px 8px;white-space:nowrap;color:var(--t-fg-muted);font-size:11px">${when(t)}</td>${S.view === 'fail' ? `
      <td style="padding:6px 8px;white-space:nowrap;font-size:11px">${left(it)}</td>` : ''}
    </tr>${kids}`;
  }

  const LBL = { grp: ['nhóm', 'Nhóm'], stt: ['trạng thái', 'Trạng thái'] };
  const hue = v => { let h = 0; for (const c of String(v)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const PAL = [210, 135, 28, 280, 350, 175, 50, 315, 95, 0, 240, 195];
  const tagHue = (f, v) => { const i = (S.labels[f] || []).indexOf(v); return i < 0 ? hue(v) : PAL[(i + (f === 'stt' ? 3 : 0)) % PAL.length] + 15 * Math.floor(i / PAL.length); };
  const custom = (f, v) => ((S.colors || {})[f] || {})[v] || '';
  const tagLine = (f, v) => custom(f, v) || `hsl(${tagHue(f, v)} 70% 52%)`;
  const tagBg = (f, v) => custom(f, v) ? `color-mix(in srgb,${custom(f, v)} 34%,transparent)` : `hsl(${tagHue(f, v)} 70% 48% / .32)`;
  const toHex = h => { h = ((h % 360) + 360) % 360; const s = .7, l = .52, a = s * Math.min(l, 1 - l), k = n => (n + h / 30) % 12, c = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [c(0), c(8), c(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
  const pickHex = (f, v) => custom(f, v) || toHex(tagHue(f, v));
  const selCss = (f, v) => `max-width:150px;font-size:12px;font-family:inherit;border-radius:10px;padding:2px 6px;cursor:pointer;font-weight:${v ? 600 : 400};border:1px solid ${v ? tagLine(f, v) : 'var(--t-border)'} !important;background:${v ? tagBg(f, v) : 'var(--t-canvas)'} !important;color:${v ? 'var(--t-fg)' : 'var(--t-fg-muted)'} !important`;
  function tagOpts(f, cur, head) {
    const list = S.labels[f] || [];
    return `<option value="" ${cur ? '' : 'selected'}>${head}</option>` + list.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''} style="background:${tagBg(f, v)}">${esc(v)}</option>`).join('') + `<option value="__new">＋ Tạo ${LBL[f][0]} mới…</option>`;
  }
  function tagSel(f, it) {
    const cur = it[f] || '';
    return `<select class="dh-tag" data-f="${f}" data-d="${esc(it.d)}" style="${selCss(f, cur)}">${tagOpts(f, cur, '—')}</select>`;
  }

  async function newLabel(f) {
    const name = (prompt(`Tên ${LBL[f][0]} mới:`) || '').trim();
    if (!name) return '';
    const d = await api('labels', { field: f, op: 'add', name });
    S.labels[f] = d.list;
    return name;
  }

  async function setTag(f, ds, v) {
    if (!ds.length) return;
    S.busy = true;
    try {
      if (v === '__new') { v = await newLabel(f); if (!v) { draw(); return; } }
      const d = await api('tag', { field: f, ds, v });
      if (ds.length > 1) say(v ? `Đã gán ${LBL[f][0]} "${v}" cho ${d.n} domain` : `Đã bỏ ${LBL[f][0]} của ${d.n} domain`);
      await load();
    } catch (e) { fail(e); draw(); } finally { S.busy = false; }
  }

  let lab = null;
  function labClose() { if (lab) lab.remove(); lab = null; }
  function labDraw() {
    const count = (f, v) => S.items.filter(it => it[f] === v).length;
    const sw = 'width:26px;height:22px;padding:0 !important;border:1px solid var(--t-border) !important;border-radius:5px;cursor:pointer;flex:none';
    const sysN = k => S.items.reduce((n, it) => n + ['', ...(it.subs || []).map(x => x.s)].filter(s => sysKey(it, s) === k).length, 0);
    const sysRows = f => f !== 'stt' ? '' : ['used', 'past'].map(k => `<div class="dh-sysl" style="display:flex;align-items:center;gap:6px;padding:3px 0" title="Trạng thái hệ thống: tự gán theo chuỗi 301 ở Theo dõi web, không sửa/xoá được">
        <span style="width:26px;text-align:center;flex:none">🔒</span>
        <span style="flex:1;font-weight:600">${esc(S.sys[k])}</span>
        <span style="color:var(--t-fg-subtle);font-size:11px">hệ thống</span>
        <span style="color:var(--t-fg-muted);min-width:18px;text-align:right">${sysN(k)}</span></div>`).join('');
    const box = f => `<div style="flex:1;min-width:220px">
      <div style="font-weight:600;margin-bottom:6px">${LBL[f][1]}</div>
      ${sysRows(f)}
      ${(S.labels[f] || []).map(v => `<div style="display:flex;align-items:center;gap:6px;padding:3px 0">
        <input type="color" data-lcol="${f}" data-v="${esc(v)}" value="${pickHex(f, v)}" title="${custom(f, v) ? 'Màu tự chọn · bấm để đổi' : 'Màu tự động · bấm để chọn màu'}" style="${sw}">
        <span style="${selCss(f, v)};cursor:default;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v)}</span>
        ${custom(f, v) ? `<button data-lcr="${f}" data-v="${esc(v)}" title="Về màu tự động" style="${btn('padding:2px 6px')}">↺</button>` : '<span style="color:var(--t-fg-subtle);font-size:11px">tự động</span>'}
        <span style="color:var(--t-fg-muted);min-width:18px;text-align:right">${count(f, v)}</span>
        <button data-lr="${f}" data-v="${esc(v)}" title="Đổi tên" style="${btn('padding:2px 6px')}">✎</button>
        <button data-ld="${f}" data-v="${esc(v)}" title="Xoá" style="${btn('padding:2px 6px;color:var(--t-danger)')}">✕</button>
      </div>`).join('') || '<div style="color:var(--t-fg-muted);padding:3px 0">Chưa có</div>'}
      <div style="display:flex;gap:6px;margin-top:6px;align-items:center">
        <input type="color" data-lnc="${f}" value="#3b82f6" title="Màu cho ${LBL[f][0]} mới · không chọn thì tự động" style="${sw}">
        <span data-lncl="${f}" style="color:var(--t-fg-subtle);font-size:11px;white-space:nowrap">tự động</span>
        <input data-li="${f}" placeholder="Tên ${LBL[f][0]} mới" style="flex:1;min-width:0;background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:5px;padding:4px 7px;font-size:12px">
        <button data-la="${f}" style="${btn(pri + ';padding:4px 10px')}">Thêm</button>
      </div>
    </div>`;
    lab.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>⚙ Nhóm & trạng thái</b><button data-lx style="${btn('padding:2px 8px')}">✕</button></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">${box('grp')}${box('stt')}</div>`;
  }
  const newColor = f => { const c = lab && lab.querySelector(`[data-lnc="${f}"]`); return c && c.dataset.set ? c.value : ''; };
  async function labAct(body) {
    try { const d = await api('labels', body); S.labels[body.field] = d.list; if (d.colors) S.colors = d.colors; await load(); if (lab) labDraw(); } catch (e) { fail(e); }
  }
  function labOpen(anchor) {
    labClose();
    lab = document.createElement('div');
    lab.id = 'dhLab';
    lab.style.cssText = 'position:fixed;z-index:10000;width:520px;max-width:calc(100vw - 16px);max-height:70vh;overflow:auto;background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:10px;font-size:12px;font-family:inherit;box-sizing:border-box';
    document.body.appendChild(lab);
    labDraw();
    const r = anchor.getBoundingClientRect();
    lab.style.left = Math.max(8, Math.min(r.left, innerWidth - lab.offsetWidth - 8)) + 'px';
    lab.style.top = Math.min(r.bottom + 4, innerHeight - lab.offsetHeight - 8) + 'px';
    lab.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-lx]')) return labClose();
      const add = t.closest('[data-la]');
      if (add) { const f = add.dataset.la, inp = lab.querySelector(`[data-li="${f}"]`), name = inp.value.trim(); if (name) labAct({ field: f, op: 'add', name, color: newColor(f) }); return; }
      const cr = t.closest('[data-lcr]');
      if (cr) { labAct({ field: cr.dataset.lcr, op: 'color', name: cr.dataset.v, color: '' }); return; }
      const ncl = t.closest('[data-lncl]');
      if (ncl && ncl.dataset.set) { const f = ncl.dataset.lncl, c = lab.querySelector(`[data-lnc="${f}"]`); delete c.dataset.set; delete ncl.dataset.set; ncl.textContent = 'tự động'; ncl.style.cursor = ''; return; }
      const ren = t.closest('[data-lr]');
      if (ren) { const f = ren.dataset.lr, v = ren.dataset.v, to = (prompt(`Đổi tên ${LBL[f][0]} "${v}" thành:`, v) || '').trim(); if (to && to !== v) labAct({ field: f, op: 'ren', name: v, to }); return; }
      const del = t.closest('[data-ld]');
      if (del) { const f = del.dataset.ld, v = del.dataset.v; if (confirm(`Xoá ${LBL[f][0]} "${v}"? Các domain đang mang ${LBL[f][0]} này sẽ về trống.`)) labAct({ field: f, op: 'del', name: v }); }
    });
    lab.addEventListener('keydown', e => { const i = e.target.closest('[data-li]'); if (i && e.key === 'Enter' && i.value.trim()) labAct({ field: i.dataset.li, op: 'add', name: i.value.trim(), color: newColor(i.dataset.li) }); });
    lab.addEventListener('input', e => {
      const c = e.target.closest('[data-lnc]');
      if (!c) return;
      const l = lab.querySelector(`[data-lncl="${c.dataset.lnc}"]`);
      c.dataset.set = '1'; l.dataset.set = '1'; l.textContent = c.value + ' ✕'; l.style.cursor = 'pointer'; l.title = 'Bỏ màu đã chọn (về tự động)';
    });
    lab.addEventListener('change', e => { const c = e.target.closest('[data-lcol]'); if (c) labAct({ field: c.dataset.lcol, op: 'color', name: c.dataset.v, color: c.value }); });
  }
  document.addEventListener('mousedown', e => { if (lab && !lab.contains(e.target) && !e.target.closest('[data-a="labels"]')) labClose(); }, true);
  document.addEventListener('keydown', e => { if (lab && e.key === 'Escape') labClose(); });

  function actions() {
    const n = S.sel.size;
    const b = [];
    if (S.view === 'pass') b.push(`<button data-a="take" style="${btn(pri)}" ${n ? '' : 'disabled'}>✅ Nhận ${n || ''} domain → Kho của tôi</button>`);
    if (S.view === 'mine' || S.view === 'man') b.push(`<button data-a="manual" style="${btn(S.view === 'mine' ? pri : '')}">＋ Nhập thủ công</button>`);
    if (S.view === 'man') {
      b.push(`<button data-a="confirm" style="${btn(pri)}" ${n ? '' : 'disabled'}>✅ Xác nhận ${n || ''} domain → Kho của tôi</button>`);
      b.push(`<button data-a="recheck" style="${btn()}" ${n ? '' : 'disabled'}>🔁 Kiểm lại</button>`);
      b.push(`<button data-a="unman" style="${btn('color:var(--t-danger)')}" ${n ? '' : 'disabled'}>✕ Hủy nhập</button>`);
    }
    if (S.view === 'mine') {
      const flat = flatMode();
      const tn = flat ? rootsPicked().length : n;
      const ns = subPicked().length;
      b.push(`<span style="display:inline-flex;border:1px solid var(--t-border);border-radius:7px;overflow:hidden">${MODES.map(([k, l]) => `<button data-mode="${k}" style="${btn('border:0;border-radius:0;' + (S.mode === k ? pri : ''))}">${l}</button>`).join('')}</span>`);
      if (!flat) b.push(`<button data-a="untake" style="${btn()}" ${n ? '' : 'disabled'}>↩ Trả về Kho chờ</button>`);
      b.push(`<select class="dh-bulk" data-f="grp" ${tn ? '' : 'disabled'} style="${btn('padding:5px 8px')}">${tagOpts('grp', '', `🏷 Gán nhóm${tn ? ' cho ' + tn + ' domain' : ''}…`)}<option value="__none">— Bỏ nhóm</option></select>`);
      b.push(`<select class="dh-bulk" data-f="stt" ${tn ? '' : 'disabled'} style="${btn('padding:5px 8px')}">${tagOpts('stt', '', `📌 Gán trạng thái${tn ? ' cho ' + tn + ' domain' : ''}…`)}<option value="__none">— Bỏ trạng thái</option></select>`);
      b.push(`<button data-a="labels" style="${btn()}">⚙ Nhóm & trạng thái</button>`);
      if (!flat) {
        const allOpen = S.items.some(it => (it.subs || []).length) && S.items.every(it => !(it.subs || []).length || S.open.has(it.d));
        b.push(`<button data-a="openall" style="${btn()}">${allOpen ? '▲ Thu gọn hết' : '▼ Mở hết subdomain'}</button>`);
      }
      b.push(`<button data-a="delsub" style="${btn('color:var(--t-danger)')}" ${ns ? '' : 'disabled'}>✂ Xoá ${ns || ''} subdomain đã chọn</button>`);
      if (flat) {
        if (filtering()) b.push(`<button data-a="clearf" style="${btn()}">✕ Xoá mọi bộ lọc</button>`);
        b.push(`<button data-a="copy" style="${btn()}">📋 Copy ${S.ssel.size ? S.ssel.size + ' đã chọn' : 'tất cả'}</button>`);
        b.push(`<button data-a="csv" style="${btn()}">⬇ CSV</button>`);
        return b.join('');
      }
    }
    if (S.view === 'fail') b.push(`<button data-a="except" style="${btn(pri)}" ${n ? '' : 'disabled'}>⭐ Phá lệ ${n || ''} domain → Kho chờ</button>`);
    if (S.view === 'fail' || S.view === 'err') b.push(`<button data-a="recheck" style="${btn()}" ${n ? '' : 'disabled'}>🔁 Kiểm lại</button>`);
    if (filtering()) b.push(`<button data-a="clearf" style="${btn()}">✕ Xoá mọi bộ lọc</button>`);
    const cn = S.view === 'mine' && S.ssel.size ? S.ssel.size : n;
    b.push(`<button data-a="copy" style="${btn()}">📋 Copy ${cn ? cn + ' đã chọn' : 'tất cả'}</button>`);
    b.push(`<button data-a="csv" style="${btn()}">⬇ CSV</button>`);
    if (S.view !== 'man') b.push(`<button data-a="del" style="${btn('color:var(--t-danger)')}" ${n ? '' : 'disabled'}>🗑 Xoá</button>`);
    return b.join('');
  }

  function shell() {
    root.innerHTML = `<style>#page-domainhunt button:disabled{opacity:.45;cursor:not-allowed}#dhBody tr.dh-on>td{background:color-mix(in srgb,var(--t-accent) 12%,var(--t-subtle)) !important}#dhBody tr:hover>td{background:color-mix(in srgb,var(--t-accent) 22%,var(--t-subtle)) !important;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--t-accent) 55%,transparent),inset 0 -1px 0 color-mix(in srgb,var(--t-accent) 55%,transparent) !important}#dhBody tr:hover>td:first-child{box-shadow:inset 3px 0 0 var(--t-accent),inset 0 1px 0 color-mix(in srgb,var(--t-accent) 55%,transparent),inset 0 -1px 0 color-mix(in srgb,var(--t-accent) 55%,transparent) !important}</style><div style="padding:16px;display:flex;flex-direction:column;gap:12px;height:calc(100vh - 90px);box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h2 style="margin:0;font-size:18px;color:var(--t-fg)">🎯 Săn domain</h2>
        <span style="color:var(--t-fg-muted);font-size:12px" id="dhHint"></span>
      </div>
      <label id="dhDrop" style="display:flex;align-items:center;gap:10px;padding:12px;border:1px dashed var(--t-border2);border-radius:8px;cursor:pointer;color:var(--t-fg-muted);font-size:13px">
        <input type="file" id="dhFile" accept=".csv,text/csv" multiple style="display:none">
        <span style="${btn(pri)}">📂 Chọn file CSV</span> hoặc kéo thả file vào đây · chỉ lấy dòng <b>available</b>, domain đã có sẵn thì bỏ qua
      </label>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--t-fg-muted)">
        <b style="color:var(--t-fg);white-space:nowrap" title="Domain có 1 trong các sub này (đúng nguyên tên sub, chỉ cần 1 trang trên Wayback) vào thẳng Kho chờ, không cần đủ số subdomain. Dùng chung cho mọi tài khoản.">🎯 Sub mong muốn</b>
        <input id="dhWant" placeholder="vd: blog, shop, news (cách nhau bằng dấu phẩy)" style="flex:1;min-width:220px;max-width:560px;background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit">
        <button data-a="wants" style="${btn(pri)}">💾 Lưu</button>
        <span id="dhWantInfo"></span>
      </div>
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
    const flat = flatMode();
    const hl = flat ? hosts() : [];
    const allOn = flat ? hl.length && hl.every(o => S.ssel.has(o.k)) : list.length && list.every(it => S.sel.has(it.d));
    $('dhHint').textContent = `Tải CSV xuất từ Namecheap (Beast Mode → Export). VPS tự kiểm subdomain trên Wayback 24/7: có ${S.opt.max ? (S.opt.min || 3) + '–' + S.opt.max : 'từ ' + (S.opt.min || 3)} subdomain thật (đã bỏ cổng đăng nhập/ứng dụng nội bộ), mỗi subdomain từ ${S.opt.pages || 2} trang trở lên thì vào Kho chờ. Có sub mong muốn thì vào Kho chờ luôn.`;
    put($('dhWork'), workerLine());
    const wi = $('dhWant');
    if (document.activeElement !== wi && !wi.dataset.dirty) { const v = S.wants.join(', '); if (wi.value !== v) wi.value = v; }
    put($('dhWantInfo'), S.wants.length ? `Đang dùng ${S.wants.length} sub · domain có 1 trong các sub này (đúng tên, chỉ cần 1 trang) vào thẳng Kho chờ, không cần đủ ${S.opt.min || 3} sub` : 'Chưa có · domain có sub đúng tên này (chỉ cần 1 trang) vào thẳng Kho chờ, không cần đủ điều kiện số sub');
    put($('dhTabs'), VIEWS.map(([k, label, tip]) => `<button data-v="${k}" title="${esc(tip)}" style="${btn(S.view === k ? pri : '')}">${label} <b>${S.counts[k] || 0}</b></button>`).join(''));
    const picked = S.view === 'mine' ? S.sel.size + S.ssel.size : S.sel.size;
    const total = flat ? `${hl.length} host` : `${list.length} domain`;
    const tl = flat ? hl.length : list.length;
    put($('dhBar'), actions() + `<span style="color:var(--t-fg-muted);font-size:12px">${picked ? `Đã chọn ${picked} · ` : ''}${total}${tl > cap ? ` (hiện ${cap} dòng đầu)` : ''}</span>`);
    $('dhErr').textContent = S.err ? '⚠️ ' + S.err : '';
    const so = srt() || {};
    const key = S.view + '|' + (S.view === 'mine' ? S.mode : '') + '|' + so.k + '|' + so.dir + '|' + Object.keys(xf()).sort().join(',');
    if (S.headKey !== key) { S.headKey = key; $('dhHead').innerHTML = headHtml(); }
    const all = $('dhAll');
    if (all) all.checked = !!allOn;
    const cols = colSpec().length + 1;
    put($('dhBody'), (flat ? hl.slice(0, cap).map(hostRow) : list.slice(0, cap).map(rowHtml)).join('') || `<tr><td colspan="${cols}" style="padding:24px;text-align:center;color:var(--t-fg-muted)">${filtering() ? 'Không có domain nào khớp bộ lọc' : 'Chưa có domain nào'}</td></tr>`);
  }

  function headHtml() {
    const th = 'padding:6px 8px;text-align:left;white-space:nowrap';
    const so = srt();
    const col = ({ c, label, extra }) => {
      if (!c) return `<th style="${th};${extra || ''}">${label}</th>`;
      const on = !!xf()[c], s = so && so.k === c;
      return `<th style="${th};${extra || ''}">${label}${s ? ` <span style="color:var(--t-accent)">${so.dir > 0 ? '▲' : '▼'}</span>` : ''} <button type="button" data-fn="${c}" title="${on ? 'Đang lọc · bấm để sửa' : 'Lọc / sắp xếp'}" style="border:1px solid ${on ? 'var(--t-accent)' : 'transparent'};background:${on ? 'color-mix(in srgb,var(--t-accent) 18%,transparent)' : 'none'};color:${on ? 'var(--t-accent)' : 'var(--t-fg-subtle)'};border-radius:4px;padding:1px 3px;cursor:pointer;vertical-align:middle;line-height:0">${FUNNEL}</button></th>`;
    };
    return `<tr>
      <th style="${th};width:28px"><input type="checkbox" id="dhAll"></th>
      ${colSpec().map(col).join('')}
    </tr>`;
  }

  function csvOut(list) {
    const cell = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['domain', 'gia', 'premium', 'so_sub', 'subdomain', 'ly_do', 'kiem_luc', 'nhan_luc', 'nhom', 'trang_thai'];
    const body = list.map(it => [it.d, it.price, it.premium ? 'premium' : '', (it.subs || []).length, (it.subs || []).map(x => `${x.s}.${it.d} (${x.n})`).join(' | '), it.reason || '', when(it.chk), when(it.take), it.grp || '', it.stt || '']);
    const blob = new Blob(['﻿' + [head, ...body].map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `san-domain-${S.view}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function manOpen() {
    if (document.getElementById('dhManOv')) return;
    const ov = document.createElement('div');
    ov.id = 'dhManOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `<div style="background:var(--t-subtle);border:1px solid var(--t-border);border-radius:12px;padding:16px;max-width:560px;width:100%;color:var(--t-fg)">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px">＋ Nhập domain bạn đang có</div>
      <div style="font-size:12px;color:var(--t-fg-muted);margin-bottom:8px">Dán danh sách domain, mỗi dòng một domain (có thể kèm https://, www., hoặc ngăn bằng dấu phẩy). VPS sẽ kiểm subdomain hợp lệ trên Wayback, kết quả hiện ở tab "Chờ xác nhận" để bạn xác nhận rồi mới chuyển vào Kho của tôi.</div>
      <textarea id="dhManTa" rows="9" placeholder="example.com&#10;domain-khac.net" style="width:100%;box-sizing:border-box;background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:8px;font-size:13px;font-family:inherit;resize:vertical"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button id="dhManNo" style="${btn()}">Hủy</button><button id="dhManGo" style="${btn(pri)}">Kiểm subdomain</button></div>
    </div>`;
    document.body.appendChild(ov);
    const ta = ov.querySelector('#dhManTa');
    ta.focus();
    const close = () => ov.remove();
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('#dhManNo').onclick = close;
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    ov.querySelector('#dhManGo').onclick = async () => {
      const domains = ta.value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
      if (!domains.length) { say('Chưa nhập domain nào', '#e67e22'); return; }
      if (S.busy) return;
      S.busy = true;
      try {
        const d = await api('manual', { domains });
        close();
        const n = (d.added || 0) + (d.flagged || 0);
        say(`Đã đưa ${n} domain vào kiểm${d.mine ? ' · ' + d.mine + ' đã có trong Kho của tôi' : ''}${d.bad ? ' · ' + d.bad + ' mục không phải domain: ' + (d.badList || []).join(', ') : ''}`, d.bad ? '#e67e22' : '#238636');
        S.view = 'man'; S.sel.clear(); S.ssel.clear(); S.items = []; S.last = null;
        draw();
        await load();
      } catch (e) { fail(e); } finally { S.busy = false; }
    };
  }

  async function wantSave() {
    const inp = root.querySelector('#dhWant');
    if (!inp || S.busy) return;
    const list = inp.value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    S.busy = true;
    try {
      const d = await api('wants', { list });
      S.wants = d.wants || [];
      delete inp.dataset.dirty;
      inp.value = S.wants.join(', ');
      const parts = [S.wants.length ? `Đã lưu ${S.wants.length} sub mong muốn` : 'Đã xoá hết sub mong muốn'];
      if (d.up) parts.push(`${d.up} domain Không đạt chuyển sang Kho chờ`);
      if (d.down) parts.push(`${d.down} domain không còn khớp, về Không đạt`);
      if ((d.bad || []).length) parts.push('bỏ mục sai: ' + d.bad.join(', '));
      say(parts.join(' · '), (d.bad || []).length ? '#e67e22' : '#238636');
      await load();
    } catch (e) { fail(e); } finally { S.busy = false; }
  }

  async function run(a) {
    if (a === 'manual') { manOpen(); return; }
    if (a === 'wants') { wantSave(); return; }
    const list = shown();
    const picked = list.filter(it => S.sel.has(it.d));
    const ds = picked.map(it => it.d);
    if (a === 'copy' && S.view === 'mine' && (S.ssel.size || flatMode())) {
      const hs = S.ssel.size ? [...S.ssel].map(hostOf) : hosts().map(o => o.h);
      try { await navigator.clipboard.writeText(hs.join('\n')); say(`Đã copy ${hs.length} host`); } catch (e) { fail('Không copy được: ' + e.message); }
      return;
    }
    if (a === 'csv' && flatMode()) {
      const doms = new Set(S.ssel.size ? rootsPicked() : hosts().map(o => o.it.d));
      csvOut(S.items.filter(it => doms.has(it.d)));
      return;
    }
    if (a === 'copy') {
      const src = picked.length ? picked : list;
      try { await navigator.clipboard.writeText(src.map(it => it.d).join('\n')); say(`Đã copy ${src.length} domain`); } catch (e) { fail('Không copy được: ' + e.message); }
      return;
    }
    if (a === 'csv') { csvOut(picked.length ? picked : list); return; }
    if (a === 'labels') { if (lab) labClose(); else labOpen(root.querySelector('[data-a="labels"]')); return; }
    if (a === 'openall') {
      const withSubs = S.items.filter(it => (it.subs || []).length);
      if (withSubs.every(it => S.open.has(it.d))) S.open.clear(); else withSubs.forEach(it => S.open.add(it.d));
      draw();
      return;
    }
    if (a === 'delsub') {
      const pairs = subPicked().map(k => { const j = k.indexOf('|'); return { d: k.slice(0, j), s: k.slice(j + 1) }; });
      if (!pairs.length || S.busy) return;
      if (!confirm(`Xoá ${pairs.length} subdomain khỏi Kho của tôi?`)) return;
      S.busy = true;
      try {
        const d = await api('delsub', { pairs });
        say(`Đã xoá ${d.n} subdomain`);
        S.ssel.clear();
        await load();
      } catch (e) { fail(e); } finally { S.busy = false; }
      return;
    }
    if (a === 'clearf') { S.xfs[fk()] = {}; popClose(); S.sel.clear(); S.ssel.clear(); S.last = null; S.lastH = null; draw(); return; }
    if (!ds.length || S.busy) return;
    if (a === 'del' && !confirm(`Xoá ${ds.length} domain? Domain đã xoá sẽ không được thêm lại khi tải CSV.`)) return;
    if (a === 'unman' && !confirm(`Hủy nhập ${ds.length} domain? Domain nhập thủ công sẽ bị bỏ khỏi danh sách chờ xác nhận.`)) return;
    const weak = picked.filter(it => it.st === 'fail').length;
    if (a === 'confirm' && weak && !confirm(`${weak} domain chưa đủ tiêu chí subdomain. Vẫn chuyển vào Kho của tôi?`)) return;
    S.busy = true;
    try {
      const d = await api(a, { ds });
      const msg = { take: 'Đã nhận', untake: 'Đã trả về Kho chờ', recheck: 'Đã đưa vào hàng chờ kiểm lại', del: 'Đã xoá', confirm: 'Đã chuyển vào Kho của tôi', unman: 'Đã hủy nhập' }[a];
      say(a === 'except' ? `Đã phá lệ ${d.n} domain, chuyển vào Kho chờ` : `${msg} ${d.n} domain`);
      S.sel.clear();
      await load();
    } catch (e) { fail(e); } finally { S.busy = false; }
  }

  function bind() {
    root.addEventListener('click', e => {
      const v = e.target.closest('[data-v]');
      if (v) { if (S.view !== v.dataset.v) { popClose(); S.view = v.dataset.v; S.sel.clear(); S.ssel.clear(); labClose(); S.last = null; S.items = []; draw(); load(); } return; }
      const fn = e.target.closest('[data-fn]');
      if (fn) { if (P && P.c === fn.dataset.fn) popClose(); else popOpen(fn.dataset.fn, fn); return; }
      const a = e.target.closest('[data-a]');
      if (a && !a.disabled) { run(a.dataset.a); return; }
      const md = e.target.closest('[data-mode]');
      if (md) { if (S.mode !== md.dataset.mode) { S.mode = md.dataset.mode; try { localStorage.setItem('dhMode', S.mode); } catch (er) {} S.lastH = null; S.last = null; S.sel.clear(); S.ssel.clear(); draw(); } return; }
      const tg = e.target.closest('[data-tg]');
      if (tg && !tg.disabled) { const d = tg.dataset.tg; S.open.has(d) ? S.open.delete(d) : S.open.add(d); draw(); return; }
      const sck = e.target.closest('.dh-sck');
      if (sck) {
        const on = sck.checked;
        if (sck.dataset.hi != null) {
          const hl = hosts(), i = Number(sck.dataset.hi);
          if (e.shiftKey && S.lastH != null) {
            const [x, y] = [Math.min(S.lastH, i), Math.max(S.lastH, i)];
            for (let k = x; k <= y; k++) if (hl[k]) on ? S.ssel.add(hl[k].k) : S.ssel.delete(hl[k].k);
          } else on ? S.ssel.add(sck.dataset.k) : S.ssel.delete(sck.dataset.k);
          S.lastH = i;
        } else on ? S.ssel.add(sck.dataset.k) : S.ssel.delete(sck.dataset.k);
        draw();
        return;
      }
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
      if (e.target.id === 'dhAll' && flatMode()) {
        hosts().forEach(o => e.target.checked ? S.ssel.add(o.k) : S.ssel.delete(o.k));
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
      if (e.target.id === 'dhQ') { S.q = e.target.value; S.last = null; S.lastH = null; draw(); }
      if (e.target.id === 'dhWant') e.target.dataset.dirty = '1';
    });
    root.addEventListener('keydown', e => { if (e.target.id === 'dhWant' && e.key === 'Enter') { e.preventDefault(); wantSave(); } });
    root.addEventListener('change', e => {
      if (e.target.classList.contains('dh-tag')) { setTag(e.target.dataset.f, [e.target.dataset.d], e.target.value); return; }
      if (e.target.classList.contains('dh-bulk')) {
        const v = e.target.value;
        if (!v) return;
        const ds = flatMode() ? rootsPicked() : shown().filter(it => S.sel.has(it.d)).map(it => it.d);
        setTag(e.target.dataset.f, ds, v === '__none' ? '' : v);
        return;
      }
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
  const hn = u => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.+$/, '').replace(/^www\./, '');
  function usageHosts(ws) {
    const list = (Array.isArray(ws) ? ws : []).filter(w => w && w.url);
    const byUrl = new Map(), byBrand = new Map();
    list.forEach(w => { const h = hn(w.url); if (h && !byUrl.has(h)) byUrl.set(h, w); if (!w.is301 && w.brand && !byBrand.has(w.brand)) byBrand.set(w.brand, w); });
    const parentOf = w => w.is301 && w.sourceUrl ? (byUrl.get(hn(w.sourceUrl)) || byBrand.get(w.sourceUrl) || null) : null;
    const hasKid = new Set();
    list.forEach(w => { const p = parentOf(w); if (p && p !== w) hasKid.add(p); });
    const out = [], seen = new Set();
    list.forEach(w => {
      if (!w.is301 && !hasKid.has(w)) return;
      let r = w;
      const vis = new Set();
      while (!vis.has(r)) { vis.add(r); const p = parentOf(r); if (!p || p === r) break; r = p; }
      const h = hn(w.url);
      if (!h || seen.has(h)) return;
      seen.add(h);
      out.push({ h, r: hn(r.is301 && r.sourceUrl ? r.sourceUrl : r.url), b: r.brand || w.brand || '' });
    });
    return out;
  }
  let useT = null, useSig = '', useWs = null;
  window.dhUsageReport = function (ws) {
    useWs = ws;
    clearTimeout(useT);
    useT = setTimeout(async () => {
      const hosts = usageHosts(useWs);
      const sig = JSON.stringify(hosts);
      if (sig === useSig) return;
      try {
        const r = await fetch(API + 'usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hosts }) });
        if (!r.ok) return;
        useSig = sig;
        const page = document.getElementById('page-domainhunt');
        if (root && page && !page.classList.contains('is-hidden') && !S.busy) load();
      } catch (e) {}
    }, 4000);
  };
  window.DHUI = { parseCsv, fromNamecheap, usageHosts };
})();
