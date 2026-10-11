const fs = require("fs");
const path = require("path");
const tls = require("tls");
const zlib = require("zlib");
const dns = require("dns").promises;
const crypto = require("crypto");
const D = require("./site_diagnose");

const REPORT_DIR = path.join(__dirname, "..", "data", "seo_audit");
const SA_FILE = "/root/gsc-bulk-tool/gsc-credentials.json";
const GAUTH = "/root/gsc-bulk-tool/node_modules/google-auth-library";
const CONFIG_FILE = path.join(__dirname, "..", "config.json");
const MAX_RUNNING = 2;
const MAX_ASSETS = 15;
const MAX_IMAGES = 20;
const BIN_MAX = 4 * 1024 * 1024;

const GROUPS = [
  { key: "common_seo", label: "SEO Cơ Bản", icon: "📝" },
  { key: "image_optimization", label: "Tối Ưu Hình Ảnh", icon: "🖼️" },
  { key: "speed_optimization", label: "Tốc Độ & Hiệu Năng", icon: "⚡" },
  { key: "web_vitals", label: "Core Web Vitals", icon: "📈" },
  { key: "security", label: "Bảo Mật", icon: "🔒" },
  { key: "mobile_ux", label: "Mobile & UX", icon: "📱" },
  { key: "errors", label: "Lỗi & Console", icon: "⚠️" },
  { key: "url_seo", label: "URL & Redirect", icon: "🔗" },
];

const C = (slug, name, relevance, group, fix) => ({ slug, name, relevance, group, fix });
const CHECKS = [
  C("title-tag", "Thẻ Title", 10, "common_seo", "Mỗi trang cần 1 thẻ <title> riêng, dài khoảng 50–60 ký tự, chứa từ khóa chính ở đầu và mô tả đúng nội dung trang."),
  C("description-tag", "Thẻ Meta Description", 10, "common_seo", "Thêm <meta name=\"description\"> dài 120–160 ký tự, có từ khóa chính và lời kêu gọi hành động. Với WordPress, nhập ở Rank Math / Yoast."),
  C("social-media-meta-tags", "Meta Tags mạng xã hội", 4, "common_seo", "Khai báo Open Graph (og:title, og:description, og:image, og:url) và twitter:card để link chia sẻ lên Facebook, Zalo, X hiển thị đẹp."),
  C("google-preview", "Xem trước trên Google", 0, "common_seo", "Kiểm tra tiêu đề và mô tả không bị Google cắt ngắn: tiêu đề ≤ 60 ký tự, mô tả ≤ 160 ký tự."),
  C("common-keywords", "Từ khóa phổ biến nhất", 0, "common_seo", "Các cụm từ lặp nhiều nhất phải phản ánh đúng chủ đề trang. Nếu từ khóa chính không nằm trong danh sách, hãy viết thêm nội dung xoay quanh nó."),
  C("common-keywords-usage", "Phân bố từ khóa", 10, "common_seo", "Đưa từ khóa phổ biến nhất vào thẻ Title, Meta Description và thẻ H1 để Google hiểu trang nói về gì."),
  C("keywords-cloud", "Đám mây từ khóa", 0, "common_seo", "Đám mây cho thấy mật độ chủ đề. Từ không liên quan xuất hiện nhiều thường đến từ menu, footer hoặc widget — nên gọn lại."),
  C("heading-tags", "Thẻ Heading", 10, "common_seo", "Mỗi trang dùng đúng 1 thẻ H1 chứa từ khóa chính, các mục con dùng H2/H3 theo thứ bậc, không dùng heading để trang trí."),
  C("robots-txt", "Robots.txt", 9, "common_seo", "Tạo file /robots.txt ở thư mục gốc, khai báo luật cho bot và dòng Sitemap: trỏ tới sitemap của site."),
  C("sitemap", "Sitemap", 9, "common_seo", "Tạo sitemap XML (Rank Math / Yoast tự tạo), khai báo trong robots.txt và gửi lên Google Search Console."),
  C("favicon", "Favicon", 2, "common_seo", "Thêm favicon (ảnh vuông ≥ 48×48) bằng <link rel=\"icon\">; với WordPress vào Giao diện → Tùy biến → Biểu tượng trang."),
  C("google-analytics", "Google Analytics", 5, "common_seo", "Gắn Google Analytics 4 (gtag.js) hoặc Google Tag Manager để đo lưu lượng truy cập."),
  C("structured-data", "Dữ liệu có cấu trúc", 5, "common_seo", "Thêm Schema JSON-LD phù hợp (Organization, WebSite, Article, BreadcrumbList, FAQ…) để có kết quả tìm kiếm nổi bật."),
  C("meta-charset", "Khai báo Charset", 3, "common_seo", "Đặt <meta charset=\"UTF-8\"> ngay đầu thẻ <head> để tiếng Việt không bị lỗi font."),
  C("deprecated-tags", "Thẻ HTML lỗi thời", 1, "common_seo", "Thay các thẻ cũ (<font>, <center>, <marquee>, <frame>…) bằng HTML5 và CSS."),
  C("noindex-tags", "Thẻ Noindex", 3, "common_seo", "Bỏ noindex khỏi các trang cần lên Google (meta robots và header X-Robots-Tag). WordPress: Cài đặt → Đọc → bỏ tích “Ngăn chặn công cụ tìm kiếm”."),
  C("canonical-tags", "Thẻ Canonical", 3, "common_seo", "Thêm <link rel=\"canonical\"> trỏ về URL chuẩn của trang để tránh nội dung trùng lặp."),
  C("nofollow-tags", "Thẻ Nofollow", 0, "common_seo", "Chỉ dùng nofollow cho link không muốn chuyển sức mạnh. Meta robots nofollow trên cả trang khiến Google không đi theo link nội bộ."),
  C("disallow-tags", "Disallow trong Robots.txt", 0, "common_seo", "Không chặn cả site (Disallow: /) hay thư mục chứa nội dung/CSS/JS cần Google đọc."),
  C("meta-refresh", "Meta Refresh", 1, "common_seo", "Bỏ <meta http-equiv=\"refresh\">, dùng redirect 301 phía máy chủ thay thế."),
  C("ads-txt", "Ads.txt", 1, "common_seo", "Nếu site chạy quảng cáo (AdSense…), tạo /ads.txt khai báo đơn vị bán quảng cáo được phép."),
  C("img-alt", "Thuộc tính Alt ảnh", 8, "image_optimization", "Mọi ảnh nội dung cần alt mô tả ngắn gọn bằng tiếng Việt có dấu; ảnh trang trí để alt=\"\"."),
  C("image-aspect-ratio", "Tỷ lệ ảnh", 6, "image_optimization", "Hiển thị ảnh đúng tỷ lệ gốc: khai báo width/height khớp ảnh, hoặc dùng object-fit thay vì ép kéo dãn."),
  C("image-size", "Kích thước ảnh", 5, "image_optimization", "Nén ảnh và resize đúng kích thước hiển thị; ảnh nội dung nên dưới 200KB."),
  C("next-gen-image-format", "Định dạng ảnh hiện đại", 8, "image_optimization", "Chuyển ảnh JPG/PNG sang WebP hoặc AVIF (plugin Converter for Media, ShortPixel…) để giảm 25–50% dung lượng."),
  C("img-metadata", "Metadata ảnh", 2, "image_optimization", "Xóa dữ liệu EXIF (thông tin máy ảnh, GPS) khỏi ảnh trước khi đăng để giảm dung lượng và bảo vệ riêng tư."),
  C("loading-speed", "Tốc độ tải trang", 10, "speed_optimization", "Bật cache trang (WP Rocket, LiteSpeed Cache), nén ảnh, dùng CDN và giảm plugin/JS không cần thiết để trang tải dưới 3 giây."),
  C("html-size", "Dung lượng HTML", 3, "speed_optimization", "Giữ HTML dưới 100KB: bỏ CSS/JS nội tuyến lớn, bớt widget, phân trang nội dung dài."),
  C("dom-size", "Kích thước DOM", 3, "speed_optimization", "Giảm số thẻ HTML (dưới 1.500): bỏ wrapper thừa của page builder, tránh menu/footer quá lớn."),
  C("html-compression", "Nén HTML (GZIP/Brotli)", 3, "speed_optimization", "Bật nén GZIP hoặc Brotli trên máy chủ / CDN (Cloudflare tự bật)."),
  C("js-execution-time", "Thời gian thực thi JS", 5, "speed_optimization", "Trì hoãn (defer/delay) JavaScript không cần thiết, bỏ script bên thứ ba nặng, tách mã chỉ tải khi cần."),
  C("js-minification", "Minify JavaScript", 7, "speed_optimization", "Bật minify JS trong plugin cache (WP Rocket, LiteSpeed, Autoptimize) hoặc ở Cloudflare."),
  C("css-minification", "Minify CSS", 7, "speed_optimization", "Bật minify CSS trong plugin cache hoặc ở Cloudflare."),
  C("render-blocking-resources", "Tài nguyên chặn render", 10, "speed_optimization", "Thêm defer/async cho script trong <head>, gộp và tải không đồng bộ CSS không quan trọng, inline CSS quan trọng."),
  C("page-objects", "Số HTTP Request", 2, "speed_optimization", "Giảm số file tải về: gộp CSS/JS, lazy-load ảnh, bỏ font và plugin thừa."),
  C("cdn-usage", "Sử dụng CDN", 7, "speed_optimization", "Đưa site qua CDN (Cloudflare miễn phí, BunnyCDN…) để tải nhanh ở mọi khu vực."),
  C("image-caching", "Cache ảnh", 5, "speed_optimization", "Đặt Cache-Control max-age ≥ 30 ngày cho ảnh (plugin cache hoặc cấu hình máy chủ / CDN)."),
  C("js-caching", "Cache JavaScript", 5, "speed_optimization", "Đặt Cache-Control max-age ≥ 30 ngày cho file .js."),
  C("css-caching", "Cache CSS", 5, "speed_optimization", "Đặt Cache-Control max-age ≥ 30 ngày cho file .css."),
  C("web-vitals-ttfb", "Time To First Byte (TTFB)", 5, "web_vitals", "Giảm TTFB dưới 0,8 giây: dùng cache trang, hosting gần người dùng (VN/SG), nâng cấp PHP và database."),
  C("web-vitals-fcp", "First Contentful Paint (FCP)", 5, "web_vitals", "Đưa FCP dưới 1,8 giây: giảm CSS/JS chặn render, preload font, tối ưu máy chủ."),
  C("web-vitals-lcp", "Largest Contentful Paint (LCP)", 10, "web_vitals", "Đưa LCP dưới 2,5 giây: nén và preload ảnh lớn đầu trang, không lazy-load ảnh đầu trang, dùng CDN."),
  C("web-vitals-cls", "Cumulative Layout Shift (CLS)", 10, "web_vitals", "Giữ CLS dưới 0,1: khai báo width/height cho ảnh, iframe, quảng cáo; tránh chèn nội dung đẩy bố cục khi tải."),
  C("https-encryption", "SSL/HTTPS", 10, "security", "Cài chứng chỉ SSL (Let's Encrypt / Cloudflare) và chuyển hướng 301 toàn bộ HTTP sang HTTPS."),
  C("mixed-content-type", "Mixed Content", 8, "security", "Đổi mọi link tài nguyên http:// sang https:// (plugin Better Search Replace hoặc Really Simple SSL)."),
  C("http2", "HTTP/2", 4, "security", "Bật HTTP/2 (hoặc HTTP/3) trên máy chủ / CDN — Cloudflare bật sẵn."),
  C("hsts", "HSTS", 2, "security", "Thêm header Strict-Transport-Security: max-age=31536000; includeSubDomains để trình duyệt luôn dùng HTTPS."),
  C("plaintext-emails", "Email lộ trên trang", 0, "security", "Ẩn email dạng chữ thường (dùng form liên hệ hoặc mã hóa email) để tránh bot thu thập gửi spam."),
  C("cross-origin-links", "Link Cross-Origin", 4, "security", "Thêm rel=\"noopener noreferrer\" cho link mở tab mới (target=\"_blank\") trỏ ra ngoài."),
  C("spf-record", "Bản ghi SPF", 2, "security", "Thêm bản ghi TXT SPF (v=spf1 …) cho tên miền để chống giả mạo email."),
  C("viewport", "Meta Viewport", 4, "mobile_ux", "Thêm <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> để hiển thị đúng trên điện thoại."),
  C("media-queries", "Media Queries (Responsive)", 10, "mobile_ux", "Dùng giao diện responsive có @media query cho các kích thước màn hình."),
  C("mobile-snapshot", "Ảnh chụp giao diện Mobile", 0, "mobile_ux", "Xem giao diện trên điện thoại có bị vỡ, chữ quá nhỏ hay nút bấm quá sát nhau không."),
  C("custom-404", "Trang 404 tùy chỉnh", 6, "mobile_ux", "Tạo trang 404 riêng có ô tìm kiếm và link về trang chủ / danh mục, trả đúng mã 404."),
  C("js-errors", "Lỗi JavaScript", 8, "errors", "Mở trang với DevTools → Console, sửa các lỗi JavaScript (thường do plugin/theme xung đột hoặc file thiếu)."),
  C("console-errors", "Lỗi Console", 3, "errors", "Sửa các lỗi trong Console: file 404, tài nguyên bị chặn, lỗi CORS, cảnh báo bảo mật."),
  C("url-canonicalization", "Canonicalization URL", 10, "url_seo", "Chọn 1 phiên bản chuẩn (https + có/không www) và 301 các phiên bản còn lại về đó."),
  C("http-redirects", "Redirect URL", 2, "url_seo", "Giảm chuỗi chuyển hướng: URL nhập vào nên tới trang đích trong tối đa 1 lần 301."),
];
const BY_SLUG = Object.fromEntries(CHECKS.map(c => [c.slug, c]));

