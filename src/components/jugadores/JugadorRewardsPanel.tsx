import React, { useEffect, useMemo, useState } from "react";
import {
  assignBenefit,
  cancelRedemption,
  confirmRedemption,
  listBenefits,
  listCampaigns,
  listParticipaciones,
  listRedemptions,
  listReviews,
  listRewards,
  playerBalance,
  playerRequestRedemption,
  playerSnapshot,
  requestRedemption,
  reserveRedemption,
  reviewParticipations,
  type BalanceRecord,
  type BenefitRecord,
  type CampaignRecord,
  type PlayerSnapshot,
  type RedemptionRecord,
  type RewardRecord,
} from "../../lib/rewards/api";
import {
  MODALITY_LABELS,
  accumulatingNow,
  formatCampaignNarrative,
  formatMexicoDate,
  formatWindowEnd,
  redeemingNow,
} from "../../lib/rewards/present";
import { getOrganizerDisplayNameSync } from "../../lib/organizer/organizerDisplayName";
import { UserContext } from "../../contexts/UserContext";
import { Button } from "../ui/Button";
import { TablerIcon } from "../ui/TablerIcon";
import "../rewards/rewards.css";

interface JugadorRewardsPanelProps {
  jugadorId: string;
  organizadorId?: string | null;
  /** El perfil público solo muestra datos si la sesión está vinculada a este jugador. */
  mode: "admin" | "player";
  /** Si el jugador es concedido/vinculado desde otro club con solo lectura en ficha */
  isGrantedReadOnly?: boolean;
  /** Nombre del club para mostrar en encabezado cuando esté disponible */
  clubName?: string | null;
  /** Clases CSS adicionales */
  className?: string;
  /** Lista de participaciones del jugador si ya se tienen en el perfil */
  participaciones?: {
    id: string;
    evento_id: string;
    tipo_evento: string;
    evento_nombre: string | null;
    fecha: string | null;
  }[];
  /** Usuario autenticado opcional para verificar sesión */
  currentUser?: { id: string; email?: string } | null;
  /** Perfiles vinculados por identidad global multiclub */
  linkedProfiles?: Array<{ jugadorId: string; organizadorId: string }>;
  /** Lista completa de UUIDs vinculados a esta identidad */
  linkedJugadorIds?: string[];
  /** Riviera ID oficial */
  rivieraId?: string | null;
}

export const JugadorRewardsPanel: React.FC<JugadorRewardsPanelProps> = ({
  jugadorId,
  organizadorId,
  mode,
  isGrantedReadOnly,
  clubName,
  className,
  participaciones,
  currentUser,
  linkedProfiles,
  linkedJugadorIds,
  rivieraId,
}) => {
  if (mode === "admin") {
    if (!organizadorId) return null;
    return (
      <AdminRewardsDesk
        organizadorId={organizadorId}
        jugadorId={jugadorId}
        isGrantedReadOnly={isGrantedReadOnly}
      />
    );
  }

  return (
    <PlayerRewardsView
      jugadorId={jugadorId}
      organizadorId={organizadorId}
      clubName={clubName}
      className={className}
      participaciones={participaciones}
      currentUser={currentUser}
      linkedProfiles={linkedProfiles}
      linkedJugadorIds={linkedJugadorIds}
      rivieraId={rivieraId}
    />
  );
};

const FallbackUserContext = React.createContext<{ user: any } | undefined>(undefined);

