function normalizeFolderId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  const idParamMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];

  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/[.\s]+$/g, "");
}

async function getOAuthAccessToken({ clientId, clientSecret, refreshToken }) {
  const id = String(clientId ?? "").trim();
  const secret = String(clientSecret ?? "").trim();
  const token = String(refreshToken ?? "").trim();
  if (!id || !secret || !token) {
    throw new Error("OAuth Google Drive belum lengkap: Client ID, Client Secret, dan Refresh Token wajib diisi");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: token,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.error_description ?? data?.error ?? "Gagal autentikasi OAuth Google Drive"));
  }
  return String(data.access_token ?? "");
}

async function makeFilePublic(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
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

async function uploadImage({
  oauthClientId,
  oauthClientSecret,
  oauthRefreshToken,
  folderId,
  buffer,
  mimeType,
  filename,
}) {
  const driveFolderId = normalizeFolderId(folderId);
  if (!driveFolderId) throw new Error("ID folder Google Drive belum diisi di Settings");

  const accessToken = await getOAuthAccessToken({
    clientId: oauthClientId,
    clientSecret: oauthClientSecret,
    refreshToken: oauthRefreshToken,
  });
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

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
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
    const message = String(data?.error?.message ?? "Gagal upload bukti ke Google Drive");
    if (response.status === 404 || /file not found/i.test(message)) {
      throw new Error(
        `Folder Google Drive tidak ditemukan/ belum bisa diakses: ${driveFolderId}. ` +
        "Pastikan ID folder benar dan akun Google yang dipakai OAuth punya akses Editor ke folder tersebut.",
      );
    }
    throw new Error(message);
  }

  const fileId = String(data.id ?? "");
  await makeFilePublic(accessToken, fileId);

  return {
    fileId,
    url: `https://drive.google.com/open?id=${fileId}&usp=drive_copy`,
  };
}

export const googleDriveService = {
  normalizeFolderId,
  uploadImage,
};
