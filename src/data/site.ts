import { USD_TO_VND } from "@/lib/pricing";

export const site = {
  brand: "Aurel & Co.",
  tagline: "Haute Horlogerie",
  founded: "Genève 1892",
  utilityBar: "Manufacture de Haute Horlogerie • Genève",
  usdToVnd: USD_TO_VND,
};

export const navLinks = [
  { href: "/", label: "Trang Chủ" },
  { href: "/collections", label: "Bộ Sưu Tập" },
  { href: "/bespoke", label: "Bộ Sưu Tập Cá Nhân" },
  { href: "/atelier", label: "Atelier & Di Sản" },
];

export const metrics = [
  { value: "1892", label: "Năm thành lập tại Genève" },
  { value: "100%", label: "Bộ máy chế tác trong nhà" },
  { value: "50", label: "Kiệt tác mỗi năm" },
];

export const reputationStrip = [
  {
    icon: "verified",
    title: "Poinçon de Genève",
    desc: "Con dấu Genève — tiêu chuẩn chế tác khắt khe nhất Thụy Sĩ",
  },
  {
    icon: "workspace_premium",
    title: "Chronomètre COSC",
    desc: "Mỗi bộ máy đều vượt qua chứng nhận chính xác COSC 15 ngày",
  },
  {
    icon: "diamond",
    title: "Poinçon de Genève & Besançon",
    desc: "Chứng nhận kép hiếm có trong ngành đồng hồ cao cấp",
  },
  {
    icon: "history_edu",
    title: "Atelier Certificate",
    desc: "Giấy chứng nhận chế tác thủ công ký bởi bậc thầy đương thời",
  },
];

export const collections = [
  {
    id: "tourbillon",
    name: "Tourbillon",
    subtitle: "Nghệ thuật cân bằng trọng lực",
    image: "/images/exquisite-macro-studio-shot-of-aurel-chronos-tourbillon-luxu.jpg",
  },
  {
    id: "grand-complication",
    name: "Grand Complication",
    subtitle: "Đỉnh cao cơ khí thu nhỏ",
    image: "/images/celestial-moonphase-obsidian-watch-with-black-iridescent-met.jpg",
  },
  {
    id: "skeleton",
    name: "Skeleton",
    subtitle: "Lộ cơ trong suốt tuyệt đối",
    image: "/images/atelier-skeleton-pure-gold-timepiece-showcasing-32-vivid-blu.jpg",
  },
  {
    id: "sport",
    name: "Thể thao",
    subtitle: "Hiệu năng vượt giới hạn",
    image: "/images/brushed-titanium-luxury-dive-watch-with-rotating-ceramic-bez.jpg",
  },
];

export const craftsmanshipPillars = [
  {
    icon: "architecture",
    title: "Guilloché thủ công",
    desc: "Họa tiết khắc trên máy pressing thế kỷ 19, mỗi đường nét cần hơi thở đều tay của nghệ nhân.",
  },
  {
    icon: "diamond",
    title: "Anglage & Poli Noir",
    desc: "Vát cạnh gương phản chiếu 45 độ, đánh bóng đen hoàn toàn bằng tay trên gỗ tần bì.",
  },
  {
    icon: "tune",
    title: "Cân chỉnh Tourbillon",
    desc: "Bộ lồng tourbillon nhẹ hơn 0.3 gram, cân chỉnh trong phòng khí hậu chuẩn Genève.",
  },
];

export const heritageTimeline = [
  {
    year: "1892",
    title: "Henri Aurel mở xưởng tại Genève",
    desc: "Xưởng đầu tiên ở Rue du Rhône, chuyên chế tác bộ máy skeleton cho giới quý tộc châu Âu.",
  },
  {
    year: "1927",
    title: "Chiếc Chronomètre hàng hải đầu tiên",
    desc: "Cung cấp đồng hồ hàng hải cho hạm đội thương mại Bắc Hải, đạt sai số dưới 1 giây/ngày.",
  },
  {
    year: "1968",
    title: "Calibre 1888 hồi sinh",
    desc: "Thế hệ thứ ba của gia đình Aurel tái hiện bộ máy skeleton gốc theo đúng kỹ thuật thế kỷ 19.",
  },
  {
    year: "1994",
    title: "Tourbillon bay đầu tiên",
    desc: "Ra mắt bộ tourbillon bay siêu mỏng — biểu tượng mới của hãng tại Basel Fair.",
  },
  {
    year: "2012",
    title: "Atelier Métiers d'Art",
    desc: "Mở xưởng nghệ thuật riêng: men Grand Feu, khắc Guilloché, trình đá thiên thạch.",
  },
  {
    year: "2025",
    title: "50 kiệt tác mỗi năm",
    desc: "Giữ vững cam kết sản lượng giới hạn — mỗi chiếc đồng hồ là một khoản đầu tư di sản.",
  },
];

export const savoirFaire = [
  {
    title: "Guilloché",
    desc: "Họa tiết hoa văn xoáy ốc khắc trên máy cơ khí cổ, duy nhất tại xưởng Genève.",
  },
  {
    title: "Anglage & Poli Noir",
    desc: "Nghệ thuật vát cạnh gương soi đen — mất 200 giờ cho một bộ máy hoàn chỉnh.",
  },
  {
    title: "Men Grand Feu",
    desc: "Nung men ở 820°C bốn lần, tỷ lệ hỏng tới 50% để giữ màu trắng ngà vĩnh cửu.",
  },
  {
    title: "Cân bằng Tourbillon",
    desc: "Mỗi vành cân bằng được điều chỉnh vi mô bằng balancier cữu trên tay trần.",
  },
];

export const boutiques = [
  {
    city: "Genève",
    address: "Rue du Rhône 42, Genève, Thụy Sĩ",
    note: "Manufacture gốc — tham quan xưởng theo hẹn",
  },
  {
    city: "Hà Nội",
    address: "Số 1 Tràng Tiền, Hoàn Kiếm, Hà Nội",
    note: "Private Salon khu vực Đông Dương",
  },
  {
    city: "Sài Gòn",
    address: "Lê Lợi, Quận 1, TP. Hồ Chí Minh",
    note: "Salon tiếp khách & concierge khu vực Nam Bộ",
  },
];
