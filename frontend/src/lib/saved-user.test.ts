import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/api/types";

import { clearSavedUser, loadSavedUser, saveUser } from "./saved-user";

const USER: User = { id: "u1", email: "coach@club.es", role: "head_coach" };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function storedKey(): string {
  return Object.keys(window.localStorage)[0];
}

describe("saved-user", () => {
  it("devuelve null si no hay nadie guardado", () => {
    expect(loadSavedUser()).toBeNull();
  });

  it("recupera el usuario guardado", () => {
    saveUser(USER);

    expect(loadSavedUser()).toEqual(USER);
  });

  it("guarda solo id, correo y rol: nada más, y menos aún tokens", () => {
    saveUser({ ...USER, access_token: "secreto", password: "x" } as User);

    const raw = window.localStorage.getItem(storedKey());
    expect(raw).not.toContain("secreto");
    expect(raw).not.toContain("password");
    expect(loadSavedUser()).toEqual(USER);
  });

  it("clearSavedUser lo borra", () => {
    saveUser(USER);

    clearSavedUser();

    expect(loadSavedUser()).toBeNull();
  });

  it.each([
    ["JSON corrupto", "{no es json"],
    ["un valor que no es un objeto", "42"],
    ["un usuario sin correo", JSON.stringify({ id: "u1", role: "head_coach" })],
    ["un rol desconocido", JSON.stringify({ id: "u1", email: "a@b.es", role: "admin" })],
  ])("ignora %s", (_label, stored) => {
    saveUser(USER);
    window.localStorage.setItem(storedKey(), stored);

    expect(loadSavedUser()).toBeNull();
  });

  it("no lanza si el navegador no deja usar localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(() => saveUser(USER)).not.toThrow();
    expect(loadSavedUser()).toBeNull();
    expect(() => clearSavedUser()).not.toThrow();
  });
});
