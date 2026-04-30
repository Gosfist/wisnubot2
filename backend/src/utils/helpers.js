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

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
