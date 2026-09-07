"use client";

import Image from "next/image";
import { useState } from "react";
import GoldButton from "@/components/GoldButton";
import { useCurrency } from "@/components/CurrencyProvider";
import { csrfFetch } from "@/lib/api-client";
import { USD_TO_VND } from "@/lib/pricing";

type Option = {
  id: string;
  label: string;
  desc: string;
  priceUsd: number;
  image?: string;
};

const movements: Option[] = [
  {
    id: "tourbillon",
    label: "Tourbillon Bay",
    desc: "Bộ máy bậc thầy triệt tiêu trọng trường, 72 giờ trữ cót.",
    priceUsd: 120000,
    image: "/images/extreme-macro-extreme-close-up-view-of-a-watch-tourbillon-ca.jpg",
  },
  {
    id: "perpetual",
    label: "Lịch Vạn Niên",
    desc: "Quantième perpétuel thiên văn chính xác tới năm 2100.",
    priceUsd: 88000,
    image: "/images/celestial-moonphase-obsidian-watch-with-black-iridescent-met.jpg",
  },
  {
    id: "chronograph",
    label: "Chronograph Flyback",
    desc: "Bấm giờ bánh sắc cổ điển với chức năng flyback.",
    priceUsd: 52000,
    image: "/images/royal-chronograph-flyback-watch-with-black-ceramic-bezel-hig.jpg",
  },
];

const cases: Option[] = [
  { id: "platinum", label: "Platinum 950", desc: "Kim loại quý hiếm nhất, trọng lượng đầm tay.", priceUsd: 45000 },
  { id: "rose-gold", label: "Vàng Hồng 18k", desc: "Hợp kim 5N truyền thống Genève.", priceUsd: 28000 },
  { id: "titanium", label: "Titanium Gr.5", desc: "Nhẹ gấp 2 lần thép, chống kích ứng da.", priceUsd: 12000 },
  { id: "carbon", label: "Forged Carbon", desc: "Vân carbon độc bản, siêu nhẹ siêu cứng.", priceUsd: 15000 },
];

const dials: Option[] = [
  { id: "obsidian", label: "Obsidian Chải Tia", desc: "Mặt đen huyền chải tia thủ công.", priceUsd: 0 },
  { id: "meteorite", label: "Đá Thiên Thạch", desc: "Muonionalusta tự nhiên, vân Widmanstätten.", priceUsd: 18000 },
  { id: "enamel", label: "Men Grand Feu", desc: "Nung 820°C bốn lần, trắng ngà vĩnh cửu.", priceUsd: 22000 },
  { id: "skeleton", label: "Sapphire Trong Suốt", desc: "Lộ cơ hoàn toàn qua mặt số sapphire.", priceUsd: 16000 },
];

const personalizations: Option[] = [
  { id: "engraving", label: "Khắc Thơ Tại Lưng Vỏ", desc: "Nét chữ khắc tay bởi nghệ nhân Genève.", priceUsd: 3500 },
  { id: "signature", label: "Chữ Ký Chăm Tấu", desc: "Chữ ký cá nhân dập nổi trên mặt số.", priceUsd: 6000 },
  { id: "jewel", label: "Gắn Đá Chủ Yêu Cầu", desc: "Tuyển đá theo brief riêng của khách hàng.", priceUsd: 25000 },
  { id: "none", label: "Giữ Nguyên Bản", desc: "Kiệt tác ở trạng thái atelier xuất xưởng.", priceUsd: 0 },
];

const journeySteps = [
  { title: "Tư Vấn Ý Tưởng", desc: "Trao đổi trực tiếp với giám đốc sáng tạo về câu chuyện bạn muốn khắc lên thòi gian." },
  { title: "Phác Thảo Thiết Kế", desc: "Atelier vẽ bản kỹ thuật 3D và mẫu in chỉ số tay." },
  { title: "Chế Tác Bộ Máy", desc: "14 — 24 tháng trong xưởng Genève với một bậc thầy duy nhất." },
  { title: "Chứng Nhận & Bàn Giao", desc: "Kiểm định COSC, khắc số đăng ký và bàn giao tại Private Salon." },
];

