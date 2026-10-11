(function () {
  const API = '/api/seo-audit';
  const ST = { meta: null, phase: 'hero', guid: '', url: '', results: {}, order: [], report: null, tab: 'overview', es: null, err: '' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = { passed: '✓', warning: '!', failed: '✕', skipped: '–' };
  const LBL = { passed: 'Đạt', warning: 'Cảnh báo', failed: 'Không đạt', skipped: 'Bỏ qua' };
  const cls = v => v == null ? 'sa-skip' : v >= 80 ? 'sa-good' : v >= 50 ? 'sa-mid' : 'sa-bad';
  const color = v => v >= 80 ? '#3fb950' : v >= 50 ? '#d29922' : '#f85149';
  const rate = v => v >= 80 ? 'Tốt — Website đạt chuẩn SEO ở hầu hết tiêu chí' : v >= 50 ? 'Trung bình — Còn một số mục quan trọng cần sửa' : 'Yếu — Cần cải thiện nhiều mục quan trọng';
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
      <div class="sa-gchips">${ST.meta.groups.map(g => `<span class="sa-gchip ${byG[g.key] && byG[g.key][0] === byG[g.key][1] ? 'done' : ''}">${g.icon} ${esc(g.label)} ${byG[g.key] ? byG[g.key][0] + '/' + byG[g.key][1] : ''}</span>`).join('')}</div>
      <ul class="sa-feed">${last.map(slug => { const c = ST.meta.checks.find(x => x.slug === slug), r = ST.results[slug]; return `<li><span class="sa-ico ${r.status}">${ICON[r.status]}</span><b>${esc(c.name)}</b><span>${esc(r.message)}</span></li>`; }).join('') || '<li><span>Đang tải trang…</span></li>'}</ul>
    </div></div>`;
  }

  function ring(v) {
    const r = 72, c = 2 * Math.PI * r, off = c * (1 - v / 100);
    return `<div class="sa-ring"><svg width="170" height="170"><circle cx="85" cy="85" r="${r}" stroke="#21262d" stroke-width="14" fill="none"/><circle cx="85" cy="85" r="${r}" stroke="${color(v)}" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg><div class="v"><b style="color:${color(v)}">${v}</b><span>/ 100 điểm</span></div></div>`;
  }

  function groupStats(key) {
    let t = 0, s = 0; const n = { passed: 0, warning: 0, failed: 0, skipped: 0 };
    for (const c of ST.meta.checks.filter(c => !key || c.group === key)) {
      const r = ST.results[c.slug]; if (!r) continue;
      n[r.status]++;
      if (!c.relevance || r.status === 'skipped') continue;
      t += c.relevance; s += r.status === 'passed' ? c.relevance : r.status === 'warning' ? c.relevance / 2 : 0;
    }
    return { score: t ? Math.round(s / t * 100) : null, n };
  }

  function dashHtml() {
    const sc = ST.report ? ST.report.score : score(ST.results);
    const all = groupStats(null);
    const issues = ST.meta.checks.filter(c => ST.results[c.slug] && ['failed', 'warning'].includes(ST.results[c.slug].status));
    const tabs = [['overview', '📊 Tổng quan', 0], ['issues', '🛠️ Cần sửa', issues.length], ...ST.meta.groups.map(g => [g.key, g.icon + ' ' + g.label, groupStats(g.key).n.failed])];
    const when = ST.report ? new Date(ST.report.created).toLocaleString('vi-VN') + ' · ' + Math.round((ST.report.duration || 0) / 1000) + ' giây' : '';
    return `<div class="sa-top">
      <div class="u">Báo cáo SEO Audit<br><b>${esc(ST.report ? ST.report.final_url || ST.url : ST.url)}</b><br>${esc(when)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="sa-btn ghost sm" onclick="saNew()">＋ Phân tích URL khác</button>
        <button class="sa-btn ghost sm" onclick="saRerun()">↻ Phân tích lại</button>
        <button class="sa-btn sm" onclick="saPdf()">⬇ Xuất PDF</button>
      </div></div>
    ${ST.report && ST.report.error ? `<div class="sa-card" style="border-color:#f85149;color:#f85149">${esc(ST.report.error)}</div>` : ''}
    <div class="sa-sum">
      <div class="sa-card sa-score">${ring(sc)}<div class="sa-rate" style="color:${color(sc)}">${rate(sc)}</div>
        <div class="sa-counts"><div><b style="color:#3fb950">${all.n.passed}</b>Đạt</div><div><b style="color:#d29922">${all.n.warning}</b>Cảnh báo</div><div><b style="color:#f85149">${all.n.failed}</b>Không đạt</div><div><b style="color:#8b949e">${all.n.skipped}</b>Bỏ qua</div></div></div>
      <div class="sa-card"><h3>Điểm theo nhóm</h3><div class="sa-groups">${ST.meta.groups.map(g => { const gs = groupStats(g.key); return `<div class="sa-group" onclick="saTab('${g.key}')">
        <div class="h"><span>${g.icon} ${esc(g.label)}</span><span class="sa-pill ${cls(gs.score)}">${gs.score == null ? '–' : gs.score}</span></div>
        <div class="sa-bar"><i style="width:${gs.score || 0}%;background:${gs.score == null ? '#30363d' : color(gs.score)}"></i></div>
        <div class="n">✓ ${gs.n.passed} · ! ${gs.n.warning} · ✕ ${gs.n.failed}${gs.n.skipped ? ' · – ' + gs.n.skipped : ''}</div></div>`; }).join('')}</div></div>
    </div>
    <div class="sa-tabs">${tabs.map(([k, l, n]) => `<button class="sa-tab ${ST.tab === k ? 'on' : ''}" onclick="saTab('${k}')">${esc(l)}${n ? `<em>${n}</em>` : ''}</button>`).join('')}</div>
    <div id="saBody">${tabBody()}</div>`;
  }

  function tabBody() {
    if (ST.tab === 'overview') return overviewHtml();
    let list;
    if (ST.tab === 'issues') {
      list = ST.meta.checks.filter(c => ST.results[c.slug] && ['failed', 'warning'].includes(ST.results[c.slug].status))
        .sort((a, b) => (ST.results[a.slug].status === 'failed' ? 0 : 1) - (ST.results[b.slug].status === 'failed' ? 0 : 1) || b.relevance - a.relevance);
      if (!list.length) return '<div class="sa-empty">🎉 Không còn mục nào cần sửa.</div>';
    } else list = ST.meta.checks.filter(c => c.group === ST.tab);
    return list.map(checkHtml).join('');
  }

  function overviewHtml() {
    const top = ST.meta.checks.filter(c => ST.results[c.slug] && ST.results[c.slug].status === 'failed').sort((a, b) => b.relevance - a.relevance).slice(0, 6);
    const pv = ST.results['google-preview'], cl = ST.results['keywords-cloud'], sn = ST.results['mobile-snapshot'], kw = ST.results['common-keywords'];
    return `<div class="sa-ov">
      <div>
        <div class="sa-card"><h3>🚨 Lỗi quan trọng nhất</h3>${top.length ? top.map(checkHtml).join('') : '<div class="sa-empty">Không có lỗi nghiêm trọng.</div>'}</div>
        <div class="sa-card"><h3>🔎 Xem trước trên Google</h3>${pv && pv.data ? dataHtml(pv.data) : '<div class="sa-empty">Không có dữ liệu.</div>'}</div>
      </div>
      <div>
        <div class="sa-card"><h3>📱 Giao diện Mobile</h3>${sn && sn.data && sn.data.snapshot ? dataHtml(sn.data) : `<div class="sa-empty">${esc(sn ? sn.message : 'Không có dữ liệu.')}</div>`}</div>
        <div class="sa-card"><h3>🏷️ Từ khóa phổ biến</h3>${kw && kw.data ? dataHtml(kw.data) : ''}${cl && cl.data ? dataHtml(cl.data) : ''}</div>
      </div></div>`;
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
    if (d.image) h += `<img src="${esc(d.image)}" alt="" style="max-width:${d.small ? 48 : 300}px;margin-top:8px;border-radius:4px;background:#fff">`;
    return h;
  }

  function checkHtml(c) {
    const r = ST.results[c.slug];
    if (!r) return `<div class="sa-check"><div class="h"><span class="sa-ico skipped">…</span><div class="t"><b>${esc(c.name)}</b><span>Đang kiểm tra…</span></div></div></div>`;
    const imp = c.relevance >= 8 ? 'Quan trọng cao' : c.relevance >= 4 ? 'Quan trọng vừa' : c.relevance ? 'Quan trọng thấp' : 'Tham khảo';
    return `<div class="sa-check" id="sa-c-${c.slug}"><div class="h" onclick="this.parentNode.classList.toggle('open')">
      <span class="sa-ico ${r.status}" title="${LBL[r.status]}">${ICON[r.status]}</span>
      <div class="t"><b>${esc(c.name)}</b><span>${esc(r.message)}</span></div>
      <span class="imp">${imp}</span><span class="car">›</span></div>
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
      if (!ST.results[ev.slug]) { ST.results[ev.slug] = ev.result; ST.order.push(ev.slug); }
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
      Object.assign(ST, { guid, results: {}, order: [], report: null, phase: 'loading', tab: 'overview' });
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
  window.saTab = function (k) { ST.tab = k; render(); const b = document.querySelector('.sa-tabs'); if (b) b.scrollIntoView({ block: 'nearest' }); };
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
    let last = ''; try { last = localStorage.getItem('sa_last') || ''; } catch (x) {}
    if (last) { await saOpen(last); if (ST.phase === 'dash') return; ST.err = ''; }
    render();
  };
  const pg = document.getElementById('page-seoaudit');
  if (pg && !pg.classList.contains('is-hidden')) window.saInit();
})();
