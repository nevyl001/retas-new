import { supabase } from "../supabaseClient";

const TEMP_ROMC_LOG_PREFIX = "TEMP_MULTICLUB_ROMC_2_2";

export type RivieraOfficialLedgerStatus =
  | "inserted"
  | "already_exists"
  | "skipped"
  | "error";

export interface RivieraOfficialLedgerResult {
  status: RivieraOfficialLedgerStatus;
  reason?: string;
  participacionId: string;
  ledgerId?: string;
  officialPlayerKey?: string;
  points?: number;
  organizadorId?: string;
  jugadorId?: string;
  canonicalJugadorId?: string;
  eventoId?: string;
  tipoEvento?: string;
  subtipo?: string;
  raw?: Record<string, unknown>;
}

function logRomcPhase22(payload: Record<string, unknown>): void {
  console.info(TEMP_ROMC_LOG_PREFIX, payload);
}

function parseLedgerRpcResult(
  participacionId: string,
  data: unknown
): RivieraOfficialLedgerResult {
  const raw =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const statusRaw = String(raw.status ?? "skipped");
  const status: RivieraOfficialLedgerStatus =
    statusRaw === "inserted" ||
    statusRaw === "already_exists" ||
    statusRaw === "skipped"
      ? statusRaw
      : "skipped";

  return {
    status,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    participacionId,
    ledgerId: typeof raw.ledger_id === "string" ? raw.ledger_id : undefined,
    officialPlayerKey:
      typeof raw.official_player_key === "string"
        ? raw.official_player_key
        : undefined,
    points: typeof raw.points === "number" ? raw.points : undefined,
    organizadorId:
      typeof raw.organizador_id === "string" ? raw.organizador_id : undefined,
    jugadorId: typeof raw.jugador_id === "string" ? raw.jugador_id : undefined,
    canonicalJugadorId:
      typeof raw.canonical_jugador_id === "string"
        ? raw.canonical_jugador_id
        : undefined,
    eventoId: typeof raw.evento_id === "string" ? raw.evento_id : undefined,
    tipoEvento:
      typeof raw.tipo_evento === "string" ? raw.tipo_evento : undefined,
    subtipo: typeof raw.subtipo === "string" ? raw.subtipo : undefined,
    raw,
  };
}

async function loadParticipacionLedgerContext(participacionId: string): Promise<{
  jugadorId?: string;
  organizadorId?: string;
  puntosObtenidos?: number;
  tipoEvento?: string;
  eventoId?: string;
  subtipo?: string;
} | null> {
  const { data: participacion, error } = await supabase
    .from("jugador_participaciones")
    .select(
      "jugador_id, tipo_evento, evento_id, puntos_obtenidos, metadata"
    )
    .eq("id", participacionId)
    .maybeSingle();

  if (error || !participacion) return null;

  const meta = participacion.metadata as Record<string, unknown> | null;
  const { data: jugador } = await supabase
    .from("riviera_jugadores")
    .select("organizador_id")
    .eq("id", participacion.jugador_id)
    .maybeSingle();

  return {
    jugadorId: String(participacion.jugador_id),
    organizadorId: jugador?.organizador_id
      ? String(jugador.organizador_id)
      : undefined,
    puntosObtenidos: participacion.puntos_obtenidos ?? undefined,
    tipoEvento: participacion.tipo_evento ?? undefined,
    eventoId: participacion.evento_id ?? undefined,
    subtipo:
      typeof meta?.subtipo === "string" ? String(meta.subtipo) : undefined,
  };
}

/** ROMC-2.2: escribe al ledger oficial Riviera (idempotente, best-effort). */
export async function tryWriteRivieraOfficialLedger(
  participacionId: string | null | undefined
): Promise<RivieraOfficialLedgerResult | null> {
  if (!participacionId) return null;

  const context = await loadParticipacionLedgerContext(participacionId);

  logRomcPhase22({
    action: "ledger_attempt",
    participacionId,
    jugadorId: context?.jugadorId ?? null,
    organizadorId: context?.organizadorId ?? null,
    puntosObtenidos: context?.puntosObtenidos ?? null,
    tipoEvento: context?.tipoEvento ?? null,
    eventoId: context?.eventoId ?? null,
    subtipo: context?.subtipo ?? null,
  });

  try {
    const { data, error } = await supabase.rpc(
      "try_write_riviera_official_ledger",
      {
        p_participacion_id: participacionId,
      }
    );

    if (error) {
      logRomcPhase22({
        action: "ledger_error",
        participacionId,
        message: error.message,
        code: error.code ?? null,
        jugadorId: context?.jugadorId ?? null,
        organizadorId: context?.organizadorId ?? null,
      });
      console.error("[riviera-official-ledger] try_write:", error);
      return {
        status: "error",
        reason: error.message,
        participacionId,
        jugadorId: context?.jugadorId,
        organizadorId: context?.organizadorId,
      };
    }

    const parsed = parseLedgerRpcResult(participacionId, data);

    logRomcPhase22({
      action: "ledger_result",
      ...parsed,
    });

    if (parsed.status === "skipped" && parsed.reason) {
      console.warn(
        `[riviera-official-ledger] skipped (${parsed.reason})`,
        parsed
      );
    }

    return parsed;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logRomcPhase22({
      action: "ledger_exception",
      participacionId,
      message,
      jugadorId: context?.jugadorId ?? null,
      organizadorId: context?.organizadorId ?? null,
    });
    console.error("[riviera-official-ledger] try_write:", e);
    return {
      status: "error",
      reason: message,
      participacionId,
      jugadorId: context?.jugadorId,
      organizadorId: context?.organizadorId,
    };
  }
}
