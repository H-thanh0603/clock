"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/api-client";

const field =
  "w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:bg-surface-bright transition-colors";
const label =
  "block font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-2xs";

/**
 * Form đặt lịch Private Salon (trang chủ + atelier) — lưu qua
 * POST /inquiries (type=SALON), concierge nhận Telegram/Email.
 */
export default function SalonForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    location: "Private Salon Saigon (Quận 1)",
    interest: "Grand Complication Tourbillon",
    note: "",
    agree: false,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.agree) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await csrfFetch("/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SALON",
          name: form.name,
          phone: form.phone,
          email: form.email || undefined,
          message: form.note || undefined,
          payload: { location: form.location, interest: form.interest },
        }),
      });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-space-xl text-center">
        <span className="material-symbols-outlined text-primary text-[48px]">
          mark_email_read
        </span>
        <h4 className="font-headline-sm text-headline-sm text-on-surface">
          Lịch Hẹn Đã Được Ghi Nhận
        </h4>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
          Concierge sẽ liên hệ quý khách trong vòng 2 giờ làm việc để xác nhận
          khung giờ bảo mật. Cảm ơn sự tin tưởng của quý khách.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-space-md" onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <div>
          <label className={label}>Danh Xưng &amp; Họ Tên *</label>
          <input
            className={field}
            placeholder="Ngài / Bà..."
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Số Điện Thoại Bảo Mật *</label>
          <input
            className={field}
            placeholder="+84 ..."
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <div>
          <label className={label}>Email</label>
          <input
            className={field}
            placeholder="email@domain.com"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Địa Điểm Trải Nghiệm</label>
          <select
            className={field}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          >
            <option>Private Salon Saigon (Quận 1)</option>
            <option>Private Salon Hanoi (Hoàn Kiếm)</option>
            <option>Atelier Genève (Thụy Sĩ)</option>
            <option>Phục Vụ Tận Biệt Thự / Tư Gia</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Tác Phẩm Quan Tâm</label>
        <select
          className={field}
          value={form.interest}
          onChange={(e) => setForm({ ...form, interest: e.target.value })}
        >
          <option>Grand Complication Tourbillon</option>
          <option>Celestial Moonphase Obsidian</option>
          <option>Royal Chronograph Flyback</option>
          <option>Atelier Skeleton Pure Gold</option>
          <option>Bespoke Métiers d&apos;Art Độc Bản</option>
        </select>
      </div>
      <div>
        <label className={label}>
          Ghi Chú Đặc Biệt (Rượu champagne, sở thích ẩm thực hoặc bảo mật)
        </label>
        <textarea
          className={`${field} resize-none`}
          placeholder="Gợi ý thêm yêu cầu đón tiếp..."
          rows={2}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-space-xs text-on-surface-variant pt-1">
        <input
          className="w-4 h-4 rounded bg-surface-container-high accent-primary"
          id="privacy-check"
          type="checkbox"
          checked={form.agree}
          onChange={(e) => setForm({ ...form, agree: e.target.checked })}
        />
        <label className="font-body-sm text-[12px]" htmlFor="privacy-check">
          Tôi đồng ý với chính sách bảo mật tư gia &amp; quy chế danh sách khách
          mời Circle Privé.
        </label>
      </div>
      {state === "error" && (
        <p className="font-body-sm text-[12px] text-red-400">
          Vui lòng điền họ tên, số điện thoại và đồng ý chính sách bảo mật.
        </p>
      )}
      <button
        className="w-full py-4 rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.2em] font-semibold hover:bg-secondary transition-colors shadow-lg flex items-center justify-center gap-space-sm disabled:opacity-50"
        type="submit"
        disabled={state === "sending"}
      >
        <span className="material-symbols-outlined text-[18px]">verified_user</span>
        <span>
          {state === "sending" ? "Đang Gửi..." : "Xác Nhận Đặt Lịch Tiếp Đón"}
        </span>
      </button>
    </form>
  );
}
