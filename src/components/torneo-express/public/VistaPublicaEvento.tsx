import React, { useEffect, useState } from "react";
import {
  useClubExperience,
  useOrganizerDisplayName,
} from "../../../club-experience";
import type {
  TorneoExpress,
  TorneoExpressEvento,
  TorneoExpressEventoPublico,
} from "../../../lib/torneoExpress/types";
import { buildCategoriaPublicCardStats } from "../../../lib/torneoExpress/categoriaPublicCardStats";
import {
  fetchEventoPublicoPorSlug,
  formatSupabaseError,
} from "../../../services/torneoExpressService";
import { PublicTorneoExpressShell } from "./PublicTorneoExpressShell";
import { PublicEventNeutralLoading } from "../../../club-experience";
import { EventoCategoriaHubCard } from "./EventoCategoriaHubCard";
import "./te-evento-publico.css";

function formatFechaHeader(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

type EventoPublicoBodyProps = {
  evento: TorneoExpressEvento;
  categorias: TorneoExpress[];
  eliminatoriaPartidosByTorneoId: TorneoExpressEventoPublico["eliminatoriaPartidosByTorneoId"];
  gruposByTorneoId: TorneoExpressEventoPublico["gruposByTorneoId"];
  statsByTorneoId: TorneoExpressEventoPublico["statsByTorneoId"];
};

const EventoPublicoBody: React.FC<EventoPublicoBodyProps> = ({
  evento,
  categorias,
  eliminatoriaPartidosByTorneoId,
  gruposByTorneoId,
  statsByTorneoId,
}) => {
  const showFlyerBanner =
    evento.logo_source === "flyer" && Boolean(evento.flyer_url?.trim());
  const [flyerShape, setFlyerShape] = useState<
    "landscape" | "portrait" | "square"
  >("landscape");
  const [openCategoriaId, setOpenCategoriaId] = useState<string | null>(null);

  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName(evento.organizador_id);

  const fechaInicio = formatFechaHeader(evento.fecha_inicio);
  const fechaFin = formatFechaHeader(evento.fecha_fin);
  const fechaLine =
    fechaInicio && fechaFin && fechaInicio !== fechaFin
      ? `${fechaInicio} – ${fechaFin}`
      : fechaInicio || fechaFin;

  const metaParts = [
    fechaLine,
    isClubBranded && organizerName ? organizerName : null,
  ].filter(Boolean);

  return (
    <>
      {showFlyerBanner ? (
        <div
          className={`te-public-evento-banner te-public-evento-banner--${flyerShape}`}
        >
          <img
            src={evento.flyer_url!.trim()}
            alt=""
            className="te-public-evento-banner__img"
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (!w || !h) return;
              const ratio = w / h;
              if (ratio > 1.08) setFlyerShape("landscape");
              else if (ratio < 0.92) setFlyerShape("portrait");
              else setFlyerShape("square");
            }}
          />
        </div>
      ) : null}

      <header className="te-public-evento-header te-pub-fade-in">
        <h1 className="te-public-evento-header__title">{evento.nombre}</h1>
        {metaParts.length > 0 ? (
          <p className="te-public-evento-header__meta">{metaParts.join(" · ")}</p>
        ) : null}
      </header>

      <section
        className="te-public-evento-roles"
        aria-labelledby="te-evento-categorias-heading"
      >
        <h2
          id="te-evento-categorias-heading"
          className="te-public-evento-roles__title"
        >
          Categorías
        </h2>
        <p className="te-public-evento-roles__hint">
          Consulta grupos, partidos y fase final.
        </p>
        {categorias.length === 0 ? (
          <p className="te-public-evento__status">
            Aún no hay categorías públicas en este evento.
          </p>
        ) : (
          <ul className="te-public-evento-roles__list">
            {categorias.map((cat) => {
              const grupos = gruposByTorneoId[cat.id] ?? [];
              const stats = buildCategoriaPublicCardStats({
                categoria: cat,
                grupos,
                stats: statsByTorneoId[cat.id],
                eliminatoriaPartidos:
                  eliminatoriaPartidosByTorneoId[cat.id] ?? [],
              });
              const open = openCategoriaId === cat.id;
              return (
                <li key={cat.id}>
                  <EventoCategoriaHubCard
                    categoriaId={cat.id}
                    stats={stats}
                    grupos={grupos}
                    open={open}
                    onToggle={() =>
                      setOpenCategoriaId((cur) =>
                        cur === cat.id ? null : cat.id
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
};

type VistaPublicaEventoProps = {
  slug: string;
};

/**
 * Contenedor público del Evento: banner (flyer) + nombre + hub de categorías.
 * Datos deportivos viven en cada categoría (`torneo_express.id`).
 */
export const VistaPublicaEvento: React.FC<VistaPublicaEventoProps> = ({
  slug,
}) => {
  const [evento, setEvento] = useState<TorneoExpressEvento | null>(null);
  const [categorias, setCategorias] = useState<TorneoExpress[]>([]);
  const [eliminatoriaPartidosByTorneoId, setEliminatoriaPartidosByTorneoId] =
    useState<TorneoExpressEventoPublico["eliminatoriaPartidosByTorneoId"]>({});
  const [gruposByTorneoId, setGruposByTorneoId] = useState<
    TorneoExpressEventoPublico["gruposByTorneoId"]
  >({});
  const [statsByTorneoId, setStatsByTorneoId] = useState<
    TorneoExpressEventoPublico["statsByTorneoId"]
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await fetchEventoPublicoPorSlug(slug);
        if (cancelled) return;
        if (!data) {
          setEvento(null);
          setCategorias([]);
          setEliminatoriaPartidosByTorneoId({});
          setGruposByTorneoId({});
          setStatsByTorneoId({});
          setError("Evento no encontrado o no publicado");
          return;
        }
        setEvento(data.evento);
        setCategorias(data.categorias);
        setEliminatoriaPartidosByTorneoId(data.eliminatoriaPartidosByTorneoId);
        setGruposByTorneoId(data.gruposByTorneoId);
        setStatsByTorneoId(data.statsByTorneoId);
      } catch (e) {
        if (!cancelled) {
          setError(formatSupabaseError(e));
          setEvento(null);
          setCategorias([]);
          setEliminatoriaPartidosByTorneoId({});
          setGruposByTorneoId({});
          setStatsByTorneoId({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <PublicTorneoExpressShell
      className="te-public--evento"
      organizadorId={evento?.organizador_id ?? null}
    >
      {loading ? (
        <PublicEventNeutralLoading message="Cargando evento…" />
      ) : null}
      {error ? <p className="te-error">{error}</p> : null}
      {!loading && evento ? (
        <EventoPublicoBody
          evento={evento}
          categorias={categorias}
          eliminatoriaPartidosByTorneoId={eliminatoriaPartidosByTorneoId}
          gruposByTorneoId={gruposByTorneoId}
          statsByTorneoId={statsByTorneoId}
        />
      ) : null}
    </PublicTorneoExpressShell>
  );
};
