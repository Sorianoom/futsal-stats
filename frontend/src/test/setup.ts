import "@testing-library/jest-dom/vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { queryCache } from "@/lib/query-cache";

afterEach(() => {
  cleanup();
  // Lo cacheado por un test no debe verse en el siguiente.
  queryCache.clear();
  // Una base nueva por test: todos usan el mismo partido y no deben ver lo guardado por otro.
  globalThis.indexedDB = new IDBFactory();
  // Lo guardado en localStorage (reloj, rechazos sin atender) tampoco pasa de un test a otro.
  window.localStorage.clear();
});
