/**
 * Share OG HTML for WhatsApp/Facebook crawlers.
 *
 * URLs:
 *   ?slug=<public_slug>  → convocatoria → play /jugar/:slug
 *   ?dest=<pathname>     → cualquier vista pública SPA
 *
 * Deploy: supabase functions deploy share-reta-og
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_ORIGIN
 * No redirect inmediato (meta refresh 8s + enlace).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const RIVIERA_OG_IMAGE = "https://appriviera.rivieraopen.com/icon-512x512.png";
const RIVIERA_TITLE = "RivieraApp — Retas y torneos de pádel";
const RIVIERA_DESC =
  "Organiza. Juega. Compite. Crea retas y torneos de pádel.";
const APP_ORIGIN =
  Deno.env.get("PUBLIC_APP_ORIGIN") || "https://appriviera.rivieraopen.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shouldExpose(enabled: unknown, status: unknown): boolean {
  if (enabled === false) return false;
  const s = String(status || "").toLowerCase();
  if (s === "draft" || s === "cancelled" || s === "closed") return false;
  return true;
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
  <p><a href="${escapeHtml(opts.playUrl)}">Abrir enlace</a></p>
  <script>setTimeout(function(){ location.replace(${JSON.stringify(opts.playUrl)}); }, 8500);</script>
</body>
</html>`;
}

type BrandCtx = {
  title: string;
  description: string;
  organizadorId: string | null;
};

async function applyPremiumBrand(
  sb: ReturnType<typeof createClient>,
  ctx: BrandCtx
): Promise<{ title: string; description: string; image: string }> {
  let image = RIVIERA_OG_IMAGE;
  let title = ctx.title;
  const description = ctx.description;
  if (!ctx.organizadorId) {
    return { title, description, image };
  }
  const { data: brand } = await sb.rpc("get_organizador_branding_public", {
    p_org_id: ctx.organizadorId,
  });
  const row = Array.isArray(brand) ? brand[0] : brand;
  if (row?.premium_branding_enabled === true && row?.branding_key) {
    const key = String(row.branding_key);
    image = `${APP_ORIGIN}/branding/${encodeURIComponent(key)}/og.png`;
    const { data: display } = await sb.rpc("get_organizador_display_name", {
      p_organizador_id: ctx.organizadorId,
    });
    const clubTitle =
      typeof display === "string"
        ? display
        : Array.isArray(display)
          ? String(display[0] || "")
          : "";
    if (clubTitle) title = `${ctx.title} · ${clubTitle}`;
  }
  return { title, description, image };
}

async function resolveFromSlug(
  sb: ReturnType<typeof createClient>,
  slug: string
): Promise<BrandCtx | Response> {
  const { data: reg, error: regErr } = await sb
    .from("tournament_open_registration")
    .select(
      "entity_id, mode_type, title_public, public_slug, enabled, status, location_label"
    )
    .eq("public_slug", slug)
    .maybeSingle();

  if (regErr || !reg || !shouldExpose(reg.enabled, reg.status)) {
    return new Response("Not found", { status: 404 });
  }

  let title = RIVIERA_TITLE;
  let description = RIVIERA_DESC;
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

  return { title, description, organizadorId };
}

async function resolveFromDest(
  sb: ReturnType<typeof createClient>,
  dest: string
): Promise<BrandCtx | Response> {
  const path = dest.split("?")[0] || "";

  const jugar = path.match(/^\/(?:jugar|reta-abierta)\/([^/]+)$/i);
  if (jugar?.[1]) {
    return resolveFromSlug(sb, decodeURIComponent(jugar[1]));
  }

  const americano = path.match(
    /^\/public\/(?:vista-publica\/)?americano\/([^/]+)$/i
  );
  if (americano?.[1]) {
    const id = decodeURIComponent(americano[1]);
    const { data: t } = await sb
      .from("tournaments")
      .select("id, name, user_id, lugar, description")
      .eq("id", id)
      .maybeSingle();
    if (!t) return new Response("Not found", { status: 404 });
    return {
      title: t.name || RIVIERA_TITLE,
      description: [t.description, t.lugar].filter(Boolean).join(" · ") ||
        RIVIERA_DESC,
      organizadorId: t.user_id,
    };
  }

  const duelo = path.match(/^\/public\/duelo-2v2\/([^/]+)$/i);
  if (duelo?.[1]) {
    const id = decodeURIComponent(duelo[1]);
    const { data: d } = await sb
      .from("duelos_2v2")
      .select("id, nombre, organizador_id, lugar")
      .eq("id", id)
      .maybeSingle();
    if (!d) return new Response("Not found", { status: 404 });
    return {
      title: d.nombre || RIVIERA_TITLE,
      description: d.lugar || RIVIERA_DESC,
      organizadorId: d.organizador_id,
    };
  }

  const liga = path.match(/^\/public\/liga\/([^/]+)(?:\/jornada\/\d+)?$/i);
  if (liga?.[1]) {
    const id = decodeURIComponent(liga[1]);
    const { data: l } = await sb
      .from("ligas")
      .select("id, nombre, organizador_id")
      .eq("id", id)
      .maybeSingle();
    if (!l) return new Response("Not found", { status: 404 });
    return {
      title: l.nombre || RIVIERA_TITLE,
      description: RIVIERA_DESC,
      organizadorId: l.organizador_id,
    };
  }

  const te = path.match(/^\/torneo-express\/([^/]+)/i);
  if (te?.[1]) {
    const id = decodeURIComponent(te[1]);
    const { data: t } = await sb
      .from("torneos_express")
      .select("id, nombre, organizador_id")
      .eq("id", id)
      .maybeSingle();
    if (!t) return new Response("Not found", { status: 404 });
    return {
      title: t.nombre || RIVIERA_TITLE,
      description: RIVIERA_DESC,
      organizadorId: t.organizador_id,
    };
  }

  const evento = path.match(/^\/eventos\/([^/]+)$/i);
  if (evento?.[1]) {
    const slug = decodeURIComponent(evento[1]);
    const { data: e } = await sb
      .from("eventos")
      .select("id, nombre, organizador_id, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (!e) return new Response("Not found", { status: 404 });
    return {
      title: e.nombre || RIVIERA_TITLE,
      description: RIVIERA_DESC,
      organizadorId: e.organizador_id,
    };
  }

  const pubReta = path.match(/^\/public\/([^/]+)$/i);
  if (pubReta?.[1] && !["americano", "liga", "duelo-2v2", "jugadores", "vista-publica", "ranking-puntos"].includes(pubReta[1].toLowerCase())) {
    const id = decodeURIComponent(pubReta[1]);
    const { data: t } = await sb
      .from("tournaments")
      .select("id, name, user_id, lugar, description")
      .eq("id", id)
      .maybeSingle();
    if (!t) return new Response("Not found", { status: 404 });
    return {
      title: t.name || RIVIERA_TITLE,
      description: [t.description, t.lugar].filter(Boolean).join(" · ") ||
        RIVIERA_DESC,
      organizadorId: t.user_id,
    };
  }

  return new Response("Not found", { status: 404 });
}

serve(async (req) => {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  const destRaw = (url.searchParams.get("dest") || "").trim();

  if (!slug && !destRaw) {
    return new Response("Missing slug or dest", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  let playUrl: string;
  let resolved: BrandCtx | Response;

  if (slug) {
    resolved = await resolveFromSlug(sb, slug);
    playUrl = `${APP_ORIGIN}/jugar/${encodeURIComponent(slug)}`;
  } else {
    const dest = destRaw.startsWith("/") ? destRaw : `/${destRaw}`;
    resolved = await resolveFromDest(sb, dest);
    playUrl = `${APP_ORIGIN}${dest}`;
  }

  if (resolved instanceof Response) return resolved;

  const branded = await applyPremiumBrand(sb, resolved);
  const shareBase =
    Deno.env.get("PUBLIC_SHARE_CANONICAL_BASE") ||
    `${supabaseUrl}/functions/v1/share-reta-og`;
  const canonical = slug
    ? `${shareBase}?slug=${encodeURIComponent(slug)}`
    : `${shareBase}?dest=${encodeURIComponent(destRaw.startsWith("/") ? destRaw : `/${destRaw}`)}`;

  return new Response(
    htmlPage({
      title: branded.title,
      description: branded.description,
      image: branded.image,
      playUrl,
      canonical,
    }),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    }
  );
});
