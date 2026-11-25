"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Reglamento del Fantasy en corto (fuente: `docs/fantasy.md` y `backend/app/domain/fantasy/rules.py`). */
const SECTIONS = [
  {
    title: "Tu equipo",
    items: [
      "Empiezas con 2 jugadores de campo al azar (uno por sobre) y 20 M para fichar.",
      "Puedes tener hasta {squad} jugadores, sin repetir. El portero lo fichas en el mercado.",
    ],
  },
  {
    title: "Alineación y puntos",
    items: [
      "Cada jornada es un partido oficial. Alineas 1 portero y 4 de campo de tu plantilla.",
      "La alineación se bloquea cuando el entrenador empieza el partido: cuentan los jugadores y el capitán que tengas en ese momento. Si no la tocas, se queda la de la jornada anterior.",
      "Cada jugador puntúa su nota del partido redondeada (sin tope de 10) y +2 si el entrenador lo elige MVP. Si no juega, 0. Un hueco vacío también es 0.",
      "La nota parte de 5,4: cada gol suma 2,5 (5 si es del portero) y también suman asistencias, robos, acciones clave, paradas y cada 10 minutos seguidos en pista sin que te marquen; restan pérdidas, faltas, tarjetas y goles en contra con él en pista. Un partido flojo da unos 5 puntos, uno normal 7, uno bueno 9 y un partidazo más. Toca un jugador en una jornada para ver por qué puntuó así.",
      "Capitán (opcional): sus puntos cuentan el doble, también lo malo. Si no juega, nadie dobla.",
    ],
  },
  {
    title: "Dinero y valor",
    items: [
      "Tras cada jornada cobras 0,1 M por punto de tu alineación.",
      "El valor de cada jugador sube o baja 0,2 M por cada punto por encima o por debajo de 6. Si no juega, baja 0,2 M.",
      "Si tienes saldo negativo cuando se bloquea la alineación, esa jornada puntúas 0. Vende para arreglarlo.",
    ],
  },
  {
    title: "Mercado",
    items: [
      "Cada día a las 00:00 salen jugadores nuevos. Las pujas son en sobre cerrado: a las 24 h gana la más alta.",
      "Pujar no reserva saldo: si ganas varias pujas puedes quedarte en negativo.",
      "Vender a la banca es al momento y te paga el 70 % del valor. También puedes ponerlo a la venta para los demás.",
    ],
  },
  {
    title: "Cláusulas",
    items: [
      "Cada jugador fichado tiene una cláusula de 1,5 × su valor, o de 1,25 × lo que pagaste por él si es más. Puedes subirla pagando la mitad de la subida.",
      "Cualquiera puede pagar tu cláusula y llevárselo al momento, salvo los 7 días tras ficharlo y el día del partido.",
    ],
  },
] as const;

/** Botón «Cómo se juega» con las reglas del Fantasy en un diálogo. */
export function RulesDialog({ squadLimit }: { squadLimit: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="rounded-xl" onClick={() => setOpen(true)}>
        Cómo se juega
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cómo se juega</DialogTitle>
          </DialogHeader>
          {/* Solo se desplaza el texto: título y botón quedan fijos y la barra no pisa las esquinas. */}
          <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 [scrollbar-width:thin]">
            {SECTIONS.map((section) => (
              <section key={section.title} className="space-y-1.5">
                <h3 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
                  {section.title}
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {section.items.map((item) => (
                    <li key={item}>{item.replace("{squad}", String(squadLimit))}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <Button className="w-full shrink-0 rounded-xl" onClick={() => setOpen(false)}>
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
