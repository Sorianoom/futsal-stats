# Fantasy del equipo (fase 12): reglamento

Reglas acordadas con el usuario el 2026-11-07, una a una. Todos los números son constantes con
nombre en el código para poder ajustarlos.

## Participantes y cuentas

- Participan jugadores y entrenadores, en la misma clasificación y sin restricciones (unos 15
  participantes y unos 14 jugadores reales).
- Cuentas de jugador: las crea el entrenador principal con una invitación de un solo uso desde la
  ficha del jugador; el jugador elige su contraseña. Sin registro abierto.
- Los jugadores solo ven el Fantasy y las estadísticas (partidos, temporada y notas). No ven puntos
  disciplinarios, sanciones, lesiones, convocatorias ni asistencia.

## Liga, copias y plantilla inicial

- Una liga por temporada con todos los participantes.
- Cada jugador real tiene varias **copias**; cada copia tiene un solo dueño. **8 copias por
  portero y 5 por jugador de campo** (el mínimo para que los 15 participantes puedan alinear).
- Al empezar, cada participante recibe **2 jugadores de campo al azar** (sorteo puro, sin repetir
  jugador). El portero y el resto se consiguen en el mercado.
- Plantilla máxima: **7 copias**, sin dos copias del mismo jugador.
- (Provisional) Un jugador nuevo en la plantilla a mitad de temporada añade sus copias a la banca
  con valor 4 M. Un jugador que deja el equipo sigue en las plantillas, pero puntúa 0.

## Dinero y valor

- Moneda ficticia en millones (M). Saldo inicial: **20 M**.
- Todos los jugadores empiezan valiendo **4 M**.
- Tras cada jornada, el valor cambia **0,2 M × (puntos − 6)**; si no jugó, **−0,2 M**. Nunca baja de
  **0,5 M**.
- Tras cada jornada, cada participante cobra **0,1 M por punto** de su alineación.

## Jornadas, alineación y puntos

- Una jornada = un partido oficial.
- Alineación: **1 portero y 4 de campo** de la propia plantilla. Se bloquea a las **00:00 (hora de
  Madrid) del día del partido** (los partidos solo tienen fecha).
- Si no se toca, se mantiene la alineación de la jornada anterior.
- Puntos de un jugador alineado: **nota del partido redondeada (,5 hacia arriba) + 2 por gol**. Sin
  nota (no jugó o menos de 3 minutos) = 0. Los puntos nunca son negativos.
  - Ejemplos: nota 6,3 sin goles → 6; nota 9,3 con 2 goles → 13; no jugó → 0.
- Huecos de la alineación (falta portero o jugadores de campo): puntúan **0**.
- Saldo negativo al bloquearse la alineación: la jornada puntúa **0**.
- Clasificación: suma de puntos de todas las jornadas.

## Mercado

- Cada día a las **00:00 (Madrid)** se abre un mercado con copias libres de la banca al azar:
  **15 por día la primera semana** de la liga y **8 por día** después. Más las copias que los
  participantes pongan a la venta.
- Pujas en **sobre cerrado**, como mínimo el valor de mercado (o el precio mínimo que fije el
  vendedor). A las **24 h** gana la más alta; en empate, la más antigua. Solo se puede pujar con
  saldo suficiente. Si vende un participante, el dinero es para él.
- Vender a la banca es inmediato: paga el **70 %** del valor de mercado y la copia vuelve a la
  banca.
- Sin cron: los cierres de mercado y de jornada se procesan al llegar la siguiente petición del
  Fantasy (los que estén vencidos), así que no depende de tareas programadas de Vercel.

### Detalles del mercado y cierre de jornada (paso 3, 2026-11-14)

Decididos por defecto al construir el paso 3; se pueden cambiar.

- **Cierre de jornada**: a las 00:00 (Madrid) del día siguiente al partido, si el partido está
  cerrado; si no, en cuanto se cierre. Al cerrarse se congelan los puntos de cada participante,
  los cobros y los cambios de valor: corregir después las estadísticas ya no los cambia. Antes
  del cierre la clasificación muestra los puntos como provisionales.
- **Propiedad en el bloqueo**: un hueco de la alineación solo puntúa si la copia era del
  participante en el momento del bloqueo. Vender una copia después del bloqueo no le quita esos
  puntos, y el comprador no los gana.
- **Pujas**: cada puja debe ser como mucho el saldo en ese momento, pero no reserva dinero. Se
  puede pujar por varias copias a la vez y acabar con saldo negativo si se ganan todas; con saldo
  negativo al bloquearse la alineación, la jornada puntúa 0. Para arreglarlo, vender.
