const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const tls = require("tls");
const { execFile } = require("child_process");
const { FLOWS } = require("./hub_flows");

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
  { id: "fail2ban", kind: "Bảo vệ", name: "Fail2ban", desc: "Bảo vệ VPS khỏi bị dò mật khẩu: IP nào đăng nhập SSH sai nhiều lần sẽ bị khoá tạm thời." },
  { id: "vps", kind: "Máy chủ", name: "VPS 103.82.195.87", desc: "Máy chủ 103.82.195.87 chạy toàn bộ tool (1 nhân CPU, 1 GB RAM). Đo CPU, RAM, ổ cứng mỗi 30 giây; bấm vào để xem biểu đồ." },
  { id: "cron", kind: "Lịch chạy", name: "Cron", desc: "Bộ hẹn giờ của VPS. Mỗi giờ gọi Autopilot một lần để xem đã tới giờ viết bài chưa." },
  { id: "caddy", kind: "Proxy · SSL", name: "Caddy", desc: "Cổng vào của mọi tên miền *.nthieucloud.shop: nhận truy cập, tự cấp và gia hạn SSL (https), rồi chuyển vào đúng tool phía sau. Kiểm tra 5 tên miền mỗi phút." },
  { id: "dash", kind: "PM2", name: "Dashboard", desc: "Dashboard nthieucloud.shop (PM2, cổng 3050): quản lý website, công việc, Theo dõi web, Chuyên gia SEO. Trình duyệt đọc/ghi Firebase và gọi Google API trực tiếp; máy chủ làm proxy đọc bài WordPress, kiểm tra URL Search Console, số dư CloudFly, chuyển tiếp sang SEO Writer, và chạy bản đồ này." },
  { id: "fin", kind: "GitHub Pages", name: "Quản lý tài chính", desc: "App quản lý hoá đơn và tài chính (finance-tracker.nthieucloud.shop): trang tĩnh trên GitHub Pages, đi qua Caddy, dữ liệu lưu trên Firebase. Dashboard nhúng nó ở tab Tài chính." },
  { id: "gscapi", kind: "PM2 · tuỳ chọn", name: "GSC Bulk API (tự động hoá VPS)", desc: "Backend tuỳ chọn tại api.nthieucloud.shop (PM2 gsc-api, cổng 3001/3002). Chỉ chạy khi GSC Bulk Tool bật chế độ tự động hoá VPS: mở Chrome trên VPS bằng hồ sơ Google đã lưu để lấy mã xác minh, bấm xác minh, nộp sitemap, chèn thẻ vào WordPress, check index qua Serper. Khác với trang GSC Bulk Tool (trang đó gọi thẳng Google API từ trình duyệt)." },
  { id: "sw", kind: "systemd", name: "SEO Writer API", desc: "SEO Writer (seo-writer-tool.nthieucloud.shop, cổng 8501): viết bài bằng AI (mặc định Gemini app qua tiện ích Chrome Chạy nền, OpenRouter dự phòng), nghiên cứu bằng Serper + Reddit + GG AI Mode, đăng bài lên WordPress. Bên trong có Autopilot và Chuyên gia SEO; giao việc vẽ ảnh / nghiên cứu cho tiện ích Chrome Chạy nền." },
  { id: "ap", kind: "Tự động", name: "Autopilot", desc: "Tự viết và đăng bài theo hàng đợi từ khoá, mỗi ngày một số bài vào giờ đã đặt. Khi đang có mẻ viết sẽ hiện thanh tiến độ." },
  { id: "ex", kind: "AI", name: "Chuyên gia SEO", desc: "AI trả lời hỏi đáp SEO, khám bệnh website, lập kế hoạch nội dung. Đếm số lượt hỏi theo ngày." },
  { id: "ext", kind: "Tiện ích Chrome", name: "Chạy nền (AI Mode)", desc: "Tiện ích GG AI Mode Capture bật chế độ Chạy nền trên các hồ sơ Chrome: nhận việc vẽ ảnh và nghiên cứu từ SEO Writer. Màu xám = không hồ sơ nào đang bật." },
  { id: "or", kind: "API ngoài", name: "OpenRouter", desc: "Cổng gọi các model AI (Gemini…) để viết bài và trả lời chuyên gia. Hiện chi phí hôm nay và trong tháng của key chung và key chuyên gia." },
  { id: "serper", kind: "API ngoài", name: "Serper", desc: "API tra kết quả Google: check rank, check index, nghiên cứu SERP. Hiện số credit còn lại; dưới 2.000 sẽ báo vàng." },
  { id: "dfb", kind: "Firebase", name: "Firebase (dữ liệu Dashboard)", desc: "Cơ sở dữ liệu của Dashboard: website, công việc, theo dõi web… Trình duyệt đọc/ghi trực tiếp; máy chủ chỉ kiểm tra còn truy cập được không, không đọc dữ liệu." },
  { id: "gsc", kind: "API Google", name: "Google Search Console", desc: "Search Console API (click, hiển thị, vị trí, kiểm tra URL) và Site Verification API (lấy mã, xác minh site). Dashboard và GSC Bulk Tool gọi từ trình duyệt bằng tài khoản Google của bạn; Chrome tự động thì thao tác giao diện web. Máy chủ không đo được nên ô này chỉ thể hiện cấu trúc." },
  { id: "gchrome", kind: "Puppeteer", name: "Chrome tự động", desc: "Chrome chạy trên VPS do GSC Bulk API mở (Puppeteer), dùng hồ sơ đăng nhập Google đã lưu để thao tác giao diện web Search Console và trang quản trị WordPress. Xám = không có Chrome nào đang mở." },
  { id: "fgh", kind: "Hosting", name: "GitHub Pages", desc: "Nơi lưu và phát code của app tài chính. Cập nhật app = đẩy code lên GitHub; ô này hiện lần cập nhật code gần nhất." },
  { id: "ffb", kind: "Firebase", name: "Firebase (dữ liệu tài chính)", desc: "Cơ sở dữ liệu của app tài chính (hoá đơn, thu chi). Trình duyệt đọc/ghi trực tiếp; máy chủ chỉ kiểm tra còn truy cập được không, không đọc dữ liệu." },
  { id: "wp", kind: "Đích đăng bài", name: "Các site WordPress", desc: "Các website nhận bài: SEO Writer đăng bài, lấy danh mục, tải ảnh qua WordPress REST; Dashboard đọc danh sách bài qua máy chủ (/api/wp-posts). Ô này kiểm tra các site SEO Writer đăng bài trong 30 ngày gần nhất mỗi 10 phút." },
  { id: "gsct", kind: "Web tĩnh", name: "GSC Bulk Tool (web)", desc: "Trang gsc-bulk-tool.nthieucloud.shop: Caddy phát thẳng file tĩnh trong /root/gsc-bulk-tool, không qua tiến trình nào. Chạy trong trình duyệt: thêm và xác minh site Search Console hàng loạt, check index, đọc Google Sheets, AI Gemini, báo Telegram. Dashboard nhúng nó ở tab Công cụ." },
  { id: "gfb", kind: "Firebase", name: "Firebase (dữ liệu GSC Bulk)", desc: "Cơ sở dữ liệu của GSC Bulk Tool. Trình duyệt đọc/ghi trực tiếp; máy chủ chỉ kiểm tra còn truy cập được không, không đọc dữ liệu." },
  { id: "gsheets", kind: "API Google", name: "Google Sheets", desc: "GSC Bulk Tool đọc danh sách site từ Google Sheets bằng tài khoản Google của bạn. Gọi từ trình duyệt nên máy chủ không đo được." },
  { id: "gemini", kind: "API ngoài", name: "Google Gemini", desc: "GSC Bulk Tool gọi AI Gemini bằng key lưu trong trình duyệt. Máy chủ không đo được." },
  { id: "cors", kind: "Dịch vụ miễn phí", name: "Proxy công khai", desc: "codetabs, allorigins, corsproxy: GSC Bulk Tool mượn để đọc nội dung các site từ trình duyệt. Dịch vụ miễn phí bên ngoài, có thể chậm hoặc bị Cloudflare chặn. Máy chủ không đo được." },
  { id: "tg", kind: "API ngoài", name: "Telegram Bot", desc: "Gửi thông báo qua bot Telegram: Dashboard (báo rank), Quản lý tài chính, GSC Bulk Tool. Mỗi app tự gọi từ trình duyệt bằng token của nó nên máy chủ không đo được." },
  { id: "psi", kind: "API Google", name: "Google PageSpeed Insights", desc: "Đo tốc độ trang cho Khám bệnh website. Dashboard gọi trực tiếp, hoặc giao việc cho tiện ích Chrome Chạy nền gọi rồi gửi kết quả về. Máy chủ không đo được." },
  { id: "cloudfly", kind: "API ngoài", name: "CloudFly", desc: "Nhà cung cấp VPS. Dashboard hỏi số dư tài khoản qua máy chủ (/api/vps-balance) bằng token bạn nhập. Máy chủ không tự đo." },
  { id: "reddit", kind: "API ngoài", name: "Reddit", desc: "SEO Writer đọc kết quả tìm kiếm Reddit (search.json) khi nghiên cứu từ khoá. Không cần key." },
  { id: "sepay", kind: "API ngoài", name: "SePay (ngân hàng)", desc: "App tài chính lấy giao dịch ngân hàng qua một proxy SePay khi bấm Đồng bộ ngay. Gọi từ trình duyệt nên máy chủ không đo được." },
  { id: "svc", kind: "Nhóm", name: "Dịch vụ ngoài", desc: "Tất cả dịch vụ các hệ con gọi tới: AI, Google, Serper, Firebase, WordPress, Telegram, thanh toán, công cụ trên VPS. Nhấp đúp để xem từng dịch vụ và chức năng nào đang dùng nó." },
];

