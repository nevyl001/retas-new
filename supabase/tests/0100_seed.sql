-- Datos de la prueba. Direcciones de ejemplo, no de jugadores reales.

INSERT INTO public.ligas (id, organizador_id, nombre) VALUES
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Liga A'),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Liga B');

INSERT INTO public.liga_jugadores (id, organizador_id, nombre, email) VALUES
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Jugador Control', 'control-real@example.test'),
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Jugador Ficticio', 'prueba@padel.local'),
  ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Jugador Ambiguo', 'control-duplicado@example.test');

INSERT INTO public.liga_inscripciones (id, liga_id, jugador_id) VALUES
  ('88888888-8888-4888-8888-888888888888', '33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555'),
  ('99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', '66666666-6666-4666-8666-666666666666'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777');

INSERT INTO public.riviera_jugadores (id, legacy_liga_jugador_id, email, estado) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'control-real@example.test', 'activo'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '77777777-7777-4777-8777-777777777777', 'control-duplicado@example.test', 'activo'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', NULL, 'control-duplicado@example.test', 'activo');
