import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { AUTH_CONFIG } from "../config/auth";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

interface UserContextType {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: any }>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: React.ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (userId: string, userEmail?: string, userName?: string) => {
    try {
      console.log("🔍 Obteniendo perfil para usuario:", userId);
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("❌ Error obteniendo perfil:", error);
        // Si no existe el perfil, crear uno básico
        if (error.code === "PGRST116") {
          console.log("👤 Perfil no existe, creando uno básico...");
          const { data: newProfile, error: createError } = await supabase
            .from("users")
            .insert({
              id: userId,
              email: userEmail || userId,
              name: userName || "Usuario",
            })
            .select()
            .single();

          if (createError) {
            console.error("❌ Error creando perfil:", createError);
            return;
          }

          console.log("✅ Perfil creado:", newProfile);
          setUserProfile(newProfile);
        }
        return;
      }

      console.log("✅ Perfil obtenido:", data);
      setUserProfile(data);
    } catch (error) {
      console.error("❌ Error obteniendo perfil:", error);
    }
  }, []);

  // Escuchar cambios de autenticación
  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      console.log("🔄 Cambio de autenticación:", event, session?.user?.id);
      setSession(session);

      // Verificar si es admin antes de establecer como usuario normal
      if (session?.user?.email === "admin@test.com") {
        console.log(
          "🔐 Usuario admin detectado, NO procesando como usuario normal"
        );
        setUser(null);
        setUserProfile(null);
      } else {
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log("👤 Usuario normal encontrado, obteniendo perfil...");
          console.log("👤 Usuario data:", session.user);
          fetchUserProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata?.name
          );
        } else {
          setUserProfile(null);
        }
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo ejecutar una vez al montar

  const signUp = async (email: string, password: string, name: string) => {
    try {
      // Forzamos la URL de redirección a la de producción para los emails
      const redirectUrl = `${AUTH_CONFIG.BASE_URL_PRODUCTION}${AUTH_CONFIG.EMAIL_CONFIRM_REDIRECT}`;

      console.log("🚀 Iniciando registro de usuario:");
      console.log("Email:", email);
      console.log("Name:", name);
      console.log("Redirect URL:", redirectUrl);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      console.log("📧 Respuesta de signUp:");
      console.log("Data:", data);
      console.log("Error:", error);

      if (error) {
        console.error("❌ Error en signUp:", error);
        return { error };
      }

      console.log("✅ Usuario registrado exitosamente");
      return { error: null };
    } catch (error) {
      console.error("❌ Error catch en signUp:", error);
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Verificar si es admin - no permitir login como usuario normal
      if (email === "admin@test.com") {
        console.log(
          "🔐 Intento de login de admin como usuario normal - DENEGADO"
        );
        return {
          error: { message: "Admin debe usar el panel de administración" },
        };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      console.log("🚪 Cerrando sesión...");

      // Limpiar estado local primero
      setUser(null);
      setUserProfile(null);
      setSession(null);

      // Luego cerrar sesión en Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("❌ Error al cerrar sesión:", error);
        throw error;
      }

      console.log("✅ Sesión cerrada exitosamente");
    } catch (error) {
      console.error("❌ Error al cerrar sesión:", error);
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) {
      return { error: new Error("No user logged in") };
    }

    try {
      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        return { error };
      }

      setUserProfile(data);
      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const value = {
    user,
    userProfile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
