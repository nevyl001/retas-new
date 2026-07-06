import React, { useState } from "react";
import { debugPlayerIdentity } from "../../lib/rivieraJugadores/getPublicPlayerProfileData";
import "./AdminPlayerDebugPage.css";

export const AdminPlayerDebugPage: React.FC = () => {
  const [rivieraId, setRivieraId] = useState("");
  const [jugadorId, setJugadorId] = useState("");
  const [slug, setSlug] = useState("");
  const [viewingOrgId, setViewingOrgId] = useState("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const snapshot = await debugPlayerIdentity(
        {
          rivieraId: rivieraId.trim() || undefined,
          jugadorId: jugadorId.trim() || undefined,
          slug: slug.trim() || undefined,
        },
        viewingOrgId.trim() || null
      );
      setResult(JSON.stringify(snapshot, null, 2));
    } catch (e) {
      setResult(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-player-debug" data-testid="admin-player-debug">
      <h1>Player identity debug</h1>
      <p>Resuelve identidad global → carrera → puntos (solo admin/dev).</p>
      <div className="admin-player-debug__form">
        <label>
          Riviera ID
          <input
            data-testid="debug-riviera-id"
            value={rivieraId}
            onChange={(e) => setRivieraId(e.target.value)}
            placeholder="RIV-00000024"
          />
        </label>
        <label>
          UUID
          <input
            data-testid="debug-jugador-id"
            value={jugadorId}
            onChange={(e) => setJugadorId(e.target.value)}
            placeholder="c7440f26-..."
          />
        </label>
        <label>
          Slug
          <input
            data-testid="debug-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <label>
          Org context (?org=)
          <input
            data-testid="debug-org-id"
            value={viewingOrgId}
            onChange={(e) => setViewingOrgId(e.target.value)}
          />
        </label>
        <button type="button" onClick={run} disabled={loading}>
          {loading ? "Resolviendo…" : "Resolver"}
        </button>
      </div>
      <pre className="admin-player-debug__output" data-testid="debug-output">
        {result || "Sin resultado"}
      </pre>
    </div>
  );
};
