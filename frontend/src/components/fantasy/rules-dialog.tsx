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
      "La alineación se bloquea a las 00:00 del día del partido. Si no la tocas, se queda la de la jornada anterior.",
      "Cada jugador puntúa su nota del partido redondeada, +2 por gol. Si no juega, 0. Un hueco vacío también es 0.",
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
      "Cada jugador fichado tiene una cláusula de 1,5 × su valor. Puedes subirla pagando la mitad de la subida.",
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
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cómo se juega</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          <Button className="w-full rounded-xl" onClick={() => setOpen(false)}>
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
