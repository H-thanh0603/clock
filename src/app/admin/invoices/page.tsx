import { redirect } from "next/navigation";
import { getAdminInvoices, type AdminInvoice } from "@/lib/orders";
import { InvoiceActions } from "./InvoiceActions";

const STATUS_VN: Record<string, string> = {
  PENDING_ISSUE: "Chờ phát hành",
  ISSUED: "Đã phát hành",
  FAILED: "Lỗi NCC",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING_ISSUE: "bg-secondary/15 text-secondary",
  ISSUED: "bg-primary/15 text-primary",
  FAILED: "bg-error/15 text-error",
};

function fmtVnd(n: number) {
  return `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;
}

/** Backoffice hóa đơn: kế toán phát hành tay qua portal NCC rồi đánh dấu
 *  ISSUED ở đây (kèm số hóa đơn để đối chiếu), hoặc retry qua NCC tích hợp. */
export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const data = await getAdminInvoices(sp.status, pageNum);
  if (!data) redirect("/login?next=/admin/invoices");
  const { items, total, limit } = data;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto max-w-page px-6 py-14 md:px-8">
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        Atelier Admin • Kế Toán
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        Hóa Đơn <span className="text-gold-gradient">Điện Tử</span>
      </h1>
      <p className="font-body-sm text-body-sm mt-2 max-w-2xl text-on-surface-variant">
        Đơn PAID tự sinh hóa đơn ở trạng thái chờ. Kế toán phát hành qua portal
        nhà cung cấp rồi đánh dấu đã phát hành (kèm số hóa đơn), hoặc bấm thử
        lại khi nhà cung cấp đã tích hợp API.
      </p>

      <div className="mt-space-lg flex flex-wrap gap-space-xs">
        <a
          href="/admin/invoices"
          className={`rounded px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] uppercase transition-colors ${!sp.status ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
        >
          Tất cả ({total})
        </a>
        {Object.keys(STATUS_VN).map((s) => (
          <a
            key={s}
            href={`/admin/invoices?status=${s}`}
            className={`rounded px-4 py-2 font-label-spec text-label-spec tracking-[0.15em] uppercase transition-colors ${sp.status === s ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            {STATUS_VN[s]}
          </a>
        ))}
      </div>

      <div className="mt-space-lg space-y-space-md">
        {items.length === 0 && (
          <div className="gold-border-card p-12 text-center font-body-md text-body-md text-on-surface-variant">
            Chưa có hóa đơn nào.
          </div>
        )}
        {items.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} />
        ))}
      </div>

      {pageCount > 1 && (
        <div className="mt-space-lg flex items-center gap-space-sm">
          {pageNum > 1 && (
            <a
              href={`/admin/invoices?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), page: String(pageNum - 1) })}`}
              className="rounded bg-surface-container px-4 py-2 font-label-spec text-label-spec uppercase"
            >
              ← Trước
            </a>
          )}
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Trang {pageNum}/{pageCount}
          </span>
          {pageNum < pageCount && (
            <a
              href={`/admin/invoices?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), page: String(pageNum + 1) })}`}
              className="rounded bg-surface-container px-4 py-2 font-label-spec text-label-spec uppercase"
            >
              Sau →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ inv }: { inv: AdminInvoice }) {
  return (
    <div className="gold-border-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-space-md">
        <div>
          <span className="font-label-spec text-label-spec tracking-[0.2em] text-secondary uppercase">
            Vault {inv.orderCode}
          </span>
          <p className="font-body-md text-body-md mt-1 text-on-surface">
            {inv.buyerName}
            {inv.buyerEmail ? ` • ${inv.buyerEmail}` : ""}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {fmtVnd(inv.amountVnd)} •{" "}
            {new Date(inv.createdAt).toLocaleString("vi-VN")}
            {inv.number ? ` • Số ${inv.number}` : ""}
            {inv.externalRef ? ` • Ref ${inv.externalRef}` : ""}
          </p>
        </div>
        <span
          className={`rounded px-3 py-1 font-label-spec text-label-spec tracking-[0.15em] uppercase ${STATUS_STYLE[inv.status] ?? "bg-surface-container"}`}
        >
          {STATUS_VN[inv.status] ?? inv.status}
        </span>
      </div>
      {inv.status !== "ISSUED" && <InvoiceActions id={inv.id} status={inv.status} />}
    </div>
  );
}
