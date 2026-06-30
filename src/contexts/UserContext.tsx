import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import {
  clearTenantBranding,
  getAppliedBranding,
  resolveAndApplyBranding,
} from "../branding/BrandingService";
import { brandingDevLog } from "../branding/brandingDevLog";
import {
  beginBrandingTransition,
  endBrandingTransition,
  getIsBrandingReady,
  type BrandingTransitionReason,
} from "../branding/brandingTransition";
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

function resolveSessionTransitionReason(
  event: AuthChangeEvent | "init",
  previousUserId: string | null,
  nextUserId: string | null
): BrandingTransitionReason {
  if (!nextUserId) {
    return event === "init" ? "bootstrap" : "session-logout";
  }
  if (!previousUserId) {
    return event === "SIGNED_IN" ? "session-login" : "session-restore";
  }
  if (previousUserId !== nextUserId) return "user-change";
  return "session-restore";
}

function normalizeUserId(userId: string | null | undefined): string | null {
  const normalized = userId?.trim().toLowerCase();
  return normalized || null;
}

function brandingAlreadyAppliedForUser(userId: string): boolean {
  const applied = getAppliedBranding();
  return (
    normalizeUserId(applied?.organizadorId) === userId &&
    getIsBrandingReady()
  );
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const applySessionGenerationRef = useRef(0);

  const fetchUserProfile = useCallback(async (userId: string, userEmail?: string, userName?: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error obteniendo perfil:", error);
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

  useEffect(() => {
    let isMounted = true;

    const applySession = async (
      nextSession: Session | null,
      event: AuthChangeEvent | "init"
    ) => {
      const generation = ++applySessionGenerationRef.current;
      const nextUserId = normalizeUserId(nextSession?.user?.id);
      const previousUserId = userIdRef.current;
      const reason = resolveSessionTransitionReason(
        event,
        previousUserId,
        nextUserId
      );

      if (event === "init" && !nextUserId && getIsBrandingReady()) {
        setSession(null);
        setUser(null);
        setUserProfile(null);
        userIdRef.current = null;
        setLoading(false);
        brandingDevLog("UserContext.applySession:skip-init-anonymous", {});
        return;
      }

      if (
        event === "init" &&
        nextUserId &&
        nextSession?.user &&
        brandingAlreadyAppliedForUser(nextUserId)
      ) {
        setSession(nextSession);
        setUser(nextSession.user);
        userIdRef.current = nextUserId;
        setLoading(false);
        fetchUserProfile(
          nextSession.user.id,
          nextSession.user.email,
          nextSession.user.user_metadata?.name
        );
        brandingDevLog("UserContext.applySession:skip-init-restored", {
          orgId: nextUserId,
        });
        return;
      }

      setLoading(true);
      beginBrandingTransition(reason);

      brandingDevLog("UserContext.applySession:start", {
        event,
        reason,
        orgId: nextUserId,
        previousOrgId: previousUserId,
      });

      try {
        if (nextUserId && nextSession?.user) {
          const branding = await resolveAndApplyBranding(nextUserId);
          if (!isMounted || generation !== applySessionGenerationRef.current) {
            return;
          }

          brandingDevLog("UserContext.applySession:branding-ready", {
            orgId: nextUserId,
            brandingKey: branding.brandingKey,
          });

          setSession(nextSession);
          setUser(nextSession.user);
          userIdRef.current = nextUserId;
          fetchUserProfile(
            nextSession.user.id,
            nextSession.user.email,
            nextSession.user.user_metadata?.name
          );
        } else {
          clearTenantBranding();
          if (!isMounted || generation !== applySessionGenerationRef.current) {
            return;
          }

          setSession(null);
          setUser(null);
          setUserProfile(null);
          userIdRef.current = null;
        }
      } finally {
        if (isMounted && generation === applySessionGenerationRef.current) {
          endBrandingTransition(reason);
          setLoading(false);
          brandingDevLog("UserContext.applySession:done", {
            orgId: nextUserId,
            event,
          });
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return;
      void applySession(initialSession, "init");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      void applySession(nextSession, event);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

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
      setLoading(true);
      beginBrandingTransition("session-login");

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        endBrandingTransition("session-login");
        setLoading(false);
        return { error };
      }

      return { error: null };
    } catch (error) {
      endBrandingTransition("session-login");
      setLoading(false);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      beginBrandingTransition("session-logout");

      const { error } = await supabase.auth.signOut();
      if (error) {
        endBrandingTransition("session-logout");
        setLoading(false);
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
