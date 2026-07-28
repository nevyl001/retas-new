-- =============================================================================
-- ROLLBACK — restaura exactamente lo que elimina
-- cleanup-foreign-block-20260728.sql. Reconstruido a partir de las
-- definiciones capturadas en la auditoría del 2026-07-28.
--
-- NO EJECUTAR salvo que la limpieza ya se haya aplicado y se decida
-- revertirla. Idempotente (usa IF NOT EXISTS / OR REPLACE donde aplica).
--
-- Todas las tablas restauradas quedan VACÍAS (tenían 0 filas al momento
-- del backup) — no hay datos que reinyectar salvo en `boxes`, que este
-- script NO toca porque el cleanup tampoco la tocó.
-- =============================================================================

BEGIN;

-- ── 1. Enums (recrear antes que las tablas que los usan) ─────────────────
DO $$ BEGIN
  CREATE TYPE public.clase_estado AS ENUM ('programada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.membresia_estado AS ENUM ('vigente', 'vencida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.metodo_asignacion AS ENUM ('automatico', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_tipo AS ENUM ('mensual_fijo', 'convenio_externo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pr_unidad AS ENUM ('lbs', 'reps', 'segundos', 'metros');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.record_tipo AS ENUM ('pr', 'rm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reserva_estado AS ENUM ('confirmada', 'cancelada', 'asistio', 'no_asistio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.skill_estado AS ENUM ('en_proceso', 'logrado', 'dominado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tablas — padres antes que hijas (orden inverso al DROP) ───────────
-- NOTA: requiere que public.boxes y public.profiles SIGAN existiendo
-- (el cleanup nunca las tocó) para que las FKs de abajo resuelvan.

CREATE TABLE IF NOT EXISTS public.planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text,
  tipo public.plan_tipo,
  precio numeric,
  duracion_dias integer,
  activo boolean,
  CONSTRAINT planes_duracion_dias_check CHECK (duracion_dias > 0)
);
-- Nota: reconstruir columnas exactas (nombre/precio/activo, nullability)
-- desde information_schema.columns del backup antes de ejecutar en serio —
-- este script prioriza reconstruir CONSTRAINTS y RELACIONES verificadas;
-- completar tipos exactos de columnas no capturadas explícitamente en el
-- backup si el rollback llega a ejecutarse de verdad.

CREATE TABLE IF NOT EXISTS public.membresias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.planes(id),
  fecha_inicio date,
  fecha_fin date,
  estado public.membresia_estado,
  metodo_asignacion public.metodo_asignacion,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT membresias_check CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS public.clases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  cupo_maximo integer,
  coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entrenamiento text,
  estado public.clase_estado,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT clases_cupo_maximo_check CHECK (cupo_maximo > 0),
  CONSTRAINT clases_check CHECK (hora_fin > hora_inicio)
);

CREATE TABLE IF NOT EXISTS public.reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clase_id uuid NOT NULL REFERENCES public.clases(id) ON DELETE CASCADE,
  estado public.reserva_estado,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atleta_pr_marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ejercicio text,
  record_tipo public.record_tipo,
  rm_reps integer,
  valor numeric,
  unidad public.pr_unidad,
  fecha date,
  notas text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT atleta_pr_marcas_valor_check CHECK (valor > 0::numeric),
  CONSTRAINT atleta_pr_marcas_rm_reps_check CHECK (rm_reps IS NULL OR rm_reps > 0)
);

CREATE TABLE IF NOT EXISTS public.atleta_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill text,
  estado public.skill_estado,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT atleta_skills_usuario_id_skill_key UNIQUE (usuario_id, skill)
);

