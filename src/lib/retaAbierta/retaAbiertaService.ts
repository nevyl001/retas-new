import { supabase } from "../supabaseClient";
import {
  assertConvocatoriaAllowedMode,
  isConvocatoriaAllowedMode,
} from "./modeWhitelist";
import { normalizeRivieraIdLoose } from "./normalizeRivieraId";
import type {
  OpenGameModeType,
  OpenRegistrationConfigRow,
  OpenRegistrationJoinResult,
  OpenRegistrationOrganizerEntry,
  OpenRegistrationPreview,
  OpenRegistrationPublicDto,
  OpenRegistrationStatus,
} from "./types";

const CANCEL_TOKEN_KEY = "reta_abierta_cancel_token:";

/** Ruta canónica nueva; /reta-abierta/:slug se conserva por compatibilidad. */
export function buildRetaAbiertaPublicPath(slug: string): string {
  return `/jugar/${encodeURIComponent(slug.trim())}`;
}

export function buildLegacyRetaAbiertaPublicPath(slug: string): string {
  return `/reta-abierta/${encodeURIComponent(slug.trim())}`;
}

export function buildRetaAbiertaPublicUrl(slug: string): string {
  if (typeof window === "undefined") return buildRetaAbiertaPublicPath(slug);
  return `${window.location.origin}${buildRetaAbiertaPublicPath(slug)}`;
}

export function parseRetaAbiertaSlugFromPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const m =
    path.match(/^\/jugar\/([^/?#]+)/i) ||
    path.match(/^\/reta-abierta\/([^/?#]+)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

export function isRetaAbiertaPublicPath(pathname: string): boolean {
  return Boolean(parseRetaAbiertaSlugFromPath(pathname));
}

export function buildManageRegistrationPath(
  slug: string,
  token: string
): string {
  return `${buildRetaAbiertaPublicPath(slug)}?cancel=${encodeURIComponent(token)}`;
}

export function storeCancellationToken(
  slug: string,
  entryId: string,
  token: string
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${CANCEL_TOKEN_KEY}${slug}`,
      JSON.stringify({ entryId, token, savedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function loadCancellationToken(
  slug: string
): { entryId: string; token: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CANCEL_TOKEN_KEY}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { entryId?: string; token?: string };
    if (
      typeof parsed.entryId === "string" &&
      typeof parsed.token === "string" &&
      parsed.token.length >= 16
    ) {
      return { entryId: parsed.entryId, token: parsed.token };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearCancellationToken(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${CANCEL_TOKEN_KEY}${slug}`);
  } catch {
    /* ignore */
  }
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export function parsePublicDto(raw: unknown): OpenRegistrationPublicDto | null {
  const row = asRecord(raw);
  if (!row || row.ok !== true) return null;
  if (typeof row.slug !== "string") return null;
  const entityId =
    typeof row.entity_id === "string"
      ? row.entity_id
      : typeof row.tournament_id === "string"
        ? row.tournament_id
        : null;
  if (!entityId) return null;

  const modeRaw = typeof row.mode_type === "string" ? row.mode_type : "reta";
  const mode_type: OpenGameModeType =
    modeRaw === "americano" || modeRaw === "duelo_2v2" || modeRaw === "reta"
      ? modeRaw
      : "reta";

  const entriesRaw = Array.isArray(row.entries) ? row.entries : [];
  return {
    ok: true,
    slug: row.slug,
    mode_type,
    entity_id: entityId,
    registration_id:
      typeof row.registration_id === "string" ? row.registration_id : undefined,
    tournament_id:
      typeof row.tournament_id === "string" ? row.tournament_id : null,
    organizador_id: String(row.organizador_id ?? ""),
    name: String(row.name ?? "Convocatoria"),
    description: typeof row.description === "string" ? row.description : null,
    status: (row.status as OpenRegistrationStatus) || "open",
    capacity: Number(row.capacity) || 0,
    confirmed_count: Number(row.confirmed_count) || 0,
    waitlist_count: Number(row.waitlist_count) || 0,
    spots_left: Number(row.spots_left) || 0,
    waitlist_enabled: row.waitlist_enabled === true,
    approval_required: row.approval_required === true,
    registration_deadline:
      typeof row.registration_deadline === "string"
        ? row.registration_deadline
        : null,
    scheduled_at:
      typeof row.scheduled_at === "string" ? row.scheduled_at : null,
    duration_minutes:
      typeof row.duration_minutes === "number" ? row.duration_minutes : null,
    category_label:
      typeof row.category_label === "string" ? row.category_label : null,
    rama_label: typeof row.rama_label === "string" ? row.rama_label : null,
    location_label:
      typeof row.location_label === "string" ? row.location_label : null,
    display_rating: row.display_rating !== false,
    display_photo: row.display_photo !== false,
    entries: entriesRaw
      .map((e) => {
        const er = asRecord(e);
        if (!er || typeof er.id !== "string") return null;
        return {
          id: er.id,
          status: (er.status as OpenRegistrationPublicDto["entries"][0]["status"]) ||
            "confirmed",
          riviera_id: String(er.riviera_id ?? ""),
          nombre: String(er.nombre ?? "Jugador"),
          foto_url: typeof er.foto_url === "string" ? er.foto_url : null,
          rating: typeof er.rating === "number" ? er.rating : null,
          categoria: typeof er.categoria === "string" ? er.categoria : null,
        };
      })
      .filter(Boolean) as OpenRegistrationPublicDto["entries"],
    is_finished: row.is_finished === true,
    is_started: row.is_started === true,
  };
}

/** Garantiza que el DTO público no exponga campos sensibles filtrados por error. */
export function assertPublicDtoPrivacy(dto: OpenRegistrationPublicDto): string[] {
  const leaks: string[] = [];
  const json = JSON.stringify(dto);
  for (const key of [
    "email",
    "telefono",
    "whatsapp",
    "user_id",
    "cancellation_token",
    "cancellation_token_hash",
  ]) {
    if (json.includes(`"${key}"`)) leaks.push(key);
  }
  return leaks;
}

export async function fetchOpenRegistrationPublic(
  slug: string
): Promise<
  | { ok: true; dto: OpenRegistrationPublicDto }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc(
    "get_tournament_open_registration_public",
    { p_slug: slug.trim() }
  );
  if (error) return { ok: false, error: error.message };
  const row = asRecord(data);
  if (row?.ok === false) {
    return { ok: false, error: String(row.error ?? "not_found") };
  }
  const dto = parsePublicDto(data);
  if (!dto) return { ok: false, error: "invalid_payload" };
  return { ok: true, dto };
}

export async function previewRivieraIdForOpenRegistration(
  slug: string,
  rivieraIdInput: string
): Promise<
  | { ok: true; preview: OpenRegistrationPreview }
  | { ok: false; error: string; riviera_id?: string }
> {
  const normalized = normalizeRivieraIdLoose(rivieraIdInput);
  if (!normalized) return { ok: false, error: "invalid_riviera_id" };

  const { data, error } = await supabase.rpc(
    "preview_riviera_id_for_open_registration",
    { p_slug: slug.trim(), p_riviera_id: normalized }
  );
  if (error) return { ok: false, error: error.message };
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    return {
      ok: false,
      error: String(row?.error ?? "riviera_id_not_found"),
      riviera_id: typeof row?.riviera_id === "string" ? row.riviera_id : normalized,
    };
  }
  return {
    ok: true,
    preview: {
      ok: true,
      riviera_id: String(row.riviera_id),
      jugador_id: String(row.jugador_id),
      nombre: String(row.nombre ?? ""),
      foto_url: typeof row.foto_url === "string" ? row.foto_url : null,
      rating: typeof row.rating === "number" ? row.rating : null,
      categoria: typeof row.categoria === "string" ? row.categoria : null,
      club_origen_id:
        typeof row.club_origen_id === "string" ? row.club_origen_id : null,
    },
  };
}

export async function joinOpenRegistration(
  slug: string,
  rivieraIdInput: string
): Promise<
  | { ok: true; result: OpenRegistrationJoinResult }
  | { ok: false; error: string; status?: string }
> {
  const normalized = normalizeRivieraIdLoose(rivieraIdInput);
  if (!normalized) return { ok: false, error: "invalid_riviera_id" };

  const { data, error } = await supabase.rpc(
    "join_tournament_open_registration",
    { p_slug: slug.trim(), p_riviera_id: normalized }
  );
  if (error) return { ok: false, error: error.message };
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    return {
      ok: false,
      error: String(row?.error ?? "join_failed"),
      status: typeof row?.status === "string" ? row.status : undefined,
    };
  }
  const result: OpenRegistrationJoinResult = {
    ok: true,
    entry_id: String(row.entry_id),
    status: row.status as OpenRegistrationJoinResult["status"],
    riviera_id: String(row.riviera_id),
    nombre: String(row.nombre ?? ""),
    cancellation_token: String(row.cancellation_token ?? ""),
    message: String(row.message ?? "Registrado."),
  };
  if (result.cancellation_token) {
    storeCancellationToken(slug, result.entry_id, result.cancellation_token);
  }
  return { ok: true, result };
}

export async function cancelOpenRegistration(
  slug: string,
  cancellationToken: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc(
    "cancel_tournament_open_registration",
    {
      p_slug: slug.trim(),
      p_cancellation_token: cancellationToken.trim(),
    }
  );
  if (error) return { ok: false, error: error.message };
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    return { ok: false, error: String(row?.error ?? "cancel_failed") };
  }
  clearCancellationToken(slug);
  return {
    ok: true,
    message: String(row.message ?? "Inscripción cancelada."),
  };
}

export async function fetchOpenRegistrationConfig(
  tournamentId: string
): Promise<OpenRegistrationConfigRow | null> {
  return fetchOpenGameRegistrationConfig("reta", tournamentId);
}

export async function fetchOpenGameRegistrationConfig(
  mode: OpenGameModeType,
  entityId: string
): Promise<OpenRegistrationConfigRow | null> {
  const { data, error } = await supabase
    .from("tournament_open_registration")
    .select("*")
    .eq("mode_type", mode)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!error && data) return data as OpenRegistrationConfigRow;

  // Compat: filas v1 solo con tournament_id
  if (mode === "reta" || mode === "americano") {
    const fallback = await supabase
      .from("tournament_open_registration")
      .select("*")
      .eq("tournament_id", entityId)
      .maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return fallback.data as OpenRegistrationConfigRow;
  }
  return null;
}

