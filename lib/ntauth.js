const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");

const MAIN = {
  projectId: "haihieu-tracker",
  db: "https://haihieu-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
  defaultAdmins: ["konheodat01@gmail.com", "admin@nthieucloud.shop"],
};
const SPACES = {
  s01: { projectId: null, emails: ["konheodat2001@gmail.com"] },
};
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const SECRET_FILE = path.join(__dirname, "..", "auth_secret");
const TTL = 14 * 86400 * 1000;

let secret = null;
function getSecret() {
  if (secret) return secret;
  try { secret = fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch (e) {}
  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  }
  return secret;
}

const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (s) => crypto.createHmac("sha256", getSecret()).update(s).digest();
const sameStr = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function getJson(url, timeout) {
  return new Promise((resolve, reject) => {
    const r = https.get(url, { timeout: timeout || 8000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        try { resolve({ json: JSON.parse(body), headers: res.headers }); } catch (e) { reject(e); }
      });
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
  });
}

let certs = { keys: {}, until: 0 };
async function getCerts() {
  if (Date.now() < certs.until && Object.keys(certs.keys).length) return certs.keys;
  const { json, headers } = await getJson(CERT_URL);
  const m = /max-age=(\d+)/.exec(headers["cache-control"] || "");
  certs = { keys: json, until: Date.now() + Math.min(Number(m ? m[1] : 3600), 21600) * 1000 };
  return certs.keys;
}

const cache = {};
async function cached(key, ms, fn) {
  const c = cache[key];
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await fn();
  cache[key] = { at: Date.now(), v };
  return v;
}

function listOf(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  if (v && typeof v === "object") return Object.values(v).filter(Boolean).map(String);
  return [];
}

async function mainAdmins() {
  try {
    const v = await cached("admins", 300000, async () => (await getJson(MAIN.db + "/passwords/admin_emails.json")).json);
    return v == null ? MAIN.defaultAdmins : listOf(v);
  } catch (e) {
    return MAIN.defaultAdmins;
  }
}

function projectSpace(aud) {
  if (aud === MAIN.projectId) return "";
  for (const [k, s] of Object.entries(SPACES)) if (s.projectId && s.projectId === aud) return k;
  return null;
}

async function verifyIdToken(tok) {
  const parts = String(tok || "").split(".");
  if (parts.length !== 3) throw new Error("token sai định dạng");
  const head = JSON.parse(unb64u(parts[0]).toString("utf8"));
  const p = JSON.parse(unb64u(parts[1]).toString("utf8"));
  if (head.alg !== "RS256" || !head.kid) throw new Error("token sai thuật toán");
  const keys = await getCerts();
  const pem = keys[head.kid];
  if (!pem) throw new Error("token sai khoá ký");
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), crypto.createPublicKey(pem), unb64u(parts[2]));
  if (!ok) throw new Error("chữ ký token không hợp lệ");
  const now = Date.now() / 1000;
  const space = projectSpace(p.aud);
  if (space === null) throw new Error("token không thuộc project được phép");
  if (p.iss !== "https://securetoken.google.com/" + p.aud) throw new Error("token sai nơi cấp");
  if (!(p.exp > now) || !(p.iat <= now + 300) || !p.sub) throw new Error("token hết hạn");
  if (!p.email || p.email_verified !== true) throw new Error("email chưa xác minh");
  const email = String(p.email).toLowerCase();
  const allowed = space ? SPACES[space].emails : await mainAdmins();
  if (!allowed.some((x) => x.toLowerCase() === email)) throw new Error("email không có quyền");
  return { space, member: "admin", via: "google", email };
}

async function verifyPassword(user, pass) {
  user = String(user || "").trim();
  pass = String(pass || "");
  if (!pass) throw new Error("thiếu mật khẩu");
  if (!user || user.toLowerCase() === "admin") {
    const real = (await getJson(MAIN.db + "/passwords/admin.json")).json;
    if (typeof real !== "string" || !real || !sameStr(real, pass)) throw new Error("sai mật khẩu");
    return { space: "", member: "admin", via: "pass", email: "" };
  }
  const prof = (await getJson(MAIN.db + "/appData/staffProfiles.json")).json;
  const arr = Array.isArray(prof) ? prof : prof && typeof prof === "object" ? Object.values(prof) : [];
  const s = arr.find((x) => x && x.username === user);
  if (!s || typeof s.password !== "string" || !sameStr(s.password, pass) || s.status !== "Hoạt động") throw new Error("sai tài khoản hoặc mật khẩu");
  return { space: "", member: user, via: "pass", email: "" };
}

function issue(who) {
  const body = b64u(JSON.stringify({ sp: who.space, m: who.member, v: who.via, e: who.email, x: Date.now() + TTL }));
  return body + "." + b64u(hmac(body));
}

function check(tok) {
  const [body, sig] = String(tok || "").split(".");
  if (!body || !sig) return null;
  const want = hmac(body), got = unb64u(sig);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let p;
  try { p = JSON.parse(unb64u(body).toString("utf8")); } catch (e) { return null; }
  if (!p || !(p.x > Date.now())) return null;
  if (p.sp && !SPACES[p.sp]) return null;
  return { space: p.sp || "", member: p.m, via: p.v, email: p.e || "" };
}

const fails = new Map();
function limited(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.at > 900000) { fails.delete(ip); return false; }
  return f.n >= 10;
}
function failed(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.at > 900000) fails.set(ip, { n: 1, at: Date.now() });
  else f.n++;
}

async function login(body, ip) {
  if (limited(ip)) { const e = new Error("Thử sai quá nhiều lần, đợi 15 phút"); e.code = 429; throw e; }
  try {
    const who = body && body.idToken ? await verifyIdToken(body.idToken) : await verifyPassword(body && body.user, body && body.pass);
    fails.delete(ip);
    return { token: issue(who), space: who.space, member: who.member, exp: Date.now() + TTL };
  } catch (e) {
    failed(ip);
    const err = new Error("Không xác minh được đăng nhập: " + e.message);
    err.code = 401;
    throw err;
  }
}

module.exports = { login, check, SPACES, MAIN, _setCerts: (k) => { certs = { keys: k, until: Date.now() + 3600000 }; }, _cache: cache };
