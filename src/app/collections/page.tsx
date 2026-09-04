"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUsd, formatVnd, type Product } from "@/data/products";
import { useWishlist } from "@/components/WishlistProvider";

const MOVEMENT_MATCH: Record<string, (p: Product) => boolean> = {
  tourbillon: (p) =>
    p.collection === "tourbillon" ||
    p.complications.some((c) => /tourbillon/i.test(c)),
  automatic: (p) => p.collection === "classic" || p.collection === "grand-complication",
  manual: (p) => p.collection === "skeleton",
  chrono: (p) =>
    p.collection === "sport" ||
    p.complications.some((c) => /chronograph|flyback/i.test(c)),
};

const MATERIAL_MATCH: Record<string, (p: Product) => boolean> = {
  rose: (p) => /vàng hồng|rose/i.test(p.caseMaterial),
  platinum: (p) => /platinum/i.test(p.caseMaterial),
  titanium: (p) => /titanium/i.test(p.caseMaterial),
  ceramic: (p) => /carbon|ceramic/i.test(p.caseMaterial),
};

const SIZE_MATCH: Record<string, (d: number) => boolean> = {
  "39": (d) => d <= 39.5,
  "40": (d) => d > 39.5 && d <= 40.5,
  "41": (d) => d > 40.5 && d < 42.5,
  "42.5": (d) => d >= 42.5,
};

