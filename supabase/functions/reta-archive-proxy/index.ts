/**
 * Proxy seguro hacia rivieraopen.com para archivar resultados de retas.
 * Secrets (supabase secrets set): RIVIERAOPEN_API_BASE, RETA_ARCHIVE_SECRET
 *
 * HOTFIX DE SEGURIDAD (auditoría 2026-07-26): antes solo se verificaba que el
 * header Authorization existiera, sin validar el JWT ni la propiedad del
 * retaId — cualquiera podía forzar archivado sobre retas ajenas. Ahora se
 * valida la sesión (igual que admin-crear-usuario) y que el caller sea dueño
 * del torneo (tournaments.user_id) antes de reenviar la petición.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RIVIERAOPEN_API_BASE =
  Deno.env.get("RIVIERAOPEN_API_BASE")?.trim() || "https://rivieraopen.com";
const RETA_ARCHIVE_SECRET = Deno.env.get("RETA_ARCHIVE_SECRET")?.trim() ?? "";

type ProxyAction = "archive" | "status";

interface ProxyRequestBody {
  retaId?: string;
  action?: ProxyAction;
  force?: boolean;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  if (!RETA_ARCHIVE_SECRET) {
    return jsonResponse(500, { error: "RETA_ARCHIVE_SECRET not configured" });
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
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from("tournaments")
    .select("id, user_id")
    .eq("id", retaId)
    .maybeSingle();

  if (tournamentError) {
    return jsonResponse(500, { error: "No se pudo verificar el torneo" });
  }
  if (!tournament || tournament.user_id !== caller.id) {
    return jsonResponse(403, { error: "No tienes permisos sobre esta reta" });
  }

  const encodedId = encodeURIComponent(retaId);
  const url =
    action === "archive"
      ? `${RIVIERAOPEN_API_BASE}/api/retas/${encodedId}/archive-results`
      : `${RIVIERAOPEN_API_BASE}/api/retas/${encodedId}/archive-status`;

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
    });

    const text = await upstream.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }

    if (!upstream.ok) {
      const errMsg =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as { error: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Upstream HTTP ${upstream.status}`;
      return jsonResponse(upstream.status, { error: errMsg, ...((payload as object) ?? {}) });
    }

    return jsonResponse(upstream.status, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(502, { error: `Failed to reach rivieraopen.com: ${msg}` });
  }
});
