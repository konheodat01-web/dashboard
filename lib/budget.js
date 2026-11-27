const fs = require("fs");
const path = require("path");

const DIR = process.env.BUD_DIR || path.join(__dirname, "..", "data", "budget");
const FX_API = process.env.BUD_FX || "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const TYPES = ["entity", "guestpost", "backlink", "blogcmt", "textlink"];
const STS = ["doing", "fix", "done"];
const MINV = 150000, DEF = 10000000, TTL = 60000;
const DAY = /^\d{4}-\d{2}-\d{2}$/, MON = /^\d{4}-\d{2}$/;

const stores = new Map();

function acctOf(auth) {
  return require("./domain_hunt").acctOf(auth);
}

const fileOf = (a) => path.join(DIR, a.replace(/[^a-z0-9_-]/gi, "_") + ".json");

function store(auth) {
  const { a } = acctOf(auth);
  if (stores.has(a)) return stores.get(a);
  let s = {};
  try { s = JSON.parse(fs.readFileSync(fileOf(a), "utf8")); } catch (e) {}
  if (!Array.isArray(s.orders)) s.orders = [];
  if (!s.plans || typeof s.plans !== "object") s.plans = {};
  let mig = false;
  s.orders.forEach((o) => {
    if (!("ncc" in o)) { o.ncc = String(o.note || "").trim().slice(0, 120); o.note = ""; mig = true; }
    if (!STS.includes(o.st)) { o.st = "doing"; mig = true; }
  });
  const st = { a, s };
  if (mig) save(st);
  stores.set(a, st);
  return st;
}

function save(st) {
  fs.mkdirSync(DIR, { recursive: true });
  const f = fileOf(st.a), tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(st.s));
  fs.renameSync(tmp, f);
}

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * Math.pow(10, d)) / Math.pow(10, d) : 0; };
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

function cleanOrder(o, old, by) {
  const type = TYPES.includes(o.type) ? o.type : "";
  if (!type) throw new Error("Loại đơn không hợp lệ");
  const date = str(o.date, 10);
  if (!DAY.test(date)) throw new Error("Ngày đơn không hợp lệ");
  const wid = Number(o.wid);
  if (!wid) throw new Error("Chưa chọn web nhận dịch vụ");
  const vnd = num(o.vnd, 0), usdt = num(o.usdt, 2), rate = num(o.rate, 2);
  if (!(vnd > 0) || !(usdt > 0) || !(rate > 0)) throw new Error("Thiếu số tiền hoặc tỷ giá");
  const out = { id: old ? old.id : 0, type, date, wid, wurl: str(o.wurl, 253), vnd, usdt, rate, cur: o.cur === "usdt" ? "usdt" : "vnd", ncc: str(o.ncc, 120), note: str(o.note, 500) };
  const sv = STS.includes(o.st) ? o.st : (old && old.st) || "doing";
  const why = str(o.stWhy, 500);
  if (sv === "fix" && !why) throw new Error("Trạng thái Đang chỉnh sửa cần nhập lý do");
  out.st = sv;
  if (sv === "fix") out.stWhy = why;
  out.stLog = (old && Array.isArray(old.stLog) ? old.stLog : []).slice(-50);
  if (!old || old.st !== sv || (sv === "fix" && old.stWhy !== why)) out.stLog.push(Object.assign({ st: sv, at: Date.now(), by }, sv === "fix" ? { why } : {}));
  if (type === "textlink") {
    const from = str(o.from, 10), to = str(o.to, 10);
    if (!DAY.test(from) || !DAY.test(to)) throw new Error("Text link cần Từ ngày và Đến ngày");
    if (to < from) throw new Error("Đến ngày phải sau Từ ngày");
    out.from = from;
    out.to = to;
    const rn = Number(o.renewOf) || (old && old.renewOf) || 0;
    if (rn) out.renewOf = rn;
  }
  if (old && old.split) out.split = old.split;
  out.at = old ? old.at : Date.now();
  out.by = old ? old.by : by;
  if (old) { out.upd = Date.now(); out.updBy = by; }
  return out;
}

function saveOrder(auth, o) {
  const st = store(auth);
  const by = acctOf(auth).l;
  const id = Number(o && o.id) || 0;
  const i = id ? st.s.orders.findIndex((x) => x.id === id) : -1;
  if (id && i < 0) throw new Error("Không thấy đơn này");
  const rec = cleanOrder(o || {}, i >= 0 ? st.s.orders[i] : null, by);
  if (rec.renewOf && !st.s.orders.some((x) => x.id === rec.renewOf && x.type === "textlink")) throw new Error("Không thấy đơn text link được gia hạn");
  if (i >= 0) st.s.orders[i] = rec;
  else {
    rec.id = Math.max(Date.now(), ...st.s.orders.map((x) => x.id + 1));
    st.s.orders.push(rec);
  }
  save(st);
  return { order: rec };
}

function saveMany(auth, list) {
  if (!Array.isArray(list) || list.length < 2 || list.length > 300) throw new Error("Danh sách đơn tách không hợp lệ");
  const st = store(auth);
  const by = acctOf(auth).l;
  const recs = list.map((o, i) => {
    if (o && o.id) throw new Error("Đơn tách phải là đơn mới");
    try { return cleanOrder(o || {}, null, by); } catch (e) { throw new Error("Web thứ " + (i + 1) + ": " + e.message); }
  });
  if (new Set(recs.map((r) => r.wid)).size !== recs.length) throw new Error("Danh sách có web trùng nhau");
  const sid = Date.now();
  const tv = recs.reduce((a, r) => a + r.vnd, 0), tu = Math.round(recs.reduce((a, r) => a + r.usdt, 0) * 100) / 100;
  let id = Math.max(Date.now(), ...st.s.orders.map((x) => x.id + 1));
  recs.forEach((r, i) => {
    r.id = id++;
    r.split = { id: sid, n: recs.length, i: i + 1, tv, tu };
    st.s.orders.push(r);
  });
  save(st);
  return { orders: recs };
}

