import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext.jsx";

const STORAGE_KEY = "calendar_admin_token";

function fakeToken(expSecondsFromNow) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }));
  return `${header}.${payload}.fake-signature`;
}

function Probe() {
  const { isAdmin } = useAuth();
  return <div>{isAdmin ? "ADMIN" : "GUEST"}</div>;
}

describe("AuthContext token expiry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats a valid, unexpired stored token as logged in", () => {
    localStorage.setItem(STORAGE_KEY, fakeToken(3600));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("treats an already-expired stored token as logged out, and clears it", () => {
    localStorage.setItem(STORAGE_KEY, fakeToken(-3600));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("GUEST")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("treats a malformed token as logged out", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-real-jwt");
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("GUEST")).toBeInTheDocument();
  });

  it("flips from ADMIN to GUEST on its own once the token's exp passes, with no action required", () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, fakeToken(60));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("ADMIN")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(screen.getByText("GUEST")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
