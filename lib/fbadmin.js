const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const SA_FILE = process.env.NT_FB_SA || path.join(__dirname, "..", "fb_sa_main.json");
const DB_URL = process.env.NT_FB_DB || "https://haihieu-tracker-default-rtdb.asia-southeast1.firebasedatabase.app";
const EMU = process.env.NT_FB_EMU || "";
const NS = "haihieu-tracker-default-rtdb";

let sa = null;
function account() {
  if (sa) return sa;
  const j = JSON.parse(fs.readFileSync(SA_FILE, "utf8"));
  if (!j.client_email || !j.private_key) throw new Error("khoá service account thiếu client_email/private_key");
  sa = j;
  return sa;
}
function ready() {
  if (EMU) return true;
  try { account(); return true; } catch (e) { return false; }
}

const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function jwt(payload) {
  const a = account();
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(head + "." + body), a.private_key);
  return head + "." + body + "." + b64u(sig);
}

function req(method, url, headers, body, timeout) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const r = mod.request(u, { method, headers: headers || {}, timeout: timeout || 10000 }, (res) => {
      let t = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (t += c));
      res.on("end", () => {
        let j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (res.statusCode >= 300) return reject(new Error("HTTP " + res.statusCode + " " + String(t).slice(0, 160)));
        resolve(j);
      });
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    if (body != null) r.write(body);
    r.end();
  });
}

let tok = { v: "", until: 0 };
async function accessToken() {
  if (EMU) return "owner";
  if (tok.v && Date.now() < tok.until) return tok.v;
  const a = account();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt({
    iss: a.client_email, aud: a.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
  });
  const form = "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(assertion);
  const j = await req("POST", a.token_uri || "https://oauth2.googleapis.com/token", { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(form) }, form);
  tok = { v: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
  return tok.v;
}

function dbUrl(p) {
  const clean = String(p || "").replace(/^\/+|\/+$/g, "");
  if (EMU) return EMU.replace(/\/$/, "") + "/" + clean + ".json?ns=" + NS;
  return DB_URL + "/" + clean + ".json";
}

async function call(method, p, val) {
  const h = { Authorization: "Bearer " + (await accessToken()) };
  let body = null;
  if (val !== undefined) { body = JSON.stringify(val); h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(body); }
  return req(method, dbUrl(p), h, body);
}

const get = (p) => call("GET", p);
const set = (p, v) => call("PUT", p, v);
const patch = (p, v) => call("PATCH", p, v);
const remove = (p) => call("DELETE", p);

function customToken(uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const p = { aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now, exp: now + 3600, uid };
  if (claims) p.claims = claims;
  if (EMU) {
    const email = "firebase-adminsdk@emulator.iam.gserviceaccount.com";
    return b64u(JSON.stringify({ alg: "none", typ: "JWT" })) + "." + b64u(JSON.stringify(Object.assign({ iss: email, sub: email }, p))) + ".";
  }
  const a = account();
  return jwt(Object.assign({ iss: a.client_email, sub: a.client_email }, p));
}

const N = 16384;
function hash(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, 8, 1, salt.toString("base64"), h.toString("base64")].join("$");
}
function verify(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, want] = parts;
  const w = Buffer.from(want, "base64");
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, "base64"), w.length, { N: +n, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return got.length === w.length && crypto.timingSafeEqual(got, w);
}

module.exports = { get, set, patch, remove, customToken, hash, verify, ready, _setAccount: (j) => { sa = j; tok = { v: "", until: 0 }; } };
