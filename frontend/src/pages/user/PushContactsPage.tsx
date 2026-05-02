import { Edit2, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { PushContactRunModel, PushContactTemplateModel } from "../../types/models";

export function PushContactsPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<PushContactTemplateModel[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PushContactTemplateModel | null>(null);
  const [title, setTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runningRun, setRunningRun] = useState<PushContactRunModel | null>(null);

  const activeGroups = useMemo(
    () => appData.groups.filter((group) => group.isActive),
    [appData.groups],
  );
  const pushStillRunning = Boolean(runningRun) || isRunning;

  async function refreshPushStatus() {
    const status = await appData.fetchPushStatus();
    setRunningRun(status.isRunning ? status.running : null);
    return status;
  }

  async function loadData() {
    setIsLoading(true);
    try {
      const [nextTemplates, nextGroups, pushStatus] = await Promise.all([
        appData.fetchPushTemplates(),
        appData.groups.length ? Promise.resolve(appData.groups) : appData.refreshGroups(),
        appData.fetchPushStatus(),
      ]);
      setTemplates(nextTemplates);
      setRunningRun(pushStatus.isRunning ? pushStatus.running : null);
      if (selectedGroupId && !nextGroups.some((group) => group.id === selectedGroupId && group.isActive)) {
        setSelectedGroupId("");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal memuat push kontak.", "danger");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshPushStatus().catch(() => undefined);
    }, runningRun ? 5000 : 10000);
    return () => window.clearInterval(intervalId);
  }, [runningRun?.id]);

  function openCreateModal() {
    setEditingTemplate(null);
    setTitle("");
    setMessageText("");
    setTemplateModalOpen(true);
  }

  function openEditModal(template: PushContactTemplateModel) {
    setEditingTemplate(template);
    setTitle(template.title);
    setMessageText(template.messageText);
    setTemplateModalOpen(true);
  }

  async function handleSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !messageText.trim()) {
      showToast("Nama dan text template wajib diisi.", "danger");
      return;
    }
    setIsSaving(true);
    try {
      if (editingTemplate) {
        await appData.updatePushTemplate(editingTemplate.id, {
          title: title.trim(),
          messageText: messageText.trim(),
        });
        showToast("Template berhasil diperbarui.", "success");
      } else {
        await appData.createPushTemplate({ title: title.trim(), messageText: messageText.trim() });
        showToast("Template berhasil ditambahkan.", "success");
      }
      const nextTemplates = await appData.fetchPushTemplates();
      setTemplates(nextTemplates);
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      setTitle("");
      setMessageText("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menyimpan template.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteTemplate(templateId: number) {
    if (!window.confirm("Hapus template ini?")) return;
    try {
      const message = await appData.deletePushTemplate(templateId);
      const nextTemplates = await appData.fetchPushTemplates();
      setTemplates(nextTemplates);
      if (selectedTemplateId === String(templateId)) setSelectedTemplateId("");
      showToast(message, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menghapus template.", "danger");
    }
  }

  async function handleRunPush(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const templateId = Number(selectedTemplateId);
    const groupId = Number(selectedGroupId);
    if (runningRun) {
      showToast("Push kontak masih berjalan. Tunggu sampai selesai.", "danger");
      return;
    }
    if (!templateId || !groupId) {
      showToast("Pilih template dan group aktif dulu.", "danger");
      return;
    }
    setIsRunning(true);
    try {
      const result = await appData.startPushContact({ templateId, groupId });
      setRunningRun(result.isRunning ? result.running : null);
      showToast(result.message, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menjalankan push kontak.", "danger");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Push Kontak"
        actions={
          <button
            className="inline-flex w-auto items-center justify-center gap-2 rounded-[16px] bg-linear-to-r from-primary to-accent px-4 py-2.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={openCreateModal}
          >
            <Plus size={16} />
            Template
          </button>
        }
      />

      <SurfaceCard>
        <form className="space-y-4" onSubmit={handleRunPush}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">TEMPLATE</span>
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                <option value="">Pilih template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.title}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">GROUP AKTIF</span>
              <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                <option value="">Pilih group aktif</option>
                {activeGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </label>
          </div>
          {activeGroups.length === 0 ? (
            <div className="rounded-[14px] border border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.08)] px-4 py-3 text-sm text-warning">
              Tidak ada group aktif. Aktifkan group dulu di Kelola Group.
            </div>
          ) : null}
          {runningRun ? (
            <div className="rounded-[14px] border border-[rgba(56,189,248,0.22)] bg-[rgba(56,189,248,0.08)] px-4 py-3 text-sm text-text-secondary">
              Push kontak masih berjalan:{" "}
              <span className="font-bold text-white">
                {runningRun.successCount + runningRun.failedCount}/{runningRun.totalTargets}
              </span>{" "}
              nomor sudah diproses. Tunggu sampai selesai sebelum menjalankan lagi.
            </div>
          ) : null}
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow disabled:opacity-60"
            type="submit"
            disabled={pushStillRunning || isLoading || activeGroups.length === 0}
          >
            <Play size={16} />
            {pushStillRunning ? "PUSH KONTAK MASIH BERJALAN..." : "JALANKAN PUSH KONTAK"}
          </button>
          <p className="text-xs text-text-secondary">
            Delay antar member dibuat acak 30-60 detik. Admin group dan nomor pengecualian tidak akan dikirim.
          </p>
        </form>
      </SurfaceCard>

      <SurfaceCard>
        <h3 className="mb-4 text-lg font-bold">Template Tersimpan</h3>
        {templates.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-secondary">Belum ada template.</div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <article
                key={template.id}
                className="flex items-start justify-between gap-3 rounded-[16px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.58)] px-4 py-3"
              >
                <div className="min-w-0">
                  <h4 className="font-bold text-white">{template.title}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{template.messageText}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className="rounded-xl p-2 text-accent hover:bg-[rgba(56,189,248,0.1)]"
                    type="button"
                    onClick={() => openEditModal(template)}
                    aria-label="Edit template"
                    title="Edit template"
                  >
                    <Edit2 size={17} />
                  </button>
                  <button
                    className="rounded-xl p-2 text-danger hover:bg-[rgba(244,63,94,0.1)]"
                    type="button"
                    onClick={() => void handleDeleteTemplate(template.id)}
                    aria-label="Hapus template"
                    title="Hapus template"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfaceCard>

      <Modal
        open={templateModalOpen}
        title={editingTemplate ? "Edit Template" : "Tambah Template Text"}
        onClose={() => setTemplateModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSaveTemplate}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nama template"
          />
          <textarea
            className="min-h-[160px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none focus:border-[rgba(56,189,248,0.4)]"
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Text yang akan dikirim ke anggota group"
          />
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            <Plus size={16} />
            {isSaving ? "MENYIMPAN..." : editingTemplate ? "SIMPAN PERUBAHAN" : "TAMBAH TEMPLATE"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
