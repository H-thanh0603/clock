"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiUrl, csrfFetch } from "@/lib/api-client";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseUser(res: Response): Promise<AuthUser> {
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      (Array.isArray(data.message) ? data.message.join(", ") : data.message) ??
        data.error ??
        "Lỗi xác thực"
    );
  return data.user as AuthUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/auth/me"), {
        credentials: "include",
      });
      const data = await res.json();
      setUser((data.user as AuthUser | null) ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await csrfFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const u = await parseUser(res);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await csrfFetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          (Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message) ??
            data.error ??
            "Lỗi đăng ký"
        );
      // Email đã tồn tại → backend không auto-login (chống enumeration).
      if (!data.user)
        throw new Error(
          data.message ?? "Email này có thể đã được đăng ký. Hãy thử đăng nhập."
        );
      const u = data.user as AuthUser;
      setUser(u);
      return u;
    },
    []
  );

  const logout = useCallback(async () => {
    await csrfFetch(apiUrl("/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (name: string) => {
    const res = await csrfFetch("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(
        (Array.isArray(data.message) ? data.message.join(", ") : data.message) ??
          "Cập nhật thất bại"
      );
    setUser((data.user as AuthUser | null) ?? null);
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      const res = await csrfFetch("/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          (data && (Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message)) ??
            "Đổi mật khẩu thất bại"
        );
      // Token đã bị thu hồi server-side → đăng xuất client.
      setUser(null);
      window.location.href = "/login";
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refresh,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải dùng trong AuthProvider");
  return ctx;
}
