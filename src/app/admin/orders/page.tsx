import { redirect } from "next/navigation";
import { getAdminOrders } from "@/lib/orders";
import { formatUsd, formatVnd } from "@/data/products";
import { StatusSelect } from "./StatusSelect";

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const data = await getAdminOrders(sp.status);
  if (!data) redirect("/login?next=/admin/orders");
  const { orders, counts } = data;

  return (
    <div className="mx-auto max-w-page px-6 py-14 md:px-8">
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Atelier Admin • Concierge Desk
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Quản Trị <span className="text-gold-gradient">Đơn Hàng</span>
      </h1>

      <div className="mt-space-lg flex flex-wrap gap-space-xs">
        <a
          href="/admin/orders"
          className={`rounded px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] uppercase transition-colors ${!sp.status ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
        >
          Tất cả
        </a>
        {counts.map((c) => (
          <a
            key={c.status}
            href={`/admin/orders?status=${c.status}`}
            className={`rounded px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] uppercase transition-colors ${sp.status === c.status ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            {STATUS_VN[c.status] ?? c.status} ({c._count.status})
          </a>
        ))}
      </div>

      <div className="mt-space-lg space-y-space-md">
        {orders.length === 0 && (
          <div className="gold-border-card p-12 text-center font-body-md text-body-md text-on-surface-variant">
            Chưa có đơn hàng nào.
          </div>
        )}
        {orders.map((o) => (
          <div key={o.id} className="gold-border-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-space-md">
              <div>
                <span className="font-label-spec text-label-spec tracking-[0.2em] text-secondary uppercase">
                  Vault {o.code}
                </span>
                <p className="font-body-md text-body-md mt-1 text-on-surface">
                  {o.customerName} • {o.contact}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {o.address}
                  {o.slot ? ` • Giao: ${o.slot}` : ""}
                </p>
                <p className="font-body-sm text-body-sm mt-1 text-on-surface-variant/70">
                  {new Date(o.createdAt).toLocaleString("vi-VN")} •{" "}
                  {o.items.reduce((s, i) => s + i.qty, 0)} món • Thanh toán:{" "}
                  {(o.payments ?? [])[0]?.method ?? "—"} (
                  {(o.payments ?? [])[0]?.status ?? "—"})
                </p>
              </div>
              <div className="flex flex-col items-end gap-space-xs">
                <p className="font-display text-xl text-primary">
                  {formatUsd(o.totalUsd)}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  ~{formatVnd(Number(o.totalVnd))}
                </p>
                <StatusSelect id={o.id} status={o.status} />
              </div>
            </div>
            <div className="mt-space-sm space-y-space-2xs border-t border-outline-variant/20 pt-space-sm">
              {o.items.map((i) => (
                <div
                  key={i.id}
                  className="font-body-sm text-body-sm flex items-center justify-between gap-space-sm"
                >
                  <span className="text-on-surface-variant">
                    {i.name} — {i.strap}
                    {i.engraving ? ` • “${i.engraving}”` : ""} × {i.qty}
                  </span>
                  <span className="text-on-surface">
                    {formatUsd(i.priceUsd * i.qty)}
                  </span>
                </div>
              ))}
              {(o.events ?? []).length > 0 && (
                <p className="font-body-sm text-body-sm pt-space-2xs text-on-surface-variant/70">
                  Lịch sử:{" "}
                  {(o.events ?? [])
                    .map(
                      (e) =>
                        `${e.from ? `${STATUS_VN[e.from] ?? e.from}→` : ""}${STATUS_VN[e.to] ?? e.to}`
                    )
                    .join(" • ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
