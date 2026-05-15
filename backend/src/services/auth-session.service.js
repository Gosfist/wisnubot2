import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export const SESSION_COOKIE_NAME = "wisnubot2_session";
export const CSRF_COOKIE_NAME = "wisnubot2_csrf";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function baseCookieOptions() {
  return {
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    path: "/",
  };
}

export function createCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function createSessionToken(user, csrfToken) {
  return jwt.sign(
    {
      id: Number(user.id),
      username: String(user.username ?? ""),
      csrf: csrfToken,
    },
    config.jwtSecret,
    { expiresIn: "30d" },
  );
}

export function verifySessionToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function setAuthCookies(res, user) {
  const csrfToken = createCsrfToken();
  const sessionToken = createSessionToken(user, csrfToken);

  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...baseCookieOptions(),
    httpOnly: false,
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    ...baseCookieOptions(),
    httpOnly: true,
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...baseCookieOptions(),
    httpOnly: false,
  });
}

export function getSessionTokenFromRequest(req) {
  return req.cookies?.[SESSION_COOKIE_NAME] || "";
}

export function getCsrfTokenFromRequest(req) {
  return req.cookies?.[CSRF_COOKIE_NAME] || "";
}

export function parseCookieHeader(headerValue) {
  return String(headerValue ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, separator).trim());
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}
