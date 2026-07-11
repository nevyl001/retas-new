/**
 * Proxy seguro hacia rivieraopen.com para archivar resultados de retas.
 * Secrets (supabase secrets set): RIVIERAOPEN_API_BASE, RETA_ARCHIVE_SECRET
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  if (!req.headers.get("Authorization")) {
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
