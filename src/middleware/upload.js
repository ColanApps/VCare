import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(config.uploadDir || path.join(__dirname, '../../uploads'));
const subdirs = ['photos', 'consent-forms', 'documents', 'claims', 'incentives', 'leads'];
for (const dir of subdirs) {
  fs.mkdirSync(path.join(uploadRoot, dir), { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const category = req.uploadCategory || 'documents';
    const dest = path.join(uploadRoot, category);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename(_req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`File type ${ext} not allowed`));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function setUploadCategory(category) {
  return (req, _res, next) => {
    req.uploadCategory = category;
    next();
  };
}

export function getPublicPath(filename, category = 'photos') {
  return `/uploads/${category}/${path.basename(filename)}`;
}

export { uploadRoot };
