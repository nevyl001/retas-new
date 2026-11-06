SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
SELECT public.encolar_bienvenida_liga(
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555'
);
