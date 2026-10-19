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
  playerPublicSummary,
  playerRequestRedemption,
  playerSnapshot,
  requestRedemption,
  reserveRedemption,
  reviewParticipations,
  type BalanceRecord,
  type BenefitRecord,
  type CampaignRecord,
  type PlayerPublicSummaryItem,
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
import {
  REWARD_STATUS_LABELS,
  buildCampaignCatalog,
  catalogCampaigns,
  formatRewardOptionLabel,
  formatRewardProgressNote,
  rewardStatusBadgeClass,
} from "../../lib/rewards/rewardCatalog";
import {
  getCachedOrganizerDisplayName,
  getOrganizerDisplayNameSync,
  resolveOrganizerDisplayName,
} from "../../lib/organizer/organizerDisplayName";
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
  /** IDs de organizadores donde el jugador tiene participaciones o carrera deportiva */
  participatingClubIds?: string[];
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
  participatingClubIds,
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
      participatingClubIds={participatingClubIds}
    />
  );
};

const FallbackUserContext = React.createContext<{ user: any } | undefined>(undefined);

export function isValidClubDisplayName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim().toLowerCase();
  return (
    trimmed !== "" &&
    trimmed !== "club" &&
    trimmed !== "organizador" &&
    trimmed !== "pendiente" &&
    trimmed !== "undefined" &&
    trimmed !== "null"
  );
}

