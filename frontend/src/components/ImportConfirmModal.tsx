import { FileSpreadsheet } from "lucide-react";
import { Modal } from "./Modal";

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

export function ImportConfirmModal({
  file,
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} title="Konfirmasi Import" onClose={loading ? () => undefined : onCancel}>
      <div className="space-y-5">
        <div className="flex items-start gap-4 rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.64)] p-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[rgba(56,189,248,0.12)] text-accent">
            <FileSpreadsheet size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">File yang dipilih</p>
            <p className="mt-1 truncate text-sm text-text-secondary" title={file?.name ?? ""}>
              {file?.name ?? "-"}
            </p>
            <p className="mt-1 text-xs text-text-muted">{file ? formatFileSize(file.size) : "-"}</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary">
          Pastikan file Excel yang dipilih sudah benar sebelum data dimasukkan ke sistem.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-[14px] border border-[rgba(148,163,184,0.2)] bg-[rgba(15,23,42,0.64)] px-4 py-3 text-sm font-bold text-text-secondary transition hover:bg-[rgba(148,163,184,0.1)] disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-[14px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            type="button"
            disabled={loading || !file}
            onClick={onConfirm}
          >
            {loading ? "Mengimport..." : "Ya, Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
