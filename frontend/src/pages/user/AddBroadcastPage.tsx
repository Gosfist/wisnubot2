import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ImageIcon, Plus, Save, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { cn } from "../../lib/cn";
import { appConfig } from "../../lib/config";
import type { BroadcastModel } from "../../types/models";

const TIME_ITEM_HEIGHT = 56;

interface LocationState {
  editData?: BroadcastModel;
}

type TargetMode = "all" | "selected" | "all_except";

function normalizeDay(day: string) {
  return day
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f']/g, "");
}

function resolveImagePreviewUrl(imageUrl: string | null) {
  if (!imageUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(imageUrl) || imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  const normalizedPath = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
  return `${appConfig.socketBaseUrl}${normalizedPath}`;
}

export function AddBroadcastPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const appData = useAppData();
  const auth = useAuth();
  const { showToast } = useToast();

  const editData = (location.state as LocationState | null)?.editData;
  const isOwner = true;

  const [title, setTitle] = useState(editData?.title ?? "");
  const [messageText, setMessageText] = useState(editData?.messageText ?? "");
  const [targetMode, setTargetMode] = useState<TargetMode>(
    editData?.targetGroupIds.length
      ? "selected"
      : editData?.targetExcludedGroupIds?.length
        ? "all_except"
        : "all",
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(editData?.targetGroupIds ?? []);
  const [excludedGroupIds, setExcludedGroupIds] = useState<number[]>(editData?.targetExcludedGroupIds ?? []);
  const [selectedBotIds, setSelectedBotIds] = useState<number[]>(editData?.targetBotIds ?? []);
  const [times, setTimes] = useState<string[]>([...(editData?.scheduleTimes ?? [])].sort());
  const [draftHour, setDraftHour] = useState(0);
  const [draftMinute, setDraftMinute] = useState(0);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    resolveImagePreviewUrl(editData?.imageUrl ?? null),
  );
  const [removeImage, setRemoveImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(!appData.groups.length);
  const [isLoadingBots, setIsLoadingBots] = useState(!appData.bots.length);
  const [expandedTargetGroupMode, setExpandedTargetGroupMode] = useState<"selected" | "all_except" | null>(
    targetMode === "all" ? null : targetMode,
  );
  const hourListRef = useRef<HTMLDivElement | null>(null);
  const minuteListRef = useRef<HTMLDivElement | null>(null);
  const baseBroadcastPath = "/broadcasts";

  function resolveTargetMode(data: BroadcastModel): TargetMode {
    return data.targetGroupIds.length
      ? "selected"
      : (data.targetExcludedGroupIds?.length ?? 0) > 0
        ? "all_except"
        : "all";
  }

  function applyEditDataToState(data: BroadcastModel) {
    const nextTargetMode = resolveTargetMode(data);

    setTitle(data.title ?? "");
    setMessageText(data.messageText ?? "");
    setTimes([...(data.scheduleTimes ?? [])].sort());
    setSelectedGroupIds([...(data.targetGroupIds ?? [])]);
    setExcludedGroupIds([...(data.targetExcludedGroupIds ?? [])]);
    setSelectedBotIds([...(data.targetBotIds ?? [])]);
    setTargetMode(nextTargetMode);
    setExpandedTargetGroupMode(nextTargetMode === "all" ? null : nextTargetMode);
    setImageFile(null);
    setImagePreview(resolveImagePreviewUrl(data.imageUrl ?? null));
    setRemoveImage(false);
  }

  useEffect(() => {
    let mounted = true;
    async function loadFormData() {
      try {
        if (!appData.user) {
          await appData.refreshUser();
        }
        const tasks: Promise<unknown>[] = [];
        if (!appData.groups.length) {
          tasks.push(appData.refreshGroups());
        }
        if (!appData.bots.length) {
          tasks.push(appData.refreshBots());
        }
        if (tasks.length) {
          await Promise.all(tasks);
        }
      } finally {
        if (mounted) {
          setIsLoadingGroups(false);
          setIsLoadingBots(false);
        }
      }
    }

    loadFormData();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!editData) {
      return;
    }

    applyEditDataToState(editData);

    let mounted = true;
    (async () => {
      try {
        const latestBroadcasts = await appData.refreshBroadcasts();
        if (!mounted) {
          return;
        }
        const latestEditData = latestBroadcasts.find((item) => item.id === editData.id);
        if (!latestEditData) {
          return;
        }
        applyEditDataToState(latestEditData);
      } catch {
        // Keep current state when refresh fails.
      }
    })();

    return () => {
      mounted = false;
    };
  }, [editData?.id]);

  const selectedGroupsCount = useMemo(() => selectedGroupIds.length, [selectedGroupIds]);
  const excludedGroupsCount = useMemo(() => excludedGroupIds.length, [excludedGroupIds]);
  const selectedOnlineBotIds = useMemo(
    () =>
      selectedBotIds.filter((botId) => {
        const bot = appData.bots.find((item) => item.id === botId);
        return bot?.status === "online";
      }),
    [selectedBotIds, appData.bots],
  );
  const ownerBroadcastBots = appData.bots;
  const ownerOnlineBroadcastBotIds = useMemo(
    () =>
      appData.bots
        .filter((bot) => bot.status === "online")
        .map((bot) => Number(bot.id)),
    [appData.bots],
  );
  const fieldShellClass =
    "flex items-center gap-3 rounded-[20px] border border-glass-border bg-[rgba(15,23,42,0.68)] px-4 py-3.5 text-text-secondary transition focus-within:border-[rgba(56,189,248,0.38)] focus-within:bg-[rgba(15,23,42,0.82)] focus-within:text-accent";
  const fieldInputClass =
    "w-full min-h-[28px] border-0 bg-transparent p-0 text-sm leading-7 text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0";
  const draftTime = `${String(draftHour).padStart(2, "0")}:${String(draftMinute).padStart(2, "0")}`;
  const hourValues = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minuteValues = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);
  const loopHourValues = useMemo(() => [...hourValues, ...hourValues, ...hourValues], [hourValues]);
  const loopMinuteValues = useMemo(() => [...minuteValues, ...minuteValues, ...minuteValues], [minuteValues]);

  useEffect(() => {
    if (!appData.bots.length) {
      return;
    }

    setSelectedBotIds((current) =>
      current.filter((botId) => appData.bots.some((bot) => bot.id === botId)),
    );
  }, [appData.bots]);

  function normalizeLoopScroll(ref: RefObject<HTMLDivElement | null>, baseLength: number) {
    const element = ref.current;
    if (!element) {
      return;
    }

    const singleSegmentHeight = baseLength * TIME_ITEM_HEIGHT;
    if (element.scrollTop < singleSegmentHeight * 0.5) {
      element.scrollTop += singleSegmentHeight;
    } else if (element.scrollTop > singleSegmentHeight * 2.5) {
      element.scrollTop -= singleSegmentHeight;
    }
  }

  function syncHourFromScroll() {
    const element = hourListRef.current;
    if (!element) {
      return;
    }

    normalizeLoopScroll(hourListRef, 24);
    const rawIndex = Math.round(element.scrollTop / TIME_ITEM_HEIGHT);
    const value = ((rawIndex % 24) + 24) % 24;
    setDraftHour(value);
  }

  function syncMinuteFromScroll() {
    const element = minuteListRef.current;
    if (!element) {
      return;
    }

    normalizeLoopScroll(minuteListRef, 60);
    const rawIndex = Math.round(element.scrollTop / TIME_ITEM_HEIGHT);
    const value = ((rawIndex % 60) + 60) % 60;
    setDraftMinute(value);
  }

  useEffect(() => {
    if (!showTimeModal) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      if (hourListRef.current) {
        hourListRef.current.scrollTop = (24 + draftHour) * TIME_ITEM_HEIGHT;
      }
      if (minuteListRef.current) {
        minuteListRef.current.scrollTop = (60 + draftMinute) * TIME_ITEM_HEIGHT;
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [showTimeModal]);

  function parseTimeToMinutes(value: string) {
    const [hour, minute] = value.split(":").map((item) => Number(item));
    return hour * 60 + minute;
  }

  function hasDayOverlap(firstDays: string[], secondDays: string[]) {
    const secondSet = new Set(secondDays.map(normalizeDay));
    return firstDays.map(normalizeDay).some((day) => secondSet.has(day));
  }

  function hasEnoughScheduleGap(nextTime: string, existingTimes: string[], minGapMinutes = 30) {
    const nextMinutes = parseTimeToMinutes(nextTime);

    return existingTimes.every((time) => {
      const currentMinutes = parseTimeToMinutes(time);
      const diff = Math.abs(nextMinutes - currentMinutes);
      const nearestDiff = Math.min(diff, 1440 - diff);
      return nearestDiff >= minGapMinutes;
    });
  }

  function findScheduleGapConflict(nextTimes: string[], existingTimes: string[], minGapMinutes = 30) {
    for (const nextTime of nextTimes) {
      const nextMinutes = parseTimeToMinutes(nextTime);
      for (const existingTime of existingTimes) {
        const existingMinutes = parseTimeToMinutes(existingTime);
        const diff = Math.abs(nextMinutes - existingMinutes);
        const nearestDiff = Math.min(diff, 1440 - diff);
        if (nearestDiff < minGapMinutes) {
          return {
            nextTime,
            existingTime,
          };
        }
      }
    }

    return null;
  }

  function resolveBroadcastGroupIds(broadcast: BroadcastModel) {
    const targetBotIds = isOwner ? ownerOnlineBroadcastBotIds : broadcast.targetBotIds;
    const allowedBotIds = new Set(targetBotIds.map((id) => Number(id)));
    const scopedGroups = appData.groups.filter((group) => {
      if (!group.isActive) {
        return false;
      }
      if (!allowedBotIds.size) {
        return true;
      }
      return true;
    });

    if (broadcast.targetGroupIds.length > 0) {
      return broadcast.targetGroupIds.map((id) => Number(id));
    }

    const excludedIds = new Set((broadcast.targetExcludedGroupIds ?? []).map((id) => Number(id)));
    return scopedGroups
      .map((group) => Number(group.id))
      .filter((id) => !excludedIds.has(id));
  }

  function resolveCandidateGroupIds(groupIds: number[], excludedIds: number[]) {
    if (groupIds.length > 0) {
      return groupIds.map((id) => Number(id));
    }

    const excludedSet = new Set(excludedIds.map((id) => Number(id)));
    return appData.groups
      .filter((group) => group.isActive)
      .map((group) => Number(group.id))
      .filter((id) => !excludedSet.has(id));
  }

  function findBroadcastConflict(
    candidateTimes: string[],
    candidateDays: string[],
    candidateGroupIds: number[],
  ) {
    const candidateGroupSet = new Set(candidateGroupIds.map((id) => Number(id)));
    for (const broadcast of appData.broadcasts) {
      if (editData && broadcast.id === editData.id) {
        continue;
      }
      if (!broadcast.isActive) {
        continue;
      }
      if (!hasDayOverlap(candidateDays, broadcast.targetDays)) {
        continue;
      }

      const overlappingGroupIds = resolveBroadcastGroupIds(broadcast).filter((id) =>
        candidateGroupSet.has(Number(id)),
      );
      if (!overlappingGroupIds.length) {
        continue;
      }

      const timeConflict = findScheduleGapConflict(candidateTimes, broadcast.scheduleTimes);
      if (!timeConflict) {
        continue;
      }

      return {
        title: broadcast.title,
        time: timeConflict.existingTime,
      };
    }

    return null;
  }

  function handleAddTime() {
    if (times.includes(draftTime)) {
      showToast("Jam tersebut sudah dipilih", "danger");
      return;
    }

    if (!hasEnoughScheduleGap(draftTime, times)) {
      showToast("Jarak antar jam delay 30 menit untuk menghindari suspend", "danger");
      return;
    }

    setTimes((current) => [...current, draftTime].sort());
    setShowTimeModal(false);
  }

  function toggleGroup(groupId: number, isActive: boolean) {
    if (!isActive) {
      showToast("Group tidak aktif, silakan aktifkan terlebih dahulu", "danger");
      return;
    }
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId],
    );
  }

  function toggleExcludedGroup(groupId: number, isActive: boolean) {
    if (!isActive) {
      showToast("Group tidak aktif, silakan aktifkan terlebih dahulu", "danger");
      return;
    }
    setExcludedGroupIds((current) =>
      current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId],
    );
  }

  function toggleBot(botId: number, isOnline: boolean, isChecked: boolean) {
    if (!isOnline && !isChecked) {
      showToast("Bot offline tidak bisa dipilih", "danger");
      return;
    }

    setSelectedBotIds((current) =>
      current.includes(botId) ? current.filter((item) => item !== botId) : [...current, botId],
    );
  }

  function handleTargetModeClick(mode: TargetMode) {
    if (mode === "all") {
      setTargetMode("all");
      setExpandedTargetGroupMode(null);
      return;
    }

    setTargetMode(mode);
    setExpandedTargetGroupMode((current) => (current === mode ? null : mode));
  }

  function renderTargetGroupDropdown(mode: "selected" | "all_except") {
    if (isLoadingGroups) {
      return (
        <div className="flex min-h-24 items-center justify-center rounded-[16px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.52)]">
          <div className="size-8 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
        </div>
      );
    }

    if (appData.groups.length === 0) {
      return <p className="rounded-[16px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.52)] px-4 py-3 text-sm text-text-secondary">Belum ada group aktif. Tambahkan atau sync group dulu.</p>;
    }

    return (
      <div className="grid gap-3 rounded-[16px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.52)] p-3">
        <p className="text-sm text-text-secondary">
          {mode === "all_except"
            ? "Pilih group yang tidak ingin menerima broadcast."
            : "Pilih group tujuan broadcast."}
        </p>
        {appData.groups.map((group) => {
          const numericId = Number(group.id);
          const checked =
            mode === "all_except"
              ? excludedGroupIds.includes(numericId)
              : selectedGroupIds.includes(numericId);

          return (
            <label
              className={cn(
                "flex items-start gap-3 rounded-[16px] border p-3 transition",
                checked
                  ? "border-[rgba(56,189,248,0.34)] bg-[rgba(37,99,235,0.18)]"
                  : "border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] hover:border-[rgba(56,189,248,0.24)]",
                !group.isActive && "opacity-70",
              )}
              key={`${mode}-${group.id}`}
            >
              <input
                className="mt-1 size-4 shrink-0 accent-accent"
                type="checkbox"
                checked={checked}
                onChange={() =>
                  mode === "all_except"
                    ? toggleExcludedGroup(numericId, group.isActive)
                    : toggleGroup(numericId, group.isActive)
                }
              />
              <div className="min-w-0 flex-1">
                <strong className="block whitespace-normal break-all text-sm font-semibold">{group.name}</strong>
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  function hasBroadcastChanges(
    nextTitle: string,
    nextText: string,
    nextTargetMode: TargetMode,
    nextGroupIds: number[],
    nextExcludedGroupIds: number[],
    nextBotIds: number[],
  ) {
    if (!editData) {
      return true;
    }

    const sortedCurrentTimes = [...times].sort();
    const sortedOriginalTimes = [...editData.scheduleTimes].sort();
    const sortedCurrentGroups = [...nextGroupIds].sort((a, b) => a - b);
    const sortedOriginalGroups = [...editData.targetGroupIds].sort((a, b) => a - b);
    const sortedCurrentExcludedGroups = [...nextExcludedGroupIds].sort((a, b) => a - b);
    const sortedOriginalExcludedGroups = [...(editData.targetExcludedGroupIds ?? [])].sort((a, b) => a - b);
    const sortedCurrentBots = [...nextBotIds].sort((a, b) => a - b);
    const sortedOriginalBots = [...(editData.targetBotIds ?? [])].sort((a, b) => a - b);
    const originalTargetMode: TargetMode = editData.targetGroupIds.length
      ? "selected"
      : (editData.targetExcludedGroupIds ?? []).length
        ? "all_except"
        : "all";

    return (
      nextTitle !== editData.title ||
      nextText !== editData.messageText ||
      nextTargetMode !== originalTargetMode ||
      JSON.stringify(sortedCurrentTimes) !== JSON.stringify(sortedOriginalTimes) ||
      JSON.stringify(sortedCurrentGroups) !== JSON.stringify(sortedOriginalGroups) ||
      JSON.stringify(sortedCurrentExcludedGroups) !== JSON.stringify(sortedOriginalExcludedGroups) ||
      JSON.stringify(sortedCurrentBots) !== JSON.stringify(sortedOriginalBots)
    );
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    const trimmedText = messageText.trim();
    const groupIds = targetMode === "selected" ? selectedGroupIds : [];
    const excludedIds = targetMode === "all_except" ? excludedGroupIds : [];
    // For non-owner: bot is auto-resolved from the currently connected bot.
    // Always refresh from server so we get up-to-date online status.
    let resolvedBots = appData.bots;
    if (!isOwner) {
      try {
        resolvedBots = await appData.refreshBots();
      } catch {
        // Use stale bots if refresh fails
      }
    }

    const userOnlineBotIds = resolvedBots
      .filter((bot) => bot.status === "online")
      .map((bot) => Number(bot.id));
    const onlineBotIds = isOwner ? ownerOnlineBroadcastBotIds : userOnlineBotIds;

    if (!trimmedTitle) {
      showToast("Nama broadcast tidak boleh kosong!", "danger");
      return;
    }
    if (!trimmedText) {
      showToast("Teks broadcast tidak boleh kosong!", "danger");
      return;
    }
    if (!times.length) {
      showToast("Atur jadwal auto broadcast terlebih dahulu", "danger");
      return;
    }
    if (targetMode === "selected" && !groupIds.length) {
      showToast("Pilih minimal satu group tujuan.", "danger");
      return;
    }
    if (targetMode === "all_except" && !excludedIds.length) {
      showToast("Pilih minimal satu group yang ingin dikecualikan.", "danger");
      return;
    }

    if (!onlineBotIds.length) {
      showToast(
        isOwner
          ? "Bot broadcast owner harus online terlebih dahulu."
          : "Bot kamu belum terhubung. Hubungkan bot di Dashboard terlebih dahulu.",
        "danger",
      );
      return;
    }

    const candidateGroupIds = resolveCandidateGroupIds(groupIds, excludedIds);
    const crossBroadcastConflict = findBroadcastConflict(
      times,
      ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"],
      candidateGroupIds,
    );
    if (crossBroadcastConflict) {
      showToast(
        `Jadwal bentrok dengan broadcast "${crossBroadcastConflict.title}" pada jam ${crossBroadcastConflict.time}. Minimal jarak untuk group yang sama adalah 30 menit.`,
        "danger",
      );
      return;
    }

    if (editData && !hasBroadcastChanges(trimmedTitle, trimmedText, targetMode, groupIds, excludedIds, onlineBotIds)) {
      navigate(baseBroadcastPath, { replace: true });
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        messageText: trimmedText,
        scheduleTime: times,
        scheduleDays: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"],
        targetGroupIds: groupIds,
        targetExcludedGroupIds: excludedIds,
        targetBotIds: onlineBotIds,
      };

      // Attach image file or removal flag
      if (imageFile) {
        payload.image = imageFile;
      } else if (removeImage) {
        payload.removeImage = "true";
      }

      if (editData) {
        await appData.updateBroadcast(editData.id, payload);
      } else {
        await appData.createBroadcast(payload);
      }

      await appData.refreshBroadcasts();
      await appData.refreshBots();
      showToast("Broadcast berhasil disimpan!", "success");
      navigate(baseBroadcastPath, {
        replace: true,
        state: { checkBroadcastNameChanges: true },
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menyimpan broadcast.", "danger");
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          editData
            ? "Edit Broadcast"
            : "Tambah Broadcast"
        }
        subtitle={
          isOwner
            ? "Broadcast owner memakai group dan bot milik owner sendiri."
            : "isi semua form yang ada seperti nama broadcast, teks broadcast, target group, dan jadwal auto broadcast. Pastikan untuk menyimpan setiap perubahan yang Anda buat."
        }
      />

      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Nama Broadcast</h3>
        </div>
        <label className="block space-y-2">
          <div className={fieldShellClass}>
            <input
              className={fieldInputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 100))}
              placeholder="Masukkan nama broadcast"
            />
          </div>
        </label>
      </SurfaceCard>

      {/* Image Upload Card */}
      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Gambar Broadcast</h3>
          <span className="text-xs text-text-muted">Opsional · JPG/PNG · Maks. 10MB</span>
        </div>

        {imagePreview ? (
          <div className="relative overflow-hidden rounded-[20px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.68)] p-3">
            <div className="overflow-hidden rounded-[16px] bg-[rgba(2,6,23,0.55)]">
              <img
                src={imagePreview}
                alt="Pratinjau gambar"
                className="block max-h-[320px] w-full object-contain"
              />
            </div>
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-[rgba(15,23,42,0.85)] p-1.5 text-danger hover:brightness-125 transition"
              onClick={() => {
                setImageFile(null);
                setImagePreview(null);
                setRemoveImage(true);
                if (imageInputRef.current) imageInputRef.current.value = "";
              }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[rgba(56,189,248,0.3)] bg-[rgba(15,23,42,0.52)] py-10 text-text-secondary transition hover:border-[rgba(56,189,248,0.5)] hover:bg-[rgba(15,23,42,0.68)]"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon size={32} className="text-accent/60" />
            <span className="text-sm font-medium">Klik untuk pilih gambar</span>
            <span className="text-xs text-text-muted">JPG, JPEG, PNG · Maks. 10MB</span>
          </button>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
            if (!allowedTypes.includes(file.type)) {
              showToast("Format tidak didukung. Gunakan JPG, JPEG, atau PNG.", "danger");
              e.target.value = "";
              return;
            }
            if (file.size > 10 * 1024 * 1024) {
              showToast("Ukuran gambar maksimal 10MB.", "danger");
              e.target.value = "";
              return;
            }

            setImageFile(file);
            setRemoveImage(false);
            const reader = new FileReader();
            reader.onload = (ev) => setImagePreview(ev.target?.result as string);
            reader.readAsDataURL(file);
          }}
        />
      </SurfaceCard>

      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Teks Broadcast</h3>
        </div>
        <label className="block space-y-2">
          <div className={cn(fieldShellClass, "items-start")}>
            <textarea
              className={cn(fieldInputClass, "min-h-[168px] resize-y leading-relaxed")}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Ketik pesan broadcast di sini.."
              rows={7}
            />
          </div>
        </label>
      </SurfaceCard>


      <div className="grid gap-5 xl:grid-cols-2">
        <SurfaceCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Target Group</h3>
          </div>

          <div className="grid gap-3">
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition",
                targetMode === "all"
                  ? "border-[rgba(56,189,248,0.34)] bg-[rgba(37,99,235,0.18)]"
                  : "border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] hover:border-[rgba(56,189,248,0.24)]",
              )}
              type="button"
              onClick={() => handleTargetModeClick("all")}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-4 shrink-0 rounded-full border border-[rgba(148,163,184,0.6)]",
                  targetMode === "all" && "border-accent",
                )}
              >
                <span
                  className={cn(
                    "m-auto size-2 rounded-full bg-accent transition",
                    targetMode === "all" ? "opacity-100" : "opacity-0",
                  )}
                />
              </span>
              <span className="text-sm font-semibold">Semua Group</span>
            </button>

            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition",
                targetMode === "all_except"
                  ? "border-[rgba(56,189,248,0.34)] bg-[rgba(37,99,235,0.18)]"
                  : "border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] hover:border-[rgba(56,189,248,0.24)]",
              )}
              type="button"
              onClick={() => handleTargetModeClick("all_except")}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-4 shrink-0 rounded-full border border-[rgba(148,163,184,0.6)]",
                  targetMode === "all_except" && "border-accent",
                )}
              >
                <span
                  className={cn(
                    "m-auto size-2 rounded-full bg-accent transition",
                    targetMode === "all_except" ? "opacity-100" : "opacity-0",
                  )}
                />
              </span>
              <span className="text-sm font-semibold">Semua Group Kecuali</span>
              <ChevronDown
                size={16}
                className={cn(
                  "ml-auto mt-0.5 text-text-secondary transition",
                  expandedTargetGroupMode === "all_except" && "rotate-180 text-accent",
                )}
              />
            </button>

            {targetMode === "all_except" && expandedTargetGroupMode === "all_except"
              ? renderTargetGroupDropdown("all_except")
              : null}

            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition",
                targetMode === "selected"
                  ? "border-[rgba(56,189,248,0.34)] bg-[rgba(37,99,235,0.18)]"
                  : "border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] hover:border-[rgba(56,189,248,0.24)]",
              )}
              type="button"
              onClick={() => handleTargetModeClick("selected")}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-4 shrink-0 rounded-full border border-[rgba(148,163,184,0.6)]",
                  targetMode === "selected" && "border-accent",
                )}
              >
                <span
                  className={cn(
                    "m-auto size-2 rounded-full bg-accent transition",
                    targetMode === "selected" ? "opacity-100" : "opacity-0",
                  )}
                />
              </span>
              <span className="text-sm font-semibold">Pilih Group Tertentu</span>
              <ChevronDown
                size={16}
                className={cn(
                  "ml-auto mt-0.5 text-text-secondary transition",
                  expandedTargetGroupMode === "selected" && "rotate-180 text-accent",
                )}
              />
            </button>

            {targetMode === "selected" && expandedTargetGroupMode === "selected"
              ? renderTargetGroupDropdown("selected")
              : null}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-bold whitespace-nowrap">Jadwal Auto Broadcast</h3>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)] sm:w-auto"
              type="button"
              onClick={() => setShowTimeModal(true)}
            >
              <Plus size={16} />
              Tambah Jam
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {times.map((time) => (
              <button
                key={time}
                className="rounded-full border border-[rgba(56,189,248,0.24)] bg-[rgba(37,99,235,0.18)] px-4 py-2 text-sm font-semibold text-accent transition hover:bg-[rgba(37,99,235,0.26)]"
                type="button"
                onClick={() => setTimes((current) => current.filter((item) => item !== time))}
              >
                {time}
              </button>
            ))}
            {!times.length ? <p className="text-sm text-text-secondary">Belum ada jadwal dipilih.</p> : null}
          </div>

        </SurfaceCard>
      </div>

      <button
        className="mx-auto flex w-full max-w-[340px] items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={handleSave}
        disabled={isSaving}
      >
        <Save size={16} />
        {isSaving ? "MENYIMPAN..." : "SIMPAN BROADCAST"}
      </button>

      <Modal
        open={showTimeModal}
        title="Pilih Waktu"
        onClose={() => setShowTimeModal(false)}
        closeButtonVariant="icon"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <span className="block text-center text-xs font-bold tracking-[0.22em] text-text-muted">JAM</span>
              <div className="relative">
                <div
                  ref={hourListRef}
                  className="no-scrollbar h-14 overflow-y-auto rounded-[14px] border border-glass-border bg-[rgba(15,23,42,0.68)] snap-y snap-mandatory"
                  onScroll={syncHourFromScroll}
                >
                  {loopHourValues.map((hour, index) => (
                    <div
                      className={cn(
                        "flex h-14 snap-center items-center justify-center text-3xl font-black tabular-nums transition",
                        hour === draftHour ? "text-text-primary" : "text-text-muted/40",
                      )}
                      key={`hour-${index}`}
                    >
                      {String(hour).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-center text-xs font-bold tracking-[0.22em] text-text-muted">MENIT</span>
              <div className="relative">
                <div
                  ref={minuteListRef}
                  className="no-scrollbar h-14 overflow-y-auto rounded-[14px] border border-glass-border bg-[rgba(15,23,42,0.68)] snap-y snap-mandatory"
                  onScroll={syncMinuteFromScroll}
                >
                  {loopMinuteValues.map((minute, index) => (
                    <div
                      className={cn(
                        "flex h-14 snap-center items-center justify-center text-3xl font-black tabular-nums transition",
                        minute === draftMinute ? "text-text-primary" : "text-text-muted/40",
                      )}
                      key={`minute-${index}`}
                    >
                      {String(minute).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-text-secondary">Waktu dipilih: <span className="font-semibold text-text-primary tabular-nums">{draftTime}</span></p>

          <button
            className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={handleAddTime}
          >
            Pilih
          </button>
        </div>
      </Modal>
    </div>
  );
}