const MAPS = [
  {
    id: "root", title: "Hệ thống",
    nodes: { fail2ban: [30, 60], vps: [30, 250], cron: [30, 560], svc: [30, 780], caddy: [300, 250], gsct: [570, 0], fin: [570, 160], dash: [570, 320], ex: [570, 480], sw: [570, 640] },
    ghosts: {},
    edges: [["fail2ban", "vps", "guard"], ["vps", "caddy", "host"], ["caddy", "gsct", "route"], ["caddy", "fin", "route"], ["caddy", "dash", "route"], ["caddy", "sw", "route"], ["dash", "fin", "embed"], ["dash", "gsct", "embed"], ["dash", "ex", "call"], ["dash", "sw", "call"], ["sw", "ex", "host"], ["cron", "sw", "schedule"]],
  },
  {
    id: "svc", parent: "root", title: "Dịch vụ ngoài",
    nodes: { or: [30, 0], ext: [300, 0], gemini: [570, 0], gsc: [30, 160], psi: [300, 160], gsheets: [570, 160], serper: [30, 320], reddit: [300, 320], cors: [570, 320], dfb: [30, 480], ffb: [300, 480], gfb: [570, 480], wp: [30, 640], tg: [300, 640], cloudfly: [570, 640], sepay: [30, 800], gscapi: [300, 800], gchrome: [570, 800] },
    ghosts: {},
    edges: [],
  },
  ...Object.entries(FLOWS).map(([id, f]) => f.kind === "dag" ? { id, parent: "root", ...f } : ({ id, parent: "root", kind: "flow", title: f.title, core: f.core, ctx: f.ctx, lanes: f.lanes.map(l => ({ ...l, ctx: l.ctx || f.ctx })) })),
];
let layout = {};

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
    req.on("error", e => resolve({ code: 0, ms: now() - t0, error: e.code || e.message || "lỗi mạng" }));
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

