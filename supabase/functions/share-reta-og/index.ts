/**
 * Share OG HTML for WhatsApp/Facebook crawlers (CRA SPA cannot mutate og:* for them).
 *
 * Deploy: supabase functions deploy share-reta-og
 * URL compartida (WhatsApp):
 *   ${REACT_APP_SHARE_OG_BASE_URL}?slug=ra-xxxx
 *   ej. https://<project>.supabase.co/functions/v1/share-reta-og?slug=ra-xxxx
 *
 * Env en función: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_ORIGIN
 * Env en FE: REACT_APP_SHARE_OG_BASE_URL
 *
 * No meta-refresh inmediato (crawlers necesitan leer OG). Enlace + refresh 8s.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const RIVIERA_OG_IMAGE = "https://appriviera.rivieraopen.com/icon-512x512.png";
const RIVIERA_TITLE = "RivieraApp — Retas y torneos de pádel";
const APP_ORIGIN =
  Deno.env.get("PUBLIC_APP_ORIGIN") || "https://appriviera.rivieraopen.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage(opts: {
  title: string;
  description: string;
  image: string;
  playUrl: string;
  canonical: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(opts.title)}" />
  <meta property="og:description" content="${escapeHtml(opts.description)}" />
  <meta property="og:image" content="${escapeHtml(opts.image)}" />
  <meta property="og:url" content="${escapeHtml(opts.canonical)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(opts.title)}" />
  <meta name="twitter:description" content="${escapeHtml(opts.description)}" />
  <meta name="twitter:image" content="${escapeHtml(opts.image)}" />
  <link rel="canonical" href="${escapeHtml(opts.canonical)}" />
  <meta http-equiv="refresh" content="8;url=${escapeHtml(opts.playUrl)}" />
</head>
<body>
  <p><a href="${escapeHtml(opts.playUrl)}">Abrir convocatoria</a></p>
  <script>setTimeout(function(){ location.replace(${JSON.stringify(opts.playUrl)}); }, 8500);</script>
</body>
</html>`;
}

serve(async (req) => {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  if (!slug) {
    return new Response("Missing slug", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { data: reg, error: regErr } = await sb
    .from("tournament_open_registration")
    .select(
      "entity_id, mode_type, title_public, public_slug, enabled, status, location_label"
    )
    .eq("public_slug", slug)
    .maybeSingle();

  if (regErr || !reg) {
    return new Response("Not found", { status: 404 });
  }

  const status = String(reg.status || "");
  const enabled = reg.enabled !== false;
  if (
    !enabled ||
    status === "draft" ||
    status === "cancelled" ||
    status === "closed"
  ) {
    // No exponer datos de convocatorias no públicas
    return new Response("Not found", { status: 404 });
  }

  let title = RIVIERA_TITLE;
  let description =
    "Organiza. Juega. Compite. Crea retas y torneos de pádel.";
  let image = RIVIERA_OG_IMAGE;
  let organizadorId: string | null = null;

  if (reg.mode_type === "reta" || reg.mode_type === "americano") {
    const { data: t } = await sb
      .from("tournaments")
      .select("id, name, user_id, lugar, description")
      .eq("id", reg.entity_id)
      .maybeSingle();
    if (!t) return new Response("Not found", { status: 404 });
    title = t.name || reg.title_public || title;
    description =
      [t.description, t.lugar || reg.location_label]
        .filter(Boolean)
        .join(" · ") || description;
    organizadorId = t.user_id;
  } else if (reg.mode_type === "duelo_2v2") {
    const { data: d } = await sb
      .from("duelos_2v2")
      .select("id, nombre, organizador_id, lugar")
      .eq("id", reg.entity_id)
      .maybeSingle();
    if (!d) return new Response("Not found", { status: 404 });
    title = d.nombre || title;
    description = d.lugar || description;
    organizadorId = d.organizador_id;
  } else {
    return new Response("Not found", { status: 404 });
  }

  if (organizadorId) {
    const { data: brand } = await sb.rpc("get_organizador_branding_public", {
      p_org_id: organizadorId,
    });
    const row = Array.isArray(brand) ? brand[0] : brand;
    if (row?.premium_branding_enabled === true && row?.branding_key) {
      const key = String(row.branding_key);
      const clubOg = `${APP_ORIGIN}/branding/${encodeURIComponent(key)}/og.png`;
      // Fallback Riviera si el asset no está documentado: el crawler igual recibe URL absoluta;
      // el FE/CDN debe servir el asset. Si falta, WhatsApp mostrará placeholder roto → preferimos
      // Riviera solo cuando no hay branding_key (arriba). Aquí usamos club OG path.
      image = clubOg;
    }
  }

  const playUrl = `${APP_ORIGIN}/jugar/${encodeURIComponent(slug)}`;
  const canonical = `${
    Deno.env.get("PUBLIC_SHARE_CANONICAL_BASE") ||
    `${supabaseUrl}/functions/v1/share-reta-og`
  }?slug=${encodeURIComponent(slug)}`;

  const html = htmlPage({
    title,
    description,
    image,
    playUrl,
    canonical,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
});
