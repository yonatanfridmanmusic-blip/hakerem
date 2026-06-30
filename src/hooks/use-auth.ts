import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "secretary";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (u: User | null) => {
      if (!u) {
        if (mounted) {
          setUser(null);
          setRole(null);
          setFullName(null);
          setLoading(false);
        }
        return;
      }
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.id),
        supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle(),
      ]);
      if (!mounted) return;
      setUser(u);
      const isAdmin = roles?.some((r) => r.role === "admin");
      setRole(isAdmin ? "admin" : roles && roles.length > 0 ? "secretary" : null);
      setFullName(profile?.full_name ?? u.email ?? null);
      setLoading(false);
    };

    supabase.auth.getUser().then(({ data }) => load(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        load(session?.user ?? null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, role, fullName, loading, isAdmin: role === "admin" };
}
