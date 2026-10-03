# Notify in-memory queue thay vì BullMQ/Redis

Notify (Telegram/SMTP) đi qua hàng đợi in-memory trong process BE với retry backoff 30s→2m→8m, max 3 lần. Đủ cho 1 instance BE và vài chục notify/ngày.

Đã cân nhắc BullMQ + Redis ngay từ đầu (chuẩn production), nhưng thêm hạ tầng stateful chỉ để chống mất vài thông báo đang retry khi restart container là over-provisioning. Trigger chuyển đổi rõ ràng: > 500 đơn/ngày hoặc BE ≥ 2 instance (xem AUDIT.md §6).
