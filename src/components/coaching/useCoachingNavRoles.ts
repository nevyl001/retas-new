import { useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { supabase } from "../../lib/supabaseClient";
import { fetchOrganizadorAccountSettings } from "../../lib/admin/accountControls";

export interface CoachingNavRoles {
  loading: boolean;
  canAccessClubCoaching: boolean;
  canAccessCoachPortal: boolean;
  canAccessStudentCoaching: boolean;
}

/**
 * Hook para determinar con precisión las capacidades y secciones de Riviera Coaching
 * a las que tiene acceso legítimo la cuenta en sesión:
 * - Club Admin: Organizador con módulo de coaching habilitado -> /coaching
 * - Coach: Entrenador con cuenta COACH_ONLY o perfil en riviera_coaches -> /coaching/mi-espacio
 * - Alumno: Cuenta STUDENT_ONLY o jugador vinculado -> /coaching/mi-coaching
 */
export function useCoachingNavRoles(): CoachingNavRoles {
  const { user, isStudentOnly, isCoachOnly, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [canAccessClubCoaching, setCanAccessClubCoaching] = useState(false);
  const [canAccessCoachPortal, setCanAccessCoachPortal] = useState(false);
  const [canAccessStudentCoaching, setCanAccessStudentCoaching] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function evaluateRoles() {
      if (userLoading) return;

      if (!user) {
        if (isMounted) {
          setCanAccessClubCoaching(false);
          setCanAccessCoachPortal(false);
          setCanAccessStudentCoaching(false);
          setLoading(false);
        }
        return;
      }

      // 1. Roles por metadata explícita y verificaciones estrictas (sin fallbacks optimistas)
      let clubAccess = false;
      let coachAccess = isCoachOnly;
      let studentAccess = isStudentOnly;

      try {
        // Verificar configuración de coaching para Club Admin
        // No asumir permisos si no es organizador o si la llamada falla
        if (!isStudentOnly && !isCoachOnly) {
          try {
            const settings = await fetchOrganizadorAccountSettings(user.id);
            if (settings?.coachingEnabled === true) {
              clubAccess = true;
            } else {
              clubAccess = false;
            }
          } catch (settingsErr) {
            console.warn(
              "[coachingNav] No se pudo verificar configuracion de organizador, denegando acceso administrativo por seguridad:",
              settingsErr
            );
            clubAccess = false;
          }
        }

        // Si no es coachOnly pero tiene un perfil legítimo de coach registrado
        if (!coachAccess) {
          const { data: coachRecord } = await supabase
            .from("riviera_coaches")
            .select("id")
            .eq("auth_user_id", user.id)
            .maybeSingle();

          if (coachRecord) {
            coachAccess = true;
          }
        }

        // Si no es studentOnly pero tiene un vínculo activo de alumno
        if (!studentAccess) {
          const { data: studentLink } = await supabase
            .from("coach_student_account_links")
            .select("id")
            .eq("auth_user_id", user.id)
            .eq("is_active", true)
            .maybeSingle();

          if (studentLink) {
            studentAccess = true;
          }
        }
      } catch (err) {
        console.warn("[coachingNav] error evaluating coaching roles:", err);
      } finally {
        if (isMounted) {
          setCanAccessClubCoaching(clubAccess);
          setCanAccessCoachPortal(coachAccess);
          setCanAccessStudentCoaching(studentAccess);
          setLoading(false);
        }
      }
    }

    void evaluateRoles();

    return () => {
      isMounted = false;
    };
  }, [user, isStudentOnly, isCoachOnly, userLoading]);

  return {
    loading: userLoading || loading,
    canAccessClubCoaching,
    canAccessCoachPortal,
    canAccessStudentCoaching,
  };
}