- Una puja se puede cambiar o retirar hasta el cierre. Al cierre se descartan las pujas de quien
  ya tenga 7 copias o una copia del mismo jugador, y gana la siguiente.
- Las copias de la banca salen a las 00:00 y cierran a las 00:00 del día siguiente. Una copia
  puesta a la venta por un participante cierra 24 h después de ponerla; mientras tanto se puede
  retirar y sigue siendo suya (puede alinearla). Si nadie puja, no pasa nada.
- Si nadie entra en un día, ese día no hay mercado (no se crean mercados atrasados).

## Cláusulas

- Cada copia tiene una cláusula de rescisión, que al ficharla vale **1,5 × su valor de mercado**.
- El dueño puede subirla pagando **la mitad de la subida**.
- Cualquiera con saldo y hueco en la plantilla puede pagar la cláusula y llevarse la copia al
  momento (clausulazo). El dinero va al antiguo dueño.
- No se puede clausular durante **7 días tras un fichaje** ni **el día del partido**.

### Detalles de las cláusulas (paso 4, 2026-11-19)

Acordados con el usuario el 2026-11-19. Contrato de la API: `docs/fantasy-api-paso4.md`.

- Las copias que ya tenían dueño al activar las cláusulas empiezan con **1,5 × su valor de ese
  momento**. Cada vez que una copia cambia de dueño (mercado, clausulazo), la cláusula vuelve a ser
  1,5 × el valor actual (redondeo hacia abajo). En la banca no hay cláusula.
- La **protección de 7 días** cuenta para toda copia recién llegada a su dueño: reparto inicial,
  mercado o clausulazo.
- **Día del partido**: de 00:00 a 23:59 (hora de Madrid) del día de un partido oficial de la liga.
- Si la copia clausulada estaba **a la venta**, la venta y sus pujas se anulan.
- Subir la cláusula cuesta la mitad de la subida (redondeo hacia arriba) y necesita saldo para ese
  coste; no se puede bajar. Pagar una cláusula necesita saldo para la cláusula entera, hueco en la
  plantilla y no tener ya ese jugador.

### Capitán (acordado y construido el 2026-11-19, migración 0010)

- En la alineación se puede elegir un capitán: es opcional y puede ser cualquiera de los 5,
  también el portero. Se bloquea con la alineación (00:00 en Madrid del día del partido).
- Sus puntos de la jornada cuentan el doble, para la clasificación y para el cobro por punto.
- Si no juega o se queda sin nota, sus 0 puntos siguen siendo 0: no hay vicecapitán.
- Si algún día hay puntos negativos, también se doblan. Hoy no los hay (`MIN_PLAYER_POINTS = 0`).
- `fantasy_lineups.captain_copy_id` guarda la copia capitana (migración 0010). API:
  `PUT /fantasy/lineup` y `lineup` de `GET /fantasy/me` llevan `captain_copy_id`; cada hueco de
  `GET /fantasy/rounds/{id}/me` lleva `captain` y sus `points` ya doblados.
- `GET /fantasy/me` añade `last_round` (`match_id`, `opponent`, `held_on`: la última jornada que ya
  puntúa) y `last_points` en cada copia de `squad` (puntos del jugador en ella, sin doblar; null si
  aún no hay ninguna). Se calculan al momento: son informativos.

### Diseño y fotos (2026-11-19)

- Diseño de las pantallas del jugador en móvil: https://claude.ai/artifact/WdFLa1Zx4AKCmxuubzBnKT
  (Mi equipo con los puntos de la jornada en la pista, Mercado, Cláusulas, Liga y Fichajes, con
  barra de navegación propia abajo).
- Más adelante, una foto por jugador en lugar del círculo con el dorsal.

## Orden de construcción

1. **Cuentas de jugador y visibilidad**: rol `player` vinculado a un jugador, invitación de un solo
   uso, y las rutas de datos internos cerradas para ese rol (migración 0006).
2. **Liga, copias, plantillas iniciales, alineaciones, puntos y clasificación.**
3. **Mercado diario**: pujas, ventas, valores de mercado y cobros por jornada.
4. **Cláusulas y clausulazos** (migración 0009).
5. **Capitán** (puntúa doble, migración 0010) y el diseño nuevo de las pantallas del jugador.

Cada paso lleva migración: se aplica en Neon antes de subir a `main`.
