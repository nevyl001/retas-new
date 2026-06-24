-- Auditoría: usuarios y datos huérfanos tras borrados desde admin.
-- Ejecutar en Supabase → SQL Editor (como postgres / bypass RLS).

-- ── 1. Cuentas en public.users ──
SELECT 'public.users' AS tabla, count(*) AS filas FROM public.users;
SELECT id, email, name, created_at FROM public.users ORDER BY created_at;

-- ── 2. Cuentas en auth.users (login real) ──
SELECT 'auth.users' AS tabla, count(*) AS filas FROM auth.users;
SELECT id, email, created_at FROM auth.users ORDER BY created_at;

-- ── 3. Admins maestros ──
SELECT 'admin_users' AS tabla, count(*) AS filas FROM public.admin_users;
SELECT au.id, au.email, au.user_id, u.email AS users_email
FROM public.admin_users au
LEFT JOIN public.users u ON u.id = au.user_id;

-- ── 4. IDs en auth sin perfil public.users ──
SELECT a.id, a.email, 'solo en auth' AS nota
FROM auth.users a
LEFT JOIN public.users u ON u.id = a.id
WHERE u.id IS NULL;

-- ── 5. Perfiles public sin auth (no pueden login) ──
SELECT u.id, u.email, 'solo en public.users' AS nota
FROM public.users u
LEFT JOIN auth.users a ON a.id = u.id
WHERE a.id IS NULL;

-- ── 6. Datos por organizador (debe coincidir solo con usuarios vivos) ──
SELECT 'riviera_jugadores' AS tabla, organizador_id, count(*) AS filas
FROM public.riviera_jugadores
GROUP BY organizador_id
ORDER BY filas DESC;

SELECT 'tournaments' AS tabla, user_id AS organizador_id, count(*) AS filas
FROM public.tournaments
GROUP BY user_id
ORDER BY filas DESC;

SELECT 'torneo_express' AS tabla, organizador_id, count(*) AS filas
FROM public.torneo_express
GROUP BY organizador_id
ORDER BY filas DESC;

SELECT 'ligas' AS tabla, organizador_id, count(*) AS filas
FROM public.ligas
GROUP BY organizador_id
ORDER BY filas DESC;

SELECT 'duelos_2v2' AS tabla, organizador_id, count(*) AS filas
FROM public.duelos_2v2
GROUP BY organizador_id
ORDER BY filas DESC;

-- ── 7. Huérfanos: datos cuyo organizador ya no existe en public.users ──
SELECT 'HUERFANO riviera_jugadores' AS problema, count(*) AS filas
FROM public.riviera_jugadores r
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.organizador_id);

SELECT 'HUERFANO tournaments' AS problema, count(*) AS filas
FROM public.tournaments t
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.user_id);

SELECT 'HUERFANO torneo_express' AS problema, count(*) AS filas
FROM public.torneo_express te
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = te.organizador_id);

SELECT 'HUERFANO ligas' AS problema, count(*) AS filas
FROM public.ligas l
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.organizador_id);

SELECT 'HUERFANO duelos_2v2' AS problema, count(*) AS filas
FROM public.duelos_2v2 d
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = d.organizador_id);

SELECT 'HUERFANO organizador_game_modes' AS problema, count(*) AS filas
FROM public.organizador_game_modes ogm
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = ogm.organizador_id);
