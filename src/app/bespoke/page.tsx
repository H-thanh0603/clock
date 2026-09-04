
"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { site } from "@/data/site";

const MOVEMENTS = {
  tourbillon: { name: "Flying Tourbillon 3D", price: 190000, duration: "10 – 12 Tháng" },
  repeater: { name: "Minute Repeater Cathedral", price: 280000, duration: "12 – 14 Tháng" },
  chronograph: { name: "Chronographe Monopoussoir", price: 150000, duration: "8 – 10 Tháng" },
  perpetual: { name: "Celestial Perpetual Calendar", price: 210000, duration: "10 – 12 Tháng" },
} as const;
type MovementKey = keyof typeof MOVEMENTS;

const MATERIALS = {
  "rose-gold": { name: "Aurel 5N Rose Gold", delta: 0 },
  platinum: { name: "Platinum 950", delta: 35000 },
  titanium: { name: "Titanium Grade 5", delta: 0 },
  ceramic: { name: "Ceramic Nhám Velvet", delta: 0 },
} as const;
type MaterialKey = keyof typeof MATERIALS;

const DIALS = {
  guilloche: { name: "Guilloché Rose Engine", delta: 0 },
  meteorite: { name: "Phiến Thiên Thạch Muonionalusta", delta: 20000 },
  grandfeu: { name: "Tráng Men Grand Feu", delta: 25000 },
  skeleton: { name: "Khắc Chạm Rỗng Skeleton", delta: 0 },
} as const;
type DialKey = keyof typeof DIALS;

const fmtUsd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export default function Page() {
  const { addItem } = useCart();
  const [movement, setMovement] = useState<MovementKey>("tourbillon");
  const [material, setMaterial] = useState<MaterialKey>("rose-gold");
  const [dial, setDial] = useState<DialKey>("guilloche");
  const [crest, setCrest] = useState(true);
  const [constellation, setConstellation] = useState(false);
  const [gem, setGem] = useState(false);
  const [bespokeAdded, setBespokeAdded] = useState(false);

  const total = useMemo(
    () =>
      MOVEMENTS[movement].price +
      MATERIALS[material].delta +
      DIALS[dial].delta +
      (constellation ? 12000 : 0) +
      (gem ? 18000 : 0),
    [movement, material, dial, constellation, gem]
  );

  const addonNames = [
    crest ? "Khắc Gia Huy Rô-to" : "",
    constellation ? "Bản Đồ Sao" : "",
    gem ? "Đá Quý 12 Giờ" : "",
  ]
    .filter(Boolean)
    .join(" + ");

  const addBespokeToVault = () => {
    addItem({
      slug: `bespoke-${movement}-${material}-${dial}`,
      name: `Bespoke Độc Bản — ${MOVEMENTS[movement].name} / ${MATERIALS[material].name}`,
      priceUsd: total,
      priceVnd: total * site.usdToVnd,
      image: "/images/stitch/23_AB6AXuAy3J.jpg",
      strap: `Mặt số: ${DIALS[dial].name}${addonNames ? ` • ${addonNames}` : ""}`,
    });
    setBespokeAdded(true);
    window.setTimeout(() => setBespokeAdded(false), 2000);
  };

  const movLabel = (active: boolean) =>
    `relative flex flex-col p-space-md rounded bg-surface-container-high cursor-pointer transition-all hover:bg-surface-bright group ${active ? "border-2 border-primary" : "border border-outline-variant/40"}`;
  const matLabel = (active: boolean) =>
    `p-space-md rounded bg-surface-container-high cursor-pointer text-center group flex flex-col items-center ${active ? "border-2 border-primary" : "border border-outline-variant/30"}`;
  const dialLabel = (active: boolean) =>
    `p-space-md rounded bg-surface-container-high cursor-pointer flex items-center gap-space-md group ${active ? "border-2 border-primary" : "border border-outline-variant/30"}`;

  return (
  <div className="flex flex-col w-full">
  <div className="flex flex-col w-full">
{/* 1. HERO SECTION: COMMISSION DE HAUTE HORLOGERIE */}
<section className="relative w-full overflow-hidden bg-surface-container-lowest -mt-20 pt-28 pb-space-3xl border-b border-outline-variant/20">
{/* Ambient Radial Gold Backdrops */}
<div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-primary/10 via-secondary-container/5 to-transparent rounded-full blur-3xl pointer-events-none -z-0"></div>
<div className="absolute -top-32 right-10 w-96 h-96 bg-primary/5 rounded-full blur-2xl pointer-events-none -z-0"></div>
<div className="max-w-[1360px] mx-auto px-gutter-desktop relative z-10">
{/* Atelier Emblem & Top Micro-tag */}
<div className="flex flex-col items-center text-center max-w-4xl mx-auto">
<div className="inline-flex items-center gap-space-sm px-space-md py-1 rounded bg-surface-container-high/80 backdrop-blur-md border border-outline-variant/30 mb-space-lg shadow-sm">
<span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.25em] text-secondary">Cabinet des Pièces Rares • Commission de Haute Horlogerie</span>
</div>
<h1 className="font-headline-lg text-headline-lg md:text-display-hero text-on-surface tracking-tight leading-tight uppercase font-display-hero mb-space-md">
          Kiệt Tác Độc Bản &amp; <span className="text-primary italic font-normal">Đặt Chế Tác Riêng</span>
</h1>
<p className="font-title-editorial text-body-lg text-secondary tracking-widest uppercase mb-space-lg">
          Pièce Unique &amp; Bespoke Commissions • Genève 1892
        </p>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl leading-relaxed mb-space-2xl">
          Mỗi năm, xưởng chế tác Aurel &amp; Co. chỉ tiếp nhận tối đa <strong>07 dự án ủy thác độc bản</strong> từ các nhà sưu tập thượng lưu trên toàn cầu. Mỗi cỗ máy thời gian ra đời là một tạo tác vi cơ học duy nhất trên trần thế, mang dấu ấn linh hồn và câu chuyện vĩnh cửu của chính chủ nhân.
        </p>
{/* Exclusive Allocation Metrics Banner */}
<div className="w-full grid grid-cols-1 md:grid-cols-3 gap-px bg-outline-variant/30 rounded overflow-hidden p-px shadow-xl">
<div className="bg-surface-container-low/90 backdrop-blur-md p-space-lg flex flex-col items-center justify-center text-center">
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em] text-secondary mb-1">Hạn Ngạch Năm 2025</span>
<div className="flex items-baseline gap-2">
<span className="font-headline-md text-headline-md text-primary font-bold">04</span>
<span className="text-on-surface-variant text-body-md">/ 07 Ủy Thác Đã Ký</span>
</div>
<span className="font-body-sm text-body-sm text-on-surface-variant/70 mt-1">Chỉ còn 03 suất tiếp nhận</span>
</div>
<div className="bg-surface-container-low/90 backdrop-blur-md p-space-lg flex flex-col items-center justify-center text-center">
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em] text-secondary mb-1">Thời Gian Chế Tác Vi Cơ Học</span>
<div className="flex items-baseline gap-2">
<span className="font-headline-md text-headline-md text-on-surface font-bold">08 – 14</span>
<span className="text-on-surface-variant text-body-md">Tháng Thủ Công</span>
</div>
<span className="font-body-sm text-body-sm text-on-surface-variant/70 mt-1">Hơn 600 giờ gia công tỉ mỉ</span>
</div>
<div className="bg-surface-container-low/90 backdrop-blur-md p-space-lg flex flex-col items-center justify-center text-center">
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em] text-secondary mb-1">Bảo Chứng Độc Bản Toàn Cầu</span>
<div className="flex items-center gap-2 mt-1">
<span className="material-symbols-outlined text-primary text-[22px]">verified</span>
<span className="font-title-editorial text-body-md text-on-surface uppercase tracking-wider">Sole Custody Registry</span>
</div>
<span className="font-body-sm text-body-sm text-on-surface-variant/70 mt-1">Hộ chiếu số hóa Blockchain &amp; Triện Thụy Sĩ</span>
</div>
</div>
</div>
</div>
</section>
{/* 2. GALLERY: HISTORICAL UNIQUE MASTERPIECES (TRIỂN LÃM KIỆT TÁC ĐỘC BẢN) */}
<section className="w-full py-space-4xl bg-surface">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="flex flex-col md:flex-row md:items-end justify-between mb-space-2xl border-b border-outline-variant/20 pb-space-lg gap-space-md">
<div>
<div className="flex items-center gap-space-xs text-primary mb-space-xs">
<span className="material-symbols-outlined text-[18px]">history_edu</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.2em]">Geneva Archive Ledger</span>
</div>
<h2 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
            Di Sản Đã Hoàn Thành <span className="text-secondary italic font-serif">N°01/01</span>
