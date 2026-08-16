import type { PublicEliminatoriaPodiumStats } from "./publicEliminatoriaPodiumStats";

export const PODIUM_SHARE_WIDTH = 1080;
export const PODIUM_SHARE_HEIGHT = 1920;

export type PodiumSharePlace = "first" | "second" | "third";

export type PodiumSharePlayer = {
  id: string;
  name: string;
  fotoUrl: string | null;
};

export type PodiumSharePresentation = {
  place: PodiumSharePlace;
  positionLabel: string;
  title: string;
  headline: string;
  recognition: string;
  motivation: string;
  tournamentName: string;
  category: string | null;
  clubName: string;
  clubLogoUrl: string | null;
  showMotherAttribution: boolean;
  players: PodiumSharePlayer[];
  stats: PublicEliminatoriaPodiumStats | null;
};

const CONTENT_BY_PLACE: Record<
  PodiumSharePlace,
  Pick<
    PodiumSharePresentation,
    "positionLabel" | "title" | "headline" | "recognition" | "motivation"
  >
> = {
  first: {
    positionLabel: "1.er LUGAR",
    title: "CAMPEONES",
    headline: "Felicidades, campeones.",
    recognition:
      "Llegaron hasta el final y dejaron su nombre en lo más alto del torneo.",
    motivation:
      "Disfruten este triunfo. La próxima competencia será una nueva oportunidad para defender lo conseguido.",
  },
  second: {
    positionLabel: "2.º LUGAR",
    title: "SUBCAMPEONES",
    headline: "Gran torneo, subcampeones.",
    recognition:
      "Llegar a la Final ya habla del nivel que mostraron durante toda la competencia.",
    motivation:
      "Quedaron a un paso, pero el camino sigue. Queremos verlos de vuelta buscando ese título.",
  },
  third: {
    positionLabel: "3.er LUGAR",
    title: "TERCER LUGAR",
    headline: "Felicidades por subir al podio.",
    recognition:
      "Un gran recorrido y una competencia que demuestra todo lo construido durante el torneo.",
    motivation:
      "Cada torneo abre una nueva oportunidad para llegar todavía más lejos.",
  },
};

export function createPodiumSharePresentation(
  input: Omit<
    PodiumSharePresentation,
    "positionLabel" | "title" | "headline" | "recognition" | "motivation"
  >,
): PodiumSharePresentation {
  return {
    ...input,
    ...CONTENT_BY_PLACE[input.place],
  };
}

export function formatPodiumShareDif(dif: number): string {
  return dif > 0 ? `+${dif}` : String(dif);
}
