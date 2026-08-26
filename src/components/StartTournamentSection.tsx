import React, { useMemo, useState, useEffect } from "react";
import { useClubModeEyebrow } from "../club-experience";
import { Tournament, Pair } from "../lib/database";
import {
  getStartFormatLabel,
  resolveTournamentStartFormat,
} from "../lib/gameModeMapping";
import {
  getTeamConfigFromStorage,
  mergePairToTeamAssignments,
  resizeTeamLogosArray,
  resizeTeamNamesArray,
  saveTeamConfigToStorage,
} from "../lib/standingsUtils";
import {
  QuickModeHero,
  QuickModePrimaryCta,
} from "./platform/quickMode";
import { RetaEquiposOrganizerCards } from "./reta/equipos/RetaEquiposOrganizerCards";
import "./reta/equipos/reta-equipos.css";

interface StartTournamentSectionProps {
  tournament: Tournament;
  pairs: Pair[];
  loading: boolean;
  onStartTournament: (opts: {
    format: "roundRobin" | "teams";
    teamsCount?: number;
    teamNames?: string[];
    pairToTeam?: Record<string, number>;
    teamLogos?: (string | null)[];
  }) => void;
}

export const StartTournamentSection: React.FC<StartTournamentSectionProps> = ({
  tournament,
  pairs,
  loading,
  onStartTournament,
}) => {
  const modeEyebrow = useClubModeEyebrow();
  const format = useMemo(
    () => resolveTournamentStartFormat(tournament),
    [tournament]
  );

  const [teamsCount, setTeamsCount] = useState<number>(() => {
    const draft = getTeamConfigFromStorage(tournament.id);
    return draft?.teamNames?.length || 2;
  });
  const [teamNames, setTeamNames] = useState<string[]>(() => {
    const draft = getTeamConfigFromStorage(tournament.id);
    return draft?.teamNames?.length ? [...draft.teamNames] : ["", ""];
  });
  const [pairToTeam, setPairToTeam] = useState<Record<string, number>>(() => {
    const draft = getTeamConfigFromStorage(tournament.id);
    return draft?.pairToTeam ? { ...draft.pairToTeam } : {};
  });
  const [teamLogos, setTeamLogos] = useState<(string | null)[]>(() => {
    const draft = getTeamConfigFromStorage(tournament.id);
    return resizeTeamLogosArray(draft?.teamLogos, draft?.teamNames?.length || 2);
  });

  const safeTeams = useMemo(
    () =>
      format === "teams" && teamsCount >= 2
        ? Math.min(teamsCount, Math.max(2, pairs.length))
        : 2,
    [format, teamsCount, pairs.length]
  );

  useEffect(() => {
    if (format !== "teams" || teamsCount < 2 || pairs.length === 0) return;
    const n = Math.min(teamsCount, pairs.length);
    setTeamNames((prev) => resizeTeamNamesArray(prev, n));
    setTeamLogos((prev) => resizeTeamLogosArray(prev, n));
    setPairToTeam((prev) =>
      mergePairToTeamAssignments({
        pairIds: pairs.map((p) => p.id),
        teamsCount: n,
        previous: prev,
      })
    );
  }, [format, teamsCount, pairs]);

  useEffect(() => {
    if (format !== "teams" || !tournament.id) return;
    if (Object.keys(pairToTeam).length === 0) return;
    saveTeamConfigToStorage(tournament.id, {
      teamNames: resizeTeamNamesArray(teamNames, Math.max(2, teamsCount)),
      pairToTeam,
      teamLogos: resizeTeamLogosArray(teamLogos, Math.max(2, teamsCount)),
    });
  }, [format, tournament.id, teamNames, pairToTeam, teamLogos, teamsCount]);

  const teamsPreview = useMemo(() => {
    if (format !== "teams" || safeTeams < 2 || pairs.length < 2) return null;
    const teams: Array<{ teamIndex: number; pairs: Pair[] }> = Array.from(
      { length: safeTeams },
      (_, i) => ({ teamIndex: i, pairs: [] })
    );
    pairs.forEach((p) => {
      const teamIdx = pairToTeam[p.id] ?? 0;
      if (teamIdx >= 0 && teamIdx < teams.length) {
        teams[teamIdx].pairs.push(p);
      }
    });
    return teams;
  }, [format, pairs, pairToTeam, safeTeams]);

  const isTeamsConfigValid =
    format !== "teams" || (teamsCount >= 2 && teamsCount <= pairs.length);

  const canStart =
    !loading &&
    pairs.length >= 2 &&
    isTeamsConfigValid &&
    !tournament.is_started;

  if (tournament.is_started) return null;

  const modeLabel = getStartFormatLabel(format);
  const modeSubtitle =
    format === "teams"
      ? "Organiza equipos, asigna parejas e inicia la competencia."
      : "Selecciona las parejas y lanza tu reta en round robin.";

  const eventName = tournament.name?.trim() || modeLabel;
  const duration =
    tournament.programado_en && tournament.programado_hasta
      ? Math.round(
          (new Date(tournament.programado_hasta).getTime() -
            new Date(tournament.programado_en).getTime()) /
            60000
        )
      : null;

  const ctaHint =
    pairs.length === 0
      ? "Aún no hay parejas — abre Registro y Equipos abajo."
      : pairs.length === 1
        ? "Necesitas al menos 2 parejas para iniciar."
        : format === "teams" && !isTeamsConfigValid
          ? "Revisa la organización de equipos."
          : null;

  return (
    <div className="start-tournament-section start-tournament-section--v2 qm-prep">
      <QuickModeHero
        eyebrow={modeEyebrow}
        title={eventName}
        subtitle={modeSubtitle}
        statusLabel="Preparación"
        stats={[
          { label: "Estado", value: "Pendiente" },
          { label: "Equipos", value: pairs.length },
          { label: "Canchas", value: tournament.courts ?? "—" },
          {
            label: "Duración",
            value: duration != null && duration > 0 ? `${duration} min` : "—",
          },
        ]}
      />

      <QuickModePrimaryCta
        label="Iniciar"
        loadingLabel="Calculando partidos…"
        disabled={!canStart}
        loading={loading}
        hint={ctaHint}
        onClick={() =>
          onStartTournament({
            format,
            teamsCount: format === "teams" ? teamsCount : undefined,
            teamNames:
              format === "teams"
                ? teamNames.map((name, i) => name.trim() || `Equipo ${i + 1}`)
                : undefined,
            pairToTeam: format === "teams" ? pairToTeam : undefined,
            teamLogos:
              format === "teams"
                ? resizeTeamLogosArray(teamLogos, Math.max(2, teamsCount))
                : undefined,
          })
        }
      />

      {format === "teams" && pairs.length >= 2 && teamsPreview ? (
        <RetaEquiposOrganizerCards
          tournamentId={tournament.id}
          organizadorId={tournament.user_id?.trim() || null}
          teamsCount={teamsCount}
          maxTeams={pairs.length}
          teamNames={teamNames}
          teamLogos={teamLogos}
          teamsPreview={teamsPreview}
          pairToTeam={pairToTeam}
          loading={loading}
          onTeamsCountChange={setTeamsCount}
          onTeamNameChange={(teamIndex, name) => {
            setTeamNames((prev) => {
              const next = [...prev];
              next[teamIndex] = name;
              return next;
            });
          }}
          onTeamLogoChange={(teamIndex, url) => {
            setTeamLogos((prev) => {
              const next = resizeTeamLogosArray(prev, Math.max(2, teamsCount));
              next[teamIndex] = url;
              return next;
            });
          }}
          onPairTeamChange={(pairId, teamIndex) => {
            setPairToTeam((prev) => ({
              ...prev,
              [pairId]: teamIndex,
            }));
          }}
        />
      ) : null}
    </div>
  );
};

export default StartTournamentSection;
