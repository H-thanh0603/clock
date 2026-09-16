"use client";

/**
 * Trang AI Agent — vỏ hiển thị (P2-3: logic chat đã chuyển vào useAgentChat,
 * generative UI vào chat-widgets). File này chỉ còn: DeepLinkLauncher,
 * AlertFeed, SuggestionsChips và layout.
 *
 * Stream SSE: mỗi event là 1 dòng "data: {json}\n\n".
 * Render: text_delta ghép dần, ui (generative components), cart_update,
 * change_update (staged change), turn_complete.
 */

import { useEffect, useRef, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AGENT_HOST, SUGGESTIONS, useAgentChat } from "./useAgentChat";
import { ComparisonTray } from "./chat-widgets";
import type { AgentRole } from "@/lib/agent-events";
import { apiUrl } from "@/lib/api-client";
import { useCart } from "@/components/CartProvider";

function SuggestionsChips({ suggestions, onPick }: { suggestions: string[]; onPick: (s: string) => void }) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onPick(s)}
          className="border border-outline-variant/40 px-3 py-1.5 font-body-sm text-body-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

type AlertRow = {
  alert_id: string;
  kind: string;
  title: string;
  detail: string;
  created_at: number;
  data?: { product_id?: string } | null;
};

/**
 * Nút "Thêm vào giỏ" ngay trong alert watch (G2-4): alert báo tin + hành
 * động một chạm — chatbot chỉ báo tin. Dùng đúng addItem của CartProvider
 * (khách vãng lai → giỏ local, đã login → sync server; giá chốt server-side
 * theo slug nên không tin giá client).
 */
function WatchAddButton({ productId }: { productId: string }) {
  const { addItem } = useCart();
  const [state, setState] = useState<"idle" | "busy" | "added" | "error">("idle");

  const add = async () => {
    if (state === "busy" || state === "added") return;
    setState("busy");
    try {
      const r = await fetch(apiUrl(`/products/${encodeURIComponent(productId)}`));
      if (!r.ok) throw new Error("not-found");
      const p = (await r.json()) as {
        slug: string;
        name: string;
        priceUsd: number;
        priceVnd: number;
        cardImage?: string;
        images?: string[];
        strapLabel?: string;
        inBoutique?: boolean;
        stock?: number;
      };
      if (p.inBoutique === false || (p.stock ?? 1) <= 0) {
        throw new Error("out-of-stock");
      }
      addItem({
        slug: p.slug,
        name: p.name,
        priceUsd: p.priceUsd,
        priceVnd: p.priceVnd,
        image: p.cardImage ?? p.images?.[0] ?? "",
        strap: p.strapLabel ?? "Tiêu chuẩn Atelier",
      });
      setState("added");
    } catch {
      setState("error");
    }
  };

  if (state === "added") {
    return (
      <span className="font-body-sm text-body-sm text-primary">
        Đã thêm ✓ ·{" "}
        <Link href="/cart" className="underline hover:text-primary-hover">
          Xem giỏ →
        </Link>
      </span>
    );
  }
  return (
    <span className="font-body-sm text-body-sm">
      <button
        onClick={add}
        disabled={state === "busy"}
        className="text-primary underline hover:text-primary-hover disabled:opacity-50"
      >
        {state === "busy" ? "Đang thêm…" : "Thêm vào giỏ →"}
      </button>
      {state === "error" && (
        <span className="text-on-surface-variant/70"> (chiếc này hiện chưa bán được)</span>
      )}
    </span>
  );
}

