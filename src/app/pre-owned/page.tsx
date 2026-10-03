import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getProductPage } from "@/lib/db";
import type { Product } from "@/data/products";
import { absoluteSiteUrl, safeJsonLd } from "@/lib/json-ld";
import { mediaUrl } from "@/lib/media";
import { serverLocale } from "@/components/OrderStatusLabel";
import { serverT } from "@/i18n/server";

export const metadata = {
  title: "Certified Pre-Owned — Aurel & Co.",
  description:
    "Đồng hồ cơ hiệu cũ kiểm định 124 điểm, kèm chứng thư và lịch sử bảo dưỡng — đổi trả 14 ngày như hàng mới.",
};

/**
 * Trang dòng Certified Pre-Owned (định hướng thị trường 2026: resale là
 * kênh tăng trưởng nhanh nhất ngành, +4–6%/năm; rào cản lớn nhất là NIỀM
 * TIN → trang này bán "bằng chứng": chứng thư, service history, FAQ).
 */
export default async function PreOwnedPage() {
  const locale = await serverLocale();
  const { t } = await serverT(locale);
  const page = await getProductPage({ condition: "PRE_OWNED", limit: 50 });
  const items: Product[] = page.items;

  const faqs = [
    { q: t("preowned.faq1q"), a: t("preowned.faq1a") },
    { q: t("preowned.faq2q"), a: t("preowned.faq2a") },
    { q: t("preowned.faq3q"), a: t("preowned.faq3a") },
  ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Aurel & Co.", item: absoluteSiteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Certified Pre-Owned", item: absoluteSiteUrl("/pre-owned") },
    ],
  };

  return (
    <div className="flex flex-col w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd([faqLd, breadcrumbLd]) }}
      />
      {/* HERO */}
      <section className="relative w-full overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src={mediaUrl(
              "/images/macro-view-of-watch-exhibition-sapphire-caseback-revealing-h.jpg",
            )}
            alt=""
            fill
            className="object-cover opacity-25"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-surface/80 via-surface/95 to-surface" />
        </div>
        <div className="max-w-[1360px] mx-auto px-gutter-desktop py-space-3xl w-full">
          <p className="font-label-spec text-label-spec uppercase tracking-[0.35em] text-secondary">
            Heritage Archive · Est. 1892
          </p>
          <h1 className="font-display text-headline-lg text-on-surface mt-3">
            {t("preowned.title")}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-3 max-w-2xl">
            {t("preowned.subtitle")}
          </p>
        </div>
      </section>

      {/* GRID */}
      <section className="max-w-[1360px] mx-auto px-gutter-desktop pb-space-3xl w-full">
        <div className="flex items-center gap-space-xs mb-space-xl">
          <span className="h-px w-8 bg-primary"></span>
          <span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">
            {t("preowned.listTitle")}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="font-body-md text-on-surface-variant">{t("preowned.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-lg">
            {items.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        )}
        <div className="mt-space-2xl flex flex-wrap gap-space-md items-center justify-between rounded border border-outline-variant/25 bg-surface-container/50 p-space-lg">
          <p className="font-body-md text-on-surface-variant max-w-xl">
            {t("preowned.faq3q")}
          </p>
          <Link
            href="/#private-salon"
            className="px-space-lg py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-colors"
          >
            Aurel Concierge →
          </Link>
        </div>

        {/* FAQ (visible + FAQPage JSON-LD ở head cho GEM/AI answer) */}
        <div className="mt-space-3xl">
          <div className="flex items-center gap-space-xs mb-space-lg">
            <span className="h-px w-8 bg-primary"></span>
            <span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">
              {t("preowned.faqTitle")}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="rounded border border-outline-variant/25 bg-surface-container-low p-space-lg"
              >
                <h3 className="font-title-editorial text-body-md text-on-surface uppercase tracking-wide">
                  {f.q}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 leading-relaxed">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
