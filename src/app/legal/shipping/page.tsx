import LegalLayout from "@/components/LegalLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vận Chuyển & Đổi Trả — Aurel & Co.",
  description:
    "Chính sách vận chuyển an ninh, kiểm tra hàng, đổi trả và bảo hành của Aurel & Co.",
};

export default function ShippingPage() {
  return (
    <LegalLayout title="Vận Chuyển, Đổi Trả & Bảo Hành" updated="16/09/2026">
      <section>
        <h2>1. Vận chuyển</h2>
        <ul>
          <li>Miễn phí toàn quốc, giao qua dịch vụ vận chuyển an ninh có bảo hiểm 100% giá trị.</li>
          <li>Đơn xác nhận (CONFIRMED/PAID) được bàn giao trong 2 giờ làm việc nội thành, 24–48 giờ liên tỉnh.</li>
          <li>Hàng bespoke/pre-order: thời hạn ghi rõ trên trang sản phẩm và trong email xác nhận.</li>
        </ul>
      </section>
      <section>
        <h2>2. Kiểm tra khi nhận</h2>
        <p>
          Quý khách kiểm tra ngoại quan khi nhận; mọi vấn đề (trầy, móp, sai
          sản phẩm) ghi nhận trong 48 giờ qua hotline concierge hoặc ticket
          trên trang AI Concierge. Quá 48 giờ vẫn được bảo hành kỹ thuật nhưng
          không đổi mới vì lý do ngoại quan.
        </p>
      </section>
      <section>
        <h2>3. Đổi trả & hoàn tiền</h2>
        <ul>
          <li>Đổi mới trong 7 ngày nếu lỗi nhà sản xuất hoặc giao sai — hãng chịu toàn bộ phí vận chuyển.</li>
          <li>Hoàn tiền qua đúng kênh thanh toán ban đầu (VNPay hoàn về tài khoản, chuyển khoản hoàn tay có mã tham chiếu).</li>
          <li>Hàng bespoke/khắc tên riêng: không đổi trả trừ lỗi chế tác — giá chốt xác nhận qua email trước sản xuất.</li>
          <li>Hủy đơn PENDING bất cứ lúc nào trên trang tra đơn; đơn đã PAID muốn hủy phải qua hoàn tiền (REFUNDED).</li>
        </ul>
      </section>
      <section>
        <h2>4. Bảo hành</h2>
        <p>
          Bảo hành quốc tế 5 năm cho bộ máy theo tiêu chuẩn COSC tại mọi Salon.
          Không bao gồm: va đập, vào nước ngoài chuẩn kháng nước, tự tháo máy
          ngoài atelier, dây da hao mòn tự nhiên.
        </p>
      </section>
    </LegalLayout>
  );
}
