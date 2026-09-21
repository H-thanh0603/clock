"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { formatUsd, formatVnd, type Product } from "@/data/products";
import { apiUrl } from "@/lib/api-client";
import { useWishlist } from "@/components/WishlistProvider";
import { useLocale } from "@/components/LocaleProvider";
import { mediaUrl } from "@/lib/media";

function WishBtn({ slug }: { slug: string }) {
  const { has, toggle } = useWishlist();
  const wished = has(slug);
  return (
    <button
      aria-label="Add to Wishlist"
      onClick={() => toggle(slug)}
      className={`absolute top-space-sm right-space-sm z-10 w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${wished ? "bg-primary text-on-primary" : "bg-surface-container/70 text-on-surface-variant hover:text-primary"}`}
    >
      <span className="material-symbols-outlined text-[18px]">favorite</span>
    </button>
  );
}

export default function Page() {
  const { t } = useLocale();
  const [mov, setMov] = useState<string[]>([]);
  const [mat, setMat] = useState("");
  const [size, setSize] = useState("");
  const [comp, setComp] = useState<string[]>([]);
  const [sort, setSort] = useState("featured");
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState<2 | 3>(3);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Gợi ý 1 filter của Jev khi search rỗng (BE trả `hint`, FE render nút).
  const [hint, setHint] = useState<{ kind: string; value: string; label: string } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const LIMIT = 9;

  // Hydrate filter từ URL khi vào trang (share/back giữ đúng trạng thái).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const movParam = sp.get("movements")?.split(",").filter(Boolean) ?? [];
    const compParam = sp.get("complications")?.split(",").filter(Boolean) ?? [];
    if (movParam.length) setMov(movParam);
    if (sp.get("material")) setMat(sp.get("material")!);
    if (sp.get("size")) setSize(sp.get("size")!);
    if (compParam.length) setComp(compParam);
    if (sp.get("sort")) setSort(sp.get("sort")!);
    if (sp.get("q")) {
      setQ(sp.get("q")!);
      setDebouncedQ(sp.get("q")!);
    }
    const p = Number(sp.get("page"));
    if (Number.isFinite(p) && p > 1) setPage(p);
    setHydrated(true);
  }, []);

  // Debounce ô tìm kiếm 400ms.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    // Sort "complications" chỉ có ở client → xin featured rồi sort tay.
    const serverSort =
      sort === "complications" ? "featured" : sort;
    const qs = new URLSearchParams({
      sort: serverSort,
      page: String(page),
      limit: String(LIMIT),
    });
    if (debouncedQ) qs.set("q", debouncedQ);
    // Filter chạy server-side (audit FE-001) — đúng kết quả trên cả catalog lớn.
    if (mov.length) qs.set("movements", mov.join(","));
    if (mat) qs.set("material", mat);
    if (size) qs.set("size", size);
    if (comp.length) qs.set("complications", comp.join(","));
    fetch(apiUrl(`/products?${qs.toString()}`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { items: Product[]; total: number; hint?: { kind: string; value: string; label: string } }) => {
        if (alive) {
          let list = data.items;
          // Sort "complications" vẫn là sort tay client trên 1 page.
          if (sort === "complications") {
            list = [...list].sort(
              (a, b) => b.complications.length - a.complications.length
            );
          }
          setItems(list);
          setTotal(data.total);
          setHint(data.hint ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, sort, page, mov, mat, size, comp]);

  // Đồng bộ filter chính vào URL — back/share/reload giữ được trạng thái.
  useEffect(() => {
    if (!hydrated) return; // đợi hydrate từ URL xong mới sync ngược lại
    const qs = new URLSearchParams();
    if (debouncedQ) qs.set("q", debouncedQ);
    if (mov.length) qs.set("movements", mov.join(","));
    if (mat) qs.set("material", mat);
    if (size) qs.set("size", size);
    if (comp.length) qs.set("complications", comp.join(","));
    if (sort !== "featured") qs.set("sort", sort);
    if (page > 1) qs.set("page", String(page));
    const url = qs.size > 0 ? `/collections?${qs}` : "/collections";
    // replace (không push) — không spam history mỗi lần tick filter.
    window.history.replaceState(null, "", url);
  }, [hydrated, debouncedQ, mov, mat, size, comp, sort, page]);

  // Áp filter Jev gợi ý: reset q + filter cũ, set đúng 1 filter mới.
  const applyHint = () => {
    if (!hint) return;
    setQ("");
    setDebouncedQ("");
    setMov(hint.kind === "movements" ? [hint.value] : []);
    setMat(hint.kind === "material" ? hint.value : "");
    setComp(hint.kind === "complications" ? [hint.value] : []);
    setSize("");
    setPage(1);
  };

  const toggleMov = (id: string) => {
    setMov((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPage(1);
  };
  const toggleComp = (id: string) => {
    setComp((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPage(1);
  };
  const resetAll = () => {
    setMov([]);
    setMat("");
    setSize("");
    setComp([]);
    setSort("featured");
    setQ("");
    setPage(1);
  };

  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  const activeCount = mov.length + (mat ? 1 : 0) + (size ? 1 : 0) + comp.length;

  return (

  <div className="flex flex-col w-full">
  <div className="flex flex-col w-full">
{/* Top Curatorial Banner & Atmosphere */}
<section className="relative w-full overflow-hidden bg-surface-container-lowest py-space-3xl">
<div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-surface pointer-events-none"></div>
<div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none"></div>
<div className="max-w-[1360px] mx-auto px-gutter-desktop relative z-10">
<div className="flex flex-col max-w-4xl">
<div className="flex items-center gap-space-xs mb-space-sm">
<span className="w-2 h-2 rounded-full bg-primary"></span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.25em] text-secondary">Genève Haute Horlogerie Archives</span>
<span className="text-on-surface-variant/40">/</span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em] text-on-surface-variant">Edition 2025</span>
</div>
<h1 className="font-display-hero text-display-hero text-on-surface tracking-tight uppercase">
          {t("collections.title")}<br/>
<span className="font-headline-lg italic font-normal text-secondary">Genève Masterpieces</span>
</h1>
<p className="mt-space-md font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t("collections.subtitle")}
        </p>
</div>
{/* Live Curator Stats Bar */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-space-md mt-space-2xl pt-space-xl bg-surface-container-low/60 rounded-xl p-space-md backdrop-blur-md">
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">{t("collections.statTotal")}</span>
<span className="font-headline-md text-headline-md text-primary mt-space-2xs">24 <span className="font-body-sm text-body-sm text-on-surface-variant/70 font-normal">{t("collections.statPieces")}</span></span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">{t("collections.statCert")}</span>
<span className="font-headline-md text-headline-md text-on-surface mt-space-2xs">100% <span className="font-body-sm text-body-sm text-secondary font-normal">COSC &amp; Poinçon</span></span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">{t("collections.statSalon")}</span>
<span className="font-headline-md text-headline-md text-on-surface mt-space-2xs">09 <span className="font-body-sm text-body-sm text-on-surface-variant/70 font-normal">{t("collections.statCities")}</span></span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">{t("collections.statUnique")}</span>
<span className="font-headline-md text-headline-md text-secondary mt-space-2xs">04 <span className="font-body-sm text-body-sm text-on-surface-variant/70 font-normal">Piece Unique</span></span>
</div>
</div>
</div>
</section>
{/* Interactive Control Strip */}
<section className="w-full bg-surface-container-low sticky top-20 z-30 shadow-md">
<div className="max-w-[1360px] mx-auto px-gutter-desktop h-16 flex items-center justify-between">
<div className="flex items-center gap-space-md">
<button className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container-high text-on-surface hover:text-primary transition-colors text-body-sm font-label-spec uppercase tracking-wider" id="toggleFilterBtn" onClick={() => setOpen((v) => !v)}>
<span className="material-symbols-outlined text-[18px]">tune</span>
<span className="hidden sm:inline">{t("collections.filterBtn")}</span>
{activeCount > 0 && (<span className="w-5 h-5 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{activeCount}</span>)}
</button>
<span className="font-label-spec text-label-spec tracking-widest uppercase text-on-surface-variant hidden md:inline">
          {t("collections.showing")}: <span className="text-primary font-bold">{items.length}</span> / {total} {t("collections.pieces")}
        </span>
</div>
<div className="flex items-center gap-space-lg">
{/* Search */}
<div className="relative hidden md:block">
<span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">search</span>
<input
  value={q}
  onChange={(e) => setQ(e.target.value)}
  placeholder={t("collections.searchPh")}
  className="bg-surface-container pl-10 pr-4 py-space-xs rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary w-56"
/>
</div>
{/* Sort Control */}
<div className="flex items-center gap-space-xs">
<label htmlFor="collections-sort" className="font-label-spec text-label-spec uppercase tracking-widest text-on-surface-variant hidden sm:inline">{t("collections.sortLabel")}</label>
<div className="relative">
<select id="collections-sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="appearance-none bg-surface-container px-space-md py-space-xs pr-8 rounded text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer uppercase font-label-spec text-[12px] tracking-wider">
<option value="featured">{t("collections.sortFeatured")}</option>
<option value="price-desc">{t("collections.sortPriceDesc")}</option>
<option value="complications">{t("collections.sortComplication")}</option>
<option value="price-asc">{t("collections.sortPriceAsc")}</option>
</select>
<span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">expand_more</span>
</div>
</div>
{/* View Density Controls */}
<div className="hidden lg:flex items-center bg-surface-container p-1 rounded">
<button aria-label="3 Columns View" onClick={() => setCols(3)} className={`p-1.5 rounded transition-all ${cols === 3 ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"}`} id="viewGrid3">
<span className="material-symbols-outlined text-[18px]">grid_view</span>
</button>
<button aria-label="Large Grid View" onClick={() => setCols(2)} className={`p-1.5 rounded transition-all ${cols === 2 ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"}`} id="viewGrid2">
<span className="material-symbols-outlined text-[18px]">view_agenda</span>
</button>
</div>
</div>
</div>
</section>
{/* Main Exploration Section */}
<div className="max-w-[1360px] mx-auto px-gutter-desktop py-space-2xl w-full">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
{/* Advanced Horology Filter Sidebar */}
<aside className={`${open ? "flex" : "hidden"} lg:flex lg:col-span-3 flex-col gap-space-xl`} id="filterSidebar">
<div className="bg-surface-container-low p-space-lg rounded-xl shadow-sm flex flex-col gap-space-xl">
<div className="flex items-center justify-between pb-space-sm">
<h3 className="font-title-editorial text-title-editorial uppercase text-on-surface tracking-wider">{t("collections.deepFilter")}</h3>
<button className="font-label-badge text-label-badge text-primary hover:text-secondary transition-colors uppercase tracking-widest underline decoration-primary/40" onClick={resetAll}>{t("collections.reset")}</button>
</div>
{/* Bộ máy (Movement) */}
<div className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">{t("collections.movement")}</span>
<span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_less</span>
</div>
<div className="flex flex-col gap-space-xs text-body-sm text-on-surface-variant">
<label className="flex items-center justify-between cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<span className="flex items-center gap-space-xs">
<input checked={mov.includes("tourbillon")} onChange={() => toggleMov("tourbillon")} className="accent-primary rounded w-3.5 h-3.5" type="checkbox"/>
<span className="text-on-surface">Tourbillon Mystérieux</span>
</span>
<span className="font-label-badge text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-secondary">06</span>
</label>
<label className="flex items-center justify-between cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<span className="flex items-center gap-space-xs">
<input checked={mov.includes("automatic")} onChange={() => toggleMov("automatic")} className="accent-primary rounded w-3.5 h-3.5" type="checkbox"/>
<span className="text-on-surface">Automatic Haute Calibre</span>
</span>
<span className="font-label-badge text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-secondary">11</span>
</label>
<label className="flex items-center justify-between cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<span className="flex items-center gap-space-xs">
<input checked={mov.includes("manual")} onChange={() => toggleMov("manual")} className="accent-primary rounded w-3.5 h-3.5" type="checkbox"/>
<span>{t("collections.manual")}</span>
</span>
<span className="font-label-badge text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface-variant">04</span>
</label>
<label className="flex items-center justify-between cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<span className="flex items-center gap-space-xs">
<input checked={mov.includes("chrono")} onChange={() => toggleMov("chrono")} className="accent-primary rounded w-3.5 h-3.5" type="checkbox"/>
<span>Chronograph Co-Axial</span>
</span>
<span className="font-label-badge text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface-variant">03</span>
</label>
</div>
</div>
{/* Chất liệu vỏ (Case Material) */}
<div className="flex flex-col gap-space-sm">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">{t("collections.material")}</span>
<div className="grid grid-cols-2 gap-space-xs font-label-badge text-label-badge uppercase">
<button onClick={() => setMat(mat === "rose" ? "" : "rose")} className={mat === "rose" ? "p-space-xs rounded bg-surface-container-high text-primary font-semibold text-left flex items-center gap-1.5" : "p-space-xs rounded bg-surface-container text-on-surface-variant hover:text-on-surface text-left flex items-center gap-1.5"}>
<span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
<span>{t("collections.roseGold")}</span>
</button>
<button onClick={() => setMat(mat === "platinum" ? "" : "platinum")} className={mat === "platinum" ? "p-space-xs rounded bg-surface-container-high text-primary font-semibold text-left flex items-center gap-1.5" : "p-space-xs rounded bg-surface-container text-on-surface-variant hover:text-on-surface text-left flex items-center gap-1.5"}>
<span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
<span>Platinum 950</span>
</button>
<button onClick={() => setMat(mat === "titanium" ? "" : "titanium")} className={mat === "titanium" ? "p-space-xs rounded bg-surface-container-high text-primary font-semibold text-left flex items-center gap-1.5" : "p-space-xs rounded bg-surface-container text-on-surface-variant hover:text-on-surface text-left flex items-center gap-1.5"}>
<span className="w-2.5 h-2.5 rounded-full bg-zinc-400"></span>
<span>Titanium Gr.5</span>
</button>
<button onClick={() => setMat(mat === "ceramic" ? "" : "ceramic")} className={mat === "ceramic" ? "p-space-xs rounded bg-surface-container-high text-primary font-semibold text-left flex items-center gap-1.5" : "p-space-xs rounded bg-surface-container text-on-surface-variant hover:text-on-surface text-left flex items-center gap-1.5"}>
<span className="w-2.5 h-2.5 rounded-full bg-stone-800"></span>
<span>Ceramic Carbon</span>
</button>
</div>
</div>
{/* Kích thước mặt (Case Diameter) */}
<div className="flex flex-col gap-space-sm">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">{t("collections.diameter")}</span>
<div className="flex items-center justify-between gap-space-xs">
<button onClick={() => setSize(size === "39" ? "" : "39")} className={size === "39" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>39mm</button>
<button onClick={() => setSize(size === "40" ? "" : "40")} className={size === "40" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>40mm</button>
<button onClick={() => setSize(size === "41" ? "" : "41")} className={size === "41" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>41mm</button>
<button onClick={() => setSize(size === "42.5" ? "" : "42.5")} className={size === "42.5" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>42.5mm</button>
</div>
</div>
{/* Tính năng phức tạp (Complications) */}
<div className="flex flex-col gap-space-sm">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">{t("collections.complications")}</span>
<div className="flex flex-wrap gap-space-xs">
<button onClick={() => toggleComp("perpetual")} className={comp.includes("perpetual") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>{t("collections.perpetual")}</button>
<button onClick={() => toggleComp("moonphase")} className={comp.includes("moonphase") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>{t("collections.moonphase")}</button>
<button onClick={() => toggleComp("repeater")} className={comp.includes("repeater") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>{t("collections.repeater")}</button>
<button onClick={() => toggleComp("skeleton")} className={comp.includes("skeleton") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>{t("collections.skeleton")}</button>
</div>
</div>
{/* Mức giá Khoảng từ $15,000 -> $250,000+ */}
<div className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">{t("collections.priceRange")}</span>
<span className="font-label-badge text-label-badge text-secondary">$15,000 — $250,000+</span>
</div>
<div className="w-full bg-surface-container-high h-1.5 rounded-full relative mt-2">
<div className="absolute left-1/6 right-1/4 top-0 bottom-0 bg-primary rounded-full"></div>
<div className="w-3.5 h-3.5 rounded-full bg-primary absolute left-1/6 -top-1 shadow cursor-pointer"></div>
<div className="w-3.5 h-3.5 rounded-full bg-primary absolute right-1/4 -top-1 shadow cursor-pointer"></div>
</div>
<div className="flex justify-between text-[11px] font-label-badge text-on-surface-variant mt-1">
<span>375 Triệu ₫</span>
<span>6,25 Tỷ ₫+</span>
</div>
</div>
{/* Trạng thái & Địa điểm Boutique */}
<div className="flex flex-col gap-space-sm">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">{t("collections.availability")}</span>
<div className="flex flex-col gap-space-xs text-body-sm text-on-surface-variant">
<label className="flex items-center gap-space-xs cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<input defaultChecked className="accent-primary rounded" type="checkbox"/>
<span className="text-on-surface">{t("collections.boutiqueVn")}</span>
</label>
<label className="flex items-center gap-space-xs cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<input defaultChecked className="accent-primary rounded" type="checkbox"/>
<span className="text-on-surface">{t("collections.limited")}</span>
</label>
<label className="flex items-center gap-space-xs cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<input className="accent-primary rounded" type="checkbox"/>
<span>{t("collections.madeToOrder")}</span>
</label>
</div>
</div>
<button className="w-full py-space-sm px-space-md rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] font-semibold hover:bg-secondary transition-colors shadow">
            {t("collections.applyFilter")}
          </button>
</div>
{/* Curatorial Certificate Micro-box */}
<div className="bg-surface-container p-space-md rounded-xl flex items-start gap-space-sm">
<span className="material-symbols-outlined text-primary text-[24px]">verified</span>
<div>
<p className="font-label-spec text-label-spec text-on-surface uppercase tracking-wider">{t("collections.certTitle")}</p>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 leading-normal">{t("collections.certBody")}</p>
</div>
</div>
</aside>
{/* Main Masterpiece Grid Area */}
<main className="lg:col-span-9 flex flex-col">
<div className={`grid grid-cols-1 md:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-space-lg`} id="productGrid">
{loading ? (
            <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-xl bg-surface-container-low overflow-hidden animate-pulse">
                  <div className="aspect-square bg-surface-container-high"></div>
                  <div className="p-space-lg space-y-space-sm">
                    <div className="h-4 bg-surface-container-high rounded w-2/3"></div>
                    <div className="h-6 bg-surface-container-high rounded w-full"></div>
                    <div className="h-4 bg-surface-container-high rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="col-span-full flex flex-col items-center gap-space-sm rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low/60 px-space-lg py-space-3xl text-center">
              <span className="material-symbols-outlined text-5xl text-error">cloud_off</span>
              <p className="font-body-md text-body-md text-on-surface-variant">{t("collections.dbError")}</p>
              <button onClick={() => window.location.reload()} className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-primary hover:text-secondary transition-colors">{t("common.retry")}</button>
            </div>
          ) : items.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-space-sm rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low/60 px-space-lg py-space-3xl text-center">
              <span className="material-symbols-outlined text-5xl text-outline-variant">hourglass_empty</span>
              <p className="font-body-md text-body-md text-on-surface-variant">{t("collections.noMatch")}</p>
              {hint && (
                <button onClick={applyHint} className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-secondary hover:text-primary transition-colors">
                  {t("collections.hintPrefix")} {hint.label}?
                </button>
              )}
              <button onClick={resetAll} className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-primary hover:text-secondary transition-colors">{t("collections.resetFilter")}</button>
            </div>
          ) : (
            items.map((p) => (
              <article key={p.slug} className="group bg-surface-container-low rounded-xl overflow-hidden shadow-md flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className="relative bg-surface-container-lowest p-space-md flex items-center justify-center overflow-hidden aspect-square">
                  <div className="absolute top-space-sm left-space-sm flex flex-col gap-1 z-10">
                    {p.badges[0] && (<span className="px-2 py-0.5 bg-surface-container-high/90 backdrop-blur-sm text-secondary font-label-badge text-[9px] uppercase tracking-widest rounded">{p.badges[0]}</span>)}
                    {p.badges[1] && (<span className="px-2 py-0.5 bg-primary-container text-on-primary font-label-badge text-[9px] uppercase tracking-widest rounded font-bold">{p.badges[1]}</span>)}
                  </div>
                  <WishBtn slug={p.slug} />
                  <Link href={`/products/${p.slug}`} className="relative block h-full w-full">
                    <Image
                      className="object-contain transition-transform duration-500 group-hover:scale-105"
                      alt={p.name}
                      src={p.cardImage}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      loading="lazy"
                    />
                  </Link>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface-container-high/90 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-label-badge text-on-surface-variant uppercase tracking-wider">{t("collections.strap")}</span>
                    <button className="w-3.5 h-3.5 rounded-full bg-stone-900 ring-1 ring-primary" title="Dây Da Cá Sấu Đen"></button>
                    <button className="w-3.5 h-3.5 rounded-full bg-secondary" title="Dây Kim Loại Vàng Hồng"></button>
                  </div>
                </div>
                <div className="p-space-lg flex flex-col flex-1 justify-between bg-surface-container-low">
                  <div>
                    <div className="flex items-center justify-between text-secondary font-label-spec text-label-spec uppercase tracking-widest">
                      <span>{p.strapLabel}</span>
                      <span>{p.calibre}</span>
                    </div>
                    <h2 className="font-title-editorial text-title-editorial text-on-surface group-hover:text-primary transition-colors mt-space-2xs">{p.name}</h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">{p.shortDescription}</p>
                  </div>
                  <div className="mt-space-md pt-space-sm bg-surface-container/40 p-space-xs rounded">
                    <div className="flex items-baseline justify-between">
                      <span className="font-headline-sm text-headline-sm text-primary">{formatUsd(p.priceUsd)}</span>
                      <span className="font-label-badge text-label-badge text-on-surface-variant">~ {formatVnd(p.priceVnd)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-space-xs mt-space-sm">
                      <Link href={`/products/${p.slug}`} className="py-2 rounded bg-surface-container-high text-on-surface hover:text-primary font-label-spec text-label-spec uppercase tracking-wider transition-colors flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span>{t("collections.quickView")}</span>
                      </Link>
                      <Link href="/#private-salon" className="py-2 rounded bg-primary text-on-primary hover:bg-secondary font-label-spec text-label-spec uppercase tracking-wider font-semibold transition-colors flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                        <span>{t("collections.bookVisit")}</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
</div>
{/* Curatorial Pagination */}
<div className="mt-space-3xl pt-space-xl flex flex-col sm:flex-row items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl">
<div className="font-body-sm text-body-sm text-on-surface-variant">
            {t("collections.paging")} <span className="text-on-surface font-semibold">{items.length === 0 ? 0 : (page - 1) * LIMIT + 1} — {(page - 1) * LIMIT + items.length}</span> / <span className="text-primary font-semibold">{total}</span> {t("collections.pieces")}
          </div>
<nav className="flex items-center gap-space-xs">
<button aria-label="Previous Page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="w-9 h-9 rounded bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors disabled:opacity-40">
<span className="material-symbols-outlined text-[18px]">chevron_left</span>
</button>
{Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
  <button
    key={n}
    onClick={() => setPage(n)}
    className={`w-9 h-9 rounded font-label-spec text-label-spec flex items-center justify-center ${n === page ? "bg-primary text-on-primary font-bold" : "bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"}`}
  >
    {n}
  </button>
))}
<button aria-label="Next Page" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} className="w-9 h-9 rounded bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors disabled:opacity-40">
<span className="material-symbols-outlined text-[18px]">chevron_right</span>
</button>
</nav>
</div>
</main>
</div>
</div>
{/* Horology Specialist Assistance Banner (Private Salon Concierge) */}
<section className="w-full bg-surface-container-low py-space-3xl mt-space-3xl relative overflow-hidden">
<div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-surface-container pointer-events-none"></div>
<div className="max-w-[1360px] mx-auto px-gutter-desktop relative z-10">
<div className="bg-surface-container-lowest rounded-2xl p-space-2xl grid grid-cols-1 lg:grid-cols-12 gap-space-2xl items-center shadow-xl">
<div className="lg:col-span-4 relative flex items-center justify-center">
<div className="relative w-48 h-48 md:w-56 md:h-56 rounded-full overflow-hidden shadow-2xl">
<img className="w-full h-full object-cover" alt="Portrait of a distinguished Swiss master watchmaker and horological consultant in a dark bespoke suit examining a movement with a brass loupe, refined ambient warm studio light" src={mediaUrl("/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg")}/>
</div>
<div className="absolute -bottom-2 bg-surface-container-high px-space-md py-1 rounded-full shadow flex items-center gap-space-xs">
<span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-widest">{t("collections.onlineGeneve")}</span>
</div>
</div>
<div className="lg:col-span-8 flex flex-col justify-center">
<div className="flex items-center gap-space-xs text-secondary mb-space-xs">
<span className="material-symbols-outlined text-[20px]">support_agent</span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em]">{t("collections.expertTitle")}</span>
</div>
<h3 className="font-headline-lg text-headline-lg text-on-surface">
            {t("collections.expertHeading")}
          </h3>
<p className="font-body-lg text-body-lg text-on-surface-variant mt-space-xs max-w-2xl">
            {t("collections.expertBody")}
          </p>
<div className="mt-space-xl flex flex-wrap items-center gap-space-md">
<button className="px-space-xl py-space-md rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] font-semibold hover:bg-secondary transition-colors shadow flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[18px]">call</span>
<span>{t("collections.callConcierge")}</span>
</button>
<button className="px-space-xl py-space-md rounded bg-surface-container-high text-on-surface hover:text-primary font-label-spec text-label-spec uppercase tracking-[0.15em] transition-colors flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[18px]">meeting_room</span>
<span>{t("collections.bookSalon")}</span>
</button>
</div>
<div className="flex flex-wrap items-center gap-space-lg mt-space-lg pt-space-md text-on-surface-variant/70 font-body-sm text-body-sm">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[16px]">lock</span>
              {t("collections.trustPrivacy")}
            </span>
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[16px]">flight</span>
              {t("collections.trustOverseas")}
            </span>
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[16px]">verified</span>
              {t("collections.trustWarranty")}
            </span>
</div>
</div>
</div>
</div>
</section>
{/* Interactive Client-side micro scripts */}

</div>
  </div>
  );
}
