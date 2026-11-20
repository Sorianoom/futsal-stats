/** Edición de la alineación del Fantasy sin mutar: cada cambio devuelve una alineación nueva. */
import type { FantasyLineup, SquadCopy } from "@/lib/api/fantasy-types";

export const FIELD_SLOTS = 4;

export type LineupSlot = { kind: "goalkeeper" } | { kind: "field"; index: number };

/** La copia que ocupa un hueco, o null si está vacío. */
export function copyIn(lineup: FantasyLineup, slot: LineupSlot): string | null {
  return slot.kind === "goalkeeper" ? lineup.goalkeeper_copy_id : (lineup.field_copy_ids[slot.index] ?? null);
}

/** Copias que caben en un hueco: de su puesto y que no ocupen ya otro hueco. */
export function slotOptions(squad: readonly SquadCopy[], lineup: FantasyLineup, slot: LineupSlot): SquadCopy[] {
  if (slot.kind === "goalkeeper") return squad.filter((copy) => copy.position === "goalkeeper");
  const takenElsewhere = new Set(lineup.field_copy_ids.filter((id, index) => id !== null && index !== slot.index));
  return squad.filter((copy) => copy.position === "field" && !takenElsewhere.has(copy.copy_id));
}

/** Pone una copia en un hueco. Si el capitán sale de la alineación, se queda sin capitán. */
export function assignSlot(lineup: FantasyLineup, slot: LineupSlot, copyId: string | null): FantasyLineup {
  const next =
    slot.kind === "goalkeeper"
      ? { ...lineup, goalkeeper_copy_id: copyId }
      : {
          ...lineup,
          field_copy_ids: lineup.field_copy_ids.map((id, index) => (index === slot.index ? copyId : id)),
        };
  const captain = next.captain_copy_id;
  return captain !== null && !isLinedUp(next, captain) ? { ...next, captain_copy_id: null } : next;
}

/** Hace capitán a una copia alineada, o le quita la capitanía si ya lo era. */
export function toggleCaptain(lineup: FantasyLineup, copyId: string): FantasyLineup {
  if (!isLinedUp(lineup, copyId)) return lineup;
  return { ...lineup, captain_copy_id: lineup.captain_copy_id === copyId ? null : copyId };
}

export function sameLineup(a: FantasyLineup, b: FantasyLineup): boolean {
  return (
    a.goalkeeper_copy_id === b.goalkeeper_copy_id &&
    a.captain_copy_id === b.captain_copy_id &&
    a.field_copy_ids.length === b.field_copy_ids.length &&
    a.field_copy_ids.every((id, index) => id === b.field_copy_ids[index])
  );
}

export function isLinedUp(lineup: FantasyLineup, copyId: string): boolean {
  return lineup.goalkeeper_copy_id === copyId || lineup.field_copy_ids.includes(copyId);
}

/** Puestos de los 4 de campo en el 1-2-1, por índice: pívot, alas y cierre. */
export const FIELD_ROLES = ["Pívot", "Ala izquierda", "Ala derecha", "Cierre"] as const;

/** Los cinco huecos en orden: portero y luego los de campo, con el nombre de su puesto. */
export function lineupSlots(): { slot: LineupSlot; label: string }[] {
  return [
    { slot: { kind: "goalkeeper" }, label: "Portero" },
    ...Array.from({ length: FIELD_SLOTS }, (_, index) => ({
      slot: { kind: "field", index } as LineupSlot,
      label: FIELD_ROLES[index],
    })),
  ];
}
