-- Esquema mínimo para probar 0100 fuera de Production.
-- No es el esquema real de la plataforma: solo las columnas que la migración toca.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.is_master', true), '') = 'true';
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

CREATE TABLE public.ligas (
  id uuid PRIMARY KEY,
  organizador_id uuid,
  nombre text NOT NULL
);

CREATE TABLE public.liga_jugadores (
  id uuid PRIMARY KEY,
  organizador_id uuid,
  nombre text NOT NULL,
  email text
);

CREATE TABLE public.liga_inscripciones (
  id uuid PRIMARY KEY,
  liga_id uuid NOT NULL REFERENCES public.ligas(id),
  jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id)
);

CREATE TABLE public.liga_equipos (
  id uuid PRIMARY KEY,
  liga_id uuid NOT NULL,
  jugador1_id uuid,
  jugador2_id uuid
);

CREATE TABLE public.riviera_jugadores (
  id uuid PRIMARY KEY,
  legacy_liga_jugador_id uuid,
  email text,
  estado text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.ligas, public.liga_jugadores, public.liga_inscripciones, public.liga_equipos
  TO authenticated;
