/**
 * site_checkup.js — KHÁM BỆNH WEBSITE (web cũ: nhận 301 / đang chạy / mua lại) TỪ BÊN NGOÀI, không đăng nhập WordPress.
 * Gọi từ server.js: POST /api/site-checkup {domain, urls:[≤30 bài mẫu], all_links:[mọi bài], about:[≤3 trang giới thiệu]}.
 *
 * Checklist chủ site chốt 29/9/2026 (chỉ kiểm CHUẨN SEO — nội dung chủ site tự đọc, bỏ backlink):
 *   1 On-page: title & meta description, heading H1-H3, độ dài nội dung (chuẩn), ảnh (alt, dung lượng, định dạng)
 *   2 Technical: (tốc độ + mobile do trình duyệt gọi PageSpeed), HTTPS, www, robots.txt, sitemap, noindex, canonical
 *   3 Off-page: kênh mạng xã hội web có gắn (nhắc thương hiệu do trình duyệt gọi Serper)
 *   4 Cấu trúc & UX: URL, breadcrumb, internal link, external link, link hỏng
 * + đọc chữ trang chủ và 1–3 trang giới thiệu để chuyên gia hiểu chủ đề website.
 *
 * Dùng lại lớp mạng AN TOÀN của site_diagnose.js (chặn SSRF: chỉ host công khai, giới hạn số URL / kích thước / thời gian).
 * Nằm ở lib/ nên server.js KHÔNG phục vụ như file tĩnh.
 */
const tls = require("tls");
const D = require("./site_diagnose");

const MAX_PAGES = 30;          // bài mẫu kiểm on-page
const MAX_LINKS = 300;         // link kiểm "hỏng"
const MAX_IMAGES = 60;         // ảnh kiểm dung lượng
const HEAVY_IMG = 200 * 1024;
const SOCIAL = { "facebook.com": "Facebook", "fb.com": "Facebook", "youtube.com": "YouTube", "youtu.be": "YouTube", "tiktok.com": "TikTok",
  "instagram.com": "Instagram", "linkedin.com": "LinkedIn", "twitter.com": "X (Twitter)", "x.com": "X (Twitter)", "pinterest.com": "Pinterest",
  "zalo.me": "Zalo", "t.me": "Telegram", "threads.net": "Threads" };

