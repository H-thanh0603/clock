import Link from "next/link";
import Image from "next/image";
import { site } from "@/data/site";

const assuranceItems = [
  {
    icon: "verified_user",
    title: "Chronomètre Certifié COSC",
    desc: "Dung sai cơ khí vi mô được kiểm định tại La Chaux-de-Fonds",
  },
  {
    icon: "shield",
    title: "Bảo Hành Quốc Tế 5 Năm",
    desc: "Bảo hành atelier toàn diện và giấy chứng nhận xuất xứ bộ máy trọn đời",
  },
  {
    icon: "lock",
    title: "Vận Chuyển An Ninh Concierge",
    desc: "Xe bọc thép vận chuyển kín đáo, giao tận tay tại private salon",
  },
];

const masterpieceLinks = [
  "Tourbillon Mystérieux",
  "Chronographe Monopoussoir",
  "Quantième Perpétuel",
  "Bespoke Métiers d'Art",
  "Vật Phẩm Sưu Tầm Độc Bản",
];

const conciergeLinks = [
  "Đặt Lịch Private Salon",
  "Bảo Dưỡng Calibre Định Kỳ",
  "Chứng Thư Xác Thực & Xuất Xứ",
  "Dịch Vụ Concierge Cá Nhân",
  "Chính Sách Bảo Mật Khách Hàng VIP",
];

export default function Footer() {
  return (
    <footer className="border-t border-outline-variant/20 bg-surface-lowest">
      {/* Assurance strip */}
      <div className="mx-auto grid max-w-page gap-6 px-6 py-12 md:grid-cols-3 md:px-8">
        {assuranceItems.map((item) => (
          <div key={item.title} className="flex gap-4">
            <span className="material-symbols-outlined text-primary">
              {item.icon}
            </span>
            <div>
              <div className="text-xs font-semibold tracking-[0.15em] text-on-surface uppercase">
                {item.title}
              </div>
              <p className="mt-1 text-sm text-on-surface-variant/80">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-outline-variant/10">
        <div className="mx-auto grid max-w-page gap-10 px-6 py-14 md:grid-cols-2 lg:grid-cols-4 md:px-8">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/images/logo.png"
                alt="Logo Aurel & Co."
                width={34}
                height={34}
                className="h-8 w-8 object-contain"
              />
              <span className="font-display text-xl font-semibold">
                {site.brand}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-on-surface-variant/80">
              Đỉnh cao nghệ thuật chế tác đồng hồ Thụy Sĩ. Mỗi tạo tác là một
              kiệt tác cơ khí độc bản hòa quyện cùng di sản thủ công hơn một thế
              kỷ từ Genève.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs tracking-[0.2em] text-on-surface-variant/60 uppercase">
              <span className="material-symbols-outlined text-[16px]">public</span>
              Genève • Zürich • Tokyo • Saigon
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-[0.25em] text-primary uppercase">
              Kiệt Tác Horlogerie
            </h4>
            <ul className="mt-5 space-y-3">
              {masterpieceLinks.map((l) => (
                <li key={l}>
                  <Link
                    href="/collections"
                    className="text-sm text-on-surface-variant/80 transition-colors hover:text-primary"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-[0.25em] text-primary uppercase">
              Dịch Vụ & Concierge
            </h4>
            <ul className="mt-5 space-y-3">
              {conciergeLinks.map((l) => (
                <li key={l}>
                  <Link
                    href="/atelier"
                    className="text-sm text-on-surface-variant/80 transition-colors hover:text-primary"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-[0.25em] text-primary uppercase">
              Bản Tin Thượng Lưu
            </h4>
            <p className="mt-5 text-sm leading-relaxed text-on-surface-variant/80">
              Nhận lời mời tham dự lễ ra mắt bộ sưu tập giới hạn và các ấn phẩm
              chuyên khảo từ Viện Horlogerie.
            </p>
            <button className="mt-5 flex items-center gap-2 border border-primary-container/40 px-5 py-3 text-[11px] font-semibold tracking-[0.2em] text-primary uppercase transition-colors hover:bg-primary hover:text-surface-lowest">
              Gia Nhập Circle Privé
              <span className="material-symbols-outlined text-[16px]">east</span>
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-outline-variant/10">
        <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-4 px-6 py-6 text-xs text-on-surface-variant/60 md:flex-row md:px-8">
          <div className="flex items-center gap-4">
            <span>© 1892-2025 Aurel &amp; Co. Manufacture Horlogère.</span>
            <span className="spec-badge px-2 py-0.5">Swiss Made</span>
          </div>
          <div className="flex gap-6">
            <span className="cursor-pointer transition-colors hover:text-primary">
              Điều Khoản Đặc Quyền
            </span>
            <span className="cursor-pointer transition-colors hover:text-primary">
              Chính Sách Bảo Mật
            </span>
            <span className="cursor-pointer transition-colors hover:text-primary">
              Khảo Sát Atelier
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
