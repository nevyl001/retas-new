/**
 * Tipo compartido para roster / spotlight de Reta por Equipos.
 * La presentación visual vive en RetaEquiposPlayerSpotlight.
 */
export type RetaEquiposPlayerCardData = {
  id: string;
  nombre: string;
  fotoUrl?: string | null;
  edad?: number | null;
  nacionalidad?: string | null;
  mano?: string | null;
  lado?: string | null;
};
