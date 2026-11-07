"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";

const GENERIC_ERROR = "No se pudo iniciar sesión. Inténtalo de nuevo.";

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-lg text-muted-foreground">
        <p role="status">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-14 text-primary-foreground lg:flex">
        <svg
          aria-hidden="true"
          viewBox="0 0 760 520"
          fill="none"
          stroke="white"
          strokeOpacity={0.16}
          strokeWidth={3}
          className="pointer-events-none absolute -bottom-14 -left-28 h-[520px] w-[760px]"
        >
          <rect x="20" y="20" width="720" height="480" rx="8" />
          <path d="M380 20v480" />
          <circle cx="380" cy="260" r="90" />
          <path d="M20 150a110 110 0 0 1 0 220M740 150a110 110 0 0 0 0 220" />
        </svg>
        <p className="relative flex items-center gap-3 text-xl font-extrabold">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-2xl bg-white text-lg text-primary"
          >
            FS
          </span>
          Futsal Stats
        </p>
        <div className="relative max-w-md space-y-4">
          <p className="text-6xl leading-none font-extrabold tracking-tight">Cada punto, cada minuto.</p>
          <p className="text-lg font-semibold text-white/90">
            Convocatorias, puntos y partidos en vivo, también sin conexión.
          </p>
        </div>
      </aside>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight">Entrar</h1>
            <p className="text-muted-foreground">Accede con tu cuenta del equipo.</p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-base">
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-base">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-base text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="cta" size="lg" className="rounded-2xl" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
