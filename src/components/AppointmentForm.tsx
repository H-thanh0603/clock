"use client";

import { useState } from "react";
import GoldButton from "./GoldButton";

const inputCls =
  "w-full border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-colors focus:border-primary";

export default function AppointmentForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Vui lòng điền họ tên và số điện thoại để concierge liên hệ.");
      return;
    }
    setError("");
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="gold-border-card flex flex-col items-center gap-4 p-10 text-center">
        <span className="material-symbols-outlined text-5xl text-primary">mark_email_read</span>
        <h3 className="font-display text-2xl font-medium text-primary">
          Lời Mời Đã Được Ghi Nhận
        </h3>
        <p className="max-w-md text-sm leading-relaxed text-on-surface-variant/80">
          Concierge của Aurel &amp; Co. sẽ liên hệ quý khách trong vòng 24 giờ để
          xác nhận lịch hẹn Private Salon. Cảm ơn sự tin tưởng của quý khách.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="gold-border-card flex flex-col gap-4 p-6 md:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">
            Họ Tên *
          </label>
          <input
            className={inputCls}
            placeholder="Nguyễn Văn A"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">
            Điện Thoại *
          </label>
          <input
            className={inputCls}
            placeholder="+84 ..."
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">
          Email
        </label>
        <input
          type="email"
          className={inputCls}
          placeholder="email@domain.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">
          Dòng Đồng Hồ Quan Tâm
        </label>
        <textarea
          rows={3}
          className={inputCls}
          placeholder="Ví dụ: Chronos Tourbillon N°07 hoặc tư vấn bộ sưu tập cá nhân (bespoke)..."
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
      </div>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <GoldButton type="submit" icon="calendar_month" className="w-full md:w-auto">
        Đặt Lịch Private Salon
      </GoldButton>
    </form>
  );
}