</h2>
</div>
<p className="font-body-md text-body-md text-on-surface-variant max-w-md">
          Các cỗ máy được lưu giữ vĩnh viễn trong kho tàng lịch sử xưởng Genève. Mỗi thiết kế được niêm phong khuôn đúc, không bao giờ tái sản xuất.
        </p>
</div>
{/* 3 Unique Masterpieces Grid */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-space-xl">
{/* Masterpiece 1 */}
<article className="group flex flex-col bg-surface-container-low rounded overflow-hidden border border-outline-variant/30 hover:border-primary/50 transition-all duration-500 shadow-lg hover:shadow-[0_16px_40px_rgba(212,175,55,0.12)]">
<div className="relative w-full h-80 overflow-hidden bg-surface-container-lowest">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Ultra-luxury bespoke Swiss wristwatch featuring genuine Muonionalusta meteorite dial with custom baguette diamond indices, floating flying tourbillon carriage at 6 o'clock, polished Platinum 950 case, deep obsidian and champagne gold reflections, macro watchmaking photography." src="/images/stitch/24_AB6AXuAHV8.jpg"/>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-black/30"></div>
<div className="absolute top-space-md left-space-md">
<span className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md text-[10px] font-label-badge uppercase tracking-widest text-primary border border-primary/30">
<span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                In Private Collection
              </span>
</div>
<div className="absolute top-space-md right-space-md">
<span className="font-label-spec text-label-spec uppercase tracking-widest text-secondary/90 bg-surface/80 px-2 py-1 rounded backdrop-blur-sm border border-outline-variant/30">
                Pièce N° 01/01
              </span>
</div>
<div className="absolute bottom-space-md left-space-md right-space-md flex justify-between items-end">
<div>
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-[0.2em]">Commission Privée</span>
<p className="font-headline-sm text-headline-sm text-on-surface font-title-editorial">Céleste Mystérieux</p>
</div>
<span className="font-label-spec text-label-spec text-primary font-bold tracking-wider">$420,000 USD</span>
</div>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between bg-surface-container-low">
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed mb-space-md">
              Vỏ chế tác từ Bạch kim Platinum 950 đúc nguyên khối. Mặt số cắt từ thiên thạch tự nhiên Muonionalusta nạp năng lượng vũ trụ kết hợp kim cương Baguette giác cắt riêng. Lưng đáy sapphire khắc bản đồ thiên văn ngày sinh của chủ nhân.
            </p>
<div className="space-y-2 border-t border-b border-outline-variant/20 py-space-sm mb-space-md font-body-sm">
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Calibre:</span>
<span className="text-on-surface font-medium">AC-9801 Flying Tourbillon (3Hz)</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Chất liệu:</span>
<span className="text-on-surface font-medium">Platinum 950 &amp; Thiên Thạch</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Bảo hành di sản:</span>
<span className="text-primary font-medium">Trọn đời (Lifetime Escapement)</span>
</div>
</div>
<div className="flex items-center gap-space-sm pt-space-xs">
<button className="flex-1 py-2 px-3 rounded bg-surface-container-high hover:bg-surface-bright text-primary font-label-spec text-label-spec uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border border-outline-variant/30">
<span className="material-symbols-outlined text-[16px]">menu_book</span>
<span>Hồ Sơ Lưu Trữ</span>
</button>
<button className="p-2 rounded bg-surface-container-high hover:text-primary text-on-surface-variant transition-colors border border-outline-variant/30" title="Chi tiết vi cơ học">
<span className="material-symbols-outlined text-[18px]">tune</span>
</button>
</div>
</div>
</article>
{/* Masterpiece 2 */}
<article className="group flex flex-col bg-surface-container-low rounded overflow-hidden border border-outline-variant/30 hover:border-primary/50 transition-all duration-500 shadow-lg hover:shadow-[0_16px_40px_rgba(212,175,55,0.12)]">
<div className="relative w-full h-80 overflow-hidden bg-surface-container-lowest">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Exquisite Haute Horlogerie split-seconds chronograph with Grand Feu enamel dial portraying an imperial golden dragon, 18k 5N rose gold sculpted case, twin column-wheel complication visible, warm golden reflections on dark obsidian backdrop." src="/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg"/>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-black/30"></div>
<div className="absolute top-space-md left-space-md">
<span className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md text-[10px] font-label-badge uppercase tracking-widest text-primary border border-primary/30">
<span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                In Private Collection
              </span>
</div>
<div className="absolute top-space-md right-space-md">
<span className="font-label-spec text-label-spec uppercase tracking-widest text-secondary/90 bg-surface/80 px-2 py-1 rounded backdrop-blur-sm border border-outline-variant/30">
                Pièce N° 01/01
              </span>
</div>
<div className="absolute bottom-space-md left-space-md right-space-md flex justify-between items-end">
<div>
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-[0.2em]">Commission Métiers d’Art</span>
<p className="font-headline-sm text-headline-sm text-on-surface font-title-editorial">Rattrapante Dragon Impérial</p>
</div>
<span className="font-label-spec text-label-spec text-primary font-bold tracking-wider">$385,000 USD</span>
</div>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between bg-surface-container-low">
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed mb-space-md">
              Mặt số tiểu họa men Grand Feu nung thủ công 7 lần ở nhiệt độ 850°C, khắc họa hình tượng Rồng Hoàng gia uy nghi. Tính năng bấm giờ kép chia giây Rattrapante với hệ thống bánh xe cột kép tinh vi.
            </p>
<div className="space-y-2 border-t border-b border-outline-variant/20 py-space-sm mb-space-md font-body-sm">
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Calibre:</span>
<span className="text-on-surface font-medium">AC-7700 Twin Column-Wheel</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Chất liệu:</span>
<span className="text-on-surface font-medium">Vàng 18K 5N Rose Gold &amp; Grand Feu</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Tiêu chuẩn:</span>
<span className="text-primary font-medium">Poinçon de Genève Certified</span>
</div>
</div>
<div className="flex items-center gap-space-sm pt-space-xs">
<button className="flex-1 py-2 px-3 rounded bg-surface-container-high hover:bg-surface-bright text-primary font-label-spec text-label-spec uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border border-outline-variant/30">
<span className="material-symbols-outlined text-[16px]">menu_book</span>
<span>Hồ Sơ Lưu Trữ</span>
</button>
<button className="p-2 rounded bg-surface-container-high hover:text-primary text-on-surface-variant transition-colors border border-outline-variant/30" title="Chi tiết vi cơ học">
<span className="material-symbols-outlined text-[18px]">tune</span>
</button>
</div>
</div>
</article>
{/* Masterpiece 3 */}
<article className="group flex flex-col bg-surface-container-low rounded overflow-hidden border border-outline-variant/30 hover:border-primary/50 transition-all duration-500 shadow-lg hover:shadow-[0_16px_40px_rgba(212,175,55,0.12)]">
<div className="relative w-full h-80 overflow-hidden bg-surface-container-lowest">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Hand-skeletonized cathedral gong minute repeater wristwatch, exposed intricate gears, bridges hand-beveled with black polish, titanium acoustic resonance case, dramatic macro lighting, dark luxury Swiss watch workshop aesthetics." src="/images/stitch/25_AB6AXuAnMc.jpg"/>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-black/30"></div>
<div className="absolute top-space-md left-space-md">
<span className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md text-[10px] font-label-badge uppercase tracking-widest text-primary border border-primary/30">
<span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                In Private Collection
              </span>
</div>
<div className="absolute top-space-md right-space-md">
<span className="font-label-spec text-label-spec uppercase tracking-widest text-secondary/90 bg-surface/80 px-2 py-1 rounded backdrop-blur-sm border border-outline-variant/30">
                Pièce N° 01/01
              </span>
</div>
<div className="absolute bottom-space-md left-space-md right-space-md flex justify-between items-end">
<div>
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-[0.2em]">Acoustic Complication</span>
<p className="font-headline-sm text-headline-sm text-on-surface font-title-editorial">Minute Repeater 'Chopin Opus'</p>
</div>
<span className="font-label-spec text-label-spec text-primary font-bold tracking-wider">$560,000 USD</span>
</div>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between bg-surface-container-low">
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed mb-space-md">
              Cỗ máy điểm chuông vang vọng với hệ thống Cathedral Gongs uốn vòng kép. Khung cầu nối được khoét rỗng Skeleton và vát cạnh bóng gương (anglage) hoàn toàn bằng tay trong 180 giờ bởi Trưởng nghệ nhân.
            </p>
<div className="space-y-2 border-t border-b border-outline-variant/20 py-space-sm mb-space-md font-body-sm">
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Âm học:</span>
<span className="text-on-surface font-medium">Cathedral Gong (Cung Trầm F/A)</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Hoàn thiện:</span>
<span className="text-on-surface font-medium">Hand-skeletonized Skeleton Art</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span className="font-label-badge uppercase text-secondary">Âm vang đo đạc:</span>
<span className="text-primary font-medium">68dB tại phòng thử âm Genève</span>
</div>
</div>
<div className="flex items-center gap-space-sm pt-space-xs">
<button className="flex-1 py-2 px-3 rounded bg-surface-container-high hover:bg-surface-bright text-primary font-label-spec text-label-spec uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border border-outline-variant/30">
<span className="material-symbols-outlined text-[16px]">menu_book</span>
<span>Hồ Sơ Lưu Trữ</span>
</button>
<button className="p-2 rounded bg-surface-container-high hover:text-primary text-on-surface-variant transition-colors border border-outline-variant/30" title="Chi tiết vi cơ học">
<span className="material-symbols-outlined text-[18px]">tune</span>
</button>
</div>
</div>
</article>
</div>
</div>
</section>
{/* 3. INTERACTIVE BESPOKE COMMISSION ATELIER (TRÌNH CẤU HÌNH ĐẶT CHẾ TÁC TRỰC TUYẾN) */}
<section className="w-full py-space-4xl bg-surface-container-lowest border-t border-b border-outline-variant/20 relative" id="bespoke-configurator">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="text-center max-w-3xl mx-auto mb-space-3xl">
<div className="inline-flex items-center gap-space-xs text-primary mb-space-xs">
<span className="material-symbols-outlined text-[18px]">architecture</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.25em]">Atelier de Création Sur-Mesure</span>
</div>
<h2 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight mb-space-xs">
          Trình Cấu Hình Ủy Thác <span className="text-primary italic font-serif">Độc Bản</span>
