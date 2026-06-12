const DOMAIN = "nthieucloud.shop";

const apps = [
    { id: "ai-assistant", name: "AI Assistant", icon: "fa-robot", desc: "Trợ lý AI đa năng, tự động hóa xử lý ngôn ngữ." },
    { id: "bulk-image-tool", name: "Bulk Image Tool", icon: "fa-images", desc: "Công cụ xử lý hàng loạt hình ảnh." },
    { id: "finance-tracker", name: "Finance Tracker", icon: "fa-chart-line", desc: "Theo dõi dòng tiền và tài chính cá nhân." },
    { id: "gsc-bulk-connect", name: "GSC Connect", icon: "fa-link", desc: "Kết nối dữ liệu Google Search Console." },
    { id: "gsc-bulk-tool", name: "GSC Bulk Tool", icon: "fa-database", desc: "Công cụ trích xuất dữ liệu GSC số lượng lớn." },
    { id: "haihieu", name: "Hai Hieu", icon: "fa-user-ninja", desc: "Dự án cá nhân / Công cụ ẩn." },
    { id: "seo-content-auditor", name: "SEO Content Auditor", icon: "fa-magnifying-glass-chart", desc: "Phân tích, chấm điểm chuẩn SEO nội dung." },
    { id: "task-manager", name: "Task Manager", icon: "fa-list-check", desc: "Quản lý tiến độ công việc hàng ngày." },
    { id: "Team02", name: "Team02", icon: "fa-users-gear", desc: "Không gian làm việc và chia sẻ tài nguyên nhóm." },
    { id: "vps-control-center", name: "VPS Control Center", icon: "fa-server", desc: "Quản trị hạ tầng máy chủ, hệ thống VPS." }
];

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("app-grid");

    apps.forEach((app, index) => {
        const url = `https://${app.id}.${DOMAIN}`;
        
        const card = document.createElement("a");
        card.href = url;
        card.target = "_blank"; // Cực kỳ quan trọng: Mở tab mới để đa tác vụ & cô lập session
        card.className = "app-card";
        card.style.animationDelay = `${index * 0.1}s`;

        card.innerHTML = `
            <div class="icon-wrapper">
                <i class="fa-solid ${app.icon}"></i>
            </div>
            <h2>${app.name}</h2>
            <p>${app.desc}</p>
            <div class="launch-btn">
                Mở ứng dụng <i class="fa-solid fa-arrow-right"></i>
            </div>
        `;

        grid.appendChild(card);
        
        // Trigger staggered animation
        setTimeout(() => {
            card.classList.add("animate-in");
        }, 100);
    });
});
