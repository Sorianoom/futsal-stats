import { describe, expect, it } from "vitest";

import { queryCache } from "@/lib/query-cache";
import { mockApi } from "@/test/mock-api";

import {
  FANTASY_MARKET_KEY,
  FANTASY_ME_KEY,
  FANTASY_STANDINGS_KEY,
  FANTASY_TRANSFERS_KEY,
  fantasyRoundKey,
  getMarket,
  getTransfers,
  invalidateFantasy,
  listCopy,
  placeBid,
  saveLineup,
  sellToBank,
  unlistCopy,
  withdrawBid,
} from "./fantasy";
import type { FantasyLineup, MarketListing } from "./fantasy-types";

const LISTING: MarketListing = {
  listing_id: "l1",
  copy_id: "c9",
  player_id: "p9",
  name: "Ana Ruiz",
  dorsal: 9,
  position: "field",
  value: 4000,
  min_bid: 4000,
  seller: null,
  closes_at: "2026-11-14T23:00:00Z",
  my_bid: 4500,
  mine: false,
};

const KEYS = [
  FANTASY_ME_KEY,
  FANTASY_STANDINGS_KEY,
  FANTASY_MARKET_KEY,
  FANTASY_TRANSFERS_KEY,
  fantasyRoundKey("m1"),
  fantasyRoundKey("m2"),
];

function fillCache() {
  for (const key of KEYS) queryCache.set(key, "viejo");
}

function expectAllForgotten() {
  for (const key of KEYS) expect(queryCache.get(key)).toBeUndefined();
}

describe("lecturas del mercado", () => {
  it("getMarket y getTransfers leen sus rutas", async () => {
    mockApi({
      "GET /fantasy/market": { data: { listings: [LISTING] } },
      "GET /fantasy/transfers": { data: { transfers: [] } },
    });

    expect(await getMarket()).toEqual({ listings: [LISTING] });
    expect(await getTransfers()).toEqual({ transfers: [] });
  });

  it("invalidateFantasy olvida mi vista, la clasificación, el mercado, los fichajes y las jornadas", () => {
    fillCache();

    invalidateFantasy();

    expectAllForgotten();
  });
});

describe("saveLineup", () => {
  const LINEUP: FantasyLineup = {
    goalkeeper_copy_id: null,
    field_copy_ids: ["c1", null, null, null],
    captain_copy_id: null,
  };

  it("guarda con PUT y olvida el Fantasy cacheado, también el detalle de cualquier jornada", async () => {
    const api = mockApi({ "PUT /fantasy/lineup": { data: LINEUP } });
    fillCache();

    expect(await saveLineup(LINEUP)).toEqual(LINEUP);

    expect(api.calls[0].body).toEqual(LINEUP);
    expectAllForgotten();
  });

  it("olvida el Fantasy cacheado también si falla", async () => {
    mockApi({ "PUT /fantasy/lineup": { status: 422, error: { code: "invalid_lineup", message: "No" } } });
    fillCache();

    await expect(saveLineup(LINEUP)).rejects.toMatchObject({ code: "invalid_lineup" });

    expectAllForgotten();
  });
});

describe("escrituras del mercado", () => {
  it("placeBid envía el importe en miles con PUT y codifica el id", async () => {
    const api = mockApi({ "PUT /fantasy/market/a%2Fb/bid": { data: LISTING } });

    const result = await placeBid("a/b", 4500);

    expect(result).toEqual(LISTING);
    expect(api.calls[0].body).toEqual({ amount: 4500 });
  });

  it("withdrawBid borra mi puja (204)", async () => {
    const api = mockApi({ "DELETE /fantasy/market/l1/bid": { status: 204 } });

    await withdrawBid("l1");

    expect(api.count("DELETE", "/fantasy/market/l1/bid")).toBe(1);
  });

  it("listCopy pone la copia a la venta con precio mínimo o sin él", async () => {
    const api = mockApi({ "POST /fantasy/copies/c1/listing": { data: LISTING } });

    await listCopy("c1", 5000);
    await listCopy("c1", null);

    expect(api.calls.map((call) => call.body)).toEqual([{ min_price: 5000 }, { min_price: null }]);
  });

  it("unlistCopy retira la venta", async () => {
    const api = mockApi({ "DELETE /fantasy/copies/c1/listing": { status: 204 } });

    await unlistCopy("c1");

    expect(api.count("DELETE", "/fantasy/copies/c1/listing")).toBe(1);
  });

  it("sellToBank devuelve el precio y el saldo", async () => {
    mockApi({ "POST /fantasy/copies/c1/sell": { data: { price: 2800, balance: 22800 } } });

    expect(await sellToBank("c1")).toEqual({ price: 2800, balance: 22800 });
  });

  it.each([
    ["placeBid", () => placeBid("l1", 4500), "PUT /fantasy/market/l1/bid"],
    ["withdrawBid", () => withdrawBid("l1"), "DELETE /fantasy/market/l1/bid"],
    ["listCopy", () => listCopy("c1", null), "POST /fantasy/copies/c1/listing"],
    ["unlistCopy", () => unlistCopy("c1"), "DELETE /fantasy/copies/c1/listing"],
    ["sellToBank", () => sellToBank("c1"), "POST /fantasy/copies/c1/sell"],
  ] as const)("%s invalida el Fantasy también si falla", async (_name, write, route) => {
    mockApi({ [route]: { status: 409, error: { code: "squad_full", message: "Plantilla llena" } } });
    fillCache();

    await expect(write()).rejects.toMatchObject({ code: "squad_full" });

    expectAllForgotten();
  });

  it("una escritura que va bien también invalida", async () => {
    mockApi({ "POST /fantasy/copies/c1/sell": { data: { price: 2800, balance: 22800 } } });
    fillCache();

    await sellToBank("c1");

    expectAllForgotten();
  });
});
