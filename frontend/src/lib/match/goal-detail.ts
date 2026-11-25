/**
 * Detalle de un gol: tipos (hasta 3) y punto de media pista desde el que se marcó. Espejo de
 * `backend/app/domain/stints/goal_detail.py`. El punto va de 0 a 100: `x` de banda a banda
 * mirando a la portería que recibe el gol, `y` desde la línea de fondo hasta medio campo.
 */

export type GoalTag =
  | "set_piece"
  | "rehearsed"
  | "counter"
  | "turnover"
  | "far_post"
  | "long_shot"
  | "one_on_one"
  | "rebound"
  | "power_play"
  | "penalty"
  | "own_goal";

export const GOAL_TAGS: readonly GoalTag[] = [
  "set_piece",
  "rehearsed",
  "counter",
  "turnover",
  "far_post",
  "long_shot",
  "one_on_one",
  "rebound",
  "power_play",
  "penalty",
  "own_goal",
];

export const MAX_GOAL_TAGS = 3;

const AGAINST_LABEL: Record<GoalTag, string> = {
  set_piece: "Balón parado",
  rehearsed: "Jugada ensayada",
  counter: "Contraataque",
  turnover: "Pérdida en campo propio",
  far_post: "Segundo palo",
  long_shot: "Tiro lejano",
  one_on_one: "1 contra 1",
  rebound: "Rebote",
  power_play: "Portero-jugador",
  penalty: "Penalti o doble penalti",
  own_goal: "Gol en propia",
};

/** En un gol nuestro, la pérdida es del rival y la propia también. */
const FOR_LABEL: Partial<Record<GoalTag, string>> = {
  turnover: "Robo en campo rival",
  own_goal: "En propia del rival",
};

export function goalTagLabel(tag: string, forTeam: boolean): string {
  const known = tag as GoalTag;
  return (forTeam ? FOR_LABEL[known] : undefined) ?? AGAINST_LABEL[known] ?? tag;
}

export interface GoalDetail {
  goal_tags: GoalTag[];
  goal_x: number | null;
  goal_y: number | null;
}

export const EMPTY_GOAL_DETAIL: GoalDetail = { goal_tags: [], goal_x: null, goal_y: null };

/** Lo que un evento ya tiene anotado (los goles antiguos no tienen nada). */
export function detailOf(event: {
  goal_tags?: string[] | null;
  goal_x?: number | null;
  goal_y?: number | null;
}): GoalDetail {
  return {
    goal_tags: (event.goal_tags ?? []) as GoalTag[],
    goal_x: event.goal_x ?? null,
    goal_y: event.goal_y ?? null,
  };
}

export function hasDetail(detail: GoalDetail): boolean {
  return detail.goal_tags.length > 0 || detail.goal_x !== null;
}

/** Marca o desmarca un tipo; con 3 marcados no deja añadir otro. */
export function toggleTag(tags: readonly GoalTag[], tag: GoalTag): GoalTag[] {
  if (tags.includes(tag)) return tags.filter((item) => item !== tag);
  if (tags.length >= MAX_GOAL_TAGS) return [...tags];
  return [...tags, tag];
}

/** «Balón parado, segundo palo · con punto»; vacío si no hay detalle. */
export function describeGoalDetail(detail: GoalDetail, forTeam: boolean): string {
  const tags = detail.goal_tags.map((tag, index) => {
    const label = goalTagLabel(tag, forTeam);
    return index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1);
  });
  const parts = [tags.join(", "), detail.goal_x !== null ? "con punto" : ""].filter(Boolean);
  return parts.join(" · ");
}
