import React, { createContext, useContext, useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { getRedirectUrl } from "../config/auth";

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

  useEffect(() => {
    let isMounted = true;

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      console.log("🔄 Cambio de autenticación:", event, session?.user?.id);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        console.log("👤 Usuario encontrado, obteniendo perfil...");
        // Llamar fetchUserProfile directamente sin await para evitar bucles
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []); // Sin dependencias para evitar bucles

  const fetchUserProfile = async (userId: string) => {
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
              email: userId, // Usar el ID como email temporal
              name: "Usuario",
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
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const redirectUrl = getRedirectUrl();

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
          // Temporalmente comentado para probar si el problema es la URL
          // emailRedirectTo: redirectUrl,
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
      const { data, error } = await supabase.auth.signInWithPassword({
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
