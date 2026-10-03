export type Collection =
  | "tourbillon"
  | "grand-complication"
  | "skeleton"
  | "sport"
  | "classic"
  | "accessory";

export type { StrapOption } from "./straps";

export type Product = {
  slug: string;
  name: string;
  reference: string;
  collection: Collection;
  priceUsd: number;
  priceVnd: number;
  shortDescription: string;
  badges: string[];
  strapLabel: string;
  cardImage: string;
  calibre: string;
  diameterMm: number;
  caseMaterial: string;
  complications: string[];
  inBoutique: boolean;
  stock: number;
  images: string[];
  specs: { label: string; value: string }[];
  narrative: string;
  /** "PRE_OWNED" = hàng hiệu cũ đã kiểm định CPO; thiếu = hàng mới. */
  condition?: "NEW" | "PRE_OWNED";
  certifiedBy?: string;
  /** ISO date — ngày atelier kiểm định xong. */
  certifiedAt?: string;
  serviceHistory?: { date: string; label: string; detail?: string }[];
  /** Chỉ set cả cặp — JSON-LD AggregateRating + card rating. */
  ratingValue?: number;
  ratingCount?: number;
};

export const products: Product[] = [
  {
    slug: "chronos-tourbillon-no-07",
    name: "Chronos Tourbillon N°07",
    reference: "AUR-CT07-PL",
    collection: "tourbillon",
    priceUsd: 145000,
    priceVnd: 3654000000,
    shortDescription:
      "Bộ máy Tourbillon bay siêu mỏng, lộ cơ hoàn toàn được vát mép cạnh thủ công Anglage 45 độ bằng gỗ tần bì.",
    badges: ["FLYING TOURBILLON", "ANGLAGE 45°"],
    strapLabel: "Platinum 950 • 40mm",
    calibre: "Cal. Aurel CT-07",
    diameterMm: 40,
    caseMaterial: "Platinum 950",
    complications: ["Tourbillon", "Chronomètre"],
    inBoutique: true,
    stock: 1,
    cardImage: "/images/stitch/35_AB6AXuDCew.jpg",
    images: [
      "/images/stitch/02_AB6AXuAiPb.jpg",
      "/images/high-precision-close-up-of-aurel-chronos-watch-bezel-crafted.jpg",
      "/images/macro-view-of-watch-exhibition-sapphire-caseback-revealing-h.jpg",
      "/images/editorial-lifestyle-shot-of-aurel-chronos-tourbillon-watch-w.jpg",
    ],
    specs: [
      { label: "Bộ máy", value: "Cal. Aurel CT-07 — Tourbillon bay siêu mỏng, 72 giờ trữ cót, 28,800 vph" },
      { label: "Vỏ", value: "Platinum 950 • 40mm • Kính Sapphire cong hai mặt chống phản chiếu" },
      { label: "Mặt số", value: "Obsidian chải tia tay, chỉ số vàng 18k gắn thủ công" },
      { label: "Métiers d'Art", value: "Anglage 45 độ bằng gỗ tần bì trên toàn bộ cầu máy" },
    ],
    narrative:
      "Mỗi chiếc Chronos Tourbillon N°07 cần 14 tháng chế tác bởi một bậc thầy duy nhất, từ khối Platinum thô đến bộ tourbillon bay nặng chưa tới 0.3 gram. Số hiệu N°07 giới hạn 25 chiếc trên toàn cầu.",
  },
  {
    slug: "celestial-perpetual-moonphase",
    name: "Celestial Perpetual Moonphase",
    reference: "AUR-CPM-TI",
    collection: "grand-complication",
    priceUsd: 98000,
    priceVnd: 2469600000,
    shortDescription:
      "Mặt đá thiên thạch Muonionalusta tự nhiên, lịch vạn niên thiên văn chính xác tuyệt đối không cần chỉnh sửa tới năm 2100.",
    badges: ["METEORITE DIAL", "PERPETUAL CALENDAR"],
    strapLabel: "Titanium & Vàng • 40mm",
    calibre: "Cal. Celestial QP",
    diameterMm: 40,
    caseMaterial: "Titanium & Vàng 18k",
    complications: ["Perpetual Calendar", "Moonphase"],
    inBoutique: true,
    stock: 1,
    cardImage: "/images/stitch/36_AB6AXuBdGc.jpg",
    images: [
      "/images/stitch/04_AB6AXuBFmG.jpg",
      "/images/celestial-moonphase-obsidian-watch-with-black-iridescent-met.jpg",
      "/images/macro-view-of-watch-exhibition-sapphire-caseback-revealing-h.jpg",
    ],
    specs: [
      { label: "Bộ máy", value: "Cal. Celestial QP — Lịch vạn niên thiên văn, chính xác tới năm 2100" },
      { label: "Vỏ", value: "Titanium Grade 5 gắn vàng 18k • 40mm • Lưng kính Sapphire" },
      { label: "Mặt số", value: "Đá thiên thạch Muonionalusta tự nhiên, giác cắt acid thủ công" },
      { label: "Métiers d'Art", value: "Mặt trăng trám vàng trên nền trời sao khắc laser" },
    ],
    narrative:
      "Tấm đá thiên thạch Muonionalusta rơi xuống Bắc Âu gần một triệu năm trước, được tuyển chọn và giác cắt để lộ hiệu ứng Widmanstätten độc nhất — không hai mặt số nào giống nhau.",
  },
  {
    slug: "sovereign-skeleton-1888",
    name: "Sovereign Skeleton 1888",
    reference: "AUR-SS88-RG",
    collection: "skeleton",
    priceUsd: 82000,
    priceVnd: 2066400000,
    shortDescription:
      "Mặt số Sapphire nguyên khối trong suốt cho phép chiêm ngưỡng trọn vẹn nhịp đập 28,800 vph và 38 chân kính ruby nhân tạo.",
    badges: ["SAPPHIRE DIAL", "HISTORIC REVIVAL"],
    strapLabel: "Titanium & Vàng • 39mm",
    calibre: "Calibre 1888",
    diameterMm: 39,
    caseMaterial: "Titanium & Vàng hồng 18k",
    complications: ["Skeleton", "Small Seconds"],
    inBoutique: true,
    stock: 1,
    cardImage: "/images/stitch/37_AB6AXuCVZv.jpg",
    images: [
      "/images/stitch/06_AB6AXuDxn0.jpg",
      "/images/atelier-skeleton-pure-gold-timepiece-showcasing-32-vivid-blu.jpg",
      "/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg",
    ],
    specs: [
      { label: "Bộ máy", value: "Calibre 1888 — Skeleton thủ công, 38 ruby, vít xanh lửa" },
      { label: "Vỏ", value: "Titanium gắn vàng hồng 18k • 39mm • Mặt kính sapphire nguyên khối" },
      { label: "Mặt số", value: "Sapphire trong suốt, cầu máy chải satin và vát cạnh Anglage" },
      { label: "Métiers d'Art", value: "Khắc tay họa tiết cổ điển Genève 1892 trên cầu máy" },
    ],
    narrative:
      "Hồi sinh trực tiếp từ bản vẽ gốc năm 1888 của nhà sáng lập Henri Aurel — bộ máy skeleton đầu tiên của hãng, chế tác lại theo đúng kỹ thuật thế kỷ 19.",
  },
  {
    slug: "vanguard-chronograph-flyback-carbon",
    name: "Vanguard Chronograph Flyback Carbon",
    reference: "AUR-VCF-FC",
    collection: "sport",
    priceUsd: 46000,
    priceVnd: 1159200000,
    shortDescription:
      "Viền Bezel gốm Ceramic đen bóng chống trầy xước vĩnh viễn, bấm giờ flyback bánh sắc trên nền vỏ Forged Carbon độc bản.",
    badges: ["FORGED CARBON", "FLYBACK COLUMN WHEEL"],
    strapLabel: "Carbon & Ceramic • 42.5mm",
    calibre: "Calibre VG-Fly",
    diameterMm: 42.5,
    caseMaterial: "Forged Carbon & Ceramic",
    complications: ["Chronograph Flyback", "Date"],
    inBoutique: false,
    stock: 1,
    cardImage: "/images/stitch/38_AB6AXuDx9q.jpg",
    images: [
      "/images/stitch/05_AB6AXuBFXA.jpg",
      "/images/royal-chronograph-flyback-watch-with-black-ceramic-bezel-hig.jpg",
      "/images/macro-view-of-watch-exhibition-sapphire-caseback-revealing-h.jpg",
    ],
    specs: [
      { label: "Bộ máy", value: "Calibre VG-Fly — Chronograph flyback bánh sắc, 65 giờ trữ cót" },
      { label: "Vỏ", value: "Forged Carbon độc bản • 42.5mm • Bezel ceramic đen bóng" },
      { label: "Mặt số", value: "Nền carbon thấy rõ vân dệt, kim bán nguyệt trám vàng" },
      { label: "Métiers d'Art", value: "Mỗi vỏ Forged Carbon có vân dệt độc nhất vô nhị" },
    ],
    narrative:
      "Vanguard là tuyên ngôn thể thao của Aurel & Co.: nhẹ, cứng và không tưởng. Vân carbon của mỗi chiếc là một dấu vân tay không thể sao chép.",
  },
  {
    slug: "elegance-classic-rose-gold-40mm",
    name: "Elegance Classic Rose Gold 40mm",
    reference: "AUR-EC40-RG",
    collection: "classic",
    priceUsd: 34000,
    priceVnd: 856800000,
    shortDescription:
      "Cọc số kim cương tự nhiên giác cắt Baguette, mặt số chải tia Sunburst và dây da cá sấu Mississippi tuyển chọn thủ công.",
    badges: ["BAGUETTE DIAMONDS", "ALLIGATOR MISSISSIPPI"],
    strapLabel: "Vàng hồng 18k • 40mm",
    calibre: "Cal. Élégance 40",
    diameterMm: 40,
    caseMaterial: "Vàng hồng 18k",
    complications: ["Date"],
    inBoutique: true,
    stock: 1,
    cardImage: "/images/stitch/39_AB6AXuA2EF.jpg",
    images: [
      "/images/stitch/31_AB6AXuCawX.jpg",
      "/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg",
      "/images/artisanal-detail-of-deep-black-mississippi-alligator-leather.jpg",
    ],
    specs: [
      { label: "Bộ máy", value: "Cal. Élégance 40 — Tự động siêu mỏng 3.6mm, 70 giờ trữ cót" },
      { label: "Vỏ", value: "Vàng hồng 18k • 40mm • Kính sapphire chống phản chiếu" },
      { label: "Mặt số", value: "Opaline cream chải tia Sunburst, 8 cọc kim cương Baguette" },
      { label: "Métiers d'Art", value: "Dây da cá sấu Mississippi tuyển tay, khâu xếp lớp thủ công" },
    ],
    narrative:
      "Kiệt tác dress watch thuần túy: 8 viên kim cương Baguette giác cắt tiêu hao tới 60% đá gốc, chỉ để giữ lại phần lõi sáng nhất.",
  },
  {
    slug: "aquanaut-deep-sea-diver-500m",
    name: "Aquanaut Deep Sea Diver 500M",
    reference: "AUR-AD500-TI",
    collection: "sport",
    priceUsd: 28500,
    priceVnd: 718200000,
    shortDescription:
      "Kháng nước 500m với van thoát khí Heli tự động, trọng lượng siêu nhẹ từ hợp kim Titanium hàng không vũ trụ.",
    badges: ["500M DIVER", "GRADE 5 TITANIUM"],
    strapLabel: "Titanium Gr.5 • 42mm",
    calibre: "Cal. Ocean 500",
    diameterMm: 42,
    caseMaterial: "Titanium Grade 5",
    complications: ["Diver 500M", "Helium Valve"],
    inBoutique: true,
    stock: 1,
    cardImage: "/images/stitch/40_AB6AXuBZGd.jpg",
    images: [
      "/images/stitch/26_AB6AXuB7UM.jpg",
      "/images/royal-chronograph-flyback-watch-with-black-ceramic-bezel-hig.jpg",
      "/images/macro-view-of-watch-exhibition-sapphire-caseback-revealing-h.jpg",
    ],
    specs: [
      { label: "Bộ máy", value: "Cal. Ocean 500 — Chống từ 15,000 gauss, 60 giờ trữ cót" },
      { label: "Vỏ", value: "Titanium Grade 5 • 42mm • Bezel xoay ceramic, kháng nước 500m" },
      { label: "Mặt số", value: "Kim và chỉ số phủ Super-LumiNova X1 sáng xanh ban đêm" },
      { label: "Métiers d'Art", value: "Van thoát khí Heli tự động tích hợp vào thân vỏ" },
    ],
    narrative:
      "Được thử nghiệm cùng đoàn thợ lặn chuyên nghiệp ở Biển Đỏ — Aquanaut là chiếc đồng hồ Aurel duy nhất sinh ra để chạm giới hạn 50 atm.",
  },
  {
    slug: "travel-roll-calfskin-18k",
    name: "Bộ Túi Cuộn Du Lịch Da Bê Ép Vân Cùng Khóa 18K",
    reference: "AC-ACC-TRAVEL-01",
    collection: "accessory",
    priceUsd: 1900,
    priceVnd: 1900 * 25200,
    shortDescription:
      "Bao gồm dụng cụ thay dây vi cơ học và ngăn chứa 02 bộ dây da sơ cua bọc nhung Alcantara chống từ tính.",
    badges: ["TRAVEL ACCESSORY"],
    strapLabel: "Da bê ép vân • Khóa 18K",
    calibre: "—",
    diameterMm: 0,
    caseMaterial: "Da bê ép vân navy",
    complications: [],
    inBoutique: true,
    stock: 1,
    cardImage: "/images/stitch/34_AB6AXuDJte.jpg",
    images: ["/images/stitch/34_AB6AXuDJte.jpg"],
    specs: [],
    narrative:
      "Ngăn chứa 02 bộ dây sơ cua bọc nhung Alcantara chống từ tính, dụng cụ thay dây vi cơ học và khóa 18K đồng điệu.",
  },
  // ---- Certified Pre-Owned (dòng "mồi" heritage — người mua lần đầu tin
  // brand lớn; research 2026: resale +4–6%/năm, nhanh nhất ngành) ----
  {
    slug: "omega-speedmaster-11064-cpo",
    name: "Omega Speedmaster Professional 11064-1",
    reference: "CPO-OMS-11064",
    collection: "sport",
    priceUsd: 6800,
    priceVnd: 171360000,
    shortDescription:
      "Truyền nhân của 'Moonwatch' — máy lên cót 863, mặtstep dial đen tuyền. Kiểm định CPO 124 điểm, còn hộp certificate gốc.",
    badges: ["CERTIFIED PRE-OWNED"],
    strapLabel: "Alligator đen • 42mm",
    calibre: "Cal. Lemania 863 (manual)",
    diameterMm: 42,
    caseMaterial: "Stainless steel",
    complications: ["Chronograph", "Tachymeter"],
    inBoutique: true,
    stock: 1,
    cardImage:
      "/images/high-tech-luxury-chronograph-watch-crafted-from-black-forged.jpg",
    images: [
      "/images/high-tech-luxury-chronograph-watch-crafted-from-black-forged.jpg",
    ],
    specs: [
      { label: "Tình trạng", value: "Very good — patina đều, kim nguyên bản" },
      { label: "Năm sản xuất", value: "1992" },
      { label: "Kiểm định", value: "Aurel Atelier CPO 124 điểm + test biên độ 275°" },
    ],
    narrative:
      "Chiếc 'Speedy' thế hệ 11064 là cây cầu giữa di sản Apollo và sưu tập hiện đại. Hàng consign chính chủ, đã được atelier tháo máy kiểm tra toàn bộ.",
    condition: "PRE_OWNED",
    certifiedBy: "Aurel & Co. Atelier — Certified Pre-Owned",
    certifiedAt: "2026-08-14",
    serviceHistory: [
      { date: "2025-11", label: "Full service", detail: "Thay dầu, hiệu chỉnh biên độ" },
      { date: "2026-08", label: "Kiểm định CPO", detail: "124 điểm, test chống nước, thay seal" },
    ],
    ratingValue: 4.8,
    ratingCount: 34,
  },
  {
    slug: "cartier-tank-must-1988-cpo",
    name: "Cartier Tank Must de Cartier",
    reference: "CPO-CTM-1988",
    collection: "classic",
    priceUsd: 4200,
    priceVnd: 105840000,
    shortDescription:
      "Biểu tượng dress-watch dáng chữ H — máy quartz cao cấp đời đầu, vỏ steel 27mm thanh mảnh hợp cổ tay nhỏ.",
    badges: ["CERTIFIED PRE-OWNED"],
    strapLabel: "Da bê đen • 27mm",
    calibre: "Cal. 185 quartz haute précision",
    diameterMm: 27,
    caseMaterial: "Stainless steel",
    complications: ["Small Seconds"],
    inBoutique: true,
    stock: 1,
    cardImage:
      "/images/classic-dress-watch-with-18k-rose-gold-case-opaline-cream-su.jpg",
    images: [
      "/images/classic-dress-watch-with-18k-rose-gold-case-opaline-cream-su.jpg",
    ],
    specs: [
      { label: "Tình trạng", value: "Excellent — chưa đánh bóng, số nguyên bản" },
      { label: "Năm sản xuất", value: "1988" },
      { label: "Kiểm định", value: "Aurel Atelier CPO + thay pin Sabatier" },
    ],
    narrative:
      "Tank là 'chiếc đồng hồ đầu tiên' kinh điển cho cả nam lẫn nữ — vừa hộp, vừa giấy, giá vào dễ nhất bộ sưu tập CPO.",
    condition: "PRE_OWNED",
    certifiedBy: "Aurel & Co. Atelier — Certified Pre-Owned",
    certifiedAt: "2026-09-02",
    serviceHistory: [
      { date: "2026-09", label: "Kiểm định CPO", detail: "Test mạch, thay pin, vệ sinh vỏ" },
    ],
    ratingValue: 4.7,
    ratingCount: 21,
  },
  {
    slug: "seiko-presage-cocktail-cpo",
    name: "Seiko Presage 'Cocktail Time' Sharp Edge",
    reference: "CPO-SPS-SRPE",
    collection: "classic",
    priceUsd: 950,
    priceVnd: 23940000,
    shortDescription:
      "Entry-point mechanical đáng tin nhất thị trường — máy 6R51 72h, mặt hoạ tiết lấy cảm hứng whisky, case Sharp Edge 38.8mm.",
    badges: ["CERTIFIED PRE-OWNED"],
    strapLabel: "Da nâu • 38.8mm",
    calibre: "Cal. 6R51 automatic",
    diameterMm: 38.8,
    caseMaterial: "Stainless steel",
    complications: ["Power Reserve Indicator", "Date"],
    inBoutique: true,
    stock: 2,
    cardImage: "/images/brushed-titanium-luxury-dive-watch-with-rotating-ceramic-bez.jpg",
    images: [
      "/images/brushed-titanium-luxury-dive-watch-with-rotating-ceramic-bez.jpg",
    ],
    specs: [
      { label: "Tình trạng", value: "Like-new — mua 2024, đeo <6 tháng" },
      { label: "Năm sản xuất", value: "2024" },
      { label: "Kiểm định", value: "Aurel Atelier CPO 124 điểm + timing 4 tư thế" },
    ],
    narrative:
      "Cửa ngõ vào thế giới mechanical: giá 'tập gõ', kiểm định như hàng hiệu — hành trình nâng cấp lên Grand Complication bắt đầu từ đây.",
    condition: "PRE_OWNED",
    certifiedBy: "Aurel & Co. Atelier — Certified Pre-Owned",
    certifiedAt: "2026-09-10",
    serviceHistory: [
      { date: "2026-09", label: "Kiểm định CPO", detail: "Timing 4 tư thế ±4s/ngày" },
    ],
    ratingValue: 4.6,
    ratingCount: 58,
  },
  {
    slug: "aurel-heritage-chronometre-1974-cpo",
    name: "Aurel Heritage Chronomètre 1974",
    reference: "CPO-AUC-1974",
    collection: "classic",
    priceUsd: 9800,
    priceVnd: 246960000,
    shortDescription:
      "Di sản nhà Aurel — máy 17 chân kính đạt chuẩn observatory, vỏ vàng hồng 18k 36mm, số hiệu khắc tay mặt sau.",
    badges: ["CERTIFIED PRE-OWNED", "ARCHIVE"],
    strapLabel: "Vàng hồng 18k • 36mm",
    calibre: "Cal. Aurel 17J observatory",
    diameterMm: 36,
    caseMaterial: "18k rose gold",
    complications: ["Chronomètre", "Small Seconds"],
    inBoutique: true,
    stock: 1,
    cardImage:
      "/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg",
    images: [
      "/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg",
    ],
    specs: [
      { label: "Tình trạng", value: "Collector grade — nguyên bản 92%" },
      { label: "Năm sản xuất", value: "1974" },
      { label: "Kiểm định", value: "Atelier phục hồi 2025, chứng thư biên độ + hồ sơ lưu trữ Genève" },
    ],
    narrative:
      "Một chương lịch sử manufacture có thể đeo được. Archive house cấp chứng thư xuất xưởng gốc kèm lịch sử phục hồi đầy đủ.",
    condition: "PRE_OWNED",
    certifiedBy: "Aurel & Co. Atelier — Certified Pre-Owned",
    certifiedAt: "2025-12-20",
    serviceHistory: [
      { date: "1974", label: "Xuất xưởng Genève" },
      { date: "2025", label: "Phục hồi atelier", detail: "Re-lume, cân cót mới, đánh bóng bảo tồn" },
      { date: "2025-12", label: "Kiểm định CPO" },
    ],
    ratingValue: 4.9,
    ratingCount: 12,
  },
];

export const productBySlug = (slug: string) =>
  products.find((p) => p.slug === slug);

export const collectionLabels: Record<Collection, string> = {
  tourbillon: "Tourbillon",
  "grand-complication": "Grand Complication",
  skeleton: "Skeleton",
  sport: "Thể thao",
  classic: "Cổ điển",
  accessory: "Phụ Kiện",
};

export { strapOptions } from "./straps";
export { formatUsd, formatVnd } from "./format";
