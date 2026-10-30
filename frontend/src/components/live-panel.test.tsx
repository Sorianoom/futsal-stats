import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Player, Position } from "@/lib/api/types";

import { LivePanel } from "./live-panel";

type PanelProps = React.ComponentProps<typeof LivePanel>;

function player(id: string, dorsal: number, position: Position = "field"): Player {
  return { id, name: `Jugador ${id}`, dorsal, position, status: "available", is_active: true };
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    title: "Parte 1 en juego",
    score: { for: 3, against: 2 },
    teamFouls: 3,
    clockText: "12:41",
    direction: "down",
    court: [player("gk", 1, "goalkeeper"), player("a", 7), player("b", 10), player("c", 4), player("d", 9)],
    bench: [player("e", 5), player("f", 11)],
    canUndo: true,
    undoNote: null,
    status: "synced",
    pending: 0,
    syncProblem: null,
    onCourtPlayer: vi.fn(),
    onBenchPlayer: vi.fn(),
    onClock: vi.fn(),
    onToggleDirection: vi.fn(),
    onRivalGoal: vi.fn(),
    onEndPart: vi.fn(),
    onUndo: vi.fn(),
    onRate: vi.fn(),
    onRetry: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  };
  render(<LivePanel {...props} />);
  return props;
}

const courtList = () => screen.getByRole("list", { name: "En pista" });

describe("LivePanel", () => {
  it("lista a los cinco de la pista y a los del banquillo en listas separadas", () => {
    renderPanel();

    expect(within(courtList()).getAllByRole("listitem")).toHaveLength(5);
    expect(within(screen.getByRole("list", { name: "Banquillo" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("muestra el alias en la pista y el banquillo, y el nombre completo si no tiene", () => {
    renderPanel({
      court: [{ ...player("gk", 1, "goalkeeper"), alias: "Gordo" }, player("a", 7)],
      bench: [{ ...player("e", 5), alias: "Ñoño" }, player("f", 11)],
    });

    const court = within(courtList());
    expect(court.getByText("Gordo")).toBeInTheDocument();
    expect(court.getByText("Jugador a")).toBeInTheDocument();
    expect(court.queryByText("Jugador gk")).not.toBeInTheDocument();
    const bench = within(screen.getByRole("list", { name: "Banquillo" }));
    expect(bench.getByText("Ñoño")).toBeInTheDocument();
    expect(bench.getByText("Jugador f")).toBeInTheDocument();
  });

  it("coloca a cada jugador de la pista en una posición distinta de la cancha", () => {
    renderPanel();

    const items = within(courtList()).getAllByRole("listitem");
    for (const item of items) {
      expect(item.style.left).toMatch(/^\d+(\.\d+)?%$/);
      expect(item.style.top).toMatch(/^\d+(\.\d+)?%$/);
    }
    const positions = items.map((item) => `${item.style.left},${item.style.top}`);
    expect(new Set(positions).size).toBe(5);
  });

  it("indica a los lectores de pantalla quién es el portero", () => {
    renderPanel();

    const keeper = within(courtList()).getByRole("button", { name: /Jugador gk/ });
    expect(keeper).toHaveAccessibleName(/portero/i);
    expect(within(courtList()).getByRole("button", { name: /Jugador a/ })).not.toHaveAccessibleName(/portero/i);
  });

  it("anota sobre el jugador tocado", async () => {
    const props = renderPanel();

    await userEvent.click(within(courtList()).getByRole("button", { name: /Jugador b/ }));

    expect(props.onCourtPlayer).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("muestra el marcador y las faltas de equipo", () => {
    renderPanel();

    expect(screen.getByLabelText("Marcador")).toHaveTextContent("3 – 2");
    expect(screen.getByText("Faltas de equipo: 3")).toBeInTheDocument();
  });

  it("destaca 'Fin de la parte' como la acción principal", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Fin de la parte" })).toHaveClass("bg-cta");
  });

  it("no deja deshacer si no hay nada que deshacer", () => {
    renderPanel({ canUndo: false });

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
  });
});
