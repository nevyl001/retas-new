import React, { useEffect, useState } from "react";
import type {
  TorneoExpress,
  TorneoExpressEvento,
} from "../../../lib/torneoExpress/types";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import {
  fetchEventoPublicoPorSlug,
  formatSupabaseError,
} from "../../../services/torneoExpressService";
import { PublicTorneoExpressShell } from "./PublicTorneoExpressShell";
import "./te-evento-publico.css";

function formatFecha(iso: string | null): string | null {
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

function categoryLabel(cat: TorneoExpress): string {
  return (
    formatTorneoExpressCategoria(cat.categoria) ||
    cat.nombre?.trim() ||
    "Categoría"
  );
}

type EventoPublicoBodyProps = {
  evento: TorneoExpressEvento;
  categorias: TorneoExpress[];
};

const EventoPublicoBody: React.FC<EventoPublicoBodyProps> = ({
  evento,
  categorias,
}) => {
  const showFlyerBanner =
    evento.logo_source === "flyer" && Boolean(evento.flyer_url?.trim());
  const [flyerShape, setFlyerShape] = useState<
    "landscape" | "portrait" | "square"
  >("landscape");

  const fechas = [formatFecha(evento.fecha_inicio), formatFecha(evento.fecha_fin)]
    .filter(Boolean)
    .join(" – ");

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
        <div className="te-public-evento-header__brand">
          <h1 className="te-public-evento-header__title">{evento.nombre}</h1>
          {fechas ? (
            <p className="te-public-evento-header__dates">{fechas}</p>
          ) : null}
        </div>
      </header>

      <section
        className="te-public-evento-roles"
        aria-labelledby="te-evento-roles-heading"
      >
        <h2
          id="te-evento-roles-heading"
          className="te-public-evento-roles__title te-label-section"
        >
          Roles de juego
        </h2>
        <p className="te-public-evento-roles__hint">
          Elige tu categoría para ver grupos, partidos y resultados.
        </p>
        {categorias.length === 0 ? (
          <p className="te-public-evento__status">
            Aún no hay categorías públicas en este evento.
          </p>
        ) : (
          <ul className="te-public-evento-roles__list">
            {categorias.map((cat) => (
              <li key={cat.id}>
                <a
                  href={`/torneo-express/${cat.id}/grupos`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="te-public-evento-role-card"
                >
                  <span className="te-public-evento-role-card__mark" aria-hidden>
                    RO
                  </span>
                  <span className="te-public-evento-role-card__body">
                    <span className="te-public-evento-role-card__label">
                      {categoryLabel(cat)}
                    </span>
                    <span className="te-public-evento-role-card__meta">
                      Grupos · Eliminatoria
                    </span>
                  </span>
                  <span className="te-public-evento-role-card__chevron" aria-hidden>
                    ›
                  </span>
                </a>
              </li>
            ))}
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
 * Contenedor público del Evento: banner (flyer) + nombre + selector de categorías.
 * Datos deportivos viven en cada categoría (`torneo_express.id`).
 */
export const VistaPublicaEvento: React.FC<VistaPublicaEventoProps> = ({
  slug,
}) => {
  const [evento, setEvento] = useState<TorneoExpressEvento | null>(null);
  const [categorias, setCategorias] = useState<TorneoExpress[]>([]);
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
          setError("Evento no encontrado o no publicado");
          return;
        }
        setEvento(data.evento);
        setCategorias(data.categorias);
      } catch (e) {
        if (!cancelled) {
          setError(formatSupabaseError(e));
          setEvento(null);
          setCategorias([]);
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
        <p className="te-public-evento__status">Cargando evento…</p>
      ) : null}
      {error ? <p className="te-error">{error}</p> : null}
      {!loading && evento ? (
        <EventoPublicoBody evento={evento} categorias={categorias} />
      ) : null}
    </PublicTorneoExpressShell>
  );
};
