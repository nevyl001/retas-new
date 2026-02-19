import React, { useMemo, useState, useEffect } from "react";
import { Tournament, Pair } from "../lib/database";

type TournamentFormat = "roundRobin" | "teams";

interface StartTournamentSectionProps {
  tournament: Tournament;
  pairs: Pair[];
  loading: boolean;
  onStartTournament: (opts: {
    format: TournamentFormat;
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
  const [format, setFormat] = useState<TournamentFormat>("roundRobin");
  const [teamsCount, setTeamsCount] = useState<number>(2);
  const [teamNames, setTeamNames] = useState<string[]>(["Equipo 1", "Equipo 2"]);
  const [pairToTeam, setPairToTeam] = useState<Record<string, number>>({});

  const safeTeams = useMemo(
    () => (format === "teams" && teamsCount >= 2 ? Math.min(teamsCount, Math.max(2, pairs.length)) : 2),
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

  const roundRobinMatchCount = useMemo(() => {
    return (pairs.length * (pairs.length - 1)) / 2;
  }, [pairs.length]);

  const teamsPreview = useMemo(() => {
    if (format !== "teams" || safeTeams < 2) return null;
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

  const teamsMatchCount = useMemo(() => {
    if (format !== "teams") return null;
    const sizes = Array.from({ length: safeTeams }, () => 0);
    pairs.forEach((p) => {
      const t = pairToTeam[p.id] ?? 0;
      if (t >= 0 && t < sizes.length) sizes[t] += 1;
    });
    let total = 0;
    for (let i = 0; i < sizes.length; i++) {
      for (let j = i + 1; j < sizes.length; j++) {
        total += sizes[i] * sizes[j];
      }
    }
    return total;
  }, [format, pairs, pairToTeam, safeTeams]);

  const isTeamsConfigValid =
    format !== "teams" || (teamsCount >= 2 && teamsCount <= pairs.length);

  if (tournament.is_started) return null;

  return (
    <div className="start-tournament-section">
      <h3>🚀 Iniciar Reta</h3>
      <div className="tournament-info">
        <p>Tienes {pairs.length} parejas registradas</p>
        <p style={{ lineHeight: 1.6 }}>
          {format === "roundRobin" ? (
            <>
              Se crearán {roundRobinMatchCount} partidos (round-robin completo, todas las parejas se enfrentan).
            </>
          ) : (
            <>
              Se crearán {teamsMatchCount ?? 0} partidos. Las parejas del mismo equipo nunca se enfrentan; solo contra otros equipos.
            </>
          )}
        </p>
        <p>Estado de la reta: {tournament.is_started ? "Iniciada" : "Pendiente"}</p>
      </div>

      <div className="tournament-info">
        <p style={{ marginBottom: 8 }}>
          <strong>Formato</strong>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as TournamentFormat)}
              disabled={loading}
            >
              <option value="roundRobin">Round Robin</option>
              <option value="teams">Equipos</option>
            </select>

            {format === "teams" && (
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>Número de equipos:</span>
                <input
                  type="number"
                  min={2}
                  max={Math.max(2, pairs.length)}
                  value={teamsCount}
                  onChange={(e) => setTeamsCount(parseInt(e.target.value || "2"))}
                  disabled={loading}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  (2 o más{pairs.length > 0 ? `, máx. ${pairs.length}` : ""})
                </span>
              </label>
            )}
          </div>

          {format === "teams" && (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Las parejas del mismo equipo nunca se enfrentan entre sí; solo juegan contra parejas de otros equipos.
            </p>
          )}
        </div>

        {format === "teams" && !isTeamsConfigValid && (
          <p style={{ marginTop: 12, color: "rgba(220, 38, 38, 0.9)", marginBottom: 0 }}>
            El número de equipos debe ser 2 o más{pairs.length > 0 ? ` (máx. ${pairs.length})` : ""}.
          </p>
        )}

        {format === "teams" && teamsPreview && (
          <div style={{ marginTop: 16 }}>
            <p style={{ marginBottom: 10 }}>
              <strong>Configura equipos</strong> — pon nombre y mueve parejas
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              {teamsPreview.map((t) => (
                <div
                  key={t.teamIndex}
                  style={{
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: 10,
                    padding: 12,
                    background: "var(--color-bg-elevated)",
                  }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="text"
                      value={teamNames[t.teamIndex] ?? `Equipo ${t.teamIndex + 1}`}
                      onChange={(e) => {
                        const next = [...teamNames];
                        next[t.teamIndex] = e.target.value || `Equipo ${t.teamIndex + 1}`;
                        setTeamNames(next);
                      }}
                      placeholder={`Equipo ${t.teamIndex + 1}`}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: 14,
                        fontWeight: 600,
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 8,
                        background: "var(--color-bg-surface)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 8 }}>
                      ({t.pairs.length} parejas)
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {t.pairs.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "6px 8px",
                          background: "var(--color-bg-surface)",
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      >
                        <span>{p.player1_name} / {p.player2_name}</span>
                        <select
                          value={pairToTeam[p.id] ?? t.teamIndex}
                          onChange={(e) => {
                            const newTeam = parseInt(e.target.value, 10);
                            setPairToTeam((prev) => ({ ...prev, [p.id]: newTeam }));
                          }}
                          style={{
                            padding: "4px 8px",
                            fontSize: 12,
                            border: "1px solid var(--color-border-subtle)",
                            borderRadius: 6,
                            background: "var(--color-bg-elevated)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {teamsPreview.map((other) => (
                            <option key={other.teamIndex} value={other.teamIndex}>
                              Mover a {teamNames[other.teamIndex] ?? `Equipo ${other.teamIndex + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        className="start-button"
        onClick={() =>
          onStartTournament({
            format,
            teamsCount: format === "teams" ? teamsCount : undefined,
            teamNames: format === "teams" ? teamNames : undefined,
            pairToTeam: format === "teams" ? pairToTeam : undefined,
          })
        }
        disabled={loading || pairs.length < 2 || !isTeamsConfigValid}
      >
        {loading
          ? "⏳ Iniciando..."
          : tournament.is_started
          ? "🏆 Reta Ya Iniciada"
          : pairs.length < 2
          ? "❌ Necesitas al menos 2 parejas"
          : format === "teams" && !isTeamsConfigValid
          ? "❌ Revisa el número de equipos"
          : "🚀 ¡Iniciar Reta!"}
      </button>
    </div>
  );
};

export default StartTournamentSection;
