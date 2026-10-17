const T = (label, detail, src, live) => ({ label, detail, src, live });
const S = (label, inp, out, calls, src, detail) => ({ label, in: inp, out, calls: calls || [], src, detail });
const O = (label, detail) => ({ label, detail });

const FLOWS = {
  sw: {
    title: "SEO Writer", core: "sw", ctx: ["vps", "caddy", "sw"],
    lanes: [
      {
        id: "sw1", title: "Viết 1 bài (thủ công, Bước 1→7)",
        trigger: T("Bấm “Nghiên cứu + Viết bài”", "Bước 1 có 1 từ khoá, chọn Thủ công. Hoặc Dashboard mở SEO Writer kèm site + tài khoản WordPress (?site&brand#wpu&wpp) rồi bấm tiếp.", "frontend/index.html:4236, 3219"),
        steps: [
          S("Tải dữ liệu site", "tên miền + tài khoản WordPress", "danh mục, bài, trang của site", ["wp"], "server.py:5907", "4 lệnh đọc WordPress REST chạy song song."),
          S("Nghiên cứu", "từ khoá chính + phụ", "SERP, tin, video, Reddit, trang thương hiệu, gợi ý, tóm tắt AI", ["serper", "reddit", "ext", "or"], "server.py:3400-3691", "7 việc chạy song song. Tóm tắt AI: mặc định GG AI Mode qua tiện ích Chrome; đổi sang Perplexity Sonar (OpenRouter) khi chọn."),
          S("Tiêu đề & meta", "nghiên cứu", "5 tiêu đề + meta", ["ext", "or"], "server.py:4631", "AI viết: Gemini app qua tiện ích Chrome trước, OpenRouter dự phòng (write_engine = gemini_app)."),
          S("Dàn ý", "tiêu đề + nghiên cứu", "các H2 / H3", ["ext", "or"], "server.py:4695"),
          S("Viết bài", "dàn ý + link nội bộ", "HTML cả bài", ["ext", "or"], "server.py:4806", "Viết cả bài trong 1 lần gọi AI, sau đó code chèn link, brand, Xem thêm."),
          S("Kiểm tra (Bước 6)", "HTML bài", "vị trí ảnh, meta, schema", ["ext", "or"], "server.py:5172"),
          S("Ảnh & đăng (Bước 7)", "HTML + ảnh", "ID bài, link", ["wp"], "server.py:5721, 5969", "Tải ảnh lên Media, tạo/cập nhật bài, gắn danh mục, ghi meta Rank Math."),
        ],
        output: O("Bài trên WordPress", "Nháp, đăng ngay hoặc hẹn giờ; bản lưu trong Lịch sử của tool."),
      },
      {
        id: "sw2", title: "Viết hàng loạt (chạy ngầm)",
        trigger: T("Bước 1 có ≥ 2 từ khoá, hoặc chọn Chạy ngầm", "Cũng chạy khi Dashboard gửi “Viết hàng loạt”, bấm thử lại ở bảng việc tiện ích, hoặc tool khởi động lại còn việc dở.", "frontend/index.html:4018-4132"),
        steps: [
          S("Xếp hàng đợi", "danh sách từ khoá", "tiến trình + lịch rải 30 phút/bài", [], "server.py:7000-7147", "Bỏ từ khoá đã viết ở site đó."),
          S("Nghiên cứu trước cả mẻ", "các từ khoá trong mẻ", "kết quả GG AI Mode", ["ext"], "server.py:2006-2015"),
          S("Tải bài của site (1 lần/site)", "site", "bài + danh mục", ["wp"], "server.py:6786"),
          S("Viết lần lượt từng bài", "từ khoá + nghiên cứu", "tiêu đề → dàn ý → bài → Bước 6", ["serper", "ext", "or"], "server.py:6308-6616", "Viết tuần tự, mỗi lúc 1 bài. Hết credit OpenRouter thì dừng cả mẻ."),
          S("Đăng hoặc giữ chờ lịch", "bài đã viết", "ID bài", ["wp"], "server.py:6545"),
        ],
        output: O("Bài trên WordPress (chưa ảnh)", "Tiến trình hiện ở chuông của Dashboard; kế hoạch nội dung được đánh dấu đã viết."),
      },
      {
        id: "sw3", ctx: ["vps", "cron", "sw"], title: "Autopilot",
        trigger: T("Cron gọi mỗi giờ", "POST /api/autopilot/tick lúc phút 0 mỗi giờ; hoặc nút “Chạy thử”.", "server.py:7223, crontab", "ap"),
        steps: [
          S("Kiểm tra điều kiện", "cấu hình autopilot", "chạy / bỏ qua", [], "server.py:7230-7237", "Phải đang bật, đúng giờ chạy (giờ VN), hôm nay chưa chạy, không có lượt khác đang chạy."),
          S("Lấy N từ khoá cũ nhất", "hàng đợi", "N từ khoá (số bài/ngày)", [], "server.py:6849"),
          S("Chạy như Viết hàng loạt", "N từ khoá", "N bài", ["serper", "ext", "or", "wp"], "server.py:6752"),
        ],
        output: O("N bài mới mỗi ngày", "Đang tắt thì mỗi giờ chỉ ghi “Bỏ qua” vào autopilot.log."),
      },
      {
        id: "sw4", ctx: ["vps", "sw"], title: "Tự làm ảnh",
        trigger: T("Vòng lặp nền mỗi 20 giây", "Bài bật “Tự làm ảnh”, đã qua Bước 6 và đã đăng hoặc đang chờ lịch. Không có hồ sơ Chrome nào Chạy nền thì chờ.", "server.py:2606, 2552", "ext"),
        steps: [
          S("Tạo prompt ảnh", "vị trí ảnh của bài", "prompt theo khung Studio của site", [], "server.py:2360-2384"),
          S("Vẽ ảnh", "prompt", "ảnh gốc", ["ext"], "server.py:2796, 3200", "Tiện ích mở nhiều tab Gemini / GG AI song song; máy chủ chờ tối đa 45 phút."),
          S("Ghép khung + WebP", "ảnh gốc", "ảnh hoàn chỉnh", [], "server.py:2476, frame_render.py"),
          S("Tải ảnh lên", "ảnh", "ID ảnh", ["wp"], "server.py:2489"),
          S("Cập nhật bài kèm ảnh", "bài + ID ảnh", "bài đủ ảnh", ["wp"], "server.py:2527"),
        ],
        output: O("Bài WordPress đủ ảnh", "Lỗi thì 30 phút sau thử lại, tối đa 3 lần."),
      },
      {
        id: "sw5", ctx: ["vps", "sw"], title: "Hẹn giờ đăng (bài tự làm ảnh)",
        trigger: T("Vòng lặp mỗi 30 giây", "Bài được giữ trong tool đã tới giờ đăng. Bài không tự làm ảnh thì WordPress tự hẹn giờ, không qua làn này.", "server.py:2706, 5984"),
        steps: [
          S("Chờ đủ ảnh", "bài tới giờ", "bài + ảnh", [], "server.py:2719"),
          S("Tải ảnh lên", "ảnh lưu trong tool", "ID ảnh", ["wp"], "server.py:2638"),
          S("Đăng bài", "bài + ảnh", "bài đã đăng", ["wp"], "server.py:2638-2695"),
        ],
        output: O("Bài đăng đúng lịch", "Lỗi thì 5 phút sau thử lại."),
      },
      {
        id: "sw6", title: "Ảnh hàng loạt / Studio",
        trigger: T("Nút Ảnh hàng loạt", "Ở Lịch sử, ở Bước 7, hoặc Dashboard “Làm ảnh hàng loạt” (#artids=).", "frontend/index.html:366, 931, 3314"),
        steps: [
          S("Nạp bài", "danh sách bài", "vị trí ảnh từng bài", ["ext", "or"], "frontend/index.html:1756"),
          S("Đặt tên file ảnh", "vị trí ảnh", "tên + alt", ["ext", "or"], "server.py:5539"),
          S("Lấy ảnh", "ZIP / dán / Gemini", "ảnh gốc", ["ext"], "server.py:2772"),
          S("Ghép khung", "ảnh gốc", "ảnh hoàn chỉnh", [], "server.py:1656", "Ghép trong trình duyệt; khung Neon ghép ở máy chủ (Pillow)."),
          S("Đẩy lên WordPress", "ảnh + bài", "bài cập nhật", ["wp"], "frontend/index.html:2971-3060"),
        ],
        output: O("Các bài đủ ảnh"),
      },
    ],
  },

  ex: {
    title: "Chuyên gia SEO", core: "ex", ctx: ["vps", "caddy", "dash", "sw", "ex"],
    lanes: [
      {
        id: "ex1", title: "Hỏi đáp",
        trigger: T("Gửi câu hỏi", "Tab Báo cáo (hỏi chung) hoặc tab Chuyên gia của một website trên Dashboard. Hỏi theo site cần hồ sơ tích hợp đã xác nhận.", "seo_expert.js:73, 1139; seo_expert.py:299"),
        steps: [
          S("Gom ngữ cảnh site", "website", "chuỗi 301, GSC, nội dung, việc", ["gsc"], "seo_expert.js:233-302", "Dashboard gom trên trình duyệt; không gửi mật khẩu."),
          S("Đổi câu hỏi thành truy vấn", "câu hỏi", "truy vấn tiếng Anh", ["or"], "seo_expert.py:302"),
          S("Tra tài liệu Google", "truy vấn", "đoạn tài liệu liên quan", [], "seo_expert.py:98", "Kho tài liệu Google Search Central lưu sẵn trên VPS."),
          S("Ghép hồ sơ site", "website", "hồ sơ tích hợp, kế hoạch, khám bệnh", [], "seo_expert.py:327-347"),
          S("Trả lời", "câu hỏi + tài liệu + hồ sơ", "câu trả lời có nguồn", ["or"], "seo_expert.py:349", "Dùng key và model riêng của chuyên gia."),
        ],
        output: O("Câu trả lời có trích nguồn", "Lưu vào lịch sử chat."),
      },
      {
        id: "ex2", title: "Hồ sơ tích hợp (site mới)",
        trigger: T("Điền form tích hợp", "Tab Chuyên gia của website trên Dashboard.", "seo_expert.js:1044"),
        steps: [
          S("Đọc file GSC / GA (tuỳ chọn)", "file xuất", "tóm tắt số liệu", ["or"], "seo_expert_integrate.py:113"),
          S("Nghiên cứu từ khoá", "≤ 5 từ khoá", "kết quả Google", ["serper"], "seo_expert.js:707"),
          S("Viết báo cáo", "form + nghiên cứu + tài liệu", "báo cáo + phần vấn đề", ["or"], "seo_expert_integrate.py:237-306", "2 lần gọi AI nối tiếp."),
          S("Bạn duyệt & xác nhận", "bản nháp", "hồ sơ đã xác nhận", [], "seo_expert_integrate.py:308"),
        ],
        output: O("Hồ sơ tích hợp", "Làm nền cho hỏi đáp và lập kế hoạch."),
      },
      {
        id: "ex3", title: "Khám bệnh (site cũ)",
        trigger: T("Bấm Khám bệnh", "Tab Chuyên gia của website có sẵn.", "seo_expert.js:1238"),
        steps: [
          S("Đo song song", "website", "on-page, kỹ thuật, link, ảnh, tốc độ, index, brand", ["dash", "psi", "gsc", "serper"], "seo_expert.js:316-395", "Máy chủ Dashboard quét trang (/api/site-checkup); trình duyệt gọi PageSpeed 3 URL, GSC sitemap + 5 URL, Serper tên thương hiệu."),
          S("Chấm điểm", "số đo", "đạt / cảnh báo / lỗi", [], "seo_expert.js:398"),
          S("Viết bệnh án", "điểm + lần khám trước", "bệnh án", ["or"], "seo_checkup.py:44-81"),
          S("Xác nhận", "bệnh án", "hồ sơ tích hợp", [], "server.py:1352"),
        ],
        output: O("Bệnh án = hồ sơ tích hợp của site cũ"),
      },
      {
        id: "ex4", title: "Lập kế hoạch nội dung",
        trigger: T("Tải CSV Keyword Planner + Bắt đầu", "Cần hồ sơ tích hợp đã xác nhận.", "seo_expert.js:733, 1351"),
        steps: [
          S("Khung danh mục", "hồ sơ tích hợp", "danh mục, nhịp đăng", ["or"], "seo_expert_plan.py:123"),
          S("Lấy SERP từng từ khoá", "danh sách từ khoá", "top Google (có lưu cache)", ["serper"], "seo_expert_plan.py:162-198", "Tối đa 10 lệnh cùng lúc."),
          S("Gom cụm", "SERP", "cụm từ khoá", [], "seo_expert_plan.py:272"),
          S("Phân loại & tách cụm lớn", "cụm", "bài chính / từ phụ / danh mục", ["or"], "seo_expert_plan.py:332-483"),
          S("Sửa tay & xác nhận", "bảng kế hoạch", "kế hoạch đã chốt", [], "seo_expert_plan.py:773-796"),
        ],
        output: O("Kế hoạch đã xác nhận", "Cấu trúc danh mục ghi vào hồ sơ tích hợp."),
      },
      {
        id: "ex5", title: "Kho nội dung",
        trigger: T("Mở tab ✍️ Nội dung của website", "", "content_mgr.js:60"),
        steps: [
          S("Quét bài WordPress", "website", "bài, trang, danh mục", ["wp"], "content_mgr.js:75-113", "Trình duyệt đọc WordPress REST, chỉ lấy phần mới sửa."),
          S("Lưu & đánh dấu bài đã xoá", "bài quét được", "kho bài", [], "seo_content.py:149"),
          S("Nhập từ kế hoạch", "kế hoạch", "bài mới / gắn bài cũ (lọc trùng từ khoá)", [], "seo_content.py:201-238"),
          S("Viết / làm ảnh hàng loạt", "bài đã chọn", "giao cho SEO Writer", ["sw"], "content_mgr.js:449-477"),
          S("Check index", "bài đã chọn", "đã / chưa index", ["serper"], "content_mgr.js:478-491"),
        ],
        output: O("Kho bài theo kế hoạch", "Trạng thái viết, đăng, index từng bài."),
      },
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