const STOP = new Set(("và của là có cho các những được với trong này một không để khi người đến từ theo tại về như thì đã sẽ cũng nhiều bạn chúng tôi ra vào lên nên rất hơn nhất còn hay hoặc nếu mà vì do bị ở trên dưới đó đây nào gì sau trước lại đang chỉ mỗi cùng thể việc làm cách nhưng vẫn rằng đều chưa nhằm qua giữa bởi luôn hãy xem thêm tất cả sự các anh chị em mình họ ta nó ai đâu bao giờ thế vậy nữa rồi đi tới năm ngày tháng giờ trang chủ liên hệ đăng nhập ký tìm kiếm menu home the and of to a in for is on with at by from or an be this that are as it you your we our can will all more about".split(" ")));

const jobs = new Map();
let running = 0;

const ENT = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®" };
function decodeEnt(s) { return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? (() => { try { return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)); } catch (x) { return m; } })() : (ENT[e.toLowerCase()] ?? m)); }
const strip = h => decodeEnt(String(h || "").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag, name) => { const m = tag.match(new RegExp("\\s" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i")); return m ? decodeEnt(m[2] ?? m[3] ?? m[4] ?? "") : null; };
const tags = (html, name) => html.match(new RegExp("<" + name + "\\b[^>]*>", "gi")) || [];
const metaBy = (html, key, val) => tags(html, "meta").find(t => (attr(t, key) || "").toLowerCase() === val.toLowerCase());
const fmtKB = b => (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
const fmtS = ms => (ms / 1000).toFixed(2).replace(".", ",") + " giây";
const abs = (u, base) => { try { return new URL(u, base).toString(); } catch (e) { return null; } };

async function fetchBin(url, maxBytes) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("chỉ hỗ trợ http/https");
  await D.assertPublicHost(u.hostname);
  const res = await fetch(url, { headers: { "User-Agent": D.UA, "Accept-Encoding": "gzip, deflate, br" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  const chunks = []; let size = 0;
  if (res.body) {
    for await (const c of res.body) { size += c.length; if (size > (maxBytes || BIN_MAX)) break; chunks.push(c); }
  }
  return { status: res.status, headers: res.headers, buf: Buffer.concat(chunks), size, url: res.url };
}

async function rawEncoding(url) {
  const u = new URL(url);
  await D.assertPublicHost(u.hostname);
  const mod = u.protocol === "https:" ? require("https") : require("http");
  return new Promise(resolve => {
    const r = mod.request(url, { method: "GET", headers: { "User-Agent": D.UA, "Accept-Encoding": "gzip, deflate, br", "Accept": "text/html" }, timeout: 15000 }, res => {
      resolve({ enc: res.headers["content-encoding"] || "", len: Number(res.headers["content-length"] || 0), status: res.statusCode });
      res.destroy();
    });
    r.on("timeout", () => { r.destroy(); resolve({ enc: "", status: 0 }); });
    r.on("error", () => resolve({ enc: "", status: 0 }));
    r.end();
  });
}

function alpn(host) {
  return new Promise(resolve => {
    const s = tls.connect({ host, port: 443, servername: host, ALPNProtocols: ["h2", "http/1.1"], timeout: 10000 }, () => { const p = s.alpnProtocol; s.end(); resolve(p || ""); });
    s.on("timeout", () => { s.destroy(); resolve(""); });
    s.on("error", () => resolve(""));
  });
}

function maxAge(h) {
  const cc = (h.get("cache-control") || "").toLowerCase();
  if (/no-store|no-cache/.test(cc)) return 0;
  const m = cc.match(/max-age=(\d+)/);
  if (m) return Number(m[1]);
  const ex = h.get("expires");
  if (ex) { const t = Date.parse(ex) - Date.now(); return t > 0 ? Math.round(t / 1000) : 0; }
  return 0;
}

function isMinified(code) {
  const t = code.trim();
  if (t.length < 2000) return true;
  const lines = t.split("\n");
  const avg = t.length / lines.length;
  const ws = (t.match(/[ \t]/g) || []).length / t.length;
  return avg > 200 || ws < 0.08;
}

function hasExif(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 < buf.length && i < 65536) {
    if (buf[i] !== 0xff) return false;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.slice(i + 4, i + 10).toString("latin1").startsWith("Exif")) return true;
    if (marker === 0xda) return false;
    i += 2 + len;
  }
  return false;
}

function imgType(buf, ct) {
  if (buf.length >= 12) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
    if (buf.slice(4, 12).toString("latin1").startsWith("ftypavi")) return "avif";
    if (buf.slice(0, 3).toString("latin1") === "GIF") return "gif";
    if (/^\s*<(\?xml|svg)/i.test(buf.slice(0, 100).toString("utf8"))) return "svg";
  }
  return (ct || "").split("/")[1] || "?";
}

function keywords(text) {
  const words = text.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter(w => w && w.length > 1 && !/^\d+$/.test(w));
  const uni = new Map(), bi = new Map(), tri = new Map();
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    if (!STOP.has(a)) uni.set(a, (uni.get(a) || 0) + 1);
    const b = words[i + 1], c = words[i + 2];
    if (b && !STOP.has(a) && !STOP.has(b)) bi.set(a + " " + b, (bi.get(a + " " + b) || 0) + 1);
    if (b && c && !STOP.has(a) && !STOP.has(c)) tri.set(a + " " + b + " " + c, (tri.get(a + " " + b + " " + c) || 0) + 1);
  }
  const top = (m, n, min) => [...m].filter(([, c]) => c >= min).sort((x, y) => y[1] - x[1]).slice(0, n);
  const phrases = [...top(tri, 5, 3), ...top(bi, 10, 2)].sort((x, y) => y[1] * y[0].split(" ").length - x[1] * x[0].split(" ").length);
  const seen = []; const out = [];
  for (const [k, c] of phrases) { if (seen.some(s => s.includes(k))) continue; seen.push(k); out.push({ k, c }); if (out.length >= 8) break; }
  if (out.length < 5) for (const [k, c] of top(uni, 10, 2)) { if (!out.some(o => o.k.includes(k))) out.push({ k, c }); if (out.length >= 8) break; }
  return { top: out, cloud: top(uni, 40, 2).map(([k, c]) => ({ k, c })), total: words.length };
}

let _tok = null;
async function psiAuth() {
  let key = "";
  try { key = (JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")).psi_key) || ""; } catch (e) {}
  if (key) return { q: "&key=" + encodeURIComponent(key), h: {} };
  if (_tok && _tok.exp > Date.now() + 60000) return { q: "", h: { Authorization: "Bearer " + _tok.v } };
  try {
    const { GoogleAuth } = require(GAUTH);
    const auth = new GoogleAuth({ keyFile: SA_FILE, scopes: ["https://www.googleapis.com/auth/cloud-platform", "openid"] });
    const c = await auth.getClient();
    const t = await c.getAccessToken();
    _tok = { v: t.token, exp: Date.now() + 50 * 60000 };
    return { q: "", h: { Authorization: "Bearer " + t.token } };
  } catch (e) { return { q: "", h: {} }; }
}

async function runPsi(url) {
  const a = await psiAuth();
  const q = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=best-practices&locale=vi${a.q}`;
  const r = await fetch(q, { headers: a.h, signal: AbortSignal.timeout(110000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.lighthouseResult) {
    const msg = (j.error && j.error.message) || ("HTTP " + r.status);
    throw new Error(/quota|Quota/.test(msg) ? "Google PageSpeed hết lượt miễn phí hôm nay" : /has not been used|disabled/.test(msg) ? "Chưa bật PageSpeed Insights API cho tài khoản Google của tool" : msg.slice(0, 160));
  }
  return j;
}

const psiQ = [];
const psiJobs = new Map();
const psiWaiters = [];
let psiSeen = 0;
const psiAlive = () => Date.now() - psiSeen < 45000 || psiWaiters.length > 0;

function psiGive(j, w) {
  j.status = "running"; j.taken = Date.now();
  if (j.onTake) j.onTake();
  w.res({ job: { id: j.id, url: j.url } });
}

function psiNext(waitMs) {
  psiSeen = Date.now();
  const j = psiQ.shift();
  if (j) { j.status = "running"; j.taken = Date.now(); if (j.onTake) j.onTake(); return { promise: Promise.resolve({ job: { id: j.id, url: j.url } }), cancel: () => {} }; }
  let w;
  const promise = new Promise(res => {
    w = { res, t: setTimeout(() => { const i = psiWaiters.indexOf(w); if (i >= 0) psiWaiters.splice(i, 1); psiSeen = Date.now(); res({ job: null }); }, Math.min(Math.max(waitMs || 0, 0), 25000)) };
    psiWaiters.push(w);
  });
  return { promise, cancel: () => { const i = psiWaiters.indexOf(w); if (i >= 0) { psiWaiters.splice(i, 1); clearTimeout(w.t); } } };
}

function psiEnqueue(url, onTake) {
  const id = crypto.randomBytes(6).toString("hex");
  const j = { id, url, status: "queued", created: Date.now(), onTake };
  const p = new Promise((resolve, reject) => { j.resolve = resolve; j.reject = reject; });
  psiJobs.set(id, j);
  const w = psiWaiters.shift();
  if (w) { clearTimeout(w.t); psiGive(j, w); } else psiQ.push(j);
  return { id, p };
}

function psiDrop(id) {
  const i = psiQ.findIndex(x => x.id === id);
  if (i >= 0) psiQ.splice(i, 1);
  psiJobs.delete(id);
}

function psiResult(body) {
  psiSeen = Date.now();
  const j = psiJobs.get(String(body && body.id || ""));
  if (!j) return false;
  psiJobs.delete(j.id);
  if (body.ok && body.lhr && body.lhr.audits) j.resolve(body.lhr); else j.reject(new Error(String(body.error || "tiện ích không đo được").slice(0, 200)));
  return true;
}

function note(job, text) {
  job.meta.note = text;
  for (const fn of job.listeners) { try { fn({ note: text }); } catch (e) {} }
}

async function getPsi(url, job) {
  let extErr = "";
  if (psiAlive()) {
    note(job, "Đang chờ tiện ích GG AI Mode Capture đo PageSpeed…");
    const { id, p } = psiEnqueue(url, () => note(job, "Tiện ích đang đo PageSpeed trên pagespeed.web.dev (khoảng 20–60 giây)…"));
    let to;
    try {
      const lhr = await Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => rej(new Error("quá 4 phút chưa có kết quả")), 240000); })]);
      return { j: { lighthouseResult: lhr }, via: "tiện ích (pagespeed.web.dev)" };
    } catch (e) { extErr = e.message; psiDrop(id); }
    finally { clearTimeout(to); }
    note(job, "Tiện ích không đo được PageSpeed (" + extErr + ") — thử Google PageSpeed API…");
  }
  try { return { j: await runPsi(url), via: "Google PageSpeed API" }; }
  catch (e) { return { err: extErr ? "tiện ích: " + extErr + "; API: " + e.message : "cửa sổ Chạy nền của tiện ích GG AI Mode Capture chưa mở, và " + e.message.charAt(0).toLowerCase() + e.message.slice(1) }; }
}

function newJob(url) {
  const guid = crypto.randomBytes(8).toString("hex");
  const job = { guid, url, created: Date.now(), results: {}, order: [], listeners: new Set(), done: false, score: null, error: "", meta: {} };
  jobs.set(guid, job);
  for (const [g, j] of jobs) if (Date.now() - j.created > 2 * 3600000) jobs.delete(g);
  return job;
}

function emit(job, slug, result) {
  if (job.results[slug]) return;
  const c = BY_SLUG[slug];
  const r = { status: result.status, message: result.message || "", data: result.data || null, how_to_fix: c.fix };
  job.results[slug] = r;
  job.order.push(slug);
  const ev = { slug, name: c.name, group: c.group, relevance: c.relevance, result: r, completed: job.order.length, total: CHECKS.length };
  for (const fn of job.listeners) { try { fn(ev); } catch (e) {} }
}

function scoreOf(results) {
  let t = 0, s = 0;
  for (const c of CHECKS) {
    const r = results[c.slug];
    if (!r || !c.relevance || r.status === "skipped") continue;
    t += c.relevance;
    if (r.status === "passed") s += c.relevance; else if (r.status === "warning") s += 0.5 * c.relevance;
  }
  return t > 0 ? Math.round(s / t * 100) : 0;
}

function groupScores(results) {
  return GROUPS.map(g => {
    const cs = CHECKS.filter(c => c.group === g.key);
    let t = 0, s = 0, p = 0, w = 0, f = 0;
    for (const c of cs) {
      const r = results[c.slug]; if (!r) continue;
      if (r.status === "passed") p++; else if (r.status === "warning") w++; else if (r.status === "failed") f++;
      if (!c.relevance || r.status === "skipped") continue;
      t += c.relevance; s += r.status === "passed" ? c.relevance : r.status === "warning" ? c.relevance / 2 : 0;
    }
    return { key: g.key, label: g.label, icon: g.icon, score: t ? Math.round(s / t * 100) : null, passed: p, warning: w, failed: f };
  });
}

function finish(job) {
  job.done = true;
  job.score = scoreOf(job.results);
  const rep = report(job);
  try { fs.mkdirSync(REPORT_DIR, { recursive: true }); fs.writeFileSync(path.join(REPORT_DIR, job.guid + ".json"), JSON.stringify(rep)); } catch (e) {}
  for (const fn of job.listeners) { try { fn({ done: true, score: job.score, report: rep }); } catch (e) {} }
  job.listeners.clear();
}

function report(job) {
  const counts = { passed: 0, warning: 0, failed: 0, skipped: 0 };
  for (const r of Object.values(job.results)) counts[r.status] = (counts[r.status] || 0) + 1;
  return { guid: job.guid, url: job.url, final_url: job.meta.final || job.url, created: job.created, duration: Date.now() - job.created,
    score: job.score ?? scoreOf(job.results), counts, groups: groupScores(job.results), error: job.error,
    checks: CHECKS.map(c => ({ slug: c.slug, name: c.name, group: c.group, relevance: c.relevance, result: job.results[c.slug] || null })) };
}

async function audit(job) {
  const E = (slug, status, message, data) => emit(job, slug, { status, message, data });
  let start = job.url;
  if (!/^https?:\/\//i.test(start)) start = "https://" + start;
  const host0 = new URL(start).hostname.toLowerCase();
  const roots = new Set([D.rootOf(host0)]);
  let main;
  try { main = await D.fetchFollow(start, roots, null, null, true); }
  catch (e) { main = null; job.error = "Không truy cập được trang: " + e.message; }
  if (!main || !main.body || main.status >= 400 || main.status === 0) {
    if (!job.error) job.error = main ? `Trang trả về mã ${main.status || "lỗi"} — không phân tích được` : "Không truy cập được trang";
    for (const c of CHECKS) E(c.slug, "skipped", job.error);
    return;
  }
  const finalUrl = main.final;
  job.meta.final = finalUrl;
  const fu = new URL(finalUrl);
  const origin = fu.origin;
  const host = fu.hostname;
  const root = D.rootOf(host);
  roots.add(root);
  const html = main.body;
  const head = (html.match(/<head\b[\s\S]*?<\/head>/i) || [html.slice(0, 20000)])[0];
  const bodyHtml = (html.match(/<body\b[\s\S]*<\/body>/i) || [html])[0];
  const H = main.headers;

  const psiP = getPsi(finalUrl, job);

  const title = decodeEnt(((head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim());
  if (!title) E("title-tag", "failed", "Trang không có thẻ Title.");
  else if (title.length < 30 || title.length > 65) E("title-tag", "warning", `Title dài ${title.length} ký tự (nên 50–60).`, { items: [title] });
  else E("title-tag", "passed", `Title dài ${title.length} ký tự — hợp lý.`, { items: [title] });

  const dtag = metaBy(head, "name", "description");
  const desc = dtag ? (attr(dtag, "content") || "").trim() : "";
  if (!desc) E("description-tag", "failed", "Trang không có Meta Description.");
  else if (desc.length < 70 || desc.length > 170) E("description-tag", "warning", `Meta Description dài ${desc.length} ký tự (nên 120–160).`, { items: [desc] });
  else E("description-tag", "passed", `Meta Description dài ${desc.length} ký tự — hợp lý.`, { items: [desc] });

  const og = ["og:title", "og:description", "og:image", "og:url", "og:type"].map(p => [p, (metaBy(head, "property", p) && attr(metaBy(head, "property", p), "content")) || ""]);
  const tw = ["twitter:card", "twitter:title", "twitter:image"].map(p => [p, (metaBy(head, "name", p) && attr(metaBy(head, "name", p), "content")) || ""]);
  const ogMiss = og.filter(x => !x[1]).map(x => x[0]);
  const rowsSm = [...og, ...tw].map(([k, v]) => [k, v ? v.slice(0, 120) : "— thiếu —"]);
  if (ogMiss.length >= 3) E("social-media-meta-tags", "failed", "Thiếu hầu hết thẻ Open Graph: " + ogMiss.join(", ") + ".", { table: { head: ["Thẻ", "Giá trị"], rows: rowsSm } });
  else if (ogMiss.length || !tw[0][1]) E("social-media-meta-tags", "warning", "Còn thiếu: " + [...ogMiss, ...(!tw[0][1] ? ["twitter:card"] : [])].join(", ") + ".", { table: { head: ["Thẻ", "Giá trị"], rows: rowsSm } });
  else E("social-media-meta-tags", "passed", "Đã khai báo đủ Open Graph và Twitter Card.", { table: { head: ["Thẻ", "Giá trị"], rows: rowsSm } });

  E("google-preview", title && desc && title.length <= 65 && desc.length <= 170 ? "passed" : "warning",
    title && desc ? "Kết quả dự kiến khi trang xuất hiện trên Google." : "Thiếu Title hoặc Meta Description — Google sẽ tự lấy nội dung khác.",
    { preview: { title: title.slice(0, 70), url: finalUrl, desc: desc.slice(0, 170) } });

  const text = strip(bodyHtml);
  const kw = keywords(text);
  E("common-keywords", kw.top.length ? "passed" : "warning", kw.top.length ? `Các cụm từ lặp nhiều nhất trong ${kw.total.toLocaleString("vi-VN")} từ của trang.` : "Trang quá ít chữ để xác định từ khóa.", { table: { head: ["Cụm từ", "Số lần"], rows: kw.top.map(x => [x.k, x.c]) } });
  const h1s = tags(html, "h1").length ? (html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []).map(strip) : [];
  const tl = title.toLowerCase(), dl = desc.toLowerCase(), hl = h1s.join(" ").toLowerCase();
  const usage = kw.top.slice(0, 5).map(x => [x.k, tl.includes(x.k) ? "✔" : "✘", dl.includes(x.k) ? "✔" : "✘", hl.includes(x.k) ? "✔" : "✘"]);
  const hit = usage.filter(u => u[1] === "✔" || u[2] === "✔").length;
  if (!usage.length) E("common-keywords-usage", "warning", "Không đủ nội dung để đánh giá phân bố từ khóa.");
  else if (usage[0][1] === "✔" && (usage[0][2] === "✔" || usage[0][3] === "✔")) E("common-keywords-usage", "passed", `Từ khóa phổ biến nhất “${usage[0][0]}” có trong Title và Description/H1.`, { table: { head: ["Từ khóa", "Title", "Description", "H1"], rows: usage } });
  else if (hit) E("common-keywords-usage", "warning", "Một phần từ khóa phổ biến chưa xuất hiện trong Title / Description / H1.", { table: { head: ["Từ khóa", "Title", "Description", "H1"], rows: usage } });
  else E("common-keywords-usage", "failed", "Các từ khóa phổ biến nhất không có trong Title và Meta Description.", { table: { head: ["Từ khóa", "Title", "Description", "H1"], rows: usage } });
  E("keywords-cloud", kw.cloud.length ? "passed" : "warning", kw.cloud.length ? "Mật độ các từ trong nội dung trang." : "Không đủ nội dung.", { cloud: kw.cloud });

  const hcount = [1, 2, 3, 4, 5, 6].map(n => (html.match(new RegExp("<h" + n + "\\b", "gi")) || []).length);
  const hlist = (html.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/gi) || []).slice(0, 25).map(h => ["H" + h[2], strip(h).slice(0, 120)]);
  const hdata = { table: { head: ["Thẻ", "Nội dung"], rows: hlist }, counts: hcount };
  if (!hcount[0]) E("heading-tags", "failed", "Trang không có thẻ H1.", hdata);
  else if (hcount[0] > 1) E("heading-tags", "warning", `Trang có ${hcount[0]} thẻ H1 (nên có đúng 1).`, hdata);
  else if (!hcount[1]) E("heading-tags", "warning", "Có H1 nhưng không có thẻ H2 nào chia mục nội dung.", hdata);
  else E("heading-tags", "passed", `1 thẻ H1, ${hcount[1]} H2, ${hcount[2]} H3 — cấu trúc hợp lý.`, hdata);

  const robotsP = D.fetchFollow(origin + "/robots.txt", roots, null, "text/plain,*/*").catch(() => null);
  const robots = await robotsP;
  const robotsOk = robots && robots.status === 200 && robots.body && !/<html/i.test(robots.body.slice(0, 300));
  let parsedRobots = null;
  if (robotsOk) {
    parsedRobots = D.parseRobots(robots.body);
    E("robots-txt", "passed", "Có file robots.txt.", { code: robots.body.slice(0, 1500) });
  } else E("robots-txt", "failed", "Không tìm thấy /robots.txt (mã " + (robots ? robots.status : "lỗi") + ").");
  const smUrls = [...new Set([...(parsedRobots ? parsedRobots.sitemaps : []), origin + "/sitemap_index.xml", origin + "/sitemap.xml", origin + "/wp-sitemap.xml"])];
  let smFound = null;
  for (const s of smUrls.slice(0, 6)) {
    try { const r = await D.fetchFollow(s, roots, null, "application/xml,text/xml,*/*"); if (r.status === 200 && /<(urlset|sitemapindex)\b/i.test(r.body)) { smFound = { url: r.final, n: (r.body.match(/<loc>/gi) || []).length, index: /<sitemapindex\b/i.test(r.body) }; break; } } catch (e) {}
  }
  if (smFound) E("sitemap", parsedRobots && parsedRobots.sitemaps.length ? "passed" : "warning", parsedRobots && parsedRobots.sitemaps.length ? `Có sitemap (${smFound.index ? "sitemap index, " : ""}${smFound.n} mục) và đã khai báo trong robots.txt.` : `Có sitemap nhưng chưa khai báo trong robots.txt.`, { items: [smFound.url] });
  else E("sitemap", "failed", "Không tìm thấy sitemap XML.");
  if (parsedRobots) {
    const v = D.robotsVerdict(parsedRobots, "/");
    const blocked = !!(v && v.blocked);
    E("disallow-tags", blocked ? "failed" : "passed", blocked ? "robots.txt đang chặn toàn bộ site (Disallow: /)." : "robots.txt không chặn trang chủ.", { code: robots.body.slice(0, 1500) });
  } else E("disallow-tags", "warning", "Không có robots.txt để kiểm tra.");

  const iconTag = tags(head, "link").find(t => /(^|\s)icon(\s|$)/i.test(attr(t, "rel") || ""));
  let favUrl = iconTag ? abs(attr(iconTag, "href"), finalUrl) : null;
  let favOk = !!favUrl;
  if (!favOk) { try { const r = await fetchBin(origin + "/favicon.ico", 300000); favOk = r.status === 200 && r.size > 0; favUrl = origin + "/favicon.ico"; } catch (e) {} }
  E("favicon", favOk ? "passed" : "failed", favOk ? "Trang có favicon." : "Không tìm thấy favicon.", favOk ? { image: favUrl, small: true } : null);

  const ga = html.match(/gtag\/js\?id=(G-[A-Z0-9]+|UA-[0-9-]+)|['"](G-[A-Z0-9]{6,})['"]|googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i);
  E("google-analytics", ga ? "passed" : "warning", ga ? "Đã gắn Google Analytics / Tag Manager (" + (ga[1] || ga[2] || (ga[0].includes("GTM") ? ga[0].match(/GTM-[A-Z0-9]+/i)?.[0] || "GTM" : "GTM")) + ")." : "Không thấy mã Google Analytics hoặc Tag Manager.");

  const types = D.schemaTypes(html);
  if (types.length) E("structured-data", types.some(t => /lỗi cú pháp/.test(t)) ? "warning" : "passed", "Có dữ liệu có cấu trúc: " + types.join(", ") + ".", { items: types });
  else E("structured-data", "failed", "Không tìm thấy dữ liệu có cấu trúc (JSON-LD / Microdata).");

  const cs = (head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i) || [])[1] || ((H.get("content-type") || "").match(/charset=([\w-]+)/i) || [])[1];
  E("meta-charset", cs ? (/utf-?8/i.test(cs) ? "passed" : "warning") : "failed", cs ? `Khai báo charset: ${cs.toUpperCase()}.` : "Không khai báo charset.");

  const dep = ["font", "center", "marquee", "frame", "frameset", "strike", "big", "tt", "acronym", "applet", "basefont", "dir", "blink", "isindex"].map(t => [t, (bodyHtml.match(new RegExp("<" + t + "\\b", "gi")) || []).length]).filter(x => x[1]);
  E("deprecated-tags", dep.length ? "warning" : "passed", dep.length ? "Còn dùng thẻ HTML lỗi thời: " + dep.map(x => `<${x[0]}> ×${x[1]}`).join(", ") + "." : "Không dùng thẻ HTML lỗi thời.");

  const mr = metaBy(head, "name", "robots");
  const mrc = (mr && attr(mr, "content") || "").toLowerCase();
  const xr = (H.get("x-robots-tag") || "").toLowerCase();
  if (/noindex/.test(mrc) || /noindex/.test(xr)) E("noindex-tags", "failed", "Trang đang chặn Google lập chỉ mục (noindex" + (xr.includes("noindex") ? " qua header X-Robots-Tag" : " trong meta robots") + ").", { items: [mrc && "meta robots: " + mrc, xr && "X-Robots-Tag: " + xr].filter(Boolean) });
  else E("noindex-tags", "passed", "Trang cho phép Google lập chỉ mục.");
  E("nofollow-tags", /nofollow/.test(mrc) || /nofollow/.test(xr) ? "warning" : "passed", /nofollow/.test(mrc) || /nofollow/.test(xr) ? "Meta robots có nofollow — Google không đi theo link trên trang." : "Không có nofollow ở cấp trang.");

  const canTag = tags(head, "link").find(t => (attr(t, "rel") || "").toLowerCase() === "canonical");
  const can = canTag ? abs(attr(canTag, "href"), finalUrl) : "";
  if (!can) E("canonical-tags", "warning", "Trang không có thẻ canonical.");
  else if (can.replace(/\/$/, "") !== finalUrl.replace(/\/$/, "")) E("canonical-tags", "warning", "Canonical trỏ sang URL khác trang đang xem.", { items: [can] });
  else E("canonical-tags", "passed", "Canonical trỏ về chính trang này.", { items: [can] });

  const refresh = tags(head, "meta").find(t => (attr(t, "http-equiv") || "").toLowerCase() === "refresh");
  E("meta-refresh", refresh ? "failed" : "passed", refresh ? "Trang dùng meta refresh: " + (attr(refresh, "content") || "") : "Không dùng meta refresh.");

  try {
    const r = await D.fetchFollow(origin + "/ads.txt", roots, null, "text/plain,*/*");
    const ok = r.status === 200 && r.body && !/<html/i.test(r.body.slice(0, 300));
    E("ads-txt", ok ? "passed" : "warning", ok ? "Có file ads.txt." : "Không có /ads.txt (chỉ cần nếu site chạy quảng cáo).", ok ? { code: r.body.slice(0, 800) } : null);
  } catch (e) { E("ads-txt", "warning", "Không có /ads.txt (chỉ cần nếu site chạy quảng cáo)."); }

  const imgTags = tags(bodyHtml, "img");
  const noAlt = imgTags.filter(t => attr(t, "alt") === null || (attr(t, "alt") || "").trim() === "" && !/(^|\s)(logo|icon)/i.test(attr(t, "class") || ""));
  const imgSrc = t => attr(t, "data-src") || attr(t, "data-lazy-src") || (attr(t, "srcset") || attr(t, "data-srcset") || "").split(",")[0].trim().split(/\s+/)[0] || attr(t, "src");
  if (!imgTags.length) E("img-alt", "passed", "Trang không có ảnh <img>.");
  else if (!noAlt.length) E("img-alt", "passed", `Cả ${imgTags.length} ảnh đều có alt.`);
  else E("img-alt", noAlt.length / imgTags.length > 0.3 ? "failed" : "warning", `${noAlt.length}/${imgTags.length} ảnh thiếu alt.`, { items: noAlt.slice(0, 15).map(t => (imgSrc(t) || "").slice(0, 160)) });

  const imgUrls = [...new Set(imgTags.map(imgSrc).filter(s => s && !/^data:/i.test(s)).map(s => abs(s, finalUrl)).filter(Boolean))].slice(0, MAX_IMAGES);
  const imgs = [];
  await Promise.all(imgUrls.map(async u => { try { const r = await fetchBin(u); if (r.status === 200) imgs.push({ u, size: r.size, type: imgType(r.buf, r.headers.get("content-type")), exif: hasExif(r.buf), age: maxAge(r.headers), host: new URL(r.url || u).hostname, h: r.headers }); } catch (e) {} }));
  const raster = imgs.filter(i => ["jpg", "png", "webp", "avif", "gif"].includes(i.type));
  const heavy = raster.filter(i => i.size > 200 * 1024).sort((a, b) => b.size - a.size);
  if (!raster.length) E("image-size", "passed", "Không có ảnh để kiểm tra.");
  else E("image-size", heavy.length ? (heavy.some(i => i.size > 500 * 1024) ? "failed" : "warning") : "passed", heavy.length ? `${heavy.length}/${raster.length} ảnh nặng hơn 200KB.` : `Cả ${raster.length} ảnh đều nhẹ hơn 200KB.`, { table: { head: ["Ảnh", "Định dạng", "Dung lượng"], rows: (heavy.length ? heavy : raster).slice(0, 15).map(i => [i.u.slice(0, 120), i.type.toUpperCase(), fmtKB(i.size)]) } });
  const old = raster.filter(i => ["jpg", "png", "gif"].includes(i.type) && i.size > 15 * 1024);
  if (!raster.length) E("next-gen-image-format", "passed", "Không có ảnh để kiểm tra.");
  else E("next-gen-image-format", old.length ? (old.length / raster.length > 0.5 ? "failed" : "warning") : "passed", old.length ? `${old.length}/${raster.length} ảnh còn dùng JPG/PNG/GIF thay vì WebP/AVIF.` : "Ảnh đã dùng định dạng hiện đại (WebP/AVIF).", { table: { head: ["Ảnh", "Định dạng", "Dung lượng"], rows: (old.length ? old : raster).slice(0, 15).map(i => [i.u.slice(0, 120), i.type.toUpperCase(), fmtKB(i.size)]) } });
  const ex = imgs.filter(i => i.exif);
  E("img-metadata", ex.length ? "warning" : "passed", ex.length ? `${ex.length} ảnh còn dữ liệu EXIF.` : "Ảnh không chứa dữ liệu EXIF.", ex.length ? { items: ex.slice(0, 10).map(i => i.u.slice(0, 160)) } : null);

  const htmlBytes = Buffer.byteLength(html);
  E("html-size", htmlBytes > 250 * 1024 ? "failed" : htmlBytes > 100 * 1024 ? "warning" : "passed", `Dung lượng HTML: ${fmtKB(htmlBytes)} (nên dưới 100 KB).`);
  const domNodes = (html.match(/<[a-zA-Z][\w-]*\b/g) || []).length;
  E("dom-size", domNodes > 3000 ? "failed" : domNodes > 1500 ? "warning" : "passed", `Trang có khoảng ${domNodes.toLocaleString("vi-VN")} phần tử HTML (nên dưới 1.500).`, { dom_nodes: domNodes });
  const enc = await rawEncoding(finalUrl);
  if (/br|gzip|deflate|zstd/i.test(enc.enc)) {
    let raw = 0; try { raw = zlib.gzipSync(Buffer.from(html)).length; } catch (e) {}
    E("html-compression", "passed", `HTML được nén bằng ${enc.enc.toUpperCase()}${raw ? ` (~${fmtKB(raw)} thay vì ${fmtKB(htmlBytes)})` : ""}.`);
  } else E("html-compression", "failed", "Máy chủ không nén HTML (không có GZIP/Brotli).");

  const scripts = tags(html, "script").filter(t => attr(t, "src")).map(t => ({ t, u: abs(attr(t, "src"), finalUrl) })).filter(x => x.u);
  const styles = tags(html, "link").filter(t => /stylesheet/i.test(attr(t, "rel") || "") && attr(t, "href")).map(t => ({ t, u: abs(attr(t, "href"), finalUrl) })).filter(x => x.u);
  const fetchAsset = async x => { try { const r = await fetchBin(x.u, 3 * 1024 * 1024); return { ...x, ok: r.status === 200, code: r.buf.toString("utf8"), size: r.size, age: maxAge(r.headers), host: new URL(r.url || x.u).hostname, h: r.headers }; } catch (e) { return { ...x, ok: false }; } };
  const [js, css] = await Promise.all([Promise.all(scripts.slice(0, MAX_ASSETS).map(fetchAsset)), Promise.all(styles.slice(0, MAX_ASSETS).map(fetchAsset))]);
  const jsOk = js.filter(x => x.ok), cssOk = css.filter(x => x.ok);
  const jsBad = jsOk.filter(x => !/\.min\.js/i.test(x.u) && !isMinified(x.code));
  const cssBad = cssOk.filter(x => !/\.min\.css/i.test(x.u) && !isMinified(x.code));
  E("js-minification", !jsOk.length ? "passed" : jsBad.length ? (jsBad.length > 2 ? "failed" : "warning") : "passed", !jsOk.length ? "Không có file JavaScript ngoài." : jsBad.length ? `${jsBad.length}/${jsOk.length} file JS chưa được minify.` : `Cả ${jsOk.length} file JS đã minify.`, jsBad.length ? { items: jsBad.map(x => x.u.slice(0, 160)) } : null);
  E("css-minification", !cssOk.length ? "passed" : cssBad.length ? (cssBad.length > 2 ? "failed" : "warning") : "passed", !cssOk.length ? "Không có file CSS ngoài." : cssBad.length ? `${cssBad.length}/${cssOk.length} file CSS chưa được minify.` : `Cả ${cssOk.length} file CSS đã minify.`, cssBad.length ? { items: cssBad.map(x => x.u.slice(0, 160)) } : null);

  const headScripts = tags(head, "script").filter(t => attr(t, "src") && !/\s(async|defer)\b/i.test(t) && !/type=["']?(module|application\/ld\+json)/i.test(t));
  const headCss = tags(head, "link").filter(t => /stylesheet/i.test(attr(t, "rel") || "") && !/media=["']?print/i.test(t) && !/onload=/i.test(t));
  const blocking = [...headScripts.map(t => "JS: " + attr(t, "src")), ...headCss.map(t => "CSS: " + attr(t, "href"))];
  E("render-blocking-resources", blocking.length > 6 ? "failed" : blocking.length > 2 ? "warning" : "passed", blocking.length ? `${blocking.length} tài nguyên đang chặn quá trình render trang.` : "Không có tài nguyên chặn render trong <head>.", blocking.length ? { items: blocking.slice(0, 20).map(s => s.slice(0, 160)) } : null);

  const objs = { "JavaScript": scripts.length, "CSS": styles.length, "Ảnh": imgTags.length, "Iframe": tags(bodyHtml, "iframe").length, "Font/preload": tags(head, "link").filter(t => /preload|font/i.test(t)).length };
  const nObj = Object.values(objs).reduce((a, b) => a + b, 0) + 1;
  E("page-objects", nObj > 100 ? "failed" : nObj > 60 ? "warning" : "passed", `Trang tải khoảng ${nObj} tài nguyên.`, { table: { head: ["Loại", "Số lượng"], rows: Object.entries(objs) }, page_objects: nObj });

  const cdnRe = /cloudflare|cloudfront|akamai|fastly|bunny|b-cdn|cdn|keycdn|stackpath|sucuri|jsdelivr|unpkg|cdnjs|googleapis|gstatic|wp\.com|azureedge|edgekey/i;
  const cdnHdr = h => h && (h.get("cf-ray") || h.get("x-amz-cf-id") || /cloudflare|akamai|bunny|fastly|cdn/i.test(h.get("server") || "") || h.get("x-cdn") || h.get("x-fastly-request-id") || h.get("cdn-cache"));
  const mainCdn = cdnHdr(H);
  const assets = [...jsOk, ...cssOk, ...imgs];
  const cdnAssets = assets.filter(a => cdnRe.test(a.host) || cdnHdr(a.h));
  E("cdn-usage", mainCdn || cdnAssets.length / Math.max(assets.length, 1) > 0.5 ? "passed" : cdnAssets.length ? "warning" : "failed", mainCdn ? "Site đi qua CDN (" + (H.get("server") || "CDN") + ")." : cdnAssets.length ? `${cdnAssets.length}/${assets.length} tài nguyên tải từ CDN.` : "Không thấy dấu hiệu dùng CDN.");

  const cacheCheck = (slug, list, label) => {
    const own = list.filter(a => D.inRoots(a.host, roots) || cdnRe.test(a.host));
    if (!own.length) { E(slug, "passed", `Không có ${label} để kiểm tra.`); return; }
    const bad = own.filter(a => a.age < 7 * 86400);
    E(slug, bad.length ? (bad.length / own.length > 0.5 ? "failed" : "warning") : "passed", bad.length ? `${bad.length}/${own.length} ${label} có thời gian cache dưới 7 ngày.` : `Cả ${own.length} ${label} đều được cache dài hạn.`, bad.length ? { table: { head: ["File", "Cache"], rows: bad.slice(0, 15).map(a => [a.u.slice(0, 120), a.age ? Math.round(a.age / 3600) + " giờ" : "không cache"]) } } : null);
  };
  cacheCheck("image-caching", imgs, "ảnh");
  cacheCheck("js-caching", jsOk, "file JS");
  cacheCheck("css-caching", cssOk, "file CSS");

  const isHttps = fu.protocol === "https:";
  let cert = null;
  if (isHttps) cert = await new Promise(res => { const s = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => { const c = s.getPeerCertificate(); res({ valid: s.authorized, to: c && c.valid_to, issuer: c && c.issuer && (c.issuer.O || c.issuer.CN) }); s.end(); }); s.on("error", () => res(null)); s.on("timeout", () => { s.destroy(); res(null); }); });
  let httpRedir = null;
  try { const r = await D.fetchFollow("http://" + host + fu.pathname, roots, null, null, true); httpRedir = r.final.startsWith("https://"); } catch (e) {}
  if (!isHttps) E("https-encryption", "failed", "Trang không dùng HTTPS.");
  else if (cert && !cert.valid) E("https-encryption", "failed", "Chứng chỉ SSL không hợp lệ.");
  else E("https-encryption", httpRedir === false ? "warning" : "passed", httpRedir === false ? "Có HTTPS nhưng bản HTTP không tự chuyển sang HTTPS." : "Trang dùng HTTPS" + (cert && cert.to ? `, chứng chỉ ${cert.issuer || ""} hết hạn ${new Date(cert.to).toLocaleDateString("vi-VN")}` : "") + ".");
  const mixed = isHttps ? [...new Set((html.match(/<(img|script|link|iframe|source|video|audio)\b[^>]*\s(src|href)=["']http:\/\/[^"']+/gi) || []).map(m => m.replace(/^[\s\S]*?(src|href)=["']/i, "")))] : [];
  E("mixed-content-type", !isHttps ? "skipped" : mixed.length ? "failed" : "passed", !isHttps ? "Trang không dùng HTTPS." : mixed.length ? `${mixed.length} tài nguyên tải qua http:// trên trang https.` : "Không có mixed content.", mixed.length ? { items: mixed.slice(0, 15) } : null);
  const proto = isHttps ? await alpn(host) : "";
  E("http2", proto === "h2" ? "passed" : "failed", proto === "h2" ? "Máy chủ hỗ trợ HTTP/2." : "Máy chủ chưa hỗ trợ HTTP/2" + (proto ? ` (đang dùng ${proto})` : "") + ".");
  const hsts = H.get("strict-transport-security");
  E("hsts", hsts ? "passed" : "warning", hsts ? "Có header HSTS: " + hsts : "Chưa bật HSTS.");
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).filter(e => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e)))];
  E("plaintext-emails", emails.length ? "warning" : "passed", emails.length ? `Lộ ${emails.length} địa chỉ email dạng chữ trên trang.` : "Không lộ email dạng chữ.", emails.length ? { items: emails.slice(0, 10) } : null);
  const blank = tags(bodyHtml, "a").filter(t => /_blank/i.test(attr(t, "target") || "") && /^https?:/i.test(attr(t, "href") || "") && !D.inRoots((() => { try { return new URL(attr(t, "href")).hostname; } catch (e) { return host; } })(), roots) && !/noopener|noreferrer/i.test(attr(t, "rel") || ""));
  E("cross-origin-links", blank.length ? "warning" : "passed", blank.length ? `${blank.length} link mở tab mới ra ngoài thiếu rel="noopener".` : "Link ra ngoài đều an toàn.", blank.length ? { items: blank.slice(0, 15).map(t => attr(t, "href").slice(0, 160)) } : null);
  try {
    const txt = (await dns.resolveTxt(root)).map(x => x.join(""));
    const spf = txt.find(t => /^v=spf1/i.test(t));
    E("spf-record", spf ? "passed" : "warning", spf ? "Có bản ghi SPF." : "Tên miền chưa có bản ghi SPF.", spf ? { code: spf } : null);
  } catch (e) { E("spf-record", "warning", "Tên miền chưa có bản ghi SPF."); }

  const vp = metaBy(head, "name", "viewport");
  const vpc = vp ? attr(vp, "content") || "" : "";
  E("viewport", /width\s*=\s*device-width/i.test(vpc) ? "passed" : vp ? "warning" : "failed", vp ? "Meta viewport: " + vpc : "Không có meta viewport.");
  const mq = /@media[^{]*\((max|min)-width/i.test(html) || cssOk.some(x => /@media[^{]*\((max|min)-width/i.test(x.code)) || tags(head, "link").some(t => /media=["'][^"']*(max|min)-width/i.test(t));
  E("media-queries", mq ? "passed" : "failed", mq ? "Giao diện có media query responsive." : "Không tìm thấy media query responsive.");

  try {
    const r = await D.fetchFollow(origin + "/khong-ton-tai-" + crypto.randomBytes(4).toString("hex"), roots);
    const len = (r.body || "").length;
    if (r.status === 404 && len > 1500) E("custom-404", "passed", "Trang không tồn tại trả mã 404 kèm trang 404 riêng.");
    else if (r.status === 404) E("custom-404", "warning", "Trả đúng mã 404 nhưng trang 404 quá sơ sài.");
    else E("custom-404", "failed", `URL không tồn tại lại trả mã ${r.status} (soft 404).`);
  } catch (e) { E("custom-404", "warning", "Không kiểm tra được trang 404."); }

  const variants = [...new Set(["http://" + host, "https://" + host, "http://" + (host.startsWith("www.") ? host.slice(4) : "www." + host), "https://" + (host.startsWith("www.") ? host.slice(4) : "www." + host)])];
  const vres = await Promise.all(variants.map(async v => { try { const r = await D.fetchFollow(v + "/", roots, null, null, true); return [v, r.status ? r.final : "lỗi"]; } catch (e) { return [v, "không truy cập được"]; } }));
  const finals = new Set(vres.filter(x => /^https?:/.test(x[1])).map(x => x[1].replace(/\/$/, "")));
  E("url-canonicalization", finals.size <= 1 ? "passed" : "failed", finals.size <= 1 ? "Mọi biến thể (http/https, có/không www) đều về cùng 1 URL." : "Các biến thể URL dẫn tới nhiều địa chỉ khác nhau.", { table: { head: ["Biến thể", "Về đâu"], rows: vres } });
  const hops = main.chain.length - 1;
  E("http-redirects", hops > 2 ? "failed" : hops === 2 ? "warning" : "passed", hops ? `URL nhập vào chuyển hướng ${hops} lần trước khi tới trang đích.` : "URL không bị chuyển hướng.", hops ? { table: { head: ["Mã", "URL"], rows: main.chain.map(c => [c.status, c.url]) } } : null);

  let ps = await psiP;
  const rte = ps.j && ps.j.lighthouseResult && ps.j.lighthouseResult.runtimeError;
  if (rte && rte.code && rte.code !== "NO_ERROR") ps = { err: "Google không tải được trang để đo (" + rte.code + ")" };
  note(job, "");
  const ttfbStatic = main.ms;
  if (ps.err) {
    const why = "Chưa lấy được dữ liệu Google PageSpeed: " + ps.err + ".";
    E("loading-speed", main.ms > 3000 ? "warning" : "passed", `Tải HTML trang mất ${fmtS(main.ms)} (đo từ máy chủ, chưa tính ảnh/JS). ` + why, { loading_time: main.ms });
    E("web-vitals-ttfb", ttfbStatic > 1800 ? "failed" : ttfbStatic > 800 ? "warning" : "passed", `TTFB đo từ máy chủ: ${fmtS(ttfbStatic)}.`);
    for (const s of ["js-execution-time", "web-vitals-fcp", "web-vitals-lcp", "web-vitals-cls", "image-aspect-ratio", "mobile-snapshot", "js-errors", "console-errors"]) E(s, "skipped", why);
    return;
  }
  const lh = ps.j.lighthouseResult, A = lh.audits;
  const field = (ps.j.loadingExperience && ps.j.loadingExperience.metrics) || {};
  const met = (A.metrics && A.metrics.details && A.metrics.details.items && A.metrics.details.items[0]) || {};
  const load = (A["speed-index"] && A["speed-index"].numericValue) || met.speedIndex || 0;
  const tti = (A.interactive && A.interactive.numericValue) || met.interactive || 0;
  E("loading-speed", load > 5800 ? "failed" : load > 3400 ? "warning" : "passed", `Trang hiển thị đầy đủ nội dung sau ${fmtS(load)} (Speed Index), tương tác được sau ${fmtS(tti)} — đo trên điện thoại mạng 4G mô phỏng. Điểm hiệu năng: ${Math.round((lh.categories.performance.score || 0) * 100)}/100 — nguồn: ${ps.via}.`, { loading_time: Math.round(load), perf: Math.round((lh.categories.performance.score || 0) * 100) });
  const boot = A["bootup-time"] ? A["bootup-time"].numericValue : 0;
  E("js-execution-time", boot > 3500 ? "failed" : boot > 2000 ? "warning" : "passed", `Thời gian thực thi JavaScript: ${fmtS(boot)}.`, A["bootup-time"] && A["bootup-time"].details ? { table: { head: ["Script", "Thời gian"], rows: (A["bootup-time"].details.items || []).slice(0, 8).map(i => [String(i.url).slice(0, 110), Math.round(i.total) + " ms"]) } } : null);
  const fv = (k) => field[k] && field[k].percentile;
  const vital = (slug, fk, ak, good, poor, fmt, unit) => {
    const fval = fv(fk); const lval = slug === "web-vitals-ttfb" && met.timeToFirstByte != null ? met.timeToFirstByte : A[ak] ? A[ak].numericValue : null;
    const v = fval != null ? (slug === "web-vitals-cls" ? fval / 100 : fval) : lval;
    if (v == null) { E(slug, "skipped", "Không có dữ liệu."); return; }
    E(slug, v > poor ? "failed" : v > good ? "warning" : "passed", `${fmt(v)}${fval != null ? " (dữ liệu người dùng thật 28 ngày)" : " (đo thử Lighthouse)"} — tốt khi ≤ ${fmt(good)}.`, { value: v, unit });
  };
  vital("web-vitals-ttfb", "EXPERIMENTAL_TIME_TO_FIRST_BYTE", "server-response-time", 800, 1800, fmtS, "ms");
  vital("web-vitals-fcp", "FIRST_CONTENTFUL_PAINT_MS", "first-contentful-paint", 1800, 3000, fmtS, "ms");
  vital("web-vitals-lcp", "LARGEST_CONTENTFUL_PAINT_MS", "largest-contentful-paint", 2500, 4000, fmtS, "ms");
  vital("web-vitals-cls", "CUMULATIVE_LAYOUT_SHIFT_SCORE", "cumulative-layout-shift", 0.1, 0.25, v => v.toFixed(2).replace(".", ","), "");
  const iar = A["image-aspect-ratio"];
  if (iar) { const it = (iar.details && iar.details.items) || []; E("image-aspect-ratio", iar.score === 1 || !it.length ? "passed" : "warning", it.length ? `${it.length} ảnh hiển thị sai tỷ lệ gốc.` : "Ảnh hiển thị đúng tỷ lệ.", it.length ? { table: { head: ["Ảnh", "Hiển thị", "Thực tế"], rows: it.slice(0, 10).map(i => [String(i.url).slice(0, 110), `${i.displayedAspectRatio}`, `${i.actualAspectRatio}`]) } } : null); }
  else E("image-aspect-ratio", "skipped", "Không có dữ liệu.");
  const shot = A["final-screenshot"] && A["final-screenshot"].details && A["final-screenshot"].details.data;
  E("mobile-snapshot", shot ? "passed" : "skipped", shot ? "Giao diện trang trên điện thoại." : "Không có ảnh chụp.", shot ? { snapshot: shot } : null);
  const con = A["errors-in-console"];
  const items = (con && con.details && con.details.items) || [];
  const jsErr = items.filter(i => /exception|uncaught|typeerror|referenceerror|syntaxerror/i.test(i.description || "") || i.source === "exception");
  E("js-errors", jsErr.length ? "failed" : "passed", jsErr.length ? `${jsErr.length} lỗi JavaScript khi tải trang.` : "Không có lỗi JavaScript.", jsErr.length ? { items: jsErr.slice(0, 10).map(i => String(i.description).slice(0, 200)) } : null);
  E("console-errors", items.length ? "warning" : "passed", items.length ? `${items.length} lỗi trong Console trình duyệt.` : "Console không có lỗi.", items.length ? { table: { head: ["Nguồn", "Lỗi"], rows: items.slice(0, 10).map(i => [i.source || "", String(i.description).slice(0, 180)]) } } : null);
}

function start(url) {
  url = String(url || "").trim();
  if (!url) throw new Error("Thiếu URL");
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let u; try { u = new URL(url); } catch (e) { throw new Error("URL không hợp lệ"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Chỉ hỗ trợ http/https");
  if (running >= MAX_RUNNING) throw new Error("Đang có " + running + " lượt phân tích chạy, thử lại sau ít phút");
  const job = newJob(u.toString());
  running++;
  audit(job).catch(e => { job.error = job.error || e.message; for (const c of CHECKS) if (!job.results[c.slug]) emit(job, c.slug, { status: "skipped", message: "Lỗi khi phân tích: " + e.message }); })
    .finally(() => { running--; for (const c of CHECKS) if (!job.results[c.slug]) emit(job, c.slug, { status: "skipped", message: "Không kiểm tra được." }); finish(job); });
  return job.guid;
}

function subscribe(guid, fn) {
  const job = jobs.get(guid);
  if (!job) {
    const rep = load(guid);
    if (!rep) return null;
    let i = 0;
    for (const c of rep.checks) if (c.result) fn({ slug: c.slug, name: c.name, group: c.group, relevance: c.relevance, result: c.result, completed: ++i, total: CHECKS.length });
    fn({ done: true, score: rep.score, report: rep });
    return () => {};
  }
  job.order.forEach((slug, i) => { const c = BY_SLUG[slug]; fn({ slug, name: c.name, group: c.group, relevance: c.relevance, result: job.results[slug], completed: i + 1, total: CHECKS.length }); });
  if (job.meta.note && !job.done) fn({ note: job.meta.note });
  if (job.done) { fn({ done: true, score: job.score, report: report(job) }); return () => {}; }
  job.listeners.add(fn);
  return () => job.listeners.delete(fn);
}

function load(guid) {
  if (!/^[a-f0-9]{16}$/.test(guid || "")) return null;
  try { return JSON.parse(fs.readFileSync(path.join(REPORT_DIR, guid + ".json"), "utf8")); } catch (e) { return null; }
}

function history(limit) {
  try {
    return fs.readdirSync(REPORT_DIR).filter(f => f.endsWith(".json")).map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), "utf8")); return { guid: r.guid, url: r.url, score: r.score, created: r.created, counts: r.counts }; } catch (e) { return null; } })
      .filter(Boolean).sort((a, b) => b.created - a.created).slice(0, limit || 50);
  } catch (e) { return []; }
}

function remove(guid) {
  if (!/^[a-f0-9]{16}$/.test(guid || "")) return false;
  try { fs.unlinkSync(path.join(REPORT_DIR, guid + ".json")); return true; } catch (e) { return false; }
}

module.exports = { start, subscribe, load, history, remove, psiNext, psiResult, psiAlive, CHECKS: CHECKS.map(({ fix, ...c }) => c), GROUPS };
