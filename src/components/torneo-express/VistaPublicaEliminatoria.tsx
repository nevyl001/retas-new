import React, { useEffect, useMemo, useState } from "react";
import { useTorneoExpress } from "../../hooks/useTorneoExpress";
import { useTorneoPublicEventoNav } from "../../hooks/useTorneoPublicDisplayNombre";
import {
  copyToClipboard,
  fetchEventoConCategorias,
  publicEliminatoriaUrl,
} from "../../services/torneoExpressService";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import {
  buildEliminatoriaPossibleSchedule,
  inferFaseEliminacion,
  parseEliminatoriaInicio,
} from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import type { EliminatoriaPossibleSlot } from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
import {
  matchSlotsFromFaseTimeline,
  projectEliminatoriaMatchSlots,
} from "../../lib/torneoExpress/eliminatoriaPreviewBracket";
import type { ProjectedEliminatoriaMatchSlot } from "../../lib/torneoExpress/eliminatoriaPreviewBracket";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import { PublicTorneoExpressShell } from "./public/PublicTorneoExpressShell";
import { TEPublicEliminatoria } from "./public/TEPublicEliminatoria";
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
  const { eventoHref } = useTorneoPublicEventoNav(bundle?.torneo);
  const [copyMsg, setCopyMsg] = useState("");
  const [evento, setEvento] = useState<TorneoExpressEvento | null>(null);
  const [slots, setSlots] = useState<EliminatoriaPossibleSlot[]>([]);
  const [faseSlots, setFaseSlots] = useState<
    ProjectedEliminatoriaMatchSlot[] | null
  >(null);

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
      setFaseSlots(null);
      setSlots([
        {
          torneoId,
          label: categoriaLabel,
          startsAt: null,
          href: `/torneo-express/${torneoId}/eliminatoria`,
          courts: [],
        },
      ]);
      return;
    }
    let cancelled = false;
    const apply = (
      data: Awaited<ReturnType<typeof fetchEventoConCategorias>>
    ) => {
      if (cancelled || !data) return false;
      setEvento(data.evento);
      const byTorneo = matchSlotsFromFaseTimeline({
        categorias: data.categorias,
        categoriaOrden: data.evento.eliminatoria_categoria_orden,
        startAt: parseEliminatoriaInicio(data.evento.eliminatoria_inicio),
        courts: data.evento.eliminatoria_canchas,
        duraciones: data.evento.eliminatoria_duraciones,
      });
      setFaseSlots(byTorneo[torneoId] ?? []);
      setSlots(
        buildEliminatoriaPossibleSchedule(
          data.categorias,
          data.evento.eliminatoria_categoria_orden,
          data.evento.eliminatoria_inicio,
          data.evento.eliminatoria_canchas,
          data.evento.eliminatoria_duraciones
        )
      );
      return true;
    };
    void fetchEventoConCategorias(eventoId, true)
      .then((data) => {
        if (apply(data)) return;
        return fetchEventoConCategorias(eventoId, false).then(apply);
      })
      .catch(() => {
        if (cancelled) return;
        void fetchEventoConCategorias(eventoId, false)
          .then(apply)
          .catch(() => undefined);
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

  const gruposHref = `/torneo-express/${torneoId}/grupos`;
  const categorySlot = slots.find((slot) => slot.torneoId === torneoId);
  const scheduleStartAt = useMemo(
    () =>
      categorySlot?.startsAt ??
      parseEliminatoriaInicio(evento?.eliminatoria_inicio),
    [categorySlot?.startsAt, evento?.eliminatoria_inicio]
  );
  const scheduleCourts =
    categorySlot?.courts && categorySlot.courts.length > 0
      ? categorySlot.courts
      : evento?.eliminatoria_canchas;
  const scheduleProjection = useMemo(() => {
    if (!bundle) return undefined;
    if (eventoId) {
      if (!faseSlots) return undefined;
      return { slots: faseSlots, timeZone: evento?.timezone };
    }
    const projected = projectEliminatoriaMatchSlots({
      fase: inferFaseEliminacion(
        bundle.torneo.fase_eliminacion,
        evento?.eliminatoria_duraciones
      ),
      startAt: scheduleStartAt,
      courts: scheduleCourts,
      duraciones: evento?.eliminatoria_duraciones,
    });
    return {
      slots: projected.slots,
      timeZone: evento?.timezone,
    };
  }, [
    bundle,
    evento?.eliminatoria_duraciones,
    evento?.timezone,
    eventoId,
    faseSlots,
    scheduleCourts,
    scheduleStartAt,
  ]);
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
      {bundle ? (
        <TEPublicEliminatoria
          bundle={bundle}
          labelMap={eliminatoriaLabelMap}
          lastRefreshedAt={lastRefreshedAt}
          realtimeConnected={realtimeConnected}
          onCopyLink={copyLink}
          copyMsg={copyMsg || undefined}
          gruposHref={gruposHref}
          eventoHref={eventoHref}
          schedule={phaseNav}
          scheduleProjection={scheduleProjection}
        />
      ) : null}
    </PublicTorneoExpressShell>
  );
};
