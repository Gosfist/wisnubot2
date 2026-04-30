import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { UserModel } from "../types/models";
import { ApiError, apiFetch, withJsonBody } from "../lib/http";
import { clearSession, getStoredUser, saveSession } from "../lib/storage";
import { socketService } from "../lib/socket";

interface AuthContextValue {
  user: UserModel | null;
  isAuthenticated: boolean;
  restoringSession: boolean;
  login: (username: string, password: string) => Promise<UserModel>;
  fetchCurrentUser: () => Promise<UserModel>;
  updateProfile: (username: string, secretKey: string) => Promise<void>;
  changePassword: (newPassword: string, secretKey: string) => Promise<void>;
  verifyResetSecret: (secretKey: string) => Promise<void>;
  resetPassword: (secretKey: string, newPassword: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserFromCache: (user: UserModel | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseUser(payload: Record<string, unknown>): UserModel {
  return {
    id: Number(payload.id ?? 0),
    username: String(payload.username ?? "admin"),
    createdAt: String(payload.created_at ?? ""),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserModel | null>(getStoredUser() as UserModel | null);
  const [restoringSession, setRestoringSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    const storedUser = getStoredUser();
    if (!storedUser) {
      setRestoringSession(false);
      return;
    }

    apiFetch("/auth/me")
      .then((data) => {
        if (!mounted) return;
        const freshUser = parseUser((data as { user: Record<string, unknown> }).user);
        setUser(freshUser);
        saveSession(freshUser);
      })
      .catch(() => {
        if (!mounted) return;
        clearSession();
        setUser(null);
      })
      .finally(() => {
        if (!mounted) return;
        setRestoringSession(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function login(username: string, password: string): Promise<UserModel> {
    const data = await apiFetch("/auth/login", withJsonBody({ username, password }));
    const loggedInUser = parseUser((data as { user: Record<string, unknown> }).user);
    const token = String((data as { token: string }).token ?? "");
    saveSession(loggedInUser, token);
    setUser(loggedInUser);
    return loggedInUser;
  }

  async function fetchCurrentUser(): Promise<UserModel> {
    const data = await apiFetch("/auth/me");
    const freshUser = parseUser((data as { user: Record<string, unknown> }).user);
    setUser(freshUser);
    saveSession(freshUser);
    return freshUser;
  }

  async function updateProfile(username: string, secretKey: string): Promise<void> {
    await apiFetch("/auth/profile", withJsonBody({ username, secretKey }, "PUT"));
    const updated = await fetchCurrentUser();
    setUser(updated);
  }

  async function changePassword(newPassword: string, secretKey: string): Promise<void> {
    await apiFetch("/auth/change-password", withJsonBody({ newPassword, secretKey }));
  }

  async function verifyResetSecret(secretKey: string): Promise<void> {
    if (!secretKey.trim()) {
      throw new Error("Secret key wajib diisi");
    }
  }

  async function resetPassword(secretKey: string, newPassword: string, confirmPassword: string): Promise<void> {
    await apiFetch("/auth/reset-password", withJsonBody({ secretKey, newPassword, confirmPassword }));
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Best effort
    } finally {
      clearSession();
      setUser(null);
      socketService.disconnect();
    }
  }

  function setUserFromCache(nextUser: UserModel | null) {
    setUser(nextUser);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      restoringSession,
      login,
      fetchCurrentUser,
      updateProfile,
      changePassword,
      verifyResetSecret,
      resetPassword,
      logout,
      setUserFromCache,
    }),
    [user, restoringSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
