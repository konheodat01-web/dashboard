const fs = require("fs");
const path = require("path");

const DIR = process.env.DH_DIR || path.join(__dirname, "..", "data", "domain_hunt");
const WB = process.env.DH_WB || "https://web.archive.org/cdx/search/cdx";
const OPT = { min: 3, max: 0, pages: 2, par: 2, gap: 2500, timeout: 120000, errRetry: 30 * 60000, errMax: 3, failTtl: 48 * 3600000, sweepEvery: 5 * 60000 };
const JUNK = /^(m|mobile|mail\d*|webmail|email|smtp|pop3?|imap|mx\d*|ns\d*|dns\d*|c?panel|spanel|whm|webdisk|cpcalendars|cpcontacts|autodiscover|autoconfig|ftp|sftp|localhost|direct|hostmaster|sitemaps?|mta-sts|_dmarc|webmin|plesk|owa|exchange|lyncdiscover|sip|wildcard|random|notexists.*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PARK = /^(www\d*|ww\d*)$/i;
const APP = /^([a-z]*portal|login|signin|sso|auth|admin|intranet|extranet|vpn|remote|citrix|crm|hrms|hris|erp|ums|lms|sis|[a-z]{0,4}apps?|iboss|docstore|helpdesk|webmail)$/i;
const DOM = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VIEWS = { pass: ["pass"], mine: ["mine"], queue: ["q", "run"], fail: ["fail"], err: ["err"] };
const MAN_ST = ["q", "run", "pass", "fail", "err"];
const MAN_SRC = "nhập thủ công";
const SYS = { used: "Đã sử dụng", past: "Từng dùng" };
const SYS_NAMES = Object.values(SYS);

function inView(it, view) {
  if (view === "man") return !!it.man && MAN_ST.includes(it.st);
  if (it.man && MAN_ST.includes(it.st)) return false;
  return (VIEWS[view] || VIEWS.pass).includes(it.st);
}

const stores = new Map();
const W = { cur: new Set(), pauseUntil: 0, last: null, lastErr: "", started: false, checked: 0 };

const SHARED = "shared";
const key = () => SHARED;
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

const RANK = { mine: 4, pass: 3, q: 2, run: 2, err: 1, fail: 0 };

function better(a, b) {
  const ra = RANK[a.st] == null ? -1 : RANK[a.st], rb = RANK[b.st] == null ? -1 : RANK[b.st];
  if (ra !== rb) return ra > rb ? a : b;
  return Object.keys(a.subs || {}).length >= Object.keys(b.subs || {}).length ? a : b;
}

function migrate() {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== SHARED + ".json"); } catch (e) { return; }
  if (!files.length) return;
  const st = store(SHARED);
  files.forEach((f) => {
    let o = null;
    try { o = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (e) { return; }
    Object.keys(o.items || {}).forEach((d) => {
      const cur = st.s.items[d];
      st.s.items[d] = cur ? better(cur, o.items[d]) : o.items[d];
    });
    ["groups", "statuses"].forEach((fld) => {
      const list = st.s[fld] || (st.s[fld] = []);
      (o[fld] || []).forEach((n) => { if (!list.includes(n)) list.push(n); });
    });
    fs.renameSync(path.join(DIR, f), path.join(DIR, f + ".migrated"));
  });
  save(st, true);
}

