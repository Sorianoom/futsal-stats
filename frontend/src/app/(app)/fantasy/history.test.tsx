import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ME, ROUND, STANDINGS, TRANSFERS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /fantasy/me": { data: ME },
    "GET /fantasy/standings": { data: STANDINGS },
    "GET /fantasy/rounds/m1/me": { data: ROUND },
    "GET /fantasy/rounds/m0/me": {
      data: { ...ROUND, match_id: "m0", status: "settled", total: 0, payout: 0, negative_balance: true },
    },
    "GET /fantasy/transfers": { data: TRANSFERS },
    ...extra,
  });
}

async function openTab(name: string) {
  renderWithAuth(<FantasyPage />);
  await userEvent.click(await screen.findByRole("tab", { name }));
}

describe("Pestañas", () => {
  it("empieza en Mi equipo y cambia de sección", async () => {
    api();
    renderWithAuth(<FantasyPage />);

    const team = await screen.findByRole("tab", { name: "Mi equipo" });
    expect(team).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Mi equipo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Fichajes" }));

    expect(screen.getByRole("tab", { name: "Fichajes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Alineación" })).not.toBeInTheDocument();
  });

  it("se mueve con las flechas del teclado", async () => {
    api();
    renderWithAuth(<FantasyPage />);
    (await screen.findByRole("tab", { name: "Mi equipo" })).focus();

    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Jornadas" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Jornadas" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Clasificación", () => {
  it("en el móvil enseña solo la jornada elegida, por defecto la última con puntos", async () => {
    api();
    await openTab("Clasificación");
    const table = await screen.findByRole("table", { name: "Clasificación" });
    const column = (name: RegExp) => within(table).getByRole("button", { name }).closest("th") as HTMLElement;
    const select = screen.getByRole("combobox", { name: "Jornada en la tabla" });

    expect(select).toHaveDisplayValue(/Betis/);
    expect(column(/Betis/)).not.toHaveClass("hidden");
    expect(column(/Almería/)).toHaveClass("hidden", "sm:table-cell");

    await userEvent.selectOptions(select, within(select).getByRole("option", { name: /Almería/ }));

    expect(column(/Almería/)).not.toHaveClass("hidden");
    expect(column(/Betis/)).toHaveClass("hidden", "sm:table-cell");
  });

  it("marca las jornadas provisionales y no las cerradas", async () => {
    api();

    await openTab("Clasificación");

    const table = await screen.findByRole("table", { name: "Clasificación" });
    const header = within(table).getAllByRole("row")[0];
    expect(within(header).getByRole("button", { name: /Betis/ })).toHaveTextContent("Provisional");
    expect(within(header).getByRole("button", { name: /Almería/ })).not.toHaveTextContent("Provisional");
  });

  it("una jornada provisional lo explica en su detalle", async () => {
    api();
    await openTab("Clasificación");
    const table = await screen.findByRole("table", { name: "Clasificación" });

    await userEvent.click(within(table).getByRole("button", { name: /Betis/ }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(/Puntos provisionales/);
  });

  it("una jornada cerrada con saldo negativo explica por qué puntuó 0 y lo cobrado", async () => {
    api();
    await openTab("Clasificación");
    const table = await screen.findByRole("table", { name: "Clasificación" });

    await userEvent.click(within(table).getByRole("button", { name: /Almería/ }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Puntuó 0: tenías saldo negativo/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Cobrado: 0,0 M");
    expect(dialog).toHaveTextContent("saldo negativo al empezar el partido: no cobra");
  });
});

/** Elige una jornada en el desplegable de la pestaña Jornadas. */
async function pickRound(opponent: RegExp) {
  const select = await screen.findByRole("combobox", { name: "Jornada" });
  await userEvent.selectOptions(select, within(select).getByRole("option", { name: opponent }));
  return screen.findByRole("region", { name: /^Jornada vs/ });
}

describe("Jornadas", () => {
  it("lista mis puntos por jornada, la más reciente arriba, y enseña en la pista la última con puntos", async () => {
    api();

    await openTab("Jornadas");

    const select = await screen.findByRole("combobox", { name: "Jornada" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringMatching(/Cádiz.*pendiente/),
      expect.stringMatching(/Betis.*25 pts \(provisional\)/),
      expect.stringMatching(/Almería.*8 pts/),
    ]);
    expect(select).toHaveDisplayValue(/Betis/);
    expect(screen.getByText("Total: 33 pts")).toBeInTheDocument();

    const mine = await screen.findByRole("region", { name: "Mi alineación" });
    expect(within(mine).getByRole("button", { name: "Ana Ruiz: 13 puntos" })).toBeInTheDocument();
  });

  it("elegir otra jornada la enseña en la pista", async () => {
    api();
    await openTab("Jornadas");

    const round = await pickRound(/Almería/);

    expect(round).toHaveAccessibleName("Jornada vs Almería");
    expect(await within(round).findByText(/Puntuó 0: tenías saldo negativo/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("la jornada se ve en la pista con los puntos y explica por qué puntuó cada uno", async () => {
    api();
    await openTab("Jornadas");
    const lineup = await screen.findByRole("region", { name: "Mi alineación" });

    await userEvent.click(within(lineup).getByRole("button", { name: "Ana Ruiz: 13 puntos" }));

    const why = within(lineup).getByRole("region", { name: "Por qué: Ana Ruiz" });
    for (const text of [
      "Base5,4",
      "2 goles+5,0",
      "2 asistencias+1,4",
      "2 robos+0,6",
      "2 goles a favor con él en pista+0,3",
      "Nota exacta 12,7, redondeada13",
      "Total13",
    ]) {
      expect(why).toHaveTextContent(text);
    }
  });

  it("en una jornada ya bloqueada se ve lo que alineó cada uno, con su capitán", async () => {
    api({
      "GET /fantasy/rounds/m1/participants/pa1": {
        data: {
          ...ROUND,
          total: 30,
          slots: ROUND.slots.map((slot) => (slot.copy_id === "c2" ? { ...slot, captain: true, points: 12 } : slot)),
        },
      },
    });
    await openTab("Jornadas");
    const round = await screen.findByRole("region", { name: "Jornada vs Betis" });

    const picker = await within(round).findByRole("combobox", { name: "Ver la alineación de" });
    expect(picker).toHaveDisplayValue("Carla Ruiz (tú) · 25 pts");
    expect(within(round).getByRole("region", { name: "Mi alineación" })).toBeInTheDocument();
    const ranking = within(round).getByRole("list", { name: "Beneficio tras la jornada" });
    expect(within(ranking).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/1º.*Míster.*30 pts.*\+3,0 M/),
      expect.stringMatching(/2º.*Carla Ruiz \(tú\).*25 pts.*\+2,5 M/),
    ]);
    expect(round).toHaveTextContent("Lo que ganará al cerrarse la jornada cada uno: 0,1 M por punto");
    await userEvent.selectOptions(picker, within(picker).getByRole("option", { name: /Míster/ }));

    const lineup = await within(round).findByRole("region", { name: "Alineación de Míster" });
    expect(lineup).toHaveTextContent("Cobrará al cerrarse: 3,0 M (30 puntos × 0,1 M)");
    await userEvent.click(within(lineup).getByRole("button", { name: "Bea Soto: 12 puntos" }));
    expect(within(lineup).getByRole("region", { name: "Por qué: Bea Soto" })).toHaveTextContent("Capitán×2");
    await userEvent.click(within(ranking).getByRole("button", { name: /Carla Ruiz/ }));
    expect(await within(round).findByRole("region", { name: "Mi alineación" })).toBeInTheDocument();
    expect(within(round).queryByRole("region", { name: "Alineación de Míster" })).not.toBeInTheDocument();
  });

  it("una jornada pendiente no enseña los equipos de los demás", async () => {
    api({ "GET /fantasy/rounds/m2/me": { data: { ...ROUND, match_id: "m2", status: "pending", total: 0 } } });
    await openTab("Jornadas");

    const round = await pickRound(/Cádiz/);

    await within(round).findByRole("region", { name: "Mi alineación" });
    expect(within(round).queryByRole("combobox", { name: "Ver la alineación de" })).not.toBeInTheDocument();
    expect(within(round).queryByRole("list", { name: "Beneficio tras la jornada" })).not.toBeInTheDocument();
  });

  it("de una plantilla privada solo dice que es privada", async () => {
    api({
      "GET /fantasy/rounds/m1/participants/pa1": {
        status: 403,
        error: { code: "private_squad", message: "Su plantilla es privada" },
      },
    });
    await openTab("Jornadas");
    const round = await screen.findByRole("region", { name: "Jornada vs Betis" });

    const picker = await within(round).findByRole("combobox", { name: "Ver la alineación de" });
    await userEvent.selectOptions(picker, within(picker).getByRole("option", { name: /Míster/ }));

    expect(await within(round).findByText("Su plantilla es privada: no se ve su alineación.")).toBeInTheDocument();
  });

  it("con la alineación bloqueada y el partido sin cerrar, enseña la jornada en juego y la próxima", async () => {
    api({
      "GET /fantasy/me": {
        data: { ...ME, live_round: { match_id: "m9", opponent: "Chapeldunac", held_on: "2026-11-22" } },
      },
    });
    renderWithAuth(<FantasyPage />);

    expect(await screen.findByText("vs Chapeldunac")).toBeInTheDocument();
    expect(screen.getByText("En juego")).toBeInTheDocument();
    expect(screen.getByText("Próxima jornada")).toBeInTheDocument();
  });
});

describe("Equipo de otro participante", () => {
  const TEAM = {
    participant_id: "pa2",
    display_name: "Carla Ruiz",
    private_squad: false,
    team_value: 9000,
    squad: [{ ...ME.squad[0], copy_id: "z1", name: "Iker Sanz" }],
    last_round: { match_id: "m1", opponent: "Betis", held_on: "2026-11-01" },
    last_lineup: ROUND,
  };

  async function openParticipant(name: string, extra: Record<string, MockHandler> = {}) {
    api({ "GET /fantasy/participants/pa2": { data: TEAM }, ...extra });
    await openTab("Clasificación");
    const table = await screen.findByRole("table", { name: "Clasificación" });
    await userEvent.click(within(table).getByRole("button", { name }));
    return screen.findByRole("dialog");
  }

  it("tocar su nombre abre su alineación con los puntos y su plantilla", async () => {
    const dialog = await openParticipant("Carla Ruiz");

    expect(within(dialog).getByRole("heading", { name: "Carla Ruiz" })).toBeInTheDocument();
    const lineup = await within(dialog).findByRole("region", { name: "Alineación de Carla Ruiz" });
    expect(within(lineup).getByRole("button", { name: "Ana Ruiz: 13 puntos" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Alineación vs Betis");
    expect(dialog).toHaveTextContent("Total: 25");
    expect(dialog).not.toHaveTextContent("Cobrado");
    const squad = within(dialog).getByRole("list", { name: "Plantilla de Carla Ruiz" });
    expect(within(squad).getAllByRole("listitem")).toHaveLength(1);
    expect(squad).toHaveTextContent("Iker Sanz");
  });

  it("sin jornada bloqueada aún no enseña su alineación", async () => {
    const dialog = await openParticipant("Carla Ruiz", {
      "GET /fantasy/participants/pa2": { data: { ...TEAM, last_round: null, last_lineup: null } },
    });

    expect(await within(dialog).findByText(/Aún no hay ninguna jornada bloqueada/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
  });

  it("una plantilla privada no enseña nada", async () => {
    const dialog = await openParticipant("Carla Ruiz", {
      "GET /fantasy/participants/pa2": {
        data: { ...TEAM, private_squad: true, team_value: null, squad: [], last_round: null, last_lineup: null },
      },
    });

    expect(await within(dialog).findByText(/Plantilla privada/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("Fichajes", () => {
  it("lista los movimientos con la banca donde no hay participante", async () => {
    api();

    await openTab("Fichajes");

    const list = await screen.findByRole("list", { name: "Fichajes de la liga" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Hugo Mar");
    expect(items[0]).toHaveTextContent("Banca → Míster");
    expect(items[0]).toHaveTextContent("4,5 M");
    expect(items[1]).toHaveTextContent("Carla Ruiz → Banca");
    expect(items[1]).toHaveTextContent("Venta a la banca");
  });

  it("sin movimientos lo dice", async () => {
    api({ "GET /fantasy/transfers": { data: { transfers: [] } } });

    await openTab("Fichajes");

    expect(await screen.findByText(/Todavía no hay fichajes/)).toBeInTheDocument();
  });
});
