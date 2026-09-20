/**
 * State + logic stream chat của trang /agent (tách từ page.tsx, P2-3).
 *
 * Hook giữ toàn bộ: role, messages, SSE send loop, delegation token,
 * session/page context, status line. Page shell (page.tsx) chỉ render.
 * Generative JSX trong send dùng widgets từ chat-widgets.tsx.
 */
"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { csrfFetch } from "@/lib/api-client";
import type { AgentEvent, AgentProduct, AgentRole } from "@/lib/agent-events";
import { buildReceipt, memoryFactText } from "@/lib/agent-events";

/** Khay so sánh tối đa 6 chiếc — đủ cho quyết định, gọn cho UI. */
const TRAY_MAX = 6;
import { Card, MemoryChip, StagedChangeCard, UxEvent, fmtUsd } from "./chat-widgets";

export const AGENT_HOST =
  process.env.NEXT_PUBLIC_AGENT_URL || "http://127.0.0.1:8100";

/**
 * Trace id cho 1 turn chat (FE → agent host → BE). Dùng ``crypto.randomUUID``
 * khi có (secure context), fallback đủ dài để host không thay bằng id khác.
 * Chỉ [A-Za-z0-9-] — khớp whitelist ``_sanitize_trace_id`` phía host.
 */
function newTraceId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type Bubble = {
  role: "user" | "assistant";
  text: string;
  ux: { id: number; node: ReactNode }[];
  done: boolean;
  /** Biên lai cuối turn: agent đã LÀM gì (từ event stream, xem buildReceipt). */
  receipt: string[];
};

export const SUGGESTIONS: Record<AgentRole, string[]> = {
  shop: [
    "Tôi muốn tourbillon dưới 150k USD",
    "So sánh Chronos Tourbillon và Grand Complication",
    "Kế hoạch mua đồng hồ first-class trong 2 tháng",
    "Báo tôi khi chiếc Chronos Tourbillon về lại hàng",
    "Tôi khiếu nại đơn AC-2025-000001 — đồng hồ bị trầy",
  ],
  merchant: [
    "Tình hình kinh doanh tháng này thế nào?",
    "Vẽ doanh số 30 ngày qua theo ngày",
    "SP nào sắp hết tồn kho?",
    "Đơn nào đang PENDING cần xử lý?",
    "Tạo khuyến mãi 10% cho Chronos tháng này",
    "Tạo campaign ra mắt bộ sưu tập mới budget 500 USD",
  ],
};

