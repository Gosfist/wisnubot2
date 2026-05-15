import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "../../uploads/broadcasts");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/jpg"];
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `broadcast_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error("Ekstensi gambar tidak didukung. Gunakan JPG, JPEG, atau PNG."));
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Format gambar tidak didukung. Gunakan JPG, JPEG, atau PNG."));
  }
  cb(null, true);
}

function hasValidImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  return isJpeg || isPng;
}

function rejectInvalidSignature(req, res, next, label) {
  if (!req.file) return next();

  const buffer = req.file.buffer || fs.readFileSync(req.file.path);
  if (hasValidImageSignature(buffer)) {
    return next();
  }

  if (req.file.path && fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }
  return res.status(400).json({ error: `${label} tidak valid. File harus benar-benar JPG atau PNG.` });
}

export const broadcastUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
}).single("image");

const memoryStorage = multer.memoryStorage();

export const proofImageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
}).single("proofImage");

/**
 * Express middleware that wraps multer and returns a friendly JSON error for file validation failures.
 */
export function broadcastUploadMiddleware(req, res, next) {
  broadcastUpload(req, res, (err) => {
    if (!err) {
      return rejectInvalidSignature(req, res, next, "Gambar");
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `Ukuran gambar maksimal ${MAX_FILE_SIZE_MB}MB.` });
    }

    // Multer file filter error or other multer error
    return res.status(400).json({ error: err.message || "Gagal mengupload gambar." });
  });
}

export function proofImageUploadMiddleware(req, res, next) {
  proofImageUpload(req, res, (err) => {
    if (!err) {
      return rejectInvalidSignature(req, res, next, "Gambar bukti");
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `Ukuran gambar maksimal ${MAX_FILE_SIZE_MB}MB.` });
    }

    return res.status(400).json({ error: err.message || "Gagal mengupload gambar bukti." });
  });
}

export function getUploadedImageUrl(req) {
  if (!req.file) return null;
  // Return a relative web path so the frontend can load it via the static-serve route
  return `/uploads/broadcasts/${req.file.filename}`;
}

export function deleteUploadedFile(filePath) {
  if (!filePath) return;
  // Strip leading slash and build absolute path
  const absPath = path.join(__dirname, "../../", filePath.replace(/^\//, ""));
  try {
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
  } catch {
    // Non-critical; ignore
  }
}