const COMPLICATION_MATCH: Record<string, (p: Product) => boolean> = {
  perpetual: (p) => p.complications.some((c) => /perpetual/i.test(c)),
  moonphase: (p) => p.complications.some((c) => /moonphase/i.test(c)),
  repeater: (p) => p.complications.some((c) => /repeater/i.test(c)),
  skeleton: (p) => p.complications.some((c) => /skeleton/i.test(c)),
};

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

  useEffect(() => {
    let alive = true;
    fetch("/api/products")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Product[]) => {
        if (alive) {
          setItems(data);
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
  }, []);

  const toggleMov = (id: string) =>
    setMov((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleComp = (id: string) =>
    setComp((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const resetAll = () => {
    setMov([]);
    setMat("");
    setSize("");
    setComp([]);
    setSort("featured");
  };

  const filtered = useMemo(() => {
    let list = [...items];
    if (mov.length) list = list.filter((p) => mov.some((m) => MOVEMENT_MATCH[m](p)));
    if (mat) list = list.filter((p) => MATERIAL_MATCH[mat](p));
    if (size) list = list.filter((p) => SIZE_MATCH[size](p.diameterMm));
    if (comp.length)
      list = list.filter((p) => comp.some((c) => COMPLICATION_MATCH[c](p)));
    switch (sort) {
      case "price-desc":
        list.sort((a, b) => b.priceUsd - a.priceUsd);
        break;
      case "price-asc":
        list.sort((a, b) => a.priceUsd - b.priceUsd);
        break;
      case "complications":
        list.sort((a, b) => b.complications.length - a.complications.length);
        break;
    }
    return list;
  }, [items, mov, mat, size, comp, sort]);

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
          BỘ SƯU TẬP HOÀNG GIA<br/>
<span className="font-headline-lg italic font-normal text-secondary">Genève Masterpieces</span>
</h1>
<p className="mt-space-md font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Khám phá 24 tuyệt tác cơ học đo thời gian được tuyển chọn khắt khe nhất, chế tác giới hạn dưới sự giám sát trực tiếp của các nghệ nhân bậc thầy Thụy Sĩ.
        </p>
</div>
{/* Live Curator Stats Bar */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-space-md mt-space-2xl pt-space-xl bg-surface-container-low/60 rounded-xl p-space-md backdrop-blur-md">
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">Tổng Tuyệt Tác</span>
<span className="font-headline-md text-headline-md text-primary mt-space-2xs">24 <span className="font-body-sm text-body-sm text-on-surface-variant/70 font-normal">Mẫu Sưu Tầm</span></span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">Chứng Thư Thụy Sĩ</span>
<span className="font-headline-md text-headline-md text-on-surface mt-space-2xs">100% <span className="font-body-sm text-body-sm text-secondary font-normal">COSC &amp; Poinçon</span></span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">Sẵn Sàng Tại Salon</span>
<span className="font-headline-md text-headline-md text-on-surface mt-space-2xs">09 <span className="font-body-sm text-body-sm text-on-surface-variant/70 font-normal">Hà Nội &amp; HCM</span></span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge uppercase tracking-widest text-on-surface-variant">Chế Tác Độc Bản</span>
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
<span className="hidden sm:inline">Bộ Lọc Horlogerie</span>
{activeCount > 0 && (<span className="w-5 h-5 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{activeCount}</span>)}
</button>
<span className="font-label-spec text-label-spec tracking-widest uppercase text-on-surface-variant hidden md:inline">
          Hiển Thị: <span className="text-primary font-bold">{filtered.length}</span> / {items.length} Kiệt Tác
        </span>
</div>
<div className="flex items-center gap-space-lg">
{/* Sort Control */}
<div className="flex items-center gap-space-xs">
<span className="font-label-spec text-label-spec uppercase tracking-widest text-on-surface-variant hidden sm:inline">Sắp Xếp:</span>
<div className="relative">
<select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none bg-surface-container px-space-md py-space-xs pr-8 rounded text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer uppercase font-label-spec text-[12px] tracking-wider">
<option value="featured">Mới Ra Mắt (Genève 2025)</option>
<option value="price-desc">Giá Trị Cao Nhất (Giá Giảm Dần)</option>
<option value="complications">Độ Phức Tạp Bộ Máy (Complication Tier)</option>
<option value="price-asc">Số Lượng Giới Hạn Tối Thiểu</option>
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
<h3 className="font-title-editorial text-title-editorial uppercase text-on-surface tracking-wider">Bộ Lọc Chuyên Sâu</h3>
<button className="font-label-badge text-label-badge text-primary hover:text-secondary transition-colors uppercase tracking-widest underline decoration-primary/40" onClick={resetAll}>Thiết Lập Lại</button>
</div>
{/* Bộ máy (Movement) */}
<div className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">Bộ Máy Cơ Khí (Calibre)</span>
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
<span>Manual Winding (Lên Cót Tay)</span>
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
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">Chất Liệu Vỏ Quý Kim</span>
<div className="grid grid-cols-2 gap-space-xs font-label-badge text-label-badge uppercase">
<button onClick={() => setMat(mat === "rose" ? "" : "rose")} className={mat === "rose" ? "p-space-xs rounded bg-surface-container-high text-primary font-semibold text-left flex items-center gap-1.5" : "p-space-xs rounded bg-surface-container text-on-surface-variant hover:text-on-surface text-left flex items-center gap-1.5"}>
<span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
<span>Vàng Hồng 18K</span>
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
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">Kích Thước Đường Kính (mm)</span>
<div className="flex items-center justify-between gap-space-xs">
<button onClick={() => setSize(size === "39" ? "" : "39")} className={size === "39" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>39mm</button>
<button onClick={() => setSize(size === "40" ? "" : "40")} className={size === "40" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>40mm</button>
<button onClick={() => setSize(size === "41" ? "" : "41")} className={size === "41" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>41mm</button>
<button onClick={() => setSize(size === "42.5" ? "" : "42.5")} className={size === "42.5" ? "flex-1 py-2 rounded bg-primary text-center font-label-spec text-label-spec text-on-primary font-bold shadow" : "flex-1 py-2 rounded bg-surface-container text-center font-label-spec text-label-spec text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"}>42.5mm</button>
</div>
</div>
{/* Tính năng phức tạp (Complications) */}
<div className="flex flex-col gap-space-sm">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">Tính Năng Phức Tạp (Complications)</span>
<div className="flex flex-wrap gap-space-xs">
<button onClick={() => toggleComp("perpetual")} className={comp.includes("perpetual") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>Lịch Vạn Niên</button>
<button onClick={() => toggleComp("moonphase")} className={comp.includes("moonphase") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>Tuần Trăng Moonphase</button>
<button onClick={() => toggleComp("repeater")} className={comp.includes("repeater") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>Điểm Chuông Minute Repeater</button>
<button onClick={() => toggleComp("skeleton")} className={comp.includes("skeleton") ? "px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer" : "px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-primary font-label-badge text-label-badge uppercase tracking-wider cursor-pointer"}>Lộ Cơ Skeleton</button>
</div>
</div>
{/* Mức giá Khoảng từ $15,000 -> $250,000+ */}
<div className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">Khoảng Giá Tuyển Chọn</span>
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
<span className="font-label-spec text-label-spec uppercase tracking-[0.15em] text-primary">Trạng Thái Sẵn Sàng</span>
<div className="flex flex-col gap-space-xs text-body-sm text-on-surface-variant">
<label className="flex items-center gap-space-xs cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<input defaultChecked className="accent-primary rounded" type="checkbox"/>
<span className="text-on-surface">Boutique Hà Nội &amp; TP. HCM</span>
</label>
<label className="flex items-center gap-space-xs cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<input defaultChecked className="accent-primary rounded" type="checkbox"/>
<span className="text-on-surface">Phiên Bản Limited Edition</span>
</label>
<label className="flex items-center gap-space-xs cursor-pointer p-space-xs rounded hover:bg-surface-container transition-colors">
<input className="accent-primary rounded" type="checkbox"/>
<span>Đặt Chế Tác Riêng (Made-to-Order)</span>
</label>
</div>
</div>
<button className="w-full py-space-sm px-space-md rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] font-semibold hover:bg-secondary transition-colors shadow">
            Áp Dụng Bộ Lọc (6 Kết Quả)
          </button>
</div>
{/* Curatorial Certificate Micro-box */}
<div className="bg-surface-container p-space-md rounded-xl flex items-start gap-space-sm">
<span className="material-symbols-outlined text-primary text-[24px]">verified</span>
<div>
<p className="font-label-spec text-label-spec text-on-surface uppercase tracking-wider">Chứng Thư Bảo Tồn Toàn Cầu</p>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 leading-normal">Tất cả sản phẩm bao gồm sổ bảo hành vi cơ học điện tử gắn chip NFC và hồ sơ lưu trữ Genève 100 năm.</p>
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
              <p className="font-body-md text-body-md text-on-surface-variant">Không kết nối được cơ sở dữ liệu. Kiểm tra Postgres rồi thử lại.</p>
              <button onClick={() => window.location.reload()} className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-primary hover:text-secondary transition-colors">Tải Lại Trang</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-space-sm rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low/60 px-space-lg py-space-3xl text-center">
              <span className="material-symbols-outlined text-5xl text-outline-variant">hourglass_empty</span>
              <p className="font-body-md text-body-md text-on-surface-variant">Không có kiệt tác nào phù hợp bộ lọc hiện tại.</p>
              <button onClick={resetAll} className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-primary hover:text-secondary transition-colors">Thiết Lập Lại Bộ Lọc</button>
            </div>
          ) : (
            filtered.map((p) => (
              <article key={p.slug} className="group bg-surface-container-low rounded-xl overflow-hidden shadow-md flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <div className="relative bg-surface-container-lowest p-space-md flex items-center justify-center overflow-hidden aspect-square">
                  <div className="absolute top-space-sm left-space-sm flex flex-col gap-1 z-10">
                    {p.badges[0] && (<span className="px-2 py-0.5 bg-surface-container-high/90 backdrop-blur-sm text-secondary font-label-badge text-[9px] uppercase tracking-widest rounded">{p.badges[0]}</span>)}
                    {p.badges[1] && (<span className="px-2 py-0.5 bg-primary-container text-on-primary font-label-badge text-[9px] uppercase tracking-widest rounded font-bold">{p.badges[1]}</span>)}
                  </div>
                  <WishBtn slug={p.slug} />
                  <Link href={`/products/${p.slug}`} className="w-full h-full flex items-center justify-center">
                    <img className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-500" data-alt={p.shortDescription} src={p.cardImage}/>
                  </Link>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface-container-high/90 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-label-badge text-on-surface-variant uppercase tracking-wider">Dây:</span>
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
                        <span>Xem Nhanh</span>
                      </Link>
                      <Link href="/#private-salon" className="py-2 rounded bg-primary text-on-primary hover:bg-secondary font-label-spec text-label-spec uppercase tracking-wider font-semibold transition-colors flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                        <span>Đặt Hẹn</span>
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
            Đang hiển thị <span className="text-on-surface font-semibold">{filtered.length === 0 ? 0 : 1} — {filtered.length}</span> trong số <span className="text-primary font-semibold">{items.length}</span> kiệt tác tuyển chọn
          </div>
<nav className="flex items-center gap-space-xs">
<button aria-label="Previous Page" className="w-9 h-9 rounded bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors disabled:opacity-40" disabled>
<span className="material-symbols-outlined text-[18px]">chevron_left</span>
</button>
<button className="w-9 h-9 rounded bg-primary text-on-primary font-label-spec text-label-spec font-bold flex items-center justify-center">1</button>
<button className="w-9 h-9 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-spec text-label-spec flex items-center justify-center transition-colors">2</button>
<button className="w-9 h-9 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-spec text-label-spec flex items-center justify-center transition-colors">3</button>
<button className="w-9 h-9 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-spec text-label-spec flex items-center justify-center transition-colors">4</button>
<button aria-label="Next Page" className="w-9 h-9 rounded bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
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
<img className="w-full h-full object-cover" data-alt="Portrait of a distinguished Swiss master watchmaker and horological consultant in a dark bespoke suit examining a movement with a brass loupe, refined ambient warm studio light" src="/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg"/>
</div>
<div className="absolute -bottom-2 bg-surface-container-high px-space-md py-1 rounded-full shadow flex items-center gap-space-xs">
<span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-widest">Trực Tuyến Tại Genève</span>
</div>
</div>
<div className="lg:col-span-8 flex flex-col justify-center">
<div className="flex items-center gap-space-xs text-secondary mb-space-xs">
<span className="material-symbols-outlined text-[20px]">support_agent</span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em]">Tư Vấn Chuyên Môn Độc Quyền</span>
</div>
<h3 className="font-headline-lg text-headline-lg text-on-surface">
            Chưa Tìm Thấy Cỗ Máy Thời Gian Độc Bản Cho Bộ Sưu Tập?
          </h3>
<p className="font-body-lg text-body-lg text-on-surface-variant mt-space-xs max-w-2xl">
            Các chuyên gia cao cấp của Aurel &amp; Co. sẵn sàng kết nối bảo mật 1-1, hỗ trợ giám tuyển, cung cấp thông tin chuyển đổi ngoại tệ, vận chuyển bảo an tư gia hoặc đặt lịch tiếp đón riêng tại Private Salon Hà Nội &amp; TP. Hồ Chí Minh.
          </p>
<div className="mt-space-xl flex flex-wrap items-center gap-space-md">
<button className="px-space-xl py-space-md rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] font-semibold hover:bg-secondary transition-colors shadow flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[18px]">call</span>
<span>Kết Nối Concierge Ngay</span>
</button>
<button className="px-space-xl py-space-md rounded bg-surface-container-high text-on-surface hover:text-primary font-label-spec text-label-spec uppercase tracking-[0.15em] transition-colors flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[18px]">meeting_room</span>
<span>Đặt Lịch Tiếp Đón Salon</span>
</button>
</div>
<div className="flex flex-wrap items-center gap-space-lg mt-space-lg pt-space-md text-on-surface-variant/70 font-body-sm text-body-sm">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[16px]">lock</span>
              Bảo mật danh tính thượng khách
            </span>
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[16px]">flight</span>
              Hỗ trợ giao dịch hải ngoại
            </span>
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[16px]">verified</span>
              Hồ sơ bảo hành vi cơ học điện tử
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
