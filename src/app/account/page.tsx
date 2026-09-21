import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyOrders } from "@/lib/orders";
import { formatUsd, formatVnd } from "@/data/products";
import { CancelOrderButton } from "./OrderActions";
import { ProfileForms } from "./ProfileForms";
import { orderStatusLabel, serverLocale } from "@/components/OrderStatusLabel";
import { serverT } from "@/i18n/server";

export default async function AccountPage() {
  const locale = await serverLocale();
  const { t } = await serverT(locale);
  const L = {
    circleOrders: t("account.circleOrders"), history: t("account.history"),
    delegate: t("account.delegate"), noOrders: t("account.noOrders"),
    explore: t("account.explore"), pieces: t("account.pieces"),
    deposited: t("account.deposited"), remaining: t("account.remaining") };
  const data = await getMyOrders();
  if (!data) redirect("/login?next=/account");
  const orders = data.items;

  return (
    <div className="mx-auto max-w-page px-6 py-14 md:px-8">
      <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
        {L.circleOrders}
      </span>
      <h1 className="font-display mt-3 text-4xl font-medium">
        {L.history} <span className="text-gold-gradient">{L.delegate}</span>
      </h1>

      <ProfileForms />

      {orders.length === 0 ? (
        <div className="gold-border-card mt-10 flex flex-col items-center gap-space-sm p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant">
            receipt_long
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {L.noOrders}
          </p>
          <Link
            href="/collections"
            className="mt-space-sm px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
          >
            {L.explore}
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
                    {new Date(o.createdAt).toLocaleString(locale === "en" ? "en-US" : "vi-VN")} •{" "}
                    {o.items.reduce((s, i) => s + i.qty, 0)} {L.pieces}
                  </p>
                </div>
                <div className="text-right">
                  <span className="spec-badge px-2 py-1 text-primary">
                    {orderStatusLabel(o.status, locale)}
                  </span>
                  <p className="font-display mt-1 text-xl text-primary">
                    {formatUsd(o.totalUsd)}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    ~{formatVnd(Number(o.totalVnd))}
                  </p>
                  {o.paidVnd > 0 && Number(o.paidVnd) < Number(o.totalVnd) && (
                    <p className="font-body-sm text-body-sm text-secondary">
                      {L.deposited} {formatUsd(o.paidUsd)} • {L.remaining}{" "}
                      {formatUsd(o.totalUsd - o.paidUsd)}
                    </p>
                  )}
                  {o.status === "PENDING" && (
                    <p className="mt-1">
                      <CancelOrderButton id={o.id} />
                    </p>
                  )}
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
