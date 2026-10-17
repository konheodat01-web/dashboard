const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const tls = require("tls");
const { execFile } = require("child_process");

const DATA_DIR = path.join(__dirname, "..", "data", "hub");
const LAYOUT_FILE = path.join(DATA_DIR, "layout.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const SW_DIR = process.env.HUB_SW_DIR || "/root/seo-writer-tool";
const KEEP_DAYS = 30;
const LOG_PER_NODE = 300;

const DOMAINS = [
  { host: "nthieucloud.shop", ok: [200] },
  { host: "seo-writer-tool.nthieucloud.shop", ok: [200] },
  { host: "api.nthieucloud.shop", ok: [200, 404] },
  { host: "gsc-bulk-tool.nthieucloud.shop", ok: [200] },
  { host: "finance-tracker.nthieucloud.shop", ok: [200, 301, 302] },
];

const DEFS = [
  { id: "fail2ban", kind: "Bảo vệ", name: "Fail2ban", x: 30, y: 120, desc: "Bảo vệ VPS khỏi bị dò mật khẩu: IP nào đăng nhập SSH sai nhiều lần sẽ bị khoá tạm thời." },
  { id: "vps", kind: "Máy chủ", name: "VPS 103.82.195.87", x: 30, y: 315, desc: "Máy chủ 103.82.195.87 chạy toàn bộ tool (1 nhân CPU, 1 GB RAM). Đo CPU, RAM, ổ cứng mỗi 30 giây; bấm vào để xem biểu đồ." },
  { id: "cron", kind: "Lịch chạy", name: "Cron", x: 30, y: 670, desc: "Bộ hẹn giờ của VPS. Mỗi giờ gọi Autopilot một lần để xem đã tới giờ viết bài chưa." },
  { id: "caddy", kind: "Proxy · SSL", name: "Caddy", x: 300, y: 315, desc: "Cổng vào của mọi tên miền *.nthieucloud.shop: nhận truy cập, tự cấp và gia hạn SSL (https), rồi chuyển vào đúng tool phía sau. Kiểm tra 5 tên miền mỗi phút." },
  { id: "dash", kind: "PM2", name: "Dashboard", x: 570, y: 60, desc: "Dashboard nthieucloud.shop: quản lý website, công việc, Theo dõi web, Chuyên gia SEO. Bản đồ này cũng chạy bên trong nó." },
  { id: "fin", kind: "GitHub Pages", name: "Quản lý tài chính", x: 570, y: 220, desc: "App quản lý hoá đơn và tài chính (finance-tracker.nthieucloud.shop): trang tĩnh trên GitHub Pages, đi qua Caddy, dữ liệu lưu trên Firebase. Dashboard nhúng nó ở tab Tài chính." },
  { id: "gscapi", kind: "PM2", name: "GSC Bulk API", x: 570, y: 380, desc: "Backend của GSC Bulk Tool: điều khiển Chrome trên VPS (kèm proxy, hồ sơ cookie) để thao tác Google Search Console hàng loạt và check index." },
  { id: "sw", kind: "systemd", name: "SEO Writer API", x: 570, y: 570, desc: "SEO Writer: viết bài SEO bằng AI và đăng lên WordPress. Đây cũng là nơi chạy Chuyên gia SEO, Autopilot và giao việc cho tiện ích Chrome." },
  { id: "ap", kind: "Tự động", name: "Autopilot", x: 840, y: 670, desc: "Tự viết và đăng bài theo hàng đợi từ khoá, mỗi ngày một số bài vào giờ đã đặt. Khi đang có mẻ viết sẽ hiện thanh tiến độ." },
  { id: "ex", kind: "AI", name: "Chuyên gia SEO", x: 840, y: 440, desc: "AI trả lời hỏi đáp SEO, khám bệnh website, lập kế hoạch nội dung. Đếm số lượt hỏi theo ngày." },
  { id: "ext", kind: "Tiện ích Chrome", name: "Chạy nền (AI Mode)", x: 840, y: 230, desc: "Tiện ích GG AI Mode Capture bật chế độ Chạy nền trên các hồ sơ Chrome: nhận việc vẽ ảnh và nghiên cứu từ SEO Writer. Màu xám = không hồ sơ nào đang bật." },
  { id: "or", kind: "API ngoài", name: "OpenRouter", x: 1110, y: 440, desc: "Cổng gọi các model AI (Gemini…) để viết bài và trả lời chuyên gia. Hiện chi phí hôm nay và trong tháng của key chung và key chuyên gia." },
  { id: "serper", kind: "API ngoài", name: "Serper", x: 1110, y: 670, desc: "API tra kết quả Google: check rank, check index, nghiên cứu SERP. Hiện số credit còn lại; dưới 2.000 sẽ báo vàng." },
];

const EDGES = [
  ["fail2ban", "vps", "guard"], ["vps", "caddy", "host"], ["cron", "ap", "schedule"],
  ["caddy", "dash", "route"], ["caddy", "fin", "route"], ["caddy", "gscapi", "route"], ["caddy", "sw", "route"],
  ["dash", "fin", "embed"],
  ["sw", "ap", "module"], ["sw", "ex", "module"], ["sw", "ext", "task"],
  ["ap", "or", "api"], ["ap", "serper", "api"], ["ex", "or", "api"], ["ex", "serper", "api"],
];

const nodes = {};
for (const d of DEFS) nodes[d.id] = { ...d, st: "idle", mt: "đang đo…", meta: {}, prog: null, log: [] };
const live = new Set();
const series = { cpu: [], ram: [] };
const clients = new Set();
let pending = [];

function now() { return Date.now(); }
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function mb(bytes) { return Math.round(bytes / 1048576); }
function ago(ms) {
  const s = Math.max(0, Math.round((now() - ms) / 1000));
  if (s < 90) return s + " giây";
  if (s < 5400) return Math.round(s / 60) + " phút";
  if (s < 172800) return Math.round(s / 3600) + " giờ";
  return Math.round(s / 86400) + " ngày";
}
function vnTime(ms) {
  return new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}
function vnDate(ms) {
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}
function mask(s) {
  return String(s).replace(/sk-or-[A-Za-z0-9-]{8,}/g, "sk-or-***").replace(/(key=)[^&\s"]+/gi, "$1***");
}

function run(cmd, args, timeout = 8000) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout) => resolve({ err, out: String(stdout || "") }));
  });
}
function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return def; }
}
function request(url, { headers = {}, timeout = 8000 } = {}) {
  return new Promise(resolve => {
    const t0 = now();
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers, timeout }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => { if (body.length < 200000) body += c; });
      res.on("end", () => resolve({ code: res.statusCode, ms: now() - t0, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", e => resolve({ code: 0, ms: now() - t0, error: e.message }));
  });
}
function certDays(host) {
  return new Promise(resolve => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const c = s.getPeerCertificate();
      s.end();
      resolve(c && c.valid_to ? Math.floor((Date.parse(c.valid_to) - now()) / 86400000) : null);
    });
    s.on("timeout", () => { s.destroy(); resolve(null); });
    s.on("error", () => resolve(null));
  });
}

