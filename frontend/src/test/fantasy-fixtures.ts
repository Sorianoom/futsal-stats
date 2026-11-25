/** Datos de ejemplo del Fantasy para los tests de la pantalla. */
import type {
  FantasyClauses,
  FantasyLeagueView,
  FantasyLineup,
  FantasyMarket,
  FantasyRound,
  RoundSlot,
  FantasyStandings,
  FantasyTransfers,
  SquadCopy,
} from "@/lib/api/fantasy-types";

export const LINEUP: FantasyLineup = {
  goalkeeper_copy_id: null,
  field_copy_ids: ["c1", "c2", null, null],
  captain_copy_id: null,
};

function copy(fields: Partial<SquadCopy> & Pick<SquadCopy, "copy_id" | "name">): SquadCopy {
  return {
    player_id: `p-${fields.copy_id}`,
    dorsal: 1,
    position: "field",
    value: 4000,
    value_change: 0,
    listing: null,
    clause: 6000,
    protected_until: "2026-11-08T10:00:00Z",
    last_points: null,
    ...fields,
  };
}

export const ME: FantasyLeagueView = {
  league: { id: "l1", starts_on: "2026-11-01" },
  me: {
    participant_id: "pa2",
    display_name: "Carla Ruiz",
    balance: 20000,
    squad_limit: 7,
    team_value: 16000,
  },
  squad: [
    copy({ copy_id: "c1", player_id: "p1", name: "Ana Ruiz", dorsal: 9, value: 4000, value_change: -400 }),
    copy({ copy_id: "c2", player_id: "p2", name: "Bea Soto", dorsal: 7, value: 4200, value_change: 200 }),
    copy({ copy_id: "c3", player_id: "p3", name: "Dani Gil", dorsal: 5, value: 3800 }),
    copy({ copy_id: "g1", player_id: "p4", name: "Elena Paz", dorsal: 1, position: "goalkeeper", value: 4000 }),
  ],
  lineup: LINEUP,
  next_round: { match_id: "m3", opponent: "Nevada", held_on: "2026-11-15", locks_at: "2026-11-14T23:00:00Z" },
  last_round: null,
};

export const STANDINGS: FantasyStandings = {
  rounds: [
    { match_id: "m0", opponent: "Almería", held_on: "2026-10-25", status: "settled" },
    { match_id: "m1", opponent: "Betis", held_on: "2026-11-01", status: "scored" },
    { match_id: "m2", opponent: "Cádiz", held_on: "2026-11-08", status: "pending" },
  ],
  rows: [
    { participant_id: "pa1", display_name: "Míster", total: 40, points_by_round: { m0: 10, m1: 30 } },
    { participant_id: "pa2", display_name: "Carla Ruiz", total: 33, points_by_round: { m0: 8, m1: 25 } },
  ],
};

function emptySlot(slot: RoundSlot["slot"]): RoundSlot {
  return {
    slot,
    copy_id: null,
    player_id: null,
    name: null,
    dorsal: null,
    photo_url: null,
    rating: null,
    score: null,
    goals: 0,
    points: 0,
    captain: false,
    mvp: false,
    breakdown: [],
    bonus: [],
  };
}

export const ROUND: FantasyRound = {
  match_id: "m1",
  status: "scored",
  total: 25,
  payout: 0,
  negative_balance: false,
  slots: [
    emptySlot("goalkeeper"),
    {
      ...emptySlot("field"),
      copy_id: "c1",
      player_id: "p1",
      name: "Ana Ruiz",
      dorsal: 7,
      rating: 10,
      score: 12.7,
      goals: 2,
      points: 13,
      breakdown: [
        { key: "base", count: 1, points: 5.4 },
        { key: "goals", count: 2, points: 5 },
        { key: "assists", count: 2, points: 1.4 },
        { key: "steals", count: 2, points: 0.6 },
        { key: "goals_for_on_court", count: 2, points: 0.3 },
      ],
    },
    {
      ...emptySlot("field"),
      copy_id: "c2",
      player_id: "p2",
      name: "Bea Soto",
      dorsal: 8,
      rating: 6.3,
      score: 6.3,
      points: 6,
      breakdown: [
        { key: "base", count: 1, points: 5.4 },
        { key: "steals", count: 3, points: 0.9 },
      ],
    },
    {
      ...emptySlot("field"),
      copy_id: "c3",
      player_id: "p3",
      name: "Dani Gil",
      dorsal: 9,
      rating: 6,
      score: 6,
      points: 6,
      breakdown: [
        { key: "base", count: 1, points: 5.4 },
        { key: "clean_streaks", count: 2, points: 0.6 },
      ],
    },
    emptySlot("field"),
  ],
};

