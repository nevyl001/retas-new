-- El borrado de un coach fallaba aunque no tuviera clases ni alumnos:
-- coach_club_membership_audit_log.coach_id era ON DELETE RESTRICT.
-- El admin maestro debe poder eliminar la cuenta; la bitácora de esa ficha se va con ella.

BEGIN;

ALTER TABLE public.coach_club_membership_audit_log
  DROP CONSTRAINT IF EXISTS coach_club_membership_audit_log_coach_id_fkey;

ALTER TABLE public.coach_club_membership_audit_log
  ADD CONSTRAINT coach_club_membership_audit_log_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.riviera_coaches(id) ON DELETE CASCADE;

COMMIT;
