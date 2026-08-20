import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useOrganizerDisplayName } from "../../club-experience";
import { PublicTorneoExpressShell } from "../torneo-express/public/PublicTorneoExpressShell";
import { formatDueloHorarioRange } from "../../lib/duelo2v2/schedule";
import {
  buildRequestRivieraIdWhatsAppMessage,
  buildRetaAbiertaWhatsAppMessage,
  buildWhatsAppShareUrl,
  resolveLugarYCancha,
} from "../../lib/retaAbierta/whatsappShareMessage";
import { convocatoriaPublicModeLabel } from "../../lib/retaAbierta/modeWhitelist";
import { normalizeRivieraIdLoose } from "../../lib/retaAbierta/normalizeRivieraId";
import {
  cancelOpenRegistration,
  fetchOpenRegistrationPublic,
  joinOpenRegistration,
  loadAllCancellationTokens,
  mapJoinErrorMessage,
  previewRivieraIdForOpenRegistration,
  removeCancellationToken,
  storeCancellationToken,
  type StoredCancellationEntry,
} from "../../lib/retaAbierta/retaAbiertaService";
import { buildShareRetaOgUrl } from "../../lib/retaAbierta/shareOgUrl";
import {
  clearPreferredSide,
  loadPreferredSides,
  storePreferredSide,
} from "../../lib/retaAbierta/preferredSideStorage";
import {
  buildDueloCourtLayout,
  dueloCancelContextLabel,
  dueloSideHasOpenSlot,
  dueloSlotMeta,
  formatPublicCategoriaLabel,
  type DueloCourtLayout,
  type DueloCourtSlot,
  type DueloCourtSide,
} from "../../lib/retaAbierta/dueloCourtLayout";
import { useRetaAbiertaRealtime } from "../../lib/retaAbierta/useRetaAbiertaRealtime";
import type {
  OpenRegistrationPreview,
  OpenRegistrationPublicDto,
  OpenRegistrationPublicEntry,
} from "../../lib/retaAbierta/types";
import { copyTextToClipboard } from "../../lib/clipboard/copyTextToClipboard";
import "./reta-abierta-public.css";

type Step =
  | "overview"
  | "id"
  | "confirm"
  | "done"
  | "not_found"
  | "cancel_pick"
  | "cancel_confirm";

function statusLabel(status: OpenRegistrationPublicDto["status"]): string {
  switch (status) {
    case "open":
      return "Abierta";
    case "paused":
      return "Pausada";
    case "closed":
      return "Cerrada";
    case "cancelled":
      return "Cancelada";
    case "draft":
      return "Borrador";
    default:
      return status;
  }
}

function modeLabel(dto: OpenRegistrationPublicDto): string {
  return convocatoriaPublicModeLabel({
    mode: dto.mode_type,
    tournamentFormat: dto.tournament_format,
    championshipEnabled: dto.championship_enabled,
  });
}

