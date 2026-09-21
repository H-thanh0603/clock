import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByCode, isOrderFull } from "@/lib/orders";
import { formatUsd, formatVnd } from "@/data/products";
import { ClearCartOnPaid } from "./ClearCartOnPaid";
import { CancelGuestButton } from "./CancelGuestButton";
import { ContactReveal } from "./ContactReveal";
import { OrderStatusPoller } from "./OrderStatusPoller";
import { orderStatusLabel, serverLocale } from "@/components/OrderStatusLabel";
import { serverT } from "@/i18n/server";

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ paid?: string; reason?: string; sig?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const locale = await serverLocale();
  const { t } = await serverT(locale);
  // sig từ URL redirect VNPay (không login/nhớ SĐT vẫn xem được đơn mình).
  // Không sig + không session chính chủ → BE trả tối thiểu, trang hiện
  // trạng thái + form nhập contact để reveal (P1-6).
  const order = await getOrderByCode(code, { sig: sp.sig });
  if (!order) notFound();
  const full = isOrderFull(order);

  const paid = sp.paid === "1";

  return (
    <div className="mx-auto max-w-page px-6 py-16 md:px-8">
      <ClearCartOnPaid paid={paid} />
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
                {t("orders.paidOk")} <span className="text-gold-gradient">{t("orders.paidOkSuffix")}</span>
              </>
            ) : (
              <>
                {t("orders.received")} <span className="text-gold-gradient">{t("orders.receivedSuffix")}</span>
              </>
            )}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant/85">
            {paid
              ? t("orders.paidConfirmed")
              : `${t("orders.currentStatus")}: ${orderStatusLabel(order.status, locale)}. ${t("orders.conciergeConfirm")}`}
          </p>
          <OrderStatusPoller
            code={order.code}
            sig={sp.sig}
            initialStatus={order.status}
          />
          {full ? (
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
                <span className="text-on-surface">{t("orders.grandTotal")}</span>
                <span className="font-display text-xl text-primary">
                  {formatUsd(order.totalUsd)} (~{formatVnd(Number(order.totalVnd))})
                </span>
              </div>
            </div>
          ) : (
            <ContactReveal code={order.code} />
          )}
          <div className="mt-space-md flex flex-wrap justify-center gap-space-sm">
            <Link
              href="/collections"
              className="px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
            >
              {t("orders.continue")}
            </Link>
            <Link
              href="/account"
              className="px-space-xl py-3 rounded border border-primary-container/50 text-primary font-label-spec text-label-spec tracking-[0.2em] uppercase hover:bg-primary hover:text-on-primary transition-colors"
            >
              {t("orders.track")}
            </Link>
            {order.status === "PENDING" && (
              <CancelGuestButton code={order.code} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
