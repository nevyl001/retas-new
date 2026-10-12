/**
 * La migración de Rewards queda en el repo y no se ejecuta contra producción.
 * Este guard comprueba el contrato mensual, de seguridad y de cierre.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
  join(__dirname, "../../../supabase/migrations/0058_riviera_rewards_phase1.sql"),
  "utf8"
);

describe("migración 0058 Riviera Rewards", () => {
  it("no conserva la vigencia individual de 60 días ni el FEFO", () => {
    expect(SQL).not.toMatch(/vigencia_dias/);
    expect(SQL).not.toMatch(/expires_at/);
    expect(SQL).not.toMatch(/rewards_expires_at/);
    expect(SQL).not.toMatch(/rewards_expire_lots/);
    expect(SQL).not.toMatch(/'expiracion'/);
    expect(SQL).toMatch(/rewards_close_campaigns/);
    expect(SQL).toMatch(/'cierre'/);
    expect(SQL).toMatch(/rewards_duplicate_campaign/);
  });

  it("no acredita al insertar la participación y aísla el fallo del cierre", () => {
    expect(SQL).toMatch(/AFTER INSERT ON public\.jugador_participaciones/);
    expect(SQL).toMatch(/RAISE WARNING 'rewards candidate enqueue failed/);
    expect(SQL).not.toMatch(/UPDATE public\.jugador_participaciones/);
    expect(SQL).not.toMatch(/riviera_official_points_ledger/);
    expect(SQL).not.toMatch(/puntos_obtenidos/);
  });

  it("impide el doble crédito y exige validación administrativa", () => {
    expect(SQL).toMatch(/UNIQUE \(idempotency_key\)/);
    expect(SQL).toMatch(/rewards_lots_club_event_uidx/);
    expect(SQL).toMatch(/payment_validation_not_available/);
    expect(SQL).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(SQL).toMatch(/Reta gratuita de Rewards/);
    expect(SQL).toMatch(/PERFORM public\.rewards_accrue_one\(v_queue\)/);
    expect(SQL).toMatch(/rewards_retry_accruals/);
    expect(SQL).toMatch(/rewards_obligations/);
    expect(SQL).toMatch(/'compensacion'/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.rewards_retry_accruals/);
  });

  it("no abre escritura directa al cliente anónimo", () => {
    expect(SQL).toMatch(/REVOKE ALL ON TABLE/);
    expect(SQL).toMatch(/FROM PUBLIC, anon/);
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/organizador_id = auth\.uid\(\) OR public\.is_master_admin\(\)/);
    expect(SQL).not.toMatch(/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
  });
});
