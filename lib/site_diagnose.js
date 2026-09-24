/**
 * site_diagnose.js — Chan doan index 1 website TU BEN NGOAI (khong can dang nhap WordPress).
 * Goi tu server.js: POST /api/site-diagnose {domain, urls:[mau], all_links:[moi bai]}.
 *
 * Lay: robots.txt (luat cho Googlebot), sitemap (bai nao thieu), HTML trang chu + tung URL mau
 * (HTTP, redirect, meta robots / X-Robots-Tag, canonical, so tu, link noi bo), link noi bo tro toi
 * tung bai (quet noi dung bai qua WP REST). Nam o lib/ nen server.js KHONG phuc vu nhu file tinh.
 *
 * Endpoint cong khai -> chong SSRF: chi https/http toi hostname cong khai (DNS khong ra IP noi bo),
 * moi URL phai cung domain goc, gioi han so URL / kich thuoc / thoi gian.
 */
const dns = require("dns").promises;
const net = require("net");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_SAMPLE = 12;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT = 15000;

// ── An toan mang ────────────────────────────────────────────────────────────
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith("::ffff:")) return isPrivateIp(s.slice(7));
  return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") ||
    s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb");
}

const _hostOk = new Map();
async function assertPublicHost(host) {
  if (_hostOk.has(host)) { if (!_hostOk.get(host)) throw new Error("host khong hop le"); return; }
  let ok = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !net.isIP(host);
  if (ok) {
    try {
      const addrs = await dns.lookup(host, { all: true });
      ok = addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address));
    } catch (e) { ok = false; }
  }
  _hostOk.set(host, ok);
  if (!ok) throw new Error("host khong hop le hoac khong phan giai duoc: " + host);
}

const rootOf = h => h.replace(/^www\./i, "").toLowerCase();
// roots = tap domain cua site (domain dang theo doi + domain dich neu ca site da 301 + host cua link bai)
const inRoots = (host, roots) => { const r = rootOf(host); return roots.has(r) || [...roots].some(x => r.endsWith("." + x)); };
// Mot so plugin in CSS/HTML TRUOC JSON cua REST -> cat tu dau "[" / "{"
function parseJsonLoose(txt) {
  try { return JSON.parse(txt); } catch (e) {}
  const i = txt.search(/[\[{]/);
  if (i > 0) { try { return JSON.parse(txt.slice(i)); } catch (e) {} }
  return null;
}

// 1 lan fetch, KHONG tu theo redirect (tu theo o fetchFollow de kiem tung chang)
async function fetchOnce(url, getAuth, accept) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("chi ho tro http/https");
  await assertPublicHost(u.hostname);
  const headers = { "User-Agent": UA, "Accept": accept || "text/html,application/xhtml+xml,*/*" };
  const auth = getAuth && getAuth(u.hostname);
  if (auth) headers["Authorization"] = auth;
  const t0 = Date.now();
  const res = await fetch(url, { redirect: "manual", headers, signal: AbortSignal.timeout(TIMEOUT) });
  let body = "";
  if (res.status < 300 || res.status >= 400) {
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) { try { res.body && res.body.cancel(); } catch (e) {} body = ""; }
    else body = (await res.text()).slice(0, MAX_BYTES);
  } else { try { res.body && res.body.cancel(); } catch (e) {} }
  return { status: res.status, headers: res.headers, body, ms: Date.now() - t0 };
}

// followOff = cho theo redirect sang domain khac (chi dung cho trang chu: ca site da 301 di noi khac)
async function fetchFollow(url, roots, getAuth, accept, followOff) {
  const chain = [];
  let cur = url;
  for (let i = 0; i < 6; i++) {
    const u = new URL(cur);
    if (!followOff && !inRoots(u.hostname, roots)) {
      chain.push({ status: 0, url: cur, note: "redirect ra domain khac — dung" });
      return { chain, final: cur, status: 0, headers: new Headers(), body: "", ms: 0, offsite: true };
    }
    const r = await fetchOnce(cur, getAuth, accept);
    chain.push({ status: r.status, url: cur });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
    return { chain, final: cur, status: r.status, headers: r.headers, body: r.body, ms: r.ms };
  }
  return { chain, final: cur, status: 0, headers: new Headers(), body: "", ms: 0, error: "qua nhieu redirect" };
}

