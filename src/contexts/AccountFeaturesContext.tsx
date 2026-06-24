import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { GameModeId } from "../components/home/gameModesConfig";
import { fetchOrganizadorGameModes } from "../lib/admin/accountControls";
import { isGameModeEnabled } from "../lib/admin/organizadorGameModes";
import { useUser } from "./UserContext";

interface AccountFeaturesContextType {
  enabledModes: Record<GameModeId, boolean> | null;
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
  const [loading, setLoading] = useState(true);

  const refreshModes = useCallback(async () => {
    if (!user?.id) {
      setEnabledModes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const modes = await fetchOrganizadorGameModes(user.id);
      setEnabledModes(modes);
    } catch {
      setEnabledModes(null);
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
      loading,
      isModeEnabled: isModeEnabledFn,
      refreshModes,
    }),
    [enabledModes, loading, isModeEnabledFn, refreshModes]
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
