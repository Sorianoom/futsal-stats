import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ME } from "@/test/fantasy-fixtures";

import { PackOpening, packsSeenKey } from "./pack-opening";

const SQUAD = ME.squad.slice(0, 2); // Ana Ruiz (9) y Bea Soto (7)
const PARTICIPANT = ME.me.participant_id;

function show() {
  return render(<PackOpening participantId={PARTICIPANT} squad={SQUAD} revealDelayMs={0} />);
}

describe("PackOpening: sobres de bienvenida", () => {
  afterEach(() => window.localStorage.clear());

  it("la primera vez da la bienvenida con un sobre por jugador, aún cerrado", () => {
    show();

    const dialog = screen.getByRole("dialog", { name: "Tus sobres" });
    expect(dialog).toHaveTextContent("Tienes 2 sobres");
    expect(dialog).toHaveTextContent("Sobre 1 de 2");
    expect(within(dialog).queryByText("Ana Ruiz")).not.toBeInTheDocument();
  });

  it("abrir un sobre enseña su jugador y deja pasar al siguiente", async () => {
    show();
    const dialog = screen.getByRole("dialog", { name: "Tus sobres" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Abrir sobre" }));

    const card = await within(dialog).findByRole("group", { name: "Ana Ruiz" });
    expect(card).toHaveTextContent("9");
    expect(card).toHaveTextContent("Campo");
    expect(card).toHaveTextContent("4,0 M");
    await userEvent.click(within(dialog).getByRole("button", { name: "Siguiente sobre" }));
    expect(dialog).toHaveTextContent("Sobre 2 de 2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Abrir sobre" }));
    expect(await within(dialog).findByRole("group", { name: "Bea Soto" })).toBeInTheDocument();
  });

  it("tras el último sobre cierra, y ya no vuelve a salir", async () => {
    const { unmount } = show();
    const dialog = screen.getByRole("dialog", { name: "Tus sobres" });
    for (const name of ["Ana Ruiz", "Bea Soto"]) {
      await userEvent.click(within(dialog).getByRole("button", { name: "Abrir sobre" }));
      await within(dialog).findByRole("group", { name });
      const next = within(dialog).queryByRole("button", { name: "Siguiente sobre" });
      if (next) await userEvent.click(next);
    }

    await userEvent.click(within(dialog).getByRole("button", { name: "Ver mi equipo" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(packsSeenKey(PARTICIPANT))).not.toBeNull();
    unmount();
    show();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se puede saltar y tampoco vuelve a salir", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Saltar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(packsSeenKey(PARTICIPANT))).not.toBeNull();
  });

  it("sin jugadores no hay sobres", () => {
    render(<PackOpening participantId={PARTICIPANT} squad={[]} revealDelayMs={0} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