const ST_LEVEL = { ok: "OK", warn: "WARN", fail: "ERROR", idle: "INFO", na: "INFO" };
const ST_TEXT = { ok: "chạy tốt", warn: "cảnh báo", fail: "lỗi", idle: "đang nghỉ", na: "không đo" };
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
    "Lưu trữ": "GitHub Pages (code) · Firebase (dữ liệu)",
  }, !up ? "trang lỗi " + (r.code || r.error) : r.ms > 3000 ? `chậm ${r.ms} ms` : "");
  const prevLm = nodes.fgh.lm;
  nodes.fgh.lm = lm;
  if (prevLm && lm && prevLm !== lm) log("fgh", "OK", `Có bản code mới đẩy lên lúc ${vnTime(lmAt)}`);
  const fm = String(r.body || "").match(/src="(script\.js[^"]*)"/);
  nodes.fin.scriptPath = fm ? fm[1] : "script.js";
  set("fgh", r.code ? "ok" : "fail", isNaN(lmAt) ? "đang phục vụ" : `cập nhật ${ago(lmAt)} trước`, {
    "Phục vụ cho": "finance-tracker.nthieucloud.shop",
    "Đi qua": "Caddy → konheodat01-web.github.io",
    "Cập nhật code lần cuối": isNaN(lmAt) ? "—" : `${vnTime(lmAt)} (${ago(lmAt)} trước)`,
  }, r.code ? "" : "GitHub Pages không trả lời");
}

