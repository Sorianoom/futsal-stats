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

## Cláusulas

- Cada copia tiene una cláusula de rescisión, que al ficharla vale **1,5 × su valor de mercado**.
- El dueño puede subirla pagando **la mitad de la subida**.
- Cualquiera con saldo y hueco en la plantilla puede pagar la cláusula y llevarse la copia al
  momento (clausulazo). El dinero va al antiguo dueño.
- No se puede clausular durante **7 días tras un fichaje** ni **el día del partido**.

## Orden de construcción

1. **Cuentas de jugador y visibilidad**: rol `player` vinculado a un jugador, invitación de un solo
   uso, y las rutas de datos internos cerradas para ese rol (migración 0006).
2. **Liga, copias, plantillas iniciales, alineaciones, puntos y clasificación.**
3. **Mercado diario**: pujas, ventas, valores de mercado y cobros por jornada.
4. **Cláusulas y clausulazos.**

Cada paso lleva migración: se aplica en Neon antes de subir a `main`.
