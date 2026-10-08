import React, { useEffect, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { useTorneoPublicEventoNav } from "../../hooks/useTorneoPublicDisplayNombre";
import {
  copyToClipboard,
  fetchEventoConCategorias,
  publicEliminatoriaUrl,
} from "../../services/torneoExpressService";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import { buildEliminatoriaPossibleSchedule } from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import type { EliminatoriaPossibleSlot } from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { TEPublicEliminatoria } from "./public/TEPublicEliminatoria";
import { TEPublicEliminatoriaHorario } from "./public/TEPublicEliminatoriaHorario";
import { PublicEventNeutralLoading } from "../../club-experience";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../../lib/torneoExpress/publicPoll";
import "./public/te-public-grupos.css";
import "./public/te-public-eliminatoria.css";
import "./public/te-public-eliminatoria-v2.css";

export const VistaPublicaEliminatoria: React.FC<{ torneoId: string }> = ({
  torneoId,
}) => {
  const {
    bundle,
    loading,
    error,
    lastRefreshedAt,
    realtimeConnected,
    eliminatoriaLabelMap,
  } = useTorneoExpress(torneoId, {
    publicMode: true,
    realtime: true,
    pollIntervalMs: TE_PUBLIC_POLL_INTERVAL_MS,
  });
  const { eventoHref, displayNombre } = useTorneoPublicEventoNav(
    bundle?.torneo
  );
  const [copyMsg, setCopyMsg] = useState("");
  const [evento, setEvento] = useState<TorneoExpressEvento | null>(null);
  const [slots, setSlots] = useState<EliminatoriaPossibleSlot[]>([]);

  const hasBundle = Boolean(bundle);
  const eventoId = bundle?.torneo.evento_id?.trim() ?? "";
  const categoriaLabel =
    formatTorneoExpressCategoria(bundle?.torneo.categoria) ||
    bundle?.torneo.nombre ||
    "";

  useEffect(() => {
    if (!hasBundle) {
      setEvento(null);
      setSlots([]);
      return;
    }
    if (!eventoId) {
      setEvento(null);
      setSlots([
        {
          torneoId,
          label: categoriaLabel,
          startsAt: null,
          href: `/torneo-express/${torneoId}/eliminatoria`,
        },
      ]);
      return;
    }
    let cancelled = false;
    void fetchEventoConCategorias(eventoId, true)
      .then((data) => {
        if (cancelled || !data) return;
        setEvento(data.evento);
        setSlots(
          buildEliminatoriaPossibleSchedule(
            data.categorias,
            data.evento.eliminatoria_categoria_orden,
            data.evento.eliminatoria_inicio
          )
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEvento(null);
          setSlots([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasBundle, categoriaLabel, eventoId, torneoId]);

  const copyLink = async () => {
    const play = publicEliminatoriaUrl(torneoId);
    const ok = await copyToClipboard(
      buildSharePublicOgUrlFromPlayUrl(play) || play
    );
    setCopyMsg(ok ? "Enlace copiado" : "No se pudo copiar");
    setTimeout(() => setCopyMsg(""), 2500);
  };

  const hasElimPartidos = (bundle?.eliminatoriaPartidos.length ?? 0) > 0;
  const gruposHref = `/torneo-express/${torneoId}/grupos`;
  const horario = (
    <TEPublicEliminatoriaHorario
      slots={slots}
      timeZone={evento?.timezone}
      currentTorneoId={torneoId}
    />
  );
  const phaseNav = (
    <nav className="te-phase-segment" aria-label="Fase del torneo">
      <a className="te-phase-segment__item" href={gruposHref}>
        Grupos
      </a>
      <span
        className="te-phase-segment__item te-phase-segment__item--active"
        aria-current="page"
      >
        Eliminatoria
      </span>
    </nav>
  );

  return (
    <PublicTorneoExpressShell
      className="te-public--eliminatoria"
      organizadorId={bundle?.torneo.organizador_id ?? null}
    >
      {loading && !bundle ? (
        <PublicEventNeutralLoading
          className="te-pub-elim-loading"
          message="Cargando fase eliminatoria…"
        />
      ) : null}
      {!loading && !bundle ? (
        <p className="te-public-error">{error ?? "Torneo no encontrado"}</p>
      ) : null}
      {bundle && !hasElimPartidos ? (
        <div className="te-grupos-page te-elim-public">
          {eventoHref ? (
            <a
              href={eventoHref}
              className="te-grupos-back-evento"
              aria-label="Volver al evento y ver todas las categorías"
            >
              ← Volver al evento
            </a>
          ) : null}
          <header className="te-elim-public__header">
            <h1 className="te-elim-public__title">
              {displayNombre || bundle.torneo.nombre}
            </h1>
          </header>
          {phaseNav}
          {horario}
          <p className="te-elim-horario__hint">
            El cuadro se publica al cerrar grupos. Mientras tanto, estos son
            los horarios posibles.
          </p>
        </div>
      ) : null}
      {bundle && hasElimPartidos ? (
        <TEPublicEliminatoria
          bundle={bundle}
          labelMap={eliminatoriaLabelMap}
          lastRefreshedAt={lastRefreshedAt}
          realtimeConnected={realtimeConnected}
          onCopyLink={copyLink}
          copyMsg={copyMsg || undefined}
          gruposHref={gruposHref}
          eventoHref={eventoHref}
          schedule={
            <>
              {phaseNav}
              {horario}
            </>
          }
        />
      ) : null}
    </PublicTorneoExpressShell>
  );
};