function AlertFeed({
  refreshKey,
  role,
  isAdmin,
  getSessionId,
}: {
  refreshKey: number;
  role: AgentRole;
  isAdmin: boolean;
  getSessionId: () => string | null;
}) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const merged: AlertRow[] = [];
      let run: number | null = null;
      // Feed shop: alert watch của CHÍNH session — public, không cần token.
      const sid = getSessionId();
      if (sid) {
        const shop = await fetch(
          `${AGENT_HOST}/alerts?limit=20&scope=shop&session_id=${encodeURIComponent(sid)}`
        );
        if (shop.ok) {
          const data = await shop.json();
          merged.push(...(data.alerts ?? []));
          run = data.monitor_last_run ?? null;
        }
      }
      // Feed ops (tồn kho/PENDING/ticket): chỉ admin, qua proxy server-side.
      if (role === "merchant" && isAdmin) {
        const ops = await fetch(`/api/agent/alerts?limit=20`);
        if (ops.ok) {
          const data = await ops.json();
          merged.unshift(...(data.alerts ?? []));
          run = data.monitor_last_run ?? run;
        }
      }
      setAlerts(merged);
      setLastRun(run);
    } catch {
      // host chưa chạy — im lặng
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, isAdmin]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // poll 30s
    return () => clearInterval(t);
  }, [load, refreshKey]);

  if (!alerts.length) return null;
  return (
    <section className="mt-space-lg border border-outline-variant/25 bg-surface-container/30 p-space-md">
      <div className="flex items-center justify-between gap-space-md">
        <p className="font-label-spec text-label-spec uppercase tracking-[0.25em] text-primary">
          Agent tự phát hiện (proactive)
        </p>
        <button
          onClick={load}
          className="font-body-sm text-body-sm text-on-surface-variant underline hover:text-primary"
        >
          làm mới
        </button>
      </div>
      <ul className="mt-space-md space-y-space-sm">
        {alerts.map((a) => (
          <li key={a.alert_id} className="border-t border-outline-variant/15 pt-space-sm">
            <p className="font-body-sm text-body-sm text-on-surface">
              <span className="text-primary">{a.kind === "ticket" ? "ticket" : a.kind}</span>
              {" · "}
              {a.data?.product_id ? (
                <Link
                  href={`/products/${encodeURIComponent(a.data.product_id)}`}
                  className="underline decoration-primary/40 hover:text-primary"
                >
                  {a.title}
                </Link>
              ) : (
                a.title
              )}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant/70">{a.detail}</p>
            {(a.kind === "restock" || a.kind === "price_drop") && a.data?.product_id && (
              <p className="mt-1">
                <WatchAddButton productId={a.data.product_id} />
              </p>
            )}
          </li>
        ))}
      </ul>
      {lastRun && (
        <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant/50">
          Vòng quét gần nhất: {new Date(lastRun * 1000).toLocaleTimeString("vi-VN")}
        </p>
      )}
    </section>
  );
}

function DeepLinkLauncher({
  onAsk,
  onProduct,
  busy,
}: {
  onAsk: (q: string) => void;
  onProduct: (slug: string) => void;
  busy: boolean;
}) {
  /** Đọc ?q= + ?product= (nút "Hỏi concierge" từ trang detail). */
  const search = useSearchParams();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    const q = search.get("q");
    const product = search.get("product");
    if (!q) return;
    fired.current = true;
    if (product) onProduct(product);
    onAsk(q);
  }, [search, onAsk, onProduct, busy]);
  return null;
}

