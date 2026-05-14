import crypto from "node:crypto";
import { appSettingsService } from "../services/app-settings.service.js";
import { baileysManager } from "../services/baileys.service.js";
import { dbTransferService } from "../services/db-transfer.service.js";
import { logger } from "../utils/logger.js";

const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const googleDriveOAuthStates = new Map();

function getPublicBaseUrl(req) {
  const proto = String(req.get("x-forwarded-proto") ?? req.protocol ?? "http").split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0].trim();
  return `${proto}://${host}`;
}

function getGoogleDriveRedirectUri(req) {
  return `${getPublicBaseUrl(req)}/api/settings/google-drive/oauth/callback`;
}

async function exchangeGoogleDriveCode({ clientId, clientSecret, code, redirectUri }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.error_description ?? data?.error ?? "Gagal exchange OAuth code"));
  }
  return data;
}

function renderOAuthCallbackPage(payload) {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Drive OAuth</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; font-family: Arial, sans-serif; }
      main { width: min(560px, calc(100vw - 32px)); border: 1px solid rgba(56,189,248,.24); border-radius: 18px; background: rgba(30,41,59,.9); padding: 24px; box-sizing: border-box; }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { color: #94a3b8; line-height: 1.5; }
      textarea { width: 100%; min-height: 96px; border-radius: 14px; border: 1px solid rgba(148,163,184,.28); background: #111827; color: #e2e8f0; padding: 12px; box-sizing: border-box; }
      .error { color: #fca5a5; }
    </style>
  </head>
  <body>
    <main>
      <h1 id="title">Memproses OAuth...</h1>
      <p id="message">Silakan tunggu.</p>
      <textarea id="token" readonly hidden></textarea>
    </main>
    <script>
      const payload = ${serialized};
      const title = document.getElementById("title");
      const message = document.getElementById("message");
      const token = document.getElementById("token");
      if (payload.ok) {
        title.textContent = "Login Google berhasil";
        message.textContent = "Refresh token sudah dikirim ke form Settings. Jika tab ini tidak tertutup otomatis, tutup manual.";
        token.hidden = false;
        token.value = payload.refreshToken;
      } else {
        title.textContent = "Login Google gagal";
        title.className = "error";
        message.textContent = payload.error || "OAuth Google gagal.";
      }
      if (window.opener) {
        window.opener.postMessage({ type: "wisnubot2:google-drive-oauth", payload }, payload.targetOrigin || "*");
        if (payload.ok) window.setTimeout(() => window.close(), 900);
      }
    </script>
  </body>
</html>`;
}

export async function getSettings(req, res) {
  try {
    const settings = await appSettingsService.getForUser(req.user);
    res.json({ settings });
  } catch (err) {
    logger.error(err, "Get settings error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function updateSettings(req, res) {
  try {
    const settings = await appSettingsService.upsertForUser(req.user, {
      pakasirSlug: req.body?.pakasirSlug,
      pakasirApiKey: req.body?.pakasirApiKey,
      testimonialChannelLink: req.body?.testimonialChannelLink,
      contactOwnerPhoneNumber: req.body?.contactOwnerPhoneNumber,
      botInfoPhoneNumber: req.body?.botInfoPhoneNumber,
      transactionMessageTemplate: req.body?.transactionMessageTemplate,
      googleDriveCredentialsJson: req.body?.googleDriveCredentialsJson,
      googleDriveClientId: req.body?.googleDriveClientId,
      googleDriveClientSecret: req.body?.googleDriveClientSecret,
      googleDriveRefreshToken: req.body?.googleDriveRefreshToken,
      googleDriveFolderId: req.body?.googleDriveFolderId,
    }, {
      sock: baileysManager.getSocket(req.user.id),
    });
    res.json({ message: "Pengaturan berhasil disimpan", settings });
  } catch (err) {
    logger.error(err, "Update settings error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}

export async function createGoogleDriveOAuthUrl(req, res) {
  try {
    const rawSettings = await appSettingsService.getRawForUserId(req.user.id);
    const requestedClientId = String(req.body?.clientId ?? "").trim();
    const requestedClientSecret = String(req.body?.clientSecret ?? "").trim();
    const clientId = requestedClientId || String(rawSettings.googleDriveClientId ?? "").trim();
    const clientSecret = requestedClientSecret || String(rawSettings.googleDriveClientSecret ?? "").trim();
    const targetOrigin = String(req.body?.targetOrigin ?? req.get("origin") ?? "").trim();

    if (!clientId) {
      return res.status(400).json({ error: "OAuth Client ID wajib diisi" });
    }
    if (!clientSecret) {
      return res.status(400).json({ error: "OAuth Client Secret wajib diisi" });
    }

    const state = crypto.randomBytes(24).toString("hex");
    const redirectUri = getGoogleDriveRedirectUri(req);
    googleDriveOAuthStates.set(state, {
      userId: req.user.id,
      clientId,
      clientSecret,
      targetOrigin,
      redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    res.json({ authUrl: authUrl.toString(), redirectUri });
  } catch (err) {
    logger.error(err, "Create Google Drive OAuth URL error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal membuat link login Google" });
  }
}

export async function handleGoogleDriveOAuthCallback(req, res) {
  const state = String(req.query?.state ?? "");
  const error = req.query?.error ? String(req.query.error) : "";
  const code = req.query?.code ? String(req.query.code) : "";
  const storedState = googleDriveOAuthStates.get(state);
  googleDriveOAuthStates.delete(state);

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  try {
    if (error) {
      throw new Error(error);
    }
    if (!state || !storedState || storedState.expiresAt < Date.now()) {
      throw new Error("Session OAuth sudah kedaluwarsa. Klik Login Google ulang dari Settings.");
    }
    if (!code) {
      throw new Error("Google tidak mengirim kode OAuth.");
    }

    const token = await exchangeGoogleDriveCode({
      clientId: storedState.clientId,
      clientSecret: storedState.clientSecret,
      code,
      redirectUri: storedState.redirectUri,
    });
    if (!token.refresh_token) {
      throw new Error("Google tidak mengirim refresh token. Klik Login Google ulang dan pastikan izin akses disetujui.");
    }

    res.send(renderOAuthCallbackPage({
      ok: true,
      refreshToken: token.refresh_token,
      targetOrigin: storedState.targetOrigin,
    }));
  } catch (err) {
    logger.error(err, "Google Drive OAuth callback error");
    res.send(renderOAuthCallbackPage({
      ok: false,
      error: err instanceof Error ? err.message : "OAuth Google gagal",
      targetOrigin: storedState?.targetOrigin ?? "",
    }));
  }
}

export async function exportDatabase(req, res) {
  try {
    const payload = await dbTransferService.exportForUser(req.user);
    const dateKey = new Date().toISOString().slice(0, 10);
    const username = String(req.user.username ?? "user").replace(/[^a-z0-9_-]+/gi, "-");
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="wisnubot2-full-db-${username}-${dateKey}.json"`,
    );
    res.json(payload);
  } catch (err) {
    logger.error(err, "Export database error");
    res.status(500).json({ error: "Gagal export database" });
  }
}

export async function importDatabase(req, res) {
  try {
    const result = await dbTransferService.importForUser(req.user, req.body);
    res.json({
      message: "Import database berhasil",
      ...result,
    });
  } catch (err) {
    logger.error(err, "Import database error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "File import tidak valid",
    });
  }
}
