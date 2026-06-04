import React, { useMemo } from "react";
import { crucesPrimeraRonda } from "../../lib/torneoExpress/bracket";
import { deserializeBracketSlots } from "../../lib/torneoExpress/bracketPersistence";
import {
  isRondaTercerLugar,
  labelRondaEliminatoria,
  maxRondaActual,
  totalRondasEliminatoria,
} from "../../lib/torneoExpress/bracketRounds";
import { parejaLabelFromMap } from "../../lib/torneoExpress/eliminatoriaLabels";
import { PartidoSetsScoreDisplay } from "./PartidoSetsScoreDisplay";
import type {
  TorneoExpressEliminatoriaPartido,
  TorneoExpressFaseEliminacion,
} from "../../lib/torneoExpress/types";
import "./torneo-express-bracket.css";

interface BracketCuadroPanelProps {
  bracketSlots: unknown;
  fase: TorneoExpressFaseEliminacion;
  partidos: TorneoExpressEliminatoriaPartido[];
  labelMap: Record<string, string>;
}

function slotLabel(
  parejaId: string | null | undefined,
  labelMap: Record<string, string>,
  fallback?: string
): string {
  if (!parejaId) return fallback ?? "—";
  return parejaLabelFromMap(labelMap, parejaId);
}

export const BracketCuadroPanel: React.FC<BracketCuadroPanelProps> = ({
  bracketSlots,
  fase,
  partidos,
  labelMap,
}) => {
  const slots = useMemo(
    () => deserializeBracketSlots(bracketSlots),
    [bracketSlots]
  );
  const crucesR1 = useMemo(() => crucesPrimeraRonda(slots), [slots]);
  const totalRondas = totalRondasEliminatoria(
    fase,
    slots.length > 0 ? slots.length : undefined
  );
  const rondaMax = maxRondaActual(partidos);

  const ganadorFinal = useMemo(() => {
    if (rondaMax < totalRondas) return null;
    const finalPartidos = partidos.filter((p) => p.ronda === totalRondas);
    const jugado = finalPartidos.find((p) => p.estado === "jugado");
    return jugado?.ganador_id ?? null;
  }, [partidos, rondaMax, totalRondas]);

  const rondasVisibles = useMemo(() => {
    const out: Array<{
      ronda: number;
      label: string;
      items: Array<{
        key: string;
        local: string;
        visit: string;
        partido?: TorneoExpressEliminatoriaPartido;
        done: boolean;
      }>;
    }> = [];

    const r1Items = crucesR1.map((c) => {
      const partido = partidos.find(
        (p) => p.ronda === 1 && p.cruce_index === c.cruceIndex
      );
      const local =
        partido?.pareja_local_id != null
          ? slotLabel(partido.pareja_local_id, labelMap, c.local?.parejaLabel)
          : c.local
            ? c.local.parejaLabel
            : "BYE";
      const visit =
        partido?.pareja_visitante_id != null
          ? slotLabel(
              partido.pareja_visitante_id,
              labelMap,
              c.visitante?.parejaLabel
            )
          : c.visitante
            ? c.visitante.parejaLabel
            : "BYE";
      const played = partido?.estado === "jugado";
      return {
        key: `r1-${c.cruceIndex}`,
        local,
        visit,
        partido: played ? partido : undefined,
        done: played,
      };
    });

    out.push({
      ronda: 1,
      label: labelRondaEliminatoria(fase, 1, totalRondas, slots.length),
      items: r1Items,
    });

    for (let r = 2; r <= totalRondas; r++) {
      const inRound = partidos
        .filter((p) => p.ronda === r)
        .sort((a, b) => a.orden - b.orden);
      if (inRound.length === 0) continue;
      out.push({
        ronda: r,
        label: labelRondaEliminatoria(fase, r, totalRondas, slots.length),
        items: inRound.map((p) => ({
          key: p.id,
          local: slotLabel(p.pareja_local_id, labelMap),
          visit: slotLabel(p.pareja_visitante_id, labelMap),
          partido: p.estado === "jugado" ? p : undefined,
          done: p.estado === "jugado",
        })),
      });
    }

    const tercer = partidos
      .filter((p) => isRondaTercerLugar(p.ronda))
      .sort((a, b) => a.orden - b.orden);
    if (tercer.length > 0) {
      out.push({
        ronda: tercer[0].ronda,
        label: "Tercer lugar",
        items: tercer.map((p) => ({
          key: p.id,
          local: slotLabel(p.pareja_local_id, labelMap),
          visit: slotLabel(p.pareja_visitante_id, labelMap),
          partido: p.estado === "jugado" ? p : undefined,
          done: p.estado === "jugado",
        })),
      });
    }

    return out;
  }, [crucesR1, fase, labelMap, partidos, totalRondas, slots.length]);

  const ganadorTercer = useMemo(() => {
    const tercer = partidos.find(
      (p) => isRondaTercerLugar(p.ronda) && p.estado === "jugado"
    );
    return tercer?.ganador_id ?? null;
  }, [partidos]);

  if (slots.length === 0) {
    return (
      <p className="te-grupos-card__partidos-hint">
        Cuadro no disponible (falta snapshot del bracket).
      </p>
    );
  }

  return (
    <div className="te-elim-cuadro">
      {ganadorFinal ? (
        <p className="te-elim-campeon">
          Campeón:{" "}
          <strong>{parejaLabelFromMap(labelMap, ganadorFinal)}</strong>
        </p>
      ) : null}
      {ganadorTercer ? (
        <p className="te-elim-campeon te-elim-campeon--tercer">
          3.er lugar:{" "}
          <strong>{parejaLabelFromMap(labelMap, ganadorTercer)}</strong>
        </p>
      ) : null}

      <div className="te-elim-cuadro__columns">
        {rondasVisibles.map((col) => (
          <section key={col.ronda} className="te-elim-cuadro__col">
            <h4 className="te-elim-cuadro__col-title">{col.label}</h4>
            <div className="te-bracket-grid te-bracket-grid--compact">
              {col.items.map((item) => (
                <div
                  key={item.key}
                  className={`te-bracket-cruce te-bracket-cruce--readonly${
                    item.done ? " te-bracket-cruce--done" : ""
                  }`}
                >
                  <div className="te-bracket-cruce__team">{item.local}</div>
                  <div className="te-bracket-cruce__vs">vs</div>
                  <div className="te-bracket-cruce__team">{item.visit}</div>
                  {item.partido ? (
                    <PartidoSetsScoreDisplay
                      partido={item.partido}
                      variant="cuadro-plain"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
