"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/labels";

const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/plantilla", label: "Plantilla" },
  { href: "/partido", label: "Partido" },
  { href: "/estadisticas", label: "Estadísticas" },
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
    (item) => !item.headCoachOnly || user?.role === "head_coach",
  );

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
    <div className="flex min-h-dvh">
      <aside className="flex w-60 shrink-0 flex-col gap-2 border-r bg-card p-4">
        <p className="px-2 pb-4 text-xl font-bold">Futsal Stats</p>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-2">
          {visibleItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex h-14 items-center rounded-lg px-4 text-lg font-medium hover:bg-muted",
                isActive(pathname, href) && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="px-2 text-sm text-muted-foreground">
            {user ? `${ROLE_LABEL[user.role]} · ${user.email}` : null}
          </p>
          {logoutFailed ? (
            <p role="alert" className="px-2 text-sm text-destructive">
              {LOGOUT_ERROR}
            </p>
          ) : null}
          <Button variant="outline" disabled={loggingOut} onClick={() => void handleLogout()}>
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
