import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClockSettings } from "@/lib/match/clock";

import { QuickTimeDialog } from "./quick-time-dialog";

const DOWN: ClockSettings = { direction: "down", partSeconds: 1200 };
const UP: ClockSettings = { direction: "up", partSeconds: 1200 };

function setup(props: Partial<React.ComponentProps<typeof QuickTimeDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <QuickTimeDialog
      open
      title="Cambio"
      settings={DOWN}
      suggested={300}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

const tap = (name: string) => userEvent.click(screen.getByRole("button", { name }));

describe("QuickTimeDialog", () => {
  it("propone el tiempo tal y como lo vería el marcador", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Cambio" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("15:00");
  });

  it("confirmar sin tocar nada entrega el tiempo propuesto", async () => {
    const { onConfirm } = setup();

    await tap("Confirmar");

    expect(onConfirm).toHaveBeenCalledWith(300);
  });

  it("+20 s sube lo que marca el marcador 20 segundos", async () => {
    const { onConfirm } = setup();

    await tap("+20 s");
    expect(screen.getByRole("status")).toHaveTextContent("15:20");
    await tap("Confirmar");

    expect(onConfirm).toHaveBeenCalledWith(280);
  });

  it("−1 min baja lo que marca el marcador un minuto", async () => {
    const { onConfirm } = setup();

    await tap("−1 min");
    expect(screen.getByRole("status")).toHaveTextContent("14:00");
    await tap("Confirmar");

    expect(onConfirm).toHaveBeenCalledWith(360);
  });

  it("los ajustes se acumulan", async () => {
    const { onConfirm } = setup();

    await tap("+1 min");
    await tap("−20 s");
    await tap("−20 s");
    await tap("Confirmar");

    expect(onConfirm).toHaveBeenCalledWith(300 - 60 + 40);
  });

  it("con el marcador hacia arriba, +20 s suma a lo jugado", async () => {
    const { onConfirm } = setup({ settings: UP });

    await tap("+20 s");
    expect(screen.getByRole("status")).toHaveTextContent("05:20");
    await tap("Confirmar");

    expect(onConfirm).toHaveBeenCalledWith(320);
  });

  it("explica por qué no se puede retroceder más cuando se llega al último movimiento", () => {
    setup({ suggested: 290, minElapsed: 290 });

    expect(screen.getByText("No puede ser anterior al último movimiento (15:10)")).toBeInTheDocument();
  });

  it("no muestra ese aviso mientras queda margen ni al empezar la parte", () => {
    setup({ suggested: 320, minElapsed: 290 });
    expect(screen.queryByText(/anterior al último movimiento/)).not.toBeInTheDocument();
  });

  it("no muestra ese aviso al principio de la parte, cuando aún no ha habido movimientos", () => {
    setup({ suggested: 0, minElapsed: 0 });

    expect(screen.queryByText(/anterior al último movimiento/)).not.toBeInTheDocument();
  });

  it("no deja ir antes del último movimiento", async () => {
    const { onConfirm } = setup({ suggested: 290, minElapsed: 290 });

    expect(screen.getByRole("button", { name: "+20 s" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+1 min" })).toBeDisabled();
    await tap("Confirmar");

    expect(onConfirm).toHaveBeenCalledWith(290);
  });

  it("un ajuste grande se queda en el límite en vez de pasarse", async () => {
    setup({ suggested: 320, minElapsed: 300 });

    await tap("+1 min");

    expect(screen.getByRole("status")).toHaveTextContent("15:00");
  });

  it("no deja salir del final de la parte", () => {
    setup({ settings: UP, suggested: 1200 });

    expect(screen.getByRole("button", { name: "+20 s" })).toBeDisabled();
  });

  it("permite teclear el tiempo exacto cuando el ajuste no basta", async () => {
    const { onConfirm } = setup();

    await tap("Teclear el tiempo");
    for (const digit of "1230") await tap(digit);
    await tap("Aceptar");

    expect(onConfirm).toHaveBeenCalledWith(450);
  });

  it("cancelar no confirma nada", async () => {
    const { onConfirm, onCancel } = setup();

    await tap("Cancelar");

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe("fin de la parte", () => {
    it("se confirma con un toque en lo que marcaría el final", async () => {
      const { onConfirm } = setup({ title: "Fin de la parte", endOfPart: true, suggested: 1200 });

      await tap("Terminó en 00:00");

      expect(onConfirm).toHaveBeenCalledWith(1200);
    });

    it("con el marcador hacia arriba el final es 20:00", async () => {
      const { onConfirm } = setup({ settings: UP, endOfPart: true, suggested: 1200 });

      await tap("Terminó en 20:00");

      expect(onConfirm).toHaveBeenCalledWith(1200);
    });

    it("'Otro tiempo' abre el ajuste empezando en el final", async () => {
      const { onConfirm } = setup({ endOfPart: true, suggested: 1200 });

      await tap("Otro tiempo");
      expect(screen.getByRole("status")).toHaveTextContent("00:00");
      await tap("+1 min");
      await tap("Confirmar");

      expect(onConfirm).toHaveBeenCalledWith(1140);
    });
  });
});
