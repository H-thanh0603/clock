import Link from "next/link";

export default function Home() {
  return (
  <div className="flex flex-col w-full">
  <div className="flex flex-col w-full">
{/* HERO SECTION */}
<section className="relative w-full overflow-hidden bg-surface-container-lowest -mt-20 pt-28 pb-space-4xl">
<div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(circle_at_70%_40%,rgba(242,202,80,0.18)_0%,rgba(18,19,21,0)_60%)]"></div>
<div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none"></div>
<div className="max-w-[1360px] mx-auto px-gutter-desktop relative z-10">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-2xl items-center min-h-[calc(88vh-80px)]">
{/* Left Editorial Narrative */}
<div className="lg:col-span-7 flex flex-col items-start pt-space-lg lg:pt-0">
<div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded bg-surface-container-high text-secondary mb-space-lg">
<span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.25em]">Edition Limitée 2025 • Genève</span>
</div>
<h1 className="font-display-hero text-display-hero text-on-surface tracking-tight leading-[1.08] mb-space-md">
            Nghệ Thuật Đếm <br/>
<span className="italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary-fixed">Thời Gian Vượt Thời Đại</span>
</h1>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mb-space-2xl leading-relaxed">
            Tuyệt tác cơ khí chế tác thủ công tại Genève, giao thoa giữa độ chính xác chuẩn Chronometer khắt khe và thẩm mỹ vương giả thuần khiết dành riêng cho những nhà sưu tầm kiệt xuất.
          </p>
{/* Dual CTA */}
<div className="flex flex-wrap items-center gap-space-md w-full sm:w-auto mb-space-3xl">
<a className="px-space-xl py-4 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-all shadow-xl shadow-primary/10 flex items-center gap-space-sm group" href="/collections">
<span>Khám Phá Tuyệt Tác Mới</span>
<span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
</a>
<a className="px-space-xl py-4 rounded bg-surface-container-high text-on-surface font-label-spec text-label-spec uppercase tracking-[0.18em] hover:bg-surface-bright transition-all flex items-center gap-space-sm" href="/#private-salon">
<span className="material-symbols-outlined text-[18px] text-primary">calendar_month</span>
<span>Đặt Lịch Private Salon</span>
</a>
</div>
{/* Watch Atelier Metrics */}
<div className="w-full grid grid-cols-3 gap-space-md pt-space-lg bg-surface-container-low/60 rounded-xl p-space-md shadow-sm">
<div className="flex flex-col">
<span className="font-display-hero text-headline-sm text-primary tracking-tight">1892</span>
<span className="font-label-spec text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Năm Di Sản Genève</span>
</div>
<div className="flex flex-col">
<span className="font-display-hero text-headline-sm text-secondary tracking-tight">100%</span>
<span className="font-label-spec text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Calibre In-House</span>
</div>
<div className="flex flex-col">
<span className="font-display-hero text-headline-sm text-on-surface tracking-tight">50 Ex.</span>
<span className="font-label-spec text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Độc Bản / Niên Giám</span>
</div>
</div>
</div>
{/* Right Hero Centerpiece */}
<div className="lg:col-span-5 relative flex justify-center items-center">
<div className="absolute w-[360px] h-[360px] sm:w-[460px] sm:h-[460px] rounded-full bg-gradient-to-tr from-primary/10 to-transparent blur-2xl"></div>
{/* Micro Chrono Dial Graphic Overlay */}
<div className="relative w-full max-w-[480px] aspect-[4/5] rounded-xl overflow-hidden shadow-2xl bg-surface-container">
<img className="w-full h-full object-cover object-center scale-105 hover:scale-100 transition-transform duration-1000" data-alt="Macro high-end photograph of a luxury Swiss skeleton rose gold tourbillon watch with exposed flying balance wheel, sapphire crystal casing, hand-beveled bridges, dark obsidian studio backdrop with subtle amber gold cinematic side rim lighting" src="/images/stitch/02_AB6AXuAiPb.jpg"/>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent opacity-80"></div>
{/* Floating Spec Plate */}
<div className="absolute bottom-space-md left-space-md right-space-md p-space-md rounded bg-surface-container-lowest/85 backdrop-blur-md flex items-center justify-between">
<div>
<span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.2em]">Calibre AC-901</span>
<p className="font-title-editorial text-body-md text-on-surface font-normal">Sovereign Skeleton Flying Tourbillon</p>
</div>
<div className="text-right">
<span className="font-label-spec text-label-spec text-secondary tracking-wider">3 Hz • 21,600 vph</span>
<p className="font-body-sm text-[11px] text-on-surface-variant">72h Power Reserve</p>
</div>
</div>
</div>
</div>
</div>
</div>
</section>
{/* REPUTATION STRIP (COSC & METROLOGY) */}
<section className="w-full bg-surface-container-low py-space-lg">
<div className="max-w-[1360px] mx-auto px-gutter-desktop flex flex-wrap items-center justify-between gap-space-md">
<div className="flex items-center gap-space-sm text-on-surface-variant">
<span className="material-symbols-outlined text-primary text-[22px]">workspace_premium</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-on-surface">Poinçon de Genève</span>
</div>
<div className="flex items-center gap-space-sm text-on-surface-variant">
<span className="material-symbols-outlined text-primary text-[22px]">timer</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-on-surface">COSC Chronometer -4/+6s</span>
</div>
<div className="flex items-center gap-space-sm text-on-surface-variant">
<span className="material-symbols-outlined text-primary text-[22px]">diamond</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-on-surface">18K Rose Gold 5N &amp; Baguette Cut</span>
</div>
<div className="flex items-center gap-space-sm text-on-surface-variant">
<span className="material-symbols-outlined text-primary text-[22px]">history_edu</span>
<span className="font-label-spec text-label-spec uppercase tracking-[0.2em] text-on-surface">Atelier Certificat d'Origine</span>
</div>
</div>
</section>
{/* BRAND FILM — BÊN TRONG XƯỞNG GENÈVE */}
<section id="brand-film" className="relative w-full overflow-hidden bg-surface-container-lowest">
<video className="h-[70vh] min-h-[480px] w-full object-cover" src="/swiss-luxury-watches-and-chronographs/video.mp4" poster="/swiss-luxury-watches-and-chronographs/video-poster.jpg" autoPlay muted loop playsInline></video>
<div className="absolute inset-0 bg-surface-container-lowest/30"></div>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/35 to-surface-container-lowest/70"></div>
<div className="absolute inset-0 flex flex-col items-center justify-center px-gutter-desktop text-center">
<span className="font-label-spec text-label-spec text-secondary uppercase tracking-[0.35em]">Manufacture de Haute Horlogerie</span>
<h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-xs max-w-3xl">Bên Trong Xưởng <span className="italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary-fixed">Genève</span></h2>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mt-space-sm leading-relaxed">
            Nhịp đập của từng calibre được ghi lại ở tốc độ thật — nơi bộ máy tourbillon lấy sinh khí dưới bàn tay nghệ nhân.
          </p>
