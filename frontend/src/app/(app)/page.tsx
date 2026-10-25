"use client";

import {
  CalendarDays,
  ChartColumnBig,
  CirclePlay,
  ListChecks,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import type { Match } from "@/lib/api/match-types";
import { listMatches } from "@/lib/api/matches";
import { listPlayers } from "@/lib/api/players";
import type { Player } from "@/lib/api/types";
import { pickFeaturedMatch } from "@/lib/featured-match";
import { ROLE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { formatLongDay, todayInMadrid } from "@/lib/weeks";

const LOAD_ERROR = "No se pudo cargar el resumen";

interface Shortcut {
  href: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  headCoachOnly?: boolean;
  count?: number;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function rosterHint(players: Player[] | null): string {
  if (players === null) return "Jugadores, dorsales y estado";
  const injured = players.filter((player) => player.status === "injured").length;
  const available = players.length - injured;
  return `${plural(available, "disponible", "disponibles")} · ${plural(injured, "lesionado", "lesionados")}`;
}

function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 520 300"
      fill="none"
      stroke="white"
      strokeOpacity={0.18}
      strokeWidth={3}
      className="pointer-events-none absolute -top-5 -right-20 hidden h-72 w-[520px] md:block"
    >
      <rect x="20" y="20" width="480" height="260" rx="6" />
      <path d="M260 20v260" />
      <circle cx="260" cy="150" r="56" />
      <path d="M20 90a60 60 0 0 1 0 120M500 90a60 60 0 0 0 0 120" />
    </svg>
  );
}

interface FeaturedProps {
  matches: Match[] | null;
  loadFailed: boolean;
  isHeadCoach: boolean;
}

const HERO_CTA = cn(buttonVariants({ variant: "cta", size: "lg" }), "rounded-2xl");
const HERO_LIGHT = cn(
  buttonVariants({ size: "lg" }),
  "rounded-2xl border-2 border-white/60 bg-transparent text-white hover:bg-white/10",
);

function FeaturedMatchCard({ matches, loadFailed, isHeadCoach }: FeaturedProps) {
  const featured = matches ? pickFeaturedMatch(matches, todayInMadrid()) : null;

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-primary p-8 text-primary-foreground">
      <CourtLines />
      <div className="relative space-y-5">
        {featured ? (
          <>
            <div className="space-y-2">
              <p className="text-sm font-extrabold tracking-widest text-white/80 uppercase">
                {featured.kind === "upcoming" ? "Próximo partido" : "Último partido"}
              </p>
              <p className="block text-5xl font-extrabold tracking-tight first-letter:uppercase">
                {formatLongDay(featured.match.held_on)}
              </p>
              <p className="text-lg font-semibold text-white/90">{`vs. ${featured.match.opponent}`}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/partido?id=${featured.match.id}`} className={HERO_CTA}>
                {featured.kind === "upcoming" ? "Empezar partido" : "Abrir partido"}
              </Link>
              {isHeadCoach && featured.kind === "upcoming" ? (
                <Link href="/convocatoria" className={HERO_LIGHT}>
                  Ver convocatoria
                </Link>
              ) : null}
            </div>
          </>
        ) : matches === null && !loadFailed ? (
          <p className="text-lg font-semibold">Cargando partidos…</p>
        ) : matches === null ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">No se pudieron cargar los partidos.</p>
            <Link href="/partido" className={HERO_LIGHT}>
              Ir a partidos
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-2xl font-extrabold">No hay partidos programados</p>
            <Link href="/partido" className={HERO_CTA}>
              Crear partido
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const isHeadCoach = user?.role === "head_coach";
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listMatches()
      .then((list) => active && setMatches(list))
      .catch(() => active && setLoadFailed(true));
    listPlayers()
      .then((list) => active && setPlayers(list))
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const shortcuts: Shortcut[] = [
    { href: "/plantilla", title: "Plantilla", hint: rosterHint(players), icon: Users, count: players?.length },
    { href: "/partido", title: "Partido", hint: "Anotar en vivo o repasar uno", icon: CirclePlay },
    { href: "/estadisticas", title: "Estadísticas", hint: "Jugadores y partidos", icon: ChartColumnBig },
    { href: "/convocatoria", title: "Convocatoria", hint: "Ranking y plazas de la semana", icon: ListChecks, headCoachOnly: true },
    { href: "/puntos", title: "Puntos", hint: "Faltas, victorias y saldo", icon: Star, headCoachOnly: true },
    { href: "/entrenos", title: "Entrenos", hint: "Sesiones y asistencia", icon: CalendarDays, headCoachOnly: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="space-y-1">
        {user ? (
          <p className="text-sm font-bold text-muted-foreground">{`Sesión de ${ROLE_LABEL[user.role]}`}</p>
        ) : null}
        <h1 className="text-4xl font-extrabold tracking-tight">Inicio</h1>
      </header>

      {loadFailed ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {LOAD_ERROR}
        </p>
      ) : null}

      <FeaturedMatchCard matches={matches} loadFailed={loadFailed} isHeadCoach={isHeadCoach} />

      <nav aria-label="Accesos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts
          .filter((shortcut) => !shortcut.headCoachOnly || isHeadCoach)
          .map(({ href, title, hint, icon: Icon, count }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-24 items-center gap-4 rounded-3xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary"
              >
                <Icon className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold">{title}</span>
                <span className="block text-sm font-medium text-muted-foreground">{hint}</span>
              </span>
              {count !== undefined ? (
                <span className="text-3xl font-extrabold tabular-nums">{count}</span>
              ) : null}
            </Link>
          ))}
      </nav>
    </div>
  );
}
