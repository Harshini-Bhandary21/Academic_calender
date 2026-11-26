import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext.jsx";
import { useDocumentTitle } from "../app/useDocumentTitle.js";

export default function LoginPage() {
  useDocumentTitle("Admin Login | MIT Academy of Engineering");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by useCalendarApi.js when an admin action 401s because the token
  // expired/was invalidated -- lets this page explain *why* they landed
  // here instead of just showing a bare login form, and return them to
  // whatever page they were on once they're back in.
  const sessionExpired = location.state?.sessionExpired ?? false;
  const returnTo = location.state?.from || "/";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(password);
      navigate(returnTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand-side">
          <div className="login-brand-mark">MIT</div>
          <div className="login-brand-institute">Academy of Engineering</div>
          <div className="login-brand-divider" />
          <div className="login-brand-tagline">Academic Calendar</div>
          <p className="login-brand-copy">
            Manage academic years, terms, and term calendars for the institute from one place.
          </p>
        </div>

        <form className="login-form-side" onSubmit={handleSubmit}>
          <div className="login-form-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h1 className="login-form-title">Admin Login</h1>
          <p className="login-form-subtitle">Sign in to generate and manage calendars.</p>

          {sessionExpired && (
            <div className="login-session-expired">Your session has expired. Please log in again to continue.</div>
          )}

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
                required
              />
              <button
                type="button"
                className="login-toggle-visibility"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.4 4.3M6.6 6.6C4 8.4 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 3.4-.6" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