// ── robots.txt (luat Google: nhom user-agent cu the nhat, luat khop dai nhat, allow thang khi hoa) ──
function parseRobots(txt) {
  const groups = []; let cur = null, lastWasUA = false;
  const sitemaps = [];
  txt.split(/\r?\n/).forEach(line => {
    const l = line.replace(/#.*/, "").trim();
    const m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) return;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "sitemap") { if (v) sitemaps.push(v); return; }
    if (k === "user-agent") {
      if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasUA = true; return;
    }
    lastWasUA = false;
    if (cur && (k === "allow" || k === "disallow")) cur.rules.push({ allow: k === "allow", path: v });
  });
  return { groups, sitemaps };
}

function robotsVerdict(parsed, path) {
  const pick = a => parsed.groups.filter(g => g.agents.includes(a));
  let gs = pick("googlebot");
  if (!gs.length) gs = pick("*");
  const rules = [].concat(...gs.map(g => g.rules)).filter(r => r.path !== "" || !r.allow);
  let best = null;
  rules.forEach(r => {
    if (r.path === "") return;                       // "Disallow:" rong = cho phep tat ca
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$$/, "$").replace(/\*/g, ".*"));
    if (re.test(path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  });
  return best && !best.allow ? { blocked: true, rule: "Disallow: " + best.path } : { blocked: false, rule: best ? "Allow: " + best.path : "" };
}

// ── HTML ────────────────────────────────────────────────────────────────────
const decode = s => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function metaContent(html, name) {
  const re = new RegExp("<meta\\b[^>]*\\bname\\s*=\\s*[\"']" + name + "[\"'][^>]*>", "ig");
  const out = [];
  let m;
  while ((m = re.exec(html))) { const c = m[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i); if (c) out.push(c[1].trim()); }
  return out.join(", ");
}

function analyzeHtml(html, pageUrl, roots) {
  if (typeof roots === "string") roots = new Set([roots]);
  const head = (html.match(/<head\b[\s\S]*?<\/head>/i) || [html.slice(0, 60000)])[0];
  const canonM = head.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i);
  let canonical = "";
  if (canonM) { const h = canonM[0].match(/\bhref\s*=\s*["']([^"']+)["']/i); if (h) { try { canonical = new URL(decode(h[1]), pageUrl).toString(); } catch (e) { canonical = h[1]; } } }
  const title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1]).replace(/\s+/g, " ").trim();
  // vung noi dung chinh: entry-content / article / main -> body
  const bodyM = html.match(/<div[^>]+class=["'][^"']*\bentry-content\b[^"']*["'][\s\S]*/i) || html.match(/<article\b[\s\S]*?<\/article>/i) ||
    html.match(/<main\b[\s\S]*?<\/main>/i) || html.match(/<body\b[\s\S]*<\/body>/i) || [html];
  let main = bodyM[0];
  if (/entry-content/i.test(main.slice(0, 300))) {
    // entry-content khong co the dong ro rang -> cat tai cuoi bai / footer / sidebar / binh luan
    const end = main.slice(20).search(/<\/article>|<footer\b|<aside\b|id=["'](comments|respond)["']/i);
    main = end >= 0 ? main.slice(0, end + 20) : main.slice(0, 400000);
  }
  const text = decode(main.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  const links = new Set();
  const aRe = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let a;
  while ((a = aRe.exec(html))) {
    try {
      const u = new URL(decode(a[1]), pageUrl);
      if (/^https?:$/.test(u.protocol) && inRoots(u.hostname, roots)) links.add(normPath(u.toString()));
    } catch (e) {}
  }
  return {
    title, canonical, words, internalLinks: links.size, linkSet: links,
    metaRobots: metaContent(head, "robots"), metaGooglebot: metaContent(head, "googlebot"),
    schemaTypes: schemaTypes(html),
    h1: (html.match(/<h1\b/gi) || []).length, lang: (html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)/i) || [, ""])[1],
  };
}

// Du lieu co cau truc: @type trong JSON-LD (ke ca @graph) + itemtype microdata
function schemaTypes(html) {
  const types = new Set();
  const walk = o => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    const t = o["@type"];
    (Array.isArray(t) ? t : t ? [t] : []).forEach(x => types.add(String(x)));
    if (o["@graph"]) walk(o["@graph"]);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch (e) { types.add("(JSON-LD lỗi cú pháp)"); }
  }
  for (const m of html.matchAll(/\bitemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)/gi)) types.add(m[1] + " (microdata)");
  return [...types];
}

