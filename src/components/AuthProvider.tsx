"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiUrl } from "@/lib/api-client";

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
    const res = await fetch(apiUrl("/auth/login"), {
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
      const res = await fetch(apiUrl("/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      const u = await parseUser(res);
      setUser(u);
      return u;
    },
    []
  );

  const logout = useCallback(async () => {
    await fetch(apiUrl("/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh }}
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
