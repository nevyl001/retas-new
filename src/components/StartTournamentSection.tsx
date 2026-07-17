import React, { useMemo, useState, useEffect } from "react";
import { useClubModeEyebrow } from "../club-experience";
import { Tournament, Pair } from "../lib/database";
import {
  getStartFormatLabel,
  resolveTournamentStartFormat,
} from "../lib/gameModeMapping";
import { Card, Input } from "./ui";
import {
  QuickModeHero,
  QuickModePrimaryCta,
} from "./platform/quickMode";

interface StartTournamentSectionProps {
  tournament: Tournament;
  pairs: Pair[];
  loading: boolean;
  onStartTournament: (opts: {
    format: "roundRobin" | "teams";
    teamsCount?: number;
    teamNames?: string[];
    pairToTeam?: Record<string, number>;
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

  const [teamsCount, setTeamsCount] = useState<number>(2);
  const [teamNames, setTeamNames] = useState<string[]>(["Equipo 1", "Equipo 2"]);
  const [pairToTeam, setPairToTeam] = useState<Record<string, number>>({});

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
    setTeamNames((prev) => {
      const next = [...prev.slice(0, n)];
      while (next.length < n) next.push(`Equipo ${next.length + 1}`);
      return next;
    });
    const sortedPairs = [...pairs].sort((a, b) => a.id.localeCompare(b.id));
    const next: Record<string, number> = {};
    sortedPairs.forEach((p, idx) => {
      next[p.id] = idx % n;
    });
    setPairToTeam(next);
  }, [format, teamsCount, pairs]);

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
        label={loading ? "Iniciando…" : "Iniciar"}
        disabled={!canStart}
        loading={loading}
        hint={ctaHint}
        onClick={() =>
          onStartTournament({
            format,
            teamsCount: format === "teams" ? teamsCount : undefined,
            teamNames: format === "teams" ? teamNames : undefined,
            pairToTeam: format === "teams" ? pairToTeam : undefined,
          })
        }
      />

      {format === "teams" && pairs.length >= 2 && (
        <Card variant="elevated" className="start-tournament-section__teams">
          <p className="riviera-label">Organiza tus equipos</p>
          <div className="start-tournament-section__teams-toolbar">
            <Input
              type="number"
              label="Número de equipos"
              className="start-tournament-section__teams-count"
              min={2}
              max={Math.max(2, pairs.length)}
              value={teamsCount}
              onChange={(e) =>
                setTeamsCount(parseInt(e.target.value || "2", 10))
              }
              disabled={loading}
            />
          </div>

          {teamsPreview?.map((t) => (
            <div key={t.teamIndex} className="start-tournament-section__team-block">
              <Input
                type="text"
                value={teamNames[t.teamIndex] ?? `Equipo ${t.teamIndex + 1}`}
                onChange={(e) => {
                  const next = [...teamNames];
                  next[t.teamIndex] =
                    e.target.value || `Equipo ${t.teamIndex + 1}`;
                  setTeamNames(next);
                }}
                disabled={loading}
              />
              <div className="start-tournament-section__pair-list">
                {t.pairs.map((p) => (
                  <div key={p.id} className="start-tournament-section__pair-row">
                    <span>
                      {p.player1_name} / {p.player2_name}
                    </span>
                    <select
                      className="riviera-input start-tournament-section__pair-move"
                      value={pairToTeam[p.id] ?? t.teamIndex}
                      onChange={(e) => {
                        setPairToTeam((prev) => ({
                          ...prev,
                          [p.id]: parseInt(e.target.value, 10),
                        }));
                      }}
                      disabled={loading}
                    >
                      {teamsPreview.map((other) => (
                        <option key={other.teamIndex} value={other.teamIndex}>
                          {teamNames[other.teamIndex] ??
                            `Equipo ${other.teamIndex + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default StartTournamentSection;