function formatWhen(dto: OpenRegistrationPublicDto): string {
  if (!dto.scheduled_at) return "Fecha por confirmar";
  const d = new Date(dto.scheduled_at);
  if (Number.isNaN(d.getTime())) return "Fecha por confirmar";

  const datePart = d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  let until = dto.scheduled_until ?? null;
  if (
    !until &&
    dto.duration_minutes != null &&
    dto.duration_minutes > 0
  ) {
    until = new Date(
      d.getTime() + dto.duration_minutes * 60_000
    ).toISOString();
  }

  const range = formatDueloHorarioRange(dto.scheduled_at, until);
  if (range) {
    return `${datePart}, ${range}`;
  }

  return `${datePart}, ${d.toLocaleString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Nunca mostrar SQL / códigos técnicos en la UI pública. */
function toHumanActionError(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (
    /sql|postgres|pgrst|permission denied|column |42703|schema cache|supabase/i.test(
      t
    )
  ) {
    return "No pudimos confirmar tu lugar, intenta de nuevo.";
  }
  if (/aplicar el sql|hay que aplicar/i.test(t)) {
    return "No pudimos confirmar tu lugar, intenta de nuevo.";
  }
  return t;
}

function CopyableRivieraId({ rivieraId }: { rivieraId: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(rivieraId);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      className={`ra-player-card__id${copied ? " ra-player-card__id--copied" : ""}`}
      onClick={(e) => void onCopy(e)}
      aria-label={
        copied ? "Riviera ID copiado" : `Copiar Riviera ID ${rivieraId}`
      }
      title={copied ? "Copiado" : "Toca para copiar"}
    >
      {copied ? "Copiado" : rivieraId}
    </button>
  );
}

function PlayerSlotCard({
  entry,
  displayPhoto,
  displayRating,
  positionLabel,
  partnerName,
  busy,
}: {
  entry: DueloCourtSlot;
  displayPhoto: boolean;
  displayRating: boolean;
  positionLabel: string;
  partnerName: string | null;
  busy?: boolean;
}) {
  if (!entry) {
    return (
      <div
        className={`ra-player-card ra-player-card--open ra-player-card--invite ra-duelo-slot${
          busy ? " ra-player-card--busy" : ""
        }`}
      >
        <span className="ra-duelo-slot__pos">{positionLabel}</span>
        <div className="ra-player-card__avatar ra-player-card__avatar--invite" aria-hidden>
          {busy ? <span className="ra-spinner" /> : <span>+</span>}
        </div>
        <div className="ra-player-card__body">
          <strong>{busy ? "Uniendo…" : "Disponible"}</strong>
          <span className="ra-player-card__sub">
            {busy ? "Un momento" : "Toca para jugar aquí"}
          </span>
        </div>
      </div>
    );
  }
  const cat = formatPublicCategoriaLabel(entry.categoria);
  const ratingPart =
    displayRating && entry.rating != null
      ? Number(entry.rating).toFixed(2)
      : null;
  const subParts = [ratingPart, cat].filter(Boolean);
  return (
    <div className="ra-player-card ra-player-card--filled ra-duelo-slot">
      <span className="ra-duelo-slot__pos">{positionLabel}</span>
      <div className="ra-player-card__avatar" aria-hidden>
        {displayPhoto && entry.foto_url ? (
          <img src={entry.foto_url} alt="" />
        ) : (
          <span>{entry.nombre.charAt(0)}</span>
        )}
      </div>
      <div className="ra-player-card__body">
        <strong className="ra-player-card__name">{entry.nombre}</strong>
        {subParts.length > 0 ? (
          <span className="ra-player-card__sub">{subParts.join(" · ")}</span>
        ) : null}
        <CopyableRivieraId rivieraId={entry.riviera_id} />
        {partnerName ? (
          <span className="ra-duelo-slot__partner">Con {partnerName}</span>
        ) : (
          <span className="ra-duelo-slot__partner ra-duelo-slot__partner--wait">
            Esperando compañero
          </span>
        )}
      </div>
    </div>
  );
}

function DueloSideBlock({
  side,
  layout,
  displayPhoto,
  displayRating,
  selectable,
  joining,
  sideFull,
  onSelectSide,
}: {
  side: DueloCourtSide;
  layout: DueloCourtLayout;
  displayPhoto: boolean;
  displayRating: boolean;
  selectable: boolean;
  joining?: boolean;
  sideFull?: boolean;
  onSelectSide?: (side: DueloCourtSide) => void;
}) {
  const pair = side === "A" ? layout.parejaA : layout.parejaB;
  const meta0 = dueloSlotMeta(layout, side, 0);
  const meta1 = dueloSlotMeta(layout, side, 1);
  const open = dueloSideHasOpenSlot(layout, side);
  const canSelect = selectable && open && Boolean(onSelectSide) && !joining;

  const sideClass = [
    "ra-duelo-side",
    `ra-duelo-side--${side.toLowerCase()}`,
    open ? "ra-duelo-side--open" : "ra-duelo-side--full",
    canSelect ? "ra-duelo-side--pick" : "",
    joining ? "ra-duelo-side--joining" : "",
    sideFull ? "ra-duelo-side--taken" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <p className="ra-duelo-side__label">{meta0.sideLabel}</p>
      {sideFull ? (
        <p className="ra-duelo-side__banner" role="status">
          Lado lleno
        </p>
      ) : null}
      <PlayerSlotCard
        entry={pair[0]}
        displayPhoto={displayPhoto}
        displayRating={displayRating}
        positionLabel={meta0.positionLabel}
        partnerName={meta0.partnerName}
        busy={joining && !pair[0]}
      />
      <PlayerSlotCard
        entry={pair[1]}
        displayPhoto={displayPhoto}
        displayRating={displayRating}
        positionLabel={meta1.positionLabel}
        partnerName={meta1.partnerName}
        busy={joining && !pair[1] && Boolean(pair[0])}
      />
      {canSelect ? (
        <span className="ra-duelo-side__cta">Jugar en este lado</span>
      ) : null}
      {joining ? (
        <span className="ra-duelo-side__cta ra-duelo-side__cta--busy">
          <span className="ra-spinner ra-spinner--inline" aria-hidden />
          Preparando…
        </span>
      ) : null}
    </>
  );

  if (canSelect) {
    return (
      <button
        type="button"
        className={sideClass}
        onClick={() => onSelectSide?.(side)}
        aria-label={`Jugar en ${meta0.sideLabel}`}
      >
        {body}
      </button>
    );
  }

  return <div className={sideClass}>{body}</div>;
}

function CupoChip({
  confirmed,
  capacity,
  spotsLeft,
}: {
  confirmed: number;
  capacity: number;
  spotsLeft: number;
}) {
  const full = spotsLeft <= 0;
  return (
    <p
      className={`ra-public__cupo-chip${full ? " ra-public__cupo-chip--full" : ""}`}
      aria-live="polite"
    >
      <strong>
        {confirmed} de {capacity}
      </strong>
      {full ? " · completa" : ` · ${spotsLeft} disponibles`}
    </p>
  );
}

function CupoProgress({
  confirmed,
  capacity,
}: {
  confirmed: number;
  capacity: number;
}) {
  const safeCap = Math.max(capacity, 1);
  const pct = Math.min(100, Math.round((confirmed / safeCap) * 100));
  return (
    <div
      className="ra-public__progress"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={safeCap}
      aria-valuenow={confirmed}
      aria-label={`Jugadores confirmados: ${confirmed} de ${capacity}`}
    >
      <div className="ra-public__progress-head">
        <span>Jugadores confirmados</span>
        <strong>
          {confirmed} de {capacity}
          <span className="ra-public__progress-pct"> · {pct}%</span>
        </strong>
      </div>
      <div className="ra-public__progress-track">
        <span
          className="ra-public__progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FlatPlayerCard({
  entry,
  displayPhoto,
  displayRating,
}: {
  entry: OpenRegistrationPublicEntry;
  displayPhoto: boolean;
  displayRating: boolean;
}) {
  const cat = formatPublicCategoriaLabel(entry.categoria);
  const ratingPart =
    displayRating && entry.rating != null
      ? Number(entry.rating).toFixed(2)
      : null;
  return (
    <li className="ra-player-card ra-player-card--filled ra-player-card--pro">
      <div className="ra-player-card__avatar" aria-hidden>
        {displayPhoto && entry.foto_url ? (
          <img src={entry.foto_url} alt="" />
        ) : (
          <span>{entry.nombre.charAt(0)}</span>
        )}
      </div>
      <div className="ra-player-card__body">
        <strong className="ra-player-card__name" title={entry.nombre}>
          {entry.nombre}
        </strong>
        <div className="ra-player-card__meta">
          {ratingPart ? (
            <span className="ra-player-card__pill">{ratingPart}</span>
          ) : null}
          {cat ? <span className="ra-player-card__pill ra-player-card__pill--muted">{cat}</span> : null}
        </div>
        <CopyableRivieraId rivieraId={entry.riviera_id} />
      </div>
    </li>
  );
}

export const RetaAbiertaPublicPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [dto, setDto] = useState<OpenRegistrationPublicDto | null>(null);
  const organizerName = useOrganizerDisplayName(dto?.organizador_id ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("overview");
  const [rivieraInput, setRivieraInput] = useState("");
  const [preferredSide, setPreferredSide] = useState<DueloCourtSide | null>(
    null
  );
  const [preview, setPreview] = useState<OpenRegistrationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joiningSide, setJoiningSide] = useState<DueloCourtSide | null>(null);
  const [sideFullNotice, setSideFullNotice] = useState<DueloCourtSide | null>(
    null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [joinManageToken, setJoinManageToken] = useState<string | null>(null);
  const [joinEntryId, setJoinEntryId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [cancelCandidates, setCancelCandidates] = useState<
    StoredCancellationEntry[]
  >([]);
  const [cancelTarget, setCancelTarget] =
    useState<StoredCancellationEntry | null>(null);
  const [cancelRivieraInput, setCancelRivieraInput] = useState("");
  const [tokenVersion, setTokenVersion] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetchOpenRegistrationPublic(slug);
    if (!res.ok) {
      setLoadError(res.error);
      setDto(null);
      return;
    }
    setLoadError(null);
    setDto(res.dto);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useRetaAbiertaRealtime({
    registrationId: dto?.registration_id,
    tournamentId: dto?.tournament_id,
    enabled: Boolean(dto?.registration_id || dto?.tournament_id),
    onUpdate: refresh,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("cancel");
    if (token && token.length >= 16) {
      storeCancellationToken(slug, "from-url", token);
      setTokenVersion((v) => v + 1);
    }
  }, [slug]);

  const confirmed = useMemo(
    () => dto?.entries.filter((e) => e.status === "confirmed") ?? [],
    [dto]
  );
  const waitlist = useMemo(
    () => dto?.entries.filter((e) => e.status === "waitlist") ?? [],
    [dto]
  );
  const preferredSideOverrides = useMemo(() => {
    void tokenVersion;
    return loadPreferredSides(slug);
  }, [slug, tokenVersion]);
  const dueloLayout = useMemo(
    () => buildDueloCourtLayout(confirmed, preferredSideOverrides),
    [confirmed, preferredSideOverrides]
  );
  const isDueloMode = dto?.mode_type === "duelo_2v2";

  const canJoin =
    dto?.status === "open" &&
    !dto.is_finished &&
    (dto.spots_left > 0 || dto.waitlist_enabled);

  const stickyCta =
    canJoin &&
    step === "overview" &&
    (dto?.spots_left ?? 0) > 0 &&
    !isDueloMode;

  // Realtime: si el lado elegido se llena mientras el usuario confirma, avisar al instante.
  useEffect(() => {
    if (!isDueloMode) return;
    if (!(preferredSide === "A" || preferredSide === "B")) return;
    if (step !== "id" && step !== "confirm") return;
    if (dueloSideHasOpenSlot(dueloLayout, preferredSide)) return;
    setSideFullNotice(preferredSide);
    setActionError("Este lado ya está lleno. Vuelve y elige otro.");
    setStep("overview");
    setJoiningSide(null);
  }, [dueloLayout, preferredSide, step, isDueloMode]);

  const beginJoinForSide = (side: DueloCourtSide | null) => {
    setActionError(null);
    setSideFullNotice(null);

    if (side === "A" || side === "B") {
      if (!dueloSideHasOpenSlot(dueloLayout, side)) {
        setSideFullNotice(side);
        setActionError("Este lado ya está lleno. Elige el otro.");
        return;
      }
      setJoiningSide(side);
      setPreferredSide(side);
      window.setTimeout(() => {
        setJoiningSide(null);
        setPreview(null);
        setRivieraInput("");
        setStep("id");
      }, 280);
      return;
    }

    setPreferredSide(null);
    setPreview(null);
    setRivieraInput("");
    setStep("id");
  };

  const beginCancelFlow = () => {
    setActionError(null);
    setCancelRivieraInput("");
    setCopyFeedback(null);
    setCancelTarget(null);

    let tokens = loadAllCancellationTokens(slug);
    if (
      joinManageToken &&
      !tokens.some((t) => t.token === joinManageToken)
    ) {
      storeCancellationToken(
        slug,
        joinEntryId || "joined",
        joinManageToken,
        preview
          ? { nombre: preview.nombre, rivieraId: preview.riviera_id }
          : undefined
      );
      tokens = loadAllCancellationTokens(slug);
      setTokenVersion((v) => v + 1);
    }

    const board = [...confirmed, ...waitlist];
    if (board.length === 0) {
      setActionError("No hay jugadores inscritos para cancelar.");
      return;
    }

    // Lista = jugadores de la convocatoria. Si hay token local, se reutiliza.
    const enriched: StoredCancellationEntry[] = board.map((e) => {
      const byId = tokens.find((t) => t.entryId === e.id);
      const byRiv = tokens.find(
        (t) =>
          t.rivieraId &&
          normalizeRivieraIdLoose(t.rivieraId) ===
            normalizeRivieraIdLoose(e.riviera_id)
      );
      const match = byId || byRiv;
      return {
        entryId: e.id,
        token: match?.token || "",
        nombre: e.nombre,
        rivieraId: e.riviera_id,
        savedAt: match?.savedAt || Date.now(),
      };
    });

    setCancelCandidates(enriched);
    setStep("cancel_pick");
  };

  const onPreview = async () => {
    setActionError(null);
    setBusy(true);
    try {
      const res = await previewRivieraIdForOpenRegistration(slug, rivieraInput);
      if (!res.ok) {
        if (res.error === "riviera_id_not_found") {
          setStep("not_found");
          return;
        }
        setActionError(toHumanActionError(mapJoinErrorMessage(res.error)));
        return;
      }
      setPreview(res.preview);
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmJoin = async () => {
    if (!preview) return;
    setActionError(null);
    if (
      isDueloMode &&
      (preferredSide === "A" || preferredSide === "B") &&
      !dueloSideHasOpenSlot(dueloLayout, preferredSide)
    ) {
      setSideFullNotice(preferredSide);
      setActionError("Este lado ya está lleno. Vuelve y elige otro.");
      setStep("overview");
      await refresh();
      return;
    }
    setBusy(true);
    try {
      const res = await joinOpenRegistration(
        slug,
        preview.riviera_id,
        isDueloMode ? preferredSide : null
      );
      if (!res.ok) {
        const code = res.error;
        if (
          code === "full" ||
          code === "preferred_side_unavailable" ||
          /side|lleno|full/i.test(code)
        ) {
          setSideFullNotice(preferredSide);
          setActionError(
            preferredSide
              ? "Este lado ya está lleno. Vuelve y elige otro."
              : "Ya no hay lugares disponibles."
          );
          await refresh();
          setStep("overview");
          return;
        }
        setActionError(
          toHumanActionError(mapJoinErrorMessage(res.error)) ||
            "No pudimos confirmar tu lugar, intenta de nuevo."
        );
        await refresh();
        return;
      }
      setJoinStatus(res.result.status);
      setSuccessMessage(res.result.message);
      setJoinManageToken(res.result.cancellation_token || null);
      setJoinEntryId(res.result.entry_id);
      if (preferredSide === "A" || preferredSide === "B") {
        storePreferredSide(
          slug,
          res.result.entry_id,
          res.result.preferred_side || preferredSide
        );
      }
      setTokenVersion((v) => v + 1);
      setStep("done");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // Convocatoria lista para pegar en el grupo: reusa el mismo mensaje del
  // organizador (quién ya está dentro con ✓, lugares libres con ○, horario de
  // inicio y el enlace público) para que, tras inscribirse, el jugador la
  // comparta y se apunten los demás.
  const onCopyGroupMessage = async () => {
    if (!dto) return;
    setActionError(null);
    setCopyFeedback(null);
    const message = buildRetaAbiertaWhatsAppMessage({
      dto,
      publicUrl: buildShareRetaOgUrl(slug),
      clubName: organizerName?.trim() || "",
    });
    const ok = await copyTextToClipboard(message);
    if (ok) {
      setCopyFeedback(
        "Convocatoria copiada. Pégala en tu grupo para que se apunten los demás."
      );
    } else {
      setActionError("No se pudo copiar. Inténtalo de nuevo.");
    }
  };

  const onConfirmCancel = async () => {
    if (!cancelTarget) {
      setActionError("Selecciona a quién quieres cancelar.");
      return;
    }
    const typed = normalizeRivieraIdLoose(cancelRivieraInput);
    if (!typed) {
      setActionError("Escribe tu Riviera ID para confirmar que sales.");
      return;
    }

    let expected = cancelTarget.rivieraId
      ? normalizeRivieraIdLoose(cancelTarget.rivieraId)
      : null;
    if (!expected) {
      const fromList = [...confirmed, ...waitlist].find(
        (e) => e.id === cancelTarget.entryId
      );
      expected = fromList
        ? normalizeRivieraIdLoose(fromList.riviera_id)
        : null;
    }
    if (!expected && cancelTarget.entryId === "from-url") {
      const matchById = [...confirmed, ...waitlist].find(
        (e) => normalizeRivieraIdLoose(e.riviera_id) === typed
      );
      if (!matchById) {
        setActionError(
          "Ese Riviera ID no aparece en esta convocatoria. Revísalo."
        );
        return;
      }
      expected = typed;
    }

    if (!expected || expected !== typed) {
      setActionError(
        "El Riviera ID no coincide con esta inscripción. Revísalo e inténtalo de nuevo."
      );
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const res = await cancelOpenRegistration(
        slug,
        cancelTarget.token || "",
        cancelTarget.entryId,
        typed
      );
      if (!res.ok) {
        setActionError(
          res.error === "invalid_token"
            ? "No pudimos validar la cancelación. Revisa tu Riviera ID e inténtalo de nuevo."
            : res.error === "not_registered"
              ? "Ese Riviera ID no está inscrito en esta convocatoria."
              : res.error === "invalid_riviera_id"
                ? "El Riviera ID no tiene un formato válido."
                : toHumanActionError(mapJoinErrorMessage(res.error)) ||
                  "No pudimos cancelar tu lugar, intenta de nuevo."
        );
        return;
      }
      removeCancellationToken(slug, cancelTarget.entryId);
      clearPreferredSide(slug, cancelTarget.entryId);
      if (joinEntryId === cancelTarget.entryId) {
        setJoinManageToken(null);
        setJoinEntryId(null);
      }
      setTokenVersion((v) => v + 1);
      setSuccessMessage(
        cancelTarget.nombre
          ? `Se canceló la asistencia de ${cancelTarget.nombre}.`
          : res.message
      );
      setCancelTarget(null);
      setCancelCandidates([]);
      setCancelRivieraInput("");
      setJoinStatus(null);
      setPreferredSide(null);
      setStep("overview");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resolveCancelLabel = (c: StoredCancellationEntry): string => {
    if (isDueloMode) {
      const ctx = dueloCancelContextLabel(c.entryId, dueloLayout);
      if (ctx) return ctx;
    }
    if (c.nombre?.trim()) return c.nombre.trim();
    const fromList = [...confirmed, ...waitlist].find((e) => e.id === c.entryId);
    if (fromList) return fromList.nombre;
    if (c.rivieraId) return c.rivieraId;
    return "Tu inscripción";
  };

  const isDuelo = isDueloMode;
  const humanError = toHumanActionError(actionError);
  const sideHint =
    preferredSide === "A"
      ? "Pareja 1 · Lado A"
      : preferredSide === "B"
        ? "Pareja 2 · Lado B"
        : null;

  return (
    <PublicTorneoExpressShell organizadorId={dto?.organizador_id || null}>
      {loading ? (
        <div className="ra-public ra-public--skeleton" aria-busy="true">
          <div className="ra-skel ra-skel--hero" />
          <div className="ra-skel ra-skel--line" />
          <div className="ra-skel ra-skel--line ra-skel--line-short" />
          <div className="ra-skel ra-skel--cupo" />
          <div className="ra-skel ra-skel--grid" />
          <p className="ra-public__hint ra-skel-caption">Cargando convocatoria…</p>
        </div>
      ) : loadError || !dto ? (
        <div className="ra-public ra-public--error">
          <h1>Convocatoria no disponible</h1>
          <p>El link no es válido o las inscripciones no están activas.</p>
        </div>
      ) : (
      <div className="ra-public">
        <header className="ra-public__hero">
          <div className="ra-public__hero-top">
            <div className="ra-public__chip-row" aria-label="Tipo y nivel">
              <span className="ra-public__chip">{modeLabel(dto)}</span>
              {dto.category_label ? (
                <span className="ra-public__chip ra-public__chip--soft">
                  {formatPublicCategoriaLabel(dto.category_label) ||
                    dto.category_label}
                </span>
              ) : null}
            </div>
            {dto.status === "open" && dto.spots_left > 0 ? (
              <span
                className={`ra-public__urgency${
                  dto.spots_left <= 2 ? " ra-public__urgency--hot" : ""
                }`}
              >
                {dto.spots_left === 1
                  ? "¡Último lugar!"
                  : `¡Quedan ${dto.spots_left} lugares!`}
              </span>
            ) : (
              <span
                className={`ra-public__badge ra-public__badge--${dto.status}`}
              >
                {statusLabel(dto.status)}
              </span>
            )}
          </div>

          <div className="ra-public__hero-copy">
            <h1 className="ra-public__title">{dto.name}</h1>
            {organizerName?.trim() ? (
              <p className="ra-public__meta ra-public__meta--club">
                {organizerName.trim()}
              </p>
            ) : null}
          </div>
        </header>

        <div className="ra-public__stage">
          <aside className="ra-public__match-card" aria-label="Datos del partido">
            <div className="ra-public__facts">
              {(() => {
                const { lugar, cancha } = resolveLugarYCancha({
                  locationLabel: dto.location_label,
                  canchaLabel: dto.cancha_label,
                  clubName: organizerName,
                });
                if (!lugar && !cancha) return null;
                return (
                  <div className="ra-public__fact">
                    <span className="ra-public__fact-label">Lugar</span>
                    <strong className="ra-public__fact-value">
                      {[lugar, cancha].filter(Boolean).join(" · ")}
                    </strong>
                  </div>
                );
              })()}
              <div className="ra-public__fact">
                <span className="ra-public__fact-label">Horario</span>
                <strong className="ra-public__fact-value">
                  {formatWhen(dto)}
                </strong>
              </div>
            </div>
            {dto.description?.trim() ? (
              <p className="ra-public__meta ra-public__meta--desc">
                {dto.description.trim()}
              </p>
            ) : null}
          </aside>

          <div className="ra-public__panel">
        {step === "overview" && (
          <>
            {isDuelo ? (
              <section className="ra-duelo-board" aria-label="Cancha 2 vs 2">
                <div className="ra-duelo-board__head">
                  <p className="ra-duelo-board__title">Cómo queda la cancha</p>
                  <CupoChip
                    confirmed={dto.confirmed_count}
                    capacity={dto.capacity}
                    spotsLeft={dto.spots_left}
                  />
                </div>
                {canJoin && (dto.spots_left ?? 0) > 0 ? (
                  <p className="ra-duelo-board__hint">
                    Toca el lado donde quieres jugar
                  </p>
                ) : null}
                {humanError && step === "overview" ? (
                  <p className="ra-error ra-error--board" role="alert">
                    {humanError}
                  </p>
                ) : null}
                <DueloSideBlock
                  side="A"
                  layout={dueloLayout}
                  displayPhoto={dto.display_photo}
                  displayRating={dto.display_rating}
                  selectable={Boolean(
                    canJoin &&
                      (dto.spots_left ?? 0) > 0 &&
                      !joiningSide
                  )}
                  joining={joiningSide === "A"}
                  sideFull={sideFullNotice === "A"}
                  onSelectSide={beginJoinForSide}
                />
                <div className="ra-duelo-vs" aria-hidden>
                  <span>VS</span>
                </div>
                <DueloSideBlock
                  side="B"
                  layout={dueloLayout}
                  displayPhoto={dto.display_photo}
                  displayRating={dto.display_rating}
                  selectable={Boolean(
                    canJoin &&
                      (dto.spots_left ?? 0) > 0 &&
                      !joiningSide
                  )}
                  joining={joiningSide === "B"}
                  sideFull={sideFullNotice === "B"}
                  onSelectSide={beginJoinForSide}
                />
              </section>
            ) : (
              <section
                className="ra-public__section ra-public__section--roster"
                aria-label="Confirmados"
              >
                <CupoProgress
                  confirmed={dto.confirmed_count}
                  capacity={dto.capacity}
                />
                <div className="ra-public__section-head">
                  <h2>Confirmados</h2>
                  <CupoChip
                    confirmed={dto.confirmed_count}
                    capacity={dto.capacity}
                    spotsLeft={dto.spots_left}
                  />
                </div>
                <ul className="ra-public__players">
                  {confirmed.map((e) => (
                    <FlatPlayerCard
                      key={e.id}
                      entry={e}
                      displayPhoto={dto.display_photo}
                      displayRating={dto.display_rating}
                    />
                  ))}
                </ul>
                {dto.spots_left > 0 ? (
                  <ul
                    className="ra-public__slots"
                    aria-label="Lugares disponibles"
                  >
                    {Array.from({ length: Math.max(dto.spots_left, 0) }).map(
                      (_, i) => (
                        <li key={`open-${i}`} className="ra-public__slot">
                          <span className="ra-public__slot-plus" aria-hidden>
                            +
                          </span>
                          <span className="ra-public__slot-body">
                            <strong>Lugar disponible</strong>
                            <span>¡Únete al partido!</span>
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                ) : null}
              </section>
            )}

            {waitlist.length > 0 && dto.waitlist_enabled ? (
              <section className="ra-public__section">
                <h2>Lista de espera ({waitlist.length})</h2>
                <ul className="ra-public__players">
                  {waitlist.map((e) => (
                    <li
                      key={e.id}
                      className="ra-player-card ra-player-card--wait ra-player-card--filled"
                    >
                      <div className="ra-player-card__body">
                        <strong className="ra-player-card__name">{e.nombre}</strong>
                        <CopyableRivieraId rivieraId={e.riviera_id} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {humanError &&
            step === "overview" &&
            !isDuelo ? (
              <p className="ra-error ra-actions--cancel" role="alert">
                {humanError}
              </p>
            ) : null}

            {(confirmed.length > 0 || waitlist.length > 0) &&
            dto.status === "open" &&
            !dto.is_finished ? (
              <div className="ra-actions ra-actions--cancel">
                <button
                  type="button"
                  className="ra-btn ra-btn--ghost ra-btn--block"
                  onClick={beginCancelFlow}
                  disabled={busy || Boolean(joiningSide)}
                >
                  Cancelar mi asistencia
                </button>
              </div>
            ) : null}
          </>
        )}

        {step === "cancel_pick" && (
          <section className="ra-public__sheet" aria-label="Elegir jugador">
            <h2>¿Qué jugador eres?</h2>
            <p className="ra-public__hint">
              Selecciona tu nombre en la lista. Después te pediremos tu Riviera
              ID para confirmar.
            </p>
            <ul className="ra-public__players ra-cancel-list">
              {cancelCandidates.map((c) => {
                const entry =
                  [...confirmed, ...waitlist].find((e) => e.id === c.entryId) ||
                  null;
                const photoUrl = entry?.foto_url || null;
                const showPhoto = Boolean(dto.display_photo && photoUrl);
                const rivId = c.rivieraId || entry?.riviera_id || null;
                const label = resolveCancelLabel(c);
                return (
                  <li key={c.entryId}>
                    <button
                      type="button"
                      className="ra-player-card ra-player-card--filled ra-cancel-option"
                      onClick={() => {
                        setCancelTarget(c);
                        setCancelRivieraInput("");
                        setStep("cancel_confirm");
                        setActionError(null);
                      }}
                    >
                      <div className="ra-player-card__avatar" aria-hidden>
                        {showPhoto ? (
                          <img src={photoUrl!} alt="" />
                        ) : (
                          <span>{label.charAt(0)}</span>
                        )}
                      </div>
                      <div className="ra-player-card__body">
                        <strong className="ra-player-card__name">{label}</strong>
                        {rivId ? (
                          <span className="ra-player-card__sub">{rivId}</span>
                        ) : null}
                        <span className="ra-cancel-option__cta">Soy yo</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {humanError ? (
              <p className="ra-error" role="alert">
                {humanError}
              </p>
            ) : null}
            <button
              type="button"
              className="ra-btn ra-btn--ghost"
              onClick={() => {
                setStep(joinManageToken ? "done" : "overview");
                setCancelTarget(null);
                setCancelCandidates([]);
                setActionError(null);
              }}
            >
              Volver
            </button>
          </section>
        )}

        {step === "cancel_confirm" && cancelTarget && (
          <section className="ra-public__sheet" aria-label="Confirmar cancelación">
            <h2>Confirma tu Riviera ID</h2>
            <div className="ra-confirm-card">
              <strong>{resolveCancelLabel(cancelTarget)}</strong>
              <p className="ra-public__hint">
                Escribe tu Riviera ID para salirte de esta convocatoria y
                liberar el lugar.
              </p>
            </div>
            <label className="ra-label" htmlFor="ra-cancel-riviera-id">
              Tu Riviera ID
            </label>
            <input
              id="ra-cancel-riviera-id"
              className="ra-input"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={cancelRivieraInput}
              onChange={(e) => setCancelRivieraInput(e.target.value)}
              placeholder="RIV-00000001"
            />
            {humanError ? (
              <p className="ra-error" role="alert">
                {humanError}
              </p>
            ) : null}
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--danger"
                onClick={() => void onConfirmCancel()}
                disabled={busy || !cancelRivieraInput.trim()}
              >
                Sí, cancelar asistencia
              </button>
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={() => {
                  setStep("cancel_pick");
                  setCancelTarget(null);
                  setCancelRivieraInput("");
                  setActionError(null);
                }}
                disabled={busy}
              >
                No, volver
              </button>
            </div>
          </section>
        )}

        {step === "id" && (
          <section className="ra-public__sheet" aria-label="Ingresar Riviera ID">
            <h2>Tu Riviera ID</h2>
            {sideHint ? (
              <p className="ra-public__hint ra-public__hint--side">
                Entrarás en <strong>{sideHint}</strong>
              </p>
            ) : null}
            <p className="ra-public__hint">
              Formato RIV-00000001. No necesitas cuenta para inscribirte.
            </p>
            <label className="ra-label" htmlFor="ra-riviera-id">
              Riviera ID
            </label>
            <input
              id="ra-riviera-id"
              className="ra-input"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={rivieraInput}
              onChange={(e) => setRivieraInput(e.target.value)}
              placeholder="RIV-00000001"
            />
            {humanError ? (
              <p className="ra-error" role="alert">
                {humanError}
              </p>
            ) : null}
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--primary"
                onClick={onPreview}
                disabled={busy || !rivieraInput.trim()}
              >
                Continuar
              </button>
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={() => {
                  setStep("overview");
                  setPreferredSide(null);
                  setActionError(null);
                }}
              >
                Volver
              </button>
            </div>
          </section>
        )}

        {step === "confirm" && preview && (
          <section className="ra-public__sheet">
            <h2>¿Confirmas tu asistencia?</h2>
            <div className="ra-confirm-card">
              <div className="ra-player-card__avatar ra-player-card__avatar--lg">
                {preview.foto_url ? (
                  <img src={preview.foto_url} alt="" />
                ) : (
                  <span>{preview.nombre.charAt(0)}</span>
                )}
              </div>
              <strong>{preview.nombre}</strong>
              <span>{preview.riviera_id}</span>
              {sideHint ? <span>{sideHint}</span> : null}
              {formatPublicCategoriaLabel(preview.categoria) ? (
                <span>{formatPublicCategoriaLabel(preview.categoria)}</span>
              ) : null}
              {preview.rating != null ? (
                <span className="ra-confirm-card__rating">
                  Rating {Number(preview.rating).toFixed(2)}
                </span>
              ) : null}
            </div>
            <p className="ra-public__hint ra-public__hint--warn">
              La inscripción usa solo tu Riviera ID. Guarda el acceso de
              cancelación en este dispositivo.
            </p>
            {humanError ? (
              <p className="ra-error" role="alert">
                {humanError}
              </p>
            ) : null}
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--primary"
                onClick={() => void onConfirmJoin()}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="ra-spinner ra-spinner--inline" aria-hidden />
                    Confirmando…
                  </>
                ) : (
                  "Confirmar asistencia"
                )}
              </button>
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={() => {
                  setPreview(null);
                  setRivieraInput("");
                  setStep("id");
                  setActionError(null);
                }}
              >
                Este no soy yo
              </button>
            </div>
          </section>
        )}

        {step === "not_found" && (
          <section className="ra-public__sheet">
            <h2>No encontramos este Riviera ID.</h2>
            <p className="ra-public__hint">
              Solo el club puede generar tu identidad oficial.
            </p>
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--primary"
                onClick={() => {
                  setStep("id");
                  setActionError(null);
                }}
              >
                Intentar nuevamente
              </button>
              <a
                className="ra-btn ra-btn--ghost"
                href={buildWhatsAppShareUrl(
                  "",
                  buildRequestRivieraIdWhatsAppMessage(dto.name)
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Solicitar Riviera ID al club
              </a>
            </div>
          </section>
        )}

        {step === "done" && (
          <section className="ra-public__sheet ra-public__sheet--success">
            <h2>
              {joinStatus === "waitlist"
                ? "Quedaste en lista de espera"
                : joinStatus === "pending_approval"
                  ? "Solicitud enviada"
                  : "Asistencia confirmada"}
            </h2>
            <p>{successMessage}</p>
            {sideHint ? (
              <p className="ra-public__hint ra-public__hint--side">
                Lado: <strong>{sideHint}</strong>
              </p>
            ) : null}
            {humanError ? (
              <p className="ra-error" role="alert">
                {humanError}
              </p>
            ) : null}
            {copyFeedback ? (
              <p className="ra-public__hint ra-public__hint--ok">{copyFeedback}</p>
            ) : null}
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--primary"
                onClick={() => void onCopyGroupMessage()}
                disabled={busy}
              >
                Copiar convocatoria para el grupo
              </button>
            </div>
          </section>
        )}
          </div>
        </div>

        {stickyCta ? (
          <div className="ra-public__sticky">
            <div className="ra-public__sticky-inner">
              <button
                type="button"
                className="ra-btn ra-btn--primary ra-btn--block ra-btn--cta"
                onClick={() => beginJoinForSide(null)}
              >
                <span className="ra-btn__cta-main">Quiero jugar</span>
                <span className="ra-btn__cta-sub">
                  {dto.spots_left === 1
                    ? "Último lugar disponible"
                    : `Quedan ${dto.spots_left} lugares`}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {!stickyCta &&
        step === "overview" &&
        canJoin &&
        dto.spots_left === 0 &&
        dto.waitlist_enabled ? (
          <div className="ra-public__sticky">
            <div className="ra-public__sticky-inner">
              <button
                type="button"
                className="ra-btn ra-btn--primary ra-btn--block"
                onClick={() => beginJoinForSide(null)}
              >
                Unirme a lista de espera
              </button>
            </div>
          </div>
        ) : null}

        {step === "overview" && !canJoin && dto.status === "open" ? (
          <p className="ra-public__full">Convocatoria completa</p>
        ) : null}

        {successMessage && step === "overview" ? (
          <p className="ra-public__hint ra-public__hint--ok">{successMessage}</p>
        ) : null}
      </div>
      )}
    </PublicTorneoExpressShell>
  );
};

export default RetaAbiertaPublicPage;