</h2>
<p className="font-body-md text-body-md text-on-surface-variant">
          Lựa chọn các nền tảng kỹ nghệ vi cơ học đỉnh cao để phác thảo cỗ máy ước mơ của quý khách. Hội đồng Nghệ nhân Aurel &amp; Co. sẽ phản hồi bản dựng kỹ thuật bảo mật trong vòng 24 giờ.
        </p>
</div>
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
{/* Configuration Steps Panel (8 Cols) */}
<div className="lg:col-span-8 space-y-space-xl">
{/* Step 1: Movement Archetype */}
<div className="bg-surface-container-low p-space-xl rounded border border-outline-variant/30">
<div className="flex items-center justify-between mb-space-md">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-label-badge text-body-sm font-bold border border-primary/40">1</span>
<div>
<h3 className="font-title-editorial text-title-editorial text-on-surface uppercase">Cỗ Máy Cơ Khí Đỉnh Cao</h3>
<span className="font-label-spec text-label-spec text-secondary uppercase">Movement Archetype &amp; Complications</span>
</div>
</div>
<span className="font-label-badge text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">Bắt buộc</span>
</div>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md" id="opt-movements">
<label className={movLabel(movement === "tourbillon")}>
<input checked={movement === "tourbillon"} onChange={() => setMovement("tourbillon")} className="sr-only" name="movement" type="radio" value="tourbillon"/>
<div className="flex justify-between items-start mb-2">
<span className="font-title-editorial text-body-md text-on-surface font-semibold group-hover:text-primary">Flying Tourbillon 3D</span>
<span className={`material-symbols-outlined text-[20px] check-indicator ${movement === "tourbillon" ? "text-primary" : "text-outline-variant"}`}>{movement === "tourbillon" ? "radio_button_checked" : "radio_button_unchecked"}</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-xs">Cơ cấu lồng xoay triệt tiêu trọng trường 60 giây, nung ốc xanh nung nhiệt, cầu vát tay.</p>
<span className="font-label-spec text-label-spec text-primary mt-auto">Khởi điểm: $190,000</span>
</label>
<label className={movLabel(movement === "repeater")}>
<input checked={movement === "repeater"} onChange={() => setMovement("repeater")} className="sr-only" name="movement" type="radio" value="repeater"/>
<div className="flex justify-between items-start mb-2">
<span className="font-title-editorial text-body-md text-on-surface font-semibold group-hover:text-primary">Cathedral Minute Repeater</span>
<span className={`material-symbols-outlined text-[20px] check-indicator ${movement === "repeater" ? "text-primary" : "text-outline-variant"}`}>{movement === "repeater" ? "radio_button_checked" : "radio_button_unchecked"}</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-xs">Điểm chuông nhà thờ âm vực trầm vang, bộ búa gõ thép cường lực đánh bóng gương.</p>
<span className="font-label-spec text-label-spec text-primary mt-auto">Khởi điểm: $280,000</span>
</label>
<label className={movLabel(movement === "chronograph")}>
<input checked={movement === "chronograph"} onChange={() => setMovement("chronograph")} className="sr-only" name="movement" type="radio" value="chronograph"/>
<div className="flex justify-between items-start mb-2">
<span className="font-title-editorial text-body-md text-on-surface font-semibold group-hover:text-primary">Chronographe Monopoussoir</span>
<span className={`material-symbols-outlined text-[20px] check-indicator ${movement === "chronograph" ? "text-primary" : "text-outline-variant"}`}>{movement === "chronograph" ? "radio_button_checked" : "radio_button_unchecked"}</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-xs">Bấm giờ một nút bấm tích hợp trục đồng tâm trên núm vặn, ly hợp ngang cổ điển.</p>
<span className="font-label-spec text-label-spec text-primary mt-auto">Khởi điểm: $150,000</span>
</label>
<label className={movLabel(movement === "perpetual")}>
<input checked={movement === "perpetual"} onChange={() => setMovement("perpetual")} className="sr-only" name="movement" type="radio" value="perpetual"/>
<div className="flex justify-between items-start mb-2">
<span className="font-title-editorial text-body-md text-on-surface font-semibold group-hover:text-primary">Celestial Perpetual Calendar</span>
<span className={`material-symbols-outlined text-[20px] check-indicator ${movement === "perpetual" ? "text-primary" : "text-outline-variant"}`}>{movement === "perpetual" ? "radio_button_checked" : "radio_button_unchecked"}</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-xs">Lịch vạn niên thiên văn hiển thị chu kỳ mặt trăng thật chính xác 122 năm.</p>
<span className="font-label-spec text-label-spec text-primary mt-auto">Khởi điểm: $210,000</span>
</label>
</div>
</div>
{/* Step 2: Case Metallurgy */}
<div className="bg-surface-container-low p-space-xl rounded border border-outline-variant/30">
<div className="flex items-center justify-between mb-space-md">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-label-badge text-body-sm font-bold border border-primary/40">2</span>
<div>
<h3 className="font-title-editorial text-title-editorial text-on-surface uppercase">Chất Liệu Vỏ Quý Hiếm</h3>
<span className="font-label-spec text-label-spec text-secondary uppercase">Case Metallurgy &amp; Finishing</span>
</div>
</div>
<span className="font-label-badge text-[10px] text-secondary bg-surface-container-high px-2 py-0.5 rounded uppercase">Tùy chọn đúc riêng</span>
</div>
<div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm" id="opt-materials">
<label className={matLabel(material === "rose-gold")}>
<input checked={material === "rose-gold"} onChange={() => setMaterial("rose-gold")} className="sr-only" name="material" type="radio" value="rose-gold"/>
<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-700 via-rose-300 to-amber-500 mb-2 ring-1 ring-primary/40"></div>
<span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:text-primary">Aurel 5N Rose Gold</span>
<span className="font-label-badge text-[10px] text-secondary mt-1">Đúc nguyên khối 18K</span>
</label>
<label className={matLabel(material === "platinum")}>
<input checked={material === "platinum"} onChange={() => setMaterial("platinum")} className="sr-only" name="material" type="radio" value="platinum"/>
<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-500 via-slate-200 to-zinc-400 mb-2 ring-1 ring-white/30"></div>
<span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:text-primary">Platinum 950</span>
<span className="font-label-badge text-[10px] text-secondary mt-1">+ $35,000 USD</span>
</label>
<label className={matLabel(material === "titanium")}>
<input checked={material === "titanium"} onChange={() => setMaterial("titanium")} className="sr-only" name="material" type="radio" value="titanium"/>
<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-stone-600 via-neutral-400 to-stone-700 mb-2 ring-1 ring-white/20"></div>
<span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:text-primary">Titanium Grade 5</span>
<span className="font-label-badge text-[10px] text-secondary mt-1">Siêu nhẹ chải xước</span>
</label>
<label className={matLabel(material === "ceramic")}>
<input checked={material === "ceramic"} onChange={() => setMaterial("ceramic")} className="sr-only" name="material" type="radio" value="ceramic"/>
<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-black via-zinc-800 to-neutral-900 mb-2 ring-1 ring-white/20"></div>
<span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:text-primary">Ceramic Nhám Velvet</span>
<span className="font-label-badge text-[10px] text-secondary mt-1">Chống trầy tuyệt đối</span>
</label>
</div>
</div>
{/* Step 3: Métiers d'Art Dial */}
<div className="bg-surface-container-low p-space-xl rounded border border-outline-variant/30">
<div className="flex items-center justify-between mb-space-md">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-label-badge text-body-sm font-bold border border-primary/40">3</span>
<div>
<h3 className="font-title-editorial text-title-editorial text-on-surface uppercase">Nghệ Thuật Mặt Số Métiers d'Art</h3>
<span className="font-label-spec text-label-spec text-secondary uppercase">Dial Craftsmanship &amp; Rare Handcrafts</span>
</div>
</div>
</div>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md" id="opt-dial">
<label className={dialLabel(dial === "guilloche")}>
<input checked={dial === "guilloche"} onChange={() => setDial("guilloche")} className="sr-only" name="dial" type="radio" value="guilloche"/>
<span className="material-symbols-outlined text-primary text-[28px]">grain</span>
<div>
<p className="font-body-md text-body-md font-semibold text-on-surface group-hover:text-primary">Guilloché Rose Engine Thủ Công</p>
<span className="font-body-sm text-body-sm text-on-surface-variant">Tiện tay trên máy tiện cổ 1920s họa tiết sóng Clous de Paris</span>
</div>
</label>
<label className={dialLabel(dial === "meteorite")}>
<input checked={dial === "meteorite"} onChange={() => setDial("meteorite")} className="sr-only" name="dial" type="radio" value="meteorite"/>
<span className="material-symbols-outlined text-secondary text-[28px]">diamond</span>
<div>
<p className="font-body-md text-body-md font-semibold text-on-surface group-hover:text-primary">Phiến Thiên Thạch Muonionalusta</p>
<span className="font-body-sm text-body-sm text-on-surface-variant">Họa tiết Widmanstätten 4.5 tỷ năm tuổi (+ $20,000)</span>
</div>
</label>
<label className={dialLabel(dial === "grandfeu")}>
<input checked={dial === "grandfeu"} onChange={() => setDial("grandfeu")} className="sr-only" name="dial" type="radio" value="grandfeu"/>
<span className="material-symbols-outlined text-secondary text-[28px]">local_fire_department</span>
<div>
<p className="font-body-md text-body-md font-semibold text-on-surface group-hover:text-primary">Tráng Men Lửa Lớn Grand Feu</p>
<span className="font-body-sm text-body-sm text-on-surface-variant">Nung men kính 7 lần, vẽ tiểu họa vi mô độc quyền (+ $25,000)</span>
</div>
</label>
<label className={dialLabel(dial === "skeleton")}>
<input checked={dial === "skeleton"} onChange={() => setDial("skeleton")} className="sr-only" name="dial" type="radio" value="skeleton"/>
<span className="material-symbols-outlined text-secondary text-[28px]">all_inclusive</span>
<div>
<p className="font-body-md text-body-md font-semibold text-on-surface group-hover:text-primary">Khắc Chạm Rỗng Skeleton</p>
<span className="font-body-sm text-body-sm text-on-surface-variant">Lộ toàn bộ cơ cấu bánh răng, vát cạnh bóng gương 100%</span>
</div>
</label>
</div>
</div>
{/* Step 4: Bespoke Personalization */}
<div className="bg-surface-container-low p-space-xl rounded border border-outline-variant/30">
<div className="flex items-center justify-between mb-space-md">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-label-badge text-body-sm font-bold border border-primary/40">4</span>
<div>
<h3 className="font-title-editorial text-title-editorial text-on-surface uppercase">Dấu Ấn Cá Nhân Hóa Độc Quyền</h3>
<span className="font-label-spec text-label-spec text-secondary uppercase">Personalized Signature &amp; Crest</span>
</div>
</div>
</div>
<div className="space-y-space-sm">
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container-high border border-outline-variant/30 cursor-pointer hover:bg-surface-bright">
<input checked={crest} onChange={(e) => setCrest(e.target.checked)} className="accent-primary w-4 h-4 rounded" id="check-crest" type="checkbox"/>
<div className="flex-1">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Khắc Gia Huy Hoàng Gia / Chữ Ký Tay Trên Rô-To Vàng 21K</span>
<p className="font-body-sm text-body-sm text-on-surface-variant">Nghệ nhân chạm khắc phù điêu 3D bằng kính hiển vi điện tử</p>
</div>
<span className="font-label-spec text-label-spec text-secondary font-medium">Kèm theo</span>
</label>
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container-high border border-outline-variant/30 cursor-pointer hover:bg-surface-bright">
<input checked={constellation} onChange={(e) => setConstellation(e.target.checked)} className="accent-primary w-4 h-4 rounded" id="check-constellation" type="checkbox"/>
<div className="flex-1">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Bản Đồ Chòm Sao Thiên Văn Cá Nhân Khắc Đáy Sapphire</span>
<p className="font-body-sm text-body-sm text-on-surface-variant">Tọa độ chính xác bầu trời đêm vào khoảnh khắc quý khách yêu cầu</p>
</div>
<span className="font-label-spec text-label-spec text-secondary font-medium">+ $12,000</span>
</label>
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container-high border border-outline-variant/30 cursor-pointer hover:bg-surface-bright">
<input checked={gem} onChange={(e) => setGem(e.target.checked)} className="accent-primary w-4 h-4 rounded" id="check-gem" type="checkbox"/>
<div className="flex-1">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Khảm Đá Quý Phong Thủy / Kim Cương D-Flawless Tại Góc 12 Giờ</span>
<p className="font-body-sm text-body-sm text-on-surface-variant">Viên chủ cắt cabochon hoặc giác cắt Brilliant giác độc quyền</p>
</div>
<span className="font-label-spec text-label-spec text-secondary font-medium">+ $18,000</span>
</label>
</div>
</div>
</div>
{/* Realtime Bespoke Summary Estimator (4 Cols Sticky) */}
<div className="lg:col-span-4 sticky top-28 space-y-space-md">
<div className="bg-surface-container-high rounded p-space-xl border border-primary/40 shadow-2xl relative overflow-hidden">
<div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-xl pointer-events-none"></div>
<div className="flex items-center justify-between border-b border-outline-variant/30 pb-space-sm mb-space-md">
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em] text-secondary">Dự Toán Ủy Thác</span>
<span className="font-label-badge text-[10px] text-primary bg-primary/20 px-2 py-0.5 rounded font-bold">ESTIMATION</span>
</div>
{/* Dynamic Selected Summary Items */}
<div className="space-y-space-sm font-body-sm pb-space-md border-b border-outline-variant/20">
<div className="flex justify-between">
<span className="text-on-surface-variant">Cỗ máy cơ khí:</span>
<span className="text-on-surface font-semibold text-right" id="summary-movement">{MOVEMENTS[movement].name}</span>
</div>
<div className="flex justify-between">
<span className="text-on-surface-variant">Chất liệu vỏ:</span>
<span className="text-on-surface font-semibold text-right" id="summary-material">{MATERIALS[material].name}</span>
</div>
<div className="flex justify-between">
<span className="text-on-surface-variant">Nghệ thuật mặt:</span>
<span className="text-on-surface font-semibold text-right" id="summary-dial">{DIALS[dial].name}</span>
</div>
<div className="flex justify-between">
<span className="text-on-surface-variant">Dấu ấn cá nhân:</span>
<span className="text-secondary font-semibold text-right" id="summary-addon">{addonNames || "—"}</span>
</div>
</div>
{/* Metrics: Lead Time & Estimation Price */}
<div className="pt-space-md space-y-space-sm mb-space-lg">
<div className="flex items-baseline justify-between">
<span className="font-body-sm text-on-surface-variant">Thời gian chế tác:</span>
<span className="font-title-editorial text-body-md text-primary font-bold" id="summary-duration">{MOVEMENTS[movement].duration}</span>
</div>
<div className="flex flex-col pt-2 border-t border-outline-variant/20">
<span className="font-label-badge text-label-badge uppercase tracking-wider text-secondary">Ngân Sách Ủy Thác Ước Tính:</span>
<div className="flex items-baseline gap-1 mt-1">
<span className="font-headline-md text-headline-md text-primary font-bold tracking-tight" id="summary-price">{fmtUsd(total)}</span>
<span className="font-body-sm text-body-sm text-on-surface-variant">USD*</span>
</div>
<span className="text-[11px] text-on-surface-variant/70 italic mt-0.5">*Đã bao gồm thuế hải quan ngoại giao &amp; chuyên xe an ninh</span>
</div>
</div>
{/* Action Button: Jump to Inquiry Form */}
<a className="w-full py-space-sm px-space-md rounded bg-primary hover:bg-secondary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] font-bold flex items-center justify-center gap-space-xs transition-all shadow-[0_4px_20px_rgba(242,202,80,0.3)]" href="#bespoke-inquiry">
<span>Gửi Yêu Cầu Khảo Sát Kín</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</a>
<button onClick={addBespokeToVault} className="mt-space-sm w-full py-space-sm px-space-md rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-spec text-label-spec uppercase tracking-[0.15em] font-bold flex items-center justify-center gap-space-xs transition-all">
<span>{bespokeAdded ? "Đã Thêm Vào Vault ✓" : "Thêm Cấu Hình Vào Vault"}</span>
<span className="material-symbols-outlined text-[18px]">shopping_bag</span>
</button>
<div className="mt-space-md p-space-sm rounded bg-surface-container-lowest text-center border border-outline-variant/20">
<span className="text-[11px] text-on-surface-variant flex items-center justify-center gap-1">
<span className="material-symbols-outlined text-primary text-[14px]">lock</span>
                Cam kết ký kết thỏa thuận bảo mật NDA trước khi diện kiến
              </span>
