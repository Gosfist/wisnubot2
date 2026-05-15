import type { UserModel } from "../types/models";

const KEYS = {
  legacyToken: "auth_token",
  userId: "user_id",
  userUsername: "user_username",
  userCreatedAt: "user_created_at",
} as const;

export function saveSession(user: UserModel) {
  window.localStorage.removeItem(KEYS.legacyToken);
  window.localStorage.setItem(KEYS.userId, String(user.id));
  window.localStorage.setItem(KEYS.userUsername, user.username);
  window.localStorage.setItem(KEYS.userCreatedAt, user.createdAt);
}

export function clearSession() {
  Object.values(KEYS).forEach((key) => window.localStorage.removeItem(key));
}

export function getStoredUser(): UserModel | null {
  const id = Number(window.localStorage.getItem(KEYS.userId) ?? 0);
  if (!id) return null;

  return {
    id,
    username: window.localStorage.getItem(KEYS.userUsername) ?? "admin",
    createdAt: window.localStorage.getItem(KEYS.userCreatedAt) ?? "",
  };
}
