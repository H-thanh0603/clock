"use client";

/**
 * Trang AI Agent — chat với Concierge Aurel (shopping) và Trợ lý Vận hành
 * (merchant) chạy trên agent host (agent/ — commerce-agents của Anthropic
 * adapter vào REST API backend clock).
 *
 * Stream SSE: mỗi event là 1 dòng "data: {json}\n\n".
 * Render: text_delta ghép dần, ui (generative components), cart_update,
 * change_update (staged change), turn_complete.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  agentPrice,
  applyEvent,
  emptyAccumulator,
  parseAgentEvent,
  type AgentEvent,
  type AgentProduct,
  type AgentRole,
  type StagedChangeSnapshot,
  type UxPayload,
} from "@/lib/agent-events";

// Types + parser SSE nằm ở src/lib/agent-events.ts (test được không cần DOM).

const AGENT_HOST =
  process.env.NEXT_PUBLIC_AGENT_URL || "http://127.0.0.1:8100";
// Token cho endpoint vận hành (/merchant/*, /alerts, /shop/monitor/run) —
// chỉ đặt khi AGENT_MERCHANT_TOKEN bật ở host (demo prod). Dev bỏ trống.
const AGENT_TOKEN = process.env.NEXT_PUBLIC_AGENT_TOKEN || "";
const agentHeaders = (): Record<string, string> =>
  AGENT_TOKEN ? { "x-agent-token": AGENT_TOKEN } : {};

// ---------------------------------------------------------------------------
// UI helpers theo design system Obsidian & Champagne (globals.css tokens)
// ---------------------------------------------------------------------------

function fmtUsd(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-outline-variant/25 bg-surface-container/50 p-space-lg ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generative components — render payload của từng "ui" event
// ---------------------------------------------------------------------------

function ProductPick({ product, reason }: { product: AgentProduct; reason?: string | null }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block border border-outline-variant/25 bg-surface-lowest/60 transition-colors duration-300 hover:border-primary-container/60"
    >
      <div className="relative aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images?.[0] ?? product.image_url ?? "/images/logo.png"}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-space-md">
        <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant">
          {product.collection}
        </p>
        <h3 className="font-headline-md text-headline-md text-on-surface mt-1">{product.name}</h3>
        <p className="font-body-sm text-body-sm text-primary mt-2">{fmtUsd(agentPrice(product))}</p>
        {reason && <p className="font-body-sm text-body-sm text-on-surface-variant/70 mt-2">{reason}</p>}
      </div>
    </Link>
  );
}

function ProductsGrid({ payload }: { payload: UxPayload }) {
  if (!payload.items?.length) return null;
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface mb-space-md">{payload.title}</h3>
      )}
      <div className={`grid gap-space-md ${payload.items.length > 2 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
        {payload.items.map((it) => (
          <ProductPick key={it.product.slug} product={it.product} reason={it.reason} />
        ))}
      </div>
    </Card>
  );
}

function ComparisonGrid({ payload }: { payload: UxPayload }) {
  if (!payload.entries?.length) return null;
  const dims = payload.dimensions ?? [];
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface mb-space-md">{payload.title}</h3>
      )}
      <div className="overflow-x-auto">
        <table className="w-full font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-outline-variant/30 text-left text-on-surface-variant">
              <th className="py-space-sm pr-space-md font-label-spec text-label-spec uppercase tracking-wider">Tiêu chí</th>
              {payload.entries.map((e) => (
                <th
                  key={e.product.slug}
                  className={`py-space-sm px-space-md font-label-spec text-label-spec uppercase tracking-wider ${
                    payload.recommended_product_id === e.product.slug ? "text-primary" : ""
                  }`}
                >
                  {e.product.name}
                  {payload.recommended_product_id === e.product.slug && (
                    <span className="ml-1 text-primary">★</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dims.map((d, i) => (
              <tr key={i} className="border-b border-outline-variant/15">
                <td className="py-space-sm pr-space-md text-on-surface-variant">{d}</td>
                {payload.entries?.map((e) => (
                  <td key={e.product.slug} className="py-space-sm px-space-md text-on-surface">
                    {e.product.specs?.find((s) => s.label === d)?.value ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-space-sm pr-space-md text-on-surface-variant">Giá</td>
              {payload.entries.map((e) => (
                <td key={e.product.slug} className="py-space-sm px-space-md text-primary">
                  {fmtUsd(agentPrice(e.product))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlanChecklist({ payload }: { payload: UxPayload }) {
  if (!payload.steps?.length) return null;
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface">{payload.title}</h3>
      )}
      {payload.intro && (
        <p className="font-body-md text-body-md text-on-surface-variant mt-space-sm mb-space-md">{payload.intro}</p>
      )}
      <ol className="space-y-space-sm">
        {payload.steps.map((s, i) => (
          <li key={i} className="flex gap-space-sm font-body-md text-body-md text-on-surface">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/50 font-label-badge text-label-badge text-primary">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MetricsTiles({ payload }: { payload: UxPayload }) {
  if (!payload.picks?.length) return null;
  return (
    <Card>
      {payload.title && (
        <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{payload.title}</h3>
      )}
      {payload.period && (
        <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant mb-space-md">
          {payload.period}
        </p>
      )}
      <div className="grid grid-cols-2 gap-space-md md:grid-cols-4">
        {payload.picks.map((m, i) => (
          <div key={i} className="border border-outline-variant/25 bg-surface-lowest/60 p-space-md">
            <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant">{m.label}</p>
            <p className="font-headline-lg text-headline-lg text-primary mt-1">
              {m.value}
              {m.unit && <span className="font-body-sm text-body-sm text-on-surface-variant ml-1">{m.unit}</span>}
            </p>
            {typeof m.change_pct === "number" && (
              <p className={`font-body-sm text-body-sm mt-1 ${m.change_pct >= 0 ? "text-primary" : "text-error"}`}>
                {m.change_pct >= 0 ? "▲" : "▼"} {Math.abs(m.change_pct).toFixed(1)}%
              </p>
            )}
            {m.note && <p className="font-body-sm text-body-sm text-on-surface-variant/70 mt-1">{m.note}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function StagedChangeCard({ change }: { change: StagedChangeSnapshot }) {
  return (
    <Card className="border-primary/40">
      <div className="flex items-start justify-between gap-space-md">
        <div>
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
            Đề xuất thay đổi · {change.kind}
          </p>
          <p className="font-headline-md text-headline-md text-on-surface mt-1">{change.summary}</p>
        </div>
        <span
          className={`shrink-0 px-2 py-1 font-label-badge text-label-badge uppercase tracking-wider ${
            change.status === "applied"
              ? "bg-primary text-surface-lowest"
              : change.status === "discarded"
                ? "bg-surface-container-high text-on-surface-variant"
                : "border border-primary/50 text-primary"
          }`}
        >
          {change.status === "staged" ? "chờ duyệt" : change.status}
        </span>
      </div>
      {change.items && change.items.length > 0 && (
        <ul className="mt-space-md space-y-1 border-t border-outline-variant/20 pt-space-md font-body-sm text-body-sm">
          {change.items.map((it, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="text-on-surface-variant">{it.target}</span>
              <span className="text-primary">{it.field}:</span>
              <span className="text-on-surface-variant/60 line-through">{String(it.before)}</span>
              <span className="text-on-surface">→</span>
              <span className="text-primary">{String(it.after)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant/70">
        Thay đổi chỉ áp dụng khi operator duyệt qua agent host (approve → apply).
      </p>
    </Card>
  );
}

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

function UxEvent({ event }: { event: Extract<AgentEvent, { type: "ui" }> }) {
  switch (event.component) {
    case "present_products":
      return <ProductsGrid payload={event.payload} />;
    case "present_comparison":
      return <ComparisonGrid payload={event.payload} />;
    case "present_plan":
    case "present_guide":
    case "present_digest":
      return <PlanChecklist payload={event.payload} />;
    case "present_metrics":
      return <MetricsTiles payload={event.payload} />;
    case "present_change_preview":
      return (
        <Card className="border-primary/40">
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">Đề xuất</p>
          <p className="font-headline-md text-headline-md text-on-surface mt-1">{event.payload.headline}</p>
          {event.payload.note && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">{event.payload.note}</p>
          )}
        </Card>
      );
    case "present_order_status":
      return (
        <Card>
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-on-surface-variant">
            Đơn {event.payload.order_id}
          </p>
          <p className="font-body-md text-body-md text-on-surface mt-1">{event.payload.summary}</p>
          {event.payload.next_step && (
            <p className="font-body-sm text-body-sm text-primary mt-2">→ {event.payload.next_step}</p>
          )}
        </Card>
      );
    case "watch_confirmed":
      return (
        <Card className="border-primary/40">
          <p className="font-label-spec text-label-spec uppercase tracking-wider text-primary">
            Đã đặt theo dõi
          </p>
          <p className="font-body-md text-body-md text-on-surface mt-1">
            {event.payload.product_id} — sẽ báo khi {event.payload.confirmed ?? "điều kiện khớp"}.
          </p>
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant/70">
            Agent kiểm tra nền mỗi vài phút — bạn không cần ở lại đây.
          </p>
        </Card>
      );
    default:
      return null; // host bỏ qua component không biết — đúng hợp đồng upstream
  }
}

// ---------------------------------------------------------------------------
// Chat app
// ---------------------------------------------------------------------------

type Bubble = {
  role: "user" | "assistant";
  text: string;
  ux: { id: number; node: ReactNode }[];
  done: boolean;
};

const SUGGESTIONS: Record<AgentRole, string[]> = {
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

type AlertRow = {
  alert_id: string;
  kind: string;
  title: string;
  detail: string;
  created_at: number;
};

function AlertFeed({ refreshKey }: { refreshKey: number }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_HOST}/alerts?limit=20`, {
        headers: agentHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setLastRun(data.monitor_last_run ?? null);
    } catch {
      // host chưa chạy — im lặng
    }
  }, []);

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
              {a.title}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant/70">{a.detail}</p>
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

export default function AgentChatPage() {
  const [role, setRole] = useState<AgentRole>("shop");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, statusLine]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setBusy(true);
      setMessages((m) => [
        ...m,
        { role: "user", text, ux: [], done: true },
        { role: "assistant", text: "", ux: [], done: false },
      ]);

      const controller = new AbortController();
      try {
        const res = await fetch(`${AGENT_HOST}/${role}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json", ...agentHeaders() },
          body: JSON.stringify({ message: text, session_id: sessionIdRef.current }),
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
              case "turn_complete":
              case "done":
                patch((b) => ({ ...b, done: true }));
                break;
            }
          }
        }
      } catch (e) {
        setMessages((m) =>
          m.map((b, i) =>
            i === m.length - 1
              ? {
                  ...b,
                  done: true,
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
    [busy, role],
  );

  return (
    <main className="min-h-screen bg-surface text-on-surface">
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
          <div className="mt-space-md flex gap-2">
            {(["shop", "merchant"] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  setMessages([]);
                  sessionIdRef.current = null;
                }}
                className={`px-4 py-2 font-label-spec text-label-spec uppercase tracking-wider transition-colors ${
                  role === r
                    ? "bg-primary text-surface-lowest"
                    : "border border-outline-variant/40 text-on-surface-variant hover:border-primary hover:text-primary"
                }`}
              >
                {r === "shop" ? "Khách hàng" : "Vận hành"}
              </button>
            ))}
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
                {!m.done && busy && (
                  <p className="p-space-md font-body-sm text-body-sm text-on-surface-variant animate-pulse">
                    ▍{statusLine ?? "đang suy nghĩ…"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

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

        <AlertFeed refreshKey={messages.length} />
      </div>
    </main>
  );
}
