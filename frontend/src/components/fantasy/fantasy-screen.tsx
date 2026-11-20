"use client";

import { useAuth } from "@/components/auth-provider";
import { ClausesPanel } from "@/components/fantasy/clauses-panel";
import { DisplayNameDialog } from "@/components/fantasy/display-name-dialog";
import { FantasyTabs, type FantasyTab } from "@/components/fantasy/fantasy-tabs";
import { MarketPanel } from "@/components/fantasy/market-panel";
import { MyTeam } from "@/components/fantasy/my-team";
import { NoLeague } from "@/components/fantasy/no-league";
import { PackOpening } from "@/components/fantasy/pack-opening";
import { RoundTicker } from "@/components/fantasy/round-ticker";
import { RulesDialog } from "@/components/fantasy/rules-dialog";
import { Standings } from "@/components/fantasy/standings-table";
import { TeamSummary } from "@/components/fantasy/team-summary";
import { ThemeToggle } from "@/components/fantasy/theme-toggle";
import { TransfersPanel } from "@/components/fantasy/transfers-panel";
import { Button } from "@/components/ui/button";
import { isSpectatorView, type FantasyLeagueView } from "@/lib/api/fantasy-types";
import { useFantasyTheme } from "@/lib/fantasy/theme";
import { fantasyMeQuery } from "@/lib/queries";
import { useApiQuery } from "@/lib/use-api-query";

const ICON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS = {
  team: (
    <svg {...ICON}>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
    </svg>
  ),
  market: (
    <svg {...ICON}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9h18" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  clauses: (
    <svg {...ICON}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  standings: (
    <svg {...ICON}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  ),
  transfers: (
    <svg {...ICON}>
      <path d="M7 7h12l-3-3" />
      <path d="M17 17H5l3 3" />
    </svg>
  ),
};

function League({ view, onChanged }: { view: FantasyLeagueView; onChanged: () => void }) {
  const { user } = useAuth();
  // Un jugador sale con el nombre de su ficha; las cuentas del cuerpo técnico eligen el suyo.
  const canRename = user !== null && user.role !== "player";
  const privateSquad = view.me.private_squad === true;
  const tabs: FantasyTab[] = [
    { id: "team", label: "Mi equipo", short: "Equipo", icon: ICONS.team, render: () => <MyTeam view={view} onChanged={onChanged} /> },
    {
      id: "market",
      label: "Mercado",
      short: "Mercado",
      icon: ICONS.market,
      render: () => (
        <MarketPanel
          balance={view.me.balance}
          ownedPlayers={new Set(view.squad.map((copy) => copy.player_id))}
          onChanged={onChanged}
        />
      ),
    },
    {
      id: "clauses",
      label: "Cláusulas",
      short: "Cláusulas",
      icon: ICONS.clauses,
      render: () => (
        <ClausesPanel
          balance={view.me.balance}
          squadFull={view.squad.length >= view.me.squad_limit}
          privateSquad={privateSquad}
          onChanged={onChanged}
        />
      ),
    },
    {
      id: "standings",
      label: "Clasificación",
      short: "Liga",
      icon: ICONS.standings,
      render: () => <Standings myId={view.me.participant_id} />,
    },
    { id: "transfers", label: "Fichajes", short: "Fichajes", icon: ICONS.transfers, render: () => <TransfersPanel /> },
  ];
  return (
    <>
      <PackOpening participantId={view.me.participant_id} squad={view.squad} />
      <RoundTicker round={view.next_round} />
      <TeamSummary view={view} />
      <div className="flex flex-wrap justify-end gap-2">
        {canRename ? <DisplayNameDialog current={view.me.display_name} onChanged={onChanged} /> : null}
        <RulesDialog squadLimit={view.me.squad_limit} />
      </div>
      <FantasyTabs tabs={tabs} label="Secciones del Fantasy" />
    </>
  );
}

/** Cuenta de partidos del cuerpo técnico: sin equipo, solo la clasificación. */
function Spectator() {
  return (
    <>
      <p className="rounded-2xl border bg-card p-4">
        Con esta cuenta solo ves la clasificación. Para jugar, entra con tu cuenta del Fantasy.
      </p>
      <Standings myId={null} />
    </>
  );
}

export function FantasyScreen() {
  const { user } = useAuth();
  const { data, failed, reload } = useApiQuery(fantasyMeQuery.key, fantasyMeQuery.fetch);
  const { mode, toggle } = useFantasyTheme();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-4xl font-extrabold tracking-tight">Fantasy</h1>
        <ThemeToggle mode={mode} onToggle={toggle} />
      </div>
      {failed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <p>No se pudo cargar el Fantasy</p>
          <Button variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {data === null && !failed ? <p className="text-muted-foreground">Cargando…</p> : null}
      {data && data.league === null ? (
        <NoLeague canCreate={user?.role === "head_coach"} onCreated={reload} />
      ) : null}
      {data && data.league !== null && isSpectatorView(data) ? <Spectator /> : null}
      {data && data.league !== null && !isSpectatorView(data) ? <League view={data} onChanged={reload} /> : null}
    </div>
  );
}
