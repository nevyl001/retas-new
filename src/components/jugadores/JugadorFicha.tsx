import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  EN_CANCHA_LABELS,
  EN_CANCHA_ORDER,
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
  MANO_DOMINANTE_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { JugadorPerfilMeta } from "./JugadorPerfilMeta";
import {
  getRivieraJugadorBySlug,
  listParticipaciones,
  updateRivieraJugador,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { uploadJugadorAvatar } from "../../lib/rivieraJugadores/uploadAvatar";
import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import { navigateToAppHome } from "../../lib/appRouting";
import { buildPublicJugadorPath, buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { JugadorHistorialList } from "./JugadorHistorialList";
import { navigateJugadorFicha, navigateJugadores } from "./jugadoresNav";
import "./riviera-jugadores.css";

interface JugadorFichaProps {
  slug: string;
}

export const JugadorFicha: React.FC<JugadorFichaProps> = ({ slug }) => {
  const { user } = useUser();
  const [jugador, setJugador] = useState<RivieraJugadorWithStats | null>(null);
  const [tab, setTab] = useState<"historial" | "stats">("historial");
  const [historial, setHistorial] = useState<
    Awaited<ReturnType<typeof listParticipaciones>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("open");
  const [edad, setEdad] = useState("");
  const [mano, setMano] = useState<ManoDominante | "">("");
  const [enCancha, setEnCancha] = useState<EnCancha | "">("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [visiblePublico, setVisiblePublico] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const j = await getRivieraJugadorBySlug(user.id, slug);
      setJugador(j);
      if (j) {
        setNombre(j.nombre);
        setCategoria(j.categoria);
        setEdad(j.edad != null ? String(j.edad) : "");
        setMano(j.mano_dominante ?? "");
        setEnCancha(j.en_cancha ?? "");
        setTelefono(j.telefono ?? j.whatsapp ?? "");
        setEmail(j.email ?? "");
        setInstagram(j.instagram_url ?? "");
        setFacebook(j.facebook_url ?? "");
        setTiktok(j.tiktok_url ?? "");
        setVisiblePublico(j.visible_publico !== false);
        const h = await listParticipaciones(j.id, 100);
        setHistorial(h);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, slug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveProfile = async () => {
    if (!jugador) return;
    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      alert("Escribe el nombre del jugador.");
      return;
    }
    setSaving(true);
    try {
      const edadNum = edad.trim() ? Number(edad) : null;
      const updated = await updateRivieraJugador(jugador.id, {
        nombre: nombreTrim,
        categoria,
        edad:
          edadNum != null && !Number.isNaN(edadNum) && edadNum >= 5 && edadNum <= 99
            ? edadNum
            : null,
        mano_dominante: mano || null,
        en_cancha: enCancha || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        instagram_url: instagram.trim() || null,
        facebook_url: facebook.trim() || null,
        tiktok_url: tiktok.trim() || null,
        visible_publico: visiblePublico,
      });
      setJugador({ ...jugador, ...updated, stats: jugador.stats });
      setNombre(updated.nombre);
      setEditOpen(false);
      if (updated.slug !== jugador.slug) {
        navigateJugadorFicha(updated.slug);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (file: File) => {
    if (!user?.id || !jugador) return;
    setUploading(true);
    try {
      const url = await uploadJugadorAvatar(user.id, jugador.id, file);
      const updated = await updateRivieraJugador(jugador.id, { foto_url: url });
      setJugador({ ...jugador, ...updated, stats: jugador.stats });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al subir foto");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="rj-page">
        <div className="rj-page__inner">
          <p className="rj-empty">Cargando ficha…</p>
        </div>
      </div>
    );
  }

  if (!jugador) {
    return (
      <div className="rj-page">
        <div className="rj-page__inner">
          <button type="button" className="rj-back" onClick={() => navigateJugadores()}>
            ← Jugadores
          </button>
          <p className="rj-empty">Jugador no encontrado.</p>
        </div>
      </div>
    );
  }

  const s = jugador.stats;
  const maxModalidad = Math.max(
    1,
    s?.total_retas ?? 0,
    s?.total_torneos_express ?? 0,
    s?.total_ligas ?? 0,
    s?.total_americanos ?? 0
  );

  return (
    <div className="rj-page">
      <div className="rj-page__inner">
        <nav className="rj-ficha-nav" aria-label="Navegación">
          <button type="button" className="rj-back" onClick={() => navigateJugadores()}>
            ← Jugadores
          </button>
          <button
            type="button"
            className="rj-back rj-back--secondary"
            onClick={() => navigateToAppHome()}
          >
            Inicio
          </button>
        </nav>

        <header className="rj-ficha-header">
          <div className="rj-ficha-header__avatar-wrap">
            <JugadorAvatar fotoUrl={jugador.foto_url} nombre={jugador.nombre} size="lg" />
            <button
              type="button"
              className="rj-ficha-header__upload"
              title="Cambiar foto"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "…" : "📷"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePhoto(f);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <h1 className="rj-ficha-header__name">{jugador.nombre}</h1>
            <JugadorCategoriaBadge categoria={jugador.categoria} />
            <JugadorPerfilMeta jugador={jugador} variant="inline" />
            {jugador.club && (
              <p className="rj-page__sub" style={{ marginTop: 6 }}>
                {jugador.club}
              </p>
            )}
            {(jugador.telefono || jugador.email) && (
              <div className="rj-ficha-contacto-privado">
                <span className="rj-ficha-contacto-privado__lbl">Solo organizador</span>
                {jugador.telefono && (
                  <p className="rj-page__sub">
                    Tel: <a href={`tel:${jugador.telefono}`}>{jugador.telefono}</a>
                  </p>
                )}
                {jugador.email && !jugador.email.endsWith("@padel.local") && (
                  <p className="rj-page__sub">
                    Email: <a href={`mailto:${jugador.email}`}>{jugador.email}</a>
                  </p>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="rj-ficha-actions">
          <button
            type="button"
            className="rj-btn rj-btn--ghost"
            onClick={() => setEditOpen((v) => !v)}
          >
            {editOpen ? "Cerrar edición" : "Editar perfil"}
          </button>
          {user?.id && (
            <a
              className="rj-btn rj-btn--ghost"
              href={buildPublicJugadorPath(jugador.slug, user.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver perfil público
            </a>
          )}
        </div>

        {editOpen && (
          <section className="rj-edit-panel">
            <h2 className="rj-edit-panel__title">Datos del jugador</h2>
            <div className="rj-field">
              <label htmlFor="rj-nombre">Nombre</label>
              <input
                id="rj-nombre"
                type="text"
                autoComplete="name"
                placeholder="Nombre del jugador"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="rj-field">
              <label htmlFor="rj-cat">Categoría</label>
              <select
                id="rj-cat"
                className="rj-select"
                value={categoria}
                onChange={(e) =>
                  setCategoria(e.target.value as RivieraJugadorCategoria)
                }
              >
                {JUGADOR_CATEGORIAS_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {JUGADOR_CATEGORIA_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="rj-edit-grid">
              <div className="rj-field">
                <label htmlFor="rj-edad">Edad</label>
                <input
                  id="rj-edad"
                  type="number"
                  min={5}
                  max={99}
                  placeholder="Ej. 28"
                  value={edad}
                  onChange={(e) => setEdad(e.target.value)}
                />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-mano">Mano dominante</label>
                <select
                  id="rj-mano"
                  className="rj-select"
                  value={mano}
                  onChange={(e) => setMano(e.target.value as ManoDominante | "")}
                >
                  <option value="">—</option>
                  {(Object.keys(MANO_DOMINANTE_LABELS) as ManoDominante[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {MANO_DOMINANTE_LABELS[m]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="rj-field">
                <label htmlFor="rj-cancha">En la cancha</label>
                <select
                  id="rj-cancha"
                  className="rj-select"
                  value={enCancha}
                  onChange={(e) => setEnCancha(e.target.value as EnCancha | "")}
                >
                  <option value="">—</option>
                  {EN_CANCHA_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {EN_CANCHA_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="rj-edit-section-label">Contacto (privado — no aparece al público)</p>
            <div className="rj-edit-grid">
              <div className="rj-field">
                <label htmlFor="rj-tel">Teléfono</label>
                <input
                  id="rj-tel"
                  type="tel"
                  placeholder="+52 …"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-email">Email</label>
                <input
                  id="rj-email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <p className="rj-edit-section-label">Redes sociales (públicas en el perfil)</p>
            <div className="rj-field">
              <label htmlFor="rj-ig">Instagram (URL)</label>
              <input
                id="rj-ig"
                type="url"
                placeholder="https://instagram.com/..."
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
              />
            </div>
            <div className="rj-field">
              <label htmlFor="rj-fb">Facebook (URL)</label>
              <input
                id="rj-fb"
                type="url"
                placeholder="https://facebook.com/..."
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
              />
            </div>
            <div className="rj-field">
              <label htmlFor="rj-tt">TikTok (URL)</label>
              <input
                id="rj-tt"
                type="url"
                placeholder="https://tiktok.com/@..."
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
              />
            </div>
            <label className="rj-check">
              <input
                type="checkbox"
                checked={visiblePublico}
                onChange={(e) => setVisiblePublico(e.target.checked)}
              />
              Visible en ranking público
            </label>
            <div className="rj-edit-panel__actions">
              <button
                type="button"
                className="rj-btn rj-btn--primary"
                disabled={saving}
                onClick={() => void handleSaveProfile()}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {user?.id && (
                <p className="rj-page__sub">
                  Ranking:{" "}
                  <a href={buildPublicRankingUrl(user.id)} target="_blank" rel="noreferrer">
                    {buildPublicRankingUrl(user.id)}
                  </a>
                </p>
              )}
            </div>
          </section>
        )}

        <div className="rj-stats-row">
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{s?.total_partidos ?? 0}</span>
            <span className="rj-stat-card__lbl">Partidos</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{s?.victorias ?? 0}</span>
            <span className="rj-stat-card__lbl">Victorias</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">
              {s?.total_partidos
                ? `${Number(s.pct_victorias).toFixed(0)}%`
                : "—"}
            </span>
            <span className="rj-stat-card__lbl">% Victorias</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{s?.total_retas ?? 0}</span>
            <span className="rj-stat-card__lbl">Retas</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{s?.total_torneos_express ?? 0}</span>
            <span className="rj-stat-card__lbl">Torneos</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{s?.total_ligas ?? 0}</span>
            <span className="rj-stat-card__lbl">Ligas</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{s?.total_americanos ?? 0}</span>
            <span className="rj-stat-card__lbl">Americanos</span>
          </div>
        </div>

        {s?.racha_actual && (
          <p className="rj-page__sub" style={{ marginBottom: "1rem" }}>
            Racha: <strong style={{ color: "#c9a227" }}>{s.racha_actual}</strong>
          </p>
        )}

        <div className="rj-tabs">
          <button
            type="button"
            className={`rj-tab${tab === "historial" ? " rj-tab--active" : ""}`}
            onClick={() => setTab("historial")}
          >
            Historial
          </button>
          <button
            type="button"
            className={`rj-tab${tab === "stats" ? " rj-tab--active" : ""}`}
            onClick={() => setTab("stats")}
          >
            Estadísticas
          </button>
        </div>

        {tab === "historial" && (
          <JugadorHistorialList participaciones={historial} variant="admin" />
        )}

        {tab === "stats" && (
          <div className="rj-progress-list">
            {(
              [
                ["Retas", s?.total_retas ?? 0],
                ["Torneos Express", s?.total_torneos_express ?? 0],
                ["Ligas", s?.total_ligas ?? 0],
                ["Pádel Americano", s?.total_americanos ?? 0],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rj-progress-item">
                <div className="rj-progress-item__head">
                  <span>{label}</span>
                  <span>{count}</span>
                </div>
                <div className="rj-progress-bar">
                  <div
                    className="rj-progress-bar__fill"
                    style={{ width: `${(count / maxModalidad) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="rj-page__sub">
              Sets: {s?.sets_favor_total ?? 0} a favor · {s?.sets_contra_total ?? 0} en contra
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
