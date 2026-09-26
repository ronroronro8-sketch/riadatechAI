import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import authReducer, { restoreSession, loginUser, logoutUser } from "../src/store/authSlice";
import httpClient from "../src/api/httpClient";

const user = { _id: "server-user", name: "Verified User", email: "verified@example.test" };
const store = () => configureStore({ reducer: { auth: authReducer } });
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("server-confirmed authentication", () => {
  it("ignores a forged local profile and restores the correct user after refresh", async () => {
    window.localStorage.setItem("riadatach-auth-user", JSON.stringify({ _id: "forged" }));
    vi.spyOn(httpClient, "get").mockResolvedValue({ data: { user } });
    const first = store();
    expect(first.getState().auth.isAuthenticated).toBe(false);
    await first.dispatch(restoreSession());
    expect(first.getState().auth.user).toEqual(user);
    expect(window.localStorage.getItem("riadatach-auth-user")).toBeNull();
    const refreshed = store();
    expect(refreshed.getState().auth.user).toBeNull();
    await refreshed.dispatch(restoreSession());
    expect(httpClient.get).toHaveBeenCalledWith("/api/auth/me");
    expect(refreshed.getState().auth).toMatchObject({ user, isAuthenticated: true, authChecked: true });
  });

  it("401 after refresh leaves the user signed out", async () => {
    vi.spyOn(httpClient, "get").mockRejectedValue({ response: { status: 401 } });
    const s = store();
    await s.dispatch(restoreSession());
    expect(s.getState().auth).toMatchObject({ user: null, isAuthenticated: false, authChecked: true });
  });

  it("a failed session lookup never trusts localStorage", async () => {
    window.localStorage.setItem("riadatach-auth-user", JSON.stringify(user));
    vi.spyOn(httpClient, "get").mockRejectedValue(new Error("offline"));
    const s = store();
    await s.dispatch(restoreSession());
    expect(s.getState().auth.isAuthenticated).toBe(false);
    expect(s.getState().auth.error).toBeTruthy();
  });

  it("logout clears identity only after the server confirms invalidation", async () => {
    vi.spyOn(httpClient, "post").mockResolvedValueOnce({ data: { user } }).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: {} });
    const s = store();
    await s.dispatch(loginUser({ email: user.email, password: "test-only" }));
    await s.dispatch(logoutUser());
    expect(s.getState().auth.isAuthenticated).toBe(true);
    expect(s.getState().auth.error).toBeTruthy();
    await s.dispatch(logoutUser());
    expect(s.getState().auth).toMatchObject({ user: null, isAuthenticated: false });
  });

  it("a late restore response cannot undo logout", async () => {
    let finishRestore;
    vi.spyOn(httpClient, "get").mockImplementation(() => new Promise(resolve => { finishRestore = resolve; }));
    vi.spyOn(httpClient, "post").mockResolvedValue({ data: {} });
    const s = store();
    const pending = s.dispatch(restoreSession());
    await s.dispatch(logoutUser());
    finishRestore({ data: { user } });
    await pending;
    expect(s.getState().auth.isAuthenticated).toBe(false);
  });

  it("sends session credentials and the required auth request header", async () => {
    let sent;
    await httpClient.post("/api/auth/login", {}, { adapter: async config => {
      sent = config;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    } });
    expect(sent.withCredentials).toBe(true);
    expect(sent.headers.get("X-RiadaTech-Request")).toBe("1");
  });
});
