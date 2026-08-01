import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTournament,
  Tournament,
} from "../../lib/database";
import {
  markTournamentAsAmericano,
  navigateToAmericanoDinamico,
  persistAmericanoActiveTournamentId,
} from "../../lib/americanoDinamicoStorage";
import { useAccountFeatures } from "../../contexts/AccountFeaturesContext";
import { GAME_MODE_LABELS } from "../../lib/admin/organizadorGameModes";
import { navigateLiga } from "../liga/ligaNav";
import { navigateDuelo2v2, duelo2v2GestionarPath } from "../duelo-2v2/duelo2v2Nav";
import { navigateTorneoExpress } from "../torneo-express/torneoExpressNav";
import { navigateAppTo } from "../../lib/appRouting";
import { buildRankingComoFuncionaPath } from "../jugadores/jugadoresPublicNav";
import { navigateJugadores } from "../jugadores/jugadoresNav";
import { TablerIcon } from "../ui/TablerIcon";
import { type GameModeId } from "./gameModesConfig";
import {
  gameModeIdToTournamentFormat,
  persistLastGameMode,
  persistTournamentGameMode,
  persistTournamentMode,
} from "../../lib/gameModeMapping";
import { initChampionshipConfig } from "../../lib/roundRobinChampionship";
import {
  loadUserRetasForHome,
  partitionHomeRetas,
  type HomeRetaItem,
} from "../../lib/retasList";
import { saveRetaConfig } from "../../lib/reta/updateRetaConfig";
import { GameModesGrid } from "./GameModesGrid";
import { HomeContinueStrip } from "./HomeContinueStrip";
import { QuickStartSheet, type QuickStartPayload } from "./QuickStartSheet";
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
  const { nombre: organizerName } = useBranding();
  const { isModeEnabled } = useAccountFeatures();
  const [createModeId, setCreateModeId] = useState<GameModeId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retas, setRetas] = useState<HomeRetaItem[]>([]);

  useEffect(() => {
    if (!userId) {
      setRetas([]);
      return;
    }
    let active = true;
    loadUserRetasForHome(userId)
      .then((data) => {
        if (active) setRetas(data);
      })
      .catch(() => {
        if (active) setRetas([]);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const { active: activeRetas } = useMemo(() => partitionHomeRetas(retas), [retas]);

  const handleContinueItem = useCallback(
    (item: HomeRetaItem) => {
      if (item.kind === "duelo-2v2") {
        navigateDuelo2v2(duelo2v2GestionarPath(item.duelo.id));
        return;
      }
      onTournamentSelect(item.tournament);
    },
    [onTournamentSelect]
  );

  const handleModeSelect = useCallback(
    (modeId: GameModeId) => {
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
      // Duelo: formulario Nuevo. Crea en BD solo al Guardar.
      if (modeId === "duelo-2v2") {
        navigateDuelo2v2("/duelo-2v2/nuevo");
        return;
      }
      // Reta: Detalles completos. Crea en BD solo al Guardar.
      setCreateModeId(modeId);
    },
    [isModeEnabled, organizerName]
  );

  const handleCreateSave = useCallback(
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

        const saveResult = await saveRetaConfig({
          tournament,
          matches: [],
          phase: "draft",
          values: payload.values,
          loadedUpdatedAt: tournament.updated_at || null,
        });
        const ready =
          saveResult.ok ? saveResult.tournament : tournament;

        if (payload.modeId === "round-robin" && payload.championshipEnabled) {
          initChampionshipConfig(tournament.id, {
            enabled: true,
            rounds: payload.championshipRounds ?? 2,
          });
        }
        setCreateModeId(null);

        if (payload.modeId === "americano") {
          markTournamentAsAmericano(ready.id);
          persistAmericanoActiveTournamentId(ready.id);
          navigateToAmericanoDinamico(ready.id, userId);
          return;
        }

        onTournamentSelect({
          ...ready,
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

  if (createModeId) {
    return (
      <div className="home-inner rv-page">
        {error && <p className="home-error">{error}</p>}
        <QuickStartSheet
          key={createModeId}
          modeId={createModeId}
          onClose={() => !submitting && setCreateModeId(null)}
          onSubmit={handleCreateSave}
          submitting={submitting}
        />
        <AppSiteFooter />
      </div>
    );
  }

  return (
    <div className="home-inner rv-page">
      <h1 className="home-question">¿Qué quieres organizar hoy?</h1>

      {error && <p className="home-error">{error}</p>}

      <div
        className={`home-shell${
          activeRetas.length > 0 ? " home-shell--with-panel" : ""
        }`}
      >
        <div className="home-shell__main">
          <GameModesGrid
            onModeSelect={handleModeSelect}
            isModeEnabled={isModeEnabled}
          />
        </div>
        <HomeContinueStrip items={activeRetas} onContinue={handleContinueItem} />
      </div>

      <section className="home-access" aria-label="Accesos rápidos">
        <h2 className="home-section-title">Accesos rápidos</h2>
        <div className="home-access__grid">
          <button
            type="button"
            className="home-access-card home-access-card--primary"
            onClick={() => navigateJugadores()}
          >
            <span className="home-access-card__icon" aria-hidden>
              <TablerIcon name="users" size={26} />
            </span>
            <span className="home-access-card__body">
              <span className="home-access-card__title">Registro de jugadores</span>
              <span className="home-access-card__desc">
                {getOrganizerRegistryCardSubtitle(organizerName)}
              </span>
            </span>
            <TablerIcon name="chevron-right" size={20} className="home-access-card__go" />
          </button>

          <button
            type="button"
            className="home-access-card"
            onClick={() => navigateAppTo(buildRankingComoFuncionaPath())}
          >
            <span className="home-access-card__icon" aria-hidden>
              <TablerIcon name="trophy" size={22} />
            </span>
            <span className="home-access-card__body">
              <span className="home-access-card__title">Cómo funciona el ranking</span>
              <span className="home-access-card__desc">
                Conoce el sistema de puntos y niveles.
              </span>
            </span>
            <TablerIcon name="chevron-right" size={20} className="home-access-card__go" />
          </button>

          {onShowAllRetas ? (
            <button type="button" className="home-access-card" onClick={onShowAllRetas}>
              <span className="home-access-card__icon" aria-hidden>
                <TablerIcon name="history" size={22} />
              </span>
              <span className="home-access-card__body">
                <span className="home-access-card__title">Historial</span>
                <span className="home-access-card__desc">
                  Consulta eventos pasados y resultados.
                </span>
              </span>
              <TablerIcon name="chevron-right" size={20} className="home-access-card__go" />
            </button>
          ) : null}
        </div>
      </section>

      <AppSiteFooter />
    </div>
  );
};

export default HomeDashboard;
