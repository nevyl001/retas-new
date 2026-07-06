import { supabase } from "../supabaseClient";

export type EnsureOfficialProfileLinkResult = {
  linked: boolean;
  alreadyLinked?: boolean;
  linkCreated?: boolean;
  officialPlayerKey?: string;
  rivieraId?: string;
  reason?: string;
};

function isMissingLinkRpcError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("ensure_official_profile_link_for_participacion")
  );
}

function parseLinkResult(raw: unknown): EnsureOfficialProfileLinkResult {
  if (!raw || typeof raw !== "object") {
    return { linked: false, reason: "invalid_response" };
  }
  const row = raw as Record<string, unknown>;
  return {
    linked: row.linked === true,
    alreadyLinked: row.already_linked === true,
    linkCreated: row.link_created === true,
    officialPlayerKey:
      typeof row.official_player_key === "string"
        ? row.official_player_key
        : undefined,
    rivieraId: typeof row.riviera_id === "string" ? row.riviera_id : undefined,
    reason: typeof row.reason === "string" ? row.reason : undefined,
  };
}

/**
 * Enlaza un perfil huérfano HIGH al official_player_key antes de escribir participación.
 * No mueve datos; solo crea riviera_official_player_profile_link si falta.
 */
export async function ensureOfficialProfileLinkForParticipacion(
  jugadorId: string,
  organizadorId: string
): Promise<EnsureOfficialProfileLinkResult> {
  const id = jugadorId?.trim();
  const org = organizadorId?.trim();
  if (!id) return { linked: false, reason: "missing_jugador_id" };

  const { data, error } = await supabase.rpc(
    "ensure_official_profile_link_for_participacion",
    {
      p_jugador_id: id,
      p_organizador_id: org || null,
    }
  );

  if (error) {
    if (isMissingLinkRpcError(error)) {
      return { linked: false, reason: "rpc_not_deployed" };
    }
    console.warn(
      "[riviera-jugadores] ensureOfficialProfileLinkForParticipacion:",
      error
    );
    return { linked: false, reason: error.message };
  }

  return parseLinkResult(data);
}
