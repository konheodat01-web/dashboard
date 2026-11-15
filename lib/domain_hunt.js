const fs = require("fs");
const path = require("path");

const DIR = process.env.DH_DIR || path.join(__dirname, "..", "data", "domain_hunt");
const WB = process.env.DH_WB || "https://web.archive.org/cdx/search/cdx";
const OPT = { min: 3, max: 0, pages: 2, par: 2, gap: 2500, timeout: 120000, errRetry: 30 * 60000, errMax: 3, failTtl: 24 * 3600000, sweepEvery: 5 * 60000 };
const JUNK = /^(m|mobile|mail\d*|webmail|email|smtp|pop3?|imap|mx\d*|ns\d*|dns\d*|c?panel|spanel|whm|webdisk|cpcalendars|cpcontacts|autodiscover|autoconfig|ftp|sftp|localhost|direct|hostmaster|sitemaps?|mta-sts|_dmarc|webmin|plesk|owa|exchange|lyncdiscover|sip|wildcard|random|notexists.*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PARK = /^(www\d*|ww\d*)$/i;
const APP = /^([a-z]*portal|login|signin|sso|auth|admin|intranet|extranet|vpn|remote|citrix|crm|hrms|hris|erp|ums|lms|sis|[a-z]{0,4}apps?|iboss|docstore|helpdesk|webmail)$/i;
const DOM = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VIEWS = { pass: ["pass"], mine: ["mine"], queue: ["q", "run"], fail: ["fail"], err: ["err"] };

const stores = new Map();
const W = { cur: new Set(), pauseUntil: 0, last: null, lastErr: "", started: false, checked: 0 };

const key = (space) => (String(space || "").replace(/[^a-z0-9_-]/gi, "") || "main");
const file = (k) => path.join(DIR, k + ".json");

function store(space) {
  const k = key(space);
  if (stores.has(k)) return stores.get(k);
  let s = { items: {} };
  try { s = JSON.parse(fs.readFileSync(file(k), "utf8")); } catch (e) {}
  if (!s.items) s.items = {};
  const st = { k, s, t: null };
  stores.set(k, st);
  return st;
}

function save(st, now) {
  const write = () => {
    st.t = null;
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = file(st.k) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(st.s));
    fs.renameSync(tmp, file(st.k));
  };
  if (now) { if (st.t) clearTimeout(st.t); write(); return; }
  if (!st.t) st.t = setTimeout(write, 1500);
}

function loadAll() {
  try { fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).forEach((f) => store(f.slice(0, -5))); } catch (e) {}
  for (const st of stores.values()) {
    let ch = false;
    Object.values(st.s.items).forEach((it) => { if (it.st === "run") { it.st = "q"; ch = true; } });
    if (ch) save(st, true);
  }
}

function norm(d) {
  return String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "").replace(/^www\./, "");
}

function wbUrl(d) {
  const esc = d.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const q = new URLSearchParams();
  q.append("url", d);
  q.append("matchType", "domain");
  q.append("fl", "original");
  q.append("filter", "statuscode:200");
  q.append("filter", "mimetype:text/html");
  q.append("filter", `!original:^(https?://)?(www\\.)?${esc}(:\\d+)?([/?#].*)?$`);
  q.append("collapse", "urlkey");
  q.append("limit", "20000");
  return WB + "?" + q.toString();
}

function subNorm(sub) {
  const parts = String(sub || "").toLowerCase().split(".").filter(Boolean);
  while (parts.length && PARK.test(parts[0])) parts.shift();
  return parts.join(".");
}

function junk(s) {
  const lab = String(s || "").split(".")[0];
  const base = lab.replace(/[-_]?\d+$/, "");
  return !s || JUNK.test(s) || JUNK.test(lab) || APP.test(lab) || APP.test(base) || JUNK.test(base);
}

