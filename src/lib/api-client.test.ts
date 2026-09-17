import { describe, expect, it } from "vitest";
import { apiUrl } from "./api-client";

/** NV-3: apiUrl() không prefix lần 2 — gọi lồng nhau vẫn ra URL đúng. */
describe("apiUrl", () => {
  it("path tương đối → base + path", () => {
    expect(apiUrl("/auth/logout")).toBe("http://localhost:4000/auth/logout");
  });

  it("URL tuyệt đối truyền vào → giữ nguyên, không nhân đôi base", () => {
    const once = apiUrl("/auth/logout");
    expect(apiUrl(once)).toBe(once);
  });
});
