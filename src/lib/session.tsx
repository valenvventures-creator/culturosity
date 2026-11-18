import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, prefs } from "./api";

export interface Membership {
  id: string;
  role: "owner" | "admin" | "provider_manager" | "member";
  org_id: string;
  org_slug: string;
  org_name: string;
  org_kind: "culturosity" | "client";
  is_demo: boolean;
  program_display_name: string | null;
}
export interface ProgramAccess {
  program_id: string;
  program_name: string;
  org_id: string;
  org_slug: string;
  org_name: string;
  org_kind: string;
  is_demo: boolean;
  role: string;
}
export interface Me {
  user: { id: string; email: string; display_name: string; email_verified_at: string | null; is_demo: boolean } | null;
  mode: "demo" | "production";
  memberships?: Membership[];
  programs?: ProgramAccess[];
  grants?: ("super_admin" | "sales_admin")[];
  providerAssignments?: { provider_id: string; provider_name: string; org_slug: string }[];
  unlock?: { expires_at: string } | null;
}

export function useMe() {
  return useQuery<Me>({ queryKey: ["me"], queryFn: () => api.get("/me"), staleTime: 30_000 });
}

export function useConfig() {
  return useQuery<any>({ queryKey: ["config"], queryFn: () => api.get("/config"), staleTime: 5 * 60_000 });
}

export function isInternal(me?: Me) {
  return Boolean(me?.grants?.length);
}
export function adminOrgs(me?: Me) {
  return (me?.memberships ?? []).filter((m) => m.role === "owner" || m.role === "admin");
}
export function canManage(me: Me | undefined, slug: string) {
  const m = me?.memberships?.find((x) => x.org_slug === slug);
  return Boolean(m && (m.role === "owner" || m.role === "admin" || m.role === "provider_manager")) || Boolean(me?.grants?.includes("super_admin"));
}

/** Clear all private client state on sign-out or account switch. */
export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await api.post("/auth/signout");
    } finally {
      qc.clear();
      prefs.clearAll();
      if ("caches" in window) {
        // Only the static shell is cached, but clear runtime caches defensively.
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("cul-runtime")).map((k) => caches.delete(k)));
      }
      window.location.assign("/");
    }
  };
}