export function useAgentChat() {
  const [role, setRole] = useState<AgentRole>("shop");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  // Delegation (agentic web): agent hành động THAY user — giỏ/đơn/wishlist
  // thật. Bật = xin JWT ngắn hạn (30 phút) từ BE /auth/delegation.
  const [actAsMe, setActAsMe] = useState(false);
  const delegationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Hẹn gia hạn vé delegation trước khi nó chết (sliding window, không cần
   * user bấm lại). Gọi sau mỗi lần nhận vé mới (issue hoặc refresh).
   *
   * - thành công → nhận vé mới + hẹn tiếp (vé dùng 1 lần, rotate ở BE);
   * - 401 (logout/session chết) → tắt actAsMe, user bật lại khi muốn;
   * - lỗi mạng → thử lại sau 60s (không tắt vội giữa phiên mua).
   */
  const armDelegationRefresh = useCallback(
    (expiresInS: number) => {
      if (delegationTimerRef.current) {
        clearTimeout(delegationTimerRef.current);
        delegationTimerRef.current = null;
      }
      // Trừ hao 60s để vé mới về tay trước khi vé cũ chết giữa turn.
      const waitMs = Math.max(30_000, (expiresInS - 60) * 1000);
      delegationTimerRef.current = setTimeout(async () => {
        const old = delegationRef.current;
        if (!old) return;
        try {
          const res = await csrfFetch("/auth/delegation/refresh", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: old }),
          });
          if (!res.ok) {
            // 401 = session chết → tắt êm, báo user bật lại khi cần.
            delegationRef.current = null;
            setActAsMe(false);
            return;
          }
          const data = (await res.json()) as {
            token: string;
            expires_in?: number;
          };
          delegationRef.current = data.token;
          armDelegationRefresh(
            typeof data.expires_in === "number" ? data.expires_in : 1800,
          );
        } catch {
          // Rớt mạng chớp nhoáng: thử lại sau 60s thay vì cắt quyền.
          armDelegationRefresh(120);
        }
      }, waitMs);
    },
    [],
  );

  // Unmount/đổi tab → hủy hẹn (không refresh cho session đã đi).
  useEffect(() => {
    return () => {
      if (delegationTimerRef.current) clearTimeout(delegationTimerRef.current);
    };
  }, []);
  const [me, setMe] = useState<{ name?: string; role?: string } | null>(null);
  // Khay so sánh đeo bám xuyên turn (G2-6): SP agent từng giới thiệu được
  // giữ lại theo slug — mở tab khác quay lại vẫn còn (trong phiên trang).
  const [compareTray, setCompareTray] = useState<
    { product: AgentProduct; note?: string | null }[]
  >([]);
  const isAdmin = me?.role === "ADMIN";
  const delegationRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Sản phẩm user đang xem (deep-link từ trang detail) — feed PageContext.
  const pageProductRef = useRef<string | null>(null);

  // Đã đăng nhập FE (session cookie BE) → hiện nút "act on behalf of".
  useEffect(() => {
    csrfFetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // Bật delegation → xin token ngay (nếu 401 → user chưa đăng nhập).
  const toggleDelegation = useCallback(async () => {
    if (actAsMe) {
      setActAsMe(false);
      delegationRef.current = null;
      if (delegationTimerRef.current) {
        clearTimeout(delegationTimerRef.current);
        delegationTimerRef.current = null;
      }
      return;
    }
    const res = await csrfFetch("/auth/delegation", { method: "POST" });
    if (!res.ok) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Cần đăng nhập trước khi cho concierge hành động hộ bạn.",
          ux: [], receipt: [],
          done: true,
        },
      ]);
      return;
    }
    const data = (await res.json()) as { token: string; expires_in?: number };
    delegationRef.current = data.token;
    // Gia hạn ngầm: vé TTL 30 phút nhưng user có thể chat 2-3 tiếng.
    // Hẹn refresh trước khi vé chết (trừ hao 60s) qua /auth/delegation/refresh
    // — cần cookie session còn sống; logout rồi thì 401 → tắt actAsMe.
    armDelegationRefresh(typeof data.expires_in === "number" ? data.expires_in : 1800);
    setActAsMe(true);
  }, [actAsMe]);

  // Token TTL 30 phút — xin lại trước khi gửi nếu sắp hết (đơn giản: xin
  // lại mỗi khi bật trạng thái còn 0 event).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, statusLine]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      // Tab Vận hành chỉ dành cho admin — chặn ngay ở client (server proxy
      // verify lại lần nữa, đây chỉ là UX).
      if (role === "merchant" && me?.role !== "ADMIN") {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Khu vực vận hành chỉ dành cho tài khoản admin. Hãy đăng nhập bằng tài khoản quản trị.",
            ux: [], receipt: [],
            done: true,
          },
        ]);
        return;
      }
      setInput("");
      setBusy(true);
      setMessages((m) => [
        ...m,
        { role: "user", text, ux: [], receipt: [], done: true },
        { role: "assistant", text: "", ux: [], receipt: [], done: false },
      ]);

      const controller = new AbortController();
      // Thu event cả turn để dựng biên lai (cần ngoài try để catch dùng được).
      const turnEvents: AgentEvent[] = [];
      try {
        // Merchant đi qua proxy server-side (giữ token + check admin);
        // shop chat công khai gọi thẳng host.
        const url =
          role === "merchant"
            ? `/api/agent/merchant/chat`
            : `${AGENT_HOST}/shop/chat`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: text,
            session_id: sessionIdRef.current,
            // Trace xuyên FE → host → BE: 1 id/turn, nối log FE/host/BE/Sentry.
            trace_id: newTraceId(),
            delegation_token: role === "shop" ? delegationRef.current : undefined,
            product_id: role === "shop" ? pageProductRef.current ?? undefined : undefined,
            page_type: role === "shop" && pageProductRef.current ? "product" : "other",
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Agent host ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let uxSeq = 0;
        const patch = (fn: (b: Bubble) => Bubble) =>
          setMessages((m) => m.map((b, i) => (i === m.length - 1 ? fn(b) : b)));

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const data = line.replace(/^data: /, "").trim();
            if (!data) continue;
            let ev: AgentEvent;
            try {
              ev = JSON.parse(data);
            } catch {
              continue;
            }
            turnEvents.push(ev);
            switch (ev.type) {
              case "session":
                sessionIdRef.current = ev.session_id;
                break;
              case "text_delta":
                patch((b) => ({ ...b, text: b.text + ev.text }));
                break;
              case "progress":
                setStatusLine(ev.message);
                break;
              case "tool_call":
                if (ev.label) setStatusLine(ev.label);
                break;
              case "ui":
                patch((b) => ({
                  ...b,
                  ux: [...b.ux, { id: uxSeq++, node: <UxEvent event={ev} /> }],
                }));
                // Sync khay so sánh từ SP agent giới thiệu (present_products
                // + present_comparison) — dedupe theo slug, cap 6.
                if (
                  ev.component === "present_products" ||
                  ev.component === "present_comparison"
                ) {
                  const incoming =
                    ev.component === "present_products"
                      ? (ev.payload.items ?? [])
                      : (ev.payload.entries ?? []);
                  if (incoming.length > 0) {
                    setCompareTray((prev) => {
                      const seen = new Set(prev.map((e) => e.product.slug));
                      const fresh = incoming.filter(
                        (e) => e.product?.slug && !seen.has(e.product.slug)
                      );
                      return [...prev, ...fresh].slice(-TRAY_MAX);
                    });
                  }
                }
                break;
              case "cart_update":
                patch((b) => ({
                  ...b,
                  ux: [
                    ...b.ux,
                    {
                      id: uxSeq++,
                      node: (
                        <Card>
                          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
                            Đã cập nhật giỏ hàng
                          </p>
                          <ul className="mt-space-sm font-body-sm text-body-sm text-on-surface">
                            {(ev.cart.items ?? []).map((it, i) => (
                              <li key={i}>
                                {it.title} × {it.quantity} — {fmtUsd(it.price)}
                              </li>
                            ))}
                          </ul>
                          <a
                            href="/checkout"
                            className="mt-space-sm inline-block font-body-sm text-body-sm text-primary underline"
                          >
                            Hoàn tất đặt hàng →
                          </a>
                        </Card>
                      ),
                    },
                  ],
                }));
                break;
              case "change_update":
                patch((b) => ({
                  ...b,
                  ux: [...b.ux, { id: uxSeq++, node: <StagedChangeCard change={ev.change} /> }],
                }));
                break;
              case "memory": {
                // Trước đây event memory bị bỏ qua hoàn toàn (không case) —
                // khách không bao giờ thấy concierge đã nhớ gì (G1-2).
                const facts = ev.facts.map(memoryFactText).filter((t) => t.length > 0);
                if (facts.length > 0) {
                  patch((b) => ({
                    ...b,
                    ux: [...b.ux, { id: uxSeq++, node: <MemoryChip facts={facts} /> }],
                  }));
                }
                break;
              }
              case "handoff":
                patch((b) => ({
                  ...b,
                  ux: [
                    ...b.ux,
                    {
                      id: uxSeq++,
                      node: (
                        <Card className="border-primary/40">
                          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
                            Đã chuyển cho vận hành · {ev.ticket_id}
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                            {ev.message}
                          </p>
                        </Card>
                      ),
                    },
                  ],
                }));
                break;
              case "error":
                patch((b) => ({ ...b, text: b.text + `\n\n⚠ ${ev.message}` }));
                break;
              case "delegation_expired":
                // Vé chết GIỮA turn (hiếm khi xảy ra vì đã refresh ngầm
                // trước hạn): thử refresh câm 1 lần bằng vé cũ. Được → báo
                // user gửi lại tin nhắn; không được → nút bật lại như cũ.
                patch(await (async () => {
                  const old = delegationRef.current;
                  const retried =
                    old &&
                    (await csrfFetch("/auth/delegation/refresh", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ token: old }),
                    })
                      .then((r) => (r.ok ? r.json() : null))
                      .catch(() => null));
                  if (retried && typeof retried.token === "string") {
                    delegationRef.current = retried.token as string;
                    armDelegationRefresh(
                      typeof retried.expires_in === "number"
                        ? (retried.expires_in as number)
                        : 1800,
                    );
                    return (b: Bubble) => ({
                      ...b,
                      done: true,
                      text:
                        b.text +
                        `\n\n⚠ ${ev.message} (Đã tự gia hạn — bạn gửi lại tin nhắn nhé.)`,
                    });
                  }
                  setActAsMe(false);
                  delegationRef.current = null;
                  return (b: Bubble) => ({
                    ...b,
                    done: true,
                    text: b.text + `\n\n⚠ ${ev.message}`,
                    ux: [
                      ...b.ux,
                      {
                        id: uxSeq++,
                        node: (
                          <button
                            onClick={toggleDelegation}
                            className="border border-primary/50 px-3 py-1.5 font-body-sm text-body-sm text-primary underline"
                          >
                            Cấp lại quyền hành động hộ
                          </button>
                        ),
                      },
                    ],
                  });
                })());
                break;
              case "turn_complete":
              case "done":
                patch((b) => ({ ...b, done: true, receipt: buildReceipt(turnEvents) }));
                break;
            }
          }
        }
      } catch (e) {
        // Turn lỗi giữa chừng vẫn giữ biên lai phần đã làm được (nếu có).
        let partial: string[] = [];
        try {
          partial = buildReceipt(turnEvents);
        } catch {
          partial = [];
        }
        setMessages((m) =>
          m.map((b, i) =>
            i === m.length - 1
              ? {
                  ...b,
                  done: true,
                  receipt: partial,
                  text:
                    b.text +
                    `\n\n⚠ Không nối được agent host (${AGENT_HOST}). Kiểm tra agent host đang chạy (agent/README.md) và NEXT_PUBLIC_AGENT_URL.`,
                }
              : b,
          ),
        );
      } finally {
        setBusy(false);
        setStatusLine(null);
      }
    },
    [busy, role, me],
  );

  // Mất quyền admin giữa chừng (logout/tab khác) mà đang ở tab Vận hành
  // → đá về tab Khách hàng ngay, khỏi kẹt ở vùng không còn quyền.
  useEffect(() => {
    if (role === "merchant" && me && me.role !== "ADMIN") {
      setRole("shop");
      setMessages([]);
      sessionIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const switchRole = useCallback((r: AgentRole) => {
    setRole(r);
    setMessages([]);
    sessionIdRef.current = null;
    setCompareTray([]);
  }, []);

  const removeFromTray = useCallback((slug: string) => {
    setCompareTray((prev) => prev.filter((e) => e.product.slug !== slug));
  }, []);

  // Refs giữ bản mới nhất cho compareTrayNow (tránh dep-loop với send).
  const sendRef = useRef(send);
  sendRef.current = send;
  const compareTrayRef = useRef(compareTray);
  compareTrayRef.current = compareTray;

  /** Gửi câu chốt so sánh dùng đúng SP trong khay (FE dựng, không tin model). */
  const compareTrayNow = useCallback(() => {
    const names = compareTrayRef.current.map((e) => e.product.name).join(", ");
    if (!names) return;
    void sendRef.current(
      `So sánh giúp tôi các chiếc này: ${names} — lập bảng ưu/nhược và gợi ý chiếc hợp nhất.`
    );
  }, []);

  const getSessionId = useCallback(() => sessionIdRef.current, []);

  const setPageProduct = useCallback((slug: string) => {
    pageProductRef.current = slug;
  }, []);

  /** Xóa dữ liệu cá nhân của session hiện tại (transcript/memory/watch/task). */
  const forgetSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || busy) return false;
    try {
      const res = await fetch(`${AGENT_HOST}/shop/forget`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      if (!res.ok) return false;
    } catch {
      return false;
    }
    sessionIdRef.current = null;
    setMessages([]);
    setCompareTray([]);
    delegationRef.current = null;
    setActAsMe(false);
    return true;
  }, [busy]);

  return {
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
    forgetSession,
    compareTray,
    removeFromTray,
    compareTrayNow,
  };
}
