import Image from "next/image";
import BespokeConfigurator from "@/components/BespokeConfigurator";
import SectionHeading from "@/components/SectionHeading";
import GoldButton from "@/components/GoldButton";
import SpecBadge from "@/components/SpecBadge";

const journeySteps = [
  {
    title: "Tư Vấn Ý Tưởng",
    desc: "Trao đổi trực tiếp với giám đốc sáng tạo về câu chuyện bạn muốn khắc lên dòng chảy thời gian.",
  },
  {
    title: "Phác Thảo Thiết Kế",
    desc: "Atelier vẽ bản kỹ thuật 3D và mẫu in chỉ số tay để quý khách phê duyệt.",
  },
  {
    title: "Chế Tác Bộ Máy",
    desc: "14 — 24 tháng trong xưởng Genève, dưới bàn tay của một bậc thầy duy nhất.",
  },
  {
    title: "Chứng Nhận & Bàn Giao",
    desc: "Kiểm định COSC, khắc số đăng ký và bàn giao trang trọng tại Private Salon.",
  },
];

const masterpieces = [
  {
    image: "/images/exquisite-macro-studio-shot-of-aurel-chronos-tourbillon-luxu.jpg",
    name: "Muonionalusta Unique N°1",
    note: "Vỏ platinum, mặt đá thiên thạch — trao tay năm 2019",
  },
  {
    image: "/images/classic-dress-watch-with-18k-rose-gold-case-opaline-cream-su.jpg",
    name: "Split-Seconds Grand Caption",
    note: "Chronograph rattrapante độc bản — sưu tầm tư nhân Monaco",
  },
  {
    image: "/images/royal-chronograph-flyback-watch-with-black-ceramic-bezel-hig.jpg",
    name: "Cathedral Gong Repeater",
    note: "Minute repeater skeleton tay — trưng bày tại atelier Genève",
  },
];

export default function BespokePage() {
  return (
    <div>
      {/* ===== Commission hero ===== */}
      <section className="relative overflow-hidden border-b border-outline-variant/20">
        <div className="gold-glow top-[-100px] right-1/4 h-[380px] w-[380px]" />
        <div className="relative mx-auto grid max-w-page items-center gap-10 px-6 py-14 md:px-8 lg:grid-cols-2">
          <div>
            <span className="text-[11px] font-semibold tracking-[0.35em] text-secondary uppercase">
              Pièce Unique • Đơn Đặc Riêng
            </span>
            <h1 className="font-display mt-4 text-4xl leading-tight font-medium md:text-5xl">
              Bộ Sưu Tập{" "}
              <span className="text-gold-gradient">Cá Nhân Hóa</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-on-surface-variant/85">
              Từ bộ máy đến nét khắc lưng vỏ — mỗi chiếc đồng hồ bespoke là một
              cuộc đồng sáng tạo giữa bạn và xưởng Genève. Hãy cấu hình kiệt tác
              của riêng bạn dưới đây.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <SpecBadge gold>Chỉ 3 Đơn / Năm</SpecBadge>
              <SpecBadge gold>Đặt Cọc 20%</SpecBadge>
              <SpecBadge gold>Sổ Đăng Ký Genève</SpecBadge>
            </div>
          </div>
          <div className="relative aspect-[16/10] overflow-hidden border border-primary-container/30">
            <Image
              src="/images/macro-high-end-photograph-of-a-luxury-swiss-skeleton-rose-go.jpg"
              alt="Đồng hồ bespoke Aurel & Co."
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* ===== Configurator ===== */}
      <section className="border-b border-outline-variant/20 bg-surface-lowest/30">
        <div className="mx-auto max-w-page px-4 pt-12 md:px-8">
          <SectionHeading
            label="Cấu Hình Kiệt Tác"
            title={
              <>
                Bespoke <span className="text-gold-gradient">Configurator</span>
              </>
            }
          >
            Bốn bước định hình tạo tác của bạn. Giá ước tính cập nhật tức thời
            theo từng lựa chọn.
          </SectionHeading>
        </div>
        <BespokeConfigurator />
      </section>

      {/* ===== Journey timeline ===== */}
      <section className="mx-auto max-w-page px-6 py-16 md:px-8">
        <SectionHeading
          label="Hành Trình Bespoke"
          title={
            <>
              4 Chặng Đường <span className="text-gold-gradient">Từ Ý Tưởng Đến Bàn Tay</span>
            </>
          }
        />
        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {journeySteps.map((s, i) => (
            <div
              key={s.title}
              className="relative border border-outline-variant/25 bg-surface-container/40 p-6"
            >
              <span className="font-display absolute -top-5 right-4 text-5xl font-semibold text-primary/15">
                0{i + 1}
              </span>
              <div className="text-[10px] tracking-[0.3em] text-primary uppercase">
                Chặng {i + 1}
              </div>
              <h3 className="font-display mt-2 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/80">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Historical unique pieces ===== */}
      <section className="border-t border-outline-variant/20 bg-surface-lowest/40">
        <div className="mx-auto max-w-page px-6 py-16 md:px-8">
          <SectionHeading
            label="Viện Bảo Tàng Của Hãng"
            title={
              <>
                Những <span className="text-gold-gradient">Kiệt Tác Độc Bản</span> Đã Trao Tay
              </>
            }
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {masterpieces.map((m) => (
              <figure key={m.name} className="group border border-outline-variant/25">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={m.image}
                    alt={m.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <figcaption className="p-5">
                  <div className="font-display text-lg font-medium transition-colors group-hover:text-primary">
                    {m.name}
                  </div>
                  <div className="mt-1 text-xs text-on-surface-variant/75">{m.note}</div>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-10 text-center">
            <GoldButton href="/#salon" variant="secondary" icon="calendar_month">
              Đặt Lịch Buổi Tư Vấn Bespoke
            </GoldButton>
          </div>
        </div>
      </section>
    </div>
  );
}
