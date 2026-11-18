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
import { navigateCoaching } from "../coaching/coachingNav";
import { navigateRewards } from "../rewards/rewardsNav";
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
import { CompetitionModes, OrganizeModes } from "./GameModesGrid";
import { HomeContinueStrip } from "./HomeContinueStrip";
import { QuickStartSheet, type QuickStartPayload } from "./QuickStartSheet";
import { DashboardActionCard } from "./dashboard/DashboardActionCard";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import {
  getAccountModeDisabledMessage,
  useBranding,
} from "../../club-experience";
import "./home.css";
import "./dashboard/dashboard.css";

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

  const clubModules = [
    {
      key: "coaching",
      title: "Riviera Coaching",
      icon: "user-star",
      onClick: () => navigateCoaching("/coaching"),
    },
    {
      key: "rewards",
      title: "Riviera Rewards",
      icon: "gift",
      onClick: () => navigateRewards("/rewards"),
    },
    {
      key: "players",
      title: "Registro de jugadores",
      icon: "users",
      onClick: () => navigateJugadores(),
    },
    {
      key: "ranking",
      title: "Cómo funciona el ranking",
      icon: "trophy",
      onClick: () => navigateAppTo(buildRankingComoFuncionaPath()),
    },
    ...(onShowAllRetas
      ? [{ key: "history", title: "Historial", icon: "history", onClick: onShowAllRetas }]
      : []),
  ];

  return (
    <div className="home-inner ops-root rv-page">
      <div className="ops-dashboard">
        <header className="ops-head">
          <h1>Centro de operaciones</h1>
          <p>Gestiona tus actividades, competencias y jugadores desde un solo lugar.</p>
        </header>

        {error ? <p className="ops-error">{error}</p> : null}

        <OrganizeModes onModeSelect={handleModeSelect} isModeEnabled={isModeEnabled} />

        <HomeContinueStrip items={activeRetas} onContinue={handleContinueItem} />

        <CompetitionModes onModeSelect={handleModeSelect} isModeEnabled={isModeEnabled} />

        <section className="ops-section home-access" aria-labelledby="ops-admin-title">
          <h2 id="ops-admin-title">Administración del club</h2>
          <div className="ops-admin">
            {clubModules.map((module) => (
              <DashboardActionCard
                key={module.key}
                title={module.title}
                icon={module.icon}
                onClick={module.onClick}
                className="home-access-card"
              />
            ))}
          </div>
        </section>

        <AppSiteFooter />
      </div>
    </div>
  );
};

export default HomeDashboard;
