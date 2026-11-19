import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { FantasyMarket } from "@/lib/api/fantasy-types";
import { MARKET, ME, STANDINGS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /fantasy/me": { data: ME },
    "GET /fantasy/standings": { data: STANDINGS },
    "GET /fantasy/market": { data: MARKET },
    ...extra,
  });
}

async function openMarket() {
  renderWithAuth(<FantasyPage />);
  await userEvent.click(await screen.findByRole("tab", { name: "Mercado" }));
  return screen.findByRole("list", { name: "Ventas abiertas" });
}

function rowOf(list: HTMLElement, name: string): HTMLElement {
  return within(list).getByText(name).closest("li") as HTMLElement;
}

async function bidWith(list: HTMLElement, name: string, amount: string, button: RegExp | string = "Pujar") {
  await userEvent.click(within(rowOf(list, name)).getByRole("button", { name: button }));
  const dialog = screen.getByRole("dialog");
  const input = within(dialog).getByLabelText(/Tu puja/);
  await userEvent.clear(input);
  await userEvent.type(input, amount);
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar puja" }));
  return dialog;
}

describe("Mercado", () => {
  it("lista las ventas con jugador, posición, valor, puja mínima, vendedor y cierre", async () => {
    api();

    const list = await openMarket();

    const hugo = rowOf(list, "Hugo Mar");
    expect(hugo).toHaveTextContent("Campo");
    expect(hugo).toHaveTextContent("Banca");
    expect(hugo).toHaveTextContent("4,0 M");
    expect(hugo).toHaveTextContent("dom 15, 00:00");
    const iker = rowOf(list, "Iker Sol");
    expect(iker).toHaveTextContent("Portero");
    expect(iker).toHaveTextContent("Míster");
    expect(iker).toHaveTextContent("Valor 3,6 M");
    expect(iker).toHaveTextContent("Mínimo 5,0 M");
    expect(iker).toHaveTextContent("Tu puja 5,5 M");
  });

  it("en mis ventas no deja pujar", async () => {
    api();

    const list = await openMarket();

    const mine = rowOf(list, "Dani Gil");
    expect(mine).toHaveTextContent("La vendes tú");
    expect(within(mine).queryByRole("button")).not.toBeInTheDocument();
  });

  it("sin ventas lo dice", async () => {
    api({ "GET /fantasy/market": { data: { listings: [] } } });

    renderWithAuth(<FantasyPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Mercado" }));

    expect(await screen.findByText(/No hay ninguna venta abierta/)).toBeInTheDocument();
  });

  it("puja en millones con decimales y la envía en miles", async () => {
    let market: FantasyMarket = MARKET;
    const server = api({
      "GET /fantasy/market": () => ({ data: market }),
      "PUT /fantasy/market/l1/bid": (request) => {
        const amount = (request.body as { amount: number }).amount;
        const updated = { ...MARKET.listings[0], my_bid: amount };
        market = { listings: [updated, ...MARKET.listings.slice(1)] };
        return { data: updated };
      },
    });
    const list = await openMarket();

    await bidWith(list, "Hugo Mar", "4,5");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.find((call) => call.method === "PUT")?.body).toEqual({ amount: 4500 });
    const refreshed = await screen.findByRole("list", { name: "Ventas abiertas" });
    await waitFor(() => expect(rowOf(refreshed, "Hugo Mar")).toHaveTextContent("Tu puja 4,5 M"));
  });

  it("tras pujar recarga también mi saldo para la siguiente puja", async () => {
    let balance = ME.me.balance;
    const server = api({
      "GET /fantasy/me": () => ({ data: { ...ME, me: { ...ME.me, balance } } }),
      "PUT /fantasy/market/l1/bid": () => {
        balance = 15000; // entre medias se cerró otra venta que gané
        return { data: { ...MARKET.listings[0], my_bid: 4000 } };
      },
    });
    const list = await openMarket();
    const before = server.count("GET", "/fantasy/me");

    await bidWith(list, "Hugo Mar", "4");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(server.count("GET", "/fantasy/me")).toBeGreaterThan(before));
    const refreshed = await screen.findByRole("list", { name: "Ventas abiertas" });
    await userEvent.click(within(rowOf(refreshed, "Iker Sol")).getByRole("button", { name: "Cambiar puja" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("tu saldo 15,0 M"));
  });

  it("el diálogo propone la puja mínima, o la mía si ya pujé", async () => {
    api();
    const list = await openMarket();

    await userEvent.click(within(rowOf(list, "Iker Sol")).getByRole("button", { name: "Cambiar puja" }));

    expect(within(screen.getByRole("dialog")).getByLabelText(/Tu puja/)).toHaveValue("5,5");
  });

  it("no envía una puja por debajo del mínimo", async () => {
    const server = api();
    const list = await openMarket();

    const dialog = await bidWith(list, "Iker Sol", "4,9", "Cambiar puja");

    expect(within(dialog).getByRole("alert")).toHaveTextContent("La puja mínima es 5,0 M");
    expect(server.count("PUT", "/fantasy/market/l2/bid")).toBe(0);
  });

  it.each([
    ["bid_too_low", 422, "La puja no llega al mínimo"],
    ["insufficient_balance", 422, "No tienes saldo suficiente"],
    ["squad_full", 409, "Tu plantilla ya tiene 7 jugadores"],
    ["duplicate_player", 409, "Ya tienes a ese jugador"],
    ["own_listing", 409, "No puedes pujar por tu propia venta"],
  ])("muestra el error %s del servidor con su mensaje", async (code, status, message) => {
    api({ "PUT /fantasy/market/l1/bid": { status, error: { code, message } } });
    const list = await openMarket();

    const dialog = await bidWith(list, "Hugo Mar", "4");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
  });

  it("un fallo de red al pujar da un aviso genérico", async () => {
    api({ "PUT /fantasy/market/l1/bid": { status: 500, error: { code: "internal_error", message: "Traceback" } } });
    const list = await openMarket();

    const dialog = await bidWith(list, "Hugo Mar", "4");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se pudo guardar la puja");
  });

  it("retira mi puja", async () => {
    const server = api({ "DELETE /fantasy/market/l2/bid": { status: 204 } });
    const list = await openMarket();
    const before = server.count("GET", "/fantasy/market");

    await userEvent.click(within(rowOf(list, "Iker Sol")).getByRole("button", { name: "Cambiar puja" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retirar puja" }));

    await waitFor(() => expect(server.count("DELETE", "/fantasy/market/l2/bid")).toBe(1));
    await waitFor(() => expect(server.count("GET", "/fantasy/market")).toBeGreaterThan(before));
  });

  it("si no se pudo cargar deja reintentar", async () => {
    api({ "GET /fantasy/market": { status: 500, error: { code: "internal_error", message: "x" } } });

    renderWithAuth(<FantasyPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Mercado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el mercado");
  });
});