CREATE TABLE IF NOT EXISTS public.atleta_skill_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES public.atleta_skills(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  estado_anterior public.skill_estado,
  estado_nuevo public.skill_estado,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- ── 3. Índices ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_membresias_estado ON public.membresias (estado);
CREATE INDEX IF NOT EXISTS idx_membresias_fecha_fin ON public.membresias (fecha_fin);
CREATE INDEX IF NOT EXISTS idx_membresias_usuario ON public.membresias (usuario_id);
CREATE INDEX IF NOT EXISTS idx_clases_coach ON public.clases (coach_id);
CREATE INDEX IF NOT EXISTS idx_clases_fecha ON public.clases (fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_activa ON public.reservas (estado);
CREATE INDEX IF NOT EXISTS idx_reservas_clase ON public.reservas (clase_id);
CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON public.reservas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_atleta_pr_ejercicio ON public.atleta_pr_marcas (ejercicio);
CREATE INDEX IF NOT EXISTS idx_atleta_pr_usuario ON public.atleta_pr_marcas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_atleta_skills_usuario ON public.atleta_skills (usuario_id);
CREATE INDEX IF NOT EXISTS idx_atleta_skill_hist ON public.atleta_skill_historial (skill_id);

-- ── 4. Funciones ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.get_my_box_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT box_id FROM profiles WHERE user_id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_super_admin = true); $$;

-- is_admin() e is_coach_or_admin() NO se restauran aquí: el cleanup nunca
-- las tocó (pg_depend mostró que 3 políticas de profiles las usan), así
-- que siguen existiendo en la base sin que este rollback tenga que hacer nada.

CREATE OR REPLACE FUNCTION public.is_coach_of_clase(p_clase_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM clases c WHERE c.id = p_clase_id AND c.coach_id = get_my_profile_id()); $$;

CREATE OR REPLACE FUNCTION public.is_my_box_active()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM boxes b JOIN profiles p ON p.box_id = b.id WHERE p.user_id = auth.uid() AND b.status = 'active'); $$;

CREATE OR REPLACE FUNCTION public.validate_coach_profile()
 RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.coach_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.coach_id AND rol IN ('admin','coach')) THEN
      RAISE EXCEPTION 'coach_id must reference a profile with rol admin or coach';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_membresia_estado()
 RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'cancelada' THEN RETURN NEW; END IF;
  IF NEW.fecha_fin < CURRENT_DATE THEN NEW.estado := 'vencida'; ELSE NEW.estado := 'vigente'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.refresh_vencidas_membresias()
 RETURNS void LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE membresias SET updated_at = now() WHERE estado = 'vigente' AND fecha_fin < CURRENT_DATE;
END; $$;

CREATE OR REPLACE FUNCTION public.check_reserva_cupo()
 RETURNS trigger LANGUAGE plpgsql
AS $$
DECLARE v_cupo_max INT; v_ocupado INT;
BEGIN
  IF NEW.estado NOT IN ('confirmada','asistio') THEN RETURN NEW; END IF;
  SELECT cupo_maximo INTO v_cupo_max FROM clases WHERE id = NEW.clase_id;
  SELECT COUNT(*) INTO v_ocupado FROM reservas
    WHERE clase_id = NEW.clase_id AND estado IN ('confirmada','asistio') AND id IS DISTINCT FROM NEW.id;
  IF v_ocupado >= v_cupo_max THEN RAISE EXCEPTION 'Clase llena: cupo máximo alcanzado'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.check_reserva_timing()
 RETURNS trigger LANGUAGE plpgsql
AS $$
DECLARE clase_rec RECORD; class_start TIMESTAMPTZ; class_end TIMESTAMPTZ; cutoff TIMESTAMPTZ; v_gym_tz TEXT;
BEGIN
  SELECT c.fecha, c.hora_inicio, c.hora_fin, c.estado, b.timezone INTO clase_rec
    FROM clases c JOIN profiles coach ON coach.id = c.coach_id JOIN boxes b ON b.id = coach.box_id
    WHERE c.id = NEW.clase_id;
  IF NOT FOUND THEN
    SELECT c.fecha, c.hora_inicio, c.hora_fin, c.estado, b.timezone INTO clase_rec
      FROM clases c JOIN profiles p ON p.id = NEW.usuario_id JOIN boxes b ON b.id = p.box_id
      WHERE c.id = NEW.clase_id;
  END IF;
  IF NOT FOUND OR clase_rec.estado != 'programada' THEN RAISE EXCEPTION 'Clase no disponible para reservar'; END IF;
  v_gym_tz := COALESCE(clase_rec.timezone, 'America/Mexico_City');
  class_start := (clase_rec.fecha + clase_rec.hora_inicio)::timestamp AT TIME ZONE v_gym_tz;
  class_end := (clase_rec.fecha + clase_rec.hora_fin)::timestamp AT TIME ZONE v_gym_tz;
  cutoff := class_start - INTERVAL '20 minutes';
  IF NOW() >= class_end THEN RAISE EXCEPTION 'La clase ya finalizó'; END IF;
  IF NOW() >= cutoff THEN RAISE EXCEPTION 'Reservas cerradas: máximo 20 minutos antes del inicio'; END IF;
  RETURN NEW;
END; $$;

