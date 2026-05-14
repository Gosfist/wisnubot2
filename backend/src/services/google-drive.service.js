import crypto from "node:crypto";

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value ?? "").replace(/\\n/g, "\n");
}

function parseCredentials(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("Credential Google Drive belum diisi di Settings");

  let credentials;
  try {
    credentials = JSON.parse(text);
  } catch {
    throw new Error("Credential Google Drive harus berupa JSON service account");
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Credential Google Drive tidak valid: client_email/private_key tidak ditemukan");
  }

  return credentials;
}

async function getAccessToken(rawCredentials) {
  const credentials = parseCredentials(rawCredentials);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const input = `${header}.${claim}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(input), normalizePrivateKey(credentials.private_key))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${input}.${signature}`,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.error_description ?? data?.error ?? "Gagal autentikasi Google Drive"));
  }
  return String(data.access_token ?? "");
}

async function makeFilePublic(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(String(data?.error?.message ?? "Gagal membuat link Google Drive public"));
  }
}

async function uploadImage({ credentialsJson, folderId, buffer, mimeType, filename }) {
  const driveFolderId = String(folderId ?? "").trim();
  if (!driveFolderId) throw new Error("ID folder Google Drive belum diisi di Settings");

  const accessToken = await getAccessToken(credentialsJson);
  const boundary = `wisnubot2_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = {
    name: filename,
    parents: [driveFolderId],
    mimeType,
  };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.error?.message ?? "Gagal upload bukti ke Google Drive"));
  }

  const fileId = String(data.id ?? "");
  await makeFilePublic(accessToken, fileId);

  return {
    fileId,
    url: `https://drive.google.com/open?id=${fileId}&usp=drive_copy`,
  };
}

export const googleDriveService = {
  uploadImage,
};
