import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Player, Position } from "@/lib/api/types";

import { LivePanel } from "./live-panel";

type PanelProps = React.ComponentProps<typeof LivePanel>;

function player(id: string, dorsal: number, position: Position = "field"): Player {
  return { id, name: `Jugador ${id}`, dorsal, position, status: "available", is_active: true, has_account: false };
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    title: "Parte 1 en juego",
    score: { for: 3, against: 2 },
    teamFouls: 3,
    clockText: "12:41",
    clockRunning: false,
    clockFinished: false,
    clockNote: null,
    court: [player("gk", 1, "goalkeeper"), player("a", 7), player("b", 10), player("c", 4), player("d", 9)],
    bench: [player("e", 5), player("f", 11)],
    keeper: null,
    canUndo: true,
    undoNote: null,
    status: "synced",
    pending: 0,
    syncProblem: null,
    onCourtPlayer: vi.fn(),
    onBenchPlayer: vi.fn(),
    onToggleClock: vi.fn(),
    onAdjustClock: vi.fn(),
    onRivalGoal: vi.fn(),
    onSave: vi.fn(),
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

  it("con el portero en pista ofrece su parada con un toque", async () => {
    const props = renderPanel({ keeper: player("gk", 1, "goalkeeper") });

    await userEvent.click(screen.getByRole("button", { name: "Parada de Jugador gk" }));

    expect(props.onSave).toHaveBeenCalled();
  });

  it("sin portero en pista no ofrece la parada directa", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: /^Parada/ })).not.toBeInTheDocument();
  });

  it("muestra el reloj en grande y un botón táctil para arrancarlo", async () => {
    const props = renderPanel();

    expect(screen.getByRole("timer", { name: "Reloj" })).toHaveTextContent("12:41");
    const play = screen.getByRole("button", { name: "Arrancar el reloj" });
    expect(play).toHaveClass("size-16");
    await userEvent.click(play);
    expect(props.onToggleClock).toHaveBeenCalled();
  });

  it("con el reloj en marcha el botón es para pararlo", () => {
    renderPanel({ clockRunning: true });

    expect(screen.getByRole("button", { name: "Parar el reloj" })).toBeInTheDocument();
  });

  it("en 0:00 no deja arrancar el reloj", () => {
    renderPanel({ clockText: "00:00", clockFinished: true });

    expect(screen.getByRole("button", { name: "Arrancar el reloj" })).toBeDisabled();
  });

  it("abre el ajuste del reloj", async () => {
    const props = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Ajustar el reloj" }));

    expect(props.onAdjustClock).toHaveBeenCalled();
  });

  it("muestra el aviso del reloj de forma discreta, no como error", () => {
    renderPanel({ clockNote: "El reloj va por detrás" });

    expect(screen.getByRole("status", { name: "Aviso del reloj" })).toHaveTextContent("El reloj va por detrás");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no hay interruptor de sentido del marcador", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: /Marcador hacia/ })).not.toBeInTheDocument();
  });

  it("no deja deshacer si no hay nada que deshacer", () => {
    renderPanel({ canUndo: false });

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
  });
});
