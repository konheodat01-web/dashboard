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
