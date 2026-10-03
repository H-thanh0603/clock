# Agent ghi qua delegation, không qua session user

Agent (shopping/merchant) hành động thay user qua vé delegation riêng (`x-aurel-actor` + DelegationKey dùng 1 lần, hết hạn 24h), không bao giờ mượn session cookie. Backend chỉ tin header actor khi token là delegation (`aud=aurel-agent`), session browser luôn bị bỏ qua header để chống giả danh.

Đã cân nhắc cho agent dùng chung session user cho đơn giản, nhưng như vậy audit trail không phân biệt được "agent sửa" với "người sửa tay" (mọi ghi đều mang id admin dùng chung), và lộ session là lộ toàn quyền thay vì quyền giới hạn theo vé.
