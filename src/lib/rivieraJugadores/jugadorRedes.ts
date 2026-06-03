import type { RivieraJugador } from "./types";

export interface RedSocialLink {
  id: "instagram" | "facebook" | "tiktok";
  label: string;
  href: string;
}

export function normalizeSocialUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Solo redes con URL — para vista pública. */
export function getRedesPublicas(jugador: Pick<
  RivieraJugador,
  "instagram_url" | "facebook_url" | "tiktok_url"
>): RedSocialLink[] {
  const out: RedSocialLink[] = [];
  if (jugador.instagram_url?.trim()) {
    out.push({
      id: "instagram",
      label: "Instagram",
      href: normalizeSocialUrl(jugador.instagram_url),
    });
  }
  if (jugador.facebook_url?.trim()) {
    out.push({
      id: "facebook",
      label: "Facebook",
      href: normalizeSocialUrl(jugador.facebook_url),
    });
  }
  if (jugador.tiktok_url?.trim()) {
    out.push({
      id: "tiktok",
      label: "TikTok",
      href: normalizeSocialUrl(jugador.tiktok_url),
    });
  }
  return out;
}
