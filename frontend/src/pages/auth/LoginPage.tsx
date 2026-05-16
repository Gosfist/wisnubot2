import { useState } from "react";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { WisnuBotLogo } from "../../components/WisnuBotLogo";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const data = useAppData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage("Username dan password wajib diisi");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const user = await auth.login(username, password);
      await data.preloadForSession(user);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal login.");
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[460px] rounded-[30px] border border-glass-border-blue bg-[rgba(15,23,42,0.86)] p-6 shadow-panel backdrop-blur-[22px] sm:p-8">
      <div className="mb-6 space-y-4 text-center">
        <div className="inline-flex justify-center">
          <WisnuBotLogo size={38} withContainer />
        </div>
        <h1 className="text-[clamp(2rem,5vw,2.8rem)] font-black">WisnuBot2</h1>
      </div>

      <form className="space-y-4" onSubmit={handleLogin}>
        {errorMessage ? (
          <div className="rounded-[20px] border border-[rgba(239,68,68,0.25)] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-xs font-bold tracking-[0.22em] text-text-muted">USERNAME</span>
          <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
            <User size={18} />
            <input
              className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
              type="text"
              placeholder="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-bold tracking-[0.22em] text-text-muted">PASSWORD</span>

          <div className="flex h-[54px] items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent">
            <Lock size={18} />
            <input
              className="w-full border-0 bg-transparent p-0 text-sm leading-none text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
              type={showPassword ? "text" : "password"}
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isLoading}
            />
            <button
              className="rounded-xl p-2 text-text-secondary transition hover:bg-[rgba(148,163,184,0.12)] hover:text-text-primary"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="flex justify-end">
            <Link className="text-sm font-medium text-accent transition hover:text-primary-light" to="/forgot-password">
              Lupa password?
            </Link>
          </div>
        </label>

        <button
          className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.1em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? "MEMPROSES..." : "MASUK"}
        </button>
      </form>
    </div>
  );
}
