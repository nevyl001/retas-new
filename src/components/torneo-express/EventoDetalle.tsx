import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  TorneoExpress,
  TorneoExpressClasificacionModo,
  TorneoExpressEvento,
  TorneoExpressEventoLogoSource,
  TorneoExpressPartidoFormato,
} from "../../lib/torneoExpress/types";
import { slugifyEvento } from "../../lib/torneoExpress/eventoSlug";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
import { resolveTorneoExpressDisplayEstado } from "../../lib/torneoExpress/resolveDisplayEstado";
import {
  isBrandingDirty,
  isEliminatoriaConfigDirty,
  isReglasDirty,
} from "../../lib/torneoExpress/eventoDetalleDirty";
import { uploadEventoFlyer } from "../../lib/torneoExpress/uploadEventoFlyer";
import {
  deleteTorneoExpress,
  fetchEventoConCategorias,
  formatSupabaseError,
  saveTorneoExpressCategoria,
  syncEventoEstadoFromCategorias,
  updateEvento,
} from "../../services/torneoExpressService";
import { useUser } from "../../contexts/UserContext";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { ActionBar } from "../platform/ActionBar";
import { ModeSectionTabs } from "../platform/ModeSectionTabs";
import { EventoBrandingForm } from "./EventoBrandingForm";
import { EventoCategoriaCard } from "./EventoCategoriaCard";
import { EventoDetalleHeader } from "./EventoDetalleHeader";
import { EventoEliminatoriaHorarioForm } from "./EventoEliminatoriaHorarioForm";
import { EventoReglasForm } from "./EventoReglasForm";
import {
  DEFAULT_ELIMINATORIA_DURACIONES,
  normalizeEliminatoriaCanchas,
  normalizeEliminatoriaDuraciones,
  orderCategoriasForEliminatoria,
  type EliminatoriaDuraciones,
} from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import {
  formatZonedDateTimeLocal,
  zonedDateTimeIso,
} from "../../lib/torneoExpress/eventoTemporal";
import { TePageShell } from "./TePageShell";
import { TeUnsavedChangesModal } from "./TeUnsavedChangesModal";
import { TorneoExpressDeleteModal } from "./TorneoExpressDeleteModal";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-inicio-page.css";
import "./te-eventos.css";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const msg = (e.message ?? "").toLowerCase();
  return (
    e.code === "23505" ||
    msg.includes("duplicate key") ||
    msg.includes("unique") ||
    msg.includes("torneo_express_evento_slug")
  );
}

/**
 * Publica el evento. Si no hay slug, genera uno con slugifyEvento.
 * Ante colisión UNIQUE, reintenta con sufijo corto (-2, -3, …).
 */
async function publishEventoWithSlug(
  evento: TorneoExpressEvento
): Promise<TorneoExpressEvento> {
  const base = (evento.slug?.trim() || slugifyEvento(evento.nombre)).slice(
    0,
    72
  );
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await updateEvento(evento.id, {
        estado: "published",
        slug,
      });
    } catch (err) {
      lastError = err;
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No se pudo asignar un slug único al publicar");
}

function categoriaDisplayLabel(cat: TorneoExpress): string {
  return formatTorneoExpressCategoria(cat.categoria) || cat.nombre;
}

function categoriaEditValue(cat: TorneoExpress): string {
  return cat.categoria?.trim() || cat.nombre?.trim() || "";
}

type EventoTabId = "categorias" | "eliminatoria" | "reglas" | "branding";

const EVENTO_TABS: ReadonlyArray<{ id: EventoTabId; label: string }> = [
  { id: "categorias", label: "Categorías" },
  { id: "eliminatoria", label: "Eliminatoria" },
  { id: "reglas", label: "Reglas" },
  { id: "branding", label: "Branding" },
];

type EventoDetalleProps = {
  eventoId: string;
};

