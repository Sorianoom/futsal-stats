"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { canVisit, homeFor } from "@/lib/roles";

const CENTERED = "flex min-h-dvh flex-col items-center justify-center gap-4 text-lg";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Un jugador que entra por URL en una pantalla de entrenador va a la suya sin llegar a verla.
  const forbidden = status === "authenticated" && user !== null && !canVisit(user.role, pathname);
  const fallback = user ? homeFor(user.role) : null;

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (forbidden && fallback) router.replace(fallback);
  }, [forbidden, fallback, router]);

  if (status === "authenticated" && !forbidden) return <>{children}</>;
  if (status === "offline") {
    return (
      <div className={CENTERED}>
        <p role="status">Sin conexión con el servidor. Tu sesión sigue guardada.</p>
        <Button size="lg" onClick={() => void retry()}>
          Reintentar
        </Button>
      </div>
    );
  }
  return (
    <div className={`${CENTERED} text-muted-foreground`}>
      <p role="status">
        {status === "loading" ? "Cargando…" : forbidden ? "Redirigiendo…" : "Redirigiendo al inicio de sesión…"}
      </p>
    </div>
  );
}
