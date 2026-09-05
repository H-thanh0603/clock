import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyOrders } from "@/lib/orders";
import { formatUsd, formatVnd } from "@/data/products";

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export default async function AccountPage() {
  const orders = await getMyOrders();
  if (!orders) redirect("/login?next=/account");

  return (
    <div className="mx-auto max-w-page px-6 py-14 md:px-8">
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Circle Privé • Đơn Của Tôi
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Lịch Sử <span className="text-gold-gradient">Ủy Thác</span>
      </h1>

      {orders.length === 0 ? (
        <div className="gold-border-card mt-10 flex flex-col items-center gap-space-sm p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant">
            receipt_long
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Quý khách chưa có đơn hàng nào.
          </p>
          <Link
            href="/collections"
            className="mt-space-sm px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
          >
            Khám Phá Bộ Sưu Tập
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-space-md">
          {orders.map((o) => (
            <div key={o.id} className="gold-border-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <div>
                  <span className="font-label-spec text-label-spec tracking-[0.2em] text-secondary uppercase">
                    Vault {o.code}
                  </span>
                  <p className="font-body-sm text-body-sm mt-1 text-on-surface-variant">
                    {new Date(o.createdAt).toLocaleString("vi-VN")} •{" "}
                    {o.items.reduce((s, i) => s + i.qty, 0)} kiệt tác
                  </p>
                </div>
                <div className="text-right">
                  <span className="spec-badge px-2 py-1 text-primary">
                    {STATUS_VN[o.status] ?? o.status}
                  </span>
                  <p className="font-display mt-1 text-xl text-primary">
                    {formatUsd(o.totalUsd)}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    ~{formatVnd(Number(o.totalVnd))}
                  </p>
                </div>
              </div>
              <div className="mt-space-sm space-y-space-xs border-t border-outline-variant/20 pt-space-sm">
                {o.items.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between gap-space-sm font-body-sm text-body-sm"
                  >
                    <span className="text-on-surface">
                      {i.name}{" "}
                      <span className="text-on-surface-variant/70">× {i.qty}</span>
                    </span>
                    <span className="text-on-surface-variant">
                      {formatUsd(i.priceUsd * i.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
