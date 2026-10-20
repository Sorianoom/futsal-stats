import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { renderWithAuth } from "@/test/render-with-auth";

import { AppShell } from "./app-shell";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => {
  navigation.pathname = "/";
});

describe("AppShell", () => {
  it("marca la sección activa con aria-current", () => {
    navigation.pathname = "/plantilla";

    renderWithAuth(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("link", { name: "Plantilla" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("no marca como activa una ruta que solo empieza igual", () => {
    navigation.pathname = "/plantillaX";

    renderWithAuth(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("link", { name: "Plantilla" })).not.toHaveAttribute("aria-current");
  });

  it("cierra la sesión desde el botón", async () => {
    const { value } = renderWithAuth(<AppShell>contenido</AppShell>);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(value.logout).toHaveBeenCalledTimes(1);
  });

  it("avisa si el cierre de sesión no se pudo confirmar", async () => {
    const logout = vi.fn().mockRejectedValue(new ApiError(0, "network", "Sin conexión con el servidor"));
    renderWithAuth(<AppShell>contenido</AppShell>, { logout });

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión"),
    );
  });
});
