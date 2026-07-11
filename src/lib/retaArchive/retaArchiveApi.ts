import { supabase } from "../supabaseClient";

export type RetaArchiveFailureReason =
  | "missing_legacy_player_id"
  | "no_pairs_or_matches"
  | "update_failed";

export interface RetaArchiveStatus {
  retaId: string;
  total: number;
  archived: number;
  complete: boolean;
  canDeleteMatches: boolean;
  failures: Array<{
    participacionId: string;
    jugadorId: string;
    jugadorNombre?: string;
    reason: RetaArchiveFailureReason;
    message: string;
  }>;
}

export interface ArchiveRetaResultsSummary extends RetaArchiveStatus {
  updated: number;
  alreadyArchived: number;
  failed: number;
  errors: string[];
}

export type SafeDeleteMatchesResult = {
  proceed: boolean;
  status?: RetaArchiveStatus;
  warning?: string;
};

const LOG_PREFIX = "[reta-archive]";

function readEdgeError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" && err.trim() ? err.trim() : null;
}

function mapInvokeError(message: string, status?: number): string {
  const lower = message.toLowerCase();
  if (status === 404 || lower.includes("not found")) {
    return "La función reta-archive-proxy no está desplegada en Supabase.";
  }
  if (lower.includes("failed to send") || lower.includes("fetch")) {
    return "No se pudo contactar al servidor de archivado.";
  }
  return message || "Error al archivar resultados de la reta";
}

async function invokeRetaArchiveProxy<T>(
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("reta-archive-proxy", {
    body,
  });

  if (error) {
    const status =
      error && typeof error === "object" && "context" in error
        ? (error as { context?: { status?: number } }).context?.status
        : undefined;
    throw new Error(mapInvokeError(error.message, status));
  }

  const edgeErr = readEdgeError(data);
  if (edgeErr) {
    throw new Error(edgeErr);
  }

  return data as T;
}

/** Archiva detalle ronda-por-ronda en rivieraopen.com (vía Edge Function). */
export async function archiveRetaResults(
  retaId: string,
  options: { force?: boolean } = {}
): Promise<ArchiveRetaResultsSummary> {
  return invokeRetaArchiveProxy<ArchiveRetaResultsSummary>({
    retaId,
    action: "archive",
    force: options.force ?? false,
  });
}

export async function fetchRetaArchiveStatus(
  retaId: string
): Promise<RetaArchiveStatus> {
  return invokeRetaArchiveProxy<RetaArchiveStatus>({
    retaId,
    action: "status",
  });
}

/** POST archive-results → GET archive-status */
export async function ensureArchivedBeforeMatchDelete(
  retaId: string
): Promise<RetaArchiveStatus> {
  await archiveRetaResults(retaId);
  return fetchRetaArchiveStatus(retaId);
}

export function formatArchiveFailures(status: RetaArchiveStatus): string {
  if (!status.failures.length) return "Sin detalle adicional.";
  return status.failures
    .map(
      (f) =>
        `• ${f.jugadorNombre ?? f.jugadorId}: ${f.message} (${f.reason})`
    )
    .join("\n");
}

export function buildIncompleteArchivePrompt(
  status: RetaArchiveStatus,
  finishedCount: number
): string {
  const detail = formatArchiveFailures(status);
  return (
    `No todo el detalle quedó archivado en rivieraopen.com.\n\n` +
    `Archivados: ${status.archived}/${status.total}\n\n` +
    `${detail}\n\n` +
    `¿Seguro? Se perderá el detalle de ${finishedCount} partido(s) finalizado(s) ` +
    `que no se archivaron.`
  );
}

export function buildArchiveApiFailurePrompt(
  errorMessage: string,
  finishedCount: number
): string {
  return (
    `No se pudo verificar el archivado en rivieraopen.com:\n${errorMessage}\n\n` +
    `¿Seguro? Se perderá el detalle de ${finishedCount} partido(s) finalizado(s).`
  );
}

export async function decideSafeMatchDeletion(
  retaId: string,
  finishedCount: number,
  confirmDestructive: (prompt: string) => boolean
): Promise<SafeDeleteMatchesResult> {
  if (finishedCount <= 0) {
    return { proceed: true };
  }

  let status: RetaArchiveStatus;
  try {
    status = await ensureArchivedBeforeMatchDelete(retaId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG_PREFIX, "archive API failed:", msg);
    if (!confirmDestructive(buildArchiveApiFailurePrompt(msg, finishedCount))) {
      return {
        proceed: false,
        warning: "Operación cancelada: no se pudo confirmar el archivado.",
      };
    }
    return {
      proceed: true,
      warning: "Se borró sin archivado verificado (falló la API; confirmado por el organizador).",
    };
  }

  if (status.canDeleteMatches) {
    return { proceed: true, status };
  }

  console.warn(LOG_PREFIX, "archive incomplete:", status);
  if (!confirmDestructive(buildIncompleteArchivePrompt(status, finishedCount))) {
    return {
      proceed: false,
      status,
      warning: "Operación cancelada para preservar el detalle de partidos.",
    };
  }

  return {
    proceed: true,
    status,
    warning:
      "Se borraron partidos con archivado incompleto (confirmado por el organizador).",
  };
}
