import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PublicTorneoExpressShell } from "../torneo-express/public/PublicTorneoExpressShell";
import {
  buildRequestRivieraIdWhatsAppMessage,
  buildWhatsAppShareUrl,
  formatCanchaLabel,
} from "../../lib/retaAbierta/whatsappShareMessage";
import {
  cancelOpenRegistration,
  buildManageRegistrationPath,
  fetchOpenRegistrationPublic,
  joinOpenRegistration,
  loadAllCancellationTokens,
  loadCancellationToken,
  mapJoinErrorMessage,
  previewRivieraIdForOpenRegistration,
  removeCancellationToken,
  storeCancellationToken,
  type StoredCancellationEntry,
} from "../../lib/retaAbierta/retaAbiertaService";
import {
  buildDueloCourtLayout,
  dueloCancelContextLabel,
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

function modeLabel(mode: OpenRegistrationPublicDto["mode_type"]): string {
  switch (mode) {
    case "americano":
      return "Americano";
    case "duelo_2v2":
      return "Duelo 2 vs 2";
    default:
      return "Reta abierta";
  }
}

function formatWhen(dto: OpenRegistrationPublicDto): string {
  if (!dto.scheduled_at) return "Fecha por confirmar";
  const d = new Date(dto.scheduled_at);
  if (Number.isNaN(d.getTime())) return "Fecha por confirmar";
  const base = d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return dto.duration_minutes
    ? `${base} · ${dto.duration_minutes} min`
    : base;
}

function PlayerSlotCard({
  entry,
  displayPhoto,
  displayRating,
  positionLabel,
  partnerName,
}: {
  entry: DueloCourtSlot;
  displayPhoto: boolean;
  displayRating: boolean;
  positionLabel: string;
  partnerName: string | null;
}) {
  if (!entry) {
    return (
      <div className="ra-player-card ra-player-card--open ra-duelo-slot">
        <span className="ra-duelo-slot__pos">{positionLabel}</span>
        <div className="ra-player-card__avatar" aria-hidden>
          <span>+</span>
        </div>
        <div className="ra-player-card__body">
          <strong>Disponible</strong>
          <span className="ra-player-card__sub">Esperando jugador</span>
        </div>
      </div>
    );
  }
  const cat = formatPublicCategoriaLabel(entry.categoria);
  return (
    <div className="ra-player-card ra-duelo-slot">
      <span className="ra-duelo-slot__pos">{positionLabel}</span>
      <div className="ra-player-card__avatar" aria-hidden>
        {displayPhoto && entry.foto_url ? (
          <img src={entry.foto_url} alt="" />
        ) : (
          <span>{entry.nombre.charAt(0)}</span>
        )}
      </div>
      <div className="ra-player-card__body">
        <strong>{entry.nombre}</strong>
        <span className="ra-player-card__sub">
          {displayRating && entry.rating != null
            ? `${Number(entry.rating).toFixed(2)}`
            : entry.riviera_id}
          {cat ? ` · ${cat}` : ""}
        </span>
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
}: {
  side: DueloCourtSide;
  layout: DueloCourtLayout;
  displayPhoto: boolean;
  displayRating: boolean;
}) {
  const pair = side === "A" ? layout.parejaA : layout.parejaB;
  const meta0 = dueloSlotMeta(layout, side, 0);
  const meta1 = dueloSlotMeta(layout, side, 1);
  return (
    <div className={`ra-duelo-side ra-duelo-side--${side.toLowerCase()}`}>
      <p className="ra-duelo-side__label">{meta0.sideLabel}</p>
      <PlayerSlotCard
        entry={pair[0]}
        displayPhoto={displayPhoto}
        displayRating={displayRating}
        positionLabel={meta0.positionLabel}
        partnerName={meta0.partnerName}
      />
      <PlayerSlotCard
        entry={pair[1]}
        displayPhoto={displayPhoto}
        displayRating={displayRating}
        positionLabel={meta1.positionLabel}
        partnerName={meta1.partnerName}
      />
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
  return (
    <li className="ra-player-card">
      <div className="ra-player-card__avatar" aria-hidden>
        {displayPhoto && entry.foto_url ? (
          <img src={entry.foto_url} alt="" />
        ) : (
          <span>{entry.nombre.charAt(0)}</span>
        )}
      </div>
      <div className="ra-player-card__body">
        <strong>{entry.nombre}</strong>
        <span className="ra-player-card__sub">
          {entry.riviera_id}
          {displayRating && entry.rating != null
            ? ` · ${Number(entry.rating).toFixed(2)}`
            : ""}
          {cat ? ` · ${cat}` : ""}
        </span>
      </div>
    </li>
  );
}

export const RetaAbiertaPublicPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [dto, setDto] = useState<OpenRegistrationPublicDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("overview");
  const [rivieraInput, setRivieraInput] = useState("");
  const [preview, setPreview] = useState<OpenRegistrationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [cancelCandidates, setCancelCandidates] = useState<
    StoredCancellationEntry[]
  >([]);
  const [cancelTarget, setCancelTarget] =
    useState<StoredCancellationEntry | null>(null);

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
  const dueloLayout = useMemo(
    () => buildDueloCourtLayout(confirmed),
    [confirmed]
  );
  const isDueloMode = dto?.mode_type === "duelo_2v2";

  const canJoin =
    dto?.status === "open" &&
    !dto.is_finished &&
    (dto.spots_left > 0 || dto.waitlist_enabled);

  const stickyCta =
    canJoin && step === "overview" && (dto?.spots_left ?? 0) > 0;

  const hasLocalCancel = loadAllCancellationTokens(slug).length > 0;

  const beginCancelFlow = () => {
    setActionError(null);
    const tokens = loadAllCancellationTokens(slug);
    if (tokens.length === 0) {
      setActionError(
        "No encontramos tu inscripción en este dispositivo."
      );
      return;
    }
    setCancelCandidates(tokens);
    if (tokens.length === 1) {
      setCancelTarget(tokens[0]);
      setStep("cancel_confirm");
      return;
    }
    setCancelTarget(null);
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
        setActionError(mapJoinErrorMessage(res.error));
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
    setBusy(true);
    try {
      const res = await joinOpenRegistration(slug, preview.riviera_id);
      if (!res.ok) {
        setActionError(mapJoinErrorMessage(res.error));
        await refresh();
        return;
      }
      setJoinStatus(res.result.status);
      setSuccessMessage(res.result.message);
      setStep("done");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onConfirmCancel = async () => {
    if (!cancelTarget?.token) {
      setActionError("Selecciona a quién quieres cancelar.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await cancelOpenRegistration(slug, cancelTarget.token);
      if (!res.ok) {
        setActionError(
          res.error === "invalid_token"
            ? "El enlace de cancelación no es válido."
            : mapJoinErrorMessage(res.error)
        );
        return;
      }
      removeCancellationToken(slug, cancelTarget.entryId);
      setSuccessMessage(
        cancelTarget.nombre
          ? `Se canceló la asistencia de ${cancelTarget.nombre}.`
          : res.message
      );
      setCancelTarget(null);
      setCancelCandidates([]);
      setJoinStatus(null);
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

  if (loading) {
    return (
      <PublicTorneoExpressShell organizadorId={null}>
        <div className="ra-public ra-public--skeleton" aria-busy="true">
          <div className="ra-skel ra-skel--hero" />
          <div className="ra-skel ra-skel--line" />
          <div className="ra-skel ra-skel--line" />
          <div className="ra-skel ra-skel--grid" />
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (loadError || !dto) {
    return (
      <PublicTorneoExpressShell organizadorId={null}>
        <div className="ra-public ra-public--error">
          <h1>Convocatoria no disponible</h1>
          <p>El link no es válido o las inscripciones no están activas.</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  const isDuelo = isDueloMode;

  return (
    <PublicTorneoExpressShell organizadorId={dto.organizador_id || null}>
      <div className="ra-public">
        <header className="ra-public__hero">
          <p className="ra-public__eyebrow">{modeLabel(dto.mode_type)}</p>
          <h1 className="ra-public__title">{dto.name}</h1>
          <span className={`ra-public__badge ra-public__badge--${dto.status}`}>
            {statusLabel(dto.status)}
          </span>
          {dto.spots_left === 1 && dto.status === "open" ? (
            <p className="ra-public__last">Último lugar</p>
          ) : null}
          {dto.spots_left === 0 && dto.status === "open" ? (
            <p className="ra-public__full-inline">Completo</p>
          ) : null}
          <div className="ra-public__meta-stack">
            <p className="ra-public__meta">{formatWhen(dto)}</p>
            {formatCanchaLabel(dto.location_label) ? (
              <p className="ra-public__meta">
                {formatCanchaLabel(dto.location_label)}
              </p>
            ) : null}
            {dto.category_label ? (
              <p className="ra-public__meta">
                {formatPublicCategoriaLabel(dto.category_label) ||
                  dto.category_label}
              </p>
            ) : null}
            <p className="ra-public__cupo">
              {dto.confirmed_count} de {dto.capacity} jugadores
              {dto.spots_left > 0
                ? ` · ${dto.spots_left} disponibles`
                : " · completa"}
            </p>
          </div>
        </header>

        {step === "overview" && (
          <>
            {isDuelo ? (
              <section className="ra-duelo-board" aria-label="Cancha 2 vs 2">
                <p className="ra-duelo-board__title">Cómo queda la cancha</p>
                <DueloSideBlock
                  side="A"
                  layout={dueloLayout}
                  displayPhoto={dto.display_photo}
                  displayRating={dto.display_rating}
                />
                <div className="ra-duelo-vs" aria-hidden>
                  <span>VS</span>
                </div>
                <DueloSideBlock
                  side="B"
                  layout={dueloLayout}
                  displayPhoto={dto.display_photo}
                  displayRating={dto.display_rating}
                />
              </section>
            ) : (
              <section className="ra-public__section" aria-label="Confirmados">
                <h2>Confirmados</h2>
                <ul className="ra-public__players">
                  {confirmed.map((e) => (
                    <FlatPlayerCard
                      key={e.id}
                      entry={e}
                      displayPhoto={dto.display_photo}
                      displayRating={dto.display_rating}
                    />
                  ))}
                  {Array.from({ length: Math.max(dto.spots_left, 0) }).map(
                    (_, i) => (
                      <li
                        key={`open-${i}`}
                        className="ra-player-card ra-player-card--open"
                      >
                        <div className="ra-player-card__avatar" aria-hidden>
                          <span>+</span>
                        </div>
                        <div className="ra-player-card__body">
                          <strong>Lugar disponible</strong>
                        </div>
                      </li>
                    )
                  )}
                </ul>
              </section>
            )}

            {waitlist.length > 0 && dto.waitlist_enabled ? (
              <section className="ra-public__section">
                <h2>Lista de espera ({waitlist.length})</h2>
                <ul className="ra-public__players">
                  {waitlist.map((e) => (
                    <li
                      key={e.id}
                      className="ra-player-card ra-player-card--wait"
                    >
                      <div className="ra-player-card__body">
                        <strong>{e.nombre}</strong>
                        <span className="ra-player-card__sub">
                          {e.riviera_id}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {hasLocalCancel ? (
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={beginCancelFlow}
                disabled={busy}
              >
                Cancelar mi asistencia
              </button>
            ) : null}
          </>
        )}

        {step === "cancel_pick" && (
          <section className="ra-public__sheet" aria-label="Elegir inscripción">
            <h2>¿A quién quieres cancelar?</h2>
            <p className="ra-public__hint">
              Elige la inscripción. Luego te pediremos confirmación.
            </p>
            <ul className="ra-public__players ra-cancel-list">
              {cancelCandidates.map((c) => (
                <li key={`${c.entryId}-${c.token}`}>
                  <button
                    type="button"
                    className="ra-player-card ra-cancel-option"
                    onClick={() => {
                      setCancelTarget(c);
                      setStep("cancel_confirm");
                      setActionError(null);
                    }}
                  >
                    <div className="ra-player-card__body">
                      <strong>{resolveCancelLabel(c)}</strong>
                      {c.rivieraId ? (
                        <span className="ra-player-card__sub">{c.rivieraId}</span>
                      ) : null}
                      <span className="ra-cancel-option__cta">Seleccionar</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {actionError ? <p className="ra-error">{actionError}</p> : null}
            <button
              type="button"
              className="ra-btn ra-btn--ghost"
              onClick={() => {
                setStep("overview");
                setCancelTarget(null);
                setActionError(null);
              }}
            >
              Volver
            </button>
          </section>
        )}

        {step === "cancel_confirm" && cancelTarget && (
          <section className="ra-public__sheet" aria-label="Confirmar cancelación">
            <h2>¿Estás seguro?</h2>
            <div className="ra-confirm-card">
              <strong>{resolveCancelLabel(cancelTarget)}</strong>
              {cancelTarget.rivieraId ? (
                <span>{cancelTarget.rivieraId}</span>
              ) : null}
              <p className="ra-public__hint">
                Se cancelará esta asistencia y se liberará el lugar en la
                convocatoria.
              </p>
            </div>
            {actionError ? <p className="ra-error">{actionError}</p> : null}
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--danger"
                onClick={() => void onConfirmCancel()}
                disabled={busy}
              >
                Sí, cancelar asistencia
              </button>
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={() => {
                  if (cancelCandidates.length > 1) {
                    setStep("cancel_pick");
                  } else {
                    setStep("overview");
                    setCancelTarget(null);
                  }
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
            {actionError ? <p className="ra-error">{actionError}</p> : null}
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
            {actionError ? <p className="ra-error">{actionError}</p> : null}
            <div className="ra-actions">
              <button
                type="button"
                className="ra-btn ra-btn--primary"
                onClick={onConfirmJoin}
                disabled={busy}
              >
                Confirmar asistencia
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
            <p className="ra-public__hint">
              Guarda este enlace para administrar o cancelar tu asistencia.
            </p>
            {loadCancellationToken(slug)?.token ? (
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={async () => {
                  const t = loadCancellationToken(slug)?.token;
                  if (!t) return;
                  const manageUrl = `${window.location.origin}${buildManageRegistrationPath(slug, t)}`;
                  try {
                    await navigator.clipboard.writeText(manageUrl);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Copiar enlace de mi inscripción
              </button>
            ) : null}
            {hasLocalCancel ? (
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={beginCancelFlow}
                disabled={busy}
              >
                Cancelar asistencia
              </button>
            ) : null}
            <button
              type="button"
              className="ra-btn ra-btn--primary"
              onClick={() => setStep("overview")}
            >
              Ver convocatoria
            </button>
          </section>
        )}

        {stickyCta ? (
          <div className="ra-public__sticky">
            <button
              type="button"
              className="ra-btn ra-btn--primary ra-btn--block"
              onClick={() => {
                setStep("id");
                setActionError(null);
              }}
            >
              Quiero jugar
            </button>
          </div>
        ) : null}

        {!stickyCta &&
        step === "overview" &&
        canJoin &&
        dto.spots_left === 0 &&
        dto.waitlist_enabled ? (
          <div className="ra-public__sticky">
            <button
              type="button"
              className="ra-btn ra-btn--primary ra-btn--block"
              onClick={() => setStep("id")}
            >
              Unirme a lista de espera
            </button>
          </div>
        ) : null}

        {step === "overview" && !canJoin && dto.status === "open" ? (
          <p className="ra-public__full">Convocatoria completa</p>
        ) : null}

        {successMessage && step === "overview" ? (
          <p className="ra-public__hint ra-public__hint--ok">{successMessage}</p>
        ) : null}
      </div>
    </PublicTorneoExpressShell>
  );
};

export default RetaAbiertaPublicPage;
