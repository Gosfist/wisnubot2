import { useEffect, useRef, useState } from "react";
import { CreditCard, Database, Download, Folder, Key, Lock, Megaphone, PencilLine, Save, Upload, User } from "lucide-react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { appConfig } from "../../lib/config";
import { apiFetch, withJsonBody } from "../../lib/http";
import { getToken } from "../../lib/storage";

function normalizeGoogleDriveFolderId(value: string) {
  const raw = value.trim();
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idParamMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return raw.replace(/^["']|["']$/g, "").replace(/[.\s]+$/g, "");
}

export function SettingsPage() {
  const auth = useAuth();
  const appData = useAppData();
  const { showToast } = useToast();
  const currentUser = appData.user ?? auth.user;
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [showEditUsernameModal, setShowEditUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPakasirModal, setShowPakasirModal] = useState(false);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameSecretKey, setUsernameSecretKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSecretKey, setPasswordSecretKey] = useState("");
  const [pakasirSlug, setPakasirSlug] = useState("");
  const [pakasirApiKey, setPakasirApiKey] = useState("");
  const [pakasirApiKeyMasked, setPakasirApiKeyMasked] = useState<string | null>(null);
  const [testimonialChannelLink, setTestimonialChannelLink] = useState("");
  const [testimonialChannelStatus, setTestimonialChannelStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [googleDriveClientId, setGoogleDriveClientId] = useState("");
  const [googleDriveClientSecret, setGoogleDriveClientSecret] = useState("");
  const [googleDriveClientSecretMasked, setGoogleDriveClientSecretMasked] = useState<string | null>(null);
  const [googleDriveRefreshToken, setGoogleDriveRefreshToken] = useState("");
  const [googleDriveRefreshTokenMasked, setGoogleDriveRefreshTokenMasked] = useState<string | null>(null);
  const [googleDriveAuthMode, setGoogleDriveAuthMode] = useState("none");
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState("");
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoadingPayment, setIsLoadingPayment] = useState(true);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isSavingGoogleDrive, setIsSavingGoogleDrive] = useState(false);
  const [isExportingDb, setIsExportingDb] = useState(false);
  const [isImportingDb, setIsImportingDb] = useState(false);
  const [importProgress, setImportProgress] = useState<{ percent: number; label: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await appData.fetchSettings();
        if (!mounted) return;
        setPakasirSlug(settings.pakasirSlug);
        setPakasirApiKeyMasked(settings.pakasirApiKeyMasked);
        setTestimonialChannelLink(settings.testimonialChannelLink);
        setTestimonialChannelStatus(settings.testimonialChannelStatus);
        setGoogleDriveClientId(settings.googleDriveClientId);
        setGoogleDriveClientSecretMasked(settings.googleDriveClientSecretMasked);
        setGoogleDriveRefreshTokenMasked(settings.googleDriveRefreshTokenMasked);
        setGoogleDriveAuthMode(settings.googleDriveAuthMode);
        setGoogleDriveFolderId(settings.googleDriveFolderId);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Gagal memuat setting Pakasir.", "danger");
      } finally {
        if (mounted) setIsLoadingPayment(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSaveUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUsername.trim()) {
      showToast("Username baru wajib diisi", "danger");
      return;
    }
    if (!usernameSecretKey.trim()) {
      showToast("Secret key wajib diisi", "danger");
      return;
    }
    setIsUpdatingUsername(true);
    try {
      await auth.updateProfile(newUsername, usernameSecretKey);
      await appData.refreshUser();
      setNewUsername("");
      setUsernameSecretKey("");
      setShowEditUsernameModal(false);
      showToast("Username berhasil diperbarui", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal memperbarui username.", "danger");
    } finally {
      setIsUpdatingUsername(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassword) {
      showToast("Password baru wajib diisi", "danger");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Konfirmasi password tidak cocok", "danger");
      return;
    }
    if (!passwordSecretKey.trim()) {
      showToast("Secret key wajib diisi", "danger");
      return;
    }
    setIsChangingPassword(true);
    try {
      await auth.changePassword(newPassword, passwordSecretKey);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSecretKey("");
      setShowPasswordModal(false);
      showToast("Password berhasil diubah", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal mengubah password.", "danger");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleSavePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pakasirSlug.trim()) {
      showToast("Slug Pakasir wajib diisi", "danger");
      return;
    }

    setIsSavingPayment(true);
    try {
      const settings = await appData.updateSettings({
        pakasirSlug: pakasirSlug.trim(),
        pakasirApiKey: pakasirApiKey.trim(),
        testimonialChannelLink: testimonialChannelLink.trim(),
      });
      setPakasirApiKey("");
      setPakasirApiKeyMasked(settings.pakasirApiKeyMasked);
      setTestimonialChannelLink(settings.testimonialChannelLink);
      setTestimonialChannelStatus(settings.testimonialChannelStatus);
      if (settings.testimonialChannelStatus && !settings.testimonialChannelStatus.ok) {
        showToast(settings.testimonialChannelStatus.message, "danger");
      } else {
        showToast("Setting payment dan saluran berhasil disimpan", "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menyimpan setting Pakasir.", "danger");
    } finally {
      setIsSavingPayment(false);
    }
  }

  async function handleSaveGoogleDrive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingGoogleDrive(true);
    try {
      const settings = await appData.updateSettings({
        pakasirSlug: pakasirSlug.trim(),
        pakasirApiKey: "",
        testimonialChannelLink: testimonialChannelLink.trim(),
        googleDriveClientId: googleDriveClientId.trim(),
        googleDriveClientSecret: googleDriveClientSecret.trim(),
        googleDriveRefreshToken: googleDriveRefreshToken.trim(),
        googleDriveFolderId: normalizeGoogleDriveFolderId(googleDriveFolderId),
      });
      setGoogleDriveClientId(settings.googleDriveClientId);
      setGoogleDriveClientSecret("");
      setGoogleDriveClientSecretMasked(settings.googleDriveClientSecretMasked);
      setGoogleDriveRefreshToken("");
      setGoogleDriveRefreshTokenMasked(settings.googleDriveRefreshTokenMasked);
      setGoogleDriveAuthMode(settings.googleDriveAuthMode);
      setGoogleDriveFolderId(settings.googleDriveFolderId);
      showToast("Setting Google Drive berhasil disimpan", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menyimpan setting Google Drive.", "danger");
    } finally {
      setIsSavingGoogleDrive(false);
    }
  }

  async function handleExportDatabase() {
    setIsExportingDb(true);
    try {
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const response = await fetch(`${appConfig.apiBaseUrl}/settings/export`, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error ?? "Gagal export database."));
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `wisnubot2-db-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Export database berhasil dibuat", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal export database.", "danger");
    } finally {
      setIsExportingDb(false);
    }
  }

  async function handleImportDatabase(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("Import akan mengganti seluruh database WisnuBot2 dengan isi file export. Lanjutkan?")) {
      return;
    }

    setIsImportingDb(true);
    setImportProgress({ percent: 3, label: "Membaca file export..." });
    try {
      const text = await file.text();
      setImportProgress({ percent: 12, label: "Memvalidasi isi file JSON..." });
      const payload = JSON.parse(text);
      setImportProgress({ percent: 25, label: "Mengirim data import ke backend..." });
      const result = await apiFetch<{ message: string; counts?: Record<string, number> }>(
        "/settings/import",
        withJsonBody(payload),
      );
      setImportProgress({ percent: 72, label: "Import backend selesai, memuat ulang setting..." });
      const settings = await appData.fetchSettings();
      setImportProgress({ percent: 82, label: "Memuat ulang broadcast dan customer service..." });
      await Promise.all([
        appData.refreshBroadcasts(),
        appData.refreshCustomerService(),
      ]);
      setImportProgress({ percent: 92, label: "Memuat ulang TRX Gemini dari database..." });
      const trxGeminiData = await appData.refreshTrxGeminiData();
      setPakasirSlug(settings.pakasirSlug);
      setPakasirApiKey("");
      setPakasirApiKeyMasked(settings.pakasirApiKeyMasked);
      setTestimonialChannelLink(settings.testimonialChannelLink);
      setTestimonialChannelStatus(settings.testimonialChannelStatus);
      setGoogleDriveClientId(settings.googleDriveClientId);
      setGoogleDriveClientSecretMasked(settings.googleDriveClientSecretMasked);
      setGoogleDriveRefreshTokenMasked(settings.googleDriveRefreshTokenMasked);
      setGoogleDriveAuthMode(settings.googleDriveAuthMode);
      setGoogleDriveFolderId(settings.googleDriveFolderId);
      setImportProgress({
        percent: 100,
        label: `Import selesai, ${trxGeminiData.transactions.length} TRX Gemini dimuat.`,
      });
      window.setTimeout(() => {
        setImportProgress(null);
        showToast(result.message || "Import database berhasil", "success");
      }, 900);
    } catch (error) {
      setImportProgress({ percent: 100, label: "Import gagal. Cek pesan error." });
      showToast(error instanceof Error ? error.message : "Gagal import database.", "danger");
      window.setTimeout(() => setImportProgress(null), 1600);
    } finally {
      setIsImportingDb(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Pengaturan" />

      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Profil</h3>
        </div>

        <div className="space-y-3">
          <button
            className="flex w-full items-center justify-between gap-4 rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] px-4 py-4 text-left transition hover:border-[rgba(56,189,248,0.28)] hover:bg-[rgba(15,23,42,0.72)]"
            type="button"
            onClick={() => {
              setNewUsername(currentUser?.username ?? "");
              setShowEditUsernameModal(true);
            }}
          >
            <div>
              <span className="block text-xs font-bold tracking-[0.2em] text-text-muted">USERNAME</span>
              <strong className="mt-2 block text-sm font-semibold">{currentUser?.username ?? "-"}</strong>
            </div>
            <PencilLine size={16} className="text-accent" />
          </button>

          <button
            className="flex w-full items-center justify-between gap-4 rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] px-4 py-4 text-left transition hover:border-[rgba(56,189,248,0.28)] hover:bg-[rgba(15,23,42,0.72)]"
            type="button"
            onClick={() => setShowPasswordModal(true)}
          >
            <div>
              <span className="block text-xs font-bold tracking-[0.2em] text-text-muted">PASSWORD</span>
              <strong className="mt-2 block text-sm font-semibold">********</strong>
            </div>
            <Lock size={16} className="text-accent" />
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Integrasi & Data</h3>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            className="flex items-center justify-between gap-4 rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] px-4 py-4 text-left transition hover:border-[rgba(56,189,248,0.28)] hover:bg-[rgba(15,23,42,0.72)]"
            type="button"
            onClick={() => setShowPakasirModal(true)}
          >
            <div>
              <span className="block text-xs font-bold tracking-[0.2em] text-text-muted">PAYMENT</span>
              <strong className="mt-2 block text-sm font-semibold">Pakasir</strong>
            </div>
            <CreditCard size={16} className="text-accent" />
          </button>

          <button
            className="flex items-center justify-between gap-4 rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] px-4 py-4 text-left transition hover:border-[rgba(56,189,248,0.28)] hover:bg-[rgba(15,23,42,0.72)]"
            type="button"
            onClick={() => setShowGoogleDriveModal(true)}
          >
            <div>
              <span className="block text-xs font-bold tracking-[0.2em] text-text-muted">UPLOAD BUKTI</span>
              <strong className="mt-2 block text-sm font-semibold">Google Drive</strong>
            </div>
            <Folder size={16} className="text-accent" />
          </button>

          <button
            className="flex items-center justify-between gap-4 rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] px-4 py-4 text-left transition hover:border-[rgba(56,189,248,0.28)] hover:bg-[rgba(15,23,42,0.72)]"
            type="button"
            onClick={() => setShowBackupModal(true)}
          >
            <div>
              <span className="block text-xs font-bold tracking-[0.2em] text-text-muted">DATABASE</span>
              <strong className="mt-2 block text-sm font-semibold">Backup Data</strong>
            </div>
            <Database size={16} className="text-accent" />
          </button>
        </div>
      </SurfaceCard>

      <Modal open={showEditUsernameModal} title="Ganti Username" onClose={() => setShowEditUsernameModal(false)}>
        <form className="space-y-4" onSubmit={handleSaveUsername}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">USERNAME BARU</span>
            <div className="flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:text-accent">
              <User size={16} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="Username baru"
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">SECRET KEY</span>
            <div className="flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:text-accent">
              <Key size={16} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type="password"
                value={usernameSecretKey}
                onChange={(event) => setUsernameSecretKey(event.target.value)}
                placeholder="Masukkan secret key"
              />
            </div>
          </label>
          <button
            className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isUpdatingUsername}
          >
            {isUpdatingUsername ? "MENYIMPAN..." : "SIMPAN"}
          </button>
        </form>
      </Modal>

      <Modal open={showPasswordModal} title="Ganti Password" onClose={() => setShowPasswordModal(false)}>
        <form className="space-y-4" onSubmit={handleChangePassword}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">PASSWORD BARU</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Password baru"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">KONFIRMASI PASSWORD BARU</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Ulangi password baru"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">SECRET KEY</span>
            <div className="flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:text-accent">
              <Key size={16} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type="password"
                value={passwordSecretKey}
                onChange={(event) => setPasswordSecretKey(event.target.value)}
                placeholder="Masukkan secret key"
              />
            </div>
          </label>
          <button
            className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isChangingPassword}
          >
            {isChangingPassword ? "MEMPROSES..." : "UBAH PASSWORD"}
          </button>
        </form>
      </Modal>

      <Modal open={showPakasirModal} title="Pakasir" onClose={() => setShowPakasirModal(false)} wide>
        {isLoadingPayment ? null : (
          <form className="space-y-4" onSubmit={handleSavePayment}>
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">SLUG PAKASIR</span>
              <input
                autoComplete="off"
                data-lpignore="true"
                name="pakasir_project_slug"
                value={pakasirSlug}
                onChange={(event) => setPakasirSlug(event.target.value)}
                placeholder="wisnubot"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">API KEY PAKASIR</span>
              <input
                type="password"
                autoComplete="new-password"
                data-lpignore="true"
                name="pakasir_secret_key"
                value={pakasirApiKey}
                onChange={(event) => setPakasirApiKey(event.target.value)}
                placeholder={pakasirApiKeyMasked ? `Tersimpan: ${pakasirApiKeyMasked}` : "Masukkan API key Pakasir"}
              />
              <span className="text-xs text-text-secondary">
                Kosongkan jika tidak ingin mengganti API key yang sudah tersimpan.
              </span>
            </label>

            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-text-muted">
                <Megaphone size={14} />
                LINK SALURAN TESTIMONI
              </span>
              <input
                autoComplete="off"
                name="testimonial_channel_link"
                value={testimonialChannelLink}
                onChange={(event) => {
                  setTestimonialChannelLink(event.target.value);
                  setTestimonialChannelStatus(null);
                }}
                placeholder="https://whatsapp.com/channel/..."
              />
              <span className={testimonialChannelStatus?.ok ? "text-xs text-success" : "text-xs text-text-secondary"}>
                {testimonialChannelStatus?.message || "Bot utama harus masuk ke saluran dan dijadikan admin agar testimoni otomatis terkirim."}
              </span>
            </label>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSavingPayment}
            >
              <Save size={16} />
              {isSavingPayment ? "MENYIMPAN..." : "SIMPAN SETTING PAYMENT"}
            </button>
          </form>
        )}
      </Modal>

      <Modal open={showGoogleDriveModal} title="Google Drive" onClose={() => setShowGoogleDriveModal(false)} wide>
        {isLoadingPayment ? null : (
          <form className="space-y-4" onSubmit={handleSaveGoogleDrive}>
            <div className="rounded-[18px] border border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.46)] p-4 text-sm text-text-secondary">
              <strong className="block text-text-primary">Google Drive personal pakai OAuth.</strong>
              <span>Isi Client ID, Client Secret, Refresh Token, dan ID folder supaya upload bukti memakai kuota Google Drive personal kamu.</span>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">OAUTH CLIENT ID</span>
              <input
                autoComplete="off"
                name="google_drive_client_id"
                value={googleDriveClientId}
                onChange={(event) => setGoogleDriveClientId(event.target.value)}
                placeholder="Client ID dari Google Cloud OAuth"
              />
              <span className="text-xs text-text-secondary">
                Status auth: {googleDriveAuthMode === "oauth" ? "OAuth Google personal aktif" : "Belum lengkap"}
              </span>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">OAUTH CLIENT SECRET</span>
              <input
                autoComplete="off"
                name="google_drive_client_secret"
                value={googleDriveClientSecret}
                onChange={(event) => setGoogleDriveClientSecret(event.target.value)}
                placeholder={googleDriveClientSecretMasked ? `Tersimpan: ${googleDriveClientSecretMasked}` : "Client Secret dari Google Cloud OAuth"}
              />
              <span className="text-xs text-text-secondary">
                Kosongkan jika tidak ingin mengganti client secret yang sudah tersimpan.
              </span>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">REFRESH TOKEN GOOGLE DRIVE</span>
              <textarea
                className="min-h-24"
                autoComplete="off"
                name="google_drive_refresh_token"
                value={googleDriveRefreshToken}
                onChange={(event) => setGoogleDriveRefreshToken(event.target.value)}
                placeholder={googleDriveRefreshTokenMasked ? `Tersimpan: ${googleDriveRefreshTokenMasked}` : "Refresh token OAuth Google Drive"}
              />
              <span className="text-xs text-text-secondary">
                Token ini membuat upload memakai kuota Google Drive personal kamu.
              </span>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">ID FOLDER GOOGLE DRIVE</span>
              <input
                autoComplete="off"
                name="google_drive_folder_id"
                value={googleDriveFolderId}
                onChange={(event) => setGoogleDriveFolderId(event.target.value)}
                onBlur={(event) => setGoogleDriveFolderId(normalizeGoogleDriveFolderId(event.target.value))}
                placeholder="ID folder untuk bukti transaksi"
              />
              <span className="text-xs text-text-secondary">
                Boleh paste link folder penuh; sistem akan menyimpan ID foldernya saja.
              </span>
            </label>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSavingGoogleDrive}
            >
              <Save size={16} />
              {isSavingGoogleDrive ? "MENYIMPAN..." : "SIMPAN SETTING GOOGLE DRIVE"}
            </button>
          </form>
        )}
      </Modal>

      <Modal open={showBackupModal} title="Backup Data" onClose={() => setShowBackupModal(false)}>
        <input
          ref={importInputRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={handleImportDatabase}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="flex items-center justify-center gap-2 rounded-[20px] border border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.64)] px-4 py-3.5 text-sm font-bold text-text-primary transition hover:border-[rgba(56,189,248,0.34)] hover:bg-[rgba(15,23,42,0.78)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={handleExportDatabase}
            disabled={isExportingDb || isImportingDb}
          >
            <Download size={16} />
            {isExportingDb ? "EXPORT..." : "EXPORT DB"}
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isExportingDb || isImportingDb}
          >
            <Upload size={16} />
            {isImportingDb ? "IMPORT..." : "IMPORT DB"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-text-secondary">
          File export memakai format JSON WisnuBot2. Import full backup akan mengganti seluruh database, termasuk bot WA, grup, transaksi, Gemini, broadcast, dan pengaturan.
        </p>
      </Modal>

      {importProgress ? (
        <div className="fixed bottom-6 right-6 z-[120] w-[min(360px,calc(100vw-32px))] rounded-[18px] border border-[rgba(56,189,248,0.26)] bg-[rgba(15,23,42,0.96)] p-4 text-text-primary shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[0.22em] text-text-muted">IMPORT DB</span>
            <strong className="text-sm font-bold text-accent">{importProgress.percent}%</strong>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(148,163,184,0.2)]">
            <div
              className="h-full rounded-full bg-linear-to-r from-primary to-accent transition-[width] duration-500 ease-out"
              style={{ width: `${importProgress.percent}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">{importProgress.label}</p>
        </div>
      ) : null}
    </div>
  );
}
