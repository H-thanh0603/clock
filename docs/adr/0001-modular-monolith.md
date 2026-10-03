# Modular monolith thay vì microservices

Backend là NestJS modular monolith duy nhất + 1 Postgres, frontend Next.js gọi qua REST. Không tách service dù có nhiều domain (order, payment, catalog, agent).

Vì catalog < 50k listing, đơn tính theo chục/ngày, 1 instance BE đủ tải — tách service chỉ thêm latency mạng, distributed transaction cho settle tiền, và vận hành multi-deploy mà không giải quyết bottleneck thật nào (bottleneck là DB index và guard I/O, không phải CPU).