function normPath(u) {
  try { const x = new URL(u); return (rootOf(x.hostname) + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch (e) { return String(u).toLowerCase(); }
}

// ── Sitemap ─────────────────────────────────────────────────────────────────
async function collectSitemap(startUrls, roots, getAuth) {
  const seenMaps = new Set(), urls = new Set(), used = [];
  const queue = [...startUrls];
  let fetched = 0;
  while (queue.length && fetched < 25 && urls.size < 20000) {
    const sm = queue.shift();
    if (seenMaps.has(sm)) continue;
    seenMaps.add(sm);
    let r;
    try { r = await fetchFollow(sm, roots, getAuth, "application/xml,text/xml,*/*"); } catch (e) { continue; }
    fetched++;
    if (r.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(r.body)) continue;
    used.push(sm);
    const locs = [...r.body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map(m => decode(m[1]));
    if (/<sitemapindex\b/i.test(r.body)) locs.forEach(l => queue.push(l));
    else locs.forEach(l => urls.add(normPath(l)));
  }
  return { used, urls };
}

// ── Link noi bo trong NOI DUNG bai (WP REST, khong can dang nhap) ────────────
async function contentInlinks(base, roots, getAuth) {
  const counts = new Map(); let scanned = 0, ok = false, polluted = false;
  for (const type of ["posts", "pages"]) {
    for (let page = 1; page <= 5; page++) {
      let r;
      try { r = await fetchFollow(`${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_fields=link,content`, roots, getAuth, "application/json"); }
      catch (e) { break; }
      if (r.status !== 200) break;
      if (!/^\s*[\[{]/.test(r.body)) polluted = true;
      const items = parseJsonLoose(r.body);
      if (!Array.isArray(items) || !items.length) break;
      ok = true;
      items.forEach(it => {
        scanned++;
        const self = normPath(it.link);
        const html = (it.content && it.content.rendered) || "";
        const seen = new Set();
        for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
          try { const x = new URL(decode(m[1]), it.link), p = normPath(x.toString()); if (p !== self && inRoots(x.hostname, roots)) seen.add(p); } catch (e) {}
        }
        seen.forEach(p => counts.set(p, (counts.get(p) || 0) + 1));
      });
      if (items.length < 100) break;
    }
  }
  return { ok, scanned, counts, polluted };
}

// ── Chay chan doan ──────────────────────────────────────────────────────────
async function run(input, getLevel1Auth) {
  let domain = String(input.domain || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!domain) throw new Error("Thieu domain");
  const getAuth = h => (getLevel1Auth && (getLevel1Auth(h) || getLevel1Auth(rootOf(h)) || getLevel1Auth(domain))) || null;
  const roots = new Set([rootOf(domain)]);

  // trang chu: theo ca redirect sang domain khac (nhu Googlebot) -> domain dich cung thuoc site
  const home = await fetchFollow(`https://${domain}/`, roots, getAuth, null, true);
  let base = `https://${domain}`, crossDomain = "";
  try {
    const f = new URL(home.final); base = `${f.protocol}//${f.host}`;
    if (!inRoots(f.hostname, roots)) { crossDomain = f.hostname; roots.add(rootOf(f.hostname)); }
  } catch (e) {}
  // host cua link bai (WP co the dat siteurl khac domain dang theo doi) — toi da 3 host
  const linkHosts = new Set();
  (Array.isArray(input.all_links) ? input.all_links : []).concat(input.urls || []).forEach(l => { try { const hn = new URL(l).hostname; if (!net.isIP(hn.replace(/^\[|\]$/g, ""))) linkHosts.add(rootOf(hn)); } catch (e) {} });
  [...linkHosts].slice(0, 3).forEach(h => roots.add(h));
  const sameSite = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && inRoots(x.hostname, roots); } catch (e) { return false; } };
  const samples = (Array.isArray(input.urls) ? input.urls : []).filter(sameSite).slice(0, MAX_SAMPLE);
  const allLinks = (Array.isArray(input.all_links) ? input.all_links : []).filter(sameSite).slice(0, 3000);

  const homeA = home.status === 200 ? analyzeHtml(home.body, home.final, roots) : null;
  const out = {
    domain, base, crossDomain, roots: [...roots], fetchedAt: new Date().toISOString(),
    home: {
      chain: home.chain, status: home.status, ms: home.ms, xRobots: home.headers.get("x-robots-tag") || "",
      title: homeA && homeA.title, canonical: homeA && homeA.canonical, metaRobots: homeA && homeA.metaRobots,
      internalLinks: homeA ? homeA.internalLinks : 0, schemaTypes: homeA ? homeA.schemaTypes : [],
    },
  };

  // robots.txt
  let robots = null;
  try {
    const r = await fetchFollow(`${base}/robots.txt`, roots, getAuth, "text/plain,*/*");
    const txt = r.status === 200 ? r.body.slice(0, 20000) : "";
    robots = { status: r.status, text: txt.slice(0, 2500), parsed: parseRobots(txt) };
  } catch (e) { robots = { status: 0, error: e.message, text: "", parsed: { groups: [], sitemaps: [] } }; }
  out.robots = { status: robots.status, error: robots.error || "", text: robots.text, sitemaps: robots.parsed.sitemaps,
    blocksAll: robotsVerdict(robots.parsed, "/").blocked };

  // sitemap
  const starts = robots.parsed.sitemaps.filter(sameSite);
  if (!starts.length) starts.push(`${base}/sitemap_index.xml`, `${base}/wp-sitemap.xml`, `${base}/sitemap.xml`);
  const sm = await collectSitemap(starts, roots, getAuth);
  const missing = allLinks.filter(l => !sm.urls.has(normPath(l)));
  out.sitemap = { used: sm.used, urlCount: sm.urls.size, checkedLinks: allLinks.length, missingCount: sm.urls.size ? missing.length : null, missingSample: missing.slice(0, 8) };

  // link noi bo trong noi dung
  const inl = await contentInlinks(base, roots, getAuth);
  const orphans = allLinks.filter(l => !(inl.counts.get(normPath(l)) > 0));
  out.inlinks = { ok: inl.ok, polluted: inl.polluted, scannedPosts: inl.scanned, orphanCount: inl.ok ? orphans.length : null, totalLinks: allLinks.length };

  // tung URL mau (song song 4)
  const results = new Array(samples.length);
  let idx = 0;
  async function worker() {
    while (idx < samples.length) {
      const i = idx++, u = samples[i];
      const row = { url: u };
      try {
        const r = await fetchFollow(u, roots, getAuth);
        const a = r.status === 200 ? analyzeHtml(r.body, r.final, roots) : null;
        const path = (() => { try { const x = new URL(u); return x.pathname + x.search; } catch (e) { return "/"; } })();
        Object.assign(row, {
          chain: r.chain.map(c => `${c.status || "×"} ${c.url}`), status: r.status, ms: r.ms, final: r.final,
          xRobots: r.headers.get("x-robots-tag") || "", robotsTxt: robotsVerdict(robots.parsed, path),
          metaRobots: a ? a.metaRobots : "", metaGooglebot: a ? a.metaGooglebot : "", schemaTypes: a ? a.schemaTypes : [],
          canonical: a ? a.canonical : "", canonicalSelf: a ? (!a.canonical || normPath(a.canonical) === normPath(r.final)) : null,
          title: a ? a.title : "", words: a ? a.words : 0, h1: a ? a.h1 : 0, outInternal: a ? a.internalLinks : 0,
          inlinksContent: inl.ok ? (inl.counts.get(normPath(u)) || 0) : null,
          fromHome: homeA ? homeA.linkSet.has(normPath(u)) : null,
          inSitemap: sm.urls.size ? sm.urls.has(normPath(u)) : null,
        });
        // canonical tro sang URL khac -> tai luon URL dich: con song khong, co tu tro ve chinh no khong
        if (a && a.canonical && !row.canonicalSelf && sameSite(a.canonical)) {
          try {
            const c = await fetchFollow(a.canonical, roots, getAuth);
            const ca = c.status === 200 ? analyzeHtml(c.body, c.final, roots) : null;
            row.canonicalTarget = {
              status: c.status, redirected: c.chain.length > 1,
              selfCanonical: ca ? (!ca.canonical || normPath(ca.canonical) === normPath(c.final)) : null,
              inSitemap: sm.urls.size ? sm.urls.has(normPath(a.canonical)) : null,
            };
          } catch (e) { row.canonicalTarget = { error: e.message }; }
        }
      } catch (e) { row.error = e.message; }
      results[i] = row;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  out.samples = results;
  return out;
}

module.exports = { run, parseRobots, robotsVerdict, analyzeHtml };
