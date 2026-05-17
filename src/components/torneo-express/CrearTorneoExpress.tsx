import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getTournaments, Pair } from "../../lib/database";
import { useUser } from "../../contexts/UserContext";
import type { GrupoAssignmentDraft } from "../../lib/torneoExpress/types";
import {
  createTorneoExpressWithGroups,
  fetchPairsForTournament,
  formatSupabaseError,
} from "../../services/torneoExpressService";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./torneo-express.css";

export const CrearTorneoExpress: React.FC = () => {
  const { user } = useUser();
  const [nombre, setNombre] = useState("");
  const [numGrupos, setNumGrupos] = useState(2);
  const [sourceTournamentId, setSourceTournamentId] = useState("");
  const [tournaments, setTournaments] = useState<{ id: string; name: string }[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [assignments, setAssignments] = useState<GrupoAssignmentDraft[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    getTournaments(user.id)
      .then((list) => setTournaments(list ?? []))
      .catch(() => setError("No se pudieron cargar las retas"));
  }, [user?.id]);

  useEffect(() => {
    const n = Math.max(2, Math.min(8, numGrupos));
    setAssignments((prev) => {
      const next: GrupoAssignmentDraft[] = [];
      for (let i = 0; i < n; i++) {
        const existing = prev[i];
        next.push({
          nombre: existing?.nombre ?? `Grupo ${i + 1}`,
          orden: i,
          parejaIds: existing?.parejaIds ?? [],
        });
      }
      return next;
    });
  }, [numGrupos]);

  useEffect(() => {
    if (!sourceTournamentId) {
      setPairs([]);
      return;
    }
    setLoadingPairs(true);
    fetchPairsForTournament(sourceTournamentId)
      .then((data) => setPairs(data ?? []))
      .catch((err) =>
        setError(
          `No se pudieron cargar las parejas (tabla pairs): ${formatSupabaseError(err)}`
        )
      )
      .finally(() => setLoadingPairs(false));
  }, [sourceTournamentId]);

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    assignments.forEach((g) => g.parejaIds.forEach((id) => s.add(id)));
    return s;
  }, [assignments]);

  const togglePair = useCallback((grupoIndex: number, pairId: string) => {
    setAssignments((prev) =>
      prev.map((g, idx) => {
        if (idx !== grupoIndex) {
          if (g.parejaIds.includes(pairId)) {
            return { ...g, parejaIds: g.parejaIds.filter((id) => id !== pairId) };
          }
          return g;
        }
        const has = g.parejaIds.includes(pairId);
        return {
          ...g,
          parejaIds: has
            ? g.parejaIds.filter((id) => id !== pairId)
            : [...g.parejaIds, pairId],
        };
      })
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Debes iniciar sesión");
      return;
    }
    if (!nombre.trim()) {
      setError("Nombre del torneo requerido");
      return;
    }
    if (!sourceTournamentId) {
      setError("Selecciona una reta para cargar parejas");
      return;
    }
    for (const g of assignments) {
      if (g.parejaIds.length < 2) {
        setError(`"${g.nombre}" necesita al menos 2 parejas`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const torneoId = await createTorneoExpressWithGroups({
        nombre: nombre.trim(),
        sourceTournamentId,
        grupos: assignments,
      });
      navigateTorneoExpress(`/torneo-express/${torneoId}/gestionar`);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="torneo-express-page">
      <header className="te-header">
        <div>
          <h1 className="te-title">Nuevo Torneo Express</h1>
          <p className="te-subtitle">Grupos + round robin por grupo</p>
        </div>
        <button
          type="button"
          className="torneo-express-btn"
          onClick={() => navigateTorneoExpress("/torneo-express")}
        >
          Volver al listado
        </button>
      </header>

      <form className="torneo-express-card" onSubmit={handleSubmit}>
        {error && <p className="te-error">{error}</p>}

        <div className="torneo-express-field" style={{ marginBottom: "1rem" }}>
          <label htmlFor="te-nombre">Nombre del torneo</label>
          <input
            id="te-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Express Riviera Mayo"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div className="torneo-express-field">
            <label htmlFor="te-grupos">Número de grupos</label>
            <input
              id="te-grupos"
              type="number"
              min={2}
              max={8}
              value={numGrupos}
              onChange={(e) => setNumGrupos(Number(e.target.value) || 2)}
            />
          </div>
          <div className="torneo-express-field">
            <label htmlFor="te-reta">Reta origen (parejas)</label>
            <select
              id="te-reta"
              value={sourceTournamentId}
              onChange={(e) => setSourceTournamentId(e.target.value)}
            >
              <option value="">Seleccionar reta…</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingPairs && <p className="te-subtitle">Cargando parejas…</p>}

        {pairs.length > 0 &&
          assignments.map((grupo, gi) => (
            <div key={grupo.orden} className="te-grupo-assignment">
              <div className="torneo-express-field" style={{ marginBottom: "0.75rem" }}>
                <label>Nombre del grupo</label>
                <input
                  value={grupo.nombre}
                  onChange={(e) =>
                    setAssignments((prev) =>
                      prev.map((g, i) =>
                        i === gi ? { ...g, nombre: e.target.value } : g
                      )
                    )
                  }
                />
              </div>
              <p className="te-subtitle">
                Parejas asignadas: {grupo.parejaIds.length} (mín. 2)
              </p>
              <div className="te-pareja-pool">
                {pairs.map((p) => {
                  const label = `${p.player1_name} / ${p.player2_name}`;
                  const inThis = grupo.parejaIds.includes(p.id);
                  const inOther = !inThis && assignedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`te-pareja-chip${inThis ? " te-pareja-chip--selected" : ""}${
                        inOther ? " te-pareja-chip--assigned" : ""
                      }`}
                      disabled={inOther}
                      onClick={() => togglePair(gi, p.id)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        <button
          type="submit"
          className="torneo-express-btn torneo-express-btn--primary"
          disabled={submitting || !pairs.length}
        >
          {submitting ? "Creando…" : "Crear torneo y generar partidos"}
        </button>
      </form>
    </div>
  );
};
