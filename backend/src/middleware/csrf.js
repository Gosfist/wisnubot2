import {
  clearAuthCookies,
  getCsrfTokenFromRequest,
  getSessionTokenFromRequest,
  verifySessionToken,
} from "../services/auth-session.service.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/reset-password",
  "/api/auth/verify-reset-secret",
  "/api/cs-payments/pakasir/webhook",
  "/api/cs-payments/webhook/pakasir",
]);

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const sessionToken = getSessionTokenFromRequest(req);
  if (!sessionToken) {
    return next();
  }

  try {
    const decoded = verifySessionToken(sessionToken);
    const headerToken = String(req.get("x-csrf-token") ?? "");
    const cookieToken = getCsrfTokenFromRequest(req);
    const expectedToken = String(decoded.csrf ?? "");

    if (!headerToken || !cookieToken || !expectedToken) {
      return res.status(403).json({ error: "CSRF token tidak ditemukan" });
    }

    if (headerToken !== cookieToken || headerToken !== expectedToken) {
      return res.status(403).json({ error: "CSRF token tidak valid" });
    }

    return next();
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Token tidak valid atau expired" });
  }
}