let fbCache = { at: 0 };
async function collectFirebase() {
  if (now() - fbCache.at < 10 * 60000) return;
  fbCache.at = now();
  const dashCfg = (() => { try { return fs.readFileSync(path.join(__dirname, "..", "firebase.js"), "utf8"); } catch (e) { return ""; } })();
  const dUrl = (dashCfg.match(/databaseURL:\s*"([^"]+)"/) || [])[1];
  const fs1 = await request("https://finance-tracker.nthieucloud.shop/" + (nodes.fin.scriptPath || "script.js"), { timeout: 10000 });
  const fUrl = (String(fs1.body || "").match(/databaseURL:\s*"([^"]+)"/) || [])[1];
  const gHtml = (() => { try { return fs.readFileSync("/root/gsc-bulk-tool/index.html", "utf8"); } catch (e) { return ""; } })();
  const gUrl = (gHtml.match(/databaseURL:\s*"([^"]+)"/) || [])[1];
  for (const [id, url] of [["dfb", dUrl], ["ffb", fUrl], ["gfb", gUrl]]) {
    if (!url) { set(id, "warn", "không tìm thấy địa chỉ", {}, "thiếu databaseURL"); continue; }
    let r = await request(url + "/.json?shallow=true", { timeout: 10000 });
    if (!(r.code === 200 || r.code === 401)) r = await request(url + "/.json?shallow=true", { timeout: 15000 });
    const up = r.code === 200 || r.code === 401, open = r.code === 200;
    set(id, up ? (open || r.ms > 3000 ? "warn" : "ok") : "fail", up ? (open ? "đọc được không cần đăng nhập" : `truy cập được · ${r.ms} ms`) : "không truy cập được", {
      "Địa chỉ": url.replace(/^https:\/\//, ""),
      "Phản hồi": r.code ? `${r.code} · ${r.ms} ms` : "lỗi (" + (r.error || "?") + ")",
      "Đọc không cần đăng nhập": r.code === 200 ? "CÓ — cần khoá rules Firebase" : r.code === 401 ? "không (cần đăng nhập)" : "—",
      "Kiểm tra": "mỗi 10 phút, chỉ hỏi có truy cập được không",
    }, !up ? "Firebase lỗi " + (r.code || r.error) : open ? "ai có địa chỉ cũng đọc được dữ liệu (rules đang mở)" : "");
  }
}

async function collectChrome() {
  const bin = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"].find(f => fs.existsSync(f));
  const { out } = await run("pgrep", ["-c", "-x", "chrome"]);
  const n = Number(out.trim()) || 0;
  let profiles = 0;
  try { profiles = fs.readdirSync("/root/gsc-bulk-tool/google_profiles").length; } catch (e) {}
  const prev = nodes.gchrome.running;
  nodes.gchrome.running = n;
  if (prev != null && (prev > 0) !== (n > 0)) log("gchrome", "INFO", n ? `Chrome bắt đầu chạy (${n} tiến trình)` : "Chrome đã đóng hết");
  set("gchrome", !bin ? "fail" : n ? "ok" : "idle", !bin ? "không thấy Chrome" : n ? `đang mở ${n} tiến trình` : "không mở", {
    "Chrome": bin || "không có",
    "Tiến trình đang chạy": String(n),
    "Hồ sơ Google đã lưu": profiles + " hồ sơ",
  }, !bin ? "thiếu Chrome trên VPS" : "");
}

let wpCache = { at: 0 };
async function collectWp() {
  if (now() - wpCache.at < 10 * 60000) return;
  wpCache.at = now();
  const arts = readJSON(path.join(SW_DIR, "articles.json"), {});
  const cut = now() - 30 * 86400000, last = {};
  for (const a of Object.values(arts)) {
    const t = Date.parse(a.updated_at || "") || 0;
    const inp = (a.state && a.state.inputs) || {};
    const host = String(inp.domain || inp.site_id || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    if (!host || !host.includes(".") || t < cut) continue;
    if (!last[host] || t > last[host]) last[host] = t;
  }
  const hosts = Object.entries(last).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (!hosts.length) { set("wp", "idle", "không đăng bài 30 ngày qua", { "Site đã đăng (30 ngày)": "0" }, ""); return; }
  const meta = { "Site đã đăng (30 ngày)": String(Object.keys(last).length) + (Object.keys(last).length > 15 ? " (kiểm tra 15 site gần nhất)" : "") }, bad = [];
  for (const [host, t] of hosts) {
    let r = await request("https://" + host + "/", { timeout: 12000 });
    if (!(r.code >= 200 && r.code < 400)) r = await request("https://" + host + "/", { timeout: 15000 });
    const ok = r.code >= 200 && r.code < 400;
    if (!ok) bad.push(host);
    meta[host] = `${r.code || r.error || "lỗi"} · ${r.ms} ms · bài cuối ${ago(t)} trước`;
  }
  const prev = nodes.wp.bad || [];
  for (const h of bad) if (!prev.includes(h)) log("wp", "ERROR", `${h} không truy cập được`);
  for (const h of prev) if (!bad.includes(h)) log("wp", "OK", `${h} truy cập lại được`);
  nodes.wp.bad = bad;
  set("wp", bad.length ? "warn" : "ok", `${hosts.length - bad.length}/${hosts.length} site truy cập được`, meta, bad.length ? "lỗi: " + bad.join(", ") : "");
}

async function collectGsct() {
  const r = await request("https://gsc-bulk-tool.nthieucloud.shop/", { timeout: 10000 });
  let mt = null;
  try { mt = fs.statSync("/root/gsc-bulk-tool/index.html").mtimeMs; } catch (e) {}
  const up = r.code === 200;
  set("gsct", up ? (r.ms > 3000 ? "warn" : "ok") : "fail", up ? `${r.ms} ms · sửa ${mt ? ago(mt) + " trước" : "?"}` : "không truy cập được", {
    "Địa chỉ": "gsc-bulk-tool.nthieucloud.shop",
    "Phục vụ bởi": "Caddy (file tĩnh /root/gsc-bulk-tool)",
    "Phản hồi": r.code ? `${r.code} · ${r.ms} ms` : "lỗi (" + (r.error || "?") + ")",
    "Sửa code lần cuối": mt ? `${vnTime(mt)} (${ago(mt)} trước)` : "—",
  }, up ? "" : "trang lỗi " + (r.code || r.error));
  let last = null;
  try { last = fs.statSync("/root/gsc-bulk-tool/debug_status.txt").mtimeMs; } catch (e) {}
  if (last) nodes.gscapi.meta["Lần tự động hoá gần nhất"] = `${vnTime(last)} (${ago(last)} trước)`;
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

function mapView(m) {
  if (m.kind === "flow") return { id: m.id, title: m.title, parent: m.parent, kind: "flow", core: m.core, ctx: m.ctx, lanes: m.lanes };
  if (m.kind === "dag") return { id: m.id, title: m.title, parent: m.parent, kind: "dag", core: m.core, anc: m.anc, refs: m.refs || {}, bands: m.bands || [], nodes: m.nodes, edges: m.edges };
  const pos = (id, def) => { const p = layout[m.id] && layout[m.id][id]; return p ? [p.x, p.y] : def; };
  return {
    id: m.id, title: m.title, parent: m.parent || null, edges: m.edges,
    nodes: Object.entries(m.nodes).map(([id, d]) => { const [x, y] = pos(id, d); return { id, x, y }; }),
    ghosts: Object.entries(m.ghosts).map(([id, d]) => { const [x, y] = pos(id, d); return { id, x, y }; }),
  };
}

function snapshot(withLog) {
  return {
    at: now(),
    nodes: Object.values(nodes).map(n => ({
      id: n.id, kind: n.kind, name: n.name, desc: n.desc, st: n.st, mt: n.mt, meta: n.meta, prog: n.prog, at: n.at,
      ...(withLog ? { log: n.log.slice(-150) } : {}),
    })),
    maps: MAPS.map(mapView),
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
    await safe(collectGsct);
    await safe(collectChrome);
    await safe(collectFirebase);
    await safe(collectWp);
    await safe(collectExternal);
  }
  broadcast();
}

function loadState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const NA = {
    gsc: ["Dashboard · GSC Bulk Tool (trình duyệt) · Chrome tự động (giao diện web)", "gọi bằng tài khoản Google của bạn"],
    sepay: ["Quản lý tài chính", "gọi từ trình duyệt bằng token của bạn"],
    reddit: ["SEO Writer (bước Nghiên cứu)", "chưa đo riêng; lỗi sẽ hiện trong kết quả nghiên cứu"],
    gsheets: ["GSC Bulk Tool", "gọi bằng tài khoản Google của bạn"],
    gemini: ["GSC Bulk Tool", "key nằm trong trình duyệt"],
    cors: ["GSC Bulk Tool", "gọi từ trình duyệt"],
    tg: ["Dashboard (báo rank) · Quản lý tài chính · GSC Bulk Tool", "token bot nằm trong từng app"],
    psi: ["Dashboard · tiện ích Chrome Chạy nền", "gọi từ trình duyệt"],
    cloudfly: ["Dashboard (qua /api/vps-balance)", "token do bạn nhập mỗi lần hỏi"],
  };
  for (const [id, [by, why]] of Object.entries(NA)) set(id, "na", "không đo từ máy chủ", { "Dùng bởi": by, "Vì sao không đo": why }, "");
  set("svc", "na", "18 dịch vụ", {}, "");
  const lay = readJSON(LAYOUT_FILE, {});
  for (const m of MAPS) if (!m.kind && lay[m.id] && typeof lay[m.id] === "object" && !("x" in lay[m.id])) layout[m.id] = lay[m.id];
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
    const m = MAPS.find(x => x.id === body.map && !x.kind);
    if (!m) { res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify({ ok: false, error: "map" })); return true; }
    if (body.reset) delete layout[m.id];
    else {
      const ids = new Set([...Object.keys(m.nodes), ...Object.keys(m.ghosts)]);
      const cur = layout[m.id] || {};
      for (const [id, p] of Object.entries(body.pos || {})) if (ids.has(id) && Number.isFinite(p.x) && Number.isFinite(p.y)) cur[id] = { x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) };
      layout[m.id] = cur;
    }
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify(layout));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, map: mapView(m) }));
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
