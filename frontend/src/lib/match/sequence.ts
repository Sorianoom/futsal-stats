/** Siguiente `seq` de un flujo de eventos: el servidor lo exige único y creciente por partido. */
export function nextSeq(events: readonly { seq: number }[]): number {
  return events.reduce((highest, event) => Math.max(highest, event.seq), 0) + 1;
}
