import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  PENDING_TEAM_ACCENT,
  extractAccentFromLogoUrl,
  resolveAccentForPaint,
  rgbToCssTriplet,
  type Rgb,
} from "../lib/reta/extractTeamLogoAccent";

export type TeamLogoAccentStyle = CSSProperties & {
  "--reta-eq-a-rgb"?: string;
  "--reta-eq-b-rgb"?: string;
};

/**
 * Resuelve colores de acento A/B desde logos.
 * Arranca desde cache/session (sin amarillo/rojo) para evitar flasheo en móvil.
 */
export function useTeamLogoAccentColors(
  logoA?: string | null,
  logoB?: string | null
): { style: TeamLogoAccentStyle; accentA: Rgb; accentB: Rgb } {
  const [accentA, setAccentA] = useState<Rgb>(() =>
    resolveAccentForPaint(logoA)
  );
  const [accentB, setAccentB] = useState<Rgb>(() =>
    resolveAccentForPaint(logoB)
  );

  useEffect(() => {
    let cancelled = false;

    // Sync paint desde cache; neutro si aún no hay color (nunca amarillo/rojo).
    setAccentA(resolveAccentForPaint(logoA));
    setAccentB(resolveAccentForPaint(logoB));

    void (async () => {
      const [a, b] = await Promise.all([
        extractAccentFromLogoUrl(logoA),
        extractAccentFromLogoUrl(logoB),
      ]);
      if (cancelled) return;
      setAccentA(a ?? PENDING_TEAM_ACCENT);
      setAccentB(b ?? PENDING_TEAM_ACCENT);
    })();

    return () => {
      cancelled = true;
    };
  }, [logoA, logoB]);

  const style = useMemo<TeamLogoAccentStyle>(
    () => ({
      "--reta-eq-a-rgb": rgbToCssTriplet(accentA),
      "--reta-eq-b-rgb": rgbToCssTriplet(accentB),
    }),
    [accentA, accentB]
  );

  return { style, accentA, accentB };
}
