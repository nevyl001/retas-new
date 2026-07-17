import React, { useCallback, useState } from "react";
import {
  createTournament,
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
import { navigateTorneoExpress } from "../torneo-express/torneoExpressNav";
import { navigateAppTo } from "../../lib/appRouting";
import { buildRankingComoFuncionaPath } from "../jugadores/jugadoresPublicNav";
import { navigateJugadores } from "../jugadores/jugadoresNav";
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
import { HomeCreateEventCta } from "./HomeCreateEventCta";
import { QuickStartSheet, QuickStartPayload } from "./QuickStartSheet";
import { RecentRetasSection } from "./RecentRetasSection";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import {
  getAccountModeDisabledMessage,
  getOrganizerRegistryCardSubtitle,
  useBranding,
} from "../../club-experience";
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
  const { nombre: organizerName } = useBranding();
  const { isModeEnabled } = useAccountFeatures();
  const [sheetMode, setSheetMode] = useState<GameModeId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModeSelect = useCallback(
    async (modeId: GameModeId) => {
      setError(null);
      if (!isModeEnabled(modeId)) {
        setError(
          getAccountModeDisabledMessage(GAME_MODE_LABELS[modeId], organizerName)
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
      // Americano (y demás modos de sheet): siempre flujo de crear nuevo.
      // Los activos se retoman desde "En curso", no hijackean "Nuevo".
      setSheetMode(modeId);
    },
    [isModeEnabled, organizerName]
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
      <div className="home-hero">
        <HomeHeader
          userName={userProfile?.name}
          title="¿Qué quieres organizar hoy?"
          subtitle="Crea un evento o continúa uno en curso."
        />
        <HomeCreateEventCta
          onModeSelect={handleModeSelect}
          isModeEnabled={isModeEnabled}
        />
      </div>
      {error && <p className="home-error">{error}</p>}
      <RecentRetasSection
        userId={userId}
        onSelectTournament={onTournamentSelect}
        onShowAll={onShowAllRetas}
      />
      <section
        className="home-quick-links home-quick-links--tertiary"
        aria-label="Accesos rápidos"
      >
        <h2 className="home-section-title">Accesos rápidos</h2>
        <div className="home-quick-links__grid home-quick-links__grid--compact">
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
                {getOrganizerRegistryCardSubtitle(organizerName)}
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
                Sistema de puntos y niveles del club
              </span>
            </span>
            <TablerIcon
              name="chevron-right"
              size={20}
              className="home-quick-card__chev"
            />
          </button>
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
