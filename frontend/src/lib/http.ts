import { appConfig } from "./config";
import { clearSession } from "./storage";

const CSRF_COOKIE_NAME = "wisnubot2_csrf";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function getCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) ?? "";
}

function extractError(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    const details = record.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0];
      if (typeof first === "object" && first !== null && "message" in first) {
        return String((first as Record<string, unknown>).message);
      }
    }
    if (record.error) {
      return String(record.error);
    }
  }
  return fallback;
}

function forceClientLogout() {
  clearSession();
  window.dispatchEvent(new Event("auth:session-cleared"));
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

function shouldAttachCsrf(init?: RequestInit) {
  const method = String(init?.method ?? "GET").toUpperCase();
  return UNSAFE_METHODS.has(method);
}

export async function apiFetch<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  // Do not force Content-Type for FormData; let the browser handle multipart boundary.
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (shouldAttachCsrf(init)) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers.set("X-CSRF-Token", decodeURIComponent(csrfToken));
    }
  }

  let response: Response;
  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Tidak bisa terhubung ke server. Pastikan backend aktif.", 0);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const isAuthLoginRequest = path === "/auth/login";
    const isPublicResetRequest = path === "/auth/reset-password" || path === "/auth/verify-reset-secret";
    const isSessionRestoreRequest = path === "/auth/me";
    if (response.status === 401 && !isAuthLoginRequest && !isPublicResetRequest && !isSessionRestoreRequest) {
      forceClientLogout();
    }
    throw new ApiError(
      extractError(data, response.status >= 500 ? "Terjadi kesalahan server." : "Terjadi kesalahan."),
      response.status,
    );
  }

  return data as T;
}

export function withJsonBody(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    body: JSON.stringify(body),
  };
}