</div>
</div>
</div>
</div>
</div>
</section>
{/* 4. THE 5-STEP BESPOKE JOURNEY (QUY TRÌNH 5 BƯỚC CHẾ TÁC ĐỘC BẢN) */}
<section className="w-full py-space-4xl bg-surface border-b border-outline-variant/20">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="text-center max-w-3xl mx-auto mb-space-3xl">
<div className="inline-flex items-center gap-space-xs text-primary mb-space-xs">
<span className="material-symbols-outlined text-[18px]">timeline</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.25em]">Le Protocole de Haute Horlogerie</span>
</div>
<h2 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
          Hành Trình Chế Tác <span className="text-primary italic font-serif">05 Giai Đoạn</span>
</h2>
<p className="font-body-md text-body-md text-on-surface-variant mt-2">
          Từ ý tưởng sơ khởi đến kiệt tác cơ khí hiện hữu trên cổ tay – một nghi thức danh giá kéo dài hàng trăm giờ miệt mài.
        </p>
</div>
{/* Timeline Cards Grid */}
<div className="grid grid-cols-1 md:grid-cols-5 gap-space-md relative">
{/* Step 1 */}
<div className="relative bg-surface-container-low p-space-lg rounded border border-outline-variant/30 flex flex-col justify-between group hover:border-primary/50 transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-headline-md text-headline-md text-primary font-title-editorial font-bold">01</span>
<span className="material-symbols-outlined text-secondary text-[24px]">key</span>
</div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase mb-space-xs">Diện Kiến Bí Mật</h4>
<span className="font-label-badge text-[10px] text-secondary tracking-widest uppercase block mb-space-sm">Private Salon Consultation</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Hội kiến kín cùng Giám đốc Sáng tạo và Trưởng Nghệ nhân tại Genève, Zürich hoặc tư gia để ghi nhận phong thái và tinh thần mong muốn.
            </p>
