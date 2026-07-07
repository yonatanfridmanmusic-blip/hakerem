import type { ReactNode } from "react";
import { useState, useEffect, useCallback } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
  Menu,
  X,
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
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer when switching from mobile → desktop
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--hk-bg)" }}>

      {/* ── Desktop sidebar ── */}
      {!isMobile && <AppSidebar />}

      {/* ── Mobile: drawer overlay ── */}
      {isMobile && drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeDrawer}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
            }}
          />
          {/* Drawer panel — slides in from the right (RTL) */}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
            width: "260px",
            animation: "hkSlideInRight 0.22s cubic-bezier(0.32,0.72,0,1)",
          }}>
            <AppSidebar onClose={closeDrawer} />
          </div>
        </>
      )}

      {/* ── Content column ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* Mobile top header */}
        {isMobile && (
          <header style={{
            position: "sticky", top: 0, zIndex: 100,
            background: "linear-gradient(180deg, #22503A 0%, #1A3D2B 100%)",
            height: "56px",
            padding: "0 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: "0 2px 16px rgba(0,0,0,0.22)",
            flexShrink: 0,
          }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "32px", height: "32px",
                background: "rgba(255,255,255,0.12)",
                borderRadius: "9px",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
                  <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(122,170,142,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
                  <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/>
                  <circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
                  <circle cx="24" cy="14" r="5.5" fill="#5AA674"/>
                  <circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
                  <circle cx="18" cy="23" r="5.5" fill="#4A8C62"/>
                  <circle cx="16.2" cy="21.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
                </svg>
              </div>
              <span style={{ fontSize: "16px", fontWeight: "600", color: "#fff", letterSpacing: "-0.2px" }}>הכרם</span>
            </div>

            {/* Hamburger button */}
            <button
              type="button"
              aria-label="פתח תפריט"
              onClick={() => setDrawerOpen(true)}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "8px",
                padding: "8px",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Menu size={18} />
            </button>
          </header>
        )}

        {/* Page content */}
        <main style={{
          flex: 1,
          padding: isMobile ? "20px 16px 32px" : "32px 36px",
          overflowY: "auto",
        }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {children}
          </div>
        </main>
      </div>

      {/* Keyframe for drawer slide-in */}
      <style>{`
        @keyframes hkSlideInRight {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface AppSidebarProps {
  /** When provided, renders a close (×) button and calls this on nav-link clicks */
  onClose?: () => void;
}

function AppSidebar({ onClose }: AppSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate  = useNavigate();
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

  // In drawer mode: height fills the drawer wrapper; in desktop: sticky 100vh
  const inDrawer = Boolean(onClose);

  return (
    <aside style={{
      width: inDrawer ? "260px" : "230px",
      flexShrink: 0,
      background: "linear-gradient(180deg, #22503A 0%, #1A3D2B 40%, #0F2219 100%)",
      display: "flex",
      flexDirection: "column",
      height: inDrawer ? "100%" : "100vh",
      position: inDrawer ? undefined : "sticky",
      top: inDrawer ? undefined : 0,
      boxShadow: "2px 0 24px rgba(0,0,0,0.18)",
    }}>

      {/* Logo + close button */}
      <div style={{
        padding: "28px 22px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                <line x1="18" y1="4" x2="18" y2="9" stroke="#7AAA8E" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M18 6.5 Q22 4.5 25 6" fill="none" stroke="rgba(122,170,142,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="12" cy="14" r="5.5" fill="#7AAA8E"/>
                <circle cx="10.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.25)"/>
                <circle cx="24" cy="14" r="5.5" fill="#5AA674"/>
                <circle cx="22.2" cy="12.2" r="1.6" fill="rgba(255,255,255,0.2)"/>
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

          {/* Close button — only in drawer mode */}
          {inDrawer && (
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור תפריט"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "7px",
                padding: "6px",
                cursor: "pointer",
                color: "rgba(255,255,255,0.65)",
                display: "flex", alignItems: "center",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <X size={15} />
            </button>
          )}
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
              onClick={onClose}
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
            onClick={onClose}
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
            onClick={onClose}
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
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
