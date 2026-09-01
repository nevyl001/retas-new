/** Rama del encuentro (reta / convocatoria). */

export type RetaRama = "" | "varonil" | "femenil" | "mixta";

export const RETA_RAMA_OPTIONS: ReadonlyArray<{
  value: Exclude<RetaRama, "">;
  label: string;
}> = [
  { value: "varonil", label: "Varonil" },
  { value: "femenil", label: "Femenil" },
  { value: "mixta", label: "Mixta" },
];

export function parseRetaRama(raw: string | null | undefined): RetaRama {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "varonil" || t === "femenil" || t === "mixta") return t;
  return "";
}

export function retaRamaPublicLabel(rama: RetaRama): string | null {
  const match = RETA_RAMA_OPTIONS.find((o) => o.value === rama);
  return match?.label ?? null;
}
