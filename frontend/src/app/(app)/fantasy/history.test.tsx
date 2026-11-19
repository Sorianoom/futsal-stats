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

    expect(screen.getByRole("tab", { name: "Mercado" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Mercado" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Clasificación", () => {
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
    expect(await within(dialog).findByText(/saldo negativo/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Cobrado: 0,0 M");
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
