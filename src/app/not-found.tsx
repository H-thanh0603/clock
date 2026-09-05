import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-page px-6 py-24 md:px-8">
      <div className="gold-border-card mx-auto flex max-w-xl flex-col items-center gap-space-sm p-12 text-center">
        <span className="material-symbols-outlined text-6xl text-primary">
          search_off
        </span>
        <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
          Vault 404
        </span>
        <h1 className="font-display text-4xl font-medium">
          Không Tìm <span className="text-gold-gradient">Thấy</span>
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant/85">
          Kiệt tác hoặc đơn hàng quý khách tìm không tồn tại hoặc đã được di
          dời khỏi Vault.
        </p>
        <div className="mt-space-sm flex flex-wrap justify-center gap-space-sm">
          <Link
            href="/collections"
            className="px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
          >
            Khám Phá Bộ Sưu Tập
          </Link>
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
