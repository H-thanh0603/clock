import Image from "next/image";
import Link from "next/link";
import { journalArticles } from "@/data/journal";
import { mediaUrl } from "@/lib/media";
import { serverLocale } from "@/components/OrderStatusLabel";

export const metadata = {
  title: "Chuyên khảo — Aurel & Co. Journal",
  description:
    "Bài viết chuyên sâu về complications, chọn chiếc đầu tiên và thị trường secondhand — song ngữ Việt/Anh.",
};

export default async function JournalPage() {
  const locale = await serverLocale();
  const en = locale === "en";
  return (
    <div className="max-w-[1100px] mx-auto px-gutter-desktop py-space-3xl w-full">
      <div className="flex items-center gap-space-xs mb-space-sm">
        <span className="h-px w-8 bg-primary"></span>
        <span className="font-label-badge text-label-badge text-primary uppercase tracking-[0.25em]">
          Journal Horloger
        </span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
        {en ? "The Aurel Journal" : "Chuyên Khảo Aurel"}
      </h1>
      <p className="font-body-lg text-on-surface-variant mt-3 max-w-2xl">
        {en
          ? "Reading for collectors: complications, sizing, and how to buy well — in the market that moved from hype to craft."
          : "Đọc cho người sưu tầm: complication, chọn size, và cách mua khôn ngoan — trong thị trường đã chuyển từ hype sang nghệ thuật."}
      </p>
      <div className="mt-space-2xl flex flex-col gap-space-xl">
        {journalArticles.map((a) => (
          <Link
            key={a.slug}
            href={`/journal/${a.slug}`}
            className="group grid grid-cols-1 md:grid-cols-3 gap-space-lg items-center border-b border-outline-variant/20 pb-space-xl"
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded md:col-span-1">
              <Image
                src={mediaUrl(a.image)}
                alt=""
                fill
                sizes="(max-width:768px) 100vw, 340px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="md:col-span-2">
              <p className="font-label-badge text-label-badge text-secondary uppercase tracking-widest">
                {new Date(a.date).toLocaleDateString(en ? "en-GB" : "vi-VN", {
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {a.readMinutes} min
              </p>
              <h2 className="font-headline-sm text-headline-sm text-on-surface mt-2 group-hover:text-primary transition-colors">
                {en ? a.title.en : a.title.vi}
              </h2>
              <p className="font-body-md text-on-surface-variant mt-2 max-w-2xl">
                {en ? a.excerpt.en : a.excerpt.vi}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