</div>
<div className="mt-space-md pt-space-xs border-t border-outline-variant/20 text-[11px] text-secondary font-label-spec">
            Thời lượng: 2 - 4 Tuần
          </div>
</div>
{/* Step 2 */}
<div className="relative bg-surface-container-low p-space-lg rounded border border-outline-variant/30 flex flex-col justify-between group hover:border-primary/50 transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-headline-md text-headline-md text-primary font-title-editorial font-bold">02</span>
<span className="material-symbols-outlined text-secondary text-[24px]">brush</span>
</div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase mb-space-xs">Phác Thảo Gouache</h4>
<span className="font-label-badge text-[10px] text-secondary tracking-widest uppercase block mb-space-sm">Artistic Blueprint &amp; 3D</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Thực hiện bản vẽ màu nước nghệ thuật Gouache tỉ lệ 1:1 cùng mô hình cơ khí 3D mô phỏng góc đặt chi tiết và ánh sắc kim loại.
            </p>
</div>
<div className="mt-space-md pt-space-xs border-t border-outline-variant/20 text-[11px] text-secondary font-label-spec">
            Thời lượng: 4 - 6 Tuần
          </div>
</div>
{/* Step 3 */}
<div className="relative bg-surface-container-low p-space-lg rounded border border-outline-variant/30 flex flex-col justify-between group hover:border-primary/50 transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-headline-md text-headline-md text-primary font-title-editorial font-bold">03</span>
<span className="material-symbols-outlined text-secondary text-[24px]">precision_manufacturing</span>
</div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase mb-space-xs">Đúc Phôi &amp; Chế Tác</h4>
<span className="font-label-badge text-[10px] text-secondary tracking-widest uppercase block mb-space-sm">Atelier Hand-Finishing</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Hơn 600 giờ gọt giũa thủ công các chi tiết cầu nối, đánh bóng đen miroir, vát cạnh và chạm khắc hoa văn gia huy độc bản.
            </p>
