import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  last_login?: string;
  is_active: boolean;
}

interface AdminContextType {
  adminUser: AdminUser | null;
  isAdminLoggedIn: boolean;
  loginAdmin: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: () => void;
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

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  console.log("🔍 AdminProvider inicializado");

  // Verificar si hay sesión de admin guardada
  useEffect(() => {
    const checkAdminSession = () => {
      console.log("🔍 Verificando sesión de admin...");
      const adminSession = localStorage.getItem("admin_session");
      console.log("📊 Admin session en localStorage:", adminSession);

      if (adminSession) {
        try {
          const sessionData = JSON.parse(adminSession);
          console.log("✅ Sesión de admin encontrada:", sessionData);
          setAdminUser(sessionData);
        } catch (error) {
          console.error("❌ Error parsing admin session:", error);
          localStorage.removeItem("admin_session");
        }
      } else {
        console.log("⚠️ No hay sesión de admin guardada");
      }
      setLoading(false);
    };

    checkAdminSession();
  }, []);

  const loginAdmin = async (email: string, password: string) => {
    try {
      setLoading(true);
      console.log("🔐 Intentando login de admin:", email);

      // Verificar credenciales en la tabla admin_users
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("email", email)
        .eq("is_active", true)
        .single();

      console.log("📊 Resultado de la consulta:", { data, error });

      if (error || !data) {
        console.error("❌ Error en login:", error);
        return { success: false, error: "Credenciales inválidas" };
      }

      // Verificar contraseña (en producción usar bcrypt)
      // Por ahora, verificar directamente
      if (password !== "123456") {
        return { success: false, error: "Contraseña incorrecta" };
      }

      // Actualizar último login
      await supabase
        .from("admin_users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", data.id);

      // Guardar sesión de admin
      const adminSession = {
        id: data.id,
        email: data.email,
        name: data.name,
        created_at: data.created_at,
        last_login: new Date().toISOString(),
        is_active: data.is_active,
      };

      localStorage.setItem("admin_session", JSON.stringify(adminSession));
      console.log("💾 Admin session guardada en localStorage");

      setAdminUser(adminSession);
      console.log("🔄 setAdminUser llamado con:", adminSession);

      console.log("✅ Admin logueado exitosamente:", adminSession);
      console.log("🔄 isAdminLoggedIn debería ser true ahora");

      return { success: true };
    } catch (error) {
      console.error("Error en login de admin:", error);
      return { success: false, error: "Error interno del servidor" };
    } finally {
      setLoading(false);
    }
  };

  const logoutAdmin = () => {
    console.log("🚪 Cerrando sesión de admin...");
    localStorage.removeItem("admin_session");
    setAdminUser(null);
    console.log("✅ Sesión de admin cerrada");

    // Redirigir al admin login sin refresh
    window.history.pushState({}, "", "/admin-login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const value: AdminContextType = {
    adminUser,
    isAdminLoggedIn: !!adminUser,
    loginAdmin,
    logoutAdmin,
    loading,
  };

  // Log del valor del contexto
  console.log("🔍 AdminContext value:", {
    adminUser,
    isAdminLoggedIn: !!adminUser,
    loading,
  });

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
};
