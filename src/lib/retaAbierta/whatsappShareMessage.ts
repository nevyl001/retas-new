import type { OpenGameModeType, OpenRegistrationPublicDto } from "./types";
import { convocatoriaProductHeadline } from "./modeWhitelist";

/** Prefijo cancha legible (evita el "1" suelto en UI pública / WhatsApp). */
export function formatCanchaLabel(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^cancha\b/i.test(t)) return t;
  return `Cancha ${t}`;
}

function formatScheduledLabel(
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

/**
 * Mensaje WhatsApp único del servicio Convocatoria Riviera.
 * ASCII-safe (✓ / ○) para evitar caracteres rotos en algunos clientes.
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
  displayFullName?: boolean;
  productHeadline?: string;
}): string {
  const { dto, publicUrl } = opts;
  const displayFullName = opts.displayFullName !== false;
  const mode = dto.mode_type || "reta";
  const headline = resolveHeadline(mode, opts.productHeadline);
  const club = opts.clubName.trim() || "Club";
  const confirmed = dto.entries.filter((e) => e.status === "confirmed");
  const lines: string[] = [headline, "", club, ""];

  lines.push(formatScheduledLabel(dto.scheduled_at, dto.duration_minutes));

  const court = formatCanchaLabel(dto.location_label);
  if (court) lines.push(court);

  if (dto.rama_label?.trim()) lines.push(dto.rama_label.trim());
  if (dto.category_label?.trim()) {
    const cat = dto.category_label.trim();
    lines.push(cat.toLowerCase().startsWith("nivel") ? cat : `Nivel ${cat}`);
  }

  lines.push("");
  lines.push("Jugadores");

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
    for (let i = 0; i < openSlots; i++) {
      lines.push("○ Disponible");
    }
  }

  if (mode === "duelo_2v2" && dto.spots_left > 0) {
    lines.push("");
    lines.push(
      dto.spots_left === 1
        ? "Falta 1 jugador."
        : `Faltan ${dto.spots_left} jugadores.`
    );
  }

  lines.push("");
  lines.push("¿Quieres jugar?");
  lines.push("Entra aquí:");
  lines.push(publicUrl);
  lines.push("");
  lines.push("Solo necesitas tu Riviera ID.");

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
