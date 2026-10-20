"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";

const CENTERED = "flex min-h-dvh flex-col items-center justify-center gap-4 text-lg";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retry } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status === "authenticated") return <>{children}</>;
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
        {status === "loading" ? "Cargando…" : "Redirigiendo al inicio de sesión…"}
      </p>
    </div>
  );
}
