import { useEffect, useState } from "react";
import type { TorneoExpress } from "../lib/torneoExpress/types";
import { fetchEventoById } from "../services/torneoExpressService";

export type TorneoPublicEventoNav = {
  /** Nombre visible (evento si existe; si no, el de la categoría). */
  displayNombre: string;
  /** Ruta pública del hub de categorías: `/eventos/{slug}`. */
  eventoHref: string | null;
};

/**
 * Nombre + enlace al Evento contenedor para vistas públicas de una categoría TE.
 * Si la categoría no pertenece a un Evento, `eventoHref` es null.
 */
export function useTorneoPublicEventoNav(
  torneo: Pick<TorneoExpress, "nombre" | "evento_id"> | null | undefined
): TorneoPublicEventoNav {
  const fallback = torneo?.nombre?.trim() ?? "";
  const eventoId = torneo?.evento_id?.trim() || "";
  const [eventoNombre, setEventoNombre] = useState<string | null>(null);
  const [eventoHref, setEventoHref] = useState<string | null>(null);

  useEffect(() => {
    if (!eventoId) {
      setEventoNombre(null);
      setEventoHref(null);
      return;
    }
    let cancelled = false;
    void fetchEventoById(eventoId, true)
      .then((evento) => {
        if (cancelled) return;
        const nombre = evento?.nombre?.trim() || null;
        const slug = evento?.slug?.trim() || "";
        setEventoNombre(nombre);
        setEventoHref(slug ? `/eventos/${encodeURIComponent(slug)}` : null);
      })
      .catch(() => {
        if (!cancelled) {
          setEventoNombre(null);
          setEventoHref(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventoId]);

  return {
    displayNombre: eventoNombre || fallback,
    eventoHref,
  };
}

/**
 * Nombre visible en vistas públicas de una categoría TE.
 * Si la categoría pertenece a un Evento, prioriza el nombre del evento.
 */
export function useTorneoPublicDisplayNombre(
  torneo: Pick<TorneoExpress, "nombre" | "evento_id"> | null | undefined
): string {
  return useTorneoPublicEventoNav(torneo).displayNombre;
}
