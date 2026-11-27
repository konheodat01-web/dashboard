(function () {
  const TYPES = [
    { k: 'entity', n: 'Entity', c: 'ent' },
    { k: 'guestpost', n: 'Guest post', c: 'gp' },
    { k: 'backlink', n: 'Backlink', c: 'bl' },
    { k: 'blogcmt', n: 'Blog cmt', c: 'cmt' },
    { k: 'textlink', n: 'Text link', c: 'tl' },
  ];
  const TN = Object.fromEntries(TYPES.map(t => [t.k, t]));
  const STS = [
    { k: 'doing', n: 'Đang thực hiện', c: '#3b82f6' },
    { k: 'fix', n: 'Đang chỉnh sửa', c: '#f59e0b' },
    { k: 'done', n: 'Done', c: '#22c55e' },
  ];
  const stStyle = k => { if (!SN[k]) return ''; const c = SN[k].c; return 'color:' + c + '!important;border:1px solid ' + c + '!important;background-color:color-mix(in srgb,' + c + ' 16%,transparent)!important'; };
  const accList = t => String(t || '').replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean).map(x => /^https?:\/\//i.test(x) ? x : 'https://' + x);
  const accBad = L => L.filter(x => { try { const u = new URL(x); return /\s/.test(x) || !/^https?:$/.test(u.protocol) || !/\.[a-z]{2,}$/i.test(u.hostname); } catch (e) { return true; } });
  const accShort = u => { try { const x = new URL(u); const t = x.hostname.replace(/^www\./, '') + (x.pathname === '/' ? '' : x.pathname) + x.search; return t.length > 46 ? t.slice(0, 44) + '…' : t; } catch (e) { return u; } };
  const accHtml = o => Array.isArray(o.acc) && o.acc.length ? '<div class="bud-acc">🔗 Nghiệm thu: ' + o.acc.map(u => '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(u) + '">' + esc(accShort(u)) + '</a>').join(' · ') + '</div>' : '';
  const SN = Object.fromEntries(STS.map(t => [t.k, t]));
  const stOf = o => SN[o.st] ? o.st : 'doing';
  const COLS = ['dom'].concat(TYPES.map(t => t.k));
  const D = { loaded: false, loading: null, orders: [], plans: {}, me: '', grp: '', batches: [], rate: 0, rateAt: 0, err: '' };
  const U = { tab: 'web', kind: 'm', key: '' };
  try { const s = JSON.parse(localStorage.getItem('bud_ui') || '{}'); if (s.tab === 'batch') U.tab = 'batch'; if (['m', 'q', 'y'].includes(s.kind)) U.kind = s.kind; } catch (e) {}
  let IDX = null, AGG = null;

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hn = u => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/:\d+$/, '');
  const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const monOf = ts => new Date(Number(ts) + 7 * 3600e3).toISOString().slice(0, 7);
  const dm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const dmy = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const tsDay = ts => new Date(Number(ts) + 7 * 3600e3).toISOString().slice(0, 10);
  const tsHm = ts => { const x = new Date(Number(ts) + 7 * 3600e3).toISOString(); return x.slice(8, 10) + '/' + x.slice(5, 7) + ' ' + x.slice(11, 16); };
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const fv = n => Math.round(n || 0).toLocaleString('vi-VN') + 'đ';
  const fu = n => (Math.round((n || 0) * 100) / 100).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' USDT';
  const say = (m, c, ms) => { if (typeof toast === 'function') toast(m, c || '#238636', ms || 3000); };
  const fail = e => say('⚠️ ' + (e && e.message || e), '#e74c3c', 5000);
  const QH = { items: [], seq: 0, wait: {}, clip: null };
  const mLabel = m => m.slice(5, 7) + '/' + m.slice(0, 4);

  function parseVnd(s) {
    let t = String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/đ|vnd$/g, '');
    const m = t.match(/^([\d.,]+)(k|tr|triệu|trieu|m|tỷ|ty|b)?$/);
    if (!m) return 0;
    const mul = { k: 1e3, tr: 1e6, 'triệu': 1e6, trieu: 1e6, m: 1e6, 'tỷ': 1e9, ty: 1e9, b: 1e9 }[m[2]] || 1;
    const n = mul > 1 ? parseFloat(m[1].replace(/,/g, '.')) : parseFloat(m[1].replace(/[.,]/g, ''));
    return Number.isFinite(n) ? Math.round(n * mul) : 0;
  }
  function parseUsdt(s) {
    let t = String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/usdt|\$/g, '');
    if (!/^[\d.,]+$/.test(t)) return 0;
    if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(',', '.');
    const n = parseFloat(t);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  async function api(p, body) {
    const r = await fetch(p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.detail || d.error || ('Lỗi ' + r.status));
    return d;
  }
  const fx = (from, v) => api('/api/budget/fx?from=' + from + '&v=' + encodeURIComponent(v || ''));

  function load() {
    if (D.loading) return D.loading;
    D.loading = Promise.all([api('/api/budget/state'), api('/api/domain-hunt/buys')]).then(([a, b]) => {
      D.orders = a.orders || [];
      D.plans = a.plans || {};
      D.me = b.me || a.me || '';
      D.grp = b.grp || '';
      D.batches = b.batches || [];
      D.loaded = true;
      D.err = '';
    }).catch(e => { D.err = e.message || String(e); }).finally(() => { D.loading = null; });
    const p = D.loading;
    if (!D.rate || Date.now() - D.rateAt > 10 * 60000) fx('usdt', 100).then(r => { D.rate = r.rate; D.rateAt = Date.now(); if (_wstMode === 'budget') rerender(); }).catch(() => {});
    return p;
  }
  const ensure = () => D.loaded ? Promise.resolve() : load();
  function reload() { return load().then(() => { rerender(); refreshIcons(); }); }
  function rerender() { if (_wstMode === 'budget' && typeof renderWsTrack === 'function') renderWsTrack(); }

  function curMonth() { return today().slice(0, 7); }
  function months() {
    const k = U.key || defKey();
    if (U.kind === 'y') return Array.from({ length: 12 }, (_, i) => k + '-' + String(i + 1).padStart(2, '0'));
    if (U.kind === 'q') { const y = k.slice(0, 4), q = +k.slice(-1); return [1, 2, 3].map(i => y + '-' + String((q - 1) * 3 + i).padStart(2, '0')); }
    return [k];
  }
  function defKey() {
    const m = curMonth();
    if (U.kind === 'y') return m.slice(0, 4);
    if (U.kind === 'q') return m.slice(0, 4) + '-Q' + Math.ceil(+m.slice(5, 7) / 3);
    return m;
  }
  function pLabel() {
    const k = U.key || defKey();
    if (U.kind === 'y') return 'năm ' + k;
    if (U.kind === 'q') return 'quý ' + k.slice(-1) + '/' + k.slice(0, 4);
    return mLabel(k);
  }
  function periodOptions() {
    const ms = new Set([curMonth()]);
    D.orders.forEach(o => ms.add(o.date.slice(0, 7)));
    D.batches.forEach(b => ms.add(monOf(b.id)));
    Object.keys(D.plans).forEach(m => ms.add(m));
    const sorted = [...ms].sort();
    const all = [];
    let [y, mo] = sorted[0].split('-').map(Number);
    const [ey, em] = sorted[sorted.length - 1].split('-').map(Number);
    while (y < ey || (y === ey && mo <= em)) { all.push(y + '-' + String(mo).padStart(2, '0')); mo++; if (mo > 12) { mo = 1; y++; } }
    if (U.kind === 'y') return [...new Set(all.map(m => m.slice(0, 4)))].reverse().map(k => [k, 'Năm ' + k]);
    if (U.kind === 'q') return [...new Set(all.map(m => m.slice(0, 4) + '-Q' + Math.ceil(+m.slice(5, 7) / 3)))].reverse().map(k => [k, 'Quý ' + k.slice(-1) + '/' + k.slice(0, 4)]);
    return all.reverse().map(k => [k, 'Tháng ' + mLabel(k)]);
  }
  function saveUi() { try { localStorage.setItem('bud_ui', JSON.stringify({ tab: U.tab, kind: U.kind })); } catch (e) {} }

  function rootOf(w) {
    const ch = getWstRedirectChainBackward(w);
    return ch[ch.length - 1] || w;
  }
  function buildIdx() {
    const rows = (siteTracking || []).map(s => websites.find(w => w.id === s.wsId)).filter(Boolean);
    const byId = new Map(rows.map(w => [w.id, w]));
    const byHost = new Map();
    rows.forEach(w => { const h = hn(w.url); if (h && !byHost.has(h)) byHost.set(h, w); });
    rows.forEach(w => (w.prevRoots || []).forEach(u => { const h = hn(u); if (h && !byHost.has(h)) byHost.set(h, w); }));
    const member = new Map(), wsHost = new Map();
    websites.forEach(x => {
      const h = hn(x.url);
      if (h && (!wsHost.has(h) || !x.is301)) wsHost.set(h, x);
      if (byId.has(x.id)) { member.set(x.id, byId.get(x.id)); return; }
      const r = rootOf(x);
      const row = byId.get(r.id) || byHost.get(hn(r.url));
      if (row) member.set(x.id, row);
    });
    IDX = { rows, byId, byHost, member, wsHost };
    return IDX;
  }
  const idx = () => IDX || buildIdx();
  function rowOfWs(id) { return idx().member.get(id) || null; }
  function rowOfHost(h) {
    const I = idx();
    if (I.byHost.has(h)) return I.byHost.get(h);
    const w = I.wsHost.get(h);
    return w ? rowOfWs(w.id) : null;
  }
  function orderRow(o) {
    const w = websites.find(x => x.id === o.wid);
    if (w) return rowOfWs(w.id);
    return o.wurl ? rowOfHost(hn(o.wurl)) : null;
  }
  function chainOf(row) {
    const I = idx();
    return websites.filter(x => I.member.get(x.id) === row).sort((a, b) => (a.id === row.id ? -1 : b.id === row.id ? 1 : (a.c301At || 0) - (b.c301At || 0)));
  }

  const batchRate = b => (b.real && b.real.rate) || D.rate || 0;
  const batchVnd = b => b.real ? b.real.vnd : b.est * batchRate(b);
  const myBatches = () => D.batches.filter(b => D.grp && b.grp === D.grp);
  const renewed = new Set();
  const isRenewed = o => renewed.has(o.id);
  function tlState(o) {
    const t = today();
    if (isRenewed(o)) return { k: 'renewed' };
    if (o.to < t) return { k: 'expired', d: dayDiff(o.to, t) };
    const left = dayDiff(t, o.to);
    return { k: left <= 7 ? 'soon' : 'ok', d: left };
  }

  function compute(msArg) {
    buildIdx();
    renewed.clear();
    D.orders.forEach(o => { if (o.renewOf) renewed.add(o.renewOf); });
    const ms = new Set(msArg || months());
    const agg = new Map();
    const get = row => { if (!agg.has(row.id)) agg.set(row.id, { dom: 0, domU: 0, entity: 0, guestpost: 0, backlink: 0, blogcmt: 0, textlink: 0, total: 0, totalU: 0, tl: [], items: [] }); return agg.get(row.id); };
    const K = { stDoing: 0, stFix: 0, spent: 0, spentU: 0, ord: 0, ordN: 0, dom: 0, domN: 0, domDiff: 0, domBatches: 0, unused: 0, unusedN: 0, unusedU: 0, tlSoon: 0, tlExpired: 0, noRow: 0, otherAcct: 0 };
    D.orders.forEach(o => {
      const row = orderRow(o);
      if (stOf(o) === 'doing') K.stDoing++;
      if (stOf(o) === 'fix') K.stFix++;
      if (o.type === 'textlink') {
        const s = tlState(o);
        if (s.k === 'soon') K.tlSoon++;
        if (s.k === 'expired') K.tlExpired++;
        if (row && s.k !== 'renewed') get(row).tl.push(o);
      }
      if (!ms.has(o.date.slice(0, 7))) return;
      K.ord += o.vnd; K.ordN++; K.spent += o.vnd; K.spentU += o.usdt;
      if (!row) { K.noRow++; return; }
      const a = get(row);
      a[o.type] += o.vnd; a.total += o.vnd; a.totalU += o.usdt;
      a.items.push({ kind: 'order', o, date: o.date });
    });
    myBatches().forEach(b => {
      b.ds.forEach(x => { if (!x.u) { K.unusedN++; K.unusedU += x.p; } });
      if (!ms.has(monOf(b.id))) return;
      const rate = batchRate(b), v = batchVnd(b);
      K.dom += v; K.domN += b.ds.length; K.domBatches++; K.spent += v; K.spentU += b.real ? b.real.usdt : b.est;
      if (b.real) K.domDiff += b.real.vnd - b.est * b.real.rate;
      b.ds.forEach(x => {
        if (!x.u) return;
        if (x.u.a !== D.me) { K.otherAcct++; return; }
        const row = rowOfHost(hn(x.u.r)) || rowOfHost(hn(x.u.h));
        if (!row) return;
        const a = get(row), vv = x.p * rate;
        a.dom += vv; a.domU += x.p; a.total += vv; a.totalU += x.p;
        a.items.push({ kind: 'dom', x, b, vnd: vv, date: tsDay(b.id) });
      });
    });
    K.unused = K.unusedU * (D.rate || 0);
    const plan = planFor(msArg);
    K.plan = plan.total; K.planMode = plan.mode;
    const res = { agg, K, plan };
    if (!msArg) AGG = res;
    return res;
  }

  function planFor(msArg) {
    const out = { total: 0, mode: '', sites: {} };
    const modes = new Set();
    (msArg || months()).forEach(m => {
      const p = D.plans[m];
      if (!p) return;
      modes.add(p.mode);
      if (p.mode === 'total') out.total += p.total || 0;
      else Object.entries(p.sites || {}).forEach(([k, v]) => { out.sites[k] = (out.sites[k] || 0) + v; out.total += v; });
    });
    out.mode = modes.size > 1 ? 'mix' : ([...modes][0] || '');
    return out;
  }

  const css = `
.bud-tabs{display:inline-flex;border:1px solid var(--t-border);border-radius:7px;overflow:hidden;flex-shrink:0}
.bud-tabs button{border:0;padding:6px 12px;font-size:12px;cursor:pointer;background:var(--t-subtle);color:var(--t-fg-muted)}
.bud-seg,#page-wstrack .bud-seg{display:inline-flex;border:1px solid var(--t-border);border-radius:6px;overflow:hidden}
.bud-seg button,#page-wstrack .bud-seg button{border:0!important;border-radius:0!important;padding:0 10px!important;height:30px;font-size:12px;cursor:pointer;background:var(--t-muted)!important;color:var(--t-fg)!important;box-shadow:none!important}
.bud-seg button.on,#page-wstrack .bud-seg button.on{background:var(--t-accent)!important;color:#fff!important;font-weight:600}
.bud-sel{height:32px;font-size:12px;background:var(--t-muted);color:var(--t-fg);border:1px solid var(--t-border);border-radius:6px;padding:0 8px;cursor:pointer}
.bud-stabs,#page-wstrack .bud-stabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--t-border);background:var(--t-canvas);flex-shrink:0}
.bud-stabs button,#page-wstrack .bud-stabs button{border:0!important;border-bottom:2px solid transparent!important;border-radius:0!important;background:none!important;box-shadow:none!important;padding:8px 14px!important;font-size:13px;color:var(--t-fg-muted)!important;cursor:pointer}
.bud-stabs button.on,#page-wstrack .bud-stabs button.on{color:var(--t-accent)!important;border-bottom-color:var(--t-accent)!important;font-weight:600}
.bud-stabs b,#page-wstrack .bud-stabs b{font-size:11px;background:var(--t-muted);border-radius:8px;padding:0 6px;margin-left:4px;font-weight:600}
.bud-strip{display:flex;gap:10px 20px;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid var(--t-border);background:var(--t-subtle);font-size:12px;color:var(--t-fg);flex-shrink:0}
.bud-strip .l{color:var(--t-fg-muted);font-size:11px}
.bud-strip b{font-size:14px}
.bud-strip .k{cursor:default}.bud-strip .k.cl{cursor:pointer}.bud-strip .k.cl:hover b{text-decoration:underline}
.bud-m{color:var(--t-fg-muted)}.bud-s{font-size:11px}
.bud-bar{height:6px;border-radius:4px;background:var(--t-muted);overflow:hidden;margin-top:3px;min-width:60px}
.bud-bar i{display:block;height:100%;background:var(--t-accent)}.bud-bar i.w{background:var(--t-warn)}.bud-bar i.r{background:var(--t-danger)}
.bud-c{cursor:pointer;border-radius:4px;padding:1px 3px;font-weight:600;color:var(--t-fg)}
.bud-c:hover{background:color-mix(in srgb,var(--t-accent) 15%,transparent)}
.bud-u{display:block;color:var(--t-fg-subtle);font-size:10.5px;font-weight:400}
.bud-exp{display:block;font-size:10.5px;color:var(--t-warn)}
.bud-tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
.bud-t-ent{background:color-mix(in srgb,var(--t-done) 16%,transparent);color:var(--t-done)}
.bud-t-gp{background:color-mix(in srgb,var(--t-accent) 15%,transparent);color:var(--t-accent)}
.bud-t-bl{background:color-mix(in srgb,var(--t-success) 15%,transparent);color:var(--t-success)}
.bud-t-cmt{background:var(--t-muted);color:var(--t-fg-muted)}
.bud-t-tl{background:color-mix(in srgb,var(--t-warn) 16%,transparent);color:var(--t-warn)}
.bud-t-dom{background:var(--t-muted);color:var(--t-fg)}
.bud-ov{position:fixed;inset:0;z-index:100020;background:rgba(1,4,9,.65);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
.bud-dlg{background:var(--t-canvas);color:var(--t-fg);border:1px solid var(--t-border);border-radius:10px;padding:16px 18px;width:640px;max-width:100%;box-shadow:0 12px 40px rgba(0,0,0,.45);font-size:13px}
.bud-dlg h3{margin:0 0 10px;font-size:15px;color:var(--t-fg2)}
.bud-dlg label.f{display:block;font-size:12px;color:var(--t-fg-muted);margin:8px 0 3px}
.bud-dlg input.f,.bud-dlg select.f,.bud-dlg textarea.f{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--t-border);border-radius:6px;font:inherit;font-size:13px;background:var(--t-subtle);color:var(--t-fg)}
.bud-dlg .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bud-dlg .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bud-dlg .end{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.bud-dlg table{width:100%;border-collapse:collapse;font-size:12px}
.bud-dlg th{background:var(--t-subtle);text-align:left;padding:6px;border-bottom:1px solid var(--t-border);font-weight:600;white-space:nowrap}
.bud-dlg td{padding:6px;border-bottom:1px solid var(--t-muted);vertical-align:middle}
.bud-dlg .r{text-align:right}.bud-dlg .c{text-align:center}
.bud-dlg .err{color:var(--t-danger);font-size:12px;min-height:16px;margin-top:6px}
.bud-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.bud-chips button{border:1px solid var(--t-border)!important;background:var(--t-subtle)!important;color:var(--t-fg-muted)!important;border-radius:12px!important;padding:2px 10px!important;font-size:12px;cursor:pointer}
.bud-chips button.on{background:var(--t-accent)!important;border-color:var(--t-accent)!important;color:#fff!important}
.bud-pk{position:relative}
.bud-pk-btn,#page-wstrack .bud-pk-btn{width:100%;text-align:left;box-sizing:border-box;padding:7px 28px 7px 9px!important;border:1px solid var(--t-border)!important;border-radius:6px!important;background:var(--t-subtle)!important;color:var(--t-fg)!important;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}
.bud-pk-btn::after{content:'▾';position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--t-fg-muted)}
.bud-pk-pop{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:5;background:var(--t-canvas);border:1px solid var(--t-border);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:8px}
.bud-pk-q{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--t-accent);border-radius:6px;background:var(--t-subtle);color:var(--t-fg);font:inherit;font-size:13px;outline:none}
.bud-pk-list{max-height:320px;overflow:auto;border-top:1px solid var(--t-muted);margin-top:2px}
.bud-pk-g{padding:6px 8px 3px;font-weight:700;font-size:12px;color:var(--t-fg2);position:sticky;top:0;background:var(--t-canvas)}
.bud-pk-it{padding:5px 8px 5px 20px;font-size:13px;cursor:pointer;border-radius:5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.bud-pk-it.act{background:color-mix(in srgb,var(--t-accent) 22%,transparent)}
.bud-pk-it.sel{font-weight:700}
.bud-pk-it mark,.bud-pk-g mark{background:color-mix(in srgb,var(--t-warn) 40%,transparent);color:inherit;border-radius:2px;padding:0 1px}
.bud-pk-tag{font-size:10.5px;padding:0 6px;border-radius:8px;background:var(--t-muted);color:var(--t-fg-muted)}
.bud-pk-tag.goc{color:var(--t-accent)}.bud-pk-tag.run{background:color-mix(in srgb,var(--t-success) 18%,transparent);color:var(--t-success)}.bud-pk-tag.cut{color:var(--t-danger)}
.bud-pk-foot{font-size:11px;color:var(--t-fg-muted);padding:6px 4px 0}
.bud-ac{position:relative}
.bud-ac-pop{position:absolute;left:0;right:0;top:calc(100% + 2px);z-index:6;background:var(--t-canvas);border:1px solid var(--t-border);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:4px;max-height:240px;overflow:auto}
.bud-ac-it{display:flex;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:13px}
.bud-ac-it.act,.bud-ac-it:hover{background:color-mix(in srgb,var(--t-accent) 20%,transparent)}
select.bud-st{font-size:11.5px;font-weight:700;padding:3px 6px;border:1px solid;border-radius:12px;cursor:pointer;max-width:100%}
select.bud-st option,select.f[data-k="st"] option{color:var(--t-fg);background:var(--t-canvas)}
select.f[data-k="st"]{font-weight:700}
.bud-chips button[data-sf] i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:0}
.bud-acc{font-size:11.5px;margin-top:3px;word-break:break-all}
.bud-code{display:inline-block;font-size:11px;font-weight:700;padding:0 6px;border-radius:6px;border:1px solid var(--t-border);background:var(--t-subtle);color:var(--t-fg-muted);white-space:nowrap}
.bud-rv{width:100%;border-collapse:collapse;font-size:12.5px}
.bud-rv th{text-align:left;font-size:11.5px;color:var(--t-fg-muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--t-border)}
.bud-rv td{padding:7px 8px;border-bottom:1px solid var(--t-border);vertical-align:top}
.bud-rv td.bud-rv-ed{box-shadow:inset 3px 0 0 var(--t-accent);background:color-mix(in srgb,var(--t-accent) 8%,transparent)}
.bud-rv-tag{display:inline-block;margin-left:6px;font-size:10.5px;color:var(--t-accent);font-weight:600}
.bud-rv-bad{border:1px solid var(--t-danger);background:color-mix(in srgb,var(--t-danger) 10%,transparent);color:var(--t-fg);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12.5px}
.bud-rv-bad ul{margin:4px 0 4px 18px}
.bud-rv-warn{border:1px solid var(--t-warn);background:color-mix(in srgb,var(--t-warn) 10%,transparent);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12.5px}
.bud-acc a{color:var(--t-accent);text-decoration:none}.bud-acc a:hover{text-decoration:underline}
.bud-ic{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;font-size:12px;margin-left:4px;flex-shrink:0;cursor:help}
.bud-ic.y{background:color-mix(in srgb,var(--t-done) 18%,transparent)}
.bud-ic.n{background:var(--t-muted);filter:grayscale(1);opacity:.4}
#budBatchView table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
#budBatchView th{position:sticky;top:0;background:var(--t-subtle);padding:8px 6px;font-size:11px;border-bottom:2px solid var(--t-border);text-align:left;white-space:nowrap;z-index:2}
#budBatchView td{padding:8px 6px;border-bottom:1px solid var(--t-muted);vertical-align:middle}
#budBatchView .r{text-align:right}#budBatchView .c{text-align:center}
.bud-btn,#page-wstrack .bud-btn{border:1px solid var(--t-border)!important;background:var(--t-subtle)!important;color:var(--t-fg)!important;border-radius:6px!important;padding:4px 10px!important;font-size:12px;cursor:pointer}
.bud-btn.pri,#page-wstrack .bud-btn.pri{background:var(--t-accent)!important;border-color:var(--t-accent)!important;color:#fff!important}
.bud-btn.bad,#page-wstrack .bud-btn.bad{color:var(--t-danger)!important;border-color:var(--t-danger)!important}
.bud-btn.xs,#page-wstrack .bud-btn.xs{padding:1px 7px!important;font-size:11px}
.bud-btn:disabled,#page-wstrack .bud-btn:disabled{opacity:.5;cursor:default}
`;
  function injectCss() {
    if (document.getElementById('budCss')) return;
    const s = document.createElement('style');
    s.id = 'budCss';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const FORMS = new Set(['budOrderOv', 'budPlanOv', 'budBpOv', 'budWhyOv', 'budQhRvOv']);
  function ov(id, width, html) {
    injectCss();
    const old = document.getElementById(id);
    if (old) old.remove();
    const o = document.createElement('div');
    o.id = id;
    o.className = 'bud-ov';
    o.innerHTML = '<div class="bud-dlg" style="width:' + width + 'px">' + html + '</div>';
    if (!FORMS.has(id)) {
      o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });
      o.addEventListener('keydown', e => { if (e.key === 'Escape') o.remove(); });
    }
    document.body.appendChild(o);
    return o;
  }

  function wsLabel(w) {
    if (!w) return '';
    const row = rowOfWs(w.id);
    const tag = row && row.id === w.id ? 'web gốc' : (w.is301 ? 'web 301' : '');
    return hn(w.url) + (tag ? ' · ' + tag : '');
  }
  function orderWsText(o) {
    const w = websites.find(x => x.id === o.wid);
    return w ? hn(w.url) : (o.wurl ? hn(o.wurl) + ' (đã xoá)' : '—');
  }

  function headRight() {
    injectCss();
    if (!AGG) compute();
    const th = (key, label, cls, title) => '<th onclick="wstHandleSort(\'' + key + '\')" style="padding:8px 6px;text-align:' + (cls || 'right') + ';font-size:11px;white-space:nowrap;cursor:pointer;user-select:none' + (key === 'b_dom' ? ';border-left:2px solid var(--t-border)' : '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + ' ' + wstGetSortIndicator(key) + '</th>';
    return th('b_dom', '🌐 Domain', 'right', 'Giá Kho của domain mà chuỗi web này dùng đầu tiên (web dùng đầu tiên chịu cả), tính vào tháng gửi mẻ')
      + TYPES.map(t => th('b_' + t.k, t.n)).join('')
      + th('b_total', '💰 Tổng chi')
      + th('b_plan', 'Ngân sách', 'left')
      + '<th style="padding:8px 4px"></th>';
  }

  function cell(row, k, a) {
    const v = a ? a[k] : 0;
    const dash = '<span class="bud-m">—</span>';
    let inner = v ? '<span class="bud-c" data-bud-row="' + row.id + '" data-bud-k="' + k + '">' + fv(v) + '</span>' : dash;
    if (k === 'dom' && v) inner += '<span class="bud-u">' + fu(a.domU) + '</span>';
    if (k === 'textlink' && a && a.tl.length) {
      const st = a.tl.map(o => Object.assign({ o }, tlState(o)));
      const bad = st.filter(s => s.k === 'expired').sort((x, y) => x.o.to.localeCompare(y.o.to))[0];
      const soon = st.filter(s => s.k === 'soon').sort((x, y) => x.o.to.localeCompare(y.o.to))[0];
      if (bad) inner += '<span class="bud-exp" style="color:var(--t-danger)">⛔ hết hạn ' + dm(bad.o.to) + '</span>';
      else if (soon) inner += '<span class="bud-exp">⏰ hết hạn ' + dm(soon.o.to) + '</span>';
      else inner += '<span class="bud-exp bud-m" style="color:var(--t-fg-muted)">' + st.length + ' đang chạy</span>';
    }
    return '<td style="padding:8px 6px;text-align:right;' + (k === 'dom' ? 'border-left:2px solid var(--t-border)' : '') + '">' + inner + '</td>';
  }

  function planCell(row, a) {
    const P = AGG.plan, spent = a ? a.total : 0;
    if (P.mode === 'total') return '<td style="padding:8px 6px"><span class="bud-m bud-s">tổng tháng</span></td>';
    const b = P.sites[row.id] || 0;
    if (!b) return '<td style="padding:8px 6px"><span class="bud-m">—</span></td>';
    const pct = Math.round(spent / b * 100);
    const cls = pct > 100 ? 'r' : pct >= 80 ? 'w' : '';
    return '<td style="padding:8px 6px" title="Đã chi ' + fv(spent) + ' / ' + fv(b) + '"><div style="font-weight:600' + (pct > 100 ? ';color:var(--t-danger)' : '') + '">' + fv(b) + ' <span class="bud-m bud-s">' + pct + '%</span></div><div class="bud-bar"><i class="' + cls + '" style="width:' + Math.min(100, pct) + '%"></i></div></td>';
  }

  function rowRight(w) {
    if (!AGG) compute();
    const a = AGG.agg.get(w.id);
    if (!D.loaded) return '<td colspan="9" style="padding:8px 6px;text-align:center;color:var(--t-fg-muted)">' + (D.err ? '⚠️ ' + esc(D.err) : '⏳ Đang tải ngân sách…') + '</td>';
    return COLS.map(k => cell(w, k, a)).join('')
      + '<td style="padding:8px 6px;text-align:right">' + (a && a.total ? '<b>' + fv(a.total) + '</b><span class="bud-u">' + fu(a.totalU) + '</span>' : '<span class="bud-m">0đ</span>') + '</td>'
      + planCell(w, a)
      + '<td style="padding:8px 4px;text-align:center"><button class="bud-btn xs" data-bud-new="' + w.id + '" title="Tạo đơn cho web này">＋</button></td>';
  }

  function sortVal(w, key) {
    if (!AGG) compute();
    const a = AGG.agg.get(w.id);
    const k = key.slice(2);
    if (k === 'plan') return AGG.plan.sites[w.id] || 0;
    return a ? (a[k] || 0) : 0;
  }

  function colgroup() { return { LEFT: [2.5, 13, 12, 5, 7.5], RIGHT: [7.5, 6.5, 6.5, 6.5, 6.5, 7.5, 8.5, 9, 3.5] }; }

  function toolbarHtml() {
    const opts = periodOptions();
    if (!opts.some(o => o[0] === (U.key || defKey()))) U.key = '';
    const k = U.key || defKey();
    return '<span class="bud-seg">' + [['m', 'Tháng'], ['q', 'Quý'], ['y', 'Năm']].map(x => '<button type="button" data-bud-kind="' + x[0] + '" class="' + (U.kind === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</span>'
      + '<select id="budPeriod" class="bud-sel">' + opts.map(o => '<option value="' + o[0] + '"' + (o[0] === k ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>'
      + '<button type="button" class="btn btn-outline btn-sm" data-bud-a="plan">⚙ Ngân sách tháng</button>'
      + '<button type="button" class="btn btn-outline btn-sm" data-bud-a="list">📃 Danh sách đơn</button>'
      + '<button type="button" class="btn btn-outline btn-sm" data-bud-a="qh" title="Dán đơn đã lấy bằng tiện ích Quyhat ở trang Đề xuất dịch vụ">📥 Dán đơn<span data-qhn>' + (QH.items.length ? ' (' + QH.items.length + ')' : '') + '</span></button>'
      + '<button type="button" class="btn btn-sm" data-bud-a="new" style="background:var(--t-accent);color:#fff;border:none">＋ Tạo đơn</button>';
  }

  function barHtml() {
    const K = AGG.K, P = AGG.plan;
    const nb = myBatches().filter(b => months().includes(monOf(b.id))).length;
    let planBox;
    if (P.total) {
      const pct = Math.round(K.spent / P.total * 100), cls = pct > 100 ? 'r' : pct >= 80 ? 'w' : '';
      const left = P.total - K.spent;
      planBox = '<div class="k cl" data-bud-a="plan" style="min-width:220px"><div class="l">Ngân sách ' + pLabel() + ' (' + (P.mode === 'site' ? 'từng website' : P.mode === 'mix' ? 'nhiều kiểu' : 'tổng tháng') + ')</div><b>' + fv(P.total) + '</b> <span class="bud-m"' + (left < 0 ? ' style="color:var(--t-danger)"' : '') + '>· ' + (left < 0 ? 'vượt ' + fv(-left) : 'còn ' + fv(left)) + '</span><div class="bud-bar"><i class="' + cls + '" style="width:' + Math.min(100, pct) + '%"></i></div></div>';
    } else planBox = '<div class="k cl" data-bud-a="plan"><div class="l">Ngân sách ' + pLabel() + '</div><b class="bud-m">chưa đặt</b></div>';
    const diff = K.domDiff ? ' · ' + (K.domDiff > 0 ? '<span style="color:var(--t-danger)">phát sinh +' + fv(K.domDiff) + '</span>' : '<span style="color:var(--t-success)">chiết khấu −' + fv(-K.domDiff) + '</span>') : '';
    const dom = D.grp
      ? '<div class="k cl" data-bud-tab="batch"><div class="l">Mua domain nhóm ' + esc(D.grp) + ' (theo tháng gửi)</div><b>' + fv(K.dom) + '</b> <span class="bud-m">' + K.domBatches + ' mẻ · ' + K.domN + ' domain' + diff + '</span></div>'
        + '<div class="k"><div class="l">Domain đã mua chưa web nào dùng (mọi mẻ)</div><b>' + K.unusedN + '</b> <span class="bud-m">≈ ' + fv(K.unused) + '</span></div>'
      : '<div class="k"><div class="l">Mua domain</div><b class="bud-m">tài khoản này không gắn nhóm Kho domain</b></div>';
    const tl = '<div class="k cl" data-bud-a="tl"><div class="l">Text link sắp hết hạn (7 ngày)</div><b style="color:var(--t-warn)">' + K.tlSoon + '</b>' + (K.tlExpired ? ' <span style="color:var(--t-danger)">· ' + K.tlExpired + ' đã hết hạn chưa gia hạn</span>' : '') + '</div>';
    const warn = K.noRow ? '<div class="k cl" data-bud-a="norow"><div class="l">Đơn không khớp web nào trong bảng</div><b style="color:var(--t-danger)">' + K.noRow + '</b></div>' : '';
    return '<div class="bud-stabs"><button type="button" data-bud-tab="web" class="' + (U.tab === 'web' ? 'on' : '') + '">💰 Theo website</button><button type="button" data-bud-tab="batch" class="' + (U.tab === 'batch' ? 'on' : '') + '">📦 Đơn domain<b>' + nb + ' mẻ</b></button>'
      + '<span style="flex:1"></span><span class="bud-m bud-s" style="align-self:center">' + (D.rate ? '1 USDT ≈ ' + fv(D.rate) + ' (Binance P2P)' : '') + '</span></div>'
      + '<div class="bud-strip">'
      + '<div class="k"><div class="l">Đã chi ' + pLabel() + '</div><b>' + fv(K.spent) + '</b> <span class="bud-m">≈ ' + fu(K.spentU) + '</span></div>'
      + planBox + dom
      + '<div class="k cl" data-bud-a="list"><div class="l">Đơn dịch vụ</div><b>' + fv(K.ord) + '</b> <span class="bud-m">' + K.ordN + ' đơn</span></div>'
      + (K.stFix || K.stDoing ? '<div class="k cl" data-bud-a="st"><div class="l">Đơn chưa xong (mọi kỳ)</div><b style="color:var(--t-accent)">' + K.stDoing + '</b> <span class="bud-m">đang thực hiện</span>' + (K.stFix ? ' · <b style="color:var(--t-warn)">' + K.stFix + '</b> <span class="bud-m">đang chỉnh sửa</span>' : '') + '</div>' : '')
      + tl + warn + '</div>';
  }

  function batchTable(list, opts) {
    opts = opts || {};
    if (!list.length) return '<div style="padding:30px;text-align:center;color:var(--t-fg-muted)">' + (opts.empty || 'Không có mẻ nào') + '</div>';
    let tot = 0;
    const rows = list.map(b => {
      const rate = batchRate(b), v = batchVnd(b);
      tot += v;
      const diffU = b.real ? Math.round((b.real.usdt - b.est) * 100) / 100 : 0;
      const diffV = b.real ? b.real.vnd - b.est * b.real.rate : 0;
      const diff = !b.real ? '<span class="bud-m">—</span>' : Math.abs(diffU) < 0.005 && Math.abs(diffV) < 1 ? '<span class="bud-m">khớp</span>' : '<span style="color:' + (diffV > 0 ? 'var(--t-danger)' : 'var(--t-success)') + '">' + (diffU > 0 ? '+' : '') + fu(diffU) + '<span class="bud-u">' + (diffV > 0 ? 'phát sinh +' + fv(diffV) : 'chiết khấu −' + fv(-diffV)) + '</span></span>';
      const nop = b.ds.filter(x => !x.p).length;
      return '<tr><td><b>' + tsHm(b.id) + '</b>' + (b.legacy ? '<span class="bud-u" title="Mẻ trước khi có Nhận domain: gom theo giờ nhận domain vào Kho">mẻ cũ (gom theo giờ nhận)</span>' : '<span class="bud-u">nhận ' + (b.recv ? tsHm(b.recv) : '') + '</span>') + '</td>'
        + (opts.grp ? '<td>' + esc(b.grp || '—') + '</td>' : '')
        + '<td class="r">' + b.ds.length + '</td><td class="r bud-m">' + (b.fail || (b.legacy ? '—' : 0)) + '</td>'
        + '<td class="r">' + fu(b.est) + '<span class="bud-u">' + (rate ? fv(b.est * rate) : '') + (nop ? ' · ' + nop + ' domain chưa có giá' : '') + '</span></td>'
        + '<td class="r">' + (b.real ? '<b>' + fu(b.real.usdt) + '</b><span class="bud-u">' + fv(b.real.vnd) + ' · tỷ giá ' + Math.round(b.real.rate).toLocaleString('vi-VN') + '</span>' : '<span class="bud-m">chưa nhập</span>') + ' <button class="bud-btn xs" data-bud-bp="' + b.id + '|' + esc(b.grp) + '" title="Nhập giá thực tế của mẻ">✎</button></td>'
        + '<td class="r">' + diff + '</td>'
        + '<td class="r"><b>' + fv(v) + '</b>' + (b.real ? '' : '<span class="bud-u">tạm tính theo giá gửi</span>') + '</td>'
        + '<td class="c">' + b.used + '/' + b.ds.length + '</td></tr>';
    }).join('');
    return '<table><colgroup><col style="width:15%">' + (opts.grp ? '<col style="width:6%">' : '') + '<col style="width:8%"><col style="width:9%"><col style="width:15%"><col style="width:18%"><col style="width:14%"><col style="width:13%"><col style="width:8%"></colgroup>'
      + '<thead><tr><th>Mẻ (ngày gửi)</th>' + (opts.grp ? '<th>Nhóm</th>' : '') + '<th class="r">Mua DONE</th><th class="r">Không mua được</th><th class="r">Giá gửi (Mua DONE)</th><th class="r">Giá thực tế</th><th class="r">Phát sinh / chiết khấu</th><th class="r">' + (opts.total || 'Tính vào tháng') + '</th><th class="c">Đã dùng</th></tr></thead><tbody>' + rows
      + (opts.sum ? '<tr><td colspan="' + (opts.grp ? 7 : 6) + '" class="r"><b>' + opts.sum + '</b></td><td class="r"><b>' + fv(tot) + '</b></td><td></td></tr>' : '') + '</tbody></table>';
  }

  function batchViewHtml() {
    const ms = months();
    const list = myBatches().filter(b => ms.includes(monOf(b.id)));
    if (!D.grp) return '<div style="padding:30px;text-align:center;color:var(--t-fg-muted)">Tài khoản này không gắn nhóm nào ở Kho domain (nhóm 7 → konheodat01, nhóm 88 → konheodat2001).</div>';
    return batchTable(list, { empty: 'Không có mẻ mua domain nhóm ' + esc(D.grp) + ' nào gửi trong ' + pLabel(), sum: 'Tổng mua domain ' + pLabel() + ' (nhóm ' + esc(D.grp) + ')', total: 'Tính vào ' + pLabel() })
      + '<div style="padding:10px 14px;font-size:12px;color:var(--t-fg-muted)">Mỗi mẻ "Đã gửi" ở Kho domain là 1 đơn, tính vào tháng gửi. Chỉ cộng domain Mua DONE (kể cả domain đã dùng). Nhập giá thực tế thì chênh lệch với giá gửi là phát sinh / chiết khấu, chỉ cộng vào tổng tháng; cột 🌐 Domain của từng web luôn theo giá Kho. Mẻ chưa nhập giá thực tế tạm tính theo giá gửi × tỷ giá hiện tại. Chi tiết domain / sub đã dùng: xem ở Kho domain.</div>';
  }

  function applyUI() {
    injectCss();
    const on = _wstMode === 'budget';
    ['seo', 'budget'].forEach(k => {
      const b = document.getElementById('wstModeBtn_' + k);
      if (!b) return;
      const me = (k === 'budget') === on;
      b.style.setProperty('background', me ? '#e74c3c' : 'var(--t-subtle)', 'important');
      b.style.setProperty('color', me ? '#ffffff' : 'var(--t-fg-muted)', 'important');
      b.style.setProperty('border-radius', '0', 'important');
      b.style.setProperty('border', '0', 'important');
      b.style.fontWeight = me ? '700' : '500';
      b.style.cursor = me ? 'default' : 'pointer';
    });
    const tools = document.getElementById('wstToolsBudget');
    const bar = document.getElementById('budBar');
    const tbl = document.getElementById('wstTable');
    const bv = document.getElementById('budBatchView');
    if (tools) { tools.style.display = on ? 'flex' : 'none'; if (on) tools.innerHTML = toolbarHtml(); }
    if (on) compute();
    if (bar) { bar.style.display = on ? 'block' : 'none'; if (on) { bar.innerHTML = D.loaded ? barHtml() : '<div class="bud-strip">' + (D.err ? '⚠️ ' + esc(D.err) : '⏳ Đang tải…') + '</div>'; } }
    const batch = on && U.tab === 'batch';
    if (tbl) tbl.style.display = batch ? 'none' : '';
    if (bv) { bv.style.display = batch ? 'block' : 'none'; if (batch) bv.innerHTML = D.loaded ? batchViewHtml() : ''; }
    if (batch) { const e = document.getElementById('wstEmpty'); if (e) e.style.display = 'none'; }
  }

  function afterRender() { if (_wstMode === 'budget') applyUI(); }

  function enter() {
    IDX = null;
    load().then(() => { rerender(); refreshIcons(); });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-bud-kind],[data-bud-tab],[data-bud-a],[data-bud-row],[data-bud-new],[data-bud-bp]');
    if (!t) return;
    if (t.dataset.budKind) { U.kind = t.dataset.budKind; U.key = ''; saveUi(); rerender(); return; }
    if (t.dataset.budTab) { U.tab = t.dataset.budTab; saveUi(); rerender(); return; }
    if (t.dataset.budRow) { const w = websites.find(x => x.id === Number(t.dataset.budRow)); if (w) detail(w, t.dataset.budK); return; }
    if (t.dataset.budNew) { const w = websites.find(x => x.id === Number(t.dataset.budNew)); orderForm(null, { row: w }); return; }
    if (t.dataset.budBp) { const [id, g] = t.dataset.budBp.split('|'); batchPrice(Number(id), g); return; }
    const a = t.dataset.budA;
    if (a === 'plan') planForm();
    else if (a === 'list') orderList({});
    else if (a === 'tl') orderList({ tl: true });
    else if (a === 'norow') orderList({ norow: true });
    else if (a === 'st') orderList({ st: K_ST(), all: true });
    else if (a === 'new') orderForm(null, {});
    else if (a === 'qh') qhList();
  });
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'budPeriod') { U.key = e.target.value; rerender(); }
  });

  const rateTxt = r => Math.round(r).toLocaleString('vi-VN') + 'đ';
  function bindMoney(get, R, show, after) {
    let tm = null;
    const val = k => k === 'vnd' ? parseVnd(get(k).value) : parseUsdt(get(k).value);
    const conv = (k, o, v) => {
      R.rate = 0;
      show('⏳ Đang lấy tỷ giá Binance P2P…');
      const seq = R.seq;
      tm = setTimeout(() => fx(k, v).then(r => {
        if (seq !== R.seq) return;
        R.rate = r.rate; R.vnd = r.vnd; R.usdt = r.usdt; R.cur = k;
        get(o).value = k === 'vnd' ? String(r.usdt).replace('.', ',') : r.vnd.toLocaleString('vi-VN');
        show('Tỷ giá Binance P2P: 1 USDT = ' + rateTxt(r.rate) + ' (' + (k === 'vnd' ? 'mua USDT bằng VND' : 'bán USDT lấy VND') + '). Đơn quá khứ thì nhập tay cả 2 ô để đúng số đã trả.');
        after();
      }).catch(e => { if (seq === R.seq) show(e.message, true); }), 450);
    };
    const on = k => {
      const o = k === 'vnd' ? 'usdt' : 'vnd';
      R.man[k] = !!get(k).value.trim();
      clearTimeout(tm);
      R.seq++;
      if (R.man[k] && R.man[o]) {
        R.vnd = val('vnd'); R.usdt = val('usdt'); R.cur = k;
        R.rate = R.vnd && R.usdt ? Math.round(R.vnd / R.usdt * 100) / 100 : 0;
        show(R.rate ? 'Nhập tay cả 2 ô (không theo Binance): 1 USDT = ' + rateTxt(R.rate) + '. Xoá 1 ô để tự quy đổi lại.' : 'Số tiền chưa hợp lệ', !R.rate);
        after();
        return;
      }
      const src = R.man[k] ? k : o;
      const v = R.man[src] ? val(src) : 0;
      if (!v) { if (!R.man[o]) get(o).value = ''; R.vnd = R.usdt = R.rate = 0; show('Nhập 1 ô thì ô kia tự quy đổi theo Binance P2P hôm nay. Đơn quá khứ: nhập tay cả 2 ô.'); after(); return; }
      conv(src, src === 'vnd' ? 'usdt' : 'vnd', v);
    };
    get('vnd').oninput = () => on('vnd');
    get('usdt').oninput = () => on('usdt');
    return on;
  }

  function itemsTable(items, actions) {
    if (!items.length) return '<div class="bud-m" style="padding:14px;text-align:center">Chưa có khoản nào</div>';
    return '<table><colgroup><col style="width:8%"><col style="width:11%"><col style="width:27%"><col style="width:15%"><col style="width:12%"><col style="width:14%"><col style="width:13%"></colgroup><thead><tr><th>Ngày</th><th>Loại</th><th>Đối tác · nội dung · web</th><th>Trạng thái</th><th>Hạn</th><th class="r">VND / USDT</th><th></th></tr></thead><tbody>'
      + items.map(it => {
        if (it.kind === 'dom') {
          const x = it.x;
          return '<tr><td>' + dm(it.date) + '</td><td><span class="bud-tag bud-t-dom">Domain</span></td><td>' + esc(x.d) + ' <span class="bud-m bud-s">· mẻ ' + tsHm(it.b.id) + ' · dùng đầu: ' + esc(x.u.h) + '</span></td><td class="bud-m">—</td><td class="bud-m">—</td><td class="r">' + fv(it.vnd) + '<span class="bud-u">' + fu(x.p) + ' · giá Kho</span></td><td class="bud-m bud-s">từ Kho domain</td></tr>';
        }
        const o = it.o, T = TN[o.type];
        let exp = '<span class="bud-m">—</span>';
        if (o.type === 'textlink') {
          const s = tlState(o);
          exp = dm(o.from) + ' → ' + dm(o.to) + '<span class="bud-u" style="color:' + (s.k === 'expired' ? 'var(--t-danger)' : s.k === 'soon' ? 'var(--t-warn)' : 'var(--t-fg-subtle)') + '">' + (s.k === 'renewed' ? 'đã gia hạn' : s.k === 'expired' ? 'đã hết hạn ' + s.d + ' ngày' : 'còn ' + s.d + ' ngày') + '</span>';
        }
        const act = actions === false ? '' : '<button class="bud-btn xs" data-bud-edit="' + o.id + '" title="Sửa đơn">✎</button> <button class="bud-btn xs" data-bud-del="' + o.id + '" title="Xoá đơn">🗑</button>' + (o.type === 'textlink' && !isRenewed(o) ? ' <button class="bud-btn xs pri" data-bud-renew="' + o.id + '" title="Gia hạn: tạo đơn mới nối với đơn này">↻ Gia hạn</button>' : '');
        return '<tr><td>' + dm(o.date) + '<span class="bud-u">' + o.date.slice(0, 4) + '</span></td><td><span class="bud-tag bud-t-' + T.c + '">' + T.n + '</span>' + (o.renewOf ? '<span class="bud-u">gia hạn</span>' : '') + (o.split ? '<span class="bud-u" title="' + esc('Tách đều từ đơn ' + fv(o.split.tv) + ' ≈ ' + fu(o.split.tu) + ' cho ' + o.split.n + ' web') + '">tách ' + o.split.i + '/' + o.split.n + ' · đơn ' + fv(o.split.tv) + '</span>' : '') + '</td><td style="word-break:break-word">' + (o.code ? '<span class="bud-code" title="Mã đơn">#' + esc(o.code) + '</span> ' : '') + (o.ncc ? '<b>' + esc(o.ncc) + '</b>' : '<span class="bud-m">(chưa ghi đối tác)</span>') + (o.note ? ' · ' + esc(o.note) : '') + ' <span class="bud-m bud-s">· ' + esc(orderWsText(o)) + '</span>' + accHtml(o) + '</td><td>' + stCell(o) + '</td><td>' + exp + '</td><td class="r">' + fv(o.vnd) + '<span class="bud-u">' + fu(o.usdt) + ' · tỷ giá ' + Math.round(o.rate).toLocaleString('vi-VN') + '</span></td><td style="white-space:nowrap">' + act + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function bindItemActions(box, after) {
    box.addEventListener('change', async e => {
      const sel = e.target.closest('select[data-bud-st]');
      if (!sel) return;
      const o = D.orders.find(x => x.id === Number(sel.dataset.budSt));
      if (!o) return;
      const v = sel.value;
      let why = '';
      if (v === 'fix') { why = await askWhy(o, o.stWhy); if (why == null) { sel.value = stOf(o); return; } }
      sel.disabled = true;
      try {
        const r = await api('/api/budget/order-st', { id: o.id, st: v, why });
        Object.assign(o, r.order);
        if (v !== 'fix') delete o.stWhy;
        say('✓ ' + TN[o.type].n + (o.ncc ? ' · ' + o.ncc : '') + ' → ' + SN[v].n);
        changed();
        if (after) after();
      } catch (er) { sel.value = stOf(o); sel.disabled = false; fail(er); }
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-bud-edit],[data-bud-del],[data-bud-renew]');
      if (!b) return;
      const id = Number(b.dataset.budEdit || b.dataset.budDel || b.dataset.budRenew);
      const o = D.orders.find(x => x.id === id);
      if (!o) return;
      if (b.dataset.budEdit) orderForm(o, { after });
      else if (b.dataset.budRenew) orderForm(null, { renew: o, after });
      else {
        if (!confirm('Xoá đơn ' + TN[o.type].n + ' ' + fv(o.vnd) + ' (' + dmy(o.date) + ')?')) return;
        api('/api/budget/order-del', { id }).then(() => { D.orders = D.orders.filter(x => x.id !== id); D.orders.forEach(x => { if (x.renewOf === id) delete x.renewOf; }); say('✓ Đã xoá đơn'); changed(); if (after) after(); }).catch(fail);
      }
    });
  }

  function changed() { AGG = null; rerender(); refreshIcons(); }
  function K_ST() { return AGG && AGG.K.stFix ? 'fix' : 'doing'; }
  function stCell(o) {
    const S0 = SN[stOf(o)];
    return '<select class="bud-st" data-bud-st="' + o.id + '" style="' + stStyle(S0.k) + '">' + STS.map(t => '<option value="' + t.k + '"' + (t.k === S0.k ? ' selected' : '') + '>' + t.n + '</option>').join('') + '</select>'
      + (S0.k === 'fix' && o.stWhy ? '<span class="bud-u" style="color:var(--t-warn);white-space:normal" title="' + esc(o.stWhy) + '">✎ ' + esc(o.stWhy) + '</span>' : '');
  }
  function askWhy(o, cur) {
    return new Promise(res => {
      const d = ov('budWhyOv', 440, '<h3>Đang chỉnh sửa — lý do</h3><div class="bud-m bud-s">' + esc(TN[o.type].n + (o.ncc ? ' · ' + o.ncc : '') + ' · ' + fv(o.vnd) + ' · ' + dmy(o.date)) + '</div><label class="f">Lý do cần chỉnh sửa</label><textarea class="f" data-k="why" rows="3" maxlength="500" placeholder="vd: link sai anchor, bài chưa index, đối tác gửi sai web…">' + esc(cur || '') + '</textarea><div class="err" data-k="err"></div><div class="end"><button class="bud-btn" data-x="no">Hủy</button><button class="bud-btn pri" data-x="ok">Lưu</button></div>');
      d.style.zIndex = 100040;
      const ta = d.querySelector('[data-k="why"]');
      let done = false;
      const fin = v => { if (done) return; done = true; d.remove(); res(v); };
      d.querySelector('[data-x="no"]').onclick = () => fin(null);
      d.querySelector('[data-x="ok"]').onclick = () => { const v = ta.value.trim(); if (!v) { d.querySelector('[data-k="err"]').textContent = 'Nhập lý do'; ta.focus(); return; } fin(v); };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) d.querySelector('[data-x="ok"]').click(); };
      new MutationObserver((_, mo) => { if (!document.body.contains(d)) { mo.disconnect(); fin(null); } }).observe(document.body, { childList: true });
      setTimeout(() => ta.focus(), 20);
    });
  }
  function nccList() {
    const m = new Map();
    D.orders.slice().sort((a, b) => (a.at || a.id) - (b.at || b.id)).forEach(o => {
      const n = String(o.ncc || '').trim();
      if (!n) return;
      const k = fold(n);
      const x = m.get(k) || { n, c: 0, last: 0 };
      x.n = n; x.c++; x.last = Math.max(x.last, o.at || o.id);
      m.set(k, x);
    });
    return [...m.values()].sort((a, b) => b.last - a.last);
  }
  function bindSuggest(inp, pop) {
    const all = nccList();
    let vis = [], act = -1;
    const paint = () => {
      const k = fold(inp.value.trim());
      vis = all.filter(x => !k || fold(x.n).includes(k)).filter(x => fold(x.n) !== k).slice(0, 8);
      if (!vis.length) { pop.style.display = 'none'; return; }
      act = Math.min(act, vis.length - 1);
      pop.innerHTML = vis.map((x, i) => '<div class="bud-ac-it' + (i === act ? ' act' : '') + '" data-i="' + i + '"><span>' + esc(x.n) + '</span><span class="bud-m bud-s">' + x.c + ' đơn</span></div>').join('');
      pop.style.display = 'block';
    };
    const pick = i => { if (!vis[i]) return; inp.value = vis[i].n; pop.style.display = 'none'; act = -1; };
    inp.addEventListener('focus', () => { act = -1; paint(); });
    inp.addEventListener('input', () => { act = inp.value.trim() ? 0 : -1; paint(); });
    inp.addEventListener('blur', () => setTimeout(() => { pop.style.display = 'none'; }, 120));
    inp.addEventListener('keydown', e => {
      if (pop.style.display === 'none') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(vis.length - 1, act + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); paint(); }
      else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); pick(act); }
      else if (e.key === 'Tab' && act >= 0 && inp.value.trim()) { pick(act); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pop.style.display = 'none'; }
    });
    pop.addEventListener('mousedown', e => { const it = e.target.closest('[data-i]'); if (it) { e.preventDefault(); pick(Number(it.dataset.i)); } });
  }

  function detail(row, k) {
    let filt = k || '';
    const o = ov('budDetailOv', 900, '');
    const box = o.querySelector('.bud-dlg');
    const paint = () => {
      compute();
      const A = AGG.agg.get(row.id) || { items: [], total: 0, totalU: 0, dom: 0 };
      const items = A.items.filter(it => !filt || (filt === 'dom' ? it.kind === 'dom' : it.kind === 'order' && it.o.type === filt)).sort((x, y) => y.date.localeCompare(x.date));
      const strip = COLS.map(c => '<div><div class="l">' + (c === 'dom' ? '🌐 Domain' : TN[c].n) + '</div><b>' + (A[c] ? fv(A[c]) : '—') + '</b></div>').join('') + '<div><div class="l">Tổng chi</div><b>' + fv(A.total) + '</b> <span class="bud-m">' + fu(A.totalU) + '</span></div>';
      box.innerHTML = '<h3>💰 ' + esc(row.brand || '') + ' · ' + esc(hn(row.url)) + ' — chi tiêu ' + pLabel() + ' <span class="bud-m bud-s" style="font-weight:400">(cả chuỗi 301 cộng về web gốc)</span></h3>'
        + '<div class="bud-strip" style="border:1px solid var(--t-border);border-radius:8px">' + strip + '</div>'
        + '<div class="bud-chips">' + [['', 'Tất cả']].concat(COLS.map(c => [c, c === 'dom' ? 'Domain' : TN[c].n])).map(x => '<button type="button" data-f="' + x[0] + '" class="' + (filt === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>'
        + itemsTable(items)
        + '<div class="end"><button class="bud-btn" data-x="close">Đóng</button><button class="bud-btn pri" data-x="new">＋ Tạo đơn cho chuỗi này</button></div>';
    };
    paint();
    box.addEventListener('click', e => {
      const f = e.target.closest('[data-f]');
      if (f) { filt = f.dataset.f; paint(); return; }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'close') o.remove();
      else orderForm(null, { row, after: paint });
    });
    bindItemActions(box, paint);
  }

  const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function wsPicker(box, sel, opts, onPick) {
    const I = idx();
    const teamOf = w => (typeof getTeamLabel === 'function' ? getTeamLabel(w.team || '') : (w.team || ''));
    const groups = I.rows.slice().sort((a, b) => String(a.brand || '').localeCompare(String(b.brand || ''), 'vi')).map(row => {
      const run = hn(wstCurrentUrl(row));
      const items = chainOf(row).map(w => {
        const h = hn(w.url);
        const cut = !!(w.cut301 && w.cut301.length && !(w.is301 && w.sourceUrl));
        const kind = w.id === row.id ? 'goc' : w.is301 ? '301' : 'khac';
        return { w, h, kind, run: h === run, cut, txt: fold(h + ' ' + (w.brand || '')) };
      });
      return { row, items, txt: fold((row.brand || '') + ' ' + teamOf(row)) };
    });
    const known = sel && websites.find(w => w.id === sel);
    const orphan = sel && !I.member.get(sel) ? { id: sel, label: known ? hn(known.url) + ' (không thuộc web nào trong bảng)' : (opts && opts.wurl ? hn(opts.wurl) : '#' + sel) + ' (đã xoá)' } : null;
    const F = { q: '', f: '', cur: sel || 0, act: -1 };
    const labelOf = id => {
      if (orphan && orphan.id === id) return orphan.label;
      for (const g of groups) for (const it of g.items) if (it.w.id === id) return it.h + ' · ' + (it.kind === 'goc' ? 'web gốc' : it.kind === '301' ? 'web 301' : 'web cũ') + (it.run ? ' · đang chạy' : '') + '  —  ' + (g.row.brand || '');
      return '';
    };
    box.innerHTML = '<input type="hidden" data-k="wid" value="' + (F.cur || '') + '">'
      + '<button type="button" class="bud-pk-btn" data-pk="btn"></button>'
      + '<div class="bud-pk-pop" data-pk="pop" style="display:none"><input class="bud-pk-q" data-pk="q" placeholder="🔍 Gõ brand / domain / team… (không cần dấu)" autocomplete="off">'
      + '<div class="bud-chips" data-pk="chips">' + [['', 'Tất cả'], ['run', 'Đang chạy'], ['goc', 'Web gốc'], ['301', 'Web 301']].map(x => '<button type="button" data-pf="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>'
      + '<div class="bud-pk-list" data-pk="list"></div><div class="bud-pk-foot" data-pk="foot"></div></div>';
    const $ = k => box.querySelector('[data-pk="' + k + '"]');
    const hid = box.querySelector('[data-k="wid"]');
    const btn = $('btn'), pop = $('pop'), qi = $('q'), list = $('list');
    const mark = (t, toks) => {
      const chars = [...String(t == null ? '' : t)], map = [];
      let f = '';
      chars.forEach((c, i) => { for (const y of fold(c)) { f += y; map.push(i); } });
      const on = chars.map(() => false);
      toks.forEach(k => { if (!k) return; let i = f.indexOf(k); while (i >= 0) { for (let j = i; j < i + k.length; j++) on[map[j]] = true; i = f.indexOf(k, i + k.length); } });
      chars.forEach((c, i) => { if (i && !fold(c) && on[i - 1]) on[i] = true; });
      let out = '', open = false;
      chars.forEach((c, i) => { if (on[i] !== open) { out += on[i] ? '<mark>' : '</mark>'; open = on[i]; } out += esc(c); });
      return open ? out + '</mark>' : out;
    };
    const paintBtn = () => { btn.innerHTML = F.cur ? esc(labelOf(F.cur)) : '<span class="bud-m">— chọn web nhận dịch vụ —</span>'; };
    let vis = [];
    const paint = () => {
      const toks = fold(F.q).split(/\s+/).filter(Boolean);
      let html = '', n = 0;
      vis = [];
      if (orphan && !toks.length && !F.f) { vis.push(orphan.id); html += '<div class="bud-pk-it" data-id="' + orphan.id + '">' + esc(orphan.label) + '</div>'; n++; }
      groups.forEach(g => {
        const its = g.items.filter(it => (!F.f || (F.f === 'run' ? it.run : it.kind === F.f)) && toks.every(k => it.txt.includes(k) || g.txt.includes(k)));
        if (!its.length) return;
        html += '<div class="bud-pk-g">' + mark(g.row.brand || '', toks) + ' <span class="bud-m">· ' + mark(hn(g.row.url), toks) + ' · ' + esc(teamOf(g.row)) + '</span></div>';
        its.forEach(it => {
          vis.push(it.w.id); n++;
          html += '<div class="bud-pk-it' + (it.w.id === F.cur ? ' sel' : '') + '" data-id="' + it.w.id + '"><span>' + mark(it.h, toks) + '</span>'
            + ' <span class="bud-pk-tag ' + it.kind + '">' + (it.kind === 'goc' ? 'web gốc' : it.kind === '301' ? 'web 301' : 'web cũ') + '</span>'
            + (it.run ? '<span class="bud-pk-tag run">đang chạy</span>' : '') + (it.cut ? '<span class="bud-pk-tag cut">đã tắt trỏ</span>' : '') + '</div>';
        });
      });
      list.innerHTML = html || '<div class="bud-m" style="padding:14px;text-align:center">Không có web nào khớp "' + esc(F.q) + '"</div>';
      $('foot').textContent = n + ' web' + (toks.length || F.f ? ' khớp' : '') + ' · ↑↓ chọn · Enter để lấy · Esc đóng';
      box.querySelectorAll('[data-pf]').forEach(b => b.classList.toggle('on', b.dataset.pf === F.f));
      F.act = vis.length ? Math.max(0, Math.min(F.act, vis.length - 1)) : -1;
      if (F.act < 0 && vis.length) F.act = Math.max(0, vis.indexOf(F.cur));
      hl();
    };
    const hl = () => {
      list.querySelectorAll('.bud-pk-it').forEach(el => el.classList.toggle('act', vis[F.act] === Number(el.dataset.id)));
      const a = list.querySelector('.bud-pk-it.act');
      if (a) a.scrollIntoView({ block: 'nearest' });
    };
    const open = () => { pop.style.display = 'block'; F.act = -1; paint(); qi.focus(); qi.select(); };
    const close = () => { pop.style.display = 'none'; };
    const pick = id => { F.cur = id; hid.value = id; paintBtn(); close(); btn.focus(); if (onPick) onPick(id); };
    btn.onclick = () => (pop.style.display === 'none' ? open() : close());
    qi.oninput = () => { F.q = qi.value; F.act = 0; paint(); };
    qi.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); F.act = Math.min(vis.length - 1, F.act + 1); hl(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); F.act = Math.max(0, F.act - 1); hl(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (vis[F.act]) pick(vis[F.act]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
    };
    $('chips').onclick = e => { const b = e.target.closest('[data-pf]'); if (!b) return; F.f = b.dataset.pf; F.act = 0; paint(); qi.focus(); };
    list.onmousedown = e => { const it = e.target.closest('.bud-pk-it'); if (it) { e.preventDefault(); pick(Number(it.dataset.id)); } };
    document.addEventListener('mousedown', function h(e) { if (!document.body.contains(box)) { document.removeEventListener('mousedown', h); return; } if (!box.contains(e.target)) close(); });
    paintBtn();
    return { btn, open, value: () => Number(hid.value) || 0 };
  }

  function splitAmt(total, n, dec) {
    const f = Math.pow(10, dec), tc = Math.round(total * f), b = Math.floor(tc / n), r = tc - b * n;
    return Array.from({ length: n }, (_, i) => (b + (i < r ? 1 : 0)) / f);
  }
  function parseMany(text) {
    const I = idx();
    const seen = new Map();
    return String(text || '').replace(/\r/g, '').split('\n').map((raw, i) => {
      const t = raw.trim();
      if (!t) return null;
      const tok = (t.match(/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[:/][^\s]*)?/i) || [''])[0];
      const h = hn(tok);
      const line = i + 1;
      if (!h) return { raw: t, line, err: 'không đọc được domain' };
      const cands = websites.filter(w => hn(w.url) === h);
      const w = cands.find(x => I.member.get(x.id)) || cands[0];
      if (!w) return { raw: t, h, line, err: 'không có web này trong Dashboard' };
      if (seen.has(w.id)) return { raw: t, h, w, line, err: 'trùng với dòng ' + seen.get(w.id) };
      seen.set(w.id, line);
      return { raw: t, h, w, line, row: I.member.get(w.id) || null };
    }).filter(Boolean);
  }

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || (e.data.qhb !== 'list' && e.data.qhb !== 'changed')) return;
    QH.items = Array.isArray(e.data.items) ? e.data.items : [];
    document.querySelectorAll('[data-bud-a="qh"] [data-qhn]').forEach(x => { x.textContent = QH.items.length ? ' (' + QH.items.length + ')' : ''; });
    const w = e.data.rid && QH.wait[e.data.rid];
    if (w) { delete QH.wait[e.data.rid]; w(QH.items); }
    if (document.getElementById('budQhOv') && QH.paint && !QH.clip) QH.paint();
  });
  function qhCall(msg) {
    return new Promise(res => {
      const rid = 'b' + (++QH.seq);
      const t = setTimeout(() => { delete QH.wait[rid]; res(null); }, 900);
      QH.wait[rid] = L => { clearTimeout(t); res(L); };
      window.postMessage(Object.assign({ rid }, msg), location.origin);
    });
  }
  const qhOn = () => !!document.documentElement.getAttribute('data-quyhat-bud');
  function qhDrop(id) {
    if (QH.clip) { QH.clip = QH.clip.filter(x => +x.id !== +id); return Promise.resolve(QH.clip); }
    return qhCall({ qhb: 'drop', id });
  }
  function qhType(t) {
    t = fold(t);
    if (!t) return '';
    if (/text\s*-?\s*link/.test(t)) return 'textlink';
    if (/guest|\bgp\b|\bpr\b|bai\s*pr/.test(t)) return 'guestpost';
    if (/entit/.test(t)) return 'entity';
    if (/comment|\bcmt\b/.test(t)) return 'blogcmt';
    if (/backlink|back\s*link/.test(t)) return 'backlink';
    return '';
  }
  function qhDay(v) {
    const t = String(v || '').trim();
    if (!t) return '';
    const iso = t.replace(' ', 'T');
    const d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(iso) || iso.length <= 10 ? iso : iso + 'Z');
    return isNaN(d) ? t.slice(0, 10) : new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  }
  function qhDT(v) {
    const t = String(v || '').trim();
    if (!t) return '';
    const iso = t.replace(' ', 'T');
    const d = new Date(/[zZ]$|[+-][0-9][0-9]:?[0-9][0-9]$/.test(iso) || iso.length <= 10 ? iso : iso + 'Z');
    if (isNaN(d)) return t;
    const x = new Date(d.getTime() + 7 * 3600e3).toISOString();
    return x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4) + ' ' + x.slice(11, 16) + ' (giờ VN)';
  }
  function mapProp(p) {
    buildIdx();
    const n = v => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : 0; };
    let ev = n(p.estimated_price_vnd), eu = n(p.estimated_price_usdt);
    if (!ev && !eu && n(p.estimated_price)) { if (/vnd/i.test(p.currency || '')) ev = n(p.estimated_price); else eu = n(p.estimated_price); }
    let vnd = ev, usdt = eu, cur = 'vnd', src = 'giá dự kiến';
    const fp = n(p.final_price);
    if (fp) {
      src = 'giá chốt';
      if (/vnd/i.test(p.currency || '')) { vnd = fp; cur = 'vnd'; usdt = ev && eu ? Math.round(fp / (ev / eu) * 100) / 100 : (fp === ev ? eu : 0); }
      else { usdt = fp; cur = 'usdt'; vnd = ev && eu ? Math.round(fp * (ev / eu)) : (fp === eu ? ev : 0); }
    } else if (!ev && eu) cur = 'usdt';
    vnd = Math.round(vnd);
    usdt = Math.round(usdt * 100) / 100;
    const webs = String(p.target_website || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    const L = webs.length ? parseMany(webs.join('\n')) : [];
    const okL = L.filter(x => !x.err);
    const type = qhType(p.service_type) || (p.service_type ? '' : qhType(p.title));
    const date = qhDay(p.created_at) || today();
    const note = String(p.title || '').trim().slice(0, 500);
    const out = { type, date, vnd, usdt, cur, src, ncc: String(p.vendor_name || p.preferred_vendor_name || '').slice(0, 120), note, code: String(p.id), ref: 'fix#' + p.id, acc: (Array.isArray(p.acc) ? p.acc : []).filter(u => /^https?:\/\/\S+$/i.test(String(u))).slice(0, 30), webs, webBad: L.filter(x => x.err), st: '' };
    if (webs.length > 1) out.many = webs.join('\n');
    else if (okL.length === 1) { out.wid = okL[0].w.id; out.wurl = okL[0].w.url; }
    if (type === 'textlink') { out.from = date; const ex = qhDay(p.expiry_date); out.to = ex && ex >= date ? ex : addDays(date, 30); }
    return out;
  }
  function qhList() {
    ensure().then(async () => {
      QH.clip = null;
      if (qhOn()) {
        const L = await qhCall({ qhb: 'get' });
        if (L) QH.items = L;
      } else {
        const t = await qhPaste();
        if (t == null) return;
        QH.clip = t;
      }
      const o = ov('budQhOv', 940, '');
      const box = o.querySelector('.bud-dlg');
      const items = () => QH.clip || QH.items;
      QH.paint = () => {
        const L = items();
        if (!L.length) { box.innerHTML = '<h3>📥 Dán đơn từ Quyhat</h3><div class="bud-m" style="padding:14px 4px">Không còn đơn nào chờ dán. Ở trang Đề xuất dịch vụ: bấm chọn đơn → bấm biểu tượng Quyhat → 📥 Lấy đơn.</div><div class="end"><button class="bud-btn" data-x="close">Đóng</button></div>'; return; }
        box.innerHTML = '<h3>📥 Dán đơn từ Quyhat <span class="bud-m bud-s" style="font-weight:400">· ' + L.length + ' đơn chờ dán · không lấy trạng thái, bạn tự chọn khi dán</span></h3>'
          + '<table><colgroup><col style="width:30%"><col style="width:13%"><col style="width:22%"><col style="width:17%"><col style="width:18%"></colgroup><thead><tr><th>Đơn</th><th>Loại</th><th>Web</th><th class="r">Số tiền</th><th></th></tr></thead><tbody>'
          + L.map(p => {
            const m = mapProp(p);
            const dup = D.orders.filter(x => x.ref === m.ref);
            const web = !m.webs.length ? '<span style="color:var(--t-warn)">⚠ đơn không ghi web</span>'
              : esc(m.webs.join(', ')) + (m.webBad.length ? '<span class="bud-u" style="color:var(--t-warn)">⚠ ' + esc(m.webBad.map(x => x.h || x.raw).join(', ')) + ' không có trong Dashboard</span>' : (m.webs.length > 1 ? '<span class="bud-u">' + m.webs.length + ' web → tách đơn chia đều</span>' : ''));
            return '<tr><td style="word-break:break-word"><b>#' + esc(p.id) + '</b> ' + esc(p.title || '') + '<span class="bud-u">' + esc([m.ncc, dmy(m.date)].filter(Boolean).join(' · ')) + '</span>' + (dup.length ? '<span class="bud-u" style="color:var(--t-danger)">⚠ đã dán ' + dup.length + ' đơn từ đơn này (' + dup.map(x => dmy(x.date)).join(', ') + ')</span>' : '') + '</td>'
              + '<td>' + (m.type ? '<span class="bud-tag bud-t-' + TN[m.type].c + '">' + TN[m.type].n + '</span>' : '<span style="color:var(--t-warn)">⚠ chưa nhận ra</span>') + '<span class="bud-u">' + esc(p.service_type || '') + '</span></td>'
              + '<td style="word-break:break-word">' + web + '</td>'
              + '<td class="r">' + (m.vnd ? fv(m.vnd) : '—') + '<span class="bud-u">' + (m.usdt ? fu(m.usdt) : '—') + ' · ' + m.src + '</span>' + (m.acc.length ? '<span class="bud-u" style="color:var(--t-accent)">🔗 ' + m.acc.length + ' link nghiệm thu (từ comment)</span>' : '') + '</td>'
              + '<td style="white-space:nowrap;text-align:right"><button class="bud-btn xs pri" data-qh-paste="' + esc(p.id) + '">📥 Dán</button> <button class="bud-btn xs" data-qh-drop="' + esc(p.id) + '" title="Bỏ khỏi hàng chờ">✕</button></td></tr>';
          }).join('') + '</tbody></table>'
          + '<div class="end"><button class="bud-btn" data-x="close">Đóng</button></div>';
      };
      QH.paint();
      box.addEventListener('click', e => {
        const x = e.target.closest('[data-x="close"]');
        if (x) { o.remove(); return; }
        const dp = e.target.closest('[data-qh-drop]');
        if (dp) { qhDrop(dp.dataset.qhDrop).then(L => { if (L && !QH.clip) QH.items = L; QH.paint(); }); return; }
        const ps = e.target.closest('[data-qh-paste]');
        if (!ps) return;
        const p = items().find(x => String(x.id) === ps.dataset.qhPaste);
        if (!p) return;
        qhOpen(p, () => qhDrop(p.id).then(L => { if (L && !QH.clip) QH.items = L; if (document.getElementById('budQhOv')) QH.paint(); }));
      });
    }).catch(fail);
  }
  function qhOpen(p, after) {
    const pre = Object.assign(mapProp(p), { prop: p });
    qhBuild(pre).then(r => qhReview({
      pre, list: r.list, issues: r.issues, fxNote: r.fxNote,
      edit: (st, why) => orderForm(null, { pre: Object.assign({}, pre, { st, stWhy: why }), after }),
      done: after
    })).catch(fail);
  }
  async function qhBuild(pre) {
    const issues = [];
    let vnd = pre.vnd, usdt = pre.usdt, cur = pre.cur || 'vnd', fxNote = '';
    let rate = vnd && usdt ? Math.round(vnd / usdt * 100) / 100 : 0;
    if (!(vnd && usdt) && (vnd || usdt)) {
      const k = vnd ? 'vnd' : 'usdt';
      try { const r = await fx(k, vnd || usdt); vnd = r.vnd; usdt = r.usdt; rate = r.rate; cur = k; fxNote = 'quy đổi theo Binance P2P hôm nay'; } catch (e) { issues.push('Không lấy được tỷ giá: ' + e.message); }
    }
    if (!(vnd > 0)) issues.push('Đơn chưa có giá');
    if (!pre.type) issues.push('Chưa nhận ra loại dịch vụ "' + (pre.prop.service_type || '') + '"');
    const base = { id: 0, type: pre.type, date: pre.date, vnd, usdt, rate, cur, note: pre.note, code: pre.code, ncc: pre.ncc, st: pre.st || '', stWhy: pre.stWhy || '', acc: pre.acc.slice(), ref: pre.ref };
    if (pre.type === 'textlink') { base.from = pre.from; base.to = pre.to; }
    let list;
    if (pre.many) {
      const L = parseMany(pre.many), ok = L.filter(x => !x.err);
      L.filter(x => x.err).forEach(x => issues.push('Web dòng ' + x.line + ' (' + (x.h || x.raw) + '): ' + x.err));
      if (ok.length > 1) {
        const v = splitAmt(vnd, ok.length, 0), u = splitAmt(usdt, ok.length, 2);
        list = ok.map((x, i) => Object.assign({}, base, { wid: x.w.id, wurl: x.w.url, vnd: v[i], usdt: u[i] }));
      } else list = [Object.assign({}, base, ok.length ? { wid: ok[0].w.id, wurl: ok[0].w.url } : { wid: 0, wurl: '' })];
    } else {
      if (!pre.wid) issues.push(pre.webs.length ? 'Web trên đơn (' + pre.webs.join(', ') + ') không có trong Dashboard — cần chọn tay' : 'Đơn không ghi web — cần chọn tay');
      list = [Object.assign({}, base, { wid: pre.wid || 0, wurl: pre.wurl || '' })];
    }
    return { list, issues, fxNote };
  }
  function qhReview(a) {
    const pre = a.pre, p = pre.prop, list = a.list, b = list[0];
    const issues = (a.issues || []).slice();
    if (!b.type && !issues.some(x => /loại dịch vụ/.test(x))) issues.push('Chưa có loại dịch vụ');
    if (list.some(x => !x.wid) && !issues.some(x => /web/i.test(x))) issues.push('Chưa có web nhận dịch vụ');
    const tv = list.reduce((t, x) => t + (x.vnd || 0), 0), tu = Math.round(list.reduce((t, x) => t + (x.usdt || 0), 0) * 100) / 100;
    if (!(tv > 0) && !issues.some(x => /giá/.test(x))) issues.push('Chưa có số tiền');
    const dup = D.orders.filter(x => x.ref === pre.ref);
    const n = v => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : 0; };
    const wsTxt = x => { const w = websites.find(y => y.id === x.wid); if (!w) return '<span style="color:var(--t-danger)">❌ chưa có web</span>'; const row = orderRow(x); return '<b>' + esc(hn(w.url)) + '</b> <span class="bud-m">· ' + esc(row ? row.brand || '' : 'không thuộc web nào trong bảng') + '</span>'; };
    const ed = (on) => on ? ' class="bud-rv-ed"' : '';
    const edTag = on => on ? '<span class="bud-rv-tag">✎ đã sửa</span>' : '';
    const preWids = pre.many ? parseMany(pre.many).filter(x => !x.err).map(x => x.w.id) : [pre.wid || 0];
    const chg = {
      type: b.type !== pre.type,
      web: list.map(x => x.wid).join() !== preWids.join(),
      date: b.date !== pre.date,
      money: !!(pre.vnd && pre.usdt) && (tv !== pre.vnd || tu !== pre.usdt),
      ncc: b.ncc !== pre.ncc,
      note: b.note !== pre.note,
      code: (b.code || '') !== (pre.code || ''),
      tl: b.type === 'textlink' && (b.from !== pre.from || b.to !== pre.to),
      acc: (b.acc || []).join() !== pre.acc.join()
    };
    const srcMoney = [n(p.estimated_price_vnd) ? fv(n(p.estimated_price_vnd)) : '', n(p.estimated_price_usdt) ? fu(n(p.estimated_price_usdt)) : ''].filter(Boolean).join(' / ');
    const rows = [
      ['Loại dịch vụ', esc(p.service_type || '—'), b.type ? '<span class="bud-tag bud-t-' + TN[b.type].c + '">' + TN[b.type].n + '</span>' : '<span style="color:var(--t-danger)">❌ chưa có</span>', chg.type],
      ['Web nhận dịch vụ', esc(p.target_website || '—'), list.length > 1 ? '<div class="bud-m bud-s" style="margin-bottom:3px">Tách ' + list.length + ' đơn chia đều:</div>' + list.map(x => '<div>' + wsTxt(x) + ' <span class="bud-m">· ' + fv(x.vnd) + ' ≈ ' + fu(x.usdt) + '</span></div>').join('') : wsTxt(b), chg.web],
      ['Ngày đơn (tính vào tháng)', esc(qhDT(p.created_at) || '—'), '<b>' + dmy(b.date) + '</b>', chg.date],
      ['Số tiền', (srcMoney ? 'Dự kiến: ' + srcMoney : 'Dự kiến: —') + (n(p.final_price) ? '<br>Chốt: <b>' + esc(Number(p.final_price).toLocaleString('en-US') + ' ' + (p.currency || 'USD')) + '</b>' : ''), '<b>' + fv(tv) + '</b> ≈ <b>' + fu(tu) + '</b>' + (b.rate ? '<span class="bud-u">1 USDT = ' + rateTxt(b.rate) + ' · ' + esc(a.fxNote || (pre.src ? 'theo ' + pre.src + ' trên đơn' : '')) + '</span>' : ''), chg.money],
      ['Đối tác', esc(p.vendor_name || p.preferred_vendor_name || '—'), b.ncc ? '<b>' + esc(b.ncc) + '</b>' : '<span class="bud-m">(trống)</span>', chg.ncc],
      ['Mã đơn', '#' + esc(p.id), b.code ? '<b>#' + esc(b.code) + '</b>' : '<span class="bud-m">(trống)</span>', chg.code],
      ['Ghi chú', esc(p.title || '—'), esc(b.note || '—'), chg.note]
    ];
    if (b.type === 'textlink') rows.push(['Hạn text link', esc(p.expiry_date ? 'Hết hạn ' + String(p.expiry_date).slice(0, 10) : '—'), dmy(b.from) + ' → <b>' + dmy(b.to) + '</b>', chg.tl]);
    rows.push(['Link nghiệm thu', pre.acc.length ? pre.acc.length + ' link trong comment' : 'Không có link trong comment', (b.acc || []).length ? b.acc.map(u => '<div class="bud-acc" style="margin:0"><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(accShort(u)) + '</a></div>').join('') : '<span class="bud-m">(không có)</span>', chg.acc]);
    const st0 = b.st || '';
    const o = ov('budQhRvOv', 820, '<h3>🔎 Xem lại trước khi import — đơn #' + esc(p.id) + '</h3>'
      + '<div class="bud-m bud-s" style="margin-bottom:8px">' + esc(p.title || '') + (a.fromForm ? ' · đã chỉnh trong form, ô viền xanh là chỗ bạn sửa' : ' · kiểm tra từng dòng, chỗ nào sai bấm ✎ Sửa chi tiết') + '</div>'
      + (issues.length ? '<div class="bud-rv-bad">❌ Chưa import được:<ul>' + issues.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>Bấm <b>✎ Sửa chi tiết</b> để sửa.</div>' : '')
      + (dup.length ? '<div class="bud-rv-warn">⚠ Đơn #' + esc(p.id) + ' đã import ' + dup.length + ' lần (' + dup.map(x => dmy(x.date) + ' · ' + fv(x.vnd)).join(', ') + '). Import tiếp sẽ thành đơn trùng.</div>' : '')
      + '<table class="bud-rv"><colgroup><col style="width:20%"><col style="width:34%"><col style="width:46%"></colgroup><thead><tr><th></th><th>Trên đơn đề xuất</th><th>Sẽ import vào Ngân sách</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td class="bud-m">' + r[0] + '</td><td class="bud-m" style="word-break:break-word">' + r[1] + '</td><td' + ed(r[3]) + ' style="word-break:break-word">' + r[2] + edTag(r[3]) + '</td></tr>').join('')
      + '</tbody></table>'
      + '<div class="g2" style="margin-top:6px"><div><label class="f">Trạng thái đơn (tự chọn, không lấy từ đơn đề xuất)</label><select class="f" data-k="st">' + (st0 ? '' : '<option value="">— chọn trạng thái —</option>') + STS.map(t => '<option value="' + t.k + '"' + (t.k === st0 ? ' selected' : '') + '>' + t.n + '</option>').join('') + '</select></div>'
      + '<div data-k="whybox" style="' + (st0 === 'fix' ? '' : 'display:none') + '"><label class="f">Lý do đang chỉnh sửa</label><input class="f" data-k="stWhy" maxlength="500" value="' + esc(b.stWhy || '') + '"></div></div>'
      + '<div class="err" data-k="err"></div>'
      + '<div class="end"><button class="bud-btn" data-x="no">Hủy</button><button class="bud-btn" data-x="edit">' + (a.fromForm ? '← Quay lại sửa' : '✎ Sửa chi tiết') + '</button><button class="bud-btn pri" data-x="ok"' + (issues.length ? ' disabled title="Sửa các lỗi ở trên trước"' : '') + '>✓ Import ' + list.length + ' đơn</button></div>');
    const q = k => o.querySelector('[data-k="' + k + '"]');
    const paintSt = () => { q('st').style.cssText = stStyle(q('st').value); q('whybox').style.display = q('st').value === 'fix' ? '' : 'none'; };
    paintSt();
    q('st').onchange = () => { paintSt(); if (q('st').value === 'fix') q('stWhy').focus(); };
    o.querySelector('[data-x="no"]').onclick = () => { o.remove(); if (a.cancel) a.cancel(); };
    o.querySelector('[data-x="edit"]').onclick = () => { o.remove(); a.edit(q('st').value, q('stWhy').value.trim()); };
    o.querySelector('[data-x="ok"]').onclick = async () => {
      const err = q('err');
      err.textContent = '';
      if (issues.length) return;
      const st = q('st').value, why = q('stWhy').value.trim();
      if (!st) { err.textContent = '⚠️ Chưa chọn trạng thái đơn'; q('st').style.borderColor = 'var(--t-danger)'; q('st').focus(); return; }
      if (st === 'fix' && !why) { err.textContent = '⚠️ Đang chỉnh sửa thì phải nhập lý do'; q('stWhy').focus(); return; }
      const L = list.map(x => Object.assign({}, x, { st, stWhy: st === 'fix' ? why : '' }));
      const btn = o.querySelector('[data-x="ok"]');
      btn.disabled = true;
      try {
        if (L.length > 1) {
          const r = await api('/api/budget/orders', { orders: L });
          r.orders.forEach(x => D.orders.push(x));
          say('✓ Đã import đơn #' + p.id + ': ' + r.orders.length + ' đơn ' + TN[b.type].n + ' (tách đều ' + fv(tv) + ')');
        } else {
          const r = await api('/api/budget/order', { order: L[0] });
          D.orders.push(r.order);
          say('✓ Đã import đơn #' + p.id + ': ' + TN[r.order.type].n + ' ' + fv(r.order.vnd));
        }
        o.remove();
        changed();
        if (a.done) a.done();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
    setTimeout(() => { if (issues.length) o.querySelector('[data-x="edit"]').focus(); else q('st').focus(); }, 30);
  }

  function qhPaste() {
    return new Promise(res => {
      const d = ov('budQhPasteOv', 560, '<h3>📥 Dán đơn từ Quyhat</h3><div class="bud-m bud-s">Không thấy tiện ích Quyhat (bản 1.3.0 trở lên) trên trang này. Bấm 📥 Lấy đơn ở Quyhat (tự copy), rồi dán vào ô dưới (Ctrl+V).</div><textarea class="f" data-k="t" rows="4" placeholder="QUYHAT-DON […]" style="font-family:inherit;resize:vertical"></textarea><div class="err" data-k="err"></div><div class="end"><button class="bud-btn" data-x="no">Hủy</button><button class="bud-btn pri" data-x="ok">Đọc đơn</button></div>');
      const q = k => d.querySelector('[data-k="' + k + '"]');
      d.addEventListener('click', e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'no') { d.remove(); res(null); return; }
        const t = q('t').value.trim().replace(/^QUYHAT-DON\s*/, '');
        let L = null;
        try { L = JSON.parse(t); } catch (er) {}
        if (!Array.isArray(L) || !L.every(x => x && x.id != null)) { q('err').textContent = 'Không đọc được — hãy dán đúng nội dung Quyhat đã copy'; return; }
        d.remove();
        res(L);
      });
      setTimeout(() => q('t').focus(), 30);
    });
  }

  function orderForm(old, ctx) {
    ctx = ctx || {};
    ensure().then(() => {
      buildIdx();
      const ren = ctx.renew;
      const base = old || (ren ? { type: 'textlink', wid: ren.wid, wurl: ren.wurl, vnd: ren.vnd, ncc: ren.ncc, note: ren.note, from: ren.to, to: addDays(ren.to, dayDiff(ren.from, ren.to) || 30), date: ren.to > today() ? ren.to : today() } : null) || (!old && ctx.pre) || {};
      const pre = !old && !ren && ctx.pre ? ctx.pre : null;
      let defWid = base.wid || 0;
      if (!defWid && ctx.row) { const ch = chainOf(ctx.row); const cur = ch.find(w => hn(w.url) === hn(wstCurrentUrl(ctx.row))); defWid = (cur || ctx.row).id; }
      const type = base.type || '';
      const st0 = old ? stOf(old) : pre ? (pre.st || '') : 'doing';
      const R = old ? { rate: old.rate, cur: old.cur, vnd: old.vnd, usdt: old.usdt, seq: 0, man: { vnd: true, usdt: true } }
        : pre ? { rate: pre.vnd && pre.usdt ? Math.round(pre.vnd / pre.usdt * 100) / 100 : 0, cur: pre.cur || 'vnd', vnd: pre.vnd || 0, usdt: pre.usdt || 0, seq: 0, man: { vnd: !!pre.vnd, usdt: !!pre.usdt } }
        : { rate: 0, cur: 'vnd', vnd: 0, usdt: 0, seq: 0, man: { vnd: false, usdt: false } };
      const o = ov('budOrderOv', 620, '<h3>' + (old ? '✎ Sửa đơn' : ren ? '↻ Gia hạn text link' : pre ? '📥 Dán đơn #' + esc(pre.prop.id) + ' từ Quyhat' : '＋ Tạo đơn dịch vụ') + '</h3>'
        + (pre ? '<div class="bud-m bud-s" style="margin-bottom:6px">' + esc(pre.prop.title || '') + (pre.prop.service_type ? ' · loại trên đơn: ' + esc(pre.prop.service_type) : '') + (pre.webs.length ? ' · web trên đơn: ' + esc(pre.webs.join(', ')) : ' · đơn không ghi web') + '. Kiểm tra loại, web, số tiền (' + pre.src + ') rồi <b>tự chọn trạng thái</b>.'
          + (pre.webBad.length ? '<div style="color:var(--t-warn);margin-top:3px">⚠ ' + esc(pre.webBad.map(x => (x.h || x.raw) + ': ' + x.err).join(' · ')) + (pre.many ? '' : ' — chọn web bằng tay') + '</div>' : '')
          + (!pre.type ? '<div style="color:var(--t-warn);margin-top:3px">⚠ Chưa nhận ra loại dịch vụ "' + esc(pre.prop.service_type || '') + '" — chọn loại bằng tay</div>' : '') + '</div>' : '')
        + (ren ? '<div class="bud-m bud-s" style="margin-bottom:6px">Gia hạn đơn ' + dmy(ren.from) + ' → ' + dmy(ren.to) + ' (' + fv(ren.vnd) + '). Lưu thành đơn mới nối với đơn cũ, tiền tính vào tháng của ngày đơn.</div>' : '')
        + '<div class="g2"><div><label class="f">Loại đơn</label><select class="f" data-k="type"' + (ren ? ' disabled' : '') + '><option value="">— chọn loại dịch vụ —</option>' + TYPES.map(t => '<option value="' + t.k + '"' + (t.k === type ? ' selected' : '') + '>' + t.n + (t.k === 'textlink' ? ' (có thời hạn)' : '') + '</option>').join('') + '</select></div>'
        + '<div><label class="f">Ngày đơn (tính vào tháng)</label><input type="date" class="f" data-k="date" value="' + esc(base.date || today()) + '"></div></div>'
        + '<label class="f">Web nhận dịch vụ (web gốc hoặc 1 web 301 trong chuỗi)</label>'
        + (!old && !ren ? '<div class="bud-chips" data-k="wmode" style="margin:0 0 6px"><button type="button" data-wm="one" class="on">1 web</button><button type="button" data-wm="many">Nhiều web · tự tách đơn chia đều</button></div>' : '')
        + '<div class="bud-pk" data-k="widbox"></div>'
        + '<div data-k="manybox" style="display:none"><textarea class="f" data-k="many" rows="5" placeholder="Mỗi dòng 1 web (dán domain hoặc URL), vd:&#10;m.freybet482.com&#10;https://yo88v1.com/" style="font-family:inherit;resize:vertical"></textarea><div data-k="manyrep" class="bud-s" style="margin-top:6px;max-height:160px;overflow:auto"></div></div>'
        + '<div class="g2"><div><label class="f" data-k="vndlab">Số tiền VND</label><input class="f" data-k="vnd" inputmode="decimal" placeholder="vd 1.200.000 · 1,2tr · 500k" value="' + (R.vnd ? R.vnd.toLocaleString('vi-VN') : (ren ? ren.vnd.toLocaleString('vi-VN') : '')) + '"></div><div><label class="f">hoặc USDT</label><input class="f" data-k="usdt" inputmode="decimal" placeholder="vd 45,89" value="' + (R.usdt ? String(R.usdt).replace('.', ',') : '') + '"></div></div>'
        + '<div class="bud-m bud-s" data-k="fxinfo" style="margin-top:4px">Nhập 1 ô thì ô kia tự quy đổi theo Binance P2P hôm nay. Đơn quá khứ: nhập tay cả 2 ô.</div>'
        + '<div class="bud-s" data-k="splitinfo" style="margin-top:4px;display:none"></div>'
        + '<div class="bud-s" data-k="past" style="margin-top:4px;color:var(--t-warn);display:none">⚠️ Ngày đơn trước hôm nay: tỷ giá Binance là giá hôm nay, không phải giá lúc đó — nhập tay cả VND và USDT để đúng số đã trả.</div>'
        + '<div class="g2" data-k="tlbox" style="' + (type === 'textlink' ? '' : 'display:none') + '"><div><label class="f">Từ ngày</label><input type="date" class="f" data-k="from" value="' + esc(base.from || today()) + '"></div><div><label class="f">Đến ngày (hết hạn)</label><input type="date" class="f" data-k="to" value="' + esc(base.to || addDays(today(), 30)) + '"></div></div>'
        + '<div class="g2"><div><label class="f">Đối tác</label><div class="bud-ac"><input class="f" data-k="ncc" maxlength="120" autocomplete="off" placeholder="gõ vài chữ là gợi ý tên đã dùng" value="' + esc(base.ncc || '') + '"><div class="bud-ac-pop" data-k="nccpop" style="display:none"></div></div></div>'
        + '<div><label class="f">Trạng thái đơn</label><select class="f" data-k="st">' + (st0 ? '' : '<option value="">— chọn trạng thái —</option>') + STS.map(t => '<option value="' + t.k + '"' + (t.k === st0 ? ' selected' : '') + '>' + t.n + '</option>').join('') + '</select></div></div>'
        + '<div data-k="whybox" style="' + (st0 === 'fix' ? '' : 'display:none') + '"><label class="f">Lý do đang chỉnh sửa</label><input class="f" data-k="stWhy" maxlength="500" placeholder="vd: link sai anchor, bài chưa index…" value="' + esc(old && old.stWhy || pre && pre.stWhy || '') + '"></div>'
        + '<div class="g2" style="grid-template-columns:1fr 2.6fr"><div><label class="f">Mã đơn</label><input class="f" data-k="code" maxlength="60" placeholder="vd: 101, DH-2611…" value="' + esc(!ren && base.code || '') + '"></div>'
        + '<div><label class="f">Ghi chú / nội dung đơn</label><input class="f" data-k="note" maxlength="500" placeholder="vd: 120 entity, 3 bài DR40…" value="' + esc(base.note || '') + '"></div></div>'
        + '<label class="f">Link nghiệm thu (mỗi dòng 1 link)</label><textarea class="f" data-k="acc" rows="2" placeholder="vd: https://baoX.com/bai-viet-da-dang · link sheet báo cáo entity" style="font-family:inherit;resize:vertical">' + esc(!ren && old && Array.isArray(old.acc) ? old.acc.join('\n') : pre && pre.acc.length ? pre.acc.join('\n') : '') + '</textarea>'
        + '<div class="err" data-k="err"></div>'
        + '<div class="end"><button class="bud-btn" data-x="no">Hủy</button><button class="bud-btn pri" data-x="ok">' + (pre ? 'Xem lại trước khi import →' : 'Lưu đơn') + '</button></div>');
      const q = k => o.querySelector('[data-k="' + k + '"]');
      const pk = wsPicker(q('widbox'), defWid, base, () => setTimeout(() => q('vnd').focus(), 0));
      const info = q('fxinfo'), errBox = q('err');
      const show = (t, bad) => { info.innerHTML = bad ? '<span style="color:var(--t-danger)">⚠️ ' + esc(t) + '</span>' : esc(t); };
      if (old) show(R.cur && old.rate ? 'Tỷ giá đã lưu: 1 USDT = ' + rateTxt(old.rate) + '. Sửa 1 ô thì giữ ô kia (tỷ giá suy ra); xoá 1 ô để tự quy đổi theo Binance.' : '');
      q('type').onchange = () => { q('tlbox').style.display = q('type').value === 'textlink' ? '' : 'none'; q('type').style.borderColor = ''; };
      const stPaint = () => { q('st').style.cssText = stStyle(q('st').value); };
      stPaint();
      q('st').onchange = () => { stPaint(); q('whybox').style.display = q('st').value === 'fix' ? '' : 'none'; if (q('st').value === 'fix') q('stWhy').focus(); };
      q('acc').oninput = () => { q('acc').style.borderColor = ''; };
      bindSuggest(q('ncc'), q('nccpop'));
      const pastChk = () => { q('past').style.display = q('date').value && q('date').value < today() && !(R.man.vnd && R.man.usdt) ? '' : 'none'; };
      q('date').oninput = pastChk;
      q('date').onchange = pastChk;
      let mode = 'one';
      const splitInfo = () => {
        const box = q('splitinfo');
        if (mode !== 'many') { box.style.display = 'none'; return; }
        const L = parseMany(q('many').value), ok = L.filter(x => !x.err), nb = L.length - ok.length;
        q('manyrep').innerHTML = L.length ? L.map(x => x.err
          ? '<div style="color:var(--t-danger)">❌ Dòng ' + x.line + ': ' + esc(x.raw) + ' — ' + esc(x.err) + '</div>'
          : '<div>' + (x.row ? '<span style="color:var(--t-success)">✓</span>' : '<span style="color:var(--t-warn)">⚠</span>') + ' ' + esc(x.h) + ' <span class="bud-m">· ' + esc(wsLabel(x.w).replace(/^[^·]*·\s*/, '') || 'web') + (x.row ? ' · ' + esc(x.row.brand || '') : ' · không thuộc web nào trong bảng') + '</span></div>').join('') : '<span class="bud-m">Chưa có web nào</span>';
        let t = ok.length + ' web hợp lệ' + (nb ? ' · <b style="color:var(--t-danger)">' + nb + ' dòng lỗi</b>' : '');
        if (ok.length && R.vnd > 0) {
          const v = splitAmt(R.vnd, ok.length, 0), u = splitAmt(R.usdt, ok.length, 2);
          t += ' → tách ' + ok.length + ' đơn, mỗi web <b>' + fv(v[ok.length - 1]) + '</b> ≈ ' + fu(u[ok.length - 1]) + (v[0] !== v[ok.length - 1] ? ' (dư ' + fv(R.vnd - v[ok.length - 1] * ok.length) + ' cộng vào web đầu)' : '');
        }
        box.innerHTML = t;
        box.style.display = '';
      };
      const on = bindMoney(q, R, show, () => { pastChk(); splitInfo(); });
      pastChk();
      if (q('wmode')) {
        q('wmode').onclick = e => {
          const b = e.target.closest('[data-wm]');
          if (!b) return;
          mode = b.dataset.wm;
          q('wmode').querySelectorAll('[data-wm]').forEach(x => x.classList.toggle('on', x === b));
          q('widbox').style.display = mode === 'one' ? '' : 'none';
          q('manybox').style.display = mode === 'many' ? '' : 'none';
          q('vndlab').textContent = mode === 'many' ? 'Tổng tiền VND (chia đều cho các web)' : 'Số tiền VND';
          splitInfo();
          if (mode === 'many') q('many').focus();
        };
        q('many').oninput = () => { errBox.textContent = ''; splitInfo(); };
      }
      if (ren) { R.man.vnd = true; on('vnd'); }
      if (pre) {
        if (pre.many && q('wmode')) { q('many').value = pre.many; q('wmode').querySelector('[data-wm="many"]').click(); }
        if (R.man.vnd && R.man.usdt) show('Lấy theo ' + pre.src + ' trên đơn: 1 USDT = ' + rateTxt(R.rate) + '. Sửa 1 ô thì giữ ô kia; xoá 1 ô để tự quy đổi theo Binance.');
        else if (R.man.vnd) on('vnd');
        else if (R.man.usdt) on('usdt');
      }
      o.querySelector('[data-x="no"]').onclick = () => o.remove();
      o.querySelector('[data-x="ok"]').onclick = async () => {
        errBox.textContent = '';
        if (R.seq && !R.rate) { errBox.textContent = 'Đang lấy tỷ giá, đợi 1 giây rồi bấm Lưu lại'; return; }
        const wid = Number(q('wid').value);
        const w = websites.find(x => x.id === wid);
        const body = { id: old ? old.id : 0, type: ren ? 'textlink' : q('type').value, date: q('date').value, wid, wurl: w ? w.url : (base.wurl || ''), vnd: R.vnd, usdt: R.usdt, rate: R.rate, cur: R.cur, note: q('note').value.trim(), code: q('code').value.trim(), ncc: q('ncc').value.trim(), st: q('st').value, stWhy: q('st').value === 'fix' ? q('stWhy').value.trim() : '', acc: accList(q('acc').value) };
        if (!body.type) { errBox.textContent = '⚠️ Chưa chọn loại dịch vụ — không tạo được đơn'; q('type').style.borderColor = 'var(--t-danger)'; q('type').focus(); return; }
        if (!body.st && !pre) { errBox.textContent = '⚠️ Chưa chọn trạng thái đơn'; q('st').style.borderColor = 'var(--t-danger)'; q('st').focus(); return; }
        if (pre) body.ref = pre.ref;
        if (body.st === 'fix' && !body.stWhy && !pre) { errBox.textContent = '⚠️ Đang chỉnh sửa thì phải nhập lý do'; q('stWhy').focus(); return; }
        const toReview = list => {
          o.style.display = 'none';
          qhReview({
            pre, list, fromForm: true,
            edit: (st, why) => { o.style.display = ''; q('st').value = st; q('st').onchange(); q('stWhy').value = why; q('whybox').style.display = st === 'fix' ? '' : 'none'; },
            cancel: () => o.remove(),
            done: () => { o.remove(); if (ctx.after) ctx.after(); }
          });
        };
        const accB = accBad(body.acc);
        if (accB.length) { errBox.textContent = '⚠️ Link nghiệm thu không hợp lệ (mỗi dòng 1 link): ' + accB.map(x => x.replace(/^https:\/\//, '')).join(' · '); q('acc').style.borderColor = 'var(--t-danger)'; q('acc').focus(); return; }
        if (body.acc.length > 30) { errBox.textContent = '⚠️ Tối đa 30 link nghiệm thu mỗi đơn'; q('acc').focus(); return; }
        if (body.type === 'textlink') { body.from = q('from').value; body.to = q('to').value; }
        if (ren) body.renewOf = ren.id;
        else if (old && old.renewOf) body.renewOf = old.renewOf;
        if (mode === 'many') {
          const L = parseMany(q('many').value), bad = L.filter(x => x.err);
          if (bad.length) { errBox.textContent = '⚠️ ' + bad.map(x => 'Dòng ' + x.line + ': ' + x.err).join(' · '); q('many').focus(); return; }
          if (!L.length) { errBox.textContent = '⚠️ Chưa nhập web nào (mỗi dòng 1 web)'; q('many').focus(); return; }
          if (!(body.vnd > 0)) { errBox.textContent = 'Chưa nhập số tiền'; return; }
          if (L.length > 1) {
            const v = splitAmt(body.vnd, L.length, 0), u = splitAmt(body.usdt, L.length, 2);
            const list = L.map((x, i) => Object.assign({}, body, { id: 0, wid: x.w.id, wurl: x.w.url, vnd: v[i], usdt: u[i] }));
            if (pre) { toReview(list); return; }
            const btn2 = o.querySelector('[data-x="ok"]');
            btn2.disabled = true;
            try {
              const r = await api('/api/budget/orders', { orders: list });
              r.orders.forEach(x => D.orders.push(x));
              o.remove();
              say('✓ Đã tạo ' + r.orders.length + ' đơn ' + TN[body.type].n + ' (tách đều ' + fv(body.vnd) + ', mỗi web ~' + fv(v[L.length - 1]) + ')');
              changed();
              if (ctx.after) ctx.after();
            } catch (e) { errBox.textContent = e.message; btn2.disabled = false; }
            return;
          }
          body.wid = L[0].w.id;
          body.wurl = L[0].w.url;
        }
        if (!body.wid) { errBox.textContent = 'Chưa chọn web nhận dịch vụ'; return; }
        if (!(body.vnd > 0)) { errBox.textContent = 'Chưa nhập số tiền'; return; }
        if (pre) { toReview([body]); return; }
        const btn = o.querySelector('[data-x="ok"]');
        btn.disabled = true;
        try {
          const r = await api('/api/budget/order', { order: body });
          const i = D.orders.findIndex(x => x.id === r.order.id);
          if (i >= 0) D.orders[i] = r.order; else D.orders.push(r.order);
          o.remove();
          say(old ? '✓ Đã sửa đơn' : ren ? '✓ Đã gia hạn text link' : '✓ Đã tạo đơn ' + TN[r.order.type].n + ' ' + fv(r.order.vnd));
          changed();
          if (ctx.after) ctx.after();
        } catch (e) { errBox.textContent = e.message; btn.disabled = false; }
      };
      setTimeout(() => { if (pre) { if (!pre.type) q('type').focus(); else if (!pre.many && !pk.value()) pk.open(); else q('st').focus(); } else if (old || pk.value()) q('vnd').focus(); else pk.open(); }, 30);
    }).catch(fail);
  }

  function orderList(f) {
    ensure().then(() => {
      let type = '', tlOnly = !!f.tl, noRow = !!f.norow, qtxt = '', all = !!f.tl || !!f.all, stf = f.st || '';
      const o = ov('budListOv', 980, '');
      const box = o.querySelector('.bud-dlg');
      const paint = () => {
        compute();
        const ms = new Set(months());
        const toks = fold(qtxt).split(/\s+/).filter(Boolean);
        const list = D.orders.filter(x => (all || ms.has(x.date.slice(0, 7)))
          && (!type || x.type === type)
          && (!stf || stOf(x) === stf)
          && (!tlOnly || (x.type === 'textlink' && ['soon', 'expired'].includes(tlState(x).k)))
          && (!noRow || !orderRow(x))
          && toks.every(k => fold([x.code, x.ncc, x.note, x.stWhy, (x.acc || []).join(' '), orderWsText(x), (orderRow(x) || {}).brand, TN[x.type].n].join(' ')).includes(k)))
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        const sum = list.reduce((s, x) => s + x.vnd, 0);
        box.innerHTML = '<h3>📃 Danh sách đơn — ' + (all ? 'mọi kỳ' : pLabel()) + ' <span class="bud-m bud-s" style="font-weight:400">' + list.length + ' đơn · ' + fv(sum) + '</span></h3>'
          + '<div class="row" style="margin-bottom:4px"><input class="f" data-k="q" placeholder="🔍 Tìm đối tác / ghi chú / web / brand" value="' + esc(qtxt) + '" style="width:240px;padding:5px 8px;border:1px solid var(--t-border);border-radius:6px;background:var(--t-subtle);color:var(--t-fg)">'
          + '<label class="bud-s"><input type="checkbox" data-k="all"' + (all ? ' checked' : '') + '> mọi kỳ</label>'
          + '<label class="bud-s"><input type="checkbox" data-k="tl"' + (tlOnly ? ' checked' : '') + '> chỉ text link sắp / đã hết hạn</label>'
          + '<label class="bud-s"><input type="checkbox" data-k="nr"' + (noRow ? ' checked' : '') + '> chỉ đơn không khớp web</label></div>'
          + '<div class="bud-chips">' + [['', 'Mọi loại']].concat(TYPES.map(x => [x.k, x.n])).map(x => '<button type="button" data-f="' + x[0] + '" class="' + (type === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>'
          + '<div class="bud-chips">' + [['', 'Mọi trạng thái']].concat(STS.map(x => [x.k, x.n])).map(x => '<button type="button" data-sf="' + x[0] + '" class="' + (stf === x[0] ? 'on' : '') + '">' + (x[0] ? '<i style="background:' + SN[x[0]].c + '"></i>' : '') + x[1] + ' · ' + D.orders.filter(o => (all || ms.has(o.date.slice(0, 7))) && (!x[0] || stOf(o) === x[0])).length + '</button>').join('') + '</div>'
          + itemsTable(list.map(x => ({ kind: 'order', o: x, date: x.date })))
          + '<div class="end"><button class="bud-btn" data-x="close">Đóng</button><button class="bud-btn pri" data-x="new">＋ Tạo đơn</button></div>';
        const qi = box.querySelector('[data-k="q"]');
        qi.oninput = () => { qtxt = qi.value; const pos = qi.selectionStart; paint(); const n = box.querySelector('[data-k="q"]'); n.focus(); n.setSelectionRange(pos, pos); };
        box.querySelector('[data-k="all"]').onchange = e => { all = e.target.checked; paint(); };
        box.querySelector('[data-k="tl"]').onchange = e => { tlOnly = e.target.checked; paint(); };
        box.querySelector('[data-k="nr"]').onchange = e => { noRow = e.target.checked; paint(); };
      };
      paint();
      box.addEventListener('click', e => {
        const fb = e.target.closest('[data-f]');
        if (fb) { type = fb.dataset.f; paint(); return; }
        const sb = e.target.closest('[data-sf]');
        if (sb) { stf = sb.dataset.sf; paint(); return; }
        const x = e.target.closest('[data-x]');
        if (!x) return;
        if (x.dataset.x === 'close') o.remove(); else orderForm(null, { after: paint });
      });
      bindItemActions(box, paint);
    }).catch(fail);
  }

  function planForm() {
    ensure().then(() => {
      compute();
      let m = U.kind === 'm' ? (U.key || defKey()) : curMonth();
      const o = ov('budPlanOv', 760, '');
      const box = o.querySelector('.bud-dlg');
      const S = {};
      const spentOf = mm => compute([mm]);
      const paint = () => {
        const p = S[m] || (S[m] = JSON.parse(JSON.stringify(D.plans[m] || { mode: 'total', total: 0, sites: {} })));
        const A = spentOf(m);
        const rows = idx().rows.slice().sort((a, b) => String(a.brand || '').localeCompare(String(b.brand || ''), 'vi'));
        const sumSites = Object.values(p.sites || {}).reduce((s, v) => s + (v || 0), 0);
        const opts = [];
        const now = curMonth();
        let [y, mo] = now.split('-').map(Number);
        mo += 2; if (mo > 12) { mo -= 12; y++; }
        for (let i = 0; i < 15; i++) { opts.push(y + '-' + String(mo).padStart(2, '0')); mo--; if (mo < 1) { mo = 12; y--; } }
        if (!opts.includes(m)) opts.push(m);
        box.innerHTML = '<h3>⚙ Ngân sách tháng <select data-k="m" class="bud-sel" style="height:28px">' + opts.sort().reverse().map(x => '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + mLabel(x) + (D.plans[x] ? ' ✓' : '') + '</option>').join('') + '</select></h3>'
          + '<div class="row" style="gap:18px;margin:4px 0"><label><input type="radio" name="budMode" value="total"' + (p.mode !== 'site' ? ' checked' : '') + '> Tổng tháng</label><label><input type="radio" name="budMode" value="site"' + (p.mode === 'site' ? ' checked' : '') + '> Từng website</label></div>'
          + '<div class="bud-m bud-s">Mỗi tháng chọn 1 kiểu. Từng website: tổng tháng = cộng các web. Quý / năm = cộng các tháng. Đã chi tháng ' + mLabel(m) + ': <b>' + fv(A.K.spent) + '</b></div>'
          + (p.mode !== 'site'
            ? '<label class="f">Ngân sách cả tháng (VND)</label><input class="f" data-k="total" inputmode="decimal" placeholder="vd 50.000.000 · 50tr" value="' + (p.total ? p.total.toLocaleString('vi-VN') : '') + '" style="max-width:260px">'
            : '<div style="max-height:52vh;overflow:auto;margin-top:8px;border:1px solid var(--t-border);border-radius:8px"><table><colgroup><col style="width:44%"><col style="width:22%"><col style="width:34%"></colgroup><thead><tr><th>Website (gốc)</th><th class="r">Ngân sách</th><th>Đã chi ' + mLabel(m) + '</th></tr></thead><tbody>'
              + rows.map(r => {
                const b = (p.sites || {})[r.id] || 0, sp = (A.agg.get(r.id) || {}).total || 0;
                const pct = b ? Math.round(sp / b * 100) : 0;
                const st = b ? (pct > 100 ? '<span style="color:var(--t-danger)">' + fv(sp) + ' · vượt ' + fv(sp - b) + '</span>' : fv(sp) + ' · ' + pct + '%') + '<div class="bud-bar"><i class="' + (pct > 100 ? 'r' : pct >= 80 ? 'w' : '') + '" style="width:' + Math.min(100, pct) + '%"></i></div>' : '<span class="bud-m">' + fv(sp) + ' · chưa đặt</span>';
                return '<tr><td>' + esc(r.brand || '') + ' <span class="bud-m bud-s">' + esc(hn(r.url)) + '</span></td><td class="r"><input data-site="' + r.id + '" inputmode="decimal" placeholder="—" value="' + (b ? b.toLocaleString('vi-VN') : '') + '" style="width:120px;text-align:right;padding:3px 6px;border:1px solid var(--t-border);border-radius:5px;background:var(--t-subtle);color:var(--t-fg)"></td><td>' + st + '</td></tr>';
              }).join('') + '</tbody></table></div>')
          + '<div class="err" data-k="err"></div>'
          + '<div class="row" style="margin-top:8px">' + (p.mode === 'site' ? '<span class="bud-m bud-s" data-k="sum">Tổng: ' + fv(sumSites) + '</span>' : '') + '<span style="flex:1"></span><button class="bud-btn" data-x="copy">Chép từ tháng trước</button>' + (D.plans[m] ? '<button class="bud-btn bad" data-x="clear">Xoá ngân sách tháng này</button>' : '') + '<button class="bud-btn" data-x="no">Hủy</button><button class="bud-btn pri" data-x="ok">Lưu</button></div>';
        box.querySelector('[data-k="m"]').onchange = e => { m = e.target.value; paint(); };
        box.querySelectorAll('input[name="budMode"]').forEach(r => r.onchange = () => { p.mode = r.value; paint(); });
        const ti = box.querySelector('[data-k="total"]');
        if (ti) ti.oninput = () => { p.total = parseVnd(ti.value); };
        box.querySelectorAll('[data-site]').forEach(i => i.oninput = () => {
          p.sites = p.sites || {};
          const v = parseVnd(i.value);
          if (v) p.sites[i.dataset.site] = v; else delete p.sites[i.dataset.site];
          const s = box.querySelector('[data-k="sum"]');
          if (s) s.textContent = 'Tổng: ' + fv(Object.values(p.sites).reduce((a, b) => a + b, 0));
        });
      };
      paint();
      box.addEventListener('click', async e => {
        const x = e.target.closest('[data-x]');
        if (!x) return;
        const err = box.querySelector('[data-k="err"]');
        if (x.dataset.x === 'no') { o.remove(); return; }
        if (x.dataset.x === 'copy') {
          let [y, mo] = m.split('-').map(Number);
          mo--; if (mo < 1) { mo = 12; y--; }
          const pm = y + '-' + String(mo).padStart(2, '0');
          if (!D.plans[pm]) { err.textContent = 'Tháng ' + mLabel(pm) + ' chưa đặt ngân sách'; return; }
          S[m] = JSON.parse(JSON.stringify(D.plans[pm]));
          paint();
          box.querySelector('[data-k="err"]').textContent = '';
          say('Đã chép ngân sách tháng ' + mLabel(pm) + ' — bấm Lưu để ghi', '#238636');
          return;
        }
        const p = S[m];
        const body = x.dataset.x === 'clear' ? { month: m, mode: 'total', total: 0 } : { month: m, mode: p.mode === 'site' ? 'site' : 'total', total: p.total || 0, sites: p.sites || {} };
        if (x.dataset.x === 'clear' && !confirm('Xoá ngân sách tháng ' + mLabel(m) + '?')) return;
        if (x.dataset.x === 'ok' && body.mode === 'total' && !body.total) { err.textContent = 'Chưa nhập ngân sách tháng'; return; }
        if (x.dataset.x === 'ok' && body.mode === 'site' && !Object.keys(body.sites).length) { err.textContent = 'Chưa nhập ngân sách cho website nào'; return; }
        try {
          const r = await api('/api/budget/plan', body);
          if (r.plan) D.plans[m] = r.plan; else delete D.plans[m];
          o.remove();
          say(r.plan ? '✓ Đã lưu ngân sách tháng ' + mLabel(m) : '✓ Đã xoá ngân sách tháng ' + mLabel(m));
          changed();
        } catch (e2) { err.textContent = e2.message; }
      });
    }).catch(fail);
  }

  function batchPrice(id, g, after) {
    ensure().then(() => {
      const b = D.batches.find(x => x.id === id && x.grp === g);
      if (!b) return fail('Không thấy mẻ này');
      const R = { rate: b.real ? b.real.rate : 0, cur: b.real ? b.real.cur : 'usdt', vnd: b.real ? b.real.vnd : 0, usdt: b.real ? b.real.usdt : 0, seq: 0, man: { vnd: !!b.real, usdt: !!b.real } };
      const o = ov('budBpOv', 520, '<h3>✎ Giá thực tế · mẻ ' + tsHm(b.id) + ' · nhóm ' + esc(g || '—') + '</h3>'
        + '<div class="bud-m bud-s">' + b.ds.length + ' domain Mua DONE · giá gửi ' + fu(b.est) + (D.rate ? ' ≈ ' + fv(b.est * D.rate) : '') + '. Không tính domain Không mua được.</div>'
        + '<div class="g2"><div><label class="f">Giá thực tế USDT</label><input class="f" data-k="usdt" inputmode="decimal" value="' + (R.usdt ? String(R.usdt).replace('.', ',') : '') + '" placeholder="vd ' + String(b.est).replace('.', ',') + '"></div><div><label class="f">hoặc VND</label><input class="f" data-k="vnd" inputmode="decimal" value="' + (R.vnd ? R.vnd.toLocaleString('vi-VN') : '') + '"></div></div>'
        + '<div class="bud-m bud-s" data-k="info" style="margin-top:4px">' + (b.real ? 'Tỷ giá đã lưu: 1 USDT = ' + rateTxt(b.real.rate) + '. Sửa 1 ô thì giữ ô kia (tỷ giá suy ra); xoá 1 ô để tự quy đổi theo Binance.' : 'Nhập tay cả USDT và VND đã trả thì không phụ thuộc tỷ giá. Chỉ nhập 1 ô thì ô kia quy đổi theo Binance P2P hôm nay.') + '</div>'
        + '<div class="bud-m bud-s" data-k="diff" style="margin-top:4px"></div>'
        + '<label class="f">Ghi chú</label><input class="f" data-k="note" value="' + esc(b.real ? b.real.note : '') + '">'
        + '<div class="err" data-k="err"></div>'
        + '<div class="end">' + (b.real ? '<button class="bud-btn bad" data-x="clear">Xoá giá thực tế</button><span style="flex:1"></span>' : '') + '<button class="bud-btn" data-x="no">Hủy</button><button class="bud-btn pri" data-x="ok">Lưu</button></div>');
      const q = k => o.querySelector('[data-k="' + k + '"]');
      const showDiff = () => {
        if (!R.rate || !R.usdt) { q('diff').textContent = ''; return; }
        const du = Math.round((R.usdt - b.est) * 100) / 100, dv = R.vnd - b.est * R.rate;
        q('diff').innerHTML = Math.abs(du) < 0.005 ? 'Khớp giá gửi' : '<span style="color:' + (dv > 0 ? 'var(--t-danger)' : 'var(--t-success)') + '">' + (dv > 0 ? 'Phát sinh +' : 'Chiết khấu −') + fu(Math.abs(du)) + ' (' + fv(Math.abs(dv)) + ')</span> — chỉ cộng vào tổng tháng ' + mLabel(monOf(b.id));
      };
      showDiff();
      bindMoney(q, R, (t, bad) => { q('info').innerHTML = bad ? '<span style="color:var(--t-danger)">⚠️ ' + esc(t) + '</span>' : esc(t); }, showDiff);
      o.addEventListener('click', async e => {
        const x = e.target.closest('[data-x]');
        if (!x) return;
        if (x.dataset.x === 'no') { o.remove(); return; }
        const clear = x.dataset.x === 'clear';
        if (!clear && R.seq && !R.rate) { q('err').textContent = 'Đang lấy tỷ giá, đợi 1 giây rồi bấm Lưu lại'; return; }
        if (!clear && !(R.usdt > 0)) { q('err').textContent = 'Chưa nhập giá thực tế'; return; }
        try {
          const r = await api('/api/domain-hunt/bprice', clear ? { id, grp: g } : { id, grp: g, usdt: R.usdt, vnd: R.vnd, rate: R.rate, cur: R.cur, note: q('note').value.trim() });
          b.real = r.real;
          o.remove();
          say(clear ? '✓ Đã xoá giá thực tế của mẻ' : '✓ Đã lưu giá thực tế của mẻ');
          changed();
          if (after) after();
          const kb = document.getElementById('budKhoOv');
          if (kb && kb.__paint) kb.__paint();
        } catch (e2) { q('err').textContent = e2.message; }
      });
    }).catch(fail);
  }

  function khoBatches() {
    load().then(() => {
      if (D.err) return fail(D.err);
      const o = ov('budKhoOv', 1000, '');
      const box = o.querySelector('.bud-dlg');
      let g = '';
      o.__paint = () => {
        const groups = [...new Set(D.batches.map(b => b.grp))].sort();
        const list = D.batches.filter(b => !g || b.grp === g);
        box.innerHTML = '<h3>💰 Giá các mẻ đã mua</h3>'
          + '<div class="bud-m bud-s">Mỗi mẻ "Đã gửi" là 1 đơn mua, tính vào tháng gửi ở tab 💰 Quản lý ngân sách (nhóm 7 → konheodat01, nhóm 88 → konheodat2001). Chỉ cộng domain Mua DONE (kể cả đã dùng). Bấm ✎ để nhập giá thực tế.</div>'
          + '<div class="bud-chips">' + [['', 'Mọi nhóm']].concat(groups.map(x => [x, 'Nhóm ' + (x || '—')])).map(x => '<button type="button" data-g="' + esc(x[0]) + '" class="' + (g === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</button>').join('') + '</div>'
          + '<div id="budBatchView" style="display:block;max-height:60vh;overflow:auto">' + batchTable(list, { grp: true, total: 'Tính vào tháng gửi' }) + '</div>'
          + '<div class="end"><button class="bud-btn" data-x="close">Đóng</button></div>';
      };
      o.__paint();
      box.addEventListener('click', e => {
        const c = e.target.closest('[data-g]');
        if (c) { g = c.dataset.g; o.__paint(); return; }
        if (e.target.closest('[data-x="close"]')) o.remove();
      });
    });
  }

  function svc(wid) {
    renewed.clear();
    D.orders.forEach(o => { if (o.renewOf) renewed.add(o.renewOf); });
    return D.orders.filter(o => o.wid === wid && (o.type !== 'textlink' || tlState(o).k === 'ok' || tlState(o).k === 'soon'));
  }
  function svcTitle(list) {
    return list.map(o => TN[o.type].n + ' ' + dm(o.date) + ' · ' + fv(o.vnd) + (o.type === 'textlink' ? ' · hết hạn ' + dm(o.to) : '') + (o.note ? ' · ' + o.note : '')).join('\n');
  }
  function icon(wid) {
    injectCss();
    if (!D.loaded) ensure().then(refreshIcons);
    const list = D.loaded ? svc(wid) : [];
    return '<span class="bud-ic ' + (list.length ? 'y' : 'n') + '" data-wid="' + wid + '" title="' + esc(list.length ? 'Đang có dịch vụ:\n' + svcTitle(list) : 'Chưa có dịch vụ') + '">💼</span>';
  }
  function iconHost(u) {
    const h = hn(u);
    const w = websites.find(x => hn(x.url) === h);
    return w ? icon(w.id) : '';
  }
  function refreshIcons() {
    if (!D.loaded) return;
    document.querySelectorAll('.bud-ic[data-wid]').forEach(el => {
      const list = svc(Number(el.dataset.wid));
      el.className = 'bud-ic ' + (list.length ? 'y' : 'n');
      el.title = list.length ? 'Đang có dịch vụ:\n' + svcTitle(list) : 'Chưa có dịch vụ';
    });
  }
  function warnCut(wid, host) {
    return ensure().then(() => {
      const list = svc(wid);
      if (!list.length) return true;
      return new Promise(res => {
        const o = ov('budCutOv', 460, '<h3 style="color:var(--t-danger)">⚠️ Web này đang có dịch vụ</h3><div>Tắt trỏ &amp; xóa src <b>' + esc(host) + '</b> sẽ mất giá trị của:</div><ul style="margin:6px 0 0 18px;padding:0">'
          + list.map(x => '<li>' + TN[x.type].n + (x.ncc ? ' · <b>' + esc(x.ncc) + '</b>' : '') + (x.note ? ' · ' + esc(x.note) : '') + ' · ' + fv(x.vnd) + ' · ' + (x.type === 'textlink' ? '<span style="color:var(--t-warn)">hết hạn ' + dmy(x.to) + '</span>' : dmy(x.date)) + '</li>').join('')
          + '</ul><div class="end"><button class="bud-btn" data-x="no">Bỏ tick</button><button class="bud-btn bad" data-x="ok">Vẫn tắt trỏ &amp; xóa src</button></div>');
        o.style.zIndex = 100030;
        let done = false;
        const fin = v => { if (done) return; done = true; o.remove(); res(v); };
        o.querySelector('[data-x="no"]').onclick = () => fin(false);
        o.querySelector('[data-x="ok"]').onclick = () => fin(true);
        new MutationObserver((_, mo) => { if (!document.body.contains(o)) { mo.disconnect(); fin(false); } }).observe(document.body, { childList: true });
      });
    }).catch(() => true);
  }

  window.BUD = { headRight, rowRight, sortVal, colgroup, applyUI, afterRender, enter, load, ensure, reload, icon, iconHost, warnCut, refreshIcons, khoBatches, batchPrice, parseVnd, parseUsdt, _D: D, _U: U, compute: () => compute() };
})();
