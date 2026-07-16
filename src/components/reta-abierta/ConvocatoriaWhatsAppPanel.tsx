import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConvocatoriaAdapterContext,
  OpenRegistrationStatus,
} from "../../lib/retaAbierta/types";
import {
  buildRetaAbiertaPublicUrl,
  fetchOpenGameRegistrationConfig,
  fetchOpenRegistrationPublic,
  listOpenGameRegistrationEntries,
  promoteOpenRegistrationEntry,
  removeOpenRegistrationEntry,
  upsertOpenRegistrationConfig,
} from "../../lib/retaAbierta/retaAbiertaService";
import type {
  OpenRegistrationConfigRow,
  OpenRegistrationOrganizerEntry,
} from "../../lib/retaAbierta/types";
import {
  buildRetaAbiertaWhatsAppMessage,
  isoToDatetimeLocalValue,
} from "../../lib/retaAbierta/whatsappShareMessage";
import {
  assertConvocatoriaAllowedMode,
  isConvocatoriaAllowedMode,
} from "../../lib/retaAbierta/modeWhitelist";
import { mapConvocatoriaUserError } from "../../lib/retaAbierta/convocatoriaErrors";
import "./reta-abierta-organizer.css";

export type EnsureDraftEntityResult = {
  entityId: string;
  title?: string;
  locationLabel?: string;
  scheduledAtIso?: string | null;
  durationMinutes?: number | null;
  categoryLabel?: string | null;
};

interface Props {
  context: ConvocatoriaAdapterContext;
  /**
   * Si la entidad aún no existe (pantalla de creación), crea/reutiliza borrador
   * al pulsar Lanzar por WhatsApp.
   */
  ensureDraftEntity?: () => Promise<EnsureDraftEntityResult>;
  onEntityReady?: (entityId: string) => void;
  /** Validación previa ligera (nombre, cancha, etc.). */
  canLaunch?: () => string | null;
  compact?: boolean;
  /**
   * Pantalla gestionar: sin formulario de config; solo copiar mensaje
   * actualizado (jugadores ya inscritos).
   */
  shareOnly?: boolean;
}

