import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  clearSessionCookie,
  sessionCookie,
  signSession,
  verifySessionToken,
  type SessionUser,
} from "@/lib/session";

const USER: SessionUser = {
  id: "user-123",
  email: "khach@aurel.local",
  role: "CUSTOMER",
};

beforeAll(() => {
  process.env.JWT_SECRET = "TEST_SECRET_SESSION_0987654321";
});

describe("signSession / verifySessionToken", () => {
  it("roundtrip: ký rồi xác thực trả lại đúng user", async () => {
    const token = await signSession(USER);
    const session = await verifySessionToken(token);
    expect(session).toEqual(USER);
  });

  it("token rỗng/undefined → null (không throw)", async () => {
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("token bị sửa/hết hạn → null", async () => {
    const token = await signSession(USER);
    expect(await verifySessionToken(token + "x")).toBeNull();
    // Token hết hạn ngay (exp = 0)
    const expired = await new SignJWT({ email: USER.email, role: USER.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER.id)
      .setIssuedAt()
      .setExpirationTime(0)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("payload thiếu email → null", async () => {
    const bad = await new SignJWT({ role: "CUSTOMER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await verifySessionToken(bad)).toBeNull();
  });

  it("thiếu JWT_SECRET → throw rõ ràng", async () => {
    const prev = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await expect(signSession(USER)).rejects.toThrow("JWT_SECRET");
    } finally {
      process.env.JWT_SECRET = prev;
    }
  });
});

describe("cookie helpers", () => {
  it("sessionCookie đúng format HttpOnly + Max-Age 7 ngày", () => {
    const c = sessionCookie("tok.abc");
    expect(c).toBe(
      `${SESSION_COOKIE}=tok.abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    );
  });

  it("clearSessionCookie xoá với Max-Age=0", () => {
    expect(clearSessionCookie()).toBe(
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
  });
});
