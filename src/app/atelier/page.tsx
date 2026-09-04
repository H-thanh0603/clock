import Image from "next/image";
import SectionHeading from "@/components/SectionHeading";
import GoldButton from "@/components/GoldButton";
import SpecBadge from "@/components/SpecBadge";
import AppointmentForm from "@/components/AppointmentForm";
import { boutiques, heritageTimeline, metrics, savoirFaire } from "@/data/site";

export default function AtelierPage() {
  return (
    <div>
      {/* ===== Editorial hero ===== */}
      <section className="relative overflow-hidden border-b border-outline-variant/20">
        <div className="gold-glow top-[-80px] left-[-60px] h-[400px] w-[400px]" />
        <div className="relative mx-auto grid max-w-page items-center gap-10 px-6 py-14 md:px-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="text-[11px] font-semibold tracking-[0.35em] text-secondary uppercase">
              Atelier &amp; Di Sản • Depuis 1892
            </span>
            <h1 className="font-display mt-4 text-4xl leading-tight font-medium md:text-5xl">
              Nơi Thời Gian
              <br />
              <span className="text-gold-gradient">Được Chế Tác</span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-on-surface-variant/85">
              Ba thế hệ, một xưởng, một lời thề: không bao giờ sản xuất nhiều hơn
              những gì bàn tay có thể chăm chút. Đặt chân đến Rue du Rhône, nơi
              mọi kiệt tác Aurel bắt đầu.
            </p>
            <div className="mt-6">
              <GoldButton href="#tham-quan" variant="secondary" icon="map">
                Đặt Lịch Tham Quan Atelier
              </GoldButton>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:col-span-7">
            <div className="relative aspect-[3/4] overflow-hidden border border-primary-container/30">
              <Image
                src="/images/black-and-white-atmospheric-portrait-of-elderly-swiss-master.jpg"
                alt="Bậc thầy chế tác tại xưởng"
                fill
                priority
                sizes="(max-width: 1024px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
            <div className="relative mt-8 aspect-[3/4] overflow-hidden border border-outline-variant/30">
              <Image
                src="/images/artisanal-detail-of-deep-black-mississippi-alligator-leather.jpg"
                alt="Chi tiết dây da thủ công"
                fill
                sizes="(max-width: 1024px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        {/* Metrics ribbon */}
        <div className="border-t border-outline-variant/20 bg-surface-lowest/60">
          <div className="mx-auto grid max-w-page grid-cols-3 divide-x divide-outline-variant/25 px-6 md:px-8">
            {metrics.map((m) => (
              <div key={m.value} className="px-4 py-6 text-center">
                <div className="font-display text-2xl font-semibold text-primary md:text-4xl">
                  {m.value}
                </div>
                <div className="mt-1 text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Savoir-faire bento ===== */}
      <section className="mx-auto max-w-page px-6 py-20 md:px-8">
        <SectionHeading
          label="Savoir-Faire"
          title={
            <>
              Bốn Nghệ Thuật <span className="text-gold-gradient">Chỉ Còn Lại Ở Genève</span>
            </>
          }
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {savoirFaire.map((s, i) => (
            <div
              key={s.title}
              className={`border border-outline-variant/25 bg-surface-container/40 p-7 ${
                i % 3 === 0 ? "md:border-primary-container/40" : ""
              }`}
            >
              <div className="flex items-baseline gap-4">
                <span className="font-display text-3xl font-semibold text-primary/20">
                  0{i + 1}
                </span>
                <h3 className="font-display text-xl font-medium">{s.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant/80">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Heritage timeline ===== */}
      <section className="border-y border-outline-variant/20 bg-surface-lowest/40">
        <div className="mx-auto max-w-page px-6 py-20 md:px-8">
          <SectionHeading
            label="Di Sản 1892 — 2025"
            title={
              <>
                Dòng Chảy <span className="text-gold-gradient">Ba Thế Hệ</span>
              </>
            }
          />
          <div className="relative mt-14">
            <div className="absolute top-0 bottom-0 left-[19px] w-px bg-gradient-to-b from-primary/60 via-outline-variant/40 to-transparent md:left-1/2" />
            <div className="space-y-10">
              {heritageTimeline.map((t, i) => (
                <div
                  key={t.year}
                  className={`relative flex flex-col gap-3 pl-14 md:w-1/2 md:pl-0 ${
                    i % 2 === 0
                      ? "md:pr-12 md:text-right"
                      : "md:ml-auto md:pl-12"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-2.5 h-3.5 w-3.5 rotate-45 border border-primary bg-surface md:left-auto ${
                      i % 2 === 0 ? "md:-right-[7px]" : "md:-left-[7px]"
                    }`}
                  />
                  <span className="font-display text-2xl font-semibold text-primary">
                    {t.year}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-medium">{t.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-on-surface-variant/80">
                      {t.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Boutiques + booking ===== */}
      <section id="tham-quan" className="mx-auto max-w-page px-6 py-20 md:px-8">
        <SectionHeading
          label="Private Salon & Atelier Tour"
          title={
            <>
              Gặp Chúng Tôi Tại{" "}
              <span className="text-gold-gradient">Ba Thành Phố</span>
            </>
          }
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {boutiques.map((b) => (
            <div
              key={b.city}
              className="gold-border-card flex flex-col gap-3 p-7 transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">location_on</span>
                <h3 className="font-display text-xl font-medium">{b.city}</h3>
              </div>
              <p className="text-sm text-on-surface-variant/85">{b.address}</p>
              <p className="text-xs text-on-surface-variant/60">{b.note}</p>
              <SpecBadge>Hẹn Trước 48 Giờ</SpecBadge>
            </div>
          ))}
        </div>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden border border-primary-container/30">
            <Image
              src="/images/high-end-artisan-swiss-leather-watch-winder-box-with-walnut-.jpg"
              alt="Không gian atelier Aurel & Co."
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <SectionHeading
              align="left"
              label="Lịch Thăm"
              title={
                <>
                  Đặt Lịch <span className="text-gold-gradient">Tham Quan</span>
                </>
              }
            >
              Nhóm tối đa 4 khách, kéo dài 90 phút, có phiên dịch tiếng Việt và
              Pháp. Quý khách sẽ được xem trực tiếp nghệ nhân vát cạnh anglage.
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
