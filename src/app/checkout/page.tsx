
"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import VaultItemCard from "@/components/VaultItemCard";
import { formatUsd, formatVnd } from "@/data/products";

export default function Page() {
  const { items, totalQty, totalUsd, totalVnd, clear } = useCart();
  const deposit = Math.round(totalUsd * 0.2);
  const [name, setName] = useState("Michel Du Pont");
  const [contact, setContact] = useState("+84 90 888 9999 (Private Encrypted)");
  const [address, setAddress] = useState("Penthouse B-3201, Tòa tháp The Crown, Quận 1, TP. Hồ Chí Minh");
  const [slot, setSlot] = useState("10:00 - 12:00 (Sáng) • Khung giờ kín đáo");
  const [pin, setPin] = useState("********");
  const [placed, setPlaced] = useState<string | null>(null);
  const [orderError, setOrderError] = useState("");
  const [pay, setPay] = useState("centurion");
  const [processing, setProcessing] = useState<string | null>(null);

  const PAY_LABELS: Record<string, string> = {
    centurion: "Centurion Black Card / Visa Infinite",
    escrow: "Swiss Escrow Wire",
    deposit: "Đặt cọc 20%",
    vnpay: "VNPay",
  };
  const chargeNow = pay === "deposit" ? deposit : totalUsd;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const placeOrder = async () => {
    if (items.length === 0 || placed || processing) return;
    setOrderError("");
    setProcessing("Tạo đơn & niêm ấn Vault...");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          contact,
          address,
          slot,
          items: items.map((i) => ({
            slug: i.slug,
            name: i.name,
            priceUsd: i.priceUsd,
            priceVnd: i.priceVnd,
            image: i.image,
            strap: i.strap,
            engraving: i.engraving,
            qty: i.qty,
          })),
          payment: { method: pay },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi tạo đơn hàng");
      clear();
      if (pay === "vnpay") {
        setProcessing("Chuyển sang cổng thanh toán VNPay...");
        const pr = await fetch("/api/payments/vnpay/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: data.orderId }),
        });
        const pd = await pr.json();
        if (!pr.ok) throw new Error(pd.error ?? "Lỗi tạo thanh toán VNPay");
        window.location.href = pd.url as string;
        return;
      }
      setProcessing("Mã hóa PCI-DSS Level 1...");
      await sleep(850);
      setProcessing("Xác thực hạn mức với ngân hàng phát hành...");
      await sleep(950);
      setProcessing("Kích hoạt Concierge & niêm ấn Vault...");
      await sleep(900);
      setPlaced(data.code as string);
      setProcessing(null);
    } catch (e) {
      setProcessing(null);
      setOrderError(e instanceof Error ? e.message : "Lỗi đặt hàng");
    }
  };

  return (
  <div className="flex flex-col w-full">
  <div className="flex flex-col w-full">
{/* Progress Milestone Header */}
<section className="w-full bg-surface-container-lowest px-gutter-desktop py-space-xl">
<div className="max-w-[1360px] mx-auto">
<div className="flex flex-col md:flex-row md:items-end justify-between mb-space-lg gap-space-sm">
<div>
<span className="font-label-badge text-label-badge uppercase tracking-[0.25em] text-secondary flex items-center gap-space-xs">
<span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            Private Vault Protocol • Ref. AC-902-DX
          </span>
<h1 className="font-display-hero text-headline-lg text-on-surface mt-space-2xs">Bespoke Acquisition &amp; Concierge</h1>
</div>
<div className="flex items-center gap-space-sm font-label-spec text-label-spec text-on-surface-variant bg-surface-container-high px-space-md py-space-xs rounded">
<span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
<span>Swiss Escrow Encryption Active • SHA-256</span>
</div>
</div>
{/* Linear Stepper Bar */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm pt-space-xs">
{/* Step 1: Active */}
<div className="relative flex flex-col p-space-md bg-surface-container rounded transition-all">
<div className="flex items-center justify-between mb-space-2xs">
<span className="font-label-badge text-label-badge text-primary uppercase tracking-widest font-bold">Giai Đoạn 01</span>
<span className="material-symbols-outlined text-primary text-[18px]">adjust</span>
</div>
<p className="font-title-editorial text-body-md text-on-surface font-medium">Kiệt tác đã chọn</p>
<span className="font-body-sm text-body-sm text-secondary mt-space-2xs flex items-center gap-1">
            Đang cấu hình <span className="w-1 h-1 rounded-full bg-primary"></span>
</span>
<div className="w-full h-1 bg-primary mt-space-sm rounded-full"></div>
</div>
{/* Step 2 */}
<div className="relative flex flex-col p-space-md bg-surface-container-low rounded">
<div className="flex items-center justify-between mb-space-2xs">
<span className="font-label-badge text-label-badge text-on-surface-variant/70 uppercase tracking-widest">Giai Đoạn 02</span>
<span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">palette</span>
</div>
<p className="font-title-editorial text-body-md text-on-surface-variant">Bespoke &amp; Đóng gói</p>
<span className="font-body-sm text-body-sm text-on-surface-variant/60 mt-space-2xs">Niêm ấn xi đỏ &amp; Thư pháp</span>
<div className="w-full h-1 bg-surface-container-highest mt-space-sm rounded-full"></div>
</div>
{/* Step 3 */}
<div className="relative flex flex-col p-space-md bg-surface-container-low rounded">
<div className="flex items-center justify-between mb-space-2xs">
<span className="font-label-badge text-label-badge text-on-surface-variant/70 uppercase tracking-widest">Giai Đoạn 03</span>
<span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">local_shipping</span>
</div>
<p className="font-title-editorial text-body-md text-on-surface-variant">Vận chuyển VIP</p>
<span className="font-body-sm text-body-sm text-on-surface-variant/60 mt-space-2xs">Chuyên xe bọc thép có vệ sĩ</span>
<div className="w-full h-1 bg-surface-container-highest mt-space-sm rounded-full"></div>
</div>
{/* Step 4 */}
<div className="relative flex flex-col p-space-md bg-surface-container-low rounded">
<div className="flex items-center justify-between mb-space-2xs">
<span className="font-label-badge text-label-badge text-on-surface-variant/70 uppercase tracking-widest">Giai Đoạn 04</span>
<span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">lock</span>
</div>
<p className="font-title-editorial text-body-md text-on-surface-variant">Thanh toán bảo mật</p>
<span className="font-body-sm text-body-sm text-on-surface-variant/60 mt-space-2xs">Centurion / Escrow Wire</span>
<div className="w-full h-1 bg-surface-container-highest mt-space-sm rounded-full"></div>
</div>
</div>
</div>
</section>
{/* Main Checkout Workspace */}
<section className="w-full px-gutter-desktop py-space-2xl bg-surface">
<div className="max-w-[1360px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-space-2xl items-start">
{/* Left Column: Acquisition, Customization, Delivery (8 Cols) */}
<div className="lg:col-span-8 space-y-space-2xl">
{/* Curated Acquisition Section */}
          <div>
          {items.length === 0 && !placed ? (
            <div className="bg-surface-container-lowest rounded-lg p-space-xl shadow-xl text-center flex flex-col items-center gap-space-sm">
              <span className="material-symbols-outlined text-5xl text-outline-variant">shopping_bag</span>
              <p className="font-title-editorial text-title-editorial text-on-surface">Vault của quý khách hiện trống</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Hãy tuyển chọn kiệt tác đầu tiên từ bộ sưu tập Genève 2025.</p>
              <Link href="/collections" className="mt-space-sm px-space-xl py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-colors">
                Khám Phá Bộ Sưu Tập
              </Link>
            </div>
          ) : (
            <div className="space-y-space-lg">
              {items.map((item) => (
                <VaultItemCard key={`${item.slug}-${item.strap}`} item={item} />
              ))}
            </div>
          )}
          {/* Included Atelier Artifacts (Gratis) */}
<div className="mt-space-lg pt-space-md bg-surface-container-low/80 p-space-md rounded">
<h3 className="font-label-spec text-label-spec text-secondary uppercase tracking-[0.2em] mb-space-sm flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[18px]">inventory_2</span>
              Vật Phẩm Đồng Hành Hoàng Gia Đi Kèm (Complimentary Atelier Suites)
            </h3>
<div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
<div className="bg-surface-container p-space-sm rounded flex gap-space-xs items-start">
<span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">nest_eco_leaf</span>
<div>
<h4 className="font-title-editorial text-body-sm text-on-surface font-semibold">Hộp Gỗ Óc Chó Jura</h4>
<p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1 leading-snug">Chế tác thủ công từ thung lũng Vallée de Joux, lót nhung tơ tằm.</p>
</div>
</div>
<div className="bg-surface-container p-space-sm rounded flex gap-space-xs items-start">
<span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">workspace_premium</span>
<div>
<h4 className="font-title-editorial text-body-sm text-on-surface font-semibold">Chứng Thư COSC Da Thật</h4>
<p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1 leading-snug">Sổ da thuộc thảo mộc ghi nhận 360 giờ kiểm định áp suất và độ chuẩn xác.</p>
</div>
</div>
<div className="bg-surface-container p-space-sm rounded flex gap-space-xs items-start">
<span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">search_insights</span>
<div>
<h4 className="font-title-editorial text-body-sm text-on-surface font-semibold">Kính Lúp Horloger Mạ Vàng</h4>
<p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1 leading-snug">Kính quang học độ phóng đại 10x chế tác riêng phục vụ chiêm ngưỡng chi tiết vi cơ.</p>
</div>
</div>
</div>
</div>
</div>
{/* Section: Royal Gifting & Bespoke Crafting Services */}
<div className="bg-surface-container-lowest rounded-lg p-space-lg md:p-space-xl shadow-xl space-y-space-lg">
<div className="flex items-center justify-between pb-space-sm bg-surface-container-low/60 -mx-space-lg -mt-space-lg px-space-lg pt-space-md rounded-t-lg">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-primary text-[20px]">card_giftcard</span>
<span className="font-label-spec text-label-spec text-primary uppercase tracking-[0.2em]">Dịch Vụ Đóng Gói Quà Tặng Hoàng Gia &amp; Métiers d’Art</span>
</div>
<span className="font-label-badge text-label-badge text-secondary bg-surface-container-high px-2 py-0.5 rounded uppercase">Complimentary Bespoke</span>
</div>
{/* Feature 1: Calligraphy Card & Wax Seal */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
<div className="bg-surface-container p-space-md rounded flex flex-col justify-between">
<div>
<div className="flex items-center justify-between mb-space-xs">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-secondary text-[20px]">history_edu</span>
<h3 className="font-title-editorial text-body-md text-on-surface">Thiệp Thư Pháp Viết Tay Mạ Vàng</h3>
</div>
<input defaultChecked className="w-4 h-4 accent-primary rounded cursor-pointer" type="checkbox"/>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-sm">
                  Nghệ nhân thư pháp tại Genève chép tay bằng mực vàng 24K trên giấy dó sợi bông truyền thống nước Ý.
                </p>
<label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">Thông điệp đề tặng (Tối đa 120 ký tự):</label>
<textarea className="w-full bg-surface-container-lowest text-on-surface text-body-sm p-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/40 resize-none" rows={3} defaultValue={`Gửi tặng Ngài M. Du Pont, ghi dấu cột mốc vinh quang và trường cửu của di sản gia tộc. Thân ái.`} />
</div>
<span className="font-label-badge text-label-badge text-secondary mt-space-sm block">Bao gồm huy hiệu đóng dấu nổi của xưởng Aurel &amp; Co.</span>
</div>
{/* Feature 2: Signature Wax Seal & Silk Ribbon */}
<div className="bg-surface-container p-space-md rounded flex flex-col justify-between">
<div>
<div className="flex items-center justify-between mb-space-xs">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-secondary text-[20px]">verified</span>
<h3 className="font-title-editorial text-body-md text-on-surface">Niêm Phong Xi Đỏ &amp; Lụa Satin Cao Cấp</h3>
</div>
<input defaultChecked className="w-4 h-4 accent-primary rounded cursor-pointer" type="checkbox"/>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-sm">
                  Bao bọc trong vải nhung đen chống tĩnh điện, thắt ruy băng lụa tơ tằm dệt tay và niêm phong bằng sáp ong đỏ tự nhiên có con dấu gia huy của hãng.
                </p>
<div className="bg-surface-container-lowest p-space-sm rounded flex items-center gap-space-sm">
<div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-title-editorial font-bold text-headline-sm shadow-inner">
                    A
                  </div>
<div>
<span className="font-label-spec text-label-spec text-on-surface block uppercase">Dấu Xi Thụy Sĩ Độc Quyền</span>
<span className="text-on-surface-variant/60 text-xs">Chỉ được mở lần đầu tiên bởi chủ nhân sở hữu kiệt tác.</span>
</div>
</div>
</div>
<span className="font-label-badge text-label-badge text-secondary mt-space-sm block">Đạt tiêu chuẩn an ninh di sản lưu trữ bảo tàng.</span>
</div>
</div>
{/* Feature 3: Bespoke Engraving Preview */}
<div className="bg-surface-container p-space-md rounded">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs mb-space-sm">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-primary text-[20px]">precision_manufacturing</span>
<h3 className="font-title-editorial text-body-md text-on-surface">Khắc Khẩu Hiệu Riêng (Laser &amp; Hand Beveling)</h3>
</div>
<span className="font-label-badge text-label-badge text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">Đã cấu hình chính xác</span>
</div>
<div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md items-center">
<div className="sm:col-span-2">
<input className="w-full bg-surface-container-lowest px-space-md py-space-xs rounded text-body-md text-primary font-title-editorial uppercase tracking-[0.2em] focus:outline-none focus:ring-1 focus:ring-primary" type="text" defaultValue="CHOPIN 1853 - M.D."/>
<span className="text-xs text-on-surface-variant/70 mt-1 block">Khắc trực tiếp lên khung rotor vàng 21K của cỗ máy chuyển động Tourbillon.</span>
</div>
<div className="bg-surface-container-lowest p-space-xs rounded text-center">
<span className="font-label-badge text-label-badge text-on-surface-variant uppercase block">Độ sâu khắc</span>
<span className="font-headline-sm text-body-lg text-secondary">0.18 mm</span>
</div>
</div>
</div>
</div>
{/* Section: High-Security Concierge Delivery */}
<div className="bg-surface-container-lowest rounded-lg p-space-lg md:p-space-xl shadow-xl space-y-space-lg">
<div className="flex items-center justify-between pb-space-sm bg-surface-container-low/60 -mx-space-lg -mt-space-lg px-space-lg pt-space-md rounded-t-lg">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-primary text-[20px]">shield</span>
<span className="font-label-spec text-label-spec text-primary uppercase tracking-[0.2em]">Phương Thức Giao Nhận An Ninh Tối Cao (Armored VIP Transit)</span>
</div>
<span className="font-label-badge text-label-badge text-secondary bg-surface-container-high px-2 py-0.5 rounded uppercase">Bảo Hiểm Toàn Diện 100%</span>
</div>
{/* Radio Selection for Delivery Type */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
{/* Option 1: Armored Vehicle */}
<label className="relative flex flex-col p-space-md bg-surface-container rounded cursor-pointer hover:bg-surface-container-high transition-colors">
<div className="flex items-center justify-between mb-space-xs">
<div className="flex items-center gap-space-xs">
<input defaultChecked className="accent-primary w-4 h-4 cursor-pointer" name="delivery_method" type="radio" value="armored"/>
<span className="font-title-editorial text-body-md text-on-surface font-semibold">Chuyên Xe Bọc Thép &amp; Vệ Sĩ Riêng</span>
</div>
<span className="font-label-badge text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded uppercase font-bold">VIP Concierge</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 pl-6 leading-relaxed">
                Đội ngũ vệ sĩ ngoại giao và chuyên gia đồng hồ trực tiếp chuyển giao tận cửa dinh thự / biệt thự tư nhân. Bao gồm thiết bị kiểm tra số serial vi cơ tại chỗ.
              </p>
<span className="font-label-spec text-label-spec text-secondary pl-6 mt-space-sm block uppercase tracking-wider">Cước phí: $0 (Miễn phí toàn cầu)</span>
</label>
{/* Option 2: Private Salon Reception */}
<label className="relative flex flex-col p-space-md bg-surface-container-low rounded cursor-pointer hover:bg-surface-container transition-colors">
<div className="flex items-center justify-between mb-space-xs">
<div className="flex items-center gap-space-xs">
<input className="accent-primary w-4 h-4 cursor-pointer" name="delivery_method" type="radio" value="salon"/>
<span className="font-title-editorial text-body-md text-on-surface font-semibold">Diễn Kiến Tại Private VIP Salon</span>
</div>
<span className="font-label-badge text-[10px] text-secondary bg-surface-container-high px-2 py-0.5 rounded uppercase">Salon Privé</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant/80 pl-6 leading-relaxed">
                Tiếp đón thượng khách tại phòng trưng bày bí mật (Flagship Metropole Hà Nội hoặc Salon D'Or TP. Hồ Chí Minh). Thưởng thức champagne Dom Pérignon và nghi thức bàn giao.
              </p>
<span className="font-label-spec text-label-spec text-secondary pl-6 mt-space-sm block uppercase tracking-wider">Cước phí: $0 (Bao gồm tiệc riêng)</span>
</label>
</div>
{/* Address Form Fields for Secure Delivery */}
<div className="space-y-space-md bg-surface-container p-space-md rounded">
<h4 className="font-label-spec text-label-spec text-secondary uppercase tracking-[0.2em] mb-space-xs">Thông Tin Tư Gia &amp; Đại Diện Ủy Quyền</h4>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
<div>
<label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">Họ Tên Thượng Khách / Đại Diện</label>
<input className="w-full bg-surface-container-lowest text-on-surface text-body-sm px-space-md py-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Nhập tên chính xác trên hộ chiếu..." type="text" value={name} onChange={(e) => setName(e.target.value)}/>
</div>
<div>
<label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">Kênh Liên Lạc Bảo Mật (Signal / WhatsApp VIP)</label>
<input className="w-full bg-surface-container-lowest text-on-surface text-body-sm px-space-md py-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary" type="text" value={contact} onChange={(e) => setContact(e.target.value)}/>
</div>
</div>
<div>
<label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">Địa Chỉ Dinh Thự / Văn Phòng Bảo Mật</label>
<input className="w-full bg-surface-container-lowest text-on-surface text-body-sm px-space-md py-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary" type="text" value={address} onChange={(e) => setAddress(e.target.value)}/>
</div>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
<div>
<label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">Khung Giờ Bàn Giao Mong Muốn</label>
<select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full bg-surface-container-lowest text-on-surface text-body-sm px-space-md py-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary">
<option>10:00 - 12:00 (Sáng) • Khung giờ kín đáo</option>
<option>14:30 - 16:30 (Chiều) • Buổi thử trực tiếp</option>
<option>19:00 - 21:00 (Tối) • Yến tiệc tiếp tân</option>
</select>
</div>
<div>
<label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">Mã Nhận Diện Bảo Mật (PIN An Ninh Bàn Giao)</label>
<input className="w-full bg-surface-container-lowest text-on-surface text-body-sm px-space-md py-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary" type="password" value={pin} onChange={(e) => setPin(e.target.value)}/>
</div>
</div>
</div>
</div>
</div>
{/* Right Column: Vault Summary, Escrow Payment & CTA (4 Cols) */}
<div className="lg:col-span-4 space-y-space-lg lg:sticky lg:top-24">
{placed && (
            <div className="bg-surface-container-lowest rounded-lg p-space-lg shadow-2xl border border-primary/50 flex items-start gap-space-sm">
              <span className="material-symbols-outlined text-primary text-[28px]">verified</span>
              <div>
                <p className="font-title-editorial text-title-editorial text-on-surface">Đặt hàng thành công • Mã Vault {placed}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Concierge sẽ liên hệ {contact || "kênh bảo mật"} trong 2 giờ làm việc để xác nhận khung giờ {slot}.</p>
                <p className="font-body-sm text-body-sm text-secondary mt-1">Đã ghi nợ {formatUsd(chargeNow)} qua {PAY_LABELS[pay]} (mô phỏng — không phát sinh giao dịch thật).</p>
              </div>
            </div>
          )}
          {/* Order Summary Card */}
<div className="bg-surface-container-lowest rounded-lg p-space-lg shadow-2xl space-y-space-md">
<div className="flex items-center justify-between pb-space-sm bg-surface-container-low/60 -mx-space-lg -mt-space-lg px-space-lg pt-space-md rounded-t-lg">
<span className="font-title-editorial text-title-editorial text-on-surface uppercase tracking-wider">Hóa Đơn Bảo Chứng</span>
<span className="font-label-badge text-label-badge text-primary uppercase">Vault Certificate</span>
</div>
{/* Breakdown items */}
<div className="space-y-space-sm font-body-sm text-body-sm">
<div className="flex justify-between text-on-surface-variant">
<span>Giá trị ({totalQty} kiệt tác trong Vault):</span>
<span className="font-semibold text-on-surface">{formatUsd(totalUsd)}</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>Hộp gỗ óc chó &amp; Chứng chỉ COSC:</span>
<span className="text-secondary font-medium">Bao gồm ($0)</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>Nghệ thuật đóng gói hoàng gia &amp; Xi sáp:</span>
<span className="text-secondary font-medium">Complimentary</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>Khắc tên riêng bằng tia laser:</span>
<span className="text-secondary font-medium">Complimentary</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>Vận chuyển an ninh bọc thép có vệ sĩ:</span>
<span className="text-secondary font-medium">Miễn phí ($0)</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>Thuế nhập khẩu &amp; Bảo hiểm hàng hải:</span>
<span className="text-secondary font-medium">Đã thanh toán đủ</span>
</div>
</div>
{/* Total Calculation */}
<div className="pt-space-md bg-surface-container p-space-md rounded">
<span className="font-label-spec text-label-spec text-on-surface-variant uppercase tracking-widest block mb-1">Tổng Quyết Toán Chuyển Nhượng:</span>
<div className="flex items-baseline justify-between">
<span className="font-headline-md text-headline-md text-primary font-bold tracking-tight">{formatUsd(totalUsd)}</span>
<span className="font-label-badge text-label-badge text-on-surface-variant uppercase font-semibold">USD NET</span>
</div>
<span className="font-body-sm text-body-sm text-secondary block mt-1">Khoảng ~{formatVnd(totalVnd)}</span>
</div>
{/* Payment Options Architecture */}
<div className="pt-space-sm space-y-space-sm">
<h4 className="font-label-spec text-label-spec text-primary uppercase tracking-[0.15em] flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
              Phương Thức Thanh Toán Đặc Quyền
            </h4>
{/* Option A: Centurion Black Card / Visa Infinite */}
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
<input checked={pay === "centurion"} onChange={() => setPay("centurion")} className="accent-primary w-4 h-4 cursor-pointer" name="payment_tier" type="radio" value="centurion"/>
<div className="flex flex-col">
<span className="font-body-md text-body-md text-on-surface font-medium flex items-center gap-1">
                  Centurion Black Card / Visa Infinite
                </span>
<span className="text-xs text-on-surface-variant/70">Mã hóa chuẩn PCI-DSS Level 1</span>
</div>
</label>
{/* Option B: Escrow Wire Transfer */}
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
<input checked={pay === "escrow"} onChange={() => setPay("escrow")} className="accent-primary w-4 h-4 cursor-pointer" name="payment_tier" type="radio" value="escrow"/>
<div className="flex flex-col">
<span className="font-body-md text-body-md text-on-surface font-medium">Chuyển Khoản Bảo Chứng (Swiss Escrow Wire)</span>
<span className="text-xs text-on-surface-variant/70">Ký quỹ an toàn tại Credit Suisse Genève</span>
</div>
</label>
{/* Option C: 20% Deposit & 80% on Delivery */}
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
<input checked={pay === "deposit"} onChange={() => setPay("deposit")} className="accent-primary w-4 h-4 cursor-pointer" name="payment_tier" type="radio" value="deposit"/>
<div className="flex flex-col">
<span className="font-body-md text-body-md text-on-surface font-medium">Đặt Cọc 20% ({formatUsd(deposit)} USD)</span>
<span className="text-xs text-on-surface-variant/70">Quyết toán 80% còn lại khi diện kiến thử đồng hồ</span>
</div>
</label>
<label className="flex items-center gap-space-sm p-space-sm rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
<input checked={pay === "vnpay"} onChange={() => setPay("vnpay")} className="accent-primary w-4 h-4 cursor-pointer" name="payment_tier" type="radio" value="vnpay"/>
<div className="flex flex-col">
<span className="font-body-md text-body-md text-on-surface font-medium">VNPay (QR / ATM / Visa qua cổng sandbox)</span>
<span className="text-xs text-on-surface-variant/70">Thanh toán ngay toàn bộ qua VNPay thử nghiệm</span>
</div>
</label>
</div>
{/* Security Assurance Badges */}
<div className="bg-surface-container-high p-space-sm rounded text-xs text-on-surface-variant space-y-1">
<div className="flex items-center gap-space-xs text-secondary font-medium">
<span className="material-symbols-outlined text-[16px]">lock_clock</span>
<span>Bảo mật chuẩn Ngân hàng Thụy Sĩ (FINMA Compliant)</span>
</div>
<p className="text-[11px] leading-snug">
              Thông tin thượng khách được lưu trữ phân tán, chỉ giải mã duy nhất cho Concierge Officer phụ trách.
            </p>
</div>
{/* Primary Gold Glowing CTA */}
<button onClick={placeOrder} disabled={placed !== null || processing !== null || items.length === 0} className="w-full py-space-md px-space-lg rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-bold hover:bg-secondary transition-all shadow-xl flex items-center justify-center gap-space-xs group disabled:opacity-50" type="button">
{processing ? (
            <span className="flex items-center gap-space-xs">
              <span className="w-4 h-4 rounded-full border-2 border-on-primary/40 border-t-on-primary animate-spin"></span>
              <span>{processing}</span>
            </span>
          ) : placed ? (
            <span>ĐÃ XÁC NHẬN {placed} ✓</span>
          ) : (
            <span>XÁC NHẬN ĐẶT HÀNG &amp; KÍCH HOẠT DỊCH VỤ CONCIERGE</span>
          )}
<span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
</button>
{orderError && (
  <p className="rounded border border-error/40 bg-error-container/20 px-space-md py-space-sm font-body-sm text-body-sm text-error">
    {orderError}
  </p>
)}
{/* Direct Hotline to Private Banker/Concierge */}
<div className="text-center pt-space-xs">
<a className="inline-flex items-center gap-space-xs text-xs text-on-surface-variant hover:text-primary transition-colors" href="/collections">
<span className="material-symbols-outlined text-[14px]">support_agent</span>
<span>Cần trợ giúp riêng? Kết nối trực tiếp Giám đốc Salon Genève (+41 22 819 0000)</span>
</a>
</div>
</div>
{/* Trust & Origin Micro-Card */}
<div className="bg-surface-container-lowest rounded-lg p-space-md flex items-center gap-space-md shadow-md">
<div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center text-primary shrink-0">
<span className="material-symbols-outlined text-[28px]">token</span>
</div>
<div>
<h5 className="font-title-editorial text-body-sm text-on-surface font-semibold">Thẻ Nhận Diện Kim Loại NFC Kèm Theo</h5>
<p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
              Tích hợp chip mã hóa lưu trữ lịch sử chế tác, danh tính nghệ nhân trưởng và quyền vào các dạ tiệc kín.
            </p>
</div>
</div>
</div>
</div>
</section>
</div>
  </div>
  );
}
