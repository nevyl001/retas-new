import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  EN_CANCHA_LABELS,
  EN_CANCHA_ORDER,
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
  MANO_DOMINANTE_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { JugadorPerfilMeta } from "./JugadorPerfilMeta";
import { computePublicProfileStats } from "../../lib/rivieraJugadores/historialDisplay";
import {
  applyGrantedSourceDisplayToJugador,
  loadGrantedSourceDisplayData,
} from "../../lib/rivieraJugadores/organizerPlayerAccess";
import { mergeJugadorStatsPuntosTotales } from "../../lib/rivieraJugadores/rankingPosition";
import {
  loadUnifiedParticipacionesForJugador,
  loadUnifiedRatingViewForJugador,
} from "../../lib/rivieraJugadores/grantedPlayerUnifiedView";
import {
  canLeaveOrganizerMembershipForJugador,
  leaveOrganizerMembership,
  mapPlayerMembershipUiError,
} from "../../lib/rivieraJugadores/playerMembership";
import { syncLegacyPlayersFromRivieraRegistry } from "../../lib/rivieraJugadores/playerPoolSync";
import {
  deleteParticipacionJugador,
  deleteRivieraJugador,
  getRivieraJugadorBySlug,
  listParticipaciones,
  obtenerHistorialRating,
  rebuildJugadorStats,
  updateRivieraJugador,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { uploadJugadorAvatar } from "../../lib/rivieraJugadores/uploadAvatar";
import type {
  EnCancha,
  ManoDominante,
  RatingHistorialEntry,
  RivieraJugadorCategoria,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import { PAISES_RIVIERA, paisSelectLabel } from "../../lib/rivieraJugadores/paises";
import { navigateToAppHome } from "../../lib/appRouting";
import { buildPublicJugadorPath, buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { RivieraIdShareBlock } from "./RivieraIdShareBlock";
import { JugadorHistorialList } from "./JugadorHistorialList";
import { RatingNivel } from "./RatingNivel";
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
  const [historialRating, setHistorialRating] = useState<RatingHistorialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("open");
  const [edad, setEdad] = useState("");
  const [mano, setMano] = useState<ManoDominante | "">("");
  const [enCancha, setEnCancha] = useState<EnCancha | "">("");
  const [paisCodigo, setPaisCodigo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deletingHistId, setDeletingHistId] = useState<string | null>(null);
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
        setPaisCodigo(j.pais_codigo ?? "");
        setTelefono(j.telefono ?? j.whatsapp ?? "");
        setEmail(j.email ?? "");
        setInstagram(j.instagram_url ?? "");
        setFacebook(j.facebook_url ?? "");
        setTiktok(j.tiktok_url ?? "");

        const unified = await loadUnifiedParticipacionesForJugador(j, {
          limit: 100,
          listParticipaciones: (id, lim) => listParticipaciones(id, lim),
        });
        setHistorial(unified.historial);

        let nextJugador = j;
        if (j.concedidoPorAdmin && j.grantedAccess?.sourceJugadorId) {
          const sourceDisplay = await loadGrantedSourceDisplayData(
            j.grantedAccess.sourceJugadorId
          );
          if (sourceDisplay) {
            nextJugador = applyGrantedSourceDisplayToJugador(j, sourceDisplay);
          }
        } else {
          try {
            const rebuilt = await rebuildJugadorStats(j.id);
            if (rebuilt) {
              nextJugador = { ...j, stats: rebuilt };
            }
          } catch (e) {
            console.warn("[riviera-jugadores] sync stats en ficha:", e);
          }
        }

        if (
          unified.romcView.hasRomcData &&
          unified.romcView.puntosOficiales != null &&
          nextJugador.stats
        ) {
          nextJugador = {
            ...nextJugador,
            stats: mergeJugadorStatsPuntosTotales(
              nextJugador.stats,
              unified.romcView.puntosOficiales
            ),
            officialPuntosGlobal: unified.romcView.puntosOficiales,
          };
        }

        const ratingView = await loadUnifiedRatingViewForJugador(nextJugador, {
          limite: 10,
          organizadorId: user?.id ?? null,
          participacionesHistorial: unified.historial,
          fetchHistorial: obtenerHistorialRating,
        });
        setHistorialRating(ratingView.historial);
        setJugador({
          ...ratingView.jugador,
          stats: nextJugador.stats,
          officialPuntosGlobal: nextJugador.officialPuntosGlobal,
          statsOrigenConcedido: nextJugador.statsOrigenConcedido,
        });
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
        pais_codigo: paisCodigo || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        instagram_url: instagram.trim() || null,
        facebook_url: facebook.trim() || null,
        tiktok_url: tiktok.trim() || null,
      });
      setJugador({ ...jugador, ...updated, stats: jugador.stats });
      setNombre(updated.nombre);
      setCategoria(updated.categoria);
      setEditOpen(false);
      if (updated.slug !== jugador.slug) {
        navigateJugadorFicha(updated.slug);
      } else {
        await load();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteParticipacion = async (
    participacionId: string,
    eventoNombre: string
  ) => {
    if (!user?.id || !jugador) return;
    const ok = window.confirm(
      `¿Eliminar «${eventoNombre}» del historial?\n\nSe borrará de la base de datos, se restarán sus puntos de ranking y se recalcularán victorias y efectividad.`
    );
    if (!ok) return;
    setDeletingHistId(participacionId);
    try {
      const rebuilt = await deleteParticipacionJugador(
        user.id,
        jugador.id,
        participacionId
      );
      const unified = await loadUnifiedParticipacionesForJugador(jugador, {
        limit: 100,
        listParticipaciones: (id, lim) => listParticipaciones(id, lim),
      });
      setHistorial(unified.historial);
      if (rebuilt) {
        const stats = mergeJugadorStatsPuntosTotales(
          rebuilt,
          unified.romcView.puntosOficiales
        );
        setJugador({ ...jugador, stats });
      } else {
        await load();
      }
    } catch (e) {
      alert(
        e instanceof Error ? e.message : "No se pudo eliminar el registro"
      );
    } finally {
      setDeletingHistId(null);
    }
  };

  const handleDelete = async () => {
    if (!user?.id || !jugador) return;
    const ok = window.confirm(
      `¿Eliminar a «${jugador.nombre}» del registro?\n\nSe borrarán su historial, puntos y estadísticas. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteRivieraJugador(user.id, jugador.id);
      navigateJugadores();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo eliminar el jugador");
    } finally {
      setDeleting(false);
    }
  };

  const handleLeaveFromClub = async () => {
    if (!user?.id || !jugador) return;
    if (!canLeaveOrganizerMembershipForJugador(jugador, user.id)) return;
    const ok = window.confirm(
      `¿Quitar a «${jugador.nombre}» de tu club?\n\nEl jugador conservará su historial Riviera en su club de registro. Solo dejará de aparecer en tu organizador.`
    );
    if (!ok) return;
    setLeaving(true);
    try {
      await leaveOrganizerMembership(jugador.id);
      await syncLegacyPlayersFromRivieraRegistry(user.id);
      navigateJugadores();
    } catch (e) {
      alert(mapPlayerMembershipUiError(e));
    } finally {
      setLeaving(false);
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

  const histStats = useMemo(
    () => computePublicProfileStats(historial),
    [historial]
  );
  const partidosDecididos =
    histStats.partidosGanados + histStats.partidosPerdidos;

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
  const isGrantedReadOnly = Boolean(jugador.concedidoPorAdmin);
  const canLeaveFromClub = canLeaveOrganizerMembershipForJugador(jugador, user?.id);
  const retasCount = histStats.retasClasicas;
  const torneosCount = histStats.torneosExpress;
  const ligasCount = histStats.ligas;
  const americanosCount = histStats.americanos;
  const maxModalidad = Math.max(
    1,
    retasCount,
    torneosCount,
    ligasCount,
    americanosCount
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

        {isGrantedReadOnly ? (
          <p className="rj-ficha-readonly-notice" role="status">
            Acceso concedido — solo el club dueño del registro puede editar este
            perfil.
          </p>
        ) : null}

        {canLeaveFromClub ? (
          <div className="rj-ficha-actions">
            <button
              type="button"
              className="rj-btn rj-btn--danger"
              disabled={leaving}
              onClick={() => void handleLeaveFromClub()}
            >
              {leaving ? "Quitando…" : "Quitar del club"}
            </button>
          </div>
        ) : null}

        <header className="rj-ficha-header">
          <div className="rj-ficha-header__avatar-wrap">
            <JugadorAvatar fotoUrl={jugador.foto_url} nombre={jugador.nombre} size="lg" />
            {!isGrantedReadOnly ? (
              <>
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
              </>
            ) : null}
          </div>
          <div>
            <div className="rj-ficha-header__name-row">
              <h1 className="rj-ficha-header__name">{jugador.nombre}</h1>
              <JugadorPaisBadge codigo={jugador.pais_codigo} size="md" />
            </div>
            <RivieraIdShareBlock jugador={jugador} variant="private" />
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

        {!isGrantedReadOnly ? (
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
            <button
              type="button"
              className="rj-btn rj-btn--danger"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Eliminando…" : "Eliminar jugador"}
            </button>
          </div>
        ) : null}

        {!isGrantedReadOnly && editOpen && (
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
            <div className="rj-field">
              <label htmlFor="rj-pais">País / bandera</label>
              <select
                id="rj-pais"
                className="rj-select"
                value={paisCodigo}
                onChange={(e) => setPaisCodigo(e.target.value)}
              >
                <option value="">— Sin especificar —</option>
                {PAISES_RIVIERA.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {paisSelectLabel(p)}
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
                  <a
                    href={buildPublicRankingUrl(
                      user.id,
                      jugador.genero ?? "M"
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {buildPublicRankingUrl(user.id, jugador.genero ?? "M")}
                  </a>
                </p>
              )}
            </div>
          </section>
        )}

        <div className="rj-stats-row">
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{partidosDecididos}</span>
            <span className="rj-stat-card__lbl">Partidos</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{histStats.partidosGanados}</span>
            <span className="rj-stat-card__lbl">Victorias</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">
              {histStats.winRate != null ? `${histStats.winRate}%` : "—"}
            </span>
            <span className="rj-stat-card__lbl">Efectividad</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{retasCount}</span>
            <span className="rj-stat-card__lbl">Retas</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{torneosCount}</span>
            <span className="rj-stat-card__lbl">Torneos</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{ligasCount}</span>
            <span className="rj-stat-card__lbl">Ligas</span>
          </div>
          <div className="rj-stat-card">
            <span className="rj-stat-card__val">{americanosCount}</span>
            <span className="rj-stat-card__lbl">Americanos</span>
          </div>
        </div>

        <RatingNivel
          rating={jugador.rating ?? 3}
          fiabilidad={jugador.rating_fiabilidad ?? 0.2}
          partidosJugados={jugador.rating_partidos ?? 0}
          historial={historialRating}
        />

        {s?.racha_actual && (
          <p className="rj-page__sub" style={{ marginBottom: "1rem" }}>
            Racha: <strong style={{ color: "var(--ro-accent)" }}>{s.racha_actual}</strong>
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
          <JugadorHistorialList
            participaciones={historial}
            categoriaFallback={jugador?.categoria}
            variant="admin"
            onDelete={isGrantedReadOnly ? undefined : handleDeleteParticipacion}
            deletingId={deletingHistId}
          />
        )}

        {tab === "stats" && (
          <div className="rj-progress-list">
            {(
              [
                ["Retas", retasCount],
                ["Torneos Express", torneosCount],
                ["Ligas", ligasCount],
                ["Pádel Americano", americanosCount],
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
