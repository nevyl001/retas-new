import { useEffect, useState } from "react";
import type { TorneoExpress } from "../lib/torneoExpress/types";
import { fetchEventoById } from "../services/torneoExpressService";

/**
 * Nombre visible en vistas públicas de una categoría TE.
 * Si la categoría pertenece a un Evento, prioriza el nombre del evento
 * (ej. "SUMMER OPEN") sobre el nombre interno corto de la categoría.
 */
export function useTorneoPublicDisplayNombre(
  torneo: Pick<TorneoExpress, "nombre" | "evento_id"> | null | undefined
): string {
  const fallback = torneo?.nombre?.trim() ?? "";
  const eventoId = torneo?.evento_id?.trim() || "";
  const [eventoNombre, setEventoNombre] = useState<string | null>(null);

  useEffect(() => {
    if (!eventoId) {
      setEventoNombre(null);
      return;
    }
    let cancelled = false;
    void fetchEventoById(eventoId, true)
      .then((evento) => {
        if (cancelled) return;
        const nombre = evento?.nombre?.trim() || null;
        setEventoNombre(nombre);
      })
      .catch(() => {
        if (!cancelled) setEventoNombre(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventoId]);

  return eventoNombre || fallback;
}
