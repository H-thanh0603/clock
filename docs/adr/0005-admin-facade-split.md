# AdminService tách 6 service theo domain, facade giữ shape

`AdminService` (843 dòng, 6 cụm logic) tách thành 6 service theo domain CONTEXT.md: Orders / Customers / Listings / Promotions / Campaigns / Finance, cộng `product-audit.ts` (productDiff + auditEvent dùng chung). `AdminService` còn lại là facade delegate thuần — AdminController không đổi dòng nào, test chia theo cụm.

Đã cân nhắc tách luôn controller thành 6 controller, nhưng route `/admin/*` là 1 backoffice duy nhất, AdminGuard áp 1 lần ở class — tách controller chỉ thêm file mà không giảm coupling. Xóa facade khi nào controller cần inject trực tiếp service con (VD backoffice tách trang cần scope riêng).
