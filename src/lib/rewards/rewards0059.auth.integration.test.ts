/**
 * @jest-environment node
 *
 * Pruebas SQL REALES (PGlite/PostgreSQL) de autorización para la migración 0059.
 * Carga 0058 + 0059 con identidades, clubes y roles distintos (anon/authenticated).
 * `_resolve_official_player_key` vive fuera de /migrations en este repo; aquí se usa un
 * stub equivalente (lookup en riviera_official_player_profile_link).
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

const nodeBuffer = require("buffer");
if (typeof (global as { Blob?: unknown }).Blob === "undefined") {
  (global as { Blob?: unknown }).Blob = nodeBuffer.Blob;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inDollarQuote: string | null = null;
  let inSingleQuote = false;
  while (i < sql.length) {
    if (inDollarQuote) {
      if (sql.startsWith(inDollarQuote, i)) {
        current += inDollarQuote;
        i += inDollarQuote.length;
        inDollarQuote = null;
        continue;
      }
      current += sql[i++];
      continue;
    }
    if (inSingleQuote) {
      if (sql[i] === "'" && sql[i + 1] === "'") {
        current += "''";
        i += 2;
        continue;
      }
      if (sql[i] === "'") inSingleQuote = false;
      current += sql[i++];
      continue;
    }
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }
    if (sql[i] === "$") {
      const match = sql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        inDollarQuote = match[1];
        current += inDollarQuote;
        i += inDollarQuote.length;
        continue;
      }
    }
    if (sql[i] === "'") {
      inSingleQuote = true;
      current += "'";
      i++;
      continue;
    }
    if (sql[i] === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i++;
      continue;
    }
    current += sql[i++];
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const CLUB_PAD = "11111111-1111-4111-a111-111111111111"; // Padelito Warehouse
const CLUB_HACK = "22222222-2222-4222-a222-222222222222"; // Hack Padel

const U_CARLOS = "c0000000-0000-4000-a000-000000000001";
const U_MARIA = "c0000000-0000-4000-a000-000000000002";
const U_EVE = "c0000000-0000-4000-a000-000000000003"; // sin vínculos
const U_DANA = "c0000000-0000-4000-a000-000000000004";
const U_FRANK = "c0000000-0000-4000-a000-000000000005";

const HACK_J = "aaaaaaaa-0000-4000-a000-000000000001"; // Carlos, registrado en Hack
const PAD_J = "aaaaaaaa-0000-4000-a000-000000000002"; // Carlos, perfil en Padelito
const PAD_M = "aaaaaaaa-0000-4000-a000-000000000003"; // María, Padelito
const DANA_H = "aaaaaaaa-0000-4000-a000-000000000004"; // Dana en Hack (origen cedido)
const DANA_P = "aaaaaaaa-0000-4000-a000-000000000005"; // Dana clon en Padelito
const FRANK_H = "aaaaaaaa-0000-4000-a000-000000000006";
const FRANK_P = "aaaaaaaa-0000-4000-a000-000000000007";

const KEY_CARLOS = "dddddddd-0000-4000-a000-000000000001";

describe("Migración 0059 — autorización multiclub (SQL real)", () => {
  let db: PGliteType;
  let campPad: string;
  let campHack: string;
  let rewardPad: string;

  const session = async (uid: string | null, master = false) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`SELECT set_config('request.jwt.claim.is_master', '${master}', false);`);
  };

  const asRole = async <T,>(role: "anon" | "authenticated", fn: () => Promise<T>): Promise<T> => {
    await db.exec(`SET ROLE ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec("RESET ROLE;");
    }
  };

  const snapshot = async (jug: string, org?: string) => {
    const res = await db.query<{ s: any }>(
      org
        ? `SELECT public.rewards_player_snapshot('${jug}', '${org}') AS s`
        : `SELECT public.rewards_player_snapshot('${jug}') AS s`
    );
    return res.rows[0].s;
  };

  beforeAll(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    db = new PGlite();

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE TABLE public.tournaments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizador_id uuid NOT NULL, format text DEFAULT 'teams');
      CREATE TABLE public.duelos_2v2 (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizador_id uuid NOT NULL);
      CREATE TABLE public.riviera_jugadores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizador_id uuid NOT NULL, nombre text NOT NULL, categoria text DEFAULT 'open', estado text DEFAULT 'activo');
      CREATE TABLE public.jugador_participaciones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), jugador_id uuid NOT NULL, tipo_evento text NOT NULL,
        evento_id uuid NOT NULL, evento_nombre text, fecha date, pareja_con text, resultado text,
        sets_favor integer DEFAULT 0, sets_contra integer DEFAULT 0, puntos_obtenidos integer DEFAULT 0,
        metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
      CREATE TABLE public.organizer_player_access (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organizador_id uuid NOT NULL,
        grantee_organizer_id uuid NOT NULL, jugador_id uuid NOT NULL, local_jugador_id uuid NOT NULL,
        is_active boolean DEFAULT true);
      CREATE TABLE public.riviera_official_player_profile_link (riviera_jugador_id uuid PRIMARY KEY, official_player_key uuid NOT NULL);
      CREATE TABLE public.riviera_official_player_identity (official_player_key uuid PRIMARY KEY, canonical_riviera_jugador_id uuid);
      -- Definición idéntica a la de producción (verificada en solo lectura el 2026-10-12).
      CREATE OR REPLACE FUNCTION public._resolve_official_player_key(p_riviera_jugador_id uuid)
       RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      DECLARE
        v_key uuid;
        v_source_id uuid;
      BEGIN
        SELECT l.official_player_key INTO v_key
        FROM public.riviera_official_player_profile_link l
        WHERE l.riviera_jugador_id = p_riviera_jugador_id;
        IF v_key IS NOT NULL THEN RETURN v_key; END IF;

        SELECT opa.jugador_id INTO v_source_id
        FROM public.organizer_player_access opa
        WHERE opa.is_active = true AND opa.local_jugador_id = p_riviera_jugador_id LIMIT 1;
        IF v_source_id IS NOT NULL THEN
          SELECT l.official_player_key INTO v_key
          FROM public.riviera_official_player_profile_link l WHERE l.riviera_jugador_id = v_source_id;
          IF v_key IS NOT NULL THEN RETURN v_key; END IF;
        END IF;

        SELECT l.official_player_key INTO v_key
        FROM public.organizer_player_access opa
        JOIN public.riviera_official_player_profile_link l ON l.riviera_jugador_id = opa.local_jugador_id
        WHERE opa.is_active = true AND opa.jugador_id = p_riviera_jugador_id LIMIT 1;
        IF v_key IS NOT NULL THEN RETURN v_key; END IF;

        SELECT i.official_player_key INTO v_key
        FROM public.organizer_player_access opa
        JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = opa.jugador_id
        WHERE opa.is_active = true AND opa.local_jugador_id = p_riviera_jugador_id LIMIT 1;
        RETURN v_key;
      END;
      $function$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$ LANGUAGE sql STABLE;
      CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.is_master', true) = 'true', false); $$ LANGUAGE sql STABLE;
    `);

    for (const file of [
      "0058_riviera_rewards_phase1.sql",
      "0059_rewards_multiclub_identity_resolution.sql",
    ]) {
      const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/", file), "utf8");
      for (const stmt of splitSqlStatements(sql)) {
        if (stmt.includes("cron.schedule") || stmt.includes("pg_cron") || stmt.includes("pg_extension")) continue;
        try {
          await db.exec(stmt);
        } catch (err) {
          throw new Error(`Error en ${file}:\n${stmt}\n-> ${err}`);
        }
      }
    }

    // Datos
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${U_CARLOS}','carlos@test.mx'),('${U_MARIA}','maria@test.mx'),('${U_EVE}','eve@test.mx'),
        ('${U_DANA}','dana@test.mx'),('${U_FRANK}','frank@test.mx');
      INSERT INTO public.riviera_jugadores (id, organizador_id, nombre) VALUES
        ('${HACK_J}','${CLUB_HACK}','Carlos (Hack)'),('${PAD_J}','${CLUB_PAD}','Carlos (Padelito)'),
        ('${PAD_M}','${CLUB_PAD}','María'),
        ('${DANA_H}','${CLUB_HACK}','Dana H'),('${DANA_P}','${CLUB_PAD}','Dana P'),
        ('${FRANK_H}','${CLUB_HACK}','Frank H'),('${FRANK_P}','${CLUB_PAD}','Frank P');
      INSERT INTO public.riviera_official_player_profile_link VALUES
        ('${HACK_J}','${KEY_CARLOS}'),('${PAD_J}','${KEY_CARLOS}');
      INSERT INTO public.organizer_player_access
        (owner_organizador_id, grantee_organizer_id, jugador_id, local_jugador_id, is_active) VALUES
        ('${CLUB_HACK}','${CLUB_PAD}','${DANA_H}','${DANA_P}', true),
        ('${CLUB_HACK}','${CLUB_PAD}','${FRANK_H}','${FRANK_P}', false);
    `);

    // Campañas, premio y puntos (ventana de canje abierta)
    for (const [org, name] of [
      [CLUB_PAD, "Padelito Octubre"],
      [CLUB_HACK, "Hack Octubre"],
    ]) {
      await session(org);
      const r = await db.query<{ id: string }>(`
        SELECT public.rewards_save_campaign(jsonb_build_object(
          'organizador_id','${org}','nombre','${name}',
          'acumula_desde',(now()+interval '1 day')::text,'acumula_hasta',(now()+interval '20 days')::text,
          'canje_desde',(now()+interval '21 days')::text,'canje_hasta',(now()+interval '50 days')::text,
          'puntos_por_participacion',10,'modalidades',jsonb_build_array('reta_equipos'),
          'estado','activa','visible_jugadores',true)) AS id`);
      const id = r.rows[0].id;
      await db.exec(`UPDATE public.rewards_campaigns SET
        acumula_desde = now()-interval '40 days', acumula_hasta = now()-interval '10 days',
        canje_desde = now()-interval '1 hour', canje_hasta = now()+interval '20 days' WHERE id='${id}'`);
      if (org === CLUB_PAD) campPad = id;
      else campHack = id;
    }
    await session(CLUB_PAD);
    const rw = await db.query<{ id: string }>(`
      SELECT public.rewards_save_reward(jsonb_build_object('campaign_id','${campPad}',
        'organizador_id','${CLUB_PAD}','nombre','Grip','costo_puntos',50,'tipo','producto','estado','activo')) AS id`);
    rewardPad = rw.rows[0].id;

    const lot = (org: string, camp: string, jug: string, pts: number) => `
      INSERT INTO public.rewards_lots (organizador_id, campaign_id, jugador_id, participacion_id, tipo_evento,
        evento_id, idempotency_key, puntos_originales, puntos_restantes, earned_at)
      VALUES ('${org}','${camp}','${jug}', gen_random_uuid(),'reta', gen_random_uuid(),
        'k-' || gen_random_uuid()::text, ${pts}, ${pts}, now()-interval '20 days');`;
    await db.exec(
      lot(CLUB_PAD, campPad, PAD_J, 70) +
        lot(CLUB_PAD, campPad, PAD_M, 20) +
        lot(CLUB_PAD, campPad, DANA_P, 10) +
        lot(CLUB_PAD, campPad, FRANK_P, 10) +
        lot(CLUB_HACK, campHack, HACK_J, 30)
    );

    // Vínculos creados por el administrador de Padelito (por correo)
    await db.exec(`SELECT public.rewards_link_player('${CLUB_PAD}','${PAD_J}','carlos@test.mx');`);
    await db.exec(`SELECT public.rewards_link_player('${CLUB_PAD}','${PAD_M}','maria@test.mx');`);
    await db.exec(`SELECT public.rewards_link_player('${CLUB_PAD}','${DANA_P}','dana@test.mx');`);
    await db.exec(`SELECT public.rewards_link_player('${CLUB_PAD}','${FRANK_P}','frank@test.mx');`);
  });

  afterAll(async () => {
    await db?.close();
  });

  // ── 3 y 4: permisos, search_path, firma ──────────────────────────────────

  it("nueva firma única: sin sobrecargas ambiguas y sin parámetro de cuenta", async () => {
    const r = await db.query<{ args: string }>(`
      SELECT pg_get_function_arguments(oid) AS args FROM pg_proc
      WHERE proname='rewards_player_snapshot' AND pronamespace='public'::regnamespace`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].args).toBe("p_jugador_id uuid, p_organizador_id uuid DEFAULT NULL::uuid");
    const gone = await db.query(`SELECT 1 FROM pg_proc WHERE proname='rewards_is_account_linked_to_player'`);
    expect(gone.rows).toHaveLength(0);
  });

  it("permisos mínimos y search_path seguro", async () => {
    const p = await db.query<Record<string, boolean>>(`
      SELECT
        has_function_privilege('anon','public.rewards_player_snapshot(uuid,uuid)','EXECUTE') AS snap_anon,
        has_function_privilege('authenticated','public.rewards_player_snapshot(uuid,uuid)','EXECUTE') AS snap_auth,
        has_function_privilege('anon','public.rewards_same_player(uuid,uuid)','EXECUTE') AS same_anon,
        has_function_privilege('authenticated','public.rewards_same_player(uuid,uuid)','EXECUTE') AS same_auth,
        has_function_privilege('authenticated','public.rewards_balance(uuid,uuid)','EXECUTE') AS bal_auth,
        has_function_privilege('anon','public.rewards_balance(uuid,uuid)','EXECUTE') AS bal_anon`);
    expect(p.rows[0]).toEqual({
      snap_anon: false, snap_auth: true, same_anon: false, same_auth: false, bal_auth: true, bal_anon: false,
    });
    const cfg = await db.query<{ proname: string; proconfig: string[]; prosecdef: boolean }>(`
      SELECT proname, proconfig, prosecdef FROM pg_proc
      WHERE pronamespace='public'::regnamespace AND proname IN ('rewards_player_snapshot','rewards_same_player')`);
    for (const row of cfg.rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig.join(",")).toContain("search_path=public, pg_temp");
    }
  });

  it("anon y sesión ausente no pueden consultar (fail-closed)", async () => {
    await session(U_CARLOS);
    await asRole("anon", async () => {
      await expect(snapshot(PAD_J)).rejects.toThrow(/permission denied/i);
    });
    await session(null);
    await asRole("authenticated", async () => {
      await expect(snapshot(PAD_J)).rejects.toThrow(/Sin sesión/);
    });
  });

  // ── 6: Hack → Padelito ───────────────────────────────────────────────────

  it("Carlos (registrado en Hack) ve sus puntos de Padelito desde su perfil de Hack", async () => {
    await session(U_CARLOS);
    const s = await asRole("authenticated", () => snapshot(HACK_J));
    expect(s.organizador_id).toBe(CLUB_PAD);
    expect(s.jugador_id).toBe(PAD_J);
    expect(s.saldos).toHaveLength(1);
    expect(s.saldos[0].campaign_id).toBe(campPad);
    expect(s.saldos[0].disponible).toBe(70);
    expect(s.premios.map((x: any) => x.id)).toEqual([rewardPad]);
    expect(s.clubes_autorizados).toEqual([{ organizador_id: CLUB_PAD, jugador_id: PAD_J }]);
  });

  it("Carlos no puede forzar un club donde no tiene vínculo propio", async () => {
    await session(U_CARLOS);
    await asRole("authenticated", async () => {
      await expect(snapshot(HACK_J, CLUB_HACK)).rejects.toThrow(/no está vinculada/);
      expect((await snapshot(HACK_J, CLUB_PAD)).organizador_id).toBe(CLUB_PAD);
    });
  });

  // ── 2 y 7: otras personas ────────────────────────────────────────────────

  it("otra cuenta nunca ve ni canjea los puntos de Carlos", async () => {
    const assertCannotAccessCarlos = async (intruder: string) => {
      await session(intruder);
      await asRole("authenticated", async () => {
        for (const target of [HACK_J, PAD_J]) {
          for (const org of [undefined, CLUB_PAD, CLUB_HACK]) {
            await expect(snapshot(target, org)).rejects.toThrow(/no está vinculada/);
          }
        }
        // Saldos / canje directos (RPC existentes, intactas) tampoco
        await expect(
          db.query(`SELECT public.rewards_balance('${CLUB_PAD}','${PAD_J}')`)
        ).rejects.toThrow(/Sin permiso sobre este club/);
        await expect(
          db.query(`SELECT public.rewards_request_redemption('${CLUB_PAD}','${rewardPad}','${PAD_J}')`)
        ).rejects.toThrow(/Sin permiso para solicitar este canje/);
      });
    };
    for (const intruder of [U_EVE, U_MARIA, U_DANA]) {
      await assertCannotAccessCarlos(intruder);
    }
  });

  it("María solo ve sus propios 20 puntos", async () => {
    await session(U_MARIA);
    const s = await asRole("authenticated", () => snapshot(PAD_M));
    expect(s.saldos[0].disponible).toBe(20);
    expect(s.jugador_id).toBe(PAD_M);
  });

  it("par origen/clon activo de organizer_player_access identifica a la misma persona; inactivo no", async () => {
    await session(U_DANA);
    const ok = await asRole("authenticated", () => snapshot(DANA_H));
    expect(ok.jugador_id).toBe(DANA_P);
    expect(ok.saldos[0].disponible).toBe(10);

    await session(U_FRANK);
    await asRole("authenticated", async () => {
      await expect(snapshot(FRANK_H)).rejects.toThrow(/no está vinculada/); // grant inactivo
      expect((await snapshot(FRANK_P)).jugador_id).toBe(FRANK_P);
    });

    // Un tercero no obtiene a Dana por conocer su perfil de origen
    await session(U_CARLOS);
    await asRole("authenticated", async () => {
      await expect(snapshot(DANA_H)).rejects.toThrow(/no está vinculada/);
    });
  });

  // ── 5: canje solo con el vínculo exacto ──────────────────────────────────

  it("Carlos solo canjea en el club y con el perfil local donde está vinculado", async () => {
    await session(U_CARLOS);
    await asRole("authenticated", async () => {
      // Con el perfil de Hack (no vinculado en Padelito) → rechazado
      await expect(
        db.query(`SELECT public.rewards_request_redemption('${CLUB_PAD}','${rewardPad}','${HACK_J}')`)
      ).rejects.toThrow(/Sin permiso para solicitar este canje/);
      // Club equivocado → rechazado
      await expect(
        db.query(`SELECT public.rewards_request_redemption('${CLUB_HACK}','${rewardPad}','${PAD_J}')`)
      ).rejects.toThrow(/Sin permiso/);
      // Correcto
      const r = await db.query<{ id: string }>(
        `SELECT public.rewards_request_redemption('${CLUB_PAD}','${rewardPad}','${PAD_J}') AS id`
      );
      expect(r.rows[0].id).toBeDefined();
    });
    const s = await asRole("authenticated", () => snapshot(HACK_J));
    expect(s.canjes).toHaveLength(1);

    await session(U_MARIA);
    const m = await asRole("authenticated", () => snapshot(PAD_M));
    expect(m.canjes).toHaveLength(0);
  });

  // ── 5: administración de clubes ──────────────────────────────────────────

  it("un club solo administra sus campañas y vínculos", async () => {
    await session(CLUB_HACK);
    await expect(
      db.exec(`SELECT public.rewards_save_campaign(jsonb_build_object('id','${campPad}','organizador_id','${CLUB_PAD}','nombre','x'))`)
    ).rejects.toThrow(/Sin permiso sobre este club/);
    await expect(
      db.exec(`SELECT public.rewards_link_player('${CLUB_PAD}','${PAD_M}','eve@test.mx')`)
    ).rejects.toThrow(/Sin permiso sobre este club/);
    // Hack no puede vincular un jugador de Padelito aunque declare su propio club
    await expect(
      db.exec(`SELECT public.rewards_link_player('${CLUB_HACK}','${PAD_M}','eve@test.mx')`)
    ).rejects.toThrow(/no pertenece a este club/);
  });

  // ── 6: dos clubes, saldos separados ──────────────────────────────────────

  it("con vínculo en ambos clubes los saldos permanecen separados", async () => {
    await session(CLUB_HACK);
    await db.exec(`SELECT public.rewards_link_player('${CLUB_HACK}','${HACK_J}','carlos@test.mx')`);

    await session(U_CARLOS);
    await asRole("authenticated", async () => {
      const hack = await snapshot(HACK_J); // perfil exacto → Hack
      expect(hack.organizador_id).toBe(CLUB_HACK);
      expect(hack.saldos).toHaveLength(1);
      expect(hack.saldos[0].campaign_id).toBe(campHack);
      expect(hack.saldos[0].disponible).toBe(30);
      expect(hack.clubes_autorizados).toHaveLength(2);

      const pad = await snapshot(HACK_J, CLUB_PAD);
      expect(pad.saldos[0].campaign_id).toBe(campPad);
      expect(pad.saldos[0].disponible).toBeGreaterThanOrEqual(20); // nunca mezcla los 30 de Hack
      expect(pad.saldos[0].disponible).not.toBe(30);
      expect(pad.canjes).toHaveLength(1);
      expect(hack.canjes).toHaveLength(0);
    });

    // El vínculo de Carlos en Hack no abre nada a María
    await session(U_MARIA);
    await asRole("authenticated", async () => {
      await expect(snapshot(HACK_J, CLUB_HACK)).rejects.toThrow(/no está vinculada/);
    });
  });
});
