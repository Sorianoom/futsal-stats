"""Catálogo de faltas del régimen interno (docs/regimen-interno.pdf). Fuente del seed de BD."""

from collections.abc import Iterable

from app.domain.points.catalog import (
    Deferral,
    Infraction,
    SanctionKind,
    SanctionRule,
    Severity,
)

LIGHT_POINTS = -3
SERIOUS_POINTS = -5
VERY_SERIOUS_POINTS = -10


def _light(letter: str, description: str) -> Infraction:
    return Infraction(f"L-{letter}", Severity.LIGHT, LIGHT_POINTS, description)


def _serious(letter: str, description: str) -> Infraction:
    return Infraction(f"G-{letter}", Severity.SERIOUS, SERIOUS_POINTS, description)


def _very_serious(
    letter: str,
    description: str,
    deferral: Deferral = Deferral.NONE,
    sanction: SanctionRule | None = None,
    in_pdf_letter: bool = True,
) -> Infraction:
    return Infraction(
        f"MG-{letter}",
        Severity.VERY_SERIOUS,
        VERY_SERIOUS_POINTS,
        description,
        deferral,
        sanction,
        in_pdf_letter,
    )


_NO_PLAY_THIS_MATCH = SanctionRule(SanctionKind.NO_PLAY, 1, 1)
_NO_CALLUP_ONE_OR_TWO = SanctionRule(SanctionKind.NO_CALLUP, 1, 2)
_NO_CALLUP_THIS_AND_NEXT = SanctionRule(SanctionKind.NO_CALLUP, 2, 2)

DEFAULT_CATALOG: tuple[Infraction, ...] = (
    _light("a", "Falta de atención e implicación en las tareas"),
    _light("b", "Tono o actitud inadecuados hacia un compañero"),
    _light("c", "Dejar objetos personales en zonas comunes"),
    _light("d", "Broma inoportuna que pueda molestar a un compañero"),
    _serious("a", "No asistir a un entrenamiento por causa no justificada, aunque sea con aviso"),
    _serious("b", "Llegar más de 10 minutos tarde a la convocatoria de partido sin aviso"),
    _serious("c", "Llegar más de 15 minutos tarde a un entrenamiento sin aviso"),
    _serious("d", "Conversaciones o distracciones mientras el cuerpo técnico explica"),
    _serious("e", "No traer los petos en buenas condiciones al entrenamiento cuando toca"),
    _serious("f", "No recoger el material siendo el encargado"),
    _serious("g", "Reincidencia en falta de atención en dos ejercicios de una sesión"),
    _serious("h", "Reincidencia en faltas leves: 4 en una semana"),
    _very_serious("a", "No asistir a un entrenamiento, partido u otra sesión sin previo aviso"),
    _very_serious("b", "Llegar más de 20 minutos tarde a un entrenamiento sin aviso"),
    _very_serious(
        "c",
        "Llegar más de 20 minutos tarde a la convocatoria sin aviso",
        Deferral.NEXT_WEEK,
        _NO_PLAY_THIS_MATCH,
    ),
    _very_serious("d", "No asistir a una sesión de fisioterapeuta sin aviso"),
    _very_serious("e", "Abandonar el terreno de juego sin autorización del cuerpo técnico"),
    _very_serious("f", "Falta de respeto grave a rival, instalación, cuerpo técnico o compañero"),
    _very_serious(
        "g",
        "No traer lo adecuado para un partido de liga",
        Deferral.NEXT_WEEK,
    ),
    _very_serious("h", "No traer el material (petos y agua) a un partido siendo el encargado"),
    _very_serious(
        "i",
        "Rebatir una decisión del cuerpo técnico a viva voz y con malas formas",
        Deferral.NEXT_WEEK_IF_IN_MATCH,
    ),
    _very_serious("j", "Difusión de vídeos o información del vestuario por redes sociales"),
    _very_serious("k", "Faltas de respeto a un equipo rival por redes sociales"),
    _very_serious("l", "Uso del móvil sin autorización en charla, pista o prepartido"),
    _very_serious("m", "Fumar o vapear en la puerta de la instalación antes de un partido"),
    _very_serious("n", "Fumar o vapear dentro de la instalación"),
    _very_serious("o", "Roja en un partido que perjudique al equipo"),
    _very_serious(
        "x1",
        "No respetar las indicaciones del cuerpo técnico",
        in_pdf_letter=False,
    ),
    _very_serious(
        "x2",
        "No contar los balones al inicio o no devolverlos a la bolsa al terminar",
        in_pdf_letter=False,
    ),
    _very_serious(
        "x3",
        "No asistir al partido sin estar convocado",
        sanction=_NO_CALLUP_ONE_OR_TWO,
        in_pdf_letter=False,
    ),
    _very_serious(
        "x4",
        "Irse sin que el cuerpo técnico disuelva el grupo",
        sanction=_NO_CALLUP_ONE_OR_TWO,
        in_pdf_letter=False,
    ),
    _very_serious(
        "x5",
        "Falta de responsabilidad en el día previo o los momentos previos al partido",
        sanction=_NO_CALLUP_THIS_AND_NEXT,
        in_pdf_letter=False,
    ),
)


def catalog_by_code(catalog: Iterable[Infraction] = DEFAULT_CATALOG) -> dict[str, Infraction]:
    return {infraction.code: infraction for infraction in catalog}
