"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/labels";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Inicio</h1>
        {user ? <p className="text-muted-foreground">Sesión de {ROLE_LABEL[user.role]}</p> : null}
      </header>
      <nav aria-label="Accesos" className="grid gap-4 sm:grid-cols-2">
        <Link href="/plantilla" className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-muted">
            <CardHeader>
              <CardTitle className="text-xl">Plantilla</CardTitle>
              <CardDescription>Jugadores, dorsales, posiciones y estado</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </nav>
    </div>
  );
}
