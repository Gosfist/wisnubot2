import { Save, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type {
  CsButtonModel,
  CsButtonType,
  CsDeliveryMode,
  CustomerServiceItemModel,
} from "../../types/models";

interface CustomerServiceLocationState {
  editId?: number;
}

const DELIVERY_OPTIONS: { value: CsDeliveryMode; label: string; desc: string }[] = [
  { value: "none", label: "Tidak ada", desc: "Hanya kirim balasan teks/menu." },
  { value: "stock", label: "Pakai Stock", desc: "Setelah dibayar, bot kirim 1 item dari stock." },
  { value: "relay", label: "Forward ke Owner", desc: "Setelah dibayar, customer kirim data, lalu diteruskan ke owner." },
];

const BUTTON_TYPE_OPTIONS: { value: CsButtonType; label: string }[] = [
  { value: "link", label: "Menu (link ke perintah)" },
  { value: "buy", label: "Beli (payment Pakasir)" },
  { value: "reply", label: "Reply (kirim teks)" },
];

function makeEmptyButton(): CsButtonModel {
  return {
    label: "",
    buttonType: "link",
    targetCommand: "",
    targetUrl: null,
    replyText: null,
    price: null,
    activeDurationDays: null,
    warrantyDurationDays: null,
    orderIndex: 0,
  };
}

function displayCommand(name: string): string {
  if (!name) return "";
  return name.startsWith("/") ? name : `/${name}`;
}

function stripPrefix(name: string): string {
  return name.replace(/^\/+/, "").trim().toLowerCase();
}

export function AddCustomerServicePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const appData = useAppData();
  const { showToast } = useToast();

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
  const [deliveryMode, setDeliveryMode] = useState<CsDeliveryMode>("none");
  const [relayPrompt, setRelayPrompt] = useState("");
  const [relayWaitingText, setRelayWaitingText] = useState("");
  const [relayOwnerInstruction, setRelayOwnerInstruction] = useState("");
  const [relayDoneText, setRelayDoneText] = useState("");
  const [buttons, setButtons] = useState<CsButtonModel[]>([]);
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]); // legacy welcome menu list
  const [draggingMenuIndex, setDraggingMenuIndex] = useState<number | null>(null);
  const [draggingButtonIndex, setDraggingButtonIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(editId));

  const isWelcomeCommand =
    existingItem?.commandName.trim().toLowerCase() === "welcome";
  const isStartCommand =
    existingItem?.commandName.trim().toLowerCase() === "start";
  const isDefaultCommand = isWelcomeCommand || isStartCommand;

  const availableCommands = useMemo(() => {
    return appData.customerServiceItems.filter(
      (i) => !["welcome", "start"].includes(i.commandName.trim().toLowerCase()),
    );
  }, [appData.customerServiceItems]);

  // -------- legacy welcome menu list helpers --------
  function moveMenuByDrag(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= selectedMenus.length || toIndex >= selectedMenus.length) return;
    const next = [...selectedMenus];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setSelectedMenus(next);
    setDraggingMenuIndex(toIndex);
  }

  function handleMenuDragStart(index: number, event: React.DragEvent<HTMLButtonElement>) {
    setDraggingMenuIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handleMenuDragOver(index: number, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggingMenuIndex !== null && draggingMenuIndex !== index) {
      moveMenuByDrag(draggingMenuIndex, index);
    }
  }

  function addMenu() {
    setSelectedMenus([...selectedMenus, ""]);
  }
  function updateMenu(index: number, val: string) {
    const next = [...selectedMenus];
    next[index] = val;
    setSelectedMenus(next);
  }
  function removeMenu(index: number) {
    setSelectedMenus(selectedMenus.filter((_, i) => i !== index));
  }

  // -------- button builder helpers --------
  function addButton() {
    setButtons([...buttons, { ...makeEmptyButton(), orderIndex: buttons.length }]);
  }
  function updateButton(index: number, patch: Partial<CsButtonModel>) {
    const next = buttons.map((b, i) => (i === index ? { ...b, ...patch } : b));
    setButtons(next);
  }
  function removeButton(index: number) {
    setButtons(buttons.filter((_, i) => i !== index).map((b, i) => ({ ...b, orderIndex: i })));
  }
  function moveButtonByDrag(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= buttons.length || toIndex >= buttons.length) return;
    const next = [...buttons];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setButtons(next.map((b, i) => ({ ...b, orderIndex: i })));
    setDraggingButtonIndex(toIndex);
  }

  function handleButtonDragStart(index: number, event: React.DragEvent<HTMLButtonElement>) {
    setDraggingButtonIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handleButtonDragOver(index: number, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggingButtonIndex !== null && draggingButtonIndex !== index) {
      moveButtonByDrag(draggingButtonIndex, index);
    }
  }

  const hasBuyButton = useMemo(
    () => buttons.some((b) => b.buttonType === "buy"),
    [buttons],
  );

  // -------- preload bots & data --------
  useEffect(() => {
    if (appData.bots.length === 0) {
      void appData.refreshBots().catch(() => undefined);
    }
  }, [appData.bots.length]);

  useEffect(() => {
    if (!editId) return;
    let mounted = true;
    (async () => {
      try {
        const items =
          appData.customerServiceItems.length > 0
            ? appData.customerServiceItems
            : await appData.refreshCustomerService();
        if (!mounted) return;
        const next = items.find((i) => i.id === editId) ?? null;
        setExistingItem(next);
        if (next) {
          setCommandName(next.commandName || "");
          setDeliveryMode(next.deliveryMode);
          setRelayPrompt(next.relayPrompt ?? "");
          setRelayWaitingText(next.relayWaitingText ?? "");
          setRelayOwnerInstruction(next.relayOwnerInstruction ?? "");
          setRelayDoneText(next.relayDoneText ?? "");
          setButtons(
            next.buttons.map((b, i) => ({
              ...b,
              price: b.price ?? (b.buttonType === "buy" ? next.price : null),
              orderIndex: i,
            })),
          );

          let parsedText = next.value;
          let activeMenus: string[] = [];
          if (next.commandName.trim().toLowerCase() === "start") {
            try {
              const parsedObj = JSON.parse(next.value);
              if (parsedObj.text !== undefined && Array.isArray(parsedObj.menuList)) {
                parsedText = parsedObj.text;
                activeMenus = parsedObj.menuList;
              }
            } catch {
              parsedText = next.value;
            }
          }
          setValue(parsedText);
          setSelectedMenus(activeMenus);
        } else {
          showToast("Data customer service tidak ditemukan.", "danger");
          navigate(basePath, { replace: true });
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [editId, appData.customerServiceItems, basePath, navigate, showToast]);

  function validateButtons(): string | null {
    for (const [i, b] of buttons.entries()) {
      const label = b.label.trim();
      if (!label) return `Button #${i + 1}: label wajib diisi`;
      if (b.buttonType === "link" && !b.targetCommand?.trim()) {
        return `Button "${label}": pilih target command`;
      }
      if (b.buttonType === "reply" && !b.replyText?.trim()) {
        return `Button "${label}": isi teks balasan`;
      }
      if (b.buttonType === "buy") {
        const priceNum = Number(b.price ?? 0);
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
          return `Button "${label}": harga wajib diisi lebih dari 0`;
        }
        for (const [fieldLabel, fieldValue] of [
          ["masa aktif", b.activeDurationDays],
          ["masa garansi", b.warrantyDurationDays],
        ] as const) {
          if (fieldValue === null || fieldValue === undefined) continue;
          const duration = Number(fieldValue);
          if (!Number.isFinite(duration) || duration <= 0) {
            return `Button "${label}": ${fieldLabel} wajib lebih dari 0 hari`;
          }
        }
      }
    }
    return null;
  }

  async function handleSave() {
    const trimmedCommand = stripPrefix(commandName);
    const trimmedValue = value.trim();

    if (!trimmedCommand) {
      showToast("Nama perintah wajib diisi.", "danger");
      return;
    }
    if (!trimmedValue) {
      showToast("Value wajib diisi.", "danger");
      return;
    }

    const buttonError = validateButtons();
    if (buttonError) {
      showToast(buttonError, "danger");
      return;
    }

    if (hasBuyButton) {
      let settings;
      try {
        settings = await appData.fetchSettings();
      } catch {
        showToast("Gagal mengecek setting Pakasir.", "danger");
        return;
      }

      if (!settings.pakasirSlug.trim() || !settings.hasApiKey) {
        showToast(
          "Slug dan API key Pakasir belum diisi, silakan isi terlebih dahulu di Settings.",
          "danger",
        );
        return;
      }

    }

    if (deliveryMode === "relay" && !relayPrompt.trim()) {
      showToast("Prompt untuk customer wajib diisi pada mode Forward ke Owner.", "danger");
      return;
    }
    if (deliveryMode === "relay" && !relayWaitingText.trim()) {
      showToast("Pesan setelah data diteruskan ke owner wajib diisi.", "danger");
      return;
    }
    if (deliveryMode === "relay" && !relayDoneText.trim()) {
      showToast("Pesan customer saat owner reply done wajib diisi.", "danger");
      return;
    }

    let finalValue = trimmedValue;
    if (isStartCommand) {
      const validMenus = selectedMenus.filter((m) => m.trim().length > 0);
      finalValue = JSON.stringify({ text: trimmedValue, menuList: validMenus });
    }

    const payload = {
      namaPerintah: trimmedCommand,
      value: finalValue,
      deliveryMode,
      price: null,
      relayPrompt: deliveryMode === "relay" ? relayPrompt.trim() : null,
      relayWaitingText: deliveryMode === "relay" ? relayWaitingText.trim() : null,
      relayOwnerInstruction: deliveryMode === "relay" ? relayOwnerInstruction.trim() : null,
      relayDoneText: deliveryMode === "relay" ? relayDoneText.trim() : null,
    };

    setIsSaving(true);
    try {
      let csId: number | null = existingItem?.id ?? null;
      if (existingItem) {
        await appData.updateCustomerService(existingItem.id, payload);
      } else {
        const created = await appData.createCustomerService(payload);
        csId = created.id;
      }

      if (csId) {
        await appData.saveCsButtons(
          csId,
          buttons.map((b, i) => ({
            ...b,
            label: b.label.trim(),
            targetCommand: b.buttonType === "link" ? stripPrefix(b.targetCommand ?? "") : null,
            targetUrl: null,
            replyText: b.buttonType === "reply" ? b.replyText?.trim() ?? null : null,
            price: b.buttonType === "buy" ? Number(b.price) : null,
            activeDurationDays: b.buttonType === "buy" ? b.activeDurationDays : null,
            warrantyDurationDays: b.buttonType === "buy" ? b.warrantyDurationDays : null,
            orderIndex: i,
          })),
        );
      }

      showToast("Customer service berhasil disimpan.", "success");
      navigate(basePath, { replace: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Gagal menyimpan customer service.",
        "danger",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const inputBase =
    "h-[54px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.4)]";
  const cardInner =
    "flex flex-col gap-3 rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-4";

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
            {/* Nama Perintah */}
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Nama Perintah</span>
              <div className="flex items-center gap-2">
                <span className="rounded-[14px] bg-[rgba(56,189,248,0.12)] px-3 py-3 text-sm font-bold text-accent">
                  /
                </span>
                <input
                  className={inputBase + " flex-1"}
                  type="text"
                  value={isDefaultCommand ? commandName : commandName.replace(/^\/+/, "")}
                  onChange={(e) => setCommandName(e.target.value.replace(/^\/+/, "").slice(0, 100))}
                  placeholder="contoh: menu, harga, akun-netflix"
                  disabled={isDefaultCommand}
                />
              </div>
              {isDefaultCommand && (
                <span className="text-xs text-text-secondary">
                  Perintah <code>/{commandName}</code> default dan tidak bisa diubah/dihapus.
                </span>
              )}
            </label>

            {/* Value */}
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">
                {isWelcomeCommand
                  ? "Pesan Welcome"
                  : isStartCommand
                    ? "Pesan Start"
                    : "Pesan Balasan"}
              </span>
              <textarea
                className="min-h-[160px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.4)]"
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, 1500))}
                placeholder="Ketik isi balasan customer service..."
                rows={6}
              />
            </label>

            {/* Welcome legacy menu (kept for backward compatibility) */}
            {isStartCommand && (
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-text-secondary">
                  List Menu
                </span>
                <div className={cardInner}>
                  {selectedMenus.map((menu, index) => (
                    <div
                      key={index}
                      className={
                        "grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2 rounded-[12px] border p-2 transition " +
                        (draggingMenuIndex === index
                          ? "border-[rgba(56,189,248,0.48)] bg-[rgba(56,189,248,0.08)]"
                          : "border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.36)]")
                      }
                      onDragOver={(event) => handleMenuDragOver(index, event)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDraggingMenuIndex(null);
                      }}
                    >
                      <button
                        type="button"
                        draggable={selectedMenus.length > 1}
                        onDragStart={(event) => handleMenuDragStart(index, event)}
                        onDragEnd={() => setDraggingMenuIndex(null)}
                        className="flex h-[46px] w-[40px] cursor-grab items-center justify-center rounded-[12px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.52)] text-text-secondary transition hover:border-[rgba(56,189,248,0.32)] hover:text-white active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Geser urutan menu"
                        title="Tahan lalu geser untuk mengubah urutan"
                        disabled={selectedMenus.length <= 1}
                      >
                        <GripVertical size={18} />
                      </button>
                      <select
                        className="min-h-[54px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                        value={menu}
                        onChange={(e) => updateMenu(index, e.target.value)}
                      >
                        <option value="" disabled>Pilih Perintah</option>
                        {availableCommands.map((cmd) => {
                          const already = selectedMenus.includes(cmd.commandName);
                          const disabled = already && menu !== cmd.commandName;
                          return (
                            <option key={cmd.id} value={cmd.commandName} disabled={disabled}>
                              /{cmd.commandName} {disabled && "(sudah dipilih)"}
                            </option>
                          );
                        })}
                      </select>
                      <button type="button" onClick={() => removeMenu(index)} className="flex h-[42px] w-[40px] items-center justify-center rounded-xl text-[rgba(244,63,94,0.7)] hover:bg-[rgba(244,63,94,0.1)] hover:text-danger" aria-label="Hapus menu">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {availableCommands.length > 0 && selectedMenus.length < availableCommands.length && (
                    <button type="button" onClick={addMenu} className="mt-1 flex h-[42px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-[rgba(56,189,248,0.3)] text-sm font-medium text-accent hover:bg-[rgba(56,189,248,0.08)]">
                      <Plus size={16} /> Tambah Urutan Menu
                    </button>
                  )}
                </div>
              </label>
            )}

            {/* Buttons builder */}
            {!isDefaultCommand && (
              <div className="space-y-2">
                <span className="text-sm font-semibold text-text-secondary">Button (opsional)</span>
                <div className={cardInner}>
                  {buttons.length === 0 && (
                    <span className="text-xs text-text-secondary">
                      Belum ada button. Tambahkan jika ingin pesan ini punya tombol interaktif.
                    </span>
                  )}
                  {buttons.map((b, index) => (
                    <div
                      key={index}
                      className={
                        "rounded-[12px] border p-3 space-y-2 transition " +
                        (draggingButtonIndex === index
                          ? "border-[rgba(56,189,248,0.48)] bg-[rgba(56,189,248,0.08)]"
                          : "border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.5)]")
                      }
                      onDragOver={(event) => handleButtonDragOver(index, event)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDraggingButtonIndex(null);
                      }}
                    >
                      <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-start gap-3">
                        <button
                          type="button"
                          draggable={buttons.length > 1}
                          onDragStart={(event) => handleButtonDragStart(index, event)}
                          onDragEnd={() => setDraggingButtonIndex(null)}
                          className="mt-[18px] flex h-[54px] w-[40px] cursor-grab items-center justify-center rounded-[12px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.52)] text-text-secondary transition hover:border-[rgba(56,189,248,0.32)] hover:text-white active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Geser urutan button"
                          title="Tahan lalu geser untuk mengubah urutan"
                          disabled={buttons.length <= 1}
                        >
                          <GripVertical size={18} />
                        </button>
                        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(320px,360px)]">
                          <label className="grid min-w-0 gap-2">
                            <span className="block h-4 text-xs font-semibold leading-4 text-text-secondary">Label Button</span>
                            <input
                              className="min-h-[58px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                              placeholder="contoh: Halo"
                              value={b.label}
                              onChange={(e) => updateButton(index, { label: e.target.value.slice(0, 60) })}
                            />
                          </label>
                          <label className="grid min-w-0 gap-2">
                            <span className="block h-4 text-xs font-semibold leading-4 text-text-secondary">Tipe Button</span>
                            <select
                              className="min-h-[58px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                              value={b.buttonType}
                              onChange={(e) => updateButton(index, { buttonType: e.target.value as CsButtonType })}
                            >
                              {BUTTON_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <button type="button" onClick={() => removeButton(index)} className="mt-[26px] flex h-[42px] w-[40px] items-center justify-center rounded-xl text-[rgba(244,63,94,0.7)] hover:bg-[rgba(244,63,94,0.1)] hover:text-danger" aria-label="Hapus button">
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {b.buttonType === "link" && (
                        <select
                          className="min-h-[58px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                          value={b.targetCommand ?? ""}
                          onChange={(e) => updateButton(index, { targetCommand: e.target.value })}
                        >
                          <option value="" disabled>Pilih target perintah</option>
                          {availableCommands
                            .filter((cmd) => !existingItem || cmd.id !== existingItem.id)
                            .map((cmd) => (
                              <option key={cmd.id} value={cmd.commandName}>/{cmd.commandName}</option>
                            ))}
                        </select>
                      )}

                      {b.buttonType === "reply" && (
                        <textarea
                          className="min-h-[86px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                          placeholder="Teks yang akan dikirim saat button ditekan"
                          rows={2}
                          value={b.replyText ?? ""}
                          onChange={(e) => updateButton(index, { replyText: e.target.value })}
                        />
                      )}

                      {b.buttonType === "buy" && (
                        <div className="grid gap-2">
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="grid min-w-0 gap-2">
                              <span className="block h-4 text-xs font-semibold leading-4 text-text-secondary">Harga Button (Rp)</span>
                              <input
                                className="min-h-[58px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                                type="number"
                                min={1}
                                value={b.price ?? ""}
                                onChange={(e) =>
                                  updateButton(index, {
                                    price: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="contoh: 25000"
                              />
                            </label>
                            <label className="grid min-w-0 gap-2">
                              <span className="block h-4 text-xs font-semibold leading-4 text-text-secondary">Masa Aktif (hari)</span>
                              <input
                                className="min-h-[58px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                                type="number"
                                min={1}
                                value={b.activeDurationDays ?? ""}
                                onChange={(e) =>
                                  updateButton(index, {
                                    activeDurationDays: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="30"
                              />
                            </label>
                            <label className="grid min-w-0 gap-2">
                              <span className="block h-4 text-xs font-semibold leading-4 text-text-secondary">Masa Garansi (hari)</span>
                              <input
                                className="min-h-[58px] w-full rounded-[12px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[rgba(56,189,248,0.5)]"
                                type="number"
                                min={1}
                                value={b.warrantyDurationDays ?? ""}
                                onChange={(e) =>
                                  updateButton(index, {
                                    warrantyDurationDays: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="7"
                              />
                            </label>
                          </div>
                          <span className="block text-xs text-text-secondary">
                            Untuk 1 bulan isi 30 hari. Jika done tanggal 1, exp 30 hari jatuh pada tanggal 30.
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addButton} className="mt-1 flex min-h-[54px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-[rgba(56,189,248,0.3)] px-4 py-3 text-sm font-medium leading-6 text-accent hover:bg-[rgba(56,189,248,0.08)]">
                    <Plus size={16} /> Tambah Button
                  </button>
                </div>
              </div>
            )}

            {/* Delivery mode (when buy button exists) */}
            {!isDefaultCommand && hasBuyButton && (
              <>
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-text-secondary">Mode Pengiriman Setelah Bayar</span>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {DELIVERY_OPTIONS.map((opt) => {
                      const active = deliveryMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDeliveryMode(opt.value)}
                          className={
                            "rounded-[14px] border px-3 py-3 text-left text-xs transition " +
                            (active
                              ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-white"
                              : "border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.5)] text-text-secondary hover:border-[rgba(56,189,248,0.3)]")
                          }
                        >
                          <div className="font-bold">{opt.label}</div>
                          <div className="mt-1 text-[11px] opacity-80">{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {deliveryMode === "relay" && (
                  <div className="space-y-3">
                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-text-secondary">Prompt ke Customer Setelah Bayar</span>
                      <textarea
                        className="min-h-[100px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none focus:border-[rgba(56,189,248,0.4)]"
                        value={relayPrompt}
                        onChange={(e) => setRelayPrompt(e.target.value.slice(0, 500))}
                        placeholder="contoh: Silakan kirim email yang akan diisi"
                        rows={3}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-text-secondary">Pesan Setelah Data Diteruskan ke Owner</span>
                      <textarea
                        className="min-h-[92px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none focus:border-[rgba(56,189,248,0.4)]"
                        value={relayWaitingText}
                        onChange={(e) => setRelayWaitingText(e.target.value.slice(0, 500))}
                        placeholder="contoh: Data sudah diterima dan diteruskan ke owner. Mohon tunggu konfirmasi."
                        rows={3}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-text-secondary">Instruksi ke Owner</span>
                      <textarea
                        className="min-h-[92px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none focus:border-[rgba(56,189,248,0.4)]"
                        value={relayOwnerInstruction}
                        onChange={(e) => setRelayOwnerInstruction(e.target.value.slice(0, 500))}
                        placeholder="contoh: Reply pesan ini dengan jawaban done jika selesai."
                        rows={3}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-text-secondary">Text Customer Saat Owner Reply Done</span>
                      <textarea
                        className="min-h-[92px] w-full rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm text-white outline-none focus:border-[rgba(56,189,248,0.4)]"
                        value={relayDoneText}
                        onChange={(e) => setRelayDoneText(e.target.value.slice(0, 500))}
                        placeholder="contoh: Silakan cek Gmail, pesanan sudah selesai."
                        rows={3}
                      />
                    </label>
                  </div>
                )}

                {deliveryMode === "stock" && existingItem && (
                  <span className="block text-xs text-text-secondary">
                    Kelola stock di halaman <strong>Stock</strong> di sidebar.
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </SurfaceCard>

      <button
        className="mx-auto flex w-full max-w-[340px] items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={handleSave}
        disabled={isSaving || isLoading}
      >
        <Save size={16} />
        {isSaving ? "MENYIMPAN..." : "SIMPAN"}
      </button>

      <p className="text-center text-xs text-text-secondary">
        Preview: {displayCommand(commandName) || "/perintah"}
      </p>
    </div>
  );
}
