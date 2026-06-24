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
  loading: boolean;
  isModeEnabled: (modeId: GameModeId) => boolean;
  refreshModes: () => Promise<void>;
}

const AccountFeaturesContext = createContext<
  AccountFeaturesContextType | undefined
>(undefined);

export const AccountFeaturesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useUser();
  const [enabledModes, setEnabledModes] = useState<Record<
    GameModeId,
    boolean
  > | null>(null);
  const [permiteAjustePuntosManuales, setPermiteAjustePuntosManuales] =
    useState(true);
  const [visibleRankingOficial, setVisibleRankingOficial] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshModes = useCallback(async () => {
    if (!user?.id) {
      setEnabledModes(null);
      setPermiteAjustePuntosManuales(true);
      setVisibleRankingOficial(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const settings = await fetchOrganizadorAccountSettings(user.id);
      setEnabledModes(settings.modes);
      setPermiteAjustePuntosManuales(settings.permiteAjustePuntosManuales);
      setVisibleRankingOficial(settings.visibleRankingOficial);
    } catch {
      setEnabledModes(null);
      setPermiteAjustePuntosManuales(true);
      setVisibleRankingOficial(false);
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
      loading,
      isModeEnabled: isModeEnabledFn,
      refreshModes,
    }),
    [
      enabledModes,
      permiteAjustePuntosManuales,
      visibleRankingOficial,
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
