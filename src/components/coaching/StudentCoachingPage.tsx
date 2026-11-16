import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchStudentCoachingOverview,
  fetchStudentTrainingTimeline,
  fetchCoachPublicProfile,
  linkStudentAccountByRivieraId,
  updateStudentCoachingProfile,
  type StudentCoachingOverview,
  type StudentSelfProfile,
  type UpdateStudentProfileInput,
} from "../../lib/coaching/coachingApi";
import { EN_CANCHA_LABELS } from "../../lib/rivieraJugadores/constants";
import { getRedesPublicas } from "../../lib/rivieraJugadores/jugadorRedes";
import { uploadJugadorAvatarCroppedFileWithinLimit } from "../../lib/rivieraJugadores/uploadAvatar";
import { JugadorAvatarCropModal } from "../jugadores/JugadorAvatarCropModal";
import { StudentProfileCard } from "./StudentProfileCard";
import type { CoachProfessionalProfile, StudentTrainingSession } from "../../lib/coaching/types";
import { StudentTrainingSection } from "./StudentTrainingSection";
import { CoachPublicDetails, coachHasPublicStory } from "./CoachPublicStory";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import {
  navigatePublicJugadorByRivieraId,
  openPublicJugadorByRivieraIdInNewWindow,
} from "../jugadores/jugadoresPublicNav";
import { navigateCoaching, navigateStudentAccess } from "./coachingNav";
import { groupTrainingSessionsByRelationship } from "../../lib/coaching/studentTrainingScope";
import { parsePrepFocusTopics } from "../../lib/coaching/prepFocusTopics";
import "./coaching.css";

