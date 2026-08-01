import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ConvocatoriaMoreMenu } from "./ConvocatoriaMoreMenu";
import "./reta-abierta-organizer.css";

export type EnsureDraftEntityResult = {
  entityId: string;
  title?: string;
  locationLabel?: string;
  scheduledAtIso?: string | null;
  durationMinutes?: number | null;
  categoryLabel?: string | null;
};

export type ConvocatoriaLiveSnapshot = {
  isLive: boolean;
  status: OpenRegistrationStatus | null;
  confirmed: number;
  capacity: number;
  publicSlug: string | null;
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
   * Strip embebido en Detalles de la reta: lanzar / copiar / ver / admin
   * sin duplicar horario/lugar (ya están en RetaConfigPanel).
   */
  embedded?: boolean;
  /** Notifica al host (prep) cuando cambia estado live / cupo / inscritos. */
  onLiveChange?: (snapshot: ConvocatoriaLiveSnapshot) => void;
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
  embedded = false,
  onLiveChange,
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
  const capacitySaveTimer = useRef<number | null>(null);
  const capacitySaveGen = useRef(0);
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
          context.defaultCategory?.trim() ||
            row.category_label?.trim() ||
            ""
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

  const hasShareLink = Boolean(cfg?.public_slug);
  const isLive =
    shareOnly ||
    hasShareLink ||
    (Boolean(cfg?.enabled) && cfg?.status !== "draft");
  const effectiveCapacity = context.lockCapacity
    ? context.defaultCapacity
    : cfg?.capacity ?? capacity;

  useEffect(() => {
    if (!onLiveChange) return;
    onLiveChange({
      isLive,
      status: cfg?.status ?? null,
      confirmed: confirmed.length,
      capacity: effectiveCapacity,
      publicSlug: cfg?.public_slug ?? null,
    });
  }, [
    onLiveChange,
    isLive,
    cfg?.status,
    cfg?.public_slug,
    confirmed.length,
    effectiveCapacity,
  ]);

  useEffect(() => {
    return () => {
      if (capacitySaveTimer.current != null) {
        window.clearTimeout(capacitySaveTimer.current);
      }
    };
  }, []);

  /** Persiste cupo en servidor (tras debounce). Solo avisa si hay error o promociones. */
  const persistCapacity = useCallback(
    async (nextRaw: number) => {
      if (!entityId || context.lockCapacity) return;
      const next = Math.max(
        OPEN_REG_CAPACITY_MIN,
        Math.min(OPEN_REG_CAPACITY_MAX, Math.round(nextRaw))
      );
      const gen = ++capacitySaveGen.current;
      setCapacityBusy(true);
      setError(null);
      try {
        const res = await setOpenGameRegistrationCapacity(
          context.mode,
          entityId,
          next
        );
        if (gen !== capacitySaveGen.current) return;
        if (!res.ok) {
          setCapacityHint(res.message);
          setError(res.message);
          const row = await fetchOpenGameRegistrationConfig(
            context.mode,
            entityId
          );
          if (gen !== capacitySaveGen.current) return;
          if (row) {
            setCapacity(row.capacity);
            setCfg(row);
          }
          return;
        }
        setCapacity(res.capacity);
        setCfg((prev) =>
          prev ? { ...prev, capacity: res.capacity } : prev
        );
        if (res.promoted_count > 0) {
          setCapacityHint(
            `Se confirmaron ${res.promoted_count} de la lista de espera.`
          );
          const list = await listOpenGameRegistrationEntries(
            context.mode,
            entityId
          );
          if (gen !== capacitySaveGen.current) return;
          setEntries(list);
          window.setTimeout(() => {
            if (gen === capacitySaveGen.current) setCapacityHint(null);
          }, 4000);
        } else {
          setCapacityHint(null);
        }
      } catch (e) {
        if (gen !== capacitySaveGen.current) return;
        setError(mapConvocatoriaUserError(e, "action"));
      } finally {
        if (gen === capacitySaveGen.current) setCapacityBusy(false);
      }
    },
    [context.lockCapacity, context.mode, entityId]
  );

  const capacityMinForQueue = Math.max(
    OPEN_REG_CAPACITY_MIN,
    confirmed.length
  );

  /** UI al instante; guarda cuando dejas de tocar el stepper. */
  const queueCapacityChange = useCallback(
    (nextRaw: number) => {
      if (!entityId || context.lockCapacity) return;
      const next = Math.max(
        capacityMinForQueue,
        Math.min(OPEN_REG_CAPACITY_MAX, Math.round(nextRaw))
      );
      setCapacity(next);
      setCfg((prev) => (prev ? { ...prev, capacity: next } : prev));
      setCapacityHint(null);
      if (capacitySaveTimer.current != null) {
        window.clearTimeout(capacitySaveTimer.current);
      }
      capacitySaveTimer.current = window.setTimeout(() => {
        capacitySaveTimer.current = null;
        void persistCapacity(next);
      }, 450);
    },
    [
      capacityMinForQueue,
      context.lockCapacity,
      entityId,
      persistCapacity,
    ]
  );

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
      // Publica format para que /jugar no caiga en label genérico.
      if (
        (context.mode === "reta" || context.mode === "americano") &&
        id.trim()
      ) {
        try {
          const { upsertTournamentPublicConfig } = await import(
            "../../lib/database"
          );
          const fmt =
            context.tournamentFormat === "teams" ? "teams" : "round_robin";
          if (context.mode === "reta") {
            await upsertTournamentPublicConfig(id, fmt, null);
          }
        } catch {
          /* no bloquear convocatoria */
        }
      }
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
        context.defaultCategory?.trim() ||
        categoryLabel.trim() ||
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
      <section
        className={`ra-org${embedded ? " ra-org--embedded ra-org--compact" : ""}`}
        data-testid="convocatoria-whatsapp-panel"
      >
        <header className="ra-org__header">
          <div className="ra-org__header-row">
            <h3 className="ra-org__title">
              {embedded ? "Convocatoria" : "Convocatoria Riviera"}
            </h3>
          </div>
          <p className="ra-org__subtitle">Cargando…</p>
        </header>
      </section>
    );
  }

  /** Ya lanzada o en gestionar: sin título/cupo/checks; sí lugar/horario. */
  const showConfigForm = !compact && !embedded && !isLive && !shareOnly;
  /** Lugar + horario en todos los modos de convocatoria (excepto shareOnly duelo). */
  const showMeetupFields = !shareOnly && !compact && !embedded;
  /** Cupo editable solo si no es duelo (lockCapacity) y ya hay convocatoria. */
  const showLiveCapacityControl =
    !context.lockCapacity && Boolean(cfg) && (isLive || shareOnly);
  /** Cupo pre-lanzamiento en strip embebido (Detalles). */
  const showEmbeddedPrelaunchCupo =
    embedded && !isLive && !shareOnly && !context.lockCapacity;

  const tournamentSubtitle =
    (titlePublic.trim() || context.defaultTitle || "").trim() ||
    "Sin nombre";
  const categoryLine =
    (context.defaultCategory?.trim() ||
      categoryLabel.trim() ||
      cfg?.category_label?.trim() ||
      "").trim();
  const progressPct =
    effectiveCapacity > 0
      ? Math.min(100, Math.round((confirmed.length / effectiveCapacity) * 100))
      : 0;
  const capacityMin = Math.max(OPEN_REG_CAPACITY_MIN, confirmed.length);
  const capacityHintText = `Mínimo ${capacityMin} (confirmados). Máximo ${OPEN_REG_CAPACITY_MAX}.`;

  const onPrimaryShare = () => {
    if (hasShareLink) {
      void onCopy();
      return;
    }
    void onLaunchWhatsApp();
  };

  return (
    <section
      className={`ra-org${compact || embedded || isLive || shareOnly ? " ra-org--compact" : ""}${embedded ? " ra-org--embedded" : ""}`}
      data-testid="convocatoria-whatsapp-panel"
    >
      {!(embedded && !isLive) ? (
        <header className="ra-org__header">
          <div className="ra-org__header-row">
            <h3 className="ra-org__title">
              {embedded ? "Convocatoria" : "Convocatoria Riviera"}
            </h3>
            {(shareOnly || isLive) && cfg ? (
              <span
                className={`ra-org__badge ra-org__badge--${cfg.status}`}
                data-testid="convocatoria-status-badge"
              >
                {statusLabel(cfg.status)}
              </span>
            ) : null}
          </div>
          {embedded ? null : (
            <>
              <p className="ra-org__subtitle">
                {tournamentSubtitle}
                {categoryLine ? ` · ${categoryLine}` : ""}
              </p>
              {!(isLive || shareOnly) ? (
                <p className="ra-org__muted">
                  Comparte este juego por WhatsApp: se copia el mensaje con todos
                  los datos para que lo pegues en el chat.
                </p>
              ) : null}
            </>
          )}
        </header>
      ) : null}

      {showEmbeddedPrelaunchCupo ? (
        <div
          className="ra-org__embedded-pre"
          data-testid="convocatoria-embedded-prelaunch"
        >
          <div className="ra-org__embedded-pre-grid ra-org__embedded-pre-grid--cupo-only">
            <div className="ra-org__capacity">
              <div className="ra-org__capacity-row">
                <span
                  className="ra-org__capacity-label"
                  id="ra-org-cupo-pre-label"
                >
                  Cupo
                </span>
                <div
                  className="ra-org__capacity-stepper"
                  title={`Entre ${OPEN_REG_CAPACITY_MIN} y ${OPEN_REG_CAPACITY_MAX}`}
                >
                  <button
                    type="button"
                    className="ra-org__capacity-btn"
                    aria-label="Bajar cupo"
                    disabled={capacity <= OPEN_REG_CAPACITY_MIN}
                    onClick={() =>
                      setCapacity((c) =>
                        Math.max(OPEN_REG_CAPACITY_MIN, c - 1)
                      )
                    }
                  >
                    −
                  </button>
                  <input
                    className="ra-org__capacity-input"
                    type="number"
                    min={OPEN_REG_CAPACITY_MIN}
                    max={OPEN_REG_CAPACITY_MAX}
                    value={capacity}
                    aria-labelledby="ra-org-cupo-pre-label"
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setCapacity(
                        Math.min(
                          OPEN_REG_CAPACITY_MAX,
                          Math.max(OPEN_REG_CAPACITY_MIN, Math.round(n))
                        )
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="ra-org__capacity-btn"
                    aria-label="Subir cupo"
                    disabled={capacity >= OPEN_REG_CAPACITY_MAX}
                    onClick={() =>
                      setCapacity((c) =>
                        Math.min(OPEN_REG_CAPACITY_MAX, c + 1)
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {(shareOnly || isLive) && cfg ? (
        <div className="ra-org__summary">
          <div
            className="ra-org__progress"
            data-testid="convocatoria-progress"
          >
            <div className="ra-org__progress-meta">
              <span className="ra-org__progress-label">
                {confirmed.length} de {effectiveCapacity} confirmados
              </span>
              {waitlist.length > 0 ? (
                <span className="ra-org__progress-extra">
                  Espera: {waitlist.length}
                </span>
              ) : null}
            </div>
            <div
              className="ra-org__progress-track"
              role="progressbar"
              aria-label="Confirmados"
              aria-valuemin={0}
              aria-valuemax={effectiveCapacity}
              aria-valuenow={confirmed.length}
            >
              <div
                className="ra-org__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {showLiveCapacityControl ? (
            <div
              className="ra-org__capacity"
              data-testid="convocatoria-capacity-control"
              aria-busy={capacityBusy || undefined}
            >
              <div className="ra-org__capacity-row">
                <span className="ra-org__capacity-label" id="ra-org-cupo-label">
                  Cupo
                </span>
                <div
                  className="ra-org__capacity-stepper"
                  title={capacityHintText}
                >
                  <button
                    type="button"
                    className="ra-org__capacity-btn"
                    aria-label="Bajar cupo"
                    disabled={effectiveCapacity <= capacityMin}
                    onClick={() => queueCapacityChange(effectiveCapacity - 1)}
                  >
                    −
                  </button>
                  <input
                    className="ra-org__capacity-input"
                    type="number"
                    min={capacityMin}
                    max={OPEN_REG_CAPACITY_MAX}
                    value={effectiveCapacity}
                    aria-labelledby="ra-org-cupo-label"
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setCapacity(n);
                      setCfg((prev) =>
                        prev ? { ...prev, capacity: n } : prev
                      );
                    }}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      queueCapacityChange(n);
                    }}
                  />
                  <button
                    type="button"
                    className="ra-org__capacity-btn"
                    aria-label="Subir cupo"
                    disabled={effectiveCapacity >= OPEN_REG_CAPACITY_MAX}
                    onClick={() => queueCapacityChange(effectiveCapacity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              {capacityHint ? (
                <p className="ra-org__capacity-hint" role="status">
                  {capacityHint}
                </p>
              ) : null}
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
              <span className="ra-org__field-label">Día y hora</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
            <label>
              <span className="ra-org__field-label">Duración (min)</span>
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
              <span className="ra-org__field-label">Cancha</span>
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
          <div
            className={`ra-org__collapse${includeLugar ? " is-open" : ""}`}
            aria-hidden={!includeLugar}
          >
            <div className="ra-org__collapse-inner">
              <label className="ra-org__meetup-lugar">
                <span className="ra-org__field-label">Lugar</span>
                <input
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="Ej. Hack Pádel, Padelito…"
                  tabIndex={includeLugar ? 0 : -1}
                />
              </label>
            </div>
          </div>
          {!includeLugar ? (
            <p className="ra-org__hint">
              Ideal si tu club siempre juega en la misma sede.
            </p>
          ) : null}
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
            ? embedded
              ? "Un momento…"
              : "Copiando…"
            : copied
              ? embedded
                ? "¡Copiado!"
                : "¡Copiado! Pégalo en WhatsApp"
              : hasShareLink
                ? embedded
                  ? "Copiar convocatoria"
                  : "Copiar convocatoria actualizada"
                : embedded
                  ? "Lanzar convocatoria"
                  : "Lanzar y copiar"}
        </button>
        {hasShareLink ? (
          <div className="ra-org__actions-secondary">
            <a
              className="ra-org__btn ra-org__btn--outline"
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver convocatoria
            </a>
            <button
              type="button"
              className="ra-org__btn ra-org__btn--outline"
              onClick={() => setShowAdmin((v) => !v)}
              aria-expanded={showAdmin}
            >
              {showAdmin ? "Ocultar inscritos" : "Administrar inscritos"}
            </button>
            {cfg?.status === "open" || cfg?.status === "paused" ? (
              <ConvocatoriaMoreMenu
                items={[
                  cfg.status === "open"
                    ? {
                        id: "pause",
                        label: "Pausar",
                        disabled: saving,
                        onSelect: () => {
                          if (!entityId) return;
                          setSaving(true);
                          void (async () => {
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
                          })();
                        },
                      }
                    : {
                        id: "resume",
                        label: "Reanudar",
                        disabled: saving,
                        onSelect: () => {
                          if (!entityId) return;
                          setSaving(true);
                          void (async () => {
                            try {
                              const row = await savePayload(entityId, {
                                enabled: true,
                                status: "open",
                                categoryLabel:
                                  categoryLabel.trim() ||
                                  cfg.category_label ||
                                  context.defaultCategory ||
                                  null,
                              });
                              setCfg(row);
                              setStatus("open");
                            } finally {
                              setSaving(false);
                            }
                          })();
                        },
                      },
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {shareNote && !embedded ? (
        <p className="ra-org__muted">
          Se copió el mensaje completo (fecha, cancha, cupos y enlace). Ábrelo
          en WhatsApp y pégalo. El enlace siempre muestra la lista actualizada.
        </p>
      ) : null}
      {shareNote && embedded ? (
        <p className="ra-org__muted ra-org__muted--tight" role="status">
          Mensaje copiado. Pégalo en WhatsApp.
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
