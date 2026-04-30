import { appConfig } from "./config";
import { clearSession, getToken } from "./storage";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
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

export async function apiFetch<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  // Do not force Content-Type for FormData — let browser handle multipart boundary
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch {
    if (token && window.navigator.onLine !== false) {
      forceClientLogout();
    }
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
    if (response.status === 401 && !isAuthLoginRequest) {
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
