import { createContext, useContext, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL;
const STORAGE_KEY = "calendar_admin_token";

const AuthContext = createContext(null);

// Reads the JWT's own payload (role/org_id/level/exp) without verifying the
// signature -- this is purely a client-side UX signal (when to stop
// showing admin/org controls), not a security check. The server still
// re-validates the token's signature and expiry on every actual write, so
// a forged/tampered payload here can't grant any real access, only mislead
// the UI about what controls to show.
function decodePayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function expiryMs(token) {
  const json = decodePayload(token);
  return json && typeof json.exp === "number" ? json.exp * 1000 : null;
}

function isExpired(token) {
  const expiresAt = expiryMs(token);
  return expiresAt === null || expiresAt <= Date.now();
}

// Two privileged roles now: the single shared-password institute admin
// (unchanged), and any number of org-unit accounts (department/cohort/
// division sub-admins, see agent/org_units.py on the backend) -- still no
// user table for either, just a token in localStorage saying who this
// browser is logged in as.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isExpired(stored)) {
      // Stale from a previous session (e.g. the tab was closed and reopened
      // more than 24h later) -- treat it as already logged out instead of
      // waiting for the first admin action to fail and bounce to /login.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  });

  // While the app stays open across the token's actual expiry moment, flip
  // back to logged-out right then -- the "Log Out (Admin)" button becomes
  // "Admin Login" and every isAdmin-gated action disappears on its own,
  // rather than only failing the next time an admin tries to use one.
  useEffect(() => {
    if (!token) return;
    const expiresAt = expiryMs(token);
    if (expiresAt === null) {
      logout();
      return;
    }
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(logout, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function login(password) {
    let res;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      // fetch() itself throws when the server can't be reached at all --
      // distinct from a real 401, which is the only case "Incorrect
      // password" is actually true.
      throw new Error("Could not reach the server. Please check your connection and try again.");
    }
    if (!res.ok) {
      if (res.status === 401) throw new Error("Incorrect password");
      const body = await res.text();
      throw new Error(`Login failed (${res.status}): ${body || "please try again"}`);
    }
    const { token: newToken } = await res.json();
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }

  const payload = token ? decodePayload(token) : null;
  const role = payload?.role ?? null; // "admin" | "org" | null (logged out)
  const isAdmin = role === "admin";
  const isOrgUnit = role === "org";
  // "department" | "cohort" | "division" | null -- which kind of org unit
  // this token belongs to, only meaningful when isOrgUnit is true.
  const orgLevel = isOrgUnit ? payload.level : null;
  const orgId = isOrgUnit ? payload.org_id : null;
  // The org unit's own name (e.g. "Computer Engineering"), carried in the
  // token since login -- lets the UI confirm *whose* account is signed in
  // instead of just "you are a department", which is otherwise identical
  // for every department/cohort/division sharing this same screen.
  const orgName = isOrgUnit ? payload.name : null;

  return (
    <AuthContext.Provider value={{ token, isAdmin, isOrgUnit, orgLevel, orgId, orgName, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