-- handle_new_user + su trigger en auth.users — restaurar solo si de
-- verdad se quiere que vuelva a crear filas de profiles en cada signup
-- real de Riviera Open (probablemente NO se quiere; incluido por
-- completitud del rollback, no como recomendación).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_box_id UUID;
BEGIN
  v_box_id := (NEW.raw_user_meta_data->>'box_id')::UUID;
  IF v_box_id IS NULL THEN
    SELECT id INTO v_box_id FROM boxes WHERE slug = 'parabellum-cross';
  END IF;
  INSERT INTO profiles (user_id, nombre_completo, telefono, bio, rol, estado_cuenta, box_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'telefono',
    NEW.raw_user_meta_data->>'bio',
    COALESCE((NEW.raw_user_meta_data->>'rol')::user_role, 'socio'),
    'pendiente_pago',
    v_box_id
  );
  RETURN NEW;
END; $$;

-- ── 5. Triggers ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_membresia_estado ON public.membresias;
CREATE TRIGGER trg_sync_membresia_estado BEFORE INSERT OR UPDATE ON public.membresias
  FOR EACH ROW EXECUTE FUNCTION sync_membresia_estado();

DROP TRIGGER IF EXISTS trg_validate_coach ON public.clases;
CREATE TRIGGER trg_validate_coach BEFORE INSERT OR UPDATE ON public.clases
  FOR EACH ROW EXECUTE FUNCTION validate_coach_profile();

DROP TRIGGER IF EXISTS trg_check_reserva_cupo ON public.reservas;
CREATE TRIGGER trg_check_reserva_cupo BEFORE INSERT OR UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION check_reserva_cupo();

DROP TRIGGER IF EXISTS trg_reserva_timing ON public.reservas;
CREATE TRIGGER trg_reserva_timing BEFORE INSERT ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION check_reserva_timing();

-- Solo restaurar si de verdad se quiere que vuelva a dispararse en cada
-- signup real (ver nota arriba en handle_new_user):
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 6. Vistas ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.membresia_actual AS
 SELECT DISTINCT ON (m.usuario_id) m.id, m.usuario_id, m.plan_id, m.fecha_inicio,
    m.fecha_fin, m.estado, m.metodo_asignacion, m.notas,
    p.nombre AS plan_nombre, p.tipo AS plan_tipo, p.precio AS plan_precio
   FROM membresias m JOIN planes p ON p.id = m.plan_id
  WHERE m.estado = ANY (ARRAY['vigente'::membresia_estado, 'vencida'::membresia_estado])
  ORDER BY m.usuario_id, m.fecha_fin DESC;

CREATE OR REPLACE VIEW public.alertas_membresia AS
 SELECT pr.id AS profile_id, pr.nombre_completo, pr.telefono, pr.user_id,
    ma.plan_nombre, ma.fecha_fin,
    CASE
        WHEN ma.fecha_fin < CURRENT_DATE THEN 'vencida'::text
        WHEN ma.fecha_fin <= (CURRENT_DATE + '3 days'::interval) THEN 'por_vencer'::text
        ELSE 'ok'::text
    END AS tipo_alerta
   FROM profiles pr LEFT JOIN membresia_actual ma ON ma.usuario_id = pr.id
  WHERE pr.rol = 'socio'::user_role AND (ma.fecha_fin IS NULL OR ma.fecha_fin < CURRENT_DATE OR ma.fecha_fin <= (CURRENT_DATE + '3 days'::interval));

CREATE OR REPLACE VIEW public.reservas_con_cupo AS
 SELECT c.id, c.nombre, c.fecha, c.hora_inicio, c.hora_fin, c.cupo_maximo,
    c.coach_id, c.entrenamiento, c.estado, c.created_at, c.updated_at,
    COALESCE(pr.nombre_completo, 'Sin coach'::text) AS coach_nombre,
    ( SELECT count(*)::integer FROM reservas r
           WHERE r.clase_id = c.id AND (r.estado = ANY (ARRAY['confirmada'::reserva_estado, 'asistio'::reserva_estado]))) AS cupo_ocupado
   FROM clases c LEFT JOIN profiles pr ON pr.id = c.coach_id;

-- ── 7. Grants (los mismos que tenía antes de la limpieza — no una
--       recomendación, una restauración fiel del estado previo) ─────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membresias, public.planes, public.clases, public.reservas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atleta_pr_marcas, public.atleta_skills, public.atleta_skill_historial TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas_membresia, public.membresia_actual, public.reservas_con_cupo TO anon, authenticated;

COMMIT;
