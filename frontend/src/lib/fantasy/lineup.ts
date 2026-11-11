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

export function assignSlot(lineup: FantasyLineup, slot: LineupSlot, copyId: string | null): FantasyLineup {
  if (slot.kind === "goalkeeper") return { ...lineup, goalkeeper_copy_id: copyId };
  return {
    ...lineup,
    field_copy_ids: lineup.field_copy_ids.map((id, index) => (index === slot.index ? copyId : id)),
  };
}

export function sameLineup(a: FantasyLineup, b: FantasyLineup): boolean {
  return (
    a.goalkeeper_copy_id === b.goalkeeper_copy_id &&
    a.field_copy_ids.length === b.field_copy_ids.length &&
    a.field_copy_ids.every((id, index) => id === b.field_copy_ids[index])
  );
}

export function isLinedUp(lineup: FantasyLineup, copyId: string): boolean {
  return lineup.goalkeeper_copy_id === copyId || lineup.field_copy_ids.includes(copyId);
}

/** Los cinco huecos en orden: portero y luego los de campo. */
export function lineupSlots(): { slot: LineupSlot; label: string }[] {
  return [
    { slot: { kind: "goalkeeper" }, label: "Portero" },
    ...Array.from({ length: FIELD_SLOTS }, (_, index) => ({
      slot: { kind: "field", index } as LineupSlot,
      label: `Campo ${index + 1}`,
    })),
  ];
}
