import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClockSettings } from "@/lib/match/clock";

import { KeypadBody } from "./time-keypad";

const DOWN: ClockSettings = { direction: "down", partSeconds: 1200 };

function setup(props: Partial<React.ComponentProps<typeof KeypadBody>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <KeypadBody
      settings={DOWN}
      initialElapsed={300}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

async function type(digits: string) {
  for (const digit of digits) await userEvent.click(screen.getByRole("button", { name: digit }));
}

describe("KeypadBody", () => {
  it("muestra el tiempo inicial tal y como lo vería el marcador", () => {
    setup();

    expect(screen.getByRole("status")).toHaveTextContent("15:00");
  });

  it("al teclear sustituye lo anterior y entrega los segundos jugados", async () => {
    const { onConfirm } = setup();

    await type("1230");
    expect(screen.getByRole("status")).toHaveTextContent("12:30");
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(onConfirm).toHaveBeenCalledWith(450);
  });

  it("borrar quita el último dígito", async () => {
    setup();

    await type("123");
    expect(screen.getByRole("status")).toHaveTextContent("01:23");
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));

    expect(screen.getByRole("status")).toHaveTextContent("00:12");
  });

  it("aceptar sin tocar nada confirma el mismo tiempo", async () => {
    const { onConfirm } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(onConfirm).toHaveBeenCalledWith(300);
  });

  it("no admite más de cuatro dígitos", async () => {
    setup();

    await type("12345");

    expect(screen.getByRole("status")).toHaveTextContent("12:34");
  });

  it("rechaza segundos mayores que 59 y no confirma", async () => {
    const { onConfirm } = setup();

    await type("1275");
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Los segundos van de 00 a 59");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rechaza un tiempo que no cabe en la parte", async () => {
    const { onConfirm } = setup();

    await type("2100");
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ese tiempo no cabe en una parte de 20:00");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rechaza un tiempo anterior al último movimiento e indica cuál era", async () => {
    const { onConfirm } = setup({ initialElapsed: 300, minElapsed: 600 });

    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ese tiempo es anterior al último movimiento (10:00)",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("con el marcador hacia arriba entrega lo que se teclea", async () => {
    const { onConfirm } = setup({ settings: { direction: "up", partSeconds: 1200 }, initialElapsed: 0 });

    await type("0500");
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(onConfirm).toHaveBeenCalledWith(300);
  });

  it("cancelar no confirma nada", async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

});
