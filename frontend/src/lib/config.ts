function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol
    ? window.location.protocol
    : "http:";
const browserHostname =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";
const browserPort =
  typeof window !== "undefined" && window.location.port
    ? window.location.port
    : "";
const browserOrigin =
  typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "http://localhost:3000";

const explicitApiOrigin = import.meta.env.VITE_API_ORIGIN
  ? trimTrailingSlash(String(import.meta.env.VITE_API_ORIGIN))
  : "";
const legacyApiHost = import.meta.env.VITE_API_HOST
  ? String(import.meta.env.VITE_API_HOST)
  : "";
const devApiOrigin =
  browserPort === "5173" || browserPort === "4173"
    ? `${browserProtocol}//${browserHostname}:3000`
    : browserOrigin;
const apiOrigin =
  explicitApiOrigin ||
  (legacyApiHost ? `${browserProtocol}//${legacyApiHost}` : devApiOrigin);
const serverHost = new URL(apiOrigin).host;

export const appConfig = {
  serverHost,
  apiBaseUrl: `${apiOrigin}/api`,
  socketBaseUrl: apiOrigin,
  appVersion: __APP_VERSION__,
};
