"use client";

import Image from "next/image";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import GoldButton from "@/components/GoldButton";

const stepper = ["Giỏ Hàng", "Giao Hàng", "Thanh Toán", "Hoàn Tất"];

const deliveryOptions = [
  {
    id: "armored",
    icon: "local_shipping",
    title: "Xe Bọc Thép Concierge",
    desc: "Vận chuyển kín đáo, giao tận tay tại địa chỉ của bạn (2 — 5 ngày).",
    price: "Miễn phí",
  },
  {
    id: "salon",
    icon: "storefront",
    title: "Tiếp Nhận Tại Private Salon",
    desc: "Buổi bàn giao riêng tư cùng ly champagne tại salon gần nhất.",
    price: "Miễn phí",
  },
];

const paymentOptions = [
  { id: "centurion", label: "Centurion Black", icon: "credit_card" },
  { id: "visa-infinite", label: "Visa Infinite", icon: "credit_card" },
  { id: "escrow", label: "Wire Escrow Ngân Hàng", icon: "account_balance" },
];

const inputCls =
  "w-full border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition-colors focus:border-primary";

export default function CheckoutPage() {
  const { items, totalUsd, totalVnd, clear } = useCart();
  const { price } = useCurrency();
  const [delivery, setDelivery] = useState("armored");
  const [payment, setPayment] = useState("centurion");
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "" });

  const placeOrder = () => {
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
      setError("Vui lòng điền đầy đủ họ tên, điện thoại và địa chỉ nhận hàng.");
      return;
    }
    setError("");
    setPlaced(true);
    clear();
  };

  if (placed) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-6 py-28 text-center">
        <span className="material-symbols-outlined text-6xl text-primary">check_circle</span>
        <h1 className="font-display text-3xl font-medium text-gold-gradient md:text-4xl">
          Đơn Hàng Đã Được Xác Nhận
        </h1>
        <p className="text-sm leading-relaxed text-on-surface-variant/85">
          Mã đơn: <span className="font-semibold text-primary">AUR-{Date.now().toString().slice(-8)}</span>
          . Concierge sẽ gọi điện xác nhận trong 24 giờ và sắp xếp lịch giao an
          ninh theo lựa chọn của quý khách.
        </p>
        <GoldButton href="/collections" icon="arrow_forward">
          Tiếp Tục Khám Phá
        </GoldButton>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-28 text-center">
        <span className="material-symbols-outlined text-6xl text-outline-variant">
          shopping_bag
        </span>
        <h1 className="font-display text-3xl font-medium">
          Chưa Có Sản Phẩm <span className="text-gold-gradient">Để Thanh Toán</span>
        </h1>
        <GoldButton href="/collections" icon="arrow_forward">
          Khám Phá Bộ Sưu Tập
        </GoldButton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-page px-4 py-12 md:px-8">
      {/* Stepper */}
      <div className="flex items-center justify-center gap-0">
        {stepper.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                  i <= 1
                    ? "border-primary bg-primary text-surface-lowest"
                    : "border-outline-variant/40 text-on-surface-variant/60"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-[10px] tracking-[0.2em] uppercase ${
                  i <= 1 ? "text-primary" : "text-on-surface-variant/60"
                }`}
              >
                {s}
              </span>
            </div>
            {i < stepper.length - 1 && (
              <div className="mx-3 h-px w-8 bg-outline-variant/40 md:w-16" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-12">
        {/* Workspace */}
        <div className="space-y-10 lg:col-span-8">
          {/* Order items */}
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">
              Giỏ Hàng Của Bạn
            </h2>
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <div
                  key={`${item.slug}-${item.strap}`}
                  className="flex items-center gap-4 border border-outline-variant/25 bg-surface-container/40 p-3"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden">
                    <Image src={item.image} alt={item.name} fill sizes="64px" className="object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-on-surface-variant/70">
                      {item.strap} • SL {item.qty}
                    </div>
                  </div>
                  <div className="font-display font-semibold text-primary">
                    {price(item.priceUsd * item.qty, item.priceVnd * item.qty)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Delivery */}
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">
              Phương Thức Giao Hàng
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {deliveryOptions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDelivery(d.id)}
                  className={`flex gap-3 border p-4 text-left transition-colors ${
                    delivery === d.id
                      ? "border-primary bg-primary/5"
                      : "border-outline-variant/35 hover:border-outline"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined ${delivery === d.id ? "text-primary" : "text-outline-variant/60"}`}
                  >
                    {d.icon}
                  </span>
                  <div>
                    <div className={`font-medium ${delivery === d.id ? "text-primary" : ""}`}>
                      {d.title}
                    </div>
                    <p className="mt-0.5 text-xs text-on-surface-variant/75">{d.desc}</p>
                    <span className="mt-1 inline-block text-[10px] tracking-[0.15em] text-secondary uppercase">
                      {d.price}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Address */}
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">
              Thông Tin Nhận Hàng
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <input
                className={inputCls}
                placeholder="Họ tên *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Điện thoại *"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className={`${inputCls} md:col-span-2`}
                placeholder="Địa chỉ nhận hàng *"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <input
                className={`${inputCls} md:col-span-2`}
                placeholder="Thành phố / Quốc gia"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
          </section>

          {/* Payment */}
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">
              Phương Thức Thanh Toán
            </h2>
            <div className="mt-4 space-y-3">
              {paymentOptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPayment(p.id)}
                  className={`flex w-full items-center gap-3 border p-4 text-left text-sm transition-colors ${
                    payment === p.id
                      ? "border-primary text-primary"
                      : "border-outline-variant/35 text-on-surface-variant/85 hover:border-outline"
                  }`}
                >
                  <span className="material-symbols-outlined">{p.icon}</span>
                  {p.label}
                  {p.id === "escrow" && (
                    <span className="ml-auto text-[10px] tracking-[0.15em] text-secondary uppercase">
                      Đặt cọc 20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Sticky summary */}
        <aside className="lg:col-span-4">
          <div className="gold-border-card sticky top-32 p-6">
            <h2 className="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">
              Tóm Tắt Thanh Toán
            </h2>
            <div className="mt-5 space-y-3 border-b border-outline-variant/20 pb-5 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant/75">Tạm tính</span>
                <span>{price(totalUsd, totalVnd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant/75">Vận chuyển</span>
                <span className="text-secondary">Miễn phí</span>
              </div>
            </div>
            <div className="flex items-end justify-between py-5">
              <span className="text-xs tracking-[0.2em] text-on-surface-variant/75 uppercase">
                Cần thanh toán
              </span>
              <span className="font-display text-2xl font-semibold text-primary">
                {price(totalUsd, totalVnd)}
              </span>
            </div>
            <button
              onClick={placeOrder}
              className="w-full bg-primary px-7 py-4 text-[11px] font-bold tracking-[0.2em] text-surface-lowest uppercase shadow-[0_0_24px_-4px_rgba(212,175,55,0.4)] transition-colors hover:bg-primary-hover"
            >
              Xác Nhận Đặt Hàng
            </button>
            <div className="mt-5 border border-outline-variant/30 bg-surface-lowest/60 p-4">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-primary uppercase">
                <span className="material-symbols-outlined text-[16px]">support_agent</span>
                Concierge Hotline
              </div>
              <p className="mt-2 font-display text-lg font-semibold">+84 24 1892 1892</p>
              <p className="text-xs text-on-surface-variant/60">
                Hỗ trợ 24/7 bằng tiếng Việt, Pháp và Anh.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
