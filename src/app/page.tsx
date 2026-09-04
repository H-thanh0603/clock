import Image from "next/image";
import Link from "next/link";
import GoldButton from "@/components/GoldButton";
import SectionHeading from "@/components/SectionHeading";
import SpecBadge from "@/components/SpecBadge";
import AppointmentForm from "@/components/AppointmentForm";
import {
  collections,
  craftsmanshipPillars,
  metrics,
  reputationStrip,
} from "@/data/site";

const vipPrivileges = [
  {
    icon: "key",
    title: "Collector Tier",
    desc: "Ưu tiên phân bổ các phiên bản giới hạn và bản độc bản trước khi ra mắt công chúng.",
  },
  {
    icon: "event_available",
    title: "Private Salon",
    desc: "Không gian tiếp khách riêng tư tại Genève, Hà Nội và Sài Gòn với chuyên gia horlogerie.",
  },
  {
    icon: "handyman",
    title: "Atelier Concierge",
    desc: "Dịch vụ bảo dưỡng trọn đời, phục chế và cập nhật chứng thư provenance theo năm.",
  },
];

export default function Home() {
  return (
    <div>
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="gold-glow top-[-120px] right-[-80px] h-[420px] w-[420px]" />
        <div className="mx-auto grid max-w-page items-center gap-10 px-6 py-16 md:px-8 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-7">
            <span className="text-[11px] font-semibold tracking-[0.35em] text-secondary uppercase">
              Edition Limitée 2025 • Genève
            </span>
            <h1 className="font-display mt-5 text-4xl leading-[1.1] font-medium md:text-6xl">
              Nghệ Thuật Đếm
              <br />
              <span className="text-gold-gradient">Thời Gian Vượt Thời Đại</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-on-surface-variant/85">
              Tuyệt tác cơ khí chế tác thủ công tại Genève, giao thoa giữa độ
              chính xác chuẩn Chronometer khắt khe và thẩm mỹ vương giả thuần
              khiết dành riêng cho những nhà sưu tầm kiệt xuất.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <GoldButton href="/collections" icon="arrow_forward">
                Khám Phá Tuyệt Tác Mới
              </GoldButton>
              <GoldButton href="#salon" variant="secondary" icon="calendar_month">
                Đặt Lịch Private Salon
              </GoldButton>
            </div>

            {/* Metrics */}
            <div className="mt-12 grid max-w-xl grid-cols-3 divide-x divide-outline-variant/25 border-y border-outline-variant/25">
              {metrics.map((m) => (
                <div key={m.value} className="px-4 py-5 text-center first:pl-0">
                  <div className="font-display text-2xl font-semibold text-primary md:text-3xl">
                    {m.value}
                  </div>
                  <div className="mt-1 text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero image + floating spec plate */}
          <div className="relative lg:col-span-5">
            <div className="relative aspect-[4/5] overflow-hidden border border-primary-container/30">
              <Image
                src="/images/exquisite-macro-shot-of-aurel-amp-co-flying-tourbillon-watch.jpg"
                alt="Chronos Tourbillon — kiệt tác Aurel & Co."
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
            {/* Floating spec plate */}
            <div className="glass-header absolute -bottom-6 left-4 max-w-[280px] border border-primary-container/40 p-5 md:left-auto md:-right-6">
              <div className="text-[10px] tracking-[0.3em] text-primary uppercase">
                Calibre AC-901
              </div>
              <div className="font-display mt-1 text-lg font-medium">
                Sovereign Skeleton Flying Tourbillon
              </div>
              <div className="mt-3 flex gap-4 text-[11px] text-on-surface-variant/80">
                <span>3 Hz • 21,600 vph</span>
                <span className="text-primary">72h Power Reserve</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ REPUTATION STRIP ============ */}
      <section className="border-y border-outline-variant/20 bg-surface-lowest/60">
        <div className="mx-auto grid max-w-page gap-6 px-6 py-10 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
          {reputationStrip.map((r) => (
            <div key={r.title} className="flex gap-3.5">
              <span className="material-symbols-outlined text-primary">
                {r.icon}
              </span>
              <div>
                <div className="text-xs font-semibold tracking-[0.12em] text-on-surface uppercase">
                  {r.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-on-surface-variant/70">
                  {r.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 4 CORE COLLECTIONS ============ */}
      <section className="mx-auto max-w-page px-6 py-20 md:px-8">
        <SectionHeading
          label="Di Sản Cơ Khí Đỉnh Cao"
          title={
            <>
              4 Dòng <span className="text-gold-gradient">Tuyệt Tác Cốt Lõi</span>
            </>
          }
        >
          Mỗi cỗ máy là hiện thân của hàng trăm giờ vát cạnh viền thủ công
          anglage, đánh bóng gương đen và hiệu chuẩn chuẩn xác vi cơ học.
        </SectionHeading>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((c, i) => (
            <Link
              key={c.id}
              href={`/collections?collection=${c.id}`}
              className="group relative block aspect-[3/4] overflow-hidden border border-outline-variant/25"
            >
              <Image
                src={c.image}
                alt={c.name}
                fill
                sizes="(max-width: 640px) 100vw, 25vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-lowest via-surface-lowest/20 to-transparent" />
              <div className="absolute right-5 bottom-5 left-5">
                <div className="text-[10px] tracking-[0.3em] text-secondary uppercase">
                  Masterpiece No. 0{i + 1}
                </div>
                <div className="font-display mt-1 text-2xl font-medium text-on-surface transition-colors group-hover:text-primary">
                  {c.name}
                </div>
                <div className="mt-1 text-xs text-on-surface-variant/75">
                  {c.subtitle}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ CRAFTSMANSHIP ============ */}
      <section className="border-y border-outline-variant/20 bg-surface-lowest/40">
        <div className="mx-auto grid max-w-page items-center gap-12 px-6 py-20 md:px-8 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden border border-primary-container/30">
            <Image
              src="/images/extreme-macro-extreme-close-up-view-of-a-watch-tourbillon-ca.jpg"
              alt="Cận cảnh tourbillon trong xưởng Aurel"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <SectionHeading
              align="left"
              label="Craftsmanship"
              title={
                <>
                  Bàn Tay Chế Tác
                  <br />
                  <span className="text-gold-gradient">Hơn 130 Năm</span>
                </>
              }
            >
              Từ xưởng nhỏ ở Rue du Rhône năm 1892, mỗi công đoạn vẫn được giữ
              nguyên bằng bàn tay con người — công nghệ chỉ phục vụ độ chính
              xác, không thay thế nghệ thuật.
            </SectionHeading>
            <div className="mt-8 space-y-6">
              {craftsmanshipPillars.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-primary-container/40 text-primary">
                    <span className="material-symbols-outlined">{p.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-medium">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-on-surface-variant/80">
                      {p.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ VIP PRIVILEGES ============ */}
      <section className="relative overflow-hidden">
        <div className="gold-glow top-1/2 left-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2" />
        <div className="relative mx-auto max-w-page px-6 py-20 md:px-8">
          <SectionHeading
            label="Đặc Quyền Thượng Lưu"
            title={
              <>
                Trải Nghiệm <span className="text-gold-gradient">Collector Tier</span>
              </>
            }
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {vipPrivileges.map((v) => (
              <div
                key={v.title}
                className="gold-border-card flex flex-col gap-4 p-8 transition-transform duration-300 hover:-translate-y-1"
              >
                <span className="material-symbols-outlined text-4xl text-primary">
                  {v.icon}
                </span>
                <h3 className="font-display text-xl font-medium">{v.title}</h3>
                <p className="text-sm leading-relaxed text-on-surface-variant/80">
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRIVATE SALON INVITATION ============ */}
      <section id="salon" className="border-t border-outline-variant/20 bg-surface-lowest/60">
        <div className="mx-auto grid max-w-page items-start gap-12 px-6 py-20 md:px-8 lg:grid-cols-2">
          <div className="relative aspect-[4/5] overflow-hidden border border-primary-container/30 lg:aspect-[4/3]">
            <Image
              src="/images/editorial-close-up-luxury-portrait-of-an-elegant-discerning-gentleman-in.png"
              alt="Private Salon Aurel & Co."
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-lowest/95 to-transparent p-8">
              <div className="flex flex-wrap gap-2">
                <SpecBadge gold>Poinçon de Genève</SpecBadge>
                <SpecBadge gold>COSC Chronometer</SpecBadge>
                <SpecBadge gold>Atelier Certificat</SpecBadge>
              </div>
            </div>
          </div>
          <div>
            <SectionHeading
              align="left"
              label="Lời Mời Riêng Tư"
              title={
                <>
                  Private Salon
                  <br />
                  <span className="text-gold-gradient">Genève • Hà Nội • Sài Gòn</span>
                </>
              }
            >
              Quý khách được mời tham quan atelier, chiêm ngưỡng bộ sưu tập giới
              hạn và trò chuyện trực tiếp cùng bậc thầy chế tác. Concierge sẽ
              sắp xếp mọi chi tiết chuyến thăm.
            </SectionHeading>
            <div className="mt-8">
              <AppointmentForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
