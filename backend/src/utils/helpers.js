/**
 * Random delay between min and max milliseconds
 */
export function randomDelay(minMs = 3000, maxMs = 7000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Format phone number to WhatsApp JID format
 */
export function formatPhoneJid(phone) {
  let clean = phone.replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.substring(1);
  }
  return clean + "@s.whatsapp.net";
}

export function resolveBroadcastTable() {
  return "broadcasts";
}

export function normalizeScheduleDay(day) {
  return String(day ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f']/g, "");
}

const VALID_DAY_KEYS = new Set([
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
  "minggu",
]);

function parseMaybeJsonList(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizeDayArray(days) {
  return [
    ...new Set(
      parseMaybeJsonList(days)
        .map(normalizeScheduleDay)
        .filter((d) => VALID_DAY_KEYS.has(d)),
    ),
  ];
}

function isValidTimeString(value) {
  return /^\d{1,2}:\d{2}$/.test(String(value ?? "").trim());
}

function normalizeTimeString(value) {
  const [h, m] = String(value).trim().split(":");
  const hh = String(parseInt(h, 10)).padStart(2, "0");
  const mm = String(parseInt(m, 10)).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Parse schedule entries to a unified format: [{ time: "HH:MM", days: [...] }]
 *
 * Accepts:
 * - New format: schedule_time stored as JSON [{time, days}, ...]
 * - Legacy format: schedule_time as ["07:00", "10:00"] + schedule_days as ["Senin", ...]
 * - Single string from comma-separated values
 *
 * Days inside each entry are normalized lowercase keys (senin, selasa, ...).
 */
export function parseScheduleEntries(scheduleTimeRaw, scheduleDaysRaw) {
  const rawList = parseMaybeJsonList(scheduleTimeRaw);
  const fallbackDays = normalizeDayArray(scheduleDaysRaw);

  const entries = [];
  for (const item of rawList) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const time = item.time ?? item.t ?? null;
      if (!time || !isValidTimeString(time)) continue;
      const days = normalizeDayArray(item.days ?? fallbackDays);
      if (!days.length) continue;
      entries.push({ time: normalizeTimeString(time), days });
    } else if (typeof item === "string" && isValidTimeString(item)) {
      if (!fallbackDays.length) continue;
      entries.push({ time: normalizeTimeString(item), days: fallbackDays });
    }
  }
  return entries;
}

/**
 * Compute union of unique days from a list of schedule entries.
 * Returns normalized lowercase day keys.
 */
export function unionDaysFromEntries(entries) {
  const set = new Set();
  for (const entry of entries) {
    for (const day of entry.days ?? []) set.add(day);
  }
  return [...set];
}

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
