import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { navigateToAppHome } from "../../lib/appRouting";
import { REWARDS_MODALITIES } from "../../lib/rewards/campaigns";
import {
  assignBenefit,
  cancelRedemption,
  closeCampaigns,
  duplicateCampaign,
  linkPlayer,
  listBenefits,
  listCampaigns,
  listParticipaciones,
  listPlayers,
  listQueue,
  listRedemptions,
  listReviews,
  listRewards,
  playerBalance,
  processAccrualQueue,
  requestRedemption,
  reserveRedemption,
  confirmRedemption,
  reviewParticipations,
  saveCampaign,
  saveReward,
  statsRows,
  syncCandidates,
  listAdminPlayersRewards,
  listAdminIncidents,
  recoverParticipations,
  type BalanceRecord,
  type BenefitRecord,
  type CampaignRecord,
  type QueueRecord,
  type RedemptionRecord,
  type ReviewRecord,
  type RewardRecord,
  type AdminPlayersRewardsResponse,
  type AdminPlayerRewardsRow,
  type AdminIncidentsResponse,
} from "../../lib/rewards/api";
import {
  CAMPAIGN_STATE_LABELS,
  MODALITY_LABELS,
  REWARD_TYPE_LABELS,
  REWARD_TYPES,
  accumulatingNow,
  formatMexicoDate,
  formatWindowEnd,
  mexicoDateInput,
  mexicoDayAfter,
  mexicoDayStart,
  mexicoInclusiveEndInput,
  redeemingNow,
  suggestDuplicateCampaign,
  summarizeRewards,
  type RewardType,
} from "../../lib/rewards/present";
import {
  REWARD_STATUS_LABELS,
  buildCampaignCatalog,
  catalogCampaigns,
  formatRewardOptionLabel,
  formatRewardProgressNote,
  rewardStatusBadgeClass,
} from "../../lib/rewards/rewardCatalog";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import { parseRewardsArea, rewardsAreaPath, navigateRewards, type RewardsArea } from "./rewardsNav";
import "./rewards.css";

interface RewardsPageProps {
  pathname: string;
}

const AREAS: { id: RewardsArea; label: string; icon: string }[] = [
  { id: "campanas", label: "Campañas", icon: "calendar" },
  { id: "premios", label: "Premios", icon: "gift" },
  { id: "jugadores", label: "Jugadores y canjes", icon: "users" },
  { id: "estadisticas", label: "Estadísticas", icon: "chart-bar" },
];

export const RewardsPage: React.FC<RewardsPageProps> = ({ pathname }) => {
  const { user } = useUser();
  const orgId = user?.id ?? "";
  const area = parseRewardsArea(pathname);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [queue, setQueue] = useState<QueueRecord[]>([]);
  const [players, setPlayers] = useState<{ id: string; nombre: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<void> } | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    const [nextCampaigns, nextRewards, nextQueue, nextPlayers] = await Promise.all([
      listCampaigns(orgId),
      listRewards(orgId),
      listQueue(orgId),
      listPlayers(orgId),
    ]);
    setCampaigns(nextCampaigns);
    setRewards(nextRewards);
    setQueue(nextQueue);
    setPlayers(nextPlayers);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    reload().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "No se pudo abrir Riviera Rewards");
    });
    return () => {
      active = false;
    };
  }, [orgId, reload]);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La operación no se completó");
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const ask = (title: string, body: string, task: () => Promise<void>) => {
    setConfirm({ title, body, run: () => run(task) });
  };

  const accruing = campaigns.filter((campaign) => campaignPhase(campaign) === "acumulacion" && campaign.estado === "activa");
  const redeeming = campaigns.filter((campaign) => campaignPhase(campaign) === "canje" && campaign.estado === "activa");

  return (
    <div className="rrw-page">
      <header className="rrw-header">
        <div className="rrw-back-wrap">
          <Button variant="back" onClick={() => navigateToAppHome()}>
            <TablerIcon name="arrow-left" size={16} />
            <span>Inicio</span>
          </Button>
        </div>
        <p className="rrw-kicker">Riviera Rewards</p>
        <h1 className="rrw-title">Campañas mensuales</h1>
        <p className="rrw-lead">
          Los puntos se acumulan durante el mes y se canjean en el mes siguiente. Cada campaña tiene su propio catálogo.
        </p>

        {(accruing.length > 0 || redeeming.length > 0) && (
          <div className="rrw-banner">
            <TablerIcon name="info-circle" size={18} />
            <div>
              {redeeming.length > 0
                ? `En canje: ${redeeming.map((item) => item.nombre).join(", ")}. `
                : "Ninguna campaña está en ventana de canje. "}
              {accruing.length > 0
                ? `Acumulando: ${accruing.map((item) => item.nombre).join(", ")}.`
                : "Ninguna campaña está acumulando ahora."}
            </div>
          </div>
        )}

        {queue.length > 0 && (
          <div className="rrw-banner">
            <TablerIcon name="clock" size={18} />
            <div>
              Hay {queue.filter((item) => item.estado === "pendiente").length} acreditaciones pendientes y{" "}
              {queue.filter((item) => item.estado === "error").length} con error. Procésalas desde Estadísticas.
            </div>
          </div>
        )}

        {error && (
          <div className="rrw-error-banner">
            <TablerIcon name="alert-triangle" size={18} />
            <span className="rrw-error-text">{error}</span>
          </div>
        )}

        {notice && (
          <div className="rrw-notice">
            <TablerIcon name="check" size={18} />
            <span>{notice}</span>
          </div>
        )}
      </header>

      <nav className="rrw-tabs-container" aria-label="Navegación de Riviera Rewards">
        <div className="rrw-tabs" role="tablist">
          {AREAS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={area === item.id}
              className={`rrw-tab${area === item.id ? " rrw-tab--active" : ""}`}
              onClick={() => navigateRewards(rewardsAreaPath(item.id))}
            >
              <TablerIcon name={item.icon} size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main>
        {area === "campanas" && (
          <CampaignsArea
            campaigns={campaigns}
            busy={busy}
            orgId={orgId}
            onSave={(payload) => run(async () => { await saveCampaign(payload); setNotice("Campaña guardada."); })}
            onDuplicate={(source) =>
              ask(
                "Duplicar campaña",
                "Se copian las reglas y los premios como borrador. No se copian puntos, participaciones ni canjes.",
                async () => {
                  const next = suggestDuplicateCampaign({
                    nombre: source.nombre,
                    acumulaDesde: source.acumula_desde,
                    acumulaHasta: source.acumula_hasta,
                    canjeDesde: source.canje_desde,
                    canjeHasta: source.canje_hasta,
                    puntosPorParticipacion: source.puntos_por_participacion,
                  });
                  await duplicateCampaign(source.id, next);
                  setNotice("Campaña duplicada en borrador.");
                }
              )
            }
            onState={(source, estado) =>
              run(async () => {
                await saveCampaign(campaignPayload(source, orgId, { estado }));
                setNotice(estado === "pausada" ? "Campaña pausada." : "Campaña actualizada.");
              })
            }
          />
        )}

        {area === "premios" && (
          <PrizeCatalogArea
            campaigns={campaigns}
            rewards={rewards}
            busy={busy}
            onSave={(payload) => run(async () => { await saveReward(payload); setNotice("Premio guardado. Los canjes ya solicitados conservan su ficha original."); })}
          />
        )}

        {area === "jugadores" && (
          <PlayersArea
            orgId={orgId}
            campaigns={campaigns}
            rewards={rewards}
            players={players}
            busy={busy}
            run={run}
            ask={ask}
            onNotice={setNotice}
          />
        )}

        {area === "estadisticas" && (
          <StatsArea
            orgId={orgId}
            players={players}
            queue={queue}
            busy={busy}
            onSync={() =>
              run(async () => {
                const found = await syncCandidates(orgId);
                setNotice(
                  found > 0
                    ? `Se recuperaron ${found} participaciones para validar. Todavía no tienen puntos.`
                    : "No había participaciones faltantes."
                );
              })
            }
            onProcess={() =>
              run(async () => {
                const done = await processAccrualQueue(orgId);
                setNotice(`Se procesaron ${done} acreditaciones de la cola.`);
              })
            }
            onClose={() =>
              ask(
                "Cerrar ventanas vencidas",
                "Los puntos no usados dejan de estar disponibles y queda un asiento de cierre. Las reservas ya hechas no se cancelan.",
                async () => {
                  const closed = await closeCampaigns(orgId);
                  setNotice(`Se cerraron ${closed} lotes.`);
                }
              )
            }
          />
        )}
      </main>

      {confirm && (
        <Modal
          open={Boolean(confirm)}
          onClose={() => setConfirm(null)}
          title={confirm.title}
          size="sm"
          footer={
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", width: "100%" }}>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                Volver
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const task = confirm.run;
                  setConfirm(null);
                  void task();
                }}
              >
                Confirmar
              </Button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {confirm.body}
          </p>
        </Modal>
      )}
    </div>
  );
};

