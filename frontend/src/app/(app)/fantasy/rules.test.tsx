import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ME, STANDINGS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

describe("Cómo se juega", () => {
  it("el jugador abre las reglas con las cifras de la liga y las cierra", async () => {
    mockApi({ "GET /fantasy/me": { data: ME }, "GET /fantasy/standings": { data: STANDINGS } });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    await userEvent.click(await screen.findByRole("button", { name: "Cómo se juega" }));

    const dialog = screen.getByRole("dialog", { name: "Cómo se juega" });
    for (const text of [
      "1 portero y 4 de campo",
      "00:00",
      "+2 por gol",
      "doble",
      "también lo malo",
      "20 M",
      "0,1 M por punto",
      "70 %",
      "1,5 ×",
      "1,25 × lo que pagaste",
      "7 días",
      "7 jugadores",
    ]) {
      expect(dialog).toHaveTextContent(text);
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin liga no hay reglas que enseñar", async () => {
    mockApi({ "GET /fantasy/me": { data: { ...ME, league: null } } });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    await screen.findByText(/liga/i);
    expect(screen.queryByRole("button", { name: "Cómo se juega" })).not.toBeInTheDocument();
  });
});
