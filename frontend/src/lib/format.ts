export function formatDate(date: string | null | undefined) {
  if (!date) {
    return "-";
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatCurrency(value: string | number) {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("id-ID").format(Number.isFinite(amount) ? amount : 0);
}

export function formatPhoneDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function normalizePhoneNumber(value: string) {
  const digits = formatPhoneDigits(value);
  if (digits.startsWith("62")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}
