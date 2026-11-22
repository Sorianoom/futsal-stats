"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { InstallPrompt } from "@/components/install-prompt";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/labels";
import { canVisit, homeFor } from "@/lib/roles";

const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/plantilla", label: "Plantilla" },
  { href: "/partido", label: "Partido" },
  { href: "/estadisticas", label: "Estadísticas" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/convocatoria", label: "Convocatoria", headCoachOnly: true },
  { href: "/puntos", label: "Puntos", headCoachOnly: true },
  { href: "/entrenos", label: "Entrenos", headCoachOnly: true },
];

const LOGOUT_ERROR = "No se pudo cerrar la sesión. Comprueba la conexión e inténtalo de nuevo.";

/** Secciones que caben en la barra de un móvil; con más, van en un menú. */
const MAX_INLINE_ITEMS_ON_PHONE = 3;

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-11 sm:px-4 sm:text-[15px]",
        active && "bg-foreground font-bold text-background hover:bg-foreground hover:text-background",
      )}
    >
      {label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.headCoachOnly || user?.role === "head_coach") &&
      (!user || canVisit(user.role, item.href)),
  );
  const home = user ? homeFor(user.role) : "/";
  // En el móvil, con muchas secciones (entrenadores) no caben: van en un menú desplegable.
  const compact = visibleItems.length > MAX_INLINE_ITEMS_ON_PHONE;
  const current = visibleItems.find((item) => isActive(pathname, item.href));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      await logout();
    } catch {
      setLogoutFailed(true);
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:h-[72px] sm:gap-3 sm:px-4 lg:gap-6 lg:px-7">
        <Link
          href={home}
          aria-label="Futsal Stats"
          className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground sm:size-9 sm:rounded-xl sm:text-[15px]"
          >
            FS
          </span>
          <span aria-hidden="true" className="hidden text-[17px] font-extrabold xl:inline">
            Futsal Stats
          </span>
        </Link>
        <nav aria-label="Principal" className="flex min-w-0 flex-1 items-center lg:justify-center">
          <div
            className={cn(
              "min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1 lg:flex-none [&::-webkit-scrollbar]:hidden",
              compact ? "hidden md:flex" : "flex",
            )}
          >
            {visibleItems.map(({ href, label }) => (
              <NavLink key={href} href={href} label={label} active={isActive(pathname, href)} />
            ))}
          </div>
          {compact ? (
            <div ref={menuRef} className="relative md:hidden">
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-controls="main-menu"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {current?.label ?? "Menú"}
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn("transition-transform", menuOpen && "rotate-180")}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
                <span className="sr-only">: abrir el menú</span>
              </button>
              {menuOpen ? (
                <ul
                  id="main-menu"
                  className="absolute top-[calc(100%+0.5rem)] left-0 z-30 w-56 space-y-0.5 rounded-2xl border bg-card p-1.5 shadow-xl"
                >
                  {visibleItems.map(({ href, label }) => {
                    const active = isActive(pathname, href);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex min-h-11 items-center rounded-xl px-3 text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            active ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
                          )}
                        >
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <p className="hidden text-sm text-muted-foreground 2xl:block">
            {user ? `${ROLE_LABEL[user.role]} · ${user.display_name || user.email}` : null}
          </p>
          <Button
            variant="ghost"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="size-10 rounded-full p-0 text-muted-foreground sm:h-9 sm:w-auto sm:px-3 sm:text-xs sm:font-semibold"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
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
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span aria-hidden="true" className="hidden sm:inline">
              Salir
            </span>
          </Button>
        </div>
      </header>
      {logoutFailed ? (
        <p role="alert" className="bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive lg:px-7">
          {LOGOUT_ERROR}
        </p>
      ) : null}
      <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-7">
        <InstallPrompt />
        {children}
      </main>
    </div>
  );
}
