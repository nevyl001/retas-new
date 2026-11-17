import type { PagosDocumentMeta } from "../types";

export function applyPagosDocumentMeta(meta: PagosDocumentMeta): () => void {
  const previousTitle = document.title;
  document.title = meta.title;
  const touched: Array<{ el: Element; prev: string | null; created: boolean }> = [];

  const setMeta = (attr: "name" | "property", key: string, content: string) => {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    const created = !el;
    if (!el) {
      const createdMeta = document.createElement("meta");
      createdMeta.setAttribute(attr, key);
      createdMeta.setAttribute("data-pagos-meta", "1");
      document.head.appendChild(createdMeta);
      el = createdMeta;
    }
    touched.push({ el, prev: el.getAttribute("content"), created });
    el.setAttribute("content", content);
  };

  setMeta("name", "description", meta.description);
  setMeta("name", "robots", meta.robots);
  setMeta("name", "theme-color", "#0D0F12");
  setMeta("property", "og:type", "website");
  setMeta("property", "og:site_name", "Riviera Open Pagos");
  setMeta("property", "og:title", meta.title);
  setMeta("property", "og:description", meta.description);
  setMeta("property", "og:url", meta.canonical);
  setMeta("property", "og:image", meta.image);
  setMeta("property", "og:image:alt", meta.imageAlt);
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("property", "og:image:secure_url", meta.image);
  setMeta("property", "og:image:type", "image/jpeg");
  setMeta("property", "og:image:width", "1200");
  setMeta("property", "og:image:height", "630");
  setMeta("name", "twitter:title", meta.title);
  setMeta("name", "twitter:description", meta.description);
  setMeta("name", "twitter:image", meta.image);
  setMeta("name", "twitter:url", meta.canonical);

  const existingCanonical = document.head.querySelector('link[rel="canonical"]');
  const canonicalCreated = !existingCanonical;
  const previousCanonical = existingCanonical ? existingCanonical.getAttribute("href") : null;
  const canonicalEl = existingCanonical || document.createElement("link");
  if (!existingCanonical) {
    canonicalEl.setAttribute("rel", "canonical");
    canonicalEl.setAttribute("data-pagos-meta", "1");
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute("href", meta.canonical);

  return () => {
    document.title = previousTitle;
    for (let i = 0; i < touched.length; i += 1) {
      const item = touched[i];
      if (item.created) {
        if (item.el.parentNode) item.el.parentNode.removeChild(item.el);
        continue;
      }
      if (item.prev === null) item.el.removeAttribute("content");
      else item.el.setAttribute("content", item.prev);
    }
    if (canonicalCreated && canonicalEl.parentNode) {
      canonicalEl.parentNode.removeChild(canonicalEl);
    } else if (!canonicalCreated) {
      if (previousCanonical === null) canonicalEl.removeAttribute("href");
      else canonicalEl.setAttribute("href", previousCanonical);
    }
  };
}
