import { fetchRivieraJugadorProfilesByIds } from "../rivieraJugadores/publicPlayerAvatars";
import { supabase } from "../supabaseClient";
import { mapConvocatoriaUserError } from "./convocatoriaErrors";
import {
  assertConvocatoriaAllowedMode,
  isConvocatoriaAllowedMode,
} from "./modeWhitelist";
import { normalizeRivieraIdLoose } from "./normalizeRivieraId";
import { storePreferredSide } from "./preferredSideStorage";
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

export type StoredCancellationEntry = {
  entryId: string;
  token: string;
  nombre?: string;
  rivieraId?: string;
  savedAt: number;
};

export function storeCancellationToken(
  slug: string,
  entryId: string,
  token: string,
  meta?: { nombre?: string; rivieraId?: string }
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadAllCancellationTokens(slug);
    const next: StoredCancellationEntry = {
      entryId,
      token,
      nombre: meta?.nombre,
      rivieraId: meta?.rivieraId,
      savedAt: Date.now(),
    };
    const merged = [
      ...existing.filter((e) => e.entryId !== entryId && e.token !== token),
      next,
    ];
    localStorage.setItem(
      `${CANCEL_TOKEN_KEY}${slug}`,
      JSON.stringify({ entries: merged, savedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function loadAllCancellationTokens(
  slug: string
): StoredCancellationEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${CANCEL_TOKEN_KEY}${slug}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      entries?: unknown;
      entryId?: string;
      token?: string;
      nombre?: string;
      rivieraId?: string;
      savedAt?: number;
    };
    if (Array.isArray(parsed.entries)) {
      return parsed.entries
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const o = item as Record<string, unknown>;
          if (
            typeof o.entryId !== "string" ||
            typeof o.token !== "string" ||
            o.token.length < 16
          ) {
            return null;
          }
          return {
            entryId: o.entryId,
            token: o.token,
            nombre: typeof o.nombre === "string" ? o.nombre : undefined,
            rivieraId: typeof o.rivieraId === "string" ? o.rivieraId : undefined,
            savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now(),
          } satisfies StoredCancellationEntry;
        })
        .filter(Boolean) as StoredCancellationEntry[];
    }
    // Compat: formato legacy de un solo token
    if (
      typeof parsed.entryId === "string" &&
      typeof parsed.token === "string" &&
      parsed.token.length >= 16
    ) {
      return [
        {
          entryId: parsed.entryId,
          token: parsed.token,
          nombre: typeof parsed.nombre === "string" ? parsed.nombre : undefined,
          rivieraId:
            typeof parsed.rivieraId === "string" ? parsed.rivieraId : undefined,
          savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
        },
      ];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function loadCancellationToken(
  slug: string
): { entryId: string; token: string } | null {
  const all = loadAllCancellationTokens(slug);
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  return { entryId: last.entryId, token: last.token };
}

export function clearCancellationToken(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${CANCEL_TOKEN_KEY}${slug}`);
  } catch {
    /* ignore */
  }
}

export function removeCancellationToken(
  slug: string,
  entryId: string
): void {
  if (typeof window === "undefined") return;
  try {
    const rest = loadAllCancellationTokens(slug).filter(
      (e) => e.entryId !== entryId
    );
    if (rest.length === 0) {
      clearCancellationToken(slug);
      return;
    }
    localStorage.setItem(
      `${CANCEL_TOKEN_KEY}${slug}`,
      JSON.stringify({ entries: rest, savedAt: Date.now() })
    );
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
    scheduled_until:
      typeof row.scheduled_until === "string" ? row.scheduled_until : null,
    duration_minutes:
      typeof row.duration_minutes === "number" ? row.duration_minutes : null,
    category_label:
      typeof row.category_label === "string" ? row.category_label : null,
    rama_label: typeof row.rama_label === "string" ? row.rama_label : null,
    location_label:
      typeof row.location_label === "string" ? row.location_label : null,
    cancha_label:
      typeof row.cancha_label === "string" ? row.cancha_label : null,
    tournament_format:
      typeof row.tournament_format === "string" && row.tournament_format.trim()
        ? row.tournament_format.trim()
        : row.tournament_format === null
          ? null
          : undefined,
    championship_enabled:
      typeof row.championship_enabled === "boolean"
        ? row.championship_enabled
        : undefined,
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
          riviera_jugador_id:
            typeof er.riviera_jugador_id === "string" && er.riviera_jugador_id.trim()
              ? er.riviera_jugador_id.trim()
              : null,
          nombre: String(er.nombre ?? "Jugador"),
          foto_url: typeof er.foto_url === "string" ? er.foto_url : null,
          rating: typeof er.rating === "number" ? er.rating : null,
          categoria: typeof er.categoria === "string" ? er.categoria : null,
          preferred_side: (() => {
            const raw = er.preferred_side;
            if (raw === "A" || raw === "B") return raw;
            if (typeof raw === "string") {
              const u = raw.trim().toUpperCase();
              if (u === "A" || u === "B") return u as "A" | "B";
            }
            return null;
          })(),
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

/**
 * Completa foto_url de confirmados cuando el local cedido no trae imagen
 * (misma resolución canónica que bracket / duelo público).
 */
const publicEntryFotoCache = new Map<string, string>();

/** Solo tests. */
export function clearPublicEntryFotoCacheForTests(): void {
  publicEntryFotoCache.clear();
}

function publicEntryFotoCacheKey(slug: string, rivieraId: string): string {
  return `${slug.trim()}::${rivieraId.trim().toUpperCase()}`;
}

export async function enrichPublicEntryPhotos(
  dto: OpenRegistrationPublicDto
): Promise<OpenRegistrationPublicDto> {
  if (!dto.display_photo || dto.entries.length === 0) return dto;

  const needsPhoto = dto.entries.filter(
    (e) => !(typeof e.foto_url === "string" && e.foto_url.trim())
  );
  if (needsPhoto.length === 0) return dto;

  const fotoByEntryId = new Map<string, string>();

  for (const entry of needsPhoto) {
    const rivieraId = entry.riviera_id?.trim();
    if (!rivieraId) continue;
    const cached = publicEntryFotoCache.get(
      publicEntryFotoCacheKey(dto.slug, rivieraId)
    );
    if (cached) fotoByEntryId.set(entry.id, cached);
  }

  const stillNeedAfterCache = needsPhoto.filter((e) => !fotoByEntryId.has(e.id));

  const idsForRpc = stillNeedAfterCache
    .map((e) => e.riviera_jugador_id?.trim() || null)
    .filter((id): id is string => Boolean(id));

  if (idsForRpc.length > 0 && dto.organizador_id.trim()) {
    try {
      const profiles = await fetchRivieraJugadorProfilesByIds(idsForRpc, {
        publicOnly: true,
        organizadorId: dto.organizador_id,
      });
      for (const entry of stillNeedAfterCache) {
        const rjId = entry.riviera_jugador_id?.trim();
        if (!rjId) continue;
        const foto = profiles.get(rjId)?.fotoUrl?.trim();
        if (foto) {
          fotoByEntryId.set(entry.id, foto);
          const rivieraId = entry.riviera_id?.trim();
          if (rivieraId) {
            publicEntryFotoCache.set(
              publicEntryFotoCacheKey(dto.slug, rivieraId),
              foto
            );
          }
        }
      }
    } catch {
      /* fallback abajo */
    }
  }

  const stillMissing = stillNeedAfterCache.filter((e) => !fotoByEntryId.has(e.id));
  if (stillMissing.length > 0) {
    const previewRows = await Promise.all(
      stillMissing.map(async (entry) => {
        const rivieraId = entry.riviera_id?.trim();
        if (!rivieraId) return null;
        try {
          const res = await previewRivieraIdForOpenRegistration(
            dto.slug,
            rivieraId
          );
          if (!res.ok) return null;
          return {
            entryId: entry.id,
            rivieraId,
            foto: res.preview.foto_url?.trim() || null,
            jugadorId: res.preview.jugador_id?.trim() || null,
          };
        } catch {
          return null;
        }
      })
    );

    const jugadorIds: string[] = [];
    const entryByJugador = new Map<string, string[]>();
    for (const row of previewRows) {
      if (!row) continue;
      if (row.foto) {
        fotoByEntryId.set(row.entryId, row.foto);
        publicEntryFotoCache.set(
          publicEntryFotoCacheKey(dto.slug, row.rivieraId),
          row.foto
        );
        continue;
      }
      if (row.jugadorId) {
        jugadorIds.push(row.jugadorId);
        const list = entryByJugador.get(row.jugadorId) ?? [];
        list.push(row.entryId);
        entryByJugador.set(row.jugadorId, list);
      }
    }

    if (jugadorIds.length > 0 && dto.organizador_id.trim()) {
      try {
        const profiles = await fetchRivieraJugadorProfilesByIds(jugadorIds, {
          publicOnly: true,
          organizadorId: dto.organizador_id,
        });
        entryByJugador.forEach((entryIds, jugadorId) => {
          const foto = profiles.get(jugadorId)?.fotoUrl?.trim();
          if (!foto) return;
          entryIds.forEach((entryId) => {
            fotoByEntryId.set(entryId, foto);
            const entry = stillMissing.find((e) => e.id === entryId);
            const rivieraId = entry?.riviera_id?.trim();
            if (rivieraId) {
              publicEntryFotoCache.set(
                publicEntryFotoCacheKey(dto.slug, rivieraId),
                foto
              );
            }
          });
        });
      } catch {
        /* ignore */
      }
    }
  }

  if (fotoByEntryId.size === 0) return dto;

  return {
    ...dto,
    entries: dto.entries.map((e) => {
      const foto = fotoByEntryId.get(e.id);
      if (!foto) return e;
      return { ...e, foto_url: foto };
    }),
  };
}

/**
 * Si el RPC aún no expone formato/championship, completa desde
 * tournament_public_config / tournaments (lectura anon) para el eyebrow de /jugar.
 */
export async function enrichPublicProductMeta(
  dto: OpenRegistrationPublicDto
): Promise<OpenRegistrationPublicDto> {
  if (dto.mode_type === "duelo_2v2") return dto;
  if (
    dto.tournament_format !== undefined &&
    dto.championship_enabled !== undefined
  ) {
    return dto;
  }

  let tournament_format = dto.tournament_format;
  let championship_enabled = dto.championship_enabled;

  try {
    const { getTournamentPublicConfigExtended } = await import("../database");
    const cfg = await getTournamentPublicConfigExtended(dto.entity_id);
    if (cfg) {
      if (tournament_format === undefined) {
        tournament_format =
          cfg.format === "round_robin" || cfg.format === "teams"
            ? cfg.format
            : null;
      }
      if (championship_enabled === undefined) {
        const champRaw = cfg.championship_config;
        championship_enabled =
          champRaw &&
          typeof champRaw === "object" &&
          (champRaw as { championshipEnabled?: unknown })
            .championshipEnabled === true;
      }
    }
  } catch {
    /* seguir con tournaments */
  }

  // Round Robin suele vivir en tournaments.format (public_config se usa más en equipos).
  if (tournament_format === undefined || tournament_format === null) {
    try {
      const { data } = await supabase
        .from("tournaments")
        .select("format")
        .eq("id", dto.entity_id)
        .maybeSingle();
      const fmt = typeof data?.format === "string" ? data.format.trim() : "";
      if (fmt === "round_robin" || fmt === "teams") {
        tournament_format = fmt;
      } else if (tournament_format === undefined) {
        tournament_format = null;
      }
    } catch {
      if (tournament_format === undefined) tournament_format = null;
    }
  }

  if (championship_enabled === undefined) {
    championship_enabled = false;
  }

  return {
    ...dto,
    tournament_format,
    championship_enabled,
  };
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
  const withMeta = await enrichPublicProductMeta(dto);
  const withPhotos = await enrichPublicEntryPhotos(withMeta);
  return { ok: true, dto: withPhotos };
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
  rivieraIdInput: string,
  preferredSide?: "A" | "B" | null
): Promise<
  | { ok: true; result: OpenRegistrationJoinResult }
  | { ok: false; error: string; status?: string }
> {
  const normalized = normalizeRivieraIdLoose(rivieraIdInput);
  if (!normalized) return { ok: false, error: "invalid_riviera_id" };

  const side =
    preferredSide === "A" || preferredSide === "B" ? preferredSide : null;

  const params: Record<string, string> = {
    p_slug: slug.trim(),
    p_riviera_id: normalized,
  };
  if (side) {
    params.p_preferred_side = side;
  }

  const { data, error } = await supabase.rpc(
    "join_tournament_open_registration",
    params
  );

  if (error) {
    const msg = error.message || "";
    if (
      side &&
      /preferred_side|PGRST202|Could not find the function|function.*does not exist|column.*does not exist/i.test(
        msg
      )
    ) {
      return { ok: false, error: "preferred_side_unavailable" };
    }
    return { ok: false, error: msg };
  }
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    return {
      ok: false,
      error: String(row?.error ?? "join_failed"),
      status: typeof row?.status === "string" ? row.status : undefined,
    };
  }

  const savedSideRaw = row.preferred_side;
  const savedSide =
    savedSideRaw === "A" || savedSideRaw === "B"
      ? savedSideRaw
      : typeof savedSideRaw === "string" &&
          (savedSideRaw.toUpperCase() === "A" ||
            savedSideRaw.toUpperCase() === "B")
        ? (savedSideRaw.toUpperCase() as "A" | "B")
        : null;

  // Si el jugador eligió lado, el servidor debe devolverlo (SQL patch aplicado).
  if (side && savedSide !== side) {
    return { ok: false, error: "preferred_side_unavailable" };
  }

  const result: OpenRegistrationJoinResult = {
    ok: true,
    entry_id: String(row.entry_id),
    status: row.status as OpenRegistrationJoinResult["status"],
    riviera_id: String(row.riviera_id),
    nombre: String(row.nombre ?? ""),
    cancellation_token: String(row.cancellation_token ?? ""),
    message: String(row.message ?? "Registrado."),
    preferred_side: savedSide,
  };
  if (result.cancellation_token) {
    storeCancellationToken(slug, result.entry_id, result.cancellation_token, {
      nombre: result.nombre,
      rivieraId: result.riviera_id,
    });
  }
  if (result.preferred_side === "A" || result.preferred_side === "B") {
    storePreferredSide(slug, result.entry_id, result.preferred_side);
  }
  return { ok: true, result };
}

export async function cancelOpenRegistration(
  slug: string,
  cancellationToken: string,
  entryId?: string
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
  if (entryId) {
    removeCancellationToken(slug, entryId);
  } else {
    const match = loadAllCancellationTokens(slug).find(
      (e) => e.token === cancellationToken.trim()
    );
    if (match) removeCancellationToken(slug, match.entryId);
    else clearCancellationToken(slug);
  }
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
  // Solo RPC admin: el SELECT directo a tournament_open_registration
  // provoca 403 (RLS / sin superficie cliente). No hay fallback .from().
  const { data, error } = await supabase.rpc("get_open_game_registration", {
    p_mode_type: mode,
    p_entity_id: entityId,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return data as OpenRegistrationConfigRow;
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

export const OPEN_REG_CAPACITY_MIN = 1;
export const OPEN_REG_CAPACITY_MAX = 64;

export type SetCapacityResult =
  | {
      ok: true;
      capacity: number;
      confirmed_count: number;
      spots_left: number;
      promoted_count: number;
    }
  | {
      ok: false;
      error: string;
      message: string;
      confirmed_count?: number;
      requested_capacity?: number;
    };

/** Ajusta cupo en vivo (reta/americano). Rechaza duelo_2v2 en backend. */
export async function setOpenGameRegistrationCapacity(
  mode: OpenGameModeType,
  entityId: string,
  capacity: number
): Promise<SetCapacityResult> {
  assertConvocatoriaAllowedMode(mode);
  const { data, error } = await supabase.rpc(
    "set_open_game_registration_capacity",
    {
      p_mode_type: mode,
      p_entity_id: entityId,
      p_capacity: capacity,
    }
  );
  if (error) {
    return {
      ok: false,
      error: "rpc_error",
      message: mapConvocatoriaUserError(error, "action"),
    };
  }
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    return {
      ok: false,
      error: String(row?.error ?? "set_capacity_failed"),
      message:
        typeof row?.message === "string" && row.message.trim()
          ? row.message.trim()
          : row?.error === "capacity_locked"
            ? "El cupo del duelo 2 vs 2 es fijo (4 jugadores)."
            : row?.error === "capacity_below_confirmed"
              ? `Ya hay ${Number(row.confirmed_count) || "?"} confirmados. Saca inscritos en «Administrar inscritos» antes de bajar el cupo.`
              : row?.error === "capacity_out_of_range"
                ? `El cupo debe estar entre ${OPEN_REG_CAPACITY_MIN} y ${OPEN_REG_CAPACITY_MAX}.`
                : "No pudimos actualizar el cupo. Intenta de nuevo.",
      confirmed_count:
        typeof row?.confirmed_count === "number"
          ? row.confirmed_count
          : undefined,
      requested_capacity:
        typeof row?.requested_capacity === "number"
          ? row.requested_capacity
          : undefined,
    };
  }
  return {
    ok: true,
    capacity: Number(row.capacity) || capacity,
    confirmed_count: Number(row.confirmed_count) || 0,
    spots_left: Number(row.spots_left) || 0,
    promoted_count: Number(row.promoted_count) || 0,
  };
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

    // Fallback sin SELECT directo: get RPC → upsert closed solo si ya existe.
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
  const { data, error } = await supabase.rpc(
    "remove_open_game_registration_entry",
    { p_entry_id: entryId }
  );
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  if (!row || row.ok !== true) {
    throw new Error(String(row?.error ?? "remove_failed"));
  }
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
    case "preferred_side_unavailable":
      return "Aún no se puede guardar el lado (A/B). Hay que aplicar el SQL de convocatoria en Supabase y volver a intentar.";
    default:
      return "No se pudo completar la inscripción. Intenta de nuevo.";
  }
}
