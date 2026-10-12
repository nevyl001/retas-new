import React, { useEffect, useState } from "react";
import {
  cancelRedemption,
  confirmRedemption,
  listCampaigns,
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
  type CampaignRecord,
  type PlayerSnapshot,
  type RedemptionRecord,
  type RewardRecord,
} from "../../lib/rewards/api";
import { accumulatingNow, formatWindowEnd, redeemingNow } from "../../lib/rewards/present";
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
    <section className="rrw-card rrw-ficha" aria-label="Riviera Rewards">
      <p className="rrw-kicker">Riviera Rewards</p>
      <h2 className="rrw-title" style={{ fontSize: "1.35rem" }}>Tus puntos del club</h2>
      <div className="rrw-balances">
        <div className="rrw-balance">
          <span>Acumulando este mes</span>
          <strong>{accruing?.acumulando ?? 0}</strong>
          <p className="rrw-meta">{accruing ? `Para los premios de ${accruing.nombre}.` : "No hay una campaña acumulando."}</p>
        </div>
        <div className="rrw-balance">
          <span>Disponibles para canjear</span>
          <strong>{redeeming?.disponible ?? 0}</strong>
          <p className="rrw-meta">
            {redeeming
              ? `${redeeming.nombre}. Fecha límite: ${formatWindowEnd(redeeming.canje_hasta)}.`
              : "No hay puntos en ventana de canje."}
          </p>
        </div>
      </div>
      {next && redeeming && (
        <p className="rrw-meta">
          Te faltan {next.costo_puntos - redeeming.disponible} puntos para {next.nombre}.
        </p>
      )}
      <h3>Recompensas</h3>
      {snapshot.premios.length === 0 && <p className="rrw-meta">El club no tiene premios abiertos este mes.</p>}
      <ul className="rrw-list">
        {snapshot.premios.map((reward) => (
          <li key={reward.id}>
            <span>{reward.nombre} · {reward.costo_puntos} pts</span>
            <button
              type="button"
              className="rrw-btn"
              disabled={busy || (redeeming?.disponible ?? 0) < reward.costo_puntos}
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
            </button>
          </li>
        ))}
      </ul>
      <h3>Historial</h3>
      {snapshot.canjes.length === 0 && <p className="rrw-meta">Todavía no hay canjes.</p>}
      <ul className="rrw-list">
        {snapshot.canjes.map((item) => (
          <li key={item.id}><span>{item.nombre}</span><span>{item.estado}</span></li>
        ))}
      </ul>
      {snapshot.saldos.filter((row) => row.fase === "cerrada").slice(0, 4).map((row) => (
        <p key={row.campaign_id} className="rrw-meta">
          {row.nombre}: {row.utilizado} utilizados, {row.cerrado} cerrados.
        </p>
      ))}
      <p className="rrw-meta">Seguir jugando no descuenta puntos. Solo una solicitud confirmada por el club los reserva.</p>
      {error && <p className="rrw-error">{error}</p>}
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
  const [pending, setPending] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(
    () =>
      Promise.all([
        playerBalance(organizadorId, jugadorId),
        listCampaigns(organizadorId),
        listRewards(organizadorId),
        listRedemptions(organizadorId, jugadorId),
        listReviews(organizadorId, jugadorId),
      ]).then(([nextBalances, nextCampaigns, nextRewards, nextRedemptions, reviews]) => {
        setBalances(nextBalances);
        setCampaigns(nextCampaigns);
        setRewards(nextRewards);
        setRedemptions(nextRedemptions);
        setPending(
          reviews.filter((review) => review.estado === "pendiente").map((review) => review.participacion_id)
        );
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
    redemptions.length > 0;

  return (
    <section className="rrw-card rrw-ficha" aria-label="Riviera Rewards">
      <p className="rrw-kicker">Riviera Rewards</p>
      <h2 className="rrw-title" style={{ fontSize: "1.25rem" }}>Puntos del jugador</h2>
      <p className="rrw-meta">Independientes del ranking deportivo. Seguir acumulando no descuenta puntos.</p>
      <div className="rrw-balances">
        <div>
          <span>Acumulando</span>
          <strong>{accruing?.acumulando ?? 0}</strong>
        </div>
        <div>
          <span>Disponibles</span>
          <strong>{redeeming?.disponible ?? 0}</strong>
          {redeeming && <p className="rrw-meta">Hasta {formatWindowEnd(redeeming.canje_hasta)}</p>}
        </div>
        <div>
          <span>Reservados</span>
          <strong>{redeeming?.reservado ?? 0}</strong>
        </div>
      </div>

      {isGrantedReadOnly && !hasLocalActivity ? (
        <p className="rrw-meta" style={{ marginTop: "0.85rem" }}>
          Jugador vinculado desde otro club sin participaciones ni saldo en este club. Los puntos de su club de origen son privados.
        </p>
      ) : (
        <>
          <p className="rrw-meta">Pendientes de validar: {pending.length}</p>
          <label className="rrw-fields">Campaña
            <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">Elige</option>
              {campaigns.filter((item) => item.estado === "activa").map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rrw-btn"
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
          </button>
          <label className="rrw-fields">Premio en canje
            <select value={rewardId} onChange={(event) => setRewardId(event.target.value)}>
              <option value="">Elige</option>
              {openRewards.map((reward) => (
                <option key={reward.id} value={reward.id}>{reward.nombre} · {reward.costo_puntos}</option>
              ))}
            </select>
          </label>
          {rewardId && selectedReward && !canRequest && (
            <p className="rrw-meta">
              Puntos insuficientes ({redeeming?.disponible ?? 0} de {selectedReward.costo_puntos} pts necesarios).
            </p>
          )}
          <button
            type="button"
            className="rrw-btn--ghost"
            disabled={busy || !canRequest}
            onClick={() => act(() => requestRedemption(organizadorId, rewardId, jugadorId))}
          >
            Solicitar
          </button>
          <ul className="rrw-list">
            {redemptions.map((item) => (
              <li key={item.id}>
                <span>{item.snapshot?.nombre ?? "Premio"} · {item.estado}</span>
                <span>
                  {item.estado === "solicitado" && <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={() => act(() => reserveRedemption(item.id))}>Reservar</button>}
                  {item.estado === "reservado" && <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={() => act(() => confirmRedemption(item.id))}>Entregar</button>}
                  {(item.estado === "solicitado" || item.estado === "reservado") && (
                    <button type="button" className="rrw-btn--danger" disabled={busy} onClick={() => act(() => cancelRedemption(item.id))}>Cancelar</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="rrw-error">{error}</p>}
    </section>
  );
}
