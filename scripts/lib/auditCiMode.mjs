/**
 * Modo CI para auditorías: menos PII en logs de GitHub Actions.
 * Activar con AUDIT_CI_MODE=1 (workflow de auditoría).
 * Local/manual sin la variable: logs completos con nombres.
 */

export function isAuditCiMode() {
  const v = String(process.env.AUDIT_CI_MODE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const REDACTED_NAME_KEYS = new Set([
  "nombre",
  "orphan_nombre",
  "candidate_nombre",
  "club_name",
  "evento_nombre",
]);

/** Referencia a perfil huérfano sin nombre en CI. */
export function formatOrphanRef(row) {
  if (!isAuditCiMode()) {
    return row.orphan_nombre ?? row.nombre ?? "(sin nombre)";
  }
  const parts = [];
  if (row.orphan_jugador_id ?? row.jugador_id) {
    parts.push(`jugador_id=${row.orphan_jugador_id ?? row.jugador_id}`);
  }
  if (row.candidate_riviera_id) parts.push(`riviera_id=${row.candidate_riviera_id}`);
  if (row.candidate_official_jugador_id) {
    parts.push(`candidate_jugador_id=${row.candidate_official_jugador_id}`);
  }
  return parts.join(" ") || "orphan-ref-redacted";
}

export function formatOrphanList(rows) {
  return (rows ?? []).map(formatOrphanRef).join(isAuditCiMode() ? "; " : ", ");
}

/** Etiqueta de TARGET_PLAYERS / checks conocidos. */
export function formatPlayerCheckLabel(nombre, jugadorId) {
  if (!isAuditCiMode()) return nombre;
  return jugadorId ? `jugador_id=${jugadorId}` : "target-player";
}

/** Sanitiza objetos antes de JSON.stringify en logs/reportes. */
export function redactAuditPayload(value) {
  if (!isAuditCiMode()) return value;
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactAuditPayload);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACTED_NAME_KEYS.has(k) || k.endsWith("_nombre")) continue;
      out[k] = redactAuditPayload(v);
    }
    return out;
  }
  return value;
}

export function formatIssueDetails(details) {
  return JSON.stringify(redactAuditPayload(details));
}

export function logAuditCiModeBanner(scriptName) {
  if (!isAuditCiMode()) return;
  console.log(
    `[${scriptName}] AUDIT_CI_MODE=1 — logs sin nombres de jugadores (solo IDs RIV-/jugador_id y conteos).`
  );
}