function log(id, level, msg, at = now()) {
  const e = { at, node: id, level, msg: mask(msg) };
  const n = nodes[id];
  n.log.push(e);
  if (n.log.length > LOG_PER_NODE) n.log.splice(0, n.log.length - LOG_PER_NODE);
  pending.push(e);
  try { fs.appendFileSync(EVENTS_FILE, JSON.stringify(e) + "\n"); } catch (err) {}
}

const ST_LEVEL = { ok: "OK", warn: "WARN", fail: "ERROR", idle: "INFO" };
const ST_TEXT = { ok: "chạy tốt", warn: "cảnh báo", fail: "lỗi", idle: "đang nghỉ" };
function set(id, st, mt, meta, reason) {
  const n = nodes[id];
  const prev = n.st, first = !n.seen;
  n.st = st; n.mt = mt; n.meta = meta; n.seen = true; n.at = now();
  if (first) log(id, ST_LEVEL[st], `Bắt đầu theo dõi: ${ST_TEXT[st]}${reason ? " — " + reason : ""}`);
  else if (prev !== st) log(id, ST_LEVEL[st], `${ST_TEXT[prev]} → ${ST_TEXT[st]}${reason ? " — " + reason : ""}`);
}
function worst(...sts) {
  for (const s of ["fail", "warn", "ok"]) if (sts.includes(s)) return s;
  return "idle";
}

