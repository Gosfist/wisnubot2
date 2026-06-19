import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useAppData } from "../hooks/useAppData";
import { useToast } from "../hooks/useToast";
import { socketService } from "../lib/socket";
import { Modal } from "./Modal";

type OwnerBotPurpose = "otp" | "broadcast" | "push_contact" | "default";

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("62")) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length > 1) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith("8")) {
    return `62${digits}`;
  }
  return digits;
}

export function OwnerBotConnectModal({
  open,
  purpose,
  title,
  onClose,
  onConnected,
}: {
  open: boolean;
  purpose: OwnerBotPurpose;
  title: string;
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const appData = useAppData();
  const { showToast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingSessionName, setPendingSessionName] = useState("");
  const pendingSessionRef = useRef("");

  useEffect(() => {
    if (!open) {
      return;
    }

    socketService.connect().catch(() => undefined);

    const unsubscribeStatus = socketService.onBotStatus(async (payload) => {
      const status = String(payload.status ?? "");
      const reason = String(payload.reason ?? "");

      if (status === "online") {
        setIsConnected(true);
        setIsLoading(false);
        setPendingSessionName("");
        pendingSessionRef.current = "";
        await onConnected();
        window.setTimeout(() => {
          void handleClose();
        }, 1200);
        return;
      }

      if (status !== "offline") {
        return;
      }

      setIsLoading(false);
      setPendingSessionName("");
      pendingSessionRef.current = "";
      setQrCode("");

      if (reason === "phone_mismatch") {
        showToast("Nomor yang dimasukkan tidak sesuai. Session dihapus, silakan coba lagi.", "danger");
        return;
      }

      if (reason === "logged_out") {
        return;
      }

      if (reason === "qr_timeout" || reason === "offline_removed") {
        const message =
          reason === "qr_timeout"
            ? "Barcode kedaluwarsa dan session sudah dihapus. Silakan connect lagi."
            : "Bot offline, session dan data bot sudah dihapus. Silakan start lagi.";
        showToast(message, "danger");
      }
    });

    const unsubscribeQr = socketService.onQr((qr) => {
      setQrCode(qr);
      setIsLoading(false);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeQr();
    };
  }, [open, onConnected, showToast]);

  function resetState() {
    setPhoneNumber("");
    setPhoneError("");
    setQrCode("");
    setIsConnected(false);
    setIsLoading(false);
    setPendingSessionName("");
    pendingSessionRef.current = "";
  }

  async function cleanupPendingPairing() {
    const sessionName = pendingSessionRef.current;
    if (!sessionName || isConnected) {
      return;
    }

    pendingSessionRef.current = "";
    setPendingSessionName("");
    try {
      await appData.cancelPendingBot(sessionName);
    } catch {
      // Best effort cleanup while closing.
    }
  }

  async function handleClose() {
    await cleanupPendingPairing();
    resetState();
    onClose();
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePageHide = () => {
      const sessionName = pendingSessionRef.current;
      if (!sessionName || isConnected) {
        return;
      }
      void appData.cancelPendingBot(sessionName).catch(() => undefined);
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      void cleanupPendingPairing();
    };
  }, [appData, isConnected, open]);

  async function handleStart() {
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    let hasError = false;
    if (!normalizedPhoneNumber) {
      setPhoneError("No WA Bot wajib diisi");
      hasError = true;
    } else {
      setPhoneError("");
    }
    if (hasError) return;

    setIsLoading(true);
    setIsConnected(false);
    setQrCode("");

    try {
      if (pendingSessionRef.current) {
        await appData.cancelPendingBot(pendingSessionRef.current);
        pendingSessionRef.current = "";
        setPendingSessionName("");
      }

      const result = await appData.connectBot({
        purpose,
        phoneNumber: normalizedPhoneNumber,
        pairingMethod: "qr",
      });

      const nextSessionName = String(result.sessionName ?? "");
      setPendingSessionName(nextSessionName);
      pendingSessionRef.current = nextSessionName;
    } catch (error) {
      setIsLoading(false);
      showToast(error instanceof Error ? error.message : "Gagal membuat barcode.", "danger");
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => void handleClose()}
      closeButtonVariant="icon"
    >
      <div className="space-y-5">


        {isConnected ? (
          <div className="flex justify-center py-3">
            <div className="flex size-[220px] items-center justify-center rounded-[28px] bg-[rgba(34,197,94,0.12)] text-success">
              <CheckCircle2 size={88} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">No WA Bot</span>
              <input
                className={`h-[54px] w-full rounded-[18px] border px-4 text-sm leading-none text-white outline-none transition focus:border-[rgba(56,189,248,0.4)] bg-[rgba(15,23,42,0.72)] ${phoneError ? "border-[rgba(239,68,68,0.6)]" : "border-[rgba(56,189,248,0.16)]"
                  }`}
                type="text"
                inputMode="numeric"
                placeholder="Contoh: 6285849177593"
                value={phoneNumber}
                onChange={(event) => { setPhoneNumber(event.target.value); setPhoneError(""); }}
                disabled={isLoading}
              />
              {phoneError ? <p className="text-xs text-danger">{phoneError}</p> : null}
            </label>


            <div className="space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Barcode</span>
              <div className="grid min-h-[250px] place-items-center rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] p-5">
                {qrCode ? (
                  <div className="rounded-[18px] bg-white p-4">
                    <QRCodeCanvas value={qrCode} size={210} includeMargin={false} />
                  </div>
                ) : (
                  <div className="text-center text-sm text-text-secondary">
                    {isLoading ? "Menyiapkan barcode..." : "Masukkan nomor lalu klik Connect untuk menampilkan barcode."}
                  </div>
                )}
              </div>
            </div>

            <button
              className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={handleStart}
              disabled={isLoading}
            >
              {isLoading ? "MENYIAPKAN..." : qrCode ? "REFRESH BARCODE" : "CONNECT"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
