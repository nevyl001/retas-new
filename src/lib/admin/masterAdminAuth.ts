import { supabase } from "../supabaseClient";
import { PATH_SYNC_EVENT } from "../appRouting";

export interface MasterAdminUser {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
}

export async function fetchMasterAdminByAuthId(
  authUserId: string
): Promise<MasterAdminUser | null> {
  const id = authUserId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, user_id, email, created_at")
    .eq("user_id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export function navigateToAdminDashboard(): void {
  if (typeof window === "undefined") return;
  const next = "/admin-dashboard";
  if (window.location.pathname === next) return;

  window.history.replaceState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event(PATH_SYNC_EVENT));
}
