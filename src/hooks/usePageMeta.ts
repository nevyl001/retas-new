import { useEffect } from "react";

/** Actualiza title y meta description; restaura al desmontar. */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? "";

    document.title = title;
    if (meta) meta.setAttribute("content", description);

    return () => {
      document.title = prevTitle;
      if (meta) meta.setAttribute("content", prevDesc);
    };
  }, [title, description]);
}