<a className="mt-space-xl inline-flex items-center gap-space-sm px-space-xl py-4 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-all shadow-xl shadow-primary/10" href="/atelier">
<span>Khám Phá Atelier</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</a>
</div>
</section>
{/* 4 CORE COLLECTIONS */}
<section className="w-full py-space-4xl bg-surface" id="bo-suu-tap">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
{/* Section Header */}
<div className="flex flex-col md:flex-row md:items-end justify-between mb-space-3xl gap-space-md">
<div>
<span className="font-label-spec text-label-spec text-primary uppercase tracking-[0.3em]">Di Sản Cơ Khí Đỉnh Cao</span>
<h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-2xs tracking-tight">4 Dòng Tuyệt Tác Cốt Lõi</h2>
</div>
<p className="font-body-md text-body-md text-on-surface-variant max-w-md">
          Mỗi cỗ máy là hiện thân của hàng trăm giờ vát cạnh viền thủ công anglage, đánh bóng gương đen và hiệu chuẩn chuẩn xác vi cơ học.
        </p>
</div>
{/* Grid 4 Timepieces */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-lg">
{/* CARD 1 */}
<div className="group flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-lg hover:-translate-y-1.5 transition-all duration-300">
<div className="relative aspect-[3/4] overflow-hidden bg-surface-container-high">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Aurel &amp; Co. Grand Complication Tourbillon luxury watch with transparent double sapphire crystal, visible complex escapement gears, deep slate dial, cinematic lighting" src="/images/stitch/03_AB6AXuClCG.jpg"/>
<div className="absolute top-space-sm left-space-sm">
<span className="px-space-xs py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur font-label-badge text-[9px] uppercase tracking-widest text-primary">Masterpiece No. 01</span>
</div>
<button aria-label="Thêm Yêu Thích" className="absolute top-space-sm right-space-sm w-8 h-8 rounded-full bg-surface-container-lowest/70 backdrop-blur text-on-surface hover:text-primary transition-colors flex items-center justify-center">
<span className="material-symbols-outlined text-[16px]">favorite</span>
</button>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between">
<div>
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Double Sapphire • 72H Reserve</span>
<h3 className="font-headline-sm text-title-editorial text-on-surface mt-1 mb-space-xs">Grand Complication Tourbillon</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-md">
                Lồng xoay tourbillon lộ thiên thiên văn siêu phức tạp, triệt tiêu hoàn toàn lực hút trọng trường lên bánh xe cân bằng.
              </p>
</div>
<div>
<div className="flex items-baseline justify-between mb-space-md">
<span className="font-title-editorial text-body-lg text-primary">$185,000</span>
<span className="font-label-spec text-[11px] text-on-surface-variant">~ 4.650.000.000 ₫</span>
</div>
<a className="w-full py-2.5 rounded bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] text-center transition-all block" href="/collections">
                Xem Chi Tiết
              </a>
</div>
</div>
</div>
{/* CARD 2 */}
<div className="group flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-lg hover:-translate-y-1.5 transition-all duration-300">
<div className="relative aspect-[3/4] overflow-hidden bg-surface-container-high">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Celestial Moonphase Obsidian watch with black iridescent meteorite mother of pearl dial, hyper-detailed astronomical golden moon disc, 18K rose gold casing" src="/images/stitch/04_AB6AXuBFmG.jpg"/>
<div className="absolute top-space-sm left-space-sm">
<span className="px-space-xs py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur font-label-badge text-[9px] uppercase tracking-widest text-secondary">Astronomie</span>
</div>
<button aria-label="Thêm Yêu Thích" className="absolute top-space-sm right-space-sm w-8 h-8 rounded-full bg-surface-container-lowest/70 backdrop-blur text-on-surface hover:text-primary transition-colors flex items-center justify-center">
<span className="material-symbols-outlined text-[16px]">favorite</span>
</button>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between">
<div>
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Meteorite Dial • 18K Rose Gold</span>
<h3 className="font-headline-sm text-title-editorial text-on-surface mt-1 mb-space-xs">Celestial Moonphase Obsidian</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-md">
                Mặt số đá thiên thạch xà cừ đen huyền ảo, chu kỳ tuần trăng thiên văn chính xác tuyệt đối sau 122 năm một lần chỉnh.
              </p>
</div>
<div>
<div className="flex items-baseline justify-between mb-space-md">
<span className="font-title-editorial text-body-lg text-primary">$120,000</span>
<span className="font-label-spec text-[11px] text-on-surface-variant">~ 3.020.000.000 ₫</span>
</div>
<a className="w-full py-2.5 rounded bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] text-center transition-all block" href="/collections">
                Xem Chi Tiết
              </a>
</div>
</div>
</div>
{/* CARD 3 */}
<div className="group flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-lg hover:-translate-y-1.5 transition-all duration-300">
<div className="relative aspect-[3/4] overflow-hidden bg-surface-container-high">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Royal Chronograph Flyback watch with black ceramic bezel, high precision chronograph sub-dials, integrated platinum bracelet, luxury horology aesthetic" src="/images/stitch/05_AB6AXuBFXA.jpg"/>
<div className="absolute top-space-sm left-space-sm">
<span className="px-space-xs py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur font-label-badge text-[9px] uppercase tracking-widest text-primary">Haute Sport</span>
</div>
<button aria-label="Thêm Yêu Thích" className="absolute top-space-sm right-space-sm w-8 h-8 rounded-full bg-surface-container-lowest/70 backdrop-blur text-on-surface hover:text-primary transition-colors flex items-center justify-center">
<span className="material-symbols-outlined text-[16px]">favorite</span>
</button>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between">
<div>
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Ceramic Bezel • 1/10s Counter</span>
<h3 className="font-headline-sm text-title-editorial text-on-surface mt-1 mb-space-xs">Royal Chronograph Flyback</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-md">
                Bộ đếm flyback tức thì với bánh xe cột column-wheel mượt mà, vành gốm ceramic chống trầy hoàn hảo trong mọi điều kiện.
              </p>
</div>
<div>
<div className="flex items-baseline justify-between mb-space-md">
<span className="font-title-editorial text-body-lg text-primary">$95,000</span>
<span className="font-label-spec text-[11px] text-on-surface-variant">~ 2.390.000.000 ₫</span>
</div>
<a className="w-full py-2.5 rounded bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] text-center transition-all block" href="/collections">
                Xem Chi Tiết
              </a>
</div>
</div>
</div>
{/* CARD 4 */}
<div className="group flex flex-col bg-surface-container rounded-xl overflow-hidden shadow-lg hover:-translate-y-1.5 transition-all duration-300">
<div className="relative aspect-[3/4] overflow-hidden bg-surface-container-high">
<img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="Atelier Skeleton Pure Gold timepiece showcasing 32 vivid blue sapphire jewels, hand-carved guilloche patterns on rose gold bridges, high luxury Swiss finishing" src="/images/stitch/06_AB6AXuDxn0.jpg"/>
<div className="absolute top-space-sm left-space-sm">
<span className="px-space-xs py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur font-label-badge text-[9px] uppercase tracking-widest text-secondary">Métiers d'Art</span>
</div>
<button aria-label="Thêm Yêu Thích" className="absolute top-space-sm right-space-sm w-8 h-8 rounded-full bg-surface-container-lowest/70 backdrop-blur text-on-surface hover:text-primary transition-colors flex items-center justify-center">
<span className="material-symbols-outlined text-[16px]">favorite</span>
</button>
</div>
<div className="p-space-lg flex flex-col flex-grow justify-between">
<div>
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Hand Guilloché • 32 Jewels</span>
<h3 className="font-headline-sm text-title-editorial text-on-surface mt-1 mb-space-xs">Atelier Skeleton Pure Gold</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-md">
                Bộ khung xương mạ vàng khối chạm trổ vân guilloché tỉ mỉ, đính 32 chân kính hồng ngọc sapphire danh giá.
              </p>
</div>
<div>
<div className="flex items-baseline justify-between mb-space-md">
<span className="font-title-editorial text-body-lg text-primary">$145,000</span>
<span className="font-label-spec text-[11px] text-on-surface-variant">~ 3.650.000.000 ₫</span>
</div>
<a className="w-full py-2.5 rounded bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] text-center transition-all block" href="/collections">
                Xem Chi Tiết
              </a>
</div>
</div>
</div>
</div>
</div>
</section>
{/* THE HOROLOGICAL CRAFTSMANSHIP & ATELIER */}
<section className="w-full py-space-4xl bg-surface-container-lowest relative overflow-hidden">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
{/* Asymmetric Section Head */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center mb-space-3xl">
<div className="lg:col-span-6">
<span className="font-label-spec text-label-spec text-primary uppercase tracking-[0.25em]">Atelier Genève • Savoir-Faire</span>
<h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-2xs">Khối Nghệ Thuật Chế Tác Thủ Công</h2>
</div>
<div className="lg:col-span-6">
<p className="font-body-lg text-body-lg text-on-surface-variant">
            Không có chỗ cho sự thỏa hiệp. Từng bánh răng, ốc vít nung xanh và lò xo cân bằng đều được những nghệ nhân bậc thầy hoàn thiện bằng kính lúp loupe 12x dưới ánh đèn xưởng Genève.
          </p>
</div>
</div>
{/* Visual Macro Feature + 3 Pillar Columns */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-stretch">
{/* Left Macro Showcase Image */}
<div className="lg:col-span-5 relative rounded-xl overflow-hidden shadow-2xl bg-surface-container min-h-[380px]">
<img className="w-full h-full object-cover object-center" data-alt="Extreme macro extreme close-up view of a watch tourbillon cage with mirror-polished steel arms, gold balance screws, oscillating hairspring and rubies, captured in warm dramatic watchmaking atelier lighting" src="/images/stitch/07_AB6AXuBpdu.jpg"/>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-surface-container-lowest/30 to-transparent"></div>
<div className="absolute bottom-space-lg left-space-lg right-space-lg">
<div className="flex items-center gap-space-xs text-primary mb-1">
<span className="material-symbols-outlined text-[20px]">precision_manufacturing</span>
<span className="font-label-badge text-label-badge uppercase tracking-widest">Thao Tác Vi Cơ Học</span>
</div>
<p className="font-title-editorial text-body-lg text-on-surface">380+ Chi Tiết Lắp Ráp Thủ Công</p>
<p className="font-body-sm text-[12px] text-on-surface-variant/80 mt-1">Chu kỳ gia công hoàn thiện trung bình 340 giờ cho mỗi bộ chuyển động độc lập.</p>
</div>
</div>
{/* Right 3 Pillars Bento */}
<div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-space-md">
{/* Pillar 1 */}
<div className="p-space-lg rounded-xl bg-surface-container flex flex-col justify-between hover:bg-surface-container-high transition-colors">
<div>
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary mb-space-lg">
<span className="material-symbols-outlined text-[24px]">token</span>
</div>
<h4 className="font-title-editorial text-title-editorial text-on-surface mb-space-xs">Vật Liệu Quý Hiếm</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Đúc riêng hợp kim Vàng Hồng 5N không phai, khung Titanium Grade 5 chống va chạm cực độ và kim cương baguette đạt chuẩn nước D-F VVS1.
              </p>
</div>
<div className="pt-space-md mt-space-md bg-surface-container-low/30 rounded p-space-xs">
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Tiêu Chuẩn: Metallurgie Suisse</span>
</div>
</div>
{/* Pillar 2 */}
<div className="p-space-lg rounded-xl bg-surface-container flex flex-col justify-between hover:bg-surface-container-high transition-colors">
<div>
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary mb-space-lg">
<span className="material-symbols-outlined text-[24px]">tune</span>
</div>
<h4 className="font-title-editorial text-title-editorial text-on-surface mb-space-xs">Bộ Máy Cơ In-House</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Tự chủ 100% thiết kế từ bánh răng dẫn động đến cơ chế hồi tự do. Hơn 380 chi tiết được vát mép, đánh bóng viền hoàn toàn bằng tay.
              </p>
</div>
<div className="pt-space-md mt-space-md bg-surface-container-low/30 rounded p-space-xs">
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Độ Sai Lệch: ±1s / Ngày</span>
</div>
</div>
{/* Pillar 3 */}
<div className="p-space-lg rounded-xl bg-surface-container flex flex-col justify-between hover:bg-surface-container-high transition-colors">
<div>
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary mb-space-lg">
<span className="material-symbols-outlined text-[24px]">verified</span>
</div>
<h4 className="font-title-editorial text-title-editorial text-on-surface mb-space-xs">COSC &amp; Geneva Seal</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Thử nghiệm 16 ngày đêm liên tục trong 5 tư thế không gian và 3 mức nhiệt độ khắc nghiệt trước khi khắc dấu kiểm định uy quyền.
              </p>
</div>
<div className="pt-space-md mt-space-md bg-surface-container-low/30 rounded p-space-xs">
<span className="font-label-spec text-[10px] text-secondary uppercase tracking-widest">Chứng Thư Xác Nhận COSC</span>
</div>
</div>
</div>
</div>
</div>
</section>
{/* 4 CORE COLLECTIONS */}
<section className="w-full py-space-4xl bg-surface">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="text-center max-w-2xl mx-auto mb-space-3xl">
<span className="font-label-spec text-label-spec text-secondary uppercase tracking-[0.25em]">Dành Riêng Cho Circle Privé</span>
<h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-2xs">Đặc Quyền Khách Hàng VIP</h2>
<p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
          Sở hữu một tạo tác Aurel &amp; Co. đồng nghĩa với việc bước vào hệ sinh thái phục vụ thượng lưu cá nhân hóa chuẩn Thụy Sĩ.
        </p>
</div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-space-xl">
{/* Privilege 1 */}
<div className="p-space-xl rounded-xl bg-surface-container-low flex flex-col items-start relative overflow-hidden group">
<div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary mb-space-lg group-hover:scale-110 transition-transform">
<span className="material-symbols-outlined text-[26px]">local_shipping</span>
</div>
<h3 className="font-title-editorial text-title-editorial text-on-surface mb-space-xs">Chuyên Xa Bọc Thép Tận Tư Gia</h3>
<p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Hộ tống an ninh cấp cao bằng xe bọc thép chuyên dụng, trao tận tay quý khách cùng vali nhôm hàng không có khóa sinh trắc học.
          </p>
<div className="mt-space-lg flex items-center gap-space-xs text-primary font-label-spec text-[11px] uppercase tracking-wider">
<span>Bảo Hiểm Toàn Diện 100% Giá Trị</span>
<span className="material-symbols-outlined text-[14px]">shield</span>
</div>
</div>
{/* Privilege 2 */}
<div className="p-space-xl rounded-xl bg-surface-container-low flex flex-col items-start relative overflow-hidden group">
<div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary mb-space-lg group-hover:scale-110 transition-transform">
<span className="material-symbols-outlined text-[26px]">all_inclusive</span>
</div>
<h3 className="font-title-editorial text-title-editorial text-on-surface mb-space-xs">Bảo Hành Toàn Cầu Trọn Đời</h3>
<p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Bảo dưỡng định kỳ không tính phí tại bất kỳ Salon nào trên toàn cầu. Thay dầu bôi trơn chuyên dụng và đánh bóng hoàn nguyên mỗi 3 năm.
          </p>
<div className="mt-space-lg flex items-center gap-space-xs text-secondary font-label-spec text-[11px] uppercase tracking-wider">
<span>Dữ Liệu Sổ Cái Provenance Độc Bản</span>
<span className="material-symbols-outlined text-[14px]">task_alt</span>
</div>
</div>
{/* Privilege 3 */}
<div className="p-space-xl rounded-xl bg-surface-container-low flex flex-col items-start relative overflow-hidden group">
<div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary mb-space-lg group-hover:scale-110 transition-transform">
<span className="material-symbols-outlined text-[26px]">support_agent</span>
</div>
<h3 className="font-title-editorial text-title-editorial text-on-surface mb-space-xs">Horology Concierge Phục Vụ 24/7</h3>
<p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Mỗi khách hàng được chỉ định một chuyên gia đồng hồ riêng biệt để hỗ trợ tư vấn nâng cấp bộ sưu tập, đấu giá và dịch vụ hậu mãi.
          </p>
<div className="mt-space-lg flex items-center gap-space-xs text-primary font-label-spec text-[11px] uppercase tracking-wider">
<span>Đường Dây Nóng Kín Riêng Biệt</span>
<span className="material-symbols-outlined text-[14px]">lock</span>
</div>
</div>
</div>
</div>
</section>
{/* PRIVATE LOUNGE INVITATION & VIP RESERVATION FORM */}
<section className="w-full py-space-4xl bg-surface-container-lowest relative" id="private-salon">
<div className="max-w-[1360px] mx-auto px-gutter-desktop">
<div className="bg-surface-container rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-12">
{/* Salon Atmosphere Image & Intro */}
<div className="lg:col-span-5 relative p-space-2xl flex flex-col justify-between min-h-[460px]">
<div className="absolute inset-0 bg-cover bg-center" data-alt="Exclusive luxury VIP private lounge salon with dark walnut wood panels, plush velvet armchairs, crystal champagne flutes, soft warm atmospheric lighting, high-end Swiss horology boutique atmosphere" style={{ backgroundImage: "url('/images/stitch/08_AB6AXuDI5O.jpg')" }}></div>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/70 to-surface-container-lowest/30"></div>
<div className="relative z-10">
<div className="inline-flex items-center gap-space-xs px-2.5 py-1 rounded bg-surface-container-high text-primary mb-space-md">
<span className="material-symbols-outlined text-[14px]">lock</span>
<span className="font-label-badge text-label-badge uppercase tracking-[0.2em]">Khách Mời Riêng</span>
</div>
<h3 className="font-headline-md text-headline-md text-on-surface mb-space-xs">Private Salon &amp; VIP Experience</h3>
<p className="font-body-md text-body-md text-on-surface-variant">
              Không gian tiếp đón biệt lập với trà chiều thượng hạng và champagne Pháp. Trải nghiệm trực tiếp những kiệt tác trước khi quyết định sưu tầm.
            </p>
</div>
<div className="relative z-10 pt-space-lg flex flex-col gap-space-xs">
<div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
<span className="material-symbols-outlined text-primary text-[18px]">location_on</span>
<span>Villa Aurel, Rue du Rhône, Genève • Salon Saigon, District 1</span>
</div>
<div className="flex items-center gap-space-xs text-on-surface-variant font-body-sm text-[12px]">
<span className="material-symbols-outlined text-secondary text-[18px]">schedule</span>
<span>Giờ Phục Vụ: Theo Lịch Đặt Riêng Của Thượng Khách</span>
</div>
</div>
</div>
{/* Appointment Registration Form */}
<div className="lg:col-span-7 p-space-2xl bg-surface-container flex flex-col justify-center">
<div className="mb-space-lg">
<span className="font-label-spec text-label-spec text-secondary uppercase tracking-[0.2em]">Đăng Ký Trải Nghiệm</span>
<h4 className="font-headline-sm text-headline-sm text-on-surface mt-1">Thỉnh Cầu Lịch Hẹn Riêng Tư</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Concierge của chúng tôi sẽ liên hệ trong vòng 2 giờ làm việc để xác nhận khung giờ bảo mật.</p>
</div>
<form className="space-y-space-md" >
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-2xs">Danh Xưng &amp; Họ Tên *</label>
<input className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:bg-surface-bright transition-colors" placeholder="Ngài / Bà..." required type="text"/>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-2xs">Số Điện Thoại Bảo Mật *</label>
<input className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:bg-surface-bright transition-colors" placeholder="+84 ..." required type="tel"/>
</div>
</div>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-2xs">Địa Điểm Trải Nghiệm</label>
<select className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface focus:outline-none focus:bg-surface-bright transition-colors">
<option>Private Salon Saigon (Quận 1)</option>
<option>Private Salon Hanoi (Hoàn Kiếm)</option>
<option>Atelier Genève (Thụy Sĩ)</option>
<option>Phục Vụ Tận Biệt Thự / Tư Gia</option>
</select>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-2xs">Tác Phẩm Quan Tâm</label>
<select className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface focus:outline-none focus:bg-surface-bright transition-colors">
<option>Grand Complication Tourbillon</option>
<option>Celestial Moonphase Obsidian</option>
<option>Royal Chronograph Flyback</option>
<option>Atelier Skeleton Pure Gold</option>
<option>Bespoke Métiers d'Art Độc Bản</option>
</select>
</div>
</div>
<div>
<label className="block font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-2xs">Ghi Chú Đặc Biệt (Rượu champagne, sở thích ẩm thực hoặc bảo mật)</label>
<textarea className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:bg-surface-bright transition-colors resize-none" placeholder="Gợi ý thêm yêu cầu đón tiếp..." rows={2}></textarea>
</div>
<div className="flex items-center gap-space-xs text-on-surface-variant pt-1">
<input className="w-4 h-4 rounded bg-surface-container-high accent-primary" id="privacy-check" required type="checkbox"/>
<label className="font-body-sm text-[12px]" htmlFor="privacy-check">Tôi đồng ý với chính sách bảo mật tư gia &amp; quy chế danh sách khách mời Circle Privé.</label>
</div>
<button className="w-full py-4 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-colors shadow-lg flex items-center justify-center gap-space-sm" type="submit">
<span className="material-symbols-outlined text-[18px]">verified_user</span>
<span>Xác Nhận Đặt Lịch Tiếp Đón</span>
</button>
</form>
</div>
</div>
</div>
</section>
</div>
  </div>
  );
}
