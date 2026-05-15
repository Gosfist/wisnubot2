import rateLimit from "express-rate-limit";

function buildMessage(error) {
  return { error };
}

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: buildMessage("Terlalu banyak request. Coba lagi sebentar."),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: buildMessage("Terlalu banyak percobaan login. Coba lagi 15 menit."),
});

export const resetSecretLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: buildMessage("Terlalu banyak percobaan secret key. Coba lagi nanti."),
});
