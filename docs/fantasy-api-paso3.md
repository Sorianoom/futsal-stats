# Contrato de la API del Fantasy, paso 3 (mercado)

Reglas: `docs/fantasy.md` (secciones «Dinero y valor», «Mercado» y «Detalles del mercado y cierre
de jornada»). Dinero en enteros de miles (1000 = 1 M). Todo va en el sobre
`{success, data, error, meta}`. Todas las rutas son `AnyUser` (también jugadores). Sin liga: 404
`not_found` salvo en las lecturas que ya devuelven vacío.

## Cambios en rutas existentes

### `GET /fantasy/me`

`squad[]` añade campos; `value` pasa a ser el valor actual del jugador en la liga.

```json
{
  "copy_id": "uuid", "player_id": "uuid", "name": "…", "dorsal": 7, "position": "field",
  "value": 4200,
  "value_change": 200,          // cambio en la última jornada cerrada; 0 si no hay
  "listing": null | { "listing_id": "uuid", "min_price": 5000, "closes_at": "datetime" }
}
```

- `me` añade `squad_limit: 7` y `team_value` (suma de `value` de su plantilla).
- `lineup` solo contiene copias que son suyas ahora (las vendidas salen como `null`).

### `GET /fantasy/standings`

- `rounds[].status`: `"pending"` (sin puntos aún), `"scored"` (provisional: bloqueada y partido
  cerrado, sin cerrar la jornada) o `"settled"` (cerrada y congelada).
- `points_by_round` incluye jornadas `scored` y `settled`.

### `GET /fantasy/rounds/{match_id}/me`

- Mismo `status` que arriba. Añade `payout` (cobro de la jornada; 0 si no está cerrada) y
  `negative_balance: bool` (puntuó 0 por saldo negativo al bloquear).

## Rutas nuevas

### `GET /fantasy/market`

```json
{
  "listings": [
    {
      "listing_id": "uuid", "copy_id": "uuid", "player_id": "uuid", "name": "…", "dorsal": 7,
      "position": "goalkeeper" | "field",
      "value": 4000, "min_bid": 4000,          // max(valor actual, precio mínimo del vendedor)
      "seller": null | { "participant_id": "uuid", "display_name": "…" },
      "closes_at": "datetime",
      "my_bid": null | 4500,
      "mine": false                            // la vende el que consulta
    }
  ]
}
```

Orden: por `closes_at` y luego por nombre. Sobre cerrado: nunca se muestran pujas ajenas.

### `PUT /fantasy/market/{listing_id}/bid`  `{ "amount": 4500 }`

Crea o cambia mi puja. Devuelve el listado actualizado (mismo objeto que en `GET /market`).
Errores: 404 `not_found` (no existe, ya cerró o la copia ya no es del vendedor), 409 `own_listing`,
422 `bid_too_low`, 422 `insufficient_balance`, 409 `squad_full`, 409 `duplicate_player`.

### `DELETE /fantasy/market/{listing_id}/bid`

Retira mi puja. 204. 404 si no había puja o el listado ya cerró.

### `POST /fantasy/copies/{copy_id}/listing`  `{ "min_price": 5000 | null }`

Pone a la venta una copia propia (cierra a las 24 h). Devuelve el listado. 404 `not_found` (no es
mía), 409 `already_listed`. `min_price` opcional, ≥ 0 y ≤ 1000 M.

### `DELETE /fantasy/copies/{copy_id}/listing`

Retira la venta y anula sus pujas. 204. 404 si no estaba a la venta.

### `POST /fantasy/copies/{copy_id}/sell`

Venta inmediata a la banca por el 70 % del valor (redondeo hacia abajo a miles enteros). Anula su
venta en el mercado si la había. Devuelve `{ "price": 2800, "balance": 22800 }`. 404 si no es mía.

### `GET /fantasy/transfers`

Últimos 50 movimientos de la liga, del más reciente al más antiguo:

```json
{ "transfers": [ {
  "at": "datetime", "kind": "market" | "bank_sale",
  "player_id": "uuid", "name": "…",
  "from": null | { "participant_id": "uuid", "display_name": "…" },   // null = banca
  "to":   null | { "participant_id": "uuid", "display_name": "…" },
  "price": 4500
} ] }
```

El reparto inicial no sale aquí.
