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
import { GAME_MODES, type GameModeId } from "./gameModesConfig";
import {
  gameModeIdToTournamentFormat,
  persistLastGameMode,
  persistTournamentGameMode,
  persistTournamentMode,
} from "../../lib/gameModeMapping";
import {
  filterHomeRetasByGameMode,
  loadUserRetasForHome,
  partitionHomeRetas,
  type HomeRetaItem,
} from "../../lib/retasList";
import { GameModesGrid } from "./GameModesGrid";
import { HomeContinueStrip } from "./HomeContinueStrip";
import { HomeModeDetail } from "./HomeModeDetail";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import {
  getAccountModeDisabledMessage,
  getOrganizerRegistryCardSubtitle,
  useBranding,
  useConvocatoriaOriginName,
} from "../../club-experience";
import { CANCHA_DEFAULT_VALUE } from "../../lib/torneoExpress/canchaDisplay";
import { partidoDateInputValue } from "../../lib/torneoExpress/partidoSchedule";
import { saveNewDuelo2v2 } from "../../lib/duelo2v2/saveNewDuelo";
import { createDuelo2v2OpenDraft } from "../../services/duelo2v2Service";
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
  const convocatoriaOrigin = useConvocatoriaOriginName();
  const { isModeEnabled } = useAccountFeatures();
  const [detailModeId, setDetailModeId] = useState<GameModeId | null>(null);
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

  const startTournamentMode = useCallback(
    async (modeId: GameModeId) => {
      if (!userId) {
        setError("Debes iniciar sesión");
        return;
      }
      const mode = GAME_MODES.find((m) => m.id === modeId);
      setSubmitting(true);
      setError(null);
      try {
        const dbFormat = gameModeIdToTournamentFormat(modeId);
        const tournament = await createTournament(
          `Reta ${mode?.title ?? "nueva"}`,
          userId,
          undefined,
          2,
          dbFormat
        );
        persistLastGameMode(modeId);
        persistTournamentGameMode(tournament.id, modeId);
        if (dbFormat) {
          persistTournamentMode(tournament.id, dbFormat);
        }

        if (modeId === "americano") {
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

  const startDueloMode = useCallback(async () => {
    if (!userId) {
      setError("Debes iniciar sesión");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const date = partidoDateInputValue(new Date().toISOString());
      await saveNewDuelo2v2(
        {
          organizadorId: userId,
          nombre: `Duelo ${date}`,
          cancha: CANCHA_DEFAULT_VALUE,
          lugar: convocatoriaOrigin || organizerName,
          mostrarLugar: true,
          draftDate: date,
          draftTimeStart: "15:00",
          draftTimeEnd: "17:00",
        },
        {
          createDuelo2v2OpenDraft,
          navigate: navigateDuelo2v2,
          gestionarPath: duelo2v2GestionarPath,
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el duelo");
    } finally {
      setSubmitting(false);
    }
  }, [userId, convocatoriaOrigin, organizerName]);

  const handleModeSelect = useCallback(
    (modeId: GameModeId) => {
      if (submitting) return;
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
        void startDueloMode();
        return;
      }
      // Si ya hay activas de ese modo, ofrecer continuar; si no, crear y abrir prep.
      const modeRetas = filterHomeRetasByGameMode(retas, modeId);
      if (modeRetas.length > 0) {
        setDetailModeId(modeId);
        return;
      }
      void startTournamentMode(modeId);
    },
    [
      submitting,
      isModeEnabled,
      organizerName,
      retas,
      startDueloMode,
      startTournamentMode,
    ]
  );

  const detailMode = detailModeId
    ? GAME_MODES.find((m) => m.id === detailModeId) ?? null
    : null;

  return (
    <div className="home-inner rv-page">
      <h1 className="home-question">¿Qué quieres organizar hoy?</h1>

      {error && <p className="home-error">{error}</p>}
      {submitting && !error ? (
        <p className="home-muted" role="status">
          Abriendo modo…
        </p>
      ) : null}

      {detailMode ? (
        <HomeModeDetail
          mode={detailMode}
          items={filterHomeRetasByGameMode(retas, detailMode.id)}
          onContinue={handleContinueItem}
          onCreateNew={() => {
            setDetailModeId(null);
            if (detailMode.id === "duelo-2v2") {
              void startDueloMode();
              return;
            }
            void startTournamentMode(detailMode.id);
          }}
          onBack={() => setDetailModeId(null)}
        />
      ) : (
        <>
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
        </>
      )}

      <AppSiteFooter />
    </div>
  );
};
