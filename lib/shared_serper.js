const fs = require("fs"), path = require("path");

const F = process.env.SHARED_SERPER_FILE || path.join(__dirname, "..", "data", "shared_serper.json");

function read() {
  try {
    const o = JSON.parse(fs.readFileSync(F, "utf8"));
    return o && typeof o === "object" ? o : {};
  } catch (e) { return {}; }
}

function write(o) {
  fs.mkdirSync(path.dirname(F), { recursive: true });
  const t = F + ".tmp";
  fs.writeFileSync(t, JSON.stringify(o));
  fs.renameSync(t, F);
}

function out(o) {
  return { set: !!o.ts, key: o.key || "", credits: Number.isFinite(o.credits) ? o.credits : null, by: o.by || "", ts: o.ts || 0 };
}

const SRC = (process.env.SHARED_SERPER_SRC || "main=https://haihieu-tracker-default-rtdb.asia-southeast1.firebasedatabase.app/appData,s01=https://nthieucloud-dashboard-default-rtdb.asia-southeast1.firebasedatabase.app/appData")
  .split(",").map((x) => x.split("=")).filter((x) => x.length === 2);

function getJson(url) {
  const mod = url.startsWith("http:") ? require("http") : require("https");
  return new Promise((ok) => {
    const r = mod.get(url, { timeout: 8000 }, (res) => {
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (b += c));
      res.on("end", () => { if (res.statusCode !== 200) return ok(null); try { ok(JSON.parse(b)); } catch (e) { ok(null); } });
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", () => ok(null));
  });
}

let lastSeed = 0, seeding = null;
function seed(force) {
  if (read().ts) return Promise.resolve(false);
  if (seeding) return seeding;
  if (!force && Date.now() - lastSeed < 300000) return Promise.resolve(false);
  lastSeed = Date.now();
  seeding = (async () => {
    for (const [name, base] of SRC) {
      const viaFb = name === "main" && !process.env.SHARED_SERPER_SRC && require("./fbadmin").ready();
      const fget = viaFb ? (p) => require("./fbadmin").get("appData/" + p).catch(() => null) : (p) => getJson(base + "/" + p + ".json");
      const k = await fget("wtApiKey");
      if (typeof k !== "string" || !k.trim() || k.trim().length > 200) continue;
      const c = await fget("wtSerperCredits");
      const o = read();
      if (o.ts) return false;
      o.key = k.trim(); o.by = name + " (Firebase)"; o.ts = Date.now();
      if (Number.isFinite(+c) && c !== null) o.credits = Math.max(0, Math.round(+c));
      write(o);
      return true;
    }
    return false;
  })().finally(() => { seeding = null; });
  return seeding;
}

async function handle(req, res, space, readBody) {
  const json = (c, o) => { res.writeHead(c, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); };
  if (req.method === "GET") { await seed(); return json(200, out(read())); }
  if (req.method !== "POST") return json(405, { error: "method" });
  let b;
  try { b = JSON.parse((await readBody(req)) || "{}") || {}; } catch (e) { return json(400, { error: "JSON sai" }); }
  const o = read();
  if (b.seed && o.ts) return json(200, out(o));
  if (typeof b.key === "string") {
    const k = b.key.trim();
    if (k.length > 200) return json(400, { error: "Key quá dài" });
    if (b.seed && !k) return json(200, out(o));
    if (k !== o.key || !o.ts) { o.key = k; o.by = space || "main"; o.ts = Date.now(); }
  }
  if (b.credits !== undefined && b.credits !== null && b.credits !== "" && Number.isFinite(+b.credits)) o.credits = Math.max(0, Math.round(+b.credits));
  write(o);
  return json(200, out(o));
}

module.exports = { handle, read, seed };