</div>
<div className="mt-space-md pt-space-xs border-t border-outline-variant/20 text-[11px] text-secondary font-label-spec">
            Thời lượng: 6 - 9 Tháng
          </div>
</div>
{/* Step 4 */}
<div className="relative bg-surface-container-low p-space-lg rounded border border-outline-variant/30 flex flex-col justify-between group hover:border-primary/50 transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-headline-md text-headline-md text-primary font-title-editorial font-bold">04</span>
<span className="material-symbols-outlined text-secondary text-[24px]">hourglass_empty</span>
</div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase mb-space-xs">Kiểm Định 1,000 Giờ</h4>
<span className="font-label-badge text-[10px] text-secondary tracking-widest uppercase block mb-space-sm">Master Chronometer Testing</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Trải qua quy chuẩn thử nghiệm khắt khe 1,000 giờ trong 6 vị trí không gian và 3 dải nhiệt độ, vượt trên cả tiêu chuẩn COSC.
            </p>
</div>
<div className="mt-space-md pt-space-xs border-t border-outline-variant/20 text-[11px] text-secondary font-label-spec">
            Thời lượng: ~ 6 Tuần
          </div>
</div>
{/* Step 5 */}
<div className="relative bg-surface-container-low p-space-lg rounded border border-outline-variant/30 flex flex-col justify-between group hover:border-primary/50 transition-colors">
<div>
<div className="flex items-center justify-between mb-space-md">
<span className="font-headline-md text-headline-md text-primary font-title-editorial font-bold">05</span>
<span className="material-symbols-outlined text-secondary text-[24px]">local_police</span>
</div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase mb-space-xs">Nghi Lễ Bàn Giao</h4>
<span className="font-label-badge text-[10px] text-secondary tracking-widest uppercase block mb-space-sm">Solemn Handover Protocol</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Bàn giao trang trọng tại tư gia cùng đội xe bọc thép an ninh hoặc dạ tiệc riêng tại Lâu đài Genève kèm chứng thư số hóa NFT độc bản.
            </p>
