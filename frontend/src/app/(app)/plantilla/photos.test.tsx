import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Player } from "@/lib/api/types";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import PlantillaPage from "./page";

const photo = vi.hoisted(() => ({ squarePhoto: vi.fn() }));
vi.mock("@/lib/photo", () => photo);

const LUIS: Player = {
  id: "p1",
  name: "Luis Prado",
  dorsal: 1,
  position: "goalkeeper",
  status: "available",
  is_active: true,
  has_account: false,
  photo_url: null,
};
const WITH_PHOTO: Player = { ...LUIS, photo_url: "/player-photos/abc" };

let roster: Player[];

beforeEach(() => {
  roster = [LUIS];
  photo.squarePhoto.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
});

afterEach(() => vi.unstubAllGlobals());

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({ "GET /players": () => ({ data: roster }), ...extra });
}

describe("Fotos de la plantilla", () => {
  it("el entrenador sube una foto ya recortada y la ficha la enseña", async () => {
    const server = api({
      "PUT /players/p1/photo": () => {
        roster = [WITH_PHOTO];
        return { data: WITH_PHOTO };
      },
    });
    renderWithAuth(<PlantillaPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Foto de Luis Prado" }));
    const dialog = screen.getByRole("dialog", { name: "Foto de Luis Prado" });
    const file = new File(["raw"], "luis.jpg", { type: "image/jpeg" });
    await userEvent.upload(within(dialog).getByLabelText("Elegir foto"), file);

    await waitFor(() => expect(server.count("PUT", "/players/p1/photo")).toBe(1));
    expect(photo.squarePhoto).toHaveBeenCalledWith(file);
    const put = server.calls.find((call) => call.method === "PUT");
    expect(put?.headers.get("Content-Type")).toBe("image/webp");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const img = await screen.findByRole("img", { name: "Luis Prado" });
    expect(img.getAttribute("src")).toMatch(/\/player-photos\/abc$/);
  });

  it("puede quitar la foto", async () => {
    roster = [WITH_PHOTO];
    const server = api({
      "DELETE /players/p1/photo": () => {
        roster = [LUIS];
        return { data: LUIS };
      },
    });
    renderWithAuth(<PlantillaPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Foto de Luis Prado" }));
    await userEvent.click(screen.getByRole("button", { name: "Quitar foto" }));

    await waitFor(() => expect(server.count("DELETE", "/players/p1/photo")).toBe(1));
    await waitFor(() => expect(screen.queryByRole("img", { name: "Luis Prado" })).not.toBeInTheDocument());
  });

  it("si falla la subida lo avisa y deja el diálogo abierto", async () => {
    api({ "PUT /players/p1/photo": { status: 413, error: { code: "photo_too_big", message: "x" } } });
    renderWithAuth(<PlantillaPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Foto de Luis Prado" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("Elegir foto"), new File(["raw"], "a.jpg", { type: "image/jpeg" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se pudo subir la foto");
  });

  it("el segundo entrenador ve las fotos pero no las cambia", async () => {
    roster = [WITH_PHOTO];
    api();
    renderWithAuth(<PlantillaPage />, { user: fakeUser("assistant_coach") });

    expect(await screen.findByRole("img", { name: "Luis Prado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Foto de Luis Prado" })).not.toBeInTheDocument();
  });
});
