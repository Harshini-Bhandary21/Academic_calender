import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

const API_BASE = import.meta.env.VITE_API_URL;
const NETWORK_ERROR_MESSAGE = "Could not reach the server. Please check your connection and try again.";

// FastAPI's HTTPException responses are JSON ({"detail": "..."}), not
// plain text -- reading the body as plain text (the previous behavior)
// showed that raw JSON string in error banners instead of the actual
// message. Falls back to the raw text for any response that isn't JSON
// shaped like that (an unexpected proxy/gateway error page, for instance).
// Exported (in addition to being used internally below) so this parsing
// logic is unit-testable without needing to render a component -- see
// useCalendarApi.test.js.
export async function parseErrorMessage(res) {
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    if (body && typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON -- fall through to the raw text below.
  }
  return text || `Request failed (${res.status})`;
}

// A `fetch()` call itself throws (not a rejected/non-ok response) when the
// server can't be reached at all -- DNS failure, connection refused, the
// backend is simply down. Normalized to one friendly message instead of
// the raw browser-specific wording ("Failed to fetch", "NetworkError when
// attempting to fetch resource", ...).
async function safeFetch(...args) {
  try {
    return await fetch(...args);
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
}

// Thin fetch wrappers shared by calendar.jsx's handlers -- attaches the
// admin bearer token when one exists, and normalizes error/404 handling in
// one place. GET routes now serve different content by role (an admin's
// own in-progress draft vs. everyone else's last-published snapshot -- see
// the publish feature), so getJSON has to send the token too when one
// exists, not just the mutating postJSON/deleteJSON -- a logged-in admin
// browsing without it would only ever see the public/published view of
// their own calendars.
export function useCalendarApi() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Every admin-only mutation (require_admin on the backend) 401s the same
  // way whether the token is missing, expired, or just invalid -- rather
  // than surface that as a raw "Invalid or expired admin token" error
  // banner and leave the admin stuck re-clicking a button that'll keep
  // failing, clear the stale token and send them to log back in, then
  // back to whatever page they were on so they can pick up where they
  // left off.
  function handleExpiredSession() {
    logout();
    navigate("/login", { state: { sessionExpired: true, from: location.pathname } });
  }

  async function getJSON(path) {
    const res = await safeFetch(`${API_BASE}${path}`, {
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (!res.ok) {
      const err = new Error(await parseErrorMessage(res));
      err.notFound = res.status === 404;
      throw err;
    }
    return res.json();
  }

  async function postJSON(path, body) {
    const res = await safeFetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 401 && token) handleExpiredSession();
      throw new Error(await parseErrorMessage(res));
    }
    return res.json();
  }

  async function patchJSON(path, body) {
    const res = await safeFetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 401 && token) handleExpiredSession();
      throw new Error(await parseErrorMessage(res));
    }
    return res.json();
  }

  async function deleteJSON(path) {
    const res = await safeFetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (!res.ok) {
      if (res.status === 401 && token) handleExpiredSession();
      throw new Error(await parseErrorMessage(res));
    }
    return res.json();
  }

  return { getJSON, postJSON, patchJSON, deleteJSON };
}
