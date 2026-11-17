/**
 * @file uploadToCloudinary.js
 * @description Cloudinary upload helpers with base64 data URI fallback for local dev mode.
 */

import { cloudinary } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Uploads an image buffer to Cloudinary, falling back to base64 Data URI if Cloudinary keys are unconfigured.
 *
 * @param {Buffer} buffer - The raw image buffer from Multer
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadImage = async (buffer, { folder, publicId, width, height }) => {
  const isCloudinaryConfigured =
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_KEY !== 'your_api_key';

  if (!isCloudinaryConfigured) {
    logger.info('[Cloudinary] Unconfigured or placeholder credentials — using local Base64 data URI fallback.');
    const mimeType = 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;
    return {
      url: dataUri,
      publicId: publicId || `local_${Date.now()}`,
    };
  }

  return new Promise((resolve) => {
    const uploadOptions = {
      folder,
      resource_type: 'image',
      transformation: [
        {
          width: width || 1200,
          height: height || 630,
          crop: 'limit',
          quality: 'auto',
          fetch_format: 'auto',
        },
      ],
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.overwrite = true;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.warn(`[Cloudinary] Upload failed (${error.message}) — using Base64 data URI fallback.`);
          const mimeType = 'image/jpeg';
          const base64 = buffer.toString('base64');
          resolve({
            url: `data:${mimeType};base64,${base64}`,
            publicId: publicId || `local_${Date.now()}`,
          });
        } else {
          logger.info(`[Cloudinary] Uploaded to ${result.secure_url}`);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      }
    );

    uploadStream.end(buffer);
  });
};

/**
 * Deletes an image from Cloudinary by its public ID.
 * @param {string} publicId
 * @returns {Promise<void>}
 */
export const deleteImage = async (publicId) => {
  if (!publicId || publicId.startsWith('local_')) return;
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info(`[Cloudinary] Deleted image: ${publicId}`);
  } catch (error) {
    logger.warn(`[Cloudinary] Could not delete image ${publicId}: ${error.message}`);
  }
};
