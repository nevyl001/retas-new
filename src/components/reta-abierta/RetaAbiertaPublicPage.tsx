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
  loadCancellationToken,
  mapJoinErrorMessage,
  previewRivieraIdForOpenRegistration,
  storeCancellationToken,
} from "../../lib/retaAbierta/retaAbiertaService";
import { useRetaAbiertaRealtime } from "../../lib/retaAbierta/useRetaAbiertaRealtime";
import type {
  OpenRegistrationPreview,
  OpenRegistrationPublicDto,
} from "../../lib/retaAbierta/types";
import "./reta-abierta-public.css";

type Step = "overview" | "id" | "confirm" | "done" | "not_found";

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

  const canJoin =
    dto?.status === "open" &&
    !dto.is_finished &&
    (dto.spots_left > 0 || dto.waitlist_enabled);

  const stickyCta =
    canJoin && step === "overview" && (dto?.spots_left ?? 0) > 0;

  const storedCancel = loadCancellationToken(slug);

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

  const onCancel = async () => {
    const token = loadCancellationToken(slug)?.token;
    if (!token) {
      setActionError(
        "No encontramos tu token de cancelación en este dispositivo."
      );
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await cancelOpenRegistration(slug, token);
      if (!res.ok) {
        setActionError(
          res.error === "invalid_token"
            ? "El enlace de cancelación no es válido."
            : mapJoinErrorMessage(res.error)
        );
        return;
      }
      setSuccessMessage(res.message);
      setJoinStatus(null);
      setStep("overview");
      await refresh();
    } finally {
      setBusy(false);
    }
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

  return (
    <PublicTorneoExpressShell organizadorId={dto.organizador_id || null}>
      <div className="ra-public">
        <header className="ra-public__hero">
          <p className="ra-public__eyebrow">{modeLabel(dto.mode_type)}</p>
          <h1 className="ra-public__title">{dto.name}</h1>
          <span
            className={`ra-public__badge ra-public__badge--${dto.status}`}
          >
            {statusLabel(dto.status)}
          </span>
          {dto.spots_left === 1 && dto.status === "open" ? (
            <p className="ra-public__last">Último lugar</p>
          ) : null}
          {dto.spots_left === 0 && dto.status === "open" ? (
            <p className="ra-public__full-inline">Completo</p>
          ) : null}
          <p className="ra-public__meta">{formatWhen(dto)}</p>
          {formatCanchaLabel(dto.location_label) ? (
            <p className="ra-public__meta">
              {formatCanchaLabel(dto.location_label)}
            </p>
          ) : null}
          {dto.category_label ? (
            <p className="ra-public__meta">{dto.category_label}</p>
          ) : null}
          <p className="ra-public__cupo">
            {dto.confirmed_count} de {dto.capacity} jugadores
            {dto.spots_left > 0
              ? ` · ${dto.spots_left} disponibles`
              : " · completa"}
          </p>
        </header>

        {step === "overview" && (
          <>
            <section className="ra-public__section" aria-label="Confirmados">
              <h2>Confirmados</h2>
              <ul className="ra-public__players">
                {confirmed.map((e) => (
                  <li key={e.id} className="ra-player-card">
                    <div className="ra-player-card__avatar" aria-hidden>
                      {dto.display_photo && e.foto_url ? (
                        <img src={e.foto_url} alt="" />
                      ) : (
                        <span>{e.nombre.charAt(0)}</span>
                      )}
                    </div>
                    <div className="ra-player-card__body">
                      <strong>{e.nombre}</strong>
                      <span className="ra-player-card__sub">
                        {e.riviera_id}
                        {dto.display_rating && e.rating != null
                          ? ` · ${Number(e.rating).toFixed(2)}`
                          : ""}
                        {e.categoria ? ` · ${e.categoria}` : ""}
                      </span>
                    </div>
                  </li>
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

            {waitlist.length > 0 && dto.waitlist_enabled ? (
              <section className="ra-public__section">
                <h2>Lista de espera ({waitlist.length})</h2>
                <ul className="ra-public__players">
                  {waitlist.map((e) => (
                    <li key={e.id} className="ra-player-card ra-player-card--wait">
                      <div className="ra-player-card__body">
                        <strong>{e.nombre}</strong>
                        <span className="ra-player-card__sub">{e.riviera_id}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {storedCancel ? (
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={onCancel}
                disabled={busy}
              >
                Cancelar mi asistencia
              </button>
            ) : null}
          </>
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
              {preview.categoria ? <span>{preview.categoria}</span> : null}
              {preview.rating != null ? (
                <span>Rating {Number(preview.rating).toFixed(2)}</span>
              ) : null}
            </div>
            <p className="ra-public__hint ra-public__hint--warn">
              En esta versión la inscripción usa solo tu Riviera ID (sin OTP).
              Guarda el acceso de cancelación en este dispositivo.
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
            <p className="ra-public__hint">
              Si el club no tiene teléfono público, comparte este mensaje
              directamente con ellos.
            </p>
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
            {loadCancellationToken(slug) ? (
              <button
                type="button"
                className="ra-btn ra-btn--ghost"
                onClick={onCancel}
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
      </div>
    </PublicTorneoExpressShell>
  );
};

export default RetaAbiertaPublicPage;
