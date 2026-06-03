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
import { navigateLiga } from "../liga/ligaNav";
import { navigateAppTo } from "../../lib/appRouting";
import { buildRankingComoFuncionaPath } from "../jugadores/jugadoresPublicNav";
import { navigateJugadores } from "../jugadores/jugadoresNav";
import { navigateTorneoExpress } from "../torneo-express/torneoExpressNav";
import { TablerIcon } from "../ui/TablerIcon";
import type { GameModeId } from "./gameModesConfig";
import {
  gameModeIdToTournamentFormat,
  persistLastGameMode,
  persistTournamentGameMode,
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
        navigateTorneoExpress("/torneo-express");
        return;
      }
      if (modeId === "liga") {
        navigateLiga("/liga");
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
        persistTournamentGameMode(tournament.id, payload.modeId);
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
    <div className="home-inner">
      <HomeHeader userName={userProfile?.name} />
      <GameModesGrid onModeSelect={handleModeSelect} />
      {error && <p className="home-error">{error}</p>}
      <RecentRetasSection userId={userId} onSelectTournament={onTournamentSelect} />
      <section className="home-quick-links" aria-label="Accesos de organización">
        <h2 className="home-section-title">Organización</h2>
        <div className="home-quick-links__grid">
          <button
            type="button"
            className="home-quick-card home-quick-card--jugadores"
            onClick={() => navigateJugadores()}
          >
            <span className="home-quick-card__icon" aria-hidden>
              <TablerIcon name="users" size={22} />
            </span>
            <span className="home-quick-card__body">
              <span className="home-quick-card__title">Registro de jugadores</span>
              <span className="home-quick-card__sub">
                Riviera Open · fichas, categorías e historial
              </span>
            </span>
            <TablerIcon
              name="chevron-right"
              size={20}
              className="home-quick-card__chev"
            />
          </button>
          <button
            type="button"
            className="home-quick-card home-quick-card--ranking"
            onClick={() => navigateAppTo(buildRankingComoFuncionaPath())}
          >
            <span className="home-quick-card__icon" aria-hidden>
              <TablerIcon name="trophy" size={22} />
            </span>
            <span className="home-quick-card__body">
              <span className="home-quick-card__title">Cómo funciona el ranking</span>
              <span className="home-quick-card__sub">
                Sistema de puntos Riviera Open · comparte con jugadores
              </span>
            </span>
            <TablerIcon
              name="chevron-right"
              size={20}
              className="home-quick-card__chev"
            />
          </button>
          {onShowAllRetas && (
            <button
              type="button"
              className="home-quick-card home-quick-card--retas"
              onClick={onShowAllRetas}
            >
              <span className="home-quick-card__icon" aria-hidden>
                <TablerIcon name="layout-list" size={22} />
              </span>
              <span className="home-quick-card__body">
                <span className="home-quick-card__title">Gestionar mis retas</span>
                <span className="home-quick-card__sub">
                  Ver, abrir y administrar todas tus retas
                </span>
              </span>
              <TablerIcon
                name="chevron-right"
                size={20}
                className="home-quick-card__chev"
              />
            </button>
          )}
        </div>
      </section>
      <QuickStartSheet
        modeId={sheetMode}
        onClose={() => !submitting && setSheetMode(null)}
        onSubmit={handleQuickStart}
        submitting={submitting}
      />
    </div>
  );
};
