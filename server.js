/**
 * server.js — Lightweight Node.js backend for Dashboard Admin
 * Runs on VPS. Zero external dependencies (pure Node built-ins only).
 *
 * Endpoints:
 *   GET  /api/config        → Read config.json and return as JSON
 *   POST /api/config        → Receive JSON body, overwrite config.json
 *   GET  /admin             → Serve admin.html
 *   GET  /                  → Serve index.html
 *   GET  /*                 → Serve static files (css, js, config.json)
 *
 * Usage on VPS:
 *   node server.js
 *   (or with PM2: pm2 start server.js --name dashboard)
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");
const https = require("https");

const PORT        = process.env.PORT || 3050;
const CONFIG_FILE = path.join(__dirname, "config.json");
const STATIC_DIR  = __dirname;

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".svg":  "image/svg+xml",
};

// ── Helper: read body ─────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end",  ()    => resolve(data));
    req.on("error", reject);
  });
}

// ── Helper: serve static file ─────────────────────────────────────────────────
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  });
}

// Lay credential "bao mat cap 1" (HTTP Basic Auth) tu config.json.
// Ho tro: level1_auth = {user, pass}  HOAC  level1_auth_by_domain = {"domain": {user,pass}}
// Tra ve chuoi "Basic base64(user:pass)" hoac null neu khong cau hinh.
function getLevel1Auth(domain) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    let cred = null;
    if (cfg.level1_auth_by_domain && cfg.level1_auth_by_domain[domain]) {
      cred = cfg.level1_auth_by_domain[domain];
    } else if (cfg.level1_auth && cfg.level1_auth.user) {
      cred = cfg.level1_auth;           // dung chung cho moi site
    }
    if (!cred || !cred.user) return null;
    return "Basic " + Buffer.from(cred.user + ":" + (cred.pass || "")).toString("base64");
  } catch (e) { return null; }
}

function safeJson(txt) {
  try { return JSON.parse(txt); } catch (e) { return []; }
}

// ── CORS headers (allow the admin page to call API) ───────────────────────────
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ── Main request handler ──────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCORS(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split("?")[0]; // strip query string

  // ── GET /api/config ──────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/config") {
    fs.readFile(CONFIG_FILE, "utf8", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cannot read config.json" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    });
    return;
  }

  // ── GET /api/vps-balance ──────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/vps-balance") {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const token = urlObj.searchParams.get("token");
    if (!token) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Thiếu token CloudFly" }));
      return;
    }

    const options = {
      hostname: "api.cloudfly.vn",
      path: "/backend/api/users",
      method: "GET",
      headers: {
        "Authorization": `Token ${token}`,
        "User-Agent": "Mozilla/5.0 Node.js HTTP Client"
      }
    };

    const clientReq = https.request(options, (clientRes) => {
      let body = "";
      clientRes.on("data", (chunk) => {
        body += chunk;
      });
      clientRes.on("end", () => {
        try {
          if (clientRes.statusCode === 200) {
            const data = JSON.parse(body);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({
              ok: true,
              balance: data.clients?.[0]?.wallet?.main_balance || 0,
              total_balance: data.clients?.[0]?.wallet?.total_balance || 0,
              bonus_point: data.clients?.[0]?.wallet?.bonus_point || 0,
              name: data.name,
              email: data.email
            }));
          } else {
            res.writeHead(clientRes.statusCode, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Lỗi từ phía CloudFly", details: body }));
          }
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Lỗi xử lý JSON phản hồi" }));
        }
      });
    });

    clientReq.on("error", (err) => {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Không thể kết nối đến CloudFly", details: err.message }));
    });

    clientReq.end();
    return;
  }

  // ── GET /api/sw-missing-images ───────────────────────────────────────────
  // Proxy sang SEO Writer (localhost:8501) lấy danh sách bài THIẾU ẢNH (step 6).
  // access key SEO Writer đọc từ config.json (sw_access_key) — không lộ ra frontend.
  if (req.method === "GET" && url === "/api/sw-missing-images") {
    let swKey = "";
    try { swKey = (JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")).sw_access_key) || ""; } catch (e) {}
    const pr = http.request({
      hostname: "127.0.0.1", port: 8501, path: "/api/missing-images", method: "GET",
      headers: { "x-access-key": swKey },
    }, (pres) => {
      let body = "";
      pres.on("data", (c) => { body += c; });
      pres.on("end", () => {
        res.writeHead(pres.statusCode === 200 ? 200 : 502,
                      { "Content-Type": "application/json; charset=utf-8" });
        res.end(pres.statusCode === 200 ? body : JSON.stringify({ items: [], error: "SEO Writer " + pres.statusCode }));
      });
    });
    pr.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ items: [], error: "Không gọi được SEO Writer: " + e.message }));
    });
    pr.end();
    return;
  }

  // ── GET /api/wp-posts?domain=&type=&per_page= ────────────────────────────
  // Proxy lay danh sach bai viet tu WordPress REST. Fetch tu VPS nen qua duoc
  // lop bao mat chan IP la cua cac site .fashion/.io/.health.
  if (req.method === "GET" && url === "/api/wp-posts") {
    const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
    let domain = (q.get("domain") || "").trim();
    const type = (q.get("type") === "pages") ? "pages" : "posts";
    const perPage = Math.min(parseInt(q.get("per_page") || "100", 10) || 100, 100);
    if (!domain) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Thieu domain" }));
      return;
    }
    domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    // Cho phep client truyen path wp-json bat ky (chi /wp-json/ de an toan) — vd lay categories.
    const rawPath = (q.get("path") || "").trim();
    const path = (rawPath && rawPath.indexOf("/wp-json/") === 0)
      ? rawPath
      : `/wp-json/wp/v2/${type}?per_page=${perPage}&orderby=date&order=desc`
        + `&_fields=id,title,link,date,modified,status,categories`;
    // Theo redirect (Cloudflare hay chuyen www / doi host) — toi da 4 lan
    const fetchJson = (host, pth, hops) => {
      if (hops > 4) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Qua nhieu redirect" }));
        return;
      }
      const reqHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json"
      };
      const lvl1 = getLevel1Auth(host) || getLevel1Auth(domain);   // vuot bao mat cap 1
      if (lvl1) reqHeaders["Authorization"] = lvl1;
      const cr = https.request({
        hostname: host, path: pth, method: "GET",
        headers: reqHeaders
      }, (cres) => {
        // 301/302/307/308 -> di theo Location
        if ([301, 302, 307, 308].indexOf(cres.statusCode) >= 0 && cres.headers.location) {
          cres.resume();
          let loc = cres.headers.location;
          let nHost = host, nPath = loc;
          if (/^https?:\/\//i.test(loc)) {
            const u = new URL(loc);
            nHost = u.hostname;
            nPath = u.pathname + (u.search || "");
          }
          // Neu bi chuyen ve trang chu thi giu lai duong dan REST
          if (nPath === "/" || nPath === "") nPath = pth;
          fetchJson(nHost, nPath, hops + 1);
          return;
        }
        let body = "";
        cres.on("data", (c) => { body += c; });
        cres.on("end", () => {
          res.writeHead(cres.statusCode === 200 ? 200 : 502,
                        { "Content-Type": "application/json; charset=utf-8" });
          if (cres.statusCode === 200) {
            res.end(JSON.stringify({
              ok: true, host: host,
              total: cres.headers["x-wp-total"] || null,
              items: safeJson(body)
            }));
          } else {
            res.end(JSON.stringify({ error: `WordPress tra ve ${cres.statusCode}`, detail: body.slice(0, 200) }));
          }
        });
      });
      cr.on("error", (e) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Khong ket noi duoc " + host, detail: e.message }));
      });
      cr.end();
    };
    fetchJson(domain, path, 0);
    return;
  }

  // ── POST /api/gsc-inspect ────────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/gsc-inspect") {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      
      const { token, siteUrl, inspectionUrl } = parsed;
      if (!token || !siteUrl || !inspectionUrl) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Thiếu token, siteUrl hoặc inspectionUrl" }));
        return;
      }

      const postData = JSON.stringify({
        inspectionUrl: inspectionUrl,
        siteUrl: siteUrl
      });

      const options = {
        hostname: "searchconsole.googleapis.com",
        path: "/v1/urlInspection/index:inspect",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(postData)
        }
      };

      const clientReq = https.request(options, (clientRes) => {
        let resBody = "";
        clientRes.on("data", (chunk) => {
          resBody += chunk;
        });
        clientRes.on("end", () => {
          res.writeHead(clientRes.statusCode, { "Content-Type": "application/json; charset=utf-8" });
          res.end(resBody);
        });
      });

      clientReq.on("error", (err) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Không thể kết nối đến Google API", details: err.message }));
      });

      clientReq.write(postData);
      clientReq.end();
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Lỗi xử lý yêu cầu", details: err.message }));
    }
    return;
  }

  // ── POST /api/config ─────────────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/config") {
    try {
      const body   = await readBody(req);
      const parsed = JSON.parse(body); // validate JSON

      fs.writeFile(CONFIG_FILE, JSON.stringify(parsed, null, 2), "utf8", (err) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Cannot write config.json" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, message: "Config saved successfully!" }));
      });
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
    }
    return;
  }

  // ── GET /admin → serve admin.html ────────────────────────────────────────
  if (req.method === "GET" && (url === "/admin" || url === "/admin/")) {
    serveFile(res, path.join(STATIC_DIR, "admin.html"));
    return;
  }

  // ── GET / → serve index.html ─────────────────────────────────────────────
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    serveFile(res, path.join(STATIC_DIR, "index.html"));
    return;
  }

  // ── Static files (css, js, config.json, images…) ─────────────────────────
  if (req.method === "GET") {
    const safePath = path.join(STATIC_DIR, path.normalize(url));
    // Security: ensure path is still inside STATIC_DIR
    if (!safePath.startsWith(STATIC_DIR)) {
      res.writeHead(403);
      res.end("403 Forbidden");
      return;
    }
    serveFile(res, safePath);
    return;
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  res.writeHead(405);
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`✅  Dashboard server running on http://localhost:${PORT}`);
  console.log(`   Admin panel : http://localhost:${PORT}/admin`);
  console.log(`   Config API  : http://localhost:${PORT}/api/config`);
});
