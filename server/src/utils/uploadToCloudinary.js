/**
 * @file uploadToCloudinary.js
 * @description Cloudinary upload helpers for images.
 *
 * ARCHITECTURE DECISION — WHY NOT UPLOAD DIRECTLY IN THE CONTROLLER?
 * -------------------------------------------------------------------
 * A common mistake is calling Cloudinary's SDK directly inside the controller:
 *   const result = await cloudinary.uploader.upload(file.path);  // in controller
 *
 * Problem: If we switch from Cloudinary to AWS S3, we have to find and change
 * every controller that uploads files.
 *
 * Our approach: All upload logic lives here — controllers just call
 * uploadImage(buffer, options) and receive a URL. The storage provider is
 * an implementation detail hidden behind this abstraction.
 *
 * HOW MULTER + CLOUDINARY WORK TOGETHER:
 * ----------------------------------------
 * 1. Multer (upload.middleware.js) intercepts the multipart/form-data request
 *    and puts the file in memory as a Buffer: req.file.buffer
 *
 * 2. We convert the Buffer to a base64 data URI (what Cloudinary expects)
 *
 * 3. Cloudinary uploads it to their CDN and returns a secure URL
 *
 * WHY MEMORY STORAGE (not disk)?
 * --------------------------------
 * Disk storage writes a temp file to the server filesystem. In serverless
 * or multi-instance deployments, the filesystem is ephemeral — the file
 * disappears after the request. Memory storage keeps the file as a Buffer
 * in RAM and streams it directly to Cloudinary. No temp files, no cleanup.
 *
 * Tradeoff: Large files (>10MB) can pressure memory. We limit uploads to
 * 5MB in the upload middleware to mitigate this.
 */

import { cloudinary } from '../config/cloudinary.js';
import { logger } from './logger.js';

/**
 * Uploads an image buffer to Cloudinary.
 *
 * @param {Buffer} buffer - The raw image buffer from Multer
 * @param {object} options - Cloudinary upload options
 * @param {string} options.folder - Cloudinary folder name (e.g. 'event-banners')
 * @param {string} [options.publicId] - Custom public ID (optional)
 * @param {number} [options.width] - Max width to resize to
 * @param {number} [options.height] - Max height to resize to
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadImage = async (buffer, { folder, publicId, width, height }) => {
  return new Promise((resolve, reject) => {
    // Convert buffer to base64 data URI for Cloudinary's upload_stream
    const uploadOptions = {
      folder,
      resource_type: 'image',
      // Transformation: resize on upload (saves storage + bandwidth)
      transformation: [
        {
          width: width || 1200,
          height: height || 630,
          crop: 'limit', // Never upscale, only shrink if needed
          quality: 'auto', // Cloudinary auto-selects optimal quality
          fetch_format: 'auto', // Serve WebP to supporting browsers
        },
      ],
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.overwrite = true; // Replace existing if re-uploading
    }

    // Cloudinary's upload_stream accepts a Node.js readable stream
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`[Cloudinary] Upload failed: ${error.message}`);
          reject(new Error(`Image upload failed: ${error.message}`));
        } else {
          logger.info(`[Cloudinary] Uploaded to ${result.secure_url}`);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      }
    );

    // Push the buffer into the stream
    uploadStream.end(buffer);
  });
};

/**
 * Deletes an image from Cloudinary by its public ID.
 * Called when an event is deleted or a banner is replaced.
 *
 * @param {string} publicId - Cloudinary public ID of the image
 * @returns {Promise<void>}
 */
export const deleteImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info(`[Cloudinary] Deleted image: ${publicId}`);
  } catch (error) {
    // Log but don't throw — a failed delete shouldn't break the main operation
    logger.warn(`[Cloudinary] Could not delete image ${publicId}: ${error.message}`);
  }
};
