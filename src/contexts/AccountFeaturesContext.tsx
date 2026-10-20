import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { GameModeId } from "../components/home/gameModesConfig";
import { fetchOrganizadorAccountSettings } from "../lib/admin/accountControls";
import { isGameModeEnabled } from "../lib/admin/organizadorGameModes";
import { useUser } from "./UserContext";

interface AccountFeaturesContextType {
  enabledModes: Record<GameModeId, boolean> | null;
  permiteAjustePuntosManuales: boolean;
  visibleRankingOficial: boolean;
  coachingEnabled: boolean;
  loading: boolean;
  isModeEnabled: (modeId: GameModeId) => boolean;
  refreshModes: () => Promise<void>;
}

const AccountFeaturesContext = createContext<
  AccountFeaturesContextType | undefined
>(undefined);

const modesCacheKey = (userId: string) =>
  `riviera_account_game_modes_v1:${userId}`;

function readCachedModes(
  userId: string
): Record<GameModeId, boolean> | null {
  try {
    const raw = sessionStorage.getItem(modesCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<GameModeId, boolean>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedModes(
  userId: string,
  modes: Record<GameModeId, boolean>
): void {
  try {
    sessionStorage.setItem(modesCacheKey(userId), JSON.stringify(modes));
  } catch {
    /* ignore quota / private mode */
  }
}

export const AccountFeaturesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useUser();
  const [enabledModes, setEnabledModes] = useState<Record<
    GameModeId,
    boolean
  > | null>(() => (user?.id ? readCachedModes(user.id) : null));
  const [permiteAjustePuntosManuales, setPermiteAjustePuntosManuales] =
    useState(true);
  const [visibleRankingOficial, setVisibleRankingOficial] = useState(false);
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const refreshModes = useCallback(async () => {
    if (!user?.id) {
      setEnabledModes(null);
      setPermiteAjustePuntosManuales(true);
      setVisibleRankingOficial(false);
      setCoachingEnabled(true);
      setLoading(false);
      return;
    }
    // No vaciar enabledModes al refrescar: evita re-flash UPGRADE.
    // Si hay caché de sesión, úsala hasta que llegue la respuesta.
    const cached = readCachedModes(user.id);
    if (cached) setEnabledModes(cached);
    setLoading(true);
    try {
      const settings = await fetchOrganizadorAccountSettings(user.id);
      setEnabledModes(settings.modes);
      writeCachedModes(user.id, settings.modes);
      setPermiteAjustePuntosManuales(settings.permiteAjustePuntosManuales);
      setVisibleRankingOficial(settings.visibleRankingOficial);
      setCoachingEnabled(settings.coachingEnabled ?? true);
    } catch {
      // Mantener caché/previo si existe; null solo si nunca hubo dato.
      setEnabledModes((prev) => prev ?? readCachedModes(user.id));
      setPermiteAjustePuntosManuales(true);
      setVisibleRankingOficial(false);
      setCoachingEnabled(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshModes();
  }, [refreshModes]);

  const isModeEnabledFn = useCallback(
    (modeId: GameModeId) => isGameModeEnabled(enabledModes, modeId),
    [enabledModes]
  );

  const value = useMemo(
    () => ({
      enabledModes,
      permiteAjustePuntosManuales,
      visibleRankingOficial,
      coachingEnabled,
      loading,
      isModeEnabled: isModeEnabledFn,
      refreshModes,
    }),
    [
      enabledModes,
      permiteAjustePuntosManuales,
      visibleRankingOficial,
      coachingEnabled,
      loading,
      isModeEnabledFn,
      refreshModes,
    ]
  );

  return (
    <AccountFeaturesContext.Provider value={value}>
      {children}
    </AccountFeaturesContext.Provider>
  );
};

export function useAccountFeatures(): AccountFeaturesContextType {
  const ctx = useContext(AccountFeaturesContext);
  if (!ctx) {
    throw new Error(
      "useAccountFeatures must be used within AccountFeaturesProvider"
    );
  }
  return ctx;
}
