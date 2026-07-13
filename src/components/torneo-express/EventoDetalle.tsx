import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  TorneoExpress,
  TorneoExpressEvento,
  TorneoExpressEventoLogoSource,
} from "../../lib/torneoExpress/types";
import { slugifyEvento } from "../../lib/torneoExpress/eventoSlug";
import { formatTorneoExpressCategoria } from "../../lib/torneoExpress/formatCategoria";
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
import { Badge, Button, Input } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { ActionBar } from "../platform/ActionBar";
import { TePageShell } from "./TePageShell";
import { TorneoExpressDeleteModal } from "./TorneoExpressDeleteModal";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-eventos.css";

const EVENTO_ESTADO_LABEL: Record<TorneoExpressEvento["estado"], string> = {
  draft: "Borrador",
  published: "Publicado",
  in_progress: "En curso",
  completed: "Finalizado",
  archived: "Archivado",
};

const TORNEO_ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  finalizado: "Finalizado",
};

function formatFecha(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

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
      const synced = await syncEventoEstadoFromCategorias(data.evento.id).catch(
        () => null
      );
      if (synced) {
        setEvento(synced);
        setLogoSource(synced.logo_source);
        setFlyerUrl(synced.flyer_url ?? "");
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
            <header className="te-evento-detalle__header">
              <div className="te-evento-detalle__title-row">
                <h1 className="te-evento-detalle__title">{evento.nombre}</h1>
                <Badge
                  variant={
                    evento.estado === "draft"
                      ? "pending"
                      : evento.estado === "completed"
                        ? "finished"
                        : "live"
                  }
                >
                  {EVENTO_ESTADO_LABEL[evento.estado]}
                </Badge>
              </div>
              <p className="te-evento-detalle__meta">
                {[
                  formatFecha(evento.fecha_inicio),
                  formatFecha(evento.fecha_fin),
                ]
                  .filter(Boolean)
                  .join(" – ") || "Fechas por definir"}
                {" · "}
                {evento.timezone}
                {evento.slug ? ` · /${evento.slug}` : ""}
              </p>
              <div className="te-evento-detalle__actions">
                {(evento.estado === "draft" ||
                  evento.estado === "published" ||
                  evento.estado === "in_progress" ||
                  evento.estado === "completed") && (
                  <Button
                    type="button"
                    variant={evento.estado === "draft" ? "primary" : "secondary"}
                    size="sm"
                    loading={publishing}
                    disabled={publishing}
                    onClick={() => void handlePublishToggle()}
                  >
                    {evento.estado === "draft"
                      ? "Publicar evento"
                      : "Volver a borrador"}
                  </Button>
                )}
                {evento.slug &&
                (evento.estado === "published" ||
                  evento.estado === "in_progress" ||
                  evento.estado === "completed") ? (
                  <Button
                    as="a"
                    href={`/eventos/${evento.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    size="sm"
                  >
                    Ver página pública
                  </Button>
                ) : null}
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
                  Agregar categoría
                </Button>
              </div>
            </header>

            <section
              className="te-evento-section"
              aria-labelledby="te-evento-cats-heading"
            >
              <h2 id="te-evento-cats-heading" className="te-evento-section__title">
                Categorías
              </h2>
              <p className="te-evento-section__hint">
                Cada categoría es un torneo independiente (grupos, standings y
                eliminatoria aislados).
              </p>
              {categorias.length === 0 ? (
                <div className="te-torneos-empty">
                  <p>Sin categorías todavía.</p>
                  <p>Agrega una: se arma igual que un torneo normal.</p>
                </div>
              ) : (
                <ul className="te-eventos-list">
                  {categorias.map((cat) => {
                    const title = categoriaDisplayLabel(cat);
                    const isEditing = editingCategoriaId === cat.id;
                    return (
                    <li key={cat.id} className="te-evento-card">
                      <div className="te-evento-card__main">
                        <div className="te-evento-card__top">
                          {isEditing ? (
                            <div
                              className="te-evento-cat-edit"
                              role="group"
                              aria-label={`Renombrar ${title}`}
                            >
                              <input
                                type="text"
                                className="te-evento-cat-edit__input"
                                value={draftCategoriaNombre}
                                onChange={(e) =>
                                  setDraftCategoriaNombre(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commitEditCategoria(cat.id);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEditCategoria();
                                  }
                                }}
                                disabled={savingCategoriaId === cat.id}
                                maxLength={80}
                                autoFocus
                                aria-label="Nuevo nombre de la categoría"
                              />
                              <button
                                type="button"
                                className="te-evento-cat-edit__btn te-evento-cat-edit__btn--ok"
                                onClick={() => void commitEditCategoria(cat.id)}
                                disabled={savingCategoriaId === cat.id}
                                aria-label="Guardar categoría"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="te-evento-cat-edit__btn"
                                onClick={cancelEditCategoria}
                                disabled={savingCategoriaId === cat.id}
                                aria-label="Cancelar"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <h3 className="te-evento-card__title">{title}</h3>
                              <button
                                type="button"
                                className="te-evento-cat-edit__pencil"
                                onClick={() => startEditCategoria(cat)}
                                aria-label={`Editar categoría ${title}`}
                                title="Editar categoría"
                              >
                                <TablerIcon name="pencil" size={14} />
                              </button>
                            </>
                          )}
                          <Badge
                            variant={
                              cat.estado === "finalizado"
                                ? "finished"
                                : cat.estado === "en_curso"
                                  ? "live"
                                  : "pending"
                            }
                          >
                            {TORNEO_ESTADO_LABEL[cat.estado] ?? cat.estado}
                          </Badge>
                        </div>
                      </div>
                      <div className="te-evento-card__actions">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            navigateTorneoExpress(
                              `/torneo-express/${cat.id}/gestionar`
                            )
                          }
                        >
                          Gestionar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deleting || savingCategoriaId === cat.id}
                          onClick={() => setDeleteTarget(cat)}
                        >
                          Borrar
                        </Button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section
              className="te-evento-section"
              aria-labelledby="te-evento-brand-heading"
            >
              <h2 id="te-evento-brand-heading" className="te-evento-section__title">
                Branding del evento
              </h2>
              <div className="te-evento-brand">
                <fieldset className="te-evento-brand__source">
                  <legend className="te-evento-field__label">Origen del logo</legend>
                  <label className="te-evento-radio">
                    <input
                      type="radio"
                      name="logo_source"
                      checked={logoSource === "club"}
                      onChange={() => setLogoSource("club")}
                    />
                    Logo del club (upgrade / Riviera)
                  </label>
                  <label className="te-evento-radio">
                    <input
                      type="radio"
                      name="logo_source"
                      checked={logoSource === "flyer"}
                      onChange={() => setLogoSource("flyer")}
                    />
                    Flyer del evento
                  </label>
                </fieldset>
                {logoSource === "flyer" ? (
                  <div className="te-evento-flyer-tools">
                    {flyerUrl.trim() ? (
                      <div className="te-evento-flyer-preview">
                        <img
                          src={flyerUrl.trim()}
                          alt="Vista previa del flyer"
                          className="te-evento-flyer-preview__img"
                        />
                      </div>
                    ) : null}
                    <div className="te-evento-flyer-upload">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/*"
                        className="te-evento-flyer-upload__input"
                        disabled={uploadingFlyer}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          void handleUploadFlyer(file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={uploadingFlyer}
                        disabled={uploadingFlyer || !user?.id}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploadingFlyer ? "Subiendo…" : "Subir flyer"}
                      </Button>
                      <span className="te-evento-flyer-upload__hint">
                        JPEG, PNG o WebP · máx. 5 MB
                      </span>
                    </div>
                    <label className="te-evento-field">
                      <span className="te-evento-field__label">
                        O pega una URL
                      </span>
                      <Input
                        value={flyerUrl}
                        onChange={(e) => setFlyerUrl(e.target.value)}
                        placeholder="https://…"
                      />
                    </label>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={savingBrand}
                  disabled={savingBrand || uploadingFlyer}
                  onClick={() => void handleSaveBranding()}
                >
                  {savingBrand ? "Guardando…" : "Guardar branding"}
                </Button>
              </div>
            </section>
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
