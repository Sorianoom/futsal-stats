import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Player } from "@/lib/api/types";
import { replay } from "@/lib/match/lineup";

import { MultiSubstitutionDialog } from "./multi-substitution-dialog";

function player(id: string, dorsal: number): Player {
  return { id, name: `Jugador ${id}`, dorsal, position: "field", status: "available", is_active: true, has_account: false };
}

const COURT = ["a", "b", "c", "d", "e"].map((id, i) => player(id, i + 1));
const BENCH = ["f", "g", "h"].map((id, i) => player(id, i + 10));
const STATE = replay([{ type: "part_started", part: 1, starters: COURT.map((p) => p.id) }]);

type Props = React.ComponentProps<typeof MultiSubstitutionDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    state: STATE,
    t: 300,
    minT: 0,
    maxT: 1200,
    formatTime: (t: number) => `${String(Math.floor((1200 - t) / 60)).padStart(2, "0")}:${String((1200 - t) % 60).padStart(2, "0")}`,
    court: COURT,
    bench: BENCH,
    initial: null,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<MultiSubstitutionDialog {...props} />);
  return props;
}

const out = (name: string) => screen.getByRole("button", { name: new RegExp(`^Sale .*${name}`) });
const enter = (name: string) => screen.getByRole("button", { name: new RegExp(`^Entra .*${name}`) });

describe("MultiSubstitutionDialog", () => {
  it("anota varios cambios con el mismo tiempo", async () => {
    const props = renderDialog();

    await userEvent.click(out("Jugador a"));
    await userEvent.click(enter("Jugador f"));
    await userEvent.click(enter("Jugador g"));
    await userEvent.click(out("Jugador b"));
    expect(screen.getByText(/Entra Jugador f · sale Jugador a/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Anotar 2 cambios en 15:00" }));

    expect(props.onConfirm).toHaveBeenCalledWith(
      [
        { out: "a", in: "f" },
        { out: "b", in: "g" },
      ],
      300,
    );
  });

  it("sin pares completos no deja anotar", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: /Anotar/ })).toBeDisabled();
  });

  it("parte del jugador con el que se abrió", async () => {
    const props = renderDialog({ initial: { side: "bench", playerId: "h" } });

    await userEvent.click(out("Jugador c"));
    await userEvent.click(screen.getByRole("button", { name: "Anotar 1 cambio en 15:00" }));

    expect(props.onConfirm).toHaveBeenCalledWith([{ out: "c", in: "h" }], 300);
  });

  it("tocar un par lo quita", async () => {
    renderDialog();
    await userEvent.click(out("Jugador a"));
    await userEvent.click(enter("Jugador f"));

    await userEvent.click(screen.getByRole("button", { name: /Quitar: entra Jugador f/ }));

    expect(screen.queryByText(/Entra Jugador f · sale Jugador a/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anotar/ })).toBeDisabled();
  });

  it("el tiempo se puede corregir antes de anotar, sin pasar del último movimiento", async () => {
    const props = renderDialog({ minT: 295 });
    await userEvent.click(out("Jugador a"));
    await userEvent.click(enter("Jugador f"));

    await userEvent.click(screen.getByRole("button", { name: "10 segundos antes" }));
    expect(screen.getByText("Tiempo: 15:05")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "1 segundo después" }));
    await userEvent.click(screen.getByRole("button", { name: "Anotar 1 cambio en 15:04" }));

    expect(props.onConfirm).toHaveBeenCalledWith([{ out: "a", in: "f" }], 296);
  });

  it("si el dominio no admite los cambios avisa y no anota", async () => {
    const ended = replay([
      { type: "part_started", part: 1, starters: COURT.map((p) => p.id) },
      { type: "substituted", t: 600, player_out: "e", player_in: "h" },
    ]);
    const props = renderDialog({ state: ended, t: 300 });
    await userEvent.click(out("Jugador a"));
    await userEvent.click(enter("Jugador f"));

    await userEvent.click(screen.getByRole("button", { name: /Anotar/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(/anterior al reloj/);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
