import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithAuth } from "@/test/render-with-auth";

import { RequireAuth } from "./require-auth";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.replace.mockClear();
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
});
