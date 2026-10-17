const T = (label, detail, src, live) => ({ label, detail, src, live });
const S = (label, inp, out, calls, src, detail) => ({ label, in: inp, out, calls: calls || [], src, detail });
const O = (label, detail) => ({ label, detail });

const FLOWS = {
  sw: {
    kind: "dag", title: "SEO Writer", core: "sw",
    anc: { vps: [0, 1.6], caddy: [1, 0.5], dash: [1, 2], cron: [1, 3.3] },
    bands: [
      { title: "Lối vào", c0: 2, c1: 3, r0: 0, r1: 3.3 },
      { title: "Dây chuyền chung", c0: 4, c1: 9, r0: 1.6, r1: 1.6 },
      { title: "Ảnh & đăng (3 nhánh)", c0: 10, c1: 12, r0: 0, r1: 3.3 },
    ],
    nodes: [
      { id: "t1", t: "trig", col: 2, row: 0, label: "Thủ công 1 bài", detail: "Bước 1 có 1 từ khoá, bấm “Nghiên cứu + Viết bài”, chọn Thủ công. Đi từng bước, bạn chọn tiêu đề và duyệt dàn ý.", src: "frontend/index.html:4236" },
      { id: "t2", t: "trig", col: 2, row: 1.1, label: "Dashboard gửi 1 bài", detail: "Dashboard mở SEO Writer kèm site, brand, tài khoản WordPress (và từ khoá từ kế hoạch) rồi bạn bấm tiếp như thủ công.", src: "frontend/index.html:3219-3345" },
      { id: "t3", t: "trig", col: 2, row: 2.2, label: "Viết hàng loạt / chạy ngầm", detail: "Bước 1 có ≥ 2 từ khoá hoặc chọn Chạy ngầm; Dashboard “Viết hàng loạt” từ Kho nội dung. Viết lần lượt từng bài, tự chọn tiêu đề và dàn ý.", src: "frontend/index.html:4018-4132" },
      { id: "t4", t: "trig", col: 2, row: 3.3, label: "Autopilot", detail: "Cron gọi mỗi giờ; chỉ chạy khi đang bật, đúng giờ chạy, hôm nay chưa chạy. Lấy N từ khoá cũ nhất trong hàng đợi.", src: "server.py:7223-7237, 6849", live: "ap" },
      { id: "q", t: "step", kind: "Chạy ngầm", col: 3, row: 2.75, label: "Xếp hàng & nghiên cứu trước", in: "danh sách từ khoá", out: "tiến trình, lịch rải 30 phút/bài, kết quả GG AI Mode cả mẻ", calls: ["ext"], src: "server.py:7000-7147, 2006-2015", detail: "Bỏ từ khoá đã viết ở site đó. Các bài trong mẻ được viết tuần tự, mỗi lúc 1 bài; hết credit OpenRouter thì dừng cả mẻ." },
      { id: "s1", t: "step", kind: "Bước 1", col: 4, row: 1.6, label: "Tải dữ liệu site", in: "tên miền + tài khoản WordPress", out: "danh mục, bài, trang của site", calls: ["wp"], src: "server.py:5907, 6786", detail: "Đọc WordPress REST (song song). Chạy ngầm thì tải 1 lần cho mỗi site." },
      { id: "s2", t: "step", kind: "Bước 2", col: 5, row: 1.6, label: "Nghiên cứu", in: "từ khoá chính + phụ", out: "SERP, tin, video, Reddit, trang thương hiệu, gợi ý, tóm tắt AI", calls: ["serper", "reddit", "ext", "or"], src: "server.py:3400-3691", detail: "7 việc chạy song song. Tóm tắt AI: GG AI Mode qua tiện ích Chrome (mặc định) hoặc Perplexity Sonar qua OpenRouter." },
      { id: "s3", t: "step", kind: "Bước 3", col: 6, row: 1.6, label: "Tiêu đề & meta", in: "nghiên cứu", out: "5 tiêu đề + meta (thủ công: bạn chọn; chạy ngầm: tự lấy)", calls: ["ext", "or"], src: "server.py:4631", detail: "AI: Gemini app qua tiện ích Chrome trước, OpenRouter dự phòng." },
      { id: "s4", t: "step", kind: "Bước 4", col: 7, row: 1.6, label: "Dàn ý", in: "tiêu đề + nghiên cứu", out: "các H2 / H3 (thủ công: bạn duyệt)", calls: ["ext", "or"], src: "server.py:4695" },
      { id: "s5", t: "step", kind: "Bước 5", col: 8, row: 1.6, label: "Viết bài", in: "dàn ý + link nội bộ", out: "HTML cả bài", calls: ["ext", "or"], src: "server.py:4806", detail: "Viết cả bài trong 1 lần gọi AI, sau đó code chèn link, brand, Xem thêm." },
      { id: "s6", t: "step", kind: "Bước 6", col: 9, row: 1.6, label: "Kiểm tra", in: "HTML bài", out: "vị trí ảnh, meta, schema", calls: ["ext", "or"], src: "server.py:5172" },
      { id: "a1", t: "step", kind: "Nhánh A", col: 10, row: 0, label: "Bước 7: thêm ảnh", in: "vị trí ảnh", out: "ảnh đã ghép khung", calls: ["ext"], src: "frontend/index.html:928-957, 1675-1711", detail: "Dán, ZIP hoặc làm ảnh Gemini trong Studio, ghép khung của site." },
      { id: "a2", t: "step", kind: "Nhánh A", col: 12, row: 0, label: "Đăng kèm ảnh", in: "bài + ảnh", out: "ID bài, link", calls: ["wp"], src: "server.py:5721, 5969", detail: "Tải ảnh lên Media, tạo/cập nhật bài, gắn danh mục, meta Rank Math. Có thể chọn hẹn giờ (WordPress tự đăng)." },
      { id: "b1", t: "step", kind: "Nhánh B", col: 10, row: 1.6, label: "Đăng ngay / WordPress hẹn giờ", in: "bài chưa ảnh", out: "bài trên WordPress", calls: ["wp"], src: "server.py:6545, 5984-5987" },
      { id: "b2", t: "step", kind: "Nhánh B", col: 11, row: 1.6, label: "Ảnh hàng loạt / Studio", in: "các bài đã đăng", out: "ảnh đã ghép khung", calls: ["ext", "or"], src: "server.py:2772, 5539; frontend/index.html:366, 1756", detail: "Bạn bấm Ảnh hàng loạt (Lịch sử, Bước 7, hoặc Dashboard “Làm ảnh hàng loạt”). Ảnh từ ZIP, dán hoặc Gemini; đặt tên file bằng AI." },
      { id: "b3", t: "step", kind: "Nhánh B", col: 12, row: 1.6, label: "Cập nhật bài kèm ảnh", in: "ảnh + bài", out: "bài đủ ảnh", calls: ["wp"], src: "frontend/index.html:2971-3060" },
      { id: "c1", t: "step", kind: "Nhánh C", col: 10, row: 3.3, label: "Đăng ngay hoặc giữ chờ lịch", in: "bài chưa ảnh", out: "bài đã đăng / bài giữ trong tool", calls: ["wp"], src: "server.py:6545-6548" },
      { id: "c2", t: "step", kind: "Nhánh C", col: 11, row: 3.3, label: "Tự làm ảnh", in: "vị trí ảnh", out: "ảnh ghép khung WebP", calls: ["ext"], src: "server.py:2552-2630, 2796, 2476", detail: "Vòng lặp nền mỗi 20 giây; tiện ích Chrome vẽ (Gemini / GG AI); Pillow ghép khung. Lỗi thì 30 phút sau thử lại, tối đa 3 lần." },
      { id: "c3", t: "step", kind: "Nhánh C", col: 12, row: 3.3, label: "Cập nhật bài / tới giờ đăng", in: "ảnh + bài", out: "bài đủ ảnh trên WordPress", calls: ["wp"], src: "server.py:2489-2527, 2638-2731", detail: "Bài đã đăng: cập nhật kèm ảnh. Bài giữ chờ lịch: vòng 30 giây chờ đủ ảnh, tới giờ mới tải ảnh và đăng." },
      { id: "out", t: "out", col: 13, row: 1.6, label: "Bài viết hoàn chỉnh trên WordPress", detail: "Có ảnh, danh mục, meta; bản lưu trong Lịch sử; kế hoạch nội dung được đánh dấu đã viết / đã đăng." },
    ],
    edges: [
      ["vps", "caddy", "host"], ["vps", "cron", "host"], ["caddy", "dash", "route"],
      ["caddy", "t1", "route"], ["dash", "t2", "call"], ["dash", "t3", "call"], ["cron", "t4", "schedule"],
      ["t1", "s1", "next"], ["t2", "s1", "next"], ["t3", "q", "next"], ["t4", "q", "next", "N từ khoá"],
      ["q", "s1", "next", "từng bài một"],
      ["s1", "s2", "next", "dữ liệu site"], ["s2", "s3", "next", "nghiên cứu"], ["s3", "s4", "next", "tiêu đề + meta"], ["s4", "s5", "next", "dàn ý"], ["s5", "s6", "next", "HTML bài"],
      ["s6", "a1", "next", "thủ công"], ["s6", "b1", "next", "chạy ngầm, không tự làm ảnh"], ["s6", "c1", "next", "chạy ngầm + tự làm ảnh"],
      ["a1", "a2", "next", "ảnh"], ["b1", "b2", "next", "bài đã đăng"], ["b2", "b3", "next", "ảnh"], ["c1", "c2", "next", "bài chờ ảnh"], ["c2", "c3", "next", "ảnh"],
      ["a2", "out", "next"], ["b3", "out", "next"], ["c3", "out", "next"],
    ],
  },

  ex: {
    kind: "dag", title: "Chuyên gia SEO", core: "ex",
    anc: { vps: [0, 1.1], caddy: [1, 1.1], dash: [2, 1.1] },
    refs: { sw: [15, 0.5] },
    bands: [
      { title: "Hồ sơ tích hợp", c0: 3, c1: 7, r0: 0, r1: 1.1 },
      { title: "Kế hoạch nội dung", c0: 7, c1: 11, r0: 2.3, r1: 2.3 },
      { title: "Kho nội dung → viết bài", c0: 12, c1: 16, r0: 0, r1: 2.3 },
      { title: "Hỏi đáp", c0: 3, c1: 9, r0: 3.5, r1: 3.5 },
    ],
    nodes: [
      { id: "ti", t: "trig", col: 3, row: 0, label: "Site mới: điền form tích hợp", detail: "Tab Chuyên gia của website trên Dashboard.", src: "seo_expert.js:1044" },
      { id: "tc", t: "trig", col: 3, row: 1.1, label: "Site cũ: bấm Khám bệnh", detail: "Tab Chuyên gia của website có sẵn.", src: "seo_expert.js:1238" },
      { id: "i1", t: "step", col: 4, row: 0, label: "Đọc file GSC / GA (tuỳ chọn)", in: "file xuất", out: "tóm tắt số liệu", calls: ["or"], src: "seo_expert_integrate.py:113" },
      { id: "i2", t: "step", col: 5, row: 0, label: "Nghiên cứu từ khoá", in: "≤ 5 từ khoá", out: "kết quả Google", calls: ["serper"], src: "seo_expert.js:707" },
      { id: "i3", t: "step", col: 6, row: 0, label: "Viết báo cáo tích hợp", in: "form + nghiên cứu + tài liệu Google", out: "báo cáo + phần vấn đề", calls: ["or"], src: "seo_expert_integrate.py:237-306", detail: "2 lần gọi AI nối tiếp." },
      { id: "k1", t: "step", col: 4, row: 1.1, label: "Đo song song", in: "website", out: "on-page, kỹ thuật, link, ảnh, tốc độ, index, brand", calls: ["dash", "psi", "gsc", "serper"], src: "seo_expert.js:316-395", detail: "Máy chủ Dashboard quét trang; trình duyệt gọi PageSpeed 3 URL, GSC sitemap + 5 URL, Serper tên thương hiệu." },
      { id: "k2", t: "step", col: 5, row: 1.1, label: "Chấm điểm", in: "số đo", out: "đạt / cảnh báo / lỗi", calls: [], src: "seo_expert.js:398" },
      { id: "k3", t: "step", col: 6, row: 1.1, label: "Viết bệnh án", in: "điểm + lần khám trước", out: "bệnh án", calls: ["or"], src: "seo_checkup.py:44-81" },
      { id: "h", t: "step", kind: "Hợp nhánh", col: 7, row: 0.55, label: "Xác nhận → Hồ sơ tích hợp", in: "báo cáo hoặc bệnh án", out: "hồ sơ tích hợp đã xác nhận", calls: [], src: "seo_expert_integrate.py:308; server.py:1352" },
      { id: "tp", t: "trig", col: 7, row: 2.3, label: "Tải CSV Keyword Planner + Bắt đầu", detail: "Cần hồ sơ tích hợp đã xác nhận.", src: "seo_expert.js:733, 1351" },
      { id: "p1", t: "step", col: 8, row: 2.3, label: "Khung danh mục", in: "hồ sơ + danh sách từ khoá", out: "danh mục, nhịp đăng", calls: ["or"], src: "seo_expert_plan.py:123" },
      { id: "p2", t: "step", col: 9, row: 2.3, label: "Lấy SERP từng từ khoá", in: "từ khoá", out: "top Google (có cache)", calls: ["serper"], src: "seo_expert_plan.py:162-198" },
      { id: "p3", t: "step", col: 10, row: 2.3, label: "Gom cụm + phân loại", in: "SERP", out: "bài chính / từ phụ / danh mục", calls: ["or"], src: "seo_expert_plan.py:272-483" },
      { id: "p4", t: "step", col: 11, row: 2.3, label: "Sửa tay & xác nhận kế hoạch", in: "bảng kế hoạch", out: "kế hoạch đã chốt", calls: [], src: "seo_expert_plan.py:773-796", detail: "Cấu trúc danh mục ghi ngược vào hồ sơ tích hợp." },
      { id: "tk", t: "trig", col: 12, row: 0.5, label: "Mở tab ✍️ Nội dung", detail: "Tab Nội dung của website trên Dashboard.", src: "content_mgr.js:60" },
      { id: "n1", t: "step", col: 13, row: 0.5, label: "Quét bài WordPress", in: "website", out: "bài, trang, danh mục đang có", calls: ["wp"], src: "content_mgr.js:75-113; seo_content.py:149" },
      { id: "n2", t: "step", col: 13, row: 2.3, label: "Nhập kế hoạch vào kho", in: "kế hoạch + bài đang có", out: "bài mới / gắn bài cũ (lọc trùng từ khoá)", calls: [], src: "seo_content.py:201-238" },
      { id: "n3", t: "step", col: 14, row: 2.3, label: "Chọn bài → Viết / làm ảnh hàng loạt", in: "bài đã chọn", out: "giao cho SEO Writer", calls: ["sw"], src: "content_mgr.js:449-477" },
      { id: "out", t: "out", col: 16, row: 1.4, label: "Bài viết trên WordPress", detail: "SEO Writer viết xong tự cập nhật trạng thái viết / đăng về Kho nội dung; check index các bài bằng Serper ngay trong kho." },
      { id: "tq", t: "trig", col: 3, row: 3.5, label: "Gửi câu hỏi", detail: "Tab Báo cáo (hỏi chung) hoặc tab Chuyên gia của website. Hỏi theo site cần hồ sơ đã xác nhận.", src: "seo_expert.js:73, 1139" },
      { id: "q1", t: "step", col: 4, row: 3.5, label: "Gom ngữ cảnh site", in: "website", out: "chuỗi 301, GSC, nội dung, việc", calls: ["gsc"], src: "seo_expert.js:233-302" },
      { id: "q2", t: "step", col: 5, row: 3.5, label: "Đổi câu hỏi thành truy vấn", in: "câu hỏi", out: "truy vấn tiếng Anh", calls: ["or"], src: "seo_expert.py:302" },
      { id: "q3", t: "step", col: 6, row: 3.5, label: "Tra tài liệu Google", in: "truy vấn", out: "đoạn tài liệu liên quan", calls: [], src: "seo_expert.py:98" },
      { id: "q4", t: "step", col: 7, row: 3.5, label: "Ghép hồ sơ site", in: "hồ sơ, kế hoạch, khám bệnh", out: "ngữ cảnh đầy đủ", calls: [], src: "seo_expert.py:327-347", detail: "Lấy hồ sơ tích hợp đã xác nhận (nhánh Hồ sơ phía trên), kế hoạch đã chốt và lần khám bệnh gần nhất của site." },
      { id: "q5", t: "step", col: 8, row: 3.5, label: "Trả lời", in: "câu hỏi + tài liệu + hồ sơ", out: "câu trả lời có nguồn", calls: ["or"], src: "seo_expert.py:349" },
      { id: "qo", t: "out", col: 9, row: 3.5, label: "Câu trả lời có trích nguồn", detail: "Lưu vào lịch sử chat." },
    ],
    edges: [
      ["vps", "caddy", "host"], ["caddy", "dash", "route"],
      ["dash", "ti", "call"], ["dash", "tc", "call"], ["dash", "tq", "call"],
      ["ti", "i1", "next"], ["i1", "i2", "next", "số liệu"], ["i2", "i3", "next", "kết quả Google"], ["i3", "h", "next", "báo cáo"],
      ["tc", "k1", "next"], ["k1", "k2", "next", "số đo"], ["k2", "k3", "next", "điểm"], ["k3", "h", "next", "bệnh án"],
      ["h", "p1", "data", "hồ sơ"], ["tp", "p1", "next", "từ khoá"], ["p1", "p2", "next", "danh mục"], ["p2", "p3", "next", "SERP"], ["p3", "p4", "next", "bảng kế hoạch"], ["p4", "n2", "next", "kế hoạch"],
      ["tk", "n1", "next"], ["n1", "n2", "next", "bài đang có"], ["n2", "n3", "next", "kho bài"], ["n3", "sw", "call", "bài cần viết"], ["sw", "out", "next"],
      ["tq", "q1", "next"], ["q1", "q2", "next", "ngữ cảnh"], ["q2", "q3", "next", "truy vấn"], ["q3", "q4", "next", "tài liệu"], ["q4", "q5", "next", "ngữ cảnh đầy đủ"], ["q5", "qo", "next"],
    ],
  },

  dash: {
    title: "Dashboard", core: "dash", ctx: ["vps", "caddy", "dash"],
    lanes: [
      {
        id: "d1", title: "Đăng nhập",
        trigger: T("Mở dashboard", "Nhập mật khẩu hoặc bấm đăng nhập Google.", "index.html:1502-1639"),
        steps: [
          S("So mật khẩu", "mật khẩu nhập", "đúng / sai", ["dfb"], "index.html:1502-1537", "Mật khẩu admin và nhân viên đọc từ Firebase rồi so ngay trên trình duyệt."),
          S("Đăng nhập Google", "tài khoản Google", "token Search Console + xác minh", ["gsc"], "index.html:1588"),
          S("Kiểm tra email được phép", "email", "cho vào / chặn", ["dfb"], "index.html:1600-1639"),
        ],
        output: O("Vào dashboard", "Có token Google thì 2 giây sau tự đồng bộ GSC."),
      },
      {
        id: "d2", title: "Lưu dữ liệu",
        trigger: T("Mọi thao tác sửa", "Hàm saveAppData được gọi sau mỗi lần thêm / sửa / xoá.", "script_v5.js:1406"),
        steps: [
          S("Ghi trên máy", "dữ liệu", "localStorage", [], "script_v5.js:1472"),
          S("Chốt an toàn", "dữ liệu", "cho ghi / chặn", [], "script_v5.js:1406-1420", "Chặn khi chưa tải xong hoặc dữ liệu trên máy rỗng bất thường."),
          S("Ghi Firebase", "cả cây appData", "đồng bộ mọi máy", ["dfb"], "script_v5.js:1423"),
          S("Backup", "cả cây dữ liệu", "IndexedDB + 20 bản trên Firebase", ["dfb"], "script_v5.js:15294"),
        ],
        output: O("Dữ liệu đồng bộ realtime", "Máy khác nhận ngay qua listener."),
      },
      {
        id: "d3", title: "Công việc",
        trigger: T("Mở tab Công việc", "", "script_v5.js:1352"),
        steps: [
          S("Gia hạn việc định kỳ", "việc định kỳ", "ngày làm tiếp theo", [], "script_v5.js:5101"),
          S("Tạo / sửa bảng, thẻ, việc index", "thao tác", "bảng việc", [], "script_v5.js:5376-5556, 8460"),
          S("Lưu", "bảng việc", "Firebase", ["dfb"], "script_v5.js:1423"),
        ],
        output: O("Bảng việc + số đếm trên menu"),
      },
      {
        id: "d4", title: "Website & chuỗi 301",
        trigger: T("Tab Link quan trọng", "Thêm, sửa, nhập hàng loạt website.", "script_v5.js:7002, 11313"),
        steps: [
          S("Lưu website", "thông tin site", "bản ghi (gắn site gốc nếu là 301)", [], "script_v5.js:7002-7102"),
          S("Chép tài khoản xuống chuỗi 301", "site gốc", "site 301 có tài khoản", [], "script_v5.js:7280"),
          S("Lưu", "danh sách website", "Firebase", ["dfb"], "script_v5.js:1423"),
        ],
        output: O("Danh sách website + chuỗi 301"),
      },
      {
        id: "d5", title: "Lệnh 301",
        trigger: T("Ô 🔗 301 ở Theo dõi web", "", "script_v5.js:15517"),
        steps: [
          S("Tạo lệnh", "đích 301", "lệnh (nguồn = site gần nhất)", [], "script_v5.js:15706"),
          S("Mẫu 301", "chuỗi site", "đoạn lệnh A → B → C", [], "script_v5.js:15536-15641"),
          S("Hoàn tất", "lệnh", "bản ghi website 301 mới", [], "script_v5.js:15748"),
          S("Lưu", "chuỗi 301", "Firebase", ["dfb"], "script_v5.js:1423"),
        ],
        output: O("Chuỗi 301 cập nhật + nhật ký"),
      },
      {
        id: "d6", title: "Đồng bộ GSC",
        trigger: T("2 giây sau đăng nhập", "Cũng chạy khi mở 📊 lần đầu trong ngày, hoặc bấm Đồng bộ. Đã đồng bộ hôm nay thì bỏ qua.", "index.html:1748; script_v5.js:12825, 11551"),
        steps: [
          S("Lấy danh sách site GSC", "token Google", "site + quyền", ["gsc"], "script_v5.js:11634"),
          S("Khớp site đang theo dõi", "site GSC + website", "cặp site (theo URL 301 mới nhất)", [], "script_v5.js:11661"),
          S("Lấy click / hiển thị", "site", "số liệu 28 ngày", ["gsc"], "script_v5.js:11754"),
          S("Kiểm tra URL nếu 0 hiển thị", "trang chủ", "trạng thái index", ["dash", "gsc"], "script_v5.js:11806; server.js:473", "Qua máy chủ /api/gsc-inspect."),
          S("Vị trí từ khoá chính", "từ khoá", "vị trí", ["gsc"], "script_v5.js:11827"),
          S("Ghi kết quả", "số liệu", "gsc_cache + lịch sử", ["dfb"], "script_v5.js:11898"),
        ],
        output: O("Số liệu GSC trên bảng", "Báo cáo đồng bộ hiện ở chuông."),
      },
      {
        id: "d7", title: "Check rank",
        trigger: T("Chọn site → Check rank", "Không có hẹn giờ, chỉ chạy khi bấm.", "script_v5.js:3681"),
        steps: [
          S("Tra Google", "từ khoá chính + tên miền 301 mới nhất", "vị trí desktop + mobile (top 100)", ["serper"], "script_v5.js:3551-3600"),
          S("Ghi vị trí", "vị trí", "lịch sử rank + nhật ký", ["dfb"], "script_v5.js:3580-3646"),
          S("Gửi báo cáo", "kết quả", "tin nhắn", ["tg"], "script_v5.js:3847"),
        ],
        output: O("Cột rank + tin Telegram"),
      },
      {
        id: "d8", title: "Check index",
        trigger: T("Ô index / Quét bài chưa index", "Hoặc popup danh sách bài của một site.", "script_v5.js:13947, 2827, 3059"),
        steps: [
          S("Lấy danh sách bài", "website", "bài + trang", ["wp", "dash"], "script_v5.js:2772-2807", "Trình duyệt đọc thẳng; bị chặn thì qua máy chủ /api/wp-posts."),
          S("Kiểm tra index", "URL", "đã / chưa index", ["serper", "gsc"], "script_v5.js:2701-2748, 13947", "site:URL qua Serper; trang chủ dùng kiểm tra URL của GSC nếu có token."),
          S("Lưu", "kết quả", "contentIndex", ["dfb"], "script_v5.js:2634"),
        ],
        output: O("Tỷ lệ index từng site"),
      },
      {
        id: "d9", title: "Thêm GSC + tick xanh",
        trigger: T("Nút Thêm GSC → chọn site", "", "script_v5.js:14076"),
        steps: [
          S("Lấy mã xác minh", "site", "thẻ meta", ["gsc"], "script_v5.js:14203-14353", "Site đã xác minh thì tick luôn và nộp sitemap."),
          S("Dán mã vào site (làm tay)", "thẻ meta", "site có thẻ", ["wp"], "script_v5.js:14370", "Mở wp-admin, chép sẵn tài khoản."),
          S("Xác minh", "site", "đã xác minh / không khớp mã", ["gsc"], "script_v5.js:14446"),
          S("Thêm site + nộp sitemap", "site", "property + 4 sitemap", ["gsc"], "script_v5.js:14573-14675"),
          S("Tick xanh", "site", "gscVerified", ["dfb"], "script_v5.js:4106"),
        ],
        output: O("Site đã có trong GSC + tick xanh"),
      },
      {
        id: "d10", title: "SEO Audit",
        trigger: T("Tab SEO Audit → nhập URL", "", "seo_audit_ui.js:228"),
        steps: [
          S("Quét on-page & kỹ thuật", "URL", "kết quả từng mục", ["dash"], "lib/seo_audit.js:727-739", "Máy chủ chạy, tối đa 2 lượt cùng lúc."),
          S("Đo PageSpeed", "URL", "điểm tốc độ", ["ext", "psi"], "lib/seo_audit.js:206-329", "Giao cho tiện ích Chrome; tiện ích không chạy thì máy chủ tự gọi."),
          S("Đẩy kết quả dần", "kết quả", "hiện từng mục (SSE)", [], "server.js:357"),
        ],
        output: O("Báo cáo audit", "Lưu data/seo_audit, in được PDF."),
      },
      {
        id: "d11", title: "Hoá đơn & số dư",
        trigger: T("Tab Hoá đơn / nút Đồng bộ API", "Thêm đồng hồ 10 giây trừ dần số dư trả trước.", "script_v5.js:1356, 14748"),
        steps: [
          S("Số dư Serper", "key", "credit còn", ["serper"], "script_v5.js:14764"),
          S("Số dư CloudFly", "token", "số dư VPS", ["dash", "cloudfly"], "script_v5.js:14774; server.js:153"),
          S("Trừ dần theo giờ", "hoá đơn trả trước", "số dư mới", [], "script_v5.js:14727"),
        ],
        output: O("Bảng hoá đơn", "Chỉ lưu trên máy này (localStorage), không lên Firebase."),
      },
      {
        id: "d12", title: "Team & nhân viên",
        trigger: T("Cài đặt → Team / Nhân viên", "", "script_v5.js:137, 16048"),
        steps: [
          S("Thêm / sửa / xoá team", "team", "danh sách team", [], "script_v5.js:137-300"),
          S("Tài khoản & quyền nhân viên", "nhân viên", "quyền xem tab", [], "script_v5.js:16048-16210"),
          S("Lưu", "cài đặt", "Firebase", ["dfb"], "script_v5.js:1423"),
        ],
        output: O("Menu hiện theo quyền từng nhân viên"),
      },
    ],
  },

  gsct: {
    title: "GSC Bulk Tool", core: "gsct", ctx: ["vps", "caddy", "gsct"],
    lanes: [
      {
        id: "g1", title: "Check 301",
        trigger: T("Tab Check 301 → Bắt đầu", "", "index.html:524"),
        steps: [
          S("Đọc trang", "URL nguồn", "HTML + mã + chuyển hướng", ["gscapi", "cors"], "index.html:3419-3470", "Qua /proxy của GSC Bulk API trước, lỗi thì allorigins / corsproxy / codetabs."),
          S("Xác định đích 301", "HTML + chuyển hướng", "đích thật", [], "index.html:3536-3580", "Theo redirect, canonical, og:url, meta refresh."),
          S("Kiểm tra brand ở footer", "HTML", "đúng / sai brand", [], "index.html:3582-3605"),
        ],
        output: O("Bảng khớp / lệch 301"),
      },
      {
        id: "g2", title: "Check 301 + báo Telegram",
        trigger: T("Nút Chỉ check 301", "", "index.html:525"),
        steps: [
          S("Đọc trang", "URL", "HTML", ["gscapi", "cors"], "index.html:3659"),
          S("Lấy đích", "HTML", "đích 301", [], "index.html:3659-3715"),
          S("Gửi báo cáo", "danh sách", "tin nhắn", ["tg"], "index.html:3717"),
        ],
        output: O("Danh sách + tin Telegram"),
      },
      {
        id: "g3", title: "Check Admin WP",
        trigger: T("Tab Admin WP → Bắt đầu", "", "index.html:562"),
        steps: [
          S("Dò đường dẫn admin", "tên miền", "đường dẫn đăng nhập", ["gscapi", "cors"], "index.html:3277-3293"),
          S("Đăng nhập thử bằng Chrome", "URL + tài khoản", "Đúng MK / Sai MK", ["gscapi", "gchrome"], "vps_puppeteer_api.js:92-115", "GSC Bulk API mở Chrome trên VPS, gõ tài khoản vào trang đăng nhập."),
        ],
        output: O("Bảng đúng / sai mật khẩu"),
      },
      {
        id: "g4", title: "Outbound audit",
        trigger: T("Tab Outbound → Bắt đầu", "", "index.html:588"),
        steps: [
          S("Đọc HTML", "URL", "HTML", ["gscapi", "cors"], "index.html:3756-3781"),
          S("Tách link ngoài + /mlink/", "HTML", "danh sách link", [], "index.html:3806-3876"),
          S("Kiểm tra từng link", "link", "mã phản hồi", ["cors"], "index.html:3916-3961"),
          S("Gửi tóm tắt", "kết quả", "tin nhắn", ["tg"], "index.html:3907"),
        ],
        output: O("Bảng link ngoài + tin Telegram"),
      },
      {
        id: "g5", title: "Check /mlink/",
        trigger: T("Nút Check mlink", "", "index.html:589"),
        steps: [
          S("Đọc HTML", "URL", "HTML", ["gscapi", "cors"], "index.html:3964"),
          S("Đếm link /mlink/", "HTML", "số link", [], "index.html:3964-4044"),
          S("Gửi báo cáo", "kết quả", "tin nhắn", ["tg"], "index.html:4051"),
        ],
        output: O("Bảng /mlink/ + tin Telegram"),
      },
      {
        id: "g6", title: "Check bot (robots.txt)",
        trigger: T("Tab Bot → Bắt đầu", "", "index.html:622"),
        steps: [
          S("Đọc robots.txt", "tên miền (https rồi http)", "nội dung robots", ["gscapi", "cors"], "index.html:4103-4137"),
          S("Tìm Disallow: /", "robots", "chặn / mở bot", [], "index.html:4140-4162", "Chưa kiểm tra thẻ noindex dù phần hướng dẫn có nhắc."),
        ],
        output: O("Danh sách site chặn bot"),
      },
      {
        id: "g7", title: "Check rank",
        trigger: T("Tab Rank → Bắt đầu", "", "index.html:847"),
        steps: [
          S("Tra Google", "từ khoá + tên miền", "vị trí desktop + mobile (top 100)", ["serper"], "index.html:6782-6798"),
          S("Tổng hợp", "vị trí", "top 10 / 30 / 100", [], "index.html:6880"),
        ],
        output: O("Bảng rank + file CSV"),
      },
      {
        id: "g8", title: "Check index",
        trigger: T("Tab Index → Bắt đầu", "", "index.html:932"),
        steps: [
          S("Tra site:URL theo lô 10", "URL", "đã / chưa index", ["serper"], "index.html:1058-1086", "Đường dự phòng qua máy chủ đang hỏng (gọi hàm không tồn tại)."),
        ],
        output: O("Bảng index + CSV"),
      },
      {
        id: "g9", title: "Workflow Builder",
        trigger: T("Bảng Workflow → Chạy", "Node hẹn giờ chỉ lưu cài đặt, chưa có bộ lập lịch nên không tự chạy.", "index.html:4879, 6092"),
        steps: [
          S("Lấy dữ liệu", "nhập tay / Google Sheets", "danh sách", ["gsheets"], "index.html:4367-4429"),
          S("Chạy các node", "dữ liệu", "kết quả từng node", ["cors", "gemini"], "index.html:4198-4345", "HTTP, code JS tự viết, AI Gemini, theo dõi kỹ thuật."),
          S("Ghi lại Sheets", "kết quả", "ô Sheets", ["gsheets"], "index.html:4674-4764"),
          S("Gửi Telegram", "kết quả", "tin nhắn", ["tg"], "index.html:4805"),
        ],
        output: O("Kết quả workflow", "Danh sách workflow lưu trên Firebase."),
      },
      {
        id: "g10", title: "AI Copilot",
        trigger: T("Mở chat → gửi câu hỏi", "", "index.html:468, 6298"),
        steps: [
          S("Ghép ngữ cảnh trang", "trang đang mở", "ngữ cảnh", [], "index.html:5629-5668"),
          S("Hỏi AI", "câu hỏi + ngữ cảnh", "câu trả lời", ["gemini"], "index.html:5692-5772", "Gemini (pro → flash), hoặc Ollama nếu chọn."),
        ],
        output: O("Lời khuyên", "Chỉ trả lời, không tự thao tác."),
      },
      {
        id: "g11", title: "Cài đặt hệ thống",
        trigger: T("Nút ⚙ → Lưu", "", "index.html:463, 6548"),
        steps: [
          S("Lưu trên máy", "key, token, URL VPS, proxy…", "localStorage", [], "index.html:5916-5950"),
          S("Đồng bộ lên Firebase", "cài đặt", "settings/shared", ["gfb"], "index.html:1292-1309", "Gồm cả Gemini key, Telegram token, service-account, mật khẩu proxy."),
        ],
        output: O("Cài đặt dùng chung mọi máy"),
      },
      {
        id: "g12", title: "SEO Content audit", dead: "Hỏng: thiếu file auditor.js trong thư mục tool.",
        trigger: T("Tab SEO Content → Phân tích", "", "index.html:676, 4193"),
        steps: [S("Phân tích nội dung", "URL", "—", [], "index.html:4193")],
        output: O("Không chạy được"),
      },
      {
        id: "g13", title: "Tự động GSC qua Chrome VPS", dead: "Chỉ còn code: giao diện đã gỡ, không nút nào gọi startVpsProcess. Lần chạy cuối 22/6/2026.",
        trigger: T("(không còn nút)", "", "index.html:2906"),
        steps: [
          S("Lấy mã xác minh", "URL + hồ sơ Google", "thẻ meta", ["gscapi", "gchrome", "gsc"], "vps_puppeteer_api.js:176-462"),
          S("Chèn thẻ vào WordPress", "thẻ", "site có thẻ", ["gscapi", "gchrome", "wp"], "vps_puppeteer_api.js:709-895"),
          S("Bấm xác minh", "site", "kết quả", ["gscapi", "gchrome", "gsc"], "vps_puppeteer_api.js:494-698"),
          S("Nộp sitemap", "site", "sitemap", ["gscapi", "gchrome", "gsc"], "vps_puppeteer_api.js:906-1019"),
        ],
        output: O("Không dùng"),
      },
      {
        id: "g14", title: "Thêm & xác minh site bằng Google API", dead: "Chỉ còn code: phần giao diện tài khoản Google đã gỡ.",
        trigger: T("(không còn nút)", "", "index.html:1994"),
        steps: [
          S("Đăng nhập Google", "tài khoản", "token", ["gsc"], "index.html:1994-2037"),
          S("Lấy mã + xác minh + nộp sitemap", "site", "site đã xác minh", ["gsc"], "index.html:3110-3175"),
        ],
        output: O("Không dùng"),
      },
      {
        id: "g15", ctx: ["vps", "gsct"], title: "gsc-auto-sync (đồng bộ GSC tự động)", dead: "Không chạy: không có trong PM2 hay cron. Nếu bật sẽ đọc website từ Firebase của Dashboard.",
        trigger: T("12:00 và 00:00 (nếu được chạy)", "", "gsc-auto-sync.js:222-251"),
        steps: [
          S("Đọc danh sách website", "Firebase Dashboard", "website", ["dfb"], "gsc-auto-sync.js:38, 164"),
          S("Lấy số liệu GSC", "service account", "click / hiển thị", ["gsc"], "gsc-auto-sync.js:120-148"),
          S("Ghi gsc_cache", "số liệu", "Firebase", ["dfb"], "gsc-auto-sync.js:150-203"),
        ],
        output: O("Không dùng"),
      },
    ],
  },

  fin: {
    title: "Quản lý tài chính", core: "fin", ctx: ["vps", "caddy", "fgh", "fin"],
    lanes: [
      {
        id: "f1", title: "Đồng bộ dữ liệu",
        trigger: T("Mở app", "", "script.js:1251"),
        steps: [
          S("Đọc bản lưu trên máy", "localStorage", "dữ liệu", [], "script.js:131-147"),
          S("Nghe Firebase realtime", "user_data", "dữ liệu mới nhất (ghi đè)", ["ffb"], "script.js:149-172"),
        ],
        output: O("Giao diện cập nhật", "Mọi thay đổi ghi lại cả localStorage và Firebase (syncData)."),
      },
      {
        id: "f2", title: "Thêm giao dịch",
        trigger: T("Thêm thu / chi / nợ → Lưu", "", "script.js:543, 846"),
        steps: [
          S("Cập nhật số dư ví", "giao dịch", "số dư mới", [], "script.js:857-886"),
          S("Báo biến động số dư", "giao dịch mới", "tin nhắn", ["tg"], "script.js:888-891, 1544", "Token bot ghi cứng trong code."),
          S("Lưu", "dữ liệu", "Firebase", ["ffb"], "script.js:118-129"),
          S("Cảnh báo ngân sách", "chi tiêu", "thông báo 90% / 100% / vượt", [], "script.js:2844-2875"),
        ],
        output: O("Giao dịch + tin Telegram"),
      },
      {
        id: "f3", title: "Ví",
        trigger: T("Thêm / sửa / xoá ví, điều chỉnh số dư", "", "script.js:957-1011, 1764"),
        steps: [
          S("Cập nhật ví", "ví", "danh sách ví", [], "script.js:957-1011"),
          S("Lưu", "dữ liệu", "Firebase", ["ffb"], "script.js:118"),
        ],
        output: O("Danh sách ví"),
      },
      {
        id: "f4", title: "Danh mục & ngân sách",
        trigger: T("Quản lý danh mục / ngân sách", "", "script.js:1273, 2538"),
        steps: [
          S("Danh mục cha / con", "danh mục", "cây danh mục", [], "script.js:1273-1540"),
          S("Đặt ngân sách", "danh mục + hạn mức", "ngân sách", [], "script.js:2538-2574"),
          S("Lưu", "dữ liệu", "Firebase", ["ffb"], "script.js:118"),
        ],
        output: O("Ngân sách theo danh mục"),
      },
      {
        id: "f5", title: "Báo cáo",
        trigger: T("Đổi tab / kỳ báo cáo", "", "script.js:223, 1059"),
        steps: [
          S("Lọc theo kỳ", "giao dịch", "giao dịch trong kỳ", [], "script.js:327"),
          S("Vẽ biểu đồ", "giao dịch", "biểu đồ thu / chi theo ngày", [], "script.js:1068-1250"),
        ],
        output: O("Biểu đồ thu chi"),
      },
      {
        id: "f6", title: "Đồng bộ ngân hàng SePay",
        trigger: T("Nút Đồng bộ ngay", "Không có hẹn giờ tự chạy.", "index.html:686"),
        steps: [
          S("Lấy giao dịch ngân hàng", "token", "giao dịch mới", ["sepay"], "script.js:2002-2007"),
          S("Lọc trùng, gán ví & danh mục", "giao dịch", "giao dịch đã gán", [], "script.js:2015-2053"),
          S("Lưu", "dữ liệu", "Firebase", ["ffb"], "script.js:2055-2081"),
        ],
        output: O("Giao dịch ngân hàng vào app", "Không gửi Telegram cho giao dịch SePay."),
      },
    ],
  },
};

module.exports = { FLOWS };
