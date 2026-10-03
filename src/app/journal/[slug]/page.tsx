import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getJournalArticle, journalArticles } from "@/data/journal";
import { absoluteMediaUrl, absoluteSiteUrl, safeJsonLd } from "@/lib/json-ld";
import { mediaUrl } from "@/lib/media";
import { serverLocale } from "@/components/OrderStatusLabel";

export function generateStaticParams() {
  return journalArticles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = getJournalArticle(slug);
  if (!a) return { title: "Aurel Journal" };
  return {
    title: `${a.title.en} — Aurel Journal`,
    description: a.excerpt.en,
  };
}

export default async function JournalArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getJournalArticle(slug);
  if (!article) notFound();
  const locale = await serverLocale();
  const en = locale === "en";
  const T = (v: { vi: string; en: string }) => (en ? v.en : v.vi);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: T(article.title),
    description: T(article.excerpt),
    image: absoluteMediaUrl(article.image),
    datePublished: article.date,
    author: { "@type": "Organization", name: "Aurel & Co. Atelier" },
    publisher: { "@type": "Organization", name: "Aurel & Co." },
    mainEntityOfPage: absoluteSiteUrl(`/journal/${article.slug}`),
    inLanguage: en ? "en" : "vi",
  };

  return (
    <article className="max-w-[860px] mx-auto px-gutter-desktop py-space-3xl w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }}
      />
      <Link
        href="/journal"
        className="font-label-spec text-label-spec uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
      >
        ← {en ? "Journal" : "Chuyên khảo"}
      </Link>
      <p className="font-label-badge text-label-badge text-secondary uppercase tracking-widest mt-space-lg">
        {new Date(article.date).toLocaleDateString(en ? "en-GB" : "vi-VN", {
          month: "long",
          year: "numeric",
        })}{" "}
        · {article.readMinutes} min
      </p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight mt-3">
        {T(article.title)}
      </h1>
      <div className="relative aspect-[16/9] overflow-hidden rounded mt-space-xl">
        <Image
          src={mediaUrl(article.image)}
          alt=""
          fill
          sizes="(max-width:860px) 100vw, 860px"
          className="object-cover"
          priority
        />
      </div>
      <div className="mt-space-2xl flex flex-col gap-space-lg">
        {article.blocks.map((b, i) => {
          if (b.type === "h2")
            return (
              <h2
                key={i}
                className="font-headline-sm text-headline-sm text-on-surface uppercase mt-space-md"
              >
                {T(b)}
              </h2>
            );
          if (b.type === "ul")
            return (
              <ul key={i} className="flex flex-col gap-space-sm pl-space-md border-l border-primary/30">
                {b.items.map((it, j) => (
                  <li key={j} className="font-body-md text-on-surface-variant">
                    {T(it)}
                  </li>
                ))}
              </ul>
            );
          return (
            <p key={i} className="font-body-lg text-body-lg text-on-surface leading-relaxed">
              {T(b)}
            </p>
          );
        })}
      </div>
      <div className="mt-space-3xl rounded border border-outline-variant/25 bg-surface-container-low p-space-xl flex flex-col sm:flex-row items-center justify-between gap-space-md">
        <p className="font-body-md text-on-surface-variant">
          {en
            ? "Want this applied to your wrist and budget? The concierge builds comparisons in minutes."
            : "Muốn áp dụng cho chính cổ tay và ngân sách của bạn? Concierge AI dựng bản so sánh trong vài phút."}
        </p>
        <Link
          href="/agent"
          className="shrink-0 px-space-lg py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-colors"
        >
          {en ? "Ask the concierge →" : "Hỏi Concierge →"}
        </Link>
      </div>
    </article>
  );
}