let cpuPrev = null;
function cpuNow() {
  const f = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = f[3] + (f[4] || 0), total = f.reduce((a, b) => a + b, 0);
  const r = cpuPrev ? Math.round(100 * (1 - (idle - cpuPrev.idle) / Math.max(1, total - cpuPrev.total))) : null;
  cpuPrev = { idle, total };
  return r;
}
async function collectVps() {
  try {
    const cpu = cpuNow();
    const mi = {};
    for (const l of fs.readFileSync("/proc/meminfo", "utf8").split("\n")) {
      const m = l.match(/^(\w+):\s+(\d+)/);
      if (m) mi[m[1]] = Number(m[2]) * 1024;
    }
    const memTotal = mi.MemTotal, memUsed = mi.MemTotal - mi.MemAvailable;
    const ram = pct(memUsed, memTotal);
    const { out } = await run("df", ["-B1", "--output=size,used,avail", "/"]);
    const [size, used] = out.trim().split("\n").pop().trim().split(/\s+/).map(Number);
    const disk = pct(used, size);
    const load = fs.readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).join(" ");
    const up = Number(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000;
    if (cpu != null) { series.cpu.push([now(), cpu]); series.ram.push([now(), ram]); }
    for (const k of ["cpu", "ram"]) if (series[k].length > 240) series[k].shift();
    const reasons = [];
    const sRam = ram >= 95 ? "fail" : ram >= 85 ? "warn" : "ok";
    const sDisk = disk >= 92 ? "fail" : disk >= 80 ? "warn" : "ok";
    if (sRam !== "ok") reasons.push(`RAM ${ram}%`);
    if (sDisk !== "ok") reasons.push(`ổ cứng ${disk}%`);
    set("vps", worst(sRam, sDisk), `CPU ${cpu ?? "…"}% · RAM ${ram}% · ổ ${disk}%`, {
      "CPU": (cpu ?? "…") + "% (1 nhân)",
      "Tải 1/5/15 phút": load,
      "RAM": `${mb(memUsed)} / ${mb(memTotal)} MB (${ram}%)`,
      "Ổ cứng": `${(used / 1073741824).toFixed(1)} / ${(size / 1073741824).toFixed(1)} GB (${disk}%)`,
      "Chạy liên tục": ago(now() - up),
    }, reasons.join(", "));
  } catch (e) {
    set("vps", "fail", "không đo được", {}, e.message);
  }
}

async function systemdInfo(unit) {
  const { out } = await run("systemctl", ["show", unit, "-p", "ActiveState,SubState,MainPID,NRestarts,ActiveEnterTimestamp"]);
  const p = {};
  for (const l of out.split("\n")) { const i = l.indexOf("="); if (i > 0) p[l.slice(0, i)] = l.slice(i + 1); }
  let rss = null;
  if (p.MainPID && p.MainPID !== "0") {
    try {
      const m = fs.readFileSync(`/proc/${p.MainPID}/status`, "utf8").match(/VmRSS:\s+(\d+)/);
      if (m) rss = Math.round(Number(m[1]) / 1024);
    } catch (e) {}
  }
  const since = Date.parse(p.ActiveEnterTimestamp || "");
  return { active: p.ActiveState === "active", state: `${p.ActiveState}/${p.SubState}`, restarts: Number(p.NRestarts || 0), rss, since: isNaN(since) ? null : since };
}

