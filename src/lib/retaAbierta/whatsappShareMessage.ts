import type { OpenGameModeType, OpenRegistrationPublicDto } from "./types";
import { convocatoriaProductHeadline } from "./modeWhitelist";
import { formatDueloHorarioRange } from "../duelo2v2/schedule";

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
 * Una sola línea compacta:
 * "jueves 16/7/2026, 5:00 p.m. · 120 min"
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

export const RIVIERA_WHATSAPP_MOTTO =
  "🎾 Todos los juegos cuentan: suman a tu ranking.";

/** Pie corto: evita 2 líneas extras que empujan el CTA a «Leer más». */
export const RIVIERA_WHATSAPP_FOOTER =
  "Riviera ID · todos los juegos cuentan.";

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

function formatOpenSlotsLine(openSlots: number): string | null {
  if (openSlots <= 0) return null;
  if (openSlots === 1) return "○ 1 disponible";
  return `○ ${openSlots} disponibles`;
}

/**
 * Mensaje WhatsApp Riviera: compacto para reducir «Leer más».
 * Meta en pocas líneas · enlace antes del roster · cupos en 1 línea · pie corto.
 */
export function buildRetaAbiertaWhatsAppMessage(opts: {
  dto: Pick<
    OpenRegistrationPublicDto,
    | "name"
    | "scheduled_at"
    | "scheduled_until"
    | "duration_minutes"
    | "location_label"
    | "cancha_label"
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
  canchaLabel?: string | null;
  /** Si false, omite la línea de lugar (clubes con sede fija). Default true. */
  includeLugar?: boolean;
  /** Texto libre de costo; solo si includeCosto. */
  costo?: string | null;
  /** Default false — el organizador activa en Detalles. */
  includeCosto?: boolean;
  /** Texto libre de premio; solo si includePremio. */
  premio?: string | null;
  /** Default false — el organizador activa en Detalles. */
  includePremio?: boolean;
  displayFullName?: boolean;
  productHeadline?: string;
}): string {
  const { dto, publicUrl } = opts;
  const displayFullName = opts.displayFullName !== false;
  const includeLugar = opts.includeLugar !== false;
  const includeCosto = opts.includeCosto === true;
  const includePremio = opts.includePremio === true;
  const costo = opts.costo?.trim() || "";
  const premio = opts.premio?.trim() || "";
  const mode = dto.mode_type || "reta";
  const headline = resolveHeadline(mode, opts.productHeadline);
  const confirmed = dto.entries.filter((e) => e.status === "confirmed");
  const { lugar, cancha } = resolveLugarYCancha({
    locationLabel: dto.location_label,
    canchaLabel: opts.canchaLabel ?? dto.cancha_label,
    clubName: opts.clubName,
  });

  const lines: string[] = [headline];

  const range =
    dto.scheduled_until &&
    formatDueloHorarioRange(dto.scheduled_at, dto.scheduled_until);
  if (range && dto.scheduled_at) {
    const d = new Date(dto.scheduled_at);
    const datePart = Number.isNaN(d.getTime())
      ? null
      : d.toLocaleString("es-MX", {
          weekday: "short",
          day: "numeric",
          month: "numeric",
        });
    lines.push(datePart ? `🗓️ ${datePart}, ${range}` : `🗓️ ${range}`);
  } else {
    lines.push(
      `🗓️ ${formatScheduledLabelCompact(dto.scheduled_at, dto.duration_minutes)}`
    );
  }

  const lugarParts: string[] = [];
  if (includeLugar && lugar) lugarParts.push(`📍 ${lugar}`);
  if (cancha) lugarParts.push(`🎾 ${cancha}`);
  if (lugarParts.length) lines.push(lugarParts.join(" · "));

  if (dto.rama_label?.trim()) lines.push(dto.rama_label.trim());

  const detailParts: string[] = [];
  if (dto.category_label?.trim()) {
    const cat = dto.category_label.trim();
    detailParts.push(
      cat.toLowerCase().startsWith("nivel") ? cat : `Nivel ${cat}`
    );
  }
  if (includeCosto && costo) detailParts.push(`💵 ${costo}`);
  if (includePremio && premio) detailParts.push(`🏆 ${premio}`);
  if (detailParts.length) lines.push(detailParts.join(" · "));

  // Enlace arriba del roster: queda visible aunque WhatsApp truncque con «Leer más».
  lines.push(publicUrl);

  if (mode === "americano") {
    lines.push(
      `${dto.confirmed_count} de ${dto.capacity} jugadores confirmados`
    );
  } else {
    for (const e of confirmed) {
      const name = displayNameForShare(e.nombre, displayFullName);
      const rating =
        dto.display_rating && e.rating != null
          ? ` (${Number(e.rating).toFixed(2)})`
          : "";
      lines.push(`✓ ${name}${rating}`);
    }
    const openSlots = Math.max(dto.capacity - confirmed.length, 0);
    const openLine = formatOpenSlotsLine(openSlots);
    if (openLine) lines.push(openLine);
  }

  lines.push(RIVIERA_WHATSAPP_FOOTER);

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
