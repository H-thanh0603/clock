import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUserDetail, getAdminUsers } from "@/lib/orders";
import { USD_TO_VND } from "@/lib/pricing";
import { formatUsd, formatVnd } from "@/data/products";

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const users = await getAdminUsers();
  if (!users) redirect("/login?next=/admin/customers");

  const selected = sp.id
    ? await getAdminUserDetail(sp.id).catch(() => null)
    : null;

  return (
    <div>
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Atelier Admin • Circle Privé
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Khách <span className="text-gold-gradient">Hàng</span>
      </h1>

      <div className="mt-space-lg grid grid-cols-1 gap-space-md xl:grid-cols-2">
        <div className="space-y-space-xs">
          {users.map((u) => (
            <Link
              key={u.id}
              href={`/admin/customers?id=${u.id}`}
              className={`flex items-center justify-between rounded px-5 py-4 transition-colors ${
                sp.id === u.id
                  ? "bg-primary/15 ring-1 ring-primary"
                  : "bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div>
                <p className="font-body-md text-body-md font-semibold text-on-surface">
                  {u.name || u.email}{" "}
                  {u.role === "ADMIN" && (
                    <span className="font-label-spec text-label-spec ml-2 rounded bg-primary px-2 py-0.5 text-on-primary uppercase">
                      Admin
                    </span>
                  )}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {u.email} • {u.orderCount} đơn •{" "}
                  {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                </p>
              </div>
              <p className="font-display text-lg text-primary">
                {formatUsd(Math.round(u.totalVnd / USD_TO_VND))}
              </p>
            </Link>
          ))}
          {users.length === 0 && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              Chưa có tài khoản nào.
            </p>
          )}
        </div>

        <div>
          {!selected ? (
            <div className="gold-border-card p-12 text-center font-body-md text-body-md text-on-surface-variant">
              Chọn một khách hàng để xem lịch sử đơn.
            </div>
          ) : (
            <div className="gold-border-card p-6">
              <p className="font-title-editorial text-title-editorial text-on-surface">
                {selected.name || selected.email}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {selected.email} • tham gia{" "}
                {new Date(selected.createdAt).toLocaleDateString("vi-VN")}
              </p>
              <div className="mt-space-md space-y-space-xs">
                {selected.orders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded bg-surface-container px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-spec text-label-spec tracking-[0.15em] text-secondary uppercase">
                        Vault {o.code}
                      </span>
                      <span className="spec-badge px-2 py-1 text-primary">
                        {STATUS_VN[o.status] ?? o.status}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm mt-1 text-on-surface-variant">
                      {new Date(o.createdAt).toLocaleString("vi-VN")} •{" "}
                      {o.items.reduce((s, i) => s + i.qty, 0)} món
                    </p>
                    <p className="font-display mt-1 text-lg text-primary">
                      {formatUsd(o.totalUsd)} (~{formatVnd(o.totalVnd)})
                    </p>
                  </div>
                ))}
                {selected.orders.length === 0 && (
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Chưa có đơn hàng nào.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
