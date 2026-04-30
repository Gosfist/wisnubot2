import { Save, ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import type { CustomerServiceItemModel } from "../../types/models";

interface CustomerServiceLocationState {
  editId?: number;
}

export function AddCustomerServicePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const auth = useAuth();
  const appData = useAppData();
  const { showToast } = useToast();
  const isOwner = true;
  const basePath = "/customer-service";
  const editIdFromState = (location.state as CustomerServiceLocationState | null)?.editId;
  const editIdFromParams = params.id ? Number(params.id) : undefined;
  const editId =
    typeof editIdFromParams === "number" && Number.isFinite(editIdFromParams)
      ? editIdFromParams
      : editIdFromState;
  const [existingItem, setExistingItem] = useState<CustomerServiceItemModel | null>(null);
  const [commandName, setCommandName] = useState("");
  const [value, setValue] = useState("");
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(editId));

  // --- Menu ordering helpers ---
  const availableCommands = useMemo(() => {
    return appData.customerServiceItems.filter(
      (i) => i.commandName.trim().toLowerCase() !== "welcome",
    );
  }, [appData.customerServiceItems]);

  function moveMenu(index: number, direction: number) {
    const newMenus = [...selectedMenus];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newMenus.length) return;
    const temp = newMenus[index];
    newMenus[index] = newMenus[targetIndex];
    newMenus[targetIndex] = temp;
    setSelectedMenus(newMenus);
  }

  function addMenu() {
    setSelectedMenus([...selectedMenus, ""]);
  }

  function updateMenu(index: number, val: string) {
    const newMenus = [...selectedMenus];
    newMenus[index] = val;
    setSelectedMenus(newMenus);
  }

  function removeMenu(index: number) {
    setSelectedMenus(selectedMenus.filter((_, i) => i !== index));
  }

  const isWelcomeCommand =
    existingItem?.commandName.trim().toLowerCase() === "welcome";

  useEffect(() => {
    if (appData.bots.length > 0) {
      return;
    }
    void appData.refreshBots().catch(() => undefined);
  }, [appData.bots.length]);

  useEffect(() => {
    if (!editId) {
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const items =
          appData.customerServiceItems.length > 0
            ? appData.customerServiceItems
            : await appData.refreshCustomerService();
        if (!mounted) {
          return;
        }

        const nextItem = items.find((item) => item.id === editId) ?? null;
        setExistingItem(nextItem);
        if (nextItem) {
          setCommandName(nextItem.commandName || "");

          let parsedText = nextItem.value;
          let activeMenus: string[] = [];

          if (nextItem.commandName.trim().toLowerCase() === "welcome") {
            try {
              const parsedObj = JSON.parse(nextItem.value);
              if (parsedObj.text !== undefined && Array.isArray(parsedObj.menuList)) {
                parsedText = parsedObj.text;
                activeMenus = parsedObj.menuList;
              }
            } catch (e) {
              parsedText = nextItem.value;
            }
          }

          setValue(parsedText);
          setSelectedMenus(activeMenus);
        } else {
          showToast("Data customer service tidak ditemukan.", "danger");
          navigate(basePath, { replace: true });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [editId, appData.customerServiceItems, basePath, navigate, showToast]);

  async function handleSave() {
    const trimmedCommandName = commandName.trim();
    const trimmedValue = value.trim();

    if (!trimmedCommandName) {
      showToast("Nama perintah wajib diisi.", "danger");
      return;
    }

    if (!trimmedValue) {
      showToast("Value wajib diisi.", "danger");
      return;
    }

    let finalValue = trimmedValue;
    if (isWelcomeCommand) {
      const validMenus = selectedMenus.filter(m => m.trim().length > 0);
      if (validMenus.length > 0) {
        finalValue = JSON.stringify({ text: trimmedValue, menuList: validMenus });
      } else {
        finalValue = JSON.stringify({ text: trimmedValue, menuList: [] });
      }
    }

    setIsSaving(true);
    try {
      if (existingItem) {
        await appData.updateCustomerService(existingItem.id, {
          namaPerintah: trimmedCommandName,
          value: finalValue,
        });
      } else {
        await appData.createCustomerService({
          namaPerintah: trimmedCommandName,
          value: finalValue,
        });
      }

      await appData.refreshCustomerService();
      showToast("Customer service berhasil disimpan.", "success");
      navigate(basePath, { replace: true });
    } catch (nextError) {
      showToast(
        nextError instanceof Error
          ? nextError.message
          : "Gagal menyimpan customer service.",
        "danger",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const isSaveDisabled = isSaving || isLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        title={existingItem ? "Edit Customer Service" : "Tambah Customer Service"}
      />

      <SurfaceCard>
        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center">
            <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">
                Nama Perintah
              </span>
              <input
                className="h-[54px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.4)]"
                type="text"
                value={commandName}
                onChange={(event) => setCommandName(event.target.value.slice(0, 100))}
                placeholder="Masukkan nama perintah"
                disabled={isWelcomeCommand}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">
                Value
              </span>
              <textarea
                className="min-h-[160px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.4)]"
                value={value}
                onChange={(event) => setValue(event.target.value.slice(0, 1000))}
                placeholder="Ketik isi balasan customer service..."
                rows={6}
              />
            </label>

            {isWelcomeCommand && (
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-text-secondary">
                  Konfigurasi List Menu (Manual)
                </span>
                <div className="flex flex-col gap-3 rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-4">
                  {selectedMenus.map((menu, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex flex-col -space-y-1">
                        <button
                          type="button"
                          className="p-1 text-text-secondary hover:text-white disabled:opacity-30 disabled:hover:text-text-secondary transition"
                          disabled={index === 0}
                          onClick={() => moveMenu(index, -1)}
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-text-secondary hover:text-white disabled:opacity-30 disabled:hover:text-text-secondary transition"
                          disabled={index === selectedMenus.length - 1}
                          onClick={() => moveMenu(index, 1)}
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                      <select
                        className="flex-1 min-h-[42px] rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-3 py-2 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.5)]"
                        value={menu}
                        onChange={(e) => updateMenu(index, e.target.value)}
                      >
                        <option value="" disabled>Pilih Fitur / Perintah</option>
                        {availableCommands.map((cmd) => {
                          const isAlreadySelected = selectedMenus.includes(cmd.commandName);
                          // Disable option jika sudah dipilih di menu lain
                          const isDisabled = isAlreadySelected && menu !== cmd.commandName;

                          return (
                            <option
                              key={cmd.id}
                              value={cmd.commandName}
                              disabled={isDisabled}
                            >
                              {cmd.commandName} {isDisabled && "(Sudah Dipilih)"}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        className="p-2 text-[rgba(244,63,94,0.7)] hover:text-danger hover:bg-[rgba(244,63,94,0.1)] rounded-xl transition"
                        onClick={() => removeMenu(index)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}

                  {availableCommands.length === 0 && selectedMenus.length === 0 && (
                    <span className="text-xs text-text-secondary">Belum ada perintah lain untuk bot ini. Buat terlebih dahulu.</span>
                  )}

                  {availableCommands.length > 0 && selectedMenus.length < availableCommands.length && (
                    <button
                      type="button"
                      className="mt-1 flex h-[42px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-[rgba(56,189,248,0.3)] text-sm font-medium text-accent transition hover:bg-[rgba(56,189,248,0.08)] hover:border-[rgba(56,189,248,0.5)]"
                      onClick={addMenu}
                    >
                      <Plus size={16} /> Tambah Urutan Menu
                    </button>
                  )}
                </div>
              </label>
            )}
          </div>
        )}
      </SurfaceCard>

      <button
        className="mx-auto flex w-full max-w-[340px] items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={handleSave}
        disabled={isSaveDisabled}
      >
        <Save size={16} />
        {isSaving ? "MENYIMPAN..." : "SIMPAN"}
      </button>
    </div>
  );
}