function getInitials(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return "RV";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const StudentCoachingPage: React.FC = () => {
  const {
    user,
    userProfile,
    isStudentOnly,
    isCoachOnly,
    loading: userLoading,
  } = useUser();
  const [overview, setOverview] = useState<StudentCoachingOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Formulario para vincular Riviera ID en caso de perfil no enlazado
  const [manualRivieraId, setManualRivieraId] = useState("");
  const [linking, setLinking] = useState(false);
  const [copiedRivieraId, setCopiedRivieraId] = useState(false);
  const [training, setTraining] = useState<StudentTrainingSession[]>([]);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  // Perfil propio del alumno (foto + datos editables)
  const [profileOverride, setProfileOverride] =
    useState<StudentSelfProfile | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [coachPublic, setCoachPublic] = useState<
    (CoachProfessionalProfile & { id: string; nombre: string; coachCode: string }) | null
  >(null);
  const [openCoachId, setOpenCoachId] = useState<string | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  const assignedCoachId =
    overview?.relationships?.find((rel) => rel.isPrimary)?.coach?.id ||
    overview?.relationships?.[0]?.coach?.id ||
    null;

  useEffect(() => {
    if (!assignedCoachId) {
      setCoachPublic(null);
      return;
    }
    let cancelled = false;
    fetchCoachPublicProfile(assignedCoachId)
      .then((profile) => {
        if (!cancelled) setCoachPublic(profile);
      })
      .catch(() => {
        if (!cancelled) setCoachPublic(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedCoachId]);

  const handleSaveProfile = useCallback(
    async (input: UpdateStudentProfileInput) => {
      const updated = await updateStudentCoachingProfile(input);
      setProfileOverride(updated);
      setActionSuccess("Perfil actualizado.");
    },
    [],
  );

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Selecciona un archivo de imagen (JPG, PNG o WebP).");
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
  };

  const sessionsByRelationship = useMemo(() => {
    const rels = overview?.relationships ?? [];
    return groupTrainingSessionsByRelationship(
      training,
      rels.map((rel) => ({
        relationshipId: rel.relationshipId,
        organizadorId: rel.club.organizadorId,
      }))
    );
  }, [overview, training]);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTrainingError(null);
    try {
      const [res, timeline] = await Promise.all([
        fetchStudentCoachingOverview(),
        fetchStudentTrainingTimeline().catch((err: unknown) => {
          setTrainingError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar tu seguimiento.",
          );
          return [] as StudentTrainingSession[];
        }),
      ]);
      setTraining(timeline);
      setOverview(res);

      // Si el usuario es administrador de club y no tiene perfil legítimo de alumno vinculado,
      // redirigirlo de inmediato a su panel de administración de Riviera Coaching
      if (res && res.linked === false && !isStudentOnly && !isCoachOnly) {
        navigateCoaching("/coaching");
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar la información de Mi Coaching.",
      );
    } finally {
      setLoading(false);
    }
  }, [user, isStudentOnly, isCoachOnly]);

  useEffect(() => {
    if (!userLoading) {
      loadData();
    }
  }, [userLoading, loadData]);

  const handleCopyRivieraId = (rivieraId: string) => {
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(rivieraId);
    }
    setCopiedRivieraId(true);
    setTimeout(() => setCopiedRivieraId(false), 2200);
  };

  const handleManualLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRivieraId.trim()) return;
    setLinking(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await linkStudentAccountByRivieraId(manualRivieraId.trim());
      setActionSuccess(
        `¡Identidad vinculada exitosamente a ${res.nombre || "tu perfil"} (${res.rivieraId})!`,
      );
      setManualRivieraId("");
      await loadData();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al vincular tu Riviera ID",
      );
    } finally {
      setLinking(false);
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const formatWhen = (isoString: string) => {
    if (!isoString) return { date: "", time: "" };
    try {
      const d = new Date(isoString);
      return {
        date: d.toLocaleDateString("es-MX", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        time: d.toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    } catch {
      return { date: isoString, time: "" };
    }
  };

  const handleBack = () => {
    if (overview?.rivieraId) {
      navigatePublicJugadorByRivieraId(overview.rivieraId);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigateToAppHome();
    }
  };

  // 1. Estado de carga
  if (userLoading || loading) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <div className="coaching-student-hero__topbar">
            <button
              type="button"
              className="coaching-back"
              onClick={handleBack}
            >
              <TablerIcon name="arrow-left" size={16} />
              {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
            </button>
          </div>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
          <p className="coaching-muted">Cargando tu seguimiento deportivo…</p>
        </header>
      </div>
    );
  }

  // 2. Si no hay sesión autenticada
  if (!user) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <div className="coaching-student-hero__topbar">
            <button
              type="button"
              className="coaching-back"
              onClick={handleBack}
            >
              <TablerIcon name="arrow-left" size={16} />
              {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
            </button>
          </div>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
        </header>

        <div className="coaching-empty-card coaching-student-empty-card">
          <div className="coaching-student-empty-icon-wrap">
            <TablerIcon name="lock" size={26} />
          </div>
          <h3>Sesión requerida</h3>
          <p>
            Inicia sesión con tu cuenta oficial de Riviera para consultar tus
            clases disponibles, tu coach e historial de sesiones impartidas.
          </p>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={() => navigateStudentAccess()}
          >
            <TablerIcon name="login" size={16} />
            Iniciar sesión como alumno
          </button>
        </div>
      </div>
    );
  }

  // 3. Si hubo un error de carga
  if (error) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <div className="coaching-student-hero__topbar">
            <button
              type="button"
              className="coaching-back"
              onClick={handleBack}
            >
              <TablerIcon name="arrow-left" size={16} />
              {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
            </button>
          </div>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
        </header>

        <div className="coaching-error-banner" role="alert">
          <TablerIcon name="alert-triangle" size={20} />
          <div className="coaching-error-content">
            <p className="coaching-error-title">No pudimos cargar tus clases</p>
            <p className="coaching-error-desc">{error}</p>
          </div>
          <button
            type="button"
            className="coaching-btn coaching-btn--secondary"
            onClick={loadData}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // 3b. Si es una sesión de administrador sin perfil de alumno legítimo, mostrar redirección segura
  if (user && overview && !overview.linked && !isStudentOnly && !isCoachOnly) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <p className="coaching-kicker">
            Riviera Coaching • Panel de Administración
          </p>
          <h1 className="coaching-title">Mi Coaching</h1>
          <p className="coaching-lead">
            Has iniciado sesión como <strong>Administrador de Club</strong>. La
            sección de «Mi Coaching» está reservada para el seguimiento
            deportivo de alumnos.
          </p>
          <div className="coaching-student-admin-redirect">
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              onClick={() => navigateCoaching("/coaching")}
            >
              <TablerIcon name="arrow-left" size={16} />
              Ir al panel de administración de Coaching
            </button>
          </div>
        </header>
      </div>
    );
  }

  const relationships = overview?.relationships ?? [];
  const primaryRel =
    relationships.find((r) => r.isPrimary) || relationships[0];
  const primaryPlayer = primaryRel?.player;
  const effectiveRivieraId = overview?.rivieraId || primaryPlayer?.rivieraId;

  const metadataName =
    typeof user?.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";
  const metadataAvatar =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url.trim()
      : "";

  const studentProfile: StudentSelfProfile | null =
    profileOverride ??
    overview?.studentProfile ??
    (primaryPlayer?.id
      ? {
          id: primaryPlayer.id,
          nombre: primaryPlayer.nombre,
          fotoUrl: primaryPlayer.fotoUrl ?? null,
          rivieraId: primaryPlayer.rivieraId ?? null,
          edad: null,
          enCancha: null,
          instagramUrl: null,
          facebookUrl: null,
          tiktokUrl: null,
        }
      : null);

  const studentName =
    studentProfile?.nombre?.trim() ||
    primaryPlayer?.nombre?.trim() ||
    userProfile?.name?.trim() ||
    metadataName ||
    null;

  const studentPhotoUrl =
    studentProfile?.fotoUrl ||
    primaryPlayer?.fotoUrl ||
    userProfile?.avatar_url ||
    metadataAvatar ||
    null;

  const avatarInitials = getInitials(studentName || user?.email || "RV");

  const canEditProfile = Boolean(studentProfile?.id && user?.id);
  const posicionLabel =
    studentProfile?.enCancha &&
    studentProfile.enCancha in EN_CANCHA_LABELS
      ? EN_CANCHA_LABELS[studentProfile.enCancha as keyof typeof EN_CANCHA_LABELS]
      : null;
  const personalFacts = [
    studentProfile?.edad != null ? `${studentProfile.edad} años` : null,
    posicionLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const redes = getRedesPublicas({
    instagram_url: studentProfile?.instagramUrl ?? null,
    facebook_url: studentProfile?.facebookUrl ?? null,
    tiktok_url: studentProfile?.tiktokUrl ?? null,
  });
  const sobreMi = studentProfile?.sobreMi?.trim() || "";

  const handlePhotoConfirm = async (cropped: File) => {
    if (!user?.id || !studentProfile?.id) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const url = await uploadJugadorAvatarCroppedFileWithinLimit(
        user.id,
        studentProfile.id,
        cropped,
      );
      const updated = await updateStudentCoachingProfile({ fotoUrl: url });
      setProfileOverride(updated);
      setPhotoBroken(false);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar tu foto. Intenta de nuevo.",
      );
    } finally {
      setPhotoUploading(false);
      setPhotoFile(null);
    }
  };

  return (
    <div className="coaching-page coaching-student-page rv-page">
      {/* 1. ENCABEZADO PERSONALIZADO */}
      <header className="coaching-hero coaching-student-hero">
        {!effectiveRivieraId && (
          <div className="coaching-student-hero__topbar">
            <button type="button" className="coaching-back" onClick={handleBack}>
              <TablerIcon name="arrow-left" size={16} />
              Inicio
            </button>
          </div>
        )}

        <div className="coaching-student-hero__main">
          <div className="coaching-student-hero__identity">
            <div className="coaching-student-hero__portrait-wrap">
              <div className="coaching-student-hero__portrait-frame">
                {studentPhotoUrl && !photoBroken ? (
                  <img
                    src={studentPhotoUrl}
                    alt={studentName || "Alumno Riviera"}
                    className="coaching-student-hero__portrait-img"
                    onError={() => setPhotoBroken(true)}
                  />
                ) : (
                  <div
                    className="coaching-student-hero__portrait-fallback"
                    aria-hidden="true"
                  >
                    <span>{avatarInitials}</span>
                  </div>
                )}
              </div>
              {canEditProfile ? (
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="coaching-student-hero__photo-input"
                  data-testid="student-photo-input"
                  onChange={handlePhotoSelected}
                />
              ) : null}
            </div>

            <div className="coaching-student-hero__copy">
              <p className="coaching-student-hero__kicker">Mi Coaching</p>
              <h1 className="coaching-title coaching-student-hero__title">
                {studentName || "Jugador"}
              </h1>
              {personalFacts ? (
                <p className="coaching-student-hero__facts">{personalFacts}</p>
              ) : null}
              {primaryRel ? (
                <p className="coaching-student-hero__balance">
                  {primaryRel.balance?.balanceClasses ?? 0}{" "}
                  {(primaryRel.balance?.balanceClasses ?? 0) === 1
                    ? "clase disponible"
                    : "clases disponibles"}
                </p>
              ) : null}
              {effectiveRivieraId ? (
                <div className="coaching-student-badge-pill" title="Código oficial de jugador">
                  <strong className="coaching-student-badge-val">{effectiveRivieraId}</strong>
                  <button
                    type="button"
                    className="coaching-badge-copy-btn"
                    onClick={() => handleCopyRivieraId(effectiveRivieraId)}
                    aria-label={`Copiar ${effectiveRivieraId}`}
                    title={copiedRivieraId ? "Copiado" : "Copiar código"}
                  >
                    <TablerIcon name={copiedRivieraId ? "check" : "copy"} size={14} />
                  </button>
                </div>
              ) : null}
              <div className="coaching-student-hero__actions">
                {canEditProfile ? (
                  <button
                    type="button"
                    className="coaching-student-profile__edit"
                    onClick={() => setProfileEditorOpen(true)}
                  >
                    <TablerIcon name="pencil" size={14} />
                    Editar perfil
                  </button>
                ) : null}
                {canEditProfile ? (
                  <button
                    type="button"
                    className="coaching-student-hero__photo-btn"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading}
                  >
                    <TablerIcon name="camera" size={13} />
                    {photoUploading ? "Subiendo…" : "Cambiar foto"}
                  </button>
                ) : null}
                {effectiveRivieraId ? (
                  <button
                    type="button"
                    className="coaching-student-ranking-btn"
                    onClick={() => {
                      openPublicJugadorByRivieraIdInNewWindow(effectiveRivieraId);
                    }}
                  >
                    Ver mi Ficha de Ranking
                  </button>
                ) : null}
              </div>
              {redes.length > 0 ? (
                <p className="coaching-student-profile__chips">
                  {redes.map((red) => (
                    <a
                      key={red.id}
                      href={red.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="coaching-student-profile__chip"
                    >
                      {red.label}
                    </a>
                  ))}
                </p>
              ) : null}
              {sobreMi ? <p className="coaching-student-hero__about">{sobreMi}</p> : null}
            </div>
          </div>
        </div>
      </header>

      {photoError && (
        <p
          className="coaching-student-profile__error coaching-student-photo-error"
          role="alert"
        >
          {photoError}
        </p>
      )}

      <JugadorAvatarCropModal
        open={Boolean(photoFile)}
        file={photoFile}
        playerName={studentName || "Alumno"}
        onClose={() => setPhotoFile(null)}
        onConfirm={(f) => void handlePhotoConfirm(f)}
      />

      {actionSuccess && (
        <div className="coaching-alert coaching-alert--success" role="status">
          <TablerIcon name="check" size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="coaching-alert coaching-alert--error" role="alert">
          <TablerIcon name="alert-circle" size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {/* CASO A: Sin relaciones de coaching asignadas aún */}
      {relationships.length === 0 ? (
        <div className="coaching-student-empty-state">
          <div className="coaching-empty-card coaching-student-empty-card">
            <div className="coaching-student-empty-lead">
              <div className="coaching-student-empty-icon-wrap" aria-hidden="true">
                <TablerIcon name="ball-tennis" size={26} />
              </div>
              <div className="coaching-student-empty-copy">
                <h2 className="coaching-student-empty-title">
                  Tu evolución comienza aquí.
                </h2>
                <p className="coaching-student-empty-desc">
                  Cuando tu entrenador te vincule, encontrarás aquí tus clases,
                  avances y próximos objetivos.
                </p>
              </div>
            </div>

            {effectiveRivieraId ? (
              <div className="coaching-student-empty-actions">
                <button
                  type="button"
                  className="coaching-btn coaching-btn--primary coaching-student-copy-id-btn"
                  onClick={() => handleCopyRivieraId(effectiveRivieraId)}
                >
                  <TablerIcon
                    name={copiedRivieraId ? "check" : "copy"}
                    size={16}
                  />
                  {copiedRivieraId ? "RV ID COPIADO" : "COPIAR MI RV ID"}
                </button>
              </div>
            ) : (
              <div className="coaching-link-help-card">
                <p className="coaching-link-help-text">
                  Si ya tienes una credencial de Riviera pero tu cuenta de
                  acceso se registró con un correo distinto, ingresa tu código
                  oficial a continuación para enlazar tu historial deportivo:
                </p>
                <form
                  onSubmit={handleManualLink}
                  className="coaching-link-form"
                >
                  <input
                    type="text"
                    className="coaching-input"
                    placeholder="Ej. RIV-00000356"
                    value={manualRivieraId}
                    onChange={(e) => setManualRivieraId(e.target.value)}
                    disabled={linking}
                  />
                  <button
                    type="submit"
                    className="coaching-btn coaching-btn--primary"
                    disabled={linking || !manualRivieraId.trim()}
                  >
                    {linking ? "Vinculando…" : "Vincular mi perfil"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* CASO B: Con relaciones de coaching activas */
        <div className="coaching-student-dashboard">
          {relationships.map((rel) => {
            const coachName = rel.coach?.nombre ?? "Coach";
            const clubName = rel.club?.nombre ?? "Club Riviera";
            const clubSessions =
              sessionsByRelationship.get(rel.relationshipId) ?? [];
            const nextUpcoming = rel.upcomingSessions?.[0] ?? null;
            const fallbackNextScheduled = !nextUpcoming
              ? clubSessions.find((session) => session.nextScheduledAt)
                  ?.nextScheduledAt ?? null
              : null;
            const hasNextClass = Boolean(nextUpcoming || fallbackNextScheduled);
            const coachOpen = openCoachId === rel.relationshipId;
            const coachPhoto = coachPublic?.fotoUrl || rel.coach?.fotoUrl || "";
            const topics = nextUpcoming?.focus
              ? parsePrepFocusTopics(nextUpcoming.focus)
              : [];
            const when = nextUpcoming
              ? formatWhen(nextUpcoming.startsAt)
              : fallbackNextScheduled
                ? formatWhen(fallbackNextScheduled)
                : null;
            const coachRow = (
              <div className="student-coach-inline">
                <div className="coaching-student-avatar" aria-hidden="true">
                  {coachPhoto ? (
                    <img src={coachPhoto} alt="" className="coaching-student-avatar-img" />
                  ) : (
                    <span>{getInitials(coachName)}</span>
                  )}
                </div>
                <p className="student-coach-card__name">{coachName}</p>
                <button
                  type="button"
                  className="coaching-student-ranking-btn"
                  aria-expanded={coachOpen}
                  onClick={() =>
                    setOpenCoachId((current) =>
                      current === rel.relationshipId ? null : rel.relationshipId,
                    )
                  }
                >
                  {coachOpen ? "Ocultar perfil" : "Ver perfil"}
                </button>
              </div>
            );
            const coachStory = coachOpen ? (
              coachPublic && coachHasPublicStory(coachPublic) ? (
                <div className="student-coach-story">
                  {coachPublic.bio ? <p>{coachPublic.bio}</p> : null}
                  {coachPublic.anosExperiencia != null ? (
                    <p>
                      {coachPublic.anosExperiencia}{" "}
                      {coachPublic.anosExperiencia === 1
                        ? "año de experiencia"
                        : "años de experiencia"}
                    </p>
                  ) : null}
                  {coachPublic.especialidades.length > 0 ? (
                    <p>{coachPublic.especialidades.join(" · ")}</p>
                  ) : null}
                  {rel.coach?.coachCode ? <p>{rel.coach.coachCode}</p> : null}
                  <CoachPublicDetails profile={coachPublic} />
                </div>
              ) : (
                <p className="student-next-class__pending">
                  Tu entrenador todavía no completó su perfil.
                </p>
              )
            ) : null;

            return (
              <section
                key={rel.relationshipId}
                className="coaching-student-relation-card"
              >
                <article className="student-next-class" aria-label="Mi próxima clase">
                  <h2>Mi próxima clase</h2>
                  {hasNextClass && when ? (
                    <>
                      <p className="student-next-class__when">{when.date}</p>
                      {when.time ? (
                        <p className="student-next-class__time">{when.time}</p>
                      ) : null}
                      <p className="student-next-class__meta">
                        {nextUpcoming
                          ? `${nextUpcoming.durationMinutes} min${
                              nextUpcoming.court ? ` · ${nextUpcoming.court}` : ""
                            } · ${clubName}`
                          : clubName}
                      </p>
                      <p className="student-next-class__status">Programada</p>
                      <h3>Qué vamos a entrenar</h3>
                      {topics.length > 0 ? (
                        <>
                          <p className="student-next-class__topic">{topics[0]}</p>
                          {topics.length > 1 ? (
                            <p className="student-next-class__topic-more">
                              {topics.slice(1).join(" · ")}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="student-next-class__pending">
                          Tu coach aún no ha definido el tema de esta sesión.
                        </p>
                      )}
                      {nextUpcoming?.messageToStudent ? (
                        <>
                          <h3>Mensaje de tu coach</h3>
                          <p className="student-next-class__message">
                            {nextUpcoming.messageToStudent}
                          </p>
                        </>
                      ) : null}
                      {coachRow}
                      {coachStory}
                    </>
                  ) : (
                    <p className="student-next-class__pending">
                      Aún no tienes clases programadas.
                    </p>
                  )}
                  {(rel.upcomingSessions?.length ?? 0) > 1 ? (
                    <details className="student-next-class__more">
                      <summary>
                        {rel.upcomingSessions!.length - 1}{" "}
                        {rel.upcomingSessions!.length - 1 === 1
                          ? "clase más"
                          : "clases más"}
                      </summary>
                      <ul>
                        {rel.upcomingSessions!.slice(1).map((sch) => (
                          <li key={sch.id}>
                            <strong>{formatDate(sch.startsAt)}</strong>
                            {sch.court ? ` · ${sch.court}` : ""}
                            {sch.focus
                              ? ` · ${parsePrepFocusTopics(sch.focus).join(", ")}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>

                {!hasNextClass ? (
                  <article className="student-coach-card" aria-label="Mi entrenador">
                    {coachRow}
                    <p className="student-coach-card__club">{clubName}</p>
                    {coachStory}
                  </article>
                ) : null}

                {/* 2. MI EVOLUCIÓN COMO JUGADOR */}
                <StudentTrainingSection
                  sessions={clubSessions}
                  error={trainingError}
                />

                {/* 4. HISTORIAL INMUTABLE DE SESIONES Y ASIGNACIONES */}
                <details className="coaching-student-ledger-section student-history">
                  <summary className="coaching-ledger-header">
                    <div>
                      <h3 className="coaching-ledger-title">Mi historial</h3>
                      <p className="coaching-ledger-subtitle">
                        Clases impartidas y movimientos de tu paquete.
                      </p>
                    </div>
                    <span className="coaching-ledger-count">
                      {(rel.ledger ?? []).length} movimiento(s)
                    </span>
                  </summary>

                  {(rel.ledger ?? []).length === 0 ? (
                    <div className="coaching-ledger-empty">
                      <p>
                        Aún no se registran movimientos ni clases en este
                        paquete.
                      </p>
                    </div>
                  ) : (
                    <div className="coaching-ledger-timeline">
                      {(rel.ledger ?? []).map((entry) => {
                        const renderStudentLedgerBadge = () => {
                          switch (entry.tipo) {
                            case "PACKAGE_CREDIT":
                            case "ASSIGN":
                              return (
                                <span className="coaching-ledger-badge badge--assign">
                                  <TablerIcon name="plus" size={13} />+
                                  {entry.delta} Clases (Club)
                                </span>
                              );
                            case "CLASS_DEBIT":
                            case "CLASS_SESSION":
                              return (
                                <span className="coaching-ledger-badge badge--session">
                                  <TablerIcon name="check" size={13} />
                                  {entry.delta} Clase (Coach)
                                </span>
                              );
                            case "TRANSFER_OUT":
                              return (
                                <span className="coaching-ledger-badge badge--transfer-out">
                                  <TablerIcon name="arrow-right" size={13} />
                                  {entry.delta} Clases transferidas
                                </span>
                              );
                            case "TRANSFER_IN":
                              return (
                                <span className="coaching-ledger-badge badge--transfer-in">
                                  <TablerIcon name="arrow-left" size={13} />+
                                  {entry.delta} Clases recibidas
                                </span>
                              );
                            case "ADJUSTMENT":
                              return (
                                <span className="coaching-ledger-badge badge--adjustment">
                                  <TablerIcon name="adjustments" size={13} />
                                  {entry.delta > 0
                                    ? `+${entry.delta}`
                                    : entry.delta}{" "}
                                  Ajuste
                                </span>
                              );
                            default:
                              return (
                                <span
                                  className={`coaching-ledger-badge ${
                                    entry.delta > 0
                                      ? "badge--assign"
                                      : "badge--session"
                                  }`}
                                >
                                  {entry.delta > 0
                                    ? `+${entry.delta}`
                                    : entry.delta}{" "}
                                  {entry.tipo}
                                </span>
                              );
                          }
                        };

                        return (
                          <div key={entry.id} className="coaching-ledger-row">
                            <div className="coaching-ledger-row__left">
                              {renderStudentLedgerBadge()}
                              <span className="coaching-ledger-date">
                                {formatDate(entry.createdAt)}
                              </span>
                            </div>

                            <div className="coaching-ledger-row__details">
                              {entry.session && (
                                <div className="coaching-session-box">
                                  <div className="coaching-session-box__head">
                                    {entry.session.durationMinutes && (
                                      <span className="coaching-session-dur">
                                        <TablerIcon name="clock" size={13} />
                                        {entry.session.durationMinutes} min
                                      </span>
                                    )}
                                    {entry.session.focus && (
                                      <span className="coaching-session-focus">
                                        {entry.session.focus}
                                      </span>
                                    )}
                                  </div>

                                  {entry.session.workedOn &&
                                    entry.session.workedOn.length > 0 && (
                                      <div className="coaching-session-chips">
                                        {entry.session.workedOn.map((t) => (
                                          <span
                                            key={t}
                                            className="coaching-session-chip"
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                  {entry.session.improvements && (
                                    <div className="coaching-session-detail">
                                      <span className="coaching-session-detail__label">
                                        Avances:
                                      </span>
                                      <span>{entry.session.improvements}</span>
                                    </div>
                                  )}

                                  {entry.session.nextGoals && (
                                    <div className="coaching-session-detail">
                                      <span className="coaching-session-detail__label">
                                        Próximo objetivo:
                                      </span>
                                      <span>{entry.session.nextGoals}</span>
                                    </div>
                                  )}

                                  {entry.session.motivationalMessage && (
                                    <div className="coaching-session-quote">
                                      <span className="coaching-session-quote__label">
                                        Mensaje de tu entrenador ({coachName})
                                      </span>
                                      “{entry.session.motivationalMessage}”
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </details>
              </section>
            );
          })}
        </div>
      )}

      {studentProfile && canEditProfile ? (
        <StudentProfileCard
          open={profileEditorOpen}
          profile={studentProfile}
          onClose={() => setProfileEditorOpen(false)}
          onSave={handleSaveProfile}
          onChangePhoto={() => photoInputRef.current?.click()}
          photoUploading={photoUploading}
        />
      ) : null}
    </div>
  );
};
