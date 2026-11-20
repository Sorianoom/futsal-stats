"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitation } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { homeFor } from "@/lib/roles";

const MISSING_TOKEN = "Al enlace le falta el código de invitación. Pide al entrenador un enlace nuevo.";
const PASSWORDS_DIFFER = "Las contraseñas no coinciden.";
const INVALID_INVITATION = "Esta invitación no es válida o ha caducado. Pide al entrenador un enlace nuevo.";
const EMAIL_TAKEN = "Ya hay una cuenta con ese correo. Usa otro.";
/** El esquema rechaza contraseñas larguísimas antes de validarlas (422 `validation_error`). */
const TOO_LONG_PASSWORD = "La contraseña es demasiado larga.";
const INVALID_EMAIL = "El correo electrónico no es válido.";
const TOO_MANY_ATTEMPTS = "Demasiados intentos. Espera unos minutos y vuelve a probar.";
const GENERIC_ERROR = "No se pudo crear la cuenta. Inténtalo de nuevo.";
const LOGIN_FAILED = "Tu cuenta está creada, pero no se pudo iniciar sesión.";
const VALIDATION_STATUS = 422;

/** Traduce cada error del contrato de `/auth/invitations/accept` a un mensaje para el jugador. */
function acceptErrorMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return GENERIC_ERROR;
  if (failure.code === "invalid_invitation") return INVALID_INVITATION;
  if (failure.code === "email_taken") return EMAIL_TAKEN;
  if (failure.code === "too_many_attempts") return TOO_MANY_ATTEMPTS;
  // El servidor explica qué le falta a la contraseña (p. ej. la longitud mínima).
  if (failure.code === "weak_password") return `${failure.message}.`;
  if (failure.status === VALIDATION_STATUS) {
    // El servidor nombra los campos rechazados: "Datos no válidos: email, password".
    if (failure.message.includes("password")) return TOO_LONG_PASSWORD;
    if (failure.message.includes("email")) return INVALID_EMAIL;
  }
  return GENERIC_ERROR;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Crea tu cuenta</h1>
          <p className="text-muted-foreground">
            El entrenador te ha invitado a la app del equipo: el Fantasy y las estadísticas.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}

function Field({ id, label, type, autoComplete, value, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function AcceptForm({ token }: { token: string }) {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== repeated) {
      setError(PASSWORDS_DIFFER);
      return;
    }
    setSubmitting(true);
    const trimmedEmail = email.trim();
    let created;
    try {
      created = await acceptInvitation({ token, email: trimmedEmail, password });
    } catch (failure) {
      setError(acceptErrorMessage(failure));
      setSubmitting(false);
      return;
    }
    try {
      await login(trimmedEmail, password);
      router.replace(homeFor(created.role));
    } catch {
      setAccountCreated(true);
      setSubmitting(false);
    }
  }

  if (accountCreated) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-base text-destructive">
          {`${LOGIN_FAILED} Entra con tu correo y tu contraseña.`}
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-12 items-center rounded-2xl border-2 bg-card px-5 font-bold"
        >
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field id="email" label="Correo electrónico" type="email" autoComplete="username" value={email} onChange={setEmail} />
      <Field
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />
      <Field
        id="password-repeat"
        label="Repite la contraseña"
        type="password"
        autoComplete="new-password"
        value={repeated}
        onChange={setRepeated}
      />
      {error ? (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="cta" size="lg" className="rounded-2xl" disabled={submitting}>
        {submitting ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}

const TOKEN_PARAM = "token";

/**
 * Lee el token del enlace y lo borra de la barra de direcciones (sin recargar) para que no
 * quede en el historial ni se filtre por `Referer`. El enlace lo lleva en el fragmento
 * (`#token=`), que nunca llega al servidor; `?token=` se acepta por los enlaces ya enviados.
 */
function takeInvitationToken(): string | null {
  const { hash, search, pathname } = window.location;
  const token =
    new URLSearchParams(hash.slice(1)).get(TOKEN_PARAM) ?? new URLSearchParams(search).get(TOKEN_PARAM);
  if (hash || search) window.history.replaceState(window.history.state, "", pathname);
  return token || null;
}

/** `undefined` mientras no se ha leído la URL (en el HTML estático no hay `window`). */
type TokenState = string | null | undefined;

function InvitationRoute() {
  const [token, setToken] = useState<TokenState>(undefined);
  // En desarrollo, StrictMode repite el efecto: la segunda vez la URL ya no tiene el token.
  const taken = useRef(false);

  useEffect(() => {
    if (taken.current) return;
    taken.current = true;
    // La URL solo existe en el cliente: se lee una vez tras montar (no cabe en el estado inicial
    // porque el HTML estático se genera sin `window` y la hidratación no casaría).
    setToken(takeInvitationToken());
  }, []);

  if (token === undefined) return <p className="text-muted-foreground">Cargando…</p>;
  if (token === null) {
    return (
      <p role="alert" className="text-base text-destructive">
        {MISSING_TOKEN}
      </p>
    );
  }
  return <AcceptForm token={token} />;
}

export default function InvitacionPage() {
  return (
    <Shell>
      <InvitationRoute />
    </Shell>
  );
}
