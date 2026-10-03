import type { Locale } from "@/i18n/dict";

export type JournalBlock =
  | { type: "p"; vi: string; en: string }
  | { type: "h2"; vi: string; en: string }
  | { type: "ul"; items: { vi: string; en: string }[] };

export type JournalArticle = {
  slug: string;
  date: string; // ISO
  readMinutes: number;
  image: string;
  title: { vi: string; en: string };
  excerpt: { vi: string; en: string };
  blocks: JournalBlock[];
};

const pick = (l: Locale) => (v: { vi: string; en: string }) => (l === "en" ? v.en : v.vi);

/**
 * Chuyên khảo (Journal) — content giáo dục cho kênh khám phá online.
 * Research 2026: online chủ yếu là kênh SO SÁNH/HỌC, và AI chỉ trích dẫn
 * ~10% site hãng → bài viết chuyên sâu + Article/FAQ JSON-LD là cách vào
 * câu trả lời của công cụ. Nội dung 2 ngôn ngữ giữ ngay trong data.
 */
export const journalArticles: JournalArticle[] = [
  {
    slug: "moonphase-astronomical-guide",
    date: "2026-09-12",
    readMinutes: 5,
    image: "/images/celestial-moonphase-obsidian-watch-with-black-iridescent-met.jpg",
    title: {
      vi: "Moonphase: vì sao complication “đẹp mà khó” đang thắng lớn 2026",
      en: "Moonphase: why the “beautiful but hard” complication is winning 2026",
    },
    excerpt: {
      vi: "Đơn vị bán đồng hồ moonphase tăng ~15% trên thị trường thứ cấp — bài giải thích cơ chế astronomical vs decorative, và cách chọn đúng tầm tiền.",
      en: "Secondary-market moonphase sales grew ~15% — a guide to astronomical vs decorative modules and how to pick one at every budget.",
    },
    blocks: [
      {
        type: "p",
        vi: "Trong bối cảnh thị trường đồng hồ xa xỉ đi ngang 2025-2026, người mua chuyển từ “hype sang nghệ thuật” (connoisseurship): thay vì săn model hot tăng giá, họ chọn tay nghề nhìn thấy được mỗi đêm. Moonphase là complication làm tốt nhất việc đó — một ô trời nhỏ đưa nhịp thiên văn vào cổ tay.",
        en: "While the luxury watch market plateaued in 2025-26, buyers shifted from hype to craft: instead of chasing flipping hot models, they choose visible horology. The moonphase does this best — a small sky window putting astronomy on the wrist every night.",
      },
      {
        type: "h2",
        vi: "Astronomical hay decorative?",
        en: "Astronomical vs decorative",
      },
      {
        type: "ul",
        items: [
          {
            vi: "Đĩa 29,53 ngày (decorative): lệch 1 ngày mỗi ~2,7 năm — gặp ở máy phổ thông.",
            en: "29.53-day disc (decorative): gains a day every ~2.7 years — common in entry movements.",
          },
          {
            vi: "Đĩa 135 răng astronomical (29,5306 ngày): sai số 1 ngày/122 năm — chuẩn của lịch thiên văn thực thụ.",
            en: "135-tooth astronomical disc (29.5306 days): one day off in 122 years — the true celestial standard.",
          },
          {
            vi: "Moonphase retrograde hoặc kết hợp lịch vạn niên: tầng cao nhất, thường đi cùng tourbillon hoặc perpetual calendar.",
            en: "Retrograde moonphase or perpetual-calendar hybrids: the top tier, usually paired with tourbillon or a full calendar.",
          },
        ],
      },
      {
        type: "h2",
        vi: "Chọn theo ngân sách (barbell 2026)",
        en: "Choosing by budget (the 2026 barbell)",
      },
      {
        type: "p",
        vi: "Thị trường thứ cấp đang dồn về hai đầu: dưới $1.500 và trên $20.000, còn phân khúc giữa suy yếu. Với moonphase: tầm entry hãy nhận diện đĩa 29,53 ngày đi cùng hoàn thiện đẹp (dial aventurine, kim lá vàng); tầm cao yêu cầu module astronomical 135 răng và đĩa moon được nung men grand feu như dòng Celestial Moonphase của atelier.",
        en: "The secondary market is barbelled: strong below $1,500 and above $20,000, weak in between. For moonphases: at entry, accept the 29.53-day disc but demand finishing (aventurine dial, gold leaf hand); at the high end, insist on the 135-tooth astronomical module and grand-feu enamel moon disc as in our Celestial Moonphase line.",
      },
      {
        type: "h2",
        vi: "Ba câu hỏi trước khi xuống tiền",
        en: "Three questions before you commit",
      },
      {
        type: "ul",
        items: [
          {
            vi: "Module astronomical hay decorative? Hỏi rõ số răng của đĩa trăng.",
            en: "Astronomical or decorative? Ask for the tooth count of the moon disc.",
          },
          {
            vi: "Chỉnh moonphase bằng núm riêng hay qua pusher ẩn? Loại núm riêng an toàn hơn cho lịch.",
            en: "Is the moon set via its own corrector or a hidden pusher? Dedicated correctors are safer for the calendar works.",
          },
          {
            vi: "Mua hàng cũ CPO: yêu cầu biên độ dao động và hồ sơ service — moonphase chết là dấu hiệu máy bị bỏ quên.",
            en: "For certified pre-owned: demand amplitude figures and service history — a dead moonphase often signals a neglected movement.",
          },
        ],
      },
      {
        type: "p",
        vi: "Aurel & Co. dựng Moonphase Astronomique theo đơn đặt bespoke — sai số 1 ngày/122 năm, đĩa moon tráng men grand Feu và cầu titan vát tay. Hỏi Concierge AI để xem bản dựng 3D theo ngân sách của bạn.",
        en: "Aurel & Co. builds the Moonphase Astronomique to bespoke order — one day of error in 122 years, grand-feu enamel moon disc and hand-bevelled titanium bridges. Ask the AI concierge to render one against your budget.",
      },
    ],
  },
  {
    slug: "first-luxury-watch-guide",
    date: "2026-09-24",
    readMinutes: 6,
    image: "/images/classic-dress-watch-with-18k-rose-gold-case-opaline-cream-su.jpg",
    title: {
      vi: "Chiếc đồng hồ cao cấp đầu tiên: chọn brand, chọn size hay chọn tâm thế?",
      en: "Your first luxury watch: brand, size, or mindset?",
    },
    excerpt: {
      vi: "Dữ liệu thị trường thứ cấp: người mua lần đầu gần như mặc định chọn heritage brand — nhưng 36% người 18-24 tuổi lại hứng thú với pre-owned. Hướng dẫn thực tế chọn chiếc đầu tiên không hối hận.",
      en: "Secondary-market data: first-time buyers default to heritage brands — yet 36% of 18-24s are most open to pre-owned. A practical, regret-proof guide to piece #1.",
    },
    blocks: [
      {
        type: "p",
        vi: "Giao dịch trên các thị trường thứ cấp lớn cho thấy chiếc đồng hồ đầu tiên của đa số vẫn là Rolex, Omega, Cartier hay Seiko: thương hiệu “an toàn” thanh khoản tốt, dễ bảo hành, không cần giải thích khi đi họp. Đó là thiên kiến có lý — nhưng không phải duy nhất.",
        en: "Secondary-market transaction data keeps showing the same first watch: Rolex, Omega, Cartier, Seiko — “safe” houses with liquidity, service networks and zero explanation needed in the room. A rational bias, but not the only one.",
      },
      {
        type: "h2",
        vi: "Ba lộ trình hợp lý năm 2026",
        en: "Three rational 2026 paths",
      },
      {
        type: "ul",
        items: [
          {
            vi: "Heritage entry ($1.000 – $6.000): Seiko Presage, Tissot PRX automatic, Cartier Tank pre-owned — chọn kích thước 34-38mm để mặc cả vest lẫn polo.",
            en: "Heritage entry ($1,000–6,000): Seiko Presage, Tissot PRX, pre-owned Cartier Tank — 34-38mm wears with both suits and polos.",
          },
          {
            vi: "Certified pre-owned ($4.000 – $20.000): cùng ngân sách mua được phân hạng cao hơn hẳn hàng mới — với điều kiện có chứng thư kiểm định và lịch sử service như dòng CPO của atelier.",
            en: "Certified pre-owned ($4k–20k): the same budget buys a visibly higher tier than new — provided there is an inspection certificate and service history, like our CPO line.",
          },
          {
            vi: "Bespoke First Timepiece (từ $6.800): một chiếc lên số theo bạn — khắc mặt sau, chọn dial, và lớn lên cùng bộ sưu tập.",
            en: "Bespoke First Timepiece (from $6,800): numbered to you — case-back engraving, dial choice, and a piece that grows with the collection.",
          },
        ],
      },
      {
        type: "h2",
        vi: "Size là quyết định, không phải sở thích",
        en: "Size is a decision, not a preference",
      },
      {
        type: "p",
        vi: "Cổ tay 15-16,5cm hợp 34-38mm; 17-18cm hợp 39-41mm; trên 19cm thoải mái 42mm+. Xu hướng 2025-26 rõ rệt: downsizing về kích cỡ vintage (36-39mm) — chiếc 36mm slim hôm nay sẽ không lỗi mốt trong 10 năm, còn chiếc 44mm thể thao thì ngược lại. Khách nữ và Gen Z đang dẫn dắt phân khúc slim này.",
        en: "A 15-16.5cm wrist suits 34-38mm; 17-18cm suits 39-41mm; above 19cm, 42mm+ is fair game. The clearest 2025-26 trend is downsizing toward vintage 36-39mm — a slim 36mm stays current for a decade, a 44mm sports case ages fast. Women and Gen Z are driving this slim segment.",
      },
      {
        type: "p",
        vi: "Nguyên tắc cuối: chiếc đầu tiên nên là thứ bạn đeo 300 ngày/năm, không phải thứ bạn chụp một lần. Nếu phân vân giữa “đầu tư” và “đẹp”, chọn “đẹp” — thị trường secondhand minh bạch hơn bao giờ hết chính là bảo hiểm cho quyết định của bạn.",
        en: "Final rule: piece one should be worn 300 days a year, not photographed once. If torn between “investment” and “love”, pick love — a transparent certified resale market is your insurance either way.",
      },
    ],
  },
];

export function getJournalArticle(slug: string) {
  return journalArticles.find((a) => a.slug === slug) ?? null;
}

export function journalText(locale: Locale) {
  return pick(locale);
}
