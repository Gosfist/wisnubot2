import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Phone, ShieldCheck, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { normalizePhoneNumber } from "../../lib/format";

export function RegisterPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const appData = useAppData();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState(60);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [lastOtpPhoneNumber, setLastOtpPhoneNumber] = useState<string | null>(null);
  const [expiredOtpPhoneNumber, setExpiredOtpPhoneNumber] = useState<string | null>(null);
  const toastPosition = "top-right-form" as const;

  useEffect(() => {
    let mounted = true;
    appData
      .getLimits()
      .then((result) => {
        if (!mounted) {
          return;
        }
        setOtpExpiresInSeconds(result.otpExpiresInSeconds);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setOtpCooldownSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [otpCooldownSeconds]);

  useEffect(() => {
    if (otpRemainingSeconds <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setOtpRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [otpRemainingSeconds]);

  useEffect(() => {
    if (otpRemainingSeconds > 0 || !lastOtpPhoneNumber) {
      return;
    }

    setExpiredOtpPhoneNumber(lastOtpPhoneNumber);
    setLastOtpPhoneNumber(null);
    setOtpCode("");
    
  }, [lastOtpPhoneNumber, otpRemainingSeconds]);

  const otpExpiresInMinutes = useMemo(() => Math.ceil(otpExpiresInSeconds / 60), [otpExpiresInSeconds]);

  function validateBeforeSendingOtp() {
    const digits = phoneNumber.replace(/[^\d]/g, "");

    if (!name.trim() || !phoneNumber.trim() || !password || !confirmPassword) {
      throw new Error("Isi nama, nomor WhatsApp, password, dan konfirmasi password dulu");
    }

    if (digits.length < 10) {
      throw new Error("Nomor WhatsApp tidak valid!");
    }

    if (password.length < 8) {
      throw new Error("Password minimal 8 karakter!");
    }

    if (password !== confirmPassword) {
      throw new Error("Password tidak cocok!");
    }
  }

  async function handleSendOtp() {
    if (isSendingOtp || otpCooldownSeconds > 0) {
      return;
    }

    try {
      validateBeforeSendingOtp();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Validasi gagal.", "danger", toastPosition);
      return;
    }

    setIsSendingOtp(true);
    try {
      const result = await auth.sendRegisterOtp(phoneNumber);
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      setLastOtpPhoneNumber(normalizedPhoneNumber);
      setExpiredOtpPhoneNumber(null);
      setOtpExpiresInSeconds(result.expiresInSeconds);
      setOtpRemainingSeconds(result.expiresInSeconds);
      setOtpCooldownSeconds(result.resendCooldownSeconds);
      showToast("OTP berhasil dikirim", "success", toastPosition);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal mengirim OTP.", "danger", toastPosition);
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const digits = phoneNumber.replace(/[^\d]/g, "");
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!name.trim() || !phoneNumber.trim() || !otpCode.trim() || !password || !confirmPassword) {
      showToast("Semua field wajib diisi!", "danger", toastPosition);
      return;
    }
    if (digits.length < 10) {
      showToast("Nomor WhatsApp tidak valid!", "danger", toastPosition);
      return;
    }
    if (password.length < 8) {
      showToast("Password minimal 8 karakter!", "danger", toastPosition);
      return;
    }
    if (password !== confirmPassword) {
      showToast("Password tidak cocok!", "danger", toastPosition);
      return;
    }
    if (otpRemainingSeconds <= 0 && expiredOtpPhoneNumber === normalizedPhoneNumber) {
      showToast("Kode OTP tidak valid", "danger", toastPosition);
      return;
    }
    if (lastOtpPhoneNumber !== normalizedPhoneNumber) {
      showToast("Klik Kirim OTP dulu untuk nomor WhatsApp ini", "danger", toastPosition);
      return;
    }

    setIsLoading(true);
    try {
      await auth.register(name, phoneNumber, otpCode, password, confirmPassword);
      showToast("Akun berhasil dibuat! Silakan login.", "success", toastPosition);
      navigate("/login", { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal membuat akun.", "danger", toastPosition);
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[620px] rounded-[30px] border border-glass-border-blue bg-[rgba(15,23,42,0.86)] p-5 shadow-panel backdrop-blur-[22px] sm:p-8">
      <div className="mb-4 space-y-1 sm:mb-6 sm:space-y-2">
        <h2 className="text-[1.6rem] font-extrabold sm:text-[1.75rem]">Registrasi</h2>
      </div>

      <form className="space-y-3 sm:space-y-4" onSubmit={handleRegister}>
        <label className="block space-y-2">
          <span className="text-xs font-bold tracking-[0.22em] text-text-muted">NAMA LENGKAP</span>
          <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
            <UserRound size={18} />
            <input
              className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama lengkapmu"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-bold tracking-[0.22em] text-text-muted">NOMOR WHATSAPP</span>
          <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
            <Phone size={18} />
            <input
              className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="08xxxxxxxxxx"
            />
          </div>
        </label>

        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">PASSWORD</span>
            <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
              <Lock size={18} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimal 8 karakter"
              />
              <button
                className="rounded-xl p-2 text-text-secondary transition hover:bg-[rgba(148,163,184,0.12)] hover:text-text-primary"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">KONFIRMASI PASSWORD</span>
            <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
              <Lock size={18} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Ulangi password"
              />
              <button
                className="rounded-xl p-2 text-text-secondary transition hover:bg-[rgba(148,163,184,0.12)] hover:text-text-primary"
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-bold tracking-[0.22em] text-text-muted">KODE OTP</span>
          <div className="flex items-center gap-3">
            <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
              <ShieldCheck size={18} />
              <input
                className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="kode OTP"
              />
            </div>

            <button
              className="inline-flex h-[54px] min-w-[96px] shrink-0 items-center justify-center whitespace-nowrap rounded-[20px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.78)] px-3 py-3 text-xs font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)] sm:min-w-[112px] sm:px-4 sm:text-sm disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={handleSendOtp}
              disabled={isSendingOtp || otpCooldownSeconds > 0}
            >
              {isSendingOtp ? "Mengirim..." : otpCooldownSeconds > 0 ? `${otpCooldownSeconds}s` : "Kirim OTP"}
            </button>
          </div>
      
        </label>

        <button
          className="flex h-[54px] w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? "MENYIMPAN..." : "DAFTAR SEKARANG"}
        </button>
      </form>

      <p className="mt-5 text-end text-sm text-text-secondary sm:mt-6">
        Sudah punya akun?{" "}
        <Link className="font-semibold text-accent transition hover:text-primary-light" to="/login">
          Masuk
        </Link>
      </p>
    </div>
  );
}
