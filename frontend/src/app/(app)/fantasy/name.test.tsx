import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ME, STANDINGS, markPacksSeen } from "@/test/fantasy-fixtures";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import FantasyPage from "./page";

beforeEach(() => markPacksSeen());

describe("Mi nombre en el Fantasy", () => {
  it("el entrenador pone su nombre y la liga lo usa", async () => {
    let name = "head_coach";
    const server = mockApi({
      "GET /fantasy/me": () => ({ data: { ...ME, me: { ...ME.me, display_name: name } } }),
      "GET /fantasy/standings": { data: STANDINGS },
      "PATCH /auth/me": (request) => {
        name = (request.body as { display_name: string }).display_name;
        return { data: { ...fakeUser(), display_name: name } };
      },
    });
    const replaceUser = vi.fn();
    renderWithAuth(<FantasyPage />, { replaceUser });

    await userEvent.click(await screen.findByRole("button", { name: "Tu nombre: head_coach" }));
    const dialog = screen.getByRole("dialog", { name: "Tu nombre en el Fantasy" });
    const input = within(dialog).getByLabelText("Nombre");
    await userEvent.clear(input);
    await userEvent.type(input, "Bruno");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("button", { name: "Tu nombre: Bruno" })).toBeInTheDocument();
    expect(server.calls.find((call) => call.method === "PATCH")?.body).toEqual({ display_name: "Bruno" });
    expect(replaceUser).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Bruno" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("dejarlo vacío vuelve a usar el email", async () => {
    const server = mockApi({
      "GET /fantasy/me": { data: { ...ME, me: { ...ME.me, display_name: "Bruno" } } },
      "GET /fantasy/standings": { data: STANDINGS },
      "PATCH /auth/me": { data: { ...fakeUser(), display_name: null } },
    });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Tu nombre: Bruno" }));
    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(server.calls.find((call) => call.method === "PATCH")?.body).toEqual({ display_name: null }),
    );
  });

  it("si falla lo avisa", async () => {
    mockApi({
      "GET /fantasy/me": { data: ME },
      "GET /fantasy/standings": { data: STANDINGS },
      "PATCH /auth/me": { status: 500, error: { code: "internal_error", message: "x" } },
    });
    renderWithAuth(<FantasyPage />);

    await userEvent.click(await screen.findByRole("button", { name: /^Tu nombre/ }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Bruno");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("No se pudo guardar");
  });

  it("un jugador no cambia su nombre: usa el de su ficha", async () => {
    mockApi({ "GET /fantasy/me": { data: ME }, "GET /fantasy/standings": { data: STANDINGS } });
    renderWithAuth(<FantasyPage />, { user: fakeUser("player") });

    await screen.findByRole("button", { name: "Cómo se juega" });
    expect(screen.queryByRole("button", { name: /^Tu nombre/ })).not.toBeInTheDocument();
  });
});
