import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminStats } from "@/lib/orders";
import { formatUsd, formatVnd } from "@/data/products";

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export default async function AdminDashboard() {
  const stats = await getAdminStats();
  if (!stats) redirect("/login?next=/admin");

  const cards = [
    {
      label: "Doanh thu (trừ đơn hủy)",
      value: formatUsd(stats.revenueUsd),
      sub: `~${formatVnd(stats.revenueVnd)}`,
      icon: "payments",
    },
    {
      label: "Tổng đơn hàng",
      value: String(stats.totalOrders),
      sub: `${stats.ordersByStatus.length} trạng thái`,
      icon: "receipt_long",
    },
    {
      label: "Khách hàng",
      value: String(stats.totalUsers),
      sub: "tài khoản đã đăng ký",
      icon: "group",
    },
    {
      label: "Sản phẩm",
      value: String(stats.totalProducts),
      sub: "mẫu trong catalog",
      icon: "watch",
    },
  ];

  return (
    <div>
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Atelier Admin • Concierge Desk
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Tổng <span className="text-gold-gradient">Quan</span>
      </h1>

      <div className="mt-space-lg grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="gold-border-card p-6">
            <span className="material-symbols-outlined text-3xl text-primary">
              {c.icon}
            </span>
            <p className="font-display mt-3 text-3xl text-primary">{c.value}</p>
            <p className="font-label-spec text-label-spec mt-1 tracking-[0.2em] text-on-surface uppercase">
              {c.label}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {c.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-space-lg grid grid-cols-1 gap-space-md xl:grid-cols-2">
        <div className="gold-border-card p-6">
          <h2 className="font-title-editorial text-title-editorial text-on-surface">
            Đơn theo trạng thái
          </h2>
          <div className="mt-space-md space-y-space-xs">
            {stats.ordersByStatus.map((s) => (
              <Link
                key={s.status}
                href={`/admin/orders?status=${s.status}`}
                className="flex items-center justify-between rounded bg-surface-container px-4 py-3 transition-colors hover:bg-surface-container-high"
              >
                <span className="font-body-md text-body-md text-on-surface">
                  {STATUS_VN[s.status] ?? s.status}
                </span>
                <span className="font-display text-xl text-primary">
                  {s.count}
                </span>
              </Link>
            ))}
            {stats.ordersByStatus.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Chưa có đơn hàng nào.
              </p>
            )}
          </div>
        </div>

        <div className="gold-border-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-title-editorial text-title-editorial text-on-surface">
              Đơn mới nhất
            </h2>
            <Link
              href="/admin/orders"
              className="font-label-spec text-label-spec tracking-[0.2em] text-primary uppercase"
            >
              Tất cả →
            </Link>
          </div>
          <div className="mt-space-md space-y-space-xs">
            {stats.recentOrders.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders?status=${o.status}`}
                className="flex items-center justify-between rounded bg-surface-container px-4 py-3 transition-colors hover:bg-surface-container-high"
              >
                <span>
                  <span className="font-label-spec text-label-spec tracking-[0.15em] text-secondary uppercase">
                    Vault {o.code}
                  </span>
                  <span className="font-body-sm text-body-sm block text-on-surface-variant">
                    {o.customerName} • {STATUS_VN[o.status] ?? o.status}
                  </span>
                </span>
                <span className="font-display text-lg text-primary">
                  {formatUsd(o.totalUsd)}
                </span>
              </Link>
            ))}
            {stats.recentOrders.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Chưa có đơn hàng nào.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
