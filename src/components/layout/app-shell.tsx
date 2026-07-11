import type { ReactNode } from "react";
import { useState } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization, useOrgMembers } from "@/hooks/use-organization";
import { useQueryClient } from "@tanstack/react-query";

const NAV_ITEMS = [
  { label: "לוח בקרה",   shortLabel: "בקרה",   href: "/dashboard", icon: LayoutDashboard },
  { label: "מצב תקציבי", shortLabel: "תקציב",  href: "/budget",    icon: BarChart3 },
  { label: "הורים",      shortLabel: "הורים",  href: "/horim",     icon: Users },
  { label: "הכנסות",     shortLabel: "הכנסות", href: "/income",    icon: TrendingUp },
  { label: "הוצאות",     shortLabel: "הוצאות", href: "/expenses",  icon: TrendingDown },
  { label: "דוחות",      shortLabel: "דוחות",  href: "/reports",   icon: FileText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--hk-bg)" }}>

      {/* ── Desktop sidebar ── */}
      {!isMobile && <AppSidebar />}

      {/* ── Content column ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* Mobile top header */}
        {isMobile && <MobileHeader />}

        {/* Page content */}
        <main style={{
          flex: 1,
          padding: isMobile ? "16px 14px 0" : "32px 36px",
          paddingBottom: isMobile ? "calc(70px + env(safe-area-inset-bottom, 0px))" : "32px",
          overflowY: "auto",
          overflowX: "hidden",
        }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      {isMobile && <BottomTabBar />}
    </div>
  );
}

// ─── Mobile Header ────────────────────────────────────────────────────────────

function MobileHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { fullName, isSuperAdmin } = useAuth();
  const { data: membership } = useOrganization();
  const orgRole = membership?.role;
  const canManageSettings = orgRole === "owner" || orgRole === "admin";
  const { data: members } = useOrgMembers();
  const pendingCount = canManageSettings
    ? (members ?? []).filter((m) => m.status === "pending").length
    : 0;
  const initial = (fullName ?? "?").trim().charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "linear-gradient(180deg, #22503A 0%, #1A3D2B 100%)",
      height: "54px",
      padding: "0 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      boxShadow: "0 2px 16px rgba(0,0,0,0.22)",
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{
          width: "30px", height: "30px",
          background: "rgba(255,255,255,0.12)",
          borderRadius: "9px",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="17" height="17" viewBox="0 0 36 36" fill="none">
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

      {/* Right side: user avatar + menu */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="תפריט משתמש"
          style={{
            width: "32px", height: "32px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            border: "1.5px solid rgba(255,255,255,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "13px", fontWeight: "600", color: "#fff",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {initial}
        </button>

        {menuOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 200 }}
              onClick={() => setMenuOpen(false)}
            />
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              zIndex: 201,
              background: "#fff",
              border: "1px solid #EAE5DE",
              borderRadius: "14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
              minWidth: "180px",
              overflow: "hidden",
            }}>
              <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #F0EBE5" }}>
                <div style={{ fontSize: "13px", fontWeight: "500", color: "#1A1A1A" }}>{fullName ?? "משתמש"}</div>
              </div>
              {isSuperAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "11px 14px",
                    fontSize: "13px", color: "#1A1A1A",
                    textDecoration: "none", borderBottom: "1px solid #F0EBE5",
                  }}
                >
                  <ShieldCheck size={14} color="#6B6560" />
                  בתי ספר
                </Link>
              )}
              {canManageSettings && (
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "11px 14px",
                    fontSize: "13px", color: "#1A1A1A",
                    textDecoration: "none", borderBottom: "1px solid #F0EBE5",
                  }}
                >
                  <Settings size={14} color="#6B6560" />
                  הגדרות
                  {pendingCount > 0 && (
                    <span style={{
                      marginRight: "auto",
                      minWidth: "18px", height: "18px",
                      borderRadius: "9px",
                      background: "#E8622A",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: "700",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: "0 5px",
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  padding: "11px 14px",
                  background: "none", border: "none",
                  fontSize: "13px", color: "#DC2626",
                  cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "right",
                }}
              >
                <LogOut size={14} color="#DC2626" />
                התנתקות
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Bottom Tab Bar ───────────────────────────────────────────────────────────

function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      zIndex: 150,
      background: "#fff",
      borderTop: "1px solid #EAE5DE",
      display: "flex",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      boxShadow: "0 -4px 24px rgba(0,0,0,0.09)",
    }}>
      {NAV_ITEMS.map(({ shortLabel, href, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            to={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "9px 2px 8px",
              gap: "3px",
              textDecoration: "none",
              color: active ? "#2D6644" : "#AAA099",
              WebkitTapHighlightColor: "transparent",
              position: "relative",
              minHeight: "52px",
            }}
          >
            {active && (
              <div style={{
                position: "absolute",
                top: 0, left: "15%", right: "15%",
                height: "2px",
                background: "linear-gradient(90deg, #5AA674, #2D6644)",
                borderRadius: "0 0 4px 4px",
              }} />
            )}
            <Icon
              size={active ? 21 : 20}
              strokeWidth={active ? 2.2 : 1.7}
              style={{ transition: "all 0.15s ease" }}
            />
            <span style={{
              fontSize: "9.5px",
              fontWeight: active ? "600" : "400",
              letterSpacing: "-0.1px",
              lineHeight: 1,
            }}>
              {shortLabel}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface AppSidebarProps {
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
  const { data: members } = useOrgMembers();
  const pendingCount = canManageSettings
    ? (members ?? []).filter((m) => m.status === "pending").length
    : 0;
  const initial = (fullName ?? "?").trim().charAt(0).toUpperCase();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

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
            {pendingCount > 0 && (
              <span style={{
                marginRight: "auto",
                minWidth: "18px", height: "18px",
                borderRadius: "9px",
                background: "#E8622A",
                color: "#fff",
                fontSize: "11px",
                fontWeight: "700",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px",
              }}>
                {pendingCount}
              </span>
            )}
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