async function collectSystemd() {
  const f2 = await systemdInfo("fail2ban");
  if (!f2.active) set("fail2ban", "fail", "không chạy", { "Dịch vụ": "fail2ban.service", "Trạng thái": f2.state }, "fail2ban dừng");
  else {
    const { out } = await run("fail2ban-client", ["status", "sshd"]);
    const cur = (out.match(/Currently banned:\s+(\d+)/) || [])[1] || "?";
    const tot = (out.match(/Total banned:\s+(\d+)/) || [])[1] || "?";
    const prev = nodes.fail2ban.meta["Đang chặn"];
    set("fail2ban", "ok", `đang chặn ${cur} IP`, { "Dịch vụ": "fail2ban.service", "Jail": "sshd", "Đang chặn": cur + " IP", "Tổng đã chặn": tot }, "");
    if (prev && prev !== cur + " IP") log("fail2ban", "INFO", `Số IP đang chặn: ${prev} → ${cur} IP`);
  }
  const cr = await systemdInfo("cron");
  const { out: tab } = await run("crontab", ["-l"]);
  const jobs = tab.split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
  set("cron", cr.active ? "ok" : "fail", `${jobs.length} lịch chạy`, {
    "Dịch vụ": "cron.service",
    "Trạng thái": cr.state,
    ...Object.fromEntries(jobs.map((j, i) => [`Lịch ${i + 1}`, mask(j.replace(/-H\s+"X-Access-Key:[^"]*"/, "").replace(/\s+/g, " ").slice(0, 140))])),
  }, cr.active ? "" : "cron dừng");
}

async function collectPm2() {
  const { err, out } = await run("pm2", ["jlist"], 15000);
  let list = [];
  try { list = JSON.parse(out.slice(out.indexOf("["))); } catch (e) {}
  const map = { dashboard: ["dash", "3050"], "gsc-api": ["gscapi", "3001, 3002"] };
  for (const [name, [id, port]] of Object.entries(map)) {
    const p = list.find(x => x.name === name);
    if (!p) { set(id, "fail", "không thấy tiến trình", { "Tiến trình": "pm2: " + name }, err ? "pm2 lỗi" : "mất khỏi PM2"); continue; }
    const e = p.pm2_env, st = e.status;
    const prevR = nodes[id].restarts;
    nodes[id].restarts = e.restart_time;
    const s = st === "online" ? "ok" : st === "stopped" ? "idle" : "fail";
    set(id, s, `cổng ${port} · ${mb(p.monit.memory)} MB · ${e.restart_time} restart`, {
      "Tiến trình": "pm2: " + name,
      "Trạng thái": st,
      "Cổng": port,
      "RAM": mb(p.monit.memory) + " MB",
      "CPU": p.monit.cpu + "%",
      "Chạy liên tục": e.pm_uptime ? ago(e.pm_uptime) : "—",
      "Số lần restart": String(e.restart_time),
    }, st !== "online" ? "PM2 báo " + st : "");
    if (prevR != null && e.restart_time > prevR) log(id, "WARN", `PM2 vừa restart (lần thứ ${e.restart_time})`);
  }
}

let certCache = { at: 0, days: {} };
async function collectCaddy() {
  const c = await systemdInfo("caddy");
  if (now() - certCache.at > 6 * 3600000) {
    const days = {};
    for (const d of DOMAINS) days[d.host] = await certDays(d.host);
    certCache = { at: now(), days };
  }
  const results = await Promise.all(DOMAINS.map(d => request(`https://${d.host}/`, { timeout: 10000 }).then(r => ({ ...d, ...r }))));
  const meta = { "Dịch vụ": "caddy.service · " + c.state };
  const bad = [], slow = [];
  let minDays = Infinity;
  for (const r of results) {
    const days = certCache.days[r.host];
    if (days != null) minDays = Math.min(minDays, days);
    const okCode = r.ok.includes(r.code);
    if (!okCode) bad.push(`${r.host} ${r.code || r.error}`);
    else if (r.ms > 3000) slow.push(`${r.host} ${r.ms} ms`);
    meta[r.host] = `${r.code || "lỗi"} · ${r.ms} ms · SSL ${days == null ? "?" : days + " ngày"}`;
    const prev = nodes.caddy.hostOk && nodes.caddy.hostOk[r.host];
    if (prev != null && prev !== okCode) log("caddy", okCode ? "OK" : "ERROR", okCode ? `${r.host} hoạt động lại (${r.code})` : `${r.host} lỗi: ${r.code || r.error}`);
    (nodes.caddy.hostOk = nodes.caddy.hostOk || {})[r.host] = okCode;
  }
  const sCert = minDays < 3 ? "fail" : minDays < 14 ? "warn" : "ok";
  const st = !c.active ? "fail" : worst(bad.length ? "fail" : "ok", slow.length ? "warn" : "ok", sCert);
  const reason = [!c.active && "caddy dừng", ...bad, ...slow, sCert !== "ok" && `SSL còn ${minDays} ngày`].filter(Boolean).join(", ");
  set("caddy", st, `${results.length - bad.length}/${results.length} domain · SSL ≥ ${minDays === Infinity ? "?" : minDays} ngày`, meta, reason);
}

async function collectFinance() {
  const r = await request("https://finance-tracker.nthieucloud.shop/", { timeout: 10000 });
  const lm = await new Promise(resolve => {
    const req = https.request("https://finance-tracker.nthieucloud.shop/", { method: "HEAD", timeout: 8000 }, res => { res.resume(); resolve(res.headers["last-modified"] || ""); });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(""));
    req.end();
  });
  const ver = (String(r.body || "").match(/version-tag">\s*Version\s*([^<\s]+)/i) || [])[1] || "";
  const up = r.code === 200;
  const lmAt = Date.parse(lm);
  const prevVer = nodes.fin.ver;
  nodes.fin.ver = ver;
  if (prevVer && ver && prevVer !== ver) log("fin", "OK", `Lên phiên bản mới: ${prevVer} → ${ver}`);
  set("fin", up ? (r.ms > 3000 ? "warn" : "ok") : "fail", up ? `${ver || "?"} · ${r.ms} ms` : "không truy cập được", {
    "Địa chỉ": "finance-tracker.nthieucloud.shop",
    "Phản hồi": r.code ? `${r.code} · ${r.ms} ms` : "lỗi (" + (r.error || "?") + ")",
    "Phiên bản": ver || "—",
    "Cập nhật code lần cuối": isNaN(lmAt) ? "—" : `${vnTime(lmAt)} (${ago(lmAt)} trước)`,
    "Lưu trữ": "GitHub Pages (code) · Firebase (dữ liệu)",
  }, !up ? "trang lỗi " + (r.code || r.error) : r.ms > 3000 ? `chậm ${r.ms} ms` : "");
}

function swConfig() { return readJSON(path.join(SW_DIR, "config.json"), {}); }

async function collectSw() {
  const s = await systemdInfo("seo-writer");
  const r = await request("http://127.0.0.1:8501/", { timeout: 8000 });
  const arts = readJSON(path.join(SW_DIR, "articles.json"), {});
  const today = vnDate(now());
  let todayN = 0, lastAt = 0, lastKw = "";
  for (const a of Object.values(arts)) {
    const t = Date.parse(a.updated_at || "") || 0;
    if (t && vnDate(t) === today) todayN++;
    if (t > lastAt) { lastAt = t; lastKw = (a.state && a.state.inputs && a.state.inputs.keyword) || ""; }
  }
  const up = s.active && r.code > 0 && r.code < 500;
  const st = !s.active ? "fail" : !up ? "fail" : r.ms > 5000 ? "warn" : "ok";
  set("sw", st, `cổng 8501 · ${todayN} bài cập nhật hôm nay`, {
    "Dịch vụ": "seo-writer.service · " + s.state,
    "Cổng": "8501",
    "Phản hồi": r.code ? `${r.code} · ${r.ms} ms` : "không trả lời (" + (r.error || "?") + ")",
    "RAM": s.rss != null ? s.rss + " MB" : "—",
    "Chạy liên tục": s.since ? ago(s.since) : "—",
    "Bài lưu trữ": Object.keys(arts).length + " bài",
    "Cập nhật hôm nay": todayN + " bài",
    "Bài gần nhất": lastAt ? `${lastKw || "?"} · ${ago(lastAt)} trước` : "—",
  }, !s.active ? "dịch vụ dừng" : !up ? "API không trả lời" : r.ms > 5000 ? `phản hồi chậm ${r.ms} ms` : "");
  const prev = nodes.sw.lastArt;
  if (prev && lastAt > prev) log("sw", "OK", `Lưu bài: ${lastKw || "?"}`, lastAt);
  nodes.sw.lastArt = lastAt;
}

let apLastTail = null;
async function collectAutopilot() {
  const a = readJSON(path.join(SW_DIR, "autopilot.json"), null);
  if (!a) { set("ap", "fail", "không đọc được autopilot.json", {}, "thiếu file"); return; }
  const running = (a.processes || []).filter(p => !["done", "cancelled", "failed", "error"].includes(p.status));
  const done = (a.processes || []).filter(p => p.status === "done");
  const lastProc = (a.processes || []).slice(-1)[0];
  let tail = "";
  try {
    const fd = fs.openSync(path.join(SW_DIR, "autopilot.log"), "r");
    const size = fs.fstatSync(fd).size, len = Math.min(size, 4096), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const parts = buf.toString("utf8").split(/(?<=\})(?=\{)/);
    tail = parts[parts.length - 1].trim();
  } catch (e) {}
  let tailMsg = tail;
  try { const j = JSON.parse(tail); tailMsg = j.skipped ? "Bỏ qua: " + j.skipped : JSON.stringify(j).slice(0, 200); } catch (e) {}
  if (apLastTail !== null && tail !== apLastTail && tailMsg) log("ap", "INFO", "Lượt chạy theo giờ — " + tailMsg);
  apLastTail = tail;
  let prog = null, mt;
  if (running.length) {
    const p = running[0];
    prog = pct(p.done || 0, p.total || 0);
    mt = `${p.label || p.site} · ${p.done || 0}/${p.total || 0} bài`;
    live.add("sw>ap"); live.add("ap>or"); live.add("ap>serper");
    const k = `${p.id}:${p.done}`;
    if (nodes.ap.progKey && nodes.ap.progKey !== k) log("ap", "OK", `${p.label || p.site}: xong ${p.done}/${p.total} bài`);
    nodes.ap.progKey = k;
  } else {
    ["sw>ap", "ap>or", "ap>serper"].forEach(e => live.delete(e));
    mt = a.enabled ? `bật · chạy lúc ${a.run_hour}h · ${a.per_day} bài/ngày` : "đang tắt";
  }
  nodes.ap.prog = prog;
  set("ap", running.length ? "ok" : a.enabled ? "ok" : "idle", mt, {
    "Trạng thái": a.enabled ? "bật" : "tắt",
    "Giờ chạy (VN)": a.run_hour + "h",
    "Số bài mỗi ngày": String(a.per_day),
    "Hàng đợi": (a.queue || []).length + " từ khoá",
    "Đã viết": (a.done_log || []).length + " bài",
    "Lượt chạy gần nhất": a.last_run || "—",
    "Tiến trình đang chạy": running.length ? running.map(p => `${p.label} (${p.done}/${p.total})`).join("; ") : "không có",
    "Tiến trình gần nhất": lastProc ? `${lastProc.label} · ${lastProc.status} · ${lastProc.done}/${lastProc.total}` : "—",
    "Đã xong": done.length + " tiến trình",
    "Log cron gần nhất": tailMsg || "—",
  }, "");
}

async function collectWorkers() {
  const key = swConfig().access_key || "";
  const r = await request("http://127.0.0.1:8501/api/gemini-img/workers?key=" + encodeURIComponent(key), { timeout: 6000 });
  let ws = null;
  try { ws = JSON.parse(r.body).workers; } catch (e) {}
  if (!Array.isArray(ws)) { set("ext", "warn", "không hỏi được SEO Writer", {}, "API workers lỗi " + (r.code || r.error)); return; }
  const alive = ws.filter(w => w.alive);
  const meta = { "Hồ sơ đang chạy nền": alive.length + " hồ sơ" };
  for (const w of ws) {
    const bl = w.blocked_until ? ` · hết lượt tới ${vnTime(w.blocked_until * 1000)}` : "";
    meta[w.name] = `${w.alive ? "đang chạy" : "mất kết nối"} · ${w.engine === "gemini" ? "Gemini" : "GG Search AI"}${w.active ? " · đang làm ảnh" : ""}${bl}`;
  }
  const prevNames = nodes.ext.alive || [];
  const names = alive.map(w => w.name);
  if (nodes.ext.seen) {
    for (const n of names) if (!prevNames.includes(n)) log("ext", "OK", `${n} bật Chạy nền`);
    for (const n of prevNames) if (!names.includes(n)) log("ext", "WARN", `${n} ngừng Chạy nền`);
  }
  nodes.ext.alive = names;
  if (alive.length) live.add("sw>ext"); else live.delete("sw>ext");
  const act = ws.find(w => w.active);
  const blocked = act && act.blocked_until;
  set("ext", alive.length ? (blocked ? "warn" : "ok") : "idle", alive.length ? `${alive.length} hồ sơ · ${names.join(", ")}`.slice(0, 60) : "không hồ sơ nào chạy nền", meta, blocked ? `${act.name} hết lượt vẽ ảnh` : "");
}

async function collectExpert() {
  const cfg = swConfig();
  const usage = readJSON(path.join(SW_DIR, "expert_usage.json"), {});
  const today = vnDate(now());
  const from = vnDate(now() - 6 * 86400000);
  const last7 = Object.keys(usage).filter(d => d >= from && d <= today).reduce((s, d) => s + Number(usage[d] || 0), 0);
  const prev = nodes.ex.today;
  const t = Number(usage[today] || 0);
  if (prev != null && t > prev) log("ex", "INFO", `Thêm ${t - prev} lượt hỏi chuyên gia (hôm nay ${t})`);
  nodes.ex.today = t;
  if (t > (prev || 0) && prev != null) { live.add("ex>or"); setTimeout(() => live.delete("ex>or"), 90000); }
  set("ex", "ok", `hôm nay ${t} lượt · 7 ngày ${last7}`, {
    "Model": cfg.expert_model || "—",
    "Model hồ sơ tích hợp": cfg.expert_integrate_model || "—",
    "Lượt hôm nay": String(t),
    "7 ngày gần nhất": String(last7),
    "Key riêng": cfg.expert_openrouter_key ? "có" : "dùng key chung",
  }, "");
}

let extCache = { at: 0 };
async function collectExternal() {
  if (now() - extCache.at < 10 * 60000) return;
  extCache.at = now();
  const cfg = swConfig();
  const keys = [["Key chung", cfg.openrouter_key], ["Key chuyên gia", cfg.expert_openrouter_key]].filter(k => k[1]);
  const meta = {}, warns = [];
  let head = "";
  for (const [label, key] of keys) {
    const r = await request("https://openrouter.ai/api/v1/key", { headers: { Authorization: "Bearer " + key } });
    let d = null;
    try { d = JSON.parse(r.body).data; } catch (e) {}
    if (!d) { meta[label] = "không đọc được (" + (r.code || r.error) + ")"; warns.push(label + " lỗi"); continue; }
    const rem = d.limit_remaining;
    const parts = [];
    if (d.usage_daily != null) parts.push(`hôm nay $${Number(d.usage_daily).toFixed(3)}`);
    if (d.usage_monthly != null) parts.push(`tháng $${Number(d.usage_monthly).toFixed(2)}`);
    parts.push(`tổng $${Number(d.usage || 0).toFixed(2)}`);
    if (d.limit != null) parts.push(`còn $${Number(rem).toFixed(2)} / $${d.limit}`);
    meta[label] = parts.join(" · ");
    if (rem != null && rem < 1) warns.push(`${label} còn $${Number(rem).toFixed(2)}`);
    if (!head && d.usage_daily != null) head = `hôm nay $${Number(d.usage_daily).toFixed(3)}`;
  }
  if (!keys.length) set("or", "idle", "chưa có key", {}, "");
  else set("or", warns.length ? "warn" : "ok", head || meta[keys[0][0]].split(" · ")[0], meta, warns.join(", "));
  const prevO = nodes.or.daily;
  nodes.or.daily = head;
  if (prevO && head && prevO !== head) log("or", "INFO", "Chi phí " + head);

  if (cfg.serper_key) {
    const r = await request("https://google.serper.dev/account", { headers: { "X-API-KEY": cfg.serper_key } });
    let d = null;
    try { d = JSON.parse(r.body); } catch (e) {}
    if (!d || d.balance == null) set("serper", "warn", "không đọc được credit", { "Phản hồi": String(r.code || r.error) }, "API account lỗi");
    else {
      const b = Number(d.balance);
      const prevB = nodes.serper.balance;
      nodes.serper.balance = b;
      if (prevB != null && prevB !== b) log("serper", "INFO", `Dùng ${prevB - b} credit trong 10 phút (còn ${b.toLocaleString("vi-VN")})`);
      set("serper", b < 500 ? "fail" : b < 2000 ? "warn" : "ok", `còn ${b.toLocaleString("vi-VN")} credit`, {
        "Credit còn": b.toLocaleString("vi-VN"),
        "Giới hạn tốc độ": d.rateLimit != null ? d.rateLimit + " lượt/giây" : "—",
        "Ngưỡng cảnh báo": "< 2.000 credit",
      }, b < 2000 ? `còn ${b} credit` : "");
    }
  } else set("serper", "idle", "chưa có key", {}, "");
}

function snapshot(withLog) {
  return {
    at: now(),
    nodes: Object.values(nodes).map(n => ({
      id: n.id, kind: n.kind, name: n.name, desc: n.desc, x: n.x, y: n.y, st: n.st, mt: n.mt, meta: n.meta, prog: n.prog, at: n.at,
      ...(withLog ? { log: n.log.slice(-150) } : {}),
    })),
    edges: EDGES,
    live: [...live],
    series,
  };
}

function broadcast() {
  const msg = `event: tick\ndata: ${JSON.stringify({ ...snapshot(false), events: pending })}\n\n`;
  pending = [];
  for (const res of clients) { try { res.write(msg); } catch (e) {} }
}

async function safe(fn) { try { await fn(); } catch (e) { console.error("[hub]", fn.name, e.message); } }
let slowTick = 0;
async function cycle() {
  await safe(collectVps);
  if (slowTick++ % 2 === 0) {
    await safe(collectPm2);
    await safe(collectSystemd);
    await safe(collectSw);
    await safe(collectAutopilot);
    await safe(collectWorkers);
    await safe(collectExpert);
    await safe(collectCaddy);
    await safe(collectFinance);
    await safe(collectExternal);
  }
  broadcast();
}

function loadState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lay = readJSON(LAYOUT_FILE, {});
  for (const [id, p] of Object.entries(lay)) if (nodes[id]) { nodes[id].x = p.x; nodes[id].y = p.y; }
  try {
    const cut = now() - KEEP_DAYS * 86400000;
    const lines = fs.readFileSync(EVENTS_FILE, "utf8").split("\n").filter(Boolean);
    const keep = [];
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (e.at < cut) continue;
        keep.push(l);
        if (nodes[e.node]) nodes[e.node].log.push(e);
      } catch (err) {}
    }
    for (const n of Object.values(nodes)) if (n.log.length > LOG_PER_NODE) n.log = n.log.slice(-LOG_PER_NODE);
    const trimmed = keep.slice(-20000);
    if (trimmed.length !== lines.length) fs.writeFileSync(EVENTS_FILE, trimmed.join("\n") + (trimmed.length ? "\n" : ""));
  } catch (e) {}
}

function readBody(req) {
  return new Promise(resolve => {
    let d = "";
    req.setEncoding("utf8");
    req.on("data", c => { if (d.length < 100000) d += c; });
    req.on("end", () => resolve(d));
  });
}

async function handle(req, res, url) {
  if (url === "/admin/api/state" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(snapshot(true)));
    return true;
  }
  if (url === "/admin/api/stream" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 5000\n\n");
    clients.add(res);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 25000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return true;
  }
  if (url === "/admin/api/layout" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch (e) {}
    const lay = {};
    for (const n of Object.values(nodes)) {
      const p = body[n.id];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { n.x = Math.max(0, Math.round(p.x)); n.y = Math.max(0, Math.round(p.y)); }
      lay[n.id] = { x: n.x, y: n.y };
    }
    if (body.reset) {
      for (const d of DEFS) { nodes[d.id].x = d.x; nodes[d.id].y = d.y; lay[d.id] = { x: d.x, y: d.y }; }
    }
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify(lay));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, layout: lay }));
    return true;
  }
  return false;
}

let started = false;
function start() {
  if (started) return;
  started = true;
  loadState();
  cycle();
  setInterval(cycle, 30000);
}

module.exports = { start, handle };
