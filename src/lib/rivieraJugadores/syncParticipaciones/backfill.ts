import { prepareParticipacionIdentityForOrganizer } from "../jugadorIdResolver";
import { invalidatePlayersPool } from "../playersPoolCache";
import { invalidateCareerIdentityCache } from "../careerIdentityCache";
import { backfillRetasHistorial } from "./reta";
import { backfillAmericanoHistorial } from "./americano";
import { backfillLigaJornadaHistorial } from "./liga";
import { backfillDuelosHistorial } from "./duelo2v2";

export type BackfillHistorialResumen = {
  retas: number;
  americanos: number;
  ligas: number;
  duelos: number;
};

/** Re-sincroniza historial partido a partido de eventos cerrados del organizador. */
export async function backfillHistorialJugadores(
  organizadorId: string
): Promise<BackfillHistorialResumen> {
  await prepareParticipacionIdentityForOrganizer(organizadorId);
  const [retas, americanos, ligas, duelos] = await Promise.all([
    backfillRetasHistorial(organizadorId),
    backfillAmericanoHistorial(organizadorId),
    backfillLigaJornadaHistorial(organizadorId),
    backfillDuelosHistorial(organizadorId),
  ]);
  // Backfill masivo: escribe jugador_participaciones para potencialmente
  // muchos jugadores del organizador y el resumen solo trae conteos por
  // tipo de evento (no ids). Sin ids precisos y siendo una acción poco
  // frecuente (botón explícito "Importar historial"), se invalida por
  // organizador en vez de intentar adivinar jugadores o limpiar todo.
  invalidatePlayersPool(organizadorId);
  invalidateCareerIdentityCache(organizadorId);
  return { retas, americanos, ligas, duelos };
}