</div>
<div className="mt-space-md pt-space-xs border-t border-outline-variant/20 text-[11px] text-secondary font-label-spec">
            Độc quyền vĩnh cửu
          </div>
</div>
</div>
</div>
</section>
{/* 5. VIP BESPOKE INQUIRY CONCIERGE (FORM LIÊN HỆ ĐẶT HẸN ỦY THÁC) */}
<section className="w-full py-space-4xl bg-surface-container-lowest relative overflow-hidden" id="bespoke-inquiry">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-2xl">
{/* Left Column: Atelier Philosophy & Reassurance (5 cols) */}
<div className="lg:col-span-5 flex flex-col justify-between">
<div>
<div className="inline-flex items-center gap-space-xs text-primary mb-space-xs">
<span className="material-symbols-outlined text-[18px]">verified_user</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.2em]">Protocole de Confidentialité Absolue</span>
</div>
<h2 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight mb-space-md">
              Khởi Đầu Hành Trình Sở Hữu <span className="text-primary italic font-serif">Di Sản Độc Nhất</span>
</h2>
<p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-xl">
              Thư ký Hội đồng Nghệ nhân Aurel &amp; Co. sẽ trực tiếp kết nối cùng quý vị qua kênh liên lạc cơ mật. Toàn bộ thông tin danh tính và nội dung trao đổi được bảo đảm tuyệt đối theo Thỏa thuận Bảo Mật NDA Thụy Sĩ.
            </p>
