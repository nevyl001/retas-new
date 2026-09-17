-- Acapulco Padel Tour: branding premium + modos habilitados
-- Email de login: apt001@gmail.com
-- Ejecutar en SQL Editor (Primary) de Supabase.

DO $$
DECLARE
  v_org_id uuid;
  v_email text := 'apt001@gmail.com';
BEGIN
  SELECT id INTO v_org_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No existe auth.users con email %. Crea el usuario organizador primero.', v_email;
  END IF;

  INSERT INTO public.organizador_game_modes (
    organizador_id,
    reta_equipos,
    round_robin,
    americano,
    mini_torneo,
    liga,
    duelo_2v2,
    permite_ajuste_puntos_manuales,
    visible_ranking_oficial,
    premium_branding_enabled,
    branding_key
  )
  VALUES (
    v_org_id,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    'acapulco-padel-tour'
  )
  ON CONFLICT (organizador_id) DO UPDATE SET
    reta_equipos = EXCLUDED.reta_equipos,
    round_robin = EXCLUDED.round_robin,
    americano = EXCLUDED.americano,
    mini_torneo = EXCLUDED.mini_torneo,
    liga = EXCLUDED.liga,
    duelo_2v2 = EXCLUDED.duelo_2v2,
    permite_ajuste_puntos_manuales = EXCLUDED.permite_ajuste_puntos_manuales,
    visible_ranking_oficial = EXCLUDED.visible_ranking_oficial,
    premium_branding_enabled = EXCLUDED.premium_branding_enabled,
    branding_key = EXCLUDED.branding_key,
    updated_at = now();

  RAISE NOTICE 'Patch APT aplicado a organizador_id=% (email=%)', v_org_id, v_email;
END $$;

-- Verificación
SELECT u.id AS organizador_id, u.email, ogm.premium_branding_enabled, ogm.branding_key,
       ogm.reta_equipos, ogm.round_robin, ogm.americano, ogm.mini_torneo, ogm.liga, ogm.duelo_2v2
FROM auth.users u
LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = u.id
WHERE lower(u.email) = lower('apt001@gmail.com');

SELECT *
FROM public.get_organizador_branding_public(
  (SELECT id FROM auth.users WHERE lower(email) = lower('apt001@gmail.com') LIMIT 1)
);