export type UpsertOpenRegistrationInput = {
  tournamentId?: string;
  mode?: OpenGameModeType;
  entityId?: string;
  enabled?: boolean;
  status?: OpenRegistrationStatus;
  capacity?: number;
  waitlistEnabled?: boolean;
  approvalRequired?: boolean;
  registrationDeadline?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  categoryLabel?: string | null;
  locationLabel?: string | null;
  titlePublic?: string | null;
  ramaLabel?: string | null;
  displayRating?: boolean;
  displayPhoto?: boolean;
  displayFullName?: boolean;
};

export async function upsertOpenRegistrationConfig(
  input: UpsertOpenRegistrationInput
): Promise<OpenRegistrationConfigRow> {
  const mode = input.mode ?? "reta";
  const entityId = input.entityId ?? input.tournamentId;
  if (!entityId) throw new Error("entityId requerido");
  assertConvocatoriaAllowedMode(mode);

  const { data, error } = await supabase.rpc("upsert_open_game_registration", {
    p_mode_type: mode,
    p_entity_id: entityId,
    p_enabled: input.enabled ?? null,
    p_status: input.status ?? null,
    p_capacity: input.capacity ?? null,
    p_waitlist_enabled: input.waitlistEnabled ?? null,
    p_approval_required: input.approvalRequired ?? null,
    p_registration_deadline: input.registrationDeadline ?? null,
    p_scheduled_at: input.scheduledAt ?? null,
    p_duration_minutes: input.durationMinutes ?? null,
    p_category_label: input.categoryLabel ?? null,
    p_location_label: input.locationLabel ?? null,
    p_display_rating: input.displayRating ?? null,
    p_display_photo: input.displayPhoto ?? null,
    p_display_full_name: input.displayFullName ?? null,
    p_title_public: input.titlePublic ?? null,
    p_rama_label: input.ramaLabel ?? null,
  });

  if (error) {
    // Fallback a RPC v1 si la generalización aún no está aplicada
    if (mode === "reta" || mode === "americano") {
      const legacy = await supabase.rpc("upsert_tournament_open_registration", {
        p_tournament_id: entityId,
        p_enabled: input.enabled ?? null,
        p_status: input.status ?? null,
        p_capacity: input.capacity ?? null,
        p_waitlist_enabled: input.waitlistEnabled ?? null,
        p_approval_required: input.approvalRequired ?? null,
        p_registration_deadline: input.registrationDeadline ?? null,
        p_scheduled_at: input.scheduledAt ?? null,
        p_duration_minutes: input.durationMinutes ?? null,
        p_category_label: input.categoryLabel ?? null,
        p_location_label: input.locationLabel ?? null,
        p_display_rating: input.displayRating ?? null,
        p_display_photo: input.displayPhoto ?? null,
        p_display_full_name: input.displayFullName ?? null,
      });
      if (legacy.error) throw new Error(legacy.error.message);
      return legacy.data as OpenRegistrationConfigRow;
    }
    throw new Error(error.message);
  }
  return data as OpenRegistrationConfigRow;
}

