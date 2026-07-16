import type { OpenGameModeType, OpenRegistrationPublicDto } from "./types";
import { convocatoriaProductHeadline } from "./modeWhitelist";

/** Prefijo cancha legible (evita el "1" suelto en UI pública / WhatsApp). */
export function formatCanchaLabel(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^cancha\b/i.test(t)) return t;
  return `Cancha ${t}`;
}

/** Valores legacy donde location_label guardaba solo el número de cancha. */
export function looksLikeCanchaOnly(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim();
  if (!t) return false;
  if (/^\d{1,2}$/.test(t)) return true;
  if (/^cancha\s*\d{1,2}$/i.test(t)) return true;
  return false;
}

/**
 * Separa lugar (sede) y cancha para el mensaje de convocatoria.
 * Compat: si location_label era solo "1"/"Cancha 1", se trata como cancha
 * y el lugar cae al nombre del club.
 */
export function resolveLugarYCancha(opts: {
  locationLabel?: string | null;
  canchaLabel?: string | null;
  clubName?: string | null;
}): { lugar: string | null; cancha: string | null } {
  const club = (opts.clubName ?? "").trim() || null;
  const loc = (opts.locationLabel ?? "").trim() || null;
  const canchaExplicit = formatCanchaLabel(opts.canchaLabel);

  if (canchaExplicit) {
    if (loc && !looksLikeCanchaOnly(loc)) {
      return { lugar: loc, cancha: canchaExplicit };
    }
    return { lugar: club, cancha: canchaExplicit };
  }

  if (loc && looksLikeCanchaOnly(loc)) {
    return { lugar: club, cancha: formatCanchaLabel(loc) };
  }

  return { lugar: loc || club, cancha: null };
}

/** Formato largo (UI pública). */
export function formatScheduledLabel(
  iso: string | null,
  durationMinutes: number | null
): string {
  if (!iso) return "Fecha por confirmar";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Fecha por confirmar";
  const datePart = d.toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  if (durationMinutes && durationMinutes > 0) {
    return `${datePart}\n${durationMinutes} minutos`;
  }
  return datePart;
}

/**
 * Una sola línea compacta para WhatsApp:
 * "domingo 12/7/2026, 11:00 a.m. · 90 min"
 */
export function formatScheduledLabelCompact(
  iso: string | null,
  durationMinutes: number | null
): string {
  if (!iso) return "Fecha por confirmar";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Fecha por confirmar";

  const weekday = d.toLocaleString("es-MX", { weekday: "long" });
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const time = d.toLocaleString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
  const base = `${weekday} ${day}/${month}/${year}, ${time}`;
  if (durationMinutes && durationMinutes > 0) {
    return `${base} · ${durationMinutes} min`;
  }
  return base;
}

function displayNameForShare(nombre: string, displayFullName: boolean): string {
  const t = nombre.trim();
  if (displayFullName || !t) return t || "Jugador";
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

function resolveHeadline(
  mode: OpenGameModeType,
  productHeadline?: string
): string {
  const custom = productHeadline?.trim();
  if (custom) return custom.toUpperCase();
  return convocatoriaProductHeadline({ mode });
}

function formatNivelOrRatingLine(opts: {
  categoryLabel?: string | null;
  ramaLabel?: string | null;
  displayRating: boolean;
  ratings: number[];
}): string | null {
  const cat = opts.categoryLabel?.trim();
  if (cat) {
    return cat.toLowerCase().startsWith("nivel") ? cat : cat;
  }
  const rama = opts.ramaLabel?.trim();
  if (rama) return rama;
  if (opts.displayRating && opts.ratings.length > 0) {
    const min = Math.min(...opts.ratings);
    const max = Math.max(...opts.ratings);
    if (min === max) return min.toFixed(2);
    return `${min.toFixed(2)} - ${max.toFixed(2)}`;
  }
  return null;
}

/**
 * Mensaje WhatsApp compacto (estilo convocatoria corta):
 * título, horario, lugar, cancha, nivel, jugadores, link.
 */
export function buildRetaAbiertaWhatsAppMessage(opts: {
  dto: Pick<
    OpenRegistrationPublicDto,
    | "name"
    | "scheduled_at"
    | "duration_minutes"
    | "location_label"
    | "category_label"
    | "rama_label"
    | "capacity"
    | "confirmed_count"
    | "entries"
    | "display_rating"
    | "mode_type"
    | "spots_left"
  >;
  publicUrl: string;
  clubName: string;
  /** Número o etiqueta de cancha (separado del lugar). */
  canchaLabel?: string | null;
  displayFullName?: boolean;
  productHeadline?: string;
}): string {
  const { dto, publicUrl } = opts;
  const displayFullName = opts.displayFullName !== false;
  const mode = dto.mode_type || "reta";
  const headline = resolveHeadline(mode, opts.productHeadline);
  const confirmed = dto.entries.filter((e) => e.status === "confirmed");
  const { lugar, cancha } = resolveLugarYCancha({
    locationLabel: dto.location_label,
    canchaLabel: opts.canchaLabel,
    clubName: opts.clubName,
  });

  const ratings = confirmed
    .map((e) => (e.rating != null ? Number(e.rating) : NaN))
    .filter((n) => Number.isFinite(n));

  const lines: string[] = [headline];

  lines.push(
    `📅 ${formatScheduledLabelCompact(dto.scheduled_at, dto.duration_minutes)}`
  );

  if (lugar) lines.push(`📍 ${lugar}`);
  if (cancha) lines.push(`🏸 ${cancha}`);

  const nivelLine = formatNivelOrRatingLine({
    categoryLabel: dto.category_label,
    ramaLabel: dto.rama_label,
    displayRating: dto.display_rating,
    ratings,
  });
  if (nivelLine) lines.push(`📊 ${nivelLine}`);

  if (mode === "americano") {
    lines.push(
      `👥 ${dto.confirmed_count}/${dto.capacity} confirmados`
    );
  } else {
    for (const e of confirmed) {
      const name = displayNameForShare(e.nombre, displayFullName);
      const rating =
        dto.display_rating && e.rating != null
          ? ` (${Number(e.rating).toFixed(2)})`
          : "";
      lines.push(`✅ ${name}${rating}`);
    }
    const openSlots = Math.max(dto.capacity - confirmed.length, 0);
    for (let i = 0; i < openSlots; i++) {
      lines.push("⚪ ??");
    }
  }

  lines.push("");
  lines.push(publicUrl);

  return lines.join("\n");
}

export function buildRequestRivieraIdWhatsAppMessage(retaName: string): string {
  const name = retaName.trim() || "la dinámica";
  return `Hola, quiero entrar a ${name}, pero todavía no tengo Riviera ID. ¿Me ayudan a generarlo?`;
}

export function buildWhatsAppShareUrl(
  phoneE164Digits: string,
  text: string
): string {
  const phone = phoneE164Digits.replace(/\D/g, "");
  const q = encodeURIComponent(text);
  if (!phone) return `https://wa.me/?text=${q}`;
  return `https://wa.me/${phone}?text=${q}`;
}

/** ISO → valor datetime-local en zona del dispositivo. */
export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
