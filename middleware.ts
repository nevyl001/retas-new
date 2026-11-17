import { buildPagosMeta, injectPagosDocument } from "./src/pagos/seo/documentMeta";

/**
 * Mismo proyecto que AppRiviera. Solo reemplaza el HTML cuando el host
 * es exactamente pagos.rivieraopen.com. El resto de hosts sigue de largo.
 */
export const config = {
  matcher: ["/", "/((?!api/|static/).*)"],
};

const PAGOS_HOST = "pagos.rivieraopen.com";

export default async function middleware(request: Request): Promise<Response | undefined> {
  try {
    const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
    if (host !== PAGOS_HOST) return;
    if (request.headers.get("x-pagos-shell") === "1") return;

    const url = new URL(request.url);
    if (url.pathname.indexOf(".") !== -1) return;
    if (url.pathname.indexOf("/api/") === 0 || url.pathname.indexOf("/static/") === 0) return;

    const indexUrl = new URL("/index.html", url.origin);
    const shell = await fetch(indexUrl.toString(), {
      headers: { "x-pagos-shell": "1" },
    });
    if (!shell.ok) return;

    const html = await shell.text();
    const meta = buildPagosMeta();
    return new Response(injectPagosDocument(html, meta), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return;
  }
}
