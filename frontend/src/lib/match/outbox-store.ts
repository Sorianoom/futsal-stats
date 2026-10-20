import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { EMPTY_OUTBOX, size, type Outbox } from "./outbox";

const DB_NAME = "futsal-stats";
const DB_VERSION = 1;
const STORE = "outbox";

interface FutsalDb extends DBSchema {
  outbox: { key: string; value: Outbox };
}

/** Se abre y se cierra en cada operación: son pocas y así no queda ninguna conexión colgada. */
async function withDb<T>(run: (db: IDBPDatabase<FutsalDb>) => Promise<T>): Promise<T> {
  const db = await openDB<FutsalDb>(DB_NAME, DB_VERSION, {
    upgrade(upgrading) {
      upgrading.createObjectStore(STORE);
    },
  });
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

/** Lo anotado y sin confirmar de un partido: sobrevive a recargas y a que el sistema mate la pestaña. */
export async function loadOutbox(matchId: string): Promise<Outbox> {
  const stored = await withDb((db) => db.get(STORE, matchId));
  return stored ?? EMPTY_OUTBOX;
}

/** Sustituye lo guardado de ese partido; una bandeja vacía borra la entrada. */
export async function saveOutbox(matchId: string, outbox: Outbox): Promise<void> {
  await withDb(async (db) => {
    if (size(outbox) === 0) await db.delete(STORE, matchId);
    else await db.put(STORE, outbox, matchId);
  });
}
