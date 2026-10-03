# Meilisearch xếp hạng, Prisma giữ sự thật

`?q=` full-text chạy qua Meilisearch (typo-tolerance) nhưng Meili chỉ trả về slug theo relevance — mọi filter/sort/pagination và dữ liệu trả về đều qua Prisma. Meili chết hoặc chưa cấu hình thì fallback Prisma `contains`, search không bao giờ fail vì engine.

Đã cân nhắc để Meili làm nguồn dữ liệu chính cho catalog (nhanh hơn, đỡ join), nhưng như vậy giá/tồn kho hiển thị có thể lệch với DB lúc settle tiền — Price truth (CONTEXT.md) bắt buộc đọc từ DB, nên Meili chỉ làm lớp xếp hạng mỏng bên ngoài.
