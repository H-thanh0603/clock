/**
 * Mô tả machine-readable cho năng lực AI của site (Agent Manifest).
 *
 * Đọc: GET /.well-known/agent (JSON tĩnh, không auth — chỉ mô tả KHẢ NĂNG,
 * không lộ secret/endpoint nội bộ; MCP + merchant chat yêu cầu xác thực riêng).
 *
 * Chuẩn: tự mô tả tối giản theo gợi ý A2A (AgentCard) + MCP registry —
 * đủ để agent bên thứ ba biết: gọi gì, ở đâu, giới hạn nào, xin phép ở đâu.
 * Không phụ thuộc lib A2A (không thêm dep cho 1 file JSON).
 */

export type AgentManifest = {
  name: string;
  version: string;
  description: string;
  url: string;
  capabilities: string[];
  skills: { id: string; name: string; description: string }[];
  endpoints: {
    chat: string;
    mcp: string;
    a2a: string;
    activity: string;
    watches: string;
  };
  auth: {
    shop_chat: string;
    watches: string;
    merchant_chat: string;
    mcp_merchant: string;
  };
  limits: Record<string, string>;
  delegation: {
    endpoint: string;
    ttl_minutes: number;
    refresh: string;
    scope: string;
  };
};

/** Dựng manifest theo base URL public của site (SITE_URL hoặc host request). */
export function buildAgentManifest(base: string): AgentManifest {
  const root = base.replace(/\/$/, "");
  return {
    name: "Aurel & Co. — AI Concierge",
    version: "1.0.0",
    description:
      "Concierge AI cho boutique đồng hồ Aurel & Co.: tư vấn, tìm kiếm, theo dõi về hàng/giảm giá, tra đơn; vận hành (admin) qua staged-change có duyệt.",
    url: root,
    capabilities: ["shopping-concierge", "watch-alerts", "order-lookup", "merchant-ops-staged"],
    skills: [
      {
        id: "concierge",
        name: "Tư vấn mua sắm",
        description:
          "Hỏi đáp đồng hồ, so sánh, điền giỏ hộ (checkout do user bấm). POST /agent/chat.",
      },
      {
        id: "watch",
        name: "Theo dõi về hàng / giảm giá",
        description:
          "Đặt watch qua chat ('báo tôi khi...'); nhận alert qua GET /alerts?scope=shop.",
      },
      {
        id: "merchant-ops",
        name: "Vận hành (staged-change)",
        description:
          "Đề xuất đổi giá/tồn kho/khuyến mãi — luôn chờ operator duyệt. Cần x-agent-token.",
      },
    ],
    endpoints: {
      chat: `${root}/agent/chat`,
      mcp: `${root}/mcp`,
      // A2A thật (agent/aurel_agents/a2a.py): JSON-RPC message/send|stream +
      // tasks/get|cancel ở /a2a, AgentCard ở /.well-known/agent-card.json.
      a2a: `${root}/a2a`,
      activity: `${root}/api/agent/activity`,
      watches: `${root}/api/agent/watches`,
    },
    auth: {
      shop_chat: "none — công khai, rate-limit theo IP",
      watches: "session_id của chính session (chỉ xem/sửa watch của mình)",
      merchant_chat: "admin credential header (server-side, không public)",
      mcp_merchant: "admin credential header + approval từng apply_change",
    },
    limits: {
      chat_turns_per_day: "100/session, 1000/host",
      max_tool_iterations: "8/turn",
      watches_per_user: "20",
      delegation_ttl: "30 phút, refresh qua /auth/delegation/refresh",
    },
    delegation: {
      endpoint: `${root}/backend/auth/delegation`,
      ttl_minutes: 30,
      refresh: `${root}/backend/auth/delegation/refresh`,
      scope: "shop-on-behalf (CUSTOMER only)",
    },
  };
}