function PlayerRewardsView({
  jugadorId,
  organizadorId: initialOrganizadorId,
  clubName: propClubName,
  className,
  participaciones: propParticipaciones,
  currentUser,
  linkedProfiles,
}: {
  jugadorId: string;
  organizadorId?: string | null;
  clubName?: string | null;
  className?: string;
  participaciones?: {
    id: string;
    evento_id: string;
    tipo_evento: string;
    evento_nombre: string | null;
    fecha: string | null;
  }[];
  currentUser?: { id: string; email?: string } | null;
  linkedProfiles?: Array<{ jugadorId: string; organizadorId: string }>;
  linkedJugadorIds?: string[];
  rivieraId?: string | null;
}) {
  const userContext = React.useContext(UserContext || FallbackUserContext);
  const user = currentUser !== undefined ? currentUser : (userContext?.user ?? null);

  // Lista de clubes disponibles donde el jugador tiene identidad o perfil
  const availableClubs = useMemo(() => {
    const list: Array<{ organizadorId: string; jugadorId: string; displayName: string }> = [];
    const seen = new Set<string>();

    // 1. Perfiles vinculados por identidad multiclub
    if (linkedProfiles && linkedProfiles.length > 0) {
      for (const p of linkedProfiles) {
        if (p.organizadorId && !seen.has(p.organizadorId)) {
          seen.add(p.organizadorId);
          list.push({
            organizadorId: p.organizadorId,
            jugadorId: p.jugadorId || jugadorId,
            displayName: getOrganizerDisplayNameSync(p.organizadorId),
          });
        }
      }
    }

    // 2. Club inicial del prop si no estaba ya en la lista
    if (initialOrganizadorId && !seen.has(initialOrganizadorId)) {
      seen.add(initialOrganizadorId);
      list.push({
        organizadorId: initialOrganizadorId,
        jugadorId,
        displayName: propClubName || getOrganizerDisplayNameSync(initialOrganizadorId),
      });
    }

    // 3. Fallback: al menos el club del jugador si no hay nada
    if (list.length === 0 && initialOrganizadorId) {
      list.push({
        organizadorId: initialOrganizadorId,
        jugadorId,
        displayName: propClubName || getOrganizerDisplayNameSync(initialOrganizadorId),
      });
    }

    return list;
  }, [linkedProfiles, initialOrganizadorId, propClubName, jugadorId]);

  // Club actualmente seleccionado
  const [activeOrgId, setActiveOrgId] = useState<string>(() => {
    if (initialOrganizadorId && availableClubs.some((c) => c.organizadorId === initialOrganizadorId)) {
      return initialOrganizadorId;
    }
    return availableClubs[0]?.organizadorId || initialOrganizadorId || "";
  });

  const activeClub = useMemo(() => {
    return availableClubs.find((c) => c.organizadorId === activeOrgId) || availableClubs[0] || null;
  }, [availableClubs, activeOrgId]);

  const activeJugadorId = activeClub?.jugadorId || jugadorId;

  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinked, setUnlinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [parts, setParts] = useState<
    { id: string; evento_id: string; tipo_evento: string; evento_nombre: string | null; fecha: string | null }[]
  >(propParticipaciones ?? []);
  const [partsExpanded, setPartsExpanded] = useState(false);
  const [busyRewardId, setBusyRewardId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const hasTriedFallbackRef = React.useRef(false);

  useEffect(() => {
    if (initialOrganizadorId && availableClubs.some((c) => c.organizadorId === initialOrganizadorId)) {
      setActiveOrgId(initialOrganizadorId);
    }
  }, [initialOrganizadorId, availableClubs]);

  useEffect(() => {
    if (propParticipaciones && propParticipaciones.length > 0) {
      setParts(propParticipaciones);
    }
  }, [propParticipaciones]);

  useEffect(() => {
    // Si no hay usuario autenticado, no consultamos el ledger privado
    if (!user) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setUnlinked(false);
    setError(null);

    playerSnapshot(activeJugadorId, activeOrgId || undefined)
      .then((data) => {
        if (!active) return;
        setSnapshot(data);
        if (data.saldos.length > 0) {
          const activeCamp =
            data.saldos.find((s) => s.fase === "canje") ||
            data.saldos.find((s) => s.fase === "acumulacion") ||
            data.saldos[0];
          setSelectedCampaignId(activeCamp.campaign_id);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("no está vinculada") ||
          msg.includes("Sin sesión") ||
          msg.includes("Sin permiso")
        ) {
          // Si falló este club pero hay otros clubes disponibles en la identidad del jugador,
          // intentamos con el siguiente club antes de marcar unlinked definitivo
          const otherClubs = availableClubs.filter((c) => c.organizadorId !== activeOrgId);
          if (otherClubs.length > 0 && !hasTriedFallbackRef.current) {
            hasTriedFallbackRef.current = true;
            setActiveOrgId(otherClubs[0].organizadorId);
            return;
          }
          setUnlinked(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeJugadorId, activeOrgId, user, availableClubs]);

  useEffect(() => {
    if (!snapshot || (propParticipaciones && propParticipaciones.length > 0)) return;
    let active = true;
    try {
      const promise = listParticipaciones(jugadorId);
      if (promise && typeof promise.then === "function") {
        promise
          .then((data) => {
            if (active) setParts(data || []);
          })
          .catch(() => {});
      }
    } catch {
      // Silencioso
    }
    return () => {
      active = false;
    };
  }, [jugadorId, propParticipaciones, snapshot]);

  // 1. Visitante sin sesión iniciada
  if (!user) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-guest-card">
          <div className="rrw-guest-badge">
            <span className="rrw-kicker">Riviera Rewards</span>
            <span className="rrw-badge rrw-badge--neutral">Fidelización</span>
          </div>
          <h2 className="rrw-guest-title">Programa de fidelización y recompensas</h2>
          <p className="rrw-guest-text">
            Acumula puntos en cada reta con Riviera Rewards. Inicia sesión para consultar tus puntos, progreso hacia premios y recompensas del club.
          </p>
          <div className="rrw-guest-action">
            <a href="/login" className="rrw-guest-btn">
              <TablerIcon name="user-circle" size={16} />
              Iniciar sesión
            </a>
          </div>
        </div>
      </section>
    );
  }

  // 2. Usuario con sesión pero no vinculado al jugador del perfil
  if (unlinked) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-guest-card">
          <div className="rrw-guest-badge">
            <span className="rrw-kicker">Riviera Rewards</span>
            <span className="rrw-badge rrw-badge--neutral">Acceso restringido</span>
          </div>
          <h2 className="rrw-guest-title">Puntos y recompensas de fidelización</h2>
          <p className="rrw-guest-text">
            Este perfil pertenece a otro jugador. Inicia sesión con la cuenta vinculada para consultar tus propios puntos y recompensas.
          </p>
        </div>
      </section>
    );
  }

  // 3. Cargando información de Rewards
  if (loading && !snapshot) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-card" style={{ padding: "1.25rem" }}>
          <p className="rrw-kicker">Riviera Rewards</p>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Consultando recompensas y balance del club…
          </p>
        </div>
      </section>
    );
  }

  // 4. Error técnico de carga
  if (error && !snapshot) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-card">
          <div className="rrw-error-banner">
            <TablerIcon name="alert-triangle" size={16} />
            <span className="rrw-error-text">{error}</span>
          </div>
        </div>
      </section>
    );
  }

  // 5. Sin campañas disponibles
  if (!snapshot || snapshot.saldos.length === 0) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-card">
          <p className="rrw-kicker">Riviera Rewards</p>
          <h2 className="rrw-card-title">Club de Recompensas</h2>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            El club no tiene campañas activas de Riviera Rewards en este momento.
          </p>
        </div>
      </section>
    );
  }

  // Campaña seleccionada
  const selectedBalance =
    snapshot.saldos.find((s) => s.campaign_id === selectedCampaignId) || snapshot.saldos[0];
  const displayClubName =
    activeClub?.displayName || propClubName || getOrganizerDisplayNameSync(snapshot.organizador_id);
  const narrative = formatCampaignNarrative(selectedBalance);

  // Participaciones dentro de la ventana de la campaña con aislamiento por club
  const startMs = new Date(selectedBalance.acumula_desde).getTime();
  const endMs = new Date(selectedBalance.acumula_hasta).getTime();
  const campaignParts = parts.filter((p) => {
    if (!p.fecha) return false;
    const d = new Date(p.fecha).getTime();
    const inWindow = d >= startMs && d <= endMs;
    const partOrg = (p as { metadata?: { organizador_id?: string } })?.metadata?.organizador_id;
    if (partOrg && snapshot.organizador_id && partOrg !== snapshot.organizador_id) {
      return false;
    }
    return inWindow;
  });

  const elegiblesCount = campaignParts.length;

  // Recompensas de la campaña
  const campaignRewards = snapshot.premios.filter(
    (p) => !p.campaign_id || p.campaign_id === selectedBalance.campaign_id
  );

  const availableRewards = campaignRewards
    .filter((p) => p.inventario_restante == null || p.inventario_restante > 0)
    .sort((a, b) => a.costo_puntos - b.costo_puntos);

  const currentPoints =
    selectedBalance.fase === "canje"
      ? selectedBalance.disponible
      : selectedBalance.acumulando;

  const nextReward = availableRewards.find((r) => r.costo_puntos > currentPoints);

  const ptsPerMatch =
    elegiblesCount > 0 && selectedBalance.acumulando > 0
      ? Math.max(1, Math.round(selectedBalance.acumulando / elegiblesCount))
      : 10;

  const remainingPoints = nextReward ? nextReward.costo_puntos - currentPoints : 0;
  const estimatedMatches = nextReward ? Math.ceil(remainingPoints / ptsPerMatch) : 0;
  const progressPct = nextReward
    ? Math.min(100, Math.max(0, Math.round((currentPoints / nextReward.costo_puntos) * 100)))
    : 100;

  const visibleParts = partsExpanded ? campaignParts : campaignParts.slice(0, 3);

  const handleRequestRedemption = async (reward: (typeof snapshot.premios)[0]) => {
    const ok = window.confirm(
      `¿Deseas solicitar el canje de «${reward.nombre}» por ${reward.costo_puntos} puntos?`
    );
    if (!ok) return;

    setBusyRewardId(reward.id);
    setActionMessage(null);
    try {
      const redemptionJugadorId = snapshot.jugador_id || activeJugadorId;
      await playerRequestRedemption(snapshot.organizador_id, reward.id, redemptionJugadorId);
      const updated = await playerSnapshot(redemptionJugadorId, snapshot.organizador_id);
      setSnapshot(updated);
      setActionMessage({
        type: "success",
        text: `¡Canje de «${reward.nombre}» solicitado con éxito! El club lo validará.`,
      });
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "No se pudo solicitar el canje",
      });
    } finally {
      setBusyRewardId(null);
    }
  };

  return (
    <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
      <div className="rrw-player-panel">
        {/* Selector de club si el jugador participa en múltiples clubes */}
        {availableClubs.length > 1 && (
          <div className="rrw-club-selector" role="tablist" aria-label="Clubes de Rewards">
            <span className="rrw-club-selector-label">Club:</span>
            {availableClubs.map((club) => {
              const isSelected = club.organizadorId === activeOrgId;
              return (
                <button
                  key={club.organizadorId}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`rrw-campaign-pill ${isSelected ? "rrw-campaign-pill--active" : ""}`}
                  onClick={() => {
                    if (club.organizadorId !== activeOrgId) {
                      hasTriedFallbackRef.current = true;
                      setActiveOrgId(club.organizadorId);
                      setSnapshot(null);
                      setActionMessage(null);
                    }
                  }}
                >
                  <TablerIcon name="building-community" size={13} />
                  {club.displayName}
                </button>
              );
            })}
          </div>
        )}

        {/* Selector de campaña si hay más de una */}
        {snapshot.saldos.length > 1 && (
          <div className="rrw-campaign-selector" role="tablist" aria-label="Campañas disponibles">
            {snapshot.saldos.map((s) => (
              <button
                key={s.campaign_id}
                type="button"
                role="tab"
                aria-selected={s.campaign_id === selectedBalance.campaign_id}
                className={`rrw-campaign-pill ${
                  s.campaign_id === selectedBalance.campaign_id ? "rrw-campaign-pill--active" : ""
                }`}
                onClick={() => {
                  setSelectedCampaignId(s.campaign_id);
                  setActionMessage(null);
                }}
              >
                {s.nombre} ({s.fase === "canje" ? "Canje" : s.fase === "acumulacion" ? "Acumulando" : "Cerrada"})
              </button>
            ))}
          </div>
        )}

        {/* Encabezado Riviera Rewards */}
        <div className="rrw-loyalty-header">
          <div className="rrw-loyalty-identity">
            <span className="rrw-kicker">Riviera Rewards</span>
            <span
              className={`rrw-badge ${
                selectedBalance.fase === "canje"
                  ? "rrw-badge--active"
                  : selectedBalance.fase === "acumulacion"
                  ? "rrw-badge--neutral"
                  : "rrw-badge--ghost"
              }`}
            >
              {selectedBalance.fase === "canje"
                ? "Ventana de canje activa"
                : selectedBalance.fase === "acumulacion"
                ? "Acumulación activa"
                : "Cerrada"}
            </span>
          </div>
          <h2 className="rrw-loyalty-campaign">{selectedBalance.nombre}</h2>
          <p className="rrw-loyalty-club">{displayClubName}</p>
          <p className="rrw-loyalty-narrative">{narrative}</p>
        </div>

        {/* 4 Métricas del Jugador */}
        <div className="rrw-kpi-grid rrw-kpi-grid--player">
          <div className="rrw-kpi-card">
            <span className="rrw-kpi-label">Participaciones</span>
            <span className="rrw-kpi-value">{elegiblesCount}</span>
            <p className="rrw-kpi-note">Retas en campaña</p>
          </div>
          <div className="rrw-kpi-card">
            <span className="rrw-kpi-label">Acumulando</span>
            <span className="rrw-kpi-value">{selectedBalance.acumulando}</span>
            <p className="rrw-kpi-note">Puntos periodo</p>
          </div>
          <div className="rrw-kpi-card">
            <span className="rrw-kpi-label">Disponibles</span>
            <span className="rrw-kpi-value">{selectedBalance.disponible}</span>
            <p className="rrw-kpi-note">Para canjear</p>
          </div>
          <div className="rrw-kpi-card">
            <span className="rrw-kpi-label">Reservados</span>
            <span className="rrw-kpi-value">{selectedBalance.reservado}</span>
            <p className="rrw-kpi-note">En proceso</p>
          </div>
        </div>

        {/* Progreso hacia el siguiente premio */}
        <div className="rrw-next-reward-box">
          <span className="rrw-kicker">Próxima recompensa</span>
          {nextReward ? (
            <>
              <div className="rrw-next-reward-headline">
                <strong className="rrw-next-reward-name">{nextReward.nombre}</strong>
                <span className="rrw-next-reward-cost">
                  {currentPoints} / {nextReward.costo_puntos} pts
                </span>
              </div>
              <div
                className="rrw-progress-track"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso hacia ${nextReward.nombre}`}
              >
                <div className="rrw-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="rrw-next-reward-note">
                Te faltan {remainingPoints} {remainingPoints === 1 ? "punto" : "puntos"}, equivalentes a{" "}
                {estimatedMatches} {estimatedMatches === 1 ? "reta válida" : "retas válidas"} de {ptsPerMatch} puntos.
              </p>
            </>
          ) : (
            <p className="rrw-next-reward-empty">
              {availableRewards.length > 0
                ? `¡Felicidades! Has superado todos los umbrales de premios activos (${currentPoints} pts).`
                : selectedBalance.fase === "acumulacion"
                ? `El catálogo de premios estará disponible para canje a partir del ${formatMexicoDate(
                    selectedBalance.canje_desde
                  )}.`
                : "No hay premios activos en esta campaña."}
            </p>
          )}
        </div>

        {/* Mensaje de acción */}
        {actionMessage && (
          <div className={actionMessage.type === "success" ? "rrw-banner" : "rrw-error-banner"}>
            <TablerIcon name={actionMessage.type === "success" ? "check" : "alert-triangle"} size={16} />
            <span className={actionMessage.type === "success" ? undefined : "rrw-error-text"}>
              {actionMessage.text}
            </span>
          </div>
        )}

        {/* Historial de participaciones en Rewards */}
        <div className="rrw-sub-block">
          <div className="rrw-sub-header">
            <h3 className="rrw-sub-title">Participaciones en campaña</h3>
            <span className="rrw-badge rrw-badge--neutral">{campaignParts.length}</span>
          </div>
          {campaignParts.length === 0 ? (
            <p className="rrw-empty-text">No hay retas registradas durante la ventana de esta campaña.</p>
          ) : (
            <>
              <ul className="rrw-item-list">
                {visibleParts.map((part) => (
                  <li key={part.id} className="rrw-item-row rrw-item-row--part">
                    <div className="rrw-part-info">
                      <strong className="rrw-part-name">{part.evento_nombre || "Reta de Pádel"}</strong>
                      <div className="rrw-part-meta">
                        <span>{part.fecha ? formatMexicoDate(part.fecha) : "Fecha no registrada"}</span>
                        <span>·</span>
                        <span>
                          {MODALITY_LABELS[part.tipo_evento as keyof typeof MODALITY_LABELS] ?? part.tipo_evento}
                        </span>
                      </div>
                    </div>
                    <span className="rrw-badge rrw-badge--neutral">
                      {selectedBalance.acumulando > 0 ? "Acreditada" : "En acumulación"}
                    </span>
                  </li>
                ))}
              </ul>
              {campaignParts.length > 3 && (
                <button
                  type="button"
                  className="rrw-toggle-btn"
                  onClick={() => setPartsExpanded(!partsExpanded)}
                >
                  {partsExpanded ? "Ver menos" : `Ver todas las participaciones (${campaignParts.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Catálogo de Recompensas */}
        <div className="rrw-sub-block">
          <h3 className="rrw-sub-title">Catálogo de Recompensas</h3>
          {campaignRewards.length === 0 ? (
            <p className="rrw-empty-text">
              {selectedBalance.fase === "acumulacion"
                ? `El club activará los canjes a partir del ${formatMexicoDate(selectedBalance.canje_desde)}.`
                : "El club no tiene premios registrados para esta campaña."}
            </p>
          ) : (
            <ul className="rrw-reward-list">
              {campaignRewards.map((reward) => {
                const canRedeem =
                  selectedBalance.fase === "canje" &&
                  selectedBalance.disponible >= reward.costo_puntos &&
                  (reward.inventario_restante == null || reward.inventario_restante > 0);
                const isOut = reward.inventario_restante === 0;

                return (
                  <li key={reward.id} className="rrw-reward-item">
                    <div className="rrw-reward-header">
                      <div>
                        <strong className="rrw-reward-title">{reward.nombre}</strong>
                        {reward.descripcion && (
                          <p className="rrw-reward-desc">{reward.descripcion}</p>
                        )}
                        {reward.condiciones && (
                          <p className="rrw-reward-cond">{reward.condiciones}</p>
                        )}
                      </div>
                      <span className="rrw-reward-cost">{reward.costo_puntos} pts</span>
                    </div>

                    <div className="rrw-reward-footer">
                      <span className="rrw-reward-stock">
                        {isOut
                          ? "Agotado"
                          : reward.inventario_restante != null
                          ? `${reward.inventario_restante} disponibles`
                          : "Disponible"}
                      </span>

                      <Button
                        variant={canRedeem ? "primary" : "secondary"}
                        size="sm"
                        disabled={busyRewardId === reward.id || !canRedeem}
                        onClick={() => handleRequestRedemption(reward)}
                      >
                        {busyRewardId === reward.id
                          ? "Solicitando…"
                          : isOut
                          ? "Agotado"
                          : selectedBalance.fase !== "canje"
                          ? "Fase de canje"
                          : canRedeem
                          ? "Solicitar"
                          : `Faltan ${reward.costo_puntos - selectedBalance.disponible} pts`}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Historial de Canjes del Jugador */}
        {snapshot.canjes.length > 0 && (
          <div className="rrw-sub-block">
            <h3 className="rrw-sub-title">Tus Canjes Registrados</h3>
            <ul className="rrw-item-list">
              {snapshot.canjes.map((item) => (
                <li key={item.id} className="rrw-item-row">
                  <div>
                    <strong style={{ display: "block" }}>{item.nombre}</strong>
                    <div className="rrw-part-meta">
                      <span>{item.costo_puntos} pts</span>
                      <span>·</span>
                      <span>{formatMexicoDate(item.created_at)}</span>
                      {item.reserva_hasta && item.estado === "reservado" && (
                        <>
                          <span>·</span>
                          <span>Vence: {formatMexicoDate(item.reserva_hasta)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={`rrw-badge ${
                      item.estado === "entregado"
                        ? "rrw-badge--active"
                        : item.estado === "reservado"
                        ? "rrw-badge--neutral"
                        : "rrw-badge--ghost"
                    }`}
                  >
                    {item.estado}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Resumen de Campañas Cerradas */}
        {snapshot.saldos.filter((row) => row.fase === "cerrada").length > 0 && (
          <div style={{ marginTop: "0.25rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {snapshot.saldos
              .filter((row) => row.fase === "cerrada")
              .slice(0, 3)
              .map((row) => (
                <span key={row.campaign_id} style={{ display: "inline-block", marginRight: "0.75rem" }}>
                  {row.nombre}: {row.utilizado} utilizados, {row.cerrado} cerrados.
                </span>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AdminRewardsDesk({
  organizadorId,
  jugadorId,
  isGrantedReadOnly,
}: {
  organizadorId: string;
  jugadorId: string;
  isGrantedReadOnly?: boolean;
}) {
  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [benefits, setBenefits] = useState<BenefitRecord[]>([]);
  const [parts, setParts] = useState<{ id: string; evento_id: string; tipo_evento: string; evento_nombre: string | null }[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [manualCampaignSelection, setManualCampaignSelection] = useState(false);
  const [rewardId, setRewardId] = useState("");
  const [partId, setPartId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeCampaigns = useMemo(
    () => campaigns.filter((item) => item.estado === "activa"),
    [campaigns]
  );

  useEffect(() => {
    if (manualCampaignSelection) return;
    if (activeCampaigns.length === 1) {
      setCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, manualCampaignSelection]);

  const load = React.useCallback(
    () =>
      Promise.all([
        playerBalance(organizadorId, jugadorId),
        listCampaigns(organizadorId),
        listRewards(organizadorId),
        listRedemptions(organizadorId, jugadorId),
        listReviews(organizadorId, jugadorId),
        listBenefits(organizadorId, jugadorId),
        listParticipaciones(jugadorId),
      ]).then(([nextBalances, nextCampaigns, nextRewards, nextRedemptions, reviews, nextBenefits, nextParts]) => {
        setBalances(nextBalances);
        setCampaigns(nextCampaigns);
        setRewards(nextRewards);
        setRedemptions(nextRedemptions);
        setPending(
          reviews.filter((review) => review.estado === "pendiente").map((review) => review.participacion_id)
        );
        setBenefits(nextBenefits);
        setParts(nextParts);
      }),
    [organizadorId, jugadorId]
  );

  useEffect(() => {
    load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "No se pudo cargar Rewards")
    );
  }, [load]);

  const act = (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    task()
      .then(() => load())
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se completó"))
      .finally(() => setBusy(false));
  };

  const accruing = accumulatingNow(balances);
  const redeeming = redeemingNow(balances);
  const openRewards = rewards.filter((reward) => reward.estado === "activo" && reward.campaign_id === redeeming?.campaign_id);
  const selectedReward = openRewards.find((reward) => reward.id === rewardId);
  const canRequest = Boolean(selectedReward && (redeeming?.disponible ?? 0) >= selectedReward.costo_puntos);

  const hasLocalActivity =
    (accruing?.acumulando ?? 0) > 0 ||
    (redeeming?.disponible ?? 0) > 0 ||
    (redeeming?.reservado ?? 0) > 0 ||
    pending.length > 0 ||
    redemptions.length > 0 ||
    benefits.some((b) => b.estado === "pendiente_asignacion");

  return (
    <section className="rrw-card rrw-ficha-panel" aria-label="Riviera Rewards">
      <div className="rrw-card-header">
        <div>
          <p className="rrw-kicker">Riviera Rewards</p>
          <h2 className="rrw-card-title" style={{ fontSize: "1.2rem" }}>Puntos del jugador</h2>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Independientes del ranking deportivo. Seguir acumulando no descuenta puntos.
          </p>
        </div>
      </div>

      <div className="rrw-kpi-grid rrw-kpi-grid--3">
        <div className="rrw-kpi-card">
          <span className="rrw-kpi-label">Acumulando</span>
          <span className="rrw-kpi-value">{accruing?.acumulando ?? 0}</span>
        </div>
        <div className="rrw-kpi-card">
          <span className="rrw-kpi-label">Disponibles</span>
          <span className="rrw-kpi-value">{redeeming?.disponible ?? 0}</span>
          {redeeming && (
            <p className="rrw-kpi-note">Hasta {formatWindowEnd(redeeming.canje_hasta)}</p>
          )}
        </div>
        <div className="rrw-kpi-card">
          <span className="rrw-kpi-label">Reservados</span>
          <span className="rrw-kpi-value">{redeeming?.reservado ?? 0}</span>
        </div>
      </div>

      {isGrantedReadOnly && !hasLocalActivity ? (
        <p style={{ marginTop: "0.85rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Jugador vinculado desde otro club sin participaciones ni saldo en este club. Los puntos de su club de origen son privados.
        </p>
      ) : (
        <>
          <div className="rrw-sub-block">
            <h3 className="rrw-sub-title">Acreditación de Participaciones</h3>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Pendientes de validar: <strong>{pending.length}</strong>
            </p>
            <div className="rrw-fields-row rrw-fields-row--2">
              <div className="rrw-field">
                <select
                  className="rrw-select"
                  value={campaignId}
                  onChange={(e) => {
                    setCampaignId(e.target.value);
                    setManualCampaignSelection(true);
                  }}
                  aria-label="Campaña"
                >
                  <option value="">Selecciona campaña...</option>
                  {activeCampaigns.map((item) => (
                    <option key={item.id} value={item.id}>{item.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || pending.length === 0 || !campaignId}
                  onClick={() =>
                    act(() =>
                      reviewParticipations({
                        organizadorId,
                        participacionIds: pending,
                        decision: "aprobada",
                        campaignId,
                      })
                    )
                  }
                >
                  Aprobar pendientes
                </Button>
              </div>
            </div>
          </div>

          <div className="rrw-sub-block">
            <h3 className="rrw-sub-title">Canjes de Premios</h3>
            <div className="rrw-fields-row rrw-fields-row--2">
              <div className="rrw-field">
                <select
                  className="rrw-select"
                  value={rewardId}
                  onChange={(e) => setRewardId(e.target.value)}
                  aria-label="Premio en canje"
                >
                  <option value="">Selecciona premio...</option>
                  {openRewards.map((reward) => (
                    <option key={reward.id} value={reward.id}>{reward.nombre} · {reward.costo_puntos} pts</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !canRequest}
                  onClick={() => act(() => requestRedemption(organizadorId, rewardId, jugadorId))}
                >
                  Solicitar
                </Button>
              </div>
            </div>

            {rewardId && selectedReward && !canRequest && (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Puntos insuficientes ({redeeming?.disponible ?? 0} de {selectedReward.costo_puntos} pts necesarios).
              </p>
            )}

            <ul className="rrw-item-list">
              {redemptions.map((item) => (
                <li key={item.id} className="rrw-item-row">
                  <div>
                    <strong>{item.snapshot?.nombre ?? "Premio"}</strong>
                    <span style={{ margin: "0 0.35rem", color: "var(--text-muted)" }}>·</span>
                    <span className="rrw-badge rrw-badge--neutral">{item.estado}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    {item.estado === "solicitado" && (
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => reserveRedemption(item.id))}>
                        Reservar
                      </Button>
                    )}
                    {item.estado === "reservado" && (
                      <Button variant="primary" size="sm" disabled={busy} onClick={() => act(() => confirmRedemption(item.id))}>
                        Entregar
                      </Button>
                    )}
                    {(item.estado === "solicitado" || item.estado === "reservado") && (
                      <Button variant="danger" size="sm" disabled={busy} onClick={() => act(() => cancelRedemption(item.id))}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {redemptions.length === 0 && (
                <li style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Sin canjes activos.
                </li>
              )}
            </ul>
          </div>

          {benefits.filter((b) => b.estado === "pendiente_asignacion").length > 0 && (
            <div className="rrw-sub-block">
              <h3 className="rrw-sub-title">Reta Gratuita Pendiente de Asignar</h3>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Al asignarla, la participación no genera puntos Rewards pero conserva el historial deportivo íntegro.
              </p>
              {benefits
                .filter((b) => b.estado === "pendiente_asignacion")
                .map((benefit) => (
                  <div key={benefit.id} className="rrw-fields-row rrw-fields-row--2">
                    <div className="rrw-field">
                      <select
                        className="rrw-select"
                        value={partId}
                        onChange={(e) => setPartId(e.target.value)}
                        aria-label="Participación para reta gratuita"
                      >
                        <option value="">Elige participación...</option>
                        {parts.map((part) => (
                          <option key={part.id} value={part.id}>
                            {part.evento_nombre ||
                              (MODALITY_LABELS[part.tipo_evento as keyof typeof MODALITY_LABELS] ?? part.tipo_evento)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || !partId}
                        onClick={() => {
                          const part = parts.find((item) => item.id === partId);
                          if (!part) return;
                          act(async () => {
                            await assignBenefit({
                              benefitId: benefit.id,
                              eventoId: part.evento_id,
                              tipoEvento: part.tipo_evento,
                              participacionId: part.id,
                            });
                            setPartId("");
                          });
                        }}
                      >
                        Marcar como gratuita
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="rrw-error-banner" style={{ marginTop: "0.75rem" }}>
          <TablerIcon name="alert-triangle" size={16} />
          <span className="rrw-error-text">{error}</span>
        </div>
      )}
    </section>
  );
}