function parse(txt, d) {
  const dom = String(d).toLowerCase();
  const pages = {};
  String(txt || "").split(/\r?\n/).forEach((line) => {
    const m = line.trim().match(/^(?:https?:\/\/)?([^/:?#]+)(?::\d+)?(\/[^?#]*)?/i);
    if (!m) return;
    const h = m[1].toLowerCase().replace(/\.$/, "");
    if (!h.endsWith("." + dom)) return;
    const s = subNorm(h.slice(0, -dom.length - 1));
    if (junk(s)) return;
    (pages[s] = pages[s] || new Set()).add(String(m[2] || "/").replace(/\/+$/, "").toLowerCase());
  });
  const subs = {};
  Object.keys(pages).forEach((k) => { subs[k] = pages[k].size; });
  return subs;
}

function why(n) {
  return `${n} subdomain có nội dung (cần ${OPT.max ? OPT.min + "–" + OPT.max : "từ " + OPT.min}${OPT.max ? "" : " trở lên"})`;
}

function rejudge() {
  const now = Date.now();
  for (const st of stores.values()) {
    let ch = false;
    for (const it of Object.values(st.s.items)) {
      if (!["pass", "fail"].includes(it.st) || !Array.isArray(it.subs) || it.ex) continue;
      const map = {};
      it.subs.forEach((x) => { map[x.s] = x.n; });
      const j = judge(map);
      const st2 = j.pass ? "pass" : "fail";
      const r2 = j.pass ? "" : why(j.real.length);
      if (st2 === it.st && r2 === (it.reason || "") && j.real.length === it.subs.length) continue;
      it.subs = j.real;
      it.reason = r2;
      if (st2 !== it.st) { it.st = st2; it.chk = now; }
      ch = true;
    }
    if (ch) save(st, true);
  }
}

function judge(subs) {
  const real = Object.entries(subs || {}).filter(([s, n]) => n >= OPT.pages && !junk(subNorm(s))).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ s, n }));
  return { real, pass: real.length >= OPT.min && (!OPT.max || real.length <= OPT.max) };
}

async function lookup(d) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OPT.timeout);
  try {
    const r = await fetch(wbUrl(d), { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; domain-check)" } });
    if (r.ok) return { subs: parse(await r.text(), d) };
    return { err: "Wayback báo HTTP " + r.status, slow: r.status === 429 || r.status >= 500 };
  } catch (e) {
    return { err: ctrl.signal.aborted ? "Wayback quá 120 giây không trả lời" : "không kết nối được Wayback", slow: true };
  } finally { clearTimeout(timer); }
}

function pick() {
  const now = Date.now();
  let best = null;
  for (const st of stores.values()) {
    for (const it of Object.values(st.s.items)) {
      if (W.cur.has(st.k + "|" + it.d)) continue;
      const ok = it.st === "q" || (it.st === "err" && (it.tries || 0) < OPT.errMax && now - (it.chk || 0) > OPT.errRetry);
      if (!ok) continue;
      const pri = it.st === "q" ? 0 : 1;
      if (!best || pri < best.pri || (pri === best.pri && (it.add || 0) < (best.it.add || 0))) best = { st, it, pri };
    }
  }
  return best;
}

