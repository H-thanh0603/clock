import LegalLayout from "@/components/LegalLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Khiếu Nại & Vận Hành TMĐT — Aurel & Co.",
  description:
    "Quy trình tiếp nhận và xử lý khiếu nại của khách hàng Aurel & Co. Haute Horlogerie.",
};

export default function ComplaintsPage() {
  return (
    <LegalLayout title="Quy Trình Tiếp Nhận & Xử Lý Khiếu Nại" updated="07/09/2026">
      <section>
        <h2>1. Kênh tiếp nhận</h2>
        <ul>
          <li>Hotline concierge 24/7: +84 24 1892 1892</li>
          <li>Email: concierge@aurel.example</li>
          <li>Trực tiếp tại Private Salon Hà Nội / Sài Gòn / Genève</li>
        </ul>
      </section>
      <section>
        <h2>2. Thời hạn xử lý</h2>
        <p>
          Mỗi khiếu nại được cấp mã theo dõi trong 24 giờ. Thời hạn phản hồi lần
          đầu: 48 giờ (ngày làm việc). Khiếu nại về chất lượng sản phẩm: giải
          quyết trong 15 ngày, bao gồm thẩm định tại atelier nếu cần. Khiếu nại
          về thanh toán: đối soát với VNPay trong 5 ngày làm việc.
        </p>
      </section>
      <section>
        <h2>3. Phương thức giải quyết</h2>
        <p>
          Tùy tình huống: đổi sản phẩm cùng dòng, sửa chữa tại atelier (miễn
          phí trong thời hạn bảo hành), hoặc hoàn tiền qua chính kênh thanh
          toán ban đầu. Chi phí vận chuyển phát sinh từ lỗi của hãng do chúng
          tôi chịu.
        </p>
      </section>
      <section>
        <h2>4. Giám sát của cơ quan quản lý</h2>
        <p>
          Website được vận hành theo Nghị định 52/2013/NĐ-CP (sửa đổi bởi Nghị
          định 85/2021/NĐ-CP) về thương mại điện tử và đã thông báo với Cục
          Thương mại điện tử và Kinh tế số — Bộ Công Thương. Nếu không thỏa mãn
          với kết quả giải quyết, quý khách có quyền khiếu nại đến cơ quan quản
          lý nhà nước về bảo vệ quyền lợi người tiêu dùng tại địa phương.
        </p>
      </section>
    </LegalLayout>
  );
}