const txt = s => D.decode(String(s || "").replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// vùng nội dung chính của trang (giống analyzeHtml): entry-content / article / main / body
function mainHtml(html) {
  const m = html.match(/<div[^>]+class=["'][^"']*\bentry-content\b[^"']*["'][\s\S]*/i) || html.match(/<article\b[\s\S]*?<\/article>/i) ||
    html.match(/<main\b[\s\S]*?<\/main>/i) || html.match(/<body\b[\s\S]*<\/body>/i) || [html];
  let main = m[0];
  if (/entry-content/i.test(main.slice(0, 300))) {
    const end = main.slice(20).search(/<\/article>|<footer\b|<aside\b|id=["'](comments|respond)["']/i);
    main = end >= 0 ? main.slice(0, end + 20) : main.slice(0, 400000);
  }
  return main;
}

function attr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return m ? D.decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

// ── 1 trang: các mục chuẩn SEO ─────────────────────────────────────────────
function seoPage(html, pageUrl, roots) {
  const head = (html.match(/<head\b[\s\S]*?<\/head>/i) || [html.slice(0, 60000)])[0];
  const title = D.decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1]).replace(/\s+/g, " ").trim();
  const desc = D.metaContent(head, "description");
  const viewport = D.metaContent(head, "viewport");
  const levels = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ l: +m[1], t: txt(m[2]).slice(0, 120) }));
  const main = mainHtml(html);
  // thứ tự heading chỉ xét TRONG nội dung bài (sidebar / widget / footer hay dùng h3-h4 lẻ -> không tính)
  const inMain = [...main.matchAll(/<h([1-6])\b/gi)].map(m => +m[1]);
  let skips = 0, skipEx = "";
  for (let i = 1; i < inMain.length; i++) if (inMain[i] > inMain[i - 1] + 1) { skips++; if (!skipEx) skipEx = `H${inMain[i - 1]} → H${inMain[i]}`; }
  const words = (txt(main).match(/\S+/g) || []).length;
  const imgs = [...main.matchAll(/<img\b[^>]*>/gi)].map(m => {
    const src = attr(m[0], "src") || attr(m[0], "data-src") || attr(m[0], "data-lazy-src") || "";
    const alt = attr(m[0], "alt");
    let abs = "";
    try { abs = new URL(src, pageUrl).toString(); } catch (e) {}
    return { src: abs, alt: alt == null ? null : alt.trim() };
  }).filter(i => i.src && !i.src.startsWith("data:"));
  const links = [];
  for (const m of main.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let u;
    try { u = new URL(href, pageUrl); } catch (e) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const rel = (attr(m[0], "rel") || "").toLowerCase();
    links.push({ url: u.toString(), internal: D.inRoots(u.hostname, roots), nofollow: /nofollow|sponsored|ugc/.test(rel), host: D.rootOf(u.hostname) });
  }
  const schema = D.schemaTypes(html);
  const breadcrumb = schema.some(t => /BreadcrumbList/i.test(t)) || /class=["'][^"']*(breadcrumb|rank-math-breadcrumb|yoast-breadcrumb)/i.test(html);
  const https = /^https:/i.test(pageUrl);
  const mixed = https ? [...html.matchAll(/<(img|script|link|iframe|source|video|audio)\b[^>]*\b(src|href)\s*=\s*["']http:\/\/[^"']+/gi)].length : 0;
  return {
    title, titleLen: title.length, desc, descLen: desc.length, viewport: !!viewport,
    h1: levels.filter(x => x.l === 1).length, h1Text: (levels.find(x => x.l === 1) || {}).t || "", h2: inMain.filter(x => x === 2).length,
    h3: inMain.filter(x => x === 3).length, headingSkips: skips, skipEx, words,
    images: imgs.length, imgNoAlt: imgs.filter(i => !i.alt).length, imgModern: imgs.filter(i => /\.(webp|avif)(\?|$)/i.test(i.src)).length, imgSrcs: imgs.map(i => i.src),
    linksInternal: links.filter(l => l.internal).length, linksExternal: links.filter(l => !l.internal).length,
    externalNofollow: links.filter(l => !l.internal && l.nofollow).length, externalHosts: [...new Set(links.filter(l => !l.internal).map(l => l.host))],
    allLinks: links.map(l => l.url), breadcrumb, schema, mixed,
  };
}

// ── kiểm 1 link: HEAD (GET nếu server không cho HEAD), theo tối đa 4 redirect, mỗi chặng kiểm host công khai ──
async function checkLink(url) {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    let u;
    try { u = new URL(cur); await D.assertPublicHost(u.hostname); }
    catch (e) { if (hop) return { status: 0, error: "chuyển hướng tới địa chỉ lỗi: " + cur.slice(0, 120), redirectError: true }; throw e; }
    let res;
    for (const method of ["HEAD", "GET"]) {
      res = await fetch(cur, { method, redirect: "manual", headers: { "User-Agent": D.UA }, signal: AbortSignal.timeout(10000) });
      try { res.body && res.body.cancel(); } catch (e) {}
      if (!(method === "HEAD" && [403, 405, 501].includes(res.status))) break;
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
    return { status: res.status, final: cur, size: Number(res.headers.get("content-length") || 0), type: res.headers.get("content-type") || "" };
  }
  return { status: 0, error: "quá nhiều redirect" };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { status: 0, error: e.message }; } }
  }));
  return out;
}

// chứng chỉ SSL: ngày hết hạn, đơn vị cấp
function certInfo(host) {
  return new Promise(resolve => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 10000, rejectUnauthorized: false }, () => {
      const c = sock.getPeerCertificate() || {};
      const days = c.valid_to ? Math.floor((new Date(c.valid_to) - Date.now()) / 86400000) : null;
      resolve({ ok: sock.authorized, error: sock.authorized ? "" : String(sock.authorizationError || ""), validTo: c.valid_to || "", days,
        issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || "" });
      sock.end();
    });
    sock.on("error", e => resolve({ ok: false, error: e.message }));
    sock.on("timeout", () => { sock.destroy(); resolve({ ok: false, error: "timeout" }); });
  });
}

