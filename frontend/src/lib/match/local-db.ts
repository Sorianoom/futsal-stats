import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { MatchSnapshot } from "./match-cache";
import type { Outbox } from "./outbox";

const DB_NAME = "futsal-stats";
const DB_VERSION = 2;

export const OUTBOX_STORE = "outbox";
export const SNAPSHOT_STORE = "snapshots";

interface FutsalDb extends DBSchema {
  outbox: { key: string; value: Outbox };
  snapshots: { key: string; value: MatchSnapshot };
}

/** Se abre y se cierra en cada operación: son pocas y así no queda ninguna conexión colgada. */
export async function withDb<T>(run: (db: IDBPDatabase<FutsalDb>) => Promise<T>): Promise<T> {
  const db = await openDB<FutsalDb>(DB_NAME, DB_VERSION, {
    // Cada versión solo añade lo suyo: lo guardado antes se conserva.
    upgrade(upgrading, oldVersion) {
      if (oldVersion < 1) upgrading.createObjectStore(OUTBOX_STORE);
      if (oldVersion < 2) upgrading.createObjectStore(SNAPSHOT_STORE);
    },
  });
  try {
    return await run(db);
  } finally {
    db.close();
  }
}
