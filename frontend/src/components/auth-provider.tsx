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
import { clearSnapshots } from "@/lib/match/match-cache";
import { clearSavedUser, loadSavedUser, saveUser } from "@/lib/saved-user";

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
  /** Sesión sin verificar con el servidor: usuario guardado en el dispositivo y sin token. */
  degraded: boolean;
}

const ANONYMOUS: SessionState = { user: null, status: "anonymous", degraded: false };

/** Olvida al usuario y las copias de partidos. Lo anotado sin enviar se conserva siempre. */
async function forgetLocalSession(): Promise<void> {
  clearSavedUser();
  // Las copias son un respaldo: si no se pueden borrar ahora, se borrarán en el próximo cierre.
  await clearSnapshots().catch(() => undefined);
}

async function resolveSession(): Promise<SessionState> {
  try {
    const restored = await restoreSession();
    if (restored === null) {
      void forgetLocalSession();
      return ANONYMOUS;
    }
    saveUser(restored);
    return { user: restored, status: "authenticated", degraded: false };
  } catch (failure) {
    if (!isUnreachable(failure)) {
      void forgetLocalSession();
      return ANONYMOUS;
    }
    // Solo un rechazo explícito del servidor cierra la sesión: sin red se conserva la cookie, y
    // con un usuario guardado se sigue trabajando sin conexión hasta poder verificarla.
    const saved = loadSavedUser();
    if (saved === null) return { user: null, status: "offline", degraded: false };
    return { user: saved, status: "authenticated", degraded: true };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [degraded, setDegraded] = useState(false);

  const applySession = useCallback((next: SessionState) => {
    setUser(next.user);
    setStatus(next.status);
    setDegraded(next.degraded);
  }, []);

  const retry = useCallback(async () => {
    // Con la sesión degradada se sigue mostrando la app: pasar por "loading" desmontaría el partido.
    if (!degraded) setStatus("loading");
    applySession(await resolveSession());
  }, [applySession, degraded]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void forgetLocalSession();
      applySession(ANONYMOUS);
    });
    void resolveSession().then(applySession);
    return () => setUnauthorizedHandler(null);
  }, [applySession]);

  useEffect(() => {
    if (status !== "offline" && !degraded) return;
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, degraded, retry]);

  const login = useCallback(async (email: string, password: string) => {
    const loggedIn = await loginRequest(email, password);
    saveUser(loggedIn);
    setUser(loggedIn);
    setStatus("authenticated");
    setDegraded(false);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    await forgetLocalSession();
    setUser(null);
    setStatus("anonymous");
    setDegraded(false);
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, retry }),
    [user, status, login, logout, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
