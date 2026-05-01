import { useEffect, useState } from "react";
import { CreditCard, Key, Lock, PencilLine, Save, User } from "lucide-react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";

export function SettingsPage() {
  const auth = useAuth();
  const appData = useAppData();
  const { showToast } = useToast();

  const [showEditUsernameModal, setShowEditUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameSecretKey, setUsernameSecretKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSecretKey, setPasswordSecretKey] = useState("");
  const [pakasirSlug, setPakasirSlug] = useState("");
  const [pakasirApiKey, setPakasirApiKey] = useState("");
  const [pakasirApiKeyMasked, setPakasirApiKeyMasked] = useState<string | null>(null);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoadingPayment, setIsLoadingPayment] = useState(true);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await appData.fetchSettings();
        if (!mounted) return;
        setPakasirSlug(settings.pakasirSlug);
        setPakasirApiKeyMasked(settings.pakasirApiKeyMasked);
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
      });
      setPakasirApiKey("");
      setPakasirApiKeyMasked(settings.pakasirApiKeyMasked);
      showToast("Setting Pakasir berhasil disimpan", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menyimpan setting Pakasir.", "danger");
    } finally {
      setIsSavingPayment(false);
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
              setNewUsername(appData.user?.username ?? "");
              setShowEditUsernameModal(true);
            }}
          >
            <div>
              <span className="block text-xs font-bold tracking-[0.2em] text-text-muted">USERNAME</span>
              <strong className="mt-2 block text-sm font-semibold">{appData.user?.username ?? "-"}</strong>
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
          <h3 className="text-lg font-bold">Pakasir</h3>
          <CreditCard size={18} className="text-accent" />
        </div>

        {isLoadingPayment ? (
          <div className="flex min-h-28 items-center justify-center">
            <div className="size-9 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSavePayment}>
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">SLUG PAKASIR</span>
              <input
                value={pakasirSlug}
                onChange={(event) => setPakasirSlug(event.target.value)}
                placeholder="wisnubot"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.22em] text-text-muted">API KEY PAKASIR</span>
              <input
                type="password"
                value={pakasirApiKey}
                onChange={(event) => setPakasirApiKey(event.target.value)}
                placeholder={pakasirApiKeyMasked ? `Tersimpan: ${pakasirApiKeyMasked}` : "Masukkan API key Pakasir"}
              />
              <span className="text-xs text-text-secondary">
                Kosongkan jika tidak ingin mengganti API key yang sudah tersimpan.
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
    </div>
  );
}
