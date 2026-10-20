import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { useBranding } from "../../club-experience";
import {
  inviteClubCoach,
  linkExistingCoach,
  loadCoachingClubSnapshot,
  searchCoachForInvitation,
  updateCoachMembershipStatus,
  updateLinkStatus,
  assignCoachClasses,
  fetchClubClassLedger,
  generateCoachingIdempotencyKey,
  fetchCurrentCoachProfile,
  removeCoachFromClub,
  finalizeCoachRemovalFromClub,
  fetchClubCoachingAgenda,
} from "../../lib/coaching/coachingApi";
import { ClubCoachDetailView } from "./ClubCoachDetailView";
import { AddStudentToCoachModal } from "./AddStudentToCoachModal";
import { ReassignCoachModal } from "./ReassignCoachModal";
import { AdjustClassBalanceModal } from "./AdjustClassBalanceModal";
import { RevertClassSessionModal } from "./RevertClassSessionModal";
import { ScheduleClassModal } from "./ScheduleClassModal";
import { RescheduleClassModal } from "./RescheduleClassModal";
import { CancelClassModal } from "./CancelClassModal";
import {
  COACH_ESPECIALIDADES_ORDER,
  COACH_FUERZAS_ORDER,
} from "../../lib/coaching/constants";
import type {
  CoachSearchResult,
  CoachingClubSnapshot,
  CoachingCoach,
  CoachingPlayerLink,
  CoachClassLedgerEntry,
  CoachMembershipStatus,
  CoachScheduledSession,
} from "../../lib/coaching/types";
import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_LABELS,
  RIVIERA_GENERO_ORDER,
} from "../../lib/rivieraJugadores/genero";
import {
  EN_CANCHA_LABELS,
  EN_CANCHA_ORDER,
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
  MANO_DOMINANTE_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { PAISES_RIVIERA, paisSelectLabel } from "../../lib/rivieraJugadores/paises";
import {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
  isValidEmailFormat,
  normalizeEmailInput,
} from "../../lib/rivieraJugadores/emailValidation";
import { TablerIcon } from "../ui/TablerIcon";
import { Modal } from "../ui/Modal";
import { navigateToAppHome } from "../../lib/appRouting";
import {
  coachingTabPath,
  navigateCoachPortal,
  navigateCoaching,
  parseCoachingTab,
  type CoachingTab,
} from "./coachingNav";
import "./coaching.css";

const TABS: Array<{ id: CoachingTab; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "coaches", label: "Coaches", icon: "user-star" },
  { id: "jugadores", label: "Jugadores", icon: "users" },
  { id: "agenda", label: "Agenda", icon: "calendar" },
];

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export const CoachingClubPage: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  const { user } = useUser();
  const { nombre: clubName } = useBranding();
  const tab = parseCoachingTab(pathname);
  const organizadorId = user?.id ?? "";

  const [snapshot, setSnapshot] = useState<CoachingClubSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);
  const [coachModalTab, setCoachModalTab] = useState<"nuevo" | "vincular">(
    "nuevo"
  );
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [coachStatusFilter, setCoachStatusFilter] = useState<
    "ALL" | CoachMembershipStatus
  >("ALL");
  const [isCoachUser, setIsCoachUser] = useState<boolean>(false);

  // Credenciales generadas para nuevo coach
  const [createdCoachCredentials, setCreatedCoachCredentials] = useState<{
    nombre: string;
    coachCode: string;
    email: string;
    password: string;
    verificationUrl?: string | null;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Eliminación de coach del club (desde cualquier estado)
  const [coachToRemove, setCoachToRemove] = useState<CoachingCoach | null>(null);
  const [removalReasonInput, setRemovalReasonInput] = useState("");
  const [coachToFinalizeRemoval, setCoachToFinalizeRemoval] = useState<CoachingCoach | null>(null);

  // Control de clases y saldos de alumnos
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [assigningLink, setAssigningLink] = useState<CoachingPlayerLink | null>(null);
  const [reassigningLink, setReassigningLink] = useState<CoachingPlayerLink | null>(null);
  const [classCountInput, setClassCountInput] = useState<number>(10);
  const [classNotesInput, setClassNotesInput] = useState<string>("");
  const [assignIdempotencyKey, setAssignIdempotencyKey] = useState<string>("");
  const [ledgerEntries, setLedgerEntries] = useState<CoachClassLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // Ajustes de saldo y reversiones compensatorias
  const [adjustingBalance, setAdjustingBalance] = useState<{
    coachId: string;
    coachNombre: string;
    studentId: string;
    studentNombre: string;
    rivieraId?: string;
    currentBalance: number;
    referenceLedgerId?: string | null;
  } | null>(null);

  const [revertingSession, setRevertingSession] = useState<{
    id: string;
    startsAt: string;
    jugadorNombre?: string;
    coachNombre?: string;
    durationMinutes?: number | null;
    focus?: string | null;
  } | null>(null);

  // Agenda real de coaching
  const [agendaSessions, setAgendaSessions] = useState<CoachScheduledSession[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [agendaCoachFilter, setAgendaCoachFilter] = useState<string>("ALL");
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<string>("ALL");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [reschedulingSession, setReschedulingSession] = useState<CoachScheduledSession | null>(null);
  const [cancellingSession, setCancellingSession] = useState<CoachScheduledSession | null>(null);

  const loadAgenda = useCallback(async (orgId: string, coachFilter?: string, statusFilter?: string) => {
    if (!orgId) return;
    setAgendaLoading(true);
    setAgendaError(null);
    try {
      const data = await fetchClubCoachingAgenda({
        organizadorId: orgId,
        coachId: coachFilter && coachFilter !== "ALL" ? coachFilter : null,
        statusFilter: statusFilter && statusFilter !== "ALL" ? statusFilter : null,
      });
      setAgendaSessions(data);
    } catch (e: any) {
      console.error("[coaching] error loading agenda:", e);
      setAgendaError(e?.message || "No se pudo cargar la agenda del club.");
    } finally {
      setAgendaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (organizadorId && tab === "agenda") {
      void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter);
    }
  }, [organizadorId, tab, agendaCoachFilter, agendaStatusFilter, loadAgenda]);

  const loadLedger = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setLoadingLedger(true);
    setLedgerError(null);
    try {
      const data = await fetchClubClassLedger(orgId);
      setLedgerEntries(data);
    } catch (e) {
      console.error("[coaching] error loading ledger", e);
      setLedgerError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar el historial de clases del club."
      );
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  useEffect(() => {
    if (organizadorId && tab === "jugadores") {
      void loadLedger(organizadorId);
    }
  }, [organizadorId, tab, loadLedger]);

  const handleAssignClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizadorId || !assigningLink || classCountInput <= 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const snap = await assignCoachClasses(
        organizadorId,
        assigningLink.id,
        classCountInput,
        classNotesInput.trim() || undefined,
        assignIdempotencyKey || undefined
      );
      setSnapshot(snap);
      setSuccessMessage(`Se asignaron ${classCountInput} clases a ${assigningLink.jugadorNombre} exitosamente.`);
      setAssigningLink(null);
      setClassNotesInput("");
      setAssignIdempotencyKey("");
      await loadLedger(organizadorId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al asignar clases.");
    } finally {
      setBusy(false);
    }
  };

  // Coach form (mismos datos base que jugador + fuerzas/especialidades)
  const [coachNombre, setCoachNombre] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [coachTelefono, setCoachTelefono] = useState("");
  const [coachPais, setCoachPais] = useState("MX");
  const [coachGenero, setCoachGenero] = useState<RivieraJugadorGenero>("M");
  const [coachCategoria, setCoachCategoria] =
    useState<RivieraJugadorCategoria>("3ra_fuerza");
  const [coachEdad, setCoachEdad] = useState("");
  const [coachMano, setCoachMano] = useState<ManoDominante | "">("");
  const [coachEnCancha, setCoachEnCancha] = useState<EnCancha | "">("");
  const [coachFuerzas, setCoachFuerzas] = useState<RivieraJugadorCategoria[]>([
    "3ra_fuerza",
  ]);
  const [coachEspecialidades, setCoachEspecialidades] = useState<string[]>([
    "Técnica",
  ]);

  // Coach search & link
  const [coachSearchQuery, setCoachSearchQuery] = useState("");
  const [coachSearchResult, setCoachSearchResult] =
    useState<CoachSearchResult | null>(null);
  const [coachSearchError, setCoachSearchError] = useState<string | null>(null);
  const [coachSearchLoading, setCoachSearchLoading] = useState(false);


  const refresh = useCallback(async () => {
    if (!organizadorId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loadCoachingClubSnapshot(organizadorId);
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar Coaching");
    } finally {
      setLoading(false);
    }
  }, [organizadorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    void fetchCurrentCoachProfile()
      .then((p) => {
        if (active) setIsCoachUser(Boolean(p));
      })
      .catch(() => {
        if (active) setIsCoachUser(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (tab !== "coaches") {
      setSelectedCoachId(null);
    }
  }, [tab]);

  const stats = useMemo(() => {
    const coaches =
      snapshot?.coaches.filter(
        (c) =>
          c.membershipStatus !== "ARCHIVED" && c.membershipStatus !== "REMOVED"
      ).length ?? 0;
    const activeLinks =
      snapshot?.links.filter((l) => l.status === "ACTIVE").length ?? 0;
    const paused =
      snapshot?.links.filter((l) => l.status === "PAUSED").length ?? 0;
    return { coaches, activeLinks, paused };
  }, [snapshot]);

  const coachCounts = useMemo(() => {
    const all = snapshot?.coaches ?? [];
    return {
      ALL: all.filter((c) => c.membershipStatus !== "ARCHIVED" && c.membershipStatus !== "REMOVED").length,
      ACTIVE: all.filter((c) => c.membershipStatus === "ACTIVE").length,
      PENDING: all.filter((c) => c.membershipStatus === "PENDING").length,
      INACTIVE: all.filter(
        (c) =>
          c.membershipStatus === "INACTIVE" ||
          c.membershipStatus === "CANCELLED"
      ).length,
      ARCHIVED: all.filter((c) => c.membershipStatus === "ARCHIVED").length,
      REMOVED: all.filter((c) => c.membershipStatus === "REMOVED").length,
    };
  }, [snapshot]);

  const filteredCoaches = useMemo(() => {
    const all = snapshot?.coaches ?? [];
    if (coachStatusFilter === "ALL") {
      return all.filter((c) => c.membershipStatus !== "ARCHIVED" && c.membershipStatus !== "REMOVED");
    }
    if (coachStatusFilter === "ACTIVE") {
      return all.filter((c) => c.membershipStatus === "ACTIVE");
    }
    if (coachStatusFilter === "PENDING") {
      return all.filter((c) => c.membershipStatus === "PENDING");
    }
    if (coachStatusFilter === "INACTIVE") {
      return all.filter(
        (c) =>
          c.membershipStatus === "INACTIVE" ||
          c.membershipStatus === "CANCELLED"
      );
    }
    if (coachStatusFilter === "ARCHIVED") {
      return all.filter((c) => c.membershipStatus === "ARCHIVED");
    }
    if (coachStatusFilter === "REMOVED") {
      return all.filter((c) => c.membershipStatus === "REMOVED");
    }
    return all;
  }, [snapshot, coachStatusFilter]);

  const resetCoachForm = () => {
    setCoachNombre("");
    setCoachEmail("");
    setCoachTelefono("");
    setCoachPais("MX");
    setCoachGenero("M");
    setCoachCategoria("3ra_fuerza");
    setCoachEdad("");
    setCoachMano("");
    setCoachEnCancha("");
    setCoachFuerzas(["3ra_fuerza"]);
    setCoachEspecialidades(["Técnica"]);
    setFormError(null);
    setCoachSearchQuery("");
    setCoachSearchResult(null);
    setCoachSearchError(null);
  };

  const handleAddCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizadorId || !coachNombre.trim()) return;
    const email = normalizeEmailInput(coachEmail);
    if (!email) {
      setFormError(EMAIL_REQUIRED_MESSAGE);
      return;
    }
    if (!isValidEmailFormat(email)) {
      setFormError(EMAIL_INVALID_MESSAGE);
      return;
    }
    if (coachFuerzas.length === 0) {
      setFormError("Selecciona al menos una fuerza que entrena el coach.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await inviteClubCoach(organizadorId, {
        nombre: coachNombre.trim(),
        email,
        telefono: coachTelefono.trim() || undefined,
        paisCodigo: coachPais || null,
        genero: coachGenero,
        categoria: coachCategoria,
        edad: coachEdad.trim() ? Number(coachEdad) : null,
        manoDominante: coachMano || null,
        enCancha: coachEnCancha || null,
        fuerzas: coachFuerzas,
        especialidades: coachEspecialidades,
      });
      setSnapshot(res.snapshot);
      resetCoachForm();
      setIsCoachModalOpen(false);

      if (res.isNewUser && res.initialPassword) {
        setCreatedCoachCredentials({
          nombre: coachNombre.trim(),
          coachCode: res.coachCode,
          email,
          password: res.initialPassword,
          verificationUrl: res.verificationUrl ?? null,
        });
      } else {
        setSuccessMessage(
          res.message ||
          (res.isNewUser
            ? `Invitación oficial enviada a ${email}. Código de coach oficial: ${res.coachCode}.`
            : `Coach incorporado exitosamente a tu club con código oficial ${res.coachCode}.`)
        );
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Error de incorporación: no se pudo registrar el coach."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRemoveCoach = async () => {
    if (!organizadorId || !coachToRemove) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await removeCoachFromClub(
        organizadorId,
        coachToRemove.id,
        removalReasonInput.trim() || undefined
      );
      setSuccessMessage(res.message || "Coach eliminado exitosamente del club.");
      setCoachToRemove(null);
      setRemovalReasonInput("");
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Error al eliminar al entrenador del club."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmFinalizeRemoval = async () => {
    if (!organizadorId || !coachToFinalizeRemoval) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await finalizeCoachRemovalFromClub(
        organizadorId,
        coachToFinalizeRemoval.id
      );
      setSuccessMessage(res.message || "Entrenador eliminado definitivamente de tu club.");
      setCoachToFinalizeRemoval(null);
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Error al eliminar definitivamente al entrenador del club."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCoachStatus = async (
    coachId: string,
    nextStatus: "ACTIVE" | "INACTIVE"
  ) => {
    if (!organizadorId) return;
    setBusy(true);
    setFormError(null);
    try {
      const next = await updateCoachMembershipStatus(
        organizadorId,
        coachId,
        nextStatus
      );
      setSnapshot(next);
      setSuccessMessage(
        nextStatus === "ACTIVE"
          ? "Solicitud de incorporación registrada. El coach debe aceptarla desde su cuenta para activarse."
          : "Membresía del coach desactivada en el club."
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el estado de la membresía del coach."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSearchCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = coachSearchQuery.trim();
    if (!query) return;
    setCoachSearchLoading(true);
    setCoachSearchError(null);
    setCoachSearchResult(null);
    try {
      const found = await searchCoachForInvitation(query);
      if (!found) {
        setCoachSearchError(
          "No se encontró ningún coach registrado con ese código oficial o correo."
        );
      } else {
        setCoachSearchResult(found);
      }
    } catch (err) {
      setCoachSearchError(
        err instanceof Error ? err.message : "Error al buscar coach."
      );
    } finally {
      setCoachSearchLoading(false);
    }
  };

  const handleLinkExistingCoach = async () => {
    if (!organizadorId || !coachSearchResult) return;
    setBusy(true);
    setCoachSearchError(null);
    try {
      const next = await linkExistingCoach(
        organizadorId,
        coachSearchResult.coachId
      );
      setSnapshot(next);
      setIsCoachModalOpen(false);
      resetCoachForm();
      setSuccessMessage(
        `Coach ${coachSearchResult.nombre} vinculado exitosamente a tu club.`
      );
    } catch (err) {
      setCoachSearchError(
        err instanceof Error ? err.message : "No se pudo vincular el coach."
      );
    } finally {
      setBusy(false);
    }
  };


  const handleStatus = async (
    linkId: string,
    status: "ACTIVE" | "PAUSED" | "ENDED"
  ) => {
    if (!organizadorId) return;
    setBusy(true);
    try {
      const next = await updateLinkStatus(organizadorId, linkId, status);
      setSnapshot(next);
      setSuccessMessage("Estado del alumno actualizado.");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo actualizar el estado."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coaching-page rv-page">
      <header className="coaching-hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className="coaching-back"
            style={{ margin: 0 }}
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          {isCoachUser ? (
            <button
              type="button"
              className="coaching-back"
              style={{ margin: 0 }}
              onClick={() => navigateCoachPortal()}
            >
              <TablerIcon name="user-circle" size={16} />
              Espacio del Coach
            </button>
          ) : null}
        </div>
        <p className="coaching-kicker">Riviera Coaching · {clubName || "Club"}</p>
        <h1 className="coaching-title">Riviera Coaching</h1>
        <p className="coaching-lead">
          Gestiona tus coaches, alumnos y actividades de formación deportiva.
        </p>

        {snapshot?.source === "demo" ? (
          <div className="coaching-demo-banner">
            <span className="coaching-demo-pill">Modo demostración</span>
            <span className="coaching-demo-text">
              Datos locales de prueba para explorar la interfaz. Las cuentas
              auténticas de coach y la agenda operativa se habilitarán en
              próximas entregas.
            </span>
          </div>
        ) : null}
      </header>

      <div className="coaching-tabs-wrap">
        <nav className="coaching-tabs" aria-label="Secciones de coaching">
          {TABS.map((t) => {
            const count =
              t.id === "coaches"
                ? stats.coaches
                : t.id === "jugadores"
                ? stats.activeLinks
                : 0;

            return (
              <button
                key={t.id}
                type="button"
                className={`coaching-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => navigateCoaching(coachingTabPath(t.id))}
              >
                <TablerIcon name={t.icon} size={16} />
                <span>{t.label}</span>
                {count > 0 ? (
                  <span className="coaching-tab__count">{count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {successMessage ? (
        <div className="coaching-success-banner">
          <TablerIcon name="check" size={18} />
          <span>{successMessage}</span>
        </div>
      ) : null}
      {error ? <p className="coaching-error">{error}</p> : null}
      {formError ? <p className="coaching-error">{formError}</p> : null}
      {loading ? <p className="coaching-muted">Cargando datos de coaching…</p> : null}

      {!loading && tab === "dashboard" ? (
        <section className="coaching-panel" aria-label="Dashboard">
          <div className="coaching-kpi-grid">
            <article className="coaching-kpi">
              <div className="coaching-kpi__header">
                <span className="coaching-kpi__icon" aria-hidden>
                  <TablerIcon name="user-star" size={18} />
                </span>
                <span className="coaching-kpi__label">Coaches activos</span>
              </div>
              <p className="coaching-kpi__value">{stats.coaches}</p>
              <p className="coaching-kpi__hint">
                Entrenadores registrados en el club
              </p>
            </article>

            <article className="coaching-kpi">
              <div className="coaching-kpi__header">
                <span className="coaching-kpi__icon" aria-hidden>
                  <TablerIcon name="users" size={18} />
                </span>
                <span className="coaching-kpi__label">Relaciones activas</span>
              </div>
              <p className="coaching-kpi__value">{stats.activeLinks}</p>
              <p className="coaching-kpi__hint">Alumnos en formación activa</p>
            </article>

            <article className="coaching-kpi">
              <div className="coaching-kpi__header">
                <span className="coaching-kpi__icon" aria-hidden>
                  <TablerIcon name="player-pause" size={18} />
                </span>
                <span className="coaching-kpi__label">En pausa</span>
              </div>
              <p className="coaching-kpi__value">{stats.paused}</p>
              <p className="coaching-kpi__hint">Relaciones suspendidas temporalmente</p>
            </article>
          </div>

          <div className="coaching-guide-card">
            <div className="coaching-guide-card__header">
              <h2 className="coaching-guide-card__title">
                Flujo operativo de la academia
              </h2>
              <p className="coaching-guide-card__desc">
                Paso a paso para la incorporación y seguimiento deportivo en tu
                club.
              </p>
            </div>

            <div className="coaching-guide-steps">
              <div className="coaching-guide-step">
                <div className="coaching-guide-step__badge">1</div>
                <div className="coaching-guide-step__body">
                  <h4>Registra tus coaches</h4>
                  <p>
                    Da de alta a tus entrenadores con sus categorías, fuerzas que
                    entrenan y especialidades técnicas (código RIV-C-#####).
                  </p>
                </div>
              </div>

              <div className="coaching-guide-step">
                <div className="coaching-guide-step__badge">2</div>
                <div className="coaching-guide-step__body">
                  <h4>Vincula a tus alumnos</h4>
                  <p>
                    Asocia jugadores mediante su Riviera ID canónico
                    (RIV-########) para asignarles su entrenador oficial.
                  </p>
                </div>
              </div>

              <div className="coaching-guide-step">
                <div className="coaching-guide-step__badge">3</div>
                <div className="coaching-guide-step__body">
                  <h4>Agenda y evolución deportiva</h4>
                  <p>
                    Control de sesiones de clase y objetivos. Coaching mantiene
                    estricta separación con los rankings y puntos de reta.
                  </p>
                </div>
              </div>
            </div>

            <div className="coaching-guide-actions">
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => navigateCoaching(coachingTabPath("coaches"))}
              >
                <TablerIcon name="user-star" size={16} />
                Ver coaches
              </button>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => navigateCoaching(coachingTabPath("jugadores"))}
              >
                <TablerIcon name="users" size={16} />
                Ver alumnos
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && tab === "coaches" ? (
        selectedCoachId ? (
          <ClubCoachDetailView
            organizadorId={organizadorId}
            coachId={selectedCoachId}
            clubName={clubName || "Club"}
            onBack={() => setSelectedCoachId(null)}
            onCoachUpdated={async () => {
              await refresh();
            }}
          />
        ) : (
          <section className="coaching-panel" aria-label="Coaches">
            <div className="coaching-section-header">
              <div>
                <h2 className="coaching-section-title">Coaches del club</h2>
                <p className="coaching-section-desc">
                  Entrenadores dados de alta en la academia deportiva.
                </p>
              </div>
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => setIsCoachModalOpen(true)}
              >
                <TablerIcon name="plus" size={16} />
                Nuevo coach
              </button>
            </div>

            {/* Filtros de estado */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "0.5rem",
              }}
            >
              {[
                { id: "ALL", label: "Todos", count: coachCounts.ALL },
                { id: "ACTIVE", label: "Activos", count: coachCounts.ACTIVE },
                {
                  id: "PENDING",
                  label: "Invitaciones pendientes",
                  count: coachCounts.PENDING,
                },
                {
                  id: "INACTIVE",
                  label: "Inactivos",
                  count: coachCounts.INACTIVE,
                },
                {
                  id: "ARCHIVED",
                  label: "Archivados",
                  count: coachCounts.ARCHIVED,
                },
                {
                  id: "REMOVED",
                  label: "Eliminados",
                  count: coachCounts.REMOVED,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`coaching-chip${
                    coachStatusFilter === f.id ? " is-on" : ""
                  }`}
                  onClick={() => setCoachStatusFilter(f.id as any)}
                  style={{
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.35rem 0.8rem",
                    fontSize: "0.82rem",
                  }}
                >
                  <span>{f.label}</span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      padding: "0.1rem 0.45rem",
                      borderRadius: "999px",
                      background:
                        coachStatusFilter === f.id
                          ? "rgba(255,255,255,0.25)"
                          : "rgba(255,255,255,0.08)",
                      fontWeight: 700,
                    }}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            {filteredCoaches.length === 0 ? (
              <div className="coaching-empty-card">
                <TablerIcon
                  name="user-star"
                  size={44}
                  className="coaching-empty-icon"
                />
                <h3>
                  {coachStatusFilter === "ARCHIVED"
                    ? "No hay entrenadores archivados"
                    : coachStatusFilter === "PENDING"
                    ? "No hay invitaciones pendientes"
                    : coachStatusFilter === "INACTIVE"
                    ? "No hay entrenadores inactivos"
                    : "No hay coaches registrados"}
                </h3>
                <p>
                  {coachStatusFilter === "ARCHIVED"
                    ? "Los entrenadores archivados aparecerán aquí cuando decidas archivar membresías inactivas para limpiar la lista operativa."
                    : coachStatusFilter === "PENDING"
                    ? "Las invitaciones pendientes de aceptación aparecerán aquí."
                    : coachStatusFilter === "INACTIVE"
                    ? "Los entrenadores desactivados aparecerán aquí."
                    : "Comienza agregando el primer entrenador para asignarle alumnos y organizar la academia de pádel."}
                </p>
                {coachStatusFilter !== "ARCHIVED" ? (
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--primary"
                    onClick={() => setIsCoachModalOpen(true)}
                  >
                    <TablerIcon name="plus" size={16} />
                    Registrar primer coach
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="coaching-grid">
                {filteredCoaches.map((c) => {
                  const displayFuerzas =
                    c.clubFuerzas && c.clubFuerzas.length > 0
                      ? c.clubFuerzas
                      : c.fuerzas;
                  const displayEspecialidades =
                    c.clubEspecialidades && c.clubEspecialidades.length > 0
                      ? c.clubEspecialidades
                      : c.especialidades;

                  return (
                    <article key={c.id} className="coaching-card">
                      <div className="coaching-card__top">
                        <div className="coaching-card__avatar" aria-hidden>
                          {c.nombre.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="coaching-card__identity">
                          <h3 className="coaching-card__title">{c.nombre}</h3>
                          <span className="coaching-card__code">
                            {c.coachCode || "Código pendiente"}
                          </span>
                          <div className="coaching-card__meta">
                            {c.categoria ? (
                              <span className="coaching-card__meta-item">
                                {JUGADOR_CATEGORIA_LABELS[c.categoria]}
                              </span>
                            ) : null}
                            {c.paisCodigo ? (
                              <span className="coaching-card__meta-item">
                                · {c.paisCodigo}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {c.membershipStatus === "ACTIVE" ? (
                          <span className="coaching-badge coaching-badge--active">
                            Activo
                          </span>
                        ) : c.membershipStatus === "PENDING" ? (
                          <span className="coaching-badge coaching-badge--pending">
                            Invitación pendiente
                          </span>
                        ) : c.membershipStatus === "ARCHIVED" ? (
                          <span
                            className="coaching-badge"
                            style={{
                              background: "rgba(255, 255, 255, 0.06)",
                              border: "1px solid rgba(255, 255, 255, 0.12)",
                              color: "var(--ro-text-muted, #94a3b8)",
                            }}
                          >
                            Archivado
                          </span>
                        ) : c.membershipStatus === "CANCELLED" ? (
                          <span
                            className="coaching-badge"
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.25)",
                              color: "#fca5a5",
                            }}
                          >
                            Cancelado
                          </span>
                        ) : (
                          <span className="coaching-badge coaching-badge--inactive">
                            Inactivo
                          </span>
                        )}
                      </div>

                      {displayFuerzas.length > 0 ? (
                        <div className="coaching-card__tags-section">
                          <span className="coaching-card__tag-label">
                            Entrena fuerzas
                          </span>
                          <div className="coaching-card__tags">
                            {displayFuerzas.map((f) => (
                              <span key={f} className="coaching-tag">
                                {JUGADOR_CATEGORIA_LABELS[f] || f}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {displayEspecialidades.length > 0 ? (
                        <div className="coaching-card__tags-section">
                          <span className="coaching-card__tag-label">
                            Especialidades
                          </span>
                          <div className="coaching-card__tags">
                            {displayEspecialidades.map((esp) => (
                              <span key={esp} className="coaching-tag">
                                {esp}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {c.clubNotas ? (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--ro-text-muted)",
                            fontStyle: "italic",
                            padding: "0.35rem 0.5rem",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: "6px",
                          }}
                        >
                          "{c.clubNotas}"
                        </div>
                      ) : null}

                      <div
                        className="coaching-card__actions"
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <button
                          type="button"
                          className="coaching-btn coaching-btn--primary"
                          onClick={() => setSelectedCoachId(c.id)}
                        >
                          <TablerIcon name="user-circle" size={16} />
                          Ver panel del coach
                        </button>

                        {c.membershipStatus === "ACTIVE" ? (
                          <>
                            <button
                              type="button"
                              className="coaching-btn coaching-btn--secondary"
                              onClick={() => {
                                navigateCoaching(coachingTabPath("jugadores"));
                              }}
                            >
                              <TablerIcon name="users" size={15} />
                              Ver alumnos
                            </button>
                            <button
                              type="button"
                              className="coaching-btn coaching-btn--ghost"
                              onClick={() =>
                                handleToggleCoachStatus(c.id, "INACTIVE")
                              }
                              disabled={busy}
                            >
                              <TablerIcon name="user-off" size={15} />
                              Desactivar
                            </button>
                          </>
                        ) : c.membershipStatus === "PENDING" ? (
                          <span
                            className="coaching-badge coaching-badge--pending"
                            style={{
                              fontSize: "0.8rem",
                              padding: "0.4rem 0.65rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                            }}
                          >
                            <TablerIcon name="clock" size={14} />
                            Pendiente de aceptación
                          </span>
                        ) : c.membershipStatus === "ARCHIVED" ? (
                          <span
                            className="coaching-badge"
                            style={{
                              fontSize: "0.8rem",
                              padding: "0.4rem 0.65rem",
                              background: "rgba(255,255,255,0.05)",
                              color: "var(--ro-text-muted)",
                            }}
                          >
                            Membresía archivada
                          </span>
                        ) : c.membershipStatus === "REMOVED" ? (
                          <span
                            className="coaching-badge"
                            style={{
                              fontSize: "0.8rem",
                              padding: "0.4rem 0.65rem",
                              background: "rgba(239, 68, 68, 0.12)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              color: "#fca5a5",
                            }}
                          >
                            Eliminado del club
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--ghost"
                            onClick={() =>
                              handleToggleCoachStatus(c.id, "ACTIVE")
                            }
                            disabled={busy}
                          >
                            <TablerIcon name="user-check" size={15} />
                            Reincorporar
                          </button>
                        )}

                        {c.membershipStatus === "REMOVED" ? (
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--ghost"
                            style={{ color: "#ef4444" }}
                            onClick={() => setCoachToFinalizeRemoval(c)}
                            disabled={busy}
                            title="Borrar definitivamente a este coach de la lista de mi club"
                          >
                            <TablerIcon name="trash-x" size={15} />
                            Eliminar definitivamente
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--ghost"
                            style={{ color: "#f87171" }}
                            onClick={() => setCoachToRemove(c)}
                            disabled={busy}
                            title="Eliminar este coach de mi club"
                          >
                            <TablerIcon name="trash" size={15} />
                            Eliminar de mi club
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

          <Modal
            open={isCoachModalOpen}
            onClose={() => {
              setIsCoachModalOpen(false);
              resetCoachForm();
            }}
            title={
              coachModalTab === "nuevo"
                ? "Registrar nuevo coach"
                : "Vincular coach existente"
            }
            size="lg"
          >
            <div className="coaching-modal-nav">
              <button
                type="button"
                className={`coaching-modal-tab${
                  coachModalTab === "nuevo" ? " is-active" : ""
                }`}
                onClick={() => setCoachModalTab("nuevo")}
              >
                <TablerIcon name="user-plus" size={16} />
                Nuevo coach
              </button>
              <button
                type="button"
                className={`coaching-modal-tab${
                  coachModalTab === "vincular" ? " is-active" : ""
                }`}
                onClick={() => setCoachModalTab("vincular")}
              >
                <TablerIcon name="search" size={16} />
                Buscar coach existente
              </button>
            </div>

            {coachModalTab === "vincular" ? (
              <div className="coaching-modal-form">
                <p className="coaching-modal-desc">
                  Busca a un entrenador por su código oficial de coach (ej.{" "}
                  <strong>RIV-C-00042</strong>) o por su correo registrado para
                  vincularlo a este club.
                </p>

                <form
                  className="coaching-search-row"
                  onSubmit={handleSearchCoach}
                >
                  <input
                    value={coachSearchQuery}
                    onChange={(e) => setCoachSearchQuery(e.target.value)}
                    placeholder="Código RIV-C-##### o correo..."
                    disabled={coachSearchLoading || busy}
                  />
                  <button
                    type="submit"
                    className="coaching-btn coaching-btn--secondary"
                    disabled={coachSearchLoading || !coachSearchQuery.trim()}
                  >
                    <TablerIcon name="search" size={16} />
                    {coachSearchLoading ? "Buscando…" : "Buscar"}
                  </button>
                </form>

                {coachSearchError ? (
                  <p className="coaching-error">{coachSearchError}</p>
                ) : null}

                {coachSearchResult ? (
                  <div className="coaching-coach-preview">
                    <div className="coaching-card__top">
                      <div className="coaching-card__avatar" aria-hidden>
                        {coachSearchResult.nombre.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="coaching-card__identity">
                        <h3 className="coaching-card__title">
                          {coachSearchResult.nombre}
                        </h3>
                        <span className="coaching-card__code">
                          {coachSearchResult.coachCode}
                        </span>
                        {coachSearchResult.especialidades.length > 0 ? (
                          <div className="coaching-card__meta">
                            <span className="coaching-card__meta-item">
                              {coachSearchResult.especialidades.join(", ")}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {coachSearchResult.alreadyMember ? (
                        <span className="coaching-badge coaching-badge--active">
                          Ya en tu club
                        </span>
                      ) : null}
                    </div>

                    {!coachSearchResult.alreadyMember ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--primary"
                        onClick={handleLinkExistingCoach}
                        disabled={busy}
                      >
                        <TablerIcon name="link" size={16} />
                        {busy ? "Vinculando…" : "Vincular a este club"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="coaching-modal-footer">
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--ghost"
                    onClick={() => {
                      setIsCoachModalOpen(false);
                      resetCoachForm();
                    }}
                    disabled={busy}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form className="coaching-modal-form" onSubmit={handleAddCoach}>
                {formError ? (
                  <div
                    className="coaching-error"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      marginBottom: "1rem",
                      background: "rgba(255, 71, 87, 0.12)",
                      border: "1px solid rgba(255, 71, 87, 0.3)",
                      color: "#ff6b81",
                    }}
                  >
                    <TablerIcon name="alert-circle" size={18} />
                    <span>{formError}</span>
                  </div>
                ) : null}
                <div className="coaching-modal-grid">
                  <label className="coaching-field">
                    <span>Nombre del coach *</span>
                    <input
                      value={coachNombre}
                      onChange={(e) => setCoachNombre(e.target.value)}
                      placeholder="Ej. Rodrigo Pádel"
                      disabled={busy}
                      required
                    />
                  </label>
                  <label className="coaching-field">
                    <span>Email de contacto *</span>
                    <input
                      type="email"
                      value={coachEmail}
                      onChange={(e) => setCoachEmail(e.target.value)}
                      placeholder="coach@club.com"
                      disabled={busy}
                      required
                    />
                  </label>
                  <label className="coaching-field">
                    <span>Teléfono / WhatsApp</span>
                    <input
                      value={coachTelefono}
                      onChange={(e) => setCoachTelefono(e.target.value)}
                      placeholder="+52 998 123 4567"
                      disabled={busy}
                    />
                  </label>
                  <label className="coaching-field">
                    <span>País</span>
                    <select
                      value={coachPais}
                      onChange={(e) => setCoachPais(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">— Sin especificar —</option>
                      {PAISES_RIVIERA.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {paisSelectLabel(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="coaching-field">
                    <span>Género</span>
                    <select
                      value={coachGenero}
                      onChange={(e) =>
                        setCoachGenero(e.target.value as RivieraJugadorGenero)
                      }
                      disabled={busy}
                    >
                      {RIVIERA_GENERO_ORDER.map((g) => (
                        <option key={g} value={g}>
                          {RIVIERA_GENERO_LABELS[g]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="coaching-field">
                    <span>Fuerza deportiva propia</span>
                    <select
                      value={coachCategoria}
                      onChange={(e) =>
                        setCoachCategoria(
                          e.target.value as RivieraJugadorCategoria
                        )
                      }
                      disabled={busy}
                    >
                      {JUGADOR_CATEGORIAS_ORDER.map((n) => (
                        <option key={n} value={n}>
                          {JUGADOR_CATEGORIA_LABELS[n]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="coaching-field">
                    <span>Edad</span>
                    <input
                      type="number"
                      min={14}
                      max={99}
                      value={coachEdad}
                      onChange={(e) => setCoachEdad(e.target.value)}
                      placeholder="30"
                      disabled={busy}
                    />
                  </label>
                  <label className="coaching-field">
                    <span>Mano dominante</span>
                    <select
                      value={coachMano}
                      onChange={(e) =>
                        setCoachMano(e.target.value as ManoDominante | "")
                      }
                      disabled={busy}
                    >
                      <option value="">— Sin especificar —</option>
                      {(
                        Object.keys(MANO_DOMINANTE_LABELS) as ManoDominante[]
                      ).map((m) => (
                        <option key={m} value={m}>
                          {MANO_DOMINANTE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="coaching-field">
                    <span>Posición en cancha</span>
                    <select
                      value={coachEnCancha}
                      onChange={(e) =>
                        setCoachEnCancha(e.target.value as EnCancha | "")
                      }
                      disabled={busy}
                    >
                      <option value="">— Sin especificar —</option>
                      {EN_CANCHA_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {EN_CANCHA_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset className="coaching-chips" disabled={busy}>
                  <legend>Fuerzas que entrena *</legend>
                  <div className="coaching-chips__row">
                    {COACH_FUERZAS_ORDER.map((f) => {
                      const on = coachFuerzas.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          className={`coaching-chip${on ? " is-on" : ""}`}
                          onClick={() =>
                            setCoachFuerzas((prev) => toggleInList(prev, f))
                          }
                        >
                          {JUGADOR_CATEGORIA_LABELS[f]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="coaching-chips" disabled={busy}>
                  <legend>Especialidades</legend>
                  <div className="coaching-chips__row">
                    {COACH_ESPECIALIDADES_ORDER.map((esp) => {
                      const on = coachEspecialidades.includes(esp);
                      return (
                        <button
                          key={esp}
                          type="button"
                          className={`coaching-chip${on ? " is-on" : ""}`}
                          onClick={() =>
                            setCoachEspecialidades((prev) =>
                              toggleInList(prev, esp)
                            )
                          }
                        >
                          {esp}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="coaching-modal-footer">
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--ghost"
                    onClick={() => {
                      setIsCoachModalOpen(false);
                      resetCoachForm();
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="coaching-btn coaching-btn--primary"
                    disabled={busy || !coachNombre.trim()}
                  >
                    {busy ? "Guardando…" : "Registrar e invitar coach"}
                  </button>
                </div>
              </form>
            )}
          </Modal>
        </section>
        )
      ) : null}

      {!loading && tab === "jugadores" ? (
        <section className="coaching-panel" aria-label="Jugadores">
          <div className="coaching-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 className="coaching-section-title">Alumnos vinculados</h2>
              <p className="coaching-section-desc">
                Jugadores asociados a tus entrenadores con control de clases y seguimiento deportivo.
              </p>
            </div>
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              onClick={() => setIsAddStudentModalOpen(true)}
            >
              <TablerIcon name="user-plus" size={16} />
              Agregar alumno
            </button>
          </div>

          <div
            className="coaching-panel"
            style={{
              padding: "1rem 1.25rem",
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              borderRadius: "10px",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <span
              style={{
                color: "var(--ro-brand, #38bdf8)",
                flexShrink: 0,
                marginTop: "2px",
                display: "inline-flex",
              }}
            >
              <TablerIcon name="info-circle" size={20} />
            </span>
            <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
              <strong
                style={{
                  color: "#fff",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                Gestión y control de clases de la academia
              </strong>
              Como administrador del club, tú registras y asignas alumnos a tus entrenadores mediante su <strong>Riviera ID</strong> oficial. Desde este panel autorizas paquetes de clases disponibles, mientras los coaches se encargan exclusivamente de impartir las clases y registrar su seguimiento deportivo.
            </div>
          </div>

          {(snapshot?.links ?? []).length === 0 ? (
            <div className="coaching-empty-card">
              <TablerIcon name="users" size={44} className="coaching-empty-icon" />
              <h3>Sin alumnos vinculados en la academia</h3>
              <p>
                Agrega y asigna alumnos a tus entrenadores activos mediante su Riviera ID oficial para comenzar a gestionar sus paquetes de clases.
              </p>
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                style={{ marginTop: "1rem" }}
                onClick={() => setIsAddStudentModalOpen(true)}
              >
                <TablerIcon name="user-plus" size={16} />
                Agregar primer alumno
              </button>
            </div>
          ) : (
            <div className="coaching-grid">
              {(snapshot?.links ?? []).map((l) => (
                <article key={l.id} className="coaching-card">
                  <div className="coaching-card__top">
                    <div className="coaching-card__avatar" aria-hidden>
                      {l.jugadorNombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="coaching-card__identity">
                      <h3 className="coaching-card__title">
                        {l.jugadorNombre}
                      </h3>
                      <span className="coaching-card__code">{l.rivieraId}</span>
                      <div className="coaching-card__meta">
                        <span className="coaching-card__meta-item">
                          Coach: {l.coachNombre}
                        </span>
                        {l.isPrimary ? (
                          <span className="coaching-badge coaching-badge--primary">
                            Primario
                          </span>
                        ) : null}
                      </div>

                      {/* Saldo de clases disponibles */}
                      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                        <span className="coaching-badge coaching-badge--primary" style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <TablerIcon name="calendar-event" size={13} />
                          {l.balanceClasses ?? 0} clases disponibles
                        </span>
                        {(l.totalClassesGiven ?? 0) > 0 ? (
                          <span className="coaching-badge" style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--ro-text-muted)" }}>
                            {l.totalClassesGiven} impartidas
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`coaching-badge coaching-badge--${l.status.toLowerCase()}`}
                    >
                      {l.status === "ACTIVE"
                        ? "Activo"
                        : l.status === "PAUSED"
                        ? "En pausa"
                        : "Terminado"}
                    </span>
                  </div>

                  <div className="coaching-card__actions">
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--primary"
                      disabled={busy || l.status !== "ACTIVE"}
                      onClick={() => {
                        setAssigningLink(l);
                        setClassCountInput(10);
                        setClassNotesInput("");
                        setAssignIdempotencyKey(generateCoachingIdempotencyKey("assign"));
                      }}
                    >
                      <TablerIcon name="plus" size={14} />
                      Asignar clases
                    </button>
                    {l.status !== "ACTIVE" ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        disabled={busy}
                        onClick={() => void handleStatus(l.id, "ACTIVE")}
                      >
                        <TablerIcon name="play" size={14} />
                        Activar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        disabled={busy}
                        onClick={() => void handleStatus(l.id, "PAUSED")}
                      >
                        <TablerIcon name="player-pause" size={14} />
                        Pausar
                      </button>
                    )}
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--secondary"
                      disabled={busy}
                      onClick={() => setReassigningLink(l)}
                      title="Cambiar a otro entrenador del club"
                    >
                      <TablerIcon name="arrows-exchange" size={14} />
                      Cambiar entrenador
                    </button>
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--secondary"
                      disabled={busy}
                      onClick={() => {
                        setAdjustingBalance({
                          coachId: l.coachId,
                          coachNombre: l.coachNombre,
                          studentId: l.jugadorId,
                          studentNombre: l.jugadorNombre,
                          rivieraId: l.rivieraId,
                          currentBalance: l.balanceClasses ?? 0,
                          referenceLedgerId: null,
                        });
                      }}
                      title="Corregir o ajustar saldo de clases"
                    >
                      <TablerIcon name="adjustments" size={14} />
                      Corregir saldo
                    </button>
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--ghost"
                      disabled={busy}
                      onClick={() => void handleStatus(l.id, "ENDED")}
                    >
                      <TablerIcon name="x" size={14} />
                      Terminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Historial de Movimientos de Clases del Club */}
          <div style={{ marginTop: "2.5rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Historial de Clases y Movimientos
            </h3>
            <p className="coaching-muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
              Registro inmutable de asignaciones y deducciones de clases realizadas en tu club.
            </p>

            {loadingLedger ? (
              <p className="coaching-muted">Cargando historial…</p>
            ) : ledgerError ? (
              <div
                className="coaching-panel"
                style={{
                  padding: "0.75rem 1rem",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: "8px",
                  color: "#fca5a5",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <TablerIcon name="alert-circle" size={18} />
                  <span>{ledgerError}</span>
                </div>
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                  onClick={() => organizadorId && void loadLedger(organizadorId)}
                >
                  Reintentar
                </button>
              </div>
            ) : ledgerEntries.length === 0 ? (
              <p className="coaching-muted">Aún no hay movimientos de clases registrados en el club.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "var(--ro-text-muted)" }}>
                      <th style={{ padding: "0.6rem 0.75rem" }}>Fecha</th>
                      <th style={{ padding: "0.6rem 0.75rem" }}>Alumno</th>
                      <th style={{ padding: "0.6rem 0.75rem" }}>Coach</th>
                      <th style={{ padding: "0.6rem 0.75rem" }}>Movimiento</th>
                      <th style={{ padding: "0.6rem 0.75rem" }}>Notas / Referencia</th>
                      <th style={{ padding: "0.6rem 0.75rem" }}>Responsable</th>
                      <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => {
                      const renderMovementBadge = () => {
                        switch (entry.tipo as string) {
                          case "PACKAGE_CREDIT":
                          case "ASSIGN":
                            return (
                              <span
                                className="coaching-badge coaching-badge--active"
                                style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                              >
                                <TablerIcon name="plus" size={13} />
                                +{entry.delta} Clases asignadas
                              </span>
                            );
                          case "CLASS_DEBIT":
                            return (
                              <span
                                className="coaching-badge coaching-badge--primary"
                                style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                              >
                                <TablerIcon name="check" size={13} />
                                {entry.delta} Clase impartida
                              </span>
                            );
                          case "TRANSFER_OUT":
                            return (
                              <span
                                className="coaching-badge"
                                style={{
                                  background: "rgba(245, 158, 11, 0.15)",
                                  color: "#f59e0b",
                                  border: "1px solid rgba(245, 158, 11, 0.35)",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                              >
                                <TablerIcon name="arrow-right" size={13} />
                                {entry.delta} Clases transferidas
                              </span>
                            );
                          case "TRANSFER_IN":
                            return (
                              <span
                                className="coaching-badge"
                                style={{
                                  background: "rgba(6, 182, 212, 0.15)",
                                  color: "#22d3ee",
                                  border: "1px solid rgba(6, 182, 212, 0.35)",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                              >
                                <TablerIcon name="arrow-left" size={13} />
                                +{entry.delta} Clases recibidas
                              </span>
                            );
                          case "ADJUSTMENT":
                            return (
                              <span
                                className="coaching-badge"
                                style={{
                                  background: "rgba(148, 163, 184, 0.15)",
                                  color: "#cbd5e1",
                                  border: "1px solid rgba(148, 163, 184, 0.35)",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                              >
                                <TablerIcon name="adjustments" size={13} />
                                {entry.delta > 0 ? `+${entry.delta}` : entry.delta} Ajuste
                              </span>
                            );
                          default:
                            return (
                              <span
                                className={`coaching-badge ${entry.delta > 0 ? "coaching-badge--active" : "coaching-badge--primary"}`}
                                style={{ fontWeight: 600 }}
                              >
                                {entry.delta > 0 ? `+${entry.delta}` : entry.delta} {entry.tipo}
                              </span>
                            );
                        }
                      };

                      return (
                        <tr key={entry.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                            {new Date(entry.createdAt).toLocaleDateString()} {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", fontWeight: 500 }}>
                            {entry.jugadorNombre || "Alumno"}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem" }}>
                            {entry.coachNombre || "Coach"}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem" }}>
                            {renderMovementBadge()}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", color: "var(--ro-text-muted)" }}>
                            {entry.notas || "—"}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.8rem", color: "var(--ro-text-muted)" }}>
                            {entry.tipo === "CLASS_DEBIT" ? "Coach" : "Club"}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" }}>
                            {(entry.tipo === "PACKAGE_CREDIT" ||
                              entry.tipo === "ADJUSTMENT") && (
                              <button
                                type="button"
                                className="coaching-btn coaching-btn--secondary"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.55rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                                onClick={() => {
                                  const link = snapshot?.links.find(
                                    (l) => l.jugadorId === entry.jugadorId && l.coachId === entry.coachId
                                  );
                                  setAdjustingBalance({
                                    coachId: entry.coachId,
                                    coachNombre: entry.coachNombre || "Coach",
                                    studentId: entry.jugadorId,
                                    studentNombre: entry.jugadorNombre || "Alumno",
                                    rivieraId: link?.rivieraId,
                                    currentBalance: link?.balanceClasses ?? 0,
                                    referenceLedgerId: entry.id,
                                  });
                                }}
                                title="Corregir saldo de clases para este alumno"
                              >
                                <TablerIcon name="adjustments" size={13} />
                                Corregir
                              </button>
                            )}
                            {entry.tipo === "CLASS_DEBIT" && (
                              <button
                                type="button"
                                className="coaching-btn"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.55rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  background: "rgba(245, 158, 11, 0.15)",
                                  color: "#fbbf24",
                                  border: "1px solid rgba(245, 158, 11, 0.35)",
                                }}
                                onClick={() => {
                                  if (entry.sessionId) {
                                    setRevertingSession({
                                      id: entry.sessionId,
                                      startsAt: entry.createdAt,
                                      jugadorNombre: entry.jugadorNombre,
                                      coachNombre: entry.coachNombre,
                                      durationMinutes: 60,
                                      focus: entry.notas || "Clase impartida",
                                    });
                                  } else {
                                    const link = snapshot?.links.find(
                                      (l) => l.jugadorId === entry.jugadorId && l.coachId === entry.coachId
                                    );
                                    setAdjustingBalance({
                                      coachId: entry.coachId,
                                      coachNombre: entry.coachNombre || "Coach",
                                      studentId: entry.jugadorId,
                                      studentNombre: entry.jugadorNombre || "Alumno",
                                      rivieraId: link?.rivieraId,
                                      currentBalance: link?.balanceClasses ?? 0,
                                      referenceLedgerId: entry.id,
                                    });
                                  }
                                }}
                                title="Revertir clase impartida por error (+1 clase)"
                              >
                                <TablerIcon name="rotate-2" size={13} />
                                Revertir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {!loading && tab === "agenda" ? (
        <section className="coaching-panel" aria-label="Agenda">
          {/* Header de la Agenda */}
          <div
            className="coaching-section-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <h2 className="coaching-section-title">Agenda Real de Coaching</h2>
              <p className="coaching-section-desc">
                Programación de clases, asignación de canchas y control operativo en {clubName || "el club"}.
              </p>
            </div>
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              onClick={() => setIsScheduleModalOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <TablerIcon name="calendar-plus" size={16} />
              Agendar Clase
            </button>
          </div>

          {/* Filtros de la Agenda */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "1.25rem",
              padding: "0.75rem 1rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <TablerIcon name="filter" size={16} style={{ color: "var(--ro-text-muted)" }} />
              <span style={{ fontSize: "0.82rem", color: "var(--ro-text-muted)" }}>Filtrar:</span>
            </div>

            {/* Selector de Coach */}
            <select
              className="coaching-input"
              style={{ width: "auto", minWidth: "180px", padding: "0.35rem 0.6rem", fontSize: "0.82rem" }}
              value={agendaCoachFilter}
              onChange={(e) => setAgendaCoachFilter(e.target.value)}
            >
              <option value="ALL">Todos los entrenadores</option>
              {(snapshot?.coaches ?? [])
                .filter((c) => c.membershipStatus === "ACTIVE")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.coachCode ? `(${c.coachCode})` : ""}
                  </option>
                ))}
            </select>

            {/* Selector de Estado */}
            <select
              className="coaching-input"
              style={{ width: "auto", minWidth: "150px", padding: "0.35rem 0.6rem", fontSize: "0.82rem" }}
              value={agendaStatusFilter}
              onChange={(e) => setAgendaStatusFilter(e.target.value)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="SCHEDULED">Agendadas (Pendientes)</option>
              <option value="COMPLETED">Impartidas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>

            <button
              type="button"
              className="coaching-btn coaching-btn--ghost"
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
              onClick={() => void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter)}
              disabled={agendaLoading}
            >
              <TablerIcon name="refresh" size={14} className={agendaLoading ? "spin" : ""} />
              Actualizar
            </button>
          </div>

          {/* Contenido de la Agenda */}
          {agendaLoading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--ro-text-muted)" }}>
              <TablerIcon name="loader" size={28} className="spin" />
              <p style={{ marginTop: "0.75rem", fontSize: "0.88rem" }}>Cargando agenda de clases...</p>
            </div>
          ) : agendaError ? (
            <div
              style={{
                padding: "1rem",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "10px",
                color: "#fca5a5",
                fontSize: "0.88rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{agendaError}</span>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter)}
              >
                Reintentar
              </button>
            </div>
          ) : agendaSessions.length === 0 ? (
            <div className="coaching-empty-card">
              <TablerIcon name="calendar-event" size={44} className="coaching-empty-icon" />
              <h3>No hay clases registradas con los filtros actuales</h3>
              <p>Programa la primera clase entre un entrenador activo y sus alumnos para administrar la agenda de tu academia.</p>
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                style={{ marginTop: "1rem" }}
                onClick={() => setIsScheduleModalOpen(true)}
              >
                <TablerIcon name="calendar-plus" size={16} />
                Agendar Primera Clase
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {agendaSessions.map((session) => {
                const isScheduled = session.status === "SCHEDULED";
                const isCompleted = session.status === "COMPLETED";
                const isCancelled = session.status === "CANCELLED";

                const formattedDateTime = (() => {
                  try {
                    return new Date(session.startsAt).toLocaleString("es-MX", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  } catch {
                    return session.startsAt;
                  }
                })();

                return (
                  <div
                    key={session.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.025)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "1rem 1.25rem",
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "1rem",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    {/* Izquierda: Info de horario, coach, alumno */}
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                      <div
                        style={{
                          background: isScheduled
                            ? "rgba(16, 185, 129, 0.1)"
                            : isCompleted
                            ? "rgba(59, 130, 246, 0.1)"
                            : "rgba(239, 68, 68, 0.1)",
                          border: `1px solid ${
                            isScheduled
                              ? "rgba(16, 185, 129, 0.3)"
                              : isCompleted
                              ? "rgba(59, 130, 246, 0.3)"
                              : "rgba(239, 68, 68, 0.3)"
                          }`,
                          borderRadius: "10px",
                          padding: "0.6rem 0.85rem",
                          textAlign: "center",
                          minWidth: "110px",
                        }}
                      >
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ro-text-main, #f8fafc)" }}>
                          {formattedDateTime}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", marginTop: "2px" }}>
                          {session.durationMinutes} min {session.court ? `• ${session.court}` : ""}
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--ro-text-main, #f8fafc)" }}>
                            {session.jugadorNombre || "Alumno"}
                          </span>
                          {session.rivieraId && (
                            <span style={{ fontSize: "0.75rem", color: "var(--ro-primary, #10b981)", fontFamily: "monospace" }}>
                              {session.rivieraId}
                            </span>
                          )}
                          <span style={{ fontSize: "0.78rem", color: "var(--ro-text-muted)" }}>
                            con <strong>{session.coachNombre || "Coach"}</strong>
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                          {session.focus && (
                            <span style={{ fontSize: "0.78rem", color: "var(--ro-brand, #38bdf8)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                              <TablerIcon name="target" size={13} />
                              {session.focus}
                            </span>
                          )}
                          {isCancelled && session.cancellationReason && (
                            <span style={{ fontSize: "0.75rem", color: "#fca5a5" }}>
                              Motivo: {session.cancellationReason}
                            </span>
                          )}
                          {session.balanceClasses !== undefined && isScheduled && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                                background: session.balanceClasses > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                color: session.balanceClasses > 0 ? "#34d399" : "#fbbf24",
                                fontWeight: 600,
                              }}
                            >
                              {session.balanceClasses} clases disp.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Derecha: Badge de estado y Acciones */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <span
                        className="coaching-badge"
                        style={{
                          background: isScheduled
                            ? "rgba(16, 185, 129, 0.15)"
                            : isCompleted
                            ? "rgba(59, 130, 246, 0.15)"
                            : "rgba(239, 68, 68, 0.15)",
                          color: isScheduled ? "#34d399" : isCompleted ? "#60a5fa" : "#fca5a5",
                          border: `1px solid ${
                            isScheduled
                              ? "rgba(16, 185, 129, 0.35)"
                              : isCompleted
                              ? "rgba(59, 130, 246, 0.35)"
                              : "rgba(239, 68, 68, 0.35)"
                          }`,
                          fontWeight: 600,
                        }}
                      >
                        {isScheduled ? "Agendada" : isCompleted ? "Impartida" : "Cancelada"}
                      </span>

                      {isScheduled && (
                        <>
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--secondary"
                            style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
                            onClick={() => setReschedulingSession(session)}
                          >
                            <TablerIcon name="calendar" size={13} />
                            Reprogramar
                          </button>
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--ghost"
                            style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem", color: "#f87171" }}
                            onClick={() => setCancellingSession(session)}
                          >
                            <TablerIcon name="calendar-x" size={13} />
                            Cancelar
                          </button>
                        </>
                      )}

                      {isCompleted && !session.revertedAt && (
                        <button
                          type="button"
                          className="coaching-btn"
                          style={{
                            fontSize: "0.78rem",
                            padding: "0.3rem 0.6rem",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#fbbf24",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                          }}
                          onClick={() => {
                            setRevertingSession({
                              id: session.id,
                              startsAt: session.startsAt,
                              jugadorNombre: session.jugadorNombre,
                              coachNombre: session.coachNombre,
                              durationMinutes: session.durationMinutes,
                              focus: session.focus,
                            });
                          }}
                        >
                          <TablerIcon name="rotate-2" size={13} />
                          Revertir
                        </button>
                      )}

                      {isCompleted && session.revertedAt && (
                        <span style={{ fontSize: "0.75rem", color: "var(--ro-text-muted)" }}>
                          Revertida
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* Modal de Asignación de Clases */}
      <Modal
        open={Boolean(assigningLink)}
        onClose={() => setAssigningLink(null)}
        title={assigningLink ? `Asignar clases a ${assigningLink.jugadorNombre}` : ""}
      >
        {assigningLink ? (
          <form onSubmit={handleAssignClasses} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p className="coaching-muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              Coach responsable: <strong>{assigningLink.coachNombre}</strong> · Riviera ID: <strong>{assigningLink.rivieraId}</strong>
            </p>
            <p className="coaching-muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              Saldo disponible actual: <strong>{assigningLink.balanceClasses ?? 0} clases</strong>
            </p>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Cantidad de clases a agregar *</span>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="coaching-input"
                  style={{ width: "100px" }}
                  value={classCountInput}
                  onChange={(e) => setClassCountInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                />
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  onClick={() => setClassCountInput(5)}
                >
                  +5
                </button>
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  onClick={() => setClassCountInput(10)}
                >
                  +10
                </button>
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  onClick={() => setClassCountInput(20)}
                >
                  +20
                </button>
              </div>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Notas de asignación (opcional)</span>
              <input
                type="text"
                className="coaching-input"
                placeholder="Ej. Paquete 10 clases individuales"
                value={classNotesInput}
                onChange={(e) => setClassNotesInput(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="coaching-btn coaching-btn--ghost"
                onClick={() => setAssigningLink(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="coaching-btn coaching-btn--primary"
                disabled={busy || classCountInput <= 0}
              >
                <TablerIcon name="check" size={16} />
                {busy ? "Asignando…" : `Confirmar (+${classCountInput} clases)`}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal: Credenciales Generadas para Nuevo Coach */}
      <Modal
        open={Boolean(createdCoachCredentials)}
        onClose={() => setCreatedCoachCredentials(null)}
        title="Credenciales de acceso para el entrenador"
        size="md"
      >
        {createdCoachCredentials && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                borderRadius: "8px",
                padding: "1rem",
                color: "#6ee7b7",
                fontSize: "0.88rem",
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                <TablerIcon name="shield-check" size={18} />
                <span>¡Cuenta creada con éxito!</span>
              </div>
              <p style={{ margin: 0 }}>
                Comparte estas credenciales con tu entrenador. <strong>Esta contraseña solo se mostrará una vez.</strong>
              </p>
            </div>

            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--ro-text-muted)", letterSpacing: "0.05em" }}>
                  Nombre del Coach
                </span>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ro-text-main)" }}>
                  {createdCoachCredentials.nombre}{" "}
                  <span style={{ color: "#38bdf8", fontSize: "0.85rem", fontFamily: "monospace" }}>
                    ({createdCoachCredentials.coachCode})
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--ro-text-muted)", letterSpacing: "0.05em" }}>
                  Correo electrónico de acceso
                </span>
                <div style={{ fontSize: "0.95rem", fontFamily: "monospace", color: "var(--ro-text-main)" }}>
                  {createdCoachCredentials.email}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--ro-text-muted)", letterSpacing: "0.05em" }}>
                  Contraseña definitiva asignada
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(0, 0, 0, 0.35)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "6px",
                    marginTop: "0.25rem",
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.05em", color: "#38bdf8" }}>
                    {createdCoachCredentials.password}
                  </span>
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => {
                      navigator.clipboard.writeText(createdCoachCredentials.password);
                      setCopiedPassword(true);
                      setTimeout(() => setCopiedPassword(false), 2000);
                    }}
                  >
                    <TablerIcon name={copiedPassword ? "check" : "copy"} size={14} />
                    {copiedPassword ? "Copiada" : "Copiar"}
                  </button>
                </div>
              </div>

              {createdCoachCredentials.verificationUrl && (
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--ro-text-muted)", letterSpacing: "0.05em" }}>
                    Enlace de activación rápida (acceso directo)
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "rgba(0, 0, 0, 0.35)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "6px",
                      marginTop: "0.25rem",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                        color: "#38bdf8",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                      title={createdCoachCredentials.verificationUrl}
                    >
                      {createdCoachCredentials.verificationUrl}
                    </span>
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--secondary"
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", flexShrink: 0 }}
                      onClick={() => {
                        navigator.clipboard.writeText(createdCoachCredentials.verificationUrl!);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                    >
                      <TablerIcon name={copiedLink ? "check" : "copy"} size={14} />
                      {copiedLink ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => {
                  const text = `Credenciales de Riviera Coaching:\nNombre: ${createdCoachCredentials.nombre}\nCódigo: ${createdCoachCredentials.coachCode}\nEmail: ${createdCoachCredentials.email}\nContraseña: ${createdCoachCredentials.password}\nAcceso: https://appriviera.rivieraopen.com/coaching/mi-espacio${createdCoachCredentials.verificationUrl ? `\nEnlace directo: ${createdCoachCredentials.verificationUrl}` : ""}`;
                  navigator.clipboard.writeText(text);
                  setCopiedAll(true);
                  setTimeout(() => setCopiedAll(false), 2000);
                }}
              >
                <TablerIcon name={copiedAll ? "check" : "copy"} size={16} />
                {copiedAll ? "¡Credenciales copiadas!" : "Copiar credenciales completas"}
              </button>

              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => setCreatedCoachCredentials(null)}
              >
                <TablerIcon name="check" size={16} />
                Entendido, ya guardé las credenciales
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Confirmación de Eliminación Atómica de Coach */}
      <Modal
        open={Boolean(coachToRemove)}
        onClose={() => {
          setCoachToRemove(null);
          setRemovalReasonInput("");
        }}
        title="Eliminar coach de mi club"
        size="md"
      >
        {coachToRemove && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                borderRadius: "8px",
                padding: "1rem",
                color: "#fca5a5",
                fontSize: "0.88rem",
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                <TablerIcon name="alert-triangle" size={18} />
                <span>Atención: Desvinculación de {coachToRemove.nombre} ({coachToRemove.coachCode})</span>
              </div>
              <p style={{ margin: 0 }}>
                Esta acción desvinculará permanentemente al entrenador de tu club y suspenderá las relaciones activas de alumnos en este club.
              </p>
              <p style={{ margin: "0.5rem 0 0", color: "#fecaca" }}>
                <strong>Se conservará íntegramente</strong> todo el historial de clases impartidas, sesiones y movimientos para efectos de auditoría y balance. Su cuenta global como coach no será eliminada.
              </p>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Motivo de la eliminación (opcional):
              </label>
              <input
                type="text"
                className="coaching-input"
                placeholder="Ej: Fin de ciclo laboral, acuerdo mutuo..."
                value={removalReasonInput}
                onChange={(e) => setRemovalReasonInput(e.target.value)}
                disabled={busy}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => {
                  setCoachToRemove(null);
                  setRemovalReasonInput("");
                }}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="coaching-btn coaching-btn--danger"
                style={{ background: "#dc2626", borderColor: "#ef4444", color: "#ffffff" }}
                onClick={handleConfirmRemoveCoach}
                disabled={busy}
              >
                <TablerIcon name="trash" size={16} />
                {busy ? "Eliminando…" : "Eliminar coach de mi club"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Confirmación de Eliminación Definitiva de Coach (desde REMOVED) */}
      <Modal
        open={Boolean(coachToFinalizeRemoval)}
        onClose={() => setCoachToFinalizeRemoval(null)}
        title="Eliminar definitivamente del club"
        size="md"
      >
        {coachToFinalizeRemoval && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                borderRadius: "8px",
                padding: "1rem",
                color: "#fca5a5",
                fontSize: "0.88rem",
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                <TablerIcon name="alert-triangle" size={18} />
                <span>Borrado definitivo de {coachToFinalizeRemoval.nombre} ({coachToFinalizeRemoval.coachCode})</span>
              </div>
              <p style={{ margin: 0 }}>
                ¿Estás seguro de que deseas borrar definitivamente a este entrenador de la lista de tu club?
              </p>
              <p style={{ margin: "0.5rem 0 0", color: "#fecaca" }}>
                Esta acción lo retirará por completo del panel de tu club. <strong>Se conservará la bitácora de auditoría inmutable</strong> y todo registro deportivo previo.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => setCoachToFinalizeRemoval(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="coaching-btn coaching-btn--danger"
                style={{ background: "#dc2626", borderColor: "#ef4444", color: "#ffffff" }}
                onClick={handleConfirmFinalizeRemoval}
                disabled={busy}
              >
                <TablerIcon name="trash-x" size={16} />
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Asignar Alumno a Coach */}
      <AddStudentToCoachModal
        open={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        organizadorId={organizadorId}
        coaches={snapshot?.coaches ?? []}
        onSuccess={(studentName, coachName, classes) => {
          setSuccessMessage(
            `Alumno ${studentName} asignado a ${coachName} con ${classes} clases disponibles exitosamente.`
          );
          void refresh();
        }}
      />

      {/* Modal: Cambiar Entrenador del Alumno */}
      <ReassignCoachModal
        open={Boolean(reassigningLink)}
        onClose={() => setReassigningLink(null)}
        organizadorId={organizadorId}
        student={
          reassigningLink
            ? {
                id: reassigningLink.jugadorId,
                nombre: reassigningLink.jugadorNombre,
                rivieraId: reassigningLink.rivieraId,
              }
            : null
        }
        fromCoach={
          reassigningLink
            ? {
                id: reassigningLink.coachId,
                nombre: reassigningLink.coachNombre,
              }
            : null
        }
        balanceClasses={reassigningLink?.balanceClasses ?? 0}
        coaches={snapshot?.coaches ?? []}
        onSuccess={(studentName, toCoachName, transferredClasses) => {
          setSuccessMessage(
            `Se transfirió a ${studentName} con ${transferredClasses} clases a ${toCoachName} exitosamente.`
          );
          void refresh();
          if (organizadorId) void loadLedger(organizadorId);
        }}
      />

      {/* Modal: Ajuste Compensatorio de Saldo de Clases */}
      {adjustingBalance && (
        <AdjustClassBalanceModal
          open={Boolean(adjustingBalance)}
          onClose={() => setAdjustingBalance(null)}
          organizadorId={organizadorId}
          coachId={adjustingBalance.coachId}
          coachNombre={adjustingBalance.coachNombre}
          studentId={adjustingBalance.studentId}
          studentNombre={adjustingBalance.studentNombre}
          rivieraId={adjustingBalance.rivieraId}
          currentBalance={adjustingBalance.currentBalance}
          referenceLedgerId={adjustingBalance.referenceLedgerId}
          onSuccess={(newBalance, delta) => {
            setSuccessMessage(
              `Saldo ajustado exitosamente (${delta >= 0 ? `+${delta}` : delta} clases). Nuevo saldo: ${newBalance} clases.`
            );
            void refresh();
            if (organizadorId) void loadLedger(organizadorId);
          }}
        />
      )}

      {/* Modal: Revertir Clase Impartida */}
      {revertingSession && (
        <RevertClassSessionModal
          open={Boolean(revertingSession)}
          onClose={() => setRevertingSession(null)}
          organizadorId={organizadorId}
          session={revertingSession}
          onSuccess={(_sessionId, newBalance) => {
            setSuccessMessage(
              `Clase revertida y devuelta al saldo del alumno exitosamente.${
                newBalance !== undefined ? ` Nuevo saldo: ${newBalance} clases.` : ""
              }`
            );
            void refresh();
            if (organizadorId) {
              void loadLedger(organizadorId);
              void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter);
            }
          }}
        />
      )}

      {/* Modal: Agendar Clase */}
      <ScheduleClassModal
        open={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        organizadorId={organizadorId}
        coaches={snapshot?.coaches ?? []}
        onSuccess={(_sessionId) => {
          setSuccessMessage("Clase agendada exitosamente en el calendario.");
          void refresh();
          if (organizadorId) {
            void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter);
          }
        }}
      />

      {/* Modal: Reprogramar Clase */}
      {reschedulingSession && (
        <RescheduleClassModal
          open={Boolean(reschedulingSession)}
          onClose={() => setReschedulingSession(null)}
          organizadorId={organizadorId}
          session={reschedulingSession}
          onSuccess={(_sessionId) => {
            setSuccessMessage("Clase reprogramada exitosamente.");
            if (organizadorId) {
              void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter);
            }
          }}
        />
      )}

      {/* Modal: Cancelar Clase */}
      {cancellingSession && (
        <CancelClassModal
          open={Boolean(cancellingSession)}
          onClose={() => setCancellingSession(null)}
          organizadorId={organizadorId}
          session={cancellingSession}
          onSuccess={(_sessionId) => {
            setSuccessMessage("Clase cancelada exitosamente.");
            if (organizadorId) {
              void loadAgenda(organizadorId, agendaCoachFilter, agendaStatusFilter);
            }
          }}
        />
      )}
    </div>
  );
};
