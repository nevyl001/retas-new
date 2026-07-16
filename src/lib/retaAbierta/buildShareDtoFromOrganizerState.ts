import type {
  ConvocatoriaAdapterContext,
  OpenRegistrationConfigRow,
  OpenRegistrationOrganizerEntry,
  OpenRegistrationPublicEntry,
} from "./types";

/** Arma el DTO del mensaje WhatsApp desde estado ya cargado (sin fetch). */
export function buildShareDtoFromOrganizerState(
  cfg: OpenRegistrationConfigRow,
  entries: OpenRegistrationOrganizerEntry[],
  context: ConvocatoriaAdapterContext
): {
  name: string;
  scheduled_at: string | null;
  scheduled_until: string | null;
  duration_minutes: number | null;
  location_label: string | null;
  cancha_label: string | null;
  category_label: string | null;
  rama_label: string | null;
  capacity: number;
  confirmed_count: number;
  entries: OpenRegistrationPublicEntry[];
  display_rating: boolean;
  mode_type: ConvocatoriaAdapterContext["mode"];
  spots_left: number;
} {
  const confirmed = entries.filter((e) => e.status === "confirmed");
  const capacity = context.lockCapacity ? context.defaultCapacity : cfg.capacity;

  const scheduled_at =
    context.defaultScheduledAt ?? cfg.scheduled_at ?? null;
  const duration_minutes =
    context.defaultDurationMinutes ?? cfg.duration_minutes ?? 90;
  let scheduled_until: string | null = null;
  if (scheduled_at && duration_minutes > 0) {
    const start = Date.parse(scheduled_at);
    if (Number.isFinite(start)) {
      scheduled_until = new Date(
        start + duration_minutes * 60_000
      ).toISOString();
    }
  }

  return {
    // Nombre siempre desde entidad (context), no title_public stale.
    name: context.defaultTitle,
    scheduled_at,
    scheduled_until,
    duration_minutes,
    location_label: context.defaultLocation ?? cfg.location_label ?? null,
    cancha_label: context.defaultCancha ?? null,
    category_label: cfg.category_label ?? context.defaultCategory ?? null,
    rama_label: cfg.rama_label,
    capacity,
    confirmed_count: confirmed.length,
    entries: confirmed.map((e) => ({
      id: e.id,
      status: e.status,
      riviera_id: e.riviera_id,
      nombre: e.nombre,
      foto_url: e.foto_url,
      rating: e.rating,
      categoria: e.categoria,
    })),
    display_rating: cfg.display_rating,
    mode_type: context.mode,
    spots_left: Math.max(capacity - confirmed.length, 0),
  };
}
