"use client";

import { useMemo, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { products, collectionLabels, type Collection } from "@/data/products";

const diameterRanges = [
  { id: "s", label: "≤ 39mm", test: (d: number) => d <= 39 },
  { id: "m", label: "40 — 41mm", test: (d: number) => d > 39 && d <= 41 },
  { id: "l", label: "≥ 42mm", test: (d: number) => d >= 42 },
];

const sortOptions = [
  { id: "featured", label: "Nổi bật" },
  { id: "price-asc", label: "Giá: thấp → cao" },
  { id: "price-desc", label: "Giá: cao → thấp" },
  { id: "name", label: "Tên A → Z" },
];

const allComplications = Array.from(
  new Set(products.flatMap((p) => p.complications))
).sort();

const allCaseMaterials = Array.from(
  new Set(products.map((p) => p.caseMaterial))
).sort();

function CatalogView() {
  const searchParams = useSearchParams();
  const [collection, setCollection] = useState<string>("");
  const [caseMaterial, setCaseMaterial] = useState<string>("");
  const [diameter, setDiameter] = useState<string>("");
  const [complications, setComplications] = useState<string[]>([]);
  const [inBoutiqueOnly, setInBoutiqueOnly] = useState(false);
  const [sort, setSort] = useState("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Đồng bộ ?collection= từ trang chủ
  useEffect(() => {
    setCollection(searchParams.get("collection") ?? "");
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (collection) list = list.filter((p) => p.collection === collection);
    if (caseMaterial) list = list.filter((p) => p.caseMaterial === caseMaterial);
    if (diameter) {
      const range = diameterRanges.find((r) => r.id === diameter);
      if (range) list = list.filter((p) => range.test(p.diameterMm));
    }
    if (complications.length)
      list = list.filter((p) =>
        complications.some((c) => p.complications.includes(c))
      );
    if (inBoutiqueOnly) list = list.filter((p) => p.inBoutique);

    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.priceUsd - b.priceUsd);
        break;
      case "price-desc":
        list.sort((a, b) => b.priceUsd - a.priceUsd);
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return list;
  }, [collection, caseMaterial, diameter, complications, inBoutiqueOnly, sort]);

  const toggleComplication = (c: string) =>
    setComplications((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  const resetAll = () => {
    setCollection("");
    setCaseMaterial("");
    setDiameter("");
    setComplications([]);
    setInBoutiqueOnly(false);
    setSort("featured");
  };

  const activeCount =
    (collection ? 1 : 0) +
    (caseMaterial ? 1 : 0) +
    (diameter ? 1 : 0) +
    complications.length +
    (inBoutiqueOnly ? 1 : 0);

  const checkboxRow = (
    checked: boolean,
    onChange: () => void,
    label: string,
    count?: number
  ) => (
    <label
      key={label}
      className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-on-surface-variant/85 transition-colors hover:text-on-surface"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
          checked ? "border-primary bg-primary" : "border-outline-variant/60"
        }`}
        onClick={(e) => {
          e.preventDefault();
          onChange();
        }}
      >
        {checked && (
          <span className="material-symbols-outlined text-[13px] text-surface-lowest">
            check
          </span>
        )}
      </span>
      <span className="flex-1">{label}</span>
      {typeof count === "number" && (
        <span className="text-[11px] text-on-surface-variant/50">{count}</span>
      )}
    </label>
  );

  const filterPanel = (
    <div className="space-y-7">
      <div>
        <h4 className="mb-3 text-[11px] font-semibold tracking-[0.25em] text-primary uppercase">
          Bộ Sưu Tập
        </h4>
        <div className="space-y-0.5">
          {Object.entries(collectionLabels).map(([id, label]) =>
            checkboxRow(
              collection === id,
              () => setCollection(collection === id ? "" : id),
              label,
              products.filter((p) => p.collection === id).length
            )
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-[11px] font-semibold tracking-[0.25em] text-primary uppercase">
          Chất Liệu Vỏ
        </h4>
        <div className="space-y-0.5">
          {allCaseMaterials.map((m) =>
            checkboxRow(
              caseMaterial === m,
              () => setCaseMaterial(caseMaterial === m ? "" : m),
              m,
              products.filter((p) => p.caseMaterial === m).length
            )
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-[11px] font-semibold tracking-[0.25em] text-primary uppercase">
          Đường Kính
        </h4>
        <div className="space-y-0.5">
          {diameterRanges.map((r) =>
            checkboxRow(
              diameter === r.id,
              () => setDiameter(diameter === r.id ? "" : r.id),
              r.label
            )
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-[11px] font-semibold tracking-[0.25em] text-primary uppercase">
          Complications
        </h4>
        <div className="space-y-0.5">
          {allComplications.map((c) =>
            checkboxRow(complications.includes(c), () => toggleComplication(c), c)
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-[11px] font-semibold tracking-[0.25em] text-primary uppercase">
          Tình Trạng
        </h4>
        {checkboxRow(
          inBoutiqueOnly,
          () => setInBoutiqueOnly((v) => !v),
          "Sẵn hàng tại boutique"
        )}
      </div>

      {activeCount > 0 && (
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-secondary uppercase transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined text-[15px]">restart_alt</span>
          Xóa bộ lọc ({activeCount})
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-page px-4 py-10 md:px-8">
      {/* Control strip */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/25 pb-5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-2 border border-outline-variant/40 px-4 py-2.5 text-[11px] font-semibold tracking-[0.15em] uppercase transition-colors hover:border-primary lg:hidden"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            Bộ lọc {activeCount > 0 && `(${activeCount})`}
          </button>
          <p className="text-xs tracking-[0.15em] text-on-surface-variant/70 uppercase">
            Đang hiển thị{" "}
            <span className="text-primary">{filtered.length}</span> trong số{" "}
            {products.length} kiệt tác tuyển chọn
          </p>
        </div>
        <label className="flex items-center gap-3 text-xs text-on-surface-variant/70">
          <span className="tracking-[0.2em] uppercase">Sắp xếp</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-outline-variant/40 bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
          >
            {sortOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-10 lg:grid-cols-3">
        {/* Sidebar */}
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
          <div className="sticky top-32 border border-outline-variant/25 bg-surface-container/40 p-6">
            {filterPanel}
          </div>
        </aside>

        {/* Grid */}
        <div className="lg:col-span-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 border border-dashed border-outline-variant/40 py-24 text-center">
              <span className="material-symbols-outlined text-5xl text-outline-variant">
                hourglass_empty
              </span>
              <p className="text-sm text-on-surface-variant/80">
                Không có kiệt tác nào phù hợp bộ lọc hiện tại.
              </p>
              <button
                onClick={resetAll}
                className="text-xs tracking-[0.2em] text-primary uppercase hover:text-primary-hover"
              >
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          )}

          {/* Concierge banner */}
          <div className="gold-border-card mt-10 flex flex-col items-center justify-between gap-5 p-7 text-center md:flex-row md:text-left">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-3xl text-primary">
                support_agent
              </span>
              <div>
                <div className="font-display text-lg font-medium">
                  Trực Tuyến Tại Genève
                </div>
                <p className="text-sm text-on-surface-variant/80">
                  Tư vấn chuyên môn độc quyền với chuyên gia horlogerie qua concierge riêng.
                </p>
              </div>
            </div>
            <button className="border border-primary-container/50 px-6 py-3 text-[11px] font-bold tracking-[0.2em] text-primary uppercase transition-colors hover:bg-primary hover:text-surface-lowest">
              Kết Nối Concierge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <div>
      {/* Curatorial hero */}
      <section className="relative overflow-hidden border-b border-outline-variant/20">
        <div className="gold-glow top-[-140px] left-1/3 h-[360px] w-[360px]" />
        <div className="relative mx-auto max-w-page px-6 py-14 text-center md:px-8">
          <span className="text-[11px] font-semibold tracking-[0.35em] text-secondary uppercase">
            Catalog 2025 • 24 Kiệt Tác Tuyển Chọn
          </span>
          <h1 className="font-display mt-4 text-4xl font-medium md:text-5xl">
            Bộ Sưu Tập{" "}
            <span className="text-gold-gradient">Aurel &amp; Co.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-on-surface-variant/85">
            Tuyển chọn công phu từ kho atelier Genève — mỗi mẫu được giới hạn số
            lượng và chứng nhận bởi hội đồng horlogerie của hãng.
          </p>
        </div>
      </section>

      <Suspense>
        <CatalogView />
      </Suspense>
    </div>
  );
}
