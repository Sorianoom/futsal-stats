import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Player, Position } from "@/lib/api/types";

import { StartersPicker } from "./starters-picker";

function player(id: string, dorsal: number, position: Position = "field"): Player {
  return { id, name: `Jugador ${id}`, dorsal, position, status: "available", is_active: true };
}

const ROSTER = [
  player("gk", 1, "goalkeeper"),
  player("a", 7),
  player("b", 10),
  player("c", 4),
  player("d", 9),
  player("e", 5),
  player("f", 11),
];

type PickerProps = React.ComponentProps<typeof StartersPicker>;

function renderPicker(overrides: Partial<PickerProps> = {}) {
  const props: PickerProps = {
    part: 1,
    players: ROSTER,
    capacity: 5,
    proposed: [],
    busy: false,
    error: null,
    onStart: vi.fn(),
    ...overrides,
  };
  render(<StartersPicker {...props} />);
  return props;
}

function onCourt() {
  return within(screen.getByRole("list", { name: "En pista" }));
}

describe("StartersPicker", () => {
  it("coloca sobre la pista a los jugadores propuestos", () => {
    renderPicker({ proposed: ["gk", "a", "b"] });

    expect(onCourt().getAllByRole("button")).toHaveLength(3);
    expect(onCourt().getByRole("button", { name: /Quitar a Jugador gk/ })).toBeInTheDocument();
    expect(screen.getByText("3 de 5 elegidos")).toBeInTheDocument();
  });

  it("la pista empieza vacía si no hay propuesta", () => {
    renderPicker();

    expect(onCourt().queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("0 de 5 elegidos")).toBeInTheDocument();
  });

  it("al marcar a un jugador de la lista sale a la pista", async () => {
    renderPicker();

    await userEvent.click(screen.getByLabelText("Jugador a"));

    expect(onCourt().getByRole("button", { name: /Quitar a Jugador a/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Jugador a")).toBeChecked();
  });

  it("al tocar a un jugador de la pista lo quita y desmarca su casilla", async () => {
    renderPicker({ proposed: ["a", "b"] });

    await userEvent.click(onCourt().getByRole("button", { name: /Quitar a Jugador a/ }));

    expect(onCourt().queryByRole("button", { name: /Quitar a Jugador a/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Jugador a")).not.toBeChecked();
    expect(screen.getByText("1 de 5 elegidos")).toBeInTheDocument();
  });

  it("no deja elegir más jugadores que huecos", () => {
    renderPicker({ proposed: ["gk", "a", "b", "c", "d"] });

    expect(screen.getByLabelText("Jugador e")).toBeDisabled();
    expect(screen.getByLabelText("Jugador a")).toBeEnabled();
  });

  it("no deja empezar hasta tener a todos y entonces envía los elegidos", async () => {
    const { onStart } = renderPicker({ proposed: ["gk", "a", "b", "c"], part: 2 });
    const start = screen.getByRole("button", { name: "Empezar 2ª parte" });
    expect(start).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Jugador d"));
    await userEvent.click(start);

    expect(onStart).toHaveBeenCalledWith(expect.arrayContaining(["gk", "a", "b", "c", "d"]));
    expect(vi.mocked(onStart).mock.calls[0][0]).toHaveLength(5);
  });

  it("con menos huecos por expulsados pide solo los que faltan", () => {
    renderPicker({ capacity: 3, proposed: ["a", "b", "c"] });

    expect(screen.getByText("3 de 3 elegidos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar 1ª parte" })).toBeEnabled();
  });

  it("muestra el error del servidor", () => {
    renderPicker({ error: "No se pudo empezar" });

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo empezar");
  });
});
