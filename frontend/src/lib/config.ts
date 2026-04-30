const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";

const serverHost = import.meta.env.VITE_API_HOST ?? `${browserHost}:3000`;

export const appConfig = {
  serverHost,
  apiBaseUrl: `http://${serverHost}/api`,
  socketBaseUrl: `http://${serverHost}`,
  appVersion: __APP_VERSION__,
};
