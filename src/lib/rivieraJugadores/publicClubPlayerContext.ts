/**
 * Resolución pública contextual: org + jugador → fila válida del ranking del club.
 * RPC: resolve_public_club_player_context (0025).
 * No exige visible_publico=true; PII siempre null en servidor.
 */
import { supabasePublicRead } from "../supabaseClient";
import { dedupeInflight } from "../async/dedupeInflight";
import type { RivieraJugadorWithStats } from "./types";

export type PublicClubPlayerContextRow = {
  id: string;
  organizador_id: string;
  nombre: string;
  slug: string;
  foto_url: string | null;
  email: null;
  telefono: null;
  whatsapp: null;
  nivel: string | null;
  categoria: string;
  edad: number | null;
  mano_dominante: string | null;
  en_cancha: string | null;
  pais_codigo: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  visible_publico: boolean;
  suma_ranking: boolean;
  genero: string | null;
  fecha_nacimiento: null;
  club: string | null;
  estado: string;
  legacy_player_id: string | null;
  legacy_liga_jugador_id: string | null;
  created_at: string;
  updated_at: string;
  rating: number | null;
  rating_partidos: number | null;
  rating_fiabilidad: number | null;
  puntos_totales: number;
  total_partidos: number;
  victorias: number;
  derrotas: number;
  empates: number;
  participaciones_solo: number;
  pct_victorias: number;
  total_retas: number;
  total_torneos_express: number;
  total_ligas: number;
  total_americanos: number;
  sets_favor_total: number;
  sets_contra_total: number;
  racha_actual: string;
  ultima_actividad: string | null;
  stats_updated_at: string | null;
  concedido: boolean;
  source_jugador_id: string | null;
  owner_organizador_id: string | null;
};

let resolvePublicClubPlayerRpcAvailable: boolean | null = null;

function isMissingResolveContextRpcError(
  error: { code?: string; message?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("resolve_public_club_player_context")
  );
}

/**
 * Fila pública del club para ficha/ranking context.
 * null = no pertenece al roster público de ese organizador.
 */
export async function resolvePublicClubPlayerContext(
  organizadorId: string,
  jugadorId: string
): Promise<PublicClubPlayerContextRow | null> {
  const org = organizadorId.trim();
  const id = jugadorId.trim();
  if (!org || !id) return null;
  if (resolvePublicClubPlayerRpcAvailable === false) return null;

  return dedupeInflight(
    `resolve_public_club_player_context:${org}:${id}`,
    async () => {
      const { data, error } = await supabasePublicRead.rpc(
        "resolve_public_club_player_context",
        {
          p_organizador_id: org,
          p_jugador_id: id,
        }
      );

      if (error) {
        if (isMissingResolveContextRpcError(error)) {
          resolvePublicClubPlayerRpcAvailable = false;
          return null;
        }
        console.warn(
          "[resolvePublicClubPlayerContext] resolve_public_club_player_context:",
          error
        );
        return null;
      }

      resolvePublicClubPlayerRpcAvailable = true;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") return null;
      const raw = row as Record<string, unknown>;
      const rid = String(raw.id ?? "").trim();
      if (!rid) return null;

      return {
        id: rid,
        organizador_id: String(raw.organizador_id ?? org),
        nombre: String(raw.nombre ?? "Jugador"),
        slug: String(raw.slug ?? rid),
        foto_url: (raw.foto_url as string | null) ?? null,
        email: null,
        telefono: null,
        whatsapp: null,
        nivel: (raw.nivel as string | null) ?? null,
        categoria: String(raw.categoria ?? "open"),
        edad: raw.edad == null ? null : Number(raw.edad),
        mano_dominante: (raw.mano_dominante as string | null) ?? null,
        en_cancha: (raw.en_cancha as string | null) ?? null,
        pais_codigo: (raw.pais_codigo as string | null) ?? null,
        instagram_url: (raw.instagram_url as string | null) ?? null,
        facebook_url: (raw.facebook_url as string | null) ?? null,
        tiktok_url: (raw.tiktok_url as string | null) ?? null,
        visible_publico: Boolean(raw.visible_publico),
        suma_ranking: raw.suma_ranking !== false,
        genero: (raw.genero as string | null) ?? null,
        fecha_nacimiento: null,
        club: (raw.club as string | null) ?? null,
        estado: String(raw.estado ?? "activo"),
        legacy_player_id: (raw.legacy_player_id as string | null) ?? null,
        legacy_liga_jugador_id:
          (raw.legacy_liga_jugador_id as string | null) ?? null,
        created_at: String(raw.created_at ?? ""),
        updated_at: String(raw.updated_at ?? ""),
        rating: raw.rating == null ? null : Number(raw.rating),
        rating_partidos:
          raw.rating_partidos == null ? null : Number(raw.rating_partidos),
        rating_fiabilidad:
          raw.rating_fiabilidad == null ? null : Number(raw.rating_fiabilidad),
        puntos_totales: Number(raw.puntos_totales ?? 0),
        total_partidos: Number(raw.total_partidos ?? 0),
        victorias: Number(raw.victorias ?? 0),
        derrotas: Number(raw.derrotas ?? 0),
        empates: Number(raw.empates ?? 0),
        participaciones_solo: Number(raw.participaciones_solo ?? 0),
        pct_victorias: Number(raw.pct_victorias ?? 0),
        total_retas: Number(raw.total_retas ?? 0),
        total_torneos_express: Number(raw.total_torneos_express ?? 0),
        total_ligas: Number(raw.total_ligas ?? 0),
        total_americanos: Number(raw.total_americanos ?? 0),
        sets_favor_total: Number(raw.sets_favor_total ?? 0),
        sets_contra_total: Number(raw.sets_contra_total ?? 0),
        racha_actual: String(raw.racha_actual ?? ""),
        ultima_actividad: (raw.ultima_actividad as string | null) ?? null,
        stats_updated_at: (raw.stats_updated_at as string | null) ?? null,
        concedido: Boolean(raw.concedido),
        source_jugador_id: raw.source_jugador_id
          ? String(raw.source_jugador_id)
          : null,
        owner_organizador_id: raw.owner_organizador_id
          ? String(raw.owner_organizador_id)
          : null,
      } satisfies PublicClubPlayerContextRow;
    }
  );
}

