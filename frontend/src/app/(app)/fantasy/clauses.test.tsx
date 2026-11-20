import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CLAUSES, ME, STANDINGS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi, type MockHandler } from "@/test/mock-api";
import { renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

function api(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /fantasy/me": { data: ME },
    "GET /fantasy/standings": { data: STANDINGS },
    "GET /fantasy/clauses": { data: CLAUSES },
    ...extra,
  });
}

async function openClauses() {
  renderWithAuth(<FantasyPage />);
  await userEvent.click(await screen.findByRole("tab", { name: "Cláusulas" }));
  return screen.findByRole("list", { name: "Cláusulas de la liga" });
}

function rowOf(list: HTMLElement, name: string): HTMLElement {
  return within(list).getByText(name).closest("li") as HTMLElement;
}

describe("Cláusulas", () => {
  it("lista las copias de los demás con dueño, valor y cláusula, sin las mías", async () => {
    api();

    const list = await openClauses();

    const ivan = rowOf(list, "Iván Ros");
    expect(ivan).toHaveTextContent("Míster");
    expect(ivan).toHaveTextContent("Valor 4,4 M");
    expect(ivan).toHaveTextContent("Cláusula 6,6 M");
    expect(within(list).queryByText("Ana Ruiz")).not.toBeInTheDocument();
  });

  it("una copia protegida dice hasta cuándo y no deja clausular", async () => {
    api();

    const list = await openClauses();

    const juan = rowOf(list, "Juan Vela");
    expect(juan).toHaveTextContent(/Protegida hasta/);
    expect(within(juan).queryByRole("button", { name: "Clausular" })).not.toBeInTheDocument();
  });

  it("el día de partido avisa y no deja clausular", async () => {
    api({ "GET /fantasy/clauses": { data: { ...CLAUSES, match_day: true } } });

    const list = await openClauses();

    expect(screen.getByText(/Hoy hay partido/)).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Clausular" })).not.toBeInTheDocument();
  });

  it("una copia de un jugador que ya tengo lo dice y no deja clausular", async () => {
    const other = { ...CLAUSES.copies[0], copy_id: "k3", player_id: "p1", name: "Ana Ruiz", mine: false };
    api({ "GET /fantasy/clauses": { data: { ...CLAUSES, copies: [...CLAUSES.copies, other] } } });

    const list = await openClauses();

    const ana = rowOf(list, "Ana Ruiz");
    expect(ana).toHaveTextContent("Ya lo tienes");
    expect(within(ana).queryByRole("button", { name: "Clausular" })).not.toBeInTheDocument();
  });

  it("con la plantilla llena avisa y no deja clausular", async () => {
    api({ "GET /fantasy/me": { data: { ...ME, me: { ...ME.me, squad_limit: ME.squad.length } } } });

    const list = await openClauses();

    expect(screen.getByText(/plantilla está llena/)).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Clausular" })).not.toBeInTheDocument();
  });

  it("clausula tras confirmar el precio y avisa de lo pagado", async () => {
    const server = api({ "POST /fantasy/copies/k1/clause/buy": { data: { price: 6600, balance: 13400 } } });
    const list = await openClauses();

    await userEvent.click(within(rowOf(list, "Iván Ros")).getByRole("button", { name: "Clausular" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("6,6 M");
    await userEvent.click(within(dialog).getByRole("button", { name: "Pagar 6,6 M" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.count("POST", "/fantasy/copies/k1/clause/buy")).toBe(1);
    expect(await screen.findByText(/Has fichado a Iván Ros por 6,6 M/)).toBeInTheDocument();
    // La lista se vuelve a pedir: la copia ya es mía y no debe seguir ofreciéndose.
    await waitFor(() => expect(server.count("GET", "/fantasy/clauses")).toBe(2));
  });

  it("muestra el motivo si el servidor rechaza el clausulazo", async () => {
    api({
      "POST /fantasy/copies/k1/clause/buy": {
        status: 409,
        error: { code: "squad_full", message: "Tu plantilla está completa" },
      },
    });
    const list = await openClauses();

    await userEvent.click(within(rowOf(list, "Iván Ros")).getByRole("button", { name: "Clausular" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Pagar/ }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "Tu plantilla está completa",
    );
  });
});

describe("Subir la cláusula de mi plantilla", () => {
  async function squadRow(name: string) {
    renderWithAuth(<FantasyPage />);
    const squad = await screen.findByRole("list", { name: "Mi plantilla" });
    return within(squad).getByText(name).closest("li") as HTMLElement;
  }

  it("cada copia muestra su cláusula", async () => {
    api();

    const row = await squadRow("Bea Soto");

    expect(row).toHaveTextContent("Cláusula 6,0 M");
  });

  it("sube la cláusula en millones, enseña el coste y la envía en miles", async () => {
    const server = api({ "PUT /fantasy/copies/c2/clause": { data: { clause: 8000, cost: 1000, balance: 19000 } } });
    const row = await squadRow("Bea Soto");

    await userEvent.click(within(row).getByRole("button", { name: "Subir cláusula" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/Nueva cláusula/);
    await userEvent.clear(input);
    await userEvent.type(input, "8");
    expect(dialog).toHaveTextContent("Te cuesta 1,0 M");
    await userEvent.click(within(dialog).getByRole("button", { name: "Subir" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.find((call) => call.method === "PUT")?.body).toEqual({ clause: 8000 });
  });

  it("no deja bajar la cláusula", async () => {
    const server = api();
    const row = await squadRow("Bea Soto");

    await userEvent.click(within(row).getByRole("button", { name: "Subir cláusula" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/Nueva cláusula/);
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Subir" }));

    expect(await within(dialog).findByText(/mayor que la actual \(6,0 M\)/)).toBeInTheDocument();
    expect(server.calls.some((call) => call.method === "PUT")).toBe(false);
  });
});

describe("Fichajes", () => {
  it("un clausulazo sale como tal en el historial", async () => {
    api({
      "GET /fantasy/transfers": {
        data: {
          transfers: [
            {
              at: "2026-11-10T10:00:00Z",
              kind: "clause",
              player_id: "p8",
              name: "Iván Ros",
              from: { participant_id: "pa1", display_name: "Míster" },
              to: { participant_id: "pa2", display_name: "Carla Ruiz" },
              price: 6600,
            },
          ],
        },
      },
    });
    renderWithAuth(<FantasyPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Fichajes" }));

    const list = await screen.findByRole("list", { name: "Fichajes de la liga" });
    expect(within(list).getByText(/Clausulazo/)).toBeInTheDocument();
  });
});

describe("Plantilla privada (cuenta del Fantasy del cuerpo técnico)", () => {
  const PRIVATE_ME = { ...ME, me: { ...ME.me, private_squad: true } };

  it("ve las cláusulas de los demás pero no puede clausular", async () => {
    api({ "GET /fantasy/me": { data: PRIVATE_ME } });

    const list = await openClauses();

    expect(screen.getByText(/Tu cuenta es privada/)).toBeInTheDocument();
    expect(within(list).getByText("Iván Ros")).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Clausular" })).not.toBeInTheDocument();
  });

  it("en su plantilla no hay cláusulas que subir", async () => {
    api({ "GET /fantasy/me": { data: PRIVATE_ME } });

    renderWithAuth(<FantasyPage />);
    const squad = await screen.findByRole("list", { name: "Mi plantilla" });

    expect(screen.getByText(/Plantilla privada/)).toBeInTheDocument();
    expect(within(squad).queryByRole("button", { name: "Subir cláusula" })).not.toBeInTheDocument();
    expect(within(squad).queryByText(/Cláusula/)).not.toBeInTheDocument();
  });
});
