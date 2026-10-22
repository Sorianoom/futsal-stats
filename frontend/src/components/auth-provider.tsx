"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { login as loginRequest, logout as logoutRequest, restoreSession } from "@/lib/api/auth";
import { isUnreachable, setUnauthorizedHandler } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

/** `offline`: no se pudo verificar la sesión (sin red o servidor caído); no equivale a anónimo. */
export type AuthStatus = "loading" | "anonymous" | "authenticated" | "offline";

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  /** Rechaza si el servidor no confirma el cierre: la sesión sigue abierta. */
  logout: () => Promise<void>;
  /** Vuelve a intentar restaurar la sesión tras un arranque sin conexión. */
  retry: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}

interface SessionState {
  user: User | null;
  status: AuthStatus;
}

async function resolveSession(): Promise<SessionState> {
  try {
    const restored = await restoreSession();
    return { user: restored, status: restored ? "authenticated" : "anonymous" };
  } catch (failure) {
    // Solo un rechazo explícito del servidor cierra la sesión: sin red se conserva la cookie.
    return { user: null, status: isUnreachable(failure) ? "offline" : "anonymous" };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const applySession = useCallback((next: SessionState) => {
    setUser(next.user);
    setStatus(next.status);
  }, []);

  const retry = useCallback(async () => {
    setStatus("loading");
    applySession(await resolveSession());
  }, [applySession]);

  useEffect(() => {
    setUnauthorizedHandler(() => applySession({ user: null, status: "anonymous" }));
    void resolveSession().then(applySession);
    return () => setUnauthorizedHandler(null);
  }, [applySession]);

  useEffect(() => {
    if (status !== "offline") return;
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, retry]);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await loginRequest(email, password));
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, retry }),
    [user, status, login, logout, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