// cấu trúc URL của toàn bộ bài
function urlStats(links) {
  const st = { total: 0, long: [], upper: [], underscore: [], encoded: [], dated: [], depth: {} };
  links.forEach(l => {
    let u;
    try { u = new URL(l); } catch (e) { return; }
    st.total++;
    const path = u.pathname.replace(/\/+$/, "");
    const d = path.split("/").filter(Boolean).length;
    st.depth[d] = (st.depth[d] || 0) + 1;
    if (path.length > 75) st.long.push(l);
    if (/[A-Z]/.test(path)) st.upper.push(l);
    if (/_/.test(path)) st.underscore.push(l);
    if (/%[0-9a-f]{2}/i.test(path)) st.encoded.push(l);
    if (/\/(19|20)\d{2}\/\d{1,2}\//.test(path)) st.dated.push(l);
  });
  ["long", "upper", "underscore", "encoded", "dated"].forEach(k => { st[k + "Count"] = st[k].length; st[k] = st[k].slice(0, 5); });
  return st;
}

async function run(input, getLevel1Auth) {
  const domain = String(input.domain || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!domain) throw new Error("Thieu domain");
  const getAuth = h => (getLevel1Auth && (getLevel1Auth(h) || getLevel1Auth(D.rootOf(h)) || getLevel1Auth(domain))) || null;
  const allLinks = (Array.isArray(input.all_links) ? input.all_links : []).slice(0, 3000);
  const urls = (Array.isArray(input.urls) ? input.urls : []).slice(0, MAX_PAGES);

  // Index & thu thập: tái dùng chẩn đoán cũ (trang chủ + redirect, robots.txt, sitemap, link nội bộ, 12 bài mẫu: noindex / canonical)
  const diag = await D.run({ domain, urls: urls.slice(0, 12), all_links: allLinks }, getLevel1Auth);
  const roots = new Set(diag.roots);
  const base = diag.base;
  const sameSite = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && D.inRoots(x.hostname, roots); } catch (e) { return false; } };

  // Trang chủ + bài mẫu: chuẩn on-page
  const pageUrls = [base + "/"].concat(urls.filter(sameSite));
  const pages = await pool(pageUrls, 4, async u => {
    const r = await D.fetchFollow(u, roots, getAuth);
    if (r.status !== 200) return { url: u, status: r.status };
    return Object.assign({ url: u, final: r.final, status: 200, ms: r.ms }, seoPage(r.body, r.final, roots));
  });
  const home = pages[0] || {};

  // Link hỏng (ưu tiên link nội bộ) + dung lượng ảnh
  const linkSet = new Set();
  // bỏ link hệ thống của Cloudflare (/cdn-cgi/: giấu email, challenge) — trình duyệt tự xử lý, không phải link hỏng thật
  pages.forEach(p => (p.allLinks || []).forEach(l => { if (!/\/cdn-cgi\//.test(l)) linkSet.add(l.replace(/#.*$/, "")); }));
  const linkList = [...linkSet].sort((a, b) => sameSite(b) - sameSite(a)).slice(0, MAX_LINKS);
  const linkRes = await pool(linkList, 8, checkLink);
  const onPages = x => pages.filter(p => (p.allLinks || []).some(a => a.replace(/#.*$/, "") === x.url)).map(p => p.url).slice(0, 3);
  const checked = linkList.map((l, i) => ({ url: l, ...linkRes[i] }));
  const isTimeout = x => !x.status && /timeout|aborted/i.test(x.error || "");
  const slowLinks = checked.filter(isTimeout).map(x => ({ url: x.url, internal: sameSite(x.url), on: onPages(x) }));
  const broken = checked.filter(x => !x.redirectError && !isTimeout(x) && (!x.status || x.status >= 400))
    .map(x => ({ url: x.url, status: x.status || 0, error: x.error || "", internal: sameSite(x.url), on: onPages(x) }));
  const badRedirects = checked.filter(x => x.redirectError).map(x => ({ url: x.url, error: x.error, internal: sameSite(x.url), on: onPages(x) }));
  const imgSet = [...new Set([].concat(...pages.map(p => p.imgSrcs || [])))].slice(0, MAX_IMAGES);
  const imgRes = await pool(imgSet, 8, checkLink);
  const heavy = imgSet.map((u, i) => ({ url: u, size: (imgRes[i] || {}).size || 0 })).filter(x => x.size > HEAVY_IMG).sort((a, b) => b.size - a.size);

  // HTTPS: chứng chỉ, http -> https, www thống nhất
  const host = new URL(base).hostname;
  const cert = await certInfo(host);
  let httpRedirect = null;
  try {
    const r = await D.fetchOnce(`http://${host}/`, getAuth);
    const loc = r.headers.get("location") || "";
    httpRedirect = { status: r.status, to: loc, ok: r.status >= 300 && r.status < 400 && /^https:/i.test(new URL(loc, `http://${host}/`).toString()) };
  } catch (e) { httpRedirect = { status: 0, error: e.message, ok: false }; }
  const alt = host.startsWith("www.") ? host.slice(4) : "www." + host;
  let wwwCheck = null;
  try {
    const r = await D.fetchOnce(`https://${alt}/`, getAuth);
    const loc = r.headers.get("location") || "";
    let toHost = "";
    try { toHost = new URL(loc, `https://${alt}/`).hostname; } catch (e) {}
    wwwCheck = { alt, status: r.status, to: loc, ok: (r.status >= 300 && r.status < 400 && toHost === host) };
  } catch (e) { wwwCheck = { alt, status: 0, error: e.message, ok: /khong phan giai/i.test(e.message) ? null : false }; }

  // Mạng xã hội web có gắn: link trên trang chủ + schema sameAs
  const socials = {};
  const homeRes = await D.fetchFollow(base + "/", roots, getAuth).catch(() => null);
  const homeHtml = homeRes && homeRes.status === 200 ? homeRes.body : "";
  for (const m of homeHtml.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    try { const h = D.rootOf(new URL(m[1]).hostname); const k = Object.keys(SOCIAL).find(s => h === s || h.endsWith("." + s)); if (k) (socials[SOCIAL[k]] = socials[SOCIAL[k]] || new Set()).add(m[1]); } catch (e) {}
  }
  for (const m of homeHtml.matchAll(/"sameAs"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)) {
    try { [].concat(JSON.parse(m[1])).forEach(u => { const h = D.rootOf(new URL(u).hostname); const k = Object.keys(SOCIAL).find(s => h === s || h.endsWith("." + s)); if (k) (socials[SOCIAL[k]] = socials[SOCIAL[k]] || new Set()).add(u); }); } catch (e) {}
  }

  // Chữ trang chủ + trang giới thiệu (để chuyên gia hiểu chủ đề website)
  const aboutUrls = (Array.isArray(input.about) ? input.about : []).filter(sameSite).slice(0, 3);
  const about = await pool(aboutUrls, 3, async u => {
    const r = await D.fetchFollow(u, roots, getAuth);
    return { url: u, status: r.status, title: r.status === 200 ? ((r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1] || "").replace(/\s+/g, " ").trim() : "",
      text: r.status === 200 ? txt(mainHtml(r.body)).slice(0, 4000) : "" };
  });
  const homeText = homeHtml ? txt(homeHtml.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")).slice(0, 4000) : "";

  pages.forEach(p => { delete p.imgSrcs; delete p.allLinks; });
  return {
    domain, base, fetchedAt: new Date().toISOString(),
    index: { home: diag.home, crossDomain: diag.crossDomain, robots: diag.robots, sitemap: diag.sitemap, inlinks: diag.inlinks, samples: diag.samples },
    pages, broken, badRedirects: badRedirects.slice(0, 20), badRedirectCount: badRedirects.length, slowLinks: slowLinks.slice(0, 10), slowCount: slowLinks.length,
    linksChecked: linkList.length, heavyImages: heavy.slice(0, 15), imagesChecked: imgSet.length,
    https: { cert, httpRedirect, www: wwwCheck },
    socials: Object.fromEntries(Object.entries(socials).map(([k, v]) => [k, [...v].slice(0, 3)])),
    urls: urlStats(allLinks),
    homeText, homeTitle: home.title || "", about,
  };
}

module.exports = { run, seoPage, urlStats };