let slowN = 0;
async function lane() {
  for (;;) {
    const wait = W.pauseUntil - Date.now();
    if (wait > 0) { await sleep(Math.min(wait, 30000)); continue; }
    const p = pick();
    if (!p) { await sleep(5000); continue; }
    const { st, it } = p;
    const id = st.k + "|" + it.d;
    W.cur.add(id);
    it.st = "run";
    save(st);
    const r = await lookup(it.d);
    W.cur.delete(id);
    const cur = st.s.items[it.d];
    if (!cur || cur !== it || it.st !== "run") { await sleep(OPT.gap); continue; }
    it.chk = Date.now();
    it.tries = (it.tries || 0) + 1;
    if (r.err) {
      it.st = "err";
      it.reason = r.err;
      W.lastErr = it.d + ": " + r.err;
      if (r.slow) { slowN = Math.min(slowN + 1, 6); W.pauseUntil = Date.now() + 30000 * Math.pow(2, slowN - 1); }
    } else {
      slowN = 0;
      const j = judge(r.subs);
      it.subs = j.real;
      it.all = Object.keys(r.subs).length;
      it.st = j.pass ? "pass" : "fail";
      it.reason = j.pass ? "" : why(j.real.length);
      W.checked++;
    }
    W.last = { d: it.d, st: it.st, at: it.chk };
    save(st);
    await sleep(OPT.gap);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sweep() {
  const cut = Date.now() - OPT.failTtl;
  for (const st of stores.values()) {
    let n = 0;
    for (const [d, it] of Object.entries(st.s.items)) {
      if (it.st === "fail" && (it.chk || 0) < cut) { delete st.s.items[d]; n++; }
    }
    if (n) save(st, true);
  }
}

function start() {
  if (W.started) return;
  W.started = true;
  loadAll();
  rejudge();
  sweep();
  setInterval(sweep, OPT.sweepEvery);
  for (let i = 0; i < OPT.par; i++) lane();
}

function counts(st) {
  const c = { pass: 0, mine: 0, queue: 0, fail: 0, err: 0 };
  Object.values(st.s.items).forEach((it) => {
    for (const [v, arr] of Object.entries(VIEWS)) if (arr.includes(it.st)) c[v]++;
  });
  return c;
}

function state(space, view) {
  const st = store(space);
  const want = VIEWS[view] || VIEWS.pass;
  const items = Object.values(st.s.items).filter((it) => want.includes(it.st)).map(({ tries, ...it }) => it);
  const sortKey = view === "mine" ? "take" : view === "queue" ? "add" : "chk";
  items.sort((a, b) => view === "queue" ? (a.add || 0) - (b.add || 0) : (b[sortKey] || 0) - (a[sortKey] || 0));
  return {
    counts: counts(st),
    items,
    worker: { cur: [...W.cur].filter((x) => x.startsWith(st.k + "|")).map((x) => x.slice(st.k.length + 1)), busy: W.cur.size, pauseUntil: W.pauseUntil, last: W.last, lastErr: W.lastErr, checked: W.checked },
    opt: { min: OPT.min, max: OPT.max, pages: OPT.pages, failTtl: OPT.failTtl },
    now: Date.now(),
  };
}

function importRows(space, rows, src) {
  const st = store(space);
  let added = 0, dup = 0, bad = 0;
  const now = Date.now();
  (Array.isArray(rows) ? rows : []).slice(0, 50000).forEach((r, i) => {
    const d = norm(r && r.d);
    if (!DOM.test(d)) { bad++; return; }
    if (st.s.items[d]) { dup++; return; }
    st.s.items[d] = { d, st: "q", price: String((r && r.price) || "").slice(0, 20), premium: !!(r && r.premium), src: String(src || "").slice(0, 120), add: now + i };
    added++;
  });
  save(st, true);
  return { added, dup, bad };
}

function act(space, op, ds) {
  const st = store(space);
  const now = Date.now();
  let n = 0;
  (Array.isArray(ds) ? ds : []).forEach((x) => {
    const it = st.s.items[norm(x)];
    if (!it) return;
    if (op === "take" && it.st === "pass") { it.st = "mine"; it.take = now; n++; }
    else if (op === "except" && it.st === "fail") { it.st = "pass"; it.ex = now; n++; }
    else if (op === "untake" && it.st === "mine") { it.st = "pass"; delete it.take; n++; }
    else if (op === "recheck" && ["fail", "err", "pass"].includes(it.st)) { it.st = "q"; it.tries = 0; it.reason = ""; it.add = now; n++; }
    else if (op === "del" && it.st !== "del") { it.st = "del"; it.del = now; delete it.subs; n++; }
  });
  save(st, true);
  return n;
}

function delSubs(space, pairs) {
  const st = store(space);
  let n = 0;
  (Array.isArray(pairs) ? pairs : []).forEach((p) => {
    const it = st.s.items[norm(p && p.d)];
    if (!it || it.st !== "mine" || !Array.isArray(it.subs)) return;
    const before = it.subs.length;
    it.subs = it.subs.filter((x) => x.s !== String(p.s || ""));
    n += before - it.subs.length;
  });
  if (n) save(st, true);
  return n;
}

async function handle(req, res, url, space, readBody) {
  const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === "GET" && url === "/api/domain-hunt/state") {
      const q = new URL(req.url, "http://x").searchParams;
      return json(200, state(space, q.get("view") || "pass"));
    }
    if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
    const body = JSON.parse((await readBody(req)) || "{}");
    if (url === "/api/domain-hunt/import") return json(200, importRows(space, body.rows, body.src));
    if (url === "/api/domain-hunt/delsub") return json(200, { n: delSubs(space, body.pairs) });
    const op = url.slice("/api/domain-hunt/".length);
    if (["take", "untake", "recheck", "del", "except"].includes(op)) return json(200, { n: act(space, op, body.ds) });
    return json(404, { error: "Không có API này" });
  } catch (e) {
    return json(500, { error: e.message });
  }
}

module.exports = { start, state, importRows, act, handle, parse, judge, wbUrl, norm, OPT };
