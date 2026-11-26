const fs = require("fs");
const path = require("path");

let FILE = path.join(__dirname, "..", "track_hosts.json");
let db = null;

function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { db = {}; }
  if (!db || typeof db !== "object" || Array.isArray(db)) db = {};
  return db;
}

function save() {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

const hostOf = (u) => String(u || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.+$/, "").replace(/^www\./, "");
const DOM = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

function acctOf(auth) {
  const sp = (auth && auth.space) || "";
  const staff = !!(auth && auth.member && auth.member !== "admin");
  let l = "";
  if (staff) l = "Nhân viên " + auth.member;
  else if (sp) { try { l = (require("./ntauth").SPACES[sp].emails || [])[0] || sp; } catch (e) { l = sp; } }
  else l = (auth && auth.email) || "Admin chính";
  return { a: (sp || "main") + (staff ? ":staff:" + auth.member : ""), l };
}

function report(auth, list) {
  const { a, l } = acctOf(auth);
  const hosts = {};
  (Array.isArray(list) ? list : []).slice(0, 20000).forEach((x) => {
    const h = hostOf(x && x.h);
    if (!DOM.test(h) || hosts[h]) return;
    hosts[h] = { b: str(x.b, 120), st: str(x.st, 60), k: ["goc", "301", "dich"].includes(x.k) ? x.k : "goc", r: hostOf(x.r).slice(0, 253) };
  });
  load()[a] = { l, at: Date.now(), hosts };
  save();
  return { acct: a, label: l, n: Object.keys(hosts).length };
}

function list() {
  const d = load();
  const hosts = {};
  const accts = [];
  for (const [a, v] of Object.entries(d)) {
    accts.push({ a, l: v.l, at: v.at || 0, n: Object.keys(v.hosts || {}).length });
    for (const [h, x] of Object.entries(v.hosts || {})) (hosts[h] = hosts[h] || []).push(Object.assign({}, x, { l: v.l }));
  }
  return { at: accts.reduce((m, x) => Math.max(m, x.at), 0), accts, hosts };
}

async function handle(req, res, url, readBody, key) {
  const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  try {
    if (url === "/api/gamc/track-hosts") {
      const q = new URL(req.url, "http://x").searchParams;
      if (!key || q.get("key") !== key) return json(401, { error: "Sai access key" });
      if (req.method !== "GET") return json(405, { error: "GET" });
      return json(200, list());
    }
    if (url === "/api/track-hosts" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      return json(200, report(req.ntAuth, body.hosts));
    }
    return json(404, { error: "không có" });
  } catch (e) {
    return json(500, { error: String(e.message || e) });
  }
}

module.exports = { handle, report, list, hostOf, _file: (f) => { FILE = f; db = null; } };
