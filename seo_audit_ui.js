(function () {
  const API = '/api/seo-audit';
  const ST = { meta: null, phase: 'hero', guid: '', url: '', results: {}, order: [], report: null, tab: 'overview', es: null, err: '' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = { passed: '✅', warning: '⚠️', failed: '❌', skipped: '➖' };
  const LBL = { passed: 'Đạt', warning: 'Cảnh báo', failed: 'Không đạt', skipped: 'Bỏ qua' };
  const cls = v => v == null ? 'sa-skip' : v >= 80 ? 'sa-good' : v >= 50 ? 'sa-mid' : 'sa-bad';
  const color = v => v >= 80 ? '#3fb950' : v >= 50 ? '#d29922' : '#f85149';
  const rate = v => v >= 80 ? 'Tốt — Website đạt chuẩn SEO ở hầu hết tiêu chí' : v >= 50 ? 'Khá — Cần cải thiện một số mục' : 'Yếu — Cần cải thiện nhiều mục quan trọng';
  const root = () => document.getElementById('saRoot');

  async function api(path, opt) {
    const r = await fetch(API + path, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  async function ensureMeta() {
    if (!ST.meta) ST.meta = await api('/meta');
    return ST.meta;
  }

  function score(results) {
    let t = 0, s = 0;
    for (const c of ST.meta.checks) {
      const r = results[c.slug];
      if (!r || !c.relevance || r.status === 'skipped') continue;
      t += c.relevance;
      if (r.status === 'passed') s += c.relevance; else if (r.status === 'warning') s += c.relevance / 2;
    }
    return t ? Math.round(s / t * 100) : 0;
  }

  function render() {
    const el = root(); if (!el) return;
    if (ST.phase === 'hero') el.innerHTML = heroHtml();
    else if (ST.phase === 'loading') el.innerHTML = loadingHtml();
    else el.innerHTML = dashHtml();
    if (ST.phase === 'hero') { loadHistory(); const i = document.getElementById('saUrl'); if (i) i.focus(); }
  }

  function heroHtml() {
    const n = ST.meta ? ST.meta.checks.length : 58;
    return `<div class="sa-hero">
      <div style="font-size:30px">🔍</div>
      <h2>Phân Tích SEO Website <span>Toàn Diện</span></h2>
      <p>Kiểm tra ${n} tiêu chí SEO quan trọng • Tốc độ • Bảo mật • Mobile • Core Web Vitals</p>
      <form class="sa-form" onsubmit="event.preventDefault();saStart()">
        <input id="saUrl" placeholder="Nhập URL website, vd: https://example.com" value="${esc(ST.url)}" autocomplete="off">
        <button class="sa-btn" type="submit">🌐 Phân Tích</button>
      </form>
      <div class="sa-err" id="saErr">${esc(ST.err)}</div>
      <div class="sa-stats">
        <div class="sa-stat"><b>${n}</b><span>Tiêu chí kiểm tra</span></div>
        <div class="sa-stat"><b>&lt;30s</b><span>Thời gian phân tích</span></div>
        <div class="sa-stat"><b>8</b><span>Nhóm đánh giá</span></div>
        <div class="sa-stat"><b>Free</b><span>Không giới hạn</span></div>
      </div>
    </div>
    <div class="sa-card"><h3>🕘 Lịch sử phân tích</h3><div id="saHist" class="sa-empty">Đang tải…</div></div>`;
  }

  async function loadHistory() {
    const box = document.getElementById('saHist'); if (!box) return;
    try {
      const { items } = await api('/history');
      if (!items.length) { box.innerHTML = 'Chưa có lượt phân tích nào.'; return; }
      box.className = '';
      box.innerHTML = `<table class="sa-hist"><tr><th>Website</th><th>Điểm</th><th>Đạt / Cảnh báo / Không đạt</th><th>Thời gian</th><th></th></tr>${items.map(h => `<tr>
        <td style="word-break:break-all">${esc(h.url)}</td><td><span class="sa-pill ${cls(h.score)}">${h.score}</span></td>
        <td>${h.counts ? `<span style="color:#3fb950">${h.counts.passed || 0}</span> / <span style="color:#d29922">${h.counts.warning || 0}</span> / <span style="color:#f85149">${h.counts.failed || 0}</span>` : ''}</td>
        <td style="color:#8b949e">${new Date(h.created).toLocaleString('vi-VN')}</td>
        <td style="text-align:right;white-space:nowrap"><button class="sa-btn ghost sm" onclick="saOpen('${h.guid}')">Xem</button> <button class="sa-btn ghost sm" onclick="saDel('${h.guid}')" title="Xoá">🗑</button></td></tr>`).join('')}</table>`;
    } catch (e) { box.textContent = 'Không tải được lịch sử: ' + e.message; }
  }

  function loadingHtml() {
    const total = ST.meta.checks.length, done = ST.order.length, pct = Math.round(done / total * 100);
    const last = ST.order.slice(-14).reverse();
    const byG = {};
    for (const c of ST.meta.checks) { byG[c.group] = byG[c.group] || [0, 0]; byG[c.group][1]++; if (ST.results[c.slug]) byG[c.group][0]++; }
    return `<div class="sa-load"><div class="sa-card">
      <div class="sa-top"><div class="u">Đang phân tích<br><b>${esc(ST.url)}</b></div><button class="sa-btn ghost sm" onclick="saCancel()">Huỷ</button></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Đang kiểm tra các tiêu chí…</span><b>${done}/${total} · ${pct}%</b></div>
      <div class="sa-bar"><i style="width:${pct}%"></i></div>
      ${ST.note ? `<div style="margin-top:10px;font-size:13px;color:#d29922">⏳ ${esc(ST.note)}</div>` : ''}
      <div class="sa-gchips">${ST.meta.groups.map(g => `<span class="sa-gchip ${byG[g.key] && byG[g.key][0] === byG[g.key][1] ? 'done' : ''}">${g.icon} ${esc(g.label)} ${byG[g.key] ? byG[g.key][0] + '/' + byG[g.key][1] : ''}</span>`).join('')}</div>
      <ul class="sa-feed">${last.map(slug => { const c = ST.meta.checks.find(x => x.slug === slug), r = ST.results[slug]; return `<li><span class="sa-ico ${r.status}">${ICON[r.status]}</span><b>${esc(c.name)}</b><span>${esc(r.message)}</span></li>`; }).join('') || '<li><span>Đang tải trang…</span></li>'}</ul>
    </div></div>`;
  }

  function groupStats(key) {
    let t = 0, s = 0; const n = { passed: 0, warning: 0, failed: 0, skipped: 0 }; let total = 0;
    for (const c of ST.meta.checks.filter(c => !key || c.group === key)) {
      total++;
      const r = ST.results[c.slug]; if (!r) continue;
      n[r.status]++;
      if (!c.relevance || r.status === 'skipped') continue;
      t += c.relevance; s += r.status === 'passed' ? c.relevance : r.status === 'warning' ? c.relevance / 2 : 0;
    }
    return { score: t ? Math.round(s / t * 100) : null, n, total };
  }

  const tone = (p, t) => !t ? 'sa-skip' : p / t >= 1 ? 'sa-good' : p / t >= 0.6 ? 'sa-mid' : 'sa-bad';

  function donut(n) {
    const tot = n.passed + n.warning + n.failed || 1, r = 38, C = 2 * Math.PI * r;
    let off = 0;
    const seg = (v, col) => { const len = v / tot * C; const el = v ? `<circle cx="48" cy="48" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>` : ''; off += len; return el; };
    return `<div class="wrap"><svg width="96" height="96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="#21262d" stroke-width="12"/>${seg(n.passed, '#3fb950')}${seg(n.warning, '#d29922')}${seg(n.failed, '#f85149')}</svg><div class="c">✅</div></div>`;
  }

  const VITALS = [
    ['web-vitals-ttfb', '⏱️', 'TTFB', 800, 1800, v => (v / 1000).toFixed(2) + 's', 'Ngưỡng tốt: ≤ 0.8s'],
    ['web-vitals-fcp', '🎨', 'FCP', 1800, 3000, v => (v / 1000).toFixed(2) + 's', 'Ngưỡng tốt: ≤ 1.8s'],
    ['web-vitals-lcp', '📐', 'LCP', 2500, 4000, v => (v / 1000).toFixed(2) + 's', 'Ngưỡng tốt: ≤ 2.5s'],
    ['web-vitals-cls', '📊', 'CLS', 0.1, 0.25, v => v.toFixed(4), 'Ngưỡng tốt: ≤ 0.1'],
  ];
  const SCOL = { passed: '#3fb950', warning: '#d29922', failed: '#f85149', skipped: '#8b949e' };

  function vitalsHtml() {
    return `<div class="sa-vitals">${VITALS.map(([slug, ic, name, good, poor, fmt, th]) => {
      const r = ST.results[slug], v = r && r.data && typeof r.data.value === 'number' ? r.data.value : null;
      const st = r ? r.status : 'skipped', w = v == null ? 0 : Math.min(100, Math.max(3, v / poor * 100));
      return `<div class="sa-vital" title="${esc(r ? r.message : '')}"><div class="h">${ic} ${name}</div><div class="v" style="color:${SCOL[st]}">${v == null ? '—' : fmt(v)}</div>
        <div class="sa-bar"><i style="width:${w}%;background:${SCOL[st]}"></i></div><div class="t">${th}</div></div>`;
    }).join('')}</div>`;
  }

  function kpisHtml() {
    const s = (ST.report && ST.report.stats) || {};
    const ld = ST.results['loading-speed'], lt = ld && ld.data && ld.data.loading_time != null ? ld.data.loading_time : s.load;
    const size = b => b == null ? '—' : b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB';
    const k = [['⚡', lt == null ? '—' : (lt / 1000).toFixed(2) + 's', 'Thời gian tải trang'], ['📦', s.requests ?? '—', 'Tổng HTTP Requests'],
      ['💾', size(s.bytes) + (s.approx && s.bytes != null ? '*' : ''), 'Tổng dung lượng'], ['🏗️', s.dom ?? '—', 'DOM Nodes']];
    return `<div class="sa-kpis">${k.map(([i, v, l]) => `<div class="sa-kpi"><div class="i">${i}</div><div><b>${esc(v)}</b><span>${l}</span></div></div>`).join('')}</div>`;
  }

  function dashHtml() {
    const sc = ST.report ? ST.report.score : score(ST.results);
    const all = groupStats(null);
    const band = sc >= 80 ? 'good' : sc >= 50 ? 'mid' : 'bad';
    const when = ST.report ? new Date(ST.report.created).toLocaleString('vi-VN') + ' · phân tích trong ' + Math.round((ST.report.duration || 0) / 1000) + ' giây' : '';
    const nav = ST.meta.groups.map(g => { const gs = groupStats(g.key); return `<button class="${ST.tab === g.key ? 'on' : ''}" onclick="saTab('${g.key}')"><span>${g.icon}</span><span class="l">${esc(g.label)}</span><em class="${tone(gs.n.passed, gs.total)}">${gs.n.passed}/${gs.total}</em></button>`; }).join('');
    const groups = ST.tab === 'overview' ? ST.meta.groups : ST.meta.groups.filter(g => g.key === ST.tab);
    return `<div class="sa-top">
      <div class="u">Báo cáo SEO Audit · ${esc(when)}<br><b>${esc(ST.report ? ST.report.final_url || ST.url : ST.url)}</b></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="sa-btn ghost sm" onclick="saNew()">🏠 Nhập URL / Lịch sử</button>
        <button class="sa-btn ghost sm" onclick="saRerun()">↻ Phân tích lại</button>
        <button class="sa-btn sm" onclick="saPdf()">⬇ Xuất PDF</button>
      </div></div>
    ${ST.report && ST.report.error ? `<div class="sa-card" style="border-color:#f85149;color:#f85149">${esc(ST.report.error)}</div>` : ''}
    <div class="sa-layout">
      <nav class="sa-nav"><button class="${ST.tab === 'overview' ? 'on' : ''}" onclick="saTab('overview')"><span>📊</span><span class="l">Tổng quan</span></button><hr>${nav}</nav>
      <div>
        ${ST.tab === 'overview' ? `<div class="sa-scorebox ${band}">
          <div><div class="k">Điểm SEO tổng thể</div><div class="n">${sc}<small>/ 100</small></div><div class="r">${rate(sc)}</div></div>
          <div class="sa-donut">${donut(all.n)}<div class="sa-legend"><div><i style="background:#3fb950"></i>Đạt: ${all.n.passed} mục</div><div><i style="background:#d29922"></i>Cần cải thiện: ${all.n.warning} mục</div><div><i style="background:#f85149"></i>Không đạt: ${all.n.failed} mục</div>${all.n.skipped ? `<div><i style="background:#6e7681"></i>Chưa đo được: ${all.n.skipped} mục</div>` : ''}</div></div>
        </div>${vitalsHtml()}${kpisHtml()}` : ''}
        ${groups.map(g => { const gs = groupStats(g.key); return `<div class="sa-sec"><div class="sa-sec-h"><div><h2>${g.icon} ${esc(g.label)}</h2><p>${gs.total} tiêu chí đã kiểm tra</p></div><span class="sa-pill ${tone(gs.n.passed, gs.total)}">${gs.n.passed}/${gs.total} đạt</span></div>
          ${ST.meta.checks.filter(c => c.group === g.key).map(checkHtml).join('')}</div>`; }).join('')}
      </div>
    </div>`;
  }

  function dataHtml(d) {
    if (!d) return '';
    let h = '';
    if (d.preview) h += `<div class="sa-serp"><div class="s1">${esc(d.preview.url)}</div><div class="s2">${esc(d.preview.title || '(không có tiêu đề)')}</div><div class="s3">${esc(d.preview.desc || '(không có mô tả)')}</div></div>`;
    if (d.snapshot) h += `<div class="sa-phone"><img src="${esc(d.snapshot)}" alt="Ảnh chụp mobile"></div>`;
    if (d.cloud && d.cloud.length) { const mx = Math.max(...d.cloud.map(x => x.c)); h += `<div class="sa-cloud">${d.cloud.map(x => `<span style="font-size:${12 + Math.round(x.c / mx * 18)}px;opacity:${.55 + x.c / mx * .45}" title="${x.c} lần">${esc(x.k)}</span>`).join('')}</div>`; }
    if (d.table && d.table.rows && d.table.rows.length) h += `<table class="sa-tbl"><tr>${d.table.head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${d.table.rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>`;
    if (d.items && d.items.length) h += `<ul class="sa-list">${d.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (d.code) h += `<div class="sa-code">${esc(d.code)}</div>`;
    if (d.image) h += `<img src="${esc(d.image)}" alt="" style="max-width:${d.small ? 48 : 300}px;margin-top:8px;border-radius:4px">`;
    return h;
  }

  function mini(r, c) {
    if (!c.relevance || r.status === 'skipped') return `<div class="sa-mini" title="Không tính điểm"><svg width="30" height="30"><circle cx="15" cy="15" r="12" fill="none" stroke="#30363d" stroke-width="3"/></svg><b style="color:#8b949e">—</b></div>`;
    const p = r.status === 'passed' ? 100 : r.status === 'warning' ? 50 : 0, C = 2 * Math.PI * 12, col = SCOL[r.status];
    return `<div class="sa-mini" title="Điểm tiêu chí này: ${p}%"><svg width="30" height="30"><circle cx="15" cy="15" r="12" fill="none" stroke="#30363d" stroke-width="3"/><circle cx="15" cy="15" r="12" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="${C * p / 100} ${C}"/></svg><b style="color:${col}">${p}%</b></div>`;
  }

  function checkHtml(c) {
    const r = ST.results[c.slug];
    if (!r) return `<div class="sa-check"><div class="h"><span class="sa-ico skipped">⏳</span><div class="t"><b>${esc(c.name)}</b><span>Đang kiểm tra…</span></div></div></div>`;
    const imp = c.relevance >= 8 ? ['hi', 'Quan trọng'] : c.relevance >= 3 ? ['md', 'Trung bình'] : c.relevance ? ['lo', 'Thấp'] : ['ref', 'Tham khảo'];
    return `<div class="sa-check" id="sa-c-${c.slug}"><div class="h" onclick="this.parentNode.classList.toggle('open')">
      <span class="sa-ico ${r.status}" title="${LBL[r.status]}">${ICON[r.status]}</span>
      <div class="t"><b>${esc(c.name)}</b><span>${esc(r.message)}</span></div>
      <span class="sa-imp ${imp[0]}">${imp[1]}</span>${mini(r, c)}<span class="car">▼</span></div>
      <div class="b">${dataHtml(r.data)}${r.status !== 'passed' && r.how_to_fix ? `<div class="sa-fix"><b>💡 Cách khắc phục:</b> ${esc(r.how_to_fix)}</div>` : ''}</div></div>`;
  }

  function closeEs() { if (ST.es) { ST.es.close(); ST.es = null; } }

  function listen(guid) {
    closeEs();
    const es = new EventSource(API + '/stream?guid=' + encodeURIComponent(guid));
    ST.es = es;
    let t = null;
    es.onmessage = e => {
      let ev; try { ev = JSON.parse(e.data); } catch (x) { return; }
      if (ev.done) {
        closeEs();
        if (ev.error && !ev.report) { ST.phase = 'hero'; ST.err = ev.error; render(); return; }
        ST.report = ev.report || null;
        if (ST.report) for (const c of ST.report.checks) if (c.result) ST.results[c.slug] = c.result;
        ST.phase = 'dash'; ST.tab = 'overview';
        try { localStorage.setItem('sa_last', guid); } catch (x) {}
        render(); return;
      }
      if ('note' in ev) { ST.note = ev.note; if (ST.phase === 'loading') render(); return; }
      if (!ST.results[ev.slug]) ST.order.push(ev.slug);
      ST.results[ev.slug] = ev.result;
      if (!t) t = setTimeout(() => { t = null; if (ST.phase === 'loading') render(); }, 120);
    };
    es.onerror = () => {
      if (ST.es !== es) return;
      if (ST.phase === 'loading' && ST.order.length) return;
      closeEs(); ST.phase = 'hero'; ST.err = 'Mất kết nối khi phân tích. Thử lại.'; render();
    };
  }

  window.saStart = async function (u) {
    await ensureMeta();
    const url = (u || (document.getElementById('saUrl') || {}).value || '').trim();
    if (!url) { ST.err = 'Nhập URL website cần phân tích.'; render(); return; }
    ST.err = ''; ST.url = url;
    try {
      const { guid } = await api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      Object.assign(ST, { guid, results: {}, order: [], report: null, phase: 'loading', tab: 'overview', note: '' });
      render(); listen(guid);
    } catch (e) { ST.phase = 'hero'; ST.err = 'Không thể tạo báo cáo: ' + e.message; render(); }
  };
  window.saOpen = async function (guid) {
    await ensureMeta();
    try {
      const rep = await api('/report?guid=' + encodeURIComponent(guid));
      const results = {}; for (const c of rep.checks) if (c.result) results[c.slug] = c.result;
      Object.assign(ST, { guid, url: rep.url, results, order: Object.keys(results), report: rep, phase: 'dash', tab: 'overview', err: '' });
      try { localStorage.setItem('sa_last', guid); } catch (x) {}
      render();
    } catch (e) { ST.err = 'Không mở được báo cáo: ' + e.message; ST.phase = 'hero'; render(); }
  };
  window.saDel = async function (guid) {
    if (!confirm('Xoá báo cáo này?')) return;
    try { await api('/report?guid=' + encodeURIComponent(guid), { method: 'DELETE' }); } catch (e) {}
    loadHistory();
  };
  window.saRerun = function () { saStart(ST.url); };
  window.saCancel = function () { closeEs(); ST.phase = 'hero'; render(); };
  window.saNew = function () { closeEs(); ST.phase = 'hero'; ST.url = ''; try { localStorage.removeItem('sa_last'); } catch (x) {} render(); };
  window.saTab = function (k) { ST.tab = k; render(); const pg = document.getElementById('page-seoaudit'); if (pg) pg.scrollTop = 0; };
  window.saPdf = function () {
    const sc = ST.report ? ST.report.score : score(ST.results);
    const rows = ST.meta.groups.map(g => {
      const cs = ST.meta.checks.filter(c => c.group === g.key);
      return `<h2>${g.icon} ${esc(g.label)} — ${groupStats(g.key).score ?? '–'}/100</h2><table><thead><tr><th style="width:28%">Tiêu chí</th><th style="width:12%">Kết quả</th><th>Chi tiết / Cách khắc phục</th></tr></thead><tbody>${cs.map(c => { const r = ST.results[c.slug] || { status: 'skipped', message: '' }; return `<tr><td>${esc(c.name)}</td><td class="${r.status}">${LBL[r.status]}</td><td>${esc(r.message)}${r.status !== 'passed' && r.how_to_fix ? `<div class="fix">💡 ${esc(r.how_to_fix)}</div>` : ''}</td></tr>`; }).join('')}</tbody></table>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) { alert('Trình duyệt chặn cửa sổ mới — cho phép popup rồi thử lại.'); return; }
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>SEO Audit - ${esc(ST.url)}</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;color:#1f2328;margin:28px;font-size:13px}h1{margin:0 0 4px;font-size:22px}h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #eee;padding-bottom:4px}
      .score{font-size:40px;font-weight:800;color:${color(sc)}}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}
      .passed{color:#1a7f37;font-weight:600}.warning{color:#9a6700;font-weight:600}.failed{color:#cf222e;font-weight:600}.skipped{color:#6e7781}.fix{color:#0969da;margin-top:4px}
      </style></head><body><h1>Báo cáo SEO Audit</h1><div>${esc(ST.report ? ST.report.final_url || ST.url : ST.url)} · ${new Date(ST.report ? ST.report.created : Date.now()).toLocaleString('vi-VN')}</div>
      <p><span class="score">${sc}</span>/100 — ${rate(sc)}</p>${rows}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };

  window.saInit = async function () {
    const el = root(); if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    try { await ensureMeta(); } catch (e) { el.innerHTML = '<div class="sa-card" style="color:#f85149">Không tải được công cụ: ' + esc(e.message) + '</div>'; return; }
    render();
  };
  const pg = document.getElementById('page-seoaudit');
  if (pg && !pg.classList.contains('is-hidden')) window.saInit();
})();
