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
  type BalanceRecord,
  type BenefitRecord,
  type CampaignRecord,
  type QueueRecord,
  type RedemptionRecord,
  type ReviewRecord,
  type RewardRecord,
} from "../../lib/rewards/api";
import {
  CAMPAIGN_STATE_LABELS,
  MODALITY_LABELS,
  REWARD_TYPE_LABELS,
  REWARD_TYPES,
  accumulatingNow,
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
import { TablerIcon } from "../ui/TablerIcon";
import { parseRewardsArea, rewardsAreaPath, navigateRewards, type RewardsArea } from "./rewardsNav";
import "./rewards.css";

interface RewardsPageProps {
  pathname: string;
}

const AREAS: { id: RewardsArea; label: string }[] = [
  { id: "campanas", label: "Campañas" },
  { id: "premios", label: "Premios" },
  { id: "jugadores", label: "Jugadores y canjes" },
  { id: "estadisticas", label: "Estadísticas" },
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
      <button type="button" className="rrw-back" onClick={() => navigateToAppHome()}>
        <TablerIcon name="arrow-left" size={16} />
        Inicio
      </button>
      <p className="rrw-kicker">Riviera Rewards</p>
      <h1 className="rrw-title">Campañas mensuales</h1>
      <p className="rrw-lead">
        Los puntos se acumulan durante el mes y se canjean en el mes siguiente. Cada campaña tiene su propio catálogo.
      </p>
      {(accruing.length > 0 || redeeming.length > 0) && (
        <p className="rrw-note">
          {redeeming.length > 0
            ? `En canje: ${redeeming.map((item) => item.nombre).join(", ")}.`
            : "Ninguna campaña está en ventana de canje."}{" "}
          {accruing.length > 0
            ? `Acumulando: ${accruing.map((item) => item.nombre).join(", ")}.`
            : "Ninguna campaña está acumulando ahora."}
        </p>
      )}
      {queue.length > 0 && (
        <p className="rrw-banner">
          Hay {queue.filter((item) => item.estado === "pendiente").length} acreditaciones pendientes y{" "}
          {queue.filter((item) => item.estado === "error").length} con error. Procésalas desde Estadísticas. No se acreditan al recuperar participaciones faltantes.
        </p>
      )}
      {error && <p className="rrw-error">{error}</p>}
      {notice && <p className="rrw-note">{notice}</p>}

      <div className="rrw-tabs" role="tablist" aria-label="Áreas de Riviera Rewards">
        {AREAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={area === item.id}
            className={`rrw-tab${area === item.id ? " rrw-tab--active" : ""}`}
            onClick={() => navigateRewards(rewardsAreaPath(item.id))}
          >
            {item.label}
          </button>
        ))}
      </div>

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

      {confirm && (
        <div className="rrw-modal" role="dialog" aria-modal="true" aria-labelledby="rrw-confirm-title">
          <div className="rrw-modal__card">
            <h2 id="rrw-confirm-title">{confirm.title}</h2>
            <p className="rrw-meta">{confirm.body}</p>
            <div className="rrw-actions">
              <button type="button" className="rrw-btn" disabled={busy} onClick={() => { const task = confirm.run; setConfirm(null); void task(); }}>
                Confirmar
              </button>
              <button type="button" className="rrw-btn--ghost" onClick={() => setConfirm(null)}>
                Volver
              </button>
            </div>
          </div>
        </div>
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
      <button type="button" className="rrw-btn" onClick={() => { setEditing(null); setOpen(true); }}>
        Nueva campaña
      </button>
      {open && (
        <CampaignForm
          orgId={orgId}
          campaign={editing}
          busy={busy}
          onCancel={() => setOpen(false)}
          onSave={(payload) => { onSave(payload); setOpen(false); }}
        />
      )}
      <div className="rrw-grid">
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="rrw-card">
            <h3>{campaign.nombre}</h3>
            <span className="rrw-phase">
              {CAMPAIGN_STATE_LABELS[campaign.estado as keyof typeof CAMPAIGN_STATE_LABELS] ?? campaign.estado}
              {" · "}
              {campaignPhase(campaign) === "acumulacion" ? "Acumulando" : campaignPhase(campaign) === "canje" ? "En canje" : "Cerrada"}
            </span>
            <p className="rrw-meta">
              Acumulación hasta {formatWindowEnd(campaign.acumula_hasta)}. Canje hasta {formatWindowEnd(campaign.canje_hasta)}.
              {" "}{campaign.puntos_por_participacion} puntos por participación.
            </p>
            <p className="rrw-meta">{campaign.modalidades.map((item) => MODALITY_LABELS[item as keyof typeof MODALITY_LABELS] ?? item).join(", ")}</p>
            <div className="rrw-actions">
              <button type="button" className="rrw-btn--ghost" onClick={() => { setEditing(campaign); setOpen(true); }}>Editar</button>
              <button type="button" className="rrw-btn--ghost" onClick={() => onDuplicate(campaign)}>Duplicar</button>
              {campaign.estado === "activa" ? (
                <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={() => onState(campaign, "pausada")}>Pausar</button>
              ) : campaign.estado !== "finalizada" ? (
                <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={() => onState(campaign, "activa")}>Activar</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {campaigns.length === 0 && <p className="rrw-empty">Todavía no hay campañas.</p>}
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
      className="rrw-form"
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
      <h3>{campaign ? "Editar campaña" : "Nueva campaña"}</h3>
      <div className="rrw-fields rrw-fields--2">
        <label>Nombre<input value={nombre} onChange={(event) => setNombre(event.target.value)} required /></label>
        <label>Puntos por participación<input type="number" min={1} value={puntos} onChange={(event) => setPuntos(event.target.value)} required /></label>
        <label>Acumula desde<input type="date" value={acumulaDesde} onChange={(event) => setAcumulaDesde(event.target.value)} required /></label>
        <label>Último día de acumulación<input type="date" value={acumulaHasta} onChange={(event) => setAcumulaHasta(event.target.value)} required /></label>
        <label>Canje desde<input type="date" value={canjeDesde} onChange={(event) => setCanjeDesde(event.target.value)} required /></label>
        <label>Último día de canje<input type="date" value={canjeHasta} onChange={(event) => setCanjeHasta(event.target.value)} required /></label>
        <label>Estado
          <select value={estado} onChange={(event) => setEstado(event.target.value)}>
            {Object.entries(CAMPAIGN_STATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>Días para recoger una reserva<input type="number" min={1} value={reserva} onChange={(event) => setReserva(event.target.value)} /></label>
      </div>
      <div className="rrw-checks">
        {REWARDS_MODALITIES.map((modality) => (
          <label key={modality}>
            <input
              type="checkbox"
              checked={mods.includes(modality)}
              onChange={(event) =>
                setMods((current) =>
                  event.target.checked ? [...current, modality] : current.filter((item) => item !== modality)
                )
              }
            />
            {MODALITY_LABELS[modality]}
          </label>
        ))}
        <label>
          <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          Visible para el jugador vinculado
        </label>
      </div>
      <label className="rrw-fields">Condiciones
        <textarea value={condiciones} onChange={(event) => setCondiciones(event.target.value)} rows={3} />
      </label>
      <p className="rrw-meta">Si la campaña ya tiene puntos o canjes, el servidor rechaza cambiar fechas o puntos por participación.</p>
      <div className="rrw-actions">
        <button className="rrw-btn" type="submit" disabled={busy || mods.length === 0}>Guardar</button>
        <button className="rrw-btn--ghost" type="button" onClick={onCancel}>Cancelar</button>
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
  const [editing, setEditing] = useState<RewardRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = rewards.filter((reward) => reward.campaign_id === campaignId);
  return (
    <section>
      <label className="rrw-fields">Campaña
        <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.nombre}</option>
          ))}
        </select>
      </label>
      <div className="rrw-actions">
        <button type="button" className="rrw-btn" disabled={!campaignId} onClick={() => { setEditing(null); setCreating(true); }}>Nuevo premio</button>
      </div>
      {(creating || editing) && campaignId && (
        <RewardForm
          key={editing?.id ?? "new"}
          campaignId={campaignId}
          reward={editing}
          busy={busy}
          onSave={(payload) => { setCreating(false); setEditing(null); onSave(payload); }}
        />
      )}
      {visible.map((reward) => (
        <article key={reward.id} className="rrw-card">
          <h3>{reward.nombre}</h3>
          <p className="rrw-meta">
            {reward.costo_puntos} puntos · {REWARD_TYPE_LABELS[reward.tipo as RewardType] ?? reward.tipo} · {reward.estado}
            {reward.inventario_restante != null ? ` · quedan ${reward.inventario_restante}` : ""}
          </p>
          {reward.descripcion && <p className="rrw-meta">{reward.descripcion}</p>}
          <div className="rrw-actions">
            <button type="button" className="rrw-btn--ghost" onClick={() => { setCreating(false); setEditing(reward); }}>Editar</button>
            <button
              type="button"
              className="rrw-btn--ghost"
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
              Duplicar
            </button>
            <button
              type="button"
              className="rrw-btn--ghost"
              onClick={() => onSave({ ...reward, estado: reward.estado === "activo" ? "pausado" : "activo" })}
            >
              {reward.estado === "activo" ? "Pausar" : "Activar"}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function RewardForm({
  campaignId,
  reward,
  busy,
  onSave,
}: {
  campaignId: string;
  reward: RewardRecord | null;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
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
      className="rrw-form"
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
      <h3>{reward ? "Editar premio" : "Nuevo premio"}</h3>
      <div className="rrw-fields rrw-fields--2">
        <label>Nombre<input value={nombre} onChange={(event) => setNombre(event.target.value)} required /></label>
        <label>Puntos necesarios<input type="number" min={1} value={costo} onChange={(event) => setCosto(event.target.value)} required /></label>
        <label>Tipo
          <select value={tipo} onChange={(event) => setTipo(event.target.value)}>
            {REWARD_TYPES.map((item) => <option key={item} value={item}>{REWARD_TYPE_LABELS[item]}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={estado} onChange={(event) => setEstado(event.target.value)}>
            <option value="borrador">Borrador</option>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="retirado">Retirado</option>
          </select>
        </label>
        <label>Inventario<input value={inventario} onChange={(event) => setInventario(event.target.value)} placeholder="Sin límite" /></label>
        <label>Límite por jugador<input value={limite} onChange={(event) => setLimite(event.target.value)} placeholder="Sin límite" /></label>
        <label>Disponible desde<input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} /></label>
        <label>Disponible hasta<input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} /></label>
      </div>
      <div className="rrw-fields">
        <label>Descripción<textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={2} /></label>
        <label>Condiciones<textarea value={condiciones} onChange={(event) => setCondiciones(event.target.value)} rows={2} /></label>
      </div>
      <div className="rrw-actions">
        <button className="rrw-btn" type="submit" disabled={busy}>Guardar premio</button>
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
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [benefits, setBenefits] = useState<BenefitRecord[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [email, setEmail] = useState("");
  const [partId, setPartId] = useState("");
  const [parts, setParts] = useState<{ id: string; evento_id: string; tipo_evento: string; evento_nombre: string | null }[]>([]);

  const filtered = useMemo(
    () => players.filter((player) => player.nombre.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30),
    [players, query]
  );
  const pending = reviews.filter((review) => review.estado === "pendiente");
  const openRewards = rewards.filter((reward) => {
    const campaign = campaigns.find((item) => item.id === reward.campaign_id);
    return reward.estado === "activo" && campaign && campaignPhase(campaign) === "canje" && campaign.estado === "activa";
  });

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
    loadPlayer(selected).catch((reason: unknown) => onNotice(reason instanceof Error ? reason.message : "No se pudo cargar el jugador"));
  }, [selected, loadPlayer, onNotice]);

  const accruing = accumulatingNow(balances);
  const redeeming = redeemingNow(balances);

  return (
    <section>
      <input className="rrw-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugador del club" />
      <div className="rrw-list">
        {filtered.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`rrw-player${selected === player.id ? " rrw-player--active" : ""}`}
            onClick={() => setSelected(player.id)}
          >
            <span>{player.nombre}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="rrw-card">
          <div className="rrw-balances">
            <div className="rrw-balance">
              <span>Acumulando este mes</span>
              <strong>{accruing?.acumulando ?? 0}</strong>
              <p className="rrw-meta">{accruing ? accruing.nombre : "Sin campaña de acumulación abierta."}</p>
            </div>
            <div className="rrw-balance">
              <span>Disponibles para canjear</span>
              <strong>{redeeming?.disponible ?? 0}</strong>
              <p className="rrw-meta">
                {redeeming ? `Hasta ${formatWindowEnd(redeeming.canje_hasta)}. Reservados ${redeeming.reservado}, utilizados ${redeeming.utilizado}.` : "Sin ventana de canje abierta."}
              </p>
            </div>
          </div>
          {balances.filter((row) => row.fase === "cerrada" && (row.utilizado > 0 || row.cerrado > 0)).map((row) => (
            <p key={row.campaign_id} className="rrw-meta">{row.nombre}: {row.utilizado} utilizados, {row.cerrado} cerrados.</p>
          ))}

          <h3>Participaciones pendientes</h3>
          {pending.length === 0 && <p className="rrw-meta">No hay participaciones por validar.</p>}
          {pending.map((review) => (
            <label key={review.id} className="rrw-meta">
              <input
                type="checkbox"
                checked={checked.includes(review.participacion_id)}
                onChange={(event) =>
                  setChecked((current) =>
                    event.target.checked
                      ? [...current, review.participacion_id]
                      : current.filter((id) => id !== review.participacion_id)
                  )
                }
              />
              {" "}{review.modalidad} · {new Date(review.closed_at).toLocaleDateString("es-MX")}
            </label>
          ))}
          <label className="rrw-fields">Campaña de acreditación
            <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">Elige campaña</option>
              {campaigns.filter((item) => item.estado === "activa").map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </label>
          <div className="rrw-actions">
            <button
              type="button"
              className="rrw-btn"
              disabled={busy || checked.length === 0 || !campaignId}
              onClick={() =>
                run(async () => {
                  const count = await reviewParticipations({
                    organizadorId: orgId,
                    participacionIds: checked,
                    decision: "aprobada",
                    campaignId,
                  });
                  onNotice(`Se validaron ${count} participaciones y se intentó acreditar.`);
                  await loadPlayer(selected);
                })
              }
            >
              Aprobar selección
            </button>
            <button
              type="button"
              className="rrw-btn--ghost"
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
                  await loadPlayer(selected);
                })
              }
            >
              Rechazar
            </button>
          </div>

          <h3>Canjes</h3>
          <label className="rrw-fields">Premio disponible
            <select value={rewardId} onChange={(event) => setRewardId(event.target.value)}>
              <option value="">Elige premio</option>
              {openRewards.map((reward) => (
                <option key={reward.id} value={reward.id}>{reward.nombre} · {reward.costo_puntos} pts</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rrw-btn"
            disabled={busy || !rewardId}
            onClick={() =>
              run(async () => {
                await requestRedemption(orgId, rewardId, selected);
                onNotice("Solicitud creada. Los puntos se descuentan al reservar, no al seguir acumulando.");
                await loadPlayer(selected);
              })
            }
          >
            Solicitar beneficio
          </button>
          <ul className="rrw-list">
            {redemptions.map((redemption) => (
              <li key={redemption.id}>
                <span>{redemption.snapshot?.nombre ?? "Premio"} · {redemption.estado} · {redemption.costo_puntos} pts</span>
                <span className="rrw-actions">
                  {redemption.estado === "solicitado" && (
                    <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={() => run(async () => { await reserveRedemption(redemption.id); await loadPlayer(selected); })}>Reservar</button>
                  )}
                  {redemption.estado === "reservado" && (
                    <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={() => run(async () => { await confirmRedemption(redemption.id); await loadPlayer(selected); })}>Entregar</button>
                  )}
                  {(redemption.estado === "solicitado" || redemption.estado === "reservado") && (
                    <button type="button" className="rrw-btn--danger" disabled={busy} onClick={() => ask("Cancelar canje", "Si la ventana ya cerró, los puntos reservados no vuelven al saldo.", async () => { await cancelRedemption(redemption.id); await loadPlayer(selected); })}>Cancelar</button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {benefits.filter((benefit) => benefit.estado === "pendiente_asignacion").map((benefit) => (
            <div key={benefit.id} className="rrw-form">
              <h3>Reta gratuita pendiente</h3>
              <p className="rrw-meta">Al asignarla, esa participación no genera puntos Rewards. El historial deportivo se conserva.</p>
              <select value={partId} onChange={(event) => setPartId(event.target.value)}>
                <option value="">Elige participación</option>
                {parts.map((part) => (
                  <option key={part.id} value={part.id}>{part.evento_nombre || part.tipo_evento}</option>
                ))}
              </select>
              <button
                type="button"
                className="rrw-btn"
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
                    onNotice("La participación quedó marcada como reta gratuita de Rewards.");
                    await loadPlayer(selected);
                  });
                }}
              >
                Marcar como gratuita
              </button>
            </div>
          ))}

          <h3>Cuenta del jugador</h3>
          <p className="rrw-meta">Sin una cuenta vinculada, el jugador ve su perfil deportivo pero no puede solicitar canjes. Tú los gestionas aquí.</p>
          <label className="rrw-fields">Correo de la cuenta
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button
            type="button"
            className="rrw-btn--ghost"
            disabled={busy || !email}
            onClick={() => run(async () => { await linkPlayer(orgId, selected, email); onNotice("Cuenta vinculada."); })}
          >
            Vincular cuenta
          </button>
        </div>
      )}
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
    ["Jugadores activos", stats?.activePlayers ?? 0],
    ["Participaciones aprobadas", stats?.approved ?? 0],
    ["Puntos emitidos", stats?.issued ?? 0],
    ["Puntos disponibles", stats?.available ?? 0],
    ["Puntos utilizados", stats?.used ?? 0],
    ["Premios entregados", stats?.delivered ?? 0],
  ] as const;

  return (
    <section>
      <div className="rrw-stats">
        {cards.map(([label, value]) => (
          <article key={label} className="rrw-stat">
            <p className="rrw-meta">{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <article className="rrw-card">
        <h3>Jugadores más constantes</h3>
        {(stats?.consistent.length ?? 0) === 0 && <p className="rrw-meta">Aparecen cuando haya participaciones aprobadas.</p>}
        <ul className="rrw-list">
          {stats?.consistent.map((player) => (
            <li key={player.jugadorId}><span>{player.nombre}</span><span>{player.participaciones}</span></li>
          ))}
        </ul>
      </article>
      {(stats?.comparison.length ?? 0) > 1 && (
        <article className="rrw-card">
          <h3>Comparación entre campañas</h3>
          <ul className="rrw-list">
            {stats?.comparison.map((campaign) => (
              <li key={campaign.id}>
                <span>{campaign.nombre}</span>
                <span>{campaign.emitidos} emitidos · {campaign.disponibles} disponibles · {campaign.entregados} entregados</span>
              </li>
            ))}
          </ul>
        </article>
      )}
      <article className="rrw-card">
        <h3>Cola y recuperación</h3>
        <p className="rrw-meta">
          Pendientes: {queue.filter((item) => item.estado === "pendiente").length}. Con error: {queue.filter((item) => item.estado === "error").length}.
        </p>
        {queue.filter((item) => item.last_error).slice(0, 3).map((item) => (
          <p key={item.id} className="rrw-meta">{item.last_error}</p>
        ))}
        <div className="rrw-actions">
          <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={onSync}>Recuperar participaciones</button>
          <button type="button" className="rrw-btn" disabled={busy} onClick={onProcess}>Procesar cola</button>
          <button type="button" className="rrw-btn--ghost" disabled={busy} onClick={onClose}>Cerrar ventanas vencidas</button>
        </div>
        <p className="rrw-note">
          El cierre y el reintento automático solo quedan programados si pg_cron ya existe en el proyecto. Esta pantalla no activa ese trabajo. La alternativa compatible con Supabase es un cron de base de datos, o una función programada con service_role, que ejecute rewards_retry_accruals. El navegador del club no puede lanzar esa cola global.
        </p>
      </article>
    </section>
  );
}
