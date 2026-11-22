"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/** Evento de Chrome (Android y escritorio) para instalar la app con su propio diálogo. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "install-prompt-dismissed-at";
/** Tras «Ahora no», no se vuelve a sugerir en este tiempo. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type Mode = "chrome" | "ios" | null;

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** iPhone, iPod o iPad (el iPad moderno se presenta como Mac con pantalla táctil). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iP(hone|od|ad)/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

function snoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento (modo privado): solo se oculta hasta recargar.
  }
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-text-bottom"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

/**
 * Sugiere instalar la app en la pantalla de inicio: en Chrome (Android) con su botón «Instalar»
 * y en Safari (iPhone y iPad), que no tiene botón, explicando los dos toques. Si ya está
 * instalada o se descartó hace poco, no pinta nada.
 */
function subscribeNever(): () => void {
  return () => {};
}

/** En el iPhone o iPad sin instalar y sin descartar: Safari no avisa, así que se explica. */
function iosHintSnapshot(): boolean {
  return isIos(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone() && !snoozed();
}

export function InstallPrompt() {
  // En el servidor (export estático) no hay navegador: no se sugiere nada hasta hidratar.
  const iosHint = useSyncExternalStore(subscribeNever, iosHintSnapshot, () => false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      if (isStandalone() || snoozed()) return;
      setDeferred(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setHidden(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: Mode = hidden ? null : deferred ? "chrome" : iosHint ? "ios" : null;
  if (mode === null) return null;

  function dismiss() {
    snooze();
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setHidden(true);
  }

  return (
    <aside
      aria-label="Instalar la app"
      className="mb-3 flex flex-col gap-2 rounded-2xl border bg-card p-3 text-sm sm:mb-4 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground"
      >
        FS
      </span>
      <p className="min-w-0 flex-1">
        <span className="block font-bold">Instala Futsal Stats en tu pantalla de inicio</span>
        {mode === "ios" ? (
          <span className="block text-muted-foreground">
            {"Toca "}
            <ShareIcon />
            {" Compartir (abajo en Safari) y luego «Añadir a pantalla de inicio»."}
          </span>
        ) : (
          <span className="block text-muted-foreground">Se abre como una app, a pantalla completa.</span>
        )}
      </p>
      </span>
      <span className="flex justify-end gap-2">
        <Button variant="ghost" className="h-10 px-3 text-sm" onClick={dismiss}>
          Ahora no
        </Button>
        {mode === "chrome" ? (
          <Button className="h-10 px-4 text-sm" onClick={() => void install()}>
            Instalar
          </Button>
        ) : null}
      </span>
    </aside>
  );
}
