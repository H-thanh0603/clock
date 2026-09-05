"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-page px-6 py-24 md:px-8">
      <div className="gold-border-card mx-auto flex max-w-xl flex-col items-center gap-space-sm p-12 text-center">
        <span className="material-symbols-outlined text-6xl text-error">
          warning
        </span>
        <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
          Vault Tạm Gián Đoạn
        </span>
        <h1 className="font-display text-4xl font-medium">
          Có Lỗi <span className="text-gold-gradient">Xảy Ra</span>
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant/85">
          Atelier đang kiểm tra lại cơ chế. Quý khách vui lòng thử lại trong
          giây lát.
        </p>
        <div className="mt-space-sm flex flex-wrap justify-center gap-space-sm">
          <button
            onClick={reset}
            className="px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
          >
            Thử Lại
          </button>
          <Link
            href="/"
            className="px-space-xl py-3 rounded border border-primary-container/50 text-primary font-label-spec text-label-spec tracking-[0.2em] uppercase hover:bg-primary hover:text-on-primary transition-colors"
          >
            Về Trang Chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
