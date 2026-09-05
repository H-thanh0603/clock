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
