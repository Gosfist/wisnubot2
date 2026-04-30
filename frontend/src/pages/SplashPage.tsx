import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WisnuBotLogo } from "../components/WisnuBotLogo";
import { useAppData } from "../hooks/useAppData";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/http";

export function SplashPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const data = useAppData();
  const [statusText, setStatusText] = useState("Menghubungkan ke server...");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (auth.restoringSession) {
        setStatusText("Memulihkan sesi...");
        setErrorText(null);
        return;
      }

      try {
        setStatusText("Menghubungkan ke server...");
        await apiFetch("/health");
        if (cancelled) {
          return;
        }
        setStatusText("Server terhubung. Menyiapkan sesi...");

        if (auth.user) {
          await data.preloadForSession(auth.user);
          if (cancelled) {
            return;
          }
          navigate("/dashboard", {
            replace: true,
          });
          return;
        }

        navigate("/login", { replace: true });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorText(error instanceof Error ? error.message : "Tidak dapat menghubungi backend.");
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [auth.restoringSession, auth.user, data, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-background via-surface to-primary-dark">
      <div className="absolute -left-24 top-10 size-72 rounded-full bg-[rgba(56,189,248,0.1)] blur-[90px]" />
      <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-[rgba(37,99,235,0.16)] blur-[110px]" />

      <div className="relative z-[1] flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[460px] rounded-[32px] border border-glass-border-blue bg-[rgba(15,23,42,0.8)] px-8 py-10 text-center shadow-panel backdrop-blur-[22px]">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-[24px] bg-[#101A43] shadow-logo">
            <WisnuBotLogo size={44} />
          </div>

          <h1
            aria-label="WISNU BOT"
            className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[clamp(1.7rem,7vw,2.4rem)] font-black uppercase text-text-primary"
          >
            <span className="tracking-[0.22em] sm:tracking-[0.3em]">WISNU</span>
            <span className="tracking-[0.22em] sm:tracking-[0.3em]">BOT</span>
          </h1>
          <p className="mb-6 text-sm text-text-secondary">{statusText}</p>

          <div className="overflow-hidden rounded-full bg-[rgba(148,163,184,0.12)]">
            <div className="h-2 w-full origin-left animate-pulse-line rounded-full bg-linear-to-r from-primary via-accent to-primary-light" />
          </div>

          {errorText ? <span className="mt-4 block text-sm font-medium text-danger">{errorText}</span> : null}
        </div>
      </div>
    </div>
  );
}