function campaignPhase(campaign: CampaignRecord): "acumulacion" | "canje" | "cerrada" {
  const now = Date.now();
  if (now >= new Date(campaign.canje_hasta).getTime()) return "cerrada";
  if (now >= new Date(campaign.canje_desde).getTime()) return "canje";
  return "acumulacion";
}

function campaignPayload(
  source: Partial<CampaignRecord> & { nombre?: string },
  orgId: string,
  patch: Record<string, unknown> = {}
) {
  return {
    id: source.id,
    organizador_id: orgId,
    nombre: source.nombre,
    descripcion: source.descripcion ?? "",
    timezone: source.timezone ?? "America/Mexico_City",
    acumula_desde: source.acumula_desde,
    acumula_hasta: source.acumula_hasta,
    canje_desde: source.canje_desde,
    canje_hasta: source.canje_hasta,
    puntos_por_participacion: source.puntos_por_participacion,
    modalidades: source.modalidades,
    estado: source.estado,
    visible_jugadores: source.visible_jugadores ?? true,
    condiciones: source.condiciones ?? "",
    reserva_dias: source.reserva_dias ?? 7,
    validation_mode: "admin",
    ...patch,
  };
}

function CampaignsArea({
  campaigns,
  busy,
  orgId,
  onSave,
  onDuplicate,
  onState,
}: {
  campaigns: CampaignRecord[];
  busy: boolean;
  orgId: string;
  onSave: (payload: Record<string, unknown>) => void;
  onDuplicate: (campaign: CampaignRecord) => void;
  onState: (campaign: CampaignRecord, estado: string) => void;
}) {
  const [editing, setEditing] = useState<CampaignRecord | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section>
      <div className="rrw-area-toolbar">
        <div>
          <h2 className="rrw-area-title">Campañas configuradas</h2>
          <p className="rrw-area-sub">{campaigns.length} campaña{campaigns.length === 1 ? "" : "s"} en total</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <TablerIcon name="plus" size={16} />
          <span>Nueva campaña</span>
        </Button>
      </div>

      {open && (
        <CampaignForm
          orgId={orgId}
          campaign={editing}
          busy={busy}
          onCancel={() => setOpen(false)}
          onSave={(payload) => {
            onSave(payload);
            setOpen(false);
          }}
        />
      )}

      <div className="rrw-grid-2">
        {campaigns.map((campaign) => {
          const phase = campaignPhase(campaign);
          const phaseLabel = phase === "acumulacion" ? "Acumulando" : phase === "canje" ? "En canje" : "Cerrada";
          const stateLabel = CAMPAIGN_STATE_LABELS[campaign.estado as keyof typeof CAMPAIGN_STATE_LABELS] ?? campaign.estado;

          return (
            <article key={campaign.id} className="rrw-card">
              <div className="rrw-card-header">
                <h3 className="rrw-card-title">{campaign.nombre}</h3>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <span className={`rrw-badge ${phase === "acumulacion" || phase === "canje" ? "rrw-badge--active" : "rrw-badge--neutral"}`}>
                    {phaseLabel}
                  </span>
                  <span className="rrw-badge rrw-badge--ghost">
                    {stateLabel}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{campaign.puntos_por_participacion} pts</strong> por participación válida.
                </div>
                <div>
                  Acumulación hasta <strong>{formatWindowEnd(campaign.acumula_hasta)}</strong>. Canje hasta <strong>{formatWindowEnd(campaign.canje_hasta)}</strong>.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.2rem" }}>
                  {campaign.modalidades.map((item) => (
                    <span key={item} className="rrw-badge rrw-badge--neutral" style={{ fontSize: "0.68rem" }}>
                      {MODALITY_LABELS[item as keyof typeof MODALITY_LABELS] ?? item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rrw-card-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(campaign);
                    setOpen(true);
                  }}
                >
                  <TablerIcon name="edit" size={14} />
                  <span>Editar</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDuplicate(campaign)}
                >
                  <TablerIcon name="copy" size={14} />
                  <span>Duplicar</span>
                </Button>
                {campaign.estado === "activa" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onState(campaign, "pausada")}
                  >
                    <TablerIcon name="player-pause" size={14} />
                    <span>Pausar</span>
                  </Button>
                ) : campaign.estado !== "finalizada" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onState(campaign, "activa")}
                  >
                    <TablerIcon name="player-play" size={14} />
                    <span>Activar</span>
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {campaigns.length === 0 && !open && (
        <div className="rrw-empty-card">
          <TablerIcon name="calendar" size={32} />
          <p>Todavía no hay campañas configuradas.</p>
        </div>
      )}
    </section>
  );
}

function CampaignForm({
  orgId,
  campaign,
  busy,
  onCancel,
  onSave,
}: {
  orgId: string;
  campaign: CampaignRecord | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const today = mexicoDateInput(new Date().toISOString());
  const [nombre, setNombre] = useState(campaign?.nombre ?? "");
  const [puntos, setPuntos] = useState(String(campaign?.puntos_por_participacion ?? 10));
  const [acumulaDesde, setAcumulaDesde] = useState(campaign ? mexicoDateInput(campaign.acumula_desde) : today);
  const [acumulaHasta, setAcumulaHasta] = useState(campaign ? mexicoInclusiveEndInput(campaign.acumula_hasta) : today);
  const [canjeDesde, setCanjeDesde] = useState(campaign ? mexicoDateInput(campaign.canje_desde) : today);
  const [canjeHasta, setCanjeHasta] = useState(campaign ? mexicoInclusiveEndInput(campaign.canje_hasta) : today);
  const [mods, setMods] = useState<string[]>(campaign?.modalidades ?? ["reta_equipos"]);
  const [estado, setEstado] = useState(campaign?.estado ?? "borrador");
  const [visible, setVisible] = useState(campaign?.visible_jugadores ?? true);
  const [condiciones, setCondiciones] = useState(campaign?.condiciones ?? "");
  const [reserva, setReserva] = useState(String(campaign?.reserva_dias ?? 7));

  return (
    <form
      className="rrw-form-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          id: campaign?.id,
          organizador_id: orgId,
          nombre,
          timezone: "America/Mexico_City",
          acumula_desde: mexicoDayStart(acumulaDesde),
          acumula_hasta: mexicoDayAfter(acumulaHasta),
          canje_desde: mexicoDayStart(canjeDesde),
          canje_hasta: mexicoDayAfter(canjeHasta),
          puntos_por_participacion: Number(puntos),
          modalidades: mods,
          estado,
          visible_jugadores: visible,
          condiciones,
          reserva_dias: Number(reserva),
          validation_mode: "admin",
        });
      }}
    >
      <div className="rrw-form-header">
        <h3 className="rrw-form-title">{campaign ? "Editar campaña" : "Nueva campaña mensual"}</h3>
        <p className="rrw-form-desc">Define las ventanas de acumulación, canje y reglas de puntos.</p>
      </div>

      <fieldset className="rrw-fieldset">
        <legend className="rrw-legend">Identidad y Estado</legend>
        <div className="rrw-fields-row rrw-fields-row--3">
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-nombre">Nombre de campaña</label>
            <input
              id="camp-nombre"
              className="rrw-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Octubre 2026"
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-puntos">Puntos por participación</label>
            <input
              id="camp-puntos"
              className="rrw-input"
              type="number"
              min={1}
              value={puntos}
              onChange={(e) => setPuntos(e.target.value)}
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-estado">Estado</label>
            <select
              id="camp-estado"
              className="rrw-select"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              {Object.entries(CAMPAIGN_STATE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="rrw-fieldset">
        <legend className="rrw-legend">Ventanas de Tiempo</legend>
        <div className="rrw-fields-row rrw-fields-row--2">
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-acum-desde">Acumula desde</label>
            <input
              id="camp-acum-desde"
              className="rrw-input"
              type="date"
              value={acumulaDesde}
              onChange={(e) => setAcumulaDesde(e.target.value)}
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-acum-hasta">Último día de acumulación</label>
            <input
              id="camp-acum-hasta"
              className="rrw-input"
              type="date"
              value={acumulaHasta}
              onChange={(e) => setAcumulaHasta(e.target.value)}
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-canje-desde">Canje desde</label>
            <input
              id="camp-canje-desde"
              className="rrw-input"
              type="date"
              value={canjeDesde}
              onChange={(e) => setCanjeDesde(e.target.value)}
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-canje-hasta">Último día de canje</label>
            <input
              id="camp-canje-hasta"
              className="rrw-input"
              type="date"
              value={canjeHasta}
              onChange={(e) => setCanjeHasta(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="rrw-fields-row rrw-fields-row--2" style={{ marginTop: "0.75rem" }}>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="camp-reserva">Días para recoger una reserva</label>
            <input
              id="camp-reserva"
              className="rrw-input"
              type="number"
              min={1}
              value={reserva}
              onChange={(e) => setReserva(e.target.value)}
            />
          </div>
          <div className="rrw-field" style={{ justifyContent: "center" }}>
            <label className="rrw-chip-toggle" style={{ marginTop: "1rem" }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              <span>Visible para el jugador vinculado</span>
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className="rrw-fieldset">
        <legend className="rrw-legend">Modalidades Participantes</legend>
        <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Selecciona qué modalidades deportivas del club otorgan puntos en esta campaña:
        </p>
        <div className="rrw-chips-grid">
          {REWARDS_MODALITIES.map((modality) => {
            const isChecked = mods.includes(modality);
            return (
              <label key={modality} className={`rrw-chip-toggle${isChecked ? " is-checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) =>
                    setMods((current) =>
                      e.target.checked ? [...current, modality] : current.filter((item) => item !== modality)
                    )
                  }
                />
                <span>{MODALITY_LABELS[modality]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="rrw-field" style={{ marginBottom: "1rem" }}>
        <label className="rrw-label" htmlFor="camp-condiciones">Condiciones y Reglas Especiales</label>
        <textarea
          id="camp-condiciones"
          className="rrw-textarea"
          value={condiciones}
          onChange={(e) => setCondiciones(e.target.value)}
          placeholder="Términos, vigencia de canjes o restricciones del club..."
          rows={3}
        />
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          Si la campaña ya tiene puntos o canjes, el servidor rechaza cambiar fechas o puntos por participación.
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={busy || mods.length === 0}>
          Guardar campaña
        </Button>
      </div>
    </form>
  );
}

function PrizeCatalogArea({
  campaigns,
  rewards,
  busy,
  onSave,
}: {
  campaigns: CampaignRecord[];
  rewards: RewardRecord[];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const currentCampaignId = campaignId || campaigns[0]?.id || "";
  const [editing, setEditing] = useState<RewardRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = rewards.filter((reward) => reward.campaign_id === currentCampaignId);

  return (
    <section>
      <div className="rrw-area-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h2 className="rrw-area-title">Catálogo de Premios</h2>
            <p className="rrw-area-sub">{visible.length} premio{visible.length === 1 ? "" : "s"} en esta campaña</p>
          </div>
          <div style={{ minWidth: "200px" }}>
            <select
              className="rrw-select"
              value={currentCampaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              aria-label="Campaña seleccionada"
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!currentCampaignId}
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          <TablerIcon name="plus" size={16} />
          <span>Nuevo premio</span>
        </Button>
      </div>

      {(creating || editing) && currentCampaignId && (
        <RewardForm
          key={editing?.id ?? "new"}
          campaignId={currentCampaignId}
          reward={editing}
          busy={busy}
          onSave={(payload) => {
            setCreating(false);
            setEditing(null);
            onSave(payload);
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <div className="rrw-grid-3">
        {visible.map((reward) => (
          <article key={reward.id} className="rrw-card rrw-prize-card">
            <div>
              <div className="rrw-card-header">
                <div className="rrw-prize-cost-block">
                  <span className="rrw-prize-cost">{reward.costo_puntos}</span>
                  <span className="rrw-prize-cost-unit">PTS</span>
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <span className="rrw-badge rrw-badge--neutral">
                    {REWARD_TYPE_LABELS[reward.tipo as RewardType] ?? reward.tipo}
                  </span>
                  <span className="rrw-badge rrw-badge--ghost">
                    {reward.estado}
                  </span>
                </div>
              </div>
              <h3 className="rrw-card-title">{reward.nombre}</h3>
              {reward.descripcion && <p className="rrw-prize-meta">{reward.descripcion}</p>}
              <p className="rrw-prize-meta" style={{ color: "var(--text-muted)" }}>
                {reward.inventario_restante != null
                  ? `Inventario restante: ${reward.inventario_restante}`
                  : "Inventario ilimitado"}
              </p>
            </div>

            <div className="rrw-card-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  setEditing(reward);
                }}
              >
                <TablerIcon name="edit" size={14} />
                <span>Editar</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onSave({
                    campaign_id: reward.campaign_id,
                    nombre: `${reward.nombre} (copia)`,
                    descripcion: reward.descripcion ?? "",
                    costo_puntos: reward.costo_puntos,
                    tipo: reward.tipo,
                    cantidad: reward.cantidad ?? "",
                    inventario: reward.inventario ?? "",
                    limite_por_jugador: reward.limite_por_jugador ?? "",
                    condiciones: reward.condiciones ?? "",
                    estado: "borrador",
                  })
                }
              >
                <TablerIcon name="copy" size={14} />
                <span>Duplicar</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSave({ ...reward, estado: reward.estado === "activo" ? "pausado" : "activo" })}
              >
                {reward.estado === "activo" ? "Pausar" : "Activar"}
              </Button>
            </div>
          </article>
        ))}
      </div>

      {visible.length === 0 && !creating && !editing && (
        <div className="rrw-empty-card">
          <TablerIcon name="gift" size={32} />
          <p>No hay premios en esta campaña.</p>
        </div>
      )}
    </section>
  );
}

function RewardForm({
  campaignId,
  reward,
  busy,
  onSave,
  onCancel,
}: {
  campaignId: string;
  reward: RewardRecord | null;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(reward?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(reward?.descripcion ?? "");
  const [costo, setCosto] = useState(String(reward?.costo_puntos ?? ""));
  const [tipo, setTipo] = useState(reward?.tipo ?? "personalizado");
  const [inventario, setInventario] = useState(reward?.inventario == null ? "" : String(reward.inventario));
  const [limite, setLimite] = useState(reward?.limite_por_jugador == null ? "" : String(reward.limite_por_jugador));
  const [desde, setDesde] = useState(reward?.disponible_desde ? mexicoDateInput(reward.disponible_desde) : "");
  const [hasta, setHasta] = useState(reward?.disponible_hasta ? mexicoInclusiveEndInput(reward.disponible_hasta) : "");
  const [condiciones, setCondiciones] = useState(reward?.condiciones ?? "");
  const [estado, setEstado] = useState(reward?.estado ?? "borrador");

  return (
    <form
      className="rrw-form-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          id: reward?.id,
          campaign_id: campaignId,
          nombre,
          descripcion,
          costo_puntos: Number(costo),
          tipo,
          inventario,
          limite_por_jugador: limite,
          disponible_desde: desde ? mexicoDayStart(desde) : "",
          disponible_hasta: hasta ? mexicoDayAfter(hasta) : "",
          condiciones,
          estado,
        });
      }}
    >
      <div className="rrw-form-header">
        <h3 className="rrw-form-title">{reward ? "Editar premio" : "Nuevo premio en catálogo"}</h3>
        <p className="rrw-form-desc">Configura los puntos requeridos, stock y condiciones del premio.</p>
      </div>

      <fieldset className="rrw-fieldset">
        <legend className="rrw-legend">Identidad del Premio</legend>
        <div className="rrw-fields-row rrw-fields-row--3">
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-nombre">Nombre del premio</label>
            <input
              id="rew-nombre"
              className="rrw-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Bote de pelotas, Reta gratis..."
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-costo">Puntos necesarios</label>
            <input
              id="rew-costo"
              className="rrw-input"
              type="number"
              min={1}
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="Ej. 100"
              required
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-tipo">Tipo de recompensa</label>
            <select
              id="rew-tipo"
              className="rrw-select"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {REWARD_TYPES.map((item) => (
                <option key={item} value={item}>{REWARD_TYPE_LABELS[item]}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="rrw-fieldset">
        <legend className="rrw-legend">Disponibilidad e Inventario</legend>
        <div className="rrw-fields-row rrw-fields-row--3">
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-inventario">Inventario total</label>
            <input
              id="rew-inventario"
              className="rrw-input"
              value={inventario}
              onChange={(e) => setInventario(e.target.value)}
              placeholder="Sin límite"
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-limite">Límite por jugador</label>
            <input
              id="rew-limite"
              className="rrw-input"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              placeholder="Sin límite"
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-estado">Estado</label>
            <select
              id="rew-estado"
              className="rrw-select"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="borrador">Borrador</option>
              <option value="activo">Activo</option>
              <option value="pausado">Pausado</option>
              <option value="retirado">Retirado</option>
            </select>
          </div>
        </div>
        <div className="rrw-fields-row rrw-fields-row--2" style={{ marginTop: "0.75rem" }}>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-desde">Disponible desde</label>
            <input
              id="rew-desde"
              className="rrw-input"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="rrw-field">
            <label className="rrw-label" htmlFor="rew-hasta">Disponible hasta</label>
            <input
              id="rew-hasta"
              className="rrw-input"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <div className="rrw-fields-row rrw-fields-row--2" style={{ marginBottom: "1rem" }}>
        <div className="rrw-field">
          <label className="rrw-label" htmlFor="rew-desc">Descripción</label>
          <textarea
            id="rew-desc"
            className="rrw-textarea"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
          />
        </div>
        <div className="rrw-field">
          <label className="rrw-label" htmlFor="rew-cond">Condiciones del canje</label>
          <textarea
            id="rew-cond"
            className="rrw-textarea"
            value={condiciones}
            onChange={(e) => setCondiciones(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={busy}>
          Guardar premio
        </Button>
      </div>
    </form>
  );
}

function PlayersArea({
  orgId,
  campaigns,
  rewards,
  players,
  busy,
  run,
  ask,
  onNotice,
}: {
  orgId: string;
  campaigns: CampaignRecord[];
  rewards: RewardRecord[];
  players: { id: string; nombre: string }[];
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
  ask: (title: string, body: string, task: () => Promise<void>) => void;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"con_puntos" | "incidencias">("con_puntos");

  // Estado del listado "Con puntos"
  const [playersData, setPlayersData] = useState<AdminPlayersRewardsResponse | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [sortBy, setSortBy] = useState<"acumulado" | "disponible" | "nombre" | "reciente">("acumulado");
  const [page, setPage] = useState(1);

  // Estado de la pestaña "Con incidencias"
  const [incidentsData, setIncidentsData] = useState<AdminIncidentsResponse | null>(null);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [incidentsPage, setIncidentsPage] = useState(1);

  // Estado de detalle del jugador seleccionado
  const [selected, setSelected] = useState<string>("");
  const [selectedPlayerName, setSelectedPlayerName] = useState("");
  const [selectedPlayerCode, setSelectedPlayerCode] = useState("");
  const [selectedPlayerRow, setSelectedPlayerRow] = useState<AdminPlayerRewardsRow | null>(null);
  const [catalogCampaignId, setCatalogCampaignId] = useState<string>("");
  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [benefits, setBenefits] = useState<BenefitRecord[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [manualCampaignSelection, setManualCampaignSelection] = useState(false);
  const [rewardId, setRewardId] = useState("");
  const [email, setEmail] = useState("");
  const [partId, setPartId] = useState("");
  const [parts, setParts] = useState<{ id: string; evento_id: string; tipo_evento: string; evento_nombre: string | null }[]>([]);

  const activeCampaigns = useMemo(
    () => campaigns.filter((item) => item.estado === "activa"),
    [campaigns]
  );

  const visibleCampaigns = useMemo(
    () => catalogCampaigns(campaigns, orgId),
    [campaigns, orgId]
  );

  const activeCatalogCampaign = useMemo(() => {
    if (catalogCampaignId) {
      const explicit = visibleCampaigns.find((item) => item.id === catalogCampaignId);
      if (explicit) return explicit;
    }
    if (selectedPlayerRow?.campaign_id) {
      const fromPlayer = visibleCampaigns.find((item) => item.id === selectedPlayerRow.campaign_id);
      if (fromPlayer) return fromPlayer;
    }
    return visibleCampaigns[0] ?? null;
  }, [catalogCampaignId, selectedPlayerRow, visibleCampaigns]);

  const catalog = useMemo(() => {
    if (!activeCatalogCampaign) return null;
    return buildCampaignCatalog({
      campaign: activeCatalogCampaign,
      rewards,
      balances,
      fallbackBalance:
        selectedPlayerRow && selectedPlayerRow.jugador_id === selected
          ? {
              campaign_id: selectedPlayerRow.campaign_id,
              acumulando: selectedPlayerRow.puntos_acumulados,
              disponible: selectedPlayerRow.puntos_disponibles,
              fase: selectedPlayerRow.campaign_fase,
            }
          : null,
      redemptions,
      organizadorId: orgId,
    });
  }, [activeCatalogCampaign, rewards, balances, selectedPlayerRow, selected, redemptions, orgId]);

  const selectedCatalogItem = useMemo(
    () => catalog?.items.find((item) => item.reward.id === rewardId) ?? null,
    [catalog, rewardId]
  );

  useEffect(() => {
    setRewardId("");
  }, [selected, orgId, activeCatalogCampaign?.id]);

  useEffect(() => {
    if (!rewardId) return;
    if (!selectedCatalogItem || !selectedCatalogItem.canRedeem) {
      setRewardId("");
    }
  }, [rewardId, selectedCatalogItem]);

  useEffect(() => {
    if (manualCampaignSelection) return;
    if (activeCampaigns.length === 1) {
      setCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, manualCampaignSelection]);

  // Carga del listado con puntos
  const loadDirectory = useCallback(async () => {
    if (!orgId) return;
    setLoadingPlayers(true);
    setPlayersError(null);
    try {
      const res = await listAdminPlayersRewards({
        organizadorId: orgId,
        campaignId: campaignFilter || undefined,
        query: query.trim() || undefined,
        sortBy,
        sortDir: sortBy === "nombre" ? "asc" : "desc",
        page,
        pageSize: 25,
      });
      setPlayersData(res);
    } catch (err: unknown) {
      setPlayersError(err instanceof Error ? err.message : "Error al consultar jugadores con puntos");
    } finally {
      setLoadingPlayers(false);
    }
  }, [orgId, campaignFilter, query, sortBy, page]);

  // Carga de incidencias
  const loadIncidents = useCallback(async () => {
    if (!orgId) return;
    setLoadingIncidents(true);
    setIncidentsError(null);
    try {
      const res = await listAdminIncidents({
        organizadorId: orgId,
        page: incidentsPage,
        pageSize: 50,
      });
      setIncidentsData(res);
    } catch (err: unknown) {
      setIncidentsError(err instanceof Error ? err.message : "Error al consultar incidencias");
    } finally {
      setLoadingIncidents(false);
    }
  }, [orgId, incidentsPage]);

  // Cargar directorio al cambiar filtros
  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Cargar incidencias al montar o cambiar página de incidencias
  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  // Detalle de un jugador específico
  const loadPlayer = useCallback(async (jugadorId: string) => {
    const [nextBalances, nextReviews, nextRedemptions, nextBenefits, nextParts] = await Promise.all([
      playerBalance(orgId, jugadorId),
      listReviews(orgId, jugadorId),
      listRedemptions(orgId, jugadorId),
      listBenefits(orgId, jugadorId),
      listParticipaciones(jugadorId),
    ]);
    setBalances(nextBalances);
    setReviews(nextReviews);
    setRedemptions(nextRedemptions);
    setBenefits(nextBenefits);
    setParts(nextParts);
    setChecked([]);
  }, [orgId]);

  useEffect(() => {
    if (!selected) return;
    loadPlayer(selected).catch((reason: unknown) =>
      onNotice(reason instanceof Error ? reason.message : "No se pudo cargar el jugador")
    );
  }, [selected, loadPlayer, onNotice]);

  const accruing = accumulatingNow(balances);
  const redeeming = redeemingNow(balances);
  const pendingReviews = reviews.filter((review) => review.estado === "pendiente");

  const handleSelectPlayer = (row: AdminPlayerRewardsRow) => {
    setSelected(row.jugador_id);
    setSelectedPlayerName(row.nombre);
    setSelectedPlayerCode(row.codigo_riviera);
    setSelectedPlayerRow(row);
    setCatalogCampaignId(row.campaign_id ?? "");
    setRewardId("");
  };

  const handleRetryAllIncidents = () => {
    ask(
      "Reintentar todas las incidencias",
      "El sistema reprocesará las participaciones elegibles pendientes o con error en este club.",
      async () => {
        const res = await recoverParticipations({ organizadorId: orgId });
        onNotice(
          `Reconciliación completada: ${res.recovered_queue_errors} errores reintentados, ${res.recovered_pending_reviews} pendientes acreditados, ${res.recovered_missing_participations} faltantes recuperados.`
        );
        await Promise.all([loadIncidents(), loadDirectory()]);
      }
    );
  };

  const handleRetrySingleIncident = (participacionId: string) => {
    void run(async () => {
      const res = await recoverParticipations({
        organizadorId: orgId,
        participacionIds: [participacionId],
      });
      onNotice(
        res.errors > 0
          ? "No se pudo acreditar la participación; revisa el mensaje de error."
          : "Participación reintentada y acreditada exitosamente."
      );
      await Promise.all([loadIncidents(), loadDirectory()]);
      if (selected) await loadPlayer(selected);
    });
  };

  return (
    <section>
      <div className="rrw-area-toolbar">
        <div>
          <h2 className="rrw-area-title">Jugadores y Canjes</h2>
          <p className="rrw-area-sub">Listado de puntos Riviera Rewards y gestión de canjes del club</p>
        </div>
      </div>

      <div className="rrw-directory-container">
        {/* Pestañas: Con puntos vs Con incidencias */}
        <div className="rrw-directory-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "con_puntos"}
            className={`rrw-directory-tab ${tab === "con_puntos" ? "is-active" : ""}`}
            onClick={() => {
              setTab("con_puntos");
              setSelected("");
            }}
          >
            <TablerIcon name="users" size={15} />
            <span>Con puntos</span>
            {playersData && <span className="rrw-tab-count">{playersData.total_count}</span>}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "incidencias"}
            className={`rrw-directory-tab ${tab === "incidencias" ? "is-active" : ""}`}
            onClick={() => {
              setTab("incidencias");
              setSelected("");
            }}
          >
            <TablerIcon name="alert-triangle" size={15} />
            <span>Con incidencias</span>
            {incidentsData && incidentsData.total_count > 0 ? (
              <span className="rrw-tab-count rrw-tab-count--alert">{incidentsData.total_count}</span>
            ) : (
              <span className="rrw-tab-count">0</span>
            )}
          </button>
        </div>

        {/* ── VISTA DETALLE DEL JUGADOR SELECCIONADO ── */}
        {selected ? (
          <div>
            <button
              type="button"
              className="rrw-back-link"
              onClick={() => setSelected("")}
            >
              <TablerIcon name="arrow-left" size={15} /> Volver al listado de jugadores
            </button>

            <div className="rrw-card">
              <div className="rrw-card-header">
                <div>
                  <h3 className="rrw-card-title" style={{ fontSize: "1.15rem" }}>
                    {selectedPlayerName || players.find((p) => p.id === selected)?.nombre || "Jugador"}
                  </h3>
                  <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {selectedPlayerCode ? `Código: ${selectedPlayerCode} · ` : ""}Ficha de Rewards en este club
                  </p>
                </div>
              </div>

              <div className="rrw-kpi-grid">
                <div className="rrw-kpi-card">
                  <span className="rrw-kpi-label">Puntos acumulados</span>
                  <span className="rrw-kpi-value">
                    {accruing?.acumulando ??
                      (selectedPlayerRow?.campaign_fase === "acumulacion"
                        ? selectedPlayerRow.puntos_acumulados
                        : 0)}
                  </span>
                  <p className="rrw-kpi-note">
                    {accruing
                      ? accruing.nombre
                      : selectedPlayerRow?.campaign_fase === "acumulacion" && selectedPlayerRow.campaign_nombre
                      ? selectedPlayerRow.campaign_nombre
                      : "Sin campaña acumulando"}
                  </p>
                </div>
                <div className="rrw-kpi-card">
                  <span className="rrw-kpi-label">Disponibles para canjear</span>
                  <span className="rrw-kpi-value">
                    {redeeming?.disponible ??
                      (selectedPlayerRow?.campaign_fase === "canje"
                        ? selectedPlayerRow.puntos_disponibles
                        : 0)}
                  </span>
                  <p className="rrw-kpi-note">
                    {redeeming
                      ? `Hasta ${formatWindowEnd(redeeming.canje_hasta)} · Reservados: ${redeeming.reservado}`
                      : "Sin ventana de canje abierta"}
                  </p>
                </div>
              </div>

              {balances.filter((row) => row.fase === "cerrada" && (row.utilizado > 0 || row.cerrado > 0)).length > 0 && (
                <div style={{ marginTop: "0.65rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {balances
                    .filter((row) => row.fase === "cerrada" && (row.utilizado > 0 || row.cerrado > 0))
                    .map((row) => (
                      <span key={row.campaign_id} style={{ marginRight: "0.75rem" }}>
                        {row.nombre}: {row.utilizado} utilizados, {row.cerrado} cerrados.
                      </span>
                    ))}
                </div>
              )}

              {/* Sub-sección: Participaciones pendientes */}
              <div className="rrw-sub-block">
                <h4 className="rrw-sub-title">Participaciones Pendientes de Validar</h4>
                {pendingReviews.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    No hay participaciones por validar para este jugador.
                  </p>
                ) : (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", margin: "0.5rem 0" }}>
                      {pendingReviews.map((review) => (
                        <label key={review.id} className="rrw-chip-toggle" style={{ borderRadius: "8px" }}>
                          <input
                            type="checkbox"
                            checked={checked.includes(review.participacion_id)}
                            onChange={(e) =>
                              setChecked((current) =>
                                e.target.checked
                                  ? [...current, review.participacion_id]
                                  : current.filter((id) => id !== review.participacion_id)
                              )
                            }
                          />
                          <span>
                            <strong>{MODALITY_LABELS[review.modalidad as keyof typeof MODALITY_LABELS] ?? review.modalidad}</strong> · {new Date(review.closed_at).toLocaleDateString("es-MX")}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="rrw-fields-row rrw-fields-row--2" style={{ marginTop: "0.75rem" }}>
                      <div className="rrw-field">
                        <label className="rrw-label" htmlFor="play-camp-acred">Campaña de acreditación</label>
                        <select
                          id="play-camp-acred"
                          className="rrw-select"
                          aria-label="Campaña"
                          value={campaignId}
                          onChange={(e) => {
                            setCampaignId(e.target.value);
                            setManualCampaignSelection(true);
                          }}
                        >
                          <option value="">Elige campaña...</option>
                          {activeCampaigns.map((item) => (
                            <option key={item.id} value={item.id}>{item.nombre}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy || checked.length === 0 || !campaignId}
                          onClick={() =>
                            run(async () => {
                              const count = await reviewParticipations({
                                organizadorId: orgId,
                                participacionIds: checked,
                                decision: "aprobada",
                                campaignId,
                              });
                              onNotice(`Se validaron ${count} participaciones y se acreditaron puntos.`);
                              await Promise.all([loadPlayer(selected), loadDirectory(), loadIncidents()]);
                            })
                          }
                        >
                          Aprobar selección
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || checked.length === 0}
                          onClick={() =>
                            ask("Rechazar participaciones", "No se acreditarán puntos.", async () => {
                              await reviewParticipations({
                                organizadorId: orgId,
                                participacionIds: checked,
                                decision: "rechazada",
                                campaignId: null,
                                motivo: "Rechazada por el club",
                              });
                              onNotice("Participaciones rechazadas.");
                              await Promise.all([loadPlayer(selected), loadDirectory(), loadIncidents()]);
                            })
                          }
                        >
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-sección: Canjes y Premios */}
              <div className="rrw-sub-block">
                <div className="rrw-catalog-head">
                  <div>
                    <h4 className="rrw-sub-title" style={{ marginBottom: "0.15rem" }}>Canjes de Premios</h4>
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

                {!catalog || catalog.items.length === 0 ? (
                  <p className="rrw-empty-text" style={{ marginBottom: "0.75rem" }}>
                    No hay premios activos registrados para esta campaña.
                  </p>
                ) : (
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

                <div className="rrw-fields-row rrw-fields-row--2" style={{ marginBottom: "0.75rem" }}>
                  <div className="rrw-field">
                    <label className="rrw-label" htmlFor="play-prem-disp">Premio en canje abierto</label>
                    <select
                      id="play-prem-disp"
                      className="rrw-select"
                      value={rewardId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const target = catalog?.items.find((entry) => entry.reward.id === nextId);
                        setRewardId(target?.canRedeem ? nextId : "");
                      }}
                    >
                      <option value="">Selecciona un premio disponible...</option>
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
                      variant="primary"
                      size="sm"
                      disabled={busy || !selectedCatalogItem || !selectedCatalogItem.canRedeem}
                      onClick={() => {
                        if (!selectedCatalogItem || !selectedCatalogItem.canRedeem) return;
                        void run(async () => {
                          await requestRedemption(orgId, selectedCatalogItem.reward.id, selected);
                          onNotice("Solicitud creada. Los puntos se descuentan al reservar.");
                          await Promise.all([loadPlayer(selected), loadDirectory()]);
                        });
                      }}
                    >
                      Solicitar beneficio
                    </Button>
                  </div>
                </div>

                <ul className="rrw-item-list">
                  {redemptions.map((redemption) => (
                    <li key={redemption.id} className="rrw-item-row">
                      <div>
                        <strong>{redemption.snapshot?.nombre ?? "Premio"}</strong>
                        <span style={{ margin: "0 0.4rem", color: "var(--text-muted)" }}>·</span>
                        <span className="rrw-badge rrw-badge--neutral">{redemption.estado}</span>
                        <span style={{ margin: "0 0.4rem", color: "var(--text-muted)" }}>·</span>
                        <span>{redemption.costo_puntos} pts</span>
                      </div>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        {redemption.estado === "solicitado" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await reserveRedemption(redemption.id);
                                await Promise.all([loadPlayer(selected), loadDirectory()]);
                              })
                            }
                          >
                            Reservar
                          </Button>
                        )}
                        {redemption.estado === "reservado" && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await confirmRedemption(redemption.id);
                                await Promise.all([loadPlayer(selected), loadDirectory()]);
                              })
                            }
                          >
                            Entregar
                          </Button>
                        )}
                        {(redemption.estado === "solicitado" || redemption.estado === "reservado") && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              ask("Cancelar canje", "Si la ventana ya cerró, los puntos reservados no vuelven al saldo.", async () => {
                                await cancelRedemption(redemption.id);
                                await Promise.all([loadPlayer(selected), loadDirectory()]);
                              })
                            }
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  {redemptions.length === 0 && (
                    <li style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      Sin historial de canjes registrados.
                    </li>
                  )}
                </ul>
              </div>

              {/* Sub-sección: Reta gratuita pendiente */}
              {benefits.filter((b) => b.estado === "pendiente_asignacion").length > 0 && (
                <div className="rrw-sub-block">
                  <h4 className="rrw-sub-title">Reta Gratuita Pendiente de Asignar</h4>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
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
                              void run(async () => {
                                await assignBenefit({
                                  benefitId: benefit.id,
                                  eventoId: part.evento_id,
                                  tipoEvento: part.tipo_evento,
                                  participacionId: part.id,
                                });
                                onNotice("Participación marcada como reta gratuita.");
                                await Promise.all([loadPlayer(selected), loadDirectory()]);
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

              {/* Sub-sección: Cuenta del jugador */}
              <div className="rrw-sub-block">
                <h4 className="rrw-sub-title">Cuenta de Acceso del Jugador</h4>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Vincula un correo electrónico para que el jugador pueda consultar su catálogo y solicitar canjes desde su perfil.
                </p>
                <div className="rrw-fields-row rrw-fields-row--2">
                  <div className="rrw-field">
                    <input
                      className="rrw-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy || !email}
                      onClick={() =>
                        run(async () => {
                          await linkPlayer(orgId, selected, email);
                          onNotice("Cuenta vinculada exitosamente.");
                        })
                      }
                    >
                      Vincular cuenta
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : tab === "con_puntos" ? (
          /* ── TABLA PRINCIPAL: JUGADORES CON PUNTOS ── */
          <div>
            <div className="rrw-directory-toolbar">
              <div className="rrw-toolbar-left">
                <input
                  className="rrw-search-input"
                  style={{ maxWidth: "320px" }}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar por nombre o código..."
                  aria-label="Buscar jugador"
                />

                {campaigns.length > 0 && (
                  <select
                    className="rrw-select"
                    style={{ maxWidth: "220px" }}
                    value={campaignFilter}
                    onChange={(e) => {
                      setCampaignFilter(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Filtrar por campaña"
                  >
                    <option value="">Todas las campañas</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="rrw-toolbar-right">
                <select
                  className="rrw-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Ordenar listado"
                >
                  <option value="acumulado">Mayor acumulación</option>
                  <option value="disponible">Mayor saldo canjeable</option>
                  <option value="nombre">Nombre (A-Z)</option>
                  <option value="reciente">Última reta reciente</option>
                </select>
              </div>
            </div>

            {playersError && (
              <div className="rrw-error-banner" style={{ marginTop: "0.75rem" }}>
                <TablerIcon name="alert-triangle" size={16} />
                <span className="rrw-error-text">{playersError}</span>
                <Button size="sm" variant="ghost" onClick={loadDirectory}>
                  Reintentar
                </Button>
              </div>
            )}

            <div className="rrw-table-wrapper" style={{ marginTop: "0.75rem" }}>
              <table className="rrw-data-table">
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Campaña</th>
                    <th style={{ textAlign: "right" }}>Puntos Acumulados</th>
                    <th style={{ textAlign: "right" }}>Saldo Canjeable</th>
                    <th style={{ textAlign: "center" }}>Participaciones</th>
                    <th>Última Reta</th>
                    <th style={{ textAlign: "right" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingPlayers ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        Cargando jugadores con puntos Rewards…
                      </td>
                    </tr>
                  ) : !playersData || playersData.players.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                        {query || campaignFilter
                          ? "No se encontraron jugadores que coincidan con los filtros aplicados."
                          : "No hay jugadores con puntos acumulados ni saldo canjeable en este club."}
                      </td>
                    </tr>
                  ) : (
                    playersData.players.map((row) => (
                      <tr
                        key={row.jugador_id}
                        className="is-clickable"
                        onClick={() => handleSelectPlayer(row)}
                      >
                        <td>
                          <div className="rrw-player-cell">
                            <span className="rrw-player-name">{row.nombre}</span>
                            {row.codigo_riviera && (
                              <span className="rrw-player-code">{row.codigo_riviera}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{row.campaign_nombre}</strong>
                            <div style={{ marginTop: "0.15rem" }}>
                              <span
                                className={`rrw-badge ${
                                  row.campaign_fase === "canje"
                                    ? "rrw-badge--active"
                                    : row.campaign_fase === "acumulacion"
                                    ? "rrw-badge--neutral"
                                    : "rrw-badge--ghost"
                                }`}
                              >
                                {row.campaign_fase === "acumulacion"
                                  ? "Acumulando"
                                  : row.campaign_fase === "canje"
                                  ? "Canje abierto"
                                  : "Cerrada"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="rrw-pts-highlight">{row.puntos_acumulados} pts</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span
                            className="rrw-pts-highlight"
                            style={{
                              color: row.puntos_disponibles > 0 ? "var(--ro-accent, #e5a93c)" : "var(--text-muted)",
                            }}
                          >
                            {row.puntos_disponibles} pts
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span>{row.participaciones_acreditadas} retas</span>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                            {row.ultima_participacion
                              ? new Date(row.ultima_participacion).toLocaleDateString("es-MX", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPlayer(row);
                            }}
                          >
                            Ver detalle
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {playersData && playersData.total_count > 0 && (
              <div className="rrw-pagination">
                <span>
                  Mostrando {playersData.players.length} de {playersData.total_count} jugadores (Página {page} de{" "}
                  {playersData.total_pages || 1})
                </span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page <= 1 || loadingPlayers}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page >= playersData.total_pages || loadingPlayers}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── PESTAÑA: CON INCIDENCIAS ── */
          <div>
            <div className="rrw-directory-toolbar" style={{ marginBottom: "0.75rem" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                  {incidentsData
                    ? `Total: ${incidentsData.total_count} incidencias (${incidentsData.error_count} errores, ${incidentsData.pending_count} pendientes)`
                    : "Cargando incidencias…"}
                </p>
              </div>
              <div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || loadingIncidents || !incidentsData || incidentsData.total_count === 0}
                  onClick={handleRetryAllIncidents}
                >
                  <TablerIcon name="refresh" size={14} /> Reintentar todas las incidencias
                </Button>
              </div>
            </div>

            {incidentsError && (
              <div className="rrw-error-banner" style={{ marginBottom: "0.75rem" }}>
                <TablerIcon name="alert-triangle" size={16} />
                <span className="rrw-error-text">{incidentsError}</span>
                <Button size="sm" variant="ghost" onClick={loadIncidents}>
                  Reintentar
                </Button>
              </div>
            )}

            <div className="rrw-table-wrapper">
              <table className="rrw-data-table">
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Evento</th>
                    <th>Campaña</th>
                    <th>Estado / Error</th>
                    <th style={{ textAlign: "center" }}>Intentos</th>
                    <th style={{ textAlign: "right" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingIncidents ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        Consultando incidencias del club…
                      </td>
                    </tr>
                  ) : !incidentsData || incidentsData.incidents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", color: "var(--success, #10b981)" }}>
                          <TablerIcon name="circle-check" size={28} />
                          <span style={{ color: "var(--text-muted)" }}>Todo en orden. No hay incidencias pendientes ni errores en este club.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    incidentsData.incidents.map((inc) => (
                      <tr key={inc.id}>
                        <td>
                          <div className="rrw-player-cell">
                            <span className="rrw-player-name">{inc.jugador_nombre || "Jugador"}</span>
                            {inc.codigo_riviera && (
                              <span className="rrw-player-code">{inc.codigo_riviera}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>
                              {MODALITY_LABELS[inc.tipo_evento as keyof typeof MODALITY_LABELS] ?? inc.tipo_evento}
                            </strong>
                            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                              {new Date(inc.created_at).toLocaleDateString("es-MX")}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span>{inc.campaign_nombre}</span>
                            <div style={{ fontSize: "0.76rem", color: "var(--ro-accent, #e5a93c)" }}>
                              +{inc.puntos_esperados} pts esperados
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span
                              className={`rrw-badge ${
                                inc.tipo_incidencia === "acreditacion_error" || inc.tipo_incidencia === "fallo_inicial"
                                  ? "rrw-tab-count--alert"
                                  : "rrw-badge--neutral"
                              }`}
                            >
                              {inc.tipo_incidencia === "acreditacion_error"
                                ? "Error de acreditación"
                                : inc.tipo_incidencia === "fallo_inicial"
                                ? "Fallo inicial de encolamiento"
                                : "Pendiente de validación"}
                            </span>
                            <div
                              style={{
                                fontSize: "0.78rem",
                                color: "var(--text-secondary)",
                                marginTop: "0.25rem",
                                maxWidth: "360px",
                                wordBreak: "break-word",
                              }}
                            >
                              {inc.error_mensaje}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{inc.attempts}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {inc.tipo_incidencia === "revision_pendiente" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                setSelected(inc.jugador_id);
                                setSelectedPlayerName(inc.jugador_nombre);
                              }}
                            >
                              Revisar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy}
                              onClick={() => handleRetrySingleIncident(inc.participacion_id)}
                            >
                              Reintentar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {incidentsData && incidentsData.total_count > 0 && (
              <div className="rrw-pagination">
                <span>
                  Mostrando {incidentsData.incidents.length} de {incidentsData.total_count} incidencias (Página{" "}
                  {incidentsPage} de {incidentsData.total_pages || 1})
                </span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={incidentsPage <= 1 || loadingIncidents}
                    onClick={() => setIncidentsPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={incidentsPage >= incidentsData.total_pages || loadingIncidents}
                    onClick={() => setIncidentsPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function StatsArea({
  orgId,
  players,
  queue,
  busy,
  onSync,
  onProcess,
  onClose,
}: {
  orgId: string;
  players: { id: string; nombre: string }[];
  queue: QueueRecord[];
  busy: boolean;
  onSync: () => void;
  onProcess: () => void;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<ReturnType<typeof summarizeRewards> | null>(null);

  useEffect(() => {
    let active = true;
    statsRows(orgId)
      .then((rows) => {
        if (!active) return;
        const names = Object.fromEntries(players.map((player) => [player.id, player.nombre]));
        setStats(summarizeRewards({ ...rows, names }));
      })
      .catch(() => {
        if (active) setStats(null);
      });
    return () => {
      active = false;
    };
  }, [orgId, players, queue]);

  const cards = [
    { label: "Jugadores activos", value: stats?.activePlayers ?? 0 },
    { label: "Participaciones aprobadas", value: stats?.approved ?? 0 },
    { label: "Puntos emitidos", value: stats?.issued ?? 0 },
    { label: "Puntos disponibles", value: stats?.available ?? 0 },
    { label: "Puntos utilizados", value: stats?.used ?? 0 },
    { label: "Premios entregados", value: stats?.delivered ?? 0 },
  ];

  const pendingQueue = queue.filter((item) => item.estado === "pendiente").length;
  const errorQueue = queue.filter((item) => item.estado === "error").length;

  return (
    <section>
      <div className="rrw-area-toolbar">
        <div>
          <h2 className="rrw-area-title">Métricas y Auditoría</h2>
          <p className="rrw-area-sub">Resumen de emisión de puntos, actividad del club y cola de sincronización</p>
        </div>
      </div>

      <div className="rrw-kpi-grid rrw-kpi-grid--3" style={{ marginBottom: "1.25rem" }}>
        {cards.map((c) => (
          <article key={c.label} className="rrw-kpi-card">
            <span className="rrw-kpi-label">{c.label}</span>
            <span className="rrw-kpi-value">{c.value}</span>
          </article>
        ))}
      </div>

      <div className="rrw-grid-2" style={{ marginBottom: "1.25rem" }}>
        <article className="rrw-card">
          <h3 className="rrw-card-title">Jugadores más Constantes</h3>
          {(stats?.consistent.length ?? 0) === 0 ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Aparecerán cuando se aprueben participaciones.
            </p>
          ) : (
            <ul className="rrw-item-list">
              {stats?.consistent.map((player, idx) => (
                <li key={player.jugadorId} className="rrw-item-row">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", width: "1.2rem" }}>
                      #{idx + 1}
                    </span>
                    <strong>{player.nombre}</strong>
                  </div>
                  <span className="rrw-badge rrw-badge--neutral">
                    {player.participaciones} participaciones
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rrw-card">
          <h3 className="rrw-card-title">Comparativa entre Campañas</h3>
          {(stats?.comparison.length ?? 0) <= 1 ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {stats?.comparison.length === 1 ? "1 campaña activa registrada." : "Sin historial de campañas comparables."}
            </p>
          ) : (
            <ul className="rrw-item-list">
              {stats?.comparison.map((campaign) => (
                <li key={campaign.id} className="rrw-item-row">
                  <strong>{campaign.nombre}</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <span>{campaign.emitidos} emitidos</span>
                    <span style={{ margin: "0 0.35rem" }}>·</span>
                    <span>{campaign.disponibles} disp.</span>
                    <span style={{ margin: "0 0.35rem" }}>·</span>
                    <span>{campaign.entregados} entreg.</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="rrw-card">
        <div className="rrw-card-header">
          <h3 className="rrw-card-title">Cola y Recuperación de Puntos</h3>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <span className={`rrw-badge ${pendingQueue > 0 ? "rrw-badge--active" : "rrw-badge--neutral"}`}>
              Pendientes: {pendingQueue}
            </span>
            <span className={`rrw-badge ${errorQueue > 0 ? "rrw-badge--active" : "rrw-badge--neutral"}`}>
              Con error: {errorQueue}
            </span>
          </div>
        </div>

        {queue.filter((item) => item.last_error).slice(0, 3).length > 0 && (
          <div style={{ background: "var(--bg-inset)", padding: "0.75rem", borderRadius: "8px", margin: "0.5rem 0" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Últimos errores registrados
            </p>
            {queue.filter((item) => item.last_error).slice(0, 3).map((item) => (
              <p key={item.id} style={{ margin: "0.2rem 0", fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                {item.last_error}
              </p>
            ))}
          </div>
        )}

        <div className="rrw-card-actions">
          <Button variant="primary" size="sm" disabled={busy} onClick={onProcess}>
            <TablerIcon name="refresh" size={14} />
            <span>Procesar cola</span>
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onSync}>
            Recuperar participaciones
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cerrar ventanas vencidas
          </Button>
        </div>

        <p style={{ margin: "0.85rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
          Nota técnica: El cierre y el reintento automático se programan en la base de datos si pg_cron está activo en el proyecto. Esta consola administrativa ejecuta la sincronización manual directamente desde el navegador del club.
        </p>
      </article>
    </section>
  );
}