function statusLabel(s: OpenRegistrationStatus): string {
  switch (s) {
    case "draft":
      return "Borrador";
    case "open":
      return "Abierta";
    case "paused":
      return "Pausada";
    case "closed":
      return "Cerrada";
    case "cancelled":
      return "Cancelada";
    default:
      return s;
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

/**
 * Panel administrativo unificado: Convocatoria Riviera / Lanzar por WhatsApp.
 * No montar en Liga / Torneo Express / Torneos.
 */
export const ConvocatoriaWhatsAppPanel: React.FC<Props> = ({
  context,
  ensureDraftEntity,
  onEntityReady,
  canLaunch,
  compact = false,
  shareOnly = false,
}) => {
  const [entityId, setEntityId] = useState(context.entityId.trim());
  const [cfg, setCfg] = useState<OpenRegistrationConfigRow | null>(null);
  const [entries, setEntries] = useState<OpenRegistrationOrganizerEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(context.entityId.trim()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const [titlePublic, setTitlePublic] = useState(context.defaultTitle);
  const [status, setStatus] = useState<OpenRegistrationStatus>("draft");
  const [capacity, setCapacity] = useState(context.defaultCapacity);
  const [waitlistEnabled, setWaitlistEnabled] = useState(
    context.mode !== "duelo_2v2"
  );
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() =>
    isoToDatetimeLocalValue(context.defaultScheduledAt)
  );
  const [durationMinutes, setDurationMinutes] = useState(
    context.defaultDurationMinutes ?? 90
  );
  const [categoryLabel, setCategoryLabel] = useState(
    context.defaultCategory ?? ""
  );
  const [ramaLabel, setRamaLabel] = useState("");
  const [locationLabel, setLocationLabel] = useState(
    context.defaultLocation ?? ""
  );
  const [displayRating, setDisplayRating] = useState(true);
  const [displayPhoto, setDisplayPhoto] = useState(true);
  const [displayFullName, setDisplayFullName] = useState(true);

  const clubName = (context.clubName ?? "").trim();

  useEffect(() => {
    setEntityId(context.entityId.trim());
  }, [context.entityId]);

  useEffect(() => {
    setTitlePublic(context.defaultTitle);
  }, [context.defaultTitle]);

  useEffect(() => {
    if (context.defaultLocation != null) {
      setLocationLabel(context.defaultLocation);
    }
  }, [context.defaultLocation]);

  useEffect(() => {
    const next = context.defaultCategory?.trim();
    if (next) setCategoryLabel(next);
  }, [context.defaultCategory]);

  useEffect(() => {
    if (context.defaultScheduledAt) {
      setScheduledAt(isoToDatetimeLocalValue(context.defaultScheduledAt));
    }
  }, [context.defaultScheduledAt]);

  useEffect(() => {
    if (context.defaultDurationMinutes != null) {
      setDurationMinutes(context.defaultDurationMinutes);
    }
  }, [context.defaultDurationMinutes]);

  const load = useCallback(async (id: string) => {
    if (!id) {
      setCfg(null);
      setEntries([]);
      setLoading(false);
      return;
    }
    if (!isConvocatoriaAllowedMode(context.mode)) {
      setError("Este modo no admite convocatoria por WhatsApp.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await fetchOpenGameRegistrationConfig(context.mode, id);
      setCfg(row);
      if (row) {
        setTitlePublic(row.title_public || context.defaultTitle);
        setStatus(row.status);
        setCapacity(context.lockCapacity ? context.defaultCapacity : row.capacity);
        setWaitlistEnabled(row.waitlist_enabled);
        setApprovalRequired(row.approval_required);
        setDeadline(
          row.registration_deadline
            ? isoToDatetimeLocalValue(row.registration_deadline)
            : ""
        );
        setScheduledAt(
          row.scheduled_at
            ? isoToDatetimeLocalValue(row.scheduled_at)
            : isoToDatetimeLocalValue(context.defaultScheduledAt)
        );
        setDurationMinutes(
          row.duration_minutes ?? context.defaultDurationMinutes ?? 90
        );
        setCategoryLabel(
          row.category_label ?? context.defaultCategory ?? ""
        );
        setRamaLabel(row.rama_label ?? "");
        setLocationLabel(row.location_label ?? context.defaultLocation ?? "");
        setDisplayRating(row.display_rating);
        setDisplayPhoto(row.display_photo);
        setDisplayFullName(row.display_full_name);
        const list = await listOpenGameRegistrationEntries(context.mode, id);
        setEntries(list);
      } else {
        setEntries([]);
      }
    } catch (e) {
      setError(mapConvocatoriaUserError(e, "load"));
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void load(entityId);
  }, [entityId, load]);

  const publicUrl = useMemo(
    () => (cfg?.public_slug ? buildRetaAbiertaPublicUrl(cfg.public_slug) : ""),
    [cfg?.public_slug]
  );

  const confirmed = entries.filter((e) => e.status === "confirmed");
  const waitlist = entries.filter((e) => e.status === "waitlist");
  const pending = entries.filter((e) => e.status === "pending_approval");

  const savePayload = (
    id: string,
    overrides?: {
      enabled?: boolean;
      status?: OpenRegistrationStatus;
      scheduledAtIso?: string | null;
      locationLabel?: string;
      durationMinutes?: number | null;
      titlePublic?: string;
      categoryLabel?: string | null;
    }
  ) => {
    assertConvocatoriaAllowedMode(context.mode);
    const schedLocal =
      overrides?.scheduledAtIso != null
        ? overrides.scheduledAtIso
        : scheduledAt
          ? new Date(scheduledAt).toISOString()
          : context.defaultScheduledAt ?? null;
    const loc =
      overrides?.locationLabel != null
        ? overrides.locationLabel
        : locationLabel;
    const dur =
      overrides?.durationMinutes != null
        ? overrides.durationMinutes
        : durationMinutes;
    const title =
      overrides?.titlePublic != null
        ? overrides.titlePublic
        : titlePublic.trim() || context.defaultTitle;
    const category =
      overrides?.categoryLabel !== undefined
        ? overrides.categoryLabel
        : categoryLabel.trim() || context.defaultCategory || null;

    return upsertOpenRegistrationConfig({
      mode: context.mode,
      entityId: id,
      tournamentId: context.mode === "duelo_2v2" ? undefined : id,
      enabled: overrides?.enabled ?? true,
      status: overrides?.status ?? status,
      capacity: context.lockCapacity ? context.defaultCapacity : capacity,
      waitlistEnabled,
      approvalRequired,
      registrationDeadline: deadline ? new Date(deadline).toISOString() : null,
      scheduledAt: schedLocal,
      durationMinutes: dur,
      categoryLabel:
        typeof category === "string" ? category.trim() || null : null,
      locationLabel: loc.trim() || null,
      titlePublic: title,
      ramaLabel: ramaLabel.trim() || null,
      displayRating,
      displayPhoto,
      displayFullName,
    });
  };

  const buildShareText = (
    dto: Parameters<typeof buildRetaAbiertaWhatsAppMessage>[0]["dto"],
    url: string
  ) =>
    buildRetaAbiertaWhatsAppMessage({
      dto,
      publicUrl: url,
      clubName,
      displayFullName,
      productHeadline: context.productHeadline,
    });

  const onLaunchWhatsApp = async () => {
    setSaving(true);
    setError(null);
    setShareNote(true);
    try {
      if (!isConvocatoriaAllowedMode(context.mode)) {
        throw new Error("Este modo no admite convocatoria por WhatsApp.");
      }
      const pre = canLaunch?.() ?? null;
      if (pre) {
        setError(pre);
        return;
      }

      let id = entityId;
      let launchScheduledIso: string | null =
        scheduledAt
          ? new Date(scheduledAt).toISOString()
          : context.defaultScheduledAt ?? null;
      let launchLocation = locationLabel;
      let launchDuration = durationMinutes;
      let launchTitle = titlePublic.trim() || context.defaultTitle;
      let launchCategory =
        categoryLabel.trim() ||
        context.defaultCategory?.trim() ||
        cfg?.category_label?.trim() ||
        "";

      if (!id) {
        if (!ensureDraftEntity) {
          throw new Error("Guarda el evento antes de lanzar la convocatoria.");
        }
        const draft = await ensureDraftEntity();
        id = draft.entityId.trim();
        if (!id) throw new Error("No se pudo crear el borrador del evento.");
        setEntityId(id);
        onEntityReady?.(id);
        if (draft.title) {
          launchTitle = draft.title;
          setTitlePublic(draft.title);
        }
        if (draft.locationLabel) {
          launchLocation = draft.locationLabel;
          setLocationLabel(draft.locationLabel);
        }
        if (draft.scheduledAtIso) {
          launchScheduledIso = draft.scheduledAtIso;
          setScheduledAt(isoToDatetimeLocalValue(draft.scheduledAtIso));
        }
        if (draft.durationMinutes != null) {
          launchDuration = draft.durationMinutes;
          setDurationMinutes(draft.durationMinutes);
        }
        if (draft.categoryLabel?.trim()) {
          launchCategory = draft.categoryLabel.trim();
          setCategoryLabel(launchCategory);
        }
      }

      // Re-lanzar / gestionar: no exigir categoría otra vez
      const alreadyLive =
        Boolean(cfg?.public_slug) ||
        (Boolean(cfg?.enabled) && cfg?.status !== "draft");

      if (!launchCategory.trim() && !alreadyLive && !shareOnly) {
        setError("Indica la categoría / nivel antes de lanzar.");
        return;
      }

      if (!launchCategory.trim()) {
        launchCategory =
          cfg?.category_label?.trim() ||
          context.defaultCategory?.trim() ||
          "";
      }

      const row = await savePayload(id, {
        enabled: true,
        status: "open",
        scheduledAtIso: launchScheduledIso,
        locationLabel: launchLocation,
        durationMinutes: launchDuration,
        titlePublic: launchTitle,
        categoryLabel:
          launchCategory.trim() ||
          cfg?.category_label?.trim() ||
          null,
      });
      setCfg(row);
      setStatus("open");
      if (launchCategory.trim()) {
        setCategoryLabel(launchCategory);
      }
      const url = buildRetaAbiertaPublicUrl(row.public_slug);
      const pub = await fetchOpenRegistrationPublic(row.public_slug);
      if (!pub.ok) {
        setError(
          "Convocatoria guardada, pero no se pudo armar el mensaje. Puedes copiar el enlace."
        );
        await load(id);
        return;
      }
      const dtoForShare = {
        ...pub.dto,
        scheduled_at: pub.dto.scheduled_at || launchScheduledIso,
        duration_minutes: pub.dto.duration_minutes ?? launchDuration,
        location_label: pub.dto.location_label || launchLocation || null,
        category_label: pub.dto.category_label || launchCategory || null,
      };
      const text = buildShareText(dtoForShare, url);
      await copyTextToClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2800);
      await load(id);
    } catch (e) {
      setError(mapConvocatoriaUserError(e, "launch"));
    } finally {
      setSaving(false);
    }
  };

  const onCopy = async () => {
    if (!publicUrl || !cfg) return;
    setSaving(true);
    setError(null);
    setShareNote(true);
    try {
      const pub = await fetchOpenRegistrationPublic(cfg.public_slug);
      const text = pub.ok
        ? buildShareText(pub.dto, publicUrl)
        : publicUrl;
      await copyTextToClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2800);
    } catch {
      setError("No se pudo copiar el mensaje");
    } finally {
      setSaving(false);
    }
  };

  if (!isConvocatoriaAllowedMode(context.mode)) {
    return null;
  }

  if (loading && entityId) {
    return (
      <section className="ra-org" data-testid="convocatoria-whatsapp-panel">
        <h3>Convocatoria Riviera</h3>
        <p className="ra-org__muted">Cargando…</p>
      </section>
    );
  }

  const hasShareLink = Boolean(cfg?.public_slug);
  const isLive =
    shareOnly ||
    hasShareLink ||
    (Boolean(cfg?.enabled) && cfg?.status !== "draft");
  /** Ya lanzada o en gestionar: solo resumen + copiar; sin formulario. */
  const showConfigForm = !compact && !isLive && !shareOnly;

  const onPrimaryShare = () => {
    if (hasShareLink) {
      void onCopy();
      return;
    }
    void onLaunchWhatsApp();
  };

  return (
    <section
      className={`ra-org${compact || isLive || shareOnly ? " ra-org--compact" : ""}`}
      data-testid="convocatoria-whatsapp-panel"
    >
      <h3>Convocatoria Riviera</h3>
      <p className="ra-org__muted">
        {isLive || shareOnly
          ? "Copia el mensaje actualizado con los jugadores que ya se inscribieron y pégalo en WhatsApp."
          : "Comparte este juego por WhatsApp: se copia el mensaje con todos los datos para que lo pegues en el chat."}
      </p>

      {(shareOnly || isLive) && cfg ? (
        <div className="ra-org__summary">
          <p>
            <strong>Estado:</strong> {statusLabel(cfg.status)}
            {cfg.category_label?.trim()
              ? ` · ${cfg.category_label.trim()}`
              : ""}
          </p>
          <p>
            <strong>Confirmados:</strong> {confirmed.length} de{" "}
            {context.lockCapacity ? context.defaultCapacity : cfg.capacity}
            {waitlist.length > 0 ? ` · Espera: ${waitlist.length}` : ""}
            {confirmed.length > 0 &&
            confirmed.length <
              (context.lockCapacity ? context.defaultCapacity : cfg.capacity)
              ? ` · Faltan ${
                  (context.lockCapacity
                    ? context.defaultCapacity
                    : cfg.capacity) - confirmed.length
                }`
              : ""}
          </p>
          {context.mode === "duelo_2v2" && confirmed.length >= 4 ? (
            <p className="ra-org__ready">
              Ya son los 4 jugadores. Organiza las parejas para iniciar el
              duelo.
            </p>
          ) : null}
        </div>
      ) : null}

      {shareOnly && !cfg && !loading ? (
        <p className="ra-org__muted">
          Aún no hay convocatoria activa. Pulsa el botón para crear el enlace y
          copiar el mensaje.
        </p>
      ) : null}

      {showConfigForm ? (
        <>
          <div className="ra-org__grid">
            <label>
              Título público
              <input
                value={titlePublic}
                onChange={(e) => setTitlePublic(e.target.value)}
              />
            </label>
            {!context.lockCapacity ? (
              <label>
                Cupo máximo
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value) || 4)}
                />
              </label>
            ) : (
              <label>
                Cupo
                <input type="text" value="4 jugadores" readOnly />
              </label>
            )}
            <label>
              Categoría / nivel
              <input
                value={categoryLabel}
                onChange={(e) => setCategoryLabel(e.target.value)}
                placeholder="Ej. 5ta Fuerza"
              />
            </label>
            <label>
              Mostrar rating
              <select
                value={displayRating ? "1" : "0"}
                onChange={(e) => setDisplayRating(e.target.value === "1")}
              >
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </label>
          </div>
          <div className="ra-org__checks">
            <label>
              <input
                type="checkbox"
                checked={waitlistEnabled}
                onChange={(e) => setWaitlistEnabled(e.target.checked)}
              />
              Permitir lista de espera
            </label>
            <label>
              <input
                type="checkbox"
                checked={displayPhoto}
                onChange={(e) => setDisplayPhoto(e.target.checked)}
              />
              Mostrar fotografía
            </label>
          </div>
        </>
      ) : null}

      <div className="ra-org__actions">
        <button
          type="button"
          className="ra-org__btn ra-org__btn--primary"
          data-testid="lanzar-por-whatsapp"
          onClick={onPrimaryShare}
          disabled={saving}
        >
          {saving
            ? "Copiando…"
            : copied
              ? "¡Copiado! Pégalo en WhatsApp"
              : hasShareLink
                ? "Copiar convocatoria actualizada"
                : "Lanzar y copiar"}
        </button>
        {hasShareLink ? (
          <>
            <a
              className="ra-org__btn"
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver convocatoria
            </a>
            <button
              type="button"
              className="ra-org__btn"
              onClick={() => setShowAdmin((v) => !v)}
            >
              Administrar inscritos
            </button>
            {cfg?.status === "open" ? (
              <button
                type="button"
                className="ra-org__btn"
                disabled={saving}
                onClick={async () => {
                  if (!entityId) return;
                  setSaving(true);
                  try {
                    const row = await savePayload(entityId, {
                      enabled: true,
                      status: "paused",
                      categoryLabel:
                        categoryLabel.trim() ||
                        cfg.category_label ||
                        context.defaultCategory ||
                        null,
                    });
                    setCfg(row);
                    setStatus("paused");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Pausar
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {shareNote ? (
        <p className="ra-org__muted">
          Se copió el mensaje completo (fecha, cancha, cupos y enlace). Ábrelo
          en WhatsApp y pégalo. El enlace siempre muestra la lista actualizada.
        </p>
      ) : null}

      {error ? <p className="ra-org__error">{error}</p> : null}

      {showAdmin && entityId ? (
        <div className="ra-org__lists">
          <h4>
            Confirmados ({confirmed.length}/
            {context.lockCapacity ? context.defaultCapacity : capacity})
          </h4>
          <ul>
            {confirmed.map((e) => (
              <li key={e.id}>
                <span>
                  {e.nombre} · {e.riviera_id}
                </span>
                <button
                  type="button"
                  className="ra-org__btn ra-org__btn--sm"
                  onClick={async () => {
                    await removeOpenRegistrationEntry(e.id, entityId);
                    await load(entityId);
                  }}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          {pending.length > 0 ? (
            <>
              <h4>Pendientes</h4>
              <ul>
                {pending.map((e) => (
                  <li key={e.id}>
                    <span>
                      {e.nombre} · {e.riviera_id}
                    </span>
                    <button
                      type="button"
                      className="ra-org__btn ra-org__btn--sm"
                      onClick={async () => {
                        await promoteOpenRegistrationEntry(e.id);
                        await load(entityId);
                      }}
                    >
                      Aprobar
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h4>Lista de espera ({waitlist.length})</h4>
          <ul>
            {waitlist.map((e) => (
              <li key={e.id}>
                <span>
                  {e.nombre} · {e.riviera_id}
                </span>
                <button
                  type="button"
                  className="ra-org__btn ra-org__btn--sm"
                  onClick={async () => {
                    await promoteOpenRegistrationEntry(e.id);
                    await load(entityId);
                  }}
                >
                  Promover
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default ConvocatoriaWhatsAppPanel;
