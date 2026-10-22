import { OUTBOX_STORE as STORE, withDb } from "./local-db";
import { EMPTY_OUTBOX, size, type Outbox } from "./outbox";

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