/**
 * Cierra la convocatoria al iniciar el juego.
 * Idempotente: si no hay fila, no falla ni crea una nueva.
 * Best-effort: errores de red no deben bloquear el inicio del partido.
 */
export async function closeOpenGameRegistration(
  mode: OpenGameModeType,
  entityId: string
): Promise<void> {
  if (!entityId.trim() || !isConvocatoriaAllowedMode(mode)) return;
  try {
    const { error } = await supabase.rpc("close_open_game_registration", {
      p_mode_type: mode,
      p_entity_id: entityId,
    });
    if (!error) return;

    // Fallback sin crear fila nueva: solo cierra si ya existe convocatoria
    const existing = await fetchOpenGameRegistrationConfig(mode, entityId);
    if (!existing) return;
    await upsertOpenRegistrationConfig({
      mode,
      entityId,
      enabled: true,
      status: "closed",
    });
  } catch {
    /* no bloquear inicio del juego */
  }
}

export async function listOpenRegistrationEntries(
  tournamentId: string
): Promise<OpenRegistrationOrganizerEntry[]> {
  return listOpenGameRegistrationEntries("reta", tournamentId);
}

export async function listOpenGameRegistrationEntries(
  mode: OpenGameModeType,
  entityId: string
): Promise<OpenRegistrationOrganizerEntry[]> {
  const { data, error } = await supabase.rpc(
    "list_open_game_registration_entries",
    { p_mode_type: mode, p_entity_id: entityId }
  );
  if (!error && Array.isArray(data)) {
    return data as OpenRegistrationOrganizerEntry[];
  }

  if (mode === "reta" || mode === "americano") {
    const legacy = await supabase.rpc(
      "list_tournament_open_registration_entries",
      { p_tournament_id: entityId }
    );
    if (legacy.error) throw new Error(legacy.error.message);
    if (!Array.isArray(legacy.data)) return [];
    return legacy.data as OpenRegistrationOrganizerEntry[];
  }
  if (error) throw new Error(error.message);
  return [];
}

export async function promoteOpenRegistrationEntry(
  entryId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc(
    "promote_tournament_open_registration_entry",
    { p_entry_id: entryId }
  );
  if (error) return { ok: false, error: error.message };
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    return { ok: false, error: String(row?.error ?? "promote_failed") };
  }
  return { ok: true };
}

export async function removeOpenRegistrationEntry(
  entryId: string,
  _entityId: string
): Promise<void> {
  const { error } = await supabase
    .from("tournament_open_registration_entries")
    .update({
      status: "removed",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cancellation_token_hash: null,
    })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}

export function mapJoinErrorMessage(error: string): string {
  switch (error) {
    case "riviera_id_not_found":
      return "No encontramos este Riviera ID.";
    case "invalid_riviera_id":
      return "El Riviera ID no tiene un formato válido (RIV-00000001).";
    case "already_registered":
      return "Ya estás inscrito en esta reta.";
    case "full":
      return "La reta está completa y no hay lista de espera.";
    case "registration_closed":
      return "Las inscripciones están cerradas.";
    case "registration_paused":
      return "Las inscripciones están pausadas temporalmente.";
    case "registration_cancelled":
      return "Esta convocatoria fue cancelada.";
    case "deadline_passed":
      return "La fecha límite de inscripción ya pasó.";
    case "tournament_unavailable":
      return "Esta reta ya no está disponible.";
    case "not_found":
      return "No encontramos esta convocatoria.";
    default:
      return "No se pudo completar la inscripción. Intenta de nuevo.";
  }
}
