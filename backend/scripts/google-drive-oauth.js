import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/drive";

function openBrowser(url) {
  const command = process.platform === "win32"
    ? `cmd /c start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command, () => {});
}

async function waitForCode(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (error || state !== expectedState || !code) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(error || "Invalid OAuth callback");
        server.close();
        reject(new Error(error || "Invalid OAuth callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h2>Google Drive token berhasil dibuat.</h2><p>Silakan kembali ke terminal.</p>");
      server.close();
      resolve(code);
    });

    server.listen(PORT, "127.0.0.1", () => {});
    server.on("error", reject);
  });
}

async function exchangeCode({ clientId, clientSecret, code }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.error_description ?? data?.error ?? "Gagal exchange OAuth code"));
  }
  return data;
}

async function main() {
  const rl = createInterface({ input, output });
  try {
    const clientId = (await rl.question("OAuth Client ID: ")).trim();
    const clientSecret = (await rl.question("OAuth Client Secret: ")).trim();
    if (!clientId || !clientSecret) {
      throw new Error("Client ID dan Client Secret wajib diisi");
    }

    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    const codePromise = waitForCode(state);
    console.log("\nBuka URL ini jika browser tidak terbuka otomatis:\n");
    console.log(authUrl.toString());
    openBrowser(authUrl.toString());

    const code = await codePromise;
    const token = await exchangeCode({ clientId, clientSecret, code });
    if (!token.refresh_token) {
      throw new Error("Google tidak mengirim refresh token. Jalankan ulang script dan pastikan prompt consent muncul.");
    }

    console.log("\nRefresh Token:");
    console.log(token.refresh_token);
    console.log("\nTempel nilai di atas ke Settings > Google Drive > Refresh Token Google Drive.");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`\nGagal: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

