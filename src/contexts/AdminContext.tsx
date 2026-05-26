import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

const LEGACY_ADMIN_SESSION_KEY = "admin_session";

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
}

interface AdminContextType {
  adminUser: AdminUser | null;
  isAdminLoggedIn: boolean;
  loginAdmin: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: () => Promise<void>;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};

interface AdminProviderProps {
  children: React.ReactNode;
}

async function fetchAdminUserByAuthId(
  authUserId: string
): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, user_id, email, created_at")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function resolveAdminFromSession(
  session: Session | null
): Promise<AdminUser | null> {
  const authUserId = session?.user?.id;
  if (!authUserId) {
    return null;
  }
  return fetchAdminUserByAuthId(authUserId);
}

function authErrorMessage(message: string | undefined): string {
  if (!message) {
    return "Credenciales inválidas";
  }
  if (
    message.toLowerCase().includes("invalid login credentials") ||
    message.toLowerCase().includes("invalid credentials")
  ) {
    return "Credenciales inválidas";
  }
  return message;
}

function clearSupabaseAuthStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sb-") && key.includes("auth")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loggingOutRef = useRef(false);

  const syncAdminFromSession = useCallback(async (session: Session | null) => {
    if (loggingOutRef.current) {
      setAdminUser(null);
      return;
    }
    const admin = await resolveAdminFromSession(session);
    setAdminUser(admin);
  }, []);

  useEffect(() => {
    let isMounted = true;

    try {
      localStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
    } catch {
      /* ignore */
    }

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!isMounted) return;
      await syncAdminFromSession(session);
      if (isMounted) {
        setLoading(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      void syncAdminFromSession(session);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncAdminFromSession]);

  const loginAdmin = async (email: string, password: string) => {
    try {
      setLoading(true);

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        return { success: false, error: authErrorMessage(authError.message) };
      }

      const admin = await resolveAdminFromSession(authData.session);
      if (!admin) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: "No tienes permisos de administrador",
        };
      }

      setAdminUser(admin);
      return { success: true };
    } catch {
      return { success: false, error: "Error interno del servidor" };
    } finally {
      setLoading(false);
    }
  };

  const logoutAdmin = async () => {
    loggingOutRef.current = true;
    setAdminUser(null);

    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }

    clearSupabaseAuthStorage();

    try {
      localStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
    } catch {
      /* ignore */
    }

    window.location.replace("/admin-login");
  };

  const value: AdminContextType = {
    adminUser,
    isAdminLoggedIn: !!adminUser,
    loginAdmin,
    logoutAdmin,
    loading,
  };

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
};