export default function AgentChatPage() {
  const {
    role,
    switchRole,
    messages,
    input,
    setInput,
    busy,
    statusLine,
    actAsMe,
    me,
    isAdmin,
    toggleDelegation,
    send,
    scrollRef,
    getSessionId,
    setPageProduct,
    compareTray,
    removeFromTray,
    compareTrayNow,
  } = useAgentChat();

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      {/* Deep-link từ nút "Hỏi concierge" trên trang sản phẩm */}
      <Suspense fallback={null}>
        <DeepLinkLauncher
          onAsk={send}
          onProduct={setPageProduct}
          busy={busy}
        />
      </Suspense>
      <div className="mx-auto max-w-4xl px-space-lg py-space-lg">
        <header className="mb-space-lg">
          <p className="font-label-spec text-label-spec uppercase tracking-[0.25em] text-on-surface-variant">
            Aurel &amp; Co. · AI Agents
          </p>
          <h1 className="font-display-hero text-headline-lg text-on-surface mt-2">
            Concierge Trực Tuyến
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-2xl">
            Chat với trợ lý AI chạy trên commerce-agents của Anthropic, nối thẳng vào
            catalog và vận hành Aurel. Shopping agent tư vấn và điền giỏ; merchant agent
            báo cáo và đề xuất thay đổi (staged — luôn chờ người duyệt).
          </p>
          <div className="mt-space-md flex flex-wrap items-center gap-2">
            {/* Tab Vận hành chỉ hiện với ADMIN (server proxy verify lại) —
                khách thường không thấy vùng này tồn tại. */}
            {(isAdmin ? (["shop", "merchant"] as const) : (["shop"] as const)).map((r) => (
              <button
                key={r}
                onClick={() => switchRole(r)}
                className={`px-4 py-2 font-label-spec text-label-spec uppercase tracking-wider transition-colors ${
                  role === r
                    ? "bg-primary text-surface-lowest"
                    : "border border-outline-variant/40 text-on-surface-variant hover:border-primary hover:text-primary"
                }`}
              >
                {r === "shop" ? "Khách hàng" : "Vận hành"}
              </button>
            ))}
            {role === "shop" && me && (
              <button
                onClick={toggleDelegation}
                title="Concierge sẽ dùng giỏ/đơn/wishlist thật của bạn (quyền tự hết hạn sau 30 phút)"
                className={`ml-auto px-4 py-2 font-label-spec text-label-spec uppercase tracking-wider transition-colors ${
                  actAsMe
                    ? "border border-primary bg-primary/10 text-primary"
                    : "border border-outline-variant/40 text-on-surface-variant hover:border-primary hover:text-primary"
                }`}
              >
                {actAsMe ? "● Đang hành động hộ bạn" : "Dùng tài khoản của tôi"}
              </button>
            )}
          </div>
        </header>

        <div
          ref={scrollRef}
          className="mb-space-md max-h-[60vh] space-y-space-lg overflow-y-auto border border-outline-variant/25 bg-surface-container/30 p-space-lg"
        >
          {messages.length === 0 && (
            <SuggestionsChips suggestions={SUGGESTIONS[role]} onPick={(s) => send(s)} />
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[85%] ${m.role === "user" ? "bg-primary-container/20 border border-primary/30" : ""}`}
              >
                {m.text && (
                  <p className="whitespace-pre-wrap font-body-md text-body-md text-on-surface p-space-md">
                    {m.text}
                  </p>
                )}
                {m.ux.map((u) => (
                  <div key={u.id} className="mt-space-sm">
                    {u.node}
                  </div>
                ))}
                {/* Biên lai cuối turn: agent ĐÃ LÀM gì — chatbot không có
                    thứ này để khoe (G1-1). Chỉ hiện khi turn xong và có việc. */}
                {m.role === "assistant" && m.done && m.receipt.length > 0 && (
                  <div className="mt-space-sm border-t border-outline-variant/15 p-space-md">
                    <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
                      ✓ Đã làm trong lượt này
                    </p>
                    <ul className="mt-space-xs space-y-1">
                      {m.receipt.map((line, ri) => (
                        <li
                          key={ri}
                          className="font-body-sm text-body-sm text-on-surface-variant"
                        >
                          <span className="text-primary">✓</span> {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!m.done && busy && (
                  <p className="p-space-md font-body-sm text-body-sm text-on-surface-variant animate-pulse">
                    ▍{statusLine ?? "đang suy nghĩ…"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Khay so sánh đeo bám xuyên turn (G2-6): SP agent từng giới thiệu
            được giữ lại — khác chatbot giữ state bằng text. */}
        {role === "shop" && (
          <ComparisonTray
            entries={compareTray}
            onRemove={removeFromTray}
            onCompare={compareTrayNow}
          />
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-space-sm"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              role === "shop"
                ? "Hỏi concierge về đồng hồ, đặt hàng, chính sách…"
                : "Hỏi trợ lý vận hành về số liệu, tồn kho, đơn…"
            }
            className="flex-1 border border-outline-variant/40 bg-surface-lowest/60 px-space-md py-space-sm font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="bg-primary px-6 py-space-sm font-label-spec text-label-spec uppercase tracking-wider text-surface-lowest transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            Gửi
          </button>
        </form>

        <AlertFeed
          refreshKey={messages.length}
          role={role}
          isAdmin={isAdmin}
          getSessionId={getSessionId}
        />
      </div>
    </main>
  );
}
