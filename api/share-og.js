/**
 * Preview compacta para WhatsApp/Facebook (sin imagen grande).
 * URL pública: /s/:slug → rewrite a /api/share-og?slug=
 * Redirige al humano a /jugar/:slug.
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveOrigin(req) {
  const envOrigin = (process.env.PUBLIC_APP_ORIGIN || "").replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (host) return `${proto}://${host}`;
  return "https://appriviera.rivieraopen.com";
}

module.exports = function shareOg(req, res) {
  const slug = String(req.query.slug || "").trim();
  if (!slug || !/^[a-zA-Z0-9._-]+$/.test(slug)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  const origin = resolveOrigin(req);
  const playUrl = `${origin}/jugar/${encodeURIComponent(slug)}`;
  const canonical = `${origin}/s/${encodeURIComponent(slug)}`;
  const title = "Convocatoria · Juega en Riviera Open";
  const description =
    "Todos los juegos cuentan. Sube tu ranking y rating — abre el enlace y únete.";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(playUrl)}" />
</head>
<body>
  <p><a href="${escapeHtml(playUrl)}">Abrir convocatoria</a></p>
  <script>location.replace(${JSON.stringify(playUrl)});</script>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.end(html);
};
