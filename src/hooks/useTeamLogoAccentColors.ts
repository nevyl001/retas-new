import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  DEFAULT_TEAM_A_ACCENT,
  DEFAULT_TEAM_B_ACCENT,
  extractAccentFromLogoUrl,
  rgbToCssTriplet,
  type Rgb,
} from "../lib/reta/extractTeamLogoAccent";

export type TeamLogoAccentStyle = CSSProperties & {
  ["--reta-eq-a-rgb"]?: string;
  ["--reta-eq-b-rgb"]?: string;
};

/**
 * Resuelve colores de acento A/B desde logos (con fallback legacy).
 * Expone CSS vars `--reta-eq-a-rgb` / `--reta-eq-b-rgb` (triplet "r, g, b").
 */
export function useTeamLogoAccentColors(
  logoA?: string | null,
  logoB?: string | null
): { style: TeamLogoAccentStyle; accentA: Rgb; accentB: Rgb } {
  const [accentA, setAccentA] = useState<Rgb>(DEFAULT_TEAM_A_ACCENT);
  const [accentB, setAccentB] = useState<Rgb>(DEFAULT_TEAM_B_ACCENT);

  useEffect(() => {
    let cancelled = false;

    setAccentA(DEFAULT_TEAM_A_ACCENT);
    setAccentB(DEFAULT_TEAM_B_ACCENT);

    void (async () => {
      const [a, b] = await Promise.all([
        extractAccentFromLogoUrl(logoA),
        extractAccentFromLogoUrl(logoB),
      ]);
      if (cancelled) return;
      if (a) setAccentA(a);
      if (b) setAccentB(b);
    })();

    return () => {
      cancelled = true;
    };
  }, [logoA, logoB]);

  const style = useMemo<TeamLogoAccentStyle>(
    () => ({
      ["--reta-eq-a-rgb"]: rgbToCssTriplet(accentA),
      ["--reta-eq-b-rgb"]: rgbToCssTriplet(accentB),
    }),
    [accentA, accentB]
  );

  return { style, accentA, accentB };
}
