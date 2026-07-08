/**
 * @file upload.middleware.js
 * @description Multer configuration for handling multipart/form-data file uploads.
 *
 * WHY MULTER?
 * -----------
 * Express doesn't parse multipart/form-data (the encoding used for file uploads)
 * by default. Multer is the standard middleware that intercepts these requests
 * and makes the file available as req.file (single) or req.files (multiple).
 *
 * WHY MEMORY STORAGE OVER DISK STORAGE?
 * ---------------------------------------
 * memoryStorage() stores the file as a Buffer in memory (req.file.buffer).
 * diskStorage() writes a temp file to disk first.
 *
 * We use memory storage because:
 *   1. We immediately stream the buffer to Cloudinary — no temp file needed
 *   2. Temp files require cleanup; buffers are garbage-collected automatically
 *   3. In containerised deployments (Docker/Kubernetes), the filesystem may
 *      not be writable or may be ephemeral between requests
 *
 * SECURITY:
 * ---------
 * - fileFilter: only accept image MIME types (blocks .exe, .pdf masquerading as images)
 * - limits.fileSize: 5MB cap prevents memory exhaustion attacks
 * - limits.files: 1 file at a time prevents multi-file abuse
 *
 * IMPORTANT: Multer doesn't validate the file CONTENT, only the MIME type declared
 * by the client. For production hardening (Sprint 11), add magic byte validation
 * (e.g. sharp.metadata()) to verify the actual image format.
 */

import multer from 'multer';
import { ValidationError } from '../utils/ApiError.js';

// ─── Storage ──────────────────────────────────────────────────────────────────
// Memory storage: file is available as Buffer at req.file.buffer
const storage = multer.memoryStorage();

// ─── File Filter ──────────────────────────────────────────────────────────────
const imageFileFilter = (_req, file, callback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    callback(null, true); // Accept the file
  } else {
    // Reject with our custom ValidationError
    callback(
      new ValidationError('Only JPEG, PNG, and WebP images are allowed.'),
      false
    );
  }
};

// ─── Multer Instance ──────────────────────────────────────────────────────────
const multerUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB maximum
    files: 1,                   // One file at a time
  },
});

// ─── Exported Middlewares ─────────────────────────────────────────────────────

/**
 * Middleware for single image uploads.
 * The field name must match the key used in the form-data request.
 *
 * After this middleware, the uploaded file is available at req.file:
 *   req.file.buffer    → Raw image buffer (send to Cloudinary)
 *   req.file.mimetype  → MIME type
 *   req.file.size      → File size in bytes
 *   req.file.originalname → Original filename
 *
 * @param {string} fieldName - The form-data field name for the file
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/events/:id/banner', protect, uploadSingle('banner'), controller);
 */
export const uploadSingle = (fieldName) => (req, res, next) => {
  multerUpload.single(fieldName)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors (file too large, too many files)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ValidationError('File size must not exceed 5MB.'));
      }
      return next(new ValidationError(`Upload error: ${err.message}`));
    }
    if (err) {
      // Our custom ValidationError from fileFilter
      return next(err);
    }
    next();
  });
};
