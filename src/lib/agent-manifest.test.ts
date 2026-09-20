import { describe, expect, it } from "vitest";
import { buildAgentManifest } from "./agent-manifest";

describe("agent manifest", () => {
  it("đủ trường agent ngoài cần, không lộ secret", () => {
    const m = buildAgentManifest("https://shop.example.com");
    expect(m.name).toContain("Aurel");
    expect(m.endpoints.chat).toBe("https://shop.example.com/agent/chat");
    expect(m.endpoints.mcp).toBe("https://shop.example.com/mcp");
    expect(m.endpoints.a2a).toBe("https://shop.example.com/a2a");
    const raw = JSON.stringify(m).toLowerCase();
    for (const secret of ["password", "secret", "jwt", "8200", "8201", "8100", "127.0.0.1", "localhost:"]) {
      expect(raw, `lộ ${secret}`).not.toContain(secret);
    }
  });
  it("base có slash thừa vẫn chuẩn hóa", () => {
    expect(buildAgentManifest("https://x/").endpoints.chat).toBe("https://x/agent/chat");
  });
});
