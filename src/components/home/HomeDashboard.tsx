import React, { useCallback, useRef, useState } from "react";
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
import { useAccountFeatures } from "../../contexts/AccountFeaturesContext";
import { GAME_MODE_LABELS } from "../../lib/admin/organizadorGameModes";
import { navigateLiga } from "../liga/ligaNav";
import { navigateDuelo2v2 } from "../duelo-2v2/duelo2v2Nav";
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
import { initChampionshipConfig } from "../../lib/roundRobinChampionship";
import { HomeHeader } from "./HomeHeader";
import { GameModesGrid } from "./GameModesGrid";
import { QuickStartSheet, QuickStartPayload } from "./QuickStartSheet";
import { RecentRetasSection } from "./RecentRetasSection";
import { AppSiteFooter } from "../legal/AppSiteFooter";
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
  const { isModeEnabled } = useAccountFeatures();
  const [sheetMode, setSheetMode] = useState<GameModeId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const americanoResumeRef = useRef(false);

  const handleModeSelect = useCallback(
    async (modeId: GameModeId) => {
      setError(null);
      if (!isModeEnabled(modeId)) {
        setError(
          `${GAME_MODE_LABELS[modeId]} no está habilitado para tu cuenta. Contacta a Riviera Open.`
        );
        return;
      }
      persistLastGameMode(modeId);
      if (modeId === "mini-torneo") {
        navigateTorneoExpress("/torneo-express");
        return;
      }
      if (modeId === "liga") {
        navigateLiga("/liga");
        return;
      }
      if (modeId === "duelo-2v2") {
        navigateDuelo2v2("/duelo-2v2/nuevo");
        return;
      }
      if (modeId === "americano") {
        setSheetMode("americano");
        if (!userId || americanoResumeRef.current) return;
        americanoResumeRef.current = true;
        void findResumableAmericanoTournament(userId)
          .then((existing) => {
            if (existing) {
              setSheetMode(null);
              navigateToAmericanoDinamico(existing.id, userId);
            }
          })
          .catch(() => {
            /* sheet ya abierto: crear nueva reta */
          })
          .finally(() => {
            americanoResumeRef.current = false;
          });
        return;
      }
      setSheetMode(modeId);
    },
    [userId, isModeEnabled]
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
        if (payload.modeId === "round-robin" && payload.championshipEnabled) {
          initChampionshipConfig(tournament.id, {
            enabled: true,
            rounds: payload.championshipRounds ?? 2,
          });
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
    <div className="home-inner rv-page">
      <HomeHeader userName={userProfile?.name} />
      <GameModesGrid onModeSelect={handleModeSelect} isModeEnabled={isModeEnabled} />
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
      <AppSiteFooter />
    </div>
  );
};
