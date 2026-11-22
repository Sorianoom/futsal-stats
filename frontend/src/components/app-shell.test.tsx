import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

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

  it("el entrenador ve la convocatoria en el menú y el segundo entrenador no", () => {
    const { unmount } = renderWithAuth(<AppShell>contenido</AppShell>);
    expect(screen.getByRole("link", { name: "Convocatoria" })).toHaveAttribute(
      "href",
      "/convocatoria",
    );
    expect(screen.getByRole("link", { name: "Puntos" })).toHaveAttribute("href", "/puntos");
    unmount();

    renderWithAuth(<AppShell>contenido</AppShell>, { user: fakeUser("assistant_coach") });

    expect(screen.getByRole("link", { name: "Estadísticas" })).toHaveAttribute("href", "/estadisticas");
    expect(screen.queryByRole("link", { name: "Convocatoria" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Puntos" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plantilla" })).toBeInTheDocument();
  });

  it("el jugador solo ve Estadísticas y Fantasy, y el logotipo le lleva al Fantasy", () => {
    navigation.pathname = "/fantasy";

    renderWithAuth(<AppShell>contenido</AppShell>, { user: fakeUser("player") });

    const nav = screen.getByRole("navigation", { name: "Principal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Estadísticas", "Fantasy"]);
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Futsal Stats" })).toHaveAttribute("href", "/fantasy");
  });

  it.each(["head_coach", "assistant_coach"] as const)("%s también ve la pestaña Fantasy", (role) => {
    navigation.pathname = "/fantasy";

    renderWithAuth(<AppShell>contenido</AppShell>, { user: fakeUser(role) });

    expect(screen.getByRole("link", { name: "Fantasy" })).toHaveAttribute("aria-current", "page");
  });

  it("el logotipo lleva al inicio sin contarse como sección activa", () => {
    navigation.pathname = "/";

    renderWithAuth(<AppShell>contenido</AppShell>);

    const logo = screen.getByRole("link", { name: "Futsal Stats" });
    expect(logo).toHaveAttribute("href", "/");
    expect(logo).not.toHaveAttribute("aria-current");
  });

  it("en el móvil, con muchas secciones, las abre en un menú desde la sección actual", async () => {
    navigation.pathname = "/plantilla";
    renderWithAuth(<AppShell>contenido</AppShell>);
    const toggle = screen.getByRole("button", { name: /Plantilla.*abrir el menú/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    const menu = document.getElementById("main-menu");
    expect(menu).not.toBeNull();
    expect(within(menu as HTMLElement).getAllByRole("link")).toHaveLength(8);
    await userEvent.keyboard("{Escape}");
    expect(document.getElementById("main-menu")).toBeNull();
  });

  it("el jugador, con pocas secciones, no necesita menú", () => {
    renderWithAuth(<AppShell>contenido</AppShell>, { user: fakeUser("player") });

    expect(screen.queryByRole("button", { name: /abrir el menú/ })).not.toBeInTheDocument();
  });

  it("muestra el rol y el correo de la sesión junto al cierre de sesión", () => {
    renderWithAuth(<AppShell>contenido</AppShell>, { user: fakeUser("assistant_coach") });

    expect(screen.getByText(/Segundo entrenador/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("pone el contenido en la región principal", () => {
    renderWithAuth(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("main")).toHaveTextContent("contenido");
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
