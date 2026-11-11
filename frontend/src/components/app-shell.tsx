"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
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
      <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center gap-3 border-b bg-card px-4 lg:gap-6 lg:px-7">
        <Link
          href={home}
          aria-label="Futsal Stats"
          className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground"
          >
            FS
          </span>
          <span aria-hidden="true" className="hidden text-[17px] font-extrabold xl:inline">
            Futsal Stats
          </span>
        </Link>
        <nav
          aria-label="Principal"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:justify-center"
        >
          {visibleItems.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active && "bg-foreground font-bold text-background hover:bg-foreground hover:text-background",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden text-sm text-muted-foreground 2xl:block">
            {user ? `${ROLE_LABEL[user.role]} · ${user.email}` : null}
          </p>
          <Button
            variant="outline"
            className="h-11 rounded-full px-4 text-sm font-semibold"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            Cerrar sesión
          </Button>
        </div>
      </header>
      {logoutFailed ? (
        <p role="alert" className="bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive lg:px-7">
          {LOGOUT_ERROR}
        </p>
      ) : null}
      <main className="flex-1 p-4 lg:p-7">{children}</main>
    </div>
  );
}