/** Assert de privacidad: la RPC pública nunca debe traer PII. */
export function assertPublicClubPlayerContextHasNoPii(
  row: PublicClubPlayerContextRow | Record<string, unknown>
): void {
  const email = (row as { email?: unknown }).email;
  const telefono = (row as { telefono?: unknown }).telefono;
  const whatsapp = (row as { whatsapp?: unknown }).whatsapp;
  const fecha = (row as { fecha_nacimiento?: unknown }).fecha_nacimiento;
  if (email != null && String(email).trim() !== "") {
    throw new Error("PII leak: email");
  }
  if (telefono != null && String(telefono).trim() !== "") {
    throw new Error("PII leak: telefono");
  }
  if (whatsapp != null && String(whatsapp).trim() !== "") {
    throw new Error("PII leak: whatsapp");
  }
  if (fecha != null && String(fecha).trim() !== "") {
    throw new Error("PII leak: fecha_nacimiento");
  }
}

export function mapPublicClubPlayerContextToJugador(
  row: PublicClubPlayerContextRow
): RivieraJugadorWithStats {
  assertPublicClubPlayerContextHasNoPii(row);
  const stats = {
    jugador_id: row.id,
    total_partidos: row.total_partidos,
    victorias: row.victorias,
    derrotas: row.derrotas,
    empates: row.empates,
    participaciones_solo: row.participaciones_solo,
    pct_victorias: row.pct_victorias,
    total_retas: row.total_retas,
    total_torneos_express: row.total_torneos_express,
    total_ligas: row.total_ligas,
    total_americanos: row.total_americanos,
    sets_favor_total: row.sets_favor_total,
    sets_contra_total: row.sets_contra_total,
    racha_actual: row.racha_actual,
    ultima_actividad: row.ultima_actividad,
    puntos_totales: row.puntos_totales,
    updated_at: String(row.stats_updated_at ?? row.updated_at ?? ""),
  };
  const jugador: RivieraJugadorWithStats = {
    id: row.id,
    organizador_id: row.organizador_id,
    nombre: row.nombre,
    slug: row.slug,
    foto_url: row.foto_url,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: (row.nivel as RivieraJugadorWithStats["nivel"]) ?? "intermedio",
    categoria: row.categoria as RivieraJugadorWithStats["categoria"],
    edad: row.edad,
    mano_dominante: row.mano_dominante as RivieraJugadorWithStats["mano_dominante"],
    en_cancha: row.en_cancha as RivieraJugadorWithStats["en_cancha"],
    pais_codigo: row.pais_codigo,
    instagram_url: row.instagram_url,
    facebook_url: row.facebook_url,
    tiktok_url: row.tiktok_url,
    visible_publico: row.visible_publico,
    suma_ranking: row.suma_ranking,
    genero: row.genero as RivieraJugadorWithStats["genero"],
    fecha_nacimiento: null,
    club: row.club,
    estado: row.estado as RivieraJugadorWithStats["estado"],
    legacy_player_id: row.legacy_player_id,
    legacy_liga_jugador_id: row.legacy_liga_jugador_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rating: row.rating ?? 0,
    rating_partidos: row.rating_partidos ?? 0,
    rating_fiabilidad: row.rating_fiabilidad ?? 0,
    stats,
  };
  if (row.concedido && row.source_jugador_id) {
    jugador.concedidoPorAdmin = true;
    jugador.grantedAccess = {
      accessId: "",
      sourceJugadorId: row.source_jugador_id,
      ownerOrganizadorId: row.owner_organizador_id ?? undefined,
      localDisplayName: null,
      localCategory: null,
    };
  }
  return jugador;
}
