import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { createDuelo2v2 } from "../../services/duelo2v2Service";
import { Button } from "../ui";
import {
  bothPairsReady,
  DueloPairBuilder,
  type DueloPair,
} from "./DueloPairBuilder";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import { navigateDuelo2v2, publicDuelo2v2Path } from "./duelo2v2Nav";
import "./duelo2v2-page.css";

export const Duelo2v2Nuevo: React.FC = () => {
  const { user } = useUser();
  const [nombre, setNombre] = useState("");
  const [pairA, setPairA] = useState<DueloPair | null>(null);
  const [pairB, setPairB] = useState<DueloPair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    nombre.trim().length > 0 &&
    bothPairsReady(pairA, pairB) &&
    Boolean(user?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !pairA || !pairB) return;

    setBusy(true);
    setError(null);
    try {
      const duelo = await createDuelo2v2({
        nombre: nombre.trim(),
        pareja_a_j1_id: pairA.j1.id,
        pareja_a_j2_id: pairA.j2.id,
        pareja_a_j1_nombre: pairA.j1.nombre,
        pareja_a_j2_nombre: pairA.j2.nombre,
        pareja_b_j1_id: pairB.j1.id,
        pareja_b_j2_id: pairB.j2.id,
        pareja_b_j1_nombre: pairB.j1.nombre,
        pareja_b_j2_nombre: pairB.j2.nombre,
      });
      navigateDuelo2v2(publicDuelo2v2Path(duelo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el duelo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Duelo2v2PageShell wide>
      <div className="duelo2v2-toolbar riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          onClick={() => navigateDuelo2v2("/duelo-2v2")}
        >
          ← Volver
        </Button>
      </div>

      <header className="duelo2v2-header">
        <h1>Nuevo duelo 2 vs 2</h1>
        <p>Agrega dos parejas del registro e inicia el encuentro.</p>
      </header>

      {!user?.id ? (
        <p className="duelo2v2-error">Debes iniciar sesión para crear un duelo.</p>
      ) : (
        <form className="duelo2v2-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="duelo2v2-form__name-row">
            <label htmlFor="duelo-nombre">Nombre del encuentro</label>
            <input
              id="duelo-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Encuentro Riviera Open — Sábado"
              required
            />
          </div>

          <DueloPairBuilder
            organizadorId={user.id}
            pairA={pairA}
            pairB={pairB}
            onPairAChange={setPairA}
            onPairBChange={setPairB}
          />

          {error && <p className="duelo2v2-error">{error}</p>}

          <div className="duelo2v2-form__submit">
            <Button type="submit" variant="primary" disabled={!canSubmit || busy}>
              {busy ? "Iniciando…" : "Iniciar juego"}
            </Button>
          </div>
        </form>
      )}
    </Duelo2v2PageShell>
  );
};