function PlayerRewardsView({
  jugadorId,
  organizadorId: initialOrganizadorId,
  clubName: propClubName,
  className,
  participaciones: propParticipaciones,
  currentUser,
  linkedProfiles,
  linkedJugadorIds,
  rivieraId,
  participatingClubIds,
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
  participatingClubIds?: string[];
}) {
  const userContext = React.useContext(UserContext || FallbackUserContext);
  const user = currentUser !== undefined ? currentUser : (userContext?.user ?? null);

  // Clubes autorizados devueltos por el snapshot RPC (máxima fidelidad)
  const [authorizedClubs, setAuthorizedClubs] = useState<Array<{ organizadorId: string; jugadorId: string }>>([]);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Resolver asíncronamente nombres de clubes candidatos para no mostrar "Club"
  useEffect(() => {
    const orgIds: string[] = [];
    if (initialOrganizadorId) orgIds.push(initialOrganizadorId);
    if (participatingClubIds) orgIds.push(...participatingClubIds);
    if (linkedProfiles) {
      for (const p of linkedProfiles) {
        if (p.organizadorId) orgIds.push(p.organizadorId);
      }
    }
    for (const ac of authorizedClubs) {
      if (ac.organizadorId) orgIds.push(ac.organizadorId);
    }
    const unique = Array.from(new Set(orgIds.filter(Boolean)));
    let active = true;

    const fetchOrgName = (orgId: string) => {
      resolveOrganizerDisplayName(orgId)
        .then((name) => {
          if (active && isValidClubDisplayName(name)) {
            setResolvedNames((prev) => (prev[orgId] === name ? prev : { ...prev, [orgId]: name }));
          }
        })
        .catch(() => {});
    };

    for (const orgId of unique) {
      const cached = getCachedOrganizerDisplayName(orgId);
      if (cached && isValidClubDisplayName(cached)) {
        setResolvedNames((prev) => (prev[orgId] === cached ? prev : { ...prev, [orgId]: cached }));
        continue;
      }
      fetchOrgName(orgId);
    }

    return () => {
      active = false;
    };
  }, [initialOrganizadorId, participatingClubIds, linkedProfiles, authorizedClubs]);

  // Lista de clubes disponibles con nombres REALES filtrados (cero "Club")
  const availableClubs = useMemo(() => {
    const list: Array<{ organizadorId: string; jugadorId: string; displayName: string }> = [];
    const seen = new Set<string>();

    const addClub = (orgId: string, jId?: string) => {
      if (!orgId || seen.has(orgId)) return;

      const name =
        resolvedNames[orgId] ||
        (orgId === initialOrganizadorId && isValidClubDisplayName(propClubName) ? propClubName! : "") ||
        getCachedOrganizerDisplayName(orgId) ||
        getOrganizerDisplayNameSync(orgId);

      // Descartar placeholders genéricos como "Club"
      if (!isValidClubDisplayName(name)) {
        return;
      }

      seen.add(orgId);
      list.push({
        organizadorId: orgId,
        jugadorId: jId || jugadorId,
        displayName: name,
      });
    };

    // 1. Clubes explícitamente autorizados por la RPC snapshot (máxima prioridad)
    // Los premios son ÚNICAMENTE donde estén habilitados para el jugador
    if (authorizedClubs && authorizedClubs.length > 0) {
      for (const ac of authorizedClubs) {
        addClub(ac.organizadorId, ac.jugadorId);
      }
      return list;
    }

    // 2. Perfiles vinculados por identidad multiclub
    if (linkedProfiles && linkedProfiles.length > 0) {
      for (const p of linkedProfiles) {
        addClub(p.organizadorId, p.jugadorId);
      }
    }

    // 3. Clubes donde el jugador participa en eventos
    if (participatingClubIds && participatingClubIds.length > 0) {
      for (const orgId of participatingClubIds) {
        addClub(orgId, jugadorId);
      }
    }

    // 4. Club inicial del prop
    if (initialOrganizadorId) {
      addClub(initialOrganizadorId, jugadorId);
    }

    return list;
  }, [
    authorizedClubs,
    linkedProfiles,
    participatingClubIds,
    initialOrganizadorId,
    propClubName,
    jugadorId,
    resolvedNames,
  ]);

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

  const currentClubDisplayName = useMemo(() => {
    if (activeClub?.displayName && isValidClubDisplayName(activeClub.displayName)) {
      return activeClub.displayName;
    }
    if (propClubName && isValidClubDisplayName(propClubName)) {
      return propClubName;
    }
    const fromResolved = activeOrgId ? resolvedNames[activeOrgId] : "";
    if (isValidClubDisplayName(fromResolved)) {
      return fromResolved;
    }
    const fromCache = activeOrgId ? getCachedOrganizerDisplayName(activeOrgId) : null;
    if (isValidClubDisplayName(fromCache)) {
      return fromCache!;
    }
    const sync = getOrganizerDisplayNameSync(activeOrgId);
    if (isValidClubDisplayName(sync)) {
      return sync;
    }
    return "";
  }, [activeClub, propClubName, activeOrgId, resolvedNames]);

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
  const [publicSummary, setPublicSummary] = useState<PlayerPublicSummaryItem[] | null>(null);
  const hasTriedFallbackRef = React.useRef(false);

  useEffect(() => {
    let active = true;
    try {
      const p = playerPublicSummary(activeJugadorId, activeOrgId || undefined);
      if (p && typeof p.then === "function") {
        p.then((items) => {
          if (active) setPublicSummary(items || []);
        }).catch(() => {
          if (active) setPublicSummary([]);
        });
      } else {
        setPublicSummary([]);
      }
    } catch {
      if (active) setPublicSummary([]);
    }
    return () => {
      active = false;
    };
  }, [activeJugadorId, activeOrgId]);

  const prevInitialOrgRef = React.useRef(initialOrganizadorId);
  useEffect(() => {
    if (initialOrganizadorId !== prevInitialOrgRef.current) {
      prevInitialOrgRef.current = initialOrganizadorId;
      if (initialOrganizadorId) {
        setActiveOrgId(initialOrganizadorId);
      }
    }
  }, [initialOrganizadorId]);

  useEffect(() => {
    if (propParticipaciones && propParticipaciones.length > 0) {
      setParts(propParticipaciones);
    }
  }, [propParticipaciones]);

  const availableClubsRef = React.useRef(availableClubs);
  availableClubsRef.current = availableClubs;

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

    const loadData = async () => {
      try {
        let data: PlayerSnapshot;
        try {
          data = await playerSnapshot(activeJugadorId, activeOrgId || undefined);
        } catch (initialErr: unknown) {
          const msg = initialErr instanceof Error ? initialErr.message : String(initialErr);
          const isLinkError =
            msg.includes("no está vinculada") ||
            msg.includes("Sin sesión") ||
            msg.includes("Sin permiso");

          if (isLinkError) {
            // 1. Si el perfil tiene otros clubes vinculados en availableClubs, intentar con el siguiente
            const otherClub = availableClubsRef.current.find((c) => c.organizadorId !== activeOrgId);
            if (otherClub && otherClub.organizadorId && !hasTriedFallbackRef.current) {
              hasTriedFallbackRef.current = true;
              setActiveOrgId(otherClub.organizadorId);
              return;
            }

            let fallbackData: PlayerSnapshot | null = null;

            // 2. Si no hay otro club o ya se intentó, consultar globalmente sin org (RPC 0059 multiclub)
            try {
              fallbackData = await playerSnapshot(activeJugadorId, undefined);
            } catch {
              // Continuar con perfiles vinculados
            }

            // 3. Probar con perfiles vinculados por identidad multiclub si aún no se tiene
            if (!fallbackData && linkedProfiles && linkedProfiles.length > 0) {
              for (const lp of linkedProfiles) {
                if (lp.organizadorId === activeOrgId) continue;
                try {
                  fallbackData = await playerSnapshot(lp.jugadorId, lp.organizadorId);
                  if (fallbackData) break;
                } catch {
                  // Continuar
                }
              }
            }

            if (fallbackData) {
              data = fallbackData;
            } else {
              throw initialErr;
            }
          } else {
            throw initialErr;
          }
        }

        if (!active) return;
        setSnapshot(data);

        // Si el snapshot devolvió un club autorizado y activo distinto, sincronizamos
        if (data.organizador_id && data.organizador_id !== activeOrgId) {
          setActiveOrgId(data.organizador_id);
        }

        if (data.clubes_autorizados && data.clubes_autorizados.length > 0) {
          setAuthorizedClubs((prev) => {
            const next = data.clubes_autorizados!.map((c) => ({
              organizadorId: c.organizador_id,
              jugadorId: c.jugador_id,
            }));
            if (
              prev.length === next.length &&
              prev.every(
                (p, i) =>
                  p.organizadorId === next[i].organizadorId &&
                  p.jugadorId === next[i].jugadorId
              )
            ) {
              return prev;
            }
            return next;
          });
        }

        if (data.saldos && data.saldos.length > 0) {
          const activeCamp =
            data.saldos.find((s) => s.fase === "canje") ||
            data.saldos.find((s) => s.fase === "acumulacion") ||
            data.saldos[0];
          setSelectedCampaignId(activeCamp.campaign_id);
        }
      } catch (err: unknown) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("no está vinculada") ||
          msg.includes("Sin sesión") ||
          msg.includes("Sin permiso")
        ) {
          setUnlinked(true);
        } else {
          setError(msg);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [activeJugadorId, activeOrgId, user, linkedProfiles]);

  const handleSelectClub = (orgId: string) => {
    if (orgId !== activeOrgId) {
      hasTriedFallbackRef.current = true;
      setActiveOrgId(orgId);
      setSnapshot(null);
      setUnlinked(false);
      setError(null);
      setActionMessage(null);
    }
  };

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

  // 1. Resumen público de puntos (solo lectura) cuando no hay sesión o está desvinculado,
  // pero el jugador tiene puntos registrados en la campaña/club (ej. Lalo B en Padelito Warehouse)
  if ((!user || unlinked) && publicSummary && publicSummary.length > 0) {
    const selectedPublic =
      publicSummary.find((p) => p.campaign_id === selectedCampaignId) || publicSummary[0];
    const displayClub =
      selectedPublic.club_nombre || currentClubDisplayName || "Club sede";

    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-compact-card rrw-player-panel">
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
                    onClick={() => handleSelectClub(club.organizadorId)}
                  >
                    <TablerIcon name="building-community" size={13} />
                    {club.displayName}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rrw-compact-header">
            <div>
              <span className="rrw-kicker">Riviera Rewards</span>
              <h2 className="rrw-compact-title">{selectedPublic.campaign_nombre}</h2>
            </div>
            <span className="rrw-badge rrw-badge--neutral">
              {selectedPublic.fase === "canje" ? "Ventana de canje abierta" : "Fase de acumulación"}
            </span>
          </div>

          {publicSummary.length > 1 && (
            <div className="rrw-campaign-selector" style={{ display: "flex", gap: "0.4rem", margin: "0.35rem 0" }}>
              {publicSummary.map((c) => (
                <button
                  key={c.campaign_id}
                  type="button"
                  className={`rrw-campaign-pill ${c.campaign_id === selectedPublic.campaign_id ? "rrw-campaign-pill--active" : ""}`}
                  onClick={() => setSelectedCampaignId(c.campaign_id)}
                >
                  {c.campaign_nombre}
                </button>
              ))}
            </div>
          )}

          <div className="rrw-kpi-grid">
            <div className="rrw-kpi-card">
              <span className="rrw-kpi-label">Puntos acumulados</span>
              <strong className="rrw-kpi-value">{selectedPublic.puntos_acumulados}</strong>
              <span className="rrw-kpi-hint">Generados en retas de {displayClub}</span>
            </div>
            <div className="rrw-kpi-card">
              <span className="rrw-kpi-label">Saldo canjeable</span>
              <strong className="rrw-kpi-value">{selectedPublic.puntos_disponibles}</strong>
              <span className="rrw-kpi-hint">
                {selectedPublic.fase === "canje" ? "Disponible para premios" : "Habilitado al abrir canje"}
              </span>
            </div>
          </div>

          <div
            className="rrw-public-dates-box"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              padding: "0.6rem 0.8rem",
              background: "var(--surface-1, rgba(255, 255, 255, 0.025))",
              border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.05))",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "0.76rem",
              color: "var(--text-secondary, #b0b7c3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Período de acumulación:</span>
              <strong style={{ color: "var(--text-primary, #ffffff)" }}>
                {formatMexicoDate(selectedPublic.acumula_desde)} al {formatMexicoDate(selectedPublic.acumula_hasta)}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Ventana de canje:</span>
              <strong style={{ color: "var(--text-primary, #ffffff)" }}>
                {formatMexicoDate(selectedPublic.canje_desde)} al {formatMexicoDate(selectedPublic.canje_hasta)}
              </strong>
            </div>
          </div>

          <div
            className="rrw-independence-disclaimer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.65rem",
              borderRadius: "var(--radius-sm, 6px)",
              background: "var(--surface-2, rgba(255, 255, 255, 0.04))",
              fontSize: "0.72rem",
              color: "var(--text-muted, #8e95a0)",
              marginTop: "0.35rem",
            }}
          >
            <TablerIcon name="shield-lock" size={15} />
            <span>
              {`Solo lectura: Aquí puedes ver cuántos puntos has acumulado en la campaña. Solicita a ${displayClub} cambiar tus puntos por las promociones vigentes.`}
            </span>
          </div>
        </div>
      </section>
    );
  }

  // 2. Visitante sin sesión iniciada (sin puntos públicos)
  if (!user) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-compact-card rrw-guest-card">
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
                    onClick={() => handleSelectClub(club.organizadorId)}
                  >
                    <TablerIcon name="building-community" size={13} />
                    {club.displayName}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rrw-compact-header rrw-guest-badge">
            <span className="rrw-kicker">Riviera Rewards</span>
            <span className="rrw-badge rrw-badge--neutral">Programa Oficial</span>
          </div>
          <h2 className="rrw-compact-title rrw-guest-title">Programa de fidelización y recompensas</h2>
          <p className="rrw-compact-lead rrw-guest-text">
            Acumula puntos en cada reta con Riviera Rewards. Los jugadores acumulan beneficios exclusivos organizados por los clubes sede, de forma independiente al ranking deportivo.
          </p>

          <ul className="rrw-compact-benefits">
            <li>
              <TablerIcon name="award" size={14} className="rrw-bullet-icon" />
              <div>
                <strong>Puntos en retas</strong> · Acumula en eventos oficiales de {currentClubDisplayName || "cada club"}.
              </div>
            </li>
            <li>
              <TablerIcon name="gift" size={14} className="rrw-bullet-icon" />
              <div>
                <strong>Premios y experiencias</strong> · Catálogo de recompensas canjeables administrado por el club sede.
              </div>
            </li>
            <li>
              <TablerIcon name="device-gamepad-2" size={14} className="rrw-bullet-icon" />
              <div>
                <strong>Independiente del ranking</strong> · Tus puntos deportivos y tus puntos Rewards no se mezclan.
              </div>
            </li>
          </ul>

          <div className="rrw-compact-cta-wrap rrw-guest-action">
            <a href="/login" className="rrw-compact-btn rrw-guest-btn">
              <TablerIcon name="user-circle" size={15} />
              Iniciar sesión para consultar tus puntos
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
        <div className="rrw-compact-card rrw-guest-card">
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
                    onClick={() => handleSelectClub(club.organizadorId)}
                  >
                    <TablerIcon name="building-community" size={13} />
                    {club.displayName}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rrw-compact-header rrw-guest-badge">
            <span className="rrw-kicker">Riviera Rewards</span>
            <span className="rrw-badge rrw-badge--neutral">Programa Oficial</span>
          </div>
          <h2 className="rrw-compact-title rrw-guest-title">Puntos y Recompensas del Club</h2>
          <p className="rrw-compact-lead rrw-guest-text">
            Los saldos y canjes de Riviera Rewards son personales y se acumulan en retas y torneos oficiales organizados por cada club sede, de forma independiente al ranking deportivo.
          </p>

          <ul className="rrw-compact-benefits">
            <li>
              <TablerIcon name="award" size={14} className="rrw-bullet-icon" />
              <div>
                <strong>Puntos por participación</strong> · Acumula en cada reta oficial de {currentClubDisplayName || "tu club sede"}.
              </div>
            </li>
            <li>
              <TablerIcon name="gift" size={14} className="rrw-bullet-icon" />
              <div>
                <strong>Premios exclusivos</strong> · Canjea equipamiento, accesos y beneficios del club.
              </div>
            </li>
            <li>
              <TablerIcon name="shield-check" size={14} className="rrw-bullet-icon" />
              <div>
                <strong>Saldos por club</strong> · Puntos separados por organizador, sin alterar tu puntaje deportivo.
              </div>
            </li>
          </ul>

          <div className="rrw-compact-guide rrw-unlinked-guide">
            <div className="rrw-compact-guide-head rrw-unlinked-guide-header">
              <TablerIcon name="user-check" size={15} className="rrw-guide-icon" />
              <strong>¿Eres el propietario de este perfil?</strong>
            </div>
            <p className="rrw-compact-guide-body rrw-unlinked-guide-text">
              Para consultar tu saldo de puntos y solicitar premios en {currentClubDisplayName || "este club"}, solicita en la administración o recepción del club organizador que vinculen tu cuenta ({user?.email || "tu correo"}) a tu perfil de Riviera Rewards.
            </p>
            <span className="rrw-unlinked-guide-subtext">
              Procedimiento oficial de vinculación verificado por el club sede.
            </span>
          </div>
        </div>
      </section>
    );
  }

  // 3. Cargando información de Rewards
  if (loading && !snapshot) {
    return (
      <section className={`rjp-ficha-surface rjp-ficha-rewards ${className ?? ""}`} aria-label="Riviera Rewards">
        <div className="rrw-compact-card rrw-compact-card--loading">
          <p className="rrw-kicker">Riviera Rewards</p>
          <p className="rrw-compact-loading-text">
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
        <div className="rrw-compact-card">
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
        <div className="rrw-compact-card">
          <p className="rrw-kicker">Riviera Rewards</p>
          <h2 className="rrw-compact-title rrw-card-title">Club de Recompensas</h2>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
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
      <div className="rrw-compact-card rrw-player-panel">
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
                  onClick={() => handleSelectClub(club.organizadorId)}
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

        {/* Separación estricta entre puntos deportivos y Rewards */}
        <div className="rrw-independence-disclaimer" role="note">
          <TablerIcon name="info-circle" size={14} />
          <span>
            Los puntos Riviera Rewards son exclusivos para canjes de fidelización en este club y se administran de forma independiente al puntaje del ranking deportivo.
          </span>
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
                const progressPts =
                  selectedBalance.fase === "canje"
                    ? selectedBalance.disponible
                    : selectedBalance.acumulando;
                const missingPts = Math.max(0, reward.costo_puntos - progressPts);

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
                          : missingPts > 0
                          ? `Faltan ${missingPts} pts`
                          : selectedBalance.fase !== "canje"
                          ? "Pendiente de apertura de canje"
                          : reward.inventario_restante != null
                          ? `${reward.inventario_restante} disponibles`
                          : "Disponible"}
                      </span>

                      <Button
                        variant={canRedeem ? "primary" : "secondary"}
                        size="sm"
                        disabled={busyRewardId === reward.id || !canRedeem}
                        onClick={() => {
                          if (!canRedeem) return;
                          handleRequestRedemption(reward);
                        }}
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
  const [catalogCampaignId, setCatalogCampaignId] = useState("");
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

  const visibleCampaigns = useMemo(
    () => catalogCampaigns(campaigns, organizadorId),
    [campaigns, organizadorId]
  );

  const activeCatalogCampaign = useMemo(() => {
    if (catalogCampaignId) {
      const explicit = visibleCampaigns.find((item) => item.id === catalogCampaignId);
      if (explicit) return explicit;
    }
    if (redeeming?.campaign_id) {
      const fromRedeeming = visibleCampaigns.find((item) => item.id === redeeming.campaign_id);
      if (fromRedeeming) return fromRedeeming;
    }
    if (accruing?.campaign_id) {
      const fromAccruing = visibleCampaigns.find((item) => item.id === accruing.campaign_id);
      if (fromAccruing) return fromAccruing;
    }
    return visibleCampaigns[0] ?? null;
  }, [catalogCampaignId, redeeming, accruing, visibleCampaigns]);

  const catalog = useMemo(() => {
    if (!activeCatalogCampaign) return null;
    return buildCampaignCatalog({
      campaign: activeCatalogCampaign,
      rewards,
      balances,
      redemptions,
      organizadorId,
    });
  }, [activeCatalogCampaign, rewards, balances, redemptions, organizadorId]);

  const selectedCatalogItem = useMemo(
    () => catalog?.items.find((item) => item.reward.id === rewardId) ?? null,
    [catalog, rewardId]
  );
  const canRequest = Boolean(selectedCatalogItem?.canRedeem);

  useEffect(() => {
    setRewardId("");
  }, [organizadorId, jugadorId, activeCatalogCampaign?.id]);

  useEffect(() => {
    if (!rewardId) return;
    if (!selectedCatalogItem || !selectedCatalogItem.canRedeem) {
      setRewardId("");
    }
  }, [rewardId, selectedCatalogItem]);

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
            <div className="rrw-catalog-head">
              <div>
                <h3 className="rrw-sub-title" style={{ marginBottom: "0.15rem" }}>Canjes de Premios</h3>
                {catalog && (
                  <p className="rrw-catalog-context">
                    <strong>{catalog.campaign.nombre}</strong>
                    {" · "}
                    {catalog.phase === "canje"
                      ? `Ventana de canje abierta (${catalog.points} pts disponibles)`
                      : catalog.campaign.canje_desde && !Number.isNaN(new Date(catalog.campaign.canje_desde).getTime())
                      ? `En acumulación (${catalog.points} pts acumulados · Canje desde ${formatMexicoDate(catalog.campaign.canje_desde)})`
                      : `En acumulación (${catalog.points} pts acumulados)`}
                  </p>
                )}
              </div>
              {visibleCampaigns.length > 1 && (
                <div className="rrw-campaign-selector" role="tablist" aria-label="Campaña del catálogo">
                  {visibleCampaigns.map((camp) => (
                    <button
                      key={camp.id}
                      type="button"
                      role="tab"
                      aria-selected={activeCatalogCampaign?.id === camp.id}
                      className={`rrw-campaign-pill ${activeCatalogCampaign?.id === camp.id ? "rrw-campaign-pill--active" : ""}`}
                      onClick={() => {
                        setCatalogCampaignId(camp.id);
                        setRewardId("");
                      }}
                    >
                      {camp.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {catalog && catalog.items.length > 0 && (
              <ul className="rrw-catalog-list" aria-label="Catálogo de premios de la campaña">
                {catalog.items.map((item) => (
                  <li
                    key={item.reward.id}
                    className={`rrw-catalog-item ${item.canRedeem ? "rrw-catalog-item--available" : "rrw-catalog-item--locked"}`}
                  >
                    <div className="rrw-catalog-row">
                      <div className="rrw-catalog-title-group">
                        <strong className="rrw-catalog-name">{item.reward.nombre}</strong>
                        <span className="rrw-catalog-cost">{item.reward.costo_puntos} pts</span>
                      </div>
                      <span className={rewardStatusBadgeClass(item.status)}>
                        {REWARD_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <div
                      className="rrw-progress-track"
                      role="progressbar"
                      aria-label={`Progreso para ${item.reward.nombre}`}
                      aria-valuenow={item.progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="rrw-progress-fill"
                        style={{ width: `${item.progressPct}%` }}
                      />
                    </div>
                    <div className="rrw-catalog-meta">
                      <span>
                        {item.points} / {item.reward.costo_puntos} pts{" "}
                        {catalog.pointsSource === "acumulando" ? "acumulados" : "disponibles"}
                      </span>
                      <span>{formatRewardProgressNote(item, catalog.phase)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="rrw-fields-row rrw-fields-row--2">
              <div className="rrw-field">
                <select
                  className="rrw-select"
                  value={rewardId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const target = catalog?.items.find((entry) => entry.reward.id === nextId);
                    setRewardId(target?.canRedeem ? nextId : "");
                  }}
                  aria-label="Premio en canje"
                >
                  <option value="">Selecciona premio...</option>
                  {(catalog?.items ?? []).map((item) => (
                    <option
                      key={item.reward.id}
                      value={item.reward.id}
                      disabled={!item.canRedeem}
                    >
                      {formatRewardOptionLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !canRequest}
                  onClick={() => {
                    if (!selectedCatalogItem || !selectedCatalogItem.canRedeem) return;
                    act(() => requestRedemption(organizadorId, selectedCatalogItem.reward.id, jugadorId));
                  }}
                >
                  Solicitar
                </Button>
              </div>
            </div>

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
