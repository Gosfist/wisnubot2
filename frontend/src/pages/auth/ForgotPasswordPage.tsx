import { useState } from "react";
import { Eye, EyeOff, Key, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";

export function ForgotPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [secretKey, setSecretKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const toastPosition = "top-right-form" as const;

  async function handleVerifySecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secretKey.trim()) {
      showToast("Secret key wajib diisi", "danger", toastPosition);
      return;
    }
    setIsVerifying(true);
    try {
      await auth.verifyResetSecret(secretKey);
      setIsVerified(true);
      showToast("Secret key valid, buat password baru", "success", toastPosition);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Secret key tidak valid.",
        "danger",
        toastPosition,
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleSavePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      showToast("Password baru minimal 8 karakter", "danger", toastPosition);
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Konfirmasi password tidak cocok", "danger", toastPosition);
      return;
    }
    setIsSaving(true);
    try {
      await auth.resetPassword(secretKey, newPassword, confirmPassword);
      showToast("Password berhasil direset", "success", toastPosition);
      navigate("/login", { replace: true });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal menyimpan password baru.",
        "danger",
        toastPosition,
      );
      setIsSaving(false);
    }
  }

  return (
    <div className="w-full max-w-[460px] rounded-[30px] border border-glass-border-blue bg-[rgba(15,23,42,0.86)] p-6 shadow-panel backdrop-blur-[22px] sm:p-8">
      <div className="mb-6 space-y-2">
        <h2 className="text-[1.5rem] font-extrabold leading-tight">Lupa Password</h2>
        <p className="text-sm text-text-secondary">
          {isVerified
            ? "Buat password baru untuk akun admin."
            : "Masukkan secret key yang tersimpan di .env untuk melanjutkan."}
        </p>
      </div>

      {isVerified ? (
        <form className="space-y-4" onSubmit={handleSavePassword}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">PASSWORD BARU</span>
            <div className="flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3.5 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
              <Lock size={18} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Password baru"
              />
              <button
                className="rounded-xl p-2 text-text-secondary transition hover:bg-[rgba(148,163,184,0.12)] hover:text-text-primary"
                type="button"
                onClick={() => setShowNewPassword((c) => !c)}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">KONFIRMASI PASSWORD BARU</span>
            <div className="flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3.5 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
              <Lock size={18} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Ulangi password baru"
              />
              <button
                className="rounded-xl p-2 text-text-secondary transition hover:bg-[rgba(148,163,184,0.12)] hover:text-text-primary"
                type="button"
                onClick={() => setShowConfirmPassword((c) => !c)}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button
            className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "MENYIMPAN..." : "SIMPAN PASSWORD"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleVerifySecret}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">SECRET KEY</span>
            <div className="flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3.5 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
              <Key size={18} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type="password"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                placeholder="Masukkan secret key"
              />
            </div>
          </label>
          <button
            className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isVerifying}
          >
            {isVerifying ? "MEMVERIFIKASI..." : "VERIFIKASI"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-text-secondary">
        Sudah ingat password?{" "}
        <Link className="font-semibold text-accent transition hover:text-primary-light" to="/login">
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}
