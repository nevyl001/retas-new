import { useEffect, useRef, useState } from "react";
import { FICHA_LIVE_REFRESH_MS } from "../lib/americano/livePlayerIdentity";
import {
  resolvePlayerPublicProfiles,
  type PlayerAvatarLookupEntry,
  type PlayerPublicProfile,
} from "../lib/rivieraJugadores/publicPlayerAvatars";

function sameProfile(
  a: PlayerPublicProfile | undefined,
  b: PlayerPublicProfile | undefined
): boolean {
  return (
    (a?.nombre ?? null) === (b?.nombre ?? null) &&
    (a?.fotoUrl ?? null) === (b?.fotoUrl ?? null) &&
    (a?.rating ?? null) === (b?.rating ?? null)
  );
}

/**
 * Lee nombre, foto y rating de la ficha y los refresca mientras la reta sigue abierta.
 */
export function useLivePlayerProfiles(
  organizadorId: string | null | undefined,
  entries: PlayerAvatarLookupEntry[],
  opts?: { publicOnly?: boolean }
): Record<string, PlayerPublicProfile> {
  const [profiles, setProfiles] = useState<Record<string, PlayerPublicProfile>>(
    {}
  );
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const idsKey = entries
    .map((entry) => entry.id.trim())
    .filter(Boolean)
    .sort()
    .join("|");
  const publicOnly = opts?.publicOnly === true;

  useEffect(() => {
    if (!organizadorId || !idsKey) {
      setProfiles({});
      return;
    }
    const ids = idsKey.split("|");
    let cancelled = false;

    const load = () => {
      void resolvePlayerPublicProfiles(organizadorId, entriesRef.current, {
        publicOnly,
      }).then((next) => {
        if (cancelled) return;
        setProfiles((prev) => {
          const unchanged =
            Object.keys(prev).length === ids.length &&
            ids.every((id) => sameProfile(prev[id], next[id]));
          return unchanged ? prev : next;
        });
      });
    };

    load();
    const timer = window.setInterval(load, FICHA_LIVE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [organizadorId, idsKey, publicOnly]);

  return profiles;
}
