import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatUsd, formatVnd } from "@/data/products";

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ paid?: string; reason?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const order = await prisma.order.findUnique({
    where: { code },
    include: { items: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) notFound();

  const paid = sp.paid === "1";

  return (
    <div className="mx-auto max-w-page px-6 py-16 md:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="gold-border-card flex flex-col items-center gap-space-sm p-10 text-center">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full ${paid || order.status !== "PENDING" ? "bg-primary/15 text-primary" : "bg-surface-container-high text-on-surface-variant"}`}
          >
            <span className="material-symbols-outlined text-[36px]">
              {paid || order.status !== "PENDING" ? "verified" : "hourglass_top"}
            </span>
          </span>
          <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
            Vault {order.code}
          </span>
          <h1 className="font-display text-3xl font-medium md:text-4xl">
            {paid ? (
              <>
                Thanh Toán <span className="text-gold-gradient">Thành Công</span>
              </>
            ) : (
              <>
                Đơn Đã Được <span className="text-gold-gradient">Tiếp Nhận</span>
              </>
            )}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant/85">
            {paid
              ? "VNPay đã xác nhận giao dịch. Concierge sẽ liên hệ bàn giao trong 2 giờ làm việc."
              : `Trạng thái hiện tại: ${STATUS_VN[order.status] ?? order.status}. Concierge sẽ liên hệ xác nhận trong 2 giờ làm việc.`}
          </p>
          <div className="mt-space-sm w-full space-y-space-xs border-t border-outline-variant/20 pt-space-md text-left">
            {order.items.map((i) => (
              <div
                key={i.id}
                className="font-body-sm text-body-sm flex items-center justify-between gap-space-sm"
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
            <div className="font-body-md text-body-md flex items-center justify-between pt-space-xs">
              <span className="text-on-surface">Tổng quyết toán</span>
              <span className="font-display text-xl text-primary">
                {formatUsd(order.totalUsd)} (~{formatVnd(Number(order.totalVnd))})
              </span>
            </div>
          </div>
          <div className="mt-space-md flex flex-wrap justify-center gap-space-sm">
            <Link
              href="/collections"
              className="px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
            >
              Tiếp Tục Sưu Tầm
            </Link>
            <Link
              href="/account"
              className="px-space-xl py-3 rounded border border-primary-container/50 text-primary font-label-spec text-label-spec tracking-[0.2em] uppercase hover:bg-primary hover:text-on-primary transition-colors"
            >
              Theo Dõi Đơn
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
