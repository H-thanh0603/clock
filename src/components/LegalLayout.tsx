import type { ReactNode } from "react";

export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-page px-6 py-14 md:px-8">
      <div className="mx-auto max-w-3xl">
        <span className="text-[11px] font-semibold tracking-[0.35em] text-primary uppercase">
          Aurel &amp; Co. — Thông Tín Pháp Lý
        </span>
        <h1 className="font-display mt-4 text-3xl font-medium text-on-surface md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-xs tracking-[0.15em] text-on-surface-variant/60 uppercase">
          Cập nhật lần cuối: {updated}
        </p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-on-surface-variant/90 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-on-surface [&_h2]:mt-2 [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </div>
    </div>
  );
}
