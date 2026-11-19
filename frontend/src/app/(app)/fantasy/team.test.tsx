import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { FantasyLeagueView } from "@/lib/api/fantasy-types";
import { MARKET, ME, STANDINGS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /fantasy/me": { data: ME },
    "GET /fantasy/standings": { data: STANDINGS },
    ...extra,
  });
}

const LISTED: FantasyLeagueView = {
  ...ME,
  squad: ME.squad.map((copy) =>
    copy.copy_id === "c3"
      ? { ...copy, listing: { listing_id: "l3", min_price: 5000, closes_at: "2026-11-15T12:00:00Z" } }
      : copy,
  ),
};

async function squadRow(name: string) {
  const squad = await screen.findByRole("list", { name: "Mi plantilla" });
  return within(squad).getByText(name).closest("li") as HTMLElement;
}

describe("Mi equipo: resumen", () => {
  it("muestra saldo, valor del equipo y plazas usadas", async () => {
    api();

    renderWithAuth(<FantasyPage />);

    const summary = await screen.findByRole("region", { name: "Resumen" });
    expect(summary).toHaveTextContent("20,0 M");
    expect(within(summary).getByText("Valor del equipo").parentElement).toHaveTextContent("16,0 M");
    expect(within(summary).getByText("Plazas").parentElement).toHaveTextContent("4/7");
  });

  it("con saldo negativo avisa de que la jornada puntúa 0", async () => {
    api({ "GET /fantasy/me": { data: { ...ME, me: { ...ME.me, balance: -500 } } } });

    renderWithAuth(<FantasyPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Con saldo negativo al bloquearse la alineación, la jornada puntúa 0",
    );
  });

  it("enseña cuánto subió o bajó cada jugador", async () => {
    api();

    renderWithAuth(<FantasyPage />);

    expect(await squadRow("Bea Soto")).toHaveTextContent("+0,2 M");
    expect(within(await squadRow("Bea Soto")).getByLabelText("Sube 0,2 M")).toBeInTheDocument();
    expect(within(await squadRow("Ana Ruiz")).getByLabelText("Baja 0,4 M")).toBeInTheDocument();
    expect(within(await squadRow("Dani Gil")).getByLabelText("Sin cambios")).toBeInTheDocument();
  });
});

describe("Mi equipo: vender", () => {
  it("pone a la venta con precio mínimo en millones", async () => {
    let listed = false;
    const server = api({
      "GET /fantasy/me": () => ({ data: listed ? LISTED : ME }),
      "POST /fantasy/copies/c3/listing": () => {
        listed = true;
        return { status: 201, data: MARKET.listings[2] };
      },
    });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(within(await squadRow("Dani Gil")).getByRole("button", { name: "Poner a la venta" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Precio mínimo/), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Poner a la venta" }));

    expect(await within(await squadRow("Dani Gil")).findByText(/En venta/)).toBeInTheDocument();
    expect(await squadRow("Dani Gil")).toHaveTextContent("mínimo 5,0 M");
    expect(server.calls.find((call) => call.method === "POST")?.body).toEqual({ min_price: 5000 });
  });

  it("sin precio mínimo envía null", async () => {
    const server = api({ "POST /fantasy/copies/c3/listing": { status: 201, data: MARKET.listings[2] } });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(within(await squadRow("Dani Gil")).getByRole("button", { name: "Poner a la venta" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Poner a la venta" }));

    await waitFor(() => expect(server.count("POST", "/fantasy/copies/c3/listing")).toBe(1));
    expect(server.calls.find((call) => call.method === "POST")?.body).toEqual({ min_price: null });
  });

  it("un precio que no es un número no se envía", async () => {
    const server = api();
    renderWithAuth(<FantasyPage />);

    await userEvent.click(within(await squadRow("Dani Gil")).getByRole("button", { name: "Poner a la venta" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Precio mínimo/), "cinco");
    await userEvent.click(within(dialog).getByRole("button", { name: "Poner a la venta" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Escribe un importe en millones");
    expect(server.count("POST", "/fantasy/copies/c3/listing")).toBe(0);
  });

  it("retira una venta abierta", async () => {
    const server = api({
      "GET /fantasy/me": { data: LISTED },
      "DELETE /fantasy/copies/c3/listing": { status: 204 },
    });
    renderWithAuth(<FantasyPage />);
    const before = server.count("GET", "/fantasy/me");

    await userEvent.click(within(await squadRow("Dani Gil")).getByRole("button", { name: "Retirar venta" }));

    await waitFor(() => expect(server.count("DELETE", "/fantasy/copies/c3/listing")).toBe(1));
    await waitFor(() => expect(server.count("GET", "/fantasy/me")).toBeGreaterThan(before));
  });

  it("vender a la banca confirma el 70 % antes de vender", async () => {
    const server = api({ "POST /fantasy/copies/c2/sell": { data: { price: 2940, balance: 22940 } } });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(within(await squadRow("Bea Soto")).getByRole("button", { name: "Vender a la banca" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2,9 M");
    expect(server.count("POST", "/fantasy/copies/c2/sell")).toBe(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Vender por 2,9 M" }));

    await waitFor(() => expect(server.count("POST", "/fantasy/copies/c2/sell")).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("tras vender enseña el precio que cobró de verdad, no el calculado antes", async () => {
    // El valor pudo cambiar entre medias (cierre de jornada): manda el precio que devuelve la API.
    api({ "POST /fantasy/copies/c2/sell": { data: { price: 2800, balance: 22800 } } });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(within(await squadRow("Bea Soto")).getByRole("button", { name: "Vender a la banca" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Vender por 2,9 M" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Has vendido a Bea Soto a la banca por 2,8 M");
  });

  it("si la venta falla lo dice en el diálogo", async () => {
    api({ "POST /fantasy/copies/c2/sell": { status: 404, error: { code: "not_found", message: "Esa copia ya no es tuya" } } });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(within(await squadRow("Bea Soto")).getByRole("button", { name: "Vender a la banca" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Vender por/ }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Esa copia ya no es tuya");
  });
});
