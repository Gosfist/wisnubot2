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
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Format gambar tidak didukung. Gunakan JPG, JPEG, atau PNG."));
  }
  cb(null, true);
}

export const broadcastUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
}).single("image");

/**
 * Express middleware that wraps multer and returns a friendly JSON error for file validation failures.
 */
export function broadcastUploadMiddleware(req, res, next) {
  broadcastUpload(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `Ukuran gambar maksimal ${MAX_FILE_SIZE_MB}MB.` });
    }

    // Multer file filter error or other multer error
    return res.status(400).json({ error: err.message || "Gagal mengupload gambar." });
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
