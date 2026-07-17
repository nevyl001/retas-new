import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConvocatoriaAdapterContext,
  OpenRegistrationStatus,
} from "../../lib/retaAbierta/types";
import {
  buildRetaAbiertaPublicUrl,
  fetchOpenGameRegistrationConfig,
  listOpenGameRegistrationEntries,
  OPEN_REG_CAPACITY_MAX,
  OPEN_REG_CAPACITY_MIN,
  promoteOpenRegistrationEntry,
  removeOpenRegistrationEntry,
  setOpenGameRegistrationCapacity,
  upsertOpenRegistrationConfig,
} from "../../lib/retaAbierta/retaAbiertaService";
import { buildShareRetaOgUrl } from "../../lib/retaAbierta/shareOgUrl";
import type {
  OpenRegistrationConfigRow,
  OpenRegistrationOrganizerEntry,
} from "../../lib/retaAbierta/types";
import {
  buildRetaAbiertaWhatsAppMessage,
  isoToDatetimeLocalValue,
} from "../../lib/retaAbierta/whatsappShareMessage";
import { buildShareDtoFromOrganizerState } from "../../lib/retaAbierta/buildShareDtoFromOrganizerState";
import { copyTextToClipboard } from "../../lib/clipboard/copyTextToClipboard";
import {
  assertConvocatoriaAllowedMode,
  isConvocatoriaAllowedMode,
} from "../../lib/retaAbierta/modeWhitelist";
import { mapConvocatoriaUserError } from "../../lib/retaAbierta/convocatoriaErrors";
import {
  readConvocatoriaLugarPrefs,
  writeConvocatoriaLugarPrefs,
} from "../../lib/retaAbierta/convocatoriaLugarPrefs";
import { syncConvocatoriaMetaToEntity } from "../../lib/retaAbierta/syncConvocatoriaMetaToEntity";
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
  const [capacityBusy, setCapacityBusy] = useState(false);
  const [capacityHint, setCapacityHint] = useState<string | null>(null);
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
  const [canchaLabel, setCanchaLabel] = useState(
    context.defaultCancha ?? ""
  );
  const [includeLugar, setIncludeLugar] = useState(
    context.includeLugar !== false
  );
  const [displayRating, setDisplayRating] = useState(true);
  const [displayFullName, setDisplayFullName] = useState(true);

  const clubName = (context.clubName ?? "").trim();

  const persistLugarPrefs = useCallback(
    (id: string, next?: { lugar?: string; mostrarLugar?: boolean; cancha?: string }) => {
      if (!id.trim() || context.mode === "duelo_2v2") return;
      writeConvocatoriaLugarPrefs(context.mode, id, {
        lugar: next?.lugar ?? locationLabel,
        mostrarLugar: next?.mostrarLugar ?? includeLugar,
        cancha: next?.cancha ?? canchaLabel,
      });
    },
    [context.mode, locationLabel, includeLugar, canchaLabel]
  );

  useEffect(() => {
    if (context.includeLugar != null) {
      setIncludeLugar(context.includeLugar !== false);
    }
  }, [context.includeLugar]);

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
    if (context.defaultCancha != null) {
      setCanchaLabel(context.defaultCancha);
    }
  }, [context.defaultCancha]);

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
        // Display desde entidad (context), no cache title_public / location_label.
        setTitlePublic(context.defaultTitle);
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
          context.defaultScheduledAt
            ? isoToDatetimeLocalValue(context.defaultScheduledAt)
            : row.scheduled_at
              ? isoToDatetimeLocalValue(row.scheduled_at)
              : ""
        );
        setDurationMinutes(
          context.defaultDurationMinutes ??
            row.duration_minutes ??
            90
        );
        setCategoryLabel(
          row.category_label ?? context.defaultCategory ?? ""
        );
        setRamaLabel(row.rama_label ?? "");
        const prefs =
          context.mode !== "duelo_2v2"
            ? readConvocatoriaLugarPrefs(context.mode, id)
            : null;
        setIncludeLugar(
          prefs
            ? prefs.mostrarLugar !== false
            : context.includeLugar !== false
        );
        setLocationLabel(
          context.defaultLocation ??
            prefs?.lugar ??
            row.location_label ??
            ""
        );
        if (context.defaultCancha) {
          setCanchaLabel(context.defaultCancha);
        } else if (prefs?.cancha) {
          setCanchaLabel(prefs.cancha);
        }
        setDisplayRating(row.display_rating);
        setDisplayFullName(row.display_full_name);
        const list = await listOpenGameRegistrationEntries(context.mode, id);
        setEntries(list);
      } else {
        setEntries([]);
        if (context.mode !== "duelo_2v2") {
          const prefs = readConvocatoriaLugarPrefs(context.mode, id);
          if (prefs) {
            setIncludeLugar(prefs.mostrarLugar !== false);
            if (prefs.lugar) setLocationLabel(prefs.lugar);
            if (prefs.cancha) setCanchaLabel(prefs.cancha);
          }
        }
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
  /** URL para WhatsApp / crawlers (OG dinámico). */
  const shareOgUrl = useMemo(
    () => (cfg?.public_slug ? buildShareRetaOgUrl(cfg.public_slug) : ""),
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
      displayPhoto: true,
      displayFullName,
    }).then(async (row) => {
      await syncConvocatoriaMetaToEntity({
        mode: context.mode,
        entityId: id,
        name: context.defaultTitle,
        locationLabel: loc.trim() || null,
        canchaLabel: canchaLabel.trim() || null,
        includeLugar,
        scheduledAt: schedLocal,
        durationMinutes: dur,
      });
      return row;
    });
  };

  const buildLocalShareText = (
    row: OpenRegistrationConfigRow,
    url: string,
    overrides?: {
      scheduledAtIso?: string | null;
      durationMinutes?: number | null;
      locationLabel?: string | null;
      categoryLabel?: string | null;
      includeLugar?: boolean;
    }
  ) => {
    const dto = buildShareDtoFromOrganizerState(row, entries, context);
    const resolvedDuration =
      overrides?.durationMinutes ??
      (durationMinutes ||
        context.defaultDurationMinutes ||
        dto.duration_minutes ||
        90);
    const localScheduledIso = scheduledAt
      ? new Date(scheduledAt).toISOString()
      : null;
    const showLugar = overrides?.includeLugar ?? includeLugar;
    const localLocation = locationLabel.trim() || null;
    /** En gestionar (shareOnly), el horario del duelo viene del context/editor. */
    const resolvedScheduled = shareOnly
      ? overrides?.scheduledAtIso ??
        context.defaultScheduledAt ??
        localScheduledIso ??
        dto.scheduled_at ??
        null
      : overrides?.scheduledAtIso ??
        localScheduledIso ??
        dto.scheduled_at ??
        context.defaultScheduledAt ??
        null;
    const resolvedLocation = showLugar
      ? shareOnly
        ? overrides?.locationLabel ??
          context.defaultLocation ??
          localLocation ??
          dto.location_label ??
          null
        : overrides?.locationLabel ??
          localLocation ??
          dto.location_label ??
          context.defaultLocation ??
          null
      : null;
    return buildRetaAbiertaWhatsAppMessage({
      dto: {
        ...dto,
        scheduled_at: resolvedScheduled,
        duration_minutes: resolvedDuration,
        location_label: resolvedLocation,
        category_label:
          overrides?.categoryLabel?.trim() ||
          categoryLabel.trim() ||
          dto.category_label ||
          context.defaultCategory ||
          null,
      },
      publicUrl: url,
      clubName,
      canchaLabel:
        (shareOnly ? context.defaultCancha : null) ||
        canchaLabel.trim() ||
        context.defaultCancha ||
        null,
      includeLugar: shareOnly
        ? context.includeLugar !== false
        : showLugar,
      displayFullName,
      productHeadline: context.productHeadline,
    });
  };

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
      let launchDuration = durationMinutes || context.defaultDurationMinutes || 90;
      let launchTitle = titlePublic.trim() || context.defaultTitle;
      let launchCategory =
        categoryLabel.trim() ||
        context.defaultCategory?.trim() ||
        cfg?.category_label?.trim() ||
        "";
      const launchIncludeLugar = includeLugar;
      const launchCancha = canchaLabel.trim();

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
        locationLabel: launchIncludeLugar
          ? launchLocation
          : launchLocation.trim() || clubName || "",
        durationMinutes: launchDuration,
        titlePublic: launchTitle,
        categoryLabel:
          launchCategory.trim() ||
          cfg?.category_label?.trim() ||
          null,
      });
      setCfg(row);
      setStatus("open");
      persistLugarPrefs(id, {
        lugar: launchLocation,
        mostrarLugar: launchIncludeLugar,
        cancha: launchCancha,
      });
      if (launchCategory.trim()) {
        setCategoryLabel(launchCategory);
      }
      const url = buildShareRetaOgUrl(row.public_slug);
      const text = buildLocalShareText(row, url, {
        scheduledAtIso: launchScheduledIso,
        durationMinutes: launchDuration,
        locationLabel: launchIncludeLugar ? launchLocation : null,
        categoryLabel: launchCategory.trim() || null,
        includeLugar: launchIncludeLugar,
      });
      const copied = await copyTextToClipboard(text);
      if (!copied) {
        setError(
          "Convocatoria guardada. No se pudo copiar el mensaje; pulsa «Copiar convocatoria actualizada»."
        );
      } else {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2800);
      }
      await load(id);
    } catch (e) {
      setError(mapConvocatoriaUserError(e, "launch"));
    } finally {
      setSaving(false);
    }
  };

  const onCopy = () => {
    if (!shareOgUrl || !cfg) return;
    setSaving(true);
    setError(null);
    setShareNote(true);

    const scheduledIso = shareOnly
      ? context.defaultScheduledAt ??
        (scheduledAt ? new Date(scheduledAt).toISOString() : null) ??
        cfg.scheduled_at
      : scheduledAt
        ? new Date(scheduledAt).toISOString()
        : cfg.scheduled_at ?? context.defaultScheduledAt ?? null;
    const dur = shareOnly
      ? context.defaultDurationMinutes ||
        durationMinutes ||
        cfg.duration_minutes ||
        90
      : durationMinutes ||
        context.defaultDurationMinutes ||
        cfg.duration_minutes ||
        90;
    const loc = shareOnly
      ? (context.defaultLocation ?? locationLabel).trim()
      : locationLabel.trim();
    const copyIncludeLugar = shareOnly
      ? context.includeLugar !== false
      : includeLugar;

    void (async () => {
      try {
        if (entityId && !shareOnly) {
          const row = await savePayload(entityId, {
            enabled: cfg.enabled,
            status: cfg.status,
            scheduledAtIso: scheduledIso,
            durationMinutes: dur,
            locationLabel: loc || clubName || "",
            categoryLabel:
              categoryLabel.trim() ||
              cfg.category_label ||
              context.defaultCategory ||
              null,
          });
          setCfg(row);
          persistLugarPrefs(entityId, {
            lugar: loc,
            mostrarLugar: includeLugar,
            cancha: canchaLabel.trim(),
          });
        }
      } catch {
        /* no bloquear la copia */
      }

      const text = buildLocalShareText(cfg, shareOgUrl, {
        scheduledAtIso: scheduledIso,
        durationMinutes: dur,
        locationLabel: copyIncludeLugar ? loc || null : null,
        includeLugar: copyIncludeLugar,
      });
      const copied = await copyTextToClipboard(text);
      if (!copied) {
        setError("No se pudo copiar el mensaje");
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2800);
    })().finally(() => {
      setSaving(false);
    });
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
  /** Ya lanzada o en gestionar: sin título/cupo/checks; sí lugar/horario. */
  const showConfigForm = !compact && !isLive && !shareOnly;
  /** Lugar + horario en todos los modos de convocatoria (excepto shareOnly duelo). */
  const showMeetupFields = !shareOnly && !compact;
  /** Cupo editable solo si no es duelo (lockCapacity) y ya hay convocatoria. */
  const showLiveCapacityControl =
    !context.lockCapacity && Boolean(cfg) && (isLive || shareOnly);

  const effectiveCapacity = context.lockCapacity
    ? context.defaultCapacity
    : cfg?.capacity ?? capacity;

  const onAdjustCapacity = async (nextRaw: number) => {
    if (!entityId || context.lockCapacity || capacityBusy) return;
    const next = Math.max(
      OPEN_REG_CAPACITY_MIN,
      Math.min(OPEN_REG_CAPACITY_MAX, Math.round(nextRaw))
    );
    if (next === effectiveCapacity) return;
    setCapacityHint(null);
    setCapacityBusy(true);
    setError(null);
    try {
      const res = await setOpenGameRegistrationCapacity(
        context.mode,
        entityId,
        next
      );
      if (!res.ok) {
        setCapacityHint(res.message);
        setError(res.message);
        return;
      }
      setCapacity(res.capacity);
      setCfg((prev) =>
        prev ? { ...prev, capacity: res.capacity } : prev
      );
      if (res.promoted_count > 0) {
        setCapacityHint(
          `Cupo actualizado a ${res.capacity}. Se confirmaron ${res.promoted_count} de la lista de espera.`
        );
        const list = await listOpenGameRegistrationEntries(
          context.mode,
          entityId
        );
        setEntries(list);
      } else {
        setCapacityHint(`Cupo actualizado a ${res.capacity}.`);
      }
    } catch (e) {
      setError(mapConvocatoriaUserError(e, "action"));
    } finally {
      setCapacityBusy(false);
    }
  };

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
            {effectiveCapacity}
            {waitlist.length > 0 ? ` · Espera: ${waitlist.length}` : ""}
            {confirmed.length > 0 && confirmed.length < effectiveCapacity
              ? ` · Faltan ${effectiveCapacity - confirmed.length}`
              : ""}
          </p>
          {showLiveCapacityControl ? (
            <div
              className="ra-org__capacity"
              data-testid="convocatoria-capacity-control"
            >
              <span className="ra-org__capacity-label">Cupo</span>
              <div className="ra-org__capacity-stepper">
                <button
                  type="button"
                  className="ra-org__capacity-btn"
                  aria-label="Bajar cupo"
                  disabled={
                    capacityBusy ||
                    effectiveCapacity <=
                      Math.max(OPEN_REG_CAPACITY_MIN, confirmed.length)
                  }
                  onClick={() => void onAdjustCapacity(effectiveCapacity - 1)}
                >
                  −
                </button>
                <input
                  className="ra-org__capacity-input"
                  type="number"
                  min={Math.max(OPEN_REG_CAPACITY_MIN, confirmed.length)}
                  max={OPEN_REG_CAPACITY_MAX}
                  value={effectiveCapacity}
                  disabled={capacityBusy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setCapacity(n);
                  }}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    void onAdjustCapacity(n);
                  }}
                />
                <button
                  type="button"
                  className="ra-org__capacity-btn"
                  aria-label="Subir cupo"
                  disabled={
                    capacityBusy || effectiveCapacity >= OPEN_REG_CAPACITY_MAX
                  }
                  onClick={() => void onAdjustCapacity(effectiveCapacity + 1)}
                >
                  +
                </button>
              </div>
              {capacityHint ? (
                <p className="ra-org__capacity-hint" role="status">
                  {capacityHint}
                </p>
              ) : (
                <p className="ra-org__hint">
                  Mínimo {Math.max(OPEN_REG_CAPACITY_MIN, confirmed.length)}{" "}
                  (confirmados). Máximo {OPEN_REG_CAPACITY_MAX}.
                </p>
              )}
            </div>
          ) : null}
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

      {showMeetupFields ? (
        <div className="ra-org__meetup" data-testid="convocatoria-meetup-fields">
          <p className="ra-org__meetup-title">Datos del encuentro</p>
          <div className="ra-org__meetup-grid">
            <label>
              Día y hora
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
            <label>
              Duración (min)
              <input
                type="number"
                min={30}
                max={360}
                step={15}
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(Number(e.target.value) || 90)
                }
              />
            </label>
            <label>
              Cancha
              <input
                value={canchaLabel}
                onChange={(e) => setCanchaLabel(e.target.value)}
                placeholder="Ej. 1"
              />
            </label>
          </div>
          <label className="ra-org__toggle">
            <input
              type="checkbox"
              checked={includeLugar}
              onChange={(e) => setIncludeLugar(e.target.checked)}
            />
            <span>Incluir lugar en la convocatoria</span>
          </label>
          {includeLugar ? (
            <label className="ra-org__meetup-lugar">
              Lugar
              <input
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Ej. Hack Pádel, Padelito…"
              />
            </label>
          ) : (
            <p className="ra-org__hint">
              Ideal si tu club siempre juega en la misma sede.
            </p>
          )}
        </div>
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
                  min={OPEN_REG_CAPACITY_MIN}
                  max={OPEN_REG_CAPACITY_MAX}
                  value={capacity}
                  onChange={(e) =>
                    setCapacity(
                      Math.min(
                        OPEN_REG_CAPACITY_MAX,
                        Math.max(
                          OPEN_REG_CAPACITY_MIN,
                          Number(e.target.value) || OPEN_REG_CAPACITY_MIN
                        )
                      )
                    )
                  }
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