<div className="space-y-space-md">
<div className="flex items-start gap-space-md p-space-md bg-surface-container-low rounded border border-outline-variant/20">
<span className="material-symbols-outlined text-primary text-[24px] mt-0.5">lock_person</span>
<div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase">Bảo Mật Cấp Ngoại Giao</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Danh tính khách hàng được mã hóa dưới bí danh định danh (Alias Cryptographic Key) trong sổ cái Atelier.</p>
</div>
</div>
<div className="flex items-start gap-space-md p-space-md bg-surface-container-low rounded border border-outline-variant/20">
<span className="material-symbols-outlined text-primary text-[24px] mt-0.5">handshake</span>
<div>
<h4 className="font-title-editorial text-body-md text-on-surface uppercase">Cam Kết Độc Bản Vĩnh Viễn</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Bản vẽ kỹ thuật và khuôn chế tác được niêm phong hoặc bàn giao trọn vẹn lại cho quý chủ nhân.</p>
</div>
</div>
</div>
</div>
<div className="pt-space-xl mt-space-xl border-t border-outline-variant/20">
<span className="font-label-badge text-label-badge text-secondary uppercase tracking-widest block mb-1">Geneva Direct Salon Contact</span>
<div className="font-headline-sm text-headline-sm text-on-surface font-title-editorial tracking-wider">
              +41 22 819 92 00 <span className="text-primary text-body-sm font-sans font-normal">(VIP Desk)</span>
</div>
<span className="font-body-sm text-body-sm text-on-surface-variant">Rue du Rhône 48, 1204 Genève, Suisse</span>
</div>
</div>
{/* Right Column: Bespoke Dossier Inquiry Form (7 cols) */}
<div className="lg:col-span-7 bg-surface-container-low p-space-xl md:p-space-2xl rounded border border-outline-variant/30 shadow-2xl relative">
<form className="space-y-space-md" id="bespoke-form" >
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-secondary mb-space-xs">Danh Xưng &amp; Họ Tên Thượng Khách *</label>
<input className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30" placeholder="Ví dụ: Mr. Alexandre Nguyen" required type="text"/>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-secondary mb-space-xs">Kênh Bảo Mật (Signal / WhatsApp / Phone) *</label>
<input className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30" placeholder="+84 90 000 0000" required type="tel"/>
</div>
</div>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-secondary mb-space-xs">Email Liên Lạc Cơ Mật *</label>
<input className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30" placeholder="vip.collector@domain.com" required type="email"/>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-secondary mb-space-xs">Quốc Gia &amp; Thành Phố Tiếp Đón *</label>
<input className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30" placeholder="Genève / TP. Hồ Chí Minh / Hà Nội" required type="text"/>
</div>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-secondary mb-space-xs">Hạn Mức Ngân Sách Dự Kiến Dành Cho Dự Án</label>
<select className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30">
<option value="150-250k">$150,000 – $250,000 USD (Chrono Monopusher / Tourbillon Classic)</option>
<option value="250-400k">$250,000 – $400,000 USD (Flying Tourbillon / Perpetual Celestial)</option>
<option value="400-600k">$400,000 – $600,000 USD (Minute Repeater / Grand Feu Dragon)</option>
<option value="600k+">Trên $600,000 USD (Grand Complication Bespoke Độc Bản Kép)</option>
</select>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-secondary mb-space-xs">Ý Tưởng Hoặc Câu Chuyện Muốn Gửi Gắm Vào Cỗ Máy</label>
<textarea className="w-full bg-surface-container-high p-space-md rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30" placeholder="Chia sẻ về biểu tượng gia đình, câu chuyện thành tựu, các loại đá quý phong thủy hoặc chi tiết máy cơ khí quý khách muốn độc quyền đưa vào tác phẩm..." rows={4}></textarea>
</div>
<div className="flex items-start gap-space-sm pt-space-xs">
<input className="accent-primary w-4 h-4 rounded mt-0.5" id="nda-consent" required type="checkbox"/>
<label className="font-body-sm text-body-sm text-on-surface-variant leading-tight cursor-pointer" htmlFor="nda-consent">
                Tôi yêu cầu bảo mật thông tin tuyệt đối và đồng ý để Thư ký Hội đồng Nghệ nhân Aurel &amp; Co. gửi văn bản Thỏa thuận Bảo mật NDA (Non-Disclosure Agreement) trước buổi diện kiến.
              </label>
</div>
<div className="pt-space-sm">
<button className="w-full py-space-md px-space-lg rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-bold hover:bg-secondary transition-all flex items-center justify-center gap-space-sm shadow-[0_6px_25px_rgba(242,202,80,0.35)]" type="submit">
<span className="material-symbols-outlined text-[20px]">shield_with_heart</span>
<span>Gửi Yêu Cầu Ủy Thác Độc Bản &amp; Ký Kết NDA</span>
</button>
</div>
</form>
{/* Confirmation message overlay (hidden initially) */}
<div className="hidden absolute inset-0 bg-surface-container-low/95 backdrop-blur-md flex flex-col items-center justify-center p-space-2xl text-center rounded" id="form-success">
<div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-space-md">
<span className="material-symbols-outlined text-[36px]">done_all</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface uppercase mb-space-xs">Yêu Cầu Đã Được Niêm Phong</h3>
<p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-space-lg">
              Thư ký Hội đồng Nghệ nhân Aurel &amp; Co. đã tiếp nhận hồ sơ bí mật của Quý Khách. Thư xác nhận bảo mật và dự thảo NDA sẽ được gửi tới phương thức liên lạc đã chọn trong vòng 24 giờ.
            </p>
<span className="font-label-badge text-label-badge text-primary uppercase tracking-widest border border-primary/30 px-3 py-1 rounded">
              Dossier Protocol: #AUC-2025-05U
            </span>
</div>
</div>
</div>
</div>
</section>
{/* Script for Micro-Interactions & Realtime Configurator Calculation */}

</div>
  </div>
  );
}
