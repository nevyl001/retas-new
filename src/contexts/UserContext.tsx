import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { AUTH_CONFIG, getAuthEmailRedirectUrl } from "../config/auth";

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
  requestPasswordReset: (email: string) => Promise<{ error: any }>;
  updatePassword: (password: string) => Promise<{ error: any }>;
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
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error obteniendo perfil:", error);
        // Si no existe el perfil, crear uno básico
        if (error.code === "PGRST116") {
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
            console.error("Error creando perfil:", createError);
            return;
          }

          setUserProfile(newProfile);
        }
        return;
      }

      setUserProfile(data);
    } catch (error) {
      console.error("Error obteniendo perfil:", error);
    }
  }, []);

  // Restaurar sesión antes de redirigir (getSession + listener)
  useEffect(() => {
    let isMounted = true;

    const applySession = (session: Session | null) => {
      if (!isMounted) return;

      setSession(session);

      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(
          session.user.id,
          session.user.email,
          session.user.user_metadata?.name
        );
      } else {
        setUserProfile(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      applySession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      applySession(session);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const redirectUrl = getAuthEmailRedirectUrl(
        AUTH_CONFIG.EMAIL_CONFIRM_REDIRECT
      );

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
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
      setUser(null);
      setUserProfile(null);
      setSession(null);

      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error al cerrar sesión:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      throw error;
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      const redirectTo = getAuthEmailRedirectUrl(
        AUTH_CONFIG.PASSWORD_RESET_REDIRECT
      );
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      );
      return { error: error ?? null };
    } catch (error) {
      return { error };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error ?? null };
    } catch (error) {
      return { error };
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
    requestPasswordReset,
    updatePassword,
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
