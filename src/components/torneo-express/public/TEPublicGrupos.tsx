import React, { useMemo } from "react";
import { formatCanchaDisplay } from "../../../lib/torneoExpress/canchaDisplay";
import {
  formatPartidoFecha,
  formatPartidoHora,
  partidoScheduleIso,
} from "../../../lib/torneoExpress/partidoSchedule";
import { sortPartidosByOrden } from "../../../lib/torneoExpress/roundRobin";
import type {
  StandingRowExpress,
  TorneoExpressBundle,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import { Button } from "../../ui";
import { PublicStandingsSection } from "./PublicStandingsSection";
import { PublicStandingsScoringHelp } from "./PublicStandingsScoringHelp";
import "./te-public-grupos.css";

export type TEPartidoEstadoPublico = "pendiente" | "en_vivo" | "finalizado";

export interface TEPublicGruposPartido {
  id: string;
  hora: string;
  cancha: string;
  pareja1: string;
  pareja2: string;
  score1: number | null;
  score2: number | null;
  estado: TEPartidoEstadoPublico;
}

export interface TEPublicGruposGrupo {
  nombre: string;
  partidos: TEPublicGruposPartido[];
  standingRows: StandingRowExpress[];
  clasifican: number;
}

export interface TEPublicGruposProps {
  grupos: TEPublicGruposGrupo[];
  torneoNombre: string;
  categoria: string;
  fecha: string;
  lugar: string;
  onCopyLink?: () => void;
  copyMsg?: string;
}

const DEFAULT_CLASIFICAN = 2;

function resolvePartidoEstado(
  partido: TorneoExpressPartido,
  enVivoId: string | null
): TEPartidoEstadoPublico {
  if (partido.estado === "jugado") return "finalizado";
  if (partido.id === enVivoId) return "en_vivo";
  return "pendiente";
}

function mapPartidosForGrupo(
  partidos: TorneoExpressPartido[],
  labelById: Map<string, string>
): TEPublicGruposPartido[] {
  const sorted = sortPartidosByOrden(partidos);
  const enVivoId = sorted.find((p) => p.estado === "pendiente")?.id ?? null;

  return sorted.map((partido) => {
    const played = partido.estado === "jugado";
    const scheduleIso = partidoScheduleIso(partido);

    return {
      id: partido.id,
      hora: formatPartidoHora(scheduleIso),
      cancha: formatCanchaDisplay(partido.cancha),
      pareja1: labelById.get(partido.pareja_local_id) ?? "Local",
      pareja2: labelById.get(partido.pareja_visitante_id) ?? "Visitante",
      score1: played ? (partido.puntos_local ?? 0) : null,
      score2: played ? (partido.puntos_visitante ?? 0) : null,
      estado: resolvePartidoEstado(partido, enVivoId),
    };
  });
}

export function buildTEPublicGruposProps(
  bundle: TorneoExpressBundle,
  standingsByGrupo: Record<string, StandingRowExpress[]>,
  options?: { clasifican?: number; lugar?: string }
): Omit<TEPublicGruposProps, "onCopyLink" | "copyMsg"> {
  const clasifican = options?.clasifican ?? DEFAULT_CLASIFICAN;
  const gruposOrdenados = [...bundle.grupos].sort((a, b) => a.orden - b.orden);

  let fechaIso: string | null = null;

  gruposOrdenados.forEach((grupo) => {
    const partidos = bundle.partidosPorGrupo[grupo.id] ?? [];
    partidos.forEach((partido) => {
      const iso = partidoScheduleIso(partido);
      if (!fechaIso || iso < fechaIso) {
        fechaIso = iso;
      }
    });
  });

  const fecha = fechaIso
    ? formatPartidoFecha(fechaIso)
    : formatPartidoFecha(bundle.torneo.created_at);

  const grupos: TEPublicGruposGrupo[] = gruposOrdenados.map((grupo) => {
    const parejas = bundle.parejasPorGrupo[grupo.id] ?? [];
    const labelById = new Map<string, string>();
    parejas.forEach((p) => {
      labelById.set(p.pareja_id, p.pareja_display ?? p.pareja_id);
    });

    return {
      nombre: grupo.nombre,
      partidos: mapPartidosForGrupo(
        bundle.partidosPorGrupo[grupo.id] ?? [],
        labelById
      ),
      standingRows: standingsByGrupo[grupo.id] ?? [],
      clasifican,
    };
  });

  return {
    grupos,
    torneoNombre: bundle.torneo.nombre,
    categoria: bundle.torneo.categoria?.trim() ?? "",
    fecha,
    lugar: options?.lugar?.trim() ?? "",
  };
}

function PartidoStatusBadge({ estado }: { estado: TEPartidoEstadoPublico }) {
  if (estado === "finalizado") {
    return (
      <span className="te-badge-final">
        <span aria-hidden>✓</span> Final
      </span>
    );
  }
  if (estado === "en_vivo") {
    return (
      <span className="te-badge-live">
        <span className="te-badge-live__dot" aria-hidden />
        En vivo
      </span>
    );
  }
  return (
    <span className="te-badge-proximo">
      <span aria-hidden>◷</span> Próximo
    </span>
  );
}

function PartidoRow({ partido }: { partido: TEPublicGruposPartido }) {
  const played = partido.estado === "finalizado";
  const team1Wins =
    played &&
    partido.score1 != null &&
    partido.score2 != null &&
    partido.score1 > partido.score2;
  const team2Wins =
    played &&
    partido.score1 != null &&
    partido.score2 != null &&
    partido.score2 > partido.score1;

  return (
    <article className="te-partido-item">
      <div className="te-partido-meta">
        <span className="te-partido-hora">{partido.hora}</span>
        <span className="te-partido-cancha">
          <span className="te-partido-cancha__icon" aria-hidden>
            📍
          </span>
          {partido.cancha}
        </span>
      </div>

      <div className="te-partido-divider" aria-hidden />

      <div className="te-partido-teams">
        <div className="te-team-row">
          <span
            className={`te-team-name${
              team1Wins ? " te-team-name--winner" : ""
            }`}
          >
            {partido.pareja1}
          </span>
          {played ? (
            <span
              className={`te-team-score${
                team1Wins ? " te-team-score--winner" : ""
              }`}
            >
              {partido.score1}
            </span>
          ) : (
            <span className="te-score-pending">—</span>
          )}
        </div>
        <div className="te-team-row">
          <span
            className={`te-team-name${
              team2Wins ? " te-team-name--winner" : ""
            }`}
          >
            {partido.pareja2}
          </span>
          {played ? (
            <span
              className={`te-team-score${
                team2Wins ? " te-team-score--winner" : ""
              }`}
            >
              {partido.score2}
            </span>
          ) : (
            <span className="te-score-pending">—</span>
          )}
        </div>
      </div>

      <div className="te-partido-badge">
        <PartidoStatusBadge estado={partido.estado} />
      </div>
    </article>
  );
}

export const TEPublicGrupos: React.FC<TEPublicGruposProps> = ({
  grupos,
  torneoNombre,
  categoria,
  fecha,
  lugar,
  onCopyLink,
  copyMsg,
}) => {
  const subInfo = useMemo(() => {
    const totalParejas = grupos.reduce(
      (sum, g) => sum + g.standingRows.length,
      0
    );
    const parts = [
      `${grupos.length} grupo${grupos.length === 1 ? "" : "s"}`,
      `${totalParejas} pareja${totalParejas === 1 ? "" : "s"}`,
    ];
    if (lugar.trim()) parts.push(lugar.trim());
    if (fecha.trim()) parts.push(fecha.trim());
    return parts.join(" · ");
  }, [grupos, lugar, fecha]);

  const heroTitle = categoria.trim()
    ? `${categoria.trim()} — Fase de grupos`
    : `${torneoNombre} — Fase de grupos`;
  const eyebrow = `${torneoNombre.toUpperCase()} · TORNEO EXPRESS`;

  return (
    <div className="te-grupos-page">
      <header className="te-grupos-hero">
        <div className="te-grupos-hero__top">
          <div>
            <p className="te-grupos-eyebrow">{eyebrow}</p>
            <h1 className="te-grupos-title">{heroTitle}</h1>
            <p className="te-grupos-sub">{subInfo}</p>
          </div>
          {onCopyLink ? (
            <div className="te-grupos-hero__actions">
              <Button type="button" variant="secondary" size="sm" onClick={onCopyLink}>
                Copiar enlace
              </Button>
            </div>
          ) : null}
        </div>
        {copyMsg ? <p className="te-grupos-copy-msg">{copyMsg}</p> : null}
      </header>

      {grupos.length > 0 && (
        <div className="te-grupos-scoring-help">
          <PublicStandingsScoringHelp />
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="te-grupos-empty">Sin grupos en este torneo.</p>
      ) : (
        <div className="te-grupos-grid">
        {grupos.map((grupo) => (
          <section key={grupo.nombre} className="te-grupo-wrap">
            <div className="te-grupo-head">
              <h2 className="te-grupo-label">{grupo.nombre}</h2>
              <span className="te-grupo-clasifican-badge">
                Clasifican {grupo.clasifican}
              </span>
            </div>

            <div className="te-grupo-partidos">
              {grupo.partidos.length === 0 ? (
                <p className="te-grupos-empty">Sin partidos programados.</p>
              ) : (
                grupo.partidos.map((partido) => (
                  <PartidoRow key={partido.id} partido={partido} />
                ))
              )}
            </div>

            <div className="te-grupo-standing-full">
              <PublicStandingsSection
                rows={grupo.standingRows}
                title="Clasificación"
                showScoringHelp={false}
              />
            </div>
          </section>
        ))}
        </div>
      )}
    </div>
  );
};
