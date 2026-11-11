import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeUser, renderWithAuth } from "@/test/render-with-auth";

import { RequireAuth } from "./require-auth";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));

beforeEach(() => {
  router.replace.mockClear();
  navigation.pathname = "/";
});

describe("RequireAuth", () => {
  it("muestra el contenido cuando hay sesión", () => {
    renderWithAuth(
      <RequireAuth>
        <p>secreto</p>
      </RequireAuth>,
    );

    expect(screen.getByText("secreto")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("redirige al login y no muestra el contenido si no hay sesión", () => {
    renderWithAuth(
      <RequireAuth>
        <p>secreto</p>
      </RequireAuth>,
      { user: null, status: "anonymous" },
    );

    expect(screen.queryByText("secreto")).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/login");
  });

  it("anuncia la carga como estado y no redirige mientras se restaura la sesión", () => {
    renderWithAuth(
      <RequireAuth>
        <p>secreto</p>
      </RequireAuth>,
      { user: null, status: "loading" },
    );

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sin conexión ofrece reintentar en vez de ir al login", async () => {
    const { value } = renderWithAuth(
      <RequireAuth>
        <p>secreto</p>
      </RequireAuth>,
      { user: null, status: "offline" },
    );

    expect(screen.getByRole("status")).toHaveTextContent("Sin conexión");
    expect(router.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(value.retry).toHaveBeenCalledTimes(1);
  });

  it.each(["/", "/partido", "/puntos", "/convocatoria", "/plantilla", "/entrenos", "/corregir"])(
    "un jugador que entra en %s va a las estadísticas sin ver la pantalla",
    (pathname) => {
      navigation.pathname = pathname;

      renderWithAuth(
        <RequireAuth>
          <p>secreto</p>
        </RequireAuth>,
        { user: fakeUser("player") },
      );

      expect(screen.queryByText("secreto")).not.toBeInTheDocument();
      expect(router.replace).toHaveBeenCalledWith("/estadisticas");
    },
  );

  it("un jugador ve las estadísticas y el detalle de un partido", () => {
    navigation.pathname = "/estadisticas/";

    renderWithAuth(
      <RequireAuth>
        <p>tabla</p>
      </RequireAuth>,
      { user: fakeUser("player") },
    );

    expect(screen.getByText("tabla")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("un jugador puede entrar en el Fantasy", () => {
    navigation.pathname = "/fantasy/";

    renderWithAuth(
      <RequireAuth>
        <p>fantasy</p>
      </RequireAuth>,
      { user: fakeUser("player") },
    );

    expect(screen.getByText("fantasy")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("el segundo entrenador puede entrar en el partido", () => {
    navigation.pathname = "/partido";

    renderWithAuth(
      <RequireAuth>
        <p>partido</p>
      </RequireAuth>,
      { user: fakeUser("assistant_coach") },
    );

    expect(screen.getByText("partido")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
