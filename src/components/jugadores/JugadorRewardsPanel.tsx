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
  formatWindowEnd,
  redeemingNow,
} from "../../lib/rewards/present";
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
}

export const JugadorRewardsPanel: React.FC<JugadorRewardsPanelProps> = ({
  jugadorId,
  organizadorId,
  mode,
  isGrantedReadOnly,
}) => {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [hidden, setHidden] = useState(mode === "player");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "player") return;
    let active = true;
    playerSnapshot(jugadorId)
      .then((data) => {
        if (!active) return;
        setSnapshot(data);
        setHidden(false);
      })
      .catch(() => {
        if (active) setHidden(true);
      });
    return () => {
      active = false;
    };
  }, [jugadorId, mode]);

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

  if (hidden || !snapshot) return null;
  const accruing = accumulatingNow(snapshot.saldos);
  const redeeming = redeemingNow(snapshot.saldos);
  const next = snapshot.premios.find((reward) => (redeeming?.disponible ?? 0) < reward.costo_puntos);

  return (
    <section className="rrw-card rrw-ficha-panel" aria-label="Riviera Rewards">
      <div className="rrw-card-header">
        <div>
          <p className="rrw-kicker">Riviera Rewards</p>
          <h2 className="rrw-card-title" style={{ fontSize: "1.25rem" }}>Tus puntos del club</h2>
        </div>
      </div>

      <div className="rrw-kpi-grid">
        <div className="rrw-kpi-card">
          <span className="rrw-kpi-label">Acumulando este mes</span>
          <span className="rrw-kpi-value">{accruing?.acumulando ?? 0}</span>
          <p className="rrw-kpi-note">{accruing ? `Para ${accruing.nombre}` : "No hay campaña acumulando"}</p>
        </div>
        <div className="rrw-kpi-card">
          <span className="rrw-kpi-label">Disponibles para canjear</span>
          <span className="rrw-kpi-value">{redeeming?.disponible ?? 0}</span>
          <p className="rrw-kpi-note">
            {redeeming
              ? `${redeeming.nombre} · Hasta ${formatWindowEnd(redeeming.canje_hasta)}`
              : "Sin ventana de canje activa"}
          </p>
        </div>
      </div>

      {next && redeeming && (
        <p style={{ margin: "0.65rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Te faltan {next.costo_puntos - redeeming.disponible} puntos para <strong>{next.nombre}</strong>.
        </p>
      )}

      <div className="rrw-sub-block">
        <h3 className="rrw-sub-title">Recompensas del Club</h3>
        {snapshot.premios.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            El club no tiene premios abiertos este mes.
          </p>
        ) : (
          <ul className="rrw-item-list">
            {snapshot.premios.map((reward) => {
              const canRedeem = (redeeming?.disponible ?? 0) >= reward.costo_puntos;
              return (
                <li key={reward.id} className="rrw-item-row">
                  <div>
                    <strong>{reward.nombre}</strong>
                    <span style={{ margin: "0 0.35rem", color: "var(--text-muted)" }}>·</span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{reward.costo_puntos} pts</span>
                  </div>
                  <Button
                    variant={canRedeem ? "primary" : "secondary"}
                    size="sm"
                    disabled={busy || !canRedeem}
                    onClick={() => {
                      setBusy(true);
                      setError(null);
                      playerRequestRedemption(snapshot.organizador_id, reward.id, jugadorId)
                        .then(() => playerSnapshot(jugadorId))
                        .then(setSnapshot)
                        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo solicitar"))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Solicitar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rrw-sub-block">
        <h3 className="rrw-sub-title">Historial de Canjes</h3>
        {snapshot.canjes.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Todavía no hay canjes registrados.
          </p>
        ) : (
          <ul className="rrw-item-list">
            {snapshot.canjes.map((item) => (
              <li key={item.id} className="rrw-item-row">
                <span>{item.nombre}</span>
                <span className="rrw-badge rrw-badge--neutral">{item.estado}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {snapshot.saldos.filter((row) => row.fase === "cerrada").length > 0 && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {snapshot.saldos.filter((row) => row.fase === "cerrada").slice(0, 4).map((row) => (
            <span key={row.campaign_id} style={{ marginRight: "0.75rem" }}>
              {row.nombre}: {row.utilizado} utilizados, {row.cerrado} cerrados.
            </span>
          ))}
        </div>
      )}

      <p style={{ margin: "0.85rem 0 0", fontSize: "0.76rem", color: "var(--text-muted)" }}>
        Seguir jugando no descuenta puntos. Solo una solicitud confirmada por el club los reserva.
      </p>

      {error && (
        <div className="rrw-error-banner" style={{ marginTop: "0.75rem" }}>
          <TablerIcon name="alert-triangle" size={16} />
          <span className="rrw-error-text">{error}</span>
        </div>
      )}
    </section>
  );
};

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