function loadAll() {
  migrate();
  store(SHARED);
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

function parse(txt, d, keep) {
  const dom = String(d).toLowerCase();
  const pages = {};
  String(txt || "").split(/\r?\n/).forEach((line) => {
    const m = line.trim().match(/^(?:https?:\/\/)?([^/:?#]+)(?::\d+)?(\/[^?#]*)?/i);
    if (!m) return;
    const h = m[1].toLowerCase().replace(/\.$/, "");
    if (!h.endsWith("." + dom)) return;
    const s = subNorm(h.slice(0, -dom.length - 1));
    if (junk(s) && !(keep && keep.has(s))) return;
    (pages[s] = pages[s] || new Set()).add(String(m[2] || "/").replace(/\/+$/, "").toLowerCase());
  });
  const subs = {};
  Object.keys(pages).forEach((k) => { subs[k] = pages[k].size; });
  return subs;
}

function why(n) {
  return `${n} subdomain có nội dung (cần ${OPT.max ? OPT.min + "–" + OPT.max : "từ " + OPT.min}${OPT.max ? "" : " trở lên"})`;
}

function wantSet(st) {
  return new Set(Array.isArray(st.s.wants) ? st.s.wants : []);
}

function apply(it, subs, keep) {
  const j = judge(subs, keep);
  const inList = new Set(j.list.map((x) => x.s));
  const oth = {};
  Object.entries(subs || {}).filter(([s]) => !inList.has(s)).sort((a, b) => b[1] - a[1]).slice(0, 300).forEach(([s, n]) => { oth[s] = n; });
  it.subs = j.list;
  if (Object.keys(oth).length) it.oth = oth; else delete it.oth;
  if (j.hit.length) it.kw = j.hit; else delete it.kw;
  it.reason = j.pass ? "" : why(j.real.length);
  return j.pass ? "pass" : "fail";
}

function rejudge() {
  const now = Date.now();
  const out = { up: 0, down: 0 };
  for (const st of stores.values()) {
    const keep = wantSet(st);
    let ch = false;
    for (const it of Object.values(st.s.items)) {
      if (!["pass", "fail"].includes(it.st) || !Array.isArray(it.subs) || it.ex) continue;
      const map = Object.assign({}, it.oth || {});
      it.subs.forEach((x) => { map[x.s] = x.n; });
      const before = JSON.stringify([it.subs, it.oth || null, it.kw || null, it.reason || ""]);
      const st2 = apply(it, map, keep);
      if (st2 !== it.st) { if (st2 === "pass") out.up++; else out.down++; it.st = st2; it.chk = now; ch = true; continue; }
      if (JSON.stringify([it.subs, it.oth || null, it.kw || null, it.reason || ""]) !== before) ch = true;
    }
    if (ch) save(st, true);
  }
  return out;
}

function judge(subs, keep) {
  const ent = Object.entries(subs || {});
  const real = ent.filter(([s, n]) => n >= OPT.pages && !junk(subNorm(s))).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ s, n }));
  const hitE = keep && keep.size ? ent.filter(([s, n]) => n >= 1 && keep.has(subNorm(s))) : [];
  const seen = new Set(real.map((x) => x.s));
  const list = real.concat(hitE.filter(([s]) => !seen.has(s)).map(([s, n]) => ({ s, n }))).sort((a, b) => b.n - a.n);
  const hit = [...new Set(hitE.map(([s]) => subNorm(s)))].sort();
  return { real, hit, list, pass: hit.length > 0 || (real.length >= OPT.min && (!OPT.max || real.length <= OPT.max)) };
}

const WANT_RE = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/;

function setWants(space, list) {
  const st = store(space);
  const out = [], bad = [];
  (Array.isArray(list) ? list : []).slice(0, 1000).forEach((x) => {
    const raw = String(x || "").trim();
    if (!raw) return;
    const s = subNorm(raw.toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/^\*\./, "").replace(/\.+$/, ""));
    if (!s || s.length > 120 || !WANT_RE.test(s)) { if (bad.length < 10) bad.push(raw.slice(0, 60)); return; }
    if (!out.includes(s)) out.push(s);
  });
  if (out.length > 200) throw new Error("Tối đa 200 sub mong muốn");
  st.s.wants = out;
  save(st, true);
  const r = rejudge();
  return { wants: out, bad, up: r.up, down: r.down };
}