function setSt(auth, b) {
  const st = store(auth);
  const o = st.s.orders.find((x) => x.id === Number(b && b.id));
  if (!o) throw new Error("Không thấy đơn này");
  const sv = STS.includes(b.st) ? b.st : "";
  if (!sv) throw new Error("Trạng thái không hợp lệ");
  const why = str(b.why, 500);
  if (sv === "fix" && !why) throw new Error("Trạng thái Đang chỉnh sửa cần nhập lý do");
  const by = acctOf(auth).l;
  if (o.st === sv && (sv !== "fix" || o.stWhy === why)) return { order: o };
  o.st = sv;
  if (sv === "fix") o.stWhy = why; else delete o.stWhy;
  o.stLog = (Array.isArray(o.stLog) ? o.stLog : []).slice(-50);
  o.stLog.push(Object.assign({ st: sv, at: Date.now(), by }, sv === "fix" ? { why } : {}));
  save(st);
  return { order: o };
}

function delOrder(auth, id) {
  const st = store(auth);
  const n = st.s.orders.length;
  st.s.orders = st.s.orders.filter((x) => x.id !== Number(id));
  if (st.s.orders.length === n) throw new Error("Không thấy đơn này");
  st.s.orders.forEach((x) => { if (x.renewOf === Number(id)) delete x.renewOf; });
  save(st);
  return { ok: 1 };
}

function setPlan(auth, b) {
  const st = store(auth);
  const m = str(b && b.month, 7);
  if (!MON.test(m)) throw new Error("Tháng không hợp lệ");
  const mode = b.mode === "site" ? "site" : "total";
  const p = { mode, at: Date.now(), by: acctOf(auth).l };
  if (mode === "total") {
    p.total = Math.max(0, num(b.total, 0));
    if (!p.total) { delete st.s.plans[m]; save(st); return { plan: null }; }
  } else {
    p.sites = {};
    Object.entries((b && b.sites) || {}).slice(0, 2000).forEach(([k, v]) => { const n = Math.max(0, num(v, 0)); if (Number(k) && n) p.sites[Number(k)] = n; });
    if (!Object.keys(p.sites).length) { delete st.s.plans[m]; save(st); return { plan: null }; }
  }
  st.s.plans[m] = p;
  save(st);
  return { plan: p };
}

function state(auth) {
  const st = store(auth);
  return { me: st.a, orders: st.s.orders, plans: st.s.plans, now: Date.now() };
}

const fxCache = new Map();
async function quote(side, amt) {
  const a = Math.max(MINV, Math.round((amt || DEF) / 1000) * 1000);
  const key = side + "|" + a, hit = fxCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const r = await fetch(FX_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset: "USDT", fiat: "VND", tradeType: side, page: 1, rows: 10, payTypes: [], publisherType: null, transAmount: String(a) }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.code !== "000000" || !Array.isArray(d.data)) throw new Error("Không lấy được tỷ giá Binance P2P (" + (d.message || r.status) + ")");
  const ads = d.data.map((x) => ({ price: +x.adv.price, min: +x.adv.minSingleTransAmount, max: +(x.adv.dynamicMaxSingleTransAmount || x.adv.maxSingleTransAmount) })).filter((x) => x.price > 0 && x.min <= a && a <= x.max);
  const q = { side, amt: a, at: Date.now(), price: ads.length ? ads[0].price : 0 };
  fxCache.set(key, q);
  return q;
}

async function fx(q) {
  const from = q.get("from") === "usdt" ? "usdt" : "vnd";
  const v = Number(q.get("v")) || 0;
  if (from === "vnd") {
    const r = await quote("BUY", v || DEF);
    if (!r.price) throw new Error("Không có quảng cáo P2P nào nhận lệnh " + Math.round(r.amt).toLocaleString("vi-VN") + " VND");
    return { from, rate: r.price, side: "BUY", vnd: v, usdt: v ? Math.round(v / r.price * 100) / 100 : 0, at: r.at };
  }
  const ref = await quote("SELL", DEF);
  const r = await quote("SELL", (v || 1) * (ref.price || 26000));
  if (!r.price) throw new Error("Không có quảng cáo P2P nào nhận lệnh này");
  return { from, rate: r.price, side: "SELL", usdt: v, vnd: v ? Math.round(v * r.price) : 0, at: r.at };
}

async function handle(req, res, url, readBody) {
  const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  try {
    const auth = req.ntAuth;
    if (req.method === "GET" && url === "/api/budget/state") return json(200, state(auth));
    if (req.method === "GET" && url === "/api/budget/fx") return json(200, await fx(new URL(req.url, "http://x").searchParams));
    if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
    const body = JSON.parse((await readBody(req)) || "{}");
    if (url === "/api/budget/order") return json(200, saveOrder(auth, body.order));
    if (url === "/api/budget/order-del") return json(200, delOrder(auth, body.id));
    if (url === "/api/budget/orders") return json(200, saveMany(auth, body.orders));
    if (url === "/api/budget/order-st") return json(200, setSt(auth, body));
    if (url === "/api/budget/plan") return json(200, setPlan(auth, body));
    return json(404, { error: "Không có API này" });
  } catch (e) {
    return json(500, { error: e.message });
  }
}

module.exports = { handle, state, saveOrder, saveMany, delOrder, setSt, setPlan, fx, store, TYPES, STS };
