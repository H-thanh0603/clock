import LegalLayout from "@/components/LegalLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính Sách Bảo Mật — Aurel & Co.",
  description:
    "Chính sách thu thập, sử dụng và bảo vệ thông tin cá nhân của khách hàng Aurel & Co. Haute Horlogerie.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Chính Sách Bảo Mật" updated="07/09/2026">
      <section>
        <h2>1. Phạm vi thu thập thông tin</h2>
        <p>
          Aurel &amp; Co. chỉ thu thập thông tin cần thiết để xử lý đơn hàng và
          chăm sóc khách hàng: họ tên, số điện thoại, email, địa chỉ giao hàng,
          lịch sử đơn hàng và các yêu cầu cá nhân hóa (khắc tên, cấu hình
          bespoke). Chúng tôi không thu thập thông tin nhạy cảm ngoài phạm vi
          này.
        </p>
      </section>
      <section>
        <h2>2. Mục đích sử dụng</h2>
        <ul>
          <li>Xác nhận, xử lý và giao đơn hàng; hỗ trợ bảo hành sản phẩm.</li>
          <li>Liên hệ concierge về lịch hẹn Private Salon và đơn bespoke.</li>
          <li>
            Thông báo về bộ sưu tập giới hạn — chỉ khi quý khách đồng ý nhận bản
            tin Circle Privé (rút lui bất cứ lúc nào bằng một email).
          </li>
        </ul>
      </section>
      <section>
        <h2>3. Chia sẻ với bên thứ ba</h2>
        <p>
          Chúng tôi chỉ chia sẻ dữ liệu tối thiểu với: (i) đối tác vận chuyển
          an ninh để giao hàng; (ii) VNPay — cổng thanh toán trung gian, xử lý
          giao dịch theo chuẩn bảo mật PCI-DSS của VNPay; (iii) nhà cung cấp
          dịch vụ email trong phạm vi gửi thông báo đơn hàng. Chúng tôi
          <strong> không bán hoặc cho thuê</strong> dữ liệu cá nhân cho bất kỳ
          bên nào khác.
        </p>
      </section>
      <section>
        <h2>4. Bảo mật dữ liệu</h2>
        <p>
          Mật khẩu được mã hóa bằng bcrypt. Phiên đăng nhập dùng JWT qua cookie
          HttpOnly, kèm cơ chế CSRF. Hệ thống vận hành trong môi trường giới hạn
          truy cập, dữ liệu được sao lưu định kỳ theo quy trình vận hành.
        </p>
      </section>
      <section>
        <h2>5. Quyền của quý khách</h2>
        <p>
          Theo pháp luật bảo vệ dữ liệu cá nhân, quý khách có quyền: xem dữ liệu
          chúng tôi lưu về mình trong trang Tài Khoản; yêu cầu xuất, chỉnh sửa
          hoặc xóa dữ liệu (trừ hồ sơ bắt buộc giữ theo quy định kế toán/thuế);
          và phản đối việc xử lý dữ liệu marketing. Gửi yêu cầu tới:
          privacy@aurel.example — chúng tôi phản hồi trong 30 ngày.
        </p>
      </section>
      <section>
        <h2>6. Cookie</h2>
        <p>
          Chúng tôi dùng cookie phiên đăng nhập, giỏ hàng và CSRF — đều là
          cookie thiết yếu cho website vận hành; không dùng cookie quảng cáo
          theo dõi bên thứ ba.
        </p>
      </section>
    </LegalLayout>
  );
}