function StepOption({
  option,
  selected,
  onSelect,
}: {
  option: Option;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-4 border p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-outline-variant/35 hover:border-outline"
      }`}
    >
      {option.image && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden border border-outline-variant/30">
          <Image src={option.image!} alt={option.label} fill sizes="64px" className="object-cover" />
        </div>
      )}
      <div className="flex-1">
        <div className={`font-display text-base font-medium ${selected ? "text-primary" : ""}`}>
          {option.label}
        </div>
        <p className="mt-0.5 text-xs text-on-surface-variant/75">{option.desc}</p>
      </div>
      {option.priceUsd > 0 && (
        <div className="text-xs font-semibold text-secondary">
          +${option.priceUsd.toLocaleString("en-US")}
        </div>
      )}
      <span
        className={`material-symbols-outlined text-xl ${
          selected ? "text-primary" : "text-outline-variant/50"
        }`}
      >
        {selected ? "check_circle" : "radio_button_unchecked"}
      </span>
    </button>
  );
}

export default function BespokeConfigurator() {
  const { price } = useCurrency();
  const [step, setStep] = useState(0);
  const [movement, setMovement] = useState<Option>(movements[0]);
  const [caseOpt, setCaseOpt] = useState<Option>(cases[0]);
  const [dial, setDial] = useState<Option>(dials[0]);
  const [personal, setPersonal] = useState<Option>(personalizations[3]);
  const [initials, setInitials] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [contactError, setContactError] = useState("");

  const totalUsd =
    movement.priceUsd + caseOpt.priceUsd + dial.priceUsd + personal.priceUsd;
  const totalVnd = totalUsd * USD_TO_VND;

  const steps = [
    { title: "Bộ Máy", icon: "settings", options: movements, value: movement, set: setMovement },
    { title: "Vỏ Kim Loại", icon: "deployed_code", options: cases, value: caseOpt, set: setCaseOpt },
    { title: "Mặt Số Métiers d'Art", icon: "palette", options: dials, value: dial, set: setDial },
    { title: "Cá Nhân Hóa", icon: "draw", options: personalizations, value: personal, set: setPersonal },
  ];
  const current = steps[step];

  const submitInquiry = async () => {
    if (!contact.name.trim() || !contact.phone.trim()) {
      setContactError("Vui lòng điền họ tên và số điện thoại để concierge liên hệ.");
      return;
    }
    setContactError("");
    setSending(true);
    try {
      const res = await csrfFetch("/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "BESPOKE",
          name: contact.name,
          phone: contact.phone,
          email: contact.email || undefined,
          message: initials || undefined,
          payload: {
            movement: movement.label,
            case: caseOpt.label,
            dial: dial.label,
            personalization: personal.label,
            estimatedUsd: totalUsd,
          },
        }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setContactError("Gửi thất bại — vui lòng thử lại hoặc gọi concierge.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-6 py-28 text-center">
        <span className="material-symbols-outlined text-6xl text-primary">task_alt</span>
        <h2 className="font-display text-3xl font-medium text-gold-gradient">
          Đơn Đăng Ký Bespoke Đã Gửi
        </h2>
        <p className="text-sm leading-relaxed text-on-surface-variant/85">
          Cấu hình của bạn: {movement.label} • Vỏ {caseOpt.label} • Mặt số{" "}
          {dial.label} • {personal.label}. Giám đốc sáng tạo sẽ liên hệ trong 48
          giờ để bắt đầu phác thảo.
        </p>
        <GoldButton variant="secondary" href="/collections" icon="arrow_forward">
          Khám Phá Bộ Sưu Tập
        </GoldButton>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-page gap-10 px-4 py-12 md:px-8 lg:grid-cols-12">
      {/* ===== Steps workspace ===== */}
      <div className="lg:col-span-8">
        {/* Step indicator */}
        <div className="grid grid-cols-4 gap-2">
          {steps.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setStep(i)}
              className={`flex flex-col items-center gap-1.5 border px-2 py-3 transition-colors ${
                i === step
                  ? "border-primary text-primary"
                  : i < step
                    ? "border-primary-container/40 text-secondary"
                    : "border-outline-variant/30 text-on-surface-variant/60"
              }`}
            >
              <span className="material-symbols-outlined text-xl">{s.icon}</span>
              <span className="text-[9px] tracking-[0.12em] uppercase md:text-[10px]">
                {i + 1}. {s.title}
              </span>
            </button>
          ))}
        </div>

        {/* Current step options */}
        <div className="mt-8">
          <h3 className="font-display text-2xl font-medium">
            {current.title}
          </h3>
          <div className="mt-5 space-y-3">
            {current.options.map((opt) => (
              <StepOption
                key={opt.id}
                option={opt}
                selected={current.value.id === opt.id}
                onSelect={() => current.set(opt)}
              />
            ))}
          </div>

          {step === 3 && personal.id !== "none" && (
            <div className="mt-5">
              <label className="text-[10px] tracking-[0.25em] text-on-surface-variant/70 uppercase">
                Viết Lời Nhắn / Họ Tên Đặc Biệt
              </label>
              <input
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                maxLength={40}
                placeholder="Ví dụ: 'Pour mon père — avec le temps'"
                className="mt-2 w-full border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary"
              />
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 border border-outline-variant/30 bg-surface-container/40 p-5">
              <span className="text-[10px] tracking-[0.25em] text-primary uppercase">
                Thông Tin Liên Hệ Của Bạn
              </span>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  placeholder="Họ tên *"
                  className="border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary"
                />
                <input
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  placeholder="Số điện thoại *"
                  className="border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary"
                />
                <input
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  placeholder="Email (không bắt buộc)"
                  type="email"
                  className="border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary sm:col-span-2"
                />
              </div>
              {contactError && (
                <p className="mt-3 text-sm text-red-400">{contactError}</p>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-between">
            <GoldButton
              variant="secondary"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className={step === 0 ? "pointer-events-none opacity-40" : ""}
            >
              Quay Lại
            </GoldButton>
            {step < 3 ? (
              <GoldButton onClick={() => setStep((s) => Math.min(3, s + 1))} icon="arrow_forward">
                Tiếp Tục
              </GoldButton>
            ) : (
              <GoldButton onClick={submitInquiry} icon="send" className={sending ? "pointer-events-none opacity-50" : ""}>
                {sending ? "Đang Gửi..." : "Gửi Đơn Đăng Ký"}
              </GoldButton>
            )}
          </div>
        </div>
      </div>

      {/* ===== Sticky price estimator ===== */}
      <aside className="lg:col-span-4">
        <div className="gold-border-card sticky top-32 p-6">
          <div className="text-[10px] tracking-[0.3em] text-primary uppercase">
            Ước Tính Thời Gian Thực
          </div>
          <div className="font-display mt-2 text-3xl font-semibold">
            {price(totalUsd, totalVnd)}
          </div>
          <div className="mt-1 text-[11px] text-on-surface-variant/60">
            Ước tính ban đầu — xác nhận sau buổi tư vấn
          </div>

          <div className="mt-5 space-y-3 border-t border-outline-variant/20 pt-5 text-sm">
            {[
              { l: "Bộ máy", v: movement },
              { l: "Vỏ", v: caseOpt },
              { l: "Mặt số", v: dial },
              { l: "Cá nhân hóa", v: personal },
            ].map(({ l, v }) => (
              <div key={l} className="flex justify-between gap-3">
                <span className="text-on-surface-variant/70">{l}</span>
                <span className="text-right font-medium">{v.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-outline-variant/20 pt-5">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant/70">Thời gian chế tác</span>
              <span className="font-medium text-primary">14 — 24 tháng</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-on-surface-variant/70">Đặt cọc</span>
              <span className="font-medium text-primary">
                {price(Math.round(totalUsd * 0.2), Math.round(totalVnd * 0.2))}
              </span>
            </div>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-on-surface-variant/60">
            Mỗi chiếc đồng hồ bespoke là duy nhất và không thể tái lập. Số đăng
            ký của bạn sẽ được lưu trong sổ atelier Genève.
          </p>
        </div>
      </aside>
    </div>
  );
}
