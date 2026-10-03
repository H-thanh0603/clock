# Aurel & Co. — E-commerce đồng hồ cao cấp

Boutique online bán đồng hồ cơ cao cấp (mới + Certified Pre-Owned), đặt chế tác bespoke, AI concierge tư vấn, thanh toán VNPay.

## Language

### Catalog

**Listing**:
Sản phẩm đang trưng bày (`inBoutique=true`) — thứ duy nhất khách thấy và mua được. Tắt listing nghĩa là ẩn khỏi cửa hàng.
_Avoid_: Product (chỉ dùng trong code/DB), item

**Certified Pre-Owned (CPO)**:
Đồng hồ hiệu cũ đã qua kiểm định 124 điểm của atelier, kèm chứng thư và lịch sử bảo dưỡng. Hàng one-off (stock=1), không giảm giá theo campaign hàng mới.
_Avoid_: Hàng cũ, secondhand, preowned (viết liền)

**Collection**:
Nhóm listing theo dòng (tourbillon, sport, classic...) — trục duyệt chính của catalog.

**Complication**:
Chức năng cơ học ngoài giờ-phút-giây (tourbillon, moonphase, chronograph...).

### Money

**Price truth**:
Giá bán LUÔN suy ra server-side từ DB theo slug (USD), VND = USD × tỉ giá. Không bao giờ tin giá client gửi lên.

**Deposit**:
Đặt cọc 20% bespoke — cam kết chế tác, không hoàn khi khách đổi ý.

**Promotion**:
Giảm giá theo khung ngày trên một tập listing, giá gốc snapshot để cron hồi. Không áp lên CPO.

**Campaign**:
Chiến dịch marketing (ngân sách, đối tượng, nội dung) — tách khỏi Promotion.

### Order & Payment

**Order**:
Đơn hàng từ giỏ, qua các trạng thái PENDING → CONFIRMED → PAID → SHIPPED → COMPLETED. Đơn đã PAID không hủy trực tiếp mà hoàn tiền (REFUNDED).
_Avoid_: Purchase, transaction

**Settle**:
Xác nhận tiền thật đã về qua VNPay (idempotent theo txnRef, amount đóng băng lúc tạo link) — điểm duy nhất đơn chuyển sang PAID.

**PaymentIntent**:
Hạn mức user duyệt TRƯỚC để agent thanh toán hộ — dùng 1 lần, hết hạn ngắn. Không thay được session.

**Idempotency-Key**:
Khóa chống tạo trùng đơn khi retry mạng/double-click — cùng key trả về đơn cũ.

### People

**Private Client**:
Khách VIP có thẻ — hưởng bảo dưỡng trọn đời, salon riêng.

**Concierge**:
AI shopping agent tư vấn, điền giỏ, tra đơn hộ khách.

**Merchant**:
Admin vận hành (giá, tồn kho, promotion) — mọi thao tác ghi đều kèm danh tính actor (người hay agent).

### Inquiry

**Salon**:
Lịch hẹn xem đồng hồ trực tiếp tại private salon.

**Bespoke dossier**:
Hồ sơ đặt chế tác độc bản (movement, vật liệu, mặt số, ngân sách) — gửi qua inquiry, concierge gọi lại.

**Nurture**:
Email nuôi dưỡng từ newsletter footer — khách tương lai của phân khúc entry/pre-owned.
