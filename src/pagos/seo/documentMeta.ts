import type { PagosDocumentMeta } from "../types";

export const PAGOS_ORIGIN = "https://pagos.rivieraopen.com";
export const PAGOS_TITLE = "Riviera Open | Pagos oficiales";
export const PAGOS_DESCRIPTION =
  "Realiza tu pago de Riviera Open en Clip. Ingresa el monto que te indicó el organizador y escribe el concepto de tu actividad.";

const SOCIAL_IMAGE = "/pagos/og.png";

export function buildPagosMeta(): PagosDocumentMeta {
  return {
    title: PAGOS_TITLE,
    description: PAGOS_DESCRIPTION,
    canonical: `${PAGOS_ORIGIN}/`,
    image: `${PAGOS_ORIGIN}${SOCIAL_IMAGE}`,
    imageAlt: "Riviera Open",
    robots: "index, follow",
    notFound: false,
  };
}

export function injectPagosDocument(html: string, meta: PagosDocumentMeta): string {
  if (html.indexOf("</head>") === -1) return html;
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+[^>]*name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*name=["']robots["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*name=["']theme-color["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*(?:name|property)=["']twitter:[^"']+["'][^>]*>/gi, "")
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "");
  return stripped.replace("</head>", `${metaTags(meta)}</head>`);
}

function metaTags(meta: PagosDocumentMeta): string {
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="robots" content="${escapeHtml(meta.robots)}" />`,
    `<meta name="theme-color" content="#0D0F12" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Riviera Open Pagos" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="1200" />`,
    `<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`,
    `<meta name="twitter:url" content="${escapeHtml(meta.canonical)}" />`,
  ].join("");
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
