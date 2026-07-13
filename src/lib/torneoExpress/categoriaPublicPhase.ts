import {
  eliminatoriaBracketSize,
  isFinaleEliminatoriaStage,
  isRondaTercerLugar,
  labelRondaEliminatoria,
  maxRondaActual,
  partidosDeRonda,
  totalRondasEliminatoria,
} from "./bracketRounds";
import type {
  TorneoExpress,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressFaseEliminacion,
  TorneoExpressFaseTorneo,
} from "./types";

/** Campos mínimos para detectar fase activa del bracket (lectura pública). */
export type EliminatoriaPartidoPhaseHint = Pick<
  TorneoExpressEliminatoriaPartido,
  "ronda" | "orden" | "estado" | "es_bye" | "ganador_id"
>;

/**
 * Evidencia real de cuadro generado: fase en eliminatoria/cerrado
 * Y filas persistidas en torneo_express_eliminatoria_partidos para ese torneo_express.id.
 */
export function hasCategoriaEliminatoria(
  faseTorneo: TorneoExpressFaseTorneo | string | null | undefined,
  eliminatoriaPartidosCount: number
): boolean {
  return (
    (faseTorneo === "eliminatoria" || faseTorneo === "cerrado") &&
    eliminatoriaPartidosCount > 0
  );
}

function activeRondaFromPartidos(
  partidos: EliminatoriaPartidoPhaseHint[],
  totalRondas: number
): number {
  const asFull = partidos as TorneoExpressEliminatoriaPartido[];
  if (isFinaleEliminatoriaStage(asFull, totalRondas)) {
    return totalRondas;
  }

  for (let r = 1; r <= totalRondas; r++) {
    const round = partidosDeRonda(asFull, r);
    if (round.some((p) => !p.es_bye && p.estado === "pendiente")) return r;
  }
  return Math.max(
    maxRondaActual(asFull.filter((p) => !isRondaTercerLugar(p.ronda))),
    1
  );
}

function labelFromFaseEliminacion(
  fase: TorneoExpressFaseEliminacion | null | undefined
): string {
  switch (fase) {
    case "octavos":
      return "Octavos de final";
    case "cuartos":
      return "Cuartos de final";
    case "semifinal":
      return "Semifinales";
    default:
      return "Fase final";
  }
}

function displayLabelFromRoundLabel(raw: string): string {
  if (raw === "Semifinal") return "Semifinales";
  if (raw === "Final") return "Final";
  if (raw === "Tercer lugar") return "Fase final";
  return raw;
}

/**
 * Etiqueta de fase para la tarjeta pública del Evento (por categoría).
 * No genera cuadro: solo interpreta estado ya persistido.
 */
export function resolveCategoriaPhaseLabel(input: {
  faseTorneo: TorneoExpressFaseTorneo | string | null | undefined;
  estado: TorneoExpress["estado"] | string | null | undefined;
  faseEliminacion?: TorneoExpressFaseEliminacion | null;
  bracketSlots?: unknown;
  eliminatoriaPartidos: EliminatoriaPartidoPhaseHint[];
}): string {
  const {
    faseTorneo,
    estado,
    faseEliminacion,
    bracketSlots,
    eliminatoriaPartidos,
  } = input;

  if (faseTorneo === "cerrado" || estado === "finalizado") {
    return "Finalizado";
  }

  if (
    !hasCategoriaEliminatoria(faseTorneo, eliminatoriaPartidos.length)
  ) {
    return "Fase de grupos";
  }

  const fase = faseEliminacion ?? "cuartos";
  const bracketSize = eliminatoriaBracketSize(fase, bracketSlots);
  const totalRondas = totalRondasEliminatoria(fase, bracketSize);
  const active = activeRondaFromPartidos(eliminatoriaPartidos, totalRondas);
  const raw = labelRondaEliminatoria(fase, active, totalRondas, bracketSize);
  return displayLabelFromRoundLabel(raw) || labelFromFaseEliminacion(fase);
}

export type CategoriaPublicPhasePresentation = {
  hasEliminatoria: boolean;
  phaseLabel: string;
  primaryActionLabel: string;
  /** Ruta relativa por torneo_express.id */
  primaryHref: string;
  secondaryActionLabel?: string;
  secondaryHref?: string;
};

export function buildCategoriaPublicPhasePresentation(
  categoria: Pick<
    TorneoExpress,
    "id" | "fase_torneo" | "fase_eliminacion" | "estado" | "bracket_slots"
  >,
  eliminatoriaPartidos: EliminatoriaPartidoPhaseHint[]
): CategoriaPublicPhasePresentation {
  const torneoId = categoria.id;
  const hasElim = hasCategoriaEliminatoria(
    categoria.fase_torneo,
    eliminatoriaPartidos.length
  );
  const phaseLabel = resolveCategoriaPhaseLabel({
    faseTorneo: categoria.fase_torneo,
    estado: categoria.estado,
    faseEliminacion: categoria.fase_eliminacion,
    bracketSlots: categoria.bracket_slots,
    eliminatoriaPartidos,
  });

  if (!hasElim) {
    return {
      hasEliminatoria: false,
      phaseLabel,
      primaryActionLabel: "Ver grupos y partidos",
      primaryHref: `/torneo-express/${torneoId}/grupos`,
    };
  }

  return {
    hasEliminatoria: true,
    phaseLabel,
    primaryActionLabel: "Ver fase final",
    primaryHref: `/torneo-express/${torneoId}/eliminatoria`,
    secondaryActionLabel: "Ver grupos y resultados",
    secondaryHref: `/torneo-express/${torneoId}/grupos`,
  };
}