export const EventoDetalle: React.FC<EventoDetalleProps> = ({ eventoId }) => {
  const { user } = useUser();
  const [evento, setEvento] = useState<TorneoExpressEvento | null>(null);
  const [categorias, setCategorias] = useState<TorneoExpress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [logoSource, setLogoSource] =
    useState<TorneoExpressEventoLogoSource>("club");
  const [flyerUrl, setFlyerUrl] = useState("");
  const [clasificacionModo, setClasificacionModo] =
    useState<TorneoExpressClasificacionModo>("dif_puntos");
  const [partidoFormato, setPartidoFormato] =
    useState<TorneoExpressPartidoFormato>("flexible");
  const [savingReglas, setSavingReglas] = useState(false);
  const [eliminatoriaInicioLocal, setEliminatoriaInicioLocal] = useState("");
  const [eliminatoriaOrdenIds, setEliminatoriaOrdenIds] = useState<string[]>(
    []
  );
  const [eliminatoriaCanchas, setEliminatoriaCanchas] = useState<string[]>([]);
  const [eliminatoriaDuraciones, setEliminatoriaDuraciones] =
    useState<EliminatoriaDuraciones>(DEFAULT_ELIMINATORIA_DURACIONES);
  const [savingEliminatoria, setSavingEliminatoria] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TorneoExpress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingCategoriaId, setEditingCategoriaId] = useState<string | null>(
    null
  );
  const [draftCategoriaNombre, setDraftCategoriaNombre] = useState("");
  const [savingCategoriaId, setSavingCategoriaId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<EventoTabId>("categorias");

  // Cambios sin guardar = formulario distinto de lo persistido en `evento`.
  const defaultEliminatoriaOrden = orderCategoriasForEliminatoria(
    categorias,
    evento?.eliminatoria_categoria_orden
  ).map((cat) => cat.id);
  const reglasDirty = isReglasDirty(evento, {
    clasificacionModo,
    partidoFormato,
  });
  const eliminatoriaDirty = isEliminatoriaConfigDirty(
    evento,
    {
      eliminatoriaInicio: zonedDateTimeIso(
        eliminatoriaInicioLocal,
        evento?.timezone
      ),
      eliminatoriaCategoriaOrden: eliminatoriaOrdenIds,
      eliminatoriaCanchas,
      eliminatoriaDuraciones,
    },
    defaultEliminatoriaOrden
  );
  const brandingDirty = isBrandingDirty(evento, { logoSource, flyerUrl });
  const dirtySections = [
    ...(eliminatoriaDirty ? ["Eliminatoria"] : []),
    ...(reglasDirty ? ["Reglas"] : []),
    ...(brandingDirty ? ["Branding"] : []),
  ];
  const unsavedGuard = useUnsavedChangesGuard(dirtySections.length > 0);

  const handleTabsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = EVENTO_TABS.findIndex((tab) => tab.id === activeTab);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % EVENTO_TABS.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + EVENTO_TABS.length) % EVENTO_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = EVENTO_TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const nextId = EVENTO_TABS[next].id;
    setActiveTab(nextId);
    document.getElementById(`mode-tab-${nextId}`)?.focus();
  };

  const showActionToast = useCallback(
    (message: string, type: "success" | "error") => {
      setActionToast({ message, type });
      window.setTimeout(() => setActionToast(null), 4500);
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEventoConCategorias(eventoId);
      if (!data) {
        setEvento(null);
        setCategorias([]);
        setError("Evento no encontrado");
        return;
      }
      setEvento(data.evento);
      setCategorias(data.categorias);
      setLogoSource(data.evento.logo_source);
      setFlyerUrl(data.evento.flyer_url ?? "");
      setClasificacionModo(data.evento.clasificacion_modo);
      setPartidoFormato(data.evento.partido_formato);
      setEliminatoriaInicioLocal(
        formatZonedDateTimeLocal(
          data.evento.eliminatoria_inicio,
          data.evento.timezone
        )
      );
      setEliminatoriaOrdenIds(
        orderCategoriasForEliminatoria(
          data.categorias,
          data.evento.eliminatoria_categoria_orden
        ).map((cat) => cat.id)
      );
      setEliminatoriaCanchas(
        normalizeEliminatoriaCanchas(data.evento.eliminatoria_canchas)
      );
      setEliminatoriaDuraciones(
        normalizeEliminatoriaDuraciones(data.evento.eliminatoria_duraciones)
      );
      const synced = await syncEventoEstadoFromCategorias(data.evento.id).catch(
        () => null
      );
      if (synced) {
        setEvento(synced);
        setLogoSource(synced.logo_source);
        setFlyerUrl(synced.flyer_url ?? "");
        setClasificacionModo(synced.clasificacion_modo);
        setPartidoFormato(synced.partido_formato);
        setEliminatoriaInicioLocal(
          formatZonedDateTimeLocal(
            synced.eliminatoria_inicio,
            synced.timezone
          )
        );
        setEliminatoriaOrdenIds(
          orderCategoriasForEliminatoria(
            data.categorias,
            synced.eliminatoria_categoria_orden
          ).map((cat) => cat.id)
        );
        setEliminatoriaCanchas(
          normalizeEliminatoriaCanchas(synced.eliminatoria_canchas)
        );
        setEliminatoriaDuraciones(
          normalizeEliminatoriaDuraciones(synced.eliminatoria_duraciones)
        );
      }
    } catch (e) {
      setError(formatSupabaseError(e));
      setEvento(null);
      setCategorias([]);
    } finally {
      setLoading(false);
    }
  }, [eventoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveBranding = async () => {
    if (!evento) return;
    setSavingBrand(true);
    setError(null);
    try {
      const updated = await updateEvento(evento.id, {
        logo_source: logoSource,
        flyer_url: logoSource === "flyer" ? flyerUrl.trim() || null : null,
      });
      setEvento(updated);
      setFlyerUrl(updated.flyer_url ?? "");
      showActionToast("Branding guardado", "success");
    } catch (e) {
      const msg = formatSupabaseError(e);
      setError(msg);
      showActionToast(msg, "error");
    } finally {
      setSavingBrand(false);
    }
  };

  const handleSaveReglas = async () => {
    if (!evento) return;
    setSavingReglas(true);
    setError(null);
    try {
      const updated = await updateEvento(evento.id, {
        clasificacion_modo: clasificacionModo,
        partido_formato: partidoFormato,
      });
      setEvento(updated);
      setClasificacionModo(updated.clasificacion_modo);
      setPartidoFormato(updated.partido_formato);
      showActionToast("Reglas del evento guardadas", "success");
    } catch (e) {
      const msg = formatSupabaseError(e);
      setError(msg);
      showActionToast(msg, "error");
    } finally {
      setSavingReglas(false);
    }
  };

  const handleSaveEliminatoria = async () => {
    if (!evento) return;
    setSavingEliminatoria(true);
    setError(null);
    try {
      const canchas = normalizeEliminatoriaCanchas(eliminatoriaCanchas);
      const duraciones = normalizeEliminatoriaDuraciones(
        eliminatoriaDuraciones
      );
      const updated = await updateEvento(evento.id, {
        eliminatoria_inicio: zonedDateTimeIso(
          eliminatoriaInicioLocal,
          evento.timezone
        ),
        eliminatoria_categoria_orden: eliminatoriaOrdenIds,
        eliminatoria_canchas: canchas,
        eliminatoria_duraciones: duraciones,
      });
      setEvento(updated);
      setEliminatoriaInicioLocal(
        formatZonedDateTimeLocal(
          updated.eliminatoria_inicio,
          updated.timezone
        )
      );
      setEliminatoriaOrdenIds(
        orderCategoriasForEliminatoria(
          categorias,
          updated.eliminatoria_categoria_orden
        ).map((cat) => cat.id)
      );
      setEliminatoriaCanchas(
        normalizeEliminatoriaCanchas(updated.eliminatoria_canchas)
      );
      setEliminatoriaDuraciones(
        normalizeEliminatoriaDuraciones(updated.eliminatoria_duraciones)
      );
      showActionToast("Eliminatoria del evento guardada", "success");
    } catch (e) {
      const msg = formatSupabaseError(e);
      setError(msg);
      showActionToast(msg, "error");
    } finally {
      setSavingEliminatoria(false);
    }
  };

  const handleUploadFlyer = async (file: File | null) => {
    if (!file || !evento || !user?.id) return;
    setUploadingFlyer(true);
    setError(null);
    try {
      const publicUrl = await uploadEventoFlyer(user.id, evento.id, file);
      const updated = await updateEvento(evento.id, {
        logo_source: "flyer",
        flyer_url: publicUrl,
      });
      setLogoSource("flyer");
      setFlyerUrl(updated.flyer_url ?? publicUrl);
      setEvento(updated);
      showActionToast("Flyer subido", "success");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : formatSupabaseError(e);
      setError(msg);
      showActionToast(msg, "error");
    } finally {
      setUploadingFlyer(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmDeleteCategoria = async () => {
    if (!deleteTarget) return;
    const torneoId = deleteTarget.id;
    setDeleting(true);
    setError(null);
    try {
      await deleteTorneoExpress(torneoId);
      setCategorias((prev) => prev.filter((c) => c.id !== torneoId));
      setDeleteTarget(null);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setDeleting(false);
    }
  };

  const cancelEditCategoria = () => {
    setEditingCategoriaId(null);
    setDraftCategoriaNombre("");
  };

  const startEditCategoria = (cat: TorneoExpress) => {
    setEditingCategoriaId(cat.id);
    setDraftCategoriaNombre(categoriaEditValue(cat));
  };

  const commitEditCategoria = async (torneoId: string) => {
    const nombre = draftCategoriaNombre.trim();
    if (!nombre) {
      showActionToast("La categoría no puede estar vacía", "error");
      return;
    }
    const current = categorias.find((c) => c.id === torneoId);
    if (current && categoriaEditValue(current).toLowerCase() === nombre.toLowerCase()) {
      cancelEditCategoria();
      return;
    }
    setSavingCategoriaId(torneoId);
    setError(null);
    try {
      const updated = await saveTorneoExpressCategoria(torneoId, nombre);
      setCategorias((prev) =>
        prev.map((c) => (c.id === torneoId ? updated : c))
      );
      cancelEditCategoria();
      showActionToast("Categoría actualizada", "success");
    } catch (e) {
      const msg = formatSupabaseError(e);
      setError(msg);
      showActionToast(msg, "error");
    } finally {
      setSavingCategoriaId(null);
    }
  };

  const handlePublishToggle = async () => {
    if (!evento) return;
    setPublishing(true);
    setError(null);
    try {
      if (evento.estado === "draft") {
        const updated = await publishEventoWithSlug(evento);
        setEvento(updated);
      } else if (
        evento.estado === "published" ||
        evento.estado === "in_progress" ||
        evento.estado === "completed"
      ) {
        const updated = await updateEvento(evento.id, { estado: "draft" });
        setEvento(updated);
      }
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <TePageShell className="te-inicio-page te-eventos-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() => navigateTorneoExpress("/torneo-express/eventos")}
          >
            ← Volver a Eventos
          </Button>
        </ActionBar>

        {loading ? <p className="te-subtitle">Cargando evento…</p> : null}
        {error ? <p className="te-error">{error}</p> : null}

        {!loading && evento ? (
          <>
            <EventoDetalleHeader
              evento={evento}
              categoriaCount={categorias.length}
              publishing={publishing}
              onTogglePublish={() => void handlePublishToggle()}
            />

            <div
              className="te-evd-tabs-wrap"
              data-dirty-eliminatoria={eliminatoriaDirty ? "true" : undefined}
              data-dirty-reglas={reglasDirty ? "true" : undefined}
              data-dirty-branding={brandingDirty ? "true" : undefined}
              onKeyDown={handleTabsKeyDown}
            >
              <ModeSectionTabs
                className="te-evd-tabs"
                ariaLabel="Secciones del evento"
                tabs={EVENTO_TABS.map((tab) => ({ ...tab }))}
                activeId={activeTab}
                onChange={(id) => setActiveTab(id as EventoTabId)}
              />
            </div>

            <div
              role="tabpanel"
              id="mode-panel-categorias"
              aria-labelledby="mode-tab-categorias"
              className="te-evd-panel"
              hidden={activeTab !== "categorias"}
            >
              <section
                className="te-evento-section"
                aria-labelledby="te-evento-cats-heading"
              >
                <div className="te-evd-section-head">
                  <div>
                    <h2
                      id="te-evento-cats-heading"
                      className="te-evento-section__title"
                    >
                      Categorías
                    </h2>
                    <p className="te-evento-section__hint">
                      Cada categoría es un torneo independiente (grupos, standings
                      y eliminatoria aislados).
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      navigateTorneoExpress(
                        `/torneo-express/evento/${evento.id}/nueva-categoria`
                      )
                    }
                  >
                    <TablerIcon name="plus" size={16} />
                    Agregar categoría
                  </Button>
                </div>
                {categorias.length === 0 ? (
                  <div className="te-evd-empty">
                    <p className="te-evd-empty__title">Sin categorías todavía.</p>
                    <p className="te-evd-empty__text">
                      Agrega una: se arma igual que un torneo normal.
                    </p>
                  </div>
                ) : (
                  <ul className="te-evd-cats">
                    {categorias.map((cat) => {
                      const title = categoriaDisplayLabel(cat);
                      const displayEstado = resolveTorneoExpressDisplayEstado({
                        estado: cat.estado,
                        eventFechaInicio: evento.fecha_inicio,
                        eventTimezone: evento.timezone,
                      });
                      return (
                        <EventoCategoriaCard
                          key={cat.id}
                          title={title}
                          displayEstado={displayEstado}
                          fallbackEstadoLabel={cat.estado}
                          isEditing={editingCategoriaId === cat.id}
                          draftName={draftCategoriaNombre}
                          saving={savingCategoriaId === cat.id}
                          deleting={deleting}
                          onDraftChange={setDraftCategoriaNombre}
                          onStartEdit={() => startEditCategoria(cat)}
                          onCommitEdit={() => void commitEditCategoria(cat.id)}
                          onCancelEdit={cancelEditCategoria}
                          onManage={() =>
                            navigateTorneoExpress(
                              `/torneo-express/${cat.id}/gestionar`
                            )
                          }
                          onDelete={() => setDeleteTarget(cat)}
                        />
                      );
                    })}
                  </ul>
                )}
                <button
                  type="button"
                  className="te-evd-elim-jump"
                  onClick={() => setActiveTab("eliminatoria")}
                >
                  <span className="te-evd-elim-jump__copy">
                    <span className="te-evd-elim-jump__title">
                      Programación de eliminatoria
                    </span>
                    <span className="te-evd-elim-jump__hint">
                      Hora de inicio, orden de categorías y canchas disponibles.
                    </span>
                  </span>
                  <span className="te-evd-elim-jump__action">Configurar</span>
                </button>
              </section>
            </div>

            <div
              role="tabpanel"
              id="mode-panel-eliminatoria"
              aria-labelledby="mode-tab-eliminatoria"
              className="te-evd-panel"
              hidden={activeTab !== "eliminatoria"}
            >
              <section
                className="te-evento-section"
                aria-labelledby="te-evento-elim-heading"
              >
                <h2
                  id="te-evento-elim-heading"
                  className="te-evento-section__title"
                >
                  Eliminatoria del evento
                </h2>
                <p className="te-evento-section__hint">
                  Horarios posibles en la vista pública. No genera el cuadro:
                  solo hora, orden de categorías y canchas.
                </p>
                <EventoEliminatoriaHorarioForm
                  inicioLocal={eliminatoriaInicioLocal}
                  onInicioLocalChange={setEliminatoriaInicioLocal}
                  categorias={categorias}
                  ordenIds={eliminatoriaOrdenIds}
                  onOrdenIdsChange={setEliminatoriaOrdenIds}
                  canchas={eliminatoriaCanchas}
                  onCanchasChange={setEliminatoriaCanchas}
                  duraciones={eliminatoriaDuraciones}
                  onDuracionesChange={setEliminatoriaDuraciones}
                />
                <div className="te-evd-savebar">
                  {eliminatoriaDirty ? (
                    <p className="te-evd-dirty" role="status">
                      Tienes cambios sin guardar
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="te-evd-savebar__btn"
                    loading={savingEliminatoria}
                    disabled={savingEliminatoria}
                    onClick={() => void handleSaveEliminatoria()}
                  >
                    {savingEliminatoria
                      ? "Guardando…"
                      : "Guardar eliminatoria"}
                  </Button>
                </div>
              </section>
            </div>

            <div
              role="tabpanel"
              id="mode-panel-reglas"
              aria-labelledby="mode-tab-reglas"
              className="te-evd-panel"
              hidden={activeTab !== "reglas"}
            >
              <section
                className="te-evento-section"
                aria-labelledby="te-evento-reglas-heading"
              >
                <h2
                  id="te-evento-reglas-heading"
                  className="te-evento-section__title"
                >
                  Reglas del evento
                </h2>
                <p className="te-evento-section__hint">
                  Aplican a todas las categorías y grupos de este evento.
                </p>
                <EventoReglasForm
                  clasificacionModo={clasificacionModo}
                  partidoFormato={partidoFormato}
                  onClasificacionChange={setClasificacionModo}
                  onPartidoFormatoChange={setPartidoFormato}
                  dirty={reglasDirty}
                  saving={savingReglas}
                  onSave={() => void handleSaveReglas()}
                />
              </section>
            </div>

            <div
              role="tabpanel"
              id="mode-panel-branding"
              aria-labelledby="mode-tab-branding"
              className="te-evd-panel"
              hidden={activeTab !== "branding"}
            >
              <section
                className="te-evento-section"
                aria-labelledby="te-evento-brand-heading"
              >
                <h2 id="te-evento-brand-heading" className="te-evento-section__title">
                  Branding del evento
                </h2>
                <p className="te-evento-section__hint">
                  Elige la imagen que identifica a este evento.
                </p>
                <EventoBrandingForm
                  logoSource={logoSource}
                  onLogoSourceChange={setLogoSource}
                  flyerUrl={flyerUrl}
                  onFlyerUrlChange={setFlyerUrl}
                  fileInputRef={fileInputRef}
                  uploading={uploadingFlyer}
                  uploadDisabled={!user?.id}
                  onFileSelected={(file) => void handleUploadFlyer(file)}
                  dirty={brandingDirty}
                  saving={savingBrand}
                  onSave={() => void handleSaveBranding()}
                />
              </section>
            </div>
          </>
        ) : null}
      </div>

      {actionToast ? (
        <div
          className={`te-gestion-toast te-gestion-toast--${actionToast.type}`}
          role="status"
          aria-live="polite"
        >
          {actionToast.message}
        </div>
      ) : null}

      {unsavedGuard.isPending ? (
        <TeUnsavedChangesModal
          kind={unsavedGuard.pendingKind ?? "navigate"}
          sections={dirtySections}
          onStay={unsavedGuard.stay}
          onLeave={unsavedGuard.confirmLeave}
        />
      ) : null}

      {deleteTarget ? (
        <TorneoExpressDeleteModal
          torneoNombre={
            formatTorneoExpressCategoria(deleteTarget.categoria) ||
            deleteTarget.nombre
          }
          deleting={deleting}
          onCancel={() => {
            if (deleting) return;
            setDeleteTarget(null);
          }}
          onConfirm={() => void handleConfirmDeleteCategoria()}
        />
      ) : null}
    </TePageShell>
  );
};
