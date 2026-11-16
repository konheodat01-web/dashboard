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

async function handle(req, res, space, readBody) {
  const json = (c, o) => { res.writeHead(c, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); };
  if (req.method === "GET") return json(200, out(read()));
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

module.exports = { handle, read };
