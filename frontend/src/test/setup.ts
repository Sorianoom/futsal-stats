import "@testing-library/jest-dom/vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // Una base nueva por test: todos usan el mismo partido y no deben ver lo guardado por otro.
  globalThis.indexedDB = new IDBFactory();
});
