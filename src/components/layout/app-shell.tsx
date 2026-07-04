import type { ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  FileText,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useQueryClient } from "@tanstack/react-query";

const NAV_ITEMS = [
  { label: "לוח בקרה",   href: "/dashboard", icon: LayoutDashboard },
  { label: "מצב תקציבי", href: "/budget",    icon: BarChart3 },
  { label: "הורים",      href: "/horim",     icon: Users },
  { label: "הכנסות",     href: "/income",    icon: TrendingUp },
  { label: "הוצאות",     href: "/expenses",  icon: TrendingDown },
  { label: "דוחות",      href: "/reports",   icon: FileText },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--hk-bg)" }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0, padding: "32px 36px", overflowY: "auto" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { fullName, isSuperAdmin } = useAuth();
  const { data: membership } = useOrganization();
  const orgRole = membership?.role;
  const canManageSettings = orgRole === "owner" || orgRole === "admin";
  const initial = (fullName ?? "?").trim().charAt(0).toUpperCase();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <aside style={{
      width: "230px",
      flexShrink: 0,
      background: "linear-gradient(180deg, #22503A 0%, #1A3D2B 40%, #0F2219 100%)",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      position: "sticky",
      top: 0,
      boxShadow: "2px 0 24px rgba(0,0,0,0.18)",
    }}>

      {/* Logo */}
      <div style={{
        padding: "28px 22px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "38px", height: "38px",
            background: "linear-gradient(145deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 100%)",
            borderRadius: "11px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 1px 0 rgba(255,255,255,0.14) inset, 0 3px 10px rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              {/* stem + tendril */}
              <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(122,170,142,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
              {/* top-left */}
              <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/>
              <circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
              {/* top-right */}
              <circle cx="24" cy="14" r="5.5" fill="#5AA674"/>
              <circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
              {/* bottom */}
              <circle cx="18" cy="23" r="5.5" fill="#4A8C62"/>
              <circle cx="16.2" cy="21.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "17px", fontWeight: "600", color: "#fff", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
              הכרם
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", lineHeight: 1.3, marginTop: "1px" }}>
              ניהול פיננסי
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
        <div style={{ fontSize: "10px", fontWeight: "600", color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 10px", marginBottom: "8px" }}>
          ניווט
        </div>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              to={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 10px",
                borderRadius: "8px",
                fontSize: "13.5px",
                fontWeight: active ? "500" : "400",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
                background: active
                  ? "linear-gradient(90deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.07) 100%)"
                  : "transparent",
                boxShadow: active ? "0 1px 0 rgba(255,255,255,0.06) inset" : "none",
                border: active ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                textDecoration: "none",
                transition: "all 0.12s",
              }}
            >
              <Icon
                size={15}
                style={{
                  color: active ? "#7AAA8E" : "rgba(255,255,255,0.35)",
                  flexShrink: 0,
                }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.07)",
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}>
        {isSuperAdmin && (
          <Link
            to="/admin"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 10px",
              borderRadius: "8px",
              fontSize: "13px",
              color: isActive("/admin") ? "#fff" : "rgba(255,255,255,0.45)",
              background: isActive("/admin") ? "rgba(255,255,255,0.1)" : "transparent",
              textDecoration: "none",
              marginBottom: "2px",
            }}
          >
            <ShieldCheck size={14} style={{ color: isActive("/admin") ? "#7AAA8E" : "rgba(255,255,255,0.3)" }} />
            בתי ספר
          </Link>
        )}
        {canManageSettings && (
          <Link
            to="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 10px",
              borderRadius: "8px",
              fontSize: "13px",
              color: isActive("/settings") ? "#fff" : "rgba(255,255,255,0.45)",
              background: isActive("/settings") ? "rgba(255,255,255,0.1)" : "transparent",
              textDecoration: "none",
            }}
          >
            <Settings size={14} style={{ color: isActive("/settings") ? "#7AAA8E" : "rgba(255,255,255,0.3)" }} />
            הגדרות
          </Link>
        )}

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 10px",
          borderRadius: "8px",
          marginTop: "2px",
        }}>
          <div style={{
            width: "28px", height: "28px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "12px", fontWeight: "600", color: "#fff",
            flexShrink: 0,
          }}>
            {initial}
          </div>
          <span style={{
            flex: 1,
            fontSize: "12.5px",
            color: "rgba(255,255,255,0.55)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {fullName ?? "משתמש"}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="התנתקות"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "4px", borderRadius: "6px",
              display: "flex", alignItems: "center",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
