
import DetailPurchase from "@/components/DetailPurchase";
import Image from "next/image";
import { getProduct } from "@/lib/db";
import VaultAddButton from "@/components/VaultAddButton";
import { notFound } from "next/navigation";
import { collectionLabels, formatUsd } from "@/data/products";
import { linePrice } from "@/lib/pricing";

// Phụ kiện đi kèm hiển thị cuối trang — lấy từ DB (trước đây hardcode).
const ACCESSORY_SLUG = "travel-roll-calfskin-18k";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Song song hóa 2 fetch độc lập (SP chính + phụ kiện đi kèm).
  const [product, accessory] = await Promise.all([
    getProduct(slug),
    getProduct(ACCESSORY_SLUG).catch(() => null),
  ]);
  // Slug lạ → 404 thay vì render trang cứng mặc định.
  if (!product) notFound();

  // Phụ kiện đi kèm từ DB; thiếu thì ẩn block (không crash).
  const accLine = accessory ? linePrice(accessory.priceUsd) : null;

  const collectionLabel =
    collectionLabels[product.collection] ?? "Bộ Sưu Tập";
  const heroImage = product.images[0] ?? product.cardImage;
  const detailImages =
    product.images.length > 1
      ? product.images.slice(1, 4)
      : [product.cardImage];
  return (
  <div className="flex flex-col w-full">
  <div className="flex flex-col w-full">
{/* Subtle Ambient Glow Background Aura */}
<div className="relative w-full overflow-hidden">
<div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
<div className="absolute top-1/2 right-10 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
{/* Top Breadcrumb & Status Navigation */}
<div className="max-w-[1360px] mx-auto px-gutter-desktop pt-space-md pb-space-sm w-full">
<div className="flex flex-wrap items-center justify-between gap-y-space-xs text-on-surface-variant font-label-spec text-label-spec uppercase tracking-[0.14em]">
<div className="flex items-center gap-space-xs flex-wrap">
<a className="hover:text-primary transition-colors" href="/collections">Trang Chủ</a>
<span className="text-surface-container-highest">/</span>
<a className="hover:text-primary transition-colors" href="/collections">Bộ Sưu Tập</a>
<span className="text-surface-container-highest">/</span>
<a className="hover:text-primary transition-colors" href="/collections">{collectionLabel}</a>
<span className="text-surface-container-highest">/</span>
<span className="text-primary font-semibold">{product.name}</span>
</div>
<div className="flex items-center gap-space-sm">
<span className="inline-flex items-center gap-1.5 px-space-xs py-0.5 rounded bg-surface-container-high text-secondary text-[10px] font-label-badge tracking-widest uppercase">
<span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span>
            {product.inBoutique ? "Kho bảo mật Genève: Sẵn hàng độc bản" : "Đặt trước tại Atelier"}
          </span>
</div>
</div>
</div>
{/* MAIN PRODUCT STAGE (Golden Ratio Asymmetric Split) */}
<div className="max-w-[1360px] mx-auto px-gutter-desktop py-space-md w-full">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
{/* LEFT COLUMN: Immersive Visual Vault (7 Cols) */}
<div className="lg:col-span-7 flex flex-col gap-space-md">
{/* Main Hero Display with Interactive Hologram Layer */}
<div className="relative w-full aspect-[4/5] bg-surface-container-lowest rounded-xl overflow-hidden shadow-2xl flex items-center justify-center group">
{/* Ambient Vignette Gradient */}
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-surface-container-lowest/30 pointer-events-none z-10"></div>
<Image className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105" alt={product.name} id="main-watch-img" src={heroImage} fill priority sizes="(max-width: 1024px) 100vw, 58vw" />
{/* Live Complication HUD Overlay */}
<div className="absolute top-space-md left-space-md z-20 flex flex-col gap-space-2xs">
<span className="px-space-xs py-1 rounded bg-surface-container-low/90 backdrop-blur-md text-primary font-label-badge text-label-badge uppercase tracking-widest shadow-md">
                Poinçon de Genève Certified
              </span>
<span className="px-space-xs py-1 rounded bg-surface-container-low/80 backdrop-blur-md text-on-surface-variant font-label-spec text-[10px] tracking-wider uppercase">
                60s Flying Tourbillon • 28,800 VPH
              </span>
</div>
{/* Precision Reticle & Micro-Interactive Triggers */}
<div className="absolute bottom-space-md left-space-md right-space-md z-20 flex items-center justify-between pointer-events-none">
<div className="flex items-center gap-space-xs pointer-events-auto">
<button className="px-space-sm py-space-xs rounded bg-surface-container-high/90 backdrop-blur-md text-on-surface hover:text-primary hover:bg-surface-container-highest transition-all flex items-center gap-1.5 shadow-lg font-label-spec text-label-spec uppercase tracking-wider" id="btn-360">
<span className="material-symbols-outlined text-[16px] text-primary">360</span>
<span>Xoay 360°</span>
</button>
<button className="px-space-sm py-space-xs rounded bg-surface-container-high/90 backdrop-blur-md text-on-surface hover:text-primary hover:bg-surface-container-highest transition-all flex items-center gap-1.5 shadow-lg font-label-spec text-label-spec uppercase tracking-wider" id="btn-ar">
<span className="material-symbols-outlined text-[16px] text-secondary">view_in_ar</span>
<span>Thử AR Cổ Tay</span>
</button>
<button className="px-space-sm py-space-xs rounded bg-surface-container-high/90 backdrop-blur-md text-on-surface hover:text-primary hover:bg-surface-container-highest transition-all flex items-center gap-1.5 shadow-lg font-label-spec text-label-spec uppercase tracking-wider" id="btn-macro">
<span className="material-symbols-outlined text-[16px] text-primary">zoom_in</span>
<span>Macro 10X</span>
</button>
</div>
<div className="hidden sm:flex items-center gap-1.5 px-space-xs py-1 rounded bg-surface-container-low/80 backdrop-blur-md text-secondary font-label-badge text-[9px] uppercase tracking-widest">
<span className="material-symbols-outlined text-[12px] text-primary">fiber_manual_record</span>
<span>Live Escapement 4Hz</span>
</div>
</div>
</div>
{/* Thumbnail Gallery & Perspectives Strip */}
<div className="grid grid-cols-4 gap-space-sm">
{detailImages.map((src, i) => (
<button key={src + i} className={`gallery-thumb${i === 0 ? " active-thumb" : ""} relative aspect-square rounded-lg overflow-hidden bg-surface-container-low shadow-md group transition-all transform hover:-translate-y-0.5`} >
<Image className="object-cover" alt={product.name} src={src} fill sizes="(max-width: 1024px) 25vw, 15vw" loading="lazy" />
<span className="absolute inset-0 bg-primary/20 transition-opacity opacity-0 thumb-overlay"></span>
</button>
))}
</div>
{/* Chronometric Live Telemetry Card */}
<div className="p-space-lg rounded-xl bg-surface-container-low shadow-lg flex flex-col md:flex-row items-center justify-between gap-space-md">
<div className="flex items-center gap-space-md w-full md:w-auto">
<div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary shadow-inner shrink-0">
<span className="material-symbols-outlined text-[24px]">precision_manufacturing</span>
</div>
<div className="flex flex-col">
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-[0.2em]">{product.calibre}</span>
<span className="font-title-editorial text-body-md text-on-surface">{product.caseMaterial} • {product.diameterMm}mm</span>
</div>
</div>
<div className="flex items-center gap-space-lg w-full md:w-auto justify-between md:justify-end">
<div className="flex flex-col text-right">
<span className="font-label-spec text-[10px] text-on-surface-variant uppercase tracking-wider">Trữ Năng Lượng</span>
<span className="font-headline-sm text-headline-sm text-primary">72<span className="font-body-sm text-on-surface-variant text-body-sm uppercase ml-1">Giờ</span></span>
</div>
{/* Power Reserve Mini SVG Spark Gauge */}
<svg className="w-12 h-12 -rotate-90 shrink-0" viewBox="0 0 36 36">
<path className="text-surface-container-highest" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3"></path>
<path className="text-primary" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray="90, 100" strokeLinecap="round" strokeWidth="3"></path>
</svg>
</div>
</div>
</div>
{/* RIGHT COLUMN: Haute Horlogerie Acquisition Console (5 Cols) */}
<div className="lg:col-span-5 flex flex-col gap-space-md">
{/* Identity Badges */}
<div className="flex flex-wrap items-center gap-space-xs">
<span className="px-space-xs py-1 rounded bg-secondary-container text-secondary font-label-badge text-label-badge tracking-[0.16em] uppercase font-bold shadow-sm">
              {product.badges[0] ?? "Limited Edition"} • {product.strapLabel}
            </span>
<span className="px-space-xs py-1 rounded bg-surface-container-high text-on-surface-variant font-label-badge text-label-badge tracking-widest uppercase flex items-center gap-1">
<span className="material-symbols-outlined text-primary text-[14px]">stars</span>
              Geneva Seal Certified
            </span>
</div>
{/* Product Title & Reference Hierarchy */}
<div className="flex flex-col gap-1">
<span className="font-label-spec text-label-spec uppercase tracking-[0.25em] text-secondary">Haute Complication Series</span>
<h1 className="font-display-hero text-headline-lg text-on-surface tracking-tight leading-tight">
              Aurel &amp; Co. {product.name}
            </h1>
<div className="flex items-center gap-space-md mt-1 font-label-spec text-body-sm text-on-surface-variant">
<span>REF: <strong className="text-on-surface font-semibold tracking-widest">{product.reference}</strong></span>
<span className="text-surface-container-highest">•</span>
<span className="text-primary flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">workspace_premium</span>
                Độc Bản Giới Hạn
              </span>
</div>
</div>
<DetailPurchase product={product} />
{/* Security & Atelier Assurances */}
<div className="grid grid-cols-1 gap-space-xs pt-space-xs font-body-sm text-body-sm text-on-surface-variant">
<div className="flex items-center gap-space-sm p-space-xs rounded bg-surface-container-low">
<span className="material-symbols-outlined text-primary text-[20px] shrink-0">local_police</span>
<span><strong>An ninh tuyệt đối:</strong> Vận chuyển bằng chuyên xa bọc thép và bàn giao trực tiếp tại tư gia hoặc private salon.</span>
</div>
<div className="flex items-center gap-space-sm p-space-xs rounded bg-surface-container-low">
<span className="material-symbols-outlined text-primary text-[20px] shrink-0">workspace_premium</span>
<span><strong>Bảo chứng di sản:</strong> Bảo hành quốc tế 5 năm, tự động nâng cấp thành bảo dưỡng Calibre trọn đời khi kích hoạt thẻ Private Client.</span>
</div>
<div className="flex items-center gap-space-sm p-space-xs rounded bg-surface-container-low">
<span className="material-symbols-outlined text-primary text-[20px] shrink-0">published_with_changes</span>
<span><strong>Đổi trả an tâm:</strong> Quyền hoàn trả trong 14 ngày kèm kiểm định kép độc lập của hiệp hội Haute Horlogerie.</span>
</div>
</div>
</div>
</div>
</div>
{/* HOROLOGICAL SPECIFICATIONS & BLUEPRINT ARCHITECTURE */}
<div className="max-w-[1360px] mx-auto px-gutter-desktop py-space-3xl w-full">
<div className="flex flex-col gap-space-xs mb-space-xl">
<div className="flex items-center gap-space-xs">
<span className="h-px w-8 bg-primary"></span>
<span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">Spécifications Horlogères</span>
</div>
<h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          Bảng Thông Số Kỹ Thuật Vi Cơ Học
        </h2>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {product.narrative}
        </p>
</div>
{/* Specs Bento Grid */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
{[
  {
    icon: "settings_suggest",
    tag: "Calibre",
    title: product.calibre,
    rows: product.specs,
  },
  {
    icon: "crop_square",
    tag: "Vỏ Khối",
    title: product.caseMaterial,
    rows: [
      { label: "Đường kính", value: `${product.diameterMm}mm` },
      { label: "Dây chuẩn", value: product.strapLabel },
      { label: "Tình trạng", value: product.inBoutique ? "Sẵn tại boutique" : "Đặt trước tại Atelier" },
    ],
  },
  {
    icon: "visibility",
    tag: "Kính & Mặt Số",
    title: product.complications[0] ?? "Sapphire Box",
    rows: product.specs.slice(1).map((s) => ({ label: s.label, value: s.value })),
  },
].map((c) => (
<div key={c.tag} className="p-space-lg rounded-xl bg-surface-container-low shadow-xl flex flex-col justify-between group hover:bg-surface-container transition-colors">
<div className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between text-secondary">
<span className="material-symbols-outlined text-[28px]">{c.icon}</span>
<span className="font-label-badge text-label-badge uppercase tracking-widest px-2 py-0.5 rounded bg-surface-container-high">{c.tag}</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">{c.title}</h3>
</div>
<div className="pt-space-md flex flex-col gap-space-2xs text-body-sm">
{c.rows.map((r) => (
<div key={r.label} className="flex justify-between text-on-surface-variant">
<span>{r.label}</span>
<strong className="text-on-surface">{r.value}</strong>
</div>
))}
</div>
</div>
))}
</div>
</div>
{/* MASTER WATCHMAKER NARRATIVE & ATELIER HERITAGE */}
<div className="w-full bg-surface-container-lowest py-space-3xl shadow-inner">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-2xl items-center">
<div className="lg:col-span-5 relative">
<div className="aspect-[4/5] rounded-xl overflow-hidden shadow-2xl bg-surface-container-low relative">
<img className="w-full h-full object-cover" data-alt="Black and white atmospheric portrait of elderly Swiss master watchmaker with loupe inspecting the balance wheel of a luxury gold tourbillon watch on vintage oak workbench in Geneva." src="/images/stitch/31_AB6AXuCawX.jpg"/>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent"></div>
<div className="absolute bottom-space-lg left-space-lg right-space-lg">
<span className="font-label-badge text-[10px] text-secondary tracking-widest uppercase block">Maître Horloger</span>
<span className="font-title-editorial text-body-lg text-on-surface font-semibold">Antoine Aurel</span>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mt-1">Hậu duệ đời thứ tư của dòng họ chế tác Aurel &amp; Co. tại Genève.</p>
</div>
</div>
</div>
<div className="lg:col-span-7 flex flex-col gap-space-md">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-primary text-[20px]">auto_stories</span>
<span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">Lời Tựa Từ Bàn Chế Tác</span>
</div>
<h3 className="font-display-hero text-headline-lg text-on-surface tracking-tight leading-tight">
              "{product.narrative}"
            </h3>
<p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
              Mỗi chiếc trong số 25 tác phẩm giới hạn này mang chữ ký độc bản được khắc chìm vào cầu chuyển động trung tâm, kèm theo nhật ký kiểm chuẩn 1.000 giờ trong điều kiện khắc nghiệt nhất của Đài thiên văn Thụy Sĩ.
            </p>
<div className="pt-space-md flex items-center gap-space-xl">
<div className="flex flex-col">
<span className="font-title-editorial text-headline-sm text-secondary italic tracking-wider font-normal">Antoine Aurel</span>
<span className="font-label-badge text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">Chủ tịch Hội đồng Nghệ nhân Genève</span>
</div>
<div className="h-10 w-px bg-surface-container-highest"></div>
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-primary text-[32px]">verified</span>
<div className="flex flex-col">
<span className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface">Atelier Guarantee</span>
<span className="font-body-sm text-body-sm text-on-surface-variant">Độc bản N°07 xuất xưởng 2024</span>
</div>
</div>
</div>
</div>
</div>
</div>
</div>
{/* CURATED COLLECTOR PAIRINGS (Upsell / Companion Assets) */}
<div className="max-w-[1360px] mx-auto px-gutter-desktop py-space-3xl w-full">
<div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-space-md mb-space-xl">
<div className="flex flex-col gap-space-2xs">
<span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">Bộ Sưu Tập Giới Thượng Lưu</span>
<h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Vật Phẩm Phối Hợp Tuyệt Tác
          </h2>
<p className="font-body-md text-body-md text-on-surface-variant">
            Được chế tác đồng điệu để tôn vinh sự hoàn mỹ của chiếc {product.name}.
          </p>
</div>
<a className="font-label-spec text-label-spec text-primary hover:text-secondary transition-colors uppercase tracking-[0.14em] flex items-center gap-1 shrink-0" href="/collections">
<span>Xem Phụ Kiện Collector</span>
<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</a>
</div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
{/* Pairing 1: High-end Watch Winder */}
<div className="p-space-md rounded-xl bg-surface-container-low shadow-xl flex flex-col justify-between group hover:bg-surface-container transition-all">
<div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-lowest mb-space-md">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" data-alt="High-end artisan Swiss leather watch winder box with walnut wood inlays, micro-motor rotator mechanism, and glass display door illuminated with gold LED." src="/images/stitch/32_AB6AXuBBdd.jpg"/>
<span className="absolute top-2 right-2 px-space-xs py-0.5 rounded bg-surface-container-low/90 backdrop-blur-md text-primary font-label-badge text-[9px] uppercase tracking-wider">
              Swiss Precision Winder
            </span>
</div>
<div className="flex flex-col gap-1">
<span className="font-label-spec text-[11px] text-secondary uppercase tracking-widest">Hộp Xoay Đồng Hồ Atelier</span>
<h4 className="font-title-editorial text-body-lg text-on-surface group-hover:text-primary transition-colors">
              Hộp Xoay Gỗ Óc Chó &amp; Da Thuộc Cuir Genève
            </h4>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1">
              Động cơ vi bước siêu tĩnh lặng của Đức, lập trình tối ưu hóa 650-950 TPD dành riêng cho Calibre AC-901.
            </p>
</div>
<div className="mt-space-md pt-space-sm flex items-center justify-between">
<span className="font-headline-sm text-body-lg text-on-surface font-semibold">$3,850 <span className="font-body-sm text-on-surface-variant text-xs">USD</span></span>
<VaultAddButton slug="atelier-watch-winder" name="Hộp Xoay Gỗ Óc Chó & Da Thuộc Cuir Genève" priceUsd={3850} priceVnd={97020000} image="/images/stitch/32_AB6AXuBBdd.jpg" />
</div>
</div>
{/* Pairing 2: Bespoke Cufflinks */}
<div className="p-space-md rounded-xl bg-surface-container-low shadow-xl flex flex-col justify-between group hover:bg-surface-container transition-all">
<div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-lowest mb-space-md">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" data-alt="Pair of exquisite 18k solid rose gold cufflinks designed with miniature rotating tourbillon escapement mechanism with synthetic rubies on dark slate velvet." src="/images/stitch/33_AB6AXuD10T.jpg"/>
<span className="absolute top-2 right-2 px-space-xs py-0.5 rounded bg-surface-container-low/90 backdrop-blur-md text-secondary font-label-badge text-[9px] uppercase tracking-wider">
              Haute Joaillerie
            </span>
</div>
<div className="flex flex-col gap-1">
<span className="font-label-spec text-[11px] text-secondary uppercase tracking-widest">Khuy Măng Sét Haute Joaillerie</span>
<h4 className="font-title-editorial text-body-lg text-on-surface group-hover:text-primary transition-colors">
              Khuy Măng Sét Tourbillon Vàng Hồng 18K
            </h4>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1">
              Khắc họa lồng xoay Tourbillon thu nhỏ từ vàng hồng 18K đồng điệu với mặt số đồng hồ.
            </p>
</div>
<div className="mt-space-md pt-space-sm flex items-center justify-between">
<span className="font-headline-sm text-body-lg text-on-surface font-semibold">$5,200 <span className="font-body-sm text-on-surface-variant text-xs">USD</span></span>
<VaultAddButton slug="tourbillon-cufflinks-18k" name="Khuy Măng Sét Tourbillon Vàng Hồng 18K" priceUsd={5200} priceVnd={131040000} image="/images/stitch/33_AB6AXuD10T.jpg" />
</div>
</div>
{accessory && accLine && (
<div className="p-space-md rounded-xl bg-surface-container-low shadow-xl flex flex-col justify-between group hover:bg-surface-container transition-all">
<div className="relative aspect-square rounded-lg overflow-hidden bg-surface-container-lowest mb-space-md">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" data-alt={accessory.shortDescription} src={accessory.cardImage}/>
<span className="absolute top-2 right-2 px-space-xs py-0.5 rounded bg-surface-container-low/90 backdrop-blur-md text-primary font-label-badge text-[9px] uppercase tracking-wider">
              {accessory.badges[0] ?? "Accessory"}
            </span>
</div>
<div className="flex flex-col gap-1">
<span className="font-label-spec text-[11px] text-secondary uppercase tracking-widest">Phụ Kiện Chuẩn Aurél</span>
<h4 className="font-title-editorial text-body-lg text-on-surface group-hover:text-primary transition-colors">
              {accessory.name}
            </h4>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1">
              {accessory.shortDescription}
            </p>
</div>
<div className="mt-space-md pt-space-sm flex items-center justify-between">
<span className="font-headline-sm text-body-lg text-on-surface font-semibold">{formatUsd(accLine.priceUsd)} <span className="font-body-sm text-on-surface-variant text-xs">USD</span></span>
<VaultAddButton slug={accessory.slug} name={accessory.name} priceUsd={accLine.priceUsd} priceVnd={accLine.priceVnd} image={accessory.cardImage} />
</div>
</div>
)}
</div>
</div>
{/* PRIVATE VIP SALON APPOINTMENT BANNER */}
<div className="max-w-[1360px] mx-auto px-gutter-desktop pb-space-4xl w-full">
<div className="relative rounded-2xl overflow-hidden bg-surface-container-low shadow-2xl p-space-xl md:p-space-2xl flex flex-col md:flex-row items-center justify-between gap-space-xl">
{/* Subtle Metallic Ambient Glow */}
<div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
<div className="flex flex-col gap-space-xs max-w-xl z-10">
<span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">Salon Privé Genève &amp; Saigon</span>
<h3 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Thưởng Lãm Trực Tiếp Trong Không Gian Bí Mật
          </h3>
<p className="font-body-md text-body-md text-on-surface-variant">
            Aurel &amp; Co. hân hạnh đón tiếp quý khách tại phòng tiếp khách danh dự cùng rượu Champagne thượng hạng và chuyên gia giải phẫu đồng hồ riêng.
          </p>
</div>
<div className="flex flex-col sm:flex-row items-center gap-space-sm z-10 w-full md:w-auto">
<button className="w-full sm:w-auto px-space-xl py-space-md rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.16em] font-bold hover:bg-secondary transition-all shadow-lg flex items-center justify-center gap-2">
<span className="material-symbols-outlined text-[18px]">calendar_month</span>
<span>Đặt Lịch Tiếp Đón Riêng</span>
</button>
<button className="w-full sm:w-auto px-space-lg py-space-md rounded bg-surface-container-high text-on-surface hover:text-primary transition-all font-label-spec text-label-spec uppercase tracking-[0.12em] flex items-center justify-center gap-2">
<span className="material-symbols-outlined text-[18px]">call</span>
<span>Hotline Concierge 24/7</span>
</button>
</div>
</div>
</div>
</div>
{/* Micro-Interactivity Script */}

</div>
  </div>
  );
}
