# Contrato de la API del Fantasy, paso 4 (cláusulas)

Reglas: `docs/fantasy.md` (secciones «Cláusulas» y «Detalles de las cláusulas»). Dinero en enteros
de miles (1000 = 1 M), en el sobre `{success, data, error, meta}`. Todas las rutas son `AnyUser`.

## Cambios en rutas existentes

### `GET /fantasy/me`

`squad[]` añade `clause` (cláusula actual) y `protected_until` (datetime: hasta cuándo no se puede
clausular por fichaje reciente; puede estar en el pasado).

### `GET /fantasy/transfers`

`kind` puede ser también `"clause"` (clausulazo; `price` = la cláusula pagada).

## Rutas nuevas

### `GET /fantasy/clauses`

Todas las copias con dueño de la liga (también las mías), por dueño y dorsal:

```json
{
  "match_day": false,                 // hoy no se puede clausular (día de partido en Madrid)
  "copies": [
    {
      "copy_id": "uuid", "player_id": "uuid", "name": "…", "dorsal": 7,
      "position": "goalkeeper" | "field",
      "value": 4200, "clause": 6300,
      "owner": { "participant_id": "uuid", "display_name": "…" },
      "protected_until": "datetime",
      "mine": false
    }
  ]
}
```

### `POST /fantasy/copies/{copy_id}/clause/buy`

Clausulazo: pago la cláusula y la copia pasa a ser mía al momento, con cláusula nueva (1,5 × valor)
y 7 días de protección. El dinero va al antiguo dueño. Si estaba a la venta, la venta y sus pujas
se anulan. Devuelve `{ "price": 6300, "balance": 13700 }`.

Errores: 404 `not_found` (no existe o está en la banca), 409 `own_copy`, 409 `match_day`, 409
`clause_protected`, 409 `squad_full`, 409 `duplicate_player`, 422 `insufficient_balance`.

### `PUT /fantasy/copies/{copy_id}/clause`  `{ "clause": 8000 }`

Subo la cláusula de una copia mía pagando la mitad de la subida (hacia arriba). Devuelve
`{ "clause": 8000, "cost": 1000, "balance": 19000 }` (desde una cláusula de 6000).

Errores: 404 `not_found` (no es mía), 422 `clause_not_higher`, 422 `insufficient_balance`, y 422
de validación si `clause` es negativa o pasa de 1000 M.
