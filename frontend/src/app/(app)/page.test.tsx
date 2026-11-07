import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Match } from "@/lib/api/match-types";
import type { Player } from "@/lib/api/types";
import { mockApi } from "@/test/mock-api";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import HomePage from "./page";

const TODAY = "2026-10-20T10:00:00Z";

function match(id: string, heldOn: string, opponent: string): Match {
  return { id, session_id: `s-${id}`, held_on: heldOn, opponent };
}

function player(id: string, status: Player["status"]): Player {
  return { id, name: `Jugador ${id}`, dorsal: 1, position: "field", status, is_active: true, has_account: false };
}

function api(matches: Match[] = [], players: Player[] = []) {
  return mockApi({
    "GET /matches": { data: matches },
    "GET /players": { data: players },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(TODAY));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HomePage", () => {
  it("saluda según el rol y enlaza con la plantilla", async () => {
    api();
    renderWithAuth(<HomePage />, { user: fakeUser("assistant_coach") });

    expect(screen.getByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByText("Sesión de Segundo entrenador")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Plantilla/ })).toHaveAttribute("href", "/plantilla");
  });

  it("destaca el próximo partido y lleva a anotarlo", async () => {
    api([match("m2", "2026-11-01", "Otro FS"), match("m1", "2026-10-25", "Rival FS")]);
    renderWithAuth(<HomePage />);

    expect(await screen.findByText("vs. Rival FS")).toBeInTheDocument();
    expect(screen.getByText("Próximo partido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Empezar partido" })).toHaveAttribute("href", "/partido?id=m1");
  });

  it("el entrenador ve el acceso a la convocatoria desde el partido destacado", async () => {
    api([match("m1", "2026-10-25", "Rival FS")]);
    renderWithAuth(<HomePage />);

    expect(await screen.findByRole("link", { name: "Ver convocatoria" })).toHaveAttribute(
      "href",
      "/convocatoria",
    );
  });

  it("el segundo entrenador no ve la convocatoria, los puntos ni los entrenos", async () => {
    api([match("m1", "2026-10-25", "Rival FS")]);
    renderWithAuth(<HomePage />, { user: fakeUser("assistant_coach") });

    await screen.findByText("vs. Rival FS");
    expect(screen.queryByRole("link", { name: "Ver convocatoria" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Convocatoria/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Puntos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Entrenos/ })).not.toBeInTheDocument();
  });

  it("sin partidos futuros ofrece el último jugado", async () => {
    api([match("m0", "2026-10-10", "Antiguo FS")]);
    renderWithAuth(<HomePage />);

    expect(await screen.findByText("vs. Antiguo FS")).toBeInTheDocument();
    expect(screen.getByText("Último partido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir partido" })).toHaveAttribute("href", "/partido?id=m0");
  });

  it("sin ningún partido invita a crear uno", async () => {
    api([]);
    renderWithAuth(<HomePage />);

    expect(await screen.findByText("No hay partidos programados")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear partido" })).toHaveAttribute("href", "/partido");
  });

  it("resume la plantilla con disponibles y lesionados", async () => {
    api([], [player("a", "available"), player("b", "available"), player("c", "injured")]);
    renderWithAuth(<HomePage />);

    expect(await screen.findByText("2 disponibles · 1 lesionado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Plantilla/ })).toHaveTextContent("3");
  });

  it("el entrenador tiene accesos a convocatoria, puntos y entrenos", async () => {
    api();
    renderWithAuth(<HomePage />);

    expect(await screen.findByRole("link", { name: /^Convocatoria/ })).toHaveAttribute("href", "/convocatoria");
    expect(screen.getByRole("link", { name: /Puntos/ })).toHaveAttribute("href", "/puntos");
    expect(screen.getByRole("link", { name: /Entrenos/ })).toHaveAttribute("href", "/entrenos");
  });

  it("si no puede cargar el resumen lo avisa pero deja los accesos", async () => {
    mockApi({
      "GET /matches": { status: 500, error: { code: "internal_error", message: "Error" } },
      "GET /players": { data: [] },
    });
    renderWithAuth(<HomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el resumen");
    expect(screen.getByRole("link", { name: /Plantilla/ })).toBeInTheDocument();
  });
});
