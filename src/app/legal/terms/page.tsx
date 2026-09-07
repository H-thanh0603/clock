import LegalLayout from "@/components/LegalLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều Khoản Dịch Vụ — Aurel & Co.",
  description:
    "Điều khoản sử dụng website và mua hàng trực tuyến của Aurel & Co. Haute Horlogerie.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Điều Khoản Dịch Vụ & Mua Hàng" updated="07/09/2026">
      <section>
        <h2>1. Chấp nhận điều khoản</h2>
        <p>
          Khi truy cập website hoặc đặt hàng tại Aurel &amp; Co., quý khách đồng
          ý với các điều khoản này. Nếu không đồng ý, vui lòng không sử dụng dịch
          vụ trực tuyến của chúng tôi.
        </p>
      </section>
      <section>
        <h2>2. Sản phẩm và giá cả</h2>
        <p>
          Hình ảnh sản phẩm là ảnh chụp thật; chi tiết hoàn thiện thủ công có
          thể sai khác nhẹ giữa các chiếc (đặc biệt với mặt đá thiên thạch và vỏ
          carbon — mỗi chiếc là độc bản). Giá hiển thị đã bao gồm thuế. Với đơn
          hàng có yêu cầu cá nhân hóa (khắc tên, bespoke), giá chốt được xác
          nhận qua email concierge trước khi sản xuất.
        </p>
      </section>
      <section>
        <h2>3. Đặt hàng và thanh toán</h2>
        <ul>
          <li>
            Đơn hàng có hiệu lực khi thanh toán VNPay thành công (VNPay xác nhận
            qua callback tự động).
          </li>
          <li>
            Với sản phẩm đặt trước (pre-order), thời hạn giao dự kiến được ghi rõ
            trên trang sản phẩm.
          </li>
          <li>
            Chúng tôi có quyền hủy đơn trong trường hợp lỗi giá hiển thị do hệ
            thống, hoàn tiền 100% trong 5 ngày làm việc.
          </li>
        </ul>
      </section>
      <section>
        <h2>4. Giao hàng và kiểm tra</h2>
        <p>
          Giao hàng qua dịch vụ vận chuyển an ninh, miễn phí toàn quốc cho mọi
          đơn hàng. Quý khách kiểm tra sản phẩm khi nhận; mọi vấn đề về ngoại
          quan ghi nhận trong 48 giờ kể từ khi nhận hàng qua hotline concierge.
        </p>
      </section>
      <section>
        <h2>5. Bảo hành</h2>
        <p>
          Bảo hành quốc tế 5 năm cho bộ máy theo tiêu chuẩn COSC, áp dụng tại
          mọi Salon của hãng. Bảo hành không bao gồm hư hỏng do va đập, vào
          nước ngoài chuẩn kháng nước, hoặc tự tháo máy ngoài atelier.
        </p>
      </section>
      <section>
        <h2>6. Quyền sở hữu trí tuệ</h2>
        <p>
          Mọi hình ảnh, nội dung và thiết kế trên website thuộc bản quyền của
          Aurel &amp; Co. Manufacture Horlogère. Không sao chép cho mục đích
          thương mại nếu không có văn bản cho phép.
        </p>
      </section>
    </LegalLayout>
  );
}