async function lookup(d, keep) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OPT.timeout);
  try {
    const r = await fetch(wbUrl(d), { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; domain-check)" } });
    if (r.ok) return { subs: parse(await r.text(), d, keep) };
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
      const pri = it.man ? -1 : it.st === "q" ? 0 : 1;
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
    const r = await lookup(it.d, wantSet(st));
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
      it.st = apply(it, r.subs, wantSet(st));
      it.all = Object.keys(r.subs).length;
      W.checked++;
    }
    W.last = { d: it.d, st: it.st, at: it.chk };
    save(st);
    if (it.st === "pass") syncUse(st);
    await sleep(OPT.gap);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sweep() {
  const cut = Date.now() - OPT.failTtl;
  for (const st of stores.values()) {
    let n = 0;
    for (const [d, it] of Object.entries(st.s.items)) {
      if (it.st === "fail" && !it.man && (it.chk || 0) < cut) { (st.s.failed = st.s.failed || {})[d] = it.chk || Date.now(); delete st.s.items[d]; n++; }
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
  for (const st of stores.values()) syncUse(st);
  setInterval(sweep, OPT.sweepEvery);
  for (let i = 0; i < OPT.par; i++) lane();
}

function counts(st) {
  const c = { pass: 0, mine: 0, queue: 0, fail: 0, err: 0, man: 0 };
  Object.values(st.s.items).forEach((it) => {
    for (const v of Object.keys(c)) if (inView(it, v)) c[v]++;
  });
  return c;
}

function state(space, view) {
  const st = store(space);
  const v = view === "man" || VIEWS[view] ? view : "pass";
  const items = Object.values(st.s.items).filter((it) => inView(it, v)).map(({ tries, oth, ...it }) => it);
  const sortKey = v === "mine" ? "take" : v === "man" ? "man" : "chk";
  items.sort((a, b) => v === "queue" ? (a.add || 0) - (b.add || 0) : (b[sortKey] || 0) - (a[sortKey] || 0));
  return {
    counts: counts(st),
    items,
    worker: { cur: [...W.cur].filter((x) => x.startsWith(st.k + "|")).map((x) => x.slice(st.k.length + 1)), busy: W.cur.size, pauseUntil: W.pauseUntil, last: W.last, lastErr: W.lastErr, checked: W.checked },
    labels: { grp: st.s.groups || [], stt: st.s.statuses || [] },
    colors: labelColors(st),
    sys: SYS,
    usage: Object.entries(st.s.usage || {}).map(([a, u]) => ({ a, l: u.l, at: u.at, n: Object.keys(u.hosts || {}).length })),
    opt: { min: OPT.min, max: OPT.max, pages: OPT.pages, failTtl: OPT.failTtl },
    wants: Array.isArray(st.s.wants) ? st.s.wants : [],
    now: Date.now(),
  };
}

function importRows(space, rows, src) {
  const st = store(space);
  let added = 0, dup = 0, bad = 0, failed = 0;
  const now = Date.now();
  const mem = st.s.failed || {};
  (Array.isArray(rows) ? rows : []).slice(0, 50000).forEach((r, i) => {
    const d = norm(r && r.d);
    if (!DOM.test(d)) { bad++; return; }
    const cur = st.s.items[d];
    if (cur) { if (cur.st === "fail") failed++; else dup++; return; }
    if (mem[d]) { failed++; return; }
    st.s.items[d] = { d, st: "q", price: String((r && r.price) || "").slice(0, 20), premium: !!(r && r.premium), src: String(src || "").slice(0, 120), add: now + i };
    added++;
  });
  save(st, true);
  return { added, dup, bad, failed };
}

function importManual(space, domains) {
  const st = store(space);
  const now = Date.now();
  const out = { added: 0, flagged: 0, mine: 0, bad: 0, badList: [] };
  const seen = new Set();
  (Array.isArray(domains) ? domains : []).slice(0, 500).forEach((x, i) => {
    const d = norm(x);
    if (!d) return;
    if (!DOM.test(d)) { out.bad++; if (out.badList.length < 10) out.badList.push(String(x).slice(0, 80)); return; }
    if (seen.has(d)) return;
    seen.add(d);
    const it = st.s.items[d];
    if (!it) {
      st.s.items[d] = { d, st: "q", price: "", premium: false, src: MAN_SRC, add: now + i, man: now };
      out.added++;
    } else if (it.st === "mine") {
      out.mine++;
    } else if (it.st === "del") {
      Object.assign(it, { st: "q", tries: 0, reason: "", add: now + i, man: now, src: MAN_SRC });
      delete it.del;
      out.added++;
    } else {
      it.man = now;
      if (it.st === "err") { it.st = "q"; it.tries = 0; it.reason = ""; it.add = now + i; }
      out.flagged++;
    }
  });
  save(st, true);
  return out;
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
    else if (op === "confirm" && it.man && ["pass", "fail"].includes(it.st)) { it.st = "mine"; it.take = now; delete it.man; delete it.reason; n++; }
    else if (op === "unman" && it.man) {
      if (it.src === MAN_SRC) delete st.s.items[it.d]; else delete it.man;
      n++;
    }
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

const LKEY = { grp: "groups", stt: "statuses" };

function tag(space, field, ds, v) {
  const st = store(space);
  if (!LKEY[field]) return 0;
  const val = String(v || "").trim().slice(0, 60);
  if (val && !(st.s[LKEY[field]] || []).includes(val)) return 0;
  if (field === "stt" && SYS_NAMES.includes(val)) return 0;
  let n = 0;
  (Array.isArray(ds) ? ds : []).forEach((x) => {
    const it = st.s.items[norm(x)];
    if (!it || it.st !== "mine") return;
    if (val) it[field] = val; else delete it[field];
    n++;
  });
  if (n) save(st, true);
  return n;
}

function labelColors(st) {
  const c = st.s.colors = st.s.colors || {};
  c.grp = c.grp || {};
  c.stt = c.stt || {};
  return c;
}

function labels(space, field, op, name, to, color) {
  const st = store(space);
  const k = LKEY[field];
  if (!k) throw new Error("Sai loại nhãn");
  const list = st.s[k] = st.s[k] || [];
  const cols = labelColors(st)[field];
  const a = String(name || "").trim().slice(0, 60);
  const b = String(to || "").trim().slice(0, 60);
  const hex = String(color || "").trim().toLowerCase();
  if (hex && !/^#[0-9a-f]{6}$/.test(hex)) throw new Error("Màu không hợp lệ");
  if (!a) throw new Error("Tên trống");
  if (field === "stt" && (SYS_NAMES.includes(a) || SYS_NAMES.includes(b))) throw new Error("Tên này dành cho trạng thái hệ thống");
  if (op === "add") {
    if (!list.includes(a)) list.push(a);
    if (hex) cols[a] = hex;
  } else if (op === "color") {
    if (!list.includes(a)) throw new Error("Không có nhãn này");
    if (hex) cols[a] = hex; else delete cols[a];
  } else if (op === "del") {
    const i = list.indexOf(a);
    if (i >= 0) list.splice(i, 1);
    delete cols[a];
    Object.values(st.s.items).forEach((it) => { if (it[field] === a) delete it[field]; });
  } else if (op === "ren") {
    if (!b) throw new Error("Tên mới trống");
    if (list.includes(b) && b !== a) throw new Error("Tên này đã có");
    const i = list.indexOf(a);
    if (i < 0) throw new Error("Không có nhãn này");
    list[i] = b;
    if (cols[a] && b !== a) { cols[b] = cols[a]; delete cols[a]; }
    Object.values(st.s.items).forEach((it) => { if (it[field] === a) it[field] = b; });
  } else throw new Error("Sai thao tác");
  save(st, true);
  return list;
}

function hostOf(x) {
  return norm(x).replace(/:\d+$/, "");
}

function matchHost(st, h) {
  const parts = h.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const it = st.s.items[parts.slice(i).join(".")];
    if (it) return { it, s: i ? subNorm(parts.slice(0, i).join(".")) : "" };
  }
  return null;
}

function syncUse(st) {
  const now = Date.now();
  const want = new Map();
  for (const [a, u] of Object.entries(st.s.usage || {})) {
    for (const [h, v] of Object.entries(u.hosts || {})) {
      const m = matchHost(st, h);
      if (!m) continue;
      const bySub = want.get(m.it.d) || new Map();
      want.set(m.it.d, bySub);
      const byAcc = bySub.get(m.s) || new Map();
      bySub.set(m.s, byAcc);
      if (!byAcc.has(a)) byAcc.set(a, { l: u.l || a, r: v.r || "", b: v.b || "", h, p: v.p ? 1 : 0 });
    }
  }
  const out = { used: 0, freed: 0, dropped: 0, cancelled: 0 };
  let ch = false;
  for (const it of Object.values(st.s.items)) {
    const w = want.get(it.d);
    const done = w && [...w.entries()].find(([, acc]) => [...acc.values()].some((x) => !x.p));
    if (it.st === "pass" && done) {
      const x = [...done[1].values()].find((v) => !v.p);
      it.st = "del"; it.del = now; it.delWhy = `đã dùng 301: ${x.h} · ${x.l} · ${x.b || x.r}`;
      out.dropped++; ch = true;
      continue;
    }
    if (it.st !== "mine") continue;
    const use = it.use || {};
    const keys = new Set([...Object.keys(use), ...(w ? w.keys() : [])]);
    for (const s of keys) {
      const u = use[s] || { cur: [], past: [] };
      const ws = (w && w.get(s)) || new Map();
      const keep = [];
      for (const c of u.cur) {
        const x = ws.get(c.a);
        if (x && x.r === c.r && !keep.some((k) => k.a === c.a)) {
          if (x.l !== c.l || x.b !== c.b) { c.l = x.l; c.b = x.b; ch = true; }
          if (!x.p && c.p) { delete c.p; ch = true; }
          if (x.p && !c.p) { c.p = 1; ch = true; }
          keep.push(c);
        } else if (c.p) { out.cancelled++; ch = true; }
        else { u.past.push(Object.assign({}, c, { t: now })); out.freed++; ch = true; }
      }
      for (const [a, x] of ws) if (!keep.some((c) => c.a === a)) { keep.push(Object.assign({ a, l: x.l, r: x.r, b: x.b, f: now }, x.p ? { p: 1 } : {})); out.used++; ch = true; }
      u.cur = keep;
      if (u.past.length > 50) u.past = u.past.slice(-50);
      if (u.cur.length || u.past.length) use[s] = u; else delete use[s];
    }
    if (Object.keys(use).length) it.use = use; else delete it.use;
  }
  if (ch) save(st, true);
  return out;
}

function acctOf(auth) {
  const sp = (auth && auth.space) || "";
  const staff = !!(auth && auth.member && auth.member !== "admin");
  let l = "";
  if (staff) l = "Nhân viên " + auth.member;
  else if (sp) { try { l = (require("./ntauth").SPACES[sp].emails || [])[0] || sp; } catch (e) { l = sp; } }
  else l = (auth && auth.email) || "Admin chính";
  return { a: (sp || "main") + (staff ? ":staff" : ""), l };
}

function reportUse(space, auth, list) {
  const st = store(space);
  const { a, l } = acctOf(auth);
  const hosts = {};
  (Array.isArray(list) ? list : []).slice(0, 5000).forEach((x) => {
    const h = hostOf(x && x.h);
    if (!DOM.test(h) || hosts[h]) return;
    hosts[h] = { r: hostOf(x.r).slice(0, 253), b: String((x && x.b) || "").slice(0, 120) };
    if (x.p) hosts[h].p = 1;
  });
  const U = st.s.usage = st.s.usage || {};
  U[a] = { l, at: Date.now(), hosts };
  save(st, true);
  return Object.assign({ acct: a, label: l, hosts: Object.keys(hosts).length }, syncUse(st));
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
    if (url === "/api/domain-hunt/manual") { const r = importManual(space, body.domains); syncUse(store(space)); return json(200, r); }
    if (url === "/api/domain-hunt/tag") return json(200, { n: tag(space, body.field, body.ds, body.v) });
    if (url === "/api/domain-hunt/labels") { const list = labels(space, body.field, body.op, body.name, body.to, body.color); return json(200, { list, colors: labelColors(store(space)) }); }
    if (url === "/api/domain-hunt/delsub") return json(200, { n: delSubs(space, body.pairs) });
    if (url === "/api/domain-hunt/wants") return json(200, setWants(space, body.list));
    if (url === "/api/domain-hunt/usage") return json(200, reportUse(space, req.ntAuth, body.hosts));
    const op = url.slice("/api/domain-hunt/".length);
    if (["take", "untake", "recheck", "del", "except", "confirm", "unman"].includes(op)) { const n = act(space, op, body.ds); syncUse(store(space)); return json(200, { n }); }
    return json(404, { error: "Không có API này" });
  } catch (e) {
    return json(500, { error: e.message });
  }
}

module.exports = { start, state, importRows, importManual, act, handle, parse, judge, wbUrl, norm, setWants, rejudge, reportUse, syncUse, labels, tag, SYS, OPT };
