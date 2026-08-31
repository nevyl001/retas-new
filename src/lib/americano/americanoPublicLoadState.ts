import type { FetchAmericanoLivePublicResult } from "../database";
import type { AmericanoDinamicoSnapshotV1 } from "../americanoDinamicoStorage";

/** true mientras la primera lectura de americano_live no ha terminado. */
export function isAmericanoPublicInitialLoadPending(
  fetchStatus: FetchAmericanoLivePublicResult | null,
  snapshot: AmericanoDinamicoSnapshotV1 | null
): boolean {
  return fetchStatus === null && snapshot === null;
}
