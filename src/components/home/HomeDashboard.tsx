import React, { useCallback, useState } from "react";
import {
  createTournament,
  findResumableAmericanoTournament,
  Tournament,
} from "../../lib/database";
import {
  markTournamentAsAmericano,
  navigateToAmericanoDinamico,
  persistAmericanoActiveTournamentId,
} from "../../lib/americanoDinamicoStorage";
import { useUser } from "../../contexts/UserContext";
import { navigateTorneoExpress } from "../torneo-express/torneoExpressNav";
import type { GameModeId } from "./gameModesConfig";
import {
  gameModeIdToTournamentFormat,
  persistLastGameMode,
  persistTournamentMode,
} from "../../lib/gameModeMapping";
import { HomeHeader } from "./HomeHeader";
import { GameModesGrid } from "./GameModesGrid";
import { QuickStartSheet, QuickStartPayload } from "./QuickStartSheet";
import { RecentRetasSection } from "./RecentRetasSection";
import "./home.css";

interface HomeDashboardProps {
  userId?: string;
  onTournamentSelect: (tournament: Tournament) => void;
  onShowAllRetas?: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  userId,
  onTournamentSelect,
  onShowAllRetas,
}) => {
  const { userProfile } = useUser();
  const [sheetMode, setSheetMode] = useState<GameModeId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModeSelect = useCallback(
    async (modeId: GameModeId) => {
      setError(null);
      persistLastGameMode(modeId);
      if (modeId === "mini-torneo") {
        navigateTorneoExpress("/torneo-express/nuevo");
        return;
      }
      if (modeId === "americano" && userId) {
        try {
          const existing = await findResumableAmericanoTournament(userId);
          if (existing) {
            navigateToAmericanoDinamico(existing.id, userId);
            return;
          }
        } catch {
          /* abrir sheet de configuración */
        }
      }
      setSheetMode(modeId);
    },
    [userId]
  );

  const handleQuickStart = useCallback(
    async (payload: QuickStartPayload) => {
      if (!userId) {
        setError("Debes iniciar sesión");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        if (payload.modeId === "americano") {
          const existing = await findResumableAmericanoTournament(userId);
          if (existing) {
            setSheetMode(null);
            navigateToAmericanoDinamico(existing.id, userId);
            return;
          }
        }

        const dbFormat = gameModeIdToTournamentFormat(payload.modeId);
        const tournament = await createTournament(
          payload.name,
          userId,
          payload.description,
          payload.courts,
          dbFormat
        );
        persistLastGameMode(payload.modeId);
        if (dbFormat) {
          persistTournamentMode(tournament.id, dbFormat);
        }
        setSheetMode(null);

        if (payload.modeId === "americano") {
          markTournamentAsAmericano(tournament.id);
          persistAmericanoActiveTournamentId(tournament.id);
          navigateToAmericanoDinamico(tournament.id, userId);
          return;
        }

        onTournamentSelect({
          ...tournament,
          ...(dbFormat ? { format: dbFormat } : {}),
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la reta");
      } finally {
        setSubmitting(false);
      }
    },
    [userId, onTournamentSelect]
  );

  return (
    <div className="home-container">
      <HomeHeader userName={userProfile?.name} />
      <GameModesGrid onModeSelect={handleModeSelect} />
      {error && <p className="home-error">{error}</p>}
      <RecentRetasSection userId={userId} onSelectTournament={onTournamentSelect} />
      {onShowAllRetas && (
        <div className="home-secondary-actions">
          <button type="button" className="home-link-btn" onClick={onShowAllRetas}>
            Gestionar todas mis retas →
          </button>
        </div>
      )}
      <QuickStartSheet
        modeId={sheetMode}
        onClose={() => !submitting && setSheetMode(null)}
        onSubmit={handleQuickStart}
        submitting={submitting}
      />
    </div>
  );
};
