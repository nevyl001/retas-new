/**
 * Proxy seguro hacia rivieraopen.com para archivar resultados de retas.
 * Secrets (supabase secrets set): RIVIERAOPEN_API_BASE, RETA_ARCHIVE_SECRET
 *
 * HOTFIX DE SEGURIDAD (auditoría 2026-07-26): antes solo se verificaba que el
 * header Authorization existiera, sin validar el JWT ni la propiedad del
 * retaId — cualquiera podía forzar archivado sobre retas ajenas. Ahora se
 * valida la sesión (igual que admin-crear-usuario) y que el caller sea dueño
 * del torneo (tournaments.user_id) antes de reenviar la petición.
 *
 * FASE B: además de la autorización ya vigente, se agrega:
 *   - Validación de host/protocolo de RIVIERAOPEN_API_BASE al arrancar la
 *     función (defensa en profundidad — hoy el cliente no puede influir en
 *     este valor, pero si algún día se configurara mal, la función se niega
 *     a arrancar en vez de reenviar el secreto a un host inesperado).
 *   - Timeout real (AbortController) en el fetch saliente.
 *   - Límite de tamaño en la respuesta reenviada.
 *   - Rate limiting por organizador.
 *   - Los errores del upstream y de red ya no se reenvían crudos al cliente.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { newCorrelationId, logError, logWarn } from "../_shared/logger.ts";
import { safeClientMessage, internalErrorDetail } from "../_shared/errors.ts";
import { checkRateLimit, rateLimitedResponse } from "../_shared/rateLimit.ts";
import { assertSafeUpstreamBase } from "./upstreamGuard.ts";

const MODULE = "reta-archive-proxy";
const MAX_BODY_BYTES = 2_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 1_000_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RIVIERAOPEN_API_BASE =
  Deno.env.get("RIVIERAOPEN_API_BASE")?.trim() || "https://rivieraopen.com";
const RETA_ARCHIVE_SECRET = Deno.env.get("RETA_ARCHIVE_SECRET")?.trim() ?? "";

// Falla al arrancar (no en cada request) si el secreto de configuración
// apunta a un host inesperado — nunca reenvía RETA_ARCHIVE_SECRET a un
// destino no confiable.
assertSafeUpstreamBase(RIVIERAOPEN_API_BASE);

type ProxyAction = "archive" | "status";

interface ProxyRequestBody {
  retaId?: string;
  action?: ProxyAction;
  force?: boolean;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const correlationId = newCorrelationId();
  const jsonResponse = (status: number, payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Solicitud demasiado grande" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  if (!RETA_ARCHIVE_SECRET) {
    logError({ correlationId, module: MODULE, errorType: "missing_secret" });
    return jsonResponse(500, { error: safeClientMessage(correlationId) });
  }

  let body: ProxyRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const retaId = body.retaId?.trim();
  const action = body.action;
  if (!retaId) {
    return jsonResponse(400, { error: "retaId is required" });
  }
  if (action !== "archive" && action !== "status") {
    return jsonResponse(400, { error: "action must be archive or status" });
  }

  const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseCaller.auth.getUser();

  if (callerError || !caller) {
    return jsonResponse(401, { error: "Sesión inválida o expirada" });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Rate limit por organizador: "status" se usa para polling y admite más
  // tráfico legítimo que "archive" (acción irreversible más costosa aguas
  // abajo) — mismo bucket, límite generoso pero real.
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${caller.id}`, 30, 300);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: caller.id });
    return rateLimitedResponse(rl, cors);
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from("tournaments")
    .select("id, user_id")
    .eq("id", retaId)
    .maybeSingle();

  if (tournamentError) {
    logError({
      correlationId,
      module: MODULE,
      errorType: "tournament_lookup_failed",
      detail: internalErrorDetail(tournamentError),
    });
    return jsonResponse(500, { error: safeClientMessage(correlationId) });
  }
  if (!tournament || tournament.user_id !== caller.id) {
    return jsonResponse(403, { error: "No tienes permisos sobre esta reta" });
  }

  const encodedId = encodeURIComponent(retaId);
  const url =
    action === "archive"
      ? `${RIVIERAOPEN_API_BASE}/api/retas/${encodedId}/archive-results`
      : `${RIVIERAOPEN_API_BASE}/api/retas/${encodedId}/archive-status`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: action === "archive" ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${RETA_ARCHIVE_SECRET}`,
        "Content-Type": "application/json",
      },
      body:
        action === "archive"
          ? JSON.stringify({ force: body.force ?? false })
          : undefined,
      cache: "no-store",
      signal: abortController.signal,
    });

    const upstreamLength = Number(upstream.headers.get("content-length") ?? "0");
    if (upstreamLength > MAX_UPSTREAM_RESPONSE_BYTES) {
      logWarn({
        correlationId,
        module: MODULE,
        event: "upstream_response_too_large",
        bytes: upstreamLength,
      });
      return jsonResponse(502, { error: safeClientMessage(correlationId) });
    }

    const text = await upstream.text();
    if (text.length > MAX_UPSTREAM_RESPONSE_BYTES) {
      logWarn({
        correlationId,
        module: MODULE,
        event: "upstream_response_too_large_unbounded",
        bytes: text.length,
      });
      return jsonResponse(502, { error: safeClientMessage(correlationId) });
    }

    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!upstream.ok) {
      logWarn({
        correlationId,
        module: MODULE,
        event: "upstream_error",
        status: upstream.status,
        retaId,
      });
      return jsonResponse(upstream.status, {
        error: "El servicio de archivado no pudo procesar la solicitud.",
        correlation_id: correlationId,
      });
    }

    return jsonResponse(upstream.status, payload ?? {});
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    logError({
      correlationId,
      module: MODULE,
      errorType: timedOut ? "upstream_timeout" : "upstream_unreachable",
      detail: internalErrorDetail(e),
    });
    return jsonResponse(502, { error: safeClientMessage(correlationId) });
  } finally {
    clearTimeout(timeoutId);
  }
});
