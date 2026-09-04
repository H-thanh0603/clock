import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { productBySlug, products, formatUsd } from "@/data/products";
import ProductDetail from "@/components/ProductDetail";
import SectionHeading from "@/components/SectionHeading";
import GoldButton from "@/components/GoldButton";

const accessories = [
  {
    slug: "watch-winder-walnut",
    name: "Watch Winder Gỗ Óc Chó",
    desc: "Hộp quay tự động da Thụy Sĩ, thân gỗ óc chó thủ công.",
    priceUsd: 4200,
    image: "/images/high-end-artisan-swiss-leather-watch-winder-box-with-walnut-.jpg",
  },
  {
    slug: "rose-gold-cufflinks",
    name: "Cufflinks Vàng Hồng 18k",
    desc: "Cặp khuy măng sét khắc logo Aurel, gắn đá Black Onyx.",
    priceUsd: 2850,
    image: "/images/pair-of-exquisite-18k-solid-rose-gold-cufflinks-designed-wit.jpg",
  },
  {
    slug: "travel-roll-navy",
    name: "Travel Roll Da Bê Navy",
    desc: "Túi đựng 3 đồng hồ da bê gân, lót nỉ bảo vệ kính.",
    priceUsd: 980,
    image: "/images/travel-roll-pouch-made-of-navy-blue-pebbled-calfskin-with-cu.jpg",
  },
];

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) notFound();

  const related = products.filter((p) => p.slug !== product.slug).slice(0, 3);

  return (
    <div>
      <ProductDetail product={product} />

      {/* ===== Specs bento ===== */}
      <section className="border-y border-outline-variant/20 bg-surface-lowest/40">
        <div className="mx-auto max-w-page px-6 py-16 md:px-8">
          <SectionHeading
            label="Bản Chất Cơ Khí"
            title={
              <>
                Thông Số <span className="text-gold-gradient">Kỹ Thuật</span>
              </>
            }
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {product.specs.map((s) => (
              <div
                key={s.label}
                className="border border-outline-variant/25 bg-surface-container/40 p-6"
              >
                <div className="text-[10px] tracking-[0.3em] text-primary uppercase">
                  {s.label}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant/90">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Master watchmaker narrative */}
          <div className="gold-border-card mt-10 grid items-center gap-8 p-7 md:grid-cols-[auto_1fr] md:p-9">
            <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-full border border-primary-container/50 md:mx-0">
              <Image
                src="/images/portrait-of-a-distinguished-swiss-master-watchmaker-and-horo.jpg"
                alt="Bậc thầy chế tác Aurel"
                fill
                sizes="112px"
                className="object-cover"
              />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] text-secondary uppercase">
                Lời Bậc Thầy Chế Tác
              </div>
              <p className="font-display mt-2 text-lg leading-relaxed italic md:text-xl">
                “{product.narrative}”
              </p>
              <div className="mt-3 text-xs tracking-[0.2em] text-on-surface-variant/60 uppercase">
                — Atelier Aurel &amp; Co., Genève
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Curated pairings ===== */}
      <section className="mx-auto max-w-page px-6 py-16 md:px-8">
        <SectionHeading
          label="Tuyển Chọn Cùng Hạng"
          title={
            <>
              Phụ Kiện <span className="text-gold-gradient">Collector Pairing</span>
            </>
          }
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {accessories.map((a) => (
            <article
              key={a.slug}
              className="group border border-outline-variant/25 bg-surface-container/50 transition-colors hover:border-primary-container/50"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={a.image}
                  alt={a.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="font-display text-lg font-medium transition-colors group-hover:text-primary">
                  {a.name}
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant/80">{a.desc}</p>
                <div className="mt-3 font-display text-lg font-semibold text-primary">
                  {formatUsd(a.priceUsd)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ===== Related watches ===== */}
      <section className="border-t border-outline-variant/20 bg-surface-lowest/40">
        <div className="mx-auto max-w-page px-6 py-16 md:px-8">
          <SectionHeading
            label="Từ Cùng Atelier"
            title={
              <>
                Có Thể Bạn <span className="text-gold-gradient">Cũng Thích</span>
              </>
            }
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="group border border-outline-variant/25 bg-surface-container/50 transition-colors hover:border-primary-container/50"
              >
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={p.images[0]}
                    alt={p.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-medium transition-colors group-hover:text-primary">
                    {p.name}
                  </h3>
                  <div className="mt-1 text-sm font-semibold text-primary">
                    {formatUsd(p.priceUsd)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <GoldButton href="/collections" icon="arrow_forward">
              Xem Toàn Bộ Bộ Sưu Tập
            </GoldButton>
          </div>
        </div>
      </section>
    </div>
  );
}
