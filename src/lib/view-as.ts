// ─── Super-admin "View As" override ──────────────────────────────────────────
// When a super_admin clicks "צפה כ..." in the admin panel, we store the target
// org in localStorage. All hooks check this key and serve data for that org
// instead of the admin's own org.
//
// Security: localStorage can only be set from the admin panel (super_admin only).
// Even if a non-admin somehow set it, RLS would block cross-org data access.

const VIEW_AS_KEY = "hakerem_view_as";

export interface ViewAsOrg {
  orgId: string;
  orgName: string;
  orgCity: string | null;
}

export function getViewAsOrg(): ViewAsOrg | null {
  try {
    const raw = localStorage.getItem(VIEW_AS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ViewAsOrg;
  } catch {
    return null;
  }
}

export function setViewAsOrg(orgId: string, orgName: string, orgCity: string | null) {
  localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ orgId, orgName, orgCity }));
}

export function clearViewAsOrg() {
  localStorage.removeItem(VIEW_AS_KEY);
}
