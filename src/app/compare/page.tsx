"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Product } from "@/data/products";
import { apiUrl } from "@/lib/api-client";
import { useCurrency } from "@/components/CurrencyProvider";
import { useLocale } from "@/components/LocaleProvider";
import { mediaUrl } from "@/lib/media";

const MAX_COMPARE = 4;

function parseSlugs(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);
}

/**
 * Trang so sánh công khai (khám phá online = kênh so sánh — research: 2/3
 * người dùng AI/online dùng để so sánh trước khi mua). URL chia sẻ được:
 * /compare?slugs=a,b,c — thêm ?slugs=<slug> từ nút "So sánh" trang sản phẩm.
 */
function CompareView() {
  const { t } = useLocale();
  const { price } = useCurrency();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const slugs = useMemo(
    () => parseSlugs(new URLSearchParams(window.location.search).get("slugs")),
    []
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(
      slugs.map((s) =>
        fetch(apiUrl(`/products/${encodeURIComponent(s)}`))
          .then((r) => (r.ok ? (r.json() as Promise<Product>) : null))
          .catch(() => null)
      )
    ).then((list) => {
      if (alive) {
        setItems(list.filter((p): p is Product => Boolean(p)));
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [slugs]);

  const rows: { label: string; render: (p: Product) => React.ReactNode }[] = [
    { label: t("compare.price"), render: (p) => price(p.priceUsd, p.priceVnd) },
    { label: t("compare.diameter"), render: (p) => `${p.diameterMm} mm` },
    { label: t("compare.calibre"), render: (p) => p.calibre },
    { label: t("compare.material"), render: (p) => p.caseMaterial },
    {
      label: t("compare.complications"),
      render: (p) => (p.complications.length ? p.complications.join(", ") : "—"),
    },
    {
      label: t("compare.stock"),
      render: (p) => (p.inBoutique ? `${t("compare.inStock")} (${p.stock})` : t("compare.preOrder")),
    },
    {
      label: t("compare.cpo"),
      render: (p) =>
        p.condition === "PRE_OWNED" ? (
          <span className="text-primary font-semibold">
            ✓ {p.certifiedBy ?? "CPO"}
          </span>
        ) : (
          t("compare.newCondition")
        ),
    },
  ];

  if (loading) {
    return <p className="font-body-md text-on-surface-variant">…</p>;
  }
  if (items.length < 2) {
    return (
      <div className="flex flex-col items-center gap-space-md text-center">
        <span className="material-symbols-outlined text-primary text-[48px]">balance</span>
        <p className="font-body-md text-on-surface-variant max-w-lg">{t("compare.empty")}</p>
        <Link
          href="/collections"
          className="px-space-lg py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-colors"
        >
          {t("compare.browse")}
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[720px]">
        <thead>
          <tr>
            <th className="text-left p-space-md w-40"></th>
            {items.map((p) => (
              <th key={p.slug} className="p-space-md text-center align-bottom">
                <Link href={`/products/${p.slug}`} className="group block">
                  <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded bg-surface-container-high">
                    <Image
                      src={mediaUrl(p.cardImage)}
                      alt={p.name}
                      fill
                      sizes="220px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <p className="font-title-editorial text-body-md text-on-surface mt-space-sm uppercase tracking-wide group-hover:text-primary">
                    {p.name}
                  </p>
                  <p className="font-label-badge text-label-badge text-on-surface-variant">
                    {p.reference}
                  </p>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 ? "bg-surface-container/40" : ""}>
              <td className="p-space-md font-label-spec text-label-spec uppercase tracking-wider text-primary align-top">
                {r.label}
              </td>
              {items.map((p) => (
                <td
                  key={p.slug}
                  className="p-space-md text-center font-body-md text-on-surface"
                >
                  {r.render(p)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="p-space-md"></td>
            {items.map((p) => (
              <td key={p.slug} className="p-space-md text-center">
                <Link
                  href={`/products/${p.slug}`}
                  className="inline-block px-space-md py-2 rounded border border-primary/50 text-primary font-label-spec text-label-spec uppercase tracking-[0.15em] hover:bg-primary hover:text-on-primary transition-colors"
                >
                  {t("compare.view")}
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-space-lg font-body-sm text-body-sm text-on-surface-variant/70">
        {t("compare.shareHint")}
      </p>
    </div>
  );
}

export default function ComparePage() {
  const { t } = useLocale();
  return (
    <div className="max-w-[1360px] mx-auto px-gutter-desktop py-space-3xl w-full">
      <div className="flex items-center gap-space-xs mb-space-sm">
        <span className="h-px w-8 bg-primary"></span>
        <span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">
          Curatorial Balance
        </span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight mb-space-xl">
        {t("compare.title")}
      </h1>
      <Suspense fallback={null}>
        <CompareView />
      </Suspense>
    </div>
  );
}
