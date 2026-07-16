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
  duration_minutes: number | null;
  location_label: string | null;
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

  return {
    name: cfg.title_public?.trim() || context.defaultTitle,
    scheduled_at: cfg.scheduled_at ?? context.defaultScheduledAt ?? null,
    duration_minutes:
      cfg.duration_minutes ?? context.defaultDurationMinutes ?? 90,
    location_label: cfg.location_label ?? context.defaultLocation ?? null,
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
