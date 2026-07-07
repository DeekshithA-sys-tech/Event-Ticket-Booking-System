/**
 * @file cloudinary.js
 * @description Cloudinary SDK configuration.
 *
 * WHY THIS EXISTS:
 * ----------------
 * Cloudinary is our file storage provider for event banners and avatars.
 * Isolating the SDK config here means:
 *  - Credentials are configured in one place.
 *  - The upload.middleware.js and any service that needs storage
 *    simply imports the configured `v2` instance.
 *  - Switching to S3 or another provider only requires changes here.
 */

import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Configures the Cloudinary SDK with credentials from environment variables.
 * Must be called before any upload operations.
 */
export const configureCloudinary = () => {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true, // Always use HTTPS URLs
  });

  logger.info('[Cloudinary] SDK configured successfully.');
};

// Export the pre-configured instance for use in other modules
export { cloudinary };