export const MARKET: FantasyMarket = {
  listings: [
    {
      listing_id: "l1",
      copy_id: "x1",
      player_id: "p7",
      name: "Hugo Mar",
      dorsal: 10,
      position: "field",
      value: 4000,
      min_bid: 4000,
      seller: null,
      closes_at: "2026-11-14T23:00:00Z",
      my_bid: null,
      mine: false,
    },
    {
      listing_id: "l2",
      copy_id: "x2",
      player_id: "p8",
      name: "Iker Sol",
      dorsal: 13,
      position: "goalkeeper",
      value: 3600,
      min_bid: 5000,
      seller: { participant_id: "pa1", display_name: "Míster" },
      closes_at: "2026-11-15T09:30:00Z",
      my_bid: 5500,
      mine: false,
    },
    {
      listing_id: "l3",
      copy_id: "c3",
      player_id: "p3",
      name: "Dani Gil",
      dorsal: 5,
      position: "field",
      value: 3800,
      min_bid: 3800,
      seller: { participant_id: "pa2", display_name: "Carla Ruiz" },
      closes_at: "2026-11-15T12:00:00Z",
      my_bid: null,
      mine: true,
    },
  ],
};

export const TRANSFERS: FantasyTransfers = {
  transfers: [
    {
      at: "2026-11-13T23:00:00Z",
      kind: "market",
      player_id: "p7",
      name: "Hugo Mar",
      from: null,
      to: { participant_id: "pa1", display_name: "Míster" },
      price: 4500,
    },
    {
      at: "2026-11-12T18:00:00Z",
      kind: "bank_sale",
      player_id: "p9",
      name: "Pablo Ríos",
      from: { participant_id: "pa2", display_name: "Carla Ruiz" },
      to: null,
      price: 2800,
    },
  ],
};

export const CLAUSES: FantasyClauses = {
  match_day: false,
  copies: [
    {
      copy_id: "k1",
      player_id: "p8",
      name: "Iván Ros",
      dorsal: 11,
      position: "field",
      value: 4400,
      clause: 6600,
      owner: { participant_id: "pa1", display_name: "Míster" },
      protected_until: "2026-11-08T10:00:00Z",
      mine: false,
    },
    {
      copy_id: "k2",
      player_id: "p9",
      name: "Juan Vela",
      dorsal: 4,
      position: "goalkeeper",
      value: 4000,
      clause: 6000,
      owner: { participant_id: "pa1", display_name: "Míster" },
      protected_until: "2099-01-01T10:00:00Z",
      mine: false,
    },
    {
      copy_id: "c1",
      player_id: "p1",
      name: "Ana Ruiz",
      dorsal: 9,
      position: "field",
      value: 4000,
      clause: 6000,
      owner: { participant_id: "pa2", display_name: "Carla Ruiz" },
      protected_until: "2026-11-08T10:00:00Z",
      mine: true,
    },
  ],
};

/** Los sobres de bienvenida ya abiertos, para que no tapen la pantalla en los tests. */
export function markPacksSeen(participantId: string = ME.me.participant_id): void {
  window.localStorage.setItem(`futsal:fantasy:packs-seen:${participantId}`, "2026-11-01T00:00:00Z");
}